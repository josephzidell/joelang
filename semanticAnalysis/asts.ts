/**
 * This fils contains all the AST classes.
 */

import { PrimitiveType } from '../lexer/types';
import util from 'util';

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
	typeParams: ASTType[];
}

export abstract class AST {
	abstract kind: string;

	/**
	 * Override the default behavior when calling util.insepct()
	 * and don't display the `kind` property. It is only necessary
	 * for JSON serialization since the class name isn't there.
	 */
	[util.inspect.custom](depth: number, options: util.InspectOptions): string {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { kind, ...rest } = this;

		// we need to explcitely dsplay the class name since it
		// disappears when using a custom inspect function.
		return `${this.constructor.name} ${util.inspect(rest, options)}`;
	}
}

export class ASTArgumentsList extends AST {
	kind = 'ArgumentsList';
	args: AssignableASTs[] = []; // usually this is empty and thus undefined, but the parser ensures it's an array, so we mimic that here

	// factory function
	static _(args: AssignableASTs[]): ASTArgumentsList {
		const ast = new ASTArgumentsList();
		ast.args = args;
		return ast;
	}
}

export class ASTArrayExpression<T extends AssignableASTs> extends AST {
	kind = 'ArrayExpression';
	/** The type, usually inferred from the initial value, if any, or from context */
	type: ASTType | undefined = undefined;
	items: Array<T | ASTPostfixIfStatement> = []; // usually this would be empty and thus undefined, but the parser ensures it's an array, so we mimic that here

	// factory function
	static _<T extends AssignableASTs>({
		type,
		items,
	}: {
		type?: ASTType;
		items: Array<T | ASTPostfixIfStatement>;
	}): ASTArrayExpression<T> {
		const ast = new ASTArrayExpression<T>();
		ast.type = type;
		ast.items = items;
		return ast;
	}
}

export class ASTArrayOf extends AST {
	kind = 'ArrayOf';
	type!: ASTType;

	// factory function
	static _(type: ASTType): ASTArrayOf {
		const ast = new ASTArrayOf();
		ast.type = type;
		return ast;
	}
}

export class ASTAssignmentExpression extends AST {
	kind = 'AssignmentExpression';
	left!: ASTIdentifier | ASTMemberExpression;
	right!: AssignableASTs;

	// factory function
	static _({
		left,
		right,
	}: {
		left: ASTIdentifier | ASTMemberExpression;
		right: AssignableASTs;
	}): ASTAssignmentExpression {
		const ast = new ASTAssignmentExpression();
		ast.left = left;
		ast.right = right;
		return ast;
	}
}

export class ASTBinaryExpression<L extends ExpressionASTs, R extends ExpressionASTs> extends AST {
	kind = 'BinaryExpression';
	operator!: string;
	left!: L;
	right!: R;

	// factory function
	static _<L extends ExpressionASTs, R extends ExpressionASTs>({
		operator,
		left,
		right,
	}: {
		operator: string;
		left: L;
		right: R;
	}): ASTBinaryExpression<L, R> {
		const ast = new ASTBinaryExpression<L, R>();
		ast.operator = operator;
		ast.left = left;
		ast.right = right;
		return ast;
	}
}

export class ASTBlockStatement extends AST {
	kind = 'BlockStatement';
	expressions: AST[] = [];

	// factory function
	static _(expressions: AST[]): ASTBlockStatement {
		const ast = new ASTBlockStatement();
		ast.expressions = expressions;
		return ast;
	}
}

export class ASTBoolLiteral extends AST {
	kind = 'BoolLiteral';
	value!: boolean | ASTUnaryExpression<boolean>;

	// factory function
	static _(value: boolean | ASTUnaryExpression<boolean>): ASTBoolLiteral {
		const ast = new ASTBoolLiteral();
		ast.value = value;
		return ast;
	}
}

export class ASTCallExpression extends AST {
	kind = 'CallExpression';
	callee!: CallableASTs;
	typeArgs!: ASTType[];
	args!: ExpressionASTs[];

	// factory function
	static _({
		callee,
		typeArgs,
		args,
	}: {
		callee: CallableASTs;
		typeArgs?: ASTType[];
		args: ExpressionASTs[];
	}): ASTCallExpression {
		const ast = new ASTCallExpression();
		ast.callee = callee;

		if (typeArgs) {
			ast.typeArgs = typeArgs;
		}

		ast.args = args;
		return ast;
	}
}

export class ASTClassDeclaration
	extends AST
	implements ASTThatHasJoeDoc, ASTThatHasModifiers, ASTThatHasRequiredBody, ASTThatHasTypeParams
{
	kind = 'ClassDeclaration';
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	name!: ASTIdentifier;
	typeParams: ASTType[] = [];
	extends: ASTTypeExceptPrimitive[] = [];
	implements: ASTTypeExceptPrimitive[] = [];
	body!: ASTBlockStatement;

	// factory function
	static _({
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
		typeParams: ASTType[];
		extends: ASTTypeExceptPrimitive[];
		implements: ASTTypeExceptPrimitive[];
		body: ASTBlockStatement;
	}): ASTClassDeclaration {
		const ast = new ASTClassDeclaration();

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.name = name;
		ast.typeParams = typeParams;
		ast.extends = _extends;
		ast.implements = _implements;
		ast.body = body;
		return ast;
	}
}

export class ASTDoneStatement extends AST {
	kind = 'DoneStatement';

	// factory function
	static _(): ASTDoneStatement {
		return new ASTDoneStatement();
	}
}

export class ASTForStatement extends AST implements ASTThatHasRequiredBody {
	kind = 'ForStatement';
	initializer!: ASTIdentifier | ASTVariableDeclaration;
	iterable!: IterableASTs;
	body!: ASTBlockStatement;

	// factory function
	static _({
		initializer,
		iterable,
		body,
	}: {
		initializer: ASTIdentifier | ASTVariableDeclaration;
		iterable: IterableASTs;
		body: ASTBlockStatement;
	}): ASTForStatement {
		const ast = new ASTForStatement();
		ast.initializer = initializer;
		ast.iterable = iterable;
		ast.body = body;
		return ast;
	}
}

export class ASTFunctionDeclaration
	extends AST
	implements ASTThatHasJoeDoc, ASTThatHasModifiers, ASTThatHasTypeParams
{
	kind = 'FunctionDeclaration';
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	name: ASTIdentifier | undefined = undefined;
	typeParams: ASTType[] = [];
	params: ASTParameter[] = [];
	returnTypes: ASTType[] = [];
	body: ASTBlockStatement | undefined = undefined;

	// factory function
	static _({
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
		name: ASTIdentifier | undefined;
		typeParams: ASTType[];
		params: ASTParameter[];
		returnTypes: ASTType[];
		body: ASTBlockStatement | undefined;
	}): ASTFunctionDeclaration {
		const ast = new ASTFunctionDeclaration();

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.name = name;
		ast.typeParams = typeParams;
		ast.params = params;
		ast.returnTypes = returnTypes;
		ast.body = body;
		return ast;
	}
}

export class ASTFunctionSignature extends AST implements ASTThatHasTypeParams {
	kind = 'FunctionSignature';
	typeParams: ASTType[] = [];
	params: ASTParameter[] = [];
	returnTypes: ASTType[] = [];

	// factory function
	static _({
		typeParams,
		params,
		returnTypes,
	}: {
		typeParams: ASTType[];
		params: ASTParameter[];
		returnTypes: ASTType[];
	}): ASTFunctionSignature {
		const ast = new ASTFunctionSignature();
		ast.typeParams = typeParams;
		ast.params = params;
		ast.returnTypes = returnTypes;
		return ast;
	}
}

export class ASTIdentifier extends AST {
	kind = 'Identifier';
	name!: string;

	// factory function
	static _(name: string): ASTIdentifier {
		const ast = new ASTIdentifier();
		ast.name = name;
		return ast;
	}
}

export class ASTIfStatement extends AST {
	kind = 'IfStatement';
	test!: ExpressionASTs;
	consequent!: ASTBlockStatement;
	alternate?: ASTBlockStatement | ASTIfStatement = undefined;

	// factory function
	static _({
		test,
		consequent,
		alternate,
	}: {
		test: ExpressionASTs;
		consequent: ASTBlockStatement;
		alternate?: ASTBlockStatement | ASTIfStatement;
	}): ASTIfStatement {
		const ast = new ASTIfStatement();
		ast.test = test;
		ast.consequent = consequent;

		// only set if it's not undefined
		if (alternate) {
			ast.alternate = alternate;
		}

		return ast;
	}
}

export class ASTImportDeclaration extends AST {
	kind = 'ImportDeclaration';
	identifier!: ASTIdentifier;
	source!: ASTPath;

	// factory function
	static _({
		identifier,
		source,
	}: {
		identifier: ASTIdentifier;
		source: ASTPath;
	}): ASTImportDeclaration {
		const ast = new ASTImportDeclaration();
		ast.identifier = identifier;
		ast.source = source;
		return ast;
	}
}

export class ASTInterfaceDeclaration
	extends AST
	implements ASTThatHasJoeDoc, ASTThatHasModifiers, ASTThatHasRequiredBody, ASTThatHasTypeParams
{
	kind = 'InterfaceDeclaration';
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	name!: ASTIdentifier;
	typeParams: ASTType[] = [];
	extends: ASTTypeExceptPrimitive[] = [];
	body!: ASTBlockStatement;

	// factory function
	static _({
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
		typeParams: ASTType[];
		extends: ASTTypeExceptPrimitive[];
		body: ASTBlockStatement;
	}): ASTInterfaceDeclaration {
		const ast = new ASTInterfaceDeclaration();

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.name = name;
		ast.typeParams = typeParams;
		ast.extends = _extends;
		ast.body = body;
		return ast;
	}
}

export class ASTJoeDoc extends AST {
	kind = 'JoeDoc';
	content?: string = undefined; // TODO parse into parts

	// factory function
	static _(content?: string): ASTJoeDoc {
		const ast = new ASTJoeDoc();
		ast.content = content;
		return ast;
	}
}

export class ASTLoopStatement extends AST {
	kind = 'LoopStatement';
	body!: ASTBlockStatement;

	// factory function
	static _({ body }: { body: ASTBlockStatement }): ASTLoopStatement {
		const ast = new ASTLoopStatement();
		ast.body = body;
		return ast;
	}
}

export class ASTMemberExpression extends AST {
	kind = 'MemberExpression';
	object!: MemberExpressionObjectASTs;
	property!: MemberExpressionPropertyASTs;

	// factory function
	static _({
		object,
		property,
	}: {
		object: MemberExpressionObjectASTs;
		property: MemberExpressionPropertyASTs;
	}): ASTMemberExpression {
		const ast = new ASTMemberExpression();
		ast.object = object;
		ast.property = property;
		return ast;
	}
}

export class ASTMemberListExpression extends AST {
	kind = 'MemberListExpression';
	object!: MemberExpressionObjectASTs;
	properties: MemberExpressionPropertyASTs[] = [];

	// factory function
	static _({
		object,
		properties,
	}: {
		object: MemberExpressionObjectASTs;
		properties: MemberExpressionPropertyASTs[];
	}): ASTMemberListExpression {
		const ast = new ASTMemberListExpression();
		ast.object = object;
		ast.properties = properties;
		return ast;
	}
}

export class ASTModifier extends AST {
	kind = 'Modifier';
	keyword!: string;

	// factory function
	static _(keyword: string): ASTModifier {
		const ast = new ASTModifier();
		ast.keyword = keyword;
		return ast;
	}
}

export class ASTNextStatement extends AST {
	kind = 'NextStatement';

	// factory function
	static _(): ASTNextStatement {
		return new ASTNextStatement();
	}
}

export class ASTNumberLiteral extends AST {
	kind = 'NumberLiteral';
	format!: 'int' | 'decimal';
	value!: number | ASTUnaryExpression<number>;

	// factory function
	static _({
		format,
		value,
	}: {
		format: 'int' | 'decimal';
		value: number | ASTUnaryExpression<number>;
	}): ASTNumberLiteral {
		const ast = new ASTNumberLiteral();
		ast.format = format;
		ast.value = value;
		return ast;
	}
}

export class ASTObjectExpression extends AST {
	kind = 'ObjectExpression';
	properties!: ASTProperty[];

	// factory function
	static _(properties: ASTProperty[]): ASTObjectExpression {
		const ast = new ASTObjectExpression();
		ast.properties = properties;
		return ast;
	}
}

export class ASTObjectShape extends AST {
	kind = 'ObjectShape';
	properties: ASTPropertyShape[] = [];

	// factory function
	static _(properties: ASTPropertyShape[]): ASTObjectShape {
		const ast = new ASTObjectShape();
		ast.properties = properties;
		return ast;
	}
}

export class ASTProperty extends AST {
	kind = 'Property';
	key!: ASTIdentifier;
	value!: AssignableASTs;

	// factory function
	static _(key: ASTIdentifier, value: AssignableASTs): ASTProperty {
		const ast = new ASTProperty();
		ast.key = key;
		ast.value = value;
		return ast;
	}
}

export class ASTPropertyShape extends AST {
	kind = 'PropertyShape';
	key!: ASTIdentifier;
	type!: ASTType;

	// factory function
	static _(key: ASTIdentifier, type: ASTType): ASTPropertyShape {
		const ast = new ASTPropertyShape();
		ast.key = key;
		ast.type = type;
		return ast;
	}
}

export class ASTParameter extends AST {
	kind = 'Parameter';
	modifiers: ASTModifier[] = [];
	isRest = false;
	name!: ASTIdentifier;

	/** The type declared by the source code, if any */
	declaredType?: ASTType;

	/** The type inferred from the initial value, if any */
	inferredType?: ASTType;

	defaultValue?: AssignableASTs;

	// factory function
	static _({
		modifiers,
		isRest,
		name,
		declaredType,
		inferredType,
		defaultValue,
	}: {
		modifiers: ASTModifier[];
		isRest: boolean;
		name: ASTIdentifier;
		declaredType?: ASTType;
		inferredType?: ASTType;
		defaultValue?: AssignableASTs;
	}): ASTParameter {
		const ast = new ASTParameter();
		ast.modifiers = modifiers;
		ast.isRest = isRest;
		ast.name = name;

		// only set if it's not undefined
		if (typeof declaredType !== 'undefined') {
			ast.declaredType = declaredType;
		}

		// only set if it's not undefined
		if (typeof inferredType !== 'undefined') {
			ast.inferredType = inferredType;
		}

		// only set if it's not undefined
		if (typeof defaultValue !== 'undefined') {
			ast.defaultValue = defaultValue;
		}

		return ast;
	}
}

export class ASTPath extends AST {
	kind = 'Path';
	absolute!: boolean;
	path!: string;
	isDir!: boolean;

	// factory function
	static _({
		absolute,
		path,
		isDir,
	}: {
		absolute: boolean;
		path: string;
		isDir: boolean;
	}): ASTPath {
		const ast = new ASTPath();
		ast.absolute = absolute;
		ast.path = path;
		ast.isDir = isDir;
		return ast;
	}
}

export class ASTPostfixIfStatement extends AST {
	kind = 'PostfixIfStatement';
	expression!: ExpressionASTs;
	test!: ExpressionASTs;

	// factory function
	static _({
		expression,
		test,
	}: {
		expression: ExpressionASTs;
		test: ExpressionASTs;
	}): ASTPostfixIfStatement {
		const ast = new ASTPostfixIfStatement();
		ast.expression = expression;
		ast.test = test;
		return ast;
	}
}

export class ASTPrintStatement extends AST {
	kind = 'PrintStatement';
	expressions: ExpressionASTs[] = [];

	// factory function
	static _(expressions: ExpressionASTs[]): ASTPrintStatement {
		const ast = new ASTPrintStatement();
		ast.expressions = expressions;
		return ast;
	}
}

/** It's just a kind of BlockStatement */
export class ASTProgram extends AST {
	kind = 'Program';
	declarations: AST[] = [];

	// factory function
	static _({ declarations }: { declarations: AST[] }): ASTProgram {
		const ast = new ASTProgram();

		ast.declarations = declarations;

		return ast;
	}
}

export class ASTRangeExpression extends AST {
	kind = 'RangeExpression';
	lower!: RangeBoundASTs;
	upper!: RangeBoundASTs;

	// factory function
	static _({
		lower,
		upper,
	}: {
		lower: RangeBoundASTs;
		upper: RangeBoundASTs;
	}): ASTRangeExpression {
		const ast = new ASTRangeExpression();
		ast.lower = lower;
		ast.upper = upper;
		return ast;
	}
}

export class ASTRegularExpression extends AST {
	kind = 'RegularExpression';
	pattern!: string;
	flags!: string[];

	// factory function
	static _({ pattern, flags }: { pattern: string; flags: string[] }): ASTRegularExpression {
		const ast = new ASTRegularExpression();
		ast.pattern = pattern;
		ast.flags = flags;
		return ast;
	}
}

export class ASTRestElement extends AST {
	kind = 'RestElement';
	// factory function
	static _(): ASTRestElement {
		return new ASTRestElement();
	}
}

export class ASTReturnStatement extends AST {
	kind = 'ReturnStatement';
	expressions: AssignableASTs[] = [];

	// factory function
	static _(expressions: AssignableASTs[]): ASTReturnStatement {
		const ast = new ASTReturnStatement();
		ast.expressions = expressions;
		return ast;
	}
}

export class ASTStringLiteral extends AST {
	kind = 'StringLiteral';
	value!: string;

	// factory function
	static _(value: string): ASTStringLiteral {
		const ast = new ASTStringLiteral();
		ast.value = value;
		return ast;
	}
}

export class ASTTernaryAlternate<T extends AssignableASTs> extends AST {
	kind = 'TernaryAlternate';
	value!: T;

	// factory function
	static _<T extends AssignableASTs>(expression: T): ASTTernaryAlternate<T> {
		const ast = new ASTTernaryAlternate<T>();
		ast.value = expression;
		return ast;
	}
}

export class ASTTernaryCondition extends AST {
	kind = 'TernaryCondition';
	expression!: ExpressionASTs;

	// factory function
	static _(expression: ExpressionASTs): ASTTernaryCondition {
		const ast = new ASTTernaryCondition();
		ast.expression = expression;
		return ast;
	}
}

export class ASTTernaryConsequent<T extends AssignableASTs> extends AST {
	kind = 'TernaryConsequent';
	value!: T;

	// factory function
	static _<T extends AssignableASTs>(expression: T): ASTTernaryConsequent<T> {
		const ast = new ASTTernaryConsequent<T>();
		ast.value = expression;
		return ast;
	}
}

export class ASTTernaryExpression<C extends AssignableASTs, A extends AssignableASTs> extends AST {
	kind = 'TernaryExpression';
	test!: ASTTernaryCondition;
	consequent!: ASTTernaryConsequent<C>;
	alternate!: ASTTernaryAlternate<A>;

	// factory function
	static _<C extends AssignableASTs, A extends AssignableASTs>({
		test,
		consequent,
		alternate,
	}: {
		test: ASTTernaryCondition;
		consequent: ASTTernaryConsequent<C>;
		alternate: ASTTernaryAlternate<A>;
	}): ASTTernaryExpression<C, A> {
		const ast = new ASTTernaryExpression<C, A>();
		ast.test = test;
		ast.consequent = consequent;
		ast.alternate = alternate;
		return ast;
	}
}

export class ASTThisKeyword extends AST {
	kind = 'ThisKeyword';
	// factory function
	static _(): ASTThisKeyword {
		return new ASTThisKeyword();
	}
}

export class ASTTupleExpression extends AST {
	kind = 'TupleExpression';
	items: AssignableASTs[] = [];

	// factory function
	static _(items: AssignableASTs[]): ASTTupleExpression {
		const ast = new ASTTupleExpression();
		ast.items = items;
		return ast;
	}
}

export class ASTTupleShape extends AST {
	kind = 'TupleShape';
	types!: ASTType[];

	// factory function
	static _(types: ASTType[]): ASTTupleShape {
		const ast = new ASTTupleShape();
		ast.types = types;
		return ast;
	}
}

/** Begin ASTType */
export class ASTTypeInstantiationExpression extends AST {
	kind = 'TypeInstantiationExpression';
	base!: ASTIdentifier | ASTMemberExpression;
	typeArgs: ASTType[] = [];

	// factory function
	static _({
		base,
		typeArgs,
	}: {
		base: ASTIdentifier | ASTMemberExpression;
		typeArgs: ASTType[];
	}): ASTTypeInstantiationExpression {
		const ast = new ASTTypeInstantiationExpression();
		ast.base = base;
		ast.typeArgs = typeArgs;
		return ast;
	}
}

export class ASTTypePrimitive extends AST {
	kind = 'TypePrimitive';
	type!: PrimitiveType;

	// factory function
	static _(type: PrimitiveType): ASTTypePrimitive {
		const ast = new ASTTypePrimitive();
		ast.type = type;
		return ast;
	}
}
export const ASTTypePrimitiveBool = new ASTTypePrimitive();
ASTTypePrimitiveBool.type = 'bool';
export const ASTTypePrimitiveNumber = new ASTTypePrimitive();
ASTTypePrimitiveNumber.type = 'number';
export const ASTTypePrimitivePath = new ASTTypePrimitive();
ASTTypePrimitivePath.type = 'path';
export const ASTTypePrimitiveRegex = new ASTTypePrimitive();
ASTTypePrimitiveRegex.type = 'regex';
export const ASTTypePrimitiveString = new ASTTypePrimitive();
ASTTypePrimitiveString.type = 'string';

export class ASTTypeRange extends AST {
	kind = 'TypeRange';
	// factory function
	static _(): ASTTypeRange {
		return new ASTTypeRange();
	}
}

export type ASTTypeExceptPrimitive =
	| ASTFunctionSignature
	| ASTIdentifier
	| ASTMemberExpression
	| ASTTypeInstantiationExpression
	| ASTTypeRange;
export type ASTType = ASTTypePrimitive | ASTTypeExceptPrimitive;
/** End ASTType */

export class ASTUnaryExpression<T> extends AST {
	kind = 'UnaryExpression';
	before!: boolean;
	operator!: string;
	operand!: T;

	// factory function
	static _<T>({
		before,
		operator,
		operand,
	}: {
		before: boolean;
		operator: string;
		operand: T;
	}): ASTUnaryExpression<T> {
		const ast = new ASTUnaryExpression<T>();
		ast.before = before;
		ast.operator = operator;
		ast.operand = operand;
		return ast;
	}
}

export class ASTVariableDeclaration extends AST implements ASTThatHasJoeDoc, ASTThatHasModifiers {
	kind = 'VariableDeclaration';
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	mutable!: boolean;
	identifier!: ASTIdentifier;

	/** The type declared by the source code, if any */
	declaredType?: ASTType;

	initialValue?: AssignableASTs;

	/** The type inferred from the initial value, if any */
	inferredType?: ASTType;

	// factory function
	static _({
		joeDoc,
		modifiers,
		mutable,
		identifier,
		declaredType,
		initialValue,
		inferredType,
	}: {
		joeDoc?: ASTJoeDoc;
		modifiers: ASTModifier[];
		mutable: boolean;
		identifier: ASTIdentifier;
		declaredType?: ASTType;
		initialValue?: AssignableASTs;
		inferredType?: ASTType;
	}): ASTVariableDeclaration {
		const ast = new ASTVariableDeclaration();

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.mutable = mutable;
		ast.identifier = identifier;

		// only set if it's not undefined
		if (typeof declaredType !== 'undefined') {
			ast.declaredType = declaredType;
		}

		// only set if it's not undefined
		if (typeof initialValue !== 'undefined') {
			ast.initialValue = initialValue;
		}

		// only set if it's not undefined
		if (typeof inferredType !== 'undefined') {
			ast.inferredType = inferredType;
		}

		return ast;
	}
}

export class ASTWhenCase extends AST {
	kind = 'WhenCase';
	values: Array<
		ASTBoolLiteral | ASTNumberLiteral | ASTRangeExpression | ASTRestElement | ASTStringLiteral
	> = [];
	consequent!: ASTBlockStatement | AssignableASTs;

	// factory function
	static _({
		values,
		consequent,
	}: {
		values: Array<
			| ASTBoolLiteral
			| ASTNumberLiteral
			| ASTRangeExpression
			| ASTRestElement
			| ASTStringLiteral
		>;
		consequent: ASTBlockStatement | AssignableASTs;
	}): ASTWhenCase {
		const ast = new ASTWhenCase();
		ast.values = values;
		ast.consequent = consequent;
		return ast;
	}
}

export class ASTWhenExpression extends AST {
	kind = 'WhenExpression';
	expression!: ExpressionASTs;
	cases: ASTWhenCase[] = [];

	// factory function
	static _({
		expression,
		cases,
	}: {
		expression: ExpressionASTs;
		cases: ASTWhenCase[];
	}): ASTWhenExpression {
		const ast = new ASTWhenExpression();
		ast.expression = expression;
		ast.cases = cases;
		return ast;
	}
}

// noop
export class SkipAST extends AST {
	kind = 'Skip';
}

/** ASTs that can be assigned to a variable go in an array/object/tuple, passed as an argument, or returned */
export type AssignableASTs = ExpressionASTs | ASTFunctionDeclaration;

export type CallableASTs =
	| ASTCallExpression
	| ASTIdentifier
	| ASTMemberExpression
	| ASTTypeInstantiationExpression;

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
