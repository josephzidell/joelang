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
				['UnaryExpression', '-', { before: true }, [
					['NumberLiteral', '1,000'],
				]],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, operator, [
				['NumberLiteral', '1'],
				['UnaryExpression', '-', { before: true }, [
					['NumberLiteral', '2'],
				]],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`-1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, operator, [
				['UnaryExpression', '-', { before: true }, [
					['NumberLiteral', '1'],
				]],
				['UnaryExpression', '-', { before: true }, [
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

		expect(parse(`foo.a ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				['MemberExpression', [
					['Identifier', 'foo'],
					['Identifier', 'a'],
				]],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`foo['a'].b ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				['MemberExpression', [
					['MemberExpression', [
						['Identifier', 'foo'],
						['MembersList', [
							['StringLiteral', 'a'],
						]],
					]],
					['Identifier', 'b'],
				]],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`this.foo['a', 'b'].b ${operator} this.foo['a', 'c'].b;`)).toMatchParseTree([
			[nodeType, operator, [
				['MemberExpression', [
					['MemberExpression', [
						['MemberExpression', [
							['Keyword', 'this'],
							['Identifier', 'foo'],
						]],
						['MembersList', [
							['StringLiteral', 'a'],
							['CommaSeparator'],
							['StringLiteral', 'b'],
						]],
					]],
					['Identifier', 'b'],
				]],
				['MemberExpression', [
					['MemberExpression', [
						['MemberExpression', [
							['Keyword', 'this'],
							['Identifier', 'foo'],
						]],
						['MembersList', [
							['StringLiteral', 'a'],
							['CommaSeparator'],
							['StringLiteral', 'c'],
						]],
					]],
					['Identifier', 'b'],
				]],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`2 ${operator} this.foo['a']['c'].d;`)).toMatchParseTree([
			[nodeType, operator, [
				['NumberLiteral', '2'],
				['MemberExpression', [
					['MemberExpression', [
						['MemberExpression', [
							['MemberExpression', [
								['Keyword', 'this'],
								['Identifier', 'foo'],
							]],
							['MembersList', [
								['StringLiteral', 'a'],
							]],
						]],
						['MembersList', [
							['StringLiteral', 'c'],
						]],
					]],
					['Identifier', 'd'],
				]],
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
				['UnaryExpression', '-', { before: true }, [
					['NumberLiteral', '1'],
				]],
				['NumberLiteral', '2'],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, [
				['NumberLiteral', '1'],
				['UnaryExpression', '-', { before: true }, [
					['NumberLiteral', '2'],
				]],
			]],
			['SemicolonSeparator'],
		]);

		expect(parse(`-1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, [
				['UnaryExpression', '-', { before: true }, [
					['NumberLiteral', '1'],
				]],
				['UnaryExpression', '-', { before: true }, [
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
					['AssignmentOperator'],
					['BoolLiteral', 'false'],
				]],
			]);

			expect(parse('let x? = false')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x?'],
					['AssignmentOperator'],
					['BoolLiteral', 'false'],
				]],
			]);
		});

		it('a let assignment with a number literal', (): void => {
			expect(parse('let x = 1')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator'],
					['NumberLiteral', '1'],
				]],
			])

			expect(parse('const x = -2,300.006^e-2,000; const y = 5;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['AssignmentOperator'],
					['BinaryExpression', '^e', [
						['UnaryExpression', '-', { before: true }, [
							['NumberLiteral', '2,300.006'],
						]],
						['UnaryExpression', '-', { before: true }, [
							['NumberLiteral', '2,000'],
						]],
					]],
				]],
				['SemicolonSeparator'],
				['VariableDeclaration', 'const', [
					['Identifier', 'y'],
					['AssignmentOperator'],
					['NumberLiteral', '5'],
				]],
				['SemicolonSeparator'],
			])
		});

		it('a let assignment with a string literal', (): void => {
			expect(parse('let x = "foo"')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator'],
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
			]);

			expect(parse('let x?: bool;')).toMatchParseTree([
				['VariableDeclaration', 'let', [
					['Identifier', 'x?'],
					['ColonSeparator'],
					['Type', 'bool'],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('a const assignment with a specified type', (): void => {
			expect(parse('const x: string = "foo"')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['ColonSeparator'],
					['Type', 'string'],
					['AssignmentOperator'],
					['StringLiteral', 'foo'],
				]],
			]);
		});

		it('regex', (): void => {
			expect(parse('const x = /[a-z/;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['AssignmentOperator'],
					['RegularExpression', '/[a-z/'],
				]],
				['SemicolonSeparator'],
			]);

			expect(parse('const x: regex = /[a-z/g;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['ColonSeparator'],
					['Type', 'regex'],
					['AssignmentOperator'],
					['RegularExpression', '/[a-z/g'],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('path', (): void => {
			expect(parse('const dir = @/path/to/dir/;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'dir'],
					['AssignmentOperator'],
					['Path', '@/path/to/dir/'],
				]],
				['SemicolonSeparator'],
			]);

			expect(parse('const dir = ./myDir/;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'dir'],
					['AssignmentOperator'],
					['Path', './myDir/'],
				]],
				['SemicolonSeparator'],
			]);

			expect(parse('const dir: path = @/path/to/dir/;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'dir'],
					['ColonSeparator'],
					['Type', 'path'],
					['AssignmentOperator'],
					['Path', '@/path/to/dir/'],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('custom type', (): void => {
			expect(parse('const myClass: MyClass = MyClass.create();')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'myClass'],
					['ColonSeparator'],
					['Identifier', 'MyClass'],
					['AssignmentOperator'],
					['CallExpression', [
						['MemberExpression', [
							['Identifier', 'MyClass'],
							['Identifier', 'create'],
						]],
						['ArgumentsList', []],
					]],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('nil', (): void => {
			expect(parse('const x = nil')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'x'],
					['AssignmentOperator'],
					['Nil', 'nil'],
				]],
			])
		});

		describe('tuples', () => {

			it('tuple', () => {
				expect(parse('const foo = <1, "pizza", 3.14>;')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['TupleExpression', [
							['NumberLiteral', '1'],
							['CommaSeparator'],
							['StringLiteral', 'pizza'],
							['CommaSeparator'],
							['NumberLiteral', '3.14'],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('empty tuple', () => {
				expect(parse('const foo = <>;')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['TupleExpression', []],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('nested tuples', () => {
				expect(parse(`const foo = <
					<1, 'pizza', 3.14>,
					true,
					@/some/file.joe,
					1..3,
					<1, 2, 'fizz', 4, 'buzz'>
				>;`)).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['TupleExpression', [
							['TupleExpression', [
								['NumberLiteral', '1'],
								['CommaSeparator'],
								['StringLiteral', 'pizza'],
								['CommaSeparator'],
								['NumberLiteral', '3.14'],
							]],
							['CommaSeparator'],
							['BoolLiteral', 'true'],
							['CommaSeparator'],
							['Path', '@/some/file.joe'],
							['CommaSeparator'],
							['RangeExpression', [
								['NumberLiteral', '1'],
								['NumberLiteral', '3'],
							]],
							['CommaSeparator'],
							['TupleExpression', [
								['NumberLiteral', '1'],
								['CommaSeparator'],
								['NumberLiteral', '2'],
								['CommaSeparator'],
								['StringLiteral', 'fizz'],
								['CommaSeparator'],
								['NumberLiteral', '4'],
								['CommaSeparator'],
								['StringLiteral', 'buzz'],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('with ternary in item', () => {
				expect(parse(`<
					1,
					someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
					true
				>`)).toMatchParseTree([
					['TupleExpression', [
						['NumberLiteral', '1'],
						['CommaSeparator'],
						['TernaryExpression', [
							['TernaryCondition', [
								['Identifier', 'someCondition'],
							]],
							['TernaryThen', [
								['StringLiteral', 'burnt-orange'],
							]],
							['TernaryElse', [
								['StringLiteral', ''],
							]],
						]],
						['CommaSeparator'],
						['Comment', '// will always be defined, so the shape is correct'],
						['BoolLiteral', 'true'],
					]],
				]);
			});

			it('tuple in object', () => {
				expect(parse('const foo = {tpl: <1>};')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['ObjectExpression', [
							['Property', [
								['Identifier', 'tpl'],
								['TupleExpression', [
									['NumberLiteral', '1'],
								]],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			})

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
				expect(parse('[1, -2, 3,456, 3^e-2, 3.14, 1,2,3]')).toMatchParseTree([
					['ArrayExpression', [
						['NumberLiteral', '1'],
						['CommaSeparator'],
						['UnaryExpression', '-', { before: true }, [
							['NumberLiteral', '2'],
						]],
						['CommaSeparator'],
						['NumberLiteral', '3,456'],
						['CommaSeparator'],
						['BinaryExpression', '^e', [
							['NumberLiteral', '3'],
							['UnaryExpression', '-', { before: true }, [
								['NumberLiteral', '2'],
							]],
						]],
						['CommaSeparator'],
						['NumberLiteral', '3.14'],
						['CommaSeparator'],
						['NumberLiteral', '1,2,3'], // weird but legal
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

			it('tuples', () => {
				expect(parse("const foo: <string, number, bool>[] = [<'foo', 3.14, false>, <'bar', 900, true>];")).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['ColonSeparator'],
						['ArrayType', [
							['TupleType', [
								['Type', 'string'],
								['CommaSeparator'],
								['Type', 'number'],
								['CommaSeparator'],
								['Type', 'bool'],
							]],
						]],
						['AssignmentOperator'],
						['ArrayExpression', [
							['TupleExpression', [
								['StringLiteral', 'foo'],
								['CommaSeparator'],
								['NumberLiteral', '3.14'],
								['CommaSeparator'],
								['BoolLiteral', 'false'],
							]],
							['CommaSeparator'],
							['TupleExpression', [
								['StringLiteral', 'bar'],
								['CommaSeparator'],
								['NumberLiteral', '900'],
								['CommaSeparator'],
								['BoolLiteral', 'true'],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('pojos', () => {
				expect(parse("const foo: {a: number, b: string}[] = [{a: 4, b: 'c'}];")).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['ColonSeparator'],
						['ArrayType', [
							['ObjectType', [
								['Property', [
									['Identifier', 'a'],
									['Type', 'number'],
								]],
								['CommaSeparator'],
								['Property', [
									['Identifier', 'b'],
									['Type', 'string'],
								]],
							]],
						]],
						['AssignmentOperator'],
						['ArrayExpression', [
							['ObjectExpression', [
								['Property', [
									['Identifier', 'a'],
									['NumberLiteral', '4'],
								]],
								['CommaSeparator'],
								['Property', [
									['Identifier', 'b'],
									['StringLiteral', 'c'],
								]],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('assignments', () => {
				expect(parse('const numbers = [1, 2];')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'numbers'],
						['AssignmentOperator'],
						['ArrayExpression', [
							['NumberLiteral', '1'],
							['CommaSeparator'],
							['NumberLiteral', '2'],
						]],
					]],
					['SemicolonSeparator'],
				]);

				expect(parse('let myArray: bool[] = [];')).toMatchParseTree([
					['VariableDeclaration', 'let', [
						['Identifier', 'myArray'],
						['ColonSeparator'],
						['ArrayType', [
							['Type', 'bool'],
						]],
						['AssignmentOperator'],
						['ArrayExpression', []],
					]],
					['SemicolonSeparator'],
				]);
			});

		});

		describe('ternary', () => {

			it('should work in a variable declaration', () => {
				expect(parse('const foo = bar ? 1 : 2;')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['TernaryExpression', [
							['TernaryCondition', [
								['Identifier', 'bar'],
							]],
							['TernaryThen', [
								['NumberLiteral', '1'],
							]],
							['TernaryElse', [
								['NumberLiteral', '2'],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('should work when nested', () => {
				expect(parse('const foo = bar ? (baz ? 3 : 4) : 2;')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['TernaryExpression', [
							['TernaryCondition', [
								['Identifier', 'bar'],
							]],
							['TernaryThen', [
								['Parenthesized', [
									['TernaryExpression', [
										['TernaryCondition', [
											['Identifier', 'baz'],
										]],
										['TernaryThen', [
											['NumberLiteral', '3'],
										]],
										['TernaryElse', [
											['NumberLiteral', '4'],
										]],
									]],
								]],
							]],
							['TernaryElse', [
								['NumberLiteral', '2'],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('should work in an array', () => {
				expect(parse('[foo ? 1 : 2, 3]')).toMatchParseTree([
					['ArrayExpression', [
						['TernaryExpression', [
							['TernaryCondition', [
								['Identifier', 'foo'],
							]],
							['TernaryThen', [
								['NumberLiteral', '1'],
							]],
							['TernaryElse', [
								['NumberLiteral', '2'],
							]],
						]],
						['CommaSeparator'],
						['NumberLiteral', '3'],
					]],
				]);
			});

			it('should work in a return', () => {
				expect(parse('f foo -> bool, number {return bar ? true : false, 3;}')).toMatchParseTree([
					['FunctionDeclaration', [
						['Identifier', 'foo'],
						['FunctionReturns', [
							['Type', 'bool'],
							['CommaSeparator'],
							['Type', 'number'],
						]],
						['BlockStatement', [
							['ReturnStatement', [
								['TernaryExpression', [
									['TernaryCondition', [
										['Identifier', 'bar'],
									]],
									['TernaryThen', [
										['BoolLiteral', 'true'],
									]],
									['TernaryElse', [
										['BoolLiteral', 'false'],
									]],
								]],
								['CommaSeparator'],
								['NumberLiteral', '3'],
							]],
							['SemicolonSeparator'],
						]]
					]],
				]);
			});

		});

		describe('pojos', () => {

			it('pojo', () => {
				expect(parse('const foo = {a: 1, b: "pizza", c: 3.14, d: [10, 11]};')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['ObjectExpression', [
							['Property', [
								['Identifier', 'a'],
								['NumberLiteral', '1'],
							]],
							['CommaSeparator'],
							['Property', [
								['Identifier', 'b'],
								['StringLiteral', 'pizza'],
							]],
							['CommaSeparator'],
							['Property', [
								['Identifier', 'c'],
								['NumberLiteral', '3.14'],
							]],
							['CommaSeparator'],
							['Property', [
								['Identifier', 'd'],
								['ArrayExpression', [
									['NumberLiteral', '10'],
									['CommaSeparator'],
									['NumberLiteral', '11'],
								]],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('empty pojo', () => {
				expect(parse('const foo = {};')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['ObjectExpression', []],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('nested pojos', () => {
				expect(parse(`const foo = {
					obj: {a: 1, b: 'pizza', pi: {two_digits: 3.14}},
					bol: true,
					pth: @/some/file.joe,
					range: {range: 1..3},
					tpl: <1, 2, 'fizz', 4, 'buzz'>
				};`)).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['ObjectExpression', [
							['Property', [
								['Identifier', 'obj'],
								['ObjectExpression', [
									['Property', [
										['Identifier', 'a'],
										['NumberLiteral', '1'],
									]],
									['CommaSeparator'],
									['Property', [
										['Identifier', 'b'],
										['StringLiteral', 'pizza'],
									]],
									['CommaSeparator'],
									['Property', [
										['Identifier', 'pi'],
										['ObjectExpression', [
											['Property', [
												['Identifier', 'two_digits'],
												['NumberLiteral', '3.14'],
											]],
										]],
									]],
								]],
							]],
							['CommaSeparator'],
							['Property', [
								['Identifier', 'bol'],
								['BoolLiteral', 'true'],
							]],
							['CommaSeparator'],
							['Property', [
								['Identifier', 'pth'],
								['Path', '@/some/file.joe'],
							]],
							['CommaSeparator'],
							['Property', [
								['Identifier', 'range'],
								['ObjectExpression', [
									['Property', [
										['Identifier', 'range'],
										['RangeExpression', [
											['NumberLiteral', '1'],
											['NumberLiteral', '3'],
										]],
									]],
								]],
							]],
							['CommaSeparator'],
							['Property', [
								['Identifier', 'tpl'],
								['TupleExpression', [
									['NumberLiteral', '1'],
									['CommaSeparator'],
									['NumberLiteral', '2'],
									['CommaSeparator'],
									['StringLiteral', 'fizz'],
									['CommaSeparator'],
									['NumberLiteral', '4'],
									['CommaSeparator'],
									['StringLiteral', 'buzz'],
								]],
							]],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});

			it('with ternary in item', () => {
				expect(parse(`{
					a: 1,
					b: someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
					c: true
				}`)).toMatchParseTree([
					['ObjectExpression', [
						['Property', [
							['Identifier', 'a'],
							['NumberLiteral', '1'],
						]],
						['CommaSeparator'],
						['Property', [
							['Identifier', 'b'],
							['TernaryExpression', [
								['TernaryCondition', [
									['Identifier', 'someCondition'],
								]],
								['TernaryThen', [
									['StringLiteral', 'burnt-orange'],
								]],
								['TernaryElse', [
									['StringLiteral', ''],
								]],
							]],
						]],
						['CommaSeparator'],
						['Comment', '// will always be defined, so the shape is correct'],
						['Property', [
							['Identifier', 'c'],
							['BoolLiteral', 'true'],
						]],
					]],
				]);
			});

			it('with array in item', () => {
				expect(parse(`{
					a: [1]
				}`)).toMatchParseTree([
					['ObjectExpression', [
						['Property', [
							['Identifier', 'a'],
							['ArrayExpression', [
								['NumberLiteral', '1'],
							]],
						]],
					]],
				]);
			});

			it('with MemberExpression in item', () => {
				expect(parse(`{
					a: [foo[1]]
				}`)).toMatchParseTree([
					['ObjectExpression', [
						['Property', [
							['Identifier', 'a'],
							['ArrayExpression', [
								['MemberExpression', [
									['Identifier', 'foo'],
									['MembersList', [
										['NumberLiteral', '1'],
									]],
								]],
							]],
						]],
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

		it('generics', () => {
			expect(parse('a(B<|T|>);')).toMatchParseTree([
				['CallExpression', [
					['Identifier', 'a'],
					['ArgumentsList', [
						['Typed', [
							['Identifier', 'B'],
							['TypeArgumentsList', [
								['Identifier', 'T'],
							]],
						]],
					]],
				]],
				['SemicolonSeparator'],
			]);

			expect(parse('a<|T|>(B);')).toMatchParseTree([
				['CallExpression', [
					['Typed', [
						['Identifier', 'a'],
						['TypeArgumentsList', [
							['Identifier', 'T'],
						]],
					]],
					['ArgumentsList', [
						['Identifier', 'B'],
					]],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('more advanced generics', () => {
			expect(parse('const foo = Foo<|{T: T}, T[]|>();')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'foo'],
					['AssignmentOperator'],
					['CallExpression', [
						['Typed', [
							['Identifier', 'Foo'],
							['TypeArgumentsList', [
								['ObjectExpression', [
									['Property', [
										['Identifier', 'T'],
										['Identifier', 'T'],
									]],
								]],
								['CommaSeparator'],
								['ArrayType', [
									['Identifier', 'T'],
								]],
							]],
						]],
						['ArgumentsList', []],
					]],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('multiple inheritance manual resolution', () => {
			expect(parse(`class C extends A, B {
				f foo () {
					return this.parent<|A|>.foo(); // <-- Specify to use B.foo
				}
			}`)).toMatchParseTree([
				['ClassDeclaration', [
					['Identifier', 'C'],
					['ClassExtensionsList', [
						['Identifier', 'A'],
						['CommaSeparator'],
						['Identifier', 'B'],
					]],
					['BlockStatement', [
						['FunctionDeclaration', [
							['Identifier', 'foo'],
							['ParametersList', []],
							['BlockStatement', [
								['ReturnStatement', [
									['CallExpression', [
										['MemberExpression', [
											['MemberExpression', [
												['Keyword', 'this'],
												['Typed', [
													['Identifier', 'parent'],
													['TypeArgumentsList', [
														['Identifier', 'A'],
													]],
												]],
											]],
											['Identifier', 'foo'],
										]],
										['ArgumentsList', []],
									]],
								]],
								['SemicolonSeparator'],
								['Comment', '// <-- Specify to use B.foo'],
							]],
						]],
					]],
				]],
			]);
		})

	});

	describe('ClassDeclaration and InterfaceDeclaration', (): void => {
		it('empty class', (): void => {
			expect(parse('class Foo {}')).toMatchParseTree([
				['ClassDeclaration', [
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]],
			]);

			expect(parse('class Foo <| T, U |> {}')).toMatchParseTree([
				['ClassDeclaration', [
					['Typed', [
						['Identifier', 'Foo'],
						['TypeParametersList', [
							['TypeParameter', [
								['Identifier', 'T'],
							]],
							['CommaSeparator'],
							['TypeParameter', [
								['Identifier', 'U'],
							]],
						]],
					]],
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
							['AssignmentOperator'],
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

		it('class extends multiple and implements multiple with generics', (): void => {
			expect(parse('class Foo<|T,U|> extends Bar<|T|>, Baz implements AbstractFooBar, AnotherAbstractClass<|U|> {}')).toMatchParseTree([
				['ClassDeclaration', [
					['Typed', [
						['Identifier', 'Foo'],
						['TypeParametersList', [
							['TypeParameter', [
								['Identifier', 'T'],
							]],
							['CommaSeparator'],
							['TypeParameter', [
								['Identifier', 'U'],
							]],
						]],
					]],
					['ClassExtensionsList', [
						['Typed', [
							['Identifier', 'Bar'],
							['TypeArgumentsList', [
								['Identifier', 'T'],
							]],
						]],
						['CommaSeparator'],
						['Identifier', 'Baz'],
					]],
					['ClassImplementsList', [
						['Identifier', 'AbstractFooBar'],
						['CommaSeparator'],
						['Typed', [
							['Identifier', 'AnotherAbstractClass'],
							['TypeArgumentsList', [
								['Identifier', 'U'],
							]],
						]],
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

			expect(parse('abstract class Foo<|T|> {}')).toMatchParseTree([
				['ClassDeclaration', [
					['ModifiersList', [
						['Modifier', 'abstract'],
					]],
					['Typed', [
						['Identifier', 'Foo'],
						['TypeParametersList', [
							['TypeParameter', [
								['Identifier', 'T'],
							]],
						]],
					]],
					['BlockStatement', []],
				]],
			]);

			expect(parse(`
			abstract class Foo {
				abstract const baz: number;

				abstract static f hello<|T|> (name = 'World') -> Greeting, T;

				static f world (name = 'Earth');
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
								['Modifier', 'static'],
							]],
							['Typed', [
								['Identifier', 'hello'],
								['TypeParametersList', [
									['TypeParameter', [
										['Identifier', 'T'],
									]],
								]],
							]],
							['ParametersList', [
								['Parameter', [
									['Identifier', 'name'],
									['AssignmentOperator'],
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
						['FunctionDeclaration', [
							['ModifiersList', [
								['Modifier', 'static'],
							]],
							['Identifier', 'world'],
							['ParametersList', [
								['Parameter', [
									['Identifier', 'name'],
									['AssignmentOperator'],
									['StringLiteral', 'Earth'],
								]],
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
						['AssignmentOperator'],
						['NumberLiteral', '0'],
					]],
					['SemicolonSeparator'],
					['BinaryExpression', '<', [
						['Identifier', 'i'],
						['NumberLiteral', '10'],
					]],
					['SemicolonSeparator'],
					['UnaryExpression', '++', { before: false }, [
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
							['AssignmentOperator'],
							['NumberLiteral', '0'],
						]],
						['SemicolonSeparator'],
						['BinaryExpression', '<', [
							['Identifier', 'i'],
							['NumberLiteral', '10'],
						]],
						['SemicolonSeparator'],
						['UnaryExpression', '++', { before: false }, [
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
			expect(parse(`f foo -> bool, string {
				return true, 'hey';
			}`)).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['FunctionReturns', [
						['Type', 'bool'],
						['CommaSeparator'],
						['Type', 'string'],
					]],
					['BlockStatement', [
						['ReturnStatement', [
							['BoolLiteral', 'true'],
							['CommaSeparator'],
							['StringLiteral', 'hey'],
						]],
						['SemicolonSeparator'],
					]],
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

		it('params and return types using tuples', (): void => {
			expect(parse('f foo (a: <bool>) -> <number> {}')).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['TupleType', [
								['Type', 'bool'],
							]],
						]],
					]],
					['FunctionReturns', [
						['TupleType', [
							['Type', 'number'],
						]],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('params and return types using tuples and arrays', (): void => {
			expect(parse('f foo (a: <bool[]>[]) -> <number> {}')).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['ArrayType', [
								['TupleType', [
									['ArrayType', [
										['Type', 'bool'],
									]],
								]],
							]],
						]],
					]],
					['FunctionReturns', [
						['TupleType', [
							['Type', 'number'],
						]],
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
							['AssignmentOperator'],
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

		it('return when', () => {
			expect(parse(`f school (age: number) -> string {
				return when age {
					11 -> 'Hogwarts First Year',
					12..17 -> 'Another Year at Hogwarts',
					... -> 'University',
				};
			}`)).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'school'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'age'],
							['ColonSeparator'],
							['Type', 'number'],
						]],
					]],
					['FunctionReturns', [
						['Type', 'string'],
					]],
					['BlockStatement', [
						['ReturnStatement', [
							['WhenExpression', [
								['Identifier', 'age'],
								['BlockStatement', [
									['WhenCase', [
										['WhenCaseTests', [
											['NumberLiteral', '11'],
										]],
										['WhenCaseConsequent', [
											['StringLiteral', 'Hogwarts First Year'],
										]],
									]],
									['CommaSeparator'],
									['WhenCase', [
										['WhenCaseTests', [
											['RangeExpression', [
												['NumberLiteral', '12'],
												['NumberLiteral', '17'],
											]],
										]],
										['WhenCaseConsequent', [
											['StringLiteral', 'Another Year at Hogwarts'],
										]],
									]],
									['CommaSeparator'],
									['WhenCase', [
										['WhenCaseTests', [
											['RestElement', '...'],
										]],
										['WhenCaseConsequent', [
											['StringLiteral', 'University'],
										]],
									]],
									['CommaSeparator'],
								]],
							]],
						]],
						['SemicolonSeparator'],
					]],
				]],
			]);
		});

		it('multiple returns with when', () => {
			expect(parse(`f foo (age: number) -> number, string {
				return 5, when age {... -> 'No more foos',};
			}`)).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'age'],
							['ColonSeparator'],
							['Type', 'number'],
						]],
					]],
					['FunctionReturns', [
						['Type', 'number'],
						['CommaSeparator'],
						['Type', 'string'],
					]],
					['BlockStatement', [
						['ReturnStatement', [
							['NumberLiteral', '5'],
							['CommaSeparator'],
							['WhenExpression', [
								['Identifier', 'age'],
								['BlockStatement', [
									['WhenCase', [
										['WhenCaseTests', [
											['RestElement', '...'],
										]],
										['WhenCaseConsequent', [
											['StringLiteral', 'No more foos'],
										]],
									]],
									['CommaSeparator'],
								]],
							]],
						]],
						['SemicolonSeparator'],
					]],
				]],
			]);
		});

		it('generics', (): void => {
			expect(parse('f foo <|T|> (a: T) -> T {}')).toMatchParseTree([
				['FunctionDeclaration', [
					['Typed', [
						['Identifier', 'foo'],
						['TypeParametersList', [
							['TypeParameter', [
								['Identifier', 'T'],
							]],
						]],
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
				abstract f foo3<| T |> -> bool;
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
							['Typed', [
								['Identifier', 'foo3'],
								['TypeParametersList', [
									['TypeParameter', [
										['Identifier', 'T'],
									]],
								]],
							]],
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
		});

		it('anonymous simple', () => {
			expect(parse('const foo = f {};')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'foo'],
					['AssignmentOperator'],
					['FunctionDeclaration', [
						['BlockStatement', []],
					]],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('anonymous complex', () => {
			expect(parse('const foo = f <|T|>(a: T) -> T {\ndo();\n};')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['Identifier', 'foo'],
					['AssignmentOperator'],
					['FunctionDeclaration', [
						['TypeParametersList', [
							['TypeParameter', [
								['Identifier', 'T'],
							]],
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
						['BlockStatement', [
							['CallExpression', [
								['Identifier', 'do'],
								['ArgumentsList', []],
							]],
							['SemicolonSeparator'],
						]],
					]],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('anonymous abstract', () => {
			expect(parse('abstract const foo = f;')).toMatchParseTree([
				['VariableDeclaration', 'const', [
					['ModifiersList', [
						['Modifier', 'abstract'],
					]],
					['Identifier', 'foo'],
					['AssignmentOperator'],
					['FunctionDeclaration'],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('ending with a bang', () => {
			expect(parse(`f danger! {
				// throw Error if something bad happens
			}`)).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'danger!'],
					['BlockStatement', [
						['Comment', '// throw Error if something bad happens'],
					]],
				]],
			]);
		});

		it('ending with a question mark', () => {
			expect(parse(`f danger? -> bool {
				return true;
			}`)).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'danger?'],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', [
						['ReturnStatement', [
							['BoolLiteral', 'true'],
						]],
						['SemicolonSeparator'],
					]],
				]],
			]);
		});

		it('ending with a question mark and bang', () => {
			expect(parse(`f isDone?! -> bool {
				// throw Error if something bad happens

				return true;
			}`)).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'isDone?!'],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', [
						['Comment', '// throw Error if something bad happens'],
						['ReturnStatement', [
							['BoolLiteral', 'true'],
						]],
						['SemicolonSeparator'],
					]],
				]],
			]);
		});

		describe('special function names', () => {

			describe('<=>', () => {

				// outside of a class
				it('<=> as function name outside of a class should throw a ParserError', (): void => {
					expect(() => parse(`f <=> {}`)).toThrowError('"<=>" is a BinaryExpression and we hoped to find a value before it, but alas!');
				});

				// in a class
				it('<=> as function name inside of a class should be an innocent Identifier', (): void => {
					expect(parse(`class A{f <=> {}}`)).toMatchParseTree([
						['ClassDeclaration', [
							['Identifier', 'A'],
							['BlockStatement', [
								['FunctionDeclaration', [
									['Identifier', '<=>'],
									['BlockStatement', []],
								]],
							]],
						]],
					]);
				});

			});

		});

	});

	describe('IfStatement', (): void => {

		describe('before', () => {

			it('with bool conditional', () => {
				expect(parse('if true {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BoolLiteral', 'true'],
						['BlockStatement', []],
					]],
				]);
			});

			it('with BinaryExpression conditional using two NumberLiterals', () => {
				expect(parse('if 1 < 2 {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BinaryExpression', '<', [
							['NumberLiteral', '1'],
							['NumberLiteral', '2'],
						]],
						['BlockStatement', []],
					]],
				]);
			});

			it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
				expect(parse('if foo == 2 {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BinaryExpression', '==', [
							['Identifier', 'foo'],
							['NumberLiteral', '2'],
						]],
						['BlockStatement', []],
					]],
				]);
			});

			it('with BinaryExpression conditional using a CallExpression and a NumberLiteral', () => {
				expect(parse('if foo() == 2 {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BinaryExpression', '==', [
							['CallExpression', [
								['Identifier', 'foo'],
								['ArgumentsList', []],
							]],
							['NumberLiteral', '2'],
						]],
						['BlockStatement', []],
					]],
				]);
			});

			it('with two conditions', () => {
				expect(parse('if foo() == 2 && a < 3 {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BinaryExpression', '&&', [
							['BinaryExpression', '==', [
								['CallExpression', [
									['Identifier', 'foo'],
									['ArgumentsList', []],
								]],
								['NumberLiteral', '2'],
							]],
							['BinaryExpression', '<', [
								['Identifier', 'a'],
								['NumberLiteral', '3'],
							]],
						]],
						['BlockStatement', []],
					]],
				]);
			});

			describe('with parens', () => {

				it('and one condition', () => {
					expect(parse('if (foo() == 2) {}')).toMatchParseTree([
						['IfStatement', { before: true }, [
							['Parenthesized', [
								['BinaryExpression', '==', [
									['CallExpression', [
										['Identifier', 'foo'],
										['ArgumentsList', []],
									]],
									['NumberLiteral', '2'],
								]],
							]],
							['BlockStatement', []],
						]],
					]);
				});

				it('and two conditions', () => {
					expect(parse('if (foo() == 2 && a < 3) {}')).toMatchParseTree([
						['IfStatement', { before: true }, [
							['Parenthesized', [
								['BinaryExpression', '&&', [
									['BinaryExpression', '==', [
										['CallExpression', [
											['Identifier', 'foo'],
											['ArgumentsList', []],
										]],
										['NumberLiteral', '2'],
									]],
									['BinaryExpression', '<', [
										['Identifier', 'a'],
										['NumberLiteral', '3'],
									]],
								]],
							]],
							['BlockStatement', []],
						]],
					]);
				});

			});

			it('with just else', () => {

				expect(parse('if true {} else {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BoolLiteral', 'true'],
						['BlockStatement', []],
						['BlockStatement', []],
					]],
				]);

			});

			it('with else if', () => {

				expect(parse('if true {} else if false {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BoolLiteral', 'true'],
						['BlockStatement', []],
						['IfStatement', { before: true }, [
							['BoolLiteral', 'false'],
							['BlockStatement', []],
						]],
					]],
				]);

			});

			it('with a subsequent if and should be two separate IfStatements', () => {

				expect(parse('if true {} if false {}')).toMatchParseTree([
					['IfStatement', { before: true }, [
						['BoolLiteral', 'true'],
						['BlockStatement', []],
					]],
					['IfStatement', { before: true }, [
						['BoolLiteral', 'false'],
						['BlockStatement', []],
					]],
				]);

			});

		});

		describe('after', () => {

			it('after a CallExpression', () => {
				expect(parse('do(1) if foo == 2;')).toMatchParseTree([
					['IfStatement', { before: false }, [
						['CallExpression', [
							['Identifier', 'do'],
							['ArgumentsList', [
								['NumberLiteral', '1'],
							]],
						]],
						['BinaryExpression', '==', [
							['Identifier', 'foo'],
							['NumberLiteral', '2'],
						]],
					]],
					['SemicolonSeparator'],
				]);
			});


			describe('in an array', () => {

				it('with bool conditional', () => {
					expect(parse('[foo if true, bar];')).toMatchParseTree([
						['ArrayExpression', [
							['IfStatement', { before: false }, [
								['Identifier', 'foo'],
								['BoolLiteral', 'true'],
							]],
							['CommaSeparator'],
							['Identifier', 'bar'],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with identifier conditional', () => {
					expect(parse('[9, 10 if isDone?, 11];')).toMatchParseTree([
						['ArrayExpression', [
							['NumberLiteral', '9'],
							['CommaSeparator'],
							['IfStatement', { before: false }, [
								['NumberLiteral', '10'],
								['Identifier', 'isDone?'],
							]],
							['CommaSeparator'],
							['NumberLiteral', '11'],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with MemberExpression conditional', () => {
					expect(parse('[9, 10 if this.isDone?, 11];')).toMatchParseTree([
						['ArrayExpression', [
							['NumberLiteral', '9'],
							['CommaSeparator'],
							['IfStatement', { before: false }, [
								['NumberLiteral', '10'],
								['MemberExpression', [
									['Keyword', 'this'],
									['Identifier', 'isDone?'],
								]],
							]],
							['CommaSeparator'],
							['NumberLiteral', '11'],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with CallExpression conditional', () => {
					expect(parse('[9, 10 if this.isDone?!([true if true]), 11];')).toMatchParseTree([
						['ArrayExpression', [
							['NumberLiteral', '9'],
							['CommaSeparator'],
							['IfStatement', { before: false }, [
								['NumberLiteral', '10'],
								['CallExpression', [
									['MemberExpression', [
										['Keyword', 'this'],
										['Identifier', 'isDone?!'],
									]],
									['ArgumentsList', [
										['ArrayExpression', [
											['IfStatement', { before: false }, [
												['BoolLiteral', 'true'],
												['BoolLiteral', 'true'],
											]],
										]],
									]],
								]],
							]],
							['CommaSeparator'],
							['NumberLiteral', '11'],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with BinaryExpression conditional using two NumberLiterals', () => {
					expect(parse('[\'foo\', "bar" if 1 < 2];')).toMatchParseTree([
						['ArrayExpression', [
							['StringLiteral', 'foo'],
							['CommaSeparator'],
							['IfStatement', { before: false }, [
								['StringLiteral', 'bar'],
								['BinaryExpression', '<', [
									['NumberLiteral', '1'],
									['NumberLiteral', '2'],
								]],
							]],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
					expect(parse('[true, true, false, false if foo == 2, true, false, true];')).toMatchParseTree([
						['ArrayExpression', [
							['BoolLiteral', 'true'],
							['CommaSeparator'],
							['BoolLiteral', 'true'],
							['CommaSeparator'],
							['BoolLiteral', 'false'],
							['CommaSeparator'],
							['IfStatement', { before: false }, [
								['BoolLiteral', 'false'],
								['BinaryExpression', '==', [
									['Identifier', 'foo'],
									['NumberLiteral', '2'],
								]],
							]],
							['CommaSeparator'],
							['BoolLiteral', 'true'],
							['CommaSeparator'],
							['BoolLiteral', 'false'],
							['CommaSeparator'],
							['BoolLiteral', 'true'],
						]],
						['SemicolonSeparator'],
					]);
				});

			});

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

	describe('InterfaceDeclaration', (): void => {

		it('empty interface', (): void => {
			expect(parse('interface Foo {}')).toMatchParseTree([
				['InterfaceDeclaration', [
					['Identifier', 'Foo'],
					['BlockStatement', []],
				]],
			]);

			expect(parse('interface Foo <| T, U |> {}')).toMatchParseTree([
				['InterfaceDeclaration', [
					['Typed', [
						['Identifier', 'Foo'],
						['TypeParametersList', [
							['TypeParameter', [
								['Identifier', 'T'],
							]],
							['CommaSeparator'],
							['TypeParameter', [
								['Identifier', 'U'],
							]],
						]],
					]],
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

		it('interface extends multiple with generics', (): void => {
			expect(parse('interface Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}')).toMatchParseTree([
				['InterfaceDeclaration', [
					['Typed', [
						['Identifier', 'Foo'],
						['TypeParametersList', [
							['TypeParameter', [
								['Identifier', 'T'],
							]],
							['CommaSeparator'],
							['TypeParameter', [
								['Identifier', 'U'],
							]],
						]],
					]],
					['InterfaceExtensionsList', [
						['Typed', [
							['Identifier', 'Bar'],
							['TypeArgumentsList', [
								['Identifier', 'T'],
							]],
						]],
						['CommaSeparator'],
						['Typed', [
							['Identifier', 'Baz'],
							['TypeArgumentsList', [
								['Identifier', 'U'],
							]],
						]],
					]],
					['BlockStatement', []],
				]],
			]);
		});

	})

	describe('Loop', (): void => {

		it('simple loop', () => {
			expect(parse('loop {}')).toMatchParseTree([
				['Loop', [
					['BlockStatement', []],
				]],
			]);
		});

		it('with function call in body and break in a condition', () => {
			expect(parse(`loop {
				const response = http.server.listen(3,000);

				if response.status.code > 300 {
					break;
				}
			}`)).toMatchParseTree([
				['Loop', [
					['BlockStatement', [
						['VariableDeclaration', 'const', [
							['Identifier', 'response'],
							['AssignmentOperator'],
							['CallExpression', [
								['MemberExpression', [
									['MemberExpression', [
										['Identifier', 'http'],
										['Identifier', 'server'],
									]],
									['Identifier', 'listen'],
								]],
								['ArgumentsList', [
									['NumberLiteral', '3,000'],
								]],
							]],
						]],
						['SemicolonSeparator'],
						['IfStatement', { before: true }, [
							['BinaryExpression', '>', [
								['MemberExpression', [
									['MemberExpression', [
										['Identifier', 'response'],
										['Identifier', 'status'],
									]],
									['Identifier', 'code'],
								]],
								['NumberLiteral', '300'],
							]],
							['BlockStatement', [
								['BreakStatement'],
								['SemicolonSeparator'],
							]],
						]],
					]],
				]],
			]);
		});

	});

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

		it('works with this', () => {
			expect(parse('this.foo')).toMatchParseTree([
				['MemberExpression', [
					['Keyword', 'this'],
					['Identifier', 'foo'],
				]],
			]);
		});

	});

	describe('CallExpression with create', () => {

		it('simple', () => {
			expect(parse('A.create();')).toMatchParseTree([
				['CallExpression', [
					['MemberExpression', [
						['Identifier', 'A'],
						['Identifier', 'create'],
					]],
					['ArgumentsList', []],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('with GenericTypes and Arguments', () => {
			expect(parse('A<|T, U|>.create(T.create(), U.create(), "foo");')).toMatchParseTree([
				['CallExpression', [
					['MemberExpression', [
						['Typed', [
							['Identifier', 'A'],
							['TypeArgumentsList', [
								['Identifier', 'T'],
								['CommaSeparator'],
								['Identifier', 'U'],
							]],
						]],
						['Identifier', 'create'],
					]],
					['ArgumentsList', [
						['CallExpression', [
							['MemberExpression', [
								['Identifier', 'T'],
								['Identifier', 'create'],
							]],
							['ArgumentsList', []],
						]],
						['CommaSeparator'],
						['CallExpression', [
							['MemberExpression', [
								['Identifier', 'U'],
								['Identifier', 'create'],
							]],
							['ArgumentsList', []],
						]],
						['CommaSeparator'],
						['StringLiteral', 'foo'],
					]],
				]],
				['SemicolonSeparator'],
			]);
		});

		it('with several nested layers', () => {
			expect(parse('A.B.C.D.create();')).toMatchParseTree([
				['CallExpression', [
					['MemberExpression', [
						['MemberExpression', [
							['MemberExpression', [
								['MemberExpression', [
									['Identifier', 'A'],
									['Identifier', 'B'],
								]],
								['Identifier', 'C'],
							]],
							['Identifier', 'D'],
						]],
						['Identifier', 'create'],
					]],
					['ArgumentsList', []],
				]],
				['SemicolonSeparator'],
			]);
		});

	});

	describe('Operators', (): void => {
		describe('UnaryExpression', (): void => {

			describe('negation', () => {

				it('with Identifier', (): void => {
					expect(parse('!foo;')).toMatchParseTree([
						['UnaryExpression', '!', { before: true }, [
							['Identifier', 'foo'],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with Identifier in parens', (): void => {
					expect(parse('(!foo);')).toMatchParseTree([
						['Parenthesized', [
							['UnaryExpression', '!', { before: true }, [
								['Identifier', 'foo'],
							]],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with CallExpression', (): void => {
					expect(parse('!bar();')).toMatchParseTree([
						['UnaryExpression', '!', { before: true }, [
							['CallExpression', [
								['Identifier', 'bar'],
								['ArgumentsList', []],
							]],
						]],
						['SemicolonSeparator'],
					]);
				});

				it('with nested CallExpression', (): void => {
					expect(parse('!foo.bar();')).toMatchParseTree([
						['UnaryExpression', '!', { before: true }, [
							['CallExpression', [
								['MemberExpression', [
									['Identifier', 'foo'],
									['Identifier', 'bar'],
								]],
								['ArgumentsList', []],
							]],
						]],
						['SemicolonSeparator'],
					]);
				});

			});

			describe('negative number', () => {

				it('without parens', (): void => {
					expect(parse('-1')).toMatchParseTree([
						['UnaryExpression', '-', { before: true }, [
							['NumberLiteral', '1'],
						]]
					]);
				});

				it('with parens', (): void => {
					expect(parse('(-1)')).toMatchParseTree([
						['Parenthesized', [
							['UnaryExpression', '-', { before: true }, [
								['NumberLiteral', '1'],
							]],
						]],
					]);
				});

			});

			describe('increment and decrement', () => {

				it('pre-decrement', (): void => {
					expect(parse('--foo')).toMatchParseTree([
						['UnaryExpression', '--', { before: true }, [
							['Identifier', 'foo'],
						]],
					]);

					expect(parse('foo[--i]')).toMatchParseTree([
						['MemberExpression', [
							['Identifier', 'foo'],
							['MembersList', [
								['UnaryExpression', '--', { before: true }, [
									['Identifier', 'i'],
								]],
							]],
						]],
					]);
				});

				it('post-decrement', (): void => {
					expect(parse('foo--')).toMatchParseTree([
						['UnaryExpression', '--', { before: false }, [
							['Identifier', 'foo'],
						]],
					]);

					expect(parse('foo---')).toMatchParseTree([
						['BinaryExpression', '-', [
							['UnaryExpression', '--', { before: false }, [
								['Identifier', 'foo'],
							]],
						]],
					]);

					expect(parse('foo[i--]')).toMatchParseTree([
						['MemberExpression', [
							['Identifier', 'foo'],
							['MembersList', [
								['UnaryExpression', '--', { before: false }, [
									['Identifier', 'i'],
								]],
							]],
						]],
					]);
				});

				it('pre-increment', (): void => {
					expect(parse('++foo')).toMatchParseTree([
						['UnaryExpression', '++', { before: true }, [
							['Identifier', 'foo'],
						]],
					]);

					expect(parse('foo[++i]')).toMatchParseTree([
						['MemberExpression', [
							['Identifier', 'foo'],
							['MembersList', [
								['UnaryExpression', '++', { before: true }, [
									['Identifier', 'i'],
								]],
							]],
						]],
					]);
				});

				it('post-increment', (): void => {
					expect(parse('foo++')).toMatchParseTree([
						['UnaryExpression', '++', { before: false }, [
							['Identifier', 'foo'],
						]],
					]);

					expect(parse('foo+++')).toMatchParseTree([
						['BinaryExpression', '+', [
							['UnaryExpression', '++', { before: false }, [
								['Identifier', 'foo'],
							]],
						]],
					]);

					expect(parse('foo[i++]')).toMatchParseTree([
						['MemberExpression', [
							['Identifier', 'foo'],
							['MembersList', [
								['UnaryExpression', '++', { before: false }, [
									['Identifier', 'i'],
								]],
							]],
						]],
					]);
				});
			});

		});

		describe('BinaryExpression', (): void => {
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

			describe('compound with operator precedence', (): void => {

				it('makes && higher precedence than equality checks', () => {
					expect(parse('foo >= 2 && foo <= 5')).toMatchParseTree([
						['BinaryExpression', '&&', [
							['BinaryExpression', '>=', [
								['Identifier', 'foo'],
								['NumberLiteral', '2'],
							]],
							['BinaryExpression', '<=', [
								['Identifier', 'foo'],
								['NumberLiteral', '5'],
							]],
						]],
					]);
				});

				it('makes || higher precedence than equality checks', () => {
					expect(parse('foo > 2 || foo < 5')).toMatchParseTree([
						['BinaryExpression', '||', [
							['BinaryExpression', '>', [
								['Identifier', 'foo'],
								['NumberLiteral', '2'],
							]],
							['BinaryExpression', '<', [
								['Identifier', 'foo'],
								['NumberLiteral', '5'],
							]],
						]],
					]);
				});

			});

		});
	});

	describe('Parens', (): void => {
		describe('mathematical expressions', (): void => {
			it('a simple mathematical formula', (): void => {
				expect(parse('1 + (2 * (-3/-(2.3-4)%9))')).toMatchParseTree([
					['BinaryExpression', '+', [
						['NumberLiteral', '1'],
						['Parenthesized', [
							['BinaryExpression', '*', [
								['NumberLiteral', '2'],
								['Parenthesized', [
									['BinaryExpression', '/', [
										['UnaryExpression', '-', { before: true }, [
											['NumberLiteral', '3'],
										]],
										['BinaryExpression', '%', [
											['UnaryExpression', '-', { before: true }, [
												['Parenthesized', [
													['BinaryExpression', '-', [
														['NumberLiteral', '2.3'],
														['NumberLiteral', '4'],
													]],
												]],
											]],
											['NumberLiteral', '9'],
										]],
									]],
								]],
							]],
						]],
					]],
				]);
			});

			it('supports mathematical expressions with variables', (): void => {
				expect(parse('const foo = 1; let bar = -foo;')).toMatchParseTree([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator'],
						['NumberLiteral', '1'],
					]],
					['SemicolonSeparator'],
					['VariableDeclaration', 'let', [
						['Identifier', 'bar'],
						['AssignmentOperator'],
						['UnaryExpression', '-', { before: true }, [
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
			]);
		});

		it('should work with a CallExpression', () => {
			expect(parse('print myFoo.foo();')).toMatchParseTree([
				['PrintStatement', [
					['CallExpression', [
						['MemberExpression', [
							['Identifier', 'myFoo'],
							['Identifier', 'foo'],
						]],
						['ArgumentsList', []],
					]],
				]],
				['SemicolonSeparator'],
			]);
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
			expect(parse(`when (someNumber) {
				1 -> 'small',
			}`)).toMatchParseTree([
				['WhenExpression', [
					['Parenthesized', [
						['Identifier', 'someNumber'],
					]],
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
					['AssignmentOperator'],
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

	describe('WhileStatement', (): void => {

		it('with CallExpression test', () => {
			expect(parse('while foo() {}')).toMatchParseTree([
				['WhileStatement', [
					['CallExpression', [
						['Identifier', 'foo'],
						['ArgumentsList', []],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('with BinaryExpression test', () => {
			expect(parse('while i < 10 {}')).toMatchParseTree([
				['WhileStatement', [
					['BinaryExpression', '<', [
						['Identifier', 'i'],
						['NumberLiteral', '10'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('with UnaryExpression test', () => {
			expect(parse('while !i {}')).toMatchParseTree([
				['WhileStatement', [
					['UnaryExpression', '!', { before: true }, [
						['Identifier', 'i'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('with parens and BinaryExpression', () => {
			expect(parse('while (this.foo != true) {}')).toMatchParseTree([
				['WhileStatement', [
					['Parenthesized', [
						['BinaryExpression', '!=', [
							['MemberExpression', [
								['Keyword', 'this'],
								['Identifier', 'foo'],
							]],
							['BoolLiteral', 'true'],
						]],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('with parens and UnaryExpression', () => {
			expect(parse('while (!this.foo()) {}')).toMatchParseTree([
				['WhileStatement', [
					['Parenthesized', [
						['UnaryExpression', '!', { before: true }, [
							['CallExpression', [
								['MemberExpression', [
									['Keyword', 'this'],
									['Identifier', 'foo'],
								]],
								['ArgumentsList', []],
							]],
						]],
					]],
					['BlockStatement', []],
				]],
			]);
		});

		it('with contents in body', () => {
			expect(parse('while (!foo) {\ndo();\n}')).toMatchParseTree([
				['WhileStatement', [
					['Parenthesized', [
						['UnaryExpression', '!', { before: true }, [
							['Identifier', 'foo'],
						]],
					]],
					['BlockStatement', [
						['CallExpression', [
							['Identifier', 'do'],
							['ArgumentsList', []],
						]],
						['SemicolonSeparator'],
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

		it('"f foo(a: number = 1,234, b = true) -> bool {}" should correctly see the comma as a separator', () => {
			expect(parse('f foo(a: number = 1,234, b = true) -> bool {}')).toMatchParseTree([
				['FunctionDeclaration', [
					['Identifier', 'foo'],
					['ParametersList', [
						['Parameter', [
							['Identifier', 'a'],
							['ColonSeparator'],
							['Type', 'number'],
							['AssignmentOperator'],
							['NumberLiteral', '1,234'],
						]],
						['CommaSeparator'],
						['Parameter', [
							['Identifier', 'b'],
							['AssignmentOperator'],
							['BoolLiteral', 'true'],
						]],
					]],
					['FunctionReturns', [
						['Type', 'bool'],
					]],
					['BlockStatement', []],
				]],
			]);
		});

	});
});
