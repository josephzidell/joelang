/**
 * This fils contains all the AST classes.
 */

export interface ASTThatHasModifiers {
	modifiers: ASTModifier[];
}

export interface ASTThatHasRequiredBody {
	body: ASTBlockStatement;
}

export interface ASTThatHasTypeParams {
	typeParams: ASTType[];
}

export interface AST { }

export class ASTArgumentsList implements AST {
	args: AssignableASTs[] = []; // usually this is empty and thus undefined, but the parser ensures it's an array, so we mimic that here

	// factory function
	static _(args: AssignableASTs[]): ASTArgumentsList {
		const ast = new ASTArgumentsList();
		ast.args = args;
		return ast;
	}
}

export class ASTArrayExpression implements AST {
	/** The type, usually inferred from the initial value, if any, or from context */
	type?: ASTType;
	items: AssignableASTs[] = []; // usually this would be empty and thus undefined, but the parser ensures it's an array, so we mimic that here

	// factory function
	static _({ type, items }: { type?: ASTType; items: AssignableASTs[]; }): ASTArrayExpression {
		const ast = new ASTArrayExpression();
		ast.type = type;
		ast.items = items;
		return ast;
	}
}

export class ASTBinaryExpression<L, R> implements AST {
	operator!: string;
	left!: L;
	right!: R;

	// factory function
	static _<L, R>({ operator, left, right }: { operator: string; left: L; right: R; }): ASTBinaryExpression<L, R> {
		const ast = new ASTBinaryExpression<L, R>();
		ast.operator = operator;
		ast.left = left;
		ast.right = right;
		return ast;
	}
}

export class ASTBlockStatement implements AST {
	expressions: AST[] = [];

	// factory function
	static _(expressions: AST[]): ASTBlockStatement {
		const ast = new ASTBlockStatement();
		ast.expressions = expressions;
		return ast;
	}
}

export class ASTBoolLiteral implements AST {
	value!: boolean | ASTUnaryExpression<boolean>;

	// factory function
	static _(value: boolean | ASTUnaryExpression<boolean>): ASTBoolLiteral {
		const ast = new ASTBoolLiteral();
		ast.value = value;
		return ast;
	}
}

export class ASTCallExpression implements AST {
	callee!: ASTIdentifier | ASTMemberExpression;
	typeArgs!: ASTType[];
	args!: Expression[];

	// factory function
	static _({ callee, typeArgs, args }: { callee: ASTIdentifier | ASTMemberExpression; typeArgs?: ASTType[]; args: Expression[]; }): ASTCallExpression {
		const ast = new ASTCallExpression();
		ast.callee = callee;

		if (typeArgs) {
			ast.typeArgs = typeArgs;
		}

		ast.args = args;
		return ast;
	}
}

export class ASTClassDeclaration implements AST, ASTThatHasModifiers, ASTThatHasRequiredBody, ASTThatHasTypeParams {
	modifiers: ASTModifier[] = [];
	name!: ASTIdentifier;
	typeParams: ASTType[] = [];
	extends: ASTTypeExceptPrimitive[] = [];
	implements: ASTTypeExceptPrimitive[] = [];
	body!: ASTBlockStatement;

	// factory function
	static _({ modifiers, name, typeParams, extends: _extends, implements: _implements, body }: {
		modifiers: ASTModifier[];
		name: ASTIdentifier;
		typeParams: ASTType[];
		extends: ASTTypeExceptPrimitive[];
		implements: ASTTypeExceptPrimitive[];
		body: ASTBlockStatement;
	}): ASTClassDeclaration {
		const ast = new ASTClassDeclaration();
		ast.modifiers = modifiers;
		ast.name = name;
		ast.typeParams = typeParams;
		ast.extends = _extends;
		ast.implements = _implements;
		ast.body = body;
		return ast;
	}
}

export class ASTFunctionDeclaration implements AST, ASTThatHasModifiers, ASTThatHasTypeParams {
	modifiers: ASTModifier[] = [];
	name: ASTIdentifier | undefined = undefined;
	typeParams: ASTType[] = [];
	params: ASTParameter[] = [];
	returnTypes: ASTType[] = [];
	body: ASTBlockStatement | undefined = undefined;

	// factory function
	static _({ modifiers, name, typeParams, params, returnTypes, body }: {
		modifiers: ASTModifier[];
		name: ASTIdentifier | undefined;
		typeParams: ASTType[];
		params: ASTParameter[];
		returnTypes: ASTType[];
		body: ASTBlockStatement | undefined;
	}): ASTFunctionDeclaration {
		const ast = new ASTFunctionDeclaration();
		ast.modifiers = modifiers;
		ast.name = name;
		ast.typeParams = typeParams;
		ast.params = params;
		ast.returnTypes = returnTypes;
		ast.body = body;
		return ast;
	}
}

export class ASTFunctionType implements AST, ASTThatHasTypeParams {
	typeParams: ASTType[] = [];
	params: ASTParameter[] = [];
	returnTypes: ASTType[] = [];

	// factory function
	static _({ typeParams, params, returnTypes }: {
		typeParams: ASTType[];
		params: ASTParameter[];
		returnTypes: ASTType[];
	}): ASTFunctionType {
		const ast = new ASTFunctionType();
		ast.typeParams = typeParams;
		ast.params = params;
		ast.returnTypes = returnTypes;
		return ast;
	}
}

export class ASTIdentifier implements AST {
	name!: string;

	// factory function
	static _(name: string): ASTIdentifier {
		const ast = new ASTIdentifier();
		ast.name = name;
		return ast;
	}
}

export class ASTInterfaceDeclaration implements AST, ASTThatHasModifiers, ASTThatHasRequiredBody, ASTThatHasTypeParams {
	modifiers: ASTModifier[] = [];
	name!: ASTIdentifier;
	typeParams: ASTType[] = [];
	extends: ASTTypeExceptPrimitive[] = [];
	body!: ASTBlockStatement;

	// factory function
	static _({ modifiers, name, typeParams, extends: _extends, body }: {
		modifiers: ASTModifier[];
		name: ASTIdentifier;
		typeParams: ASTType[];
		extends: ASTTypeExceptPrimitive[];
		body: ASTBlockStatement;
	}): ASTInterfaceDeclaration {
		const ast = new ASTInterfaceDeclaration();
		ast.modifiers = modifiers;
		ast.name = name;
		ast.typeParams = typeParams;
		ast.extends = _extends;
		ast.body = body;
		return ast;
	}
}

export class ASTMemberExpression implements AST {
	object!: ASTIdentifier | ASTMemberExpression; // TODO add ASTCallExpression
	property!: ASTIdentifier;

	// factory function
	static _({ object, property }: { object: ASTIdentifier | ASTMemberExpression; property: ASTIdentifier; }): ASTMemberExpression {
		const ast = new ASTMemberExpression();
		ast.object = object;
		ast.property = property;
		return ast;
	}
}

export class ASTModifier implements AST {
	keyword!: string;

	// factory function
	static _(keyword: string): ASTModifier {
		const ast = new ASTModifier();
		ast.keyword = keyword;
		return ast;
	}
}

export class ASTNumberLiteral implements AST {
	format!: 'int' | 'decimal';
	value!: number | ASTUnaryExpression<number>;

	// factory function
	static _({ format, value }: { format: 'int' | 'decimal'; value: number | ASTUnaryExpression<number>; }): ASTNumberLiteral {
		const ast = new ASTNumberLiteral();
		ast.format = format;
		ast.value = value;
		return ast;
	}
}

export class ASTObjectExpression implements AST { }

export class ASTParameter implements AST {
	modifiers: ASTModifier[] = [];
	isRest = false;
	name!: ASTIdentifier;

	/** The type declared by the source code, if any */
	declaredType?: ASTType;

	/** The type inferred from the initial value, if any */
	inferredType?: ASTType;

	defaultValue?: AssignableASTs;

	// factory function
	static _({ modifiers, isRest, name, declaredType, inferredType, defaultValue }: {
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

		if (declaredType) { // only set if it's not undefined
			ast.declaredType = declaredType;
		}

		if (inferredType) { // only set if it's not undefined
			ast.inferredType = inferredType;
		}

		if (defaultValue) { // only set if it's not undefined
			ast.defaultValue = defaultValue;
		}

		return ast;
	}
}

export class ASTPath implements AST {
	absolute!: boolean;
	path!: string;
	isDir!: boolean;

	// factory function
	static _({ absolute, path, isDir }: { absolute: boolean; path: string; isDir: boolean; }): ASTPath {
		const ast = new ASTPath();
		ast.absolute = absolute;
		ast.path = path;
		ast.isDir = isDir;
		return ast;
	}
}

/** It's just a kind of BlockStatement */
export class ASTProgram extends ASTBlockStatement {}

export class ASTRegularExpression implements AST {
	pattern!: string;
	flags!: string[];

	// factory function
	static _({ pattern, flags }: { pattern: string; flags: string[]; }): ASTRegularExpression {
		const ast = new ASTRegularExpression();
		ast.pattern = pattern;
		ast.flags = flags;
		return ast;
	}
}

export class ASTReturnStatement implements AST {
	expressions: AssignableASTs[] = [];

	// factory function
	static _(expressions: AssignableASTs[]): ASTReturnStatement {
		const ast = new ASTReturnStatement();
		ast.expressions = expressions;
		return ast;
	}
}

export class ASTStringLiteral implements AST {
	value!: string;

	// factory function
	static _(value: string): ASTStringLiteral {
		const ast = new ASTStringLiteral();
		ast.value = value;
		return ast;
	}
}

export class ASTTupleExpression implements AST { }

/** Begin ASTType */
export class ASTTypePrimitive {
	type!: string;

	// factory function
	static _(type: string): ASTTypePrimitive {
		const ast = new ASTTypePrimitive();
		ast.type = type;
		return ast;
	}
}
export class ASTTypeInstantiationExpression {
	base!: ASTIdentifier | ASTMemberExpression;
	typeArgs: ASTType[] = [];

	// factory function
	static _({ base, typeArgs }: {
		base: ASTIdentifier | ASTMemberExpression;
		typeArgs: ASTType[];
	}): ASTTypeInstantiationExpression {
		const ast = new ASTTypeInstantiationExpression();
		ast.base = base;
		ast.typeArgs = typeArgs;
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

export type ASTTypeExceptPrimitive = ASTFunctionType | ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression;
export type ASTType = ASTTypePrimitive | ASTTypeExceptPrimitive;
/** End ASTType */

export class ASTUnaryExpression<T> implements AST {
	before!: boolean;
	operator!: string;
	operand!: T;

	// factory function
	static _<T>({ before, operator, operand }: { before: boolean; operator: string; operand: T; }): ASTUnaryExpression<T> {
		const ast = new ASTUnaryExpression<T>();
		ast.before = before;
		ast.operator = operator;
		ast.operand = operand;
		return ast;
	}
}

export class ASTWhenExpression implements AST { }

export class ASTVariableDeclaration implements AST, ASTThatHasModifiers {
	modifiers: ASTModifier[] = [];
	mutable!: boolean;
	identifier!: ASTIdentifier;

	/** The type declared by the source code, if any */
	declaredType?: ASTType;

	/** The type inferred from the initial value, if any */
	inferredType?: ASTType;

	initialValue?: AssignableASTs;

	// factory function
	static _({ modifiers, mutable, identifier, declaredType, inferredType, initialValue }: {
		modifiers: ASTModifier[];
		mutable: boolean;
		identifier: ASTIdentifier;
		declaredType?: ASTType;
		inferredType?: ASTType;
		initialValue?: AssignableASTs;
	}): ASTVariableDeclaration {
		const ast = new ASTVariableDeclaration();
		ast.modifiers = modifiers;
		ast.mutable = mutable;
		ast.identifier = identifier;

		if (declaredType) { // only set if it's not undefined
			ast.declaredType = declaredType;
		}

		if (inferredType) { // only set if it's not undefined
			ast.inferredType = inferredType;
		}

		if (initialValue) { // only set if it's not undefined
			ast.initialValue = initialValue;
		}

		return ast;
	}
}
// noop
export class Skip implements AST { }

/** ASTs that can be used in UnaryExpressions and BinaryExpressions */
export type Expression =
	ASTArrayExpression |
	ASTBinaryExpression<Expression, Expression> |
	ASTBoolLiteral |
	ASTCallExpression |
	ASTIdentifier |
	ASTMemberExpression |
	ASTNumberLiteral |
	ASTObjectExpression |
	ASTPath |
	ASTRegularExpression |
	ASTStringLiteral |
	ASTTupleExpression |
	ASTUnaryExpression<Expression> |
	ASTWhenExpression;

	/** ASTs that can be assigned to a variable or passed as an argument */
export type AssignableASTs = Expression | ASTFunctionDeclaration;
