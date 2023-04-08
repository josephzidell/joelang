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

type SymbolKind = string;
type SymbolTypes = ASTType[];

// type Value = unknown;

type SymbolInfo = {
	kind: SymbolKind;
	types: SymbolTypes;
};

class Scope {
	private readonly symbols: Map<string, SymbolInfo> = new Map<string, SymbolInfo>();

	/** Child scopes */
	public readonly children: Scope[] = [];

	private _parent: Maybe<Scope>;
	public get parent(): Maybe<Scope> {
		return this._parent;
	}

	constructor(parent: Maybe<Scope>) {
		this._parent = parent;
	}

	public define(name: string, kind: SymbolKind = '', types: SymbolTypes = []): void {
		this.symbols.set(name, { kind, types });
	}

	public assignKind(name: string, symbolKind: SymbolKind): Result<boolean> {
		const scope = this.lookupScope(name);
		if (scope.has()) {
			const symbol = scope.value.lookup(name);
			if (symbol.outcome === 'error') {
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
			if (symbol.outcome === 'error') {
				return error(new Error(`Undefined variable: ${name}`));
			}

			symbol.value.types.push(...symbolTypes);
			scope.value.symbols.set(name, symbol.value);
			return ok(true);
		}

		return error(new Error(`Undefined variable: ${name}`));
	}

	public lookup(name: string): Result<SymbolInfo> {
		const scope = this.lookupScope(name);
		if (scope.has()) {
			const symbol = scope.value.symbols.get(name);
			if (symbol) {
				return ok(symbol);
			}

			return error(new Error(`Undefined variable: ${name}`));
		}

		return error(new Error(`Undefined variable: ${name}`));
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
		return `${this._parent.has() ? this._parent.value : 'global'} ${this.constructor.name} ${util.inspect(
			this.symbols,
			options,
		)} ${util.inspect(this.children, options)}`;
	}
}

export class SymbolTable {
	private currentScope: Maybe<Scope>;

	constructor() {
		this.currentScope = has(new Scope(hasNot()));
	}

	public pushScope(): Scope {
		const parent = this.currentScope;

		const newScope = new Scope(parent);
		parent.map((parent) => parent.children.push(newScope));

		this.currentScope = has(newScope);

		return newScope;
	}

	public popScope(): void {
		if (this.currentScope.has()) {
			this.currentScope = this.currentScope.value.parent;
		} else {
			this.currentScope = hasNot(); // at the top level
		}
	}

	public define(name: string, kind: SymbolKind = '', types: SymbolTypes = []): void {
		this.getCurrentScope().define(name, kind, types);
	}

	public assignKind(name: string, symbolKind: SymbolKind): void {
		this.getCurrentScope().assignKind(name, symbolKind);
	}

	public appendTypes(name: string, symbolTypes: SymbolTypes): void {
		this.getCurrentScope().appendTypes(name, symbolTypes);
	}

	public lookup(name: string): Result<SymbolInfo> {
		return this.getCurrentScope().lookup(name);
	}

	private getCurrentScope(): Scope {
		if (this.currentScope.has()) {
			return this.currentScope.value;
		}

		return this.pushScope();
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
