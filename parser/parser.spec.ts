import Lexer from '../lexer/lexer';
import { types } from '../lexer/types';
import Parser from './parser';
import { Node } from './types';
import '../setupJest'; // for the types

/** Shortcut method to `new Parser(new Lexer(code).lexify()).parse()` */
const parse = (code: string): Node => new Parser(new Lexer(code).lexify()).parse();

describe('parser.ts', (): void => {
	describe('VariableDeclaration', (): void => {
		it('a let assignment with a bool literal', (): void => {
			expect(parse('let x = false')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['BoolLiteral', 'false'],
				]],
			])
		});

		it('a let assignment with a number literal', (): void => {
			expect(parse('let x = 1')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['NumberLiteral', '1'],
				]],
			])

			expect(parse('const x = -2,300.006^e-2,000; const y = 5;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['BinaryExpression', '^e', [
						['UnaryExpression', '-', {before: true}, [
							['NumberLiteral', '2,300.006'],
						]],
						['UnaryExpression', '-', {before: true}, [
							['NumberLiteral', '2,000'],
						]],
					]],
				]],
				['SemicolonSeparator'],
				['VariableDeclaration', 'const', [
					['Identifier', 'y'],
					['AssignmentOperator', '='],
					['NumberLiteral', '5'],
				]],
				['SemicolonSeparator'],
			])
		});

		it('a let assignment with a string literal', (): void => {
			expect(parse('let x = "foo"')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['StringLiteral', 'foo'],
				]],
			])
		});

		it('a let with a specified type', (): void => {
			expect(parse('let x: string;')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['ColonSeparator'],
					['Type', 'string'],
				]],
				['SemicolonSeparator'],
			])
		});

		it('a const assignment with a specified type', (): void => {
			expect(parse('const x: string = "foo"')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['ColonSeparator'],
					['Type', 'string'],
					['AssignmentOperator', '='],
					['StringLiteral', 'foo'],
				]],
			])
		});

		it('regex', (): void => {
			expect(parse('const x = /[a-z/;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['RegularExpression', '/[a-z/'],
				]],
				['SemicolonSeparator'],
			]);

			expect(parse('const x: regex = /[a-z/g;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['ColonSeparator'],
					['Type', 'regex'],
					['AssignmentOperator', '='],
					['RegularExpression', '/[a-z/g'],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('nil', (): void => {
			expect(parse('const x = nil')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['Nil', 'nil'],
				]],
			])
		});

		describe('arrays of', (): void => {

			it('numbers', () => {
				expect(parse('[1, -2, 3,456, 3^e-2, 3.14]')).toMatchParseTree([
					['ArrayExpression', [
						['NumberLiteral', '1'],
						['CommaSeparator'],
						['UnaryExpression', '-', {before: true}, [
							['NumberLiteral', '2'],
						]],
						['CommaSeparator'],
						['NumberLiteral', '3,456'],
						['CommaSeparator'],
						['BinaryExpression', '^e', [
							['NumberLiteral', '3'],
							['UnaryExpression', '-', {before: true}, [
								['NumberLiteral', '2'],
							]],
						]],
						['CommaSeparator'],
						['NumberLiteral', '3.14'],
					]],
				]);
			});

		});
	});

	describe('Comment', (): void => {
		it('a single-line comment', (): void => {
			expect(parse('# let x = "foo"')).toMatchParseTree([
				['Comment', '# let x = "foo"'],
			])
		});

		describe('block statements', (): void => {
			it('empty class', (): void => {
				expect(parse('class Foo {}')).toMatchParseTree([
					['Keyword', 'class'],
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]);
			});

			it('class with comment', (): void => {
				expect(parse('class Foo {\n# foo\n}')).toMatchParseTree([
					['Keyword', 'class'],
					['Identifier', 'Foo'],
					['BlockStatement', [
						['Comment', '# foo'],
					]],
				]);
			});
		});
	});

	describe('FunctionDefinition', (): void => {
		it('no params or return types', (): void => {
			expect(parse('f foo {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['BlockStatement', []],
				]],
			]);
		});

		it('no params with single return type', (): void => {
			expect(parse('f foo -> bool {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('no params with multiple return types', (): void => {
			expect(parse('f foo -> bool, string {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['FunctionReturns', [
						['Type', 'bool'],
						['CommaSeparator'],
						['Type', 'string'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('param parens but no return types', (): void => {
			expect(parse('f foo () {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ParametersList', []],
					['BlockStatement', []],
				]],
			]);
		});

		it('param parens with return types', (): void => {
			expect(parse('f foo () -> bool {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ParametersList', []],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('params but no return types', (): void => {
			expect(parse('f foo (a: number) {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['Type', 'number'],
						]],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('params and return types', (): void => {
			expect(parse('f foo (a: number, r: regex) -> regex, bool {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['Type', 'number'],
						]],
						['CommaSeparator'],
						['Parameter', [
							['Identifier', 'r'],
							['ColonSeparator'],
							['Type', 'regex'],
						]],
					]],
					['FunctionReturns', [
						['Type', 'regex'],
						['CommaSeparator'],
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('params and return types using nil', (): void => {
			expect(parse('f foo (a: nil) -> nil {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['Nil', 'nil'],
						]],
					]],
					['FunctionReturns', [
						['Nil', 'nil'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('with arrays', (): void => {
			expect(parse('f foo(a: number[] = [5], b: string[][], ...c: Foo[]) -> regex, path[][][] {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['ArrayType', [
								['Type', 'number'],
							]],
							['AssignmentOperator', '='],
							['ArrayExpression', [
								['NumberLiteral', '5'],
							]],
						]],
						['CommaSeparator'],
						['Parameter', [
							['Identifier', 'b'],
							['ColonSeparator'],
							['ArrayType', [
								['ArrayType', [
									['Type', 'string'],
								]],
							]],
						]],
						['CommaSeparator'],
						['Parameter', [
							['RestElement', '...'],
							['Identifier', 'c'],
							['ColonSeparator'],
							['ArrayType', [
								['Identifier', 'Foo'],
							]],
						]],
					]],
					['FunctionReturns', [
						['Type', 'regex'],
						['CommaSeparator'],
						['ArrayType', [
							['ArrayType', [
								['ArrayType', [
									['Type', 'path'],
								]],
							]],
						]],
				]],
					['BlockStatement', []],
				]],
			]);
		});

		it('generics', (): void => {
			expect(parse('f foo<T> (a: T) -> T {}')).toMatchParseTree([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['GenericTypesList', [
						['Identifier', 'T'],
					]],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['Identifier', 'T'],
						]],
					]],
					['FunctionReturns', [
						['Identifier', 'T'],
					]],
					['BlockStatement', []],
				]],
			]);
		});
	});

	describe('ImportDeclaration', (): void => {
		describe('imports', (): void => {
			it('single, default import', (): void => {
				expect(parse('import lexer from ./lexer;import lexer2 from @/lexer;import lexer3 from @/lexer.joe;')).toMatchParseTree([
					['ImportDeclaration', [
						['Identifier', 'lexer'],
						['Keyword', 'from'],
						['Path', './lexer'],
					]],
					['SemicolonSeparator'],
					['ImportDeclaration', [
						['Identifier', 'lexer2'],
						['Keyword', 'from'],
						['Path', '@/lexer'],
					]],
					['SemicolonSeparator'],
					['ImportDeclaration', [
						['Identifier', 'lexer3'],
						['Keyword', 'from'],
						['Path', '@/lexer.joe'],
					]],
					['SemicolonSeparator'],
				]);
			});
		});
	});

	describe('Operators', (): void => {
		describe('unary expressions', (): void => {
			it('negative number', (): void => {
				expect(parse('-1')).toMatchParseTree([
					['UnaryExpression', '-', {before: true}, [
						['NumberLiteral', '1'],
					]]
				]);
			});

			it('negative number with parens', (): void => {
				expect(parse('(-1)')).toMatchParseTree([
					['Parenthesized', [
						['UnaryExpression', '-', {before: true}, [
							['NumberLiteral', '1'],
						]],
					]],
				]);
			});

			it('pre-decrement', (): void => {
				expect(parse('--foo')).toMatchParseTree([
					['UnaryExpression', '--', {before: true}, [
						['Identifier', 'foo'],
					]],
				]);
			});

			it('post-decrement', (): void => {
				expect(parse('foo--')).toMatchParseTree([
					['UnaryExpression', '--', {before: false}, [
						['Identifier', 'foo'],
					]],
				]);

				expect(parse('foo---')).toMatchParseTree([
					['UnaryExpression', '--', {before: false}, [
						['Identifier', 'foo'],
					]],
					['SubtractionOperator', '-'],
				]);
			});

			it('pre-increment', (): void => {
				expect(parse('++foo')).toMatchParseTree([
					['UnaryExpression', '++', {before: true}, [
						['Identifier', 'foo'],
					]],
				]);
			});

			it('post-increment', (): void => {
				expect(parse('foo++')).toMatchParseTree([
					['UnaryExpression', '++', {before: false}, [
						['Identifier', 'foo'],
					]],
				]);

				expect(parse('foo+++')).toMatchParseTree([
					['UnaryExpression', '++', {before: false}, [
						['Identifier', 'foo'],
					]],
					['AdditionOperator', '+'],
				]);
			});
		});

		describe('binary expressions', (): void => {
			describe('with bools', (): void => {
				it('double pipe', (): void => {
					expect(parse('a ||')).toMatchParseTree([
						['BinaryExpression', '||', [
							['Identifier', 'a'],
						]],
					]);

					expect(parse('a || true')).toMatchParseTree([
						['BinaryExpression', '||', [
							['Identifier', 'a'],
							['BoolLiteral', 'true'],
						]],
					]);
				});

				it('double ampersand', (): void => {
					expect(parse('a &&')).toMatchParseTree([
						['BinaryExpression', '&&', [
							['Identifier', 'a'],
						]],
					]);

					expect(parse('a && true')).toMatchParseTree([
						['BinaryExpression', '&&', [
							['Identifier', 'a'],
							['BoolLiteral', 'true'],
						]],
					]);
				});
			});

			describe('with numbers', (): void => {
				const binaryExpressionScenarios = (operator: string) => {
					// 2 numbers
					it(`${operator} with 2 number literals`, (): void => {
						expect(parse(`1 ${operator} 2;`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['NumberLiteral', '2'],
							]],
							['SemicolonSeparator'],
						]);
					});

					// identifier and number
					it(`${operator} with identifier and number literal`, (): void => {
						expect(parse(`foo ${operator} 2;`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['Identifier', 'foo'],
								['NumberLiteral', '2'],
							]],
							['SemicolonSeparator'],
						]);
					});
					it(`${operator} with number literal and identifier`, (): void => {
						expect(parse(`1 ${operator} foo;`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['Identifier', 'foo'],
							]],
							['SemicolonSeparator'],
						]);
					});

					// nil and number
					it(`${operator} with nil and number literal`, (): void => {
						expect(parse(`nil ${operator} 2;`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['Nil', 'nil'],
								['NumberLiteral', '2'],
							]],
							['SemicolonSeparator'],
						]);
					});
					it(`${operator} with number literal and nil`, (): void => {
						expect(parse(`1 ${operator} nil;`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['Nil', 'nil'],
							]],
							['SemicolonSeparator'],
						]);
					});

					// element access and number
					it(`${operator} with element access and number literal`, (): void => {
						expect(parse(`foo['a'] ${operator} 2;`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['MemberExpression', [
									['Identifier', 'foo'],
									['MembersList', [
										['StringLiteral', 'a'],
									]],
								]],
								['NumberLiteral', '2'],
							]],
							['SemicolonSeparator'],
						]);
					});
					it(`${operator} with number literal and element access`, (): void => {
						expect(parse(`1 ${operator} foo['a'];'a'`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['MemberExpression', [
									['Identifier', 'foo'],
									['MembersList', [
										['StringLiteral', 'a'],
									]],
								]],
							]],
							['SemicolonSeparator'],
							['StringLiteral', 'a'],
						]);
					});

					// method call and number
					it(`${operator} with method call and number literal`, (): void => {
						expect(parse(`foo('a') ${operator} 2;`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['CallExpression', [
									['Identifier', 'foo'],
									['ArgumentsList', [
										['StringLiteral', 'a'],
									]],
								]],
								['NumberLiteral', '2'],
							]],
							['SemicolonSeparator'],
						]);
					});
					it(`${operator} with number literal and method call`, (): void => {
						expect(parse(`1 ${operator} foo('a');`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['CallExpression', [
									['Identifier', 'foo'],
									['ArgumentsList', [
										['StringLiteral', 'a'],
									]],
								]],
							]],
							['SemicolonSeparator'],
						]);
					});

					// element access and method call
					it(`${operator} with element access and method call`, (): void => {
						expect(parse(`foo['a'] ${operator} bar('b');`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['MemberExpression', [
									['Identifier', 'foo'],
									['MembersList', [
										['StringLiteral', 'a'],
									]],
								]],
								['CallExpression', [
									['Identifier', 'bar'],
									['ArgumentsList', [
										['StringLiteral', 'b'],
									]],
								]],
							]],
							['SemicolonSeparator'],
						]);
					});
					it(`${operator} with method call and element access`, (): void => {
						expect(parse(`foo('a') ${operator} bar['b'];`)).toMatchParseTree([
							['BinaryExpression', operator, [
								['CallExpression', [
									['Identifier', 'foo'],
									['ArgumentsList', [
										['StringLiteral', 'a'],
									]],
								]],
								['MemberExpression', [
									['Identifier', 'bar'],
									['MembersList', [
										['StringLiteral', 'b'],
									]],
								]],
							]],
							['SemicolonSeparator'],
						]);
					});
				};

				describe('compare', (): void => {
					binaryExpressionScenarios('<=>');
				});

				describe('equals', (): void => {
					binaryExpressionScenarios('==');
				});

				describe('not equals', (): void => {
					binaryExpressionScenarios('!=');
				});

				describe('less than', (): void => {
					binaryExpressionScenarios('<');
				});

				describe('less than or equals', (): void => {
					binaryExpressionScenarios('<=');
				});

				describe('greater than', (): void => {
					binaryExpressionScenarios('>');
				});

				describe('greater than or equals', (): void => {
					binaryExpressionScenarios('>=');
				});
			});
		});
	});

	describe('Parens', (): void => {
		describe('mathematical expressions', (): void => {
			it('a simple mathematical formula', (): void => {
				expect(parse('1 + (2 * (-3/-(2.3-4)%9))')).toMatchParseTree([
					['NumberLiteral', '1'],
					['AdditionOperator', '+'],
					['Parenthesized', [
						['NumberLiteral', '2'],
						['MultiplicationOperator', '*'],
						['Parenthesized', [
							['UnaryExpression', '-', {before: true}, [
								['NumberLiteral', '3'],
							]],
							['DivisionOperator', '/'],
							['UnaryExpression', '-', {before: true}, [
								['Parenthesized', [
									['NumberLiteral', '2.3'],
									['SubtractionOperator', '-'],
									['NumberLiteral', '4'],
								]],
							]],
							['ModOperator', '%'],
							['NumberLiteral', '9'],
						]]
					]]
				])
			});

			it('supports mathematical expressions with variables', (): void => {
				expect(parse('const foo = 1; let bar = -foo;')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator', '='],
						['NumberLiteral', '1'],
					]],
					['SemicolonSeparator'],
					['VariableDeclaration', 'let', [
						['Identifier', 'bar'],
						['AssignmentOperator', '='],
						['UnaryExpression', '-', {before: true}, [
							['Identifier', 'foo'],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});
		});
	});

	describe('Types', (): void => {
		describe('should understand built-in types', () => {
			it.each(types)('%s is recognized as a type', (type) => {
				expect(parse(type)).toMatchParseTree([
					['Type', type],
				]);
			});

			it.each(types)('%s[] is recognized as a one-dimensional array of type', (type) => {
				expect(parse(`${type}[]`)).toMatchParseTree([
					['ArrayType', [
						['Type', type],
					]],
				]);
			});

			it.each(types)('%s[][] is recognized as a two-dimensional array of type', (type) => {
				expect(parse(`${type}[][]`)).toMatchParseTree([
					['ArrayType', [
						['ArrayType', [
							['Type', type],
						]],
					]],
				]);
			});
		});

		describe('arrays', () => {

			it('should understand a custom array', () => {
				expect(parse('Foo[]')).toMatchParseTree([
					['ArrayType', [
						['Identifier', 'Foo'],
					]],
				]);

				expect(parse('Foo[][]')).toMatchParseTree([
					['ArrayType', [
						['ArrayType', [
							['Identifier', 'Foo'],
						]],
					]],
				]);
			});

		});
	});

	describe('WhenExpression', (): void => {
		it('works with single values, multiple values, ranges, and ...', (): void => {
			expect(parse(`const size = when someNumber {
				1, 2 -> 'small',
				3..10 -> 'medium',
				11 -> {
					doThing1();
					doThing2();

					return 'large';
				},
				12 -> doSomethingElse(),
				... -> 'off the charts',
			}`)).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'size'],
					['AssignmentOperator', '='],
					['WhenExpression', [
						['Identifier', 'someNumber'],
						['BlockStatement', [
							['WhenCase', [
								['WhenCaseTests', [
									['NumberLiteral', '1'],
									['CommaSeparator'],
									['NumberLiteral', '2'],
								]],
								['WhenCaseConsequent', [
									['StringLiteral', 'small'],
								]]
							]],
							['CommaSeparator'],
							['WhenCase', [
								['WhenCaseTests', [
									['RangeExpression', [
										['NumberLiteral', '3'],
										['NumberLiteral', '10'],
									]],
								]],
								['WhenCaseConsequent', [
									['StringLiteral', 'medium'],
								]],
							]],
							['CommaSeparator'],
							['WhenCase', [
								['WhenCaseTests', [
									['NumberLiteral', '11'],
								]],
								['WhenCaseConsequent', [
									['BlockStatement', [
										['CallExpression', [
											['Identifier', 'doThing1'],
											['ArgumentsList', []],
										]],
										['SemicolonSeparator'],
										['CallExpression', [
											['Identifier', 'doThing2'],
											['ArgumentsList', []],
										]],
										['SemicolonSeparator'],
										['ReturnStatement', [
											['StringLiteral', 'large'],
										]],
										['SemicolonSeparator'],
									]],
								]],
							]],
							['CommaSeparator'],
							['WhenCase', [
								['WhenCaseTests', [
									['NumberLiteral', '12'],
								]],
								['WhenCaseConsequent', [
									['CallExpression', [
										['Identifier', 'doSomethingElse'],
										['ArgumentsList', []],
									]],
								]],
							]],
							['CommaSeparator'],
							['WhenCase', [
								['WhenCaseTests', [
									['RestElement', '...'],
								]],
								['WhenCaseConsequent', [
									['StringLiteral', 'off the charts'],
								]],
							]],
							['CommaSeparator'],
						]],
					]],
				]],
			]);
		});
	});

	describe('bugs fixed', (): void => {
		it('"foo()..3" should place the RangeExpression outside of the CallExpression', (): void => {
			expect(parse('foo()..3')).toMatchParseTree([
				['RangeExpression', [
					['CallExpression', [
						['Identifier', 'foo'],
						['ArgumentsList', []],
					]],
					['NumberLiteral', '3'],
				]]
			]);
		});

		it('"[1<2, 3>2];" should be a bool array, not a tuple', (): void => {
			expect(parse('[1<2, 4>3];')).toMatchParseTree([
				['ArrayExpression', [
					['BinaryExpression', '<', [
						['NumberLiteral', '1'],
						['NumberLiteral', '2'],
					]],
					['CommaSeparator'],
					['BinaryExpression', '>', [
						['NumberLiteral', '4'],
						['NumberLiteral', '3'],
					]],
				]],
				['SemicolonSeparator'],
			]);
		});
	});
});
