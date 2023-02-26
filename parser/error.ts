import ErrorContext from '../shared/errorContext';
import { Node } from './types';

/**
 * All parser error codes.
 * 
 * TODO This list is not yet complete
 */
export enum ParserErrorCode {
	MisplacedKeyword,
	MissingPreviousNode,
	MissingParentNode,
}

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class ParserError extends TypeError {
	private errorCode;
	private tree;
	private context;

	constructor (errorCode: number, message: string, tree: Node, context: ErrorContext) {
		super(message);

		this.errorCode = errorCode;
		this.tree = tree;
		this.context = context;
	}

	getErrorCode (): number {
		return this.errorCode;
	}

	getTree (): Node {
		return this.tree;
	}

	getContext (): ErrorContext {
		return this.context;
	}
}
