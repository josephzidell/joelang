import ErrorContext from '../shared/errorContext';
import { Token } from './types';

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class LexerError extends TypeError {
	private tokens;
	private context;

	constructor(message: string, tokens: Token[], context: ErrorContext) {
		super(message);

		this.tokens = tokens;
		this.context = context;
	}

	getTokens(): Token[] {
		return this.tokens;
	}

	getContext(): ErrorContext {
		return this.context;
	}
}
