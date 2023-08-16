import Context from '../shared/context';
import JoelangError from '../shared/errors/error';
import { BitCount, NumberCat, NumberSize } from '../shared/numbers/sizes';
import {
	AST,
	ASTIdentifier,
	ASTReturnStatement,
	ASTType,
	ASTTypeInstantiationExpression,
	AssignableASTs,
	ExpressionASTs,
	MemberExpressionObjectASTs,
} from './asts';
import { SymbolKind } from './symbolTable';

/**
 * Custom error class so that we can display the Abstract Syntax Tree
 * which will help the user see where the Semantics checks is up to and got stuck
 */
export default class SemanticError extends JoelangError {
	/** TODO this is temporary while Joelang is being built */
	static TODOThisIsTemp = (yourMsg: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('Temp', `Semantic: TODO: ${yourMsg}`, ast, ctx || new Context(ast.toString(), ast), cause);

	/** Msg: `${what} '${name}' not found` */
	static NotFound = (what: string, name: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S001', `${what} ${name} not found`, ast, ctx, cause);
	/** `${funcName} cannot have a return type` */
	static ReturnTypeNotExpected = (funcName: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S002', `${funcName} cannot have a return type`, ast, ctx, cause);
	/** msg: `${funcName} cannot have parameters` */
	static ParameterNotExpected = (funcName: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S003', `${funcName} cannot have parameters`, ast, ctx, cause);
	/** msg: `${funcName} cannot have type parameters` */
	static TypeParametersNotExpected = (funcName: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S004', `${funcName} cannot have type parameters`, ast, ctx, cause);
	/** msg: `Semantic: Duplicate identifier found ${name}` */
	static DuplicateIdentifier = (name: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S005', `Semantic: Duplicate identifier found ${name}`, ast, ctx, cause);
	/** msg: `We could not infer the type of this ${ofThis}` */
	static CouldNotInferType = (ofThis: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S006', `We could not infer the type of this ${ofThis}`, ast, ctx, cause);
	/** msg: `We don't recognize ${identifierName}` */
	static UnrecognizedIdentifier = (identifierName: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S007', `We don't recognize ${identifierName}`, ast, ctx, cause);
	/** msg: `Semantic: Expected ${numExpected} ${what}, but got ${numActual}` */
	static TypeArgumentsLengthMismatch = (
		numExpected: number,
		numActual: number,
		what: string,
		ast: AST,
		ctx: Context,
		cause?: JoelangError,
	) => new SemanticError('S008', `Semantic: Expected ${numExpected} ${what}, but got ${numActual}`, ast, ctx, cause);

	static NotAssignable = {
		// values
		/** msg: `Semantic: Argument ${expr} is not assignable to a ${type}` */
		Argument: (expr: AssignableASTs, type: ASTType, ast: AST, ctx: Context, cause?: JoelangError) =>
			new SemanticError('S010', `Semantic: Argument ${expr} is not assignable to a ${type}`, ast, ctx, cause),
		/** msg: `Semantic: value ${expr} is not assignable to a ${type}` */
		Value: (expr: AssignableASTs, type: ASTType, ast: AST, ctx: Context, cause?: JoelangError) =>
			new SemanticError('S010', `Semantic: value ${expr} is not assignable to a ${type}`, ast, ctx, cause),

		// types
		/** msg: `Semantic: Cannot assign ${from} number to ${to}` */
		NumberCat: (from: NumberCat, to: NumberCat, ast: AST, ctx: Context, cause?: JoelangError) =>
			new SemanticError('S022', `Semantic: Cannot assign ${from} number to ${to}`, ast, ctx, cause),
		/** msg: `Semantic: Cannot assign a ${from}-bit number to a ${to}-bit` */
		NumberBits: (from: BitCount, to: BitCount, ast: AST, ctx: Context, cause?: JoelangError) =>
			new SemanticError('S023', `Semantic: Cannot assign a ${from}-bit number to a ${to}-bit`, ast, ctx, cause),
		/** msg: `Semantic: Type argument ${from} is not assignable to type parameter ${to}` */
		TypeArgument: (from: ASTType, to: ASTType, ast: AST, ctx: Context, cause?: JoelangError) =>
			new SemanticError('S009', `Semantic: Type argument ${from} is not assignable to type parameter ${to}`, ast, ctx, cause),
		/** msg: `Semantic: Type ${value} is not assignable to type ${type}` */
		Type: (from: ASTType, to: ASTType, ast: AST, ctx: Context, cause?: JoelangError) =>
			new SemanticError('S011', `Semantic: Type ${from.toString()} is not assignable to type ${to.toString()}`, ast, ctx, cause),
	};

	/** msg: `Semantic: Member expression object ${obj} not supported` */
	static MemberExpressionObjectNotSupported = (obj: MemberExpressionObjectASTs, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S012', `Semantic: Member expression object ${obj} not supported`, ast, ctx, cause);
	/** msg: `Impossible: ${mission} */
	static Impossible = (mission: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S013', mission, ast, ctx, cause);
	/** msg: `Cannot call '${callee}' because it is not a function` */
	static CallExpressionNotAFunction = (callee: string, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S014', `Cannot call '${callee}' because it is not a function`, ast, ctx, cause);
	/** msg: `We can't use the "this" keyword outside of a Class` */
	static ThisUsedOutsideOfClass = (ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S015', `We can't use the "this" keyword outside of a Class`, ast, ctx, cause);
	/** msg: `Semantic: Class property kind ${symbolKind} not supported` */
	static ClassPropertyKindNotSupported = (symbolKind: SymbolKind, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S016', `Semantic: Class property kind ${symbolKind} not supported`, ast, ctx, cause);
	/** msg: 'Semantic: A rest parameter must be the last one' */
	static RestParameterMustBeAtEnd = (ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S017', 'Semantic: A rest parameter must be the last one', ast, ctx, cause);
	/** msg: `Semantic: ${expr} cannot be converted to a ${type}` */
	static CastNotDefined = (expr: ExpressionASTs, type: ASTType, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S018', `Semantic: ${expr.toString()} cannot be converted to a ${type.toString()}`, ast, ctx, cause);
	/** msg: `Semantic: Cannot negate a ${size} number` */
	static CannotNegateUnsignedNumber = (size: NumberSize, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S019', `Semantic: Cannot negate a ${size} number`, ast, ctx, cause);
	/** msg: `We can't use the "this" keyword outside of a Class` */
	static ParentUsedInClassWithoutParent = (ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S020', `"parent" used in a class without a parent`, ast, ctx, cause);
	/** msg: `Semantic: Member expression property ${prop} not supported` */
	static MemberExpressionPropertyNotSupported = (prop: AST, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S021', `Semantic: Member expression property ${prop.constructor.name} not supported`, ast, ctx, cause);
	/** msg: `Semantic: ${fraudster} is not a class` */
	static NotAClass = (fraudster: AST, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S024', `Semantic: ${fraudster} is not a class`, ast, ctx, cause);
	/** msg: `Semantic: ${fraudster} is not an enum` */
	static NotAnEnum = (fraudster: AST, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S025', `Semantic: ${fraudster} is not an enum`, ast, ctx, cause);
	/** msg: `Semantic: ${fraudster} is not an interface` */
	static NotAnInterface = (fraudster: AST, ast: AST, ctx: Context, cause?: JoelangError) =>
		new SemanticError('S026', `Semantic: ${fraudster} is not an interface`, ast, ctx, cause);
	static ParentMustHaveOneTypeArgument = (ast: ASTTypeInstantiationExpression, ctx: Context) =>
		new SemanticError('S027', `Semantic: Parent must have one type argument`, ast, ctx);
	static ParentUsedOutsideOfClass = (ast: ASTTypeInstantiationExpression, ctx: Context) =>
		new SemanticError('S028', `Semantic: Parent used outside of a class`, ast, ctx);
	static ClassNotFound = (ast: ASTTypeInstantiationExpression, ctx: Context) =>
		new SemanticError('S029', `Semantic: Class not found`, ast, ctx);
	/** msg: `Semantic: We cannot return from a returnless function` */
	static CannotReturnAReturnlessFunction = (ast: ASTReturnStatement, ctx: Context) =>
		new SemanticError('S030', `Semantic: We cannot return from a returnless function`, ast, ctx);
	/** msg: `Semantic: ${identifier.name} needs a type` */
	static VariableDeclarationTypeNotDefined = (identifier: ASTIdentifier, ctx: Context) =>
		new SemanticError('S031', `Semantic: ${identifier.name} needs a type`, identifier, ctx);

	private ast;

	/** Instances should be created only via static, pre-defined variables. */
	private constructor(code: string, message: string, ast: AST, ctx: Context, cause?: JoelangError) {
		super(code, message, ctx, cause);

		this.ast = ast;
	}

	getAST(): AST {
		return this.ast;
	}
}
