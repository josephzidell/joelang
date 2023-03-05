/**
 * This fils contains all the AST classes.
 */

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
	typeArgs!: ASTTypeArgument[];
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

export class ASTClassDeclaration implements AST {
	modifiers?: ASTModifier[];
	name!: ASTIdentifier;
	typeParams?: ASTType[];
	extends?: Array<ASTIdentifier | ASTMemberExpression | IdentifierOrMemberExpressionWithTypeArgs>;
	implements?: Array<ASTIdentifier | ASTMemberExpression | IdentifierOrMemberExpressionWithTypeArgs>;
	body?: ASTBlockStatement;

	// factory function
	static _({ modifiers, name, typeParams, extends: _extends, implements: _implements, body }: { modifiers?: ASTModifier[]; name: ASTIdentifier; typeParams?: ASTType[]; extends?: Array<ASTIdentifier | ASTMemberExpression | IdentifierOrMemberExpressionWithTypeArgs>; implements?: Array<ASTIdentifier | ASTMemberExpression | IdentifierOrMemberExpressionWithTypeArgs>; body?: ASTBlockStatement; }): ASTClassDeclaration {
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

export class ASTFunctionDeclaration implements AST {
	modifiers?: ASTModifier[];
	name?: ASTIdentifier;
	typeParams?: ASTType[];
	args?: ASTParameter[];
	returnTypes?: ASTType[];
	body?: ASTBlockStatement;

	// factory function
	static _({ modifiers, name, typeParams, args, returnTypes, body }: { modifiers?: ASTModifier[]; name?: ASTIdentifier; typeParams?: ASTType[]; args?: ASTParameter[]; returnTypes?: ASTType[]; body?: ASTBlockStatement; }): ASTFunctionDeclaration {
		const ast = new ASTFunctionDeclaration();
		ast.modifiers = modifiers;
		ast.name = name;
		ast.typeParams = typeParams;
		ast.args = args;
		ast.returnTypes = returnTypes;
		ast.body = body;
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

export class ASTInterfaceDeclaration implements AST {
	modifiers?: ASTModifier[];
	name!: ASTIdentifier;
	typeParams?: ASTType[];
	extends?: Array<ASTIdentifier | ASTMemberExpression | IdentifierOrMemberExpressionWithTypeArgs>;
	body?: ASTBlockStatement;

	// factory function
	static _({ modifiers, name, typeParams, extends: _extends, body }: { modifiers?: ASTModifier[]; name: ASTIdentifier; typeParams?: ASTType[]; extends?: Array<ASTIdentifier | ASTMemberExpression | IdentifierOrMemberExpressionWithTypeArgs>; body?: ASTBlockStatement; }): ASTInterfaceDeclaration {
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
	name!: ASTIdentifier;
	type?: ASTType;
	defaultValue?: Expression;

	// factory function
	static _({ name, type, defaultValue }: { name: ASTIdentifier; type?: ASTType; defaultValue?: Expression; }): ASTParameter {
		const ast = new ASTParameter();
		ast.name = name;
		ast.type = type;
		ast.defaultValue = defaultValue;
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
export abstract class ASTType implements AST { }
export class ASTTypeBuiltIn extends ASTType {
	definition!: 'built-in';
	type!: string;

	// factory function
	static _(type: string): ASTTypeBuiltIn {
		const ast = new ASTTypeBuiltIn();
		ast.type = type;
		return ast;
	}
}
export class ASTTypeUserDefined extends ASTType {
	definition!: 'user-defined';
	type!: ASTIdentifier | ASTMemberExpression;

	// factory function
	static _(type: ASTIdentifier | ASTMemberExpression): ASTTypeUserDefined {
		const ast = new ASTTypeUserDefined();
		ast.type = type;
		return ast;
	}
}
export const ASTTypeBuiltInBool = new ASTTypeBuiltIn();
ASTTypeBuiltInBool.type = 'bool';
export const ASTTypeBuiltInNumber = new ASTTypeBuiltIn();
ASTTypeBuiltInNumber.type = 'number';
export const ASTTypeBuiltInPath = new ASTTypeBuiltIn();
ASTTypeBuiltInPath.type = 'path';
export const ASTTypeBuiltInRegex = new ASTTypeBuiltIn();
ASTTypeBuiltInRegex.type = 'regex';
export const ASTTypeBuiltInString = new ASTTypeBuiltIn();
ASTTypeBuiltInString.type = 'string';
/** End ASTType */

export type ASTTypeArgument = ASTIdentifier | ASTMemberExpression | ASTType;

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

export class ASTVariableDeclaration implements AST {
	mutable!: boolean;
	identifier!: ASTIdentifier;

	/** The type declared by the source code, if any */
	declaredType?: ASTType;

	/** The type inferred from the initial value, if any */
	inferredType?: ASTType;

	initialValue?: AST; // TODO should specify AssignableNodeTypes;

	// factory function
	static _({ mutable, identifier, declaredType, inferredType, initialValue }: {
		mutable: boolean;
		identifier: ASTIdentifier;
		declaredType?: ASTType;
		inferredType?: ASTType;
		initialValue?: AST;
	}): ASTVariableDeclaration {
		const ast = new ASTVariableDeclaration();
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

export type IdentifierOrMemberExpressionWithTypeArgs = [ASTIdentifier | ASTMemberExpression, ASTTypeArgument[]];
export type IdentifierWithTypeParams = [ASTIdentifier, ASTType[]];
