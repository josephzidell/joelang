import ErrorContext from "../shared/errorContext";
import LexerError from "./error";
import { lexify } from "./util";
import assert from 'node:assert/strict';

describe('lexer/error.ts', (): void => {

	it('should render a syntax error', () => {
		// arrange / act
		const result = lexify('|%');

		// assert
		assert(result.outcome === 'error');
		const error = result.error as LexerError;
		expect(error.getContext().toStringArray(error.message).join("\n")).toBe(`  |
1 | |%
  | ^ Syntax Error. Unknown syntax: "|"
  |`);
	});

});