import ErrorContext from '../shared/errorContext';
import { AST } from './asts';

/**
 * Semantic error codes.
 */

export enum SemanticErrorCode {
	FunctionNotFound = 'S001',
	ReturnTypeNotExpected = 'S002',
	ParameterNotExpected = 'S003',
	TypeParametersNotExpected = 'S004',
	DuplicateIdentifier = 'S005',
	CouldNotInferType = 'S006',
	UnknownIdentifier = 'S007',
	TypeArgumentsLengthMismatch = 'S008',
	TypeArgumentNotAssignable = 'S009',
	ArgumentNotAssignable = 'S010',
	TypeNotAssignable = 'S011',
	MemberExpressionObjectNotSupported = 'S012',
	MemberExpressionNotFound = 'S013',
	ThisIsImpossible = 'S014',
	CallExpressionNotAFunction = 'S015',
	ThisUsedOutsideOfClass = 'S016',
	MemberExpressionPropertyNotFound = 'S017',
	MemberExpressionPropertyNotSupported = 'S018',
	/** TODO remove this */
	Temp = 'Temp',
}

/**
 * Custom error class so that we can display the Abstract Syntax Tree
 * which will help the user see where the Semantics checks is up to and got stuck
 */
export default class SemanticError extends TypeError {
	private errorCode;
	private ast;
	private context;

	constructor(errorCode: SemanticErrorCode, message: string, ast: AST, context: ErrorContext) {
		super(message);

		this.errorCode = errorCode;
		this.ast = ast;
		this.context = context;
	}

	getErrorCode(): SemanticErrorCode {
		return this.errorCode;
	}

	getAST(): AST {
		return this.ast;
	}

	getContext(): ErrorContext {
		return this.context;
	}
}
