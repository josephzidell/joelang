import llvm from 'llvm-bindings';
import _ from 'lodash';
import { Get } from 'type-fest';
import ErrorContext from '../shared/errorContext';
import { Maybe, has, hasNot } from '../shared/maybe';
import { Pos } from '../shared/pos';
import { Result, error, ok } from '../shared/result';
import {
	ASTParameter,
	ASTType,
	ASTTypeExceptPrimitive,
	ASTTypeParameter,
	ASTTypePrimitiveString,
	AssignableASTs,
} from './asts';
import SymbolError, { SymbolErrorCode } from './symbolError';

interface Sym {
	pos: Pos;
}

export type ClassSym = {
	kind: 'class';
	typeParams: ASTType[];
	_extends: ASTTypeExceptPrimitive[];
	_implements: ASTTypeExceptPrimitive[];
	struct: llvm.StructType | undefined;
} & Sym;

export type EnumSym = {
	kind: 'enum';
	typeParams: ASTType[];
	_extends: ASTTypeExceptPrimitive[];
} & Sym;

export type FuncSym = {
	kind: 'function';
	typeParams: ASTType[];
	params: ASTParameter[];
	returnTypes: ASTType[];
	llvmFunction?: llvm.Function;
} & Sym;

export type InterfaceSym = {
	kind: 'interface';
	typeParams: ASTType[];
	_extends: ASTTypeExceptPrimitive[];
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
	// each node needs a name; root is 'global'
	public name: string;

	public kind: SymNodeKind;

	public readonly table: SymTab;

	/** Child nodes */
	public readonly children: Record<string, SymNode> = {};

	public readonly pos: Pos;

	private debug: boolean;

	private _parent: Maybe<SymNode>;
	public get parent(): Maybe<SymNode> {
		return this._parent;
	}

	constructor(name: string, kind: SymNodeKind, parent: Maybe<SymNode>, pos: Pos, options: Options) {
		this.name = name;
		this.kind = kind;
		this.table = new SymTab(this, name, options);
		this._parent = parent;
		this.pos = pos;
		this.debug = options.debug;
	}

	public createChild(name: string, kind: SymNodeKind, pos: Pos) {
		if (this.debug) {
			console.log(`SymNode: Creating child ${kind} ${name}`);
		}

		const newNode = new SymNode(name, kind, has(this), pos, { debug: this.debug });
		this.children[name] = newNode;

		return newNode;
	}

	public getDebug(): void {
		console.dir(
			{
				name: this.name,
				symTab: this.table,
				parent: this._parent,
			},
			{ depth: null },
		);
	}

	/**
	 * Tries to get a symbol from this specific table, but does not recurse up the tree.
	 *
	 * This is called by SymbolTable.lookup(), which does recurse up the tree.
	 *
	 * @param name
	 * @param kinds
	 * @param options
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
	private debug: boolean;

	constructor(rootNodeName: string, pos: Pos, loc: string[], options: Options) {
		this.loc = loc;
		this.debug = options.debug;

		if (this.debug) {
			console.log(`SymTree: Beginning with root node ${rootNodeName}`);
		}
		// TODO change global kind to package
		this.root = new SymNode(rootNodeName, 'global', hasNot(), pos, options);

		this.currentNode = this.root;

		// setup the stdlib SymNode, which comes with a SymTab
		this.stdlib = this.getStdlibSymNode(pos, options);
	}

	private getStdlibSymNode(pos: Pos, options: Options): SymNode {
		// TODO change global kind to package
		const symNode = new SymNode('stdlib', 'global', hasNot(), pos, options);

		const readStrFunctionSymbol: FuncSym = {
			kind: 'function',
			typeParams: [],
			params: [],
			returnTypes: [ASTTypePrimitiveString(pos)],
			llvmFunction: undefined,
			pos,
		};

		symNode.table.symbols.set('readStr', readStrFunctionSymbol);

		return symNode;
	}

	public getCurrentNode() {
		return this.currentNode;
	}

	public createNewSymNodeAndEnter(name: string, kind: SymNodeKind, pos: Pos): SymNode {
		if (this.debug) {
			console.log(`SymTree: Creating new ${kind} SymNode ${name}`);
		}

		const newNode = this.currentNode.createChild(name, kind, pos);

		this.currentNode = newNode;

		return newNode;
	}

	/** Proxies any action to the current SymNode's SymTab */
	public proxy<R>(what: (symTab: SymTab, symNode: SymNode, symTree: SymTree, stdlib: SymNode) => R): R {
		return what(this.currentNode.table, this.currentNode, this, this.stdlib);
	}

	/** Enters a child's SymNode using the FQN */
	public enter(name: string): Result<SymNode, SymbolError> {
		if (this.debug) {
			console.log(`SymTree: Entering SymNode ${name}`);
		}

		if (!(name in this.currentNode.children)) {
			return error(
				new SymbolError(
					SymbolErrorCode.SymNodeNotFound,
					`SymNode: Cannot find ${name} in ${this.currentNode.name}`,
					this.currentNode,
					this.getErrorContext(this.currentNode.pos),
				),
			);
		}

		this.currentNode = this.currentNode.children[name];

		return ok(this.currentNode);
	}

	/** Exits the current SymNode and traverses to its parent. */
	public exit(): Result<SymNode, SymbolError> {
		if (this.debug) {
			console.log(
				`SymTree: Exiting SymNode ${this.currentNode.name} to ${
					this.currentNode.parent.has() ? this.currentNode.parent.value.name : '<no parent>'
				}`,
			);
		}

		if (!this.currentNode.parent.has()) {
			return error(
				new SymbolError(
					SymbolErrorCode.AtTopAndNotExpectingToBe,
					"We're at the top SymNode; cannot exit",
					this.currentNode,
					this.getErrorContext(this.currentNode.pos),
				),
			);
		}

		this.currentNode = this.currentNode.parent.value;

		return ok(this.currentNode);
	}

	/** Update the current SymNode's name */
	public updateSymNodeName(name: string): void {
		if (this.debug) {
			console.log(`SymTree: Renaming SymNode ${this.currentNode.name} to ${name}`);
		}

		// get the underlying node
		const node = this.currentNode;

		// capture old name
		const oldName = _.clone(node.name);

		// change the name
		node.name = name;

		// change the name in the parent's children list
		if (this.currentNode !== this.root) {
			if (this.currentNode.parent.has()) {
				// copy data from old key to new
				this.currentNode.parent.value.children[name] = this.currentNode.parent.value.children[oldName];

				// delete old
				delete this.currentNode.parent.value.children[oldName];
			}
		}
	}

	public getCurrentOrParentNode(useParent: boolean): Result<SymNode, SymbolError> {
		if (useParent) {
			if (!this.currentNode.parent.has()) {
				return error(
					new SymbolError(
						SymbolErrorCode.AtTopAndNotExpectingToBe,
						"We're at the top SymNode; there is no parent",
						this.currentNode,
						this.getErrorContext(this.currentNode.pos),
					),
				);
			}

			return ok(this.currentNode.parent.value);
		}

		return ok(this.currentNode);
	}

	getErrorContext(pos: Pos, length?: number): ErrorContext {
		return new ErrorContext(this.loc[pos.line - 1], pos.line, pos.col, length ?? pos.end - pos.start);
	}
}

export class SymbolTable {
	static tree: SymTree;

	////////////////////////////////
	// Methods for inserting records
	////////////////////////////////

	public static newTree(rootNodeName: string, pos: Pos, loc: string[], options: Options) {
		const tree = new SymTree(rootNodeName, pos, loc, options);

		SymbolTable.tree = tree;

		return tree;
	}

	/**
	 * Defines a class symbol
	 *
	 * @param name Class name
	 * @param typeParams Type parameters
	 * @param _extends Parent Classes
	 * @param _implements Interfaces
	 */
	public static insertClass(
		name: string,
		typeParams: ASTType[],
		_extends: ASTTypeExceptPrimitive[],
		_implements: ASTTypeExceptPrimitive[],
		pos: Pos,
	): Result<ClassSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(
					new SymbolError(
						SymbolErrorCode.DuplicateIdentifier,
						`Symbol: insertClass: There already is an item named ${name} in the Symbol Table`,
						symNode,
						SymbolTable.getErrorContext(pos),
					),
				);
			}

			const classSymbol: ClassSym = {
				kind: 'class',
				typeParams,
				_extends,
				_implements,
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
	 * @param typeParams Type parameters
	 * @param _extends Parent Enums
	 */
	public static insertEnum(
		name: string,
		typeParams: ASTType[],
		_extends: ASTTypeExceptPrimitive[],
		_implements: ASTTypeExceptPrimitive[],
		pos: Pos,
	): Result<EnumSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(
					new SymbolError(
						SymbolErrorCode.DuplicateIdentifier,
						`Symbol: insertEnum: There already is an item named ${name} in the Symbol Table`,
						symNode,
						SymbolTable.getErrorContext(pos),
					),
				);
			}

			const enumSymbol: EnumSym = {
				kind: 'enum',
				typeParams,
				_extends,
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
	 * @param typeParams Type parameters
	 * @param params Parameters
	 * @param returnTypes Return types
	 */
	public static insertFunction(
		name: string,
		typeParams: ASTType[],
		params: ASTParameter[],
		returnTypes: ASTType[],
		pos: Pos,
	): Result<FuncSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(
					new SymbolError(
						SymbolErrorCode.DuplicateIdentifier,
						`Symbol: insertFunction: There already is an item named ${name} in the Symbol Table`,
						symNode,
						SymbolTable.getErrorContext(pos),
					),
				);
			}

			const functionSymbol: FuncSym = {
				kind: 'function',
				typeParams,
				params,
				returnTypes,
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
	 * @param typeParams Type parameters
	 * @param _extends Parent Interfaces
	 */
	public static insertInterface(
		name: string,
		typeParams: ASTType[],
		_extends: ASTTypeExceptPrimitive[],
		_implements: ASTTypeExceptPrimitive[],
		pos: Pos,
	): Result<InterfaceSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(
					new SymbolError(
						SymbolErrorCode.DuplicateIdentifier,
						`Symbol: insertInterface: There already is an item named ${name} in the Symbol Table`,
						symNode,
						SymbolTable.getErrorContext(pos),
					),
				);
			}

			const interfaceSymbol: InterfaceSym = {
				kind: 'interface',
				typeParams,
				_extends,
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
	 * @param type Parameter type
	 * @param defaultValue Default value, if any
	 * @param rest Is this a rest parameter?
	 */
	public static insertParameter(
		name: string,
		type: ASTType,
		defaultValue: AssignableASTs | undefined,
		rest: boolean,
		llvmArgument: llvm.Argument | undefined,
		pos: Pos,
	): Result<ParamSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(
					new SymbolError(
						SymbolErrorCode.DuplicateIdentifier,
						`Symbol: insertParameter: There already is an item named ${name} in the Symbol Table`,
						symNode,
						SymbolTable.getErrorContext(pos),
					),
				);
			}

			const parameterSymbol: ParamSym = {
				kind: 'parameter',
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
	 * @param kind const or let
	 * @param type Declared type
	 * @param value The current value, if any
	 */
	public static insertVariable(
		name: string,
		mutable: boolean,
		type: ASTType,
		value: AssignableASTs | undefined,
		pos: Pos,
	): Result<VarSym, SymbolError> {
		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			if (symTab.containsOfAnyType(name)) {
				return error(
					new SymbolError(
						SymbolErrorCode.DuplicateIdentifier,
						`Symbol: insertVariable: There already is an item named ${name} in the Symbol Table`,
						symNode,
						SymbolTable.getErrorContext(pos),
					),
				);
			}

			const variableSymbol: VarSym = { kind: 'variable', mutable, type, value, pos };

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
	public static updateSymbolName(oldName: string, newName: string, kind: SymbolKind, inParent = false): boolean {
		return SymbolTable.tree.proxy((_symTab: SymTab, _symNode: SymNode, symTree: SymTree) => {
			const nodeToWorkIn = symTree.getCurrentOrParentNode(inParent);
			if (nodeToWorkIn.isError()) {
				return false;
			}

			return nodeToWorkIn.value.table.updateSymbolName(oldName, newName, kind);
		});
	}

	public static setClassTypeParams(
		name: string,
		typeParams: ASTTypeParameter[],
		options: Options,
	): Result<ClassSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting type params for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setClassData(name, (classSymbol) => {
				classSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting type params for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setClassExtends(
		name: string,
		_extends: ASTTypeExceptPrimitive[],
		options: Options,
	): Result<ClassSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting extends for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setClassData(name, (classSymbol) => {
				classSymbol._extends = _extends;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting extends for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setClassImplements(
		name: string,
		_implements: ASTTypeExceptPrimitive[],
		options: Options,
	): Result<ClassSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting implements for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setClassData(name, (classSymbol) => {
				classSymbol._implements = _implements;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting implements for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setEnumTypeParams(
		name: string,
		typeParams: ASTTypeParameter[],
		options: Options,
	): Result<EnumSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting type params for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setEnumData(name, (enumSymbol) => {
				enumSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting type params for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setEnumExtends(
		name: string,
		_extends: ASTTypeExceptPrimitive[],
		options: Options,
	): Result<EnumSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting extends for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setEnumData(name, (enumSymbol) => {
				enumSymbol._extends = _extends;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting extends for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setFunctionLLVMFunction(
		name: string,
		llvmFunction: llvm.Function,
		options: Options,
	): Result<FuncSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting llvm.Function for ${name}`);
		}

		return SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.llvmFunction = llvmFunction;
			});
		});
	}

	public static setFunctionTypeParams(
		name: string,
		typeParams: ASTTypeParameter[],
		options: Options,
	): Result<FuncSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting type params for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting type params for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setFunctionParams(
		name: string,
		params: ASTParameter[],
		options: Options,
	): Result<FuncSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting params for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.params = params;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting params for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setFunctionReturnTypes(
		name: string,
		returnTypes: ASTType[],
		options: Options,
	): Result<FuncSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting return types for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.returnTypes = returnTypes;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting return types for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setInterfaceTypeParams(
		name: string,
		typeParams: ASTTypeParameter[],
		options: Options,
	): Result<InterfaceSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting type params for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setInterfaceData(name, (interfaceSymbol) => {
				interfaceSymbol.typeParams = typeParams;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting type params for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setInterfaceExtends(
		name: string,
		_extends: ASTTypeExceptPrimitive[],
		options: Options,
	): Result<InterfaceSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting extends for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setInterfaceData(name, (interfaceSymbol) => {
				interfaceSymbol._extends = _extends;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting extends for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setParameterLlvmArgument(
		name: string,
		llvmArgument: llvm.Argument,
		options: Options,
	): Result<ParamSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting llvm.Argument for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setParameterData(name, (paramSymbol) => {
				paramSymbol.llvmArgument = llvmArgument;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting llvm.Argument for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setVariableAllocaInst(
		name: string,
		allocaInst: llvm.AllocaInst,
		options: Options,
	): Result<VarSym, SymbolError> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting AllocaInst for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setVariableData(name, (variableSymbol) => {
				variableSymbol.allocaInst = allocaInst;
			});
		});
		if (result.isError()) {
			if (options.debug) {
				console.error(`SymbolTable: Setting AllocaInst for ${name} ... FAILED`);
			}
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
	 * @param options
	 */
	// these are like usages, which specify the return type symbol when we know for sure what it is
	public static lookup(name: string, kinds: ['class'], options: Options): Maybe<ClassSym>;
	public static lookup(name: string, kinds: ['enum'], options: Options): Maybe<EnumSym>;
	public static lookup(name: string, kinds: ['function'], options: Options): Maybe<FuncSym>;
	public static lookup(name: string, kinds: ['interface'], options: Options): Maybe<InterfaceSym>;
	public static lookup(name: string, kinds: ['parameter'], options: Options): Maybe<ParamSym>;
	public static lookup(name: string, kinds: ['variable'], options: Options): Maybe<VarSym>;
	public static lookup(name: string, kinds: SymbolKind[], options: Options): Maybe<SymbolInfo>;
	public static lookup(name: string, kinds: SymbolKind[], options: Options): Maybe<SymbolInfo> {
		if (options.debug) {
			console.log(`SymbolTable.lookup('${name}')`);
		}

		return SymbolTable.tree.proxy((_symTab: SymTab, symNode: SymNode, _symTree: SymTree, stdlib: SymNode) => {
			let found = false;
			let nodeToCheck = symNode;

			while (!found) {
				if (options.debug) {
					console.log(`SymbolTable.lookup('${name}'): looking in ${nodeToCheck.name}'s SymTab`);
					console.debug({ kinds, table: nodeToCheck.table });
				}

				// call the get() method on the SymTab
				const foundHere = nodeToCheck.get(name, kinds);
				if (foundHere.has()) {
					found = true;

					return foundHere;
				} else if (nodeToCheck.parent.has()) {
					nodeToCheck = nodeToCheck.parent.value;
				} else {
					// check stdlib
					return stdlib.table.contains(name, kinds);
				}
			}

			return hasNot();
		});
	}

	/**
	 * Looks up a SymNode in the symbol table.
	 *
	 * This is very similar to lookup(), but it returns the SymNode instead of the SymbolInfo.
	 *
	 * @param name
	 * @param kinds
	 * @param options
	 */
	// these are like usages, which specify the return type symbol when we know for sure what it is
	public static lookupSymNode(name: string, kinds: SymbolKind[], options: Options): Maybe<SymNode> {
		if (options.debug) {
			console.log(`SymbolTable.lookupSymNode('${name}')`);
		}

		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode, _symTree: SymTree, stdlib: SymNode) => {
			let found = false;
			let nodeToCheck = symNode;
			let table = symTab;

			while (!found) {
				if (options.debug) {
					console.log(`SymbolTable.lookupSymNode('${name}'): looking in ${nodeToCheck.name}'s SymTab`);
					console.debug({ table, kinds });
				}

				if (table.contains(name, kinds).has()) {
					found = true;

					return has(nodeToCheck.children[name]); // <-- this line differs from lookup()
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
	 * @param options
	 * @returns
	 */
	public static findNearestClass(options: Options): Maybe<SymNode> {
		if (options.debug) {
			console.log(`SymbolTable.findNearestClass ...`);
		}

		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode, _symTree: SymTree) => {
			let found = false;
			let nodeToCheck = symNode;

			while (!found) {
				if (options.debug) {
					console.log(`SymbolTable.findNearestClass(): looking in ${nodeToCheck.name}'s SymTab`);
				}

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

	public static getErrorContext(pos: Pos, length?: number): ErrorContext {
		return new ErrorContext(SymbolTable.tree.loc[pos.line - 1], pos.line, pos.col, length ?? pos.end - pos.start);
	}

	public static debug() {
		console.dir(
			{
				root: SymbolTable.tree.root,
				currentNode: SymbolTable.tree.getCurrentNode(),
			},
			{ depth: null },
		);
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

	private debug: boolean;

	constructor(ownerNode: SymNode, name: string, options: Options) {
		this.ownerNode = ownerNode;

		this.name = name;

		this.symbols = new Map<string, SymbolInfo>();

		this.debug = options.debug;
	}

	public updateSymbolName(oldName: string, newName: string, kind: SymbolKind): boolean {
		const maybe = this.contains(oldName, [kind]).map((symbol) => {
			if (this.debug) {
				console.log(`SymTab: Renaming Symbol from ${oldName} to ${newName}`);
			}

			this.symbols.set(newName, symbol);

			return this.symbols.delete(oldName);
		});

		if (this.debug) {
			console.debug({ symbolsAfterRename: this.symbols });
		}

		return maybe.has() && maybe.value;
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

	public setInterfaceData(
		name: string,
		setter: (interfaceSymbol: InterfaceSym) => void,
	): Result<InterfaceSym, SymbolError> {
		return this.setData<InterfaceSym>('interface', name, setter);
	}

	public setParameterData(name: string, setter: (varSymbol: ParamSym) => void): Result<ParamSym, SymbolError> {
		return this.setData<ParamSym>('parameter', name, setter);
	}

	public setVariableData(name: string, setter: (varSymbol: VarSym) => void): Result<VarSym, SymbolError> {
		return this.setData<VarSym>('variable', name, setter);
	}

	/** Most generic method for setting some data on some symbol */
	private setData<S extends SymbolInfo>(
		kind: SymbolKind,
		name: string,
		setter: (funcSymbol: S) => void,
	): Result<S, SymbolError> {
		const symbol = SymbolTable.lookup(name, [kind], {
			debug: this.debug,
		}) as Maybe<S>;
		if (!symbol.has()) {
			return error(
				new SymbolError(
					SymbolErrorCode.UnknownSymbol,
					`Undefined ${kind}: ${name}`,
					this.ownerNode,
					this.getErrorContext(this.ownerNode.pos),
				),
			);
		}

		setter(symbol.value);

		this.symbols.set(name, symbol.value);

		return ok(symbol.value);
	}

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

	public getErrorContext(pos: Pos, length?: number): ErrorContext {
		return new ErrorContext(SymbolTable.tree.loc[pos.line - 1], pos.line, pos.col, length ?? pos.end - pos.start);
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
