import ErrorContext from '../shared/errorContext';
import { AST } from './asts';

/**
 * Semantic error codes.
 */

export enum SemanticErrorCode {
	MainFunctionNotFound = 'S001',
	MainFunctionHasReturnType = 'S002',
	MainFunctionHasParameters = 'S003',
	MainFunctionHasTypeParameters = 'S004',
}

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
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
