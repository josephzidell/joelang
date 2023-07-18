// write a symbol table class that can be used to store and retrieve symbols
// the symbol table should be able to store and retrieve symbols by name
// the symbol table should be able to store and retrieve symbols by type
// the symbol table should be able to store and retrieve symbols by scope
// the symbol table should be able to store and retrieve symbols by name and scope
// the symbol table should be able to store and retrieve symbols by type and scope
// the symbol table should be able to store and retrieve symbols by name and type
// the symbol table should be able to store and retrieve symbols by name, type, and scope

import util from 'util';
import { Maybe, has, hasNot } from '../shared/maybe';
import { Result, error, ok } from '../shared/result';
import { ASTType } from './asts';

type SymbolKind = 'function' | 'const' | 'let' | 'parameter';
type SymbolTypes = ASTType[];

// type Value = unknown;

type SymbolInfo = {
	kind: SymbolKind;
	types: SymbolTypes;
	value?: unknown;
};

class Scope {
	// each scope needs a name; first one is 'global'
	public name: string;
	private readonly symbols: Map<string, SymbolInfo> = new Map<string, SymbolInfo>();

	/** Child scopes */
	public readonly children: Scope[] = [];

	private _parent: Maybe<Scope>;
	public get parent(): Maybe<Scope> {
		return this._parent;
	}

	constructor(name: string, parent: Maybe<Scope>) {
		this.name = name;
		this._parent = parent;
	}

	public define(name: string, kind: SymbolKind, types: SymbolTypes, value: unknown = undefined): void {
		this.symbols.set(name, { kind, types, value });
	}

	public assignKind(name: string, symbolKind: SymbolKind): Result<boolean> {
		const scope = this.lookupScope(name);
		if (scope.has()) {
			const symbol = scope.value.lookup(name);
			if (!symbol.has()) {
				return error(new Error(`Undefined variable: ${name}`));
			}

			symbol.value.kind = symbolKind;
			scope.value.symbols.set(name, symbol.value);
			return ok(true);
		}

		return error(new Error(`Undefined variable: ${name}`));
	}

	public appendTypes(name: string, symbolTypes: SymbolTypes): Result<boolean> {
		const scope = this.lookupScope(name);
		if (scope.has()) {
			const symbol = scope.value.lookup(name);
			if (!symbol.has()) {
				return error(new Error(`Undefined variable: ${name}`));
			}

			symbol.value.types.push(...symbolTypes);
			scope.value.symbols.set(name, symbol.value);
			return ok(true);
		}

		return error(new Error(`Undefined variable: ${name}`));
	}

	public lookup(name: string): Maybe<SymbolInfo> {
		const scope = this.lookupScope(name);
		if (scope.has()) {
			const symbol = scope.value.symbols.get(name);
			if (symbol) {
				return has(symbol);
			}

			return hasNot();
		}

		return hasNot();
	}

	private lookupScope(name: string): Maybe<Scope> {
		if (this.symbols.has(name)) {
			return has(this);
		}

		if (this.parent.has()) {
			return this.parent.value.lookupScope(name);
		}

		return hasNot();
	}

	/**
	 * Override the default behavior when calling util.inspect()
	 */
	[util.inspect.custom](depth: number, options: util.InspectOptions): string {
		// we need to explicitly display the class name since it
		// disappears when using a custom inspect function.
		return `${this.name} ${util.inspect(this.symbols, options)} ${util.inspect(this.children, options)}`;
	}
}

export class SymbolTable {
	private root!: Scope;
	private currentScope: Maybe<Scope>;

	constructor(scopeName: string) {
		this.root = new Scope(scopeName, hasNot());
		this.currentScope = has(this.root);
	}

	public pushScope(name: string): Scope {
		const parent = this.currentScope;

		const newScope = new Scope(name, parent);
		parent.map((parent) => parent.children.push(newScope));

		this.currentScope = has(newScope);

		return newScope;
	}

	/** Update the current scope's name */
	public setScopeName(name: string): void {
		this.currentScope.map((value) => (value.name = name));
	}

	public popScope(): void {
		if (this.currentScope.has()) {
			this.currentScope = this.currentScope.value.parent;
		} else {
			this.currentScope = hasNot(); // at the top level
		}
	}

	/**
	 * Defines a symbol
	 *
	 * @param name Symbol name
	 * @param kind Symbol kind
	 * @param types Possible types
	 * @param value The value, if any
	 * @param inParent Defaulting to false, should the symbol be defined in the parent scope or the current scope?
	 */
	public define(
		name: string,
		kind: SymbolKind,
		types: SymbolTypes,
		value: unknown = undefined,
		inParent = false,
	): void {
		if (inParent && this.currentScope.has() && this.currentScope.value.parent.has()) {
			this.currentScope.value.parent.value.define(name, kind, types, value);
		} else {
			this.getCurrentScope().define(name, kind, types, value);
		}
	}

	public assignKind(name: string, symbolKind: SymbolKind): void {
		this.getCurrentScope().assignKind(name, symbolKind);
	}

	public appendTypes(name: string, symbolTypes: SymbolTypes): void {
		this.getCurrentScope().appendTypes(name, symbolTypes);
	}

	public lookup(name: string): Maybe<SymbolInfo> {
		return this.getCurrentScope().lookup(name);
	}

	private getCurrentScope(): Scope {
		if (this.currentScope.has()) {
			return this.currentScope.value;
		}

		// this in an interesting case. More research is
		// needed to determine if this could happen.
		return this.pushScope('unknown');
	}

	/**
	 * Override the default behavior when calling util.inspect()
	 */
	[util.inspect.custom](depth: number, options: util.InspectOptions): string {
		// we need to explicitly display the class name since it
		// disappears when using a custom inspect function.
		return `${this.constructor.name} ${util.inspect(this.currentScope.mustGetValue(), options)}`;
	}
}
