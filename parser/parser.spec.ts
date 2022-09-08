import Lexer from "../lexer/lexer";
import Parser from "./parser";
import { Node } from "./types";
import '../setupJest'; // for the types

/** Shortcut method to `new Parser(new Lexer(code).lexify()).parse()` */
const parse = (code: string): Node => new Parser(new Lexer(code).lexify()).parse();

describe('parser.ts', (): void => {
	describe('VariableDeclaration', (): void => {
		it('a let assignment with a bool literal', (): void => {
			expect(parse('let x = false')).toMatchAST([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['BoolLiteral', 'false'],
				]],
			])
		});

		it('a let assignment with a number literal', (): void => {
			expect(parse('let x = 1')).toMatchAST([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['NumberLiteral', '1'],
				]],
			])
		});

		it('a let assignment with a string literal', (): void => {
			expect(parse('let x = "foo"')).toMatchAST([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['StringLiteral', 'foo'],
				]],
			])
		});

		it('a let with a specified type', (): void => {
			expect(parse('let x: string;')).toMatchAST([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['ColonSeparator', ':'],
					['Type', 'string'],
					['SemicolonSeparator', ';'],
				]],
			])
		});

		it('a const assignment with a specified type', (): void => {
			expect(parse('const x: string = "foo"')).toMatchAST([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['ColonSeparator', ':'],
					['Type', 'string'],
					['AssignmentOperator', '='],
					['StringLiteral', 'foo'],
				]],
			])
		});
	});

	describe('Comment', (): void => {
		it('a single-line comment', (): void => {
			expect(parse('# let x = "foo"')).toMatchAST([
				['Comment', '# let x = "foo"'],
			])
		});

		describe('block statements', (): void => {
			it('empty class', (): void => {
				expect(parse('class Foo {}')).toMatchAST([
					["Keyword", "class"],
					["Identifier", "Foo"],
					['BlockStatement', []],
				]);
			});

			it('class with comment', (): void => {
				expect(parse('class Foo {\n# foo\n}')).toMatchAST([
					["Keyword", "class"],
					["Identifier", "Foo"],
					['BlockStatement', [
						['Comment', '# foo'],
					]],
				]);
			});
		});
	});

	describe('FunctionDefinition', (): void => {
		it('no args or return types', (): void => {
			expect(parse('f foo {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['BlockStatement', []],
				]],
			]);
		});

		it('no args with single return type', (): void => {
			expect(parse('f foo -> bool {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('no args with multiple return types', (): void => {
			expect(parse('f foo -> bool, string {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['FunctionReturns', [
						['Type', 'bool'],
						['CommaSeparator', ','],
						['Type', 'string'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('arg parens but no return types', (): void => {
			expect(parse('f foo () {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ArgumentsList', []],
					['BlockStatement', []],
				]],
			]);
		});

		it('arg parens with return types', (): void => {
			expect(parse('f foo () -> bool {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ArgumentsList', []],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('args but no return types', (): void => {
			expect(parse('f foo (a: number) {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ArgumentsList', [
						['Identifier', 'a'],
						['ColonSeparator', ':'],
						['Type', 'number'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('args but no return types', (): void => {
			expect(parse('f foo (a: number) -> bool {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['ArgumentsList', [
						['Identifier', 'a'],
						['ColonSeparator', ':'],
						['Type', 'number'],
					]],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('generics', (): void => {
			expect(parse('f foo<T> (a: T) -> T {}')).toMatchAST([
				['FunctionDefinition', [
					['Identifier', 'foo'],
					['GenericTypesList', [
						['Identifier', 'T'],
					]],
					['ArgumentsList', [
						['Identifier', 'a'],
						['ColonSeparator', ':'],
						['Identifier', 'T'],
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
				expect(parse('import lexer from ./lexer;import lexer2 from @/lexer;import lexer3 from @/lexer.joe;')).toMatchAST([
					['ImportDeclaration', [
						["Identifier", "lexer"],
						["Keyword", "from"],
						["FilePath", "./lexer"],
						["SemicolonSeparator", ";"],
					]],
					['ImportDeclaration', [
						["Identifier", "lexer2"],
						["Keyword", "from"],
						["FilePath", "@/lexer"],
						["SemicolonSeparator", ";"],
					]],
					['ImportDeclaration', [
						["Identifier", "lexer3"],
						["Keyword", "from"],
						["FilePath", "@/lexer.joe"],
						["SemicolonSeparator", ";"],
					]],
				]);
			});
		});
	});

	describe('Operators', (): void => {
		describe('unary expressions', (): void => {
			it('negative number', (): void => {
				expect(parse('-1')).toMatchAST([
					['UnaryExpression', '-', {before: true}, [
						['NumberLiteral', '1'],
					]]
				]);
			});

			it('negative number with parens', (): void => {
				expect(parse('(-1)')).toMatchAST([
					['Parenthesized', [
						['UnaryExpression', '-', {before: true}, [
							['NumberLiteral', '1'],
						]],
					]],
				]);
			});

			it('pre-decrement', (): void => {
				expect(parse('--foo')).toMatchAST([
					['UnaryExpression', '--', {before: true}, [
						['Identifier', 'foo'],
					]],
				]);
			});

			it('post-decrement', (): void => {
				expect(parse('foo--')).toMatchAST([
					['UnaryExpression', '--', {before: false}, [
						['Identifier', 'foo'],
					]],
				]);

				expect(parse('foo---')).toMatchAST([
					['UnaryExpression', '--', {before: false}, [
						['Identifier', 'foo'],
					]],
					['SubtractionOperator', '-'],
				]);
			});

			it('pre-increment', (): void => {
				expect(parse('++foo')).toMatchAST([
					['UnaryExpression', '++', {before: true}, [
						['Identifier', 'foo'],
					]],
				]);
			});

			it('post-increment', (): void => {
				expect(parse('foo++')).toMatchAST([
					['UnaryExpression', '++', {before: false}, [
						['Identifier', 'foo'],
					]],
				]);

				expect(parse('foo+++')).toMatchAST([
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
					expect(parse('a ||')).toMatchAST([
						['BinaryExpression', '||', [
							['Identifier', 'a'],
						]],
					]);

					expect(parse('a || true')).toMatchAST([
						['BinaryExpression', '||', [
							['Identifier', 'a'],
							['BoolLiteral', 'true'],
						]],
					]);
				});

				it('double ampersand', (): void => {
					expect(parse('a &&')).toMatchAST([
						['BinaryExpression', '&&', [
							['Identifier', 'a'],
						]],
					]);

					expect(parse('a && true')).toMatchAST([
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
						expect(parse(`1 ${operator} 2;`)).toMatchAST([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['NumberLiteral', '2'],
								['SemicolonSeparator', ';'],
							]],
						]);
					});

					// identifier and number
					it(`${operator} with idenfier and number literal`, (): void => {
						expect(parse(`foo ${operator} 2;`)).toMatchAST([
							['BinaryExpression', operator, [
								['Identifier', 'foo'],
								['NumberLiteral', '2'],
								['SemicolonSeparator', ';'],
							]],
						]);
					});
					it(`${operator} with number literal and idenfier`, (): void => {
						expect(parse(`1 ${operator} foo;`)).toMatchAST([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['Identifier', 'foo'],
								['SemicolonSeparator', ';'],
							]],
						]);
					});

					// element access and number
					it(`${operator} with element access and number literal`, (): void => {
						expect(parse(`foo['a'] ${operator} 2;`)).toMatchAST([
							['BinaryExpression', operator, [
								['MemberExpression', [
									['Identifier', 'foo'],
									['MembersList', [
										['StringLiteral', 'a'],
									]],
								]],
								['NumberLiteral', '2'],
								['SemicolonSeparator', ';'],
							]],
						]);
					});
					it(`${operator} with number literal and element access`, (): void => {
						expect(parse(`1 ${operator} foo['a'];'a'`)).toMatchAST([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['MemberExpression', [
									['Identifier', 'foo'],
									['MembersList', [
										['StringLiteral', 'a'],
									]],
									['SemicolonSeparator', ';'],
								]],
							]],
							['StringLiteral', 'a'],
						]);
					});

					// method call and number
					it(`${operator} with method call and number literal`, (): void => {
						expect(parse(`foo('a') ${operator} 2;`)).toMatchAST([
							['BinaryExpression', operator, [
								['CallExpression', [
									['Identifier', 'foo'],
									['ArgumentsList', [
										['StringLiteral', 'a'],
									]],
								]],
								['NumberLiteral', '2'],
								['SemicolonSeparator', ';'],
							]],
						]);
					});
					it(`${operator} with number literal and method call`, (): void => {
						expect(parse(`1 ${operator} foo('a');`)).toMatchAST([
							['BinaryExpression', operator, [
								['NumberLiteral', '1'],
								['CallExpression', [
									['Identifier', 'foo'],
									['ArgumentsList', [
										['StringLiteral', 'a'],
									]],
									['SemicolonSeparator', ';'],
								]],
							]],
						]);
					});

					// element access and method call
					it(`${operator} with element access and method call`, (): void => {
						expect(parse(`foo['a'] ${operator} bar('b');`)).toMatchAST([
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
									['SemicolonSeparator', ';'],
								]],
							]],
						]);
					});
					it(`${operator} with method call and element access`, (): void => {
						expect(parse(`foo('a') ${operator} bar['b'];`)).toMatchAST([
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
									['SemicolonSeparator', ';'],
								]],
							]],
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
				expect(parse('1 + (2 * (-3/-(2.3-4)%9))')).toMatchAST([
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
				expect(parse('const foo = 1; let bar = -foo;')).toMatchAST([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator', '='],
						['NumberLiteral', '1'],
						['SemicolonSeparator', ';'],
					]],
					['VariableDeclaration', 'let', [
						['Identifier', 'bar'],
						['AssignmentOperator', '='],
						['UnaryExpression', '-', {before: true}, [
							['Identifier', 'foo'],
						]],
						['SemicolonSeparator', ';'],
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
			}`)).toMatchAST([
				['VariableDeclaration', 'const', [
					['Identifier', 'size'],
					['AssignmentOperator', '='],
					['WhenExpression', [
						['Identifier', 'someNumber'],
						['BlockStatement', [
							['WhenCase', [
								['WhenCaseTests', [
									['NumberLiteral', '1'],
									['CommaSeparator', ','],
									['NumberLiteral', '2'],
								]],
								['WhenCaseConsequent', [
									['StringLiteral', 'small'],
								]]
							]],
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
							['WhenCase', [
								['WhenCaseTests', [
									['NumberLiteral', '11'],
								]],
								['WhenCaseConsequent', [
									['BlockStatement', [
										['CallExpression', [
											['Identifier', 'doThing1'],
											['ArgumentsList', []],
											['SemicolonSeparator', ';'],
										]],
										['CallExpression', [
											['Identifier', 'doThing2'],
											['ArgumentsList', []],
											['SemicolonSeparator', ';'],
										]],
										['ReturnStatement', [
											['StringLiteral', 'large'],
											['SemicolonSeparator', ';'],
										]],
									]],
								]],
							]],
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
							['WhenCase', [
								['WhenCaseTests', [
									['RestElement', '...'],
								]],
								['WhenCaseConsequent', [
									['StringLiteral', 'off the charts'],
								]],
							]],
						]],
					]],
				]],
			]);
		});
	});

	describe('bugs fixed', (): void => {
		it('"foo()..3" should place the RangeExpression outside of the CallExpression', (): void => {
			expect(parse('foo()..3')).toMatchAST([
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
			expect(parse('[1<2, 4>3];')).toMatchAST([
				['ArrayExpression', [
					['BinaryExpression', '<', [
						['NumberLiteral', '1'],
						['NumberLiteral', '2'],
					]],
					['BinaryExpression', '>', [
						['NumberLiteral', '4'],
						['NumberLiteral', '3'],
					]],
					['SemicolonSeparator', ';'],
				]]
			]);
		});
	});
});
