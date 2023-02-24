import Lexer from '../lexer/lexer';
import { types } from '../lexer/types';
import Parser from './parser';
import { Node, NT } from './types';
import '../setupJest'; // for the types

/** Shortcut method to `new Parser(new Lexer(code).lexify()).parse()` */
const parse = (code: string): Node => new Parser(new Lexer(code).lexify()).parse();

const doubleExpressionScenariosCheckingOperator = (operator: string, nodeType: NT) => {
	// 2 numbers
	it(`${operator} with 2 number literals`, (): void => {
		expect(parse(`1 ${operator} 2,000;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.NumberLiteral, '1'],
				[NT.NumberLiteral, '2,000'],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`-1,000 ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '1,000'],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.NumberLiteral, '1'],
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '2'],
				]],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`-1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '1'],
				]],
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '2'],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	// identifier and number
	it(`${operator} with identifier and number literal`, (): void => {
		expect(parse(`foo ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.Identifier, 'foo'],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and identifier`, (): void => {
		expect(parse(`1 ${operator} foo;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.NumberLiteral, '1'],
				[NT.Identifier, 'foo'],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	// element access and number
	it(`${operator} with element access and number literal`, (): void => {
		expect(parse(`foo['a'] ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.MemberExpression, [
					[NT.Identifier, 'foo'],
					[NT.MembersList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`foo.a ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.MemberExpression, [
					[NT.Identifier, 'foo'],
					[NT.Identifier, 'a'],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`foo['a'].b ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.MemberExpression, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.MembersList, [
							[NT.StringLiteral, 'a'],
						]],
					]],
					[NT.Identifier, 'b'],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`this.foo['a', 'b'].b ${operator} this.foo['a', 'c'].b;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.MemberExpression, [
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.Keyword, 'this'],
							[NT.Identifier, 'foo'],
						]],
						[NT.MembersList, [
							[NT.StringLiteral, 'a'],
							[NT.CommaSeparator],
							[NT.StringLiteral, 'b'],
						]],
					]],
					[NT.Identifier, 'b'],
				]],
				[NT.MemberExpression, [
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.Keyword, 'this'],
							[NT.Identifier, 'foo'],
						]],
						[NT.MembersList, [
							[NT.StringLiteral, 'a'],
							[NT.CommaSeparator],
							[NT.StringLiteral, 'c'],
						]],
					]],
					[NT.Identifier, 'b'],
				]],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`2 ${operator} this.foo['a']['c'].d;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.NumberLiteral, '2'],
				[NT.MemberExpression, [
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.MemberExpression, [
								[NT.Keyword, 'this'],
								[NT.Identifier, 'foo'],
							]],
							[NT.MembersList, [
								[NT.StringLiteral, 'a'],
							]],
						]],
						[NT.MembersList, [
							[NT.StringLiteral, 'c'],
						]],
					]],
					[NT.Identifier, 'd'],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and element access`, (): void => {
		expect(parse(`1 ${operator} foo['a'];'a'`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.NumberLiteral, '1'],
				[NT.MemberExpression, [
					[NT.Identifier, 'foo'],
					[NT.MembersList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
			[NT.StringLiteral, 'a'],
		]);
	});

	// method call and number
	it(`${operator} with method call and number literal`, (): void => {
		expect(parse(`foo('a') ${operator} 2;`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.CallExpression, [
					[NT.Identifier, 'foo'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and method call`, (): void => {
		expect(parse(`1 ${operator} foo('a');`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.NumberLiteral, '1'],
				[NT.CallExpression, [
					[NT.Identifier, 'foo'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	// element access and method call
	it(`${operator} with element access and method call`, (): void => {
		expect(parse(`foo['a'] ${operator} bar('b');`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.MemberExpression, [
					[NT.Identifier, 'foo'],
					[NT.MembersList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.CallExpression, [
					[NT.Identifier, 'bar'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'b'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with method call and element access`, (): void => {
		expect(parse(`foo('a') ${operator} bar['b'];`)).toMatchParseTree([
			[nodeType, operator, [
				[NT.CallExpression, [
					[NT.Identifier, 'foo'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.MemberExpression, [
					[NT.Identifier, 'bar'],
					[NT.MembersList, [
						[NT.StringLiteral, 'b'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});
};

const doubleExpressionScenariosNotCheckingOperator = (operator: string, nodeType: NT) => {
	// 2 numbers
	it(`${operator} with 2 number literals`, (): void => {
		expect(parse(`1 ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				[NT.NumberLiteral, '1'],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`-1 ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '1'],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, [
				[NT.NumberLiteral, '1'],
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '2'],
				]],
			]],
			[NT.SemicolonSeparator],
		]);

		expect(parse(`-1 ${operator} -2;`)).toMatchParseTree([
			[nodeType, [
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '1'],
				]],
				[NT.UnaryExpression, '-', { before: true }, [
					[NT.NumberLiteral, '2'],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	// identifier and number
	it(`${operator} with identifier and number literal`, (): void => {
		expect(parse(`foo ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				[NT.Identifier, 'foo'],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and identifier`, (): void => {
		expect(parse(`1 ${operator} foo;`)).toMatchParseTree([
			[nodeType, [
				[NT.NumberLiteral, '1'],
				[NT.Identifier, 'foo'],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	// element access and number
	it(`${operator} with element access and number literal`, (): void => {
		expect(parse(`foo['a'] ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				[NT.MemberExpression, [
					[NT.Identifier, 'foo'],
					[NT.MembersList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and element access`, (): void => {
		expect(parse(`1 ${operator} foo['a'];'a'`)).toMatchParseTree([
			[nodeType, [
				[NT.NumberLiteral, '1'],
				[NT.MemberExpression, [
					[NT.Identifier, 'foo'],
					[NT.MembersList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
			[NT.StringLiteral, 'a'],
		]);
	});

	// method call and number
	it(`${operator} with method call and number literal`, (): void => {
		expect(parse(`foo('a') ${operator} 2;`)).toMatchParseTree([
			[nodeType, [
				[NT.CallExpression, [
					[NT.Identifier, 'foo'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.NumberLiteral, '2'],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and method call`, (): void => {
		expect(parse(`1 ${operator} foo('a');`)).toMatchParseTree([
			[nodeType, [
				[NT.NumberLiteral, '1'],
				[NT.CallExpression, [
					[NT.Identifier, 'foo'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});

	// element access and method call
	it(`${operator} with element access and method call`, (): void => {
		expect(parse(`foo['a'] ${operator} bar('b');`)).toMatchParseTree([
			[nodeType, [
				[NT.MemberExpression, [
					[NT.Identifier, 'foo'],
					[NT.MembersList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.CallExpression, [
					[NT.Identifier, 'bar'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'b'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});
	it(`${operator} with method call and element access`, (): void => {
		expect(parse(`foo('a') ${operator} bar['b'];`)).toMatchParseTree([
			[nodeType, [
				[NT.CallExpression, [
					[NT.Identifier, 'foo'],
					[NT.ArgumentsList, [
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.MemberExpression, [
					[NT.Identifier, 'bar'],
					[NT.MembersList, [
						[NT.StringLiteral, 'b'],
					]],
				]],
			]],
			[NT.SemicolonSeparator],
		]);
	});
};

describe('parser.ts', (): void => {
	describe('VariableDeclaration', (): void => {
		it('a let assignment with a bool literal', (): void => {
			expect(parse('let x = false')).toMatchParseTree([
				[NT.VariableDeclaration, 'let', [
					[NT.Identifier, 'x'],
					[NT.AssignmentOperator],
					[NT.BoolLiteral, 'false'],
				]],
			]);

			expect(parse('let x? = false')).toMatchParseTree([
				[NT.VariableDeclaration, 'let', [
					[NT.Identifier, 'x?'],
					[NT.AssignmentOperator],
					[NT.BoolLiteral, 'false'],
				]],
			]);
		});

		it('a let assignment with a number literal', (): void => {
			expect(parse('let x = 1')).toMatchParseTree([
				[NT.VariableDeclaration, 'let', [
					[NT.Identifier, 'x'],
					[NT.AssignmentOperator],
					[NT.NumberLiteral, '1'],
				]],
			])

			expect(parse('const x = -2,300.006^e-2,000; const y = 5;')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'x'],
					[NT.AssignmentOperator],
					[NT.BinaryExpression, '^e', [
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '2,300.006'],
						]],
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '2,000'],
						]],
					]],
				]],
				[NT.SemicolonSeparator],
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'y'],
					[NT.AssignmentOperator],
					[NT.NumberLiteral, '5'],
				]],
				[NT.SemicolonSeparator],
			])
		});

		it('a let assignment with a string literal', (): void => {
			expect(parse('let x = "foo"')).toMatchParseTree([
				[NT.VariableDeclaration, 'let', [
					[NT.Identifier, 'x'],
					[NT.AssignmentOperator],
					[NT.StringLiteral, 'foo'],
				]],
			])
		});

		it('a let with a specified type', (): void => {
			expect(parse('let x: string;')).toMatchParseTree([
				[NT.VariableDeclaration, 'let', [
					[NT.Identifier, 'x'],
					[NT.ColonSeparator],
					[NT.Type, 'string'],
				]],
				[NT.SemicolonSeparator],
			]);

			expect(parse('let x?: bool;')).toMatchParseTree([
				[NT.VariableDeclaration, 'let', [
					[NT.Identifier, 'x?'],
					[NT.ColonSeparator],
					[NT.Type, 'bool'],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('a const assignment with a specified type', (): void => {
			expect(parse('const x: string = "foo"')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'x'],
					[NT.ColonSeparator],
					[NT.Type, 'string'],
					[NT.AssignmentOperator],
					[NT.StringLiteral, 'foo'],
				]],
			]);
		});

		it('regex', (): void => {
			expect(parse('const x = /[a-z/;')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'x'],
					[NT.AssignmentOperator],
					[NT.RegularExpression, '/[a-z/'],
				]],
				[NT.SemicolonSeparator],
			]);

			expect(parse('const x: regex = /[a-z/g;')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'x'],
					[NT.ColonSeparator],
					[NT.Type, 'regex'],
					[NT.AssignmentOperator],
					[NT.RegularExpression, '/[a-z/g'],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('path', (): void => {
			expect(parse('const dir = @/path/to/dir/;')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'dir'],
					[NT.AssignmentOperator],
					[NT.Path, '@/path/to/dir/'],
				]],
				[NT.SemicolonSeparator],
			]);

			expect(parse('const dir = ./myDir/;')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'dir'],
					[NT.AssignmentOperator],
					[NT.Path, './myDir/'],
				]],
				[NT.SemicolonSeparator],
			]);

			expect(parse('const dir: path = @/path/to/dir/;')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'dir'],
					[NT.ColonSeparator],
					[NT.Type, 'path'],
					[NT.AssignmentOperator],
					[NT.Path, '@/path/to/dir/'],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('custom type', (): void => {
			expect(parse('const myClass: MyClass = MyClass.create();')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'myClass'],
					[NT.ColonSeparator],
					[NT.Identifier, 'MyClass'],
					[NT.AssignmentOperator],
					[NT.CallExpression, [
						[NT.MemberExpression, [
							[NT.Identifier, 'MyClass'],
							[NT.Identifier, 'create'],
						]],
						[NT.ArgumentsList, []],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		describe('tuples', () => {

			it('tuple', () => {
				expect(parse('const foo = <1, "pizza", 3.14>;')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.TupleExpression, [
							[NT.NumberLiteral, '1'],
							[NT.CommaSeparator],
							[NT.StringLiteral, 'pizza'],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '3.14'],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('empty tuple', () => {
				expect(parse('const foo = <>;')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.TupleExpression, []],
					]],
					[NT.SemicolonSeparator],
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
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.TupleExpression, [
							[NT.TupleExpression, [
								[NT.NumberLiteral, '1'],
								[NT.CommaSeparator],
								[NT.StringLiteral, 'pizza'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '3.14'],
							]],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.Path, '@/some/file.joe'],
							[NT.CommaSeparator],
							[NT.RangeExpression, [
								[NT.NumberLiteral, '1'],
								[NT.NumberLiteral, '3'],
							]],
							[NT.CommaSeparator],
							[NT.TupleExpression, [
								[NT.NumberLiteral, '1'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '2'],
								[NT.CommaSeparator],
								[NT.StringLiteral, 'fizz'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '4'],
								[NT.CommaSeparator],
								[NT.StringLiteral, 'buzz'],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('with ternary in item', () => {
				expect(parse(`<
					1,
					someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
					true
				>`)).toMatchParseTree([
					[NT.TupleExpression, [
						[NT.NumberLiteral, '1'],
						[NT.CommaSeparator],
						[NT.TernaryExpression, [
							[NT.TernaryCondition, [
								[NT.Identifier, 'someCondition'],
							]],
							[NT.TernaryThen, [
								[NT.StringLiteral, 'burnt-orange'],
							]],
							[NT.TernaryElse, [
								[NT.StringLiteral, ''],
							]],
						]],
						[NT.CommaSeparator],
						[NT.Comment, '// will always be defined, so the shape is correct'],
						[NT.BoolLiteral, 'true'],
					]],
				]);
			});

			it('tuple in object', () => {
				expect(parse('const foo = {tpl: <1>};')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.ObjectExpression, [
							[NT.Property, [
								[NT.Identifier, 'tpl'],
								[NT.TupleExpression, [
									[NT.NumberLiteral, '1'],
								]],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			})

		});

		describe('arrays of', (): void => {

			it('bools', (): void => {
				expect(parse('[false, true, true, false]')).toMatchParseTree([
					[NT.ArrayExpression, [
						[NT.BoolLiteral, 'false'],
						[NT.CommaSeparator],
						[NT.BoolLiteral, 'true'],
						[NT.CommaSeparator],
						[NT.BoolLiteral, 'true'],
						[NT.CommaSeparator],
						[NT.BoolLiteral, 'false'],
					]],
				]);
			});

			it('numbers', () => {
				expect(parse('[1, -2, 3,456, 3^e-2, 3.14, 1,2,3]')).toMatchParseTree([
					[NT.ArrayExpression, [
						[NT.NumberLiteral, '1'],
						[NT.CommaSeparator],
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '2'],
						]],
						[NT.CommaSeparator],
						[NT.NumberLiteral, '3,456'],
						[NT.CommaSeparator],
						[NT.BinaryExpression, '^e', [
							[NT.NumberLiteral, '3'],
							[NT.UnaryExpression, '-', { before: true }, [
								[NT.NumberLiteral, '2'],
							]],
						]],
						[NT.CommaSeparator],
						[NT.NumberLiteral, '3.14'],
						[NT.CommaSeparator],
						[NT.NumberLiteral, '1,2,3'], // weird but legal
					]],
				]);
			});

			it('paths', (): void => {
				expect(parse('[@/file.joe, @/another/file.joe]')).toMatchParseTree([
					[NT.ArrayExpression, [
						[NT.Path, '@/file.joe'],
						[NT.CommaSeparator],
						[NT.Path, '@/another/file.joe'],
					]],
				]);
			});

			it('regexes', (): void => {
				expect(parse('[/[a-z]/i, /[0-9]/g, /\d/]')).toMatchParseTree([
					[NT.ArrayExpression, [
						[NT.RegularExpression, '/[a-z]/i'],
						[NT.CommaSeparator],
						[NT.RegularExpression, '/[0-9]/g'],
						[NT.CommaSeparator],
						[NT.RegularExpression, '/\d/'],
					]],
				]);
			});

			it('strings', (): void => {
				expect(parse('[\'foo\', "bar"]')).toMatchParseTree([
					[NT.ArrayExpression, [
						[NT.StringLiteral, 'foo'],
						[NT.CommaSeparator],
						[NT.StringLiteral, 'bar'],
					]],
				]);
			});

			it('tuples', () => {
				expect(parse("const foo: <string, number, bool>[] = [<'foo', 3.14, false>, <'bar', 900, true>];")).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.ColonSeparator],
						[NT.ArrayType, [
							[NT.TupleType, [
								[NT.Type, 'string'],
								[NT.CommaSeparator],
								[NT.Type, 'number'],
								[NT.CommaSeparator],
								[NT.Type, 'bool'],
							]],
						]],
						[NT.AssignmentOperator],
						[NT.ArrayExpression, [
							[NT.TupleExpression, [
								[NT.StringLiteral, 'foo'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '3.14'],
								[NT.CommaSeparator],
								[NT.BoolLiteral, 'false'],
							]],
							[NT.CommaSeparator],
							[NT.TupleExpression, [
								[NT.StringLiteral, 'bar'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '900'],
								[NT.CommaSeparator],
								[NT.BoolLiteral, 'true'],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('pojos', () => {
				expect(parse("const foo: {a: number, b: string}[] = [{a: 4, b: 'c'}];")).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.ColonSeparator],
						[NT.ArrayType, [
							[NT.ObjectType, [
								[NT.Property, [
									[NT.Identifier, 'a'],
									[NT.Type, 'number'],
								]],
								[NT.CommaSeparator],
								[NT.Property, [
									[NT.Identifier, 'b'],
									[NT.Type, 'string'],
								]],
							]],
						]],
						[NT.AssignmentOperator],
						[NT.ArrayExpression, [
							[NT.ObjectExpression, [
								[NT.Property, [
									[NT.Identifier, 'a'],
									[NT.NumberLiteral, '4'],
								]],
								[NT.CommaSeparator],
								[NT.Property, [
									[NT.Identifier, 'b'],
									[NT.StringLiteral, 'c'],
								]],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('assignments', () => {
				expect(parse('const numbers = [1, 2];')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'numbers'],
						[NT.AssignmentOperator],
						[NT.ArrayExpression, [
							[NT.NumberLiteral, '1'],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '2'],
						]],
					]],
					[NT.SemicolonSeparator],
				]);

				expect(parse('let myArray: bool[] = [];')).toMatchParseTree([
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'myArray'],
						[NT.ColonSeparator],
						[NT.ArrayType, [
							[NT.Type, 'bool'],
						]],
						[NT.AssignmentOperator],
						[NT.ArrayExpression, []],
					]],
					[NT.SemicolonSeparator],
				]);
			});

		});

		describe('ternary', () => {

			it('should work in a variable declaration', () => {
				expect(parse('const foo = bar ? 1 : 2;')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.TernaryExpression, [
							[NT.TernaryCondition, [
								[NT.Identifier, 'bar'],
							]],
							[NT.TernaryThen, [
								[NT.NumberLiteral, '1'],
							]],
							[NT.TernaryElse, [
								[NT.NumberLiteral, '2'],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('should work when nested', () => {
				expect(parse('const foo = bar ? (baz ? 3 : 4) : 2;')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.TernaryExpression, [
							[NT.TernaryCondition, [
								[NT.Identifier, 'bar'],
							]],
							[NT.TernaryThen, [
								[NT.Parenthesized, [
									[NT.TernaryExpression, [
										[NT.TernaryCondition, [
											[NT.Identifier, 'baz'],
										]],
										[NT.TernaryThen, [
											[NT.NumberLiteral, '3'],
										]],
										[NT.TernaryElse, [
											[NT.NumberLiteral, '4'],
										]],
									]],
								]],
							]],
							[NT.TernaryElse, [
								[NT.NumberLiteral, '2'],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('should work in an array', () => {
				expect(parse('[foo ? 1 : 2, 3]')).toMatchParseTree([
					[NT.ArrayExpression, [
						[NT.TernaryExpression, [
							[NT.TernaryCondition, [
								[NT.Identifier, 'foo'],
							]],
							[NT.TernaryThen, [
								[NT.NumberLiteral, '1'],
							]],
							[NT.TernaryElse, [
								[NT.NumberLiteral, '2'],
							]],
						]],
						[NT.CommaSeparator],
						[NT.NumberLiteral, '3'],
					]],
				]);
			});

			it('should work in a return', () => {
				expect(parse('f foo -> bool, number {return bar ? true : false, 3;}')).toMatchParseTree([
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.FunctionReturns, [
							[NT.Type, 'bool'],
							[NT.CommaSeparator],
							[NT.Type, 'number'],
						]],
						[NT.BlockStatement, [
							[NT.ReturnStatement, [
								[NT.TernaryExpression, [
									[NT.TernaryCondition, [
										[NT.Identifier, 'bar'],
									]],
									[NT.TernaryThen, [
										[NT.BoolLiteral, 'true'],
									]],
									[NT.TernaryElse, [
										[NT.BoolLiteral, 'false'],
									]],
								]],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '3'],
							]],
							[NT.SemicolonSeparator],
						]]
					]],
				]);
			});

		});

		describe('pojos', () => {

			it('pojo', () => {
				expect(parse('const foo = {a: 1, b: "pizza", c: 3.14, d: [10, 11]};')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.ObjectExpression, [
							[NT.Property, [
								[NT.Identifier, 'a'],
								[NT.NumberLiteral, '1'],
							]],
							[NT.CommaSeparator],
							[NT.Property, [
								[NT.Identifier, 'b'],
								[NT.StringLiteral, 'pizza'],
							]],
							[NT.CommaSeparator],
							[NT.Property, [
								[NT.Identifier, 'c'],
								[NT.NumberLiteral, '3.14'],
							]],
							[NT.CommaSeparator],
							[NT.Property, [
								[NT.Identifier, 'd'],
								[NT.ArrayExpression, [
									[NT.NumberLiteral, '10'],
									[NT.CommaSeparator],
									[NT.NumberLiteral, '11'],
								]],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('empty pojo', () => {
				expect(parse('const foo = {};')).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.ObjectExpression, []],
					]],
					[NT.SemicolonSeparator],
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
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.ObjectExpression, [
							[NT.Property, [
								[NT.Identifier, 'obj'],
								[NT.ObjectExpression, [
									[NT.Property, [
										[NT.Identifier, 'a'],
										[NT.NumberLiteral, '1'],
									]],
									[NT.CommaSeparator],
									[NT.Property, [
										[NT.Identifier, 'b'],
										[NT.StringLiteral, 'pizza'],
									]],
									[NT.CommaSeparator],
									[NT.Property, [
										[NT.Identifier, 'pi'],
										[NT.ObjectExpression, [
											[NT.Property, [
												[NT.Identifier, 'two_digits'],
												[NT.NumberLiteral, '3.14'],
											]],
										]],
									]],
								]],
							]],
							[NT.CommaSeparator],
							[NT.Property, [
								[NT.Identifier, 'bol'],
								[NT.BoolLiteral, 'true'],
							]],
							[NT.CommaSeparator],
							[NT.Property, [
								[NT.Identifier, 'pth'],
								[NT.Path, '@/some/file.joe'],
							]],
							[NT.CommaSeparator],
							[NT.Property, [
								[NT.Identifier, 'range'],
								[NT.ObjectExpression, [
									[NT.Property, [
										[NT.Identifier, 'range'],
										[NT.RangeExpression, [
											[NT.NumberLiteral, '1'],
											[NT.NumberLiteral, '3'],
										]],
									]],
								]],
							]],
							[NT.CommaSeparator],
							[NT.Property, [
								[NT.Identifier, 'tpl'],
								[NT.TupleExpression, [
									[NT.NumberLiteral, '1'],
									[NT.CommaSeparator],
									[NT.NumberLiteral, '2'],
									[NT.CommaSeparator],
									[NT.StringLiteral, 'fizz'],
									[NT.CommaSeparator],
									[NT.NumberLiteral, '4'],
									[NT.CommaSeparator],
									[NT.StringLiteral, 'buzz'],
								]],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('with ternary in item', () => {
				expect(parse(`{
					a: 1,
					b: someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
					c: true
				}`)).toMatchParseTree([
					[NT.ObjectExpression, [
						[NT.Property, [
							[NT.Identifier, 'a'],
							[NT.NumberLiteral, '1'],
						]],
						[NT.CommaSeparator],
						[NT.Property, [
							[NT.Identifier, 'b'],
							[NT.TernaryExpression, [
								[NT.TernaryCondition, [
									[NT.Identifier, 'someCondition'],
								]],
								[NT.TernaryThen, [
									[NT.StringLiteral, 'burnt-orange'],
								]],
								[NT.TernaryElse, [
									[NT.StringLiteral, ''],
								]],
							]],
						]],
						[NT.CommaSeparator],
						[NT.Comment, '// will always be defined, so the shape is correct'],
						[NT.Property, [
							[NT.Identifier, 'c'],
							[NT.BoolLiteral, 'true'],
						]],
					]],
				]);
			});

			it('with array in item', () => {
				expect(parse(`{
					a: [1]
				}`)).toMatchParseTree([
					[NT.ObjectExpression, [
						[NT.Property, [
							[NT.Identifier, 'a'],
							[NT.ArrayExpression, [
								[NT.NumberLiteral, '1'],
							]],
						]],
					]],
				]);
			});

			it('with MemberExpression in item', () => {
				expect(parse(`{
					a: [foo[1]]
				}`)).toMatchParseTree([
					[NT.ObjectExpression, [
						[NT.Property, [
							[NT.Identifier, 'a'],
							[NT.ArrayExpression, [
								[NT.MemberExpression, [
									[NT.Identifier, 'foo'],
									[NT.MembersList, [
										[NT.NumberLiteral, '1'],
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
				[NT.CallExpression, [
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.MemberExpression, [
								[NT.Identifier, 'a'],
								[NT.Identifier, 'b'],
							]],
							[NT.Identifier, 'c'],
						]],
						[NT.Identifier, 'd'],
					]],
					[NT.ArgumentsList, []],
				]],
				[NT.SemicolonSeparator],
				[NT.NumberLiteral, '4'],
			]);
		});

		it('call followed by property', () => {
			expect(parse('a(1).b')).toMatchParseTree([
				[NT.MemberExpression, [
					[NT.CallExpression, [
						[NT.Identifier, 'a'],
						[NT.ArgumentsList, [
							[NT.NumberLiteral, '1'],
						]],
					]],
					[NT.Identifier, 'b'],
				]],
			]);
		});

		it('call followed by a call', () => {
			expect(parse('a(1).b(2)')).toMatchParseTree([
				[NT.CallExpression, [
					[NT.MemberExpression, [
						[NT.CallExpression, [
							[NT.Identifier, 'a'],
							[NT.ArgumentsList, [
								[NT.NumberLiteral, '1'],
							]],
						]],
						[NT.Identifier, 'b'],
					]],
					[NT.ArgumentsList, [
						[NT.NumberLiteral, '2'],
					]],
				]],
			]);
		});

		it('generics', () => {
			expect(parse('a(B<|T|>);')).toMatchParseTree([
				[NT.CallExpression, [
					[NT.Identifier, 'a'],
					[NT.ArgumentsList, [
						[NT.Typed, [
							[NT.Identifier, 'B'],
							[NT.TypeArgumentsList, [
								[NT.Identifier, 'T'],
							]],
						]],
					]],
				]],
				[NT.SemicolonSeparator],
			]);

			expect(parse('a<|T|>(B);')).toMatchParseTree([
				[NT.CallExpression, [
					[NT.Typed, [
						[NT.Identifier, 'a'],
						[NT.TypeArgumentsList, [
							[NT.Identifier, 'T'],
						]],
					]],
					[NT.ArgumentsList, [
						[NT.Identifier, 'B'],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('more advanced generics', () => {
			expect(parse('const foo = Foo<|{T: T}, T[]|>();')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'foo'],
					[NT.AssignmentOperator],
					[NT.CallExpression, [
						[NT.Typed, [
							[NT.Identifier, 'Foo'],
							[NT.TypeArgumentsList, [
								[NT.ObjectExpression, [
									[NT.Property, [
										[NT.Identifier, 'T'],
										[NT.Identifier, 'T'],
									]],
								]],
								[NT.CommaSeparator],
								[NT.ArrayType, [
									[NT.Identifier, 'T'],
								]],
							]],
						]],
						[NT.ArgumentsList, []],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('multiple inheritance manual resolution', () => {
			expect(parse(`class C extends A, B {
				f foo () {
					return this.parent<|A|>.foo(); // <-- Specify to use B.foo
				}
			}`)).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.Identifier, 'C'],
					[NT.ClassExtensionsList, [
						[NT.Identifier, 'A'],
						[NT.CommaSeparator],
						[NT.Identifier, 'B'],
					]],
					[NT.BlockStatement, [
						[NT.FunctionDeclaration, [
							[NT.Identifier, 'foo'],
							[NT.ParametersList, []],
							[NT.BlockStatement, [
								[NT.ReturnStatement, [
									[NT.CallExpression, [
										[NT.MemberExpression, [
											[NT.MemberExpression, [
												[NT.Keyword, 'this'],
												[NT.Typed, [
													[NT.Identifier, 'parent'],
													[NT.TypeArgumentsList, [
														[NT.Identifier, 'A'],
													]],
												]],
											]],
											[NT.Identifier, 'foo'],
										]],
										[NT.ArgumentsList, []],
									]],
								]],
								[NT.SemicolonSeparator],
								[NT.Comment, '// <-- Specify to use B.foo'],
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
				[NT.ClassDeclaration, [
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, []],
				]],
			]);

			expect(parse('class Foo <| T, U |> {}')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.Typed, [
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
							[NT.CommaSeparator],
							[NT.TypeParameter, [
								[NT.Identifier, 'U'],
							]],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('class with comment', (): void => {
			expect(parse('class Foo {\n# foo\n}\n# bar\n')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, [
						[NT.Comment, '# foo'],
					]],
				]],
				[NT.Comment, '# bar'],
			]);
		});

		it('class with properties and methods', (): void => {
			expect(parse('class Foo {\nconst foo = "bar";\nf bar {}}\n# bar\n')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, [
						[NT.VariableDeclaration, 'const', [
							[NT.Identifier, 'foo'],
							[NT.AssignmentOperator],
							[NT.StringLiteral, 'bar'],
						]],
						[NT.SemicolonSeparator],
						[NT.FunctionDeclaration, [
							[NT.Identifier, 'bar'],
							[NT.BlockStatement, []],
						]],
					]],
				]],
				[NT.Comment, '# bar'],
			]);
		});

		it('class extends multiple and implements multiple', (): void => {
			expect(parse('class Foo extends Bar, Baz implements AbstractFooBar, AnotherAbstractClass {}')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.Identifier, 'Foo'],
					[NT.ClassExtensionsList, [
						[NT.Identifier, 'Bar'],
						[NT.CommaSeparator],
						[NT.Identifier, 'Baz'],
					]],
					[NT.ClassImplementsList, [
						[NT.Identifier, 'AbstractFooBar'],
						[NT.CommaSeparator],
						[NT.Identifier, 'AnotherAbstractClass'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('class extends multiple and implements multiple with generics', (): void => {
			expect(parse('class Foo<|T,U|> extends Bar<|T|>, Baz implements AbstractFooBar, AnotherAbstractClass<|U|> {}')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.Typed, [
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
							[NT.CommaSeparator],
							[NT.TypeParameter, [
								[NT.Identifier, 'U'],
							]],
						]],
					]],
					[NT.ClassExtensionsList, [
						[NT.Typed, [
							[NT.Identifier, 'Bar'],
							[NT.TypeArgumentsList, [
								[NT.Identifier, 'T'],
							]],
						]],
						[NT.CommaSeparator],
						[NT.Identifier, 'Baz'],
					]],
					[NT.ClassImplementsList, [
						[NT.Identifier, 'AbstractFooBar'],
						[NT.CommaSeparator],
						[NT.Typed, [
							[NT.Identifier, 'AnotherAbstractClass'],
							[NT.TypeArgumentsList, [
								[NT.Identifier, 'U'],
							]],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('abstract class', (): void => {
			expect(parse('abstract class Foo {}')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.ModifiersList, [
						[NT.Modifier, 'abstract'],
					]],
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, []],
				]],
			]);

			expect(parse('abstract class Foo<|T|> {}')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.ModifiersList, [
						[NT.Modifier, 'abstract'],
					]],
					[NT.Typed, [
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);

			expect(parse(`
			abstract class Foo {
				abstract const baz: number;

				abstract static f hello<|T|> (name = 'World') -> Greeting, T;

				static f world (name = 'Earth');
			}`)).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.ModifiersList, [
						[NT.Modifier, 'abstract'],
					]],
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, [
						[NT.VariableDeclaration, 'const', [
							[NT.ModifiersList, [
								[NT.Modifier, 'abstract'],
							]],
							[NT.Identifier, 'baz'],
							[NT.ColonSeparator],
							[NT.Type, 'number'],
						]],
						[NT.SemicolonSeparator],
						[NT.FunctionDeclaration, [
							[NT.ModifiersList, [
								[NT.Modifier, 'abstract'],
								[NT.Modifier, 'static'],
							]],
							[NT.Typed, [
								[NT.Identifier, 'hello'],
								[NT.TypeParametersList, [
									[NT.TypeParameter, [
										[NT.Identifier, 'T'],
									]],
								]],
							]],
							[NT.ParametersList, [
								[NT.Parameter, [
									[NT.Identifier, 'name'],
									[NT.AssignmentOperator],
									[NT.StringLiteral, 'World'],
								]],
							]],
							[NT.FunctionReturns, [
								[NT.Identifier, 'Greeting'],
								[NT.CommaSeparator],
								[NT.Identifier, 'T'],
							]],
						]],
						[NT.SemicolonSeparator],
						[NT.FunctionDeclaration, [
							[NT.ModifiersList, [
								[NT.Modifier, 'static'],
							]],
							[NT.Identifier, 'world'],
							[NT.ParametersList, [
								[NT.Parameter, [
									[NT.Identifier, 'name'],
									[NT.AssignmentOperator],
									[NT.StringLiteral, 'Earth'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					]],
				]],
			]);

			expect(parse('abstract class Foo {}\nclass Bar extends Foo {}')).toMatchParseTree([
				[NT.ClassDeclaration, [
					[NT.ModifiersList, [
						[NT.Modifier, 'abstract'],
					]],
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, []],
				]],
				[NT.ClassDeclaration, [
					[NT.Identifier, 'Bar'],
					[NT.ClassExtensionsList, [
						[NT.Identifier, 'Foo'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

	});

	describe('Comment', (): void => {
		it('a single-line comment', (): void => {
			expect(parse('# let x = "foo"')).toMatchParseTree([
				[NT.Comment, '# let x = "foo"'],
			])
		});

		it('a multi-line comment', (): void => {
			expect(parse('/* let x = "foo" */')).toMatchParseTree([
				[NT.Comment, '/* let x = "foo" */'],
			])
		});

	});

	describe('ForStatement', (): void => {

		it('simple for statement', () => {
			expect(parse('for let i = 0; i < 10; i++ {}')).toMatchParseTree([
				[NT.ForStatement, [
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'i'],
						[NT.AssignmentOperator],
						[NT.NumberLiteral, '0'],
					]],
					[NT.SemicolonSeparator],
					[NT.BinaryExpression, '<', [
						[NT.Identifier, 'i'],
						[NT.NumberLiteral, '10'],
					]],
					[NT.SemicolonSeparator],
					[NT.UnaryExpression, '++', { before: false }, [
						[NT.Identifier, 'i'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with parens', () => {
			expect(parse('for (let i = 0; i < 10; i++) {}')).toMatchParseTree([
				[NT.ForStatement, [
					[NT.Parenthesized, [
						[NT.VariableDeclaration, 'let', [
							[NT.Identifier, 'i'],
							[NT.AssignmentOperator],
							[NT.NumberLiteral, '0'],
						]],
						[NT.SemicolonSeparator],
						[NT.BinaryExpression, '<', [
							[NT.Identifier, 'i'],
							[NT.NumberLiteral, '10'],
						]],
						[NT.SemicolonSeparator],
						[NT.UnaryExpression, '++', { before: false }, [
							[NT.Identifier, 'i'],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

	});

	describe(NT.FunctionDeclaration, (): void => {
		it('no params or return types', (): void => {
			expect(parse('f foo {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('no params with single return type', (): void => {
			expect(parse('f foo -> bool {} 5;')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.FunctionReturns, [
						[NT.Type, 'bool'],
					]],
					[NT.BlockStatement, []],
				]],
				[NT.NumberLiteral, '5'],
				[NT.SemicolonSeparator],
			]);
		});

		it('no params with multiple return types', (): void => {
			expect(parse(`f foo -> bool, string {
				return true, 'hey';
			}`)).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.FunctionReturns, [
						[NT.Type, 'bool'],
						[NT.CommaSeparator],
						[NT.Type, 'string'],
					]],
					[NT.BlockStatement, [
						[NT.ReturnStatement, [
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.StringLiteral, 'hey'],
						]],
						[NT.SemicolonSeparator],
					]],
				]],
			]);
		});

		it('param parens but no return types', (): void => {
			expect(parse('f foo () {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, []],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('param parens with return types', (): void => {
			expect(parse('f foo () -> bool {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, []],
					[NT.FunctionReturns, [
						[NT.Type, 'bool'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('params but no return types', (): void => {
			expect(parse('f foo (a: number) {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.Type, 'number'],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('params and return types', (): void => {
			expect(parse('f foo (a: number, r: regex) -> regex, bool {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.Type, 'number'],
						]],
						[NT.CommaSeparator],
						[NT.Parameter, [
							[NT.Identifier, 'r'],
							[NT.ColonSeparator],
							[NT.Type, 'regex'],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.Type, 'regex'],
						[NT.CommaSeparator],
						[NT.Type, 'bool'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('params and return types using tuples', (): void => {
			expect(parse('f foo (a: <bool>) -> <number> {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.TupleType, [
								[NT.Type, 'bool'],
							]],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.TupleType, [
							[NT.Type, 'number'],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('params and return types using tuples and arrays', (): void => {
			expect(parse('f foo (a: <bool[]>[]) -> <number> {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.ArrayType, [
								[NT.TupleType, [
									[NT.ArrayType, [
										[NT.Type, 'bool'],
									]],
								]],
							]],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.TupleType, [
							[NT.Type, 'number'],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with arrays', (): void => {
			expect(parse('f foo(a: number[] = [5], b: string[][], ...c: Foo[]) -> regex, path[][][] {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.ArrayType, [
								[NT.Type, 'number'],
							]],
							[NT.AssignmentOperator],
							[NT.ArrayExpression, [
								[NT.NumberLiteral, '5'],
							]],
						]],
						[NT.CommaSeparator],
						[NT.Parameter, [
							[NT.Identifier, 'b'],
							[NT.ColonSeparator],
							[NT.ArrayType, [
								[NT.ArrayType, [
									[NT.Type, 'string'],
								]],
							]],
						]],
						[NT.CommaSeparator],
						[NT.Parameter, [
							[NT.RestElement, '...'],
							[NT.Identifier, 'c'],
							[NT.ColonSeparator],
							[NT.ArrayType, [
								[NT.Identifier, 'Foo'],
							]],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.Type, 'regex'],
						[NT.CommaSeparator],
						[NT.ArrayType, [
							[NT.ArrayType, [
								[NT.ArrayType, [
									[NT.Type, 'path'],
								]],
							]],
						]],
					]],
					[NT.BlockStatement, []],
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
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'school'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'age'],
							[NT.ColonSeparator],
							[NT.Type, 'number'],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.Type, 'string'],
					]],
					[NT.BlockStatement, [
						[NT.ReturnStatement, [
							[NT.WhenExpression, [
								[NT.Identifier, 'age'],
								[NT.BlockStatement, [
									[NT.WhenCase, [
										[NT.WhenCaseTests, [
											[NT.NumberLiteral, '11'],
										]],
										[NT.WhenCaseConsequent, [
											[NT.StringLiteral, 'Hogwarts First Year'],
										]],
									]],
									[NT.CommaSeparator],
									[NT.WhenCase, [
										[NT.WhenCaseTests, [
											[NT.RangeExpression, [
												[NT.NumberLiteral, '12'],
												[NT.NumberLiteral, '17'],
											]],
										]],
										[NT.WhenCaseConsequent, [
											[NT.StringLiteral, 'Another Year at Hogwarts'],
										]],
									]],
									[NT.CommaSeparator],
									[NT.WhenCase, [
										[NT.WhenCaseTests, [
											[NT.RestElement, '...'],
										]],
										[NT.WhenCaseConsequent, [
											[NT.StringLiteral, 'University'],
										]],
									]],
									[NT.CommaSeparator],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					]],
				]],
			]);
		});

		it('multiple returns with when', () => {
			expect(parse(`f foo (age: number) -> number, string {
				return 5, when age {... -> 'No more foos',};
			}`)).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'age'],
							[NT.ColonSeparator],
							[NT.Type, 'number'],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.Type, 'number'],
						[NT.CommaSeparator],
						[NT.Type, 'string'],
					]],
					[NT.BlockStatement, [
						[NT.ReturnStatement, [
							[NT.NumberLiteral, '5'],
							[NT.CommaSeparator],
							[NT.WhenExpression, [
								[NT.Identifier, 'age'],
								[NT.BlockStatement, [
									[NT.WhenCase, [
										[NT.WhenCaseTests, [
											[NT.RestElement, '...'],
										]],
										[NT.WhenCaseConsequent, [
											[NT.StringLiteral, 'No more foos'],
										]],
									]],
									[NT.CommaSeparator],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					]],
				]],
			]);
		});

		it('generics', (): void => {
			expect(parse('f foo <|T|> (a: T) -> T {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Typed, [
						[NT.Identifier, 'foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
						]],
					]],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.Identifier, 'T'],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.Identifier, 'T'],
					]],
					[NT.BlockStatement, []],
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
				[NT.ClassDeclaration, [
					[NT.ModifiersList, [
						[NT.Modifier, 'abstract'],
					]],
					[NT.Identifier, 'A'],
					[NT.BlockStatement, [
						// foo1
						[NT.FunctionDeclaration, [
							[NT.ModifiersList, [
								[NT.Modifier, 'abstract'],
							]],
							[NT.Identifier, 'foo1'],
						]],
						[NT.SemicolonSeparator],
						// foo2
						[NT.FunctionDeclaration, [
							[NT.ModifiersList, [
								[NT.Modifier, 'abstract'],
							]],
							[NT.Identifier, 'foo2'],
							[NT.ParametersList, [
								[NT.Parameter, [
									[NT.Identifier, 'arg'],
									[NT.ColonSeparator],
									[NT.Type, 'number'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
						// foo3
						[NT.FunctionDeclaration, [
							[NT.ModifiersList, [
								[NT.Modifier, 'abstract'],
							]],
							[NT.Typed, [
								[NT.Identifier, 'foo3'],
								[NT.TypeParametersList, [
									[NT.TypeParameter, [
										[NT.Identifier, 'T'],
									]],
								]],
							]],
							[NT.FunctionReturns, [
								[NT.Type, 'bool'],
							]],
						]],
						[NT.SemicolonSeparator],
						// foo4
						[NT.FunctionDeclaration, [
							[NT.ModifiersList, [
								[NT.Modifier, 'abstract'],
							]],
							[NT.Identifier, 'foo4'],
							[NT.ParametersList, [
								[NT.Parameter, [
									[NT.Identifier, 'arg'],
									[NT.ColonSeparator],
									[NT.Type, 'number'],
								]],
							]],
							[NT.FunctionReturns, [
								[NT.Type, 'bool'],
							]],
						]],
						[NT.SemicolonSeparator],
					]],
				]],
			]);
		});

		it('anonymous simple', () => {
			expect(parse('const foo = f {};')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'foo'],
					[NT.AssignmentOperator],
					[NT.FunctionDeclaration, [
						[NT.BlockStatement, []],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('anonymous complex', () => {
			expect(parse('const foo = f <|T|>(a: T) -> T {\ndo();\n};')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'foo'],
					[NT.AssignmentOperator],
					[NT.FunctionDeclaration, [
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
						]],
						[NT.ParametersList, [
							[NT.Parameter, [
								[NT.Identifier, 'a'],
								[NT.ColonSeparator],
								[NT.Identifier, 'T'],
							]],
						]],
						[NT.FunctionReturns, [
							[NT.Identifier, 'T'],
						]],
						[NT.BlockStatement, [
							[NT.CallExpression, [
								[NT.Identifier, 'do'],
								[NT.ArgumentsList, []],
							]],
							[NT.SemicolonSeparator],
						]],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('anonymous abstract', () => {
			expect(parse('abstract const foo = f;')).toMatchParseTree([
				[NT.VariableDeclaration, 'const', [
					[NT.ModifiersList, [
						[NT.Modifier, 'abstract'],
					]],
					[NT.Identifier, 'foo'],
					[NT.AssignmentOperator],
					[NT.FunctionDeclaration],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('ending with a question mark', () => {
			expect(parse(`f danger? -> bool {
				return true;
			}`)).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'danger?'],
					[NT.FunctionReturns, [
						[NT.Type, 'bool'],
					]],
					[NT.BlockStatement, [
						[NT.ReturnStatement, [
							[NT.BoolLiteral, 'true'],
						]],
						[NT.SemicolonSeparator],
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
						[NT.ClassDeclaration, [
							[NT.Identifier, 'A'],
							[NT.BlockStatement, [
								[NT.FunctionDeclaration, [
									[NT.Identifier, '<=>'],
									[NT.BlockStatement, []],
								]],
							]],
						]],
					]);
				});

			});

		});

	});

	describe(NT.IfStatement, (): void => {

		describe('before', () => {

			it('with bool conditional', () => {
				expect(parse('if true {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
					]],
				]);
			});

			it('with BinaryExpression conditional using two NumberLiterals', () => {
				expect(parse('if 1 < 2 {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BinaryExpression, '<', [
							[NT.NumberLiteral, '1'],
							[NT.NumberLiteral, '2'],
						]],
						[NT.BlockStatement, []],
					]],
				]);
			});

			it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
				expect(parse('if foo == 2 {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BinaryExpression, '==', [
							[NT.Identifier, 'foo'],
							[NT.NumberLiteral, '2'],
						]],
						[NT.BlockStatement, []],
					]],
				]);
			});

			it('with BinaryExpression conditional using a CallExpression and a NumberLiteral', () => {
				expect(parse('if foo() == 2 {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BinaryExpression, '==', [
							[NT.CallExpression, [
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, []],
							]],
							[NT.NumberLiteral, '2'],
						]],
						[NT.BlockStatement, []],
					]],
				]);
			});

			it('with two conditions', () => {
				expect(parse('if foo() == 2 && a < 3 {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BinaryExpression, '&&', [
							[NT.BinaryExpression, '==', [
								[NT.CallExpression, [
									[NT.Identifier, 'foo'],
									[NT.ArgumentsList, []],
								]],
								[NT.NumberLiteral, '2'],
							]],
							[NT.BinaryExpression, '<', [
								[NT.Identifier, 'a'],
								[NT.NumberLiteral, '3'],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				]);
			});

			describe('with parens', () => {

				it('and one condition', () => {
					expect(parse('if (foo() == 2) {}')).toMatchParseTree([
						[NT.IfStatement, { before: true }, [
							[NT.Parenthesized, [
								[NT.BinaryExpression, '==', [
									[NT.CallExpression, [
										[NT.Identifier, 'foo'],
										[NT.ArgumentsList, []],
									]],
									[NT.NumberLiteral, '2'],
								]],
							]],
							[NT.BlockStatement, []],
						]],
					]);
				});

				it('and two conditions', () => {
					expect(parse('if (foo() == 2 && a < 3) {}')).toMatchParseTree([
						[NT.IfStatement, { before: true }, [
							[NT.Parenthesized, [
								[NT.BinaryExpression, '&&', [
									[NT.BinaryExpression, '==', [
										[NT.CallExpression, [
											[NT.Identifier, 'foo'],
											[NT.ArgumentsList, []],
										]],
										[NT.NumberLiteral, '2'],
									]],
									[NT.BinaryExpression, '<', [
										[NT.Identifier, 'a'],
										[NT.NumberLiteral, '3'],
									]],
								]],
							]],
							[NT.BlockStatement, []],
						]],
					]);
				});

			});

			it('with just else', () => {

				expect(parse('if true {} else {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
						[NT.BlockStatement, []],
					]],
				]);

			});

			it('with else if', () => {

				expect(parse('if true {} else if false {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
						[NT.IfStatement, { before: true }, [
							[NT.BoolLiteral, 'false'],
							[NT.BlockStatement, []],
						]],
					]],
				]);

			});

			it('with a subsequent if and should be two separate IfStatements', () => {

				expect(parse('if true {} if false {}')).toMatchParseTree([
					[NT.IfStatement, { before: true }, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
					]],
					[NT.IfStatement, { before: true }, [
						[NT.BoolLiteral, 'false'],
						[NT.BlockStatement, []],
					]],
				]);

			});

		});

		describe('after', () => {

			it('after a CallExpression', () => {
				expect(parse('do(1) if foo == 2;')).toMatchParseTree([
					[NT.IfStatement, { before: false }, [
						[NT.CallExpression, [
							[NT.Identifier, 'do'],
							[NT.ArgumentsList, [
								[NT.NumberLiteral, '1'],
							]],
						]],
						[NT.BinaryExpression, '==', [
							[NT.Identifier, 'foo'],
							[NT.NumberLiteral, '2'],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});


			describe('in an array', () => {

				it('with bool conditional', () => {
					expect(parse('[foo if true, bar];')).toMatchParseTree([
						[NT.ArrayExpression, [
							[NT.IfStatement, { before: false }, [
								[NT.Identifier, 'foo'],
								[NT.BoolLiteral, 'true'],
							]],
							[NT.CommaSeparator],
							[NT.Identifier, 'bar'],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with identifier conditional', () => {
					expect(parse('[9, 10 if isDone?, 11];')).toMatchParseTree([
						[NT.ArrayExpression, [
							[NT.NumberLiteral, '9'],
							[NT.CommaSeparator],
							[NT.IfStatement, { before: false }, [
								[NT.NumberLiteral, '10'],
								[NT.Identifier, 'isDone?'],
							]],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '11'],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with MemberExpression conditional', () => {
					expect(parse('[9, 10 if this.isDone?, 11];')).toMatchParseTree([
						[NT.ArrayExpression, [
							[NT.NumberLiteral, '9'],
							[NT.CommaSeparator],
							[NT.IfStatement, { before: false }, [
								[NT.NumberLiteral, '10'],
								[NT.MemberExpression, [
									[NT.Keyword, 'this'],
									[NT.Identifier, 'isDone?'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '11'],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with CallExpression conditional', () => {
					expect(parse('[9, 10 if this.isDone?([true if true]), 11];')).toMatchParseTree([
						[NT.ArrayExpression, [
							[NT.NumberLiteral, '9'],
							[NT.CommaSeparator],
							[NT.IfStatement, { before: false }, [
								[NT.NumberLiteral, '10'],
								[NT.CallExpression, [
									[NT.MemberExpression, [
										[NT.Keyword, 'this'],
										[NT.Identifier, 'isDone?'],
									]],
									[NT.ArgumentsList, [
										[NT.ArrayExpression, [
											[NT.IfStatement, { before: false }, [
												[NT.BoolLiteral, 'true'],
												[NT.BoolLiteral, 'true'],
											]],
										]],
									]],
								]],
							]],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '11'],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with BinaryExpression conditional using two NumberLiterals', () => {
					expect(parse('[\'foo\', "bar" if 1 < 2];')).toMatchParseTree([
						[NT.ArrayExpression, [
							[NT.StringLiteral, 'foo'],
							[NT.CommaSeparator],
							[NT.IfStatement, { before: false }, [
								[NT.StringLiteral, 'bar'],
								[NT.BinaryExpression, '<', [
									[NT.NumberLiteral, '1'],
									[NT.NumberLiteral, '2'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
					expect(parse('[true, true, false, false if foo == 2, true, false, true];')).toMatchParseTree([
						[NT.ArrayExpression, [
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'false'],
							[NT.CommaSeparator],
							[NT.IfStatement, { before: false }, [
								[NT.BoolLiteral, 'false'],
								[NT.BinaryExpression, '==', [
									[NT.Identifier, 'foo'],
									[NT.NumberLiteral, '2'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'false'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
						]],
						[NT.SemicolonSeparator],
					]);
				});

			});

		});
	});

	describe(NT.ImportDeclaration, (): void => {
		describe('imports', (): void => {
			it('single, default import', (): void => {
				expect(parse('import lexer from ./lexer;import lexer2 from @/lexer;import lexer3 from @/lexer.joe;')).toMatchParseTree([
					[NT.ImportDeclaration, [
						[NT.Identifier, 'lexer'],
						[NT.Keyword, 'from'],
						[NT.Path, './lexer'],
					]],
					[NT.SemicolonSeparator],
					[NT.ImportDeclaration, [
						[NT.Identifier, 'lexer2'],
						[NT.Keyword, 'from'],
						[NT.Path, '@/lexer'],
					]],
					[NT.SemicolonSeparator],
					[NT.ImportDeclaration, [
						[NT.Identifier, 'lexer3'],
						[NT.Keyword, 'from'],
						[NT.Path, '@/lexer.joe'],
					]],
					[NT.SemicolonSeparator],
				]);
			});
		});
	});

	describe(NT.InterfaceDeclaration, (): void => {

		it('empty interface', (): void => {
			expect(parse('interface Foo {}')).toMatchParseTree([
				[NT.InterfaceDeclaration, [
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, []],
				]],
			]);

			expect(parse('interface Foo <| T, U |> {}')).toMatchParseTree([
				[NT.InterfaceDeclaration, [
					[NT.Typed, [
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
							[NT.CommaSeparator],
							[NT.TypeParameter, [
								[NT.Identifier, 'U'],
							]],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('interface extends other', (): void => {
			expect(parse('interface Foo {} interface Bar extends Foo {}')).toMatchParseTree([
				[NT.InterfaceDeclaration, [
					[NT.Identifier, 'Foo'],
					[NT.BlockStatement, []],
				]],
				[NT.InterfaceDeclaration, [
					[NT.Identifier, 'Bar'],
					[NT.InterfaceExtensionsList, [
						[NT.Identifier, 'Foo'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('interface extends multiple', (): void => {
			expect(parse('interface Foo extends Bar, Baz {}')).toMatchParseTree([
				[NT.InterfaceDeclaration, [
					[NT.Identifier, 'Foo'],
					[NT.InterfaceExtensionsList, [
						[NT.Identifier, 'Bar'],
						[NT.CommaSeparator],
						[NT.Identifier, 'Baz'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('interface extends multiple with generics', (): void => {
			expect(parse('interface Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}')).toMatchParseTree([
				[NT.InterfaceDeclaration, [
					[NT.Typed, [
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
							[NT.CommaSeparator],
							[NT.TypeParameter, [
								[NT.Identifier, 'U'],
							]],
						]],
					]],
					[NT.InterfaceExtensionsList, [
						[NT.Typed, [
							[NT.Identifier, 'Bar'],
							[NT.TypeArgumentsList, [
								[NT.Identifier, 'T'],
							]],
						]],
						[NT.CommaSeparator],
						[NT.Typed, [
							[NT.Identifier, 'Baz'],
							[NT.TypeArgumentsList, [
								[NT.Identifier, 'U'],
							]],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

	})

	describe(NT.JoeDoc, () => {
		// for Class, Function, Interface, or Variable

		describe('for a class', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				expect(parse(`/** foo */
				class Foo {}`)).toMatchParseTree([
					[NT.ClassDeclaration, [
						[NT.JoeDoc, '/** foo */'],
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
				]);
			});

			it('but a regular comment should not be adopted', () => {
				expect(parse(`/* foo */
				class Foo {}`)).toMatchParseTree([
					[NT.Comment, '/* foo */'],
					[NT.ClassDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
				]);
			});
		});

		describe('for a function', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				expect(parse(`/** foo */
				f foo {}`)).toMatchParseTree([
					[NT.FunctionDeclaration, [
						[NT.JoeDoc, '/** foo */'],
						[NT.Identifier, 'foo'],
						[NT.BlockStatement, []],
					]],
				]);
			});

			it('but a regular comment should not be adopted', () => {
				expect(parse(`/* foo */
				f foo {}`)).toMatchParseTree([
					[NT.Comment, '/* foo */'],
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.BlockStatement, []],
					]],
				]);
			});
		});

		describe('for an interface', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				expect(parse(`/** foo */
				interface Foo {}`)).toMatchParseTree([
					[NT.InterfaceDeclaration, [
						[NT.JoeDoc, '/** foo */'],
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
				]);
			});

			it('but a regular comment should not be adopted', () => {
				expect(parse(`/* foo */
				interface Foo {}`)).toMatchParseTree([
					[NT.Comment, '/* foo */'],
					[NT.InterfaceDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
				]);
			});
		});

		describe('for a variable', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				expect(parse(`/** foo */
				const foo = 1;`)).toMatchParseTree([
					[NT.VariableDeclaration, 'const', [
						[NT.JoeDoc, '/** foo */'],
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.NumberLiteral, '1'],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('but a regular comment should not be adopted', () => {
				expect(parse(`/* foo */
				const foo = 1;`)).toMatchParseTree([
					[NT.Comment, '/* foo */'],
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.NumberLiteral, '1'],
					]],
					[NT.SemicolonSeparator],
				]);
			});
		});

	})

	describe(NT.Loop, (): void => {

		it('simple loop', () => {
			expect(parse('loop {}')).toMatchParseTree([
				[NT.Loop, [
					[NT.BlockStatement, []],
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
				[NT.Loop, [
					[NT.BlockStatement, [
						[NT.VariableDeclaration, 'const', [
							[NT.Identifier, 'response'],
							[NT.AssignmentOperator],
							[NT.CallExpression, [
								[NT.MemberExpression, [
									[NT.MemberExpression, [
										[NT.Identifier, 'http'],
										[NT.Identifier, 'server'],
									]],
									[NT.Identifier, 'listen'],
								]],
								[NT.ArgumentsList, [
									[NT.NumberLiteral, '3,000'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
						[NT.IfStatement, { before: true }, [
							[NT.BinaryExpression, '>', [
								[NT.MemberExpression, [
									[NT.MemberExpression, [
										[NT.Identifier, 'response'],
										[NT.Identifier, 'status'],
									]],
									[NT.Identifier, 'code'],
								]],
								[NT.NumberLiteral, '300'],
							]],
							[NT.BlockStatement, [
								[NT.BreakStatement],
								[NT.SemicolonSeparator],
							]],
						]],
					]],
				]],
			]);
		});

	});

	describe(NT.MemberExpression, () => {

		it('works with several nested layers', () => {
			expect(parse('a.b.c.d')).toMatchParseTree([
				[NT.MemberExpression, [
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.Identifier, 'a'],
							[NT.Identifier, 'b'],
						]],
						[NT.Identifier, 'c'],
					]],
					[NT.Identifier, 'd'],
				]],
			]);
		});

		it('works with this', () => {
			expect(parse('this.foo')).toMatchParseTree([
				[NT.MemberExpression, [
					[NT.Keyword, 'this'],
					[NT.Identifier, 'foo'],
				]],
			]);
		});

	});

	describe('CallExpression with create', () => {

		it('simple', () => {
			expect(parse('A.create();')).toMatchParseTree([
				[NT.CallExpression, [
					[NT.MemberExpression, [
						[NT.Identifier, 'A'],
						[NT.Identifier, 'create'],
					]],
					[NT.ArgumentsList, []],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('with GenericTypes and Arguments', () => {
			expect(parse('A<|T, U|>.create(T.create(), U.create(), "foo");')).toMatchParseTree([
				[NT.CallExpression, [
					[NT.MemberExpression, [
						[NT.Typed, [
							[NT.Identifier, 'A'],
							[NT.TypeArgumentsList, [
								[NT.Identifier, 'T'],
								[NT.CommaSeparator],
								[NT.Identifier, 'U'],
							]],
						]],
						[NT.Identifier, 'create'],
					]],
					[NT.ArgumentsList, [
						[NT.CallExpression, [
							[NT.MemberExpression, [
								[NT.Identifier, 'T'],
								[NT.Identifier, 'create'],
							]],
							[NT.ArgumentsList, []],
						]],
						[NT.CommaSeparator],
						[NT.CallExpression, [
							[NT.MemberExpression, [
								[NT.Identifier, 'U'],
								[NT.Identifier, 'create'],
							]],
							[NT.ArgumentsList, []],
						]],
						[NT.CommaSeparator],
						[NT.StringLiteral, 'foo'],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('with several nested layers', () => {
			expect(parse('A.B.C.D.create();')).toMatchParseTree([
				[NT.CallExpression, [
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.MemberExpression, [
								[NT.MemberExpression, [
									[NT.Identifier, 'A'],
									[NT.Identifier, 'B'],
								]],
								[NT.Identifier, 'C'],
							]],
							[NT.Identifier, 'D'],
						]],
						[NT.Identifier, 'create'],
					]],
					[NT.ArgumentsList, []],
				]],
				[NT.SemicolonSeparator],
			]);
		});

	});

	describe('Operators', (): void => {
		describe('UnaryExpression', (): void => {

			describe('negation', () => {

				it('with Identifier', (): void => {
					expect(parse('!foo;')).toMatchParseTree([
						[NT.UnaryExpression, '!', { before: true }, [
							[NT.Identifier, 'foo'],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with Identifier in parens', (): void => {
					expect(parse('(!foo);')).toMatchParseTree([
						[NT.Parenthesized, [
							[NT.UnaryExpression, '!', { before: true }, [
								[NT.Identifier, 'foo'],
							]],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with CallExpression', (): void => {
					expect(parse('!bar();')).toMatchParseTree([
						[NT.UnaryExpression, '!', { before: true }, [
							[NT.CallExpression, [
								[NT.Identifier, 'bar'],
								[NT.ArgumentsList, []],
							]],
						]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with nested CallExpression', (): void => {
					expect(parse('!foo.bar();')).toMatchParseTree([
						[NT.UnaryExpression, '!', { before: true }, [
							[NT.CallExpression, [
								[NT.MemberExpression, [
									[NT.Identifier, 'foo'],
									[NT.Identifier, 'bar'],
								]],
								[NT.ArgumentsList, []],
							]],
						]],
						[NT.SemicolonSeparator],
					]);
				});

			});

			describe('negative number', () => {

				it('without parens', (): void => {
					expect(parse('-1')).toMatchParseTree([
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '1'],
						]]
					]);
				});

				it('with parens', (): void => {
					expect(parse('(-1)')).toMatchParseTree([
						[NT.Parenthesized, [
							[NT.UnaryExpression, '-', { before: true }, [
								[NT.NumberLiteral, '1'],
							]],
						]],
					]);
				});

			});

			describe('increment and decrement', () => {

				it('pre-decrement', (): void => {
					expect(parse('--foo')).toMatchParseTree([
						[NT.UnaryExpression, '--', { before: true }, [
							[NT.Identifier, 'foo'],
						]],
					]);

					expect(parse('foo[--i]')).toMatchParseTree([
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.MembersList, [
								[NT.UnaryExpression, '--', { before: true }, [
									[NT.Identifier, 'i'],
								]],
							]],
						]],
					]);
				});

				it('post-decrement', (): void => {
					expect(parse('foo--')).toMatchParseTree([
						[NT.UnaryExpression, '--', { before: false }, [
							[NT.Identifier, 'foo'],
						]],
					]);

					expect(parse('foo---')).toMatchParseTree([
						[NT.BinaryExpression, '-', [
							[NT.UnaryExpression, '--', { before: false }, [
								[NT.Identifier, 'foo'],
							]],
						]],
					]);

					expect(parse('foo[i--]')).toMatchParseTree([
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.MembersList, [
								[NT.UnaryExpression, '--', { before: false }, [
									[NT.Identifier, 'i'],
								]],
							]],
						]],
					]);
				});

				it('pre-increment', (): void => {
					expect(parse('++foo')).toMatchParseTree([
						[NT.UnaryExpression, '++', { before: true }, [
							[NT.Identifier, 'foo'],
						]],
					]);

					expect(parse('foo[++i]')).toMatchParseTree([
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.MembersList, [
								[NT.UnaryExpression, '++', { before: true }, [
									[NT.Identifier, 'i'],
								]],
							]],
						]],
					]);
				});

				it('post-increment', (): void => {
					expect(parse('foo++')).toMatchParseTree([
						[NT.UnaryExpression, '++', { before: false }, [
							[NT.Identifier, 'foo'],
						]],
					]);

					expect(parse('foo+++')).toMatchParseTree([
						[NT.BinaryExpression, '+', [
							[NT.UnaryExpression, '++', { before: false }, [
								[NT.Identifier, 'foo'],
							]],
						]],
					]);

					expect(parse('foo[i++]')).toMatchParseTree([
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.MembersList, [
								[NT.UnaryExpression, '++', { before: false }, [
									[NT.Identifier, 'i'],
								]],
							]],
						]],
					]);
				});
			});

		});

		describe(NT.BinaryExpression, (): void => {
			describe('with bools', (): void => {
				it('double pipe', (): void => {
					expect(parse('a ||')).toMatchParseTree([
						[NT.BinaryExpression, '||', [
							[NT.Identifier, 'a'],
						]],
					]);

					expect(parse('a || true')).toMatchParseTree([
						[NT.BinaryExpression, '||', [
							[NT.Identifier, 'a'],
							[NT.BoolLiteral, 'true'],
						]],
					]);
				});

				it('double ampersand', (): void => {
					expect(parse('a &&')).toMatchParseTree([
						[NT.BinaryExpression, '&&', [
							[NT.Identifier, 'a'],
						]],
					]);

					expect(parse('a && true')).toMatchParseTree([
						[NT.BinaryExpression, '&&', [
							[NT.Identifier, 'a'],
							[NT.BoolLiteral, 'true'],
						]],
					]);
				});
			});

			describe('with numbers', (): void => {
				describe('compare', (): void => {
					doubleExpressionScenariosCheckingOperator('<=>', NT.BinaryExpression);
				});

				describe('equals', (): void => {
					doubleExpressionScenariosCheckingOperator('==', NT.BinaryExpression);
				});

				describe('not equals', (): void => {
					doubleExpressionScenariosCheckingOperator('!=', NT.BinaryExpression);
				});

				describe('less than', (): void => {
					doubleExpressionScenariosCheckingOperator('<', NT.BinaryExpression);
				});

				describe('less than or equals', (): void => {
					doubleExpressionScenariosCheckingOperator('<=', NT.BinaryExpression);
				});

				describe('greater than', (): void => {
					doubleExpressionScenariosCheckingOperator('>', NT.BinaryExpression);
				});

				describe('greater than or equals', (): void => {
					doubleExpressionScenariosCheckingOperator('>=', NT.BinaryExpression);
				});
			});

			describe('compound with operator precedence', (): void => {

				it('makes && higher precedence than equality checks', () => {
					expect(parse('foo >= 2 && foo <= 5')).toMatchParseTree([
						[NT.BinaryExpression, '&&', [
							[NT.BinaryExpression, '>=', [
								[NT.Identifier, 'foo'],
								[NT.NumberLiteral, '2'],
							]],
							[NT.BinaryExpression, '<=', [
								[NT.Identifier, 'foo'],
								[NT.NumberLiteral, '5'],
							]],
						]],
					]);
				});

				it('makes || higher precedence than equality checks', () => {
					expect(parse('foo > 2 || foo < 5')).toMatchParseTree([
						[NT.BinaryExpression, '||', [
							[NT.BinaryExpression, '>', [
								[NT.Identifier, 'foo'],
								[NT.NumberLiteral, '2'],
							]],
							[NT.BinaryExpression, '<', [
								[NT.Identifier, 'foo'],
								[NT.NumberLiteral, '5'],
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
					[NT.BinaryExpression, '+', [
						[NT.NumberLiteral, '1'],
						[NT.Parenthesized, [
							[NT.BinaryExpression, '*', [
								[NT.NumberLiteral, '2'],
								[NT.Parenthesized, [
									[NT.BinaryExpression, '/', [
										[NT.UnaryExpression, '-', { before: true }, [
											[NT.NumberLiteral, '3'],
										]],
										[NT.BinaryExpression, '%', [
											[NT.UnaryExpression, '-', { before: true }, [
												[NT.Parenthesized, [
													[NT.BinaryExpression, '-', [
														[NT.NumberLiteral, '2.3'],
														[NT.NumberLiteral, '4'],
													]],
												]],
											]],
											[NT.NumberLiteral, '9'],
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
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.NumberLiteral, '1'],
					]],
					[NT.SemicolonSeparator],
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'bar'],
						[NT.AssignmentOperator],
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.Identifier, 'foo'],
						]],
					]],
					[NT.SemicolonSeparator],
				]);
			});
		});
	});

	describe('Print', () => {

		it('is closed with a semicolon', () => {
			expect(parse('print foo[5];print 5;')).toMatchParseTree([
				[NT.PrintStatement, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.MembersList, [
							[NT.NumberLiteral, '5'],
						]],
					]],
				]],
				[NT.SemicolonSeparator],
				[NT.PrintStatement, [
					[NT.NumberLiteral, '5'],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('should work with a CallExpression', () => {
			expect(parse('print myFoo.foo();')).toMatchParseTree([
				[NT.PrintStatement, [
					[NT.CallExpression, [
						[NT.MemberExpression, [
							[NT.Identifier, 'myFoo'],
							[NT.Identifier, 'foo'],
						]],
						[NT.ArgumentsList, []],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		})

	})

	describe('RepeatStatement', (): void => {

		it('simple repeat statement', () => {
			expect(parse('repeat {}')).toMatchParseTree([
				[NT.RepeatStatement, [
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with break', () => {
			expect(parse('repeat {\nbreak;\n}')).toMatchParseTree([
				[NT.RepeatStatement, [
					[NT.BlockStatement, [
						[NT.BreakStatement],
						[NT.SemicolonSeparator],
					]],
				]],
			]);
		});

	});

	describe('Types', (): void => {
		describe('should understand built-in types', () => {
			it.each(types)('%s is recognized as a type', (type) => {
				expect(parse(type)).toMatchParseTree([
					[NT.Type, type],
				]);
			});

			it.each(types)('%s[] is recognized as a one-dimensional array of type', (type) => {
				expect(parse(`${type}[]`)).toMatchParseTree([
					[NT.ArrayType, [
						[NT.Type, type],
					]],
				]);
			});

			it.each(types)('%s[][] is recognized as a two-dimensional array of type', (type) => {
				expect(parse(`${type}[][]`)).toMatchParseTree([
					[NT.ArrayType, [
						[NT.ArrayType, [
							[NT.Type, type],
						]],
					]],
				]);
			});
		});

		describe('arrays', () => {

			it('should understand a custom array', () => {
				expect(parse('Foo[]')).toMatchParseTree([
					[NT.ArrayType, [
						[NT.Identifier, 'Foo'],
					]],
				]);

				expect(parse('Foo[][]')).toMatchParseTree([
					[NT.ArrayType, [
						[NT.ArrayType, [
							[NT.Identifier, 'Foo'],
						]],
					]],
				]);
			});

			describe('ranges', (): void => {
				doubleExpressionScenariosNotCheckingOperator('..', NT.RangeExpression);
			});

		});
	});

	describe(NT.WhenExpression, (): void => {

		it('works with a small example', () => {
			expect(parse(`when (someNumber) {
				1 -> 'small',
			}`)).toMatchParseTree([
				[NT.WhenExpression, [
					[NT.Parenthesized, [
						[NT.Identifier, 'someNumber'],
					]],
					[NT.BlockStatement, [
						[NT.WhenCase, [
							[NT.WhenCaseTests, [
								[NT.NumberLiteral, '1'],
							]],
							[NT.WhenCaseConsequent, [
								[NT.StringLiteral, 'small'],
							]],
						]],
						[NT.CommaSeparator],
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
				[NT.WhenExpression, [
					[NT.Identifier, 'someNumber'],
					[NT.BlockStatement, [
						[NT.WhenCase, [
							[NT.WhenCaseTests, [
								[NT.NumberLiteral, '1'],
							]],
							[NT.WhenCaseConsequent, [
								[NT.BlockStatement, [
									[NT.CallExpression, [
										[NT.Identifier, 'doThing1'],
										[NT.ArgumentsList, []],
									]],
									[NT.SemicolonSeparator],
									[NT.CallExpression, [
										[NT.Identifier, 'doThing2'],
										[NT.ArgumentsList, []],
									]],
									[NT.SemicolonSeparator],
									[NT.ReturnStatement, [
										[NT.StringLiteral, 'large'],
									]],
									[NT.SemicolonSeparator],
								]],
							]],
						]],
						[NT.CommaSeparator],
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
				[NT.VariableDeclaration, 'const', [
					[NT.Identifier, 'size'],
					[NT.AssignmentOperator],
					[NT.WhenExpression, [
						[NT.Identifier, 'someNumber'],
						[NT.BlockStatement, [
							[NT.WhenCase, [
								[NT.WhenCaseTests, [
									[NT.NumberLiteral, '1'],
									[NT.CommaSeparator],
									[NT.NumberLiteral, '2'],
								]],
								[NT.WhenCaseConsequent, [
									[NT.StringLiteral, 'small'],
								]]
							]],
							[NT.CommaSeparator],
							[NT.WhenCase, [
								[NT.WhenCaseTests, [
									[NT.RangeExpression, [
										[NT.NumberLiteral, '3'],
										[NT.NumberLiteral, '10'],
									]],
								]],
								[NT.WhenCaseConsequent, [
									[NT.StringLiteral, 'medium'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.WhenCase, [
								[NT.WhenCaseTests, [
									[NT.NumberLiteral, '11'],
								]],
								[NT.WhenCaseConsequent, [
									[NT.BlockStatement, [
										[NT.CallExpression, [
											[NT.Identifier, 'doThing1'],
											[NT.ArgumentsList, []],
										]],
										[NT.SemicolonSeparator],
										[NT.CallExpression, [
											[NT.Identifier, 'doThing2'],
											[NT.ArgumentsList, []],
										]],
										[NT.SemicolonSeparator],
										[NT.ReturnStatement, [
											[NT.StringLiteral, 'large'],
										]],
										[NT.SemicolonSeparator],
									]],
								]],
							]],
							[NT.CommaSeparator],
							[NT.WhenCase, [
								[NT.WhenCaseTests, [
									[NT.NumberLiteral, '12'],
								]],
								[NT.WhenCaseConsequent, [
									[NT.CallExpression, [
										[NT.Identifier, 'doSomethingElse'],
										[NT.ArgumentsList, []],
									]],
								]],
							]],
							[NT.CommaSeparator],
							[NT.WhenCase, [
								[NT.WhenCaseTests, [
									[NT.RestElement, '...'],
								]],
								[NT.WhenCaseConsequent, [
									[NT.StringLiteral, 'off the charts'],
								]],
							]],
							[NT.CommaSeparator],
						]],
					]],
				]],
			]);
		});
	});

	describe('WhileStatement', (): void => {

		it('with CallExpression test', () => {
			expect(parse('while foo() {}')).toMatchParseTree([
				[NT.WhileStatement, [
					[NT.CallExpression, [
						[NT.Identifier, 'foo'],
						[NT.ArgumentsList, []],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with BinaryExpression test', () => {
			expect(parse('while i < 10 {}')).toMatchParseTree([
				[NT.WhileStatement, [
					[NT.BinaryExpression, '<', [
						[NT.Identifier, 'i'],
						[NT.NumberLiteral, '10'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with UnaryExpression test', () => {
			expect(parse('while !i {}')).toMatchParseTree([
				[NT.WhileStatement, [
					[NT.UnaryExpression, '!', { before: true }, [
						[NT.Identifier, 'i'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with parens and BinaryExpression', () => {
			expect(parse('while (this.foo != true) {}')).toMatchParseTree([
				[NT.WhileStatement, [
					[NT.Parenthesized, [
						[NT.BinaryExpression, '!=', [
							[NT.MemberExpression, [
								[NT.Keyword, 'this'],
								[NT.Identifier, 'foo'],
							]],
							[NT.BoolLiteral, 'true'],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with parens and UnaryExpression', () => {
			expect(parse('while (!this.foo()) {}')).toMatchParseTree([
				[NT.WhileStatement, [
					[NT.Parenthesized, [
						[NT.UnaryExpression, '!', { before: true }, [
							[NT.CallExpression, [
								[NT.MemberExpression, [
									[NT.Keyword, 'this'],
									[NT.Identifier, 'foo'],
								]],
								[NT.ArgumentsList, []],
							]],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with contents in body', () => {
			expect(parse('while (!foo) {\ndo();\n}')).toMatchParseTree([
				[NT.WhileStatement, [
					[NT.Parenthesized, [
						[NT.UnaryExpression, '!', { before: true }, [
							[NT.Identifier, 'foo'],
						]],
					]],
					[NT.BlockStatement, [
						[NT.CallExpression, [
							[NT.Identifier, 'do'],
							[NT.ArgumentsList, []],
						]],
						[NT.SemicolonSeparator],
					]],
				]],
			]);
		});

	});

	describe('bugs fixed', (): void => {
		it('"foo()..3" should place the RangeExpression outside of the CallExpression', (): void => {
			expect(parse('foo()..3')).toMatchParseTree([
				[NT.RangeExpression, [
					[NT.CallExpression, [
						[NT.Identifier, 'foo'],
						[NT.ArgumentsList, []],
					]],
					[NT.NumberLiteral, '3'],
				]]
			]);
		});

		it('"[1<2, 3>2];" should be a bool array, not a tuple', (): void => {
			expect(parse('[1<2, 4>3];')).toMatchParseTree([
				[NT.ArrayExpression, [
					[NT.BinaryExpression, '<', [
						[NT.NumberLiteral, '1'],
						[NT.NumberLiteral, '2'],
					]],
					[NT.CommaSeparator],
					[NT.BinaryExpression, '>', [
						[NT.NumberLiteral, '4'],
						[NT.NumberLiteral, '3'],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it('"f foo(a: number = 1,234, b = true) -> bool {}" should correctly see the comma as a separator', () => {
			expect(parse('f foo(a: number = 1,234, b = true) -> bool {}')).toMatchParseTree([
				[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.Type, 'number'],
							[NT.AssignmentOperator],
							[NT.NumberLiteral, '1,234'],
						]],
						[NT.CommaSeparator],
						[NT.Parameter, [
							[NT.Identifier, 'b'],
							[NT.AssignmentOperator],
							[NT.BoolLiteral, 'true'],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.Type, 'bool'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

	});
});
