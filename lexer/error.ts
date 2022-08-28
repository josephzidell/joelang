import { Token } from './types';

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class Error extends TypeError {
	private tokens;

	constructor (message: string, tokens: Token[]) {
		super(message);

		this.tokens = tokens;
	}

	getTokens (): Token[] {
		return this.tokens;
	}
}
