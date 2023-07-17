import ErrorContext from '../shared/errorContext';
import { Node } from './types';

/**
 * Parser error codes.
 */
export enum ParserErrorCode {
	MisplacedKeyword = 'P000',
	MissingPreviousNode = 'P001',
	MissingParentNode = 'P002',
	UnknownKeyword = 'P003',
	UnknownToken = 'P004',
	UnexpectedEndOfProgram = 'P005',
	UnexpectedToken = 'P006',
}

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class ParserError extends TypeError {
	private errorCode;
	private tree;
	private context;

	constructor(errorCode: ParserErrorCode, message: string, tree: Node, context: ErrorContext) {
		super(message);

		this.errorCode = errorCode;
		this.tree = tree;
		this.context = context;
	}

	getErrorCode(): ParserErrorCode {
		return this.errorCode;
	}

	getTree(): Node {
		return this.tree;
	}

	getContext(): ErrorContext {
		return this.context;
	}
}
