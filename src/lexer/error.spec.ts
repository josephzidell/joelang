import assert from 'node:assert/strict';
import ErrorContext from '../shared/errorContext';
import LexerError from './error';
import { lex } from './util';

describe('lexer/error.ts', (): void => {
	it('should render a syntax error', () => {
		// arrange / act
		const result = lex('|%');

		// assert
		assert(result.outcome === 'error');
		const error = result.error as LexerError;
		expect(error.getContext().toStringArray(error.message).join('\n')).toBe(`  |
1 | |%
  | ^ Syntax Error. Unknown syntax: "|"
  |`);
	});

	it('should render another syntax error', () => {
		// arrange / act
		const result = lex('$');

		// assert
		assert(result.outcome === 'error');
		const error = result.error as LexerError;
		expect(error.getContext().toStringArray(error.message).join('\n')).toBe(`  |
1 | $
  | ^ Syntax Error. Unknown character: "$"
  |`);
	});

	describe('getTokens()', () => {
		it('should return all tokens', () => {
			// arrange / act
			const result = lex('1 2 3');
			assert(result.outcome === 'ok');
			const tokens = result.value;
			const error = new LexerError('test', tokens, new ErrorContext('1 2 3', 1, 1, 5));

			// assert
			expect(
				error
					.getTokens()
					.map((token) => token.value)
					.join(', '),
			).toBe('1, 2, 3');
		});
	});
});
