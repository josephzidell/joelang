import { describe, expect, it } from '@jest/globals';
import assert from 'node:assert/strict';
import ParserError from './error';
import { parse } from './util';

describe('parser/error.ts', (): void => {
	it('should render a syntax error', () => {
		// arrange / act
		const result = parse('else');

		// assert
		assert(result.isError());
		const error = result.error as ParserError;
		expect(error.getContext().toStringArray(error).join('\n')).toBe(`  |
1 | else
  | ^^^^ P000: \`else\` keyword is used with if statements
  |`);
	});
});
