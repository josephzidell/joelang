import assert from 'node:assert/strict';
import { Result } from '../shared/result';
import LexerError from './error';
import { keywords, Token, TokenType, tokenTypesUsingSymbols, declarableTypes } from './types';
import { lex } from './util';

const unicodeIdentifiers = [
	'ሀሎ', // amharic
	'مرحبا', // Arabic
	'٠١٢٣٤٥٦٧٨٩', // Arabic numerals
	'你好世界', // Chinese
	'〇一二三四五六七八九十', // Chinese numerals
	'€¥£₽₹', // Currency symbols
	'कंप्यूटर', // Devanagari script (used for Hindi, Marathi, Nepali, etc.)
	'😀😂🤣😊🙃🤔🤨🤯👋🌸🐘🍕🎉🚀🎸🎨🏳️‍🌈💻', // Emoji
	'αβγδεζηθικλμνξοπρστυφχψω', // Greek
	'नमस्ते', // Hindi
	'שלום', // Hebrew
	'こんにちは', // Japanese
	'안녕하세요', // Korean
	'∑∫Δ√∞π≠±×÷', // Mathematical symbols
	'olá', // Portuguese
	'здравствуйте', // Russian
	'สวัสดี', // Thai
];

describe('lexer.ts', (): void => {
	describe('keywords', (): void => {
		it.each(keywords)('%s is recognized as a keyword - simplified', (keyword) => {
			expect(lex(keyword)).toMatchTokens([['keyword', keyword]]);
		});
	});

	describe('symbols', (): void => {
		for (const type in tokenTypesUsingSymbols) {
			if (Object.prototype.hasOwnProperty.call(tokenTypesUsingSymbols, type)) {
				const symbol = tokenTypesUsingSymbols[type as keyof typeof tokenTypesUsingSymbols];
				const testName = `${symbol} is recognized as ${
					['a', 'e', 'i', 'o', 'u'].includes(type.at(0) ?? '') ? 'an' : 'a'
				} ${type} symbol`;
				it(testName, () => {
					expect(lex(symbol)).toMatchTokens([[type as TokenType, symbol]]);
				});
			}
		}
	});

	describe('bools', (): void => {
		it('true', (): void => {
			expect(lex('let foo = true')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'foo'],
				['assign', '='],
				['bool', 'true'],
			]);
		});

		it('false', (): void => {
			expect(lex('let foo = false')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'foo'],
				['assign', '='],
				['bool', 'false'],
			]);
		});
	});

	describe('comments', (): void => {
		it('single-line with hash', (): void => {
			expect(lex('# foo')).toMatchTokens([['comment', '# foo']]);
		});

		it('single-line with slash', (): void => {
			expect(lex('// foo')).toMatchTokens([['comment', '// foo']]);
		});

		it('multiline', (): void => {
			expect(lex('/* foo \n * bar\n */')).toMatchTokens([['comment', '/* foo \n * bar\n */']]);
		});
	});

	describe('functions', (): void => {
		it('no params or return types', (): void => {
			expect(lex('f foo {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('no params with single return type', (): void => {
			expect(lex('f foo -> bool {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['right_arrow', '->'],
				['type', 'bool'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('no params with multiple return types', (): void => {
			expect(lex('f foo -> bool, string {}')).toMatchTokens([
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
			expect(lex('f foo () {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['paren_open', '('],
				['paren_close', ')'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('param parens with return types', (): void => {
			expect(lex('f foo () -> bool {}')).toMatchTokens([
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
			expect(lex('f foo (a: int8) {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['paren_open', '('],
				['identifier', 'a'],
				['colon', ':'],
				['type', 'int8'],
				['paren_close', ')'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('params but no return types', (): void => {
			expect(lex('f foo (a: int8) -> bool {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['paren_open', '('],
				['identifier', 'a'],
				['colon', ':'],
				['type', 'int8'],
				['paren_close', ')'],
				['right_arrow', '->'],
				['type', 'bool'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		it('generics', (): void => {
			expect(lex('f foo<T> (a: T) {}')).toMatchTokens([
				['keyword', 'f'],
				['identifier', 'foo'],
				['less_than', '<'],
				['identifier', 'T'],
				['more_than', '>'],
				['paren_open', '('],
				['identifier', 'a'],
				['colon', ':'],
				['identifier', 'T'],
				['paren_close', ')'],
				['brace_open', '{'],
				['brace_close', '}'],
			]);
		});

		describe('unicode', () => {
			it.each(unicodeIdentifiers)('%s is recognized as an identifier in a function name', (identifier) => {
				expect(lex(`f ${identifier} {}`)).toMatchTokens([
					['keyword', 'f'],
					['identifier', identifier],
					['brace_open', '{'],
					['brace_close', '}'],
				]);
			});
		});
	});

	describe('identifiers', (): void => {
		it('should work with lower case letters, upper case letters, and numbers', (): void => {
			expect(lex('aR_g1')).toMatchTokens([['identifier', 'aR_g1']]);
		});

		it.each(unicodeIdentifiers)('%s is recognized as a general identifier', (identifier) => {
			expect(lex(identifier)).toMatchTokens([['identifier', identifier]]);
		});
	});

	describe('line and col counts', (): void => {
		it('works as it should', (): void => {
			// this uses toStrictEqual() rather than toMatchTokens() in order to check the counts
			expect(lex(" foo ? \n''\n   23^e5")).toStrictEqual({
				outcome: 'ok',
				value: [
					{ type: 'identifier', start: 1, end: 4, value: 'foo', line: 1, col: 2 },
					{ type: 'question', start: 5, end: 6, value: '?', line: 1, col: 6 },
					{ type: 'string', start: 8, end: 10, value: '', line: 2, col: 1 },
					{ type: 'number', start: 14, end: 16, value: '23', line: 3, col: 4 },
					{ type: 'exponent', start: 16, end: 18, value: '^e', line: 3, col: 6 },
					{ type: 'number', start: 18, end: 19, value: '5', line: 3, col: 8 },
				],
			} satisfies Result<Token[]>);
		});
	});

	describe('numbers', (): void => {
		it('small number', (): void => {
			expect(lex('51')).toMatchTokens([['number', '51']]);
		});

		it('number with underscore', (): void => {
			expect(lex('51_000')).toMatchTokens([['number', '51_000']]);
		});

		it('number with a decimal', (): void => {
			expect(lex('100001.0002')).toMatchTokens([['number', '100001.0002']]);
		});

		it('number with exponent', (): void => {
			expect(lex('100001^e23')).toMatchTokens([
				['number', '100001'],
				['exponent', '^e'],
				['number', '23'],
			]);
		});

		it('number with negative exponent', (): void => {
			expect(lex('100001^e-23')).toMatchTokens([
				['number', '100001'],
				['exponent', '^e'],
				['minus', '-'],
				['number', '23'],
			]);
		});

		it('number with broken exponent', (): void => {
			expect(lex('100001^23')).toMatchTokens([
				['number', '100001'],
				['caret', '^'],
				['number', '23'],
			]);

			expect(lex('100001e23')).toMatchTokens([
				['number', '100001'],
				['identifier', 'e23'],
			]);
		});

		it('assigning small number', (): void => {
			expect(lex('let foo = 51')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'foo'],
				['assign', '='],
				['number', '51'],
			]);
		});

		it('assigning const', (): void => {
			expect(lex('const foo = 51')).toMatchTokens([
				['keyword', 'const'],
				['identifier', 'foo'],
				['assign', '='],
				['number', '51'],
			]);
		});

		it('number with valid size', (): void => {
			expect(lex('51_uint8')).toMatchTokens([['number', '51_uint8']]);
		});

		it('number with invalid size', (): void => {
			// arrange / act
			const result = lex('51_foo32');

			// assert
			assert(result.outcome === 'error');
			const error = result.error as LexerError;
			expect(error.getContext().toStringArray(error.message).join('\n')).toBe(`  |
1 | 51_foo32
  |   ^ Syntax Error. Unknown character: "_"
  |`);
		});
	});

	describe('operators', (): void => {
		describe('unary expressions', (): void => {
			it('negative number', (): void => {
				expect(lex('-1')).toMatchTokens([
					['minus', '-'],
					['number', '1'],
				]);
			});

			it('negative number with parens', (): void => {
				expect(lex('(-1)')).toMatchTokens([
					['paren_open', '('],
					['minus', '-'],
					['number', '1'],
					['paren_close', ')'],
				]);
			});

			it('pre-decrement', (): void => {
				expect(lex('--foo')).toMatchTokens([
					['minus_minus', '--'],
					['identifier', 'foo'],
				]);
			});

			it('post-decrement', (): void => {
				expect(lex('foo--')).toMatchTokens([
					['identifier', 'foo'],
					['minus_minus', '--'],
				]);
			});

			it('pre-increment', (): void => {
				expect(lex('++foo')).toMatchTokens([
					['plus_plus', '++'],
					['identifier', 'foo'],
				]);
			});

			it('post-increment', (): void => {
				expect(lex('foo++')).toMatchTokens([
					['identifier', 'foo'],
					['plus_plus', '++'],
				]);
			});
		});

		describe('binary expressions', (): void => {
			describe('with bools', (): void => {
				it('double pipe', (): void => {
					expect(lex('||')).toMatchTokens([['or', '||']]);

					expect(lex('a || true')).toMatchTokens([
						['identifier', 'a'],
						['or', '||'],
						['bool', 'true'],
					]);
				});

				it('double ampersand', (): void => {
					expect(lex('&&')).toMatchTokens([['and', '&&']]);

					expect(lex('a && true')).toMatchTokens([
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
						expect(lex(`1 ${operator} 2;`)).toMatchTokens([
							['number', '1'],
							[tokenType, operator],
							['number', '2'],
							['semicolon', ';'],
						]);
					});

					// identifier and number
					it(`${operator} with identifier and number literal`, (): void => {
						expect(lex(`foo ${operator} 2;`)).toMatchTokens([
							['identifier', 'foo'],
							[tokenType, operator],
							['number', '2'],
							['semicolon', ';'],
						]);
					});
					it(`${operator} with number literal and identifier`, (): void => {
						expect(lex(`1 ${operator} foo;`)).toMatchTokens([
							['number', '1'],
							[tokenType, operator],
							['identifier', 'foo'],
							['semicolon', ';'],
						]);
					});

					// element access and number
					it(`${operator} with element access and number literal`, (): void => {
						expect(lex(`foo['a'] ${operator} 2;`)).toMatchTokens([
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
						expect(lex(`1 ${operator} foo['a'];`)).toMatchTokens([
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
						expect(lex(`foo('a') ${operator} 2;`)).toMatchTokens([
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
						expect(lex(`1 ${operator} foo('a');`)).toMatchTokens([
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
						expect(lex(`foo['a'] ${operator} bar('b');`)).toMatchTokens([
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
						expect(lex(`foo('a') ${operator} bar['b'];`)).toMatchTokens([
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

				describe('more than', (): void => {
					binaryExpressionScenarios('more_than', '>');
				});

				describe('more than or equals', (): void => {
					binaryExpressionScenarios('more_than_equals', '>=');
				});
			});
		});
	});

	describe('regex', (): void => {
		describe('valid scenarios', (): void => {
			it('without flags', (): void => {
				expect(lex('/[a-z]/')).toMatchTokens([['regex', '/[a-z]/']]);
			});

			it('with flags', (): void => {
				expect(lex('/[a-z]/ig')).toMatchTokens([['regex', '/[a-z]/ig']]);
			});

			it('identifier after', (): void => {
				expect(lex('/[a-z]/igq')).toMatchTokens([
					['regex', '/[a-z]/ig'],
					['identifier', 'q'],
				]);
			});

			it('dot after', (): void => {
				expect(lex('/[a-z]/.')).toMatchTokens([
					['regex', '/[a-z]/'],
					['dot', '.'],
				]);

				expect(lex('/[a-z]/i.')).toMatchTokens([
					['regex', '/[a-z]/i'],
					['dot', '.'],
				]);
			});

			it('incomplete', (): void => {
				expect(lex('/[a-z]')).toMatchTokens([['regex', '/[a-z]']]);
			});
		});

		describe('invalid scenarios', (): void => {
			it('identifier before', (): void => {
				expect(lex('k/a/')).toMatchTokens([
					['identifier', 'k'],
					['forward_slash', '/'],
					['identifier', 'a'],
					['forward_slash', '/'],
				]);
			});

			it('space after opening slash', (): void => {
				expect(lex('/ a/')).toMatchTokens([
					['forward_slash', '/'],
					['identifier', 'a'],
					['forward_slash', '/'],
				]);
			});
		});
	});

	describe('surrounding characters', (): void => {
		describe('brackets', (): void => {
			it('with nothing between', (): void => {
				expect(lex('[]')).toMatchTokens([
					['bracket_open', '['],
					['bracket_close', ']'],
				]);
			});

			it('with something between', (): void => {
				expect(lex('[foo]')).toMatchTokens([
					['bracket_open', '['],
					['identifier', 'foo'],
					['bracket_close', ']'],
				]);
			});

			it('two sets with nested', (): void => {
				expect(lex('[[]][]')).toMatchTokens([
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
				expect(lex('{}')).toMatchTokens([
					['brace_open', '{'],
					['brace_close', '}'],
				]);
			});

			it('with something between', (): void => {
				expect(lex('{foo}')).toMatchTokens([
					['brace_open', '{'],
					['identifier', 'foo'],
					['brace_close', '}'],
				]);
			});

			it('two sets with nested', (): void => {
				expect(lex('{{}}{}')).toMatchTokens([
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
				expect(lex('()')).toMatchTokens([
					['paren_open', '('],
					['paren_close', ')'],
				]);
			});

			it('with something between', (): void => {
				expect(lex('(foo)')).toMatchTokens([
					['paren_open', '('],
					['identifier', 'foo'],
					['paren_close', ')'],
				]);
			});

			it('two sets with nested', (): void => {
				expect(lex('(())()')).toMatchTokens([
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
				expect(lex('([])')).toMatchTokens([
					['paren_open', '('],
					['bracket_open', '['],
					['bracket_close', ']'],
					['paren_close', ')'],
				]);

				expect(lex('[()]')).toMatchTokens([
					['bracket_open', '['],
					['paren_open', '('],
					['paren_close', ')'],
					['bracket_close', ']'],
				]);

				expect(lex('{[]}')).toMatchTokens([
					['brace_open', '{'],
					['bracket_open', '['],
					['bracket_close', ']'],
					['brace_close', '}'],
				]);

				// invalid syntax, but the lexer should report accurately
				expect(lex('[({])}')).toMatchTokens([
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
				expect(lex('let foo = "51"')).toMatchTokens([
					['keyword', 'let'],
					['identifier', 'foo'],
					['assign', '='],
					['string', '51'], // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(lex('const foo = ""')).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', ''], // start to end includes the quotes
				]);
			});

			it('utf-8', (): void => {
				expect(lex('const foo = "大"')).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', '大'], // start to end includes the quotes
				]);
			});

			it('keeps escaped quotes', (): void => {
				expect(lex("'a\\'b'")).toMatchTokens([['string', "a\\'b"]]);
			});

			describe('unicode', () => {
				it.each(unicodeIdentifiers)('%s is recognized in a double-quoted string', (identifier) => {
					expect(lex(`"${identifier}"`)).toMatchTokens([['string', identifier]]);
				});
			});
		});

		describe('single-quoted', (): void => {
			it('simple', (): void => {
				expect(lex("let foo = 'bar'")).toMatchTokens([
					['keyword', 'let'],
					['identifier', 'foo'],
					['assign', '='],
					['string', 'bar'], // start to end includes the quotes
				]);
			});

			it('empty string', (): void => {
				expect(lex("const foo = ''")).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', ''], // start to end includes the quotes
				]);
			});

			it('containing parens', (): void => {
				expect(lex("const foo = '()'")).toMatchTokens([
					['keyword', 'const'],
					['identifier', 'foo'],
					['assign', '='],
					['string', '()'], // start to end includes the quotes
				]);
			});

			describe('unicode', () => {
				it.each(unicodeIdentifiers)('%s is recognized in a single-quoted string', (identifier) => {
					expect(lex(`const foo = '${identifier}'`)).toMatchTokens([
						['keyword', 'const'],
						['identifier', 'foo'],
						['assign', '='],
						['string', identifier],
					]);
				});
			});

			it('keeps escaped quotes', (): void => {
				expect(lex('"a\\"b"')).toMatchTokens([['string', 'a\\"b']]);
			});
		});
	});

	describe('types', (): void => {
		describe('each', (): void => {
			for (const type of declarableTypes) {
				it(`${type} is recognized as a type`, () => {
					expect(lex(type)).toMatchTokens([['type', type]]);
				});
			}
		});

		it('works in a variable definition', (): void => {
			expect(lex('let initializeAndAssignLater: int8;\ninitializeAndAssignLater = 5;	')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'initializeAndAssignLater'],
				['colon', ':'],
				['type', 'int8'],
				['semicolon', ';'],
				['identifier', 'initializeAndAssignLater'],
				['assign', '='],
				['number', '5'],
				['semicolon', ';'],
			]);
		});

		it('works in a variable assignment', (): void => {
			expect(lex('let initializeAndAssignLater: int8 = 5;	')).toMatchTokens([
				['keyword', 'let'],
				['identifier', 'initializeAndAssignLater'],
				['colon', ':'],
				['type', 'int8'],
				['assign', '='],
				['number', '5'],
				['semicolon', ';'],
			]);
		});
	});

	describe('when', (): void => {
		it('works with single values, multiple values, ranges, and ...', (): void => {
			expect(
				lex(`const size = when someNumber {
					1, 2 -> 'small',
					3 .. 10 -> 'medium',
					11 -> {
						doThing1();
						doThing2();

						return 'large';
					},
					12: doSomethingElse(),
					... -> 'off the charts',
				}`),
			).toMatchTokens([
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
			expect(lex('1,')).toMatchTokens([
				['number', '1'],
				['comma', ','],
			]);
		});

		it('"3 .. 10" should have dotdot token', (): void => {
			expect(lex('3 .. 10')).toMatchTokens([
				['number', '3'],
				['dotdot', '..'],
				['number', '10'],
			]);
		});

		it('". " should have dot token', (): void => {
			expect(lex('. ')).toMatchTokens([['dot', '.']]);
		});

		it('"." should end at 1', (): void => {
			expect(lex('.')).toMatchTokens([['dot', '.']]);
		});

		it('".." should end at 2', (): void => {
			expect(lex('..')).toMatchTokens([['dotdot', '..']]);
		});

		it('"..." should end at 3', (): void => {
			expect(lex('...')).toMatchTokens([['dotdotdot', '...']]);
		});

		it('"from @/lexer;" should have the semicolon token', (): void => {
			expect(lex('from @/lexer;')).toMatchTokens([
				['keyword', 'from'],
				['path', '@/lexer'],
				['semicolon', ';'],
			]);
		});

		it('"from ./lexer;" should have the semicolon token', (): void => {
			expect(lex('from ./lexer;')).toMatchTokens([
				['keyword', 'from'],
				['path', './lexer'],
				['semicolon', ';'],
			]);
		});

		it('should handle nested calls to peekAndHandle correctly', (): void => {
			expect(lex('1.2;1..2;1...3;1<2;1<=2;1<=>2;./foo;@/foo;')).toMatchTokens([
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
