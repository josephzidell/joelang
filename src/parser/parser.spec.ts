/* eslint-disable no-useless-escape */
import { describe, expect, it } from '@jest/globals';
import assert from 'node:assert/strict';
import '../../setupJest'; // for the types
import { primitiveTypes } from '../lexer/types';
import { numberSizesAll } from '../shared/numbers/sizes';
import { stackPairs } from './parser';
import { NT } from './types';
import { parse, testParse } from './util';

const binaryMathOperatorsThatArePartOfAMemberExpression = ['+', '+=', '-', '-=', '*', '*='];
const binaryMathOperatorsThatArePartOfAMemberListExpression = ['/', '/=', '%', '%='];
const unaryMathOperatorScenarios = [
	{ operator: '++', before: true, expression: '++bar' },
	{ operator: '++', before: false, expression: 'bar++' },
	{ operator: '--', before: true, expression: '--bar' },
	{ operator: '--', before: false, expression: 'bar--' },
	{ operator: '-', before: true, expression: '-bar' },
];

const binaryExpressionScenariosCheckingOperator = (operator: string) => {
	// 2 numbers
	it(`${operator} with 2 number literals`, (): void => {
		testParse(`1 ${operator} 2_000;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.NumberLiteral, '1'],
					[NT.NumberLiteral, '2_000'],
				],
			],
			[NT.SemicolonSeparator],
		]);

		testParse(`-1_000 ${operator} 2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '1_000']]],
					[NT.NumberLiteral, '2'],
				],
			],
			[NT.SemicolonSeparator],
		]);

		testParse(`1 ${operator} -2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.NumberLiteral, '1'],
					[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2']]],
				],
			],
			[NT.SemicolonSeparator],
		]);

		testParse(`-1 ${operator} -2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '1']]],
					[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2']]],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});

	// identifier and number
	it(`${operator} with identifier and number literal`, (): void => {
		testParse(`foo ${operator} 2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.Identifier, 'foo'],
					[NT.NumberLiteral, '2'],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and identifier`, (): void => {
		testParse(`1 ${operator} foo;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.NumberLiteral, '1'],
					[NT.Identifier, 'foo'],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});

	// element access and number
	it(`${operator} with element access and number literal`, (): void => {
		testParse(`foo['a'] ${operator} 2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.StringLiteral, 'a'],
						],
					],
					[NT.NumberLiteral, '2'],
				],
			],
			[NT.SemicolonSeparator],
		]);

		testParse(`foo.a ${operator} 2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.Identifier, 'a'],
						],
					],
					[NT.NumberLiteral, '2'],
				],
			],
			[NT.SemicolonSeparator],
		]);

		testParse(`foo['a'].b ${operator} 2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[
						NT.MemberExpression,
						[
							[
								NT.MemberExpression,
								[
									[NT.Identifier, 'foo'],
									[NT.StringLiteral, 'a'],
								],
							],
							[NT.Identifier, 'b'],
						],
					],
					[NT.NumberLiteral, '2'],
				],
			],
			[NT.SemicolonSeparator],
		]);

		testParse(`2 ${operator} this.foo['a']['c'].d;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.NumberLiteral, '2'],
					[
						NT.MemberExpression,
						[
							[
								NT.MemberExpression,
								[
									[
										NT.MemberExpression,
										[
											[NT.MemberExpression, [[NT.ThisKeyword], [NT.Identifier, 'foo']]],
											[NT.StringLiteral, 'a'],
										],
									],
									[NT.StringLiteral, 'c'],
								],
							],
							[NT.Identifier, 'd'],
						],
					],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and element access`, (): void => {
		testParse(`1 ${operator} foo['a'];'a'`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.NumberLiteral, '1'],
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.StringLiteral, 'a'],
						],
					],
				],
			],
			[NT.SemicolonSeparator],
			[NT.StringLiteral, 'a'],
		]);
	});

	// method call and number
	it(`${operator} with method call and number literal`, (): void => {
		testParse(`foo('a') ${operator} 2;`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[
						NT.CallExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.ArgumentsList, [[NT.StringLiteral, 'a']]],
						],
					],
					[NT.NumberLiteral, '2'],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with number literal and method call`, (): void => {
		testParse(`1 ${operator} foo('a');`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[NT.NumberLiteral, '1'],
					[
						NT.CallExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.ArgumentsList, [[NT.StringLiteral, 'a']]],
						],
					],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});

	// element access and method call
	it(`${operator} with element access and method call`, (): void => {
		testParse(`foo['a'] ${operator} bar('b');`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.StringLiteral, 'a'],
						],
					],
					[
						NT.CallExpression,
						[
							[NT.Identifier, 'bar'],
							[NT.ArgumentsList, [[NT.StringLiteral, 'b']]],
						],
					],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});

	it(`${operator} with method call and element access`, (): void => {
		testParse(`foo('a') ${operator} bar['b'];`, [
			[
				NT.BinaryExpression,
				operator,
				[
					[
						NT.CallExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.ArgumentsList, [[NT.StringLiteral, 'a']]],
						],
					],
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'bar'],
							[NT.StringLiteral, 'b'],
						],
					],
				],
			],
			[NT.SemicolonSeparator],
		]);
	});
};

describe('parser.ts', (): void => {
	describe('AssignmentExpressions', () => {
		it('should assign to a single identifier', () => {
			testParse('foo = 1;', [
				[
					NT.AssignmentExpression,
					[
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.NumberLiteral, '1']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('should assign to a property on this instance', () => {
			testParse('this.foo = 1;', [
				[
					NT.AssignmentExpression,
					[
						[NT.AssigneesList, [[NT.MemberExpression, [[NT.ThisKeyword], [NT.Identifier, 'foo']]]]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.NumberLiteral, '1']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('should assign to multiple identifiers and member expressions', () => {
			testParse('x, foo.bar = 0, 1;', [
				[
					NT.AssignmentExpression,
					[
						[
							NT.AssigneesList,
							[
								[NT.Identifier, 'x'],
								[NT.CommaSeparator],
								[
									NT.MemberExpression,
									[
										[NT.Identifier, 'foo'],
										[NT.Identifier, 'bar'],
									],
								],
							],
						],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.NumberLiteral, '0'], [NT.CommaSeparator], [NT.NumberLiteral, '1']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});
	});

	describe('Braces', () => {
		it('allows a code block in middle of a function', () => {
			testParse(
				`f foo {
					print 'hello';

					{
						print 'world';
					}

					print '!';
				}`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'foo'],
							[
								NT.BlockStatement,
								[
									[NT.PrintStatement, [[NT.StringLiteral, 'hello']]],
									[NT.SemicolonSeparator],
									[
										NT.BlockStatement,
										[[NT.PrintStatement, [[NT.StringLiteral, 'world']]], [NT.SemicolonSeparator]],
									],
									[NT.PrintStatement, [[NT.StringLiteral, '!']]],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
				],
			);
		});

		it('allows nested code blocks in middle of a function', () => {
			testParse(
				`f foo {
					print 'hello';

					{
						print 'world';

						{
							const x = 4;
						}

						{
							print x; // should get error
						}
					}

					print '!';
				}`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'foo'],
							[
								NT.BlockStatement,
								[
									[NT.PrintStatement, [[NT.StringLiteral, 'hello']]],
									[NT.SemicolonSeparator],
									[
										NT.BlockStatement,
										[
											[NT.PrintStatement, [[NT.StringLiteral, 'world']]],
											[NT.SemicolonSeparator],
											[
												NT.BlockStatement,
												[
													[
														NT.VariableDeclaration,
														'const',
														[
															[NT.AssigneesList, [[NT.Identifier, 'x']]],
															[NT.AssignmentOperator],
															[NT.AssignablesList, [[NT.NumberLiteral, '4']]],
														],
													],
													[NT.SemicolonSeparator],
												],
											],
											[
												NT.BlockStatement,
												[
													[NT.PrintStatement, [[NT.Identifier, 'x']]],
													[NT.SemicolonSeparator],
													[NT.Comment, '// should get error'],
												],
											],
										],
									],
									[NT.PrintStatement, [[NT.StringLiteral, '!']]],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
				],
			);
		});
	});

	describe('CallExpression', () => {
		it('should work with multiple return types and a VariableDeclaration', () => {
			testParse(
				`f doSomething -> string, bool { return '', true; };
				const goLangStyle, ok = doSomething();
				`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'doSomething'],
							[NT.FunctionReturns, [[NT.Type, 'string'], [NT.CommaSeparator], [NT.Type, 'bool']]],
							[
								NT.BlockStatement,
								[
									[
										NT.ReturnStatement,
										[[NT.StringLiteral, ''], [NT.CommaSeparator], [NT.BoolLiteral, 'true']],
									],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
					[
						NT.VariableDeclaration,
						'const',
						[
							[
								NT.AssigneesList,
								[[NT.Identifier, 'goLangStyle'], [NT.CommaSeparator], [NT.Identifier, 'ok']],
							],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.CallExpression,
										[
											[NT.Identifier, 'doSomething'],
											[NT.ArgumentsList, []],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				],
			);
		});

		it('works with several nested layers', () => {
			testParse('a.b.c.d(4);', [
				[
					NT.CallExpression,
					[
						[
							NT.MemberExpression,
							[
								[
									NT.MemberExpression,
									[
										[
											NT.MemberExpression,
											[
												[NT.Identifier, 'a'],
												[NT.Identifier, 'b'],
											],
										],
										[NT.Identifier, 'c'],
									],
								],
								[NT.Identifier, 'd'],
							],
						],
						[NT.ArgumentsList, [[NT.NumberLiteral, '4']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('call followed by property', () => {
			testParse('a(1).b', [
				[
					NT.MemberExpression,
					[
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'a'],
								[NT.ArgumentsList, [[NT.NumberLiteral, '1']]],
							],
						],
						[NT.Identifier, 'b'],
					],
				],
			]);
		});

		it('call followed by a call', () => {
			testParse('a(1).b(2)', [
				[
					NT.CallExpression,
					[
						[
							NT.MemberExpression,
							[
								[
									NT.CallExpression,
									[
										[NT.Identifier, 'a'],
										[NT.ArgumentsList, [[NT.NumberLiteral, '1']]],
									],
								],
								[NT.Identifier, 'b'],
							],
						],
						[NT.ArgumentsList, [[NT.NumberLiteral, '2']]],
					],
				],
			]);
		});

		it('generics', () => {
			testParse('a(b<|T|>);', [
				[
					NT.CallExpression,
					[
						[NT.Identifier, 'a'],
						[
							NT.ArgumentsList,
							[
								[
									NT.TypeInstantiationExpression,
									[
										[NT.Identifier, 'b'],
										[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
									],
								],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);

			testParse('a<|T|>(b);', [
				[
					NT.CallExpression,
					[
						[NT.Identifier, 'a'],
						[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
						[NT.ArgumentsList, [[NT.Identifier, 'b']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('more advanced generics', () => {
			testParse('const foo = Foo<|T, T[]|>();', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[
							NT.AssignablesList,
							[
								[
									NT.CallExpression,
									[
										[NT.Identifier, 'Foo'],
										[
											NT.TypeArgumentsList,
											[
												[NT.Identifier, 'T'],
												[NT.CommaSeparator],
												[NT.ArrayOf, [[NT.Identifier, 'T']]],
											],
										],
										[NT.ArgumentsList, []],
									],
								],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('multiple inheritance manual resolution', () => {
			testParse(
				`class C extends A, B {
					f foo () {
						return this.parent<|B|>.foo(); // <-- Specify to use B.foo
					}
				}`,
				[
					[
						NT.ClassDeclaration,
						[
							[NT.Identifier, 'C'],
							[
								NT.ExtensionsList,
								[
									[NT.Extension, [[NT.Identifier, 'A']]],
									[NT.CommaSeparator],
									[NT.Extension, [[NT.Identifier, 'B']]],
								],
							],
							[
								NT.BlockStatement,
								[
									[
										NT.FunctionDeclaration,
										[
											[NT.Identifier, 'foo'],
											[NT.ParametersList, []],
											[
												NT.BlockStatement,
												[
													[
														NT.ReturnStatement,
														[
															[
																NT.CallExpression,
																[
																	[
																		NT.MemberExpression,
																		[
																			[
																				NT.MemberExpression,
																				[
																					[NT.ThisKeyword],
																					[
																						NT.TypeInstantiationExpression,
																						[
																							[NT.Identifier, 'parent'],
																							[
																								NT.TypeArgumentsList,
																								[[NT.Identifier, 'B']],
																							],
																						],
																					],
																				],
																			],
																			[NT.Identifier, 'foo'],
																		],
																	],
																	[NT.ArgumentsList, []],
																],
															],
														],
													],
													[NT.SemicolonSeparator],
													[NT.Comment, '// <-- Specify to use B.foo'],
												],
											],
										],
									],
								],
							],
						],
					],
				],
			);
		});

		it('works with a TypeInstantiationExpression', () => {
			testParse('foo.bar<|T|>()', [
				[
					NT.CallExpression,
					[
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[
									NT.TypeInstantiationExpression,
									[
										[NT.Identifier, 'bar'],
										[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
									],
								],
							],
						],
						[NT.ArgumentsList, []],
					],
				],
			]);

			testParse('this.bar<|T|>()', [
				[
					NT.CallExpression,
					[
						[
							NT.MemberExpression,
							[
								[NT.ThisKeyword],
								[
									NT.TypeInstantiationExpression,
									[
										[NT.Identifier, 'bar'],
										[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
									],
								],
							],
						],
						[NT.ArgumentsList, []],
					],
				],
			]);
		});

		describe('works with create', () => {
			it('simple', () => {
				testParse('A.create();', [
					[
						NT.CallExpression,
						[
							[
								NT.MemberExpression,
								[
									[NT.Identifier, 'A'],
									[NT.Identifier, 'create'],
								],
							],
							[NT.ArgumentsList, []],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('with GenericTypes and Arguments', () => {
				testParse('A<|T, U|>.create(T.create(), U.create(), "foo");', [
					[
						NT.CallExpression,
						[
							[
								NT.MemberExpression,
								[
									[
										NT.TypeInstantiationExpression,
										[
											[NT.Identifier, 'A'],
											[
												NT.TypeArgumentsList,
												[[NT.Identifier, 'T'], [NT.CommaSeparator], [NT.Identifier, 'U']],
											],
										],
									],
									[NT.Identifier, 'create'],
								],
							],
							[
								NT.ArgumentsList,
								[
									[
										NT.CallExpression,
										[
											[
												NT.MemberExpression,
												[
													[NT.Identifier, 'T'],
													[NT.Identifier, 'create'],
												],
											],
											[NT.ArgumentsList, []],
										],
									],
									[NT.CommaSeparator],
									[
										NT.CallExpression,
										[
											[
												NT.MemberExpression,
												[
													[NT.Identifier, 'U'],
													[NT.Identifier, 'create'],
												],
											],
											[NT.ArgumentsList, []],
										],
									],
									[NT.CommaSeparator],
									[NT.StringLiteral, 'foo'],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('with several nested layers', () => {
				testParse('A.B.C.D.create();', [
					[
						NT.CallExpression,
						[
							[
								NT.MemberExpression,
								[
									[
										NT.MemberExpression,
										[
											[
												NT.MemberExpression,
												[
													[
														NT.MemberExpression,
														[
															[NT.Identifier, 'A'],
															[NT.Identifier, 'B'],
														],
													],
													[NT.Identifier, 'C'],
												],
											],
											[NT.Identifier, 'D'],
										],
									],
									[NT.Identifier, 'create'],
								],
							],
							[NT.ArgumentsList, []],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});
	});

	describe('ClassDeclaration', (): void => {
		it('empty class', (): void => {
			testParse('class Foo {}', [
				[
					NT.ClassDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					],
				],
			]);

			testParse('class Foo <| T, U.V, bool |> {}', [
				[
					NT.ClassDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.TypeParametersList,
							[
								[NT.TypeParameter, [[NT.Identifier, 'T']]],
								[NT.CommaSeparator],
								[
									NT.TypeParameter,
									[
										[
											NT.MemberExpression,
											[
												[NT.Identifier, 'U'],
												[NT.Identifier, 'V'],
											],
										],
									],
								],
								[NT.CommaSeparator],
								[NT.TypeParameter, [[NT.Type, 'bool']]],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('class with comment', (): void => {
			testParse('class Foo {\n# foo\n}\n# bar\n', [
				[
					NT.ClassDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, [[NT.Comment, '# foo']]],
					],
				],
				[NT.Comment, '# bar'],
			]);
		});

		it('class with properties and methods', (): void => {
			testParse('class Foo {\nconst foo = "bar";\nf bar {}}\n# bar\n', [
				[
					NT.ClassDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.BlockStatement,
							[
								[
									NT.VariableDeclaration,
									'const',
									[
										[NT.AssigneesList, [[NT.Identifier, 'foo']]],
										[NT.AssignmentOperator],
										[NT.AssignablesList, [[NT.StringLiteral, 'bar']]],
									],
								],
								[NT.SemicolonSeparator],
								[
									NT.FunctionDeclaration,
									[
										[NT.Identifier, 'bar'],
										[NT.BlockStatement, []],
									],
								],
							],
						],
					],
				],
				[NT.Comment, '# bar'],
			]);
		});

		it('class extends multiple and implements multiple', (): void => {
			testParse('class Foo extends Bar, Baz implements AbstractFooBar, AnotherAbstractClass {}', [
				[
					NT.ClassDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.ExtensionsList,
							[
								[NT.Extension, [[NT.Identifier, 'Bar']]],
								[NT.CommaSeparator],
								[NT.Extension, [[NT.Identifier, 'Baz']]],
							],
						],
						[
							NT.ClassImplementsList,
							[
								[NT.ClassImplement, [[NT.Identifier, 'AbstractFooBar']]],
								[NT.CommaSeparator],
								[NT.ClassImplement, [[NT.Identifier, 'AnotherAbstractClass']]],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('class extends multiple and implements multiple with generics', (): void => {
			testParse(
				'class Foo<|T,U|> extends Bar<|T<|RE|>, path|>, Baz implements AbstractFooBar, AnotherAbstractClass<|U|> {}',
				[
					[
						NT.ClassDeclaration,
						[
							[NT.Identifier, 'Foo'],
							[
								NT.TypeParametersList,
								[
									[NT.TypeParameter, [[NT.Identifier, 'T']]],
									[NT.CommaSeparator],
									[NT.TypeParameter, [[NT.Identifier, 'U']]],
								],
							],
							[
								NT.ExtensionsList,
								[
									[
										NT.Extension,
										[
											[NT.Identifier, 'Bar'],
											[
												NT.TypeArgumentsList,
												[
													[
														NT.TypeInstantiationExpression,
														[
															[NT.Identifier, 'T'],
															[NT.TypeArgumentsList, [[NT.Identifier, 'RE']]],
														],
													],
													[NT.CommaSeparator],
													[NT.Type, 'path'],
												],
											],
										],
									],
									[NT.CommaSeparator],
									[NT.Extension, [[NT.Identifier, 'Baz']]],
								],
							],
							[
								NT.ClassImplementsList,
								[
									[NT.ClassImplement, [[NT.Identifier, 'AbstractFooBar']]],
									[NT.CommaSeparator],
									[
										NT.ClassImplement,
										[
											[NT.Identifier, 'AnotherAbstractClass'],
											[NT.TypeArgumentsList, [[NT.Identifier, 'U']]],
										],
									],
								],
							],
							[NT.BlockStatement, []],
						],
					],
				],
			);
		});

		it('abstract class', (): void => {
			testParse('abstract class Foo {}', [
				[
					NT.ClassDeclaration,
					[
						[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					],
				],
			]);

			testParse('abstract class Foo<|T|> {}', [
				[
					NT.ClassDeclaration,
					[
						[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [[NT.TypeParameter, [[NT.Identifier, 'T']]]]],
						[NT.BlockStatement, []],
					],
				],
			]);

			testParse(
				`abstract class Foo {
					abstract readonly const baz: int8;

					abstract static f hello<|T|> (name = 'World') -> Greeting, T;

					pub static f world (name = 'Earth');
				}`,
				[
					[
						NT.ClassDeclaration,
						[
							[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
							[NT.Identifier, 'Foo'],
							[
								NT.BlockStatement,
								[
									[
										NT.VariableDeclaration,
										'const',
										[
											[
												NT.ModifiersList,
												[
													[NT.Modifier, 'abstract'],
													[NT.Modifier, 'readonly'],
												],
											],
											[NT.AssigneesList, [[NT.Identifier, 'baz']]],
											[NT.ColonSeparator],
											[NT.TypeArgumentsList, [[NT.Type, 'int8']]],
										],
									],
									[NT.SemicolonSeparator],
									[
										NT.FunctionDeclaration,
										[
											[
												NT.ModifiersList,
												[
													[NT.Modifier, 'abstract'],
													[NT.Modifier, 'static'],
												],
											],
											[NT.Identifier, 'hello'],
											[NT.TypeParametersList, [[NT.TypeParameter, [[NT.Identifier, 'T']]]]],
											[
												NT.ParametersList,
												[
													[
														NT.Parameter,
														[
															[NT.Identifier, 'name'],
															[NT.AssignmentOperator],
															[NT.StringLiteral, 'World'],
														],
													],
												],
											],
											[
												NT.FunctionReturns,
												[
													[NT.Identifier, 'Greeting'],
													[NT.CommaSeparator],
													[NT.Identifier, 'T'],
												],
											],
										],
									],
									[NT.SemicolonSeparator],
									[
										NT.FunctionDeclaration,
										[
											[
												NT.ModifiersList,
												[
													[NT.Modifier, 'pub'],
													[NT.Modifier, 'static'],
												],
											],
											[NT.Identifier, 'world'],
											[
												NT.ParametersList,
												[
													[
														NT.Parameter,
														[
															[NT.Identifier, 'name'],
															[NT.AssignmentOperator],
															[NT.StringLiteral, 'Earth'],
														],
													],
												],
											],
										],
									],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
				],
			);

			testParse('abstract class Foo {}\nclass Bar extends Foo {}', [
				[
					NT.ClassDeclaration,
					[
						[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					],
				],
				[
					NT.ClassDeclaration,
					[
						[NT.Identifier, 'Bar'],
						[NT.ExtensionsList, [[NT.Extension, [[NT.Identifier, 'Foo']]]]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});
	});

	describe('Comment', (): void => {
		it('a single-line comment', (): void => {
			testParse('# let x = "foo"', [[NT.Comment, '# let x = "foo"']]);
		});

		it('a multi-line comment', (): void => {
			testParse('/* let x = "foo" */', [[NT.Comment, '/* let x = "foo" */']]);
		});
	});

	describe('EnumDeclaration', (): void => {
		it('empty enum', (): void => {
			testParse('enum Foo {}', [
				[
					NT.EnumDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					],
				],
			]);

			testParse('enum Foo <| T, U |> {}', [
				[
					NT.EnumDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.TypeParametersList,
							[
								[NT.TypeParameter, [[NT.Identifier, 'T']]],
								[NT.CommaSeparator],
								[NT.TypeParameter, [[NT.Identifier, 'U']]],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('enum extends other', (): void => {
			testParse('enum Foo {} enum Bar extends Foo {}', [
				[
					NT.EnumDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					],
				],
				[
					NT.EnumDeclaration,
					[
						[NT.Identifier, 'Bar'],
						[NT.ExtensionsList, [[NT.Extension, [[NT.Identifier, 'Foo']]]]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('enum extends multiple', (): void => {
			testParse('enum Foo extends Bar, Baz {}', [
				[
					NT.EnumDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.ExtensionsList,
							[
								[NT.Extension, [[NT.Identifier, 'Bar']]],
								[NT.CommaSeparator],
								[NT.Extension, [[NT.Identifier, 'Baz']]],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('enum extends multiple with generics', (): void => {
			testParse('enum Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}', [
				[
					NT.EnumDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.TypeParametersList,
							[
								[NT.TypeParameter, [[NT.Identifier, 'T']]],
								[NT.CommaSeparator],
								[NT.TypeParameter, [[NT.Identifier, 'U']]],
							],
						],
						[
							NT.ExtensionsList,
							[
								[
									NT.Extension,
									[
										[NT.Identifier, 'Bar'],
										[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
									],
								],
								[NT.CommaSeparator],
								[
									NT.Extension,
									[
										[NT.Identifier, 'Baz'],
										[NT.TypeArgumentsList, [[NT.Identifier, 'U']]],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});
	});

	describe('ForStatement', (): void => {
		it('simple for statement with range', () => {
			testParse('for let i in 0 .. 9 {}', [
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[
							NT.RangeExpression,
							[
								[NT.NumberLiteral, '0'],
								[NT.NumberLiteral, '9'],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with range in parens', () => {
			testParse('for (let i in 0 .. 9) {}', [
				[
					NT.ForStatement,
					[
						[
							NT.Parenthesized,
							[
								[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
								[NT.InKeyword],
								[
									NT.RangeExpression,
									[
										[NT.NumberLiteral, '0'],
										[NT.NumberLiteral, '9'],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with identifier', () => {
			testParse('const foo = [1, 2, 3]; for let i in foo {}', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[
							NT.AssignablesList,
							[
								[
									NT.ArrayExpression,
									[
										[NT.NumberLiteral, '1'],
										[NT.CommaSeparator],
										[NT.NumberLiteral, '2'],
										[NT.CommaSeparator],
										[NT.NumberLiteral, '3'],
									],
								],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[NT.Identifier, 'foo'],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with array (and multiple variables)', () => {
			testParse('for let n, i in [1, 2, 3] {}', [
				[
					NT.ForStatement,
					[
						[
							NT.VariableDeclaration,
							'let',
							[[NT.AssigneesList, [[NT.Identifier, 'n'], [NT.CommaSeparator], [NT.Identifier, 'i']]]],
						],
						[NT.InKeyword],
						[
							NT.ArrayExpression,
							[
								[NT.NumberLiteral, '1'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '2'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '3'],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with call expression', () => {
			testParse('for let i in foo() {}', [
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, []],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with member expression', () => {
			testParse('for let i in foo.bar {}', [
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.Identifier, 'bar'],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with member list expression', () => {
			testParse('for let i in foo[0, 2, 4] {}', [
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[
							NT.MemberListExpression,
							[
								[NT.Identifier, 'foo'],
								[
									NT.MemberList,
									[
										[NT.NumberLiteral, '0'],
										[NT.CommaSeparator],
										[NT.NumberLiteral, '2'],
										[NT.CommaSeparator],
										[NT.NumberLiteral, '4'],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with member list expression using a range', () => {
			testParse('for let i in foo[0 .. 4] {}', [
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[
							NT.MemberListExpression,
							[
								[NT.Identifier, 'foo'],
								[
									NT.MemberList,
									[
										[
											NT.RangeExpression,
											[
												[NT.NumberLiteral, '0'],
												[NT.NumberLiteral, '4'],
											],
										],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('should end with the closing brace and next expression comes after', () => {
			testParse('for let i in foo {}print "something after";', [
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[NT.Identifier, 'foo'],
						[NT.BlockStatement, []],
					],
				],
				[NT.PrintStatement, [[NT.StringLiteral, 'something after']]],
				[NT.SemicolonSeparator],
			]);
		});

		it('should behave correctly with nested ForStatements', () => {
			testParse('for let i in foo { for let j in bar {} }', [
				[
					NT.ForStatement,
					[
						[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'i']]]]],
						[NT.InKeyword],
						[NT.Identifier, 'foo'],
						[
							NT.BlockStatement,
							[
								[
									NT.ForStatement,
									[
										[NT.VariableDeclaration, 'let', [[NT.AssigneesList, [[NT.Identifier, 'j']]]]],
										[NT.InKeyword],
										[NT.Identifier, 'bar'],
										[NT.BlockStatement, []],
									],
								],
							],
						],
					],
				],
			]);
		});
	});

	describe('FunctionDeclaration', (): void => {
		it('no params or return types', (): void => {
			testParse('f foo {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('no params with single return type', (): void => {
			testParse('f foo -> bool {} 5;', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[NT.FunctionReturns, [[NT.Type, 'bool']]],
						[NT.BlockStatement, []],
					],
				],
				[NT.NumberLiteral, '5'],
				[NT.SemicolonSeparator],
			]);
		});

		it('no params with multiple return types', (): void => {
			testParse(
				`f foo -> bool, string {
					return true, 'hey';
				}`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'foo'],
							[NT.FunctionReturns, [[NT.Type, 'bool'], [NT.CommaSeparator], [NT.Type, 'string']]],
							[
								NT.BlockStatement,
								[
									[
										NT.ReturnStatement,
										[[NT.BoolLiteral, 'true'], [NT.CommaSeparator], [NT.StringLiteral, 'hey']],
									],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
				],
			);
		});

		it('param parens but no return types', (): void => {
			testParse('f foo () {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[NT.ParametersList, []],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('param parens with return types', (): void => {
			testParse('f foo () -> bool {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[NT.ParametersList, []],
						[NT.FunctionReturns, [[NT.Type, 'bool']]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('params but no return types', (): void => {
			testParse('f foo (a: int8, callback: f (a: int8) -> string, bool) {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[
							NT.ParametersList,
							[
								[NT.Parameter, [[NT.Identifier, 'a'], [NT.ColonSeparator], [NT.Type, 'int8']]],
								[NT.CommaSeparator],
								[
									NT.Parameter,
									[
										[NT.Identifier, 'callback'],
										[NT.ColonSeparator],
										[
											NT.FunctionSignature,
											[
												[
													NT.ParametersList,
													[
														[
															NT.Parameter,
															[
																[NT.Identifier, 'a'],
																[NT.ColonSeparator],
																[NT.Type, 'int8'],
															],
														],
													],
												],
												[
													NT.FunctionReturns,
													[[NT.Type, 'string'], [NT.CommaSeparator], [NT.Type, 'bool']],
												],
											],
										],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('params and return types', (): void => {
			testParse('f foo (a: int8, r: regex) -> regex, bool {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[
							NT.ParametersList,
							[
								[NT.Parameter, [[NT.Identifier, 'a'], [NT.ColonSeparator], [NT.Type, 'int8']]],
								[NT.CommaSeparator],
								[NT.Parameter, [[NT.Identifier, 'r'], [NT.ColonSeparator], [NT.Type, 'regex']]],
							],
						],
						[NT.FunctionReturns, [[NT.Type, 'regex'], [NT.CommaSeparator], [NT.Type, 'bool']]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('params and return types using functions', (): void => {
			testParse('f foo <|T|>(a: f -> T) -> f -> Result<|Maybe<|T|>|> {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[NT.TypeParametersList, [[NT.TypeParameter, [[NT.Identifier, 'T']]]]],
						[
							NT.ParametersList,
							[
								[
									NT.Parameter,
									[
										[NT.Identifier, 'a'],
										[NT.ColonSeparator],
										[NT.FunctionSignature, [[NT.FunctionReturns, [[NT.Identifier, 'T']]]]],
									],
								],
							],
						],
						[
							NT.FunctionReturns,
							[
								[
									NT.FunctionSignature,
									[
										[
											NT.FunctionReturns,
											[
												[
													NT.TypeInstantiationExpression,
													[
														[NT.Identifier, 'Result'],
														[
															NT.TypeArgumentsList,
															[
																[
																	NT.TypeInstantiationExpression,
																	[
																		[NT.Identifier, 'Maybe'],
																		[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
																	],
																],
															],
														],
													],
												],
											],
										],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('params and return types using tuples', (): void => {
			testParse('f foo (a: <bool>) -> <dec64> {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[
							NT.ParametersList,
							[
								[
									NT.Parameter,
									[[NT.Identifier, 'a'], [NT.ColonSeparator], [NT.TupleShape, [[NT.Type, 'bool']]]],
								],
							],
						],
						[NT.FunctionReturns, [[NT.TupleShape, [[NT.Type, 'dec64']]]]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('params and return types using tuples and arrays', (): void => {
			testParse('f foo (a: <bool[]>[]) -> <int32> {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[
							NT.ParametersList,
							[
								[
									NT.Parameter,
									[
										[NT.Identifier, 'a'],
										[NT.ColonSeparator],
										[NT.ArrayOf, [[NT.TupleShape, [[NT.ArrayOf, [[NT.Type, 'bool']]]]]]],
									],
								],
							],
						],
						[NT.FunctionReturns, [[NT.TupleShape, [[NT.Type, 'int32']]]]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with arrays', (): void => {
			testParse('f foo(a: int8[] = [5], b: string[][], ...c: Foo[]) -> regex, path[][][] {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[
							NT.ParametersList,
							[
								[
									NT.Parameter,
									[
										[NT.Identifier, 'a'],
										[NT.ColonSeparator],
										[NT.ArrayOf, [[NT.Type, 'int8']]],
										[NT.AssignmentOperator],
										[NT.ArrayExpression, [[NT.NumberLiteral, '5']]],
									],
								],
								[NT.CommaSeparator],
								[
									NT.Parameter,
									[
										[NT.Identifier, 'b'],
										[NT.ColonSeparator],
										[NT.ArrayOf, [[NT.ArrayOf, [[NT.Type, 'string']]]]],
									],
								],
								[NT.CommaSeparator],
								[
									NT.Parameter,
									[
										[NT.RestElement, '...'],
										[NT.Identifier, 'c'],
										[NT.ColonSeparator],
										[NT.ArrayOf, [[NT.Identifier, 'Foo']]],
									],
								],
							],
						],
						[
							NT.FunctionReturns,
							[
								[NT.Type, 'regex'],
								[NT.CommaSeparator],
								[NT.ArrayOf, [[NT.ArrayOf, [[NT.ArrayOf, [[NT.Type, 'path']]]]]]],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('return when', () => {
			testParse(
				`f school (age: int8) -> string {
					return when age {
						11 -> 'Hogwarts First Year',
						12 .. 17 -> 'Another Year at Hogwarts',
						18, 19 -> 'Auror Training',
						... -> 'Auror',
					};
				}`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'school'],
							[
								NT.ParametersList,
								[[NT.Parameter, [[NT.Identifier, 'age'], [NT.ColonSeparator], [NT.Type, 'int8']]]],
							],
							[NT.FunctionReturns, [[NT.Type, 'string']]],
							[
								NT.BlockStatement,
								[
									[
										NT.ReturnStatement,
										[
											[
												NT.WhenExpression,
												[
													[NT.Identifier, 'age'],
													[
														NT.BlockStatement,
														[
															[
																NT.WhenCase,
																[
																	[NT.WhenCaseValues, [[NT.NumberLiteral, '11']]],
																	[
																		NT.WhenCaseConsequent,
																		[[NT.StringLiteral, 'Hogwarts First Year']],
																	],
																],
															],
															[NT.CommaSeparator],
															[
																NT.WhenCase,
																[
																	[
																		NT.WhenCaseValues,
																		[
																			[
																				NT.RangeExpression,
																				[
																					[NT.NumberLiteral, '12'],
																					[NT.NumberLiteral, '17'],
																				],
																			],
																		],
																	],
																	[
																		NT.WhenCaseConsequent,
																		[
																			[
																				NT.StringLiteral,
																				'Another Year at Hogwarts',
																			],
																		],
																	],
																],
															],
															[NT.CommaSeparator],
															[
																NT.WhenCase,
																[
																	[
																		NT.WhenCaseValues,
																		[
																			[NT.NumberLiteral, '18'],
																			[NT.CommaSeparator],
																			[NT.NumberLiteral, '19'],
																		],
																	],
																	[
																		NT.WhenCaseConsequent,
																		[[NT.StringLiteral, 'Auror Training']],
																	],
																],
															],
															[NT.CommaSeparator],
															[
																NT.WhenCase,
																[
																	[NT.WhenCaseValues, [[NT.RestElement, '...']]],
																	[
																		NT.WhenCaseConsequent,
																		[[NT.StringLiteral, 'Auror']],
																	],
																],
															],
															[NT.CommaSeparator],
														],
													],
												],
											],
										],
									],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
				],
			);
		});

		it('multiple returns with when', () => {
			testParse(
				`f foo (age: uint16) -> uint16, string {
					return 5, when age {... -> 'No more foos',};
				}`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'foo'],
							[
								NT.ParametersList,
								[[NT.Parameter, [[NT.Identifier, 'age'], [NT.ColonSeparator], [NT.Type, 'uint16']]]],
							],
							[NT.FunctionReturns, [[NT.Type, 'uint16'], [NT.CommaSeparator], [NT.Type, 'string']]],
							[
								NT.BlockStatement,
								[
									[
										NT.ReturnStatement,
										[
											[NT.NumberLiteral, '5'],
											[NT.CommaSeparator],
											[
												NT.WhenExpression,
												[
													[NT.Identifier, 'age'],
													[
														NT.BlockStatement,
														[
															[
																NT.WhenCase,
																[
																	[NT.WhenCaseValues, [[NT.RestElement, '...']]],
																	[
																		NT.WhenCaseConsequent,
																		[[NT.StringLiteral, 'No more foos']],
																	],
																],
															],
															[NT.CommaSeparator],
														],
													],
												],
											],
										],
									],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
				],
			);
		});

		it('generics', (): void => {
			testParse('f foo <|T|> (a: T) -> T {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[NT.TypeParametersList, [[NT.TypeParameter, [[NT.Identifier, 'T']]]]],
						[
							NT.ParametersList,
							[[NT.Parameter, [[NT.Identifier, 'a'], [NT.ColonSeparator], [NT.Identifier, 'T']]]],
						],
						[NT.FunctionReturns, [[NT.Identifier, 'T']]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('abstract functions', () => {
			testParse(
				`abstract class A {
					abstract f foo1;
					abstract f foo2 (arg: int64);
					abstract f foo3<| T |> -> bool;
					abstract f foo4 (arg: dec32) -> bool;
				}`,
				[
					[
						NT.ClassDeclaration,
						[
							[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
							[NT.Identifier, 'A'],
							[
								NT.BlockStatement,
								[
									// foo1
									[
										NT.FunctionDeclaration,
										[
											[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
											[NT.Identifier, 'foo1'],
										],
									],
									[NT.SemicolonSeparator],
									// foo2
									[
										NT.FunctionDeclaration,
										[
											[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
											[NT.Identifier, 'foo2'],
											[
												NT.ParametersList,
												[
													[
														NT.Parameter,
														[
															[NT.Identifier, 'arg'],
															[NT.ColonSeparator],
															[NT.Type, 'int64'],
														],
													],
												],
											],
										],
									],
									[NT.SemicolonSeparator],
									// foo3
									[
										NT.FunctionDeclaration,
										[
											[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
											[NT.Identifier, 'foo3'],
											[NT.TypeParametersList, [[NT.TypeParameter, [[NT.Identifier, 'T']]]]],
											[NT.FunctionReturns, [[NT.Type, 'bool']]],
										],
									],
									[NT.SemicolonSeparator],
									// foo4
									[
										NT.FunctionDeclaration,
										[
											[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
											[NT.Identifier, 'foo4'],
											[
												NT.ParametersList,
												[
													[
														NT.Parameter,
														[
															[NT.Identifier, 'arg'],
															[NT.ColonSeparator],
															[NT.Type, 'dec32'],
														],
													],
												],
											],
											[NT.FunctionReturns, [[NT.Type, 'bool']]],
										],
									],
									[NT.SemicolonSeparator],
								],
							],
						],
					],
				],
			);
		});

		it('anonymous simple', () => {
			testParse('const foo = f {};', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.FunctionDeclaration, [[NT.BlockStatement, []]]]]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('anonymous complex', () => {
			testParse('const foo = f <|T|>(a: T) -> T {\ndo();\n};', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[
							NT.AssignablesList,
							[
								[
									NT.FunctionDeclaration,
									[
										[NT.TypeParametersList, [[NT.TypeParameter, [[NT.Identifier, 'T']]]]],
										[
											NT.ParametersList,
											[
												[
													NT.Parameter,
													[[NT.Identifier, 'a'], [NT.ColonSeparator], [NT.Identifier, 'T']],
												],
											],
										],
										[NT.FunctionReturns, [[NT.Identifier, 'T']]],
										[
											NT.BlockStatement,
											[
												[
													NT.CallExpression,
													[
														[NT.Identifier, 'do'],
														[NT.ArgumentsList, []],
													],
												],
												[NT.SemicolonSeparator],
											],
										],
									],
								],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('anonymous abstract', () => {
			testParse('abstract const foo = f;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.FunctionDeclaration]]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('ending with a question mark', () => {
			testParse(
				`f danger? -> bool {
					return true;
				}`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'danger?'],
							[NT.FunctionReturns, [[NT.Type, 'bool']]],
							[
								NT.BlockStatement,
								[[NT.ReturnStatement, [[NT.BoolLiteral, 'true']]], [NT.SemicolonSeparator]],
							],
						],
					],
				],
			);
		});

		describe('special function names', () => {
			describe('<=>', () => {
				// outside of a class
				it('<=> as function name outside of a class should return a response ParserError', (): void => {
					const result = parse('f <=> {}');

					// use assert instead of expect, since we need TS to narrow the type
					assert(result.isError(), `Expected: "error", Received: "ok"`);
					expect(result.error.message).toBe(
						'"<=>" is a BinaryExpression and we hoped to find a value before it, but alas!',
					);
				});

				// in a class
				it('<=> as function name inside of a class should be an innocent Identifier', (): void => {
					testParse('class A{f <=> {}}', [
						[
							NT.ClassDeclaration,
							[
								[NT.Identifier, 'A'],
								[
									NT.BlockStatement,
									[
										[
											NT.FunctionDeclaration,
											[
												[NT.Identifier, '<=>'],
												[NT.BlockStatement, []],
											],
										],
									],
								],
							],
						],
					]);
				});
			});
		});
	});

	describe('IfStatement', (): void => {
		it('with bool conditional', () => {
			testParse('if true {}', [
				[
					NT.IfStatement,
					[
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with BinaryExpression conditional using two NumberLiterals', () => {
			testParse('if 1 < 2 {}', [
				[
					NT.IfStatement,
					[
						[
							NT.BinaryExpression,
							'<',
							[
								[NT.NumberLiteral, '1'],
								[NT.NumberLiteral, '2'],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
			testParse('if foo == 2 {}', [
				[
					NT.IfStatement,
					[
						[
							NT.BinaryExpression,
							'==',
							[
								[NT.Identifier, 'foo'],
								[NT.NumberLiteral, '2'],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with BinaryExpression conditional using a CallExpression and a NumberLiteral', () => {
			testParse('if foo() == 2 {}', [
				[
					NT.IfStatement,
					[
						[
							NT.BinaryExpression,
							'==',
							[
								[
									NT.CallExpression,
									[
										[NT.Identifier, 'foo'],
										[NT.ArgumentsList, []],
									],
								],
								[NT.NumberLiteral, '2'],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with two conditions', () => {
			testParse('if foo() == 2 && a < 3 {}', [
				[
					NT.IfStatement,
					[
						[
							NT.BinaryExpression,
							'&&',
							[
								[
									NT.BinaryExpression,
									'==',
									[
										[
											NT.CallExpression,
											[
												[NT.Identifier, 'foo'],
												[NT.ArgumentsList, []],
											],
										],
										[NT.NumberLiteral, '2'],
									],
								],
								[
									NT.BinaryExpression,
									'<',
									[
										[NT.Identifier, 'a'],
										[NT.NumberLiteral, '3'],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		describe('with parens', () => {
			it('and one condition', () => {
				testParse('if (foo() == 2) {}', [
					[
						NT.IfStatement,
						[
							[
								NT.Parenthesized,
								[
									[
										NT.BinaryExpression,
										'==',
										[
											[
												NT.CallExpression,
												[
													[NT.Identifier, 'foo'],
													[NT.ArgumentsList, []],
												],
											],
											[NT.NumberLiteral, '2'],
										],
									],
								],
							],
							[NT.BlockStatement, []],
						],
					],
				]);
			});

			it('and two conditions', () => {
				testParse('if (foo() == 2 && a < 3) {}', [
					[
						NT.IfStatement,
						[
							[
								NT.Parenthesized,
								[
									[
										NT.BinaryExpression,
										'&&',
										[
											[
												NT.BinaryExpression,
												'==',
												[
													[
														NT.CallExpression,
														[
															[NT.Identifier, 'foo'],
															[NT.ArgumentsList, []],
														],
													],
													[NT.NumberLiteral, '2'],
												],
											],
											[
												NT.BinaryExpression,
												'<',
												[
													[NT.Identifier, 'a'],
													[NT.NumberLiteral, '3'],
												],
											],
										],
									],
								],
							],
							[NT.BlockStatement, []],
						],
					],
				]);
			});
		});

		it('with just else', () => {
			testParse('if true {} else {}', [
				[
					NT.IfStatement,
					[
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('with else if', () => {
			testParse('if true {} else if false {}', [
				[
					NT.IfStatement,
					[
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
						[
							NT.IfStatement,
							[
								[NT.BoolLiteral, 'false'],
								[NT.BlockStatement, []],
							],
						],
					],
				],
			]);
		});

		it('with a subsequent if and should be two separate IfStatements', () => {
			testParse('if true {} if false {}', [
				[
					NT.IfStatement,
					[
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
					],
				],
				[
					NT.IfStatement,
					[
						[NT.BoolLiteral, 'false'],
						[NT.BlockStatement, []],
					],
				],
			]);
		});
	});

	describe('InterfaceDeclaration', (): void => {
		it('empty interface', (): void => {
			testParse('interface Foo {}', [
				[
					NT.InterfaceDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					],
				],
			]);

			testParse('interface Foo <| T, U |> {}', [
				[
					NT.InterfaceDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.TypeParametersList,
							[
								[NT.TypeParameter, [[NT.Identifier, 'T']]],
								[NT.CommaSeparator],
								[NT.TypeParameter, [[NT.Identifier, 'U']]],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('interface extends other', (): void => {
			testParse('interface Foo {} interface Bar extends Foo {}', [
				[
					NT.InterfaceDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					],
				],
				[
					NT.InterfaceDeclaration,
					[
						[NT.Identifier, 'Bar'],
						[NT.ExtensionsList, [[NT.Extension, [[NT.Identifier, 'Foo']]]]],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('interface extends multiple', (): void => {
			testParse('interface Foo extends Bar, Baz {}', [
				[
					NT.InterfaceDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.ExtensionsList,
							[
								[NT.Extension, [[NT.Identifier, 'Bar']]],
								[NT.CommaSeparator],
								[NT.Extension, [[NT.Identifier, 'Baz']]],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});

		it('interface extends multiple with generics', (): void => {
			testParse('interface Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}', [
				[
					NT.InterfaceDeclaration,
					[
						[NT.Identifier, 'Foo'],
						[
							NT.TypeParametersList,
							[
								[NT.TypeParameter, [[NT.Identifier, 'T']]],
								[NT.CommaSeparator],
								[NT.TypeParameter, [[NT.Identifier, 'U']]],
							],
						],
						[
							NT.ExtensionsList,
							[
								[
									NT.Extension,
									[
										[NT.Identifier, 'Bar'],
										[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
									],
								],
								[NT.CommaSeparator],
								[
									NT.Extension,
									[
										[NT.Identifier, 'Baz'],
										[NT.TypeArgumentsList, [[NT.Identifier, 'U']]],
									],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});
	});

	describe('JoeDoc', () => {
		// for Class, Function, Interface, or Variable

		describe('for a class', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParse(
					`/**
					 * foo
					 */
					class Foo {}`,
					[
						[
							NT.ClassDeclaration,
							[
								[
									NT.JoeDoc,
									`/**
					 * foo
					 */`,
								],
								[NT.Identifier, 'Foo'],
								[NT.BlockStatement, []],
							],
						],
					],
				);
			});

			it('even when there are modifiers', () => {
				testParse(
					`/**
					 * foo
					 */
					abstract class Foo {}`,
					[
						[
							NT.ClassDeclaration,
							[
								[
									NT.JoeDoc,
									`/**
					 * foo
					 */`,
								],
								[NT.ModifiersList, [[NT.Modifier, 'abstract']]],
								[NT.Identifier, 'Foo'],
								[NT.BlockStatement, []],
							],
						],
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParse(
					`/* foo */
					class Foo {}`,
					[
						[NT.Comment, '/* foo */'],
						[
							NT.ClassDeclaration,
							[
								[NT.Identifier, 'Foo'],
								[NT.BlockStatement, []],
							],
						],
					],
				);
			});
		});

		describe('for a function', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParse(
					`/** foo */
					f foo {}`,
					[
						[
							NT.FunctionDeclaration,
							[
								[NT.JoeDoc, '/** foo */'],
								[NT.Identifier, 'foo'],
								[NT.BlockStatement, []],
							],
						],
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParse(
					`/* foo */
					f foo {}`,
					[
						[NT.Comment, '/* foo */'],
						[
							NT.FunctionDeclaration,
							[
								[NT.Identifier, 'foo'],
								[NT.BlockStatement, []],
							],
						],
					],
				);
			});
		});

		describe('for an interface', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParse(
					`/** foo */
					interface Foo {}`,
					[
						[
							NT.InterfaceDeclaration,
							[
								[NT.JoeDoc, '/** foo */'],
								[NT.Identifier, 'Foo'],
								[NT.BlockStatement, []],
							],
						],
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParse(
					`/* foo */
					interface Foo {}`,
					[
						[NT.Comment, '/* foo */'],
						[
							NT.InterfaceDeclaration,
							[
								[NT.Identifier, 'Foo'],
								[NT.BlockStatement, []],
							],
						],
					],
				);
			});
		});

		describe('for a variable', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParse(
					`/** foo */
					const foo = 1;`,
					[
						[
							NT.VariableDeclaration,
							'const',
							[
								[NT.JoeDoc, '/** foo */'],
								[NT.AssigneesList, [[NT.Identifier, 'foo']]],
								[NT.AssignmentOperator],
								[NT.AssignablesList, [[NT.NumberLiteral, '1']]],
							],
						],
						[NT.SemicolonSeparator],
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParse(
					`/* foo */
					const foo = 1;`,
					[
						[NT.Comment, '/* foo */'],
						[
							NT.VariableDeclaration,
							'const',
							[
								[NT.AssigneesList, [[NT.Identifier, 'foo']]],
								[NT.AssignmentOperator],
								[NT.AssignablesList, [[NT.NumberLiteral, '1']]],
							],
						],
						[NT.SemicolonSeparator],
					],
				);
			});
		});
	});

	describe('LoopStatement', (): void => {
		it('simple loop', () => {
			testParse('loop {}', [[NT.LoopStatement, [[NT.BlockStatement, []]]]]);
		});

		it('with done', () => {
			testParse('loop {\ndone;\n}', [
				[NT.LoopStatement, [[NT.BlockStatement, [[NT.DoneStatement], [NT.SemicolonSeparator]]]]],
			]);
		});

		it('with next', () => {
			testParse('loop {\nnext;\n}', [
				[NT.LoopStatement, [[NT.BlockStatement, [[NT.NextStatement], [NT.SemicolonSeparator]]]]],
			]);
		});
	});

	describe('MemberExpression', () => {
		it('works with several nested layers', () => {
			testParse('a.b.c.d', [
				[
					NT.MemberExpression,
					[
						[
							NT.MemberExpression,
							[
								[
									NT.MemberExpression,
									[
										[NT.Identifier, 'a'],
										[NT.Identifier, 'b'],
									],
								],
								[NT.Identifier, 'c'],
							],
						],
						[NT.Identifier, 'd'],
					],
				],
			]);
		});

		it('works with this', () => {
			testParse('this.foo', [[NT.MemberExpression, [[NT.ThisKeyword], [NT.Identifier, 'foo']]]]);
		});

		describe('works with a TypeInstantiationExpression', () => {
			it('on the property', () => {
				testParse('foo.bar<|T|>', [
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'foo'],
							[
								NT.TypeInstantiationExpression,
								[
									[NT.Identifier, 'bar'],
									[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
								],
							],
						],
					],
				]);
			});

			it('on the object and uses dot notation', () => {
				testParse('foo<|T|>.bar', [
					[
						NT.MemberExpression,
						[
							[
								NT.TypeInstantiationExpression,
								[
									[NT.Identifier, 'foo'],
									[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
								],
							],
							[NT.Identifier, 'bar'],
						],
					],
				]);
			});

			it('on the object and uses bracket notation', () => {
				testParse('foo<|T|>["bar"]', [
					[
						NT.MemberExpression,
						[
							[
								NT.TypeInstantiationExpression,
								[
									[NT.Identifier, 'foo'],
									[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
								],
							],
							[NT.StringLiteral, 'bar'],
						],
					],
				]);
			});

			it('with this', () => {
				testParse('this.bar<|T|>', [
					[
						NT.MemberExpression,
						[
							[NT.ThisKeyword],
							[
								NT.TypeInstantiationExpression,
								[
									[NT.Identifier, 'bar'],
									[NT.TypeArgumentsList, [[NT.Identifier, 'T']]],
								],
							],
						],
					],
				]);
			});
		});

		it('should parse a string in brackets as a MemberExpression property', () => {
			testParse('foo["bar"]', [
				[
					NT.MemberExpression,
					[
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'bar'],
					],
				],
			]);
		});

		it('should parse a number in brackets as a MemberExpression property', () => {
			testParse('foo[0]', [
				[
					NT.MemberExpression,
					[
						[NT.Identifier, 'foo'],
						[NT.NumberLiteral, '0'],
					],
				],
			]);
		});

		it('should parse an identifier in brackets as a MemberExpression property', () => {
			testParse('foo[bar]', [
				[
					NT.MemberExpression,
					[
						[NT.Identifier, 'foo'],
						[NT.Identifier, 'bar'],
					],
				],
			]);
		});

		it('should parse a MemberExpression in brackets as a MemberExpression property', () => {
			testParse('foo[bar.baz]', [
				[
					NT.MemberExpression,
					[
						[NT.Identifier, 'foo'],
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'bar'],
								[NT.Identifier, 'baz'],
							],
						],
					],
				],
			]);
		});

		it('should parse a CallExpression in brackets as a MemberExpression property', () => {
			testParse('foo[bar()]', [
				[
					NT.MemberExpression,
					[
						[NT.Identifier, 'foo'],
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'bar'],
								[NT.ArgumentsList, []],
							],
						],
					],
				],
			]);
		});

		it.each(unaryMathOperatorScenarios)(
			'should parse a UnaryExpression with a ${operator} operator in brackets as a MemberExpression property',
			({ operator, before, expression }) => {
				testParse(`foo[${expression}]`, [
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'foo'],
							[NT.UnaryExpression, operator, { before }, [[NT.Identifier, 'bar']]],
						],
					],
				]);
			},
		);

		it.each(binaryMathOperatorsThatArePartOfAMemberExpression)(
			'should parse a BinaryExpression with a ${operator} operator in brackets as a MemberExpression property',
			(operator) => {
				testParse(`foo[index ${operator} 1]`, [
					[
						NT.MemberExpression,
						[
							[NT.Identifier, 'foo'],
							[
								NT.BinaryExpression,
								operator,
								[
									[NT.Identifier, 'index'],
									[NT.NumberLiteral, '1'],
								],
							],
						],
					],
				]);
			},
		);

		it('should parse a TernaryExpression in brackets as a MemberExpression property', () => {
			testParse('foo[bar ? 0 : 1]', [
				[
					NT.MemberExpression,
					[
						[NT.Identifier, 'foo'],
						[
							NT.TernaryExpression,
							[
								[NT.TernaryCondition, [[NT.Identifier, 'bar']]],
								[NT.TernaryConsequent, [[NT.NumberLiteral, '0']]],
								[NT.TernaryAlternate, [[NT.NumberLiteral, '1']]],
							],
						],
					],
				],
			]);
		});

		describe('on literals', () => {
			it('should work on an ArrayExpression', () => {
				testParse('["A", "B"][0]', [
					[
						NT.MemberExpression,
						[
							[
								NT.ArrayExpression,
								[[NT.StringLiteral, 'A'], [NT.CommaSeparator], [NT.StringLiteral, 'B']],
							],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});

			it('should work on a StringLiteral', () => {
				testParse('"A"[0]', [
					[
						NT.MemberExpression,
						[
							[NT.StringLiteral, 'A'],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});

			it('should work on an TupleExpression', () => {
				testParse('<4, "B">[0]', [
					[
						NT.MemberExpression,
						[
							[
								NT.TupleExpression,
								[[NT.NumberLiteral, '4'], [NT.CommaSeparator], [NT.StringLiteral, 'B']],
							],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});

			it('should work directly on a CallExpression', () => {
				testParse('foo()[0]', [
					[
						NT.MemberExpression,
						[
							[
								NT.CallExpression,
								[
									[NT.Identifier, 'foo'],
									[NT.ArgumentsList, []],
								],
							],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});
		});

		describe('should work on parenthesized objects', () => {
			it('should work on an ArrayExpression', () => {
				testParse('(["A", "B"])[0]', [
					[
						NT.MemberExpression,
						[
							[
								NT.Parenthesized,
								[
									[
										NT.ArrayExpression,
										[[NT.StringLiteral, 'A'], [NT.CommaSeparator], [NT.StringLiteral, 'B']],
									],
								],
							],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});

			it('should work on a StringLiteral', () => {
				testParse('(("A"))[0]', [
					[
						NT.MemberExpression,
						[
							[NT.Parenthesized, [[NT.Parenthesized, [[NT.StringLiteral, 'A']]]]],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});

			it('should work on an TupleExpression', () => {
				testParse('(((((<4, "B">)))))[0]', [
					[
						NT.MemberExpression,
						[
							[
								NT.Parenthesized,
								[
									[
										NT.Parenthesized,
										[
											[
												NT.Parenthesized,
												[
													[
														NT.Parenthesized,
														[
															[
																NT.Parenthesized,
																[
																	[
																		NT.TupleExpression,
																		[
																			[NT.NumberLiteral, '4'],
																			[NT.CommaSeparator],
																			[NT.StringLiteral, 'B'],
																		],
																	],
																],
															],
														],
													],
												],
											],
										],
									],
								],
							],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});

			it('should work directly on a CallExpression', () => {
				testParse('(foo())[0]', [
					[
						NT.MemberExpression,
						[
							[
								NT.Parenthesized,
								[
									[
										NT.CallExpression,
										[
											[NT.Identifier, 'foo'],
											[NT.ArgumentsList, []],
										],
									],
								],
							],
							[NT.NumberLiteral, '0'],
						],
					],
				]);
			});
		});
	});

	describe('MemberListExpression', () => {
		it('should parse string properties correctly', () => {
			testParse(`this.foo['a', 'b'];`, [
				[
					NT.MemberListExpression,
					[
						[NT.MemberExpression, [[NT.ThisKeyword], [NT.Identifier, 'foo']]],
						[NT.MemberList, [[NT.StringLiteral, 'a'], [NT.CommaSeparator], [NT.StringLiteral, 'b']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('should parse number indexes correctly', () => {
			testParse('this.foo[1, 3];', [
				[
					NT.MemberListExpression,
					[
						[NT.MemberExpression, [[NT.ThisKeyword], [NT.Identifier, 'foo']]],
						[NT.MemberList, [[NT.NumberLiteral, '1'], [NT.CommaSeparator], [NT.NumberLiteral, '3']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('should parse identifier indexes correctly', () => {
			testParse('foo[a, b];', [
				[
					NT.MemberListExpression,
					[
						[NT.Identifier, 'foo'],
						[NT.MemberList, [[NT.Identifier, 'a'], [NT.CommaSeparator], [NT.Identifier, 'b']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		describe('works with a TypeInstantiationExpression', () => {
			it('on the object', () => {
				testParse('foo<|bar, baz|>["a", "b"];', [
					[
						NT.MemberListExpression,
						[
							[
								NT.TypeInstantiationExpression,
								[
									[NT.Identifier, 'foo'],
									[
										NT.TypeArgumentsList,
										[[NT.Identifier, 'bar'], [NT.CommaSeparator], [NT.Identifier, 'baz']],
									],
								],
							],
							[NT.MemberList, [[NT.StringLiteral, 'a'], [NT.CommaSeparator], [NT.StringLiteral, 'b']]],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});

		it('should parse a RangeExpression in brackets as part of a MemberListExpression', () => {
			testParse('foo[1 .. 3]', [
				[
					NT.MemberListExpression,
					[
						[NT.Identifier, 'foo'],
						[
							NT.MemberList,
							[
								[
									NT.RangeExpression,
									[
										[NT.NumberLiteral, '1'],
										[NT.NumberLiteral, '3'],
									],
								],
							],
						],
					],
				],
			]);
		});

		it('should parse multiple RangeExpressions in brackets as part of a MemberListExpression', () => {
			testParse('foo[1 .. 3, 5 .. 7]', [
				[
					NT.MemberListExpression,
					[
						[NT.Identifier, 'foo'],
						[
							NT.MemberList,
							[
								[
									NT.RangeExpression,
									[
										[NT.NumberLiteral, '1'],
										[NT.NumberLiteral, '3'],
									],
								],
								[NT.CommaSeparator],
								[
									NT.RangeExpression,
									[
										[NT.NumberLiteral, '5'],
										[NT.NumberLiteral, '7'],
									],
								],
							],
						],
					],
				],
			]);
		});

		it('should parse a UnaryExpression with a logical operator in brackets as part of a MemberListExpression', () => {
			testParse('foo[!bar]', [
				[
					NT.MemberListExpression,
					[
						[NT.Identifier, 'foo'],
						[NT.MemberList, [[NT.UnaryExpression, '!', { before: true }, [[NT.Identifier, 'bar']]]]],
					],
				],
			]);
		});

		it.each([unaryMathOperatorScenarios])(
			'should parse multiple UnaryExpressions with any operators in brackets as part of a MemberListExpression',
			({ operator, before, expression }) => {
				testParse(`foo[${expression}, ${expression}]`, [
					[
						NT.MemberListExpression,
						[
							[NT.Identifier, 'foo'],
							[
								NT.MemberList,
								[
									[NT.UnaryExpression, operator, { before }, [[NT.Identifier, 'bar']]],
									[NT.CommaSeparator],
									[NT.UnaryExpression, operator, { before }, [[NT.Identifier, 'bar']]],
								],
							],
						],
					],
				]);
			},
		);

		it.each(binaryMathOperatorsThatArePartOfAMemberListExpression)(
			'should parse a BinaryExpression with a ${operator} operator in brackets as part of a MemberListExpression',
			(operator) => {
				testParse(`foo[index ${operator} 1]`, [
					[
						NT.MemberListExpression,
						[
							[NT.Identifier, 'foo'],
							[
								NT.MemberList,
								[
									[
										NT.BinaryExpression,
										operator,
										[
											[NT.Identifier, 'index'],
											[NT.NumberLiteral, '1'],
										],
									],
								],
							],
						],
					],
				]);
			},
		);

		it.each(binaryMathOperatorsThatArePartOfAMemberListExpression)(
			'should parse multiple BinaryExpressions with ${operator} operators in brackets as part of a MemberListExpression',
			(operator) => {
				testParse(`foo[index ${operator} 1, index ${operator} 2]`, [
					[
						NT.MemberListExpression,
						[
							[NT.Identifier, 'foo'],
							[
								NT.MemberList,
								[
									[
										NT.BinaryExpression,
										operator,
										[
											[NT.Identifier, 'index'],
											[NT.NumberLiteral, '1'],
										],
									],
									[NT.CommaSeparator],
									[
										NT.BinaryExpression,
										operator,
										[
											[NT.Identifier, 'index'],
											[NT.NumberLiteral, '2'],
										],
									],
								],
							],
						],
					],
				]);
			},
		);
	});

	describe('Operators', (): void => {
		describe('UnaryExpression', (): void => {
			describe('negation', () => {
				it('with Identifier', (): void => {
					testParse('!foo;', [
						[NT.UnaryExpression, '!', { before: true }, [[NT.Identifier, 'foo']]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with Identifier in parens', (): void => {
					testParse('(!foo);', [
						[NT.Parenthesized, [[NT.UnaryExpression, '!', { before: true }, [[NT.Identifier, 'foo']]]]],
						[NT.SemicolonSeparator],
					]);
				});

				it('with CallExpression', (): void => {
					testParse('!bar();', [
						[
							NT.UnaryExpression,
							'!',
							{ before: true },
							[
								[
									NT.CallExpression,
									[
										[NT.Identifier, 'bar'],
										[NT.ArgumentsList, []],
									],
								],
							],
						],
						[NT.SemicolonSeparator],
					]);
				});

				it('with nested CallExpression', (): void => {
					testParse('!foo.bar();', [
						[
							NT.UnaryExpression,
							'!',
							{ before: true },
							[
								[
									NT.CallExpression,
									[
										[
											NT.MemberExpression,
											[
												[NT.Identifier, 'foo'],
												[NT.Identifier, 'bar'],
											],
										],
										[NT.ArgumentsList, []],
									],
								],
							],
						],
						[NT.SemicolonSeparator],
					]);
				});
			});

			describe('negative number', () => {
				it('without parens', (): void => {
					testParse('-1', [[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '1']]]]);
				});

				it('with parens', (): void => {
					testParse('(-1)', [
						[NT.Parenthesized, [[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '1']]]]],
					]);
				});
			});

			describe('increment and decrement', () => {
				it('pre-decrement', (): void => {
					testParse('--foo', [[NT.UnaryExpression, '--', { before: true }, [[NT.Identifier, 'foo']]]]);

					testParse('foo[--i]', [
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '--', { before: true }, [[NT.Identifier, 'i']]],
							],
						],
					]);
				});

				it('post-decrement', (): void => {
					testParse('foo--', [[NT.UnaryExpression, '--', { before: false }, [[NT.Identifier, 'foo']]]]);
				});

				it('post-decrement in array index', (): void => {
					testParse('foo[i--]', [
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '--', { before: false }, [[NT.Identifier, 'i']]],
							],
						],
					]);
				});

				it('pre-increment', (): void => {
					testParse('++foo', [[NT.UnaryExpression, '++', { before: true }, [[NT.Identifier, 'foo']]]]);

					testParse('foo[++i]', [
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '++', { before: true }, [[NT.Identifier, 'i']]],
							],
						],
					]);
				});

				it('post-increment', (): void => {
					testParse('foo++', [[NT.UnaryExpression, '++', { before: false }, [[NT.Identifier, 'foo']]]]);

					testParse('foo[i++]', [
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '++', { before: false }, [[NT.Identifier, 'i']]],
							],
						],
					]);
				});

				describe('invalid syntax', (): void => {
					it('pre-decrement invalid syntax', (): void => {
						expect(parse('foo---')).toMatchParseTree([
							[
								NT.BinaryExpression,
								'-',
								[[NT.UnaryExpression, '--', { before: false }, [[NT.Identifier, 'foo']]]],
							],
						]);
					});

					it('pre-increment invalid syntax', (): void => {
						expect(parse('foo+++')).toMatchParseTree([
							[
								NT.BinaryExpression,
								'+',
								[[NT.UnaryExpression, '++', { before: false }, [[NT.Identifier, 'foo']]]],
							],
						]);
					});
				});
			});
		});

		describe(NT.BinaryExpression, (): void => {
			describe('with bools', (): void => {
				it('double pipe', (): void => {
					testParse('a || true', [
						[
							NT.BinaryExpression,
							'||',
							[
								[NT.Identifier, 'a'],
								[NT.BoolLiteral, 'true'],
							],
						],
					]);
				});

				it('double ampersand', (): void => {
					testParse('a && true', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[NT.Identifier, 'a'],
								[NT.BoolLiteral, 'true'],
							],
						],
					]);
				});
			});

			describe('with numbers', (): void => {
				describe('compare', (): void => {
					binaryExpressionScenariosCheckingOperator('<=>');
				});

				describe('equals', (): void => {
					binaryExpressionScenariosCheckingOperator('==');
				});

				describe('not equals', (): void => {
					binaryExpressionScenariosCheckingOperator('!=');
				});

				describe('less than', (): void => {
					binaryExpressionScenariosCheckingOperator('<');
				});

				describe('less than or equals', (): void => {
					binaryExpressionScenariosCheckingOperator('<=');
				});

				describe('more than', (): void => {
					binaryExpressionScenariosCheckingOperator('>');
				});

				describe('more than or equals', (): void => {
					binaryExpressionScenariosCheckingOperator('>=');
				});

				describe('asterisk_equals', (): void => {
					binaryExpressionScenariosCheckingOperator('*=');
				});

				describe('forward_slash_equals', (): void => {
					binaryExpressionScenariosCheckingOperator('/=');
				});

				describe('minus_equals', (): void => {
					binaryExpressionScenariosCheckingOperator('-=');
				});

				describe('mod_equals', (): void => {
					binaryExpressionScenariosCheckingOperator('%=');
				});

				describe('plus_equals', (): void => {
					binaryExpressionScenariosCheckingOperator('+=');
				});
			});

			describe('compound with operator precedence', (): void => {
				it('makes && higher precedence than equality checks', () => {
					testParse('foo >= 2 && foo <= 5', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[
									NT.BinaryExpression,
									'>=',
									[
										[NT.Identifier, 'foo'],
										[NT.NumberLiteral, '2'],
									],
								],
								[
									NT.BinaryExpression,
									'<=',
									[
										[NT.Identifier, 'foo'],
										[NT.NumberLiteral, '5'],
									],
								],
							],
						],
					]);
				});

				it('makes || higher precedence than equality checks', () => {
					testParse('foo > 2 || foo < 5', [
						[
							NT.BinaryExpression,
							'||',
							[
								[
									NT.BinaryExpression,
									'>',
									[
										[NT.Identifier, 'foo'],
										[NT.NumberLiteral, '2'],
									],
								],
								[
									NT.BinaryExpression,
									'<',
									[
										[NT.Identifier, 'foo'],
										[NT.NumberLiteral, '5'],
									],
								],
							],
						],
					]);
				});
			});

			describe('with parens involved', () => {
				it('around one side', () => {
					testParse('a && (true)', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[NT.Identifier, 'a'],
								[NT.Parenthesized, [[NT.BoolLiteral, 'true']]],
							],
						],
					]);

					testParse('(a) && true', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[NT.Parenthesized, [[NT.Identifier, 'a']]],
								[NT.BoolLiteral, 'true'],
							],
						],
					]);
				});

				it('with a function call', () => {
					testParse('a && foo(true)', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[NT.Identifier, 'a'],
								[
									NT.CallExpression,
									[
										[NT.Identifier, 'foo'],
										[NT.ArgumentsList, [[NT.BoolLiteral, 'true']]],
									],
								],
							],
						],
					]);

					testParse('a(true) && foo', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[
									NT.CallExpression,
									[
										[NT.Identifier, 'a'],
										[NT.ArgumentsList, [[NT.BoolLiteral, 'true']]],
									],
								],
								[NT.Identifier, 'foo'],
							],
						],
					]);
				});

				it('with a function call in parens', () => {
					testParse('a && (foo(true))', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[NT.Identifier, 'a'],
								[
									NT.Parenthesized,
									[
										[
											NT.CallExpression,
											[
												[NT.Identifier, 'foo'],
												[NT.ArgumentsList, [[NT.BoolLiteral, 'true']]],
											],
										],
									],
								],
							],
						],
					]);

					testParse('(a(true)) && foo', [
						[
							NT.BinaryExpression,
							'&&',
							[
								[
									NT.Parenthesized,
									[
										[
											NT.CallExpression,
											[
												[NT.Identifier, 'a'],
												[NT.ArgumentsList, [[NT.BoolLiteral, 'true']]],
											],
										],
									],
								],
								[NT.Identifier, 'foo'],
							],
						],
					]);
				});
			});
		});
	});

	describe('Parens', (): void => {
		describe('mathematical expressions', (): void => {
			it('a simple mathematical formula', (): void => {
				testParse('1 + (2 * (-3/-(2.3-4)%9))', [
					[
						NT.BinaryExpression,
						'+',
						[
							[NT.NumberLiteral, '1'],
							[
								NT.Parenthesized,
								[
									[
										NT.BinaryExpression,
										'*',
										[
											[NT.NumberLiteral, '2'],
											[
												NT.Parenthesized,
												[
													[
														NT.BinaryExpression,
														'/',
														[
															[
																NT.UnaryExpression,
																'-',
																{ before: true },
																[[NT.NumberLiteral, '3']],
															],
															[
																NT.BinaryExpression,
																'%',
																[
																	[
																		NT.UnaryExpression,
																		'-',
																		{ before: true },
																		[
																			[
																				NT.Parenthesized,
																				[
																					[
																						NT.BinaryExpression,
																						'-',
																						[
																							[NT.NumberLiteral, '2.3'],
																							[NT.NumberLiteral, '4'],
																						],
																					],
																				],
																			],
																		],
																	],
																	[NT.NumberLiteral, '9'],
																],
															],
														],
													],
												],
											],
										],
									],
								],
							],
						],
					],
				]);
			});

			it('supports mathematical expressions with variables', (): void => {
				testParse('const foo = 1; let bar = -foo;', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[NT.AssignablesList, [[NT.NumberLiteral, '1']]],
						],
					],
					[NT.SemicolonSeparator],
					[
						NT.VariableDeclaration,
						'let',
						[
							[NT.AssigneesList, [[NT.Identifier, 'bar']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[[NT.UnaryExpression, '-', { before: true }, [[NT.Identifier, 'foo']]]],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});
	});

	describe('PostfixIfStatement', (): void => {
		it('after a CallExpression', () => {
			testParse('do(1) if foo == 2;', [
				[
					NT.PostfixIfStatement,
					[
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'do'],
								[NT.ArgumentsList, [[NT.NumberLiteral, '1']]],
							],
						],
						[
							NT.BinaryExpression,
							'==',
							[
								[NT.Identifier, 'foo'],
								[NT.NumberLiteral, '2'],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		describe('in an array', () => {
			it('with bool conditional', () => {
				testParse('[foo if true, bar];', [
					[
						NT.ArrayExpression,
						[
							[
								NT.PostfixIfStatement,
								[
									[NT.Identifier, 'foo'],
									[NT.BoolLiteral, 'true'],
								],
							],
							[NT.CommaSeparator],
							[NT.Identifier, 'bar'],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('with identifier conditional', () => {
				testParse('[9, 10 if isDone?, 11];', [
					[
						NT.ArrayExpression,
						[
							[NT.NumberLiteral, '9'],
							[NT.CommaSeparator],
							[
								NT.PostfixIfStatement,
								[
									[NT.NumberLiteral, '10'],
									[NT.Identifier, 'isDone?'],
								],
							],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '11'],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('with MemberExpression conditional and comment', () => {
				testParse(
					`[
						9 if this.isDone?, // comment
						10,
						11,
					];`,
					[
						[
							NT.ArrayExpression,
							[
								[
									NT.PostfixIfStatement,
									[
										[NT.NumberLiteral, '9'],
										[NT.MemberExpression, [[NT.ThisKeyword], [NT.Identifier, 'isDone?']]],
									],
								],
								[NT.CommaSeparator],
								[NT.Comment, '// comment'], // will be removed in the AST
								[NT.NumberLiteral, '10'],
								[NT.CommaSeparator],
								[NT.NumberLiteral, '11'],
								[NT.CommaSeparator],
							],
						],
						[NT.SemicolonSeparator],
					],
				);
			});

			it('with CallExpression conditional', () => {
				testParse('[9, 10 if this.isDone?([true if true]), 11];', [
					[
						NT.ArrayExpression,
						[
							[NT.NumberLiteral, '9'],
							[NT.CommaSeparator],
							[
								NT.PostfixIfStatement,
								[
									[NT.NumberLiteral, '10'],
									[
										NT.CallExpression,
										[
											[NT.MemberExpression, [[NT.ThisKeyword], [NT.Identifier, 'isDone?']]],
											[
												NT.ArgumentsList,
												[
													[
														NT.ArrayExpression,
														[
															[
																NT.PostfixIfStatement,
																[
																	[NT.BoolLiteral, 'true'],
																	[NT.BoolLiteral, 'true'],
																],
															],
														],
													],
												],
											],
										],
									],
								],
							],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '11'],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('with BinaryExpression conditional using two NumberLiterals', () => {
				testParse('[\'foo\', "bar" if 1 < 2];', [
					[
						NT.ArrayExpression,
						[
							[NT.StringLiteral, 'foo'],
							[NT.CommaSeparator],
							[
								NT.PostfixIfStatement,
								[
									[NT.StringLiteral, 'bar'],
									[
										NT.BinaryExpression,
										'<',
										[
											[NT.NumberLiteral, '1'],
											[NT.NumberLiteral, '2'],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
				testParse('[true, true, false, false if foo == 2, true, false, true];', [
					[
						NT.ArrayExpression,
						[
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'false'],
							[NT.CommaSeparator],
							[
								NT.PostfixIfStatement,
								[
									[NT.BoolLiteral, 'false'],
									[
										NT.BinaryExpression,
										'==',
										[
											[NT.Identifier, 'foo'],
											[NT.NumberLiteral, '2'],
										],
									],
								],
							],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'false'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});
	});

	describe('Print', () => {
		it('is closed with a semicolon', () => {
			testParse('print foo[5];print 5;', [
				[
					NT.PrintStatement,
					[
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.NumberLiteral, '5'],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
				[NT.PrintStatement, [[NT.NumberLiteral, '5']]],
				[NT.SemicolonSeparator],
			]);
		});

		it('should work with a CallExpression', () => {
			testParse('print myFoo.foo();', [
				[
					NT.PrintStatement,
					[
						[
							NT.CallExpression,
							[
								[
									NT.MemberExpression,
									[
										[NT.Identifier, 'myFoo'],
										[NT.Identifier, 'foo'],
									],
								],
								[NT.ArgumentsList, []],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('should work with a comma-delimited list', () => {
			testParse('print 1, "a", [true], <"high", 5>;', [
				[
					NT.PrintStatement,
					[
						[NT.NumberLiteral, '1'],
						[NT.CommaSeparator],
						[NT.StringLiteral, 'a'],
						[NT.CommaSeparator],
						[NT.ArrayExpression, [[NT.BoolLiteral, 'true']]],
						[NT.CommaSeparator],
						[
							NT.TupleExpression,
							[[NT.StringLiteral, 'high'], [NT.CommaSeparator], [NT.NumberLiteral, '5']],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});
	});

	describe('RangeExpression', (): void => {
		// 2 numbers
		it('.. with 2 number literals', (): void => {
			testParse(
				'1..2;', // this one should not have spaces since even though we recommend spaces, they are optional
				[
					[
						NT.RangeExpression,
						[
							[NT.NumberLiteral, '1'],
							[NT.NumberLiteral, '2'],
						],
					],
					[NT.SemicolonSeparator],
				],
			);

			testParse('-1 .. 2;', [
				[
					NT.RangeExpression,
					[
						[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '1']]],
						[NT.NumberLiteral, '2'],
					],
				],
				[NT.SemicolonSeparator],
			]);

			testParse('1 .. -2;', [
				[
					NT.RangeExpression,
					[
						[NT.NumberLiteral, '1'],
						[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2']]],
					],
				],
				[NT.SemicolonSeparator],
			]);

			testParse('-1 .. -2;', [
				[
					NT.RangeExpression,
					[
						[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '1']]],
						[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		// identifier and number
		it('.. with identifier and number literal', (): void => {
			testParse('foo .. 2;', [
				[
					NT.RangeExpression,
					[
						[NT.Identifier, 'foo'],
						[NT.NumberLiteral, '2'],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('.. with number literal and identifier', (): void => {
			testParse('1 .. foo;', [
				[
					NT.RangeExpression,
					[
						[NT.NumberLiteral, '1'],
						[NT.Identifier, 'foo'],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		// element access and number
		it('.. with element access and number literal', (): void => {
			testParse("foo['a'] .. 2;", [
				[
					NT.RangeExpression,
					[
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.StringLiteral, 'a'],
							],
						],
						[NT.NumberLiteral, '2'],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('.. with number literal and element access', (): void => {
			testParse("1 .. foo['a'];'a'", [
				[
					NT.RangeExpression,
					[
						[NT.NumberLiteral, '1'],
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.StringLiteral, 'a'],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
				[NT.StringLiteral, 'a'],
			]);
		});

		// method call and number
		it('.. with method call and number literal', (): void => {
			testParse("foo('a') .. 2;", [
				[
					NT.RangeExpression,
					[
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, [[NT.StringLiteral, 'a']]],
							],
						],
						[NT.NumberLiteral, '2'],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('.. with number literal and method call', (): void => {
			testParse("1 .. foo('a');", [
				[
					NT.RangeExpression,
					[
						[NT.NumberLiteral, '1'],
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, [[NT.StringLiteral, 'a']]],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		// element access and method call
		it('.. with element access and method call', (): void => {
			testParse("foo['a'] .. bar('b');", [
				[
					NT.RangeExpression,
					[
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.StringLiteral, 'a'],
							],
						],
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'bar'],
								[NT.ArgumentsList, [[NT.StringLiteral, 'b']]],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('.. with method call and element access', (): void => {
			testParse("foo('a') .. bar['b'];", [
				[
					NT.RangeExpression,
					[
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, [[NT.StringLiteral, 'a']]],
							],
						],
						[
							NT.MemberExpression,
							[
								[NT.Identifier, 'bar'],
								[NT.StringLiteral, 'b'],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('.. with two in a row', () => {
			testParse('let count, countDown = 1 .. myArray[2], myArray[1] .. 0;', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[
							NT.AssigneesList,
							[[NT.Identifier, 'count'], [NT.CommaSeparator], [NT.Identifier, 'countDown']],
						],
						[NT.AssignmentOperator],
						[
							NT.AssignablesList,
							[
								[
									NT.RangeExpression,
									[
										[NT.NumberLiteral, '1'],
										[
											NT.MemberExpression,
											[
												[NT.Identifier, 'myArray'],
												[NT.NumberLiteral, '2'],
											],
										],
									],
								],
								[NT.CommaSeparator],
								[
									NT.RangeExpression,
									[
										[
											NT.MemberExpression,
											[
												[NT.Identifier, 'myArray'],
												[NT.NumberLiteral, '1'],
											],
										],
										[NT.NumberLiteral, '0'],
									],
								],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});
	});

	describe('Types', (): void => {
		describe('should understand primitive types', () => {
			it.each(primitiveTypes)('%s is recognized as its own primitive type', (type) => {
				testParse(type, [[NT.Type, type]]);
			});

			it.each(numberSizesAll)('%s is recognized as a number type', (size) => {
				testParse(size, [[NT.Type, size]]);
			});

			it('range is recognized as a type', () => {
				testParse('range', [[NT.Type, 'range']]);
			});

			it.each(primitiveTypes)('%s[] is recognized as a one-dimensional array of type', (type) => {
				testParse(`${type}[]`, [[NT.ArrayOf, [[NT.Type, type]]]]);
			});

			it.each(numberSizesAll)('%s[] is recognized as a one-dimensional array of type', (size) => {
				testParse(`${size}[]`, [[NT.ArrayOf, [[NT.Type, size]]]]);
			});

			it('range[] is recognized as a one-dimensional array of type', () => {
				testParse('range[]', [[NT.ArrayOf, [[NT.Type, 'range']]]]);
			});

			it.each(primitiveTypes)('%s[][] is recognized as a two-dimensional array of primitive type', (type) => {
				testParse(`${type}[][]`, [[NT.ArrayOf, [[NT.ArrayOf, [[NT.Type, type]]]]]]);
			});

			it.each(numberSizesAll)('%s[][] is recognized as a two-dimensional array of number type', (size) => {
				testParse(`${size}[][]`, [[NT.ArrayOf, [[NT.ArrayOf, [[NT.Type, size]]]]]]);
			});
		});

		describe('arrays', () => {
			it('should understand a custom array', () => {
				testParse('Foo[]', [[NT.ArrayOf, [[NT.Identifier, 'Foo']]]]);

				testParse('Foo[][]', [[NT.ArrayOf, [[NT.ArrayOf, [[NT.Identifier, 'Foo']]]]]]);
			});
		});

		describe('ranges', () => {
			it('should recognize a range type in a variable declaration', () => {
				testParse('let x: range;', [
					[
						NT.VariableDeclaration,
						'let',
						[
							[NT.AssigneesList, [[NT.Identifier, 'x']]],
							[NT.ColonSeparator],
							[NT.TypeArgumentsList, [[NT.Type, 'range']]],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('should infer a range type for a variable declaration with an initial value and also ignore parentheses', () => {
				testParse('let x = 1 .. (2);', [
					[
						NT.VariableDeclaration,
						'let',
						[
							[NT.AssigneesList, [[NT.Identifier, 'x']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.RangeExpression,
										[
											[NT.NumberLiteral, '1'],
											[NT.Parenthesized, [[NT.NumberLiteral, '2']]],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('should recognize a range type in a function parameter and return type', () => {
				testParse('f foo (x: range) -> range {}', [
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'foo'],
							[
								NT.ParametersList,
								[[NT.Parameter, [[NT.Identifier, 'x'], [NT.ColonSeparator], [NT.Type, 'range']]]],
							],
							[NT.FunctionReturns, [[NT.Type, 'range']]],
							[NT.BlockStatement, []],
						],
					],
				]);
			});
		});

		describe('TypeParameter', () => {
			it('should accept just a type', () => {
				testParse('class Foo<|T|> {}', [
					[
						NT.ClassDeclaration,
						[
							[NT.Identifier, 'Foo'],
							[NT.TypeParametersList, [[NT.TypeParameter, [[NT.Identifier, 'T']]]]],
							[NT.BlockStatement, []],
						],
					],
				]);
			});

			it('should accept a type and a constraint', () => {
				testParse('class Foo<|T: Bar|> {}', [
					[
						NT.ClassDeclaration,
						[
							[NT.Identifier, 'Foo'],
							[
								NT.TypeParametersList,
								[
									[
										NT.TypeParameter,
										[[NT.Identifier, 'T'], [NT.ColonSeparator], [NT.Identifier, 'Bar']],
									],
								],
							],
							[NT.BlockStatement, []],
						],
					],
				]);
			});

			it('should accept a type and a default type', () => {
				testParse('class Foo<|T = Bar|> {}', [
					[
						NT.ClassDeclaration,
						[
							[NT.Identifier, 'Foo'],
							[
								NT.TypeParametersList,
								[
									[
										NT.TypeParameter,
										[[NT.Identifier, 'T'], [NT.AssignmentOperator], [NT.Identifier, 'Bar']],
									],
								],
							],
							[NT.BlockStatement, []],
						],
					],
				]);
			});

			it('should accept a type, a constraint, and a default type', () => {
				testParse('class Foo<|T: Bar = Baz|> {}', [
					[
						NT.ClassDeclaration,
						[
							[NT.Identifier, 'Foo'],
							[
								NT.TypeParametersList,
								[
									[
										NT.TypeParameter,
										[
											[NT.Identifier, 'T'],
											[NT.ColonSeparator],
											[NT.Identifier, 'Bar'],
											[NT.AssignmentOperator],
											[NT.Identifier, 'Baz'],
										],
									],
								],
							],
							[NT.BlockStatement, []],
						],
					],
				]);
			});
		});
	});

	describe('UseDeclaration', (): void => {
		describe('uses', (): void => {
			it('single, default use', (): void => {
				testParse('use mainJoeFile from ./some/dir/;use another from @/lexer.joe;', [
					[NT.UseDeclaration, [[NT.Identifier, 'mainJoeFile'], [NT.FromKeyword], [NT.Path, './some/dir/']]],
					[NT.SemicolonSeparator],
					[NT.UseDeclaration, [[NT.Identifier, 'another'], [NT.FromKeyword], [NT.Path, '@/lexer.joe']]],
					[NT.SemicolonSeparator],
				]);
			});
		});
	});

	describe('VariableDeclaration', (): void => {
		it('a let assignment with a bool literal', (): void => {
			testParse('let x = false', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.BoolLiteral, 'false']]],
					],
				],
			]);

			testParse('let x?, y = false, true', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x?'], [NT.CommaSeparator], [NT.Identifier, 'y']]],
						[NT.AssignmentOperator],
						[
							NT.AssignablesList,
							[[NT.BoolLiteral, 'false'], [NT.CommaSeparator], [NT.BoolLiteral, 'true']],
						],
					],
				],
			]);
		});

		it('a double bool assignment and the second one has a question mark', (): void => {
			testParse('let x, y? = false, true', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x'], [NT.CommaSeparator], [NT.Identifier, 'y?']]],
						[NT.AssignmentOperator],
						[
							NT.AssignablesList,
							[[NT.BoolLiteral, 'false'], [NT.CommaSeparator], [NT.BoolLiteral, 'true']],
						],
					],
				],
			]);
		});

		it('a let assignment with a number literal', (): void => {
			testParse('let x = 1', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.NumberLiteral, '1']]],
					],
				],
			]);
		});

		describe('a let assignment with exponents', () => {
			it('works with negative exponents', (): void => {
				testParse('const x = -2_300.006^e-2_000; const y = 5;', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'x']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.BinaryExpression,
										'^e',
										[
											[
												NT.UnaryExpression,
												'-',
												{ before: true },
												[[NT.NumberLiteral, '2_300.006']],
											],
											[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2_000']]],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'y']]],
							[NT.AssignmentOperator],
							[NT.AssignablesList, [[NT.NumberLiteral, '5']]],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('a 64-bit main number and a negative exponent should infer the possible types as dec64 and higher only', (): void => {
				testParse('const x = 214748364723^e-2;', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'x']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.BinaryExpression,
										'^e',
										[
											[NT.NumberLiteral, '214748364723'],
											[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2']]],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});

		it('a let assignment with a string literal', (): void => {
			testParse('let x = "foo"', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.StringLiteral, 'foo']]],
					],
				],
			]);
		});

		it('a let with a specified type', (): void => {
			testParse('let x: string;', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x']]],
						[NT.ColonSeparator],
						[NT.TypeArgumentsList, [[NT.Type, 'string']]],
					],
				],
				[NT.SemicolonSeparator],
			]);

			testParse('let x?: bool;', [
				[
					NT.VariableDeclaration,
					'let',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x?']]],
						[NT.ColonSeparator],
						[NT.TypeArgumentsList, [[NT.Type, 'bool']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('a const assignment with a specified type', (): void => {
			testParse('const x: string = "foo"', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x']]],
						[NT.ColonSeparator],
						[NT.TypeArgumentsList, [[NT.Type, 'string']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.StringLiteral, 'foo']]],
					],
				],
			]);
		});

		it('regex', (): void => {
			testParse('const x = /[a-z]/;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.RegularExpression, '/[a-z]/']]],
					],
				],
				[NT.SemicolonSeparator],
			]);

			testParse('const x: regex = /[0-9]*/g;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'x']]],
						[NT.ColonSeparator],
						[NT.TypeArgumentsList, [[NT.Type, 'regex']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.RegularExpression, '/[0-9]*/g']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('path', (): void => {
			testParse('const dir = @/path/to/dir/;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'dir']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.Path, '@/path/to/dir/']]],
					],
				],
				[NT.SemicolonSeparator],
			]);

			testParse('const dir = ./myDir/;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'dir']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.Path, './myDir/']]],
					],
				],
				[NT.SemicolonSeparator],
			]);

			testParse('const file: path = @/path/to/file.joe;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'file']]],
						[NT.ColonSeparator],
						[NT.TypeArgumentsList, [[NT.Type, 'path']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.Path, '@/path/to/file.joe']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('assign to another variable', () => {
			testParse('const dir = foo;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'dir']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.Identifier, 'foo']]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		describe('custom type', (): void => {
			it('one word', (): void => {
				testParse('const myClass: MyClass = MyClass.create();', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'myClass']]],
							[NT.ColonSeparator],
							[NT.TypeArgumentsList, [[NT.Identifier, 'MyClass']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.CallExpression,
										[
											[
												NT.MemberExpression,
												[
													[NT.Identifier, 'MyClass'],
													[NT.Identifier, 'create'],
												],
											],
											[NT.ArgumentsList, []],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('member expression', (): void => {
				testParse('const myClass: MyPackage.MyClass = MyClass.create();', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'myClass']]],
							[NT.ColonSeparator],
							[
								NT.TypeArgumentsList,
								[
									[
										NT.MemberExpression,
										[
											[NT.Identifier, 'MyPackage'],
											[NT.Identifier, 'MyClass'],
										],
									],
								],
							],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.CallExpression,
										[
											[
												NT.MemberExpression,
												[
													[NT.Identifier, 'MyClass'],
													[NT.Identifier, 'create'],
												],
											],
											[NT.ArgumentsList, []],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});

		describe('tuples', () => {
			it('tuple', () => {
				testParse('const foo = <1, "pizza", 3.14>;', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.TupleExpression,
										[
											[NT.NumberLiteral, '1'],
											[NT.CommaSeparator],
											[NT.StringLiteral, 'pizza'],
											[NT.CommaSeparator],
											[NT.NumberLiteral, '3.14'],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('empty tuple', () => {
				testParse('const foo = <>;', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[NT.AssignablesList, [[NT.TupleExpression, []]]],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('nested tuples', () => {
				testParse(
					`const foo = <
						<1, 'pizza', 3.14>,
						true,
						@/some/file.joe,
						1 .. 3,
						<1, 2, 'fizz', 4, 'buzz'>
					>;`,
					[
						[
							NT.VariableDeclaration,
							'const',
							[
								[NT.AssigneesList, [[NT.Identifier, 'foo']]],
								[NT.AssignmentOperator],
								[
									NT.AssignablesList,
									[
										[
											NT.TupleExpression,
											[
												[
													NT.TupleExpression,
													[
														[NT.NumberLiteral, '1'],
														[NT.CommaSeparator],
														[NT.StringLiteral, 'pizza'],
														[NT.CommaSeparator],
														[NT.NumberLiteral, '3.14'],
													],
												],
												[NT.CommaSeparator],
												[NT.BoolLiteral, 'true'],
												[NT.CommaSeparator],
												[NT.Path, '@/some/file.joe'],
												[NT.CommaSeparator],
												[
													NT.RangeExpression,
													[
														[NT.NumberLiteral, '1'],
														[NT.NumberLiteral, '3'],
													],
												],
												[NT.CommaSeparator],
												[
													NT.TupleExpression,
													[
														[NT.NumberLiteral, '1'],
														[NT.CommaSeparator],
														[NT.NumberLiteral, '2'],
														[NT.CommaSeparator],
														[NT.StringLiteral, 'fizz'],
														[NT.CommaSeparator],
														[NT.NumberLiteral, '4'],
														[NT.CommaSeparator],
														[NT.StringLiteral, 'buzz'],
													],
												],
											],
										],
									],
								],
							],
						],
						[NT.SemicolonSeparator],
					],
				);
			});

			it('with ternary in item', () => {
				testParse(
					`<
						1,
						someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
						true
					>`,
					[
						[
							NT.TupleExpression,
							[
								[NT.NumberLiteral, '1'],
								[NT.CommaSeparator],
								[
									NT.TernaryExpression,
									[
										[NT.TernaryCondition, [[NT.Identifier, 'someCondition']]],
										[NT.TernaryConsequent, [[NT.StringLiteral, 'burnt-orange']]],
										[NT.TernaryAlternate, [[NT.StringLiteral, '']]],
									],
								],
								[NT.CommaSeparator],
								[NT.Comment, '// will always be defined, so the shape is correct'],
								[NT.BoolLiteral, 'true'],
							],
						],
					],
				);
			});

			it('tuple in object', () => {
				testParse('const foo = {tpl: <1>};', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.ObjectExpression,
										[
											[
												NT.Property,
												[
													[NT.Identifier, 'tpl'],
													[NT.TupleExpression, [[NT.NumberLiteral, '1']]],
												],
											],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});

		describe('arrays of', (): void => {
			it('bools', (): void => {
				testParse('[false, true, true, false]', [
					[
						NT.ArrayExpression,
						[
							[NT.BoolLiteral, 'false'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'false'],
						],
					],
				]);
			});

			it('numbers', () => {
				testParse('[1, -2, 3_456, 3^e-2, 3.14, 1_2_3]', [
					[
						NT.ArrayExpression,
						[
							[NT.NumberLiteral, '1'],
							[NT.CommaSeparator],
							[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2']]],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '3_456'],
							[NT.CommaSeparator],
							[
								NT.BinaryExpression,
								'^e',
								[
									[NT.NumberLiteral, '3'],
									[NT.UnaryExpression, '-', { before: true }, [[NT.NumberLiteral, '2']]],
								],
							],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '3.14'],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '1_2_3'], // weird but legal
						],
					],
				]);
			});

			it('paths', (): void => {
				testParse('[@/file.joe, @/another/file.joe]', [
					[
						NT.ArrayExpression,
						[[NT.Path, '@/file.joe'], [NT.CommaSeparator], [NT.Path, '@/another/file.joe']],
					],
				]);
			});

			it('regexes', (): void => {
				testParse('[/[a-z]/i, /[0-9]/g, /d/]', [
					[
						NT.ArrayExpression,
						[
							[NT.RegularExpression, '/[a-z]/i'],
							[NT.CommaSeparator],
							[NT.RegularExpression, '/[0-9]/g'],
							[NT.CommaSeparator],
							[NT.RegularExpression, '/d/'],
						],
					],
				]);
			});

			it('strings', (): void => {
				testParse('[\'foo\', "bar"]', [
					[NT.ArrayExpression, [[NT.StringLiteral, 'foo'], [NT.CommaSeparator], [NT.StringLiteral, 'bar']]],
				]);
			});

			it('tuples', () => {
				testParse("const foo: <string, uint64, bool>[] = [<'foo', 314, false>, <'bar', 900, true>];", [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.ColonSeparator],
							[
								NT.TypeArgumentsList,
								[
									[
										NT.ArrayOf,
										[
											[
												NT.TupleShape,
												[
													[NT.Type, 'string'],
													[NT.CommaSeparator],
													[NT.Type, 'uint64'],
													[NT.CommaSeparator],
													[NT.Type, 'bool'],
												],
											],
										],
									],
								],
							],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.ArrayExpression,
										[
											[
												NT.TupleExpression,
												[
													[NT.StringLiteral, 'foo'],
													[NT.CommaSeparator],
													[NT.NumberLiteral, '314'],
													[NT.CommaSeparator],
													[NT.BoolLiteral, 'false'],
												],
											],
											[NT.CommaSeparator],
											[
												NT.TupleExpression,
												[
													[NT.StringLiteral, 'bar'],
													[NT.CommaSeparator],
													[NT.NumberLiteral, '900'],
													[NT.CommaSeparator],
													[NT.BoolLiteral, 'true'],
												],
											],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('pojos', () => {
				testParse("const foo: {a: uint32, b: string}[] = [{a: 4, b: 'c'}];", [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.ColonSeparator],
							[
								NT.TypeArgumentsList,
								[
									[
										NT.ArrayOf,
										[
											[
												NT.ObjectShape,
												[
													[
														NT.PropertyShape,
														[
															[NT.Identifier, 'a'],
															[NT.Type, 'uint32'],
														],
													],
													[NT.CommaSeparator],
													[
														NT.PropertyShape,
														[
															[NT.Identifier, 'b'],
															[NT.Type, 'string'],
														],
													],
												],
											],
										],
									],
								],
							],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.ArrayExpression,
										[
											[
												NT.ObjectExpression,
												[
													[
														NT.Property,
														[
															[NT.Identifier, 'a'],
															[NT.NumberLiteral, '4'],
														],
													],
													[NT.CommaSeparator],
													[
														NT.Property,
														[
															[NT.Identifier, 'b'],
															[NT.StringLiteral, 'c'],
														],
													],
												],
											],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('assignments', () => {
				testParse('const int32s = [1, 2];', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'int32s']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.ArrayExpression,
										[[NT.NumberLiteral, '1'], [NT.CommaSeparator], [NT.NumberLiteral, '2']],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);

				testParse('let myArray: bool[] = [];', [
					[
						NT.VariableDeclaration,
						'let',
						[
							[NT.AssigneesList, [[NT.Identifier, 'myArray']]],
							[NT.ColonSeparator],
							[NT.TypeArgumentsList, [[NT.ArrayOf, [[NT.Type, 'bool']]]]],
							[NT.AssignmentOperator],
							[NT.AssignablesList, [[NT.ArrayExpression, []]]],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});
		});

		describe('ternary', () => {
			it('should work in a variable declaration', () => {
				testParse('const foo = bar ? 1 : 2;', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.TernaryExpression,
										[
											[NT.TernaryCondition, [[NT.Identifier, 'bar']]],
											[NT.TernaryConsequent, [[NT.NumberLiteral, '1']]],
											[NT.TernaryAlternate, [[NT.NumberLiteral, '2']]],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('should work when nested', () => {
				testParse('const foo = bar ? (baz ? 3 : 4) : 2;', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.TernaryExpression,
										[
											[NT.TernaryCondition, [[NT.Identifier, 'bar']]],
											[
												NT.TernaryConsequent,
												[
													[
														NT.Parenthesized,
														[
															[
																NT.TernaryExpression,
																[
																	[NT.TernaryCondition, [[NT.Identifier, 'baz']]],
																	[NT.TernaryConsequent, [[NT.NumberLiteral, '3']]],
																	[NT.TernaryAlternate, [[NT.NumberLiteral, '4']]],
																],
															],
														],
													],
												],
											],
											[NT.TernaryAlternate, [[NT.NumberLiteral, '2']]],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('should work in an array', () => {
				testParse('[foo ? 1 : 2, 3]', [
					[
						NT.ArrayExpression,
						[
							[
								NT.TernaryExpression,
								[
									[NT.TernaryCondition, [[NT.Identifier, 'foo']]],
									[NT.TernaryConsequent, [[NT.NumberLiteral, '1']]],
									[NT.TernaryAlternate, [[NT.NumberLiteral, '2']]],
								],
							],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '3'],
						],
					],
				]);
			});

			it('should work in a return', () => {
				testParse(
					`f foo -> bool, uint64 {
						return bar ? true : false, 3;
					}`,
					[
						[
							NT.FunctionDeclaration,
							[
								[NT.Identifier, 'foo'],
								[NT.FunctionReturns, [[NT.Type, 'bool'], [NT.CommaSeparator], [NT.Type, 'uint64']]],
								[
									NT.BlockStatement,
									[
										[
											NT.ReturnStatement,
											[
												[
													NT.TernaryExpression,
													[
														[NT.TernaryCondition, [[NT.Identifier, 'bar']]],
														[NT.TernaryConsequent, [[NT.BoolLiteral, 'true']]],
														[NT.TernaryAlternate, [[NT.BoolLiteral, 'false']]],
													],
												],
												[NT.CommaSeparator],
												[NT.NumberLiteral, '3'],
											],
										],
										[NT.SemicolonSeparator],
									],
								],
							],
						],
					],
				);
			});
		});

		describe('pojos', () => {
			it('pojo', () => {
				testParse('const foo = {a: 1, b: "pizza", c: 3.14, d: [10, 11]};', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.ObjectExpression,
										[
											[
												NT.Property,
												[
													[NT.Identifier, 'a'],
													[NT.NumberLiteral, '1'],
												],
											],
											[NT.CommaSeparator],
											[
												NT.Property,
												[
													[NT.Identifier, 'b'],
													[NT.StringLiteral, 'pizza'],
												],
											],
											[NT.CommaSeparator],
											[
												NT.Property,
												[
													[NT.Identifier, 'c'],
													[NT.NumberLiteral, '3.14'],
												],
											],
											[NT.CommaSeparator],
											[
												NT.Property,
												[
													[NT.Identifier, 'd'],
													[
														NT.ArrayExpression,
														[
															[NT.NumberLiteral, '10'],
															[NT.CommaSeparator],
															[NT.NumberLiteral, '11'],
														],
													],
												],
											],
										],
									],
								],
							],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('empty pojo', () => {
				testParse('const foo = {};', [
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'foo']]],
							[NT.AssignmentOperator],
							[NT.AssignablesList, [[NT.ObjectExpression, []]]],
						],
					],
					[NT.SemicolonSeparator],
				]);
			});

			it('nested pojos', () => {
				testParse(
					`const foo = {
						obj: {a: 1, b: 'pizza', pi: {two_digits: 3.14}},
						bol: true,
						pth: @/some/file.joe,
						rng: {rng: 1 .. 3},
						tpl: <1, 2, 'fizz', 4, 'buzz'>
					};`,
					[
						[
							NT.VariableDeclaration,
							'const',
							[
								[NT.AssigneesList, [[NT.Identifier, 'foo']]],
								[NT.AssignmentOperator],
								[
									NT.AssignablesList,
									[
										[
											NT.ObjectExpression,
											[
												[
													NT.Property,
													[
														[NT.Identifier, 'obj'],
														[
															NT.ObjectExpression,
															[
																[
																	NT.Property,
																	[
																		[NT.Identifier, 'a'],
																		[NT.NumberLiteral, '1'],
																	],
																],
																[NT.CommaSeparator],
																[
																	NT.Property,
																	[
																		[NT.Identifier, 'b'],
																		[NT.StringLiteral, 'pizza'],
																	],
																],
																[NT.CommaSeparator],
																[
																	NT.Property,
																	[
																		[NT.Identifier, 'pi'],
																		[
																			NT.ObjectExpression,
																			[
																				[
																					NT.Property,
																					[
																						[NT.Identifier, 'two_digits'],
																						[NT.NumberLiteral, '3.14'],
																					],
																				],
																			],
																		],
																	],
																],
															],
														],
													],
												],
												[NT.CommaSeparator],
												[
													NT.Property,
													[
														[NT.Identifier, 'bol'],
														[NT.BoolLiteral, 'true'],
													],
												],
												[NT.CommaSeparator],
												[
													NT.Property,
													[
														[NT.Identifier, 'pth'],
														[NT.Path, '@/some/file.joe'],
													],
												],
												[NT.CommaSeparator],
												[
													NT.Property,
													[
														[NT.Identifier, 'rng'],
														[
															NT.ObjectExpression,
															[
																[
																	NT.Property,
																	[
																		[NT.Identifier, 'rng'],
																		[
																			NT.RangeExpression,
																			[
																				[NT.NumberLiteral, '1'],
																				[NT.NumberLiteral, '3'],
																			],
																		],
																	],
																],
															],
														],
													],
												],
												[NT.CommaSeparator],
												[
													NT.Property,
													[
														[NT.Identifier, 'tpl'],
														[
															NT.TupleExpression,
															[
																[NT.NumberLiteral, '1'],
																[NT.CommaSeparator],
																[NT.NumberLiteral, '2'],
																[NT.CommaSeparator],
																[NT.StringLiteral, 'fizz'],
																[NT.CommaSeparator],
																[NT.NumberLiteral, '4'],
																[NT.CommaSeparator],
																[NT.StringLiteral, 'buzz'],
															],
														],
													],
												],
											],
										],
									],
								],
							],
						],
						[NT.SemicolonSeparator],
					],
				);
			});

			it('with ternary in item', () => {
				testParse(
					`{
						a: 1,
						b: someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
						c: true
					}`,
					[
						[
							NT.ObjectExpression,
							[
								[
									NT.Property,
									[
										[NT.Identifier, 'a'],
										[NT.NumberLiteral, '1'],
									],
								],
								[NT.CommaSeparator],
								[
									NT.Property,
									[
										[NT.Identifier, 'b'],
										[
											NT.TernaryExpression,
											[
												[NT.TernaryCondition, [[NT.Identifier, 'someCondition']]],
												[NT.TernaryConsequent, [[NT.StringLiteral, 'burnt-orange']]],
												[NT.TernaryAlternate, [[NT.StringLiteral, '']]],
											],
										],
									],
								],
								[NT.CommaSeparator],
								[NT.Comment, '// will always be defined, so the shape is correct'],
								[
									NT.Property,
									[
										[NT.Identifier, 'c'],
										[NT.BoolLiteral, 'true'],
									],
								],
							],
						],
					],
				);
			});

			it('with array in item', () => {
				testParse(
					`{
						a: [1]
					}`,
					[
						[
							NT.ObjectExpression,
							[
								[
									NT.Property,
									[
										[NT.Identifier, 'a'],
										[NT.ArrayExpression, [[NT.NumberLiteral, '1']]],
									],
								],
							],
						],
					],
				);
			});

			it('with MemberExpression in item', () => {
				testParse(
					`{
						a: [foo[1]]
					}`,
					[
						[
							NT.ObjectExpression,
							[
								[
									NT.Property,
									[
										[NT.Identifier, 'a'],
										[
											NT.ArrayExpression,
											[
												[
													NT.MemberExpression,
													[
														[NT.Identifier, 'foo'],
														[NT.NumberLiteral, '1'],
													],
												],
											],
										],
									],
								],
							],
						],
					],
				);
			});
		});

		it('should assign this', () => {
			testParse('const foo = this;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[NT.AssignablesList, [[NT.ThisKeyword]]],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('should assign a range', () => {
			testParse('const foo = 1 .. 3;', [
				[
					NT.VariableDeclaration,
					'const',
					[
						[NT.AssigneesList, [[NT.Identifier, 'foo']]],
						[NT.AssignmentOperator],
						[
							NT.AssignablesList,
							[
								[
									NT.RangeExpression,
									[
										[NT.NumberLiteral, '1'],
										[NT.NumberLiteral, '3'],
									],
								],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});
	});

	describe('WhenExpression', (): void => {
		it('works with a small example', () => {
			testParse(
				`when (someNumber) {
					1 -> 'small',
				}`,
				[
					[
						NT.WhenExpression,
						[
							[NT.Parenthesized, [[NT.Identifier, 'someNumber']]],
							[
								NT.BlockStatement,
								[
									[
										NT.WhenCase,
										[
											[NT.WhenCaseValues, [[NT.NumberLiteral, '1']]],
											[NT.WhenCaseConsequent, [[NT.StringLiteral, 'small']]],
										],
									],
									[NT.CommaSeparator],
								],
							],
						],
					],
				],
			);
		});

		it('case with brace', () => {
			testParse(
				`when someNumber {
					1 -> {
						doThing1();
						doThing2();

						return 'large';
					},
				}`,
				[
					[
						NT.WhenExpression,
						[
							[NT.Identifier, 'someNumber'],
							[
								NT.BlockStatement,
								[
									[
										NT.WhenCase,
										[
											[NT.WhenCaseValues, [[NT.NumberLiteral, '1']]],
											[
												NT.WhenCaseConsequent,
												[
													[
														NT.BlockStatement,
														[
															[
																NT.CallExpression,
																[
																	[NT.Identifier, 'doThing1'],
																	[NT.ArgumentsList, []],
																],
															],
															[NT.SemicolonSeparator],
															[
																NT.CallExpression,
																[
																	[NT.Identifier, 'doThing2'],
																	[NT.ArgumentsList, []],
																],
															],
															[NT.SemicolonSeparator],
															[NT.ReturnStatement, [[NT.StringLiteral, 'large']]],
															[NT.SemicolonSeparator],
														],
													],
												],
											],
										],
									],
									[NT.CommaSeparator],
								],
							],
						],
					],
				],
			);
		});

		it('works with single values, multiple values, ranges, and ...', (): void => {
			testParse(
				`f doSomethingElse -> string {
					return "";
				}
				const size = when someNumber {
					1, 2 -> 'small',
					3 .. 10 -> 'medium',
					11 -> {
						doThing1();
						doThing2();

						return 'large';
					},
					12 -> doSomethingElse(),
					... -> 'off the charts',
				}`,
				[
					[
						NT.FunctionDeclaration,
						[
							[NT.Identifier, 'doSomethingElse'],
							[NT.FunctionReturns, [[NT.Type, 'string']]],
							[
								NT.BlockStatement,
								[[NT.ReturnStatement, [[NT.StringLiteral, '']]], [NT.SemicolonSeparator]],
							],
						],
					],
					[
						NT.VariableDeclaration,
						'const',
						[
							[NT.AssigneesList, [[NT.Identifier, 'size']]],
							[NT.AssignmentOperator],
							[
								NT.AssignablesList,
								[
									[
										NT.WhenExpression,
										[
											[NT.Identifier, 'someNumber'],
											[
												NT.BlockStatement,
												[
													[
														NT.WhenCase,
														[
															[
																NT.WhenCaseValues,
																[
																	[NT.NumberLiteral, '1'],
																	[NT.CommaSeparator],
																	[NT.NumberLiteral, '2'],
																],
															],
															[NT.WhenCaseConsequent, [[NT.StringLiteral, 'small']]],
														],
													],
													[NT.CommaSeparator],
													[
														NT.WhenCase,
														[
															[
																NT.WhenCaseValues,
																[
																	[
																		NT.RangeExpression,
																		[
																			[NT.NumberLiteral, '3'],
																			[NT.NumberLiteral, '10'],
																		],
																	],
																],
															],
															[NT.WhenCaseConsequent, [[NT.StringLiteral, 'medium']]],
														],
													],
													[NT.CommaSeparator],
													[
														NT.WhenCase,
														[
															[NT.WhenCaseValues, [[NT.NumberLiteral, '11']]],
															[
																NT.WhenCaseConsequent,
																[
																	[
																		NT.BlockStatement,
																		[
																			[
																				NT.CallExpression,
																				[
																					[NT.Identifier, 'doThing1'],
																					[NT.ArgumentsList, []],
																				],
																			],
																			[NT.SemicolonSeparator],
																			[
																				NT.CallExpression,
																				[
																					[NT.Identifier, 'doThing2'],
																					[NT.ArgumentsList, []],
																				],
																			],
																			[NT.SemicolonSeparator],
																			[
																				NT.ReturnStatement,
																				[[NT.StringLiteral, 'large']],
																			],
																			[NT.SemicolonSeparator],
																		],
																	],
																],
															],
														],
													],
													[NT.CommaSeparator],
													[
														NT.WhenCase,
														[
															[NT.WhenCaseValues, [[NT.NumberLiteral, '12']]],
															[
																NT.WhenCaseConsequent,
																[
																	[
																		NT.CallExpression,
																		[
																			[NT.Identifier, 'doSomethingElse'],
																			[NT.ArgumentsList, []],
																		],
																	],
																],
															],
														],
													],
													[NT.CommaSeparator],
													[
														NT.WhenCase,
														[
															[NT.WhenCaseValues, [[NT.RestElement, '...']]],
															[
																NT.WhenCaseConsequent,
																[[NT.StringLiteral, 'off the charts']],
															],
														],
													],
													[NT.CommaSeparator],
												],
											],
										],
									],
								],
							],
						],
					],
				],
			);
		});
	});

	describe('bugs fixed', (): void => {
		it('"foo() .. 3" should place the RangeExpression outside of the CallExpression', (): void => {
			testParse('foo() .. 3', [
				[
					NT.RangeExpression,
					[
						[
							NT.CallExpression,
							[
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, []],
							],
						],
						[NT.NumberLiteral, '3'],
					],
				],
			]);
		});

		it('"[1<2, 3>2];" should be a bool array, not a tuple', (): void => {
			testParse('[1<2, 4>3];', [
				[
					NT.ArrayExpression,
					[
						[
							NT.BinaryExpression,
							'<',
							[
								[NT.NumberLiteral, '1'],
								[NT.NumberLiteral, '2'],
							],
						],
						[NT.CommaSeparator],
						[
							NT.BinaryExpression,
							'>',
							[
								[NT.NumberLiteral, '4'],
								[NT.NumberLiteral, '3'],
							],
						],
					],
				],
				[NT.SemicolonSeparator],
			]);
		});

		it('"f foo(a: int16 = 1_234, b = true) {}" should correctly see the underscore as a separator', () => {
			testParse('f foo(a: int16 = 1_234, b = true) {}', [
				[
					NT.FunctionDeclaration,
					[
						[NT.Identifier, 'foo'],
						[
							NT.ParametersList,
							[
								[
									NT.Parameter,
									[
										[NT.Identifier, 'a'],
										[NT.ColonSeparator],
										[NT.Type, 'int16'],
										[NT.AssignmentOperator],
										[NT.NumberLiteral, '1_234'],
									],
								],
								[NT.CommaSeparator],
								[
									NT.Parameter,
									[[NT.Identifier, 'b'], [NT.AssignmentOperator], [NT.BoolLiteral, 'true']],
								],
							],
						],
						[NT.BlockStatement, []],
					],
				],
			]);
		});
	});

	describe('error scenarios', (): void => {
		for (const [openToken, { pair: closeToken, message }] of Object.entries(stackPairs)) {
			it(`unmatched open token: "${openToken}"`, (): void => {
				const result = parse(openToken);

				// use assert instead of expect, since we need TS to narrow the type
				assert(result.isError(), `Expected: "error", Received: "ok"`);
				expect(result.error.message).toBe(`Unexpected end of program; expecting "${closeToken}"`);
			});

			it(`unexpected close token: "${closeToken}"`, (): void => {
				const result = parse(closeToken);

				// use assert instead of expect, since we need TS to narrow the type
				assert(result.isError(), `Expected: "error", Received: "ok"`);
				expect(result.error.message).toBe(message);
			});
		}
	});
});
