import Lexer from '../lexer/lexer';
import { types } from '../lexer/types';
import Parser from './parser';
import { Node, NodeType } from './types';
import '../setupJest'; // for the types

/** Shortcut method to `new Parser(new Lexer(code).lexify()).parse()` */
const parse = (code: string): Node => new Parser(new Lexer(code).lexify()).parse();

const doubleExpressionScenariosCheckingOperator = (operator: string, nodeType: NodeType) => {
	// 2 numbers
	it(`${operator} with 2 number literals`, (): void => {
		expect(parse(`1 ${operator} 2,000;`)).toMatchParseTree([
			[nodeType, operator, [
				['NumberLiteral', '1'],
				['NumberLiteral', '2,000'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`-1,000 ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '1,000'],
				]],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, operator, [
				['NumberLiteral', '1'],
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '2'],
				]],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`-1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, operator, [
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '1'],
				]],
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '2'],
				]],
			]],
			['SemicolonSeparator'],
		]);
	});

	// identifier and number
	it(`${operator} with identifier and number literal`, (): void => {
		expect(parse(`foo ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				['Identifier', 'foo'],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);
	});

	it(`${operator} with number literal and identifier`, (): void => {
		expect(parse(`1 ${operator} foo;`)).toMatchParseTree([
			[nodeType, operator, [
				['NumberLiteral', '1'],
				['Identifier', 'foo'],
			]],
			['SemicolonSeparator'],
		]);
	});

	// nil and number
	it(`${operator} with nil and number literal`, (): void => {
		expect(parse(`nil ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				['Nil', 'nil'],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);
	});

	it(`${operator} with number literal and nil`, (): void => {
		expect(parse(`1 ${operator} nil;`)).toMatchParseTree([
			[nodeType, operator, [
				['NumberLiteral', '1'],
				['Nil', 'nil'],
			]],
			['SemicolonSeparator'],
		]);
	});

	// element access and number
	it(`${operator} with element access and number literal`, (): void => {
		expect(parse(`foo['a'] ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
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
			[nodeType, operator, [
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
			[nodeType, operator, [
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
			[nodeType, operator, [
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
			[nodeType, operator, [
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
			[nodeType, operator, [
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

const doubleExpressionScenariosNotCheckingOperator = (operator: string, nodeType: NodeType) => {
	// 2 numbers
	it(`${operator} with 2 number literals`, (): void => {
		expect(parse(`1 ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				['NumberLiteral', '1'],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`-1 ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '1'],
				]],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, [
				['NumberLiteral', '1'],
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '2'],
				]],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`-1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, [
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '1'],
				]],
				['UnaryExpression', '-', {before: true}, [
					['NumberLiteral', '2'],
				]],
			]],
			['SemicolonSeparator'],
		]);
	});

	// identifier and number
	it(`${operator} with identifier and number literal`, (): void => {
		expect(parse(`foo ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				['Identifier', 'foo'],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);
	});

	it(`${operator} with number literal and identifier`, (): void => {
		expect(parse(`1 ${operator} foo;`)).toMatchParseTree([
			[nodeType, [
				['NumberLiteral', '1'],
				['Identifier', 'foo'],
			]],
			['SemicolonSeparator'],
		]);
	});

	// nil and number
	it(`${operator} with nil and number literal`, (): void => {
		expect(parse(`nil ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				['Nil', 'nil'],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);
	});

	it(`${operator} with number literal and nil`, (): void => {
		expect(parse(`1 ${operator} nil;`)).toMatchParseTree([
			[nodeType, [
				['NumberLiteral', '1'],
				['Nil', 'nil'],
			]],
			['SemicolonSeparator'],
		]);
	});

	// element access and number
	it(`${operator} with element access and number literal`, (): void => {
		expect(parse(`foo['a'] ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
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
			[nodeType, [
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
			[nodeType, [
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
			[nodeType, [
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
			[nodeType, [
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
			[nodeType, [
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

			it('bools', (): void => {
				expect(parse('[false, true, true, false]')).toMatchParseTree([
					['ArrayExpression', [
						['BoolLiteral', 'false'],
						['CommaSeparator'],
						['BoolLiteral', 'true'],
						['CommaSeparator'],
						['BoolLiteral', 'true'],
						['CommaSeparator'],
						['BoolLiteral', 'false'],
					]],
				]);
			});

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

			it('paths', (): void => {
				expect(parse('[@/file.joe, @/another/file.joe]')).toMatchParseTree([
					['ArrayExpression', [
						['Path', '@/file.joe'],
						['CommaSeparator'],
						['Path', '@/another/file.joe'],
					]],
				]);
			});

			it('regexes', (): void => {
				expect(parse('[/[a-z]/i, /[0-9]/g, /\d/]')).toMatchParseTree([
					['ArrayExpression', [
						['RegularExpression', '/[a-z]/i'],
						['CommaSeparator'],
						['RegularExpression', '/[0-9]/g'],
						['CommaSeparator'],
						['RegularExpression', '/\d/'],
					]],
				]);
			});

			it('strings', (): void => {
				expect(parse('[\'foo\', "bar"]')).toMatchParseTree([
					['ArrayExpression', [
						['StringLiteral', 'foo'],
						['CommaSeparator'],
						['StringLiteral', 'bar'],
					]],
				]);
			});

		});
	});

	describe('CallExpression', () => {

		it('works with several nested layers', () => {
			expect(parse('a.b.c.d(); 4')).toMatchParseTree([
				['CallExpression', [
					['MemberExpression', [
						['MemberExpression', [
							['MemberExpression', [
								['Identifier', 'a'],
								['Identifier', 'b'],
							]],
							['Identifier', 'c'],
						]],
						['Identifier', 'd'],
					]],
					['ArgumentsList', []],
				]],
				['SemicolonSeparator'],
				['NumberLiteral', '4'],
			]);
		});

		it('call followed by property', () => {
			expect(parse('a(1).b')).toMatchParseTree([
				['MemberExpression', [
					['CallExpression', [
						['Identifier', 'a'],
						['ArgumentsList', [
							['NumberLiteral', '1'],
						]],
					]],
					['Identifier', 'b'],
				]],
			]);
		});

		it('call followed by a call', () => {
			expect(parse('a(1).b(2)')).toMatchParseTree([
				['CallExpression', [
					['MemberExpression', [
						['CallExpression', [
							['Identifier', 'a'],
							['ArgumentsList', [
								['NumberLiteral', '1'],
							]],
						]],
						['Identifier', 'b'],
					]],
					['ArgumentsList', [
						['NumberLiteral', '2'],
					]],
				]],
			]);
		});

	})

	describe('ClassDeclaration and InterfaceDeclaration', (): void => {
		it('empty class', (): void => {
			expect(parse('class Foo {}')).toMatchParseTree([
				['ClassDeclaration', [
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]],
			]);
		});

		it('class with comment', (): void => {
			expect(parse('class Foo {\n# foo\n}\n# bar\n')).toMatchParseTree([
				['ClassDeclaration', [
					['Identifier', 'Foo'],
					['BlockStatement', [
						['Comment', '# foo'],
					]],
				]],
				['Comment', '# bar'],
			]);
		});

		it('class with properties and methods', (): void => {
			expect(parse('class Foo {\nconst foo = "bar";\nf bar {}}\n# bar\n')).toMatchParseTree([
				['ClassDeclaration', [
					['Identifier', 'Foo'],
					['BlockStatement', [
						['VariableDeclaration', 'const', [
							['Identifier', 'foo'],
							['AssignmentOperator', '='],
							['StringLiteral', 'bar'],
						]],
						['SemicolonSeparator'],
						['FunctionDeclaration', [
							['Identifier', 'bar'],
							['BlockStatement', []],
						]],
					]],
				]],
				['Comment', '# bar'],
			]);
		});

		it('class extends multiple and implements multiple', (): void => {
			expect(parse('class Foo extends Bar, Baz implements AbstractFooBar, AnotherAbstractClass {}')).toMatchParseTree([
				['ClassDeclaration', [
					['Identifier', 'Foo'],
					['ClassExtensionsList', [
						['Identifier', 'Bar'],
						['CommaSeparator'],
						['Identifier', 'Baz'],
					]],
					['ClassImplementsList', [
						['Identifier', 'AbstractFooBar'],
						['CommaSeparator'],
						['Identifier', 'AnotherAbstractClass'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('abstract class', (): void => {
			expect(parse('abstract class Foo {}')).toMatchParseTree([
				['ClassDeclaration', [
					['ModifiersList', [
						['Modifier', 'abstract'],
					]],
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]],
			]);

			expect(parse(`
			abstract class Foo {
				abstract const baz: number;

				abstract f hello<T> (name = 'World') -> Greeting, T;
			}`)).toMatchParseTree([
				['ClassDeclaration', [
					['ModifiersList', [
						['Modifier', 'abstract'],
					]],
					['Identifier', 'Foo'],
					['BlockStatement', [
						['VariableDeclaration', 'const', [
							['ModifiersList', [
								['Modifier', 'abstract'],
							]],
							['Identifier', 'baz'],
							['ColonSeparator'],
							['Type', 'number'],
						]],
						['SemicolonSeparator'],
						['FunctionDeclaration', [
							['ModifiersList', [
								['Modifier', 'abstract'],
							]],
							['Identifier', 'hello'],
							['GenericTypesList', [
								['Identifier', 'T'],
							]],
							['ParametersList', [
								['Parameter', [
									['Identifier', 'name'],
									['AssignmentOperator', '='],
									['StringLiteral', 'World'],
								]],
							]],
							['FunctionReturns', [
								['Identifier', 'Greeting'],
								['CommaSeparator'],
								['Identifier', 'T'],
							]],
						]],
						['SemicolonSeparator'],
					]],
				]],
			]);


			expect(parse('abstract class Foo {}\nclass Bar extends Foo {}')).toMatchParseTree([
				['ClassDeclaration', [
					['ModifiersList', [
						['Modifier', 'abstract'],
					]],
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]],
				['ClassDeclaration', [
					['Identifier', 'Bar'],
					['ClassExtensionsList', [
						['Identifier', 'Foo'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

	});

	describe('Comment', (): void => {
		it('a single-line comment', (): void => {
			expect(parse('# let x = "foo"')).toMatchParseTree([
				['Comment', '# let x = "foo"'],
			])
		});

		it('a multi-line comment', (): void => {
			expect(parse('/* let x = "foo" */')).toMatchParseTree([
				['Comment', '/* let x = "foo" */'],
			])
		});

	});

	describe('ForStatement', (): void => {

		it('simple for statement', () => {
			expect(parse('for let i = 0; i < 10; i++ {}')).toMatchParseTree([
				['ForStatement', [
					['VariableDeclaration', 'let', [
						['Identifier', 'i'],
						['AssignmentOperator', '='],
						['NumberLiteral', '0'],
					]],
					['SemicolonSeparator'],
					['BinaryExpression', '<', [
						['Identifier', 'i'],
						['NumberLiteral', '10'],
					]],
					['SemicolonSeparator'],
					['UnaryExpression', '++', {before: false}, [
						['Identifier', 'i'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('with parens', () => {
			expect(parse('for (let i = 0; i < 10; i++) {}')).toMatchParseTree([
				['ForStatement', [
					['Parenthesized', [
						['VariableDeclaration', 'let', [
							['Identifier', 'i'],
							['AssignmentOperator', '='],
							['NumberLiteral', '0'],
						]],
						['SemicolonSeparator'],
						['BinaryExpression', '<', [
							['Identifier', 'i'],
							['NumberLiteral', '10'],
						]],
						['SemicolonSeparator'],
						['UnaryExpression', '++', {before: false}, [
							['Identifier', 'i'],
						]],
					]],
					['BlockStatement', []],
				]],
			]);
		});

	});

	describe('FunctionDeclaration', (): void => {
		it('no params or return types', (): void => {
			expect(parse('f foo {}')).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['BlockStatement', []],
				]],
			]);
		});

		it('no params with single return type', (): void => {
			expect(parse('f foo -> bool {} 5;')).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
				['NumberLiteral', '5'],
				['SemicolonSeparator'],
			]);
		});

		it('no params with multiple return types', (): void => {
			expect(parse('f foo -> bool, string {}')).toMatchParseTree([
				['FunctionDeclaration', [
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
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['ParametersList', []],
					['BlockStatement', []],
				]],
			]);
		});

		it('param parens with return types', (): void => {
			expect(parse('f foo () -> bool {}')).toMatchParseTree([
				['FunctionDeclaration', [
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
				['FunctionDeclaration', [
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
				['FunctionDeclaration', [
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
				['FunctionDeclaration', [
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
				['FunctionDeclaration', [
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
				['FunctionDeclaration', [
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

		it('abstract functions', () => {
			expect(parse(`abstract class A {
				abstract f foo1;
				abstract f foo2 (arg: number);
				abstract f foo3 -> bool;
				abstract f foo4 (arg: number) -> bool;
			}`)).toMatchParseTree([
				['ClassDeclaration', [
					['ModifiersList', [
						['Modifier', 'abstract'],
					]],
					['Identifier', 'A'],
					['BlockStatement', [
						// foo1
						['FunctionDeclaration', [
							['ModifiersList', [
								['Modifier', 'abstract'],
							]],
							['Identifier', 'foo1'],
						]],
						['SemicolonSeparator'],
						// foo2
						['FunctionDeclaration', [
							['ModifiersList', [
								['Modifier', 'abstract'],
							]],
							['Identifier', 'foo2'],
							['ParametersList', [
								['Parameter', [
									['Identifier', 'arg'],
									['ColonSeparator'],
									['Type', 'number'],
								]],
							]],
						]],
						['SemicolonSeparator'],
						// foo3
						['FunctionDeclaration', [
							['ModifiersList', [
								['Modifier', 'abstract'],
							]],
							['Identifier', 'foo3'],
							['FunctionReturns', [
								['Type', 'bool'],
							]],
						]],
						['SemicolonSeparator'],
						// foo4
						['FunctionDeclaration', [
							['ModifiersList', [
								['Modifier', 'abstract'],
							]],
							['Identifier', 'foo4'],
							['ParametersList', [
								['Parameter', [
									['Identifier', 'arg'],
									['ColonSeparator'],
									['Type', 'number'],
								]],
							]],
							['FunctionReturns', [
								['Type', 'bool'],
							]],
						]],
						['SemicolonSeparator'],
					]],
				]],
			]);
		})


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

	describe('InterfaceDeclaration', (): void => {

		it('empty interface', (): void => {
			expect(parse('interface Foo {}')).toMatchParseTree([
				['InterfaceDeclaration', [
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]],
			]);
		});

		it('interface extends other', (): void => {
			expect(parse('interface Foo {} interface Bar extends Foo {}')).toMatchParseTree([
				['InterfaceDeclaration', [
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]],
				['InterfaceDeclaration', [
					['Identifier', 'Bar'],
					['InterfaceExtensionsList', [
						['Identifier', 'Foo'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('interface extends multiple', (): void => {
			expect(parse('interface Foo extends Bar, Baz {}')).toMatchParseTree([
				['InterfaceDeclaration', [
					['Identifier', 'Foo'],
					['InterfaceExtensionsList', [
						['Identifier', 'Bar'],
						['CommaSeparator'],
						['Identifier', 'Baz'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

	})

	describe('MemberExpression', () => {

		it('works with several nested layers', () => {
			expect(parse('a.b.c.d')).toMatchParseTree([
				['MemberExpression', [
					['MemberExpression', [
						['MemberExpression', [
							['Identifier', 'a'],
							['Identifier', 'b'],
						]],
						['Identifier', 'c'],
					]],
					['Identifier', 'd'],
				]],
			]);
		});

	})

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
				describe('compare', (): void => {
					doubleExpressionScenariosCheckingOperator('<=>', 'BinaryExpression');
				});

				describe('equals', (): void => {
					doubleExpressionScenariosCheckingOperator('==', 'BinaryExpression');
				});

				describe('not equals', (): void => {
					doubleExpressionScenariosCheckingOperator('!=', 'BinaryExpression');
				});

				describe('less than', (): void => {
					doubleExpressionScenariosCheckingOperator('<', 'BinaryExpression');
				});

				describe('less than or equals', (): void => {
					doubleExpressionScenariosCheckingOperator('<=', 'BinaryExpression');
				});

				describe('greater than', (): void => {
					doubleExpressionScenariosCheckingOperator('>', 'BinaryExpression');
				});

				describe('greater than or equals', (): void => {
					doubleExpressionScenariosCheckingOperator('>=', 'BinaryExpression');
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

	describe('Print', () => {

		it('is closed with a semicolon', () => {
			expect(parse('print foo[5];print 5;')).toMatchParseTree([
				['PrintStatement', [
					['MemberExpression', [
						['Identifier', 'foo'],
						['MembersList', [
							['NumberLiteral', '5'],
						]],
					]],
				]],
				['SemicolonSeparator'],
				['PrintStatement', [
					['NumberLiteral', '5'],
				]],
				['SemicolonSeparator'],
			])
		})

	})

	describe('RepeatStatement', (): void => {

		it('simple repeat statement', () => {
			expect(parse('repeat {}')).toMatchParseTree([
				['RepeatStatement', [
					['BlockStatement', []],
				]],
			]);
		});

		it('with break', () => {
			expect(parse('repeat {\nbreak;\n}')).toMatchParseTree([
				['RepeatStatement', [
					['BlockStatement', [
						['BreakStatement'],
						['SemicolonSeparator'],
					]],
				]],
			]);
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

			describe('ranges', (): void => {
				doubleExpressionScenariosNotCheckingOperator('..', 'RangeExpression');
			});

		});
	});

	describe('WhenExpression', (): void => {

		it('works with a small example', () => {
			expect(parse(`when someNumber {
				1 -> 'small',
			}`)).toMatchParseTree([
				['WhenExpression', [
					['Identifier', 'someNumber'],
					['BlockStatement', [
						['WhenCase', [
							['WhenCaseTests', [
								['NumberLiteral', '1'],
							]],
							['WhenCaseConsequent', [
								['StringLiteral', 'small'],
							]],
						]],
						['CommaSeparator'],
					]],
				]],
			]);
		});

		it('case with brace', () => {
			expect(parse(`when someNumber {
				1 -> {
					doThing1();
					doThing2();

					return 'large';
				},
			}`)).toMatchParseTree([
				['WhenExpression', [
					['Identifier', 'someNumber'],
					['BlockStatement', [
						['WhenCase', [
							['WhenCaseTests', [
								['NumberLiteral', '1'],
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
					]],
				]],
			]);
		});

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
