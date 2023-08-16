import Context from '../shared/context';
import JoelangError from '../shared/errors/error';
import { Token } from './types';

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class LexerError extends JoelangError {
	private tokens;

	constructor(code: string, message: string, tokens: Token[], context: Context, cause?: JoelangError) {
		super(code, message, context, cause);

		this.tokens = tokens;
	}

	getTokens(): Token[] {
		return this.tokens;
	}
}
