import ErrorContext from '../shared/errorContext';
import { SymNode } from './symbolTable';

/**
 * Symbol error codes.
 */
export enum SymbolErrorCode {
	SymNodeNotFound = 'SY001',
	AtTopAndNotExpectingToBe = 'SY002',
	DuplicateIdentifier = 'SY003',
	UnknownSymbol = 'SY004',
}

/**
 * Custom error class so that we can display the Symbol Node and Table
 * which will help the user see where the IR Converter is up to and got stuck
 */
export default class SymbolError extends TypeError {
	private errorCode;
	private symNode: SymNode;
	private context;

	constructor(errorCode: SymbolErrorCode, message: string, symNode: SymNode, context: ErrorContext) {
		super(message);

		this.errorCode = errorCode;
		this.symNode = symNode;
		this.context = context;
	}

	getErrorCode(): SymbolErrorCode {
		return this.errorCode;
	}

	getSymNode(): SymNode {
		return this.symNode;
	}

	getContext(): ErrorContext {
		return this.context;
	}
}
