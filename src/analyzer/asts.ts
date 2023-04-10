/**
 * This fils contains all the AST classes.
 */

import util from 'util';
import { patterns } from '../lexer/types';
import { NumberSize } from '../shared/numbers/sizes';
import { determinePossibleNumberSizes } from '../shared/numbers/utils';
import { ok, Result } from '../shared/result';

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
	typeParams: ASTTypeParameter[];
}

export abstract class AST {
	abstract kind: string;

	/** A string representation of the node */
	abstract toString(): string;

	/**
	 * Override the default behavior when calling util.inspect()
	 * and don't display the `kind` property. It is only necessary
	 * for JSON serialization since the class name isn't there.
	 */
	[util.inspect.custom](depth: number, options: util.InspectOptions): string {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { kind, ...rest } = this;

		// we need to explicitly display the class name since it
		// disappears when using a custom inspect function.
		return `${this.constructor.name} ${util.inspect(rest, options)}`;
	}
}

export abstract class ASTDeclaration
	extends AST
	implements ASTThatHasJoeDoc, ASTThatHasModifiers, ASTThatHasRequiredBody, ASTThatHasTypeParams
{
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	name!: ASTIdentifier;
	typeParams: ASTTypeParameter[] = [];
	extends: ASTTypeExceptPrimitive[] = [];
	body!: ASTBlockStatement;
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

	toString(): string {
		return this.args.map((arg) => arg.toString()).join(', ');
	}
}

export class ASTArrayExpression<T extends AssignableASTs> extends AST {
	kind = 'ArrayExpression';
	items: Array<T | ASTPostfixIfStatement> = []; // usually this would be empty and thus undefined, but the parser ensures it's an array, so we mimic that here
	/** The possible types, usually inferred from the initial value, if any, or from context */
	possibleTypes: ASTType[] = [];

	// factory function
	static _<T extends AssignableASTs>({
		items,
		possibleTypes,
	}: {
		items: Array<T | ASTPostfixIfStatement>;
		possibleTypes: ASTType[];
	}): ASTArrayExpression<T> {
		const ast = new ASTArrayExpression<T>();
		ast.items = items;
		ast.possibleTypes = possibleTypes;
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
	static _(type: ASTType): ASTArrayOf {
		const ast = new ASTArrayOf();
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
	static _({
		left,
		right,
	}: {
		left: Array<ASTIdentifier | ASTMemberExpression>;
		right: AssignableASTs[];
	}): ASTAssignmentExpression {
		const ast = new ASTAssignmentExpression();
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

	toString(): string {
		return `${this.left.toString()} ${this.operator} ${this.right.toString()}`;
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

	toString(): string {
		return `{${this.expressions.map((expr) => expr.toString()).join('\n')}}`;
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

	toString(): string {
		const typeArgsString = this.typeArgs
			? `<| ${this.typeArgs.map((typeArg) => typeArg.toString()).join(', ')} |>`
			: '';

		return `${this.callee.toString()}${typeArgsString}(${this.args.map((arg) => arg.toString()).join(', ')})`;
	}
}

export class ASTClassDeclaration extends ASTDeclaration {
	kind = 'ClassDeclaration';
	implements: ASTTypeExceptPrimitive[] = [];

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
		typeParams: ASTTypeParameter[];
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

	toString(): string {
		const modifiersString =
			this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const typeParamsString =
			this.typeParams.length > 0
				? `<| ${this.typeParams.map((typeParam) => typeParam.toString()).join(', ')} |>`
				: '';
		const extendsString =
			this.extends.length > 0 ? ` extends ${this.extends.map((extend) => extend.toString()).join(', ')}` : '';
		const implementsString =
			this.implements.length > 0
				? ` implements ${this.implements.map((implement) => implement.toString()).join(', ')}`
				: '';

		return `${modifiersString}class ${this.name.toString()}${typeParamsString}${extendsString}${implementsString}{...}`;
	}
}

export class ASTDoneStatement extends AST {
	kind = 'DoneStatement';

	// factory function
	static _(): ASTDoneStatement {
		return new ASTDoneStatement();
	}

	toString(): string {
		return 'done';
	}
}

export class ASTEnumDeclaration extends ASTDeclaration {
	kind = 'EnumDeclaration';

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
		typeParams: ASTTypeParameter[];
		extends: ASTTypeExceptPrimitive[];
		body: ASTBlockStatement;
	}): ASTEnumDeclaration {
		const ast = new ASTEnumDeclaration();

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

	toString(): string {
		const modifiersString =
			this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const typeParamsString =
			this.typeParams.length > 0
				? `<| ${this.typeParams.map((typeParam) => typeParam.toString()).join(', ')} |>`
				: '';
		const extendsString =
			this.extends.length > 0 ? ` extends ${this.extends.map((extend) => extend.toString()).join(', ')}` : '';

		return `${modifiersString}enum ${this.name.toString()}${typeParamsString}${extendsString}{...}`;
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

	toString(): string {
		return `for (${this.initializer.toString()} in ${this.iterable.toString()}) {...}`;
	}
}

export class ASTFunctionDeclaration extends AST implements ASTThatHasJoeDoc, ASTThatHasModifiers, ASTThatHasTypeParams {
	kind = 'FunctionDeclaration';
	joeDoc: ASTJoeDoc | undefined;
	modifiers: ASTModifier[] = [];
	name: ASTIdentifier | undefined = undefined;
	typeParams: ASTTypeParameter[] = [];
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
		typeParams: ASTTypeParameter[];
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

	toString(): string {
		const modifiersString =
			this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const typeParamsString =
			this.typeParams.length > 0
				? `<| ${this.typeParams.map((typeParam) => typeParam.toString()).join(', ')} |>`
				: '';
		const paramsString =
			this.params.length > 0 ? `(${this.params.map((param) => param.toString()).join(', ')})` : '()';
		const returnTypesString =
			this.returnTypes.length > 0
				? ` -> ${this.returnTypes.map((returnType) => returnType.toString()).join(', ')}`
				: '';

		return `${modifiersString}f ${
			this.name?.toString() ?? ''
		}${typeParamsString}${paramsString}${returnTypesString}{...}`;
	}
}

export class ASTFunctionSignature extends AST implements ASTThatHasTypeParams {
	kind = 'FunctionSignature';
	typeParams: ASTTypeParameter[] = [];
	params: ASTParameter[] = [];
	returnTypes: ASTType[] = [];

	// factory function
	static _({
		typeParams,
		params,
		returnTypes,
	}: {
		typeParams: ASTTypeParameter[];
		params: ASTParameter[];
		returnTypes: ASTType[];
	}): ASTFunctionSignature {
		const ast = new ASTFunctionSignature();
		ast.typeParams = typeParams;
		ast.params = params;
		ast.returnTypes = returnTypes;
		return ast;
	}

	toString(): string {
		const typeParamsString =
			this.typeParams.length > 0
				? `<| ${this.typeParams.map((typeParam) => typeParam.toString()).join(', ')} |>`
				: '';
		const paramsString =
			this.params.length > 0 ? `(${this.params.map((param) => param.toString()).join(', ')})` : '()';
		const returnTypesString =
			this.returnTypes.length > 0
				? ` -> ${this.returnTypes.map((returnType) => returnType.toString()).join(', ')}`
				: '';

		return `f ${typeParamsString}${paramsString}${returnTypesString}`;
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

	toString(): string {
		const alternateString = this.alternate ? ` else {...}` : '';

		return `if ${this.test.toString()} {...}${alternateString}`;
	}
}

export class ASTImportDeclaration extends AST {
	kind = 'ImportDeclaration';
	identifier!: ASTIdentifier;
	source!: ASTPath;

	// factory function
	static _({ identifier, source }: { identifier: ASTIdentifier; source: ASTPath }): ASTImportDeclaration {
		const ast = new ASTImportDeclaration();
		ast.identifier = identifier;
		ast.source = source;
		return ast;
	}

	toString(): string {
		return `import ${this.identifier.toString()} from ${this.source.toString()}`;
	}
}

export class ASTInterfaceDeclaration extends ASTDeclaration {
	kind = 'InterfaceDeclaration';

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
		typeParams: ASTTypeParameter[];
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

	toString(): string {
		const modifiersString =
			this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const typeParamsString =
			this.typeParams.length > 0
				? `<| ${this.typeParams.map((typeParam) => typeParam.toString()).join(', ')} |>`
				: '';
		const extendsString =
			this.extends.length > 0 ? ` extends ${this.extends.map((extend) => extend.toString()).join(', ')}` : '';

		return `${modifiersString}interface ${this.name.toString()}${typeParamsString}${extendsString} {...}`;
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

	toString(): string {
		return `/** ${this.content} */`;
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

	toString(): string {
		return `loop {...}`;
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

	toString(): string {
		const propertyString = this.property.toString();

		// if the property begins with a number use brackets, otherwise use dot notation
		if (propertyString.match(/^\d/)) {
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

	toString(): string {
		return `${this.object.toString()}[${this.properties.map((property) => property.toString()).join(', ')}]`;
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

	toString(): string {
		return this.keyword;
	}
}

export class ASTNextStatement extends AST {
	kind = 'NextStatement';

	// factory function
	static _(): ASTNextStatement {
		return new ASTNextStatement();
	}

	toString(): string {
		return 'next';
	}
}

export class ASTNumberLiteral extends AST {
	kind = 'NumberLiteral';
	value!: number | ASTUnaryExpression<number>;
	declaredSize?: NumberSize = undefined;
	possibleSizes: NumberSize[] = [];

	// factory function
	static _(
		value: number | ASTUnaryExpression<number>,
		declaredSize: NumberSize | undefined,
		possibleSizes: NumberSize[],
	): ASTNumberLiteral {
		const ast = new ASTNumberLiteral();
		ast.value = value;
		ast.declaredSize = declaredSize;
		ast.possibleSizes = possibleSizes;
		return ast;
	}

	static convertNumberValueTo(value: string): Result<ASTNumberLiteral> {
		let declaredSize: NumberSize | undefined;
		let possibleSizes: NumberSize[] = [];

		// eslint-disable-next-line no-useless-escape
		const pieces = value.split(/\_/g);

		// check if there's a size suffix
		if (patterns.NUMBER_TYPE_SUFFIXES.test(value)) {
			// it has a declared size
			declaredSize = pieces.pop() as NumberSize;

			// only one possible size
			possibleSizes = [declaredSize];
		} else {
			// no declared size
			declaredSize = undefined;

			// get the possible sizes
			const determinePossibleNumberSizesResult = determinePossibleNumberSizes(value);
			if (determinePossibleNumberSizesResult.outcome === 'error') {
				return determinePossibleNumberSizesResult;
			}

			possibleSizes = determinePossibleNumberSizesResult.value;
		}

		// put value back together without underscores (and without the suffix)
		value = pieces.join('');

		// decimal
		if (value.includes('.')) {
			return ok(ASTNumberLiteral._(parseFloat(value), declaredSize, possibleSizes));
		}

		return ok(ASTNumberLiteral._(parseInt(value), declaredSize, possibleSizes));
	}

	toString(): string {
		return `${this.value.toString()}${this.declaredSize ? `_${this.declaredSize}` : ''}`;
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

	toString(): string {
		return `{${this.properties.map((property) => property.toString()).join(', ')}}`;
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

	toString(): string {
		return `{${this.properties.map((property) => property.toString()).join(', ')}}`;
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

	toString(): string {
		return `${this.key.toString()}: ${this.value.toString()}`;
	}
}

export class ASTPropertyShape extends AST {
	kind = 'PropertyShape';
	key!: ASTIdentifier;
	possibleTypes!: ASTType[];

	// factory function
	static _(key: ASTIdentifier, possibleTypes: ASTType[]): ASTPropertyShape {
		const ast = new ASTPropertyShape();
		ast.key = key;
		ast.possibleTypes = possibleTypes;
		return ast;
	}

	toString(): string {
		return `${this.key.toString()}: ${this.possibleTypes.map((type) => type.toString()).join(' | ')}`;
	}
}

export class ASTParameter extends AST {
	kind = 'Parameter';
	modifiers: ASTModifier[] = [];
	isRest = false;
	name!: ASTIdentifier;
	declaredType!: ASTType;
	defaultValue?: AssignableASTs;

	// factory function
	static _({
		modifiers,
		isRest,
		name,
		declaredType,
		defaultValue,
	}: {
		modifiers: ASTModifier[];
		isRest: boolean;
		name: ASTIdentifier;
		declaredType: ASTType;
		defaultValue?: AssignableASTs;
	}): ASTParameter {
		const ast = new ASTParameter();
		ast.modifiers = modifiers;
		ast.isRest = isRest;
		ast.name = name;
		ast.declaredType = declaredType;

		// only set if it's not undefined
		if (typeof defaultValue !== 'undefined') {
			ast.defaultValue = defaultValue;
		}

		return ast;
	}

	toString(): string {
		const modifiersString =
			this.modifiers.length > 0 ? `${this.modifiers.map((modifier) => modifier.toString()).join(' ')} ` : '';
		const restString = this.isRest ? '...' : '';
		const defaultValueString = this.defaultValue ? ` = ${this.defaultValue.toString()}` : '';

		return `${modifiersString}${restString}${this.name.toString()}: ${this.declaredType.toString()}${defaultValueString}`;
	}
}

export class ASTPath extends AST {
	kind = 'Path';
	absolute!: boolean;
	path!: string;
	isDir!: boolean;

	// factory function
	static _({ absolute, path, isDir }: { absolute: boolean; path: string; isDir: boolean }): ASTPath {
		const ast = new ASTPath();
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
	static _({ expression, test }: { expression: ExpressionASTs; test: ExpressionASTs }): ASTPostfixIfStatement {
		const ast = new ASTPostfixIfStatement();
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
	static _(expressions: ExpressionASTs[]): ASTPrintStatement {
		const ast = new ASTPrintStatement();
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
	static _({ declarations }: { declarations: AST[] }): ASTProgram {
		const ast = new ASTProgram();

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
	static _({ lower, upper }: { lower: RangeBoundASTs; upper: RangeBoundASTs }): ASTRangeExpression {
		const ast = new ASTRangeExpression();
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
	static _({ pattern, flags }: { pattern: string; flags: string[] }): ASTRegularExpression {
		const ast = new ASTRegularExpression();
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
	static _(): ASTRestElement {
		return new ASTRestElement();
	}

	toString(): string {
		return '...';
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

	toString(): string {
		return `return ${this.expressions.map((expression) => expression.toString()).join(', ')}`;
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

	toString(): string {
		return `"${this.value}"`; // TODO capture original quote style
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

	toString(): string {
		return this.value.toString();
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

	toString(): string {
		return this.expression.toString();
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

	toString(): string {
		return `${this.test.toString()} ? ${this.consequent.toString()} : ${this.alternate.toString()}`;
	}
}

export class ASTThisKeyword extends AST {
	kind = 'ThisKeyword';
	// factory function
	static _(): ASTThisKeyword {
		return new ASTThisKeyword();
	}

	toString(): string {
		return 'this';
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

	toString(): string {
		return `<${this.items.map((item) => item.toString()).join(', ')}>`;
	}
}

export class ASTTupleShape extends AST {
	kind = 'TupleShape';
	possibleTypes!: ASTType[][];

	// factory function
	static _(possibleTypes: ASTType[][]): ASTTupleShape {
		const ast = new ASTTupleShape();
		ast.possibleTypes = possibleTypes;
		return ast;
	}

	toString(): string {
		return `<${this.possibleTypes.map((types) => types.map((type) => type.toString()).join(' | ')).join(', ')}>`;
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

	toString(): string {
		return `${this.base.toString()}<| ${this.typeArgs.map((type) => type.toString()).join(', ')} |>`;
	}
}

export type primitiveAstType = 'bool' | 'path' | 'regex' | 'string';
export class ASTTypePrimitive extends AST {
	kind = 'TypePrimitive';
	type!: primitiveAstType;

	// factory function
	static _(type: primitiveAstType): ASTTypePrimitive {
		const ast = new ASTTypePrimitive();
		ast.type = type;
		return ast;
	}

	toString(): string {
		return this.type;
	}
}
export const ASTTypePrimitiveBool = new ASTTypePrimitive();
ASTTypePrimitiveBool.type = 'bool';
export const ASTTypePrimitivePath = new ASTTypePrimitive();
ASTTypePrimitivePath.type = 'path';
export const ASTTypePrimitiveRegex = new ASTTypePrimitive();
ASTTypePrimitiveRegex.type = 'regex';
export const ASTTypePrimitiveString = new ASTTypePrimitive();
ASTTypePrimitiveString.type = 'string';

export class ASTTypeNumber extends AST {
	kind = 'TypeNumber';
	size!: NumberSize;

	// factory function
	static _(size: NumberSize): ASTTypeNumber {
		const ast = new ASTTypeNumber();
		ast.size = size;
		return ast;
	}

	toString(): string {
		return `number<${this.size}>`; // these angle brackets have no special meaning
	}
}

export const NumberSizesSignedIntASTs = [
	ASTTypeNumber._('int8'),
	ASTTypeNumber._('int16'),
	ASTTypeNumber._('int32'),
	ASTTypeNumber._('int64'),
] as const;
export const NumberSizesUnsignedIntASTs = [
	ASTTypeNumber._('uint8'),
	ASTTypeNumber._('uint16'),
	ASTTypeNumber._('uint32'),
	ASTTypeNumber._('uint64'),
] as const;
export const NumberSizesIntASTs = [...NumberSizesSignedIntASTs, ...NumberSizesUnsignedIntASTs] as const;
export const NumberSizesDecimalASTs = [ASTTypeNumber._('dec32'), ASTTypeNumber._('dec64')] as const;
export const NumberSizesAllASTs = [...NumberSizesIntASTs, ...NumberSizesDecimalASTs] as const;

export class ASTTypeRange extends AST {
	kind = 'TypeRange';

	// factory function
	static _(): ASTTypeRange {
		return new ASTTypeRange();
	}

	toString(): string {
		return 'range';
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

export class ASTTypeParameter extends AST {
	kind = 'TypeParameter';
	type!: ASTType;
	constraint?: ASTType;
	defaultType?: ASTType;

	// factory function
	static _(type: ASTType, constraint?: ASTType, defaultType?: ASTType): ASTTypeParameter {
		const ast = new ASTTypeParameter();
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
	static _<T extends ExpressionASTs | boolean | number>({
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

	/** The possible types inferred from the initial value, if any */
	inferredPossibleTypes: ASTType[][] = [];

	// factory function
	static _({
		joeDoc,
		modifiers,
		mutable,
		identifiersList,
		declaredTypes,
		initialValues,
		inferredPossibleTypes,
	}: {
		joeDoc?: ASTJoeDoc;
		modifiers: ASTModifier[];
		mutable: boolean;
		identifiersList: ASTIdentifier[];
		declaredTypes: ASTType[];
		initialValues: AssignableASTs[];
		inferredPossibleTypes: ASTType[][];
	}): ASTVariableDeclaration {
		const ast = new ASTVariableDeclaration();

		// only set if it's defined
		if (typeof joeDoc !== 'undefined') {
			ast.joeDoc = joeDoc;
		}

		ast.modifiers = modifiers;
		ast.mutable = mutable;
		ast.identifiersList = identifiersList;
		ast.declaredTypes = declaredTypes;
		ast.initialValues = initialValues;
		ast.inferredPossibleTypes = inferredPossibleTypes;

		return ast;
	}

	toString(): string {
		const joedocString = this.joeDoc ? `${this.joeDoc.toString()}\n` : '';
		const modifiersString =
			this.modifiers.length > 0 ? `${this.modifiers.map((m) => m.toString()).join(' ')} ` : '';
		const mutableString = this.mutable ? 'const' : 'let';
		const identifiersString = this.identifiersList.map((i) => i.toString()).join(', ');
		const declaredTypesString =
			this.declaredTypes.length > 0 ? `: ${this.declaredTypes.map((t) => t.toString()).join(', ')}` : '';
		const initialValuesString =
			this.initialValues.length > 0 ? ` = ${this.initialValues.map((i) => i.toString()).join(', ')}` : '';

		return `${joedocString}${modifiersString}${mutableString} ${identifiersString}${declaredTypesString}${initialValuesString}`;
	}
}

export class ASTWhenCase extends AST {
	kind = 'WhenCase';
	values: Array<ASTBoolLiteral | ASTNumberLiteral | ASTRangeExpression | ASTRestElement | ASTStringLiteral> = [];
	consequent!: ASTBlockStatement | AssignableASTs;

	// factory function
	static _({
		values,
		consequent,
	}: {
		values: Array<ASTBoolLiteral | ASTNumberLiteral | ASTRangeExpression | ASTRestElement | ASTStringLiteral>;
		consequent: ASTBlockStatement | AssignableASTs;
	}): ASTWhenCase {
		const ast = new ASTWhenCase();
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
	static _({ expression, cases }: { expression: ExpressionASTs; cases: ASTWhenCase[] }): ASTWhenExpression {
		const ast = new ASTWhenExpression();
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
	if (type.constructor === ASTTypeNumber) {
		return (type as ASTTypeNumber).size;
	}

	if (type.constructor === ASTTypePrimitive) {
		return (type as ASTTypePrimitive).type;
	}

	if (type.constructor === ASTArrayOf) {
		const parentKind = (type as ASTArrayOf).kind;
		const childKind = astUniqueness((type as ASTArrayOf).type);

		return `${parentKind}<${childKind}>`;
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
