import llvm from 'llvm-bindings';
import _ from 'lodash';
import { Get } from 'type-fest';
import Context from '../shared/context';
import { Maybe, has, hasNot, maybeIfNotUndefined } from '../shared/maybe';
import { Pos } from '../shared/pos';
import { CreateResultFrom, Result, error, ok } from '../shared/result';
import {
	AST,
	ASTExtOrImpl,
	ASTModifier,
	ASTParameter,
	ASTType,
	ASTTypeList,
	ASTTypeParameter,
	ASTTypePrimitiveString,
	AssignableASTs,
} from './asts';
import SymbolError from './symbolError';
import loggers from '../shared/log';

const log = loggers.symbolTable;

interface Sym {
	/** Relative name, eg foo */
	name: string;

	/** Fully-Qualified Name, eg A.B.C.foo */
	fqn: string;

	/** The position in the source code */
	pos: Pos;
}

export type ClassSym = {
	kind: 'class';
	modifiers: ASTTypeList<ASTModifier>;
	typeParams: ASTTypeList<ASTTypeParameter>;
	_extends: ASTTypeList<ASTExtOrImpl>;
	_implements: ASTTypeList<ASTExtOrImpl>;
	/** Holds the properties */
	struct: llvm.StructType | undefined;
} & Sym;

export type EnumSym = {
	kind: 'enum';
	typeParams: ASTTypeList<ASTTypeParameter>;
	_extends: ASTTypeList<ASTExtOrImpl>;
} & Sym;

export type FuncSym = {
	kind: 'function';
	typeParams: ASTTypeList<ASTTypeParameter>;
	params: ASTTypeList<ASTParameter>;
	returnTypes: ASTTypeList<ASTType>;
	llvmFunction?: llvm.Function;
} & Sym;

export type InterfaceSym = {
	kind: 'interface';
	typeParams: ASTTypeList<ASTTypeParameter>;
	_extends: ASTTypeList<ASTExtOrImpl>;
	struct: llvm.StructType | undefined;
} & Sym;

export type ParamSym = {
	kind: 'parameter';
	type: ASTType;
	defaultValue?: AssignableASTs;
	rest: boolean;
	llvmArgument?: llvm.Argument;
} & Sym;

export type VarSym = {
	kind: 'variable';
	mutable: boolean;
	type: ASTType;
	value?: AssignableASTs;
	allocaInst?: llvm.AllocaInst;
} & Sym;

export type SymbolInfo = ClassSym | EnumSym | FuncSym | InterfaceSym | ParamSym | VarSym;
export type SymbolKind = Get<SymbolInfo, 'kind'>;
export type SymNodeKind = SymbolKind | 'global'; // TODO add packages
export const symbolKinds: SymbolKind[] = ['class', 'enum', 'function', 'interface', 'parameter', 'variable'];

/** map each type to ClassSym, FuncSym, etc. */
export type kindToSymMap = {
	class: ClassSym;
	enum: EnumSym;
	function: FuncSym;
	interface: InterfaceSym;
	parameter: ParamSym;
	variable: VarSym;
};

export class SymNode {
	/** each node needs a name; root is 'global'; names a re relative to their parent */
	public name: string;

	/** Fully-Qualified Name, eg A.B.C */
	public fqn: string;

	public kind: SymNodeKind;

	public readonly table: SymTab;

	/** Child nodes */
	public readonly children: Record<string, SymNode> = {};

	public readonly pos: Pos;

	readonly parent: Maybe<SymNode>;

	constructor(name: string, fqn: string, kind: SymNodeKind, parent: Maybe<SymNode>, pos: Pos) {
		this.name = name;
		this.fqn = fqn;
		this.kind = kind;
		this.table = new SymTab(this, name);
		this.parent = parent;
		this.pos = pos;
	}

	public createChild(name: string, fqn: string, kind: SymNodeKind, pos: Pos) {
		log.info('SymNode: Creating child', kind, fqn);

		const newNode = new SymNode(name, fqn, kind, has(this), pos);
		this.children[name] = newNode;

		return newNode;
	}

	public getDebug(): void {
		log.vars({
			name: this.name,
			symTab: this.table,
			parent: this.parent,
		});
	}

	/**
	 * Tries to get a symbol from this specific table, but does not recurse up the tree.
	 *
	 * This is called by SymbolTable.lookup(), which does recurse up the tree.
	 *
	 * @param name
	 * @param kinds
	 */
	// these are like usages, which specify the return type symbol when we know for sure what it is
	public get(name: string, kinds: ['class']): Maybe<ClassSym>;
	public get(name: string, kinds: ['enum']): Maybe<EnumSym>;
	public get(name: string, kinds: ['function']): Maybe<FuncSym>;
	public get(name: string, kinds: ['interface']): Maybe<InterfaceSym>;
	public get(name: string, kinds: ['parameter']): Maybe<ParamSym>;
	public get(name: string, kinds: ['variable']): Maybe<VarSym>;
	public get(name: string, kinds: SymbolKind[]): Maybe<SymbolInfo>;
	public get(name: string, kinds: SymbolKind[]): Maybe<SymbolInfo> {
		return this.table.contains(name, kinds);
	}
}

export class SymTree {
	/** Root of the tree. Never changes. */
	public readonly root: SymNode;

	/** Root of the stdlib tree. Never changes. */
	public readonly stdlib: SymNode;

	/** Pointer to the current SymNode. Changes frequently. */
	private currentNode: SymNode;

	public readonly loc: string[];

	constructor(rootNodeName: string, pos: Pos, loc: string[], ast: AST) {
		this.loc = loc;

		log.info(`SymTree: Beginning with root node ${rootNodeName}`);

		// TODO change global kind to package
		this.root = new SymNode(rootNodeName, rootNodeName, 'global', hasNot(), pos);

		this.currentNode = this.root;

		// setup the stdlib SymNode, which comes with a SymTab
		this.stdlib = this.getStdlibSymNode(pos, ast);
	}

	private getStdlibSymNode(pos: Pos, ast: AST): SymNode {
		// TODO change global kind to package
		const symNode = new SymNode('stdlib', 'stdlib', 'global', hasNot(), pos);

		// readStr func
		{
			const readStrFunctionSymbol: FuncSym = {
				kind: 'function',
				name: 'readStr',
				fqn: `${symNode.name}.readStr`,
				typeParams: ASTTypeList.empty(pos),
				params: ASTTypeList.empty(pos),
				returnTypes: ASTTypeList.wrapArray([ASTTypePrimitiveString(pos, ast)], pos),
				llvmFunction: undefined,
				pos,
			};
			symNode.table.symbols.set('readStr', readStrFunctionSymbol);
		}

		return symNode;
	}

	public getCurrentNode() {
		return this.currentNode;
	}

	public createNewSymNodeAndEnter(name: string, fqn: string, kind: SymNodeKind, pos: Pos): SymNode {
		log.info(`SymTree: Creating new ${kind} SymNode ${name}`);

		const newNode = this.currentNode.createChild(name, fqn, kind, pos);

		this.currentNode = newNode;

		return newNode;
	}

	/** Proxies any action to the current SymNode's SymTab */
	public proxy<R>(what: (symTab: SymTab, symNode: SymNode, symTree: SymTree, stdlib: SymNode) => R): R {
		return what(this.currentNode.table, this.currentNode, this, this.stdlib);
	}

	/** Enters a child's SymNode using the name */
	public enter(name: string): Result<SymNode, SymbolError> {
		log.info(`SymTree: Entering SymNode ${name}`);

		if (!(name in this.currentNode.children)) {
			return error(SymbolError.SymNodeNotFound(name, this.currentNode, this.ctx(this.currentNode.pos)));
		}

		this.currentNode = this.currentNode.children[name];

		return ok(this.currentNode);
	}

	/** Exits the current SymNode and traverses to its parent. */
	public exit(): Result<SymNode, SymbolError> {
		log.info(
			`SymTree: Exiting SymNode ${this.currentNode.name} to ${
				this.currentNode.parent.has() ? this.currentNode.parent.value.name : '<no parent>'
			}`,
		);

		if (!this.currentNode.parent.has()) {
			return error(SymbolError.AtTopAndNotExpectingToBe(this.currentNode, this.ctx(this.currentNode.pos)));
		}

		this.currentNode = this.currentNode.parent.value;

		return ok(this.currentNode);
	}

	/** Update the current SymNode's name */
	public updateSymNodeName(newName: string, newFqn: string): void {
		log.info(`SymTree: Renaming SymNode ${this.currentNode.name} to ${newName}`);

		// get the underlying node
		const node = this.currentNode;

		// capture old name
		const oldName = _.clone(node.name);

		// change the name
		node.name = newName;
		node.fqn = newFqn;

		// change the name in the parent's children list
		if (this.currentNode !== this.root) {
			if (this.currentNode.parent.has()) {
				// copy data from old key to new
				this.currentNode.parent.value.children[newName] = this.currentNode.parent.value.children[oldName];

				// update the FQNs
				for (const child of Object.keys(this.currentNode.parent.value.children)) {
					this.currentNode.parent.value.children[child].fqn = `${newFqn}.${child}`;
				}

				// delete old
				delete this.currentNode.parent.value.children[oldName];
			}
		}
	}

	public getCurrentOrParentNode(useParent: boolean): Result<SymNode, SymbolError> {
		if (useParent) {
			if (!this.currentNode.parent.has()) {
				return error(SymbolError.AtTopAndNotExpectingToBe(this.currentNode, this.ctx(this.currentNode.pos)));
			}

			return ok(this.currentNode.parent.value);
		}

		return ok(this.currentNode);
	}

	ctx(pos: Pos, length?: number): Context {
		return new Context(this.loc[pos.line - 1], pos.line, pos.col, length ?? pos.end - pos.start);
	}
}

export class SymbolTable {
	static tree: SymTree;

	////////////////////////////////
	// Methods for inserting records
	////////////////////////////////

	public static newTree(rootNodeName: string, pos: Pos, loc: string[], ast: AST) {
		const tree = new SymTree(rootNodeName, pos, loc, ast);

		SymbolTable.tree = tree;

		return tree;
	}

	/**
	 * Defines a class symbol
	 *
	 * @param modifiers Modifiers
	 * @param name Class name
	 * @param fqn Fully qualified name
	 * @param typeParams Type parameters
	 * @param _extends Parent Classes
	 * @param _implements Interfaces
	 * @param pos Position
	 */
	public static insertClass(
		modifiers: ASTTypeList<ASTModifier> | ASTModifier[],
		name: string,
		fqn: string,
		typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[],
		_extends: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[],
		_implements: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[],
		pos: Pos,
	): Result<ClassSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(SymbolError.DuplicateIdentifier('insertClass', name, symNode, SymbolTable.ctx(pos)));
			}

			const classSymbol: ClassSym = {
				kind: 'class',
				name,
				fqn,
				modifiers: ASTTypeList.wrapArray(modifiers, pos),
				typeParams: ASTTypeList.wrapArray(typeParams, pos),
				_extends: ASTTypeList.wrapArray(_extends, pos),
				_implements: ASTTypeList.wrapArray(_implements, pos),
				struct: undefined,
				pos,
			};

			symTab.symbols.set(name, classSymbol);

			return ok(classSymbol);
		});
	}

	/**
	 * Defines an enum symbol
	 *
	 * @param name Enum name
	 * @param fqn Fully qualified name
	 * @param typeParams Type parameters
	 * @param _extends Parent Enums
	 */
	public static insertEnum(
		name: string,
		fqn: string,
		typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[],
		_extends: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[],
		pos: Pos,
	): Result<EnumSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(SymbolError.DuplicateIdentifier('insertEnum', name, symNode, SymbolTable.ctx(pos)));
			}

			const enumSymbol: EnumSym = {
				kind: 'enum',
				name,
				fqn,
				typeParams: ASTTypeList.wrapArray(typeParams, pos),
				_extends: ASTTypeList.wrapArray(_extends, pos),
				pos,
			};

			symTab.symbols.set(name, enumSymbol);

			return ok(enumSymbol);
		});
	}

	/**
	 * Defines a function symbol
	 *
	 * @param name Function name
	 * @param fqn Fully qualified name
	 * @param typeParams Type parameters
	 * @param params Parameters
	 * @param returnTypes Return types
	 * @param pos Position
	 */
	public static insertFunction(
		name: string,
		fqn: string,
		typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[],
		params: ASTTypeList<ASTParameter> | ASTParameter[],
		returnTypes: ASTTypeList<ASTType> | ASTType[],
		pos: Pos,
	): Result<FuncSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(SymbolError.DuplicateIdentifier('insertFunction', name, symNode, SymbolTable.ctx(pos)));
			}

			const functionSymbol: FuncSym = {
				kind: 'function',
				name,
				fqn,
				typeParams: ASTTypeList.wrapArray(typeParams, pos),
				params: ASTTypeList.wrapArray(params, pos),
				returnTypes: ASTTypeList.wrapArray(returnTypes, pos),
				llvmFunction: undefined,
				pos,
			};

			symTab.symbols.set(name, functionSymbol);

			return ok(functionSymbol);
		});
	}

	/**
	 * Defines an interface symbol
	 *
	 * @param name Interface name
	 * @param fqn Fully qualified name
	 * @param typeParams Type parameters
	 * @param _extends Parent Interfaces
	 * @param pos Position
	 */
	public static insertInterface(
		name: string,
		fqn: string,
		typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[],
		_extends: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[],
		pos: Pos,
	): Result<InterfaceSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(SymbolError.DuplicateIdentifier('insertInterface', name, symNode, SymbolTable.ctx(pos)));
			}

			const interfaceSymbol: InterfaceSym = {
				kind: 'interface',
				name,
				fqn,
				typeParams: ASTTypeList.wrapArray(typeParams, pos),
				_extends: ASTTypeList.wrapArray(_extends, pos),
				struct: undefined,
				pos,
			};

			symTab.symbols.set(name, interfaceSymbol);

			return ok(interfaceSymbol);
		});
	}

	/**
	 * Defines a parameter symbol
	 *
	 * @param name Parameter name
	 * @param fqn Fully qualified name
	 * @param type Parameter type
	 * @param defaultValue Default value, if any
	 * @param rest Is this a rest parameter?
	 * @param llvmArgument LLVM argument, if any
	 * @param pos Position
	 */
	public static insertParameter(
		name: string,
		fqn: string,
		type: ASTType,
		defaultValue: AssignableASTs | undefined,
		rest: boolean,
		llvmArgument: llvm.Argument | undefined,
		pos: Pos,
	): Result<ParamSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(SymbolError.DuplicateIdentifier('insertParameter', name, symNode, SymbolTable.ctx(pos)));
			}

			const parameterSymbol: ParamSym = {
				kind: 'parameter',
				name,
				fqn,
				type,
				defaultValue,
				rest,
				llvmArgument,
				pos,
			};

			symTab.symbols.set(name, parameterSymbol);

			return ok(parameterSymbol);
		});
	}

	/**
	 * Defines a variable symbol
	 *
	 * @param name Variable name
	 * @param fqn Fully qualified name
	 * @param kind const or let
	 * @param type Declared type
	 * @param value The current value, if any
	 * @param pos Position
	 */
	public static insertVariable(
		name: string,
		fqn: string,
		mutable: boolean,
		type: ASTType,
		value: AssignableASTs | undefined,
		pos: Pos,
	): Result<VarSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(SymbolError.DuplicateIdentifier('insertVariable', name, symNode, SymbolTable.ctx(pos)));
			}

			const variableSymbol: VarSym = { kind: 'variable', name, fqn, mutable, type, value, pos };

			symTab.symbols.set(name, variableSymbol);

			return ok(variableSymbol);
		});
	}

	///////////////////////////////
	// Methods for updating records
	///////////////////////////////

	/**
	 * Updates the name of a symbol.
	 *
	 * @param oldName
	 * @param newName
	 * @param kind
	 * @param inParent Defaulting to false, should the symbol be defined in the parent node or the current node?
	 * @returns
	 */
	public static updateSymbolName(
		oldName: string,
		newName: string,
		newFqn: string,
		kind: SymbolKind,
		ctx: Context,
		inParent = false,
	): Result<boolean, SymbolError> {
		return SymbolTable.tree.proxy((_symTab: SymTab, _symNode: SymNode, symTree: SymTree) => {
			const nodeToWorkIn = symTree.getCurrentOrParentNode(inParent);
			if (nodeToWorkIn.isError()) {
				return nodeToWorkIn;
			}

			return nodeToWorkIn.value.table.updateSymbolName(oldName, newName, newFqn, kind, ctx);
		});
	}

	public static setClassTypeParams(name: string, typeParams: ASTTypeList<ASTTypeParameter>): Result<ClassSym, SymbolError> {
		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setClassData(name, (classSymbol) => {
				classSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			log.warn(`Setting type params for class ${name} ... FAILED`);
		} else {
			log.success(`Set type params for class ${name}`);
		}

		return result;
	}

	public static setClassExtends(name: string, _extends: ASTTypeList<ASTExtOrImpl>): Result<ClassSym, SymbolError> {
		log.info(`SymbolTable: Setting extends for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setClassData(name, (classSymbol) => {
				classSymbol._extends = _extends;
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting extends for ${name} ... FAILED`);
		}

		return result;
	}

	public static setClassImplements(name: string, _implements: ASTTypeList<ASTExtOrImpl>): Result<ClassSym, SymbolError> {
		log.info(`SymbolTable: Setting implements for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setClassData(name, (classSymbol) => {
				classSymbol._implements = _implements;
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting implements for ${name} ... FAILED`);
		}

		return result;
	}

	public static setEnumTypeParams(name: string, typeParams: ASTTypeList<ASTTypeParameter>): Result<EnumSym, SymbolError> {
		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setEnumData(name, (enumSymbol) => {
				enumSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			log.warn(`Setting type params for enum ${name} ... FAILED`);
		} else {
			log.success(`Set type params for enum ${name}`);
		}

		return result;
	}

	public static setEnumExtends(name: string, _extends: ASTTypeList<ASTExtOrImpl>): Result<EnumSym, SymbolError> {
		log.info(`SymbolTable: Setting extends for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setEnumData(name, (enumSymbol) => {
				enumSymbol._extends = _extends;
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting extends for ${name} ... FAILED`);
		}

		return result;
	}

	public static setFunctionLLVMFunction(name: string, llvmFunction: llvm.Function): Result<FuncSym, SymbolError> {
		log.info(`SymbolTable: Setting llvm.Function for ${name}`);

		return SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.llvmFunction = llvmFunction;
			});
		});
	}

	public static setFunctionTypeParams(name: string, typeParams: ASTTypeList<ASTTypeParameter>): Result<FuncSym, SymbolError> {
		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			log.warn(`Setting type params for function ${name} ... FAILED`);
		} else {
			log.success(`Set type params for function ${name}`);
		}

		return result;
	}

	public static setFunctionParams(name: string, params: ASTTypeList<ASTParameter>): Result<FuncSym, SymbolError> {
		log.info(`SymbolTable: Setting params for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.params = params;
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting params for ${name} ... FAILED`);
		}

		return result;
	}

	public static setFunctionReturnTypes(
		name: string,
		returnTypes: ASTTypeList<ASTType> | ASTType[],
		pos: Pos,
	): Result<FuncSym, SymbolError> {
		log.info(`SymbolTable: Setting return types for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.returnTypes = ASTTypeList.wrapArray(returnTypes, pos);
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting return types for ${name} ... FAILED`);
		}

		return result;
	}

	public static setInterfaceTypeParams(name: string, typeParams: ASTTypeList<ASTTypeParameter>): Result<InterfaceSym, SymbolError> {
		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setInterfaceData(name, (interfaceSymbol) => {
				interfaceSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			log.warn(`Setting type params for interface ${name} ... FAILED`);
		} else {
			log.success(`Set type params for interface ${name}`);
		}

		return result;
	}

	public static setInterfaceExtends(name: string, _extends: ASTTypeList<ASTExtOrImpl>): Result<InterfaceSym, SymbolError> {
		log.info(`SymbolTable: Setting extends for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setInterfaceData(name, (interfaceSymbol) => {
				interfaceSymbol._extends = _extends;
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting extends for ${name} ... FAILED`);
		}

		return result;
	}

	public static setParameterLlvmArgument(name: string, llvmArgument: llvm.Argument): Result<ParamSym, SymbolError> {
		log.info(`SymbolTable: Setting llvm.Argument for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setParameterData(name, (paramSymbol) => {
				paramSymbol.llvmArgument = llvmArgument;
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting llvm.Argument for ${name} ... FAILED`);
		}

		return result;
	}

	public static setVariableAllocaInst(name: string, allocaInst: llvm.AllocaInst): Result<VarSym, SymbolError> {
		log.info(`SymbolTable: Setting AllocaInst for ${name} ...`);

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setVariableData(name, (variableSymbol) => {
				variableSymbol.allocaInst = allocaInst;
			});
		});
		if (result.isError()) {
			log.warn(`SymbolTable: Setting AllocaInst for ${name} ... FAILED`);
		}

		return result;
	}

	//////////////////////////////
	// Methods for reading records
	//////////////////////////////

	/**
	 * Looks up a symbol in the symbol table, recursively searching parent scopes.
	 *
	 * @param name
	 * @param kinds
	 */
	// these are like usages, which specify the return type symbol when we know for sure what it is
	public static lookup(name: string, kinds: ['class']): Maybe<ClassSym>;
	public static lookup(name: string, kinds: ['enum']): Maybe<EnumSym>;
	public static lookup(name: string, kinds: ['function']): Maybe<FuncSym>;
	public static lookup(name: string, kinds: ['interface']): Maybe<InterfaceSym>;
	public static lookup(name: string, kinds: ['parameter']): Maybe<ParamSym>;
	public static lookup(name: string, kinds: ['variable']): Maybe<VarSym>;
	public static lookup(name: string, kinds: SymbolKind[]): Maybe<SymbolInfo>;
	public static lookup(name: string, kinds: SymbolKind[]): Maybe<SymbolInfo> {
		// name can be a regular Identifier or a dot-separated MemberExpression
		const nameParts = name.split('.');

		// if there are no dots, we can just look up the name in the current scope
		if (nameParts.length === 1) {
			// returns the Maybe<SymbolInfo> and either the name of the SymTab it was
			// found in or a comma-separated list of SymTab names that were checked
			const [symbol, symNodeName]: [Maybe<SymbolInfo>, string] = SymbolTable.tree.proxy(
				(_symTab: SymTab, symNode: SymNode, _symTree: SymTree, stdlib: SymNode) => {
					let found = false;
					let nodeToCheck = symNode;
					const nodesChecked: string[] = [];

					while (!found) {
						// log.info(`looking in ${nodeToCheck.name}'s SymTab`);
						// log.vars({ kinds, table: nodeToCheck.table });

						// call the get() method on the SymTab
						const foundHere = nodeToCheck.get(name, kinds);
						nodesChecked.push(nodeToCheck.name);
						if (foundHere.has()) {
							found = true;

							return [foundHere, nodeToCheck.name];
						} else if (nodeToCheck.parent.has()) {
							nodeToCheck = nodeToCheck.parent.value;
						} else {
							// check stdlib
							nodesChecked.push('stdlib');

							return [stdlib.table.contains(name, kinds), 'stdlib'];
						}
					}

					return [hasNot(), nodesChecked.join(', ')];
				},
			);

			if (symbol.has()) {
				// in this case, symNodeName is the SymNode that the symbol was found in
				log.success(`SymbolTable.lookup('${name}'): found in ${symNodeName}'s SymTab`);
			} else {
				// in this case, symNodeName is a comma-separated list of SymNodes that were checked
				log.warn(`SymbolTable.lookup('${name}'): not found, despite checking in these SymNodes: ${symNodeName}`);
			}

			return symbol;
		}

		// if there are dots, we look up the first part, then traverse down from there
		// in this case we use symbolKinds rather than what the user passed in, since
		// that would be for the final part.
		const firstAncestor = SymbolTable.lookupSymNode(nameParts[0], symbolKinds);
		if (!firstAncestor.has()) {
			log.warn(`SymbolTable.lookup('${name}'): ${nameParts[0]} not found`);

			return hasNot();
		}

		const symbol = SymbolTable.lookDown(firstAncestor.value, nameParts.slice(1));
		if (!symbol.has()) {
			log.warn(`SymbolTable.lookup('${name}'): not found`);
		} else {
			log.success(`SymbolTable.lookup('${name}'): found`);
		}

		return symbol;
	}

	/**
	 * Looks down a tree, by begging with a symbol and a list of names. Each name is a successive
	 * child of the previous symbol. We bail on any trouble.
	 *
	 * @param symNode
	 * @param names
	 * @return Maybe<SymbolInfo>
	 */
	public static lookDown(symNode: SymNode, names: string[]): Maybe<SymbolInfo> {
		let currentSymNode = symNode;
		let currentSymbol: SymbolInfo | undefined = undefined;
		for (const name of names) {
			const found = currentSymNode.table.contains(name, symbolKinds);
			if (!found.has()) {
				log.warn(`SymbolTable.lookDown('${symNode.name}', [${names.join(', ')}]): ${name} not found`);

				return found;
			}

			// update currentSymNode and currentSymbol for the next iteration
			currentSymNode = currentSymNode.children[found.value.name];
			currentSymbol = found.value;
		}

		if (typeof currentSymbol === 'undefined') {
			log.warn(`SymbolTable.lookDown('${symNode.name}', [${names.join(', ')}]): not found`);
		} else {
			log.success(`SymbolTable.lookDown('${symNode.name}', [${names.join(', ')}]): found`);
		}

		return maybeIfNotUndefined(currentSymbol);
	}

	/**
	 * Looks up a SymNode in the symbol table.
	 *currentSymNode
	 * This is very similar to lookup(), but it returns the SymNode instead of the SymbolInfo.
	 *
	 * @param name
	 * @param kinds
	 */
	// these are like usages, which specify the return type symbol when we know for sure what it is
	public static lookupSymNode(name: string, kinds: SymbolKind[]): Maybe<SymNode> {
		log.info(`SymbolTable.lookupSymNode('${name}')`);

		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode, _symTree: SymTree, stdlib: SymNode) => {
			let found = false;
			let nodeToCheck = symNode;
			let table = symTab;

			while (!found) {
				log.info(`SymbolTable.lookupSymNode('${name}'): looking in ${nodeToCheck.name}'s SymTab`);
				// log.vars({ table, kinds });

				if (table.contains(name, kinds).has()) {
					found = true;

					if (nodeToCheck.name === name) {
						return has(nodeToCheck);
					}

					// if we found a symbol, but it's not the one we're looking for, we need to look in its children
					if (name in nodeToCheck.children) {
						return has(nodeToCheck.children[name]); // <-- this line differs from lookup()
					}

					return hasNot();
				} else if (nodeToCheck.parent.has()) {
					nodeToCheck = nodeToCheck.parent.value;
					table = nodeToCheck.table;
				} else if (stdlib.table.contains(name, kinds).has()) {
					// check stdlib
					return has(stdlib);
				}
			}

			return hasNot();
		});
	}

	/**
	 * Looks up the nearest class in the symbol table.
	 * @returns
	 */
	public static findNearestClass(): Maybe<SymNode> {
		log.info(`SymbolTable.findNearestClass ...`);

		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode, _symTree: SymTree) => {
			let found = false;
			let nodeToCheck = symNode;

			while (!found) {
				log.info(`SymbolTable.findNearestClass(): looking in ${nodeToCheck.name}'s SymTab`);

				if (nodeToCheck.kind === 'class') {
					found = true;

					return has(nodeToCheck);
				} else if (nodeToCheck.parent.has()) {
					nodeToCheck = nodeToCheck.parent.value;
				}
			}

			return hasNot();
		});
	}

	public static ctx(pos: Pos, length?: number): Context {
		return new Context(SymbolTable.tree.loc[pos.line - 1], pos.line, pos.col, length ?? pos.end - pos.start);
	}

	public static debug() {
		log.vars({
			root: SymbolTable.tree.root,
			currentNode: SymbolTable.tree.getCurrentNode(),
		});
	}

	// /**
	//  * Override the default behavior when calling util.inspect()
	//  */
	// [util.inspect.custom](depth: number, options: util.InspectOptions): string {
	// 	// we need to explicitly display the class name since it
	// 	// disappears when using a custom inspect function.
	// 	return `${this.constructor.name} ${util.inspect(this.getCurrentNode().mustGetValue(), options)}`;
	// }
}

export class SymTab {
	/** Reference to the SymNode to which this SymTab belongs */
	public readonly ownerNode: SymNode;

	/** Copy of the parent SymNode's name */
	public readonly name: string;

	public symbols: Map<string, SymbolInfo>;

	constructor(ownerNode: SymNode, name: string) {
		this.ownerNode = ownerNode;

		this.name = name;

		this.symbols = new Map<string, SymbolInfo>();
	}

	public updateSymbolName(
		oldName: string,
		newName: string,
		newFqn: string,
		kind: SymbolKind,
		ctx: Context,
	): Result<boolean, SymbolError> {
		const maybe = this.contains(oldName, [kind]).map((symbol) => {
			log.info(`SymTab: Renaming Symbol from ${oldName} to ${newName}`);

			symbol.name = newName;
			symbol.fqn = newFqn;

			this.symbols.set(newName, symbol);

			return this.symbols.delete(oldName);
		});

		// log.vars({ symbolsAfterRename: this.symbols });

		return CreateResultFrom.maybe(maybe, SymbolError.SymbolNameNotUpdated(oldName, newName, kind, this.ownerNode, ctx));
	}

	public setClassData(name: string, setter: (classSymbol: ClassSym) => void): Result<ClassSym, SymbolError> {
		return this.setData<ClassSym>('class', name, setter);
	}

	public setEnumData(name: string, setter: (enumSymbol: EnumSym) => void): Result<EnumSym, SymbolError> {
		return this.setData<EnumSym>('enum', name, setter);
	}

	public setFunctionData(name: string, setter: (funcSymbol: FuncSym) => void): Result<FuncSym, SymbolError> {
		return this.setData<FuncSym>('function', name, setter);
	}

	public setInterfaceData(name: string, setter: (interfaceSymbol: InterfaceSym) => void): Result<InterfaceSym, SymbolError> {
		return this.setData<InterfaceSym>('interface', name, setter);
	}

	public setParameterData(name: string, setter: (varSymbol: ParamSym) => void): Result<ParamSym, SymbolError> {
		return this.setData<ParamSym>('parameter', name, setter);
	}

	public setVariableData(name: string, setter: (varSymbol: VarSym) => void): Result<VarSym, SymbolError> {
		return this.setData<VarSym>('variable', name, setter);
	}

	/** Most generic method for setting some data on some symbol */
	private setData<S extends SymbolInfo>(kind: SymbolKind, name: string, setter: (funcSymbol: S) => void): Result<S, SymbolError> {
		const symbol = SymbolTable.lookup(name, [kind]) as Maybe<S>;
		if (!symbol.has()) {
			return error(SymbolError.UnknownSymbol(`Undefined ${kind}: ${name}`, this.ownerNode, this.ctx(this.ownerNode.pos)));
		}

		setter(symbol.value);

		this.symbols.set(name, symbol.value);

		return ok(symbol.value);
	}

	// these are like usages, which specify the return type symbol when we know for sure what it is
	public contains(name: string, kinds: ['class']): Maybe<ClassSym>;
	public contains(name: string, kinds: ['enum']): Maybe<EnumSym>;
	public contains(name: string, kinds: ['function']): Maybe<FuncSym>;
	public contains(name: string, kinds: ['interface']): Maybe<InterfaceSym>;
	public contains(name: string, kinds: ['parameter']): Maybe<ParamSym>;
	public contains(name: string, kinds: ['variable']): Maybe<VarSym>;
	public contains(name: string, kinds: SymbolKind[]): Maybe<SymbolInfo>;
	public contains(name: string, kinds: SymbolKind[]): Maybe<SymbolInfo> {
		const symbol = this.symbols.get(name);
		if (typeof symbol !== 'undefined' && kinds.includes(symbol.kind)) {
			return has(symbol);
		}

		return hasNot();
	}

	public containsOfAnyType(name: string): boolean {
		return this.contains(name, symbolKinds).has();
	}

	public ctx(pos: Pos, length?: number): Context {
		return new Context(SymbolTable.tree.loc[pos.line - 1], pos.line, pos.col, length ?? pos.end - pos.start);
	}

	/**
	 * Override the default behavior when calling util.inspect()
	 */
	// [util.inspect.custom](depth: number, options: util.InspectOptions): string {
	// 	// we need to explicitly display the class name since it
	// 	// disappears when using a custom inspect function.
	// 	return `${this.name} ${util.inspect(this.symbols, options)} ${util.inspect(this.children, options)}`;
	// }
}
