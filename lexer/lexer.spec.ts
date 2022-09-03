import Lexer from "./lexer";
import { keywords } from "./types";

describe('lexer.ts', (): void => {
	describe('keywords', (): void => {
		it.each(keywords)('%s is recognized as a keyword', (keyword) => {
			expect(new Lexer().lexify(keyword)).toStrictEqual([
				{ type: 'keyword', start: 0, end: keyword.length, value: keyword, line: 1, col: 1 },
			]);
		});
	});

	describe('bools', (): void => {
		it('true', (): void => {
			expect(new Lexer().lexify('let foo = true')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 3, value: 'let', line: 1, col: 1 },
				{ type: 'identifier', start: 4, end: 7, value: 'foo', line: 1, col: 5 },
				{ type: 'assign', start: 8, end: 9, value: '=', line: 1, col: 9 },
				{ type: 'bool', start: 10, end: 14, value: 'true', line: 1, col: 11 },
			]);
		});

		it('false', (): void => {
			expect(new Lexer().lexify('let foo = false')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 3, value: 'let', line: 1, col: 1 },
				{ type: 'identifier', start: 4, end: 7, value: 'foo', line: 1, col: 5 },
				{ type: 'assign', start: 8, end: 9, value: '=', line: 1, col: 9 },
				{ type: 'bool', start: 10, end: 15, value: 'false', line: 1, col: 11 },
			]);
		});
	});

	describe('comments', (): void => {
		it('single-line with hash', (): void => {
			expect(new Lexer().lexify('# foo')).toStrictEqual([
				{ type: 'comment', start: 0, end: 5, value: '# foo', line: 1, col: 1 },
			]);
		});

		it('single-line with slash', (): void => {
			expect(new Lexer().lexify('// foo')).toStrictEqual([
				{ type: 'comment', start: 0, end: 6, value: '// foo', line: 1, col: 1 },
			]);
		});

		it('multiline', (): void => {
			expect(new Lexer().lexify('/* foo \n * bar\n */')).toStrictEqual([
				{ type: 'comment', start: 0, end: 18, value: '/* foo \n * bar\n */', line: 1, col: 1 },
			]);
		});
	});

	describe('identifiers', (): void => {
		it('should work with lower case letters, upper case letters, and numbers', (): void => {
			expect(new Lexer().lexify('aR_g1')).toStrictEqual([
				{ type: 'identifier', start: 0, end: 5, value: 'aR_g1', line: 1, col: 1 },
			]);
		});
	});

	describe('line and col counts', (): void => {
		it('works as it should', (): void => {
			expect(new Lexer().lexify(" foo ? \n''\n   23^e5")).toStrictEqual([
				{ type: 'identifier', start: 1, end: 4, value: 'foo', line: 1, col: 2 },
				{ type: 'question', start: 5, end: 6, value: '?', line: 1, col: 6 },
				{ type: 'string', start: 8, end: 10, value: '', line: 2, col: 1 },
				{ type: 'number', start: 14, end: 16, value: '23', line: 3, col: 4 },
				{ type: 'caret_exponent', start: 16, end: 18, value: '^e', line: 3, col: 6 },
				{ type: 'number', start: 18, end: 19, value: '5', line: 3, col: 8 },
			])
		});
	});

	describe('numbers', (): void => {
		it('small number', (): void => {
			expect(new Lexer().lexify('51')).toStrictEqual([
				{ type: 'number', start: 0, end: 2, value: '51', line: 1, col: 1 },
			]);
		});

		it('number with comma', (): void => {
			expect(new Lexer().lexify('51,000')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '51,000', line: 1, col: 1 },
			]);
		});

		it('number with a decimal', (): void => {
			expect(new Lexer().lexify('100001.0002')).toStrictEqual([
				{ type: 'number', start: 0, end: 11, value: '100001.0002', line: 1, col: 1 },
			]);
		});

		it('number with exponent', (): void => {
			expect(new Lexer().lexify('100001^e23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001', line: 1, col: 1 },
				{ type: 'caret_exponent', start: 6, end: 8, value: '^e', line: 1, col: 7 },
				{ type: 'number', start: 8, end: 10, value: '23', line: 1, col: 9 },
			]);
		});

		it('number with negative exponent', (): void => {
			expect(new Lexer().lexify('100001^e-23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001', line: 1, col: 1 },
				{ type: 'caret_exponent', start: 6, end: 8, value: '^e', line: 1, col: 7 },
				{ type: 'minus', start: 8, end: 9, value: '-', line: 1, col: 9 },
				{ type: 'number', start: 9, end: 11, value: '23', line: 1, col: 10 },
			]);
		});

		it('number with broken exponent', (): void => {
			expect(new Lexer().lexify('100001^23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001', line: 1, col: 1 },
				{ type: 'caret', start: 6, end: 7, value: '^', line: 1, col: 7 },
				{ type: 'number', start: 7, end: 9, value: '23', line: 1, col: 8 },
			]);

			expect(new Lexer().lexify('100001e23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001', line: 1, col: 1 },
				{ type: 'identifier', start: 6, end: 9, value: 'e23', line: 1, col: 7 },
			]);
		});

		it('assigning small number', (): void => {
			expect(new Lexer().lexify('let foo = 51')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 3, value: 'let', line: 1, col: 1 },
				{ type: 'identifier', start: 4, end: 7, value: 'foo', line: 1, col: 5 },
				{ type: 'assign', start: 8, end: 9, value: '=', line: 1, col: 9 },
				{ type: 'number', start: 10, end: 12, value: '51', line: 1, col: 11 },
			]);
		});

		it('assigning const', (): void => {
			expect(new Lexer().lexify('const foo = 51')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 5, value: 'const', line: 1, col: 1 },
				{ type: 'identifier', start: 6, end: 9, value: 'foo', line: 1, col: 7 },
				{ type: 'assign', start: 10, end: 11, value: '=', line: 1, col: 11 },
				{ type: 'number', start: 12, end: 14, value: '51', line: 1, col: 13 },
			]);
		});
	});

	describe('operators', (): void => {
		describe('logic', (): void => {
			it('double pipe', (): void => {
				expect(new Lexer().lexify('||')).toStrictEqual([
					{ type: 'or', start: 0, end: 2, value: '||', line: 1, col: 1 },
				]);

				expect(new Lexer().lexify('a || true')).toStrictEqual([
					{ type: 'identifier', start: 0, end: 1, value: 'a', line: 1, col: 1 },
					{ type: 'or', start: 2, end: 4, value: '||', line: 1, col: 3 },
					{ type: 'bool', start: 5, end: 9, value: 'true', line: 1, col: 6 },
				]);
			});

			it('double ampersand', (): void => {
				expect(new Lexer().lexify('&&')).toStrictEqual([
					{ type: 'and', start: 0, end: 2, value: '&&', line: 1, col: 1 },
				]);

				expect(new Lexer().lexify('a && true')).toStrictEqual([
					{ type: 'identifier', start: 0, end: 1, value: 'a', line: 1, col: 1 },
					{ type: 'and', start: 2, end: 4, value: '&&', line: 1, col: 3 },
					{ type: 'bool', start: 5, end: 9, value: 'true', line: 1, col: 6 },
				]);
			});
		});

		describe('unary expressions', (): void => {
			it('negative number', (): void => {
				expect(new Lexer().lexify('-1')).toStrictEqual([
					{ type: 'minus', start: 0, end: 1, value: '-', line: 1, col: 1 },
					{ type: 'number', start: 1, end: 2, value: '1', line: 1, col: 2 },
				]);
			});

			it('negative number with parens', (): void => {
				expect(new Lexer().lexify('(-1)')).toStrictEqual([
					{ type: 'paren_open', start: 0, end: 1, value: '(', line: 1, col: 1 },
					{ type: 'minus', start: 1, end: 2, value: '-', line: 1, col: 2 },
					{ type: 'number', start: 2, end: 3, value: '1', line: 1, col: 3 },
					{ type: 'paren_close', start: 3, end: 4, value: ')', line: 1, col: 4 },
				]);
			});

			it('pre-decrement', (): void => {
				expect(new Lexer().lexify('--foo')).toStrictEqual([
					{ type: 'minus_minus', start: 0, end: 2, value: '--', line: 1, col: 1 },
					{ type: 'identifier', start: 2, end: 5, value: 'foo', line: 1, col: 3 },
				]);
			});

			it('post-decrement', (): void => {
				expect(new Lexer().lexify('foo--')).toStrictEqual([
					{ type: 'identifier', start: 0, end: 3, value: 'foo', line: 1, col: 1 },
					{ type: 'minus_minus', start: 3, end: 5, value: '--', line: 1, col: 4 },
				]);
			});

			it('pre-increment', (): void => {
				expect(new Lexer().lexify('++foo')).toStrictEqual([
					{ type: 'plus_plus', start: 0, end: 2, value: '++', line: 1, col: 1 },
					{ type: 'identifier', start: 2, end: 5, value: 'foo', line: 1, col: 3 },
				]);
			});

			it('post-increment', (): void => {
				expect(new Lexer().lexify('foo++')).toStrictEqual([
					{ type: 'identifier', start: 0, end: 3, value: 'foo', line: 1, col: 1 },
					{ type: 'plus_plus', start: 3, end: 5, value: '++', line: 1, col: 4 },
				]);
			});
		});
	});

	describe('surrounding characters', (): void => {
		describe('brackets', (): void => {
			it('with nothing between', (): void => {
				expect(new Lexer().lexify('[]')).toStrictEqual([
					{ type: 'bracket_open', start: 0, end: 1, value: '[', line: 1, col: 1 },
					{ type: 'bracket_close', start: 1, end: 2, value: ']', line: 1, col: 2 },
				]);
			});

			it('with something between', (): void => {
				expect(new Lexer().lexify('[foo]')).toStrictEqual([
					{ type: 'bracket_open', start: 0, end: 1, value: '[', line: 1, col: 1 },
					{ type: 'identifier', start: 1, end: 4, value: 'foo', line: 1, col: 2 },
					{ type: 'bracket_close', start: 4, end: 5, value: ']', line: 1, col: 5 },
				]);
			});

			it('two sets with nested', (): void => {
				expect(new Lexer().lexify('[[]][]')).toStrictEqual([
					{ type: 'bracket_open', start: 0, end: 1, value: '[', line: 1, col: 1 },
					{ type: 'bracket_open', start: 1, end: 2, value: '[', line: 1, col: 2 },
					{ type: 'bracket_close', start: 2, end: 3, value: ']', line: 1, col: 3 },
					{ type: 'bracket_close', start: 3, end: 4, value: ']', line: 1, col: 4 },
					{ type: 'bracket_open', start: 4, end: 5, value: '[', line: 1, col: 5 },
					{ type: 'bracket_close', start: 5, end: 6, value: ']', line: 1, col: 6 },
				]);
			});
		});

		describe('braces', (): void => {
			it('with nothing between', (): void => {
				expect(new Lexer().lexify('{}')).toStrictEqual([
					{ type: 'brace_open', start: 0, end: 1, value: '{', line: 1, col: 1 },
					{ type: 'brace_close', start: 1, end: 2, value: '}', line: 1, col: 2 },
				]);
			});

			it('with something between', (): void => {
				expect(new Lexer().lexify('{foo}')).toStrictEqual([
					{ type: 'brace_open', start: 0, end: 1, value: '{', line: 1, col: 1 },
					{ type: 'identifier', start: 1, end: 4, value: 'foo', line: 1, col: 2 },
					{ type: 'brace_close', start: 4, end: 5, value: '}', line: 1, col: 5 },
				]);
			});

			it('two sets with nested', (): void => {
				expect(new Lexer().lexify('{{}}{}')).toStrictEqual([
					{ type: 'brace_open', start: 0, end: 1, value: '{', line: 1, col: 1 },
					{ type: 'brace_open', start: 1, end: 2, value: '{', line: 1, col: 2 },
					{ type: 'brace_close', start: 2, end: 3, value: '}', line: 1, col: 3 },
					{ type: 'brace_close', start: 3, end: 4, value: '}', line: 1, col: 4 },
					{ type: 'brace_open', start: 4, end: 5, value: '{', line: 1, col: 5 },
					{ type: 'brace_close', start: 5, end: 6, value: '}', line: 1, col: 6 },
				]);
			});
		});

		describe('parens', (): void => {
			it('with nothing between', (): void => {
				expect(new Lexer().lexify('()')).toStrictEqual([
					{ type: 'paren_open', start: 0, end: 1, value: '(', line: 1, col: 1 },
					{ type: 'paren_close', start: 1, end: 2, value: ')', line: 1, col: 2 },
				]);
			});

			it('with something between', (): void => {
				expect(new Lexer().lexify('(foo)')).toStrictEqual([
					{ type: 'paren_open', start: 0, end: 1, value: '(', line: 1, col: 1 },
					{ type: 'identifier', start: 1, end: 4, value: 'foo', line: 1, col: 2 },
					{ type: 'paren_close', start: 4, end: 5, value: ')', line: 1, col: 5 },
				]);
			});

			it('two sets with nested', (): void => {
				expect(new Lexer().lexify('(())()')).toStrictEqual([
					{ type: 'paren_open', start: 0, end: 1, value: '(', line: 1, col: 1 },
					{ type: 'paren_open', start: 1, end: 2, value: '(', line: 1, col: 2 },
					{ type: 'paren_close', start: 2, end: 3, value: ')', line: 1, col: 3 },
					{ type: 'paren_close', start: 3, end: 4, value: ')', line: 1, col: 4 },
					{ type: 'paren_open', start: 4, end: 5, value: '(', line: 1, col: 5 },
					{ type: 'paren_close', start: 5, end: 6, value: ')', line: 1, col: 6 },
				]);
			});
		});

		describe('mixtures', (): void => {
			it('works', (): void => {
				expect(new Lexer().lexify('([])')).toStrictEqual([
					{ type: 'paren_open', start: 0, end: 1, value: '(', line: 1, col: 1 },
					{ type: 'bracket_open', start: 1, end: 2, value: '[', line: 1, col: 2 },
					{ type: 'bracket_close', start: 2, end: 3, value: ']', line: 1, col: 3 },
					{ type: 'paren_close', start: 3, end: 4, value: ')', line: 1, col: 4 },
				]);

				expect(new Lexer().lexify('[()]')).toStrictEqual([
					{ type: 'bracket_open', start: 0, end: 1, value: '[', line: 1, col: 1 },
					{ type: 'paren_open', start: 1, end: 2, value: '(', line: 1, col: 2 },
					{ type: 'paren_close', start: 2, end: 3, value: ')', line: 1, col: 3 },
					{ type: 'bracket_close', start: 3, end: 4, value: ']', line: 1, col: 4 },
				]);

				expect(new Lexer().lexify('{[]}')).toStrictEqual([
					{ type: 'brace_open', start: 0, end: 1, value: '{', line: 1, col: 1 },
					{ type: 'bracket_open', start: 1, end: 2, value: '[', line: 1, col: 2 },
					{ type: 'bracket_close', start: 2, end: 3, value: ']', line: 1, col: 3 },
					{ type: 'brace_close', start: 3, end: 4, value: '}', line: 1, col: 4 },
				]);

				// invalid syntax, but the lexer should report accruately
				expect(new Lexer().lexify('[({])}')).toStrictEqual([
					{ type: 'bracket_open', start: 0, end: 1, value: '[', line: 1, col: 1 },
					{ type: 'paren_open', start: 1, end: 2, value: '(', line: 1, col: 2 },
					{ type: 'brace_open', start: 2, end: 3, value: '{', line: 1, col: 3 },
					{ type: 'bracket_close', start: 3, end: 4, value: ']', line: 1, col: 4 },
					{ type: 'paren_close', start: 4, end: 5, value: ')', line: 1, col: 5 },
					{ type: 'brace_close', start: 5, end: 6, value: '}', line: 1, col: 6 },
				]);
			});
		});
	});

	describe('strings', (): void => {
		describe('double-quoted', (): void => {
			it('simple', (): void => {
				expect(new Lexer().lexify('let foo = "51"')).toStrictEqual([
					{ type: 'keyword', start: 0, end: 3, value: 'let', line: 1, col: 1 },
					{ type: 'identifier', start: 4, end: 7, value: 'foo', line: 1, col: 5 },
					{ type: 'assign', start: 8, end: 9, value: '=', line: 1, col: 9 },
					{ type: 'string', start: 10, end: 14, value: '51', line: 1, col: 11 }, // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(new Lexer().lexify('const foo = ""')).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const', line: 1, col: 1 },
					{ type: 'identifier', start: 6, end: 9, value: 'foo', line: 1, col: 7 },
					{ type: 'assign', start: 10, end: 11, value: '=', line: 1, col: 11 },
					{ type: 'string', start: 12, end: 14, value: '', line: 1, col: 13 }, // start to end includes the quotes
				]);
			});

			it('utf-8', (): void => {
				expect(new Lexer().lexify('const foo = "大"')).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const', line: 1, col: 1 },
					{ type: 'identifier', start: 6, end: 9, value: 'foo', line: 1, col: 7 },
					{ type: 'assign', start: 10, end: 11, value: '=', line: 1, col: 11 },
					{ type: 'string', start: 12, end: 15, value: '大', line: 1, col: 13 }, // start to end includes the quotes
				]);
			});

			it('keeps escaped quotes', (): void => {
				expect(new Lexer().lexify("'a\\'b'")).toStrictEqual([
					{ type: 'string', start: 0, end: 6, value: "a\\'b", line: 1, col: 1 },
				]);
			});
		});

		describe('single-quoted', (): void => {
			it('simple', (): void => {
				expect(new Lexer().lexify("let foo = 'bar'")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 3, value: 'let', line: 1, col: 1 },
					{ type: 'identifier', start: 4, end: 7, value: 'foo', line: 1, col: 5 },
					{ type: 'assign', start: 8, end: 9, value: '=', line: 1, col: 9 },
					{ type: 'string', start: 10, end: 15, value: 'bar', line: 1, col: 11 }, // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(new Lexer().lexify("const foo = ''")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const', line: 1, col: 1 },
					{ type: 'identifier', start: 6, end: 9, value: 'foo', line: 1, col: 7 },
					{ type: 'assign', start: 10, end: 11, value: '=', line: 1, col: 11 },
					{ type: 'string', start: 12, end: 14, value: '', line: 1, col: 13 }, // start to end includes the quotes
				]);
			});

			it('containing parens', (): void => {
				expect(new Lexer().lexify("const foo = '()'")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const', line: 1, col: 1 },
					{ type: 'identifier', start: 6, end: 9, value: 'foo', line: 1, col: 7 },
					{ type: 'assign', start: 10, end: 11, value: '=', line: 1, col: 11 },
					{ type: 'string', start: 12, end: 16, value: '()', line: 1, col: 13 }, // start to end includes the quotes
				]);
			});

			it('utf-8', (): void => {
				expect(new Lexer().lexify("const foo = '大'")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const', line: 1, col: 1 },
					{ type: 'identifier', start: 6, end: 9, value: 'foo', line: 1, col: 7 },
					{ type: 'assign', start: 10, end: 11, value: '=', line: 1, col: 11 },
					{ type: 'string', start: 12, end: 15, value: '大', line: 1, col: 13 }, // start to end includes the quotes
				]);
			});

			it('keeps escaped quotes', (): void => {
				expect(new Lexer().lexify('"a\\"b"')).toStrictEqual([
					{ type: 'string', start: 0, end: 6, value: 'a\\"b', line: 1, col: 1 },
				]);
			});
		});
	});

	describe('bugs fixed', (): void => {
		it('"1," should not be empty', (): void => {
			expect(new Lexer().lexify('1,')).toStrictEqual([
				{ type: 'number', start: 0, end: 1, value: '1', line: 1, col: 1 },
				{ type: 'comma', start: 1, end: 2, value: ',', line: 1, col: 2 },
			]);
		});

		it('"3..10" should have dotdot token', (): void => {
			expect(new Lexer().lexify('3..10')).toStrictEqual([
				{ type: 'number', start: 0, end: 1, value: '3', line: 1, col: 1 },
				{ type: 'dotdot', start: 1, end: 3, value: '..', line: 1, col: 2 },
				{ type: 'number', start: 3, end: 5, value: '10', line: 1, col: 4 },
			]);
		});

		it('". " should have dot token', (): void => {
			expect(new Lexer().lexify('. ')).toStrictEqual([
				{ type: 'dot', start: 0, end: 1, value: '.', line: 1, col: 1 },
			]);
		});

		it('"." should end at 1', (): void => {
			expect(new Lexer().lexify('.')).toStrictEqual([
				{ type: 'dot', start: 0, end: 1, value: '.', line: 1, col: 1 },
			]);
		});

		it('".." should end at 2', (): void => {
			expect(new Lexer().lexify('..')).toStrictEqual([
				{ type: 'dotdot', start: 0, end: 2, value: '..', line: 1, col: 1 },
			]);
		});

		it('"..." should end at 3', (): void => {
			expect(new Lexer().lexify('...')).toStrictEqual([
				{ type: 'dotdotdot', start: 0, end: 3, value: '...', line: 1, col: 1 },
			]);
		});

		it('"from /lexer;" should have the semicolon token', (): void => {
			expect(new Lexer().lexify('from /lexer;')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 4, value: 'from', line: 1, col: 1 },
				{ type: 'filepath', start: 5, end: 11, value: '/lexer', line: 1, col: 6 },
				{ type: 'semicolon', start: 11, end: 12, value: ';', line: 1, col: 12 },
			]);
		});
	});
});
