import Lexer from "./lexer";
import { keywords, Token, TokenType, tokenTypesUsingSymbols, types } from "./types";

/** Shortcut method to `new Lexer(code).lexify()` */
const lexify = (code: string): Token[] => new Lexer(code).lexify();

describe('lexer.ts', (): void => {
	describe('keywords', (): void => {
		it.each(keywords)('%s is recognized as a keyword - simplified', (keyword) => {
			expect(lexify(keyword)).toMatchTokens([
				['keyword', keyword],
			]);
		});
	});

	describe('symbols', (): void => {
		for (const type in tokenTypesUsingSymbols) {
			if (Object.prototype.hasOwnProperty.call(tokenTypesUsingSymbols, type)) {
				const symbol = tokenTypesUsingSymbols[type as keyof typeof tokenTypesUsingSymbols];
				const testName = `${symbol} is recognized as ${['a', 'e', 'i', 'o', 'u'].includes(type.at(0) ?? '') ? 'an' : 'a'} ${type} symbol`;
				it(testName, () => {
					expect(lexify(symbol)).toMatchTokens([
						[type as TokenType, symbol],
					]);
				});
			}
		}
	});

	describe('bools', (): void => {
		it('true', (): void => {
			expect(lexify('let foo = true')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'foo'],
				['assign', '='],
				['bool', 'true'],
			]);
		});

		it('false', (): void => {
			expect(lexify('let foo = false')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'foo'],
				['assign', '='],
				['bool', 'false'],
			]);
		});
	});

	describe('comments', (): void => {
		it('single-line with hash', (): void => {
			expect(lexify('# foo')).toMatchTokens([
				['comment', '# foo'],
			]);
		});

		it('single-line with slash', (): void => {
			expect(lexify('// foo')).toMatchTokens([
				['comment', '// foo'],
			]);
		});

		it('multiline', (): void => {
			expect(lexify('/* foo \n * bar\n */')).toMatchTokens([
				['comment', '/* foo \n * bar\n */'],
			]);
		});
	});

	describe('functions', (): void => {
		it('no params or return types', (): void => {
			expect(lexify('f foo {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('no params with single return type', (): void => {
			expect(lexify('f foo -> bool {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['right_arrow', '->'],
				['type', 'bool'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('no params with multiple return types', (): void => {
			expect(lexify('f foo -> bool, string {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['right_arrow', '->'],
				['type', 'bool'],
				['comma', ','],
				['type', 'string'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('param parens but no return types', (): void => {
			expect(lexify('f foo () {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['paren_open', '('],
				['paren_close', ')'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('param parens with return types', (): void => {
			expect(lexify('f foo () -> bool {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['paren_open', '('],
				['paren_close', ')'],
				['right_arrow', '->'],
				['type', 'bool'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('params but no return types', (): void => {
			expect(lexify('f foo (a: number) {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['paren_open', '('],
				['identifier', 'a'],
				['colon', ':'],
				['type', 'number'],
				['paren_close', ')'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('params but no return types', (): void => {
			expect(lexify('f foo (a: number) -> bool {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['paren_open', '('],
				['identifier', 'a'],
				['colon', ':'],
				['type', 'number'],
				['paren_close', ')'],
				['right_arrow', '->'],
				['type', 'bool'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('generics', (): void => {
			expect(lexify('f foo<T> (a: T) {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['less_than', '<'],
				['identifier', 'T'],
				['greater_than', '>'],
				['paren_open', '('],
				['identifier', 'a'],
				['colon', ':'],
				['identifier', 'T'],
				['paren_close', ')'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});
	});

	describe('identifiers', (): void => {
		it('should work with lower case letters, upper case letters, and numbers', (): void => {
			expect(lexify('aR_g1')).toMatchTokens([
				['identifier', 'aR_g1'],
			]);
		});
	});

	describe('line and col counts', (): void => {
		it('works as it should', (): void => {
			// this uses toStrictEqual() rather than toMatchTokens() in order to check the counts
			expect(lexify(" foo ? \n''\n   23^e5")).toStrictEqual([
				{ type: 'identifier', start: 1, end: 4, value: 'foo', line: 1, col: 2 },
				{ type: 'question', start: 5, end: 6, value: '?', line: 1, col: 6 },
				{ type: 'string', start: 8, end: 10, value: '', line: 2, col: 1 },
				{ type: 'number', start: 14, end: 16, value: '23', line: 3, col: 4 },
				{ type: 'exponent', start: 16, end: 18, value: '^e', line: 3, col: 6 },
				{ type: 'number', start: 18, end: 19, value: '5', line: 3, col: 8 },
			])
		});
	});

	describe('numbers', (): void => {
		it('small number', (): void => {
			expect(lexify('51')).toMatchTokens([
				['number', '51'],
			]);
		});

		it('number with comma', (): void => {
			expect(lexify('51,000')).toMatchTokens([
				['number', '51,000'],
			]);
		});

		it('number with a decimal', (): void => {
			expect(lexify('100001.0002')).toMatchTokens([
				['number', '100001.0002'],
			]);
		});

		it('number with exponent', (): void => {
			expect(lexify('100001^e23')).toMatchTokens([
				['number', '100001'],
				['exponent', '^e'],
				['number', '23'],
			]);
		});

		it('number with negative exponent', (): void => {
			expect(lexify('100001^e-23')).toMatchTokens([
				['number', '100001'],
				['exponent', '^e'],
				['minus', '-'],
				['number', '23'],
			]);
		});

		it('number with broken exponent', (): void => {
			expect(lexify('100001^23')).toMatchTokens([
				['number', '100001'],
				['caret', '^'],
				['number', '23'],
			]);

			expect(lexify('100001e23')).toMatchTokens([
				['number', '100001'],
				['identifier', 'e23'],
			]);
		});

		it('assigning small number', (): void => {
			expect(lexify('let foo = 51')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'foo'],
				['assign', '='],
				['number', '51'],
			]);
		});

		it('assigning const', (): void => {
			expect(lexify('const foo = 51')).toMatchTokens([
				['keyword', 'const'],
				['identifier', 'foo'],
				['assign', '='],
				['number', '51'],
			]);
		});
	});

	describe('operators', (): void => {
		describe('unary expressions', (): void => {
			it('negative number', (): void => {
				expect(lexify('-1')).toMatchTokens([
					['minus', '-'],
					['number', '1'],
				]);
			});

			it('negative number with parens', (): void => {
				expect(lexify('(-1)')).toMatchTokens([
					['paren_open', '('],
					['minus', '-'],
					['number', '1'],
					['paren_close', ')'],
				]);
			});

			it('pre-decrement', (): void => {
				expect(lexify('--foo')).toMatchTokens([
					['minus_minus', '--'],
					['identifier', 'foo'],
				]);
			});

			it('post-decrement', (): void => {
				expect(lexify('foo--')).toMatchTokens([
					['identifier', 'foo'],
					['minus_minus', '--'],
				]);
			});

			it('pre-increment', (): void => {
				expect(lexify('++foo')).toMatchTokens([
					['plus_plus', '++'],
					['identifier', 'foo'],
				]);
			});

			it('post-increment', (): void => {
				expect(lexify('foo++')).toMatchTokens([
					['identifier', 'foo'],
					['plus_plus', '++'],
				]);
			});
		});

		describe('binary expressions', (): void => {
			describe('with bools', (): void => {
				it('double pipe', (): void => {
					expect(lexify('||')).toMatchTokens([
						['or', '||'],
					]);

					expect(lexify('a || true')).toMatchTokens([
						['identifier', 'a'],
						['or', '||'],
						['bool', 'true'],
					]);
				});

				it('double ampersand', (): void => {
					expect(lexify('&&')).toMatchTokens([
						['and', '&&'],
					]);

					expect(lexify('a && true')).toMatchTokens([
						['identifier', 'a'],
						['and', '&&'],
						['bool', 'true'],
					]);
				});
			});

			describe('with numbers', (): void => {
				const binaryExpressionScenarios = (tokenType: TokenType, operator: string) => {
					// 2 numbers
					it(`${operator} with 2 number literals`, (): void => {
						expect(lexify(`1 ${operator} 2;`)).toMatchTokens([
							['number', '1'],
							[tokenType, operator],
							['number', '2'],
							['semicolon', ';'],
						]);
					});

					// identifier and number
					it(`${operator} with identifier and number literal`, (): void => {
						expect(lexify(`foo ${operator} 2;`)).toMatchTokens([
							['identifier', 'foo'],
							[tokenType, operator],
							['number', '2'],
							['semicolon', ';'],
						]);
					});
					it(`${operator} with number literal and identifier`, (): void => {
						expect(lexify(`1 ${operator} foo;`)).toMatchTokens([
							['number', '1'],
							[tokenType, operator],
							['identifier', 'foo'],
							['semicolon', ';'],
						]);
					});

					// element access and number
					it(`${operator} with element access and number literal`, (): void => {
						expect(lexify(`foo['a'] ${operator} 2;`)).toMatchTokens([
							['identifier', 'foo'],
							['bracket_open', '['],
							['string', 'a'],
							['bracket_close', ']'],
							[tokenType, operator],
							['number', '2'],
							['semicolon', ';'],
						]);
					});
					it(`${operator} with number literal and element access`, (): void => {
						expect(lexify(`1 ${operator} foo['a'];`)).toMatchTokens([
							['number', '1'],
							[tokenType, operator],
							['identifier', 'foo'],
							['bracket_open', '['],
							['string', 'a'],
							['bracket_close', ']'],
							['semicolon', ';'],
						]);
					});

					// method call and number
					it(`${operator} with method call and number literal`, (): void => {
						expect(lexify(`foo('a') ${operator} 2;`)).toMatchTokens([
							['identifier', 'foo'],
							['paren_open', '('],
							['string', 'a'],
							['paren_close', ')'],
							[tokenType, operator],
							['number', '2'],
							['semicolon', ';'],
						]);
					});
					it(`${operator} with number literal and method call`, (): void => {
						expect(lexify(`1 ${operator} foo('a');`)).toMatchTokens([
							['number', '1'],
							[tokenType, operator],
							['identifier', 'foo'],
							['paren_open', '('],
							['string', 'a'],
							['paren_close', ')'],
							['semicolon', ';'],
						]);
					});

					// element access and method call
					it(`${operator} with element access and method call`, (): void => {
						expect(lexify(`foo['a'] ${operator} bar('b');`)).toMatchTokens([
							['identifier', 'foo'],
							['bracket_open', '['],
							['string', 'a'],
							['bracket_close', ']'],
							[tokenType, operator],
							['identifier', 'bar'],
							['paren_open', '('],
							['string', 'b'],
							['paren_close', ')'],
							['semicolon', ';'],
						]);
					});
					it(`${operator} with method call and element access`, (): void => {
						expect(lexify(`foo('a') ${operator} bar['b'];`)).toMatchTokens([
							['identifier', 'foo'],
							['paren_open', '('],
							['string', 'a'],
							['paren_close', ')'],
							[tokenType, operator],
							['identifier', 'bar'],
							['bracket_open', '['],
							['string', 'b'],
							['bracket_close', ']'],
							['semicolon', ';'],
						]);
					});
				};

				describe('compare', (): void => {
					binaryExpressionScenarios('compare', '<=>');
				});

				describe('equals', (): void => {
					binaryExpressionScenarios('equals', '==');
				});

				describe('not equals', (): void => {
					binaryExpressionScenarios('not_equals', '!=');
				});

				describe('less than', (): void => {
					binaryExpressionScenarios('less_than', '<');
				});

				describe('less than or equals', (): void => {
					binaryExpressionScenarios('less_than_equals', '<=');
				});

				describe('greater than', (): void => {
					binaryExpressionScenarios('greater_than', '>');
				});

				describe('greater than or equals', (): void => {
					binaryExpressionScenarios('greater_than_equals', '>=');
				});
			});
		});
	});

	describe('regex', (): void => {
		describe('valid scenarios', (): void => {
			it('without flags', (): void => {
				expect(lexify('/[a-z]/')).toMatchTokens([
					['regex', '/[a-z]/'],
				])
			});

			it('with flags', (): void => {
				expect(lexify('/[a-z]/ig')).toMatchTokens([
					['regex', '/[a-z]/ig'],
				])
			});

			it('identifier after', (): void => {
				expect(lexify('/[a-z]/igq')).toMatchTokens([
					['regex', '/[a-z]/ig'],
					['identifier', 'q'],
				])
			});

			it('dot after', (): void => {
				expect(lexify('/[a-z]/.')).toMatchTokens([
					['regex', '/[a-z]/'],
					['dot', '.'],
				])

				expect(lexify('/[a-z]/i.')).toMatchTokens([
					['regex', '/[a-z]/i'],
					['dot', '.'],
				])
			});

			it('incomplete', (): void => {
				expect(lexify('/[a-z]')).toMatchTokens([
					['regex', '/[a-z]'],
				])
			});
		});

		describe('invalid scenarios', (): void => {
			it('identifier before', (): void => {
				expect(lexify('k/a/')).toMatchTokens([
					['identifier', 'k'],
					['forward_slash', '/'],
					['identifier', 'a'],
					['forward_slash', '/'],
				])
			});

			it('space after opening slash', (): void => {
				expect(lexify('/ a/')).toMatchTokens([
					['forward_slash', '/'],
					['identifier', 'a'],
					['forward_slash', '/'],
				])
			});
		});
	});

	describe('surrounding characters', (): void => {
		describe('brackets', (): void => {
			it('with nothing between', (): void => {
				expect(lexify('[]')).toMatchTokens([
					['bracket_open', '['],
					['bracket_close', ']'],
				]);
			});

			it('with something between', (): void => {
				expect(lexify('[foo]')).toMatchTokens([
					['bracket_open', '['],
					['identifier', 'foo'],
					['bracket_close', ']'],
				]);
			});

			it('two sets with nested', (): void => {
				expect(lexify('[[]][]')).toMatchTokens([
					['bracket_open', '['],
					['bracket_open', '['],
					['bracket_close', ']'],
					['bracket_close', ']'],
					['bracket_open', '['],
					['bracket_close', ']'],
				]);
			});
		});

		describe('braces', (): void => {
			it('with nothing between', (): void => {
				expect(lexify('{}')).toMatchTokens([
					['brace_open', '{'],
					['brace_close', '}'],
				]);
			});

			it('with something between', (): void => {
				expect(lexify('{foo}')).toMatchTokens([
					['brace_open', '{'],
					['identifier', 'foo'],
					['brace_close', '}'],
				]);
			});

			it('two sets with nested', (): void => {
				expect(lexify('{{}}{}')).toMatchTokens([
					['brace_open', '{'],
					['brace_open', '{'],
					['brace_close', '}'],
					['brace_close', '}'],
					['brace_open', '{'],
					['brace_close', '}'],
				]);
			});
		});

		describe('parens', (): void => {
			it('with nothing between', (): void => {
				expect(lexify('()')).toMatchTokens([
					['paren_open', '('],
					['paren_close', ')'],
				]);
			});

			it('with something between', (): void => {
				expect(lexify('(foo)')).toMatchTokens([
					['paren_open', '('],
					['identifier', 'foo'],
					['paren_close', ')'],
				]);
			});

			it('two sets with nested', (): void => {
				expect(lexify('(())()')).toMatchTokens([
					['paren_open', '('],
					['paren_open', '('],
					['paren_close', ')'],
					['paren_close', ')'],
					['paren_open', '('],
					['paren_close', ')'],
				]);
			});
		});

		describe('mixtures', (): void => {
			it('works', (): void => {
				expect(lexify('([])')).toMatchTokens([
					['paren_open', '('],
					['bracket_open', '['],
					['bracket_close', ']'],
					['paren_close', ')'],
				]);

				expect(lexify('[()]')).toMatchTokens([
					['bracket_open', '['],
					['paren_open', '('],
					['paren_close', ')'],
					['bracket_close', ']'],
				]);

				expect(lexify('{[]}')).toMatchTokens([
					['brace_open', '{'],
					['bracket_open', '['],
					['bracket_close', ']'],
					['brace_close', '}'],
				]);

				// invalid syntax, but the lexer should report accurately
				expect(lexify('[({])}')).toMatchTokens([
					['bracket_open', '['],
					['paren_open', '('],
					['brace_open', '{'],
					['bracket_close', ']'],
					['paren_close', ')'],
					['brace_close', '}'],
				]);
			});
		});
	});

	describe('strings', (): void => {
		describe('double-quoted', (): void => {
			it('simple', (): void => {
				expect(lexify('let foo = "51"')).toMatchTokens([
					['keyword', 'let'],
					['identifier', 'foo'],
					['assign', '='],
					['string', '51'], // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(lexify('const foo = ""')).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', ''], // start to end includes the quotes
				]);
			});

			it('utf-8', (): void => {
				expect(lexify('const foo = "大"')).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', '大'], // start to end includes the quotes
				]);
			});

			it('keeps escaped quotes', (): void => {
				expect(lexify("'a\\'b'")).toMatchTokens([
					['string', "a\\'b"],
				]);
			});
		});

		describe('single-quoted', (): void => {
			it('simple', (): void => {
				expect(lexify("let foo = 'bar'")).toMatchTokens([
					['keyword', 'let'],
					['identifier', 'foo'],
					['assign', '='],
					['string', 'bar'], // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(lexify("const foo = ''")).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', ''], // start to end includes the quotes
				]);
			});

			it('containing parens', (): void => {
				expect(lexify("const foo = '()'")).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', '()'], // start to end includes the quotes
				]);
			});

			it('utf-8', (): void => {
				expect(lexify("const foo = '大'")).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', '大'],
				]);
			});

			it('keeps escaped quotes', (): void => {
				expect(lexify('"a\\"b"')).toMatchTokens([
					['string', 'a\\"b'],
				]);
			});
		});
	});

	describe('types', (): void => {
		describe('each', (): void => {
			for (const type of types) {
				it(`${type} is recognized as a type`, () => {
					expect(lexify(type)).toMatchTokens([
						['type', type],
					]);
				});
			}
		});

		it('works in a variable definition', (): void => {
			expect(lexify('let initializeAndAssignLater: number;\ninitializeAndAssignLater = 5;	')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'initializeAndAssignLater'],
				['colon', ':'],
				['type', 'number'],
				['semicolon', ';'],
				['identifier', 'initializeAndAssignLater'],
				['assign', '='],
				['number', '5'],
				['semicolon', ';'],
			]);
		});

		it('works in a variable assignment', (): void => {
			expect(lexify('let initializeAndAssignLater: number = 5;	')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'initializeAndAssignLater'],
				['colon', ':'],
				['type', 'number'],
				['assign', '='],
				['number', '5'],
				['semicolon', ';'],
			]);
		});
	});

	describe('when', (): void => {
		it('works with single values, multiple values, ranges, and ...', (): void => {
			expect(lexify(`const size = when someNumber {
				1, 2 -> 'small',
				3..10 -> 'medium',
				11 -> {
					doThing1();
					doThing2();

					return 'large';
				},
				12: doSomethingElse(),
				... -> 'off the charts',
		}`)).toMatchTokens([
				['keyword', 'const'],
				['identifier', 'size'],
				['assign', '='],
				['keyword', 'when'],
				['identifier', 'someNumber'],
				['brace_open', '{'],
				['number', '1'],
				['comma', ','],
				['number', '2'],
				['right_arrow', '->'],
				['string', 'small'],
				['comma', ','],
				['number', '3'],
				['dotdot', '..'],
				['number', '10'],
				['right_arrow', '->'],
				['string', 'medium'],
				['comma', ','],
				['number', '11'],
				['right_arrow', '->'],
				['brace_open', '{'],
				['identifier', 'doThing1'],
				['paren_open', '('],
				['paren_close', ')'],
				['semicolon', ';'],
				['identifier', 'doThing2'],
				['paren_open', '('],
				['paren_close', ')'],
				['semicolon', ';'],
				['keyword', 'return'],
				['string', 'large'],
				['semicolon', ';'],
				['brace_close', '}'],
				['comma', ','],
				['number', '12'],
				['colon', ':'],
				['identifier', 'doSomethingElse'],
				['paren_open', '('],
				['paren_close', ')'],
				['comma', ','],
				['dotdotdot', '...'],
				['right_arrow', '->'],
				['string', 'off the charts'],
				['comma', ','],
				['brace_close', '}'],
			]);
		});
	});

	describe('bugs fixed', (): void => {
		it('"1," should not be empty', (): void => {
			expect(lexify('1,')).toMatchTokens([
				['number', '1'],
				['comma', ','],
			]);
		});

		it('"3..10" should have dotdot token', (): void => {
			expect(lexify('3..10')).toMatchTokens([
				['number', '3'],
				['dotdot', '..'],
				['number', '10'],
			]);
		});

		it('". " should have dot token', (): void => {
			expect(lexify('. ')).toMatchTokens([
				['dot', '.'],
			]);
		});

		it('"." should end at 1', (): void => {
			expect(lexify('.')).toMatchTokens([
				['dot', '.'],
			]);
		});

		it('".." should end at 2', (): void => {
			expect(lexify('..')).toMatchTokens([
				['dotdot', '..'],
			]);
		});

		it('"..." should end at 3', (): void => {
			expect(lexify('...')).toMatchTokens([
				['dotdotdot', '...'],
			]);
		});

		it('"from @/lexer;" should have the semicolon token', (): void => {
			expect(lexify('from @/lexer;')).toMatchTokens([
				['keyword', 'from'],
				['path', '@/lexer'],
				['semicolon', ';'],
			]);
		});

		it('"from ./lexer;" should have the semicolon token', (): void => {
			expect(lexify('from ./lexer;')).toMatchTokens([
				['keyword', 'from'],
				['path', './lexer'],
				['semicolon', ';'],
			]);
		});

		it('should handle nested calls to peekAndHandle correctly', (): void => {
			expect(lexify('1.2;1..2;1...3;1<2;1<=2;1<=>2;./foo;@/foo;')).toMatchTokens([
				['number', '1.2'],
				['semicolon', ';'],

				['number', '1'],
				['dotdot', '..'],
				['number', '2'],
				['semicolon', ';'],

				['number', '1'],
				['dotdotdot', '...'],
				['number', '3'],
				['semicolon', ';'],

				['number', '1'],
				['less_than', '<'],
				['number', '2'],
				['semicolon', ';'],

				['number', '1'],
				['less_than_equals', '<='],
				['number', '2'],
				['semicolon', ';'],

				['number', '1'],
				['compare', '<=>'],
				['number', '2'],
				['semicolon', ';'],

				['path', './foo'],
				['semicolon', ';'],

				['path', '@/foo'],
				['semicolon', ';'],
			]);
		});
	});
});
