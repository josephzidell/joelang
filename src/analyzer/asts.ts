/**
 * This fils contains all the AST classes.
 */

import util from 'util';
import { patterns } from '../lexer/types';
import { NumberSize } from '../shared/numbers/sizes';
import { smallestNumberSize } from '../shared/numbers/utils';
import { Pos } from '../shared/pos';
import { ok, Result } from '../shared/result';
import { when } from '../shared/when';
import { ClassSym, EnumSym, FuncSym, InterfaceSym, ParamSym, VarSym } from './symbolTable';

export interface ASTThatHasJoeDoc {
	joeDoc: ASTJoeDoc | undefined;
}

export interface ASTThatHasModifiers {
	modifiers: ASTModifier[];
}

export interface ASTThatHasRequiredBody {
	body: ASTBlockStatement;
}

export interface ASTThatHasTypeParams {
	typeParams: ASTTypeList<ASTTypeParameter>;
}

export abstract class AST {
	abstract kind: string;

	/** Positional information for an AST */
	readonly pos: Pos;

	/** Parent AST */
	parent: AST | undefined;

	/** A string representation of the node */
	abstract toString(): string;

	/** This constructor will be called through each instated class */
	constructor(pos: Pos, parent: AST | undefined) {
		this.pos = pos;
		this.parent = parent;
	}

	/** Sets a child's parent AST as this, and returns the child */
	setChildsParent<T extends AST>(child: T): T {
		child.parent = this;

		return child;
	}

	/** Sets childrens' parent ASTs as this, and returns the children */
	setChildrensParent<T extends AST>(children: T[]): T[] {
		return children.map((child) => this.setChildsParent(child));
	}

	/**
	 * Override the default behavior when calling util.inspect()
	 * and don't display the `kind` property. It is only necessary
	 * for JSON serialization since the class name isn't there.
	 */
	[util.inspect.custom](_depth: number, options: util.InspectOptions): string {
		// do not display the `kind` property because it adds useless noise
		// or the `parent` property since it adds infinite recursion

		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { kind, parent, ...rest } = this;

		// we need to explicitly display the class name since it
		// disappears when using a custom inspect function.
		return `${this.constructor.name} ${util.inspect(rest, options)}`;
	}
}

/**
 * Special type representing an array of `ASTType`s
 * for the `extends` clause of a class or interface.
 */
export class ASTTypeList<T extends ASTType> extends AST {
	kind = 'List';
	items: T[] = [];

	// factory function
	static _<T extends ASTType>(items: T[], pos: Pos): ASTTypeList<T> {
		// since this is a special type, we don't need the parent AST
		const ast = new ASTTypeList<T>(pos, undefined);
		ast.items = items;
		return ast;
	}

	static empty<T extends ASTType>(pos: Pos): ASTTypeList<T> {
		return this._([], pos);
	}

	static wrapArray<T extends ASTType>(items: ASTTypeList<T> | T[], posIfListIsEmpty: Pos): ASTTypeList<T> {
		if (Array.isArray(items)) {
			const ast = new ASTTypeList<T>(items.length > 0 ? items[0].pos : posIfListIsEmpty, undefined);
			ast.items = items;
			return ast;
		}

		return items;
	}

	toString(): string {
		return this.items.map((item) => item.toString()).join(', ');
	}
}

export abstract class ASTDeclaration
	extends AST
	implements ASTThatHasJoeDoc, ASTThatHasModifiers, ASTThatHasRequiredBody, ASTThatHasTypeParams
{
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	name!: ASTIdentifier;
	typeParams!: ASTTypeList<ASTTypeParameter>;
	extends!: ASTTypeList<ASTExtOrImpl>;
	body!: ASTBlockStatement;
}

export class ASTArgumentsList extends AST {
	kind = 'ArgumentsList';
	args: AssignableASTs[] = []; // usually this is empty and thus undefined, but the parser ensures it's an array, so we mimic that here

	// factory function
	static _(args: AssignableASTs[], pos: Pos, parent: AST): ASTArgumentsList {
		const ast = new ASTArgumentsList(pos, parent);
		ast.args = args;
		return ast;
	}

	toString(): string {
		return this.args.map((arg) => arg.toString()).join(', ');
	}
}

export class ASTArrayExpression<T extends AssignableASTs> extends AST {
	kind = 'ArrayExpression';
	items: Array<T | ASTPostfixIfStatement> = []; // usually this would be empty and thus undefined, but the parser ensures it's an array, so we mimic that here
	/** The type, usually inferred from the initial value, if any, or from context */
	type!: ASTType;

	// factory function
	static _<T extends AssignableASTs>(
		{
			items,
			type,
		}: {
			items: Array<T | ASTPostfixIfStatement>;
			type: ASTType;
		},
		pos: Pos,
		parent: AST,
	): ASTArrayExpression<T> {
		const ast = new ASTArrayExpression<T>(pos, parent);
		ast.items = items;
		ast.type = type;
		return ast;
	}

	toString(): string {
		return `[${this.items.map((item) => item.toString()).join(', ')}]`;
	}
}

export class ASTArrayOf extends AST {
	kind = 'ArrayOf';
	type!: ASTType;

	// factory function
	static _(type: ASTType, pos: Pos, parent: AST): ASTArrayOf {
		const ast = new ASTArrayOf(pos, parent);
		ast.type = type;
		return ast;
	}

	toString(): string {
		return `${this.type.toString()}[]`;
	}
}

export class ASTAssignmentExpression extends AST {
	kind = 'AssignmentExpression';
	left: Array<ASTIdentifier | ASTMemberExpression> = [];
	right: AssignableASTs[] = [];

	// factory function
	static _(
		{
			left,
			right,
		}: {
			left: Array<ASTIdentifier | ASTMemberExpression>;
			right: AssignableASTs[];
		},
		pos: Pos,
		parent: AST,
	): ASTAssignmentExpression {
		const ast = new ASTAssignmentExpression(pos, parent);
		ast.left = left;
		ast.right = right;
		return ast;
	}

	toString(): string {
		return `${this.left.map((l) => l.toString()).join(', ')} = ${this.right.map((r) => r.toString()).join(', ')}`;
	}
}

export class ASTBinaryExpression<L extends ExpressionASTs, R extends ExpressionASTs> extends AST {
	kind = 'BinaryExpression';
	operator!: string;
	left!: L;
	right!: R;

	// factory function
	static _<L extends ExpressionASTs, R extends ExpressionASTs>(
		{
			operator,
			left,
			right,
		}: {
			operator: string;
			left: L;
			right: R;
		},
		pos: Pos,
		parent: AST,
	): ASTBinaryExpression<L, R> {
		const ast = new ASTBinaryExpression<L, R>(pos, parent);
		ast.operator = operator;
		ast.left = left;
		ast.right = right;
		return ast;
	}

	toString(): string {
		return `${this.left.toString()} ${this.operator} ${this.right.toString()}`;
	}
}

export class ASTBlockStatement extends AST {
	kind = 'BlockStatement';
	expressions: AST[] = [];

	// factory function
	static _(expressions: AST[], pos: Pos, parent: AST): ASTBlockStatement {
		const ast = new ASTBlockStatement(pos, parent);
		ast.expressions = ast.setChildrensParent(expressions);
		return ast;
	}

	toString(): string {
		return `{${this.expressions.map((expr) => expr.toString()).join('\n')}}`;
	}
}

export class ASTBoolLiteral extends AST {
	kind = 'BoolLiteral';
	value!: boolean | ASTUnaryExpression<boolean>;

	// factory function
	static _(value: boolean | ASTUnaryExpression<boolean>, pos: Pos, parent: AST): ASTBoolLiteral {
		const ast = new ASTBoolLiteral(pos, parent);
		ast.value = value;
		return ast;
	}

	toString(): string {
		return this.value.toString(); // this works for a boolean as well as an ASTUnaryExpression<boolean>
	}
}

export class ASTCallExpression extends AST {
	kind = 'CallExpression';
	callee!: CallableASTs;
	typeArgs!: ASTType[];
	args!: ExpressionASTs[];

	// factory function
	static _(
		{
			callee,
			typeArgs,
			args,
		}: {
			callee: CallableASTs;
			typeArgs: ASTType[];
			args: ExpressionASTs[];
		},
		pos: Pos,
		parent: AST,
	): ASTCallExpression {
		const ast = new ASTCallExpression(pos, parent);
		ast.callee = callee;

		if (typeArgs) {
			ast.typeArgs = typeArgs;
		}

		ast.args = args;
		return ast;
	}

	toString(): string {
		const typeArgsString = this.typeArgs.length > 0 ? `<| ${this.typeArgs.map((typeArg) => typeArg.toString()).join(', ')} |>` : '';

		return `${this.callee.toString()}${typeArgsString}(${this.args.map((arg) => arg.toString()).join(', ')})`;
	}
}

export class ASTClassDeclaration extends ASTDeclaration {
	kind = 'ClassDeclaration';
	implements!: ASTTypeList<ASTExtOrImpl>;
	/** The ClassSym in the SymbolTable */
	symbol: ClassSym | undefined;

	// factory function
	static _(
		{
			joeDoc,
			modifiers,
			name,
			typeParams,
			extends: _extends,
			implements: _implements,
			body,
		}: {
			joeDoc?: ASTJoeDoc;
			modifiers: ASTModifier[];
			name: ASTIdentifier;
			typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[];
			extends: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[];
			implements: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[];
			body: ASTBlockStatement;
		},
		pos: Pos,
		parent: AST,
	): ASTClassDeclaration {
		const ast = new ASTClassDeclaration(pos, parent);

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.name = ast.setChildsParent(name);
		ast.typeParams = ASTTypeList.wrapArray(typeParams, pos);
		ast.extends = ASTTypeList.wrapArray(_extends, pos);
		ast.implements = ASTTypeList.wrapArray(_implements, pos);
		ast.body = ast.setChildsParent(body);

		// update FQNs
		ast.updateFqns();

		return ast;
	}

	public updateFqns() {
		this.body.expressions.forEach((expr) => {
			if (expr instanceof ASTFunctionDeclaration) {
				expr.name.setAbsoluteFqn(`${this.name.fqn}.`);
				expr.updateFqns();
			}
		});
	}

	toString(): string {
		const modifiersString = this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const typeParamsString =
			this.typeParams.items.length > 0 ? `<| ${this.typeParams.items.map((typeParam) => typeParam.toString()).join(', ')} |>` : '';
		const extendsString =
			this.extends.items.length > 0 ? ` extends ${this.extends.items.map((extend) => extend.toString()).join(', ')}` : '';
		const implementsString =
			this.implements.items.length > 0
				? ` implements ${this.implements.items.map((implement) => implement.toString()).join(', ')}`
				: '';

		return `${modifiersString}class ${this.name.toString()}${typeParamsString}${extendsString}${implementsString}{...}`;
	}
}

export class ASTDoneStatement extends AST {
	kind = 'DoneStatement';

	// factory function
	static _(pos: Pos, parent: AST): ASTDoneStatement {
		return new ASTDoneStatement(pos, parent);
	}

	toString(): string {
		return 'done';
	}
}

export class ASTEnumDeclaration extends ASTDeclaration {
	kind = 'EnumDeclaration';
	/** The EnumSym in the SymbolTable */
	symbol: EnumSym | undefined;

	// factory function
	static _(
		{
			joeDoc,
			modifiers,
			name,
			typeParams,
			extends: _extends,
			body,
		}: {
			joeDoc?: ASTJoeDoc;
			modifiers: ASTModifier[];
			name: ASTIdentifier;
			typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[];
			extends: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[];
			body: ASTBlockStatement;
		},
		pos: Pos,
		parent: AST,
	): ASTEnumDeclaration {
		const ast = new ASTEnumDeclaration(pos, parent);

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.name = ast.setChildsParent(name);
		ast.typeParams = ASTTypeList.wrapArray(typeParams, pos);
		ast.extends = ASTTypeList.wrapArray(_extends, pos);
		ast.body = body;
		return ast;
	}

	toString(): string {
		const modifiersString = this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const typeParamsString =
			this.typeParams.items.length > 0 ? `<| ${this.typeParams.items.map((typeParam) => typeParam.toString()).join(', ')} |>` : '';
		const extendsString =
			this.extends.items.length > 0 ? ` extends ${this.extends.items.map((extend) => extend.toString()).join(', ')}` : '';

		return `${modifiersString}enum ${this.name.toString()}${typeParamsString}${extendsString}{...}`;
	}
}

export class ASTForStatement extends AST implements ASTThatHasRequiredBody {
	kind = 'ForStatement';
	initializer!: ASTIdentifier | ASTVariableDeclaration;
	iterable!: IterableASTs;
	body!: ASTBlockStatement;

	// factory function
	static _(
		{
			initializer,
			iterable,
			body,
		}: {
			initializer: ASTIdentifier | ASTVariableDeclaration;
			iterable: IterableASTs;
			body: ASTBlockStatement;
		},
		pos: Pos,
		parent: AST,
	): ASTForStatement {
		const ast = new ASTForStatement(pos, parent);
		ast.initializer = initializer;
		ast.iterable = iterable;
		ast.body = body;
		return ast;
	}

	toString(): string {
		return `for (${this.initializer.toString()} in ${this.iterable.toString()}) {...}`;
	}
}

export class ASTFunctionDeclaration extends AST implements ASTThatHasJoeDoc, ASTThatHasModifiers, ASTThatHasTypeParams {
	static readonly AnonRegex = /#f_anon__\d{1,6}/;

	kind = 'FunctionDeclaration';
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	name!: ASTIdentifier;
	typeParams!: ASTTypeList<ASTTypeParameter>;
	params!: ASTTypeList<ASTParameter>;
	returnTypes!: ASTTypeList<ASTType>;
	body: ASTBlockStatement | undefined = undefined;
	/** The FuncSym in the SymbolTable */
	symbol: FuncSym | undefined;

	// factory function
	static _(
		{
			joeDoc,
			modifiers,
			name,
			typeParams,
			params,
			returnTypes,
			body,
		}: {
			joeDoc?: ASTJoeDoc;
			modifiers: ASTModifier[];
			name: ASTIdentifier;
			typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[];
			params: ASTTypeList<ASTParameter> | ASTParameter[];
			returnTypes: ASTTypeList<ASTType> | ASTType[];
			body: ASTBlockStatement | undefined;
		},
		pos: Pos,
		parent: AST,
	): ASTFunctionDeclaration {
		const ast = new ASTFunctionDeclaration(pos, parent);

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.name = ast.setChildsParent(name);
		ast.typeParams = ASTTypeList.wrapArray(typeParams, pos);
		ast.params = ASTTypeList.wrapArray(params, pos);
		ast.returnTypes = ASTTypeList.wrapArray(returnTypes, pos);
		ast.body = body;

		// update FQNs
		ast.updateFqns();

		return ast;
	}

	public updateFqns() {
		this.params.items.forEach((expr) => {
			if (expr instanceof ASTParameter) {
				expr.name.setAbsoluteFqn(`${this.name.fqn}.`);
			}
		});
	}

	toString(): string {
		const modifiersString = this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const nameString = this.name.name.includes('#f_anon_') ? '' : this.name.toString();
		const typeParamsString =
			this.typeParams.items.length > 0 ? `<| ${this.typeParams.items.map((typeParam) => typeParam.toString()).join(', ')} |>` : '';
		const paramsString = this.params.items.length > 0 ? `(${this.params.items.map((param) => param.toString()).join(', ')})` : '()';
		const returnTypesString =
			this.returnTypes.items.length > 0 ? ` -> ${this.returnTypes.items.map((returnType) => returnType.toString()).join(', ')}` : '';

		return `${modifiersString}f ${nameString}${typeParamsString}${paramsString}${returnTypesString}{...}`;
	}
}

export class ASTFunctionSignature extends AST implements ASTThatHasTypeParams {
	kind = 'FunctionSignature';
	typeParams!: ASTTypeList<ASTTypeParameter>;
	params!: ASTTypeList<ASTParameter>;
	returnTypes!: ASTTypeList<ASTType>;

	// factory function
	static _(
		{
			typeParams,
			params,
			returnTypes,
		}: {
			typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[];
			params: ASTTypeList<ASTParameter> | ASTParameter[];
			returnTypes: ASTTypeList<ASTType> | ASTType[];
		},
		pos: Pos,
		parent: AST,
	): ASTFunctionSignature {
		const ast = new ASTFunctionSignature(pos, parent);

		ast.typeParams = ASTTypeList.wrapArray(typeParams, pos);
		ast.params = ASTTypeList.wrapArray(params, pos);
		ast.returnTypes = ASTTypeList.wrapArray(returnTypes, pos);

		return ast;
	}

	toString(): string {
		const typeParamsString =
			this.typeParams.items.length > 0 ? `<| ${this.typeParams.items.map((typeParam) => typeParam.toString()).join(', ')} |>` : '';
		const paramsString = this.params.items.length > 0 ? `(${this.params.items.map((param) => param.toString()).join(', ')})` : '()';
		const returnTypesString =
			this.returnTypes.items.length > 0 ? ` -> ${this.returnTypes.items.map((returnType) => returnType.toString()).join(', ')}` : '';

		return `f ${typeParamsString}${paramsString}${returnTypesString}`;
	}
}

export class ASTIdentifier extends AST {
	kind = 'Identifier';
	name!: string;
	/** The fully qualified name */
	fqn!: string;

	/**
	 * factory function
	 *
	 * fqn is optional, but if it's not provided, it will be set to name
	 */
	static _(name: string, pos: Pos, parent: AST, fqn?: string): ASTIdentifier {
		const ast = new ASTIdentifier(pos, parent);
		ast.name = name;
		ast.fqn = fqn || name; // begin with a simple copy
		return ast;
	}

	/**
	 * Prepends a new parent to the fqn.
	 *
	 * Eg:
	 * ```ts
	 * // existing fqn: 'C.D'
	 * prependParentToFqn('B.')
	 * // updated fqn: 'B.C.D'
	 * ```
	 */
	prependParentToFqn(newParentWithTrailingDot: string) {
		// ignore if it's empty
		if (newParentWithTrailingDot.length > 1) {
			this.fqn = `${newParentWithTrailingDot}${this.fqn}`;
		}
	}

	/**
	 * Overrides and resets the fqn to the given value with the name.
	 *
	 * Eg:
	 * ```ts
	 * // existing name: 'foo'
	 * // existing fqn: 'C.foo'
	 * setAbsoluteFqn('B.C.')
	 * // updated fqn: 'B.C.foo'
	 * ```
	 */
	setAbsoluteFqn(fqnWithTrailingDot: string) {
		// ignore if it's empty
		if (fqnWithTrailingDot.length > 1) {
			this.fqn = `${fqnWithTrailingDot}${this.name}`;
		}
	}

	toString(): string {
		return this.name;
	}
}

export class ASTIfStatement extends AST {
	kind = 'IfStatement';
	test!: ExpressionASTs;
	consequent!: ASTBlockStatement;
	alternate?: ASTBlockStatement | ASTIfStatement = undefined;

	// factory function
	static _(
		{
			test,
			consequent,
			alternate,
		}: {
			test: ExpressionASTs;
			consequent: ASTBlockStatement;
			alternate?: ASTBlockStatement | ASTIfStatement;
		},
		pos: Pos,
		parent: AST,
	): ASTIfStatement {
		const ast = new ASTIfStatement(pos, parent);
		ast.test = test;
		ast.consequent = consequent;

		// only set if it's not undefined
		if (alternate) {
			ast.alternate = alternate;
		}

		return ast;
	}

	toString(): string {
		const alternateString = this.alternate ? ` else {...}` : '';

		return `if ${this.test.toString()} {...}${alternateString}`;
	}
}

export class ASTInterfaceDeclaration extends ASTDeclaration {
	kind = 'InterfaceDeclaration';
	/** The InterfaceSym in the SymbolTable */
	symbol: InterfaceSym | undefined;

	// factory function
	static _(
		{
			joeDoc,
			modifiers,
			name,
			typeParams,
			extends: _extends,
			body,
		}: {
			joeDoc?: ASTJoeDoc;
			modifiers: ASTModifier[];
			name: ASTIdentifier;
			typeParams: ASTTypeList<ASTTypeParameter> | ASTTypeParameter[];
			extends: ASTTypeList<ASTExtOrImpl> | ASTExtOrImpl[];
			body: ASTBlockStatement;
		},
		pos: Pos,
		parent: AST,
	): ASTInterfaceDeclaration {
		const ast = new ASTInterfaceDeclaration(pos, parent);

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.name = ast.setChildsParent(name);
		ast.typeParams = ASTTypeList.wrapArray(typeParams, pos);
		ast.extends = ASTTypeList.wrapArray(_extends, pos);
		ast.body = body;
		return ast;
	}

	toString(): string {
		const modifiersString = this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const typeParamsString =
			this.typeParams.items.length > 0 ? `<| ${this.typeParams.items.map((typeParam) => typeParam.toString()).join(', ')} |>` : '';
		const extendsString =
			this.extends.items.length > 0 ? ` extends ${this.extends.items.map((extend) => extend.toString()).join(', ')}` : '';

		return `${modifiersString}interface ${this.name.toString()}${typeParamsString}${extendsString} {...}`;
	}
}

export class ASTJoeDoc extends AST {
	kind = 'JoeDoc';
	content?: string = undefined; // TODO parse into parts

	// factory function
	static _(content: string | undefined, pos: Pos, parent: AST): ASTJoeDoc {
		const ast = new ASTJoeDoc(pos, parent);
		ast.content = content;
		return ast;
	}

	toString(): string {
		return `/** ${this.content} */`;
	}
}

export class ASTLoopStatement extends AST {
	kind = 'LoopStatement';
	body!: ASTBlockStatement;

	// factory function
	static _({ body }: { body: ASTBlockStatement }, pos: Pos, parent: AST): ASTLoopStatement {
		const ast = new ASTLoopStatement(pos, parent);
		ast.body = body;
		return ast;
	}

	toString(): string {
		return `loop {...}`;
	}
}

export class ASTMemberExpression extends AST {
	kind = 'MemberExpression';
	object!: MemberExpressionObjectASTs;
	property!: MemberExpressionPropertyASTs;

	// factory function
	static _(
		{
			object,
			property,
		}: {
			object: MemberExpressionObjectASTs;
			property: MemberExpressionPropertyASTs;
		},
		pos: Pos,
		parent: AST,
	): ASTMemberExpression {
		const ast = new ASTMemberExpression(pos, parent);
		ast.object = object;
		ast.property = property;
		return ast;
	}

	toString(): string {
		const propertyString = this.property.toString();

		// if the property begins with a number use brackets, otherwise use dot notation
		if (/^\d/.test(propertyString)) {
			return `${this.object.toString()}[${propertyString}]`;
		}

		return `${this.object.toString()}.${propertyString}`;
	}
}

export class ASTMemberListExpression extends AST {
	kind = 'MemberListExpression';
	object!: MemberExpressionObjectASTs;
	properties: MemberExpressionPropertyASTs[] = [];

	// factory function
	static _(
		{
			object,
			properties,
		}: {
			object: MemberExpressionObjectASTs;
			properties: MemberExpressionPropertyASTs[];
		},
		pos: Pos,
		parent: AST,
	): ASTMemberListExpression {
		const ast = new ASTMemberListExpression(pos, parent);
		ast.object = object;
		ast.properties = properties;
		return ast;
	}

	toString(): string {
		return `${this.object.toString()}[${this.properties.map((property) => property.toString()).join(', ')}]`;
	}
}

export class ASTModifier extends AST {
	kind = 'Modifier';
	keyword!: string;

	// factory function
	static _(keyword: string, pos: Pos, parent: AST): ASTModifier {
		const ast = new ASTModifier(pos, parent);
		ast.keyword = keyword;
		return ast;
	}

	toString(): string {
		return this.keyword;
	}
}

export class ASTNextStatement extends AST {
	kind = 'NextStatement';

	// factory function
	static _(pos: Pos, parent: AST): ASTNextStatement {
		return new ASTNextStatement(pos, parent);
	}

	toString(): string {
		return 'next';
	}
}

export class ASTNumberLiteral extends AST {
	kind = 'NumberLiteral';
	value!: number | ASTUnaryExpression<number>;
	size!: NumberSize;

	/**
	 * Factory function
	 *
	 * @param value Number or UnaryExpression with a number
	 * @param size NumberSize
	 * @param pos Position in the source code
	 * @returns
	 */
	static _(value: number | ASTUnaryExpression<number>, size: NumberSize, pos: Pos, parent: AST): ASTNumberLiteral {
		const ast = new ASTNumberLiteral(pos, parent);
		ast.value = value;
		ast.size = size;
		return ast;
	}

	/** eg convertNumberValueTo('5') // ASTNumberLiteral */
	static convertNumberValueTo<E extends Error>(
		value: string,
		pos: Pos,
		parent: AST,
		errFn: (value: string) => E,
	): Result<ASTNumberLiteral, E> {
		let size: NumberSize | undefined;

		// eslint-disable-next-line no-useless-escape
		const pieces = value.split(/\_/g);

		// check if there's a size suffix
		if (patterns.NUMBER_TYPE_SUFFIXES.test(value)) {
			// it has a declared size
			size = pieces.pop() as NumberSize;
		} else {
			// no declared size
			size = undefined;

			// get the smallest relevant size
			const sizeResult = smallestNumberSize<E>(value, errFn);
			if (sizeResult.isError()) {
				return sizeResult;
			}

			// set the smallest size as the declared size
			size = sizeResult.value;
		}

		// put value back together without underscores (and without the suffix)
		value = pieces.join('');

		// decimal
		if (value.includes('.')) {
			return ok(ASTNumberLiteral._(parseFloat(value), size, pos, parent));
		}

		return ok(ASTNumberLiteral._(parseInt(value), size, pos, parent));
	}

	toString(): string {
		return `${this.value.toString()}${this.size ? `_${this.size}` : ''}`;
	}
}

export class ASTObjectExpression extends AST {
	kind = 'ObjectExpression';
	properties!: ASTProperty[];

	// factory function
	static _(properties: ASTProperty[], pos: Pos, parent: AST): ASTObjectExpression {
		const ast = new ASTObjectExpression(pos, parent);
		ast.properties = properties;
		return ast;
	}

	toString(): string {
		return `{${this.properties.map((property) => property.toString()).join(', ')}}`;
	}
}

export class ASTObjectShape extends AST {
	kind = 'ObjectShape';
	properties: ASTPropertyShape[] = [];

	// factory function
	static _(properties: ASTPropertyShape[], pos: Pos, parent: AST): ASTObjectShape {
		const ast = new ASTObjectShape(pos, parent);
		ast.properties = properties;
		return ast;
	}

	toString(): string {
		return `{${this.properties.map((property) => property.toString()).join(', ')}}`;
	}
}

export class ASTProperty extends AST {
	kind = 'Property';
	key!: ASTIdentifier;
	value!: AssignableASTs;

	// factory function
	static _(key: ASTIdentifier, value: AssignableASTs, pos: Pos, parent: AST): ASTProperty {
		const ast = new ASTProperty(pos, parent);
		ast.key = key;
		ast.value = value;
		return ast;
	}

	toString(): string {
		return `${this.key.toString()}: ${this.value.toString()}`;
	}
}

export class ASTPropertyShape extends AST {
	kind = 'PropertyShape';
	key!: ASTIdentifier;
	type!: ASTType;

	// factory function
	static _(key: ASTIdentifier, type: ASTType, pos: Pos, parent: AST): ASTPropertyShape {
		const ast = new ASTPropertyShape(pos, parent);
		ast.key = key;
		ast.type = type;
		return ast;
	}

	toString(): string {
		return `${this.key.toString()}: ${this.type.toString()}`;
	}
}

export class ASTParameter extends AST {
	kind = 'Parameter';
	modifiers: ASTModifier[] = [];
	isRest = false;
	name!: ASTIdentifier;
	type!: ASTType;
	defaultValue?: AssignableASTs;
	/** The ParamSym in the SymbolTable */
	symbol: ParamSym | undefined;

	// factory function
	static _(
		{
			modifiers,
			isRest,
			name,
			type,
			defaultValue,
		}: {
			modifiers: ASTModifier[];
			isRest: boolean;
			name: ASTIdentifier;
			type: ASTType;
			defaultValue?: AssignableASTs;
		},
		pos: Pos,
		parent: AST,
	): ASTParameter {
		const ast = new ASTParameter(pos, parent);
		ast.modifiers = modifiers;
		ast.isRest = isRest;
		ast.name = ast.setChildsParent(name);
		ast.type = type;

		// only set if it's not undefined
		if (typeof defaultValue !== 'undefined') {
			ast.defaultValue = defaultValue;
		}

		return ast;
	}

	toString(): string {
		const modifiersString = this.modifiers.length > 0 ? this.modifiers.map((modifier) => `${modifier.toString()} `).join() : '';
		const restString = this.isRest ? '...' : '';
		const typeString = `: ${this.type.toString()}`;
		const defaultValueString = this.defaultValue ? ` = ${this.defaultValue.toString()}` : '';

		return `${modifiersString}${restString}${this.name.toString()}${typeString}${defaultValueString}`;
	}
}

export class ASTPath extends AST {
	kind = 'Path';
	absolute!: boolean;
	path!: string;
	isDir!: boolean;

	// factory function
	static _({ absolute, path, isDir }: { absolute: boolean; path: string; isDir: boolean }, pos: Pos, parent: AST): ASTPath {
		const ast = new ASTPath(pos, parent);
		ast.absolute = absolute;
		ast.path = path;
		ast.isDir = isDir;
		return ast;
	}

	toString(): string {
		return this.path;
	}
}

export class ASTPostfixIfStatement extends AST {
	kind = 'PostfixIfStatement';
	expression!: ExpressionASTs;
	test!: ExpressionASTs;

	// factory function
	static _({ expression, test }: { expression: ExpressionASTs; test: ExpressionASTs }, pos: Pos, parent: AST): ASTPostfixIfStatement {
		const ast = new ASTPostfixIfStatement(pos, parent);
		ast.expression = expression;
		ast.test = test;
		return ast;
	}

	toString(): string {
		return `${this.expression.toString()} if ${this.test.toString()}`;
	}
}

export class ASTPrintStatement extends AST {
	kind = 'PrintStatement';
	expressions: ExpressionASTs[] = [];

	// factory function
	static _(expressions: ExpressionASTs[], pos: Pos, parent: AST): ASTPrintStatement {
		const ast = new ASTPrintStatement(pos, parent);
		ast.expressions = expressions;
		return ast;
	}

	toString(): string {
		return `print ${this.expressions.map((expression) => expression.toString()).join(', ')}`;
	}
}

/** It's just a kind of BlockStatement */
export class ASTProgram extends AST {
	kind = 'Program';
	declarations: AST[] = [];

	// factory function
	static _({ declarations }: { declarations: AST[] }, pos: Pos): ASTProgram {
		const ast = new ASTProgram(pos, undefined);

		ast.declarations = declarations;

		return ast;
	}

	toString(): string {
		return this.declarations.map((declaration) => declaration.toString()).join('\n');
	}
}

export class ASTRangeExpression extends AST {
	kind = 'RangeExpression';
	lower!: RangeBoundASTs;
	upper!: RangeBoundASTs;

	// factory function
	static _({ lower, upper }: { lower: RangeBoundASTs; upper: RangeBoundASTs }, pos: Pos, parent: AST): ASTRangeExpression {
		const ast = new ASTRangeExpression(pos, parent);
		ast.lower = lower;
		ast.upper = upper;
		return ast;
	}

	toString(): string {
		return `${this.lower.toString()} .. ${this.upper.toString()}`;
	}
}

export class ASTRegularExpression extends AST {
	kind = 'RegularExpression';
	pattern!: string;
	flags!: string[];

	// factory function
	static _({ pattern, flags }: { pattern: string; flags: string[] }, pos: Pos, parent: AST): ASTRegularExpression {
		const ast = new ASTRegularExpression(pos, parent);
		ast.pattern = pattern;
		ast.flags = flags;
		return ast;
	}

	toString(): string {
		return `${this.pattern}${this.flags.join('')}`;
	}
}

export class ASTRestElement extends AST {
	kind = 'RestElement';
	// factory function
	static _(pos: Pos, parent: AST): ASTRestElement {
		return new ASTRestElement(pos, parent);
	}

	toString(): string {
		return '...';
	}
}

export class ASTReturnStatement extends AST {
	kind = 'ReturnStatement';
	expressions: AssignableASTs[] = [];

	// factory function
	static _(expressions: AssignableASTs[], pos: Pos, parent: AST): ASTReturnStatement {
		const ast = new ASTReturnStatement(pos, parent);
		ast.expressions = expressions;

		// set the parent of all children. This is necessary since the
		// ASTReturnStatement and its children are created at the same time
		ast.expressions.forEach((expr) => {
			expr.parent = ast;
		});

		return ast;
	}

	toString(): string {
		return `return ${this.expressions.map((expression) => expression.toString()).join(', ')}`;
	}
}

export class ASTStringLiteral extends AST {
	kind = 'StringLiteral';
	value!: string;

	// factory function
	static _(value: string, pos: Pos, parent: AST): ASTStringLiteral {
		const ast = new ASTStringLiteral(pos, parent);
		ast.value = value;
		return ast;
	}

	toString(): string {
		return `"${this.value}"`; // TODO capture original quote style
	}
}

export class ASTTernaryAlternate<T extends AssignableASTs> extends AST {
	kind = 'TernaryAlternate';
	value!: T;

	// factory function
	static _<T extends AssignableASTs>(expression: T, pos: Pos, parent: AST): ASTTernaryAlternate<T> {
		const ast = new ASTTernaryAlternate<T>(pos, parent);
		ast.value = expression;
		return ast;
	}

	toString(): string {
		return this.value.toString();
	}
}

export class ASTTernaryCondition extends AST {
	kind = 'TernaryCondition';
	expression!: ExpressionASTs;

	// factory function
	static _(expression: ExpressionASTs, pos: Pos, parent: AST): ASTTernaryCondition {
		const ast = new ASTTernaryCondition(pos, parent);
		ast.expression = expression;
		return ast;
	}

	toString(): string {
		return this.expression.toString();
	}
}

export class ASTTernaryConsequent<T extends AssignableASTs> extends AST {
	kind = 'TernaryConsequent';
	value!: T;

	// factory function
	static _<T extends AssignableASTs>(expression: T, pos: Pos, parent: AST): ASTTernaryConsequent<T> {
		const ast = new ASTTernaryConsequent<T>(pos, parent);
		ast.value = expression;
		return ast;
	}

	toString(): string {
		return this.value.toString();
	}
}

export class ASTTernaryExpression<C extends AssignableASTs, A extends AssignableASTs> extends AST {
	kind = 'TernaryExpression';
	test!: ASTTernaryCondition;
	consequent!: ASTTernaryConsequent<C>;
	alternate!: ASTTernaryAlternate<A>;

	// factory function
	static _<C extends AssignableASTs, A extends AssignableASTs>(
		{
			test,
			consequent,
			alternate,
		}: {
			test: ASTTernaryCondition;
			consequent: ASTTernaryConsequent<C>;
			alternate: ASTTernaryAlternate<A>;
		},
		pos: Pos,
		parent: AST,
	): ASTTernaryExpression<C, A> {
		const ast = new ASTTernaryExpression<C, A>(pos, parent);
		ast.test = test;
		ast.consequent = consequent;
		ast.alternate = alternate;
		return ast;
	}

	toString(): string {
		return `${this.test.toString()} ? ${this.consequent.toString()} : ${this.alternate.toString()}`;
	}
}

export class ASTThisKeyword extends AST {
	kind = 'ThisKeyword';
	// factory function
	static _(pos: Pos, parent: AST): ASTThisKeyword {
		return new ASTThisKeyword(pos, parent);
	}

	toString(): string {
		return 'this';
	}
}

export class ASTTupleExpression extends AST {
	kind = 'TupleExpression';
	items: AssignableASTs[] = [];

	// factory function
	static _(items: AssignableASTs[], pos: Pos, parent: AST): ASTTupleExpression {
		const ast = new ASTTupleExpression(pos, parent);
		ast.items = items;
		return ast;
	}

	toString(): string {
		return `<${this.items.map((item) => item.toString()).join(', ')}>`;
	}
}

export class ASTTupleShape extends AST {
	kind = 'TupleShape';
	types!: ASTType[];

	// factory function
	static _(types: ASTType[], pos: Pos, parent: AST): ASTTupleShape {
		const ast = new ASTTupleShape(pos, parent);
		ast.types = types;
		return ast;
	}

	toString(): string {
		return `<${this.types.map((type) => type.toString()).join(', ')}>`;
	}
}

/** Begin ASTType */
export class ASTTypeInstantiationExpression extends AST {
	kind = 'TypeInstantiationExpression';
	base!: ASTIdentifier | ASTMemberExpression;
	typeArgs: ASTType[] = [];

	// factory function
	static _(
		{
			base,
			typeArgs,
		}: {
			base: ASTIdentifier | ASTMemberExpression;
			typeArgs: ASTType[];
		},
		pos: Pos,
		parent: AST,
	): ASTTypeInstantiationExpression {
		const ast = new ASTTypeInstantiationExpression(pos, parent);
		ast.base = base;
		ast.typeArgs = typeArgs;
		return ast;
	}

	toString(): string {
		return `${this.base.toString()}<| ${this.typeArgs.map((type) => type.toString()).join(', ')} |>`;
	}
}

export type primitiveAstType = 'bool' | 'path' | 'regex' | 'string';
export class ASTTypePrimitive extends AST {
	kind = 'TypePrimitive';
	type!: primitiveAstType;

	// factory function
	static _(type: primitiveAstType, pos: Pos, parent: AST): ASTTypePrimitive {
		const ast = new ASTTypePrimitive(pos, parent);
		ast.type = type;
		return ast;
	}

	toString(): string {
		return this.type;
	}
}
export function ASTTypePrimitiveBool(pos: Pos, parent: AST): ASTTypePrimitive {
	const ast = new ASTTypePrimitive(pos, parent);
	ast.type = 'bool';
	return ast;
}
export function ASTTypePrimitivePath(pos: Pos, parent: AST): ASTTypePrimitive {
	const ast = new ASTTypePrimitive(pos, parent);
	ast.type = 'path';
	return ast;
}
export function ASTTypePrimitiveRegex(pos: Pos, parent: AST): ASTTypePrimitive {
	const ast = new ASTTypePrimitive(pos, parent);
	ast.type = 'regex';
	return ast;
}
export function ASTTypePrimitiveString(pos: Pos, parent: AST): ASTTypePrimitive {
	const ast = new ASTTypePrimitive(pos, parent);
	ast.type = 'string';
	return ast;
}

export class ASTTypeNumber extends AST {
	kind = 'TypeNumber';
	size!: NumberSize;

	// factory function
	static _(size: NumberSize, pos: Pos, parent: AST): ASTTypeNumber {
		const ast = new ASTTypeNumber(pos, parent);
		ast.size = size;
		return ast;
	}

	toString(): string {
		return `number<${this.size}>`; // these angle brackets have no special meaning
	}
}

export const ASTTypeNumberInt8 = (pos: Pos, parent: AST) => ASTTypeNumber._('int8', pos, parent);
export const ASTTypeNumberInt16 = (pos: Pos, parent: AST) => ASTTypeNumber._('int16', pos, parent);
export const ASTTypeNumberInt32 = (pos: Pos, parent: AST) => ASTTypeNumber._('int32', pos, parent);
export const ASTTypeNumberInt64 = (pos: Pos, parent: AST) => ASTTypeNumber._('int64', pos, parent);
export const ASTTypeNumberUint8 = (pos: Pos, parent: AST) => ASTTypeNumber._('int8', pos, parent);
export const ASTTypeNumberUint16 = (pos: Pos, parent: AST) => ASTTypeNumber._('int16', pos, parent);
export const ASTTypeNumberUint32 = (pos: Pos, parent: AST) => ASTTypeNumber._('int32', pos, parent);
export const ASTTypeNumberUint64 = (pos: Pos, parent: AST) => ASTTypeNumber._('int64', pos, parent);
export const ASTTypeNumberDec32 = (pos: Pos, parent: AST) => ASTTypeNumber._('dec32', pos, parent);
export const ASTTypeNumberDec64 = (pos: Pos, parent: AST) => ASTTypeNumber._('dec64', pos, parent);

export const NumberSizesSignedIntASTs = [ASTTypeNumberInt8, ASTTypeNumberInt16, ASTTypeNumberInt32, ASTTypeNumberInt64] as const;
export const NumberSizesUnsignedIntASTs = [ASTTypeNumberUint8, ASTTypeNumberUint16, ASTTypeNumberUint32, ASTTypeNumberUint64] as const;
export const NumberSizesIntASTs = [...NumberSizesSignedIntASTs, ...NumberSizesUnsignedIntASTs] as const;
export const NumberSizesDecimalASTs = [ASTTypeNumberDec32, ASTTypeNumberDec64] as const;
export const NumberSizesAllASTs = [...NumberSizesIntASTs, ...NumberSizesDecimalASTs] as const;

export class ASTTypeRange extends AST {
	kind = 'TypeRange';

	// factory function
	static _(pos: Pos, parent: AST): ASTTypeRange {
		return new ASTTypeRange(pos, parent);
	}

	toString(): string {
		return 'range';
	}
}

/** Can be used as `extends` or `implements` */
export type ASTExtOrImpl = ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression;
export function isASTExtOrImplInstanceOf(ast: ASTExtOrImpl, identifier: ASTType): boolean {
	return when(ast.constructor.name, {
		[ASTIdentifier.name]: () => ast === identifier,
		[ASTMemberExpression.name]: () => (ast as ASTMemberExpression).property === identifier,
		[ASTTypeInstantiationExpression.name]: () => (ast as ASTTypeInstantiationExpression).base === identifier,
		'...': () => false,
	});
}

export type ASTTypeExceptPrimitive = ASTArrayOf | ASTFunctionSignature | ASTTypeRange | ASTExtOrImpl;

export type ASTType = ASTTypePrimitive | ASTTypeExceptPrimitive | ASTTypeList<ASTType>;
/** End ASTType */

export class ASTTypeParameter extends AST {
	kind = 'TypeParameter';
	type!: ASTType;
	constraint?: ASTType;
	defaultType?: ASTType;

	// factory function
	static _(type: ASTType, constraint: ASTType | undefined, defaultType: ASTType | undefined, pos: Pos, parent: AST): ASTTypeParameter {
		const ast = new ASTTypeParameter(pos, parent);
		ast.type = type;

		// only set if it's defined
		if (typeof constraint !== 'undefined') {
			ast.constraint = constraint;
		}

		// only set if it's defined
		if (typeof defaultType !== 'undefined') {
			ast.defaultType = defaultType;
		}

		return ast;
	}

	toString(): string {
		return `${this.type.toString()}${this.constraint ? ` : ${this.constraint.toString()}` : ''}${
			this.defaultType ? ` = ${this.defaultType.toString()}` : ''
		}`;
	}
}

export class ASTUnaryExpression<T extends ExpressionASTs | boolean | number> extends AST {
	kind = 'UnaryExpression';
	before!: boolean;
	operator!: string;
	operand!: T;

	// factory function
	static _<T extends ExpressionASTs | boolean | number>(
		{
			before,
			operator,
			operand,
		}: {
			before: boolean;
			operator: string;
			operand: T;
		},
		pos: Pos,
		parent: AST,
	): ASTUnaryExpression<T> {
		const ast = new ASTUnaryExpression<T>(pos, parent);
		ast.before = before;
		ast.operator = operator;
		ast.operand = operand;
		return ast;
	}

	toString(): string {
		return `${this.before ? this.operator : ''}${this.operand.toString()}${this.before ? '' : this.operator}`;
	}
}

export class ASTVariableDeclaration extends AST implements ASTThatHasJoeDoc, ASTThatHasModifiers {
	kind = 'VariableDeclaration';
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	mutable!: boolean;
	identifiersList!: ASTIdentifier[];

	/** The types declared by the source code, if any */
	declaredTypes: ASTType[] = [];

	initialValues: AssignableASTs[] = [];

	/** The types inferred from the initial values, if any */
	inferredTypes: ASTType[] = [];

	/** The VarSyms in the SymbolTable */
	symbols: Array<VarSym | undefined> = [];

	// factory function
	static _(
		{
			joeDoc,
			modifiers,
			mutable,
			identifiersList,
			declaredTypes,
			initialValues,
			inferredTypes,
		}: {
			joeDoc?: ASTJoeDoc;
			modifiers: ASTModifier[];
			mutable: boolean;
			identifiersList: ASTIdentifier[];
			declaredTypes: ASTType[];
			initialValues: AssignableASTs[];
			inferredTypes: ASTType[];
		},
		pos: Pos,
		parent: AST,
	): ASTVariableDeclaration {
		const ast = new ASTVariableDeclaration(pos, parent);

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.mutable = mutable;
		ast.identifiersList = identifiersList;
		ast.declaredTypes = declaredTypes;
		ast.initialValues = initialValues;
		ast.inferredTypes = inferredTypes;

		return ast;
	}

	toString(): string {
		const joedocString = this.joeDoc ? `${this.joeDoc.toString()}\n` : '';
		const modifiersString = this.modifiers.length > 0 ? `${this.modifiers.map((m) => m.toString()).join(' ')} ` : '';
		const mutableString = this.mutable ? 'const' : 'let';
		const identifiersString = this.identifiersList.map((i) => i.toString()).join(', ');
		const declaredTypesString = this.declaredTypes.length > 0 ? `: ${this.declaredTypes.map((t) => t.toString()).join(', ')}` : '';
		const initialValuesString = this.initialValues.length > 0 ? ` = ${this.initialValues.map((i) => i.toString()).join(', ')}` : '';

		return `${joedocString}${modifiersString}${mutableString} ${identifiersString}${declaredTypesString}${initialValuesString}`;
	}
}

export class ASTUseDeclaration extends AST {
	kind = 'UseDeclaration';
	identifier!: ASTIdentifier | ASTMemberExpression;
	source?: ASTPath;

	// factory function
	static _(
		{ identifier, source }: { identifier: ASTIdentifier | ASTMemberExpression; source?: ASTPath },
		pos: Pos,
		parent: AST,
	): ASTUseDeclaration {
		const ast = new ASTUseDeclaration(pos, parent);
		ast.identifier = identifier;
		ast.source = source;
		return ast;
	}

	toString(): string {
		if (typeof this.source === 'undefined') {
			return `use ${this.identifier.toString()}`;
		}

		return `use ${this.identifier.toString()} from ${this.source.toString()}`;
	}
}

export class ASTWhenCase extends AST {
	kind = 'WhenCase';
	values: Array<ASTBoolLiteral | ASTNumberLiteral | ASTRangeExpression | ASTRestElement | ASTStringLiteral> = [];
	consequent!: ASTBlockStatement | AssignableASTs;

	// factory function
	static _(
		{
			values,
			consequent,
		}: {
			values: Array<ASTBoolLiteral | ASTNumberLiteral | ASTRangeExpression | ASTRestElement | ASTStringLiteral>;
			consequent: ASTBlockStatement | AssignableASTs;
		},
		pos: Pos,
		parent: AST,
	): ASTWhenCase {
		const ast = new ASTWhenCase(pos, parent);
		ast.values = values;
		ast.consequent = consequent;
		return ast;
	}

	toString(): string {
		return `${this.values.map((v) => v.toString()).join(', ')} -> ${this.consequent.toString()}`;
	}
}

export class ASTWhenExpression extends AST {
	kind = 'WhenExpression';
	expression!: ExpressionASTs;
	cases: ASTWhenCase[] = [];

	// factory function
	static _({ expression, cases }: { expression: ExpressionASTs; cases: ASTWhenCase[] }, pos: Pos, parent: AST): ASTWhenExpression {
		const ast = new ASTWhenExpression(pos, parent);
		ast.expression = expression;
		ast.cases = cases;
		return ast;
	}

	toString(): string {
		return `when ${this.expression.toString()} {\n${this.cases.map((c) => c.toString()).join('\n')}\n}`;
	}
}

// noop
export class SkipAST extends AST {
	kind = 'Skip';

	toString(): string {
		return '';
	}
}

/**
 * Characteristic that makes this AST unique.
 *
 * Callback to pass to _.intersectionBy() that tells lodash how to compare ASTTypes
 *
 * @param type AST type to intersect
 */
export const astUniqueness = (type: ASTType): string => {
	if (type.constructor === ASTArrayOf) {
		const parentKind = (type as ASTArrayOf).kind;
		const childKind = astUniqueness((type as ASTArrayOf).type);

		return `${parentKind}<${childKind}>`;
	}

	if (type.constructor === ASTIdentifier) {
		return (type as ASTIdentifier).name;
	}

	if (type.constructor === ASTParameter) {
		const childKind = (type as ASTParameter).type;
		if (typeof childKind !== 'undefined') {
			return astUniqueness(childKind);
		}

		// unsure how to represent a default value
		// const defaultValue = (type as ASTParameter).defaultValue;
		// if (typeof defaultValue !== 'undefined') {
		// 	return astUniqueness(defaultValue);
		// }

		// this will be ASTParameter, which will never match, functioning as a stop-gap
		return (type as ASTParameter).kind;

		// TODO deal with a param that has a default value but no declared type, and we're
		// assigning an arg to it.
	}

	if (type.constructor === ASTTypeNumber) {
		return (type as ASTTypeNumber).size;
	}

	if (type.constructor === ASTTypePrimitive) {
		return (type as ASTTypePrimitive).type;
	}

	if (type.constructor === ASTFunctionDeclaration) {
		return ASTFunctionSignature._(
			{
				typeParams: (type as ASTFunctionDeclaration).typeParams,
				params: (type as ASTFunctionDeclaration).params,
				returnTypes: (type as ASTFunctionDeclaration).returnTypes,
			},
			(type as ASTFunctionDeclaration).pos, // irrelevant
			type, // irrelevant
		).toString();
	}

	if (type.constructor === ASTFunctionSignature) {
		return (type as ASTFunctionSignature).toString();
	}

	return type.kind;
};

/** ASTs that can be assigned to a variable go in an array/object/tuple, passed as an argument, or returned */
export type AssignableASTs = ExpressionASTs | ASTFunctionDeclaration;

export type CallableASTs = ASTCallExpression | ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression;

/** ASTs that can be used in UnaryExpressions and BinaryExpressions */
export type ExpressionASTs =
	| ASTArrayExpression<AssignableASTs>
	| ASTBinaryExpression<ExpressionASTs, ExpressionASTs>
	| ASTBoolLiteral
	| ASTCallExpression
	| ASTIdentifier
	| ASTMemberExpression
	| ASTMemberListExpression
	| ASTNumberLiteral
	| ASTObjectExpression
	| ASTPath
	| ASTRangeExpression
	| ASTRegularExpression
	| ASTStringLiteral
	| ASTTernaryExpression<AssignableASTs, AssignableASTs>
	| ASTThisKeyword
	| ASTTupleExpression
	| ASTUnaryExpression<ExpressionASTs>
	| ASTWhenExpression;

export type IterableASTs =
	// main types
	| ASTArrayExpression<AssignableASTs>
	| ASTMemberListExpression // on an array
	| ASTRangeExpression

	// can hold/return the above types
	| ASTCallExpression
	| ASTIdentifier
	| ASTMemberExpression;

export type MemberExpressionObjectASTs =
	| ASTCallExpression
	| ASTIdentifier
	| ASTMemberExpression
	| ASTThisKeyword
	| ASTTypeInstantiationExpression;

export type MemberExpressionPropertyASTs =
	| ASTBinaryExpression<ExpressionASTs, ExpressionASTs>
	| ASTCallExpression
	| ASTIdentifier
	| ASTMemberExpression
	| ASTNumberLiteral
	| ASTRangeExpression
	| ASTStringLiteral
	| ASTTernaryExpression<AssignableASTs, AssignableASTs>
	| ASTTypeInstantiationExpression
	| ASTUnaryExpression<ExpressionASTs>;

export type RangeBoundASTs =
	| ASTCallExpression
	| ASTIdentifier
	| ASTMemberExpression
	| ASTNumberLiteral
	| ASTUnaryExpression<ASTNumberLiteral>;

export type WhenCaseValueASTs =
	| ASTBoolLiteral
	| ASTCallExpression
	| ASTIdentifier
	| ASTMemberExpression
	| ASTNumberLiteral
	| ASTPath
	| ASTRangeExpression
	| ASTRegularExpression
	| ASTRestElement
	| ASTStringLiteral;
