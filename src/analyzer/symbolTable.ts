import llvm from 'llvm-bindings';
import _ from 'lodash';
import { Get } from 'type-fest';
import ErrorContext from '../shared/errorContext';
import { Maybe, has, hasNot } from '../shared/maybe';
import { Pos } from '../shared/pos';
import { Result, error, ok } from '../shared/result';
import { ASTType, AssignableASTs } from './asts';
import SymbolError, { SymbolErrorCode } from './symbolError';

interface Sym {
	pos: Pos;
}

export type FuncSym = {
	kind: 'function';
	typeParams: ASTType[];
	params: ASTType[];
	returnTypes: ASTType[];
	llvmFunction?: llvm.Function;
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
	declaredType?: ASTType;
	value?: AssignableASTs;
	allocaInst?: llvm.AllocaInst;
} & Sym;

type SymbolInfo = FuncSym | ParamSym | VarSym;
type SymbolKind = Get<SymbolInfo, 'kind'>;

export class SymNode {
	// each node needs a name; root is 'global'
	public name: string;
	public readonly table: SymTab;

	/** Child nodes */
	public readonly children: Record<string, SymNode> = {};

	public readonly pos: Pos;

	private debug: boolean;

	private _parent: Maybe<SymNode>;
	public get parent(): Maybe<SymNode> {
		return this._parent;
	}

	constructor(name: string, parent: Maybe<SymNode>, pos: Pos, options: Options) {
		this.name = name;
		this.table = new SymTab(this, options);
		this._parent = parent;
		this.pos = pos;
		this.debug = options.debug;
	}

	public createChild(name: string, pos: Pos) {
		if (this.debug) {
			console.log(`SymNode: Creating child ${name}`);
		}

		const newNode = new SymNode(name, has(this), pos, { debug: this.debug });
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
}

export class SymTree {
	/** Root of the tree. Never changes. */
	public readonly root: SymNode;

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
		this.root = new SymNode(rootNodeName, hasNot(), pos, options);

		this.currentNode = this.root;
	}

	public getCurrentNode() {
		return this.currentNode;
	}

	public createNewSymNodeAndEnter(name: string, pos: Pos): SymNode {
		if (this.debug) {
			console.log(`SymTree: Creating new SymNode ${name}`);
		}

		const newNode = this.currentNode.createChild(name, pos);

		this.currentNode = newNode;

		return newNode;
	}

	/** Proxies any action to the current SymNode's SymTab */
	public proxy<R>(what: (symTab: SymTab, symNode: SymNode, symTree: SymTree) => R): R {
		return what(this.currentNode.table, this.currentNode, this);
	}

	/** Enters a child's SymNode */
	public enter(name: string): Result<SymNode> {
		if (!(name in this.currentNode.children)) {
			return error(
				new SymbolError(
					SymbolErrorCode.SymNodeNotFound,
					`Cannot find child SymNode ${name}`,
					this.currentNode,
					this.getErrorContext(this.currentNode.pos),
				),
			);
		}

		this.currentNode = this.currentNode.children[name];

		return ok(this.currentNode);
	}

	/** Exits the current SymNode and traverses to its parent. */
	public exit(): Result<SymNode> {
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

		if (this.debug) {
			console.log(
				`SymTree: Exiting SymNode ${this.currentNode.name} to ${
					this.currentNode.parent.has() ? this.currentNode.parent.value.name : '<no parent>'
				}`,
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

	public getCurrentOrParentNode(useParent: boolean): Result<SymNode> {
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
		params: ASTType[],
		returnTypes: ASTType[],
		pos: Pos,
	): Result<FuncSym> {
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
	): Result<ParamSym> {
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
	 * @param declaredType Declared type, if any
	 * @param value The current value, if any
	 */
	public static insertVariable(
		name: string,
		mutable: boolean,
		declaredType: ASTType | undefined,
		value: AssignableASTs | undefined,
		pos: Pos,
	): Result<VarSym> {
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

			const variableSymbol: VarSym = { kind: 'variable', mutable, declaredType, value, pos };

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
			if (nodeToWorkIn.outcome === 'error') {
				return false;
			}

			return nodeToWorkIn.value.table.updateSymbolName(oldName, newName, kind);
		});
	}

	public static setFunctionLLVMFunction(
		name: string,
		llvmFunction: llvm.Function,
		options: Options,
	): Result<FuncSym> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting llvm.Function for ${name}`);
		}

		return SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.llvmFunction = llvmFunction;
			});
		});
	}

	public static setFunctionReturnTypes(name: string, returnTypes: ASTType[], options: Options): Result<FuncSym> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting return types for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData(name, (funcSymbol) => {
				funcSymbol.returnTypes = returnTypes;
			});
		});
		if (result.outcome === 'error') {
			if (options.debug) {
				console.error(`SymbolTable: Setting return types for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setParameterLlvmArgument(
		name: string,
		llvmArgument: llvm.Argument,
		options: Options,
	): Result<ParamSym> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting llvm.Argument for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setParameterData(name, (paramSymbol) => {
				paramSymbol.llvmArgument = llvmArgument;
			});
		});
		if (result.outcome === 'error') {
			if (options.debug) {
				console.error(`SymbolTable: Setting llvm.Argument for ${name} ... FAILED`);
			}
		}

		return result;
	}

	public static setVariableAllocaInst(name: string, allocaInst: llvm.AllocaInst, options: Options): Result<VarSym> {
		if (options.debug) {
			console.debug(`SymbolTable: Setting AllocaInst for ${name} ...`);
		}

		const result = SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setVariableData(name, (variableSymbol) => {
				variableSymbol.allocaInst = allocaInst;
			});
		});
		if (result.outcome === 'error') {
			if (options.debug) {
				console.error(`SymbolTable: Setting AllocaInst for ${name} ... FAILED`);
			}
		}

		return result;
	}

	//////////////////////////////
	// Methods for reading records
	//////////////////////////////

	// these are like usages, which specify the return type symbol when we know for sure what it is
	public static lookup(name: string, kinds: ['function'], options: Options): Maybe<FuncSym>;
	public static lookup(name: string, kinds: ['parameter'], options: Options): Maybe<ParamSym>;
	public static lookup(name: string, kinds: ['variable'], options: Options): Maybe<VarSym>;
	public static lookup(name: string, kinds: SymbolKind[], options: Options): Maybe<SymbolInfo>;
	public static lookup(name: string, kinds: SymbolKind[], options: Options): Maybe<SymbolInfo> {
		if (options.debug) {
			console.log(`SymbolTable.lookup('${name}')`);
		}

		return SymbolTable.tree.proxy((symTab: SymTab, symNode: SymNode) => {
			let found = false;
			let nodeToCheck = symNode;
			let table = symTab;

			while (!found) {
				if (options.debug) {
					console.log(`SymbolTable.lookup('${name}'): looking in ${nodeToCheck.name}'s SymTab`);
					console.debug({ table, kinds });
				}

				const foundHere = table.contains(name, kinds);
				if (foundHere.has()) {
					found = true;

					return foundHere;
				} else if (nodeToCheck.parent.has()) {
					nodeToCheck = nodeToCheck.parent.value;
					table = nodeToCheck.table;
				} else {
					return hasNot();
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
	private readonly ownerNode: SymNode;

	public symbols: Map<string, SymbolInfo>;

	private debug: boolean;

	constructor(ownerNode: SymNode, options: Options) {
		this.ownerNode = ownerNode;

		this.symbols = new Map<string, SymbolInfo>();

		this.debug = options.debug;
	}

	public updateSymbolName(oldName: string, newName: string, kind: SymbolKind): boolean {
		const maybe = this.contains(oldName, [kind]).map((symbol) => {
			this.symbols.set(newName, symbol);

			return this.symbols.delete(oldName);
		});

		return maybe.has() && maybe.value;
	}

	public setFunctionData(name: string, setter: (funcSymbol: FuncSym) => void): Result<FuncSym> {
		return this.setData<FuncSym>('function', name, setter);
	}

	public setParameterData(name: string, setter: (varSymbol: ParamSym) => void): Result<ParamSym> {
		return this.setData<ParamSym>('parameter', name, setter);
	}

	public setVariableData(name: string, setter: (varSymbol: VarSym) => void): Result<VarSym> {
		return this.setData<VarSym>('variable', name, setter);
	}

	/** Most generic method for setting some data on some symbol */
	private setData<S extends SymbolInfo>(kind: SymbolKind, name: string, setter: (funcSymbol: S) => void): Result<S> {
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
		return this.contains(name, ['function', 'parameter', 'variable']).has();
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
