import { describe, expect, it } from '@jest/globals';
import assert from 'node:assert/strict';
import Context from '../shared/context';
import LexerError from './error';
import { lex } from './util';

describe('lexer/error.ts', (): void => {
	it('should render a syntax error', () => {
		// arrange / act
		const result = lex('|%');

		// assert
		assert(!result.isOk());
		const error = result.error as LexerError;
		expect(error.getContext().toStringArray(error).join('\n')).toBe(`  |
1 | |%
  | ^ L003: Syntax Error. Unknown syntax: "|"
  |`);
	});

	it('should render another syntax error', () => {
		// arrange / act
		const result = lex('$');

		// assert
		assert(result.isError());
		const error = result.error as LexerError;
		expect(error.getContext().toStringArray(error).join('\n')).toBe(`  |
1 | $
  | ^ L002: Syntax Error. Unknown character: "$"
  |`);
	});

	describe('getTokens()', () => {
		it('should return all tokens', () => {
			// arrange / act
			const result = lex('1 2 3');
			assert(result.isOk());
			const tokens = result.value;
			const error = new LexerError('L000', 'test', tokens, new Context('1 2 3', 1, 1, 5));

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
