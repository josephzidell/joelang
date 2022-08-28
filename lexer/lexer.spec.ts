import lexer, {keywords} from "./lexer";

describe('lexer.ts', (): void => {
	describe('keywords', (): void => {
		it.each(keywords)('%s is recognized as a keyword', (keyword) => {
			expect(lexer(keyword)).toStrictEqual([
				{ type: 'keyword', start: 0, end: keyword.length, value: keyword },
			]);
		});
	});

	describe('bools', (): void => {
		it('true', (): void => {
			expect(lexer('let foo = true')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 3, value: 'let' },
				{ type: 'name', start: 4, end: 7, value: 'foo' },
				{ type: 'operator', start: 8, end: 9, value: '=' },
				{ type: 'bool', start: 10, end: 14, value: 'true' },
			]);
		});

		it('false', (): void => {
			expect(lexer('let foo = false')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 3, value: 'let' },
				{ type: 'name', start: 4, end: 7, value: 'foo' },
				{ type: 'operator', start: 8, end: 9, value: '=' },
				{ type: 'bool', start: 10, end: 15, value: 'false' },
			]);
		});
	});

	describe('comments', (): void => {
		it('single-line with hash', (): void => {
			expect(lexer('# foo')).toStrictEqual([
				{ type: 'comment', start: 0, end: 5, value: '# foo'},
			]);
		});

		it('single-line with slash', (): void => {
			expect(lexer('// foo')).toStrictEqual([
				{ type: 'comment', start: 0, end: 6, value: '// foo'},
			]);
		});

		it('multiline', (): void => {
			expect(lexer('/* foo \n * bar\n */')).toStrictEqual([
				{ type: 'comment', start: 0, end: 18, value: '/* foo \n * bar\n */'},
			]);
		});
	});

	describe('identifiers', (): void => {
		it('should work with lower case letters, upper case letters, and numbers', (): void => {
			expect(lexer('aR_g1')).toStrictEqual([
				{ type: 'name', start: 0, end: 5, value: 'aR_g1'},
			]);
		});
	});

	describe('numbers', (): void => {
		it('small number', (): void => {
			expect(lexer('51')).toStrictEqual([
				{ type: 'number', start: 0, end: 2, value: '51' },
			]);
		});

		it('number with comma', (): void => {
			expect(lexer('51,000')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '51,000' },
			]);
		});

		it('number with a decimal', (): void => {
			expect(lexer('100001.0002')).toStrictEqual([
				{ type: 'number', start: 0, end: 11, value: '100001.0002' },
			]);
		});

		it('number with exponent', (): void => {
			expect(lexer('100001^e23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001' },
				{ type: 'operator', start: 6, end: 8, value: '^e' },
				{ type: 'number', start: 8, end: 10, value: '23' },
			]);
		});

		it('number with negative exponent', (): void => {
			expect(lexer('100001^e-23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001' },
				{ type: 'operator', start: 6, end: 8, value: '^e' },
				{ type: 'operator', start: 8, end: 9, value: '-' },
				{ type: 'number', start: 9, end: 11, value: '23' },
			]);
		});

		it('number with broken exponent', (): void => {
			expect(lexer('100001^23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001' },
				{ type: 'operator', start: 6, end: 7, value: '^' },
				{ type: 'number', start: 7, end: 9, value: '23' },
			]);

			expect(lexer('100001e23')).toStrictEqual([
				{ type: 'number', start: 0, end: 6, value: '100001' },
				{ type: 'name', start: 6, end: 9, value: 'e23' },
			]);
		});

		it('assigning small number', (): void => {
			expect(lexer('let foo = 51')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 3, value: 'let' },
				{ type: 'name', start: 4, end: 7, value: 'foo' },
				{ type: 'operator', start: 8, end: 9, value: '=' },
				{ type: 'number', start: 10, end: 12, value: '51' },
			]);
		});

		it('assigning const', (): void => {
			expect(lexer('const foo = 51')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 5, value: 'const' },
				{ type: 'name', start: 6, end: 9, value: 'foo' },
				{ type: 'operator', start: 10, end: 11, value: '=' },
				{ type: 'number', start: 12, end: 14, value: '51' },
			]);
		});
	});

	describe('operators', (): void => {
		describe('logic', (): void => {
			it('single pipe', (): void => {
				expect(lexer('|')).toStrictEqual([
					{ type: 'operator', start: 0, end: 1, value: '|' },
				]);

				expect(lexer('a | true')).toStrictEqual([
					{ type: 'name', start: 0, end: 1, value: 'a' },
					{ type: 'operator', start: 2, end: 3, value: '|' },
					{ type: 'bool', start: 4, end: 8, value: 'true'},
				]);
			});

			it('double pipe', (): void => {
				expect(lexer('||')).toStrictEqual([
					{ type: 'operator', start: 0, end: 2, value: '||' },
				]);

				expect(lexer('a || true')).toStrictEqual([
					{ type: 'name', start: 0, end: 1, value: 'a' },
					{ type: 'operator', start: 2, end: 4, value: '||' },
					{ type: 'bool', start: 5, end: 9, value: 'true'},
				]);
			});

			it('single ampersand', (): void => {
				expect(lexer('&')).toStrictEqual([
					{ type: 'operator', start: 0, end: 1, value: '&' },
				]);

				expect(lexer('a & true')).toStrictEqual([
					{ type: 'name', start: 0, end: 1, value: 'a' },
					{ type: 'operator', start: 2, end: 3, value: '&' },
					{ type: 'bool', start: 4, end: 8, value: 'true'},
				]);
			});

			it('double ampersand', (): void => {
				expect(lexer('&&')).toStrictEqual([
					{ type: 'operator', start: 0, end: 2, value: '&&' },
				]);

				expect(lexer('a || true')).toStrictEqual([
					{ type: 'name', start: 0, end: 1, value: 'a' },
					{ type: 'operator', start: 2, end: 4, value: '||' },
					{ type: 'bool', start: 5, end: 9, value: 'true'},
				]);
			});
		});

		describe('unary expressions', (): void => {
			it('negative number', (): void => {
				expect(lexer('-1')).toStrictEqual([
					{ type: 'operator', start: 0, end: 1, value: '-' },
					{ type: 'number', start: 1, end: 2, value: '1' },
				]);
			});

			it('negative number with parens', (): void => {
				expect(lexer('(-1)')).toStrictEqual([
					{ type: 'paren', start: 0, end: 1, value: '('},
					{ type: 'operator', start: 1, end: 2, value: '-' },
					{ type: 'number', start: 2, end: 3, value: '1' },
					{ type: 'paren', start: 3, end: 4, value: ')'},
				]);
			});

			it('pre-decrement', (): void => {
				expect(lexer('--foo')).toStrictEqual([
					{ type: 'operator', start: 0, end: 2, value: '--' },
					{ type: 'name', start: 2, end: 5, value: 'foo' },
				]);
			});

			it('post-decrement', (): void => {
				expect(lexer('foo--')).toStrictEqual([
					{ type: 'name', start: 0, end: 3, value: 'foo' },
					{ type: 'operator', start: 3, end: 5, value: '--' },
				]);
			});

			it('pre-increment', (): void => {
				expect(lexer('++foo')).toStrictEqual([
					{ type: 'operator', start: 0, end: 2, value: '++' },
					{ type: 'name', start: 2, end: 5, value: 'foo' },
				]);
			});

			it('post-increment', (): void => {
				expect(lexer('foo++')).toStrictEqual([
					{ type: 'name', start: 0, end: 3, value: 'foo' },
					{ type: 'operator', start: 3, end: 5, value: '++' },
				]);
			});
		});
	});

	describe('surrounding characters', (): void => {
		describe('brackets', (): void => {
			it('with nothing between', (): void => {
				expect(lexer('[]')).toStrictEqual([
					{ type: 'bracket', start: 0, end: 1, value: '[' },
					{ type: 'bracket', start: 1, end: 2, value: ']' },
				]);
			});

			it('with something between', (): void => {
				expect(lexer('[foo]')).toStrictEqual([
					{ type: 'bracket', start: 0, end: 1, value: '[' },
					{ type: 'name', start: 1, end: 4, value: 'foo' },
					{ type: 'bracket', start: 4, end: 5, value: ']' },
				]);
			});

			it('two sets with nested', (): void => {
				expect(lexer('[[]][]')).toStrictEqual([
					{ type: 'bracket', start: 0, end: 1, value: '[' },
					{ type: 'bracket', start: 1, end: 2, value: '[' },
					{ type: 'bracket', start: 2, end: 3, value: ']' },
					{ type: 'bracket', start: 3, end: 4, value: ']' },
					{ type: 'bracket', start: 4, end: 5, value: '[' },
					{ type: 'bracket', start: 5, end: 6, value: ']' },
				]);
			});
		});

		describe('braces', (): void => {
			it('with nothing between', (): void => {
				expect(lexer('{}')).toStrictEqual([
					{ type: 'brace', start: 0, end: 1, value: '{' },
					{ type: 'brace', start: 1, end: 2, value: '}' },
				]);
			});

			it('with something between', (): void => {
				expect(lexer('{foo}')).toStrictEqual([
					{ type: 'brace', start: 0, end: 1, value: '{' },
					{ type: 'name', start: 1, end: 4, value: 'foo' },
					{ type: 'brace', start: 4, end: 5, value: '}' },
				]);
			});

			it('two sets with nested', (): void => {
				expect(lexer('{{}}{}')).toStrictEqual([
					{ type: 'brace', start: 0, end: 1, value: '{' },
					{ type: 'brace', start: 1, end: 2, value: '{' },
					{ type: 'brace', start: 2, end: 3, value: '}' },
					{ type: 'brace', start: 3, end: 4, value: '}' },
					{ type: 'brace', start: 4, end: 5, value: '{' },
					{ type: 'brace', start: 5, end: 6, value: '}' },
				]);
			});
		});

		describe('parens', (): void => {
			it('with nothing between', (): void => {
				expect(lexer('()')).toStrictEqual([
					{ type: 'paren', start: 0, end: 1, value: '(' },
					{ type: 'paren', start: 1, end: 2, value: ')' },
				]);
			});

			it('with something between', (): void => {
				expect(lexer('(foo)')).toStrictEqual([
					{ type: 'paren', start: 0, end: 1, value: '(' },
					{ type: 'name', start: 1, end: 4, value: 'foo' },
					{ type: 'paren', start: 4, end: 5, value: ')' },
				]);
			});

			it('two sets with nested', (): void => {
				expect(lexer('(())()')).toStrictEqual([
					{ type: 'paren', start: 0, end: 1, value: '(' },
					{ type: 'paren', start: 1, end: 2, value: '(' },
					{ type: 'paren', start: 2, end: 3, value: ')' },
					{ type: 'paren', start: 3, end: 4, value: ')' },
					{ type: 'paren', start: 4, end: 5, value: '(' },
					{ type: 'paren', start: 5, end: 6, value: ')' },
				]);
			});
		});

		describe('mixtures', (): void => {
			it('works', (): void => {
				expect(lexer('([])')).toStrictEqual([
					{ type: 'paren', start: 0, end: 1, value: '(' },
					{ type: 'bracket', start: 1, end: 2, value: '[' },
					{ type: 'bracket', start: 2, end: 3, value: ']' },
					{ type: 'paren', start: 3, end: 4, value: ')' },
				]);

				expect(lexer('[()]')).toStrictEqual([
					{ type: 'bracket', start: 0, end: 1, value: '[' },
					{ type: 'paren', start: 1, end: 2, value: '(' },
					{ type: 'paren', start: 2, end: 3, value: ')' },
					{ type: 'bracket', start: 3, end: 4, value: ']' },
				]);

				expect(lexer('{[]}')).toStrictEqual([
					{ type: 'brace', start: 0, end: 1, value: '{' },
					{ type: 'bracket', start: 1, end: 2, value: '[' },
					{ type: 'bracket', start: 2, end: 3, value: ']' },
					{ type: 'brace', start: 3, end: 4, value: '}' },
				]);

				// invalid syntax, but the lexer should report accruately
				expect(lexer('[({])}')).toStrictEqual([
					{ type: 'bracket', start: 0, end: 1, value: '[' },
					{ type: 'paren', start: 1, end: 2, value: '(' },
					{ type: 'brace', start: 2, end: 3, value: '{' },
					{ type: 'bracket', start: 3, end: 4, value: ']' },
					{ type: 'paren', start: 4, end: 5, value: ')' },
					{ type: 'brace', start: 5, end: 6, value: '}' },
				]);
			});
		});
	});

	describe('strings', (): void => {
		describe('double-quoted', (): void => {
			it('simple', (): void => {
				expect(lexer('let foo = "51"')).toStrictEqual([
					{ type: 'keyword', start: 0, end: 3, value: 'let' },
					{ type: 'name', start: 4, end: 7, value: 'foo' },
					{ type: 'operator', start: 8, end: 9, value: '=' },
					{ type: 'string', start: 10, end: 14, value: '51' }, // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(lexer('const foo = ""')).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const' },
					{ type: 'name', start: 6, end: 9, value: 'foo' },
					{ type: 'operator', start: 10, end: 11, value: '=' },
					{ type: 'string', start: 12, end: 14, value: '' }, // start to end includes the quotes
				]);
			});

			it('utf-8', (): void => {
				expect(lexer('const foo = "大"')).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const' },
					{ type: 'name', start: 6, end: 9, value: 'foo' },
					{ type: 'operator', start: 10, end: 11, value: '=' },
					{ type: 'string', start: 12, end: 15, value: '大' }, // start to end includes the quotes
				]);
			});
		});

		describe('single-quoted', (): void => {
			it('simple', (): void => {
				expect(lexer("let foo = 'bar'")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 3, value: 'let' },
					{ type: 'name', start: 4, end: 7, value: 'foo' },
					{ type: 'operator', start: 8, end: 9, value: '=' },
					{ type: 'string', start: 10, end: 15, value: 'bar' }, // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(lexer("const foo = ''")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const' },
					{ type: 'name', start: 6, end: 9, value: 'foo' },
					{ type: 'operator', start: 10, end: 11, value: '=' },
					{ type: 'string', start: 12, end: 14, value: '' }, // start to end includes the quotes
				]);
			});

			it('containing parens', (): void => {
				expect(lexer("const foo = '()'")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const' },
					{ type: 'name', start: 6, end: 9, value: 'foo' },
					{ type: 'operator', start: 10, end: 11, value: '=' },
					{ type: 'string', start: 12, end: 16, value: '()' }, // start to end includes the quotes
				]);
			});

			it('utf-8', (): void => {
				expect(lexer("const foo = '大'")).toStrictEqual([
					{ type: 'keyword', start: 0, end: 5, value: 'const' },
					{ type: 'name', start: 6, end: 9, value: 'foo' },
					{ type: 'operator', start: 10, end: 11, value: '=' },
					{ type: 'string', start: 12, end: 15, value: '大' }, // start to end includes the quotes
				]);
			});
		});
	});

	describe('bugs fixed', (): void => {
		it('"1," should not be empty', (): void => {
			expect(lexer('1,')).toStrictEqual([
				{ type: 'number', start: 0, end: 1, value: '1' },
				{ type: 'separator', start: 1, end: 2, value: ','},
			]);
		});

		it('"3..10" should have one operator token', (): void => {
			expect(lexer('3..10')).toStrictEqual([
				{ type: 'number', start: 0, end: 1, value: '3' },
				{ type: 'operator', start: 1, end: 3, value: '..'},
				{ type: 'number', start: 3, end: 5, value: '10' },
			]);
		});

		it('". " should have one operator token', (): void => {
			expect(lexer('. ')).toStrictEqual([
				{ type: 'operator', start: 0, end: 1, value: '.' },
			]);
		});

		it('"from /lexer;" should have the semicolon token', (): void => {
			expect(lexer('from /lexer;')).toStrictEqual([
				{ type: 'keyword', start: 0, end: 4, value: 'from' },
				{ type: 'filepath', start: 5, end: 11, value: '/lexer'},
				{ type: 'separator', start: 11, end: 12, value: ';'},
			]);
		});
	});
});
