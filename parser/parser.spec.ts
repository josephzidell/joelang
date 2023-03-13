import assert from 'node:assert/strict';
import { types } from '../lexer/types';
import {
	AST,
	ASTArrayExpression,
	ASTArrayOf,
	ASTAssignmentExpression,
	ASTBinaryExpression,
	ASTBlockStatement,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTClassDeclaration,
	ASTFunctionDeclaration,
	ASTFunctionSignature,
	ASTIdentifier,
	ASTIfStatement,
	ASTInterfaceDeclaration,
	ASTJoeDoc,
	ASTMemberExpression,
	ASTMemberListExpression,
	ASTModifier,
	ASTNumberLiteral,
	ASTParameter,
	ASTPath,
	ASTPostfixIfStatement,
	ASTRangeExpression,
	ASTRegularExpression,
	ASTRestElement,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTTernaryAlternate,
	ASTTernaryCondition,
	ASTTernaryConsequent,
	ASTTernaryExpression,
	ASTThisKeyword,
	ASTTypeInstantiationExpression,
	ASTTypePrimitive,
	ASTTypeRange,
	ASTUnaryExpression,
	ASTVariableDeclaration,
	ASTWhenCase,
	ASTWhenExpression
} from "../semanticAnalysis/asts";
import '../setupJest'; // for the types
import { NT } from './types';
import { analyze, parse, testParseAndAnalyze } from './util';

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
		testParseAndAnalyze(
			`1 ${operator} 2,000;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.NumberLiteral, '1'],
					[NT.NumberLiteral, '2,000'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTNumberLiteral._({format: 'int', value: 1}),
					right: ASTNumberLiteral._({format: 'int', value: 2000}),
				}),
			],
		);

		testParseAndAnalyze(
			`-1,000 ${operator} 2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.UnaryExpression, '-', { before: true }, [
						[NT.NumberLiteral, '1,000'],
					]],
					[NT.NumberLiteral, '2'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTUnaryExpression._({
						before: true,
						operator: '-',
						operand: ASTNumberLiteral._({format: 'int', value: 1000}),
					}),
					right: ASTNumberLiteral._({format: 'int', value: 2}),
				}),
			],
		);

		testParseAndAnalyze(
			`1 ${operator} -2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.NumberLiteral, '1'],
					[NT.UnaryExpression, '-', { before: true }, [
						[NT.NumberLiteral, '2'],
					]],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTNumberLiteral._({format: 'int', value: 1}),
					right: ASTUnaryExpression._({
						before: true,
						operator: '-',
						operand: ASTNumberLiteral._({format: 'int', value: 2}),
					}),
				}),
			],
		);

		testParseAndAnalyze(
			`-1 ${operator} -2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.UnaryExpression, '-', { before: true }, [
						[NT.NumberLiteral, '1'],
					]],
					[NT.UnaryExpression, '-', { before: true }, [
						[NT.NumberLiteral, '2'],
					]],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTUnaryExpression._({
						before: true,
						operator: '-',
						operand: ASTNumberLiteral._({format: 'int', value: 1}),
					}),
					right: ASTUnaryExpression._({
						before: true,
						operator: '-',
						operand: ASTNumberLiteral._({format: 'int', value: 2}),
					}),
				}),
			],
		);
	});

	// identifier and number
	it(`${operator} with identifier and number literal`, (): void => {
		testParseAndAnalyze(
			`foo ${operator} 2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.Identifier, 'foo'],
					[NT.NumberLiteral, '2'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTIdentifier._('foo'),
					right: ASTNumberLiteral._({format: 'int', value: 2}),
				}),
			],
		);
	});

	it(`${operator} with number literal and identifier`, (): void => {
		testParseAndAnalyze(
			`1 ${operator} foo;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.NumberLiteral, '1'],
					[NT.Identifier, 'foo'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTNumberLiteral._({format: 'int', value: 1}),
					right: ASTIdentifier._('foo'),
				}),
			],
		);
	});

	// element access and number
	it(`${operator} with element access and number literal`, (): void => {
		testParseAndAnalyze(
			`foo['a'] ${operator} 2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'a'],
					]],
					[NT.NumberLiteral, '2'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTStringLiteral._('a'),
					}),
					right: ASTNumberLiteral._({format: 'int', value: 2}),
				}),
			],
		);

		testParseAndAnalyze(
			`foo.a ${operator} 2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.Identifier, 'a'],
					]],
					[NT.NumberLiteral, '2'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTIdentifier._('a'),
					}),
					right: ASTNumberLiteral._({format: 'int', value: 2}),
				}),
			],
		);

		testParseAndAnalyze(
			`foo['a'].b ${operator} 2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.StringLiteral, 'a'],
						]],
						[NT.Identifier, 'b'],
					]],
					[NT.NumberLiteral, '2'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTMemberExpression._({
						object: ASTMemberExpression._({
							object: ASTIdentifier._('foo'),
							property: ASTStringLiteral._('a'),
						}),
						property: ASTIdentifier._('b'),
					}),
					right: ASTNumberLiteral._({format: 'int', value: 2}),
				}),
			],
		);

		testParseAndAnalyze(
			`2 ${operator} this.foo['a']['c'].d;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.NumberLiteral, '2'],
					[NT.MemberExpression, [
						[NT.MemberExpression, [
							[NT.MemberExpression, [
								[NT.MemberExpression, [
									[NT.ThisKeyword],
									[NT.Identifier, 'foo'],
								]],
								[NT.StringLiteral, 'a'],
							]],
							[NT.StringLiteral, 'c'],
						]],
						[NT.Identifier, 'd'],
					]],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTNumberLiteral._({format: 'int', value: 2}),
					right: ASTMemberExpression._({
						object: ASTMemberExpression._({
							object: ASTMemberExpression._({
								object: ASTMemberExpression._({
									object: ASTThisKeyword._(),
									property: ASTIdentifier._('foo'),
								}),
								property: ASTStringLiteral._('a'),
							}),
							property: ASTStringLiteral._('c'),
						}),
						property: ASTIdentifier._('d'),
					}),
				}),
			],
		);
	});

	it(`${operator} with number literal and element access`, (): void => {
		testParseAndAnalyze(
			`1 ${operator} foo['a'];'a'`,
			[
				[NT.BinaryExpression, operator, [
					[NT.NumberLiteral, '1'],
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.SemicolonSeparator],
				[NT.StringLiteral, 'a'],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTNumberLiteral._({format: 'int', value: 1}),
					right: ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTStringLiteral._('a'),
					}),
				}),
				ASTStringLiteral._('a'),
			],
		);
	});

	// method call and number
	it(`${operator} with method call and number literal`, (): void => {
		testParseAndAnalyze(
			`foo('a') ${operator} 2;`,
			[
				[NT.BinaryExpression, operator, [
					[NT.CallExpression, [
						[NT.Identifier, 'foo'],
						[NT.ArgumentsList, [
							[NT.StringLiteral, 'a'],
						]],
					]],
					[NT.NumberLiteral, '2'],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTCallExpression._({
						callee: ASTIdentifier._('foo'),
						args: [
							ASTStringLiteral._('a'),
						],
					}),
					right: ASTNumberLiteral._({format: 'int', value: 2}),
				}),
			],
		);
	});

	it(`${operator} with number literal and method call`, (): void => {
		testParseAndAnalyze(
			`1 ${operator} foo('a');`,
			[
				[NT.BinaryExpression, operator, [
					[NT.NumberLiteral, '1'],
					[NT.CallExpression, [
						[NT.Identifier, 'foo'],
						[NT.ArgumentsList, [
							[NT.StringLiteral, 'a'],
						]],
					]],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTNumberLiteral._({format: 'int', value: 1}),
					right: ASTCallExpression._({
						callee: ASTIdentifier._('foo'),
						args: [
							ASTStringLiteral._('a'),
						],
					}),
				}),
			],
		);
	});

	// element access and method call
	it(`${operator} with element access and method call`, (): void => {
		testParseAndAnalyze(
			`foo['a'] ${operator} bar('b');`,
			[
				[NT.BinaryExpression, operator, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'a'],
					]],
					[NT.CallExpression, [
						[NT.Identifier, 'bar'],
						[NT.ArgumentsList, [
							[NT.StringLiteral, 'b'],
						]],
					]],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTStringLiteral._('a'),
					}),
					right: ASTCallExpression._({
						callee: ASTIdentifier._('bar'),
						args: [
							ASTStringLiteral._('b'),
						],
					}),
				}),
			],
		);
	});

	it(`${operator} with method call and element access`, (): void => {
		testParseAndAnalyze(
			`foo('a') ${operator} bar['b'];`,
			[
				[NT.BinaryExpression, operator, [
					[NT.CallExpression, [
						[NT.Identifier, 'foo'],
						[NT.ArgumentsList, [
							[NT.StringLiteral, 'a'],
						]],
					]],
					[NT.MemberExpression, [
						[NT.Identifier, 'bar'],
						[NT.StringLiteral, 'b'],
					]],
				]],
				[NT.SemicolonSeparator],
			],
			[
				ASTBinaryExpression._({
					operator,
					left: ASTCallExpression._({
						callee: ASTIdentifier._('foo'),
						args: [
							ASTStringLiteral._('a'),
						],
					}),
					right: ASTMemberExpression._({
						object: ASTIdentifier._('bar'),
						property: ASTStringLiteral._('b'),
					}),
				}),
			],
		);
	});
};

describe('parser.ts', (): void => {
	describe('CallExpression', () => {

		it('works with several nested layers', () => {
			testParseAndAnalyze(
				'a.b.c.d(4);',
				[
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
						[NT.ArgumentsList, [
							[NT.NumberLiteral, '4'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTCallExpression._({
						callee: ASTMemberExpression._({
							object: ASTMemberExpression._({
								object: ASTMemberExpression._({
									object: ASTIdentifier._('a'),
									property: ASTIdentifier._('b'),
								}),
								property: ASTIdentifier._('c'),
							}),
							property: ASTIdentifier._('d'),
						}),
						args: [
							ASTNumberLiteral._({format: 'int', value: 4}),
						],
					}),
				],
			);
		});

		it('call followed by property', () => {
			testParseAndAnalyze(
				'a(1).b',
				[
					[NT.MemberExpression, [
						[NT.CallExpression, [
							[NT.Identifier, 'a'],
							[NT.ArgumentsList, [
								[NT.NumberLiteral, '1'],
							]],
						]],
						[NT.Identifier, 'b'],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTCallExpression._({
							callee: ASTIdentifier._('a'),
							args: [
								ASTNumberLiteral._({format: 'int', value: 1}),
							],
						}),
						property: ASTIdentifier._('b'),
					}),
				],
			);
		});

		it('call followed by a call', () => {
			testParseAndAnalyze(
				'a(1).b(2)',
				[
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
				],
				[
					ASTCallExpression._({
						callee: ASTMemberExpression._({
							object: ASTCallExpression._({
								callee: ASTIdentifier._('a'),
								args: [
									ASTNumberLiteral._({format: 'int', value: 1}),
								],
							}),
							property: ASTIdentifier._('b'),
						}),
						args: [
							ASTNumberLiteral._({format: 'int', value: 2}),
						],
					}),
				],
			);
		});

		it('generics', () => {
			testParseAndAnalyze(
				'a(b<|T|>);',
				[
					[NT.CallExpression, [
						[NT.Identifier, 'a'],
						[NT.ArgumentsList, [
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'b'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTCallExpression._({
						callee: ASTIdentifier._('a'),
						args: [
							ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('b'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
						],
					}),
				],
			);

			testParseAndAnalyze(
				'a<|T|>(b);',
				[
					[NT.CallExpression, [
						[NT.Identifier, 'a'],
						[NT.TypeArgumentsList, [
							[NT.Identifier, 'T'],
						]],
						[NT.ArgumentsList, [
							[NT.Identifier, 'b'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTCallExpression._({
						callee: ASTIdentifier._('a'),
						typeArgs: [
							ASTIdentifier._('T'),
						],
						args: [
							ASTIdentifier._('b'),
						],
					}),
				],
			);
		});

		it('more advanced generics', () => {
			testParseAndAnalyze(
				'const foo = Foo<|T, T[]|>();',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.CallExpression, [
							[NT.Identifier, 'Foo'],
							[NT.TypeArgumentsList, [
								[NT.Identifier, 'T'],
								[NT.CommaSeparator],
								[NT.ArrayOf, [
									[NT.Identifier, 'T'],
								]],
							]],
							[NT.ArgumentsList, []],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('foo'),
						initialValue: ASTCallExpression._({
							callee: ASTIdentifier._('Foo'),
							typeArgs: [
								ASTIdentifier._('T'),
								ASTArrayOf._(
									ASTIdentifier._('T'),
								),
							],
							args: [],
						}),
					}),
				],
			);
		});

		it('multiple inheritance manual resolution', () => {
			testParseAndAnalyze(
				`class C extends A, B {
					f foo () {
						return this.parent<|B|>.foo(); // <-- Specify to use B.foo
					}
				}`,
				[
					[NT.ClassDeclaration, [
						[NT.Identifier, 'C'],
						[NT.ClassExtensionsList, [
							[NT.ClassExtension, [
								[NT.Identifier, 'A'],
							]],
							[NT.CommaSeparator],
							[NT.ClassExtension, [
								[NT.Identifier, 'B'],
							]],
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
													[NT.ThisKeyword],
													[NT.TypeInstantiationExpression, [
														[NT.Identifier, 'parent'],
														[NT.TypeArgumentsList, [
															[NT.Identifier, 'B'],
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
				],
				[
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('C'),
						typeParams: [],
						extends: [
							ASTIdentifier._('A'),
							ASTIdentifier._('B'),
						],
						implements: [],
						body: ASTBlockStatement._([
							ASTFunctionDeclaration._({
								modifiers: [],
								name: ASTIdentifier._('foo'),
								typeParams: [],
								params: [],
								returnTypes: [],
								body: ASTBlockStatement._([
									ASTReturnStatement._([
										ASTCallExpression._({
											callee: ASTMemberExpression._({
												object: ASTMemberExpression._({
													object: ASTThisKeyword._(),
													property: ASTTypeInstantiationExpression._({
														base: ASTIdentifier._('parent'),
														typeArgs: [
															ASTIdentifier._('B'),
														],
													}),
												}),
												property: ASTIdentifier._('foo'),
											}),
											args: [],
										}),
									]),
								]),
							}),
						]),
					}),
				],
			);
		});

		it('works with a TypeInstantiationExpression', () => {
			testParseAndAnalyze(
				'foo.bar<|T|>()',
				[
					[NT.CallExpression, [
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'bar'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
						]],
						[NT.ArgumentsList, []],
					]],
				],
				[
					ASTCallExpression._({
						callee: ASTMemberExpression._({
							object: ASTIdentifier._('foo'),
							property: ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('bar'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
						}),
						args: [],
					}),
				],
			);

			testParseAndAnalyze(
				'this.bar<|T|>()',
				[
					[NT.CallExpression, [
						[NT.MemberExpression, [
							[NT.ThisKeyword],
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'bar'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
						]],
						[NT.ArgumentsList, []],
					]],
				],
				[
					ASTCallExpression._({
						callee: ASTMemberExpression._({
							object: ASTThisKeyword._(),
							property: ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('bar'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
						}),
						args: [],
					}),
				],
			);
		});

		describe('works with create', () => {

			it('simple', () => {
				testParseAndAnalyze(
					'A.create();',
					[
						[NT.CallExpression, [
							[NT.MemberExpression, [
								[NT.Identifier, 'A'],
								[NT.Identifier, 'create'],
							]],
							[NT.ArgumentsList, []],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTCallExpression._({
							callee: ASTMemberExpression._({
								object: ASTIdentifier._('A'),
								property: ASTIdentifier._('create'),
							}),
							args: [],
						}),
					],
				);
			});

			it('with GenericTypes and Arguments', () => {
				testParseAndAnalyze(
					'A<|T, U|>.create(T.create(), U.create(), "foo");',
					[
						[NT.CallExpression, [
							[NT.MemberExpression, [
								[NT.TypeInstantiationExpression, [
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
					],
					[
						ASTCallExpression._({
							callee: ASTMemberExpression._({
								object: ASTTypeInstantiationExpression._({
									base: ASTIdentifier._('A'),
									typeArgs: [
										ASTIdentifier._('T'),
										ASTIdentifier._('U'),
									],
								}),
								property: ASTIdentifier._('create'),
							}),
							args: [
								ASTCallExpression._({
									callee: ASTMemberExpression._({
										object: ASTIdentifier._('T'),
										property: ASTIdentifier._('create'),
									}),
									args: [],
								}),
								ASTCallExpression._({
									callee: ASTMemberExpression._({
										object: ASTIdentifier._('U'),
										property: ASTIdentifier._('create'),
									}),
									args: [],
								}),
								ASTStringLiteral._('foo'),
							],
						}),
					],
				);
			});

			it('with several nested layers', () => {
				testParseAndAnalyze(
					'A.B.C.D.create();',
					[
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
					],
					[
						ASTCallExpression._({
							callee: ASTMemberExpression._({
								object: ASTMemberExpression._({
									object: ASTMemberExpression._({
										object: ASTMemberExpression._({
											object: ASTIdentifier._('A'),
											property: ASTIdentifier._('B'),
										}),
										property: ASTIdentifier._('C'),
									}),
									property: ASTIdentifier._('D'),
								}),
								property: ASTIdentifier._('create'),
							}),
							args: [],
						}),
					],
				);
			});

		});

	});

	describe('ClassDeclaration', (): void => {
		it('empty class', (): void => {
			testParseAndAnalyze(
				'class Foo {}',
				[
					[NT.ClassDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);

			testParseAndAnalyze(
				'class Foo <| T, U.V, bool |> {}',
				[
					[NT.ClassDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
							[NT.CommaSeparator],
							[NT.TypeParameter, [
								[NT.MemberExpression, [
									[NT.Identifier, 'U'],
									[NT.Identifier, 'V'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.TypeParameter, [
								[NT.Type, 'bool'],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [
							ASTIdentifier._('T'),
							ASTMemberExpression._({
								object: ASTIdentifier._('U'),
								property: ASTIdentifier._('V'),
							}),
							ASTTypePrimitive._('bool'),
						],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('class with comment', (): void => {
			testParseAndAnalyze(
				'class Foo {\n# foo\n}\n# bar\n',
				[
					[NT.ClassDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, [
							[NT.Comment, '# foo'],
						]],
					]],
					[NT.Comment, '# bar'],
				],
				[
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('class with properties and methods', (): void => {
			testParseAndAnalyze(
				'class Foo {\nconst foo = "bar";\nf bar {}}\n# bar\n',
				[
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
				],
				[
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([
							ASTVariableDeclaration._({
								modifiers: [],
								mutable: false,
								identifier: ASTIdentifier._('foo'),
								initialValue: ASTStringLiteral._('bar'),
								inferredType: ASTTypePrimitive._('string'),
							}),
							ASTFunctionDeclaration._({
								modifiers: [],
								name: ASTIdentifier._('bar'),
								typeParams: [],
								params: [],
								returnTypes: [],
								body: ASTBlockStatement._([]),
							}),
						]),
					}),
				],
			);
		});

		it('class extends multiple and implements multiple', (): void => {
			testParseAndAnalyze(
				'class Foo extends Bar, Baz implements AbstractFooBar, AnotherAbstractClass {}',
				[
					[NT.ClassDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.ClassExtensionsList, [
							[NT.ClassExtension, [
								[NT.Identifier, 'Bar'],
							]],
							[NT.CommaSeparator],
							[NT.ClassExtension, [
								[NT.Identifier, 'Baz'],
							]],
						]],
						[NT.ClassImplementsList, [
							[NT.ClassImplement, [
								[NT.Identifier, 'AbstractFooBar'],
							]],
							[NT.CommaSeparator],
							[NT.ClassImplement, [
								[NT.Identifier, 'AnotherAbstractClass'],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [
							ASTIdentifier._('Bar'),
							ASTIdentifier._('Baz'),
						],
						implements: [
							ASTIdentifier._('AbstractFooBar'),
							ASTIdentifier._('AnotherAbstractClass'),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('class extends multiple and implements multiple with generics', (): void => {
			testParseAndAnalyze(
				'class Foo<|T,U|> extends Bar<|T<|RE|>, path|>, Baz implements AbstractFooBar, AnotherAbstractClass<|U|> {}',
				[
					[NT.ClassDeclaration, [
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
						[NT.ClassExtensionsList, [
							[NT.ClassExtension, [
								[NT.Identifier, 'Bar'],
								[NT.TypeArgumentsList, [
									[NT.TypeInstantiationExpression, [
										[NT.Identifier, 'T'],
										[NT.TypeArgumentsList, [
											[NT.Identifier, 'RE'],
										]],
									]],
									[NT.CommaSeparator],
									[NT.Type, 'path'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.ClassExtension, [
								[NT.Identifier, 'Baz'],
							]],
						]],
						[NT.ClassImplementsList, [
							[NT.ClassImplement, [
								[NT.Identifier, 'AbstractFooBar'],
							]],
							[NT.CommaSeparator],
							[NT.ClassImplement, [
								[NT.Identifier, 'AnotherAbstractClass'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'U'],
								]],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [
							ASTIdentifier._('T'),
							ASTIdentifier._('U'),
						],
						extends: [
							ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('Bar'),
								typeArgs: [
									ASTTypeInstantiationExpression._({
										base: ASTIdentifier._('T'),
										typeArgs: [
											ASTIdentifier._('RE'),
										],
									}),
									ASTTypePrimitive._('path'),
								],
							}),
							ASTIdentifier._('Baz'),
						],
						implements: [
							ASTIdentifier._('AbstractFooBar'),
							ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('AnotherAbstractClass'),
								typeArgs: [
									ASTIdentifier._('U'),
								],
							}),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('abstract class', (): void => {
			testParseAndAnalyze(
				'abstract class Foo {}',
				[
					[NT.ClassDeclaration, [
						[NT.ModifiersList, [
							[NT.Modifier, 'abstract'],
						]],
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTClassDeclaration._({
						modifiers: [
							ASTModifier._('abstract'),
						],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);

			testParseAndAnalyze(
				'abstract class Foo<|T|> {}',
				[
					[NT.ClassDeclaration, [
						[NT.ModifiersList, [
							[NT.Modifier, 'abstract'],
						]],
						[NT.Identifier, 'Foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTClassDeclaration._({
						modifiers: [
							ASTModifier._('abstract'),
						],
						name: ASTIdentifier._('Foo'),
						typeParams: [
							ASTIdentifier._('T'),
						],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);

			testParseAndAnalyze(
				`abstract class Foo {
					abstract const baz: number;

					abstract static f hello<|T|> (name = 'World') -> Greeting, T;

					static f world (name = 'Earth');
				}`,
				[
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
								[NT.Identifier, 'hello'],
								[NT.TypeParametersList, [
									[NT.TypeParameter, [
										[NT.Identifier, 'T'],
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
				],
				[
					ASTClassDeclaration._({
						modifiers: [
							ASTModifier._('abstract'),
						],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([
							ASTVariableDeclaration._({
								modifiers: [
									ASTModifier._('abstract'),
								],
								mutable: false,
								identifier: ASTIdentifier._('baz'),
								declaredType: ASTTypePrimitive._('number'),
							}),
							ASTFunctionDeclaration._({
								modifiers: [
									ASTModifier._('abstract'),
									ASTModifier._('static'),
								],
								name: ASTIdentifier._('hello'),
								typeParams: [
									ASTIdentifier._('T'),
								],
								params: [
									ASTParameter._({
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('name'),
										defaultValue: ASTStringLiteral._('World'),
									}),
								],
								returnTypes: [
									ASTIdentifier._('Greeting'),
									ASTIdentifier._('T'),
								],
								body: undefined,
							}),
							ASTFunctionDeclaration._({
								modifiers: [
									ASTModifier._('static'),
								],
								name: ASTIdentifier._('world'),
								typeParams: [],
								params: [
									ASTParameter._({
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('name'),
										defaultValue: ASTStringLiteral._('Earth'),
									}),
								],
								returnTypes: [],
								body: undefined,
							}),
						]),
					}),
				],
			);

			testParseAndAnalyze(
				'abstract class Foo {}\nclass Bar extends Foo {}',
				[
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
							[NT.ClassExtension, [
								[NT.Identifier, 'Foo'],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTClassDeclaration._({
						modifiers: [
							ASTModifier._('abstract'),
						],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([]),
					}),
					ASTClassDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Bar'),
						typeParams: [],
						extends: [
							ASTIdentifier._('Foo'),
						],
						implements: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

	});

	describe('Comment', (): void => {
		it('a single-line comment', (): void => {
			testParseAndAnalyze(
				'# let x = "foo"',
				[
					[NT.Comment, '# let x = "foo"'],
				],
				[], // empty program
			)
		});

		it('a multi-line comment', (): void => {
			testParseAndAnalyze(
				'/* let x = "foo" */',
				[
					[NT.Comment, '/* let x = "foo" */'],
				],
				[], // empty program
			)
		});

	});

	describe('ForStatement', (): void => {

		it('simple for statement', () => {
			expect(parse(
				'for let i = 0; i < 10; i++ {}')).toMatchParseTree(
				[
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
			expect(parse(
				'for (let i = 0; i < 10; i++) {}')).toMatchParseTree(
				[
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

	describe('FunctionDeclaration', (): void => {
		it('no params or return types', (): void => {
			testParseAndAnalyze(
				'f foo {}',
				[
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [],
						returnTypes: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('no params with single return type', (): void => {
			testParseAndAnalyze(
				'f foo -> bool {} 5;',
				[
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.FunctionReturns, [
							[NT.Type, 'bool'],
						]],
						[NT.BlockStatement, []],
					]],
					[NT.NumberLiteral, '5'],
					[NT.SemicolonSeparator],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [],
						returnTypes: [
							ASTTypePrimitive._('bool'),
						],
						body: ASTBlockStatement._([]),
					}),
					ASTNumberLiteral._({ format: 'int', value: 5 }),
				],
			);
		});

		it('no params with multiple return types', (): void => {
			testParseAndAnalyze(
				`f foo -> bool, string {
					return true, 'hey';
				}`,
				[
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
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [],
						returnTypes: [
							ASTTypePrimitive._('bool'),
							ASTTypePrimitive._('string'),
						],
						body: ASTBlockStatement._([
							ASTReturnStatement._([
								ASTBoolLiteral._(true),
								ASTStringLiteral._('hey'),
							]),
						]),
					}),
				],
			);
		});

		it('param parens but no return types', (): void => {
			testParseAndAnalyze(
				'f foo () {}',
				[
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.ParametersList, []],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [],
						returnTypes: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('param parens with return types', (): void => {
			testParseAndAnalyze(
				'f foo () -> bool {}',
				[
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.ParametersList, []],
						[NT.FunctionReturns, [
							[NT.Type, 'bool'],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [],
						returnTypes: [
							ASTTypePrimitive._('bool'),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('params but no return types', (): void => {
			testParseAndAnalyze(
				'f foo (a: number, callback: f (a: number) -> string, bool) {}',
				[
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
								[NT.Identifier, 'callback'],
								[NT.ColonSeparator],
								[NT.FunctionSignature, [
									[NT.ParametersList, [
										[NT.Parameter, [
											[NT.Identifier, 'a'],
											[NT.ColonSeparator],
											[NT.Type, 'number'],
										]],
									]],
									[NT.FunctionReturns, [
										[NT.Type, 'string'],
										[NT.CommaSeparator],
										[NT.Type, 'bool'],
									]],
								]],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('a'),
								declaredType: ASTTypePrimitive._('number'),
							}),
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('callback'),
								declaredType: ASTFunctionSignature._({
									typeParams: [],
									params: [
										ASTParameter._({
											modifiers: [],
											isRest: false,
											name: ASTIdentifier._('a'),
											declaredType: ASTTypePrimitive._('number'),
										}),
									],
									returnTypes: [
										ASTTypePrimitive._('string'),
										ASTTypePrimitive._('bool'),
									],
								}),
							}),
						],
						returnTypes: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('params and return types', (): void => {
			testParseAndAnalyze(
				'f foo (a: number, r: regex) -> regex, bool {}',
				[
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
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('a'),
								declaredType: ASTTypePrimitive._('number'),
							}),
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('r'),
								declaredType: ASTTypePrimitive._('regex'),
							}),
						],
						returnTypes: [
							ASTTypePrimitive._('regex'),
							ASTTypePrimitive._('bool'),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('params and return types using functions', (): void => {
			testParseAndAnalyze(
				'f foo <|T|>(a: f -> T) -> f -> Result<|Maybe<|T|>|> {}',
				[
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.TypeParametersList, [
							[NT.TypeParameter, [
								[NT.Identifier, 'T'],
							]],
						]],
						[NT.ParametersList, [
							[NT.Parameter, [
								[NT.Identifier, 'a'],
								[NT.ColonSeparator],
								[NT.FunctionSignature, [
									[NT.FunctionReturns, [
										[NT.Identifier, 'T'],
									]],
								]],
							]],
						]],
						[NT.FunctionReturns, [
							[NT.FunctionSignature, [
								[NT.FunctionReturns, [
									[NT.TypeInstantiationExpression, [
										[NT.Identifier, 'Result'],
										[NT.TypeArgumentsList, [
											[NT.TypeInstantiationExpression, [
												[NT.Identifier, 'Maybe'],
												[NT.TypeArgumentsList, [
													[NT.Identifier, 'T'],
												]],
											]],
										]],
									]],
								]]
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [
							ASTIdentifier._('T'),
						],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('a'),
								declaredType: ASTFunctionSignature._({
									typeParams: [],
									params: [],
									returnTypes: [
										ASTIdentifier._('T'),
									],
								}),
							}),
						],
						returnTypes: [
							ASTFunctionSignature._({
								typeParams: [],
								params: [],
								returnTypes: [
									ASTTypeInstantiationExpression._({
										base: ASTIdentifier._('Result'),
										typeArgs: [
											ASTTypeInstantiationExpression._({
												base: ASTIdentifier._('Maybe'),
												typeArgs: [
													ASTIdentifier._('T'),
												],
											}),
										],
									}),
								],
							}),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('params and return types using tuples', (): void => {
			expect(parse(
				'f foo (a: <bool>) -> <number> {}')).toMatchParseTree(
				[
					[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.TupleShape, [
								[NT.Type, 'bool'],
							]],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.TupleShape, [
							[NT.Type, 'number'],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('params and return types using tuples and arrays', (): void => {
			expect(parse(
				'f foo (a: <bool[]>[]) -> <number> {}')).toMatchParseTree(
				[
					[NT.FunctionDeclaration, [
					[NT.Identifier, 'foo'],
					[NT.ParametersList, [
						[NT.Parameter, [
							[NT.Identifier, 'a'],
							[NT.ColonSeparator],
							[NT.ArrayOf, [
								[NT.TupleShape, [
									[NT.ArrayOf, [
										[NT.Type, 'bool'],
									]],
								]],
							]],
						]],
					]],
					[NT.FunctionReturns, [
						[NT.TupleShape, [
							[NT.Type, 'number'],
						]],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with arrays', (): void => {
			testParseAndAnalyze(
				'f foo(a: number[] = [5], b: string[][], ...c: Foo[]) -> regex, path[][][] {}',
				[
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
						[NT.ParametersList, [
							[NT.Parameter, [
								[NT.Identifier, 'a'],
								[NT.ColonSeparator],
								[NT.ArrayOf, [
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
								[NT.ArrayOf, [
									[NT.ArrayOf, [
										[NT.Type, 'string'],
									]],
								]],
							]],
							[NT.CommaSeparator],
							[NT.Parameter, [
								[NT.RestElement, '...'],
								[NT.Identifier, 'c'],
								[NT.ColonSeparator],
								[NT.ArrayOf, [
									[NT.Identifier, 'Foo'],
								]],
							]],
						]],
						[NT.FunctionReturns, [
							[NT.Type, 'regex'],
							[NT.CommaSeparator],
							[NT.ArrayOf, [
								[NT.ArrayOf, [
									[NT.ArrayOf, [
										[NT.Type, 'path'],
									]],
								]],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('a'),
								declaredType: ASTArrayOf._(
									ASTTypePrimitive._('number'),
								),
								defaultValue: ASTArrayExpression._({
									type: ASTTypePrimitive._('number'),
									items: [
										ASTNumberLiteral._({format: 'int', value: 5}),
									],
								}),
							}),
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('b'),
								declaredType: ASTArrayOf._(
									ASTArrayOf._(
										ASTTypePrimitive._('string'),
									),
								),
							}),
							ASTParameter._({
								modifiers: [],
								isRest: true,
								name: ASTIdentifier._('c'),
								declaredType: ASTArrayOf._(
									ASTIdentifier._('Foo'),
								),
							}),
						],
						returnTypes: [
							ASTTypePrimitive._('regex'),
							ASTArrayOf._(
								ASTArrayOf._(
									ASTArrayOf._(
										ASTTypePrimitive._('path'),
									),
								),
							),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('return when', () => {
			testParseAndAnalyze(
				`f school (age: number) -> string {
					return when age {
						11 -> 'Hogwarts First Year',
						12..17 -> 'Another Year at Hogwarts',
						18, 19 -> 'Auror Training',
						... -> 'Auror',
					};
				}`,
				[
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
											[NT.WhenCaseValues, [
												[NT.NumberLiteral, '11'],
											]],
											[NT.WhenCaseConsequent, [
												[NT.StringLiteral, 'Hogwarts First Year'],
											]],
										]],
										[NT.CommaSeparator],
										[NT.WhenCase, [
											[NT.WhenCaseValues, [
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
											[NT.WhenCaseValues, [
												[NT.NumberLiteral, '18'],
												[NT.CommaSeparator],
												[NT.NumberLiteral, '19'],
											]],
											[NT.WhenCaseConsequent, [
												[NT.StringLiteral, 'Auror Training'],
											]],
										]],
										[NT.CommaSeparator],
										[NT.WhenCase, [
											[NT.WhenCaseValues, [
												[NT.RestElement, '...'],
											]],
											[NT.WhenCaseConsequent, [
												[NT.StringLiteral, 'Auror'],
											]],
										]],
										[NT.CommaSeparator],
									]],
								]],
							]],
							[NT.SemicolonSeparator],
						]],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('school'),
						typeParams: [],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('age'),
								declaredType: ASTTypePrimitive._('number'),
							}),
						],
						returnTypes: [
							ASTTypePrimitive._('string'),
						],
						body: ASTBlockStatement._([
							ASTReturnStatement._([
								ASTWhenExpression._({
									expression: ASTIdentifier._('age'),
									cases: [
										ASTWhenCase._({
											values: [
												ASTNumberLiteral._({format: 'int', value: 11}),
											],
											consequent: ASTStringLiteral._('Hogwarts First Year'),
										}),
										ASTWhenCase._({
											values: [
												ASTRangeExpression._({
													lower: ASTNumberLiteral._({format: 'int', value: 12}),
													upper: ASTNumberLiteral._({format: 'int', value: 17}),
												}),
											],
											consequent: ASTStringLiteral._('Another Year at Hogwarts'),
										}),
										ASTWhenCase._({
											values: [
												ASTNumberLiteral._({format: 'int', value: 18}),
												ASTNumberLiteral._({format: 'int', value: 19}),
											],
											consequent: ASTStringLiteral._('Auror Training'),
										}),
										ASTWhenCase._({
											values: [
												ASTRestElement._(),
											],
											consequent: ASTStringLiteral._('Auror'),
										}),
									],
								}),
							]),
						]),
					}),
				],
			);
		});

		it('multiple returns with when', () => {
			testParseAndAnalyze(
				`f foo (age: number) -> number, string {
					return 5, when age {... -> 'No more foos',};
				}`,
				[
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
											[NT.WhenCaseValues, [
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
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('age'),
								declaredType: ASTTypePrimitive._('number'),
							}),
						],
						returnTypes: [
							ASTTypePrimitive._('number'),
							ASTTypePrimitive._('string'),
						],
						body: ASTBlockStatement._([
							ASTReturnStatement._([
								ASTNumberLiteral._({format: 'int', value: 5}),
								ASTWhenExpression._({
									expression: ASTIdentifier._('age'),
									cases: [
										ASTWhenCase._({
											values: [
												ASTRestElement._(),
											],
											consequent: ASTStringLiteral._('No more foos'),
										}),
									],
								}),
							]),
						]),
					}),
				],
			);
		});

		it('generics', (): void => {
			testParseAndAnalyze(
				'f foo <|T|> (a: T) -> T {}',
				[
					[NT.FunctionDeclaration, [
						[NT.Identifier, 'foo'],
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
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [
							ASTIdentifier._('T'),
						],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('a'),
								declaredType: ASTIdentifier._('T'),
							}),
						],
						returnTypes: [
							ASTIdentifier._('T'),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('abstract functions', () => {
			testParseAndAnalyze(
				`abstract class A {
					abstract f foo1;
					abstract f foo2 (arg: number);
					abstract f foo3<| T |> -> bool;
					abstract f foo4 (arg: number) -> bool;
				}`,
				[
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
								[NT.Identifier, 'foo3'],
								[NT.TypeParametersList, [
									[NT.TypeParameter, [
										[NT.Identifier, 'T'],
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
				],
				[
					ASTClassDeclaration._({
						modifiers: [
							ASTModifier._('abstract'),
						],
						name: ASTIdentifier._('A'),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([
							ASTFunctionDeclaration._({
								modifiers: [
									ASTModifier._('abstract'),
								],
								name: ASTIdentifier._('foo1'),
								typeParams: [],
								params: [],
								returnTypes: [],
								body: undefined,
							}),
							ASTFunctionDeclaration._({
								modifiers: [
									ASTModifier._('abstract'),
								],
								name: ASTIdentifier._('foo2'),
								typeParams: [],
								params: [
									ASTParameter._({
										modifiers: [],
										name: ASTIdentifier._('arg'),
										isRest: false,
										declaredType: ASTTypePrimitive._('number'),
									}),
								],
								returnTypes: [],
								body: undefined,
							}),
							ASTFunctionDeclaration._({
								modifiers: [
									ASTModifier._('abstract'),
								],
								name: ASTIdentifier._('foo3'),
								typeParams: [
									ASTIdentifier._('T'),
								],
								params: [],
								returnTypes: [
									ASTTypePrimitive._('bool'),
								],
								body: undefined,
							}),
							ASTFunctionDeclaration._({
								modifiers: [
									ASTModifier._('abstract'),
								],
								name: ASTIdentifier._('foo4'),
								typeParams: [],
								params: [
									ASTParameter._({
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('arg'),
										declaredType: ASTTypePrimitive._('number'),
									}),
								],
								returnTypes: [
									ASTTypePrimitive._('bool'),
								],
								body: undefined,
							}),
						]),
					}),
				],
			);
		});

		it('anonymous simple', () => {
			testParseAndAnalyze(
				'const foo = f {};',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.FunctionDeclaration, [
							[NT.BlockStatement, []],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('foo'),
						initialValue: ASTFunctionDeclaration._({
							modifiers: [],
							name: undefined,
							typeParams: [],
							params: [],
							returnTypes: [],
							body: ASTBlockStatement._([]),
						}),
					}),
				],
			);
		});

		it('anonymous complex', () => {
			testParseAndAnalyze(
				'const foo = f <|T|>(a: T) -> T {\ndo();\n};',
				[
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
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('foo'),
						initialValue: ASTFunctionDeclaration._({
							modifiers: [],
							name: undefined,
							typeParams: [
								ASTIdentifier._('T'),
							],
							params: [
								ASTParameter._({
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a'),
									declaredType: ASTIdentifier._('T'),
								}),
							],
							returnTypes: [
								ASTIdentifier._('T'),
							],
							body: ASTBlockStatement._([
								ASTCallExpression._({
									callee: ASTIdentifier._('do'),
									args: [],
								}),
							]),
						}),
					}),
				],
			);
		});

		it('anonymous abstract', () => {
			testParseAndAnalyze(
				'abstract const foo = f;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.ModifiersList, [
							[NT.Modifier, 'abstract'],
						]],
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.FunctionDeclaration],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [
							ASTModifier._('abstract'),
						],
						mutable: false,
						identifier: ASTIdentifier._('foo'),
						initialValue: ASTFunctionDeclaration._({
							modifiers: [],
							name: undefined,
							typeParams: [],
							params: [],
							returnTypes: [],
							body: undefined,
						}),
					}),
				],
			);
		});

		it('ending with a question mark', () => {
			testParseAndAnalyze(
				`f danger? -> bool {
					return true;
				}`,
				[
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
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('danger?'),
						typeParams: [],
						params: [],
						returnTypes: [
							ASTTypePrimitive._('bool'),
						],
						body: ASTBlockStatement._([
							ASTReturnStatement._([
								ASTBoolLiteral._(true),
							]),
						]),
					}),
				],
			);
		});

		describe('special function names', () => {

			describe('<=>', () => {

				// outside of a class
				it('<=> as function name outside of a class should return a response ParserError', (): void => {
					const result = parse(`f <=> {}`);

					// use assert instead of expect, since we need TS to narrow the type
					assert(result.outcome === 'error', `Expected: "error", Received: "${result.outcome}"`);
					expect(result.error.message).toBe('"<=>" is a BinaryExpression and we hoped to find a value before it, but alas!');
				});

				// in a class
				it('<=> as function name inside of a class should be an innocent Identifier', (): void => {
					testParseAndAnalyze(
						'class A{f <=> {}}',
						[
							[NT.ClassDeclaration, [
								[NT.Identifier, 'A'],
								[NT.BlockStatement, [
									[NT.FunctionDeclaration, [
										[NT.Identifier, '<=>'],
										[NT.BlockStatement, []],
									]],
								]],
							]],
						],
						[
							ASTClassDeclaration._({
								modifiers: [],
								name: ASTIdentifier._('A'),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._([
									ASTFunctionDeclaration._({
										modifiers: [],
										name: ASTIdentifier._('<=>'),
										typeParams: [],
										params: [],
										returnTypes: [],
										body: ASTBlockStatement._([]),
									}),
								]),
							}),
						],
					);
				});

			});

		});

	});

	describe('IfStatement', (): void => {

		it('with bool conditional', () => {
			testParseAndAnalyze(
				'if true {}',
				[
					[NT.IfStatement, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTIfStatement._({
						test: ASTBoolLiteral._(true),
						consequent: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('with BinaryExpression conditional using two NumberLiterals', () => {
			testParseAndAnalyze(
				'if 1 < 2 {}',
				[
					[NT.IfStatement, [
						[NT.BinaryExpression, '<', [
							[NT.NumberLiteral, '1'],
							[NT.NumberLiteral, '2'],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTIfStatement._({
						test: ASTBinaryExpression._({
							operator: '<',
							left: ASTNumberLiteral._({format: 'int', value: 1}),
							right: ASTNumberLiteral._({format: 'int', value: 2}),
						}),
						consequent: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
			testParseAndAnalyze(
				'if foo == 2 {}',
				[
					[NT.IfStatement, [
						[NT.BinaryExpression, '==', [
							[NT.Identifier, 'foo'],
							[NT.NumberLiteral, '2'],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTIfStatement._({
						test: ASTBinaryExpression._({
							operator: '==',
							left: ASTIdentifier._('foo'),
							right: ASTNumberLiteral._({format: 'int', value: 2}),
						}),
						consequent: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('with BinaryExpression conditional using a CallExpression and a NumberLiteral', () => {
			testParseAndAnalyze(
				'if foo() == 2 {}',
				[
					[NT.IfStatement, [
						[NT.BinaryExpression, '==', [
							[NT.CallExpression, [
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, []],
							]],
							[NT.NumberLiteral, '2'],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTIfStatement._({
						test: ASTBinaryExpression._({
							operator: '==',
							left: ASTCallExpression._({
								callee: ASTIdentifier._('foo'),
								args: [],
							}),
							right: ASTNumberLiteral._({format: 'int', value: 2}),
						}),
						consequent: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('with two conditions', () => {
			testParseAndAnalyze(
				'if foo() == 2 && a < 3 {}',
				[
					[NT.IfStatement, [
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
				],
				[
					ASTIfStatement._({
						test: ASTBinaryExpression._({
							operator: '&&',
							left: ASTBinaryExpression._({
								operator: '==',
								left: ASTCallExpression._({
									callee: ASTIdentifier._('foo'),
									args: [],
								}),
								right: ASTNumberLiteral._({format: 'int', value: 2}),
							}),
							right: ASTBinaryExpression._({
								operator: '<',
								left: ASTIdentifier._('a'),
								right: ASTNumberLiteral._({format: 'int', value: 3}),
							}),
						}),
						consequent: ASTBlockStatement._([]),
					}),
				],
			);
		});

		describe('with parens', () => {

			it('and one condition', () => {
				testParseAndAnalyze(
					'if (foo() == 2) {}',
					[
						[NT.IfStatement, [
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
					],
					[
						ASTIfStatement._({
							test: ASTBinaryExpression._({
								operator: '==',
								left: ASTCallExpression._({
									callee: ASTIdentifier._('foo'),
									args: [],
								}),
								right: ASTNumberLiteral._({format: 'int', value: 2}),
							}),
							consequent: ASTBlockStatement._([]),
						}),
					],
				);
			});

			it('and two conditions', () => {
				testParseAndAnalyze(
					'if (foo() == 2 && a < 3) {}',
					[
						[NT.IfStatement, [
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
					],
					[
						ASTIfStatement._({
							test: ASTBinaryExpression._({
								operator: '&&',
								left: ASTBinaryExpression._({
									operator: '==',
									left: ASTCallExpression._({
										callee: ASTIdentifier._('foo'),
										args: [],
									}),
									right: ASTNumberLiteral._({format: 'int', value: 2}),
								}),
								right: ASTBinaryExpression._({
									operator: '<',
									left: ASTIdentifier._('a'),
									right: ASTNumberLiteral._({format: 'int', value: 3}),
								}),
							}),
							consequent: ASTBlockStatement._([]),
						}),
					],
				);
			});

		});

		it('with just else', () => {

			testParseAndAnalyze(
				'if true {} else {}',
				[
					[NT.IfStatement, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTIfStatement._({
						test: ASTBoolLiteral._(true),
						consequent: ASTBlockStatement._([]),
						alternate: ASTBlockStatement._([]),
					}),
				],
			);

		});

		it('with else if', () => {

			testParseAndAnalyze(
				'if true {} else if false {}',
				[
					[NT.IfStatement, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
						[NT.IfStatement, [
							[NT.BoolLiteral, 'false'],
							[NT.BlockStatement, []],
						]],
					]],
				],
				[
					ASTIfStatement._({
						test: ASTBoolLiteral._(true),
						consequent: ASTBlockStatement._([]),
						alternate: ASTIfStatement._({
							test: ASTBoolLiteral._(false),
							consequent: ASTBlockStatement._([]),
						}),
					}),
				],
			);

		});

		it('with a subsequent if and should be two separate IfStatements', () => {

			testParseAndAnalyze(
				'if true {} if false {}',
				[
					[NT.IfStatement, [
						[NT.BoolLiteral, 'true'],
						[NT.BlockStatement, []],
					]],
					[NT.IfStatement, [
						[NT.BoolLiteral, 'false'],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTIfStatement._({
						test: ASTBoolLiteral._(true),
						consequent: ASTBlockStatement._([]),
					}),
					ASTIfStatement._({
						test: ASTBoolLiteral._(false),
						consequent: ASTBlockStatement._([]),
					}),
				],
			);

		});

	});

	describe('ImportDeclaration', (): void => {
		describe('imports', (): void => {
			it('single, default import', (): void => {
				expect(parse(
					'import lexer from ./lexer;import lexer2 from @/lexer;import lexer3 from @/lexer.joe;')).toMatchParseTree(
					[
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

	describe('InterfaceDeclaration', (): void => {

		it('empty interface', (): void => {
			testParseAndAnalyze(
				'interface Foo {}',
				[
					[NT.InterfaceDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTInterfaceDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);

			testParseAndAnalyze(
				'interface Foo <| T, U |> {}',
				[
					[NT.InterfaceDeclaration, [
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
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTInterfaceDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [
							ASTIdentifier._('T'),
							ASTIdentifier._('U'),
						],
						extends: [],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('interface extends other', (): void => {
			testParseAndAnalyze(
				'interface Foo {} interface Bar extends Foo {}',
				[
					[NT.InterfaceDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.BlockStatement, []],
					]],
					[NT.InterfaceDeclaration, [
						[NT.Identifier, 'Bar'],
						[NT.InterfaceExtensionsList, [
							[NT.InterfaceExtension, [
								[NT.Identifier, 'Foo'],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTInterfaceDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [],
						body: ASTBlockStatement._([]),
					}),
					ASTInterfaceDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Bar'),
						typeParams: [],
						extends: [
							ASTIdentifier._('Foo'),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('interface extends multiple', (): void => {
			testParseAndAnalyze(
				'interface Foo extends Bar, Baz {}',
				[
					[NT.InterfaceDeclaration, [
						[NT.Identifier, 'Foo'],
						[NT.InterfaceExtensionsList, [
							[NT.InterfaceExtension, [
								[NT.Identifier, 'Bar'],
							]],
							[NT.CommaSeparator],
							[NT.InterfaceExtension, [
								[NT.Identifier, 'Baz'],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTInterfaceDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [],
						extends: [
							ASTIdentifier._('Bar'),
							ASTIdentifier._('Baz'),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

		it('interface extends multiple with generics', (): void => {
			testParseAndAnalyze(
				'interface Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}',
				[
					[NT.InterfaceDeclaration, [
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
						[NT.InterfaceExtensionsList, [
							[NT.InterfaceExtension, [
								[NT.Identifier, 'Bar'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.InterfaceExtension, [
								[NT.Identifier, 'Baz'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'U'],
								]],
							]],
						]],
						[NT.BlockStatement, []],
					]],
				],
				[
					ASTInterfaceDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('Foo'),
						typeParams: [
							ASTIdentifier._('T'),
							ASTIdentifier._('U'),
						],
						extends: [
							ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('Bar'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
							ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('Baz'),
								typeArgs: [
									ASTIdentifier._('U'),
								],
							}),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

	})

	describe('JoeDoc', () => {
		// for Class, Function, Interface, or Variable

		describe('for a class', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParseAndAnalyze(
					`/** foo */
					class Foo {}`,
					[
						[NT.ClassDeclaration, [
							[NT.JoeDoc, '/** foo */'],
							[NT.Identifier, 'Foo'],
							[NT.BlockStatement, []],
						]],
					],
					[
						ASTClassDeclaration._({
							joeDoc: ASTJoeDoc._('/** foo */'),
							modifiers: [],
							name: ASTIdentifier._('Foo'),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([]),
						}),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParseAndAnalyze(
					`/* foo */
					class Foo {}`,
					[
						[NT.Comment, '/* foo */'],
						[NT.ClassDeclaration, [
							[NT.Identifier, 'Foo'],
							[NT.BlockStatement, []],
						]],
					],
					[
						ASTClassDeclaration._({
							modifiers: [],
							name: ASTIdentifier._('Foo'),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([]),
						}),
					],
				);
			});
		});

		describe('for a function', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParseAndAnalyze(
					`/** foo */
					f foo {}`,
					[
						[NT.FunctionDeclaration, [
							[NT.JoeDoc, '/** foo */'],
							[NT.Identifier, 'foo'],
							[NT.BlockStatement, []],
						]],
					],
					[
						ASTFunctionDeclaration._({
							joeDoc: ASTJoeDoc._('/** foo */'),
							modifiers: [],
							name: ASTIdentifier._('foo'),
							typeParams: [],
							params: [],
							returnTypes: [],
							body: ASTBlockStatement._([]),
						}),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParseAndAnalyze(
					`/* foo */
					f foo {}`,
					[
						[NT.Comment, '/* foo */'],
						[NT.FunctionDeclaration, [
							[NT.Identifier, 'foo'],
							[NT.BlockStatement, []],
						]],
					],
					[
						ASTFunctionDeclaration._({
							modifiers: [],
							name: ASTIdentifier._('foo'),
							typeParams: [],
							params: [],
							returnTypes: [],
							body: ASTBlockStatement._([]),
						}),
					],
				);
			});
		});

		describe('for an interface', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParseAndAnalyze(
					`/** foo */
					interface Foo {}`,
					[
						[NT.InterfaceDeclaration, [
							[NT.JoeDoc, '/** foo */'],
							[NT.Identifier, 'Foo'],
							[NT.BlockStatement, []],
						]],
					],
					[
						ASTInterfaceDeclaration._({
							joeDoc: ASTJoeDoc._('/** foo */'),
							modifiers: [],
							name: ASTIdentifier._('Foo'),
							typeParams: [],
							extends: [],
							body: ASTBlockStatement._([]),
						}),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParseAndAnalyze(
					`/* foo */
					interface Foo {}`,
					[
						[NT.Comment, '/* foo */'],
						[NT.InterfaceDeclaration, [
							[NT.Identifier, 'Foo'],
							[NT.BlockStatement, []],
						]],
					],
					[
						ASTInterfaceDeclaration._({
							modifiers: [],
							name: ASTIdentifier._('Foo'),
							typeParams: [],
							extends: [],
							body: ASTBlockStatement._([]),
						}),
					],
				);
			});
		});

		describe('for a variable', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testParseAndAnalyze(
					`/** foo */
					const foo = 1;`,
					[
						[NT.VariableDeclaration, 'const', [
							[NT.JoeDoc, '/** foo */'],
							[NT.Identifier, 'foo'],
							[NT.AssignmentOperator],
							[NT.NumberLiteral, '1'],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTVariableDeclaration._({
							joeDoc: ASTJoeDoc._('/** foo */'),
							modifiers: [],
							mutable: false,
							identifier: ASTIdentifier._('foo'),
							initialValue: ASTNumberLiteral._({format: 'int', value: 1}),
						}),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testParseAndAnalyze(
					`/* foo */
					const foo = 1;`,
					[
						[NT.Comment, '/* foo */'],
						[NT.VariableDeclaration, 'const', [
							[NT.Identifier, 'foo'],
							[NT.AssignmentOperator],
							[NT.NumberLiteral, '1'],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: false,
							identifier: ASTIdentifier._('foo'),
							initialValue: ASTNumberLiteral._({format: 'int', value: 1}),
						}),
					],
				);
			});
		});

	})

	describe('Loop', (): void => {

		it('simple loop', () => {
			expect(parse(
				'loop {}')).toMatchParseTree(
				[
					[NT.Loop, [
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with function call in body and done in a condition', () => {
			expect(parse(
				`loop {
					const response = http.server.listen(3,000);

					if response.status.code > 300 {
						done;
					}
				}`)).toMatchParseTree(
				[
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
						[NT.IfStatement, [
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
								[NT.DoneStatement],
								[NT.SemicolonSeparator],
							]],
						]],
					]],
				]],
			]);
		});

	});

	describe('MemberExpression', () => {

		it('works with several nested layers', () => {
			testParseAndAnalyze(
				'a.b.c.d',
				[
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
				],
				[
					ASTMemberExpression._({
						object: ASTMemberExpression._({
							object: ASTMemberExpression._({
								object: ASTIdentifier._('a'),
								property: ASTIdentifier._('b'),
							}),
							property: ASTIdentifier._('c'),
						}),
						property: ASTIdentifier._('d'),
					}),
				],
			);
		});

		it('works with this', () => {
			testParseAndAnalyze(
				'this.foo',
				[
					[NT.MemberExpression, [
						[NT.ThisKeyword],
						[NT.Identifier, 'foo'],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTThisKeyword._(),
						property: ASTIdentifier._('foo'),
					}),
				],
			);
		});

		describe('works with a TypeInstantiationExpression', () => {

			it('on the property', () => {

				testParseAndAnalyze(
					'foo.bar<|T|>',
					[
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'bar'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTIdentifier._('foo'),
							property: ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('bar'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
						}),
					],
				);

			});

			it('on the object and uses dot notation', () => {

				testParseAndAnalyze(
					'foo<|T|>.bar',
					[
						[NT.MemberExpression, [
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'foo'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
							[NT.Identifier, 'bar'],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('foo'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
							property: ASTIdentifier._('bar'),
						}),
					],
				);

			});

			it('on the object and uses bracket notation', () => {

				testParseAndAnalyze(
					'foo<|T|>["bar"]',
					[
						[NT.MemberExpression, [
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'foo'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
							[NT.StringLiteral, 'bar'],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('foo'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
							property: ASTStringLiteral._('bar'),
						}),
					],
				);

			});

			it('with this', () => {

				testParseAndAnalyze(
					'this.bar<|T|>',
					[
						[NT.MemberExpression, [
							[NT.ThisKeyword],
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'bar'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'T'],
								]],
							]],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTThisKeyword._(),
							property: ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('bar'),
								typeArgs: [
									ASTIdentifier._('T'),
								],
							}),
						}),
					],
				);

			});

		});

		it('should parse a string in brackets as a MemberExpression property', () => {
			testParseAndAnalyze(
				'foo["bar"]',
				[
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'bar'],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTStringLiteral._('bar'),
					}),
				],
			);
		});

		it('should parse a number in brackets as a MemberExpression property', () => {
			testParseAndAnalyze(
				'foo[0]',
				[
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.NumberLiteral, '0'],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTNumberLiteral._({format: 'int', value: 0}),
					}),
				],
			);
		});

		it('should parse an identifier in brackets as a MemberExpression property', () => {
			testParseAndAnalyze(
				'foo[bar]',
				[
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.Identifier, 'bar'],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTIdentifier._('bar'),
					}),
				],
			);
		});

		it('should parse a MemberExpression in brackets as a MemberExpression property', () => {
			testParseAndAnalyze(
				'foo[bar.baz]',
				[
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.MemberExpression, [
							[NT.Identifier, 'bar'],
							[NT.Identifier, 'baz'],
						]],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTMemberExpression._({
							object: ASTIdentifier._('bar'),
							property: ASTIdentifier._('baz'),
						}),
					}),
				],
			);
		});

		it('should parse a CallExpression in brackets as a MemberExpression property', () => {
			testParseAndAnalyze(
				'foo[bar()]',
				[
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.CallExpression, [
							[NT.Identifier, 'bar'],
							[NT.ArgumentsList, []],
						]],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTCallExpression._({
							callee: ASTIdentifier._('bar'),
							args: [],
						}),
					}),
				],
			);
		});

		it.each(unaryMathOperatorScenarios)(
			'should parse a UnaryExpression with a ${operator} operator in brackets as a MemberExpression property', ({ operator, before, expression }) => {
			testParseAndAnalyze(
				`foo[${expression}]`,
				[
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.UnaryExpression, operator, {before}, [
							[NT.Identifier, 'bar'],
						]],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTUnaryExpression._({
							before,
							operator,
							operand: ASTIdentifier._('bar'),
						}),
					}),
				],
			);
		});

		it.each(binaryMathOperatorsThatArePartOfAMemberExpression)(
			'should parse a BinaryExpression with a ${operator} operator in brackets as a MemberExpression property',
			(operator) => {
				testParseAndAnalyze(
					`foo[index ${operator} 1]`,
					[
						[NT.MemberExpression, [
							[NT.Identifier, 'foo'],
							[NT.BinaryExpression, operator, [
								[NT.Identifier, 'index'],
								[NT.NumberLiteral, '1'],
							]],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTIdentifier._('foo'),
							property: ASTBinaryExpression._({
								operator,
								left: ASTIdentifier._('index'),
								right: ASTNumberLiteral._({format: 'int', value: 1}),
							}),
						}),
					],
				);
		});

		it('should parse a TernaryExpression in brackets as a MemberExpression property', () => {
			testParseAndAnalyze(
				'foo[bar ? 0 : 1]',
				[
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.TernaryExpression, [
							[NT.TernaryCondition, [
								[NT.Identifier, 'bar'],
							]],
							[NT.TernaryConsequent, [
								[NT.NumberLiteral, '0'],
							]],
							[NT.TernaryAlternate, [
								[NT.NumberLiteral, '1'],
							]],
						]],
					]],
				],
				[
					ASTMemberExpression._({
						object: ASTIdentifier._('foo'),
						property: ASTTernaryExpression._({
							test: ASTTernaryCondition._(
								ASTIdentifier._('bar'),
							),
							consequent: ASTTernaryConsequent._(
								ASTNumberLiteral._({format: 'int', value: 0}),
							),
							alternate: ASTTernaryAlternate._(
								ASTNumberLiteral._({format: 'int', value: 1}),
							),
						}),
					}),
				],
			);
		});

		describe('on literals', () => {

			it('should work on an ArrayExpression', () => {
				testParseAndAnalyze(
					'["A", "B"][0]',
					[
						[NT.MemberExpression, [
							[NT.ArrayExpression, [
								[NT.StringLiteral, 'A'],
								[NT.CommaSeparator],
								[NT.StringLiteral, 'B'],
							]],
							[NT.NumberLiteral, '0'],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTArrayExpression._({
								type: ASTTypePrimitive._('string'),
								items: [
									ASTStringLiteral._('A'),
									ASTStringLiteral._('B'),
								],
							}),
							property: ASTNumberLiteral._({format: 'int', value: 0}),
						}),
					],
				);
			});

			it('should work on a StringLiteral', () => {
				testParseAndAnalyze(
					'"A"[0]',
					[
						[NT.MemberExpression, [
							[NT.StringLiteral, 'A'],
							[NT.NumberLiteral, '0'],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTStringLiteral._('A'),
							property: ASTNumberLiteral._({format: 'int', value: 0}),
						}),
					],
				);
			});

			it('should work directly on a CallExpression', () => {
				testParseAndAnalyze(
					'foo()[0]',
					[
						[NT.MemberExpression, [
							[NT.CallExpression, [
								[NT.Identifier, 'foo'],
								[NT.ArgumentsList, []],
							]],
							[NT.NumberLiteral, '0'],
						]],
					],
					[
						ASTMemberExpression._({
							object: ASTCallExpression._({
								callee: ASTIdentifier._('foo'),
								args: [],
							}),
							property: ASTNumberLiteral._({format: 'int', value: 0}),
						}),
					],
				);
			});

		})

	});

	describe('MemberListExpression', () => {

		it('should parse string properties correctly', () => {
			testParseAndAnalyze(
				`this.foo['a', 'b'];`,
				[
					[NT.MemberListExpression, [
						[NT.MemberExpression, [
							[NT.ThisKeyword],
							[NT.Identifier, 'foo'],
						]],
						[NT.MemberList, [
							[NT.StringLiteral, 'a'],
							[NT.CommaSeparator],
							[NT.StringLiteral, 'b'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTMemberListExpression._({
						object: ASTMemberExpression._({
							object: ASTThisKeyword._(),
							property: ASTIdentifier._('foo'),
						}),
						properties: [
							ASTStringLiteral._('a'),
							ASTStringLiteral._('b'),
						],
					}),
				],
			);
		});

		it('should parse number indexes correctly', () => {
			testParseAndAnalyze(
				`this.foo[1, 3];`,
				[
					[NT.MemberListExpression, [
						[NT.MemberExpression, [
							[NT.ThisKeyword],
							[NT.Identifier, 'foo'],
						]],
						[NT.MemberList, [
							[NT.NumberLiteral, '1'],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '3'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTMemberListExpression._({
						object: ASTMemberExpression._({
							object: ASTThisKeyword._(),
							property: ASTIdentifier._('foo'),
						}),
						properties: [
							ASTNumberLiteral._({format: 'int', value: 1}),
							ASTNumberLiteral._({format: 'int', value: 3}),
						],
					}),
				],
			);
		});

		it('should parse identifier indexes correctly', () => {
			testParseAndAnalyze(
				`foo[a, b];`,
				[
					[NT.MemberListExpression, [
						[NT.Identifier, 'foo'],
						[NT.MemberList, [
							[NT.Identifier, 'a'],
							[NT.CommaSeparator],
							[NT.Identifier, 'b'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTMemberListExpression._({
						object: ASTIdentifier._('foo'),
						properties: [
							ASTIdentifier._('a'),
							ASTIdentifier._('b'),
						],
					}),

				],
			);
		});

		describe('works with a TypeInstantiationExpression', () => {

			it('on the object', () => {

				testParseAndAnalyze(
					'foo<|bar, baz|>["a", "b"];',
					[
						[NT.MemberListExpression, [
							[NT.TypeInstantiationExpression, [
								[NT.Identifier, 'foo'],
								[NT.TypeArgumentsList, [
									[NT.Identifier, 'bar'],
									[NT.CommaSeparator],
									[NT.Identifier, 'baz'],
								]],
							]],
							[NT.MemberList, [
								[NT.StringLiteral, 'a'],
								[NT.CommaSeparator],
								[NT.StringLiteral, 'b'],
							]],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTMemberListExpression._({
							object: ASTTypeInstantiationExpression._({
								base: ASTIdentifier._('foo'),
								typeArgs: [
									ASTIdentifier._('bar'),
									ASTIdentifier._('baz'),
								],
							}),
							properties: [
								ASTStringLiteral._('a'),
								ASTStringLiteral._('b'),
							],
						}),
					],
				);

			})

		});

		it('should parse a RangeExpression in brackets as part of a MemberListExpression', () => {
			testParseAndAnalyze(
				'foo[1..3]',
				[
					[NT.MemberListExpression, [
						[NT.Identifier, 'foo'],
						[NT.MemberList, [
							[NT.RangeExpression, [
								[NT.NumberLiteral, '1'],
								[NT.NumberLiteral, '3'],
							]],
						]],
					]],
				],
				[
					ASTMemberListExpression._({
						object: ASTIdentifier._('foo'),
						properties: [
							ASTRangeExpression._({
								lower: ASTNumberLiteral._({format: 'int', value: 1}),
								upper: ASTNumberLiteral._({format: 'int', value: 3}),
							}),
						],
					}),
				],
			);
		});

		it('should parse multiple RangeExpressions in brackets as part of a MemberListExpression', () => {
			testParseAndAnalyze(
				'foo[1..3, 5..7]',
				[
					[NT.MemberListExpression, [
						[NT.Identifier, 'foo'],
						[NT.MemberList, [
							[NT.RangeExpression, [
								[NT.NumberLiteral, '1'],
								[NT.NumberLiteral, '3'],
							]],
							[NT.CommaSeparator],
							[NT.RangeExpression, [
								[NT.NumberLiteral, '5'],
								[NT.NumberLiteral, '7'],
							]],
						]],
					]],
				],
				[
					ASTMemberListExpression._({
						object: ASTIdentifier._('foo'),
						properties: [
							ASTRangeExpression._({
								lower: ASTNumberLiteral._({format: 'int', value: 1}),
								upper: ASTNumberLiteral._({format: 'int', value: 3}),
							}),
							ASTRangeExpression._({
								lower: ASTNumberLiteral._({format: 'int', value: 5}),
								upper: ASTNumberLiteral._({format: 'int', value: 7}),
							}),
						],
					}),
				],
			);
		});

		it('should parse a UnaryExpression with a logical operator in brackets as part of a MemberListExpression', () => {
			testParseAndAnalyze(
				'foo[!bar]',
				[
					[NT.MemberListExpression, [
						[NT.Identifier, 'foo'],
						[NT.MemberList, [
							[NT.UnaryExpression, '!', {before: true}, [
								[NT.Identifier, 'bar'],
							]],
						]],
					]],
				],
				[
					ASTMemberListExpression._({
						object: ASTIdentifier._('foo'),
						properties: [
							ASTUnaryExpression._({
								before: true,
								operator: '!',
								operand: ASTIdentifier._('bar'),
							}),
						],
					}),
				],
			);
		});

		it.each([unaryMathOperatorScenarios])(
			'should parse multiple UnaryExpressions with any operators in brackets as part of a MemberListExpression',
			({ operator, before, expression }) => {
			testParseAndAnalyze(
				`foo[${expression}, ${expression}]`,
				[
					[NT.MemberListExpression, [
						[NT.Identifier, 'foo'],
						[NT.MemberList, [
							[NT.UnaryExpression, operator, {before}, [
								[NT.Identifier, 'bar'],
							]],
							[NT.CommaSeparator],
							[NT.UnaryExpression, operator, {before}, [
								[NT.Identifier, 'bar'],
							]],
						]],
					]],
				],
				[
					ASTMemberListExpression._({
						object: ASTIdentifier._('foo'),
						properties: [
							ASTUnaryExpression._({
								before,
								operator,
								operand: ASTIdentifier._('bar'),
							}),
							ASTUnaryExpression._({
								before,
								operator,
								operand: ASTIdentifier._('bar'),
							}),
						],
					}),
				],
			);
		});

		it.each(binaryMathOperatorsThatArePartOfAMemberListExpression)(
			'should parse a BinaryExpression with a ${operator} operator in brackets as part of a MemberListExpression',
			(operator) => {
				testParseAndAnalyze(
					`foo[index ${operator} 1]`,
					[
						[NT.MemberListExpression, [
							[NT.Identifier, 'foo'],
							[NT.MemberList, [
								[NT.BinaryExpression, operator, [
									[NT.Identifier, 'index'],
									[NT.NumberLiteral, '1'],
								]],
							]],
						]],
					],
					[
						ASTMemberListExpression._({
							object: ASTIdentifier._('foo'),
							properties: [
								ASTBinaryExpression._({
									operator,
									left: ASTIdentifier._('index'),
									right: ASTNumberLiteral._({format: 'int', value: 1}),
								}),
							],
						}),
					],
				);
			},
		);

		it.each(binaryMathOperatorsThatArePartOfAMemberListExpression)(
			'should parse multiple BinaryExpressions with ${operator} operators in brackets as part of a MemberListExpression',
			(operator) => {
				testParseAndAnalyze(
					`foo[index ${operator} 1, index ${operator} 2]`,
					[
						[NT.MemberListExpression, [
							[NT.Identifier, 'foo'],
							[NT.MemberList, [
								[NT.BinaryExpression, operator, [
									[NT.Identifier, 'index'],
									[NT.NumberLiteral, '1'],
								]],
								[NT.CommaSeparator],
								[NT.BinaryExpression, operator, [
									[NT.Identifier, 'index'],
									[NT.NumberLiteral, '2'],
								]],
							]],
						]],
					],
					[
						ASTMemberListExpression._({
							object: ASTIdentifier._('foo'),
							properties: [
								ASTBinaryExpression._({
									operator,
									left: ASTIdentifier._('index'),
									right: ASTNumberLiteral._({format: 'int', value: 1}),
								}),
								ASTBinaryExpression._({
									operator,
									left: ASTIdentifier._('index'),
									right: ASTNumberLiteral._({format: 'int', value: 2}),
								}),
							],
						}),
					],
				);
			},
		);

	});

	describe('Operators', (): void => {
		describe('UnaryExpression', (): void => {

			describe('negation', () => {

				it('with Identifier', (): void => {
					testParseAndAnalyze(
						'!foo;',
						[
							[NT.UnaryExpression, '!', { before: true }, [
								[NT.Identifier, 'foo'],
							]],
							[NT.SemicolonSeparator],
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '!',
								operand: ASTIdentifier._('foo'),
							}),
						],
					);
				});

				it('with Identifier in parens', (): void => {
					testParseAndAnalyze(
						'(!foo);',
						[
							[NT.Parenthesized, [
								[NT.UnaryExpression, '!', { before: true }, [
									[NT.Identifier, 'foo'],
								]],
							]],
							[NT.SemicolonSeparator],
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '!',
								operand: ASTIdentifier._('foo'),
							}),
						],
					);
				});

				it('with CallExpression', (): void => {
					testParseAndAnalyze(
						'!bar();',
						[
							[NT.UnaryExpression, '!', { before: true }, [
								[NT.CallExpression, [
									[NT.Identifier, 'bar'],
									[NT.ArgumentsList, []],
								]],
							]],
							[NT.SemicolonSeparator],
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '!',
								operand: ASTCallExpression._({
									callee: ASTIdentifier._('bar'),
									args: [],
								}),
							}),
						],
					);
				});

				it('with nested CallExpression', (): void => {
					testParseAndAnalyze(
						'!foo.bar();',
						[
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
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '!',
								operand: ASTCallExpression._({
									callee: ASTMemberExpression._({
										object: ASTIdentifier._('foo'),
										property: ASTIdentifier._('bar'),
									}),
									args: [],
								}),
							}),
						],
					);
				});

			});

			describe('negative number', () => {

				it('without parens', (): void => {
					testParseAndAnalyze(
						'-1',
						[
							[NT.UnaryExpression, '-', { before: true }, [
								[NT.NumberLiteral, '1'],
							]]
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._({format: 'int', value: 1}),
							}),
						],
					);
				});

				it('with parens', (): void => {
					testParseAndAnalyze(
						'(-1)',
						[
							[NT.Parenthesized, [
								[NT.UnaryExpression, '-', { before: true }, [
									[NT.NumberLiteral, '1'],
								]],
							]],
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._({format: 'int', value: 1}),
							}),
						],
					);
				});

			});

			describe('increment and decrement', () => {

				it('pre-decrement', (): void => {
					testParseAndAnalyze(
						'--foo',
						[
							[NT.UnaryExpression, '--', { before: true }, [
								[NT.Identifier, 'foo'],
							]],
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '--',
								operand: ASTIdentifier._('foo'),
							}),
						],
					);

					testParseAndAnalyze(
						'foo[--i]',
						[
							[NT.MemberExpression, [
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '--', { before: true }, [
									[NT.Identifier, 'i'],
								]],
							]],
						],
						[
							ASTMemberExpression._({
								object: ASTIdentifier._('foo'),
								property: ASTUnaryExpression._({
									before: true,
									operator: '--',
									operand: ASTIdentifier._('i'),
								}),
							}),
						],
					);
				});

				it('post-decrement', (): void => {
					testParseAndAnalyze(
						'foo--',
						[
							[NT.UnaryExpression, '--', { before: false }, [
								[NT.Identifier, 'foo'],
							]],
						],
						[
							ASTUnaryExpression._({
								before: false,
								operator: '--',
								operand: ASTIdentifier._('foo'),
							}),
						],
					);
				});

				it('post-decrement in array index', (): void => {
					testParseAndAnalyze(
						'foo[i--]',
						[
							[NT.MemberExpression, [
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '--', { before: false }, [
									[NT.Identifier, 'i'],
								]],
							]],
						],
						[
							ASTMemberExpression._({
								object: ASTIdentifier._('foo'),
								property: ASTUnaryExpression._({
									before: false,
									operator: '--',
									operand: ASTIdentifier._('i'),
								}),
							}),
						],
					);
				});

				it('pre-increment', (): void => {
					testParseAndAnalyze(
						'++foo',
						[
							[NT.UnaryExpression, '++', { before: true }, [
								[NT.Identifier, 'foo'],
							]],
						],
						[
							ASTUnaryExpression._({
								before: true,
								operator: '++',
								operand: ASTIdentifier._('foo'),
							}),
						],
					);

					testParseAndAnalyze(
						'foo[++i]',
						[
							[NT.MemberExpression, [
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '++', { before: true }, [
									[NT.Identifier, 'i'],
								]],
							]],
						],
						[
							ASTMemberExpression._({
								object: ASTIdentifier._('foo'),
								property: ASTUnaryExpression._({
									before: true,
									operator: '++',
									operand: ASTIdentifier._('i'),
								}),
							}),
						],
					);
				});

				it('post-increment', (): void => {
					testParseAndAnalyze(
						'foo++',
						[
							[NT.UnaryExpression, '++', { before: false }, [
								[NT.Identifier, 'foo'],
							]],
						],
						[
							ASTUnaryExpression._({
								before: false,
								operator: '++',
								operand: ASTIdentifier._('foo'),
							}),
						],
					);

					testParseAndAnalyze(
						'foo[i++]',
						[
							[NT.MemberExpression, [
								[NT.Identifier, 'foo'],
								[NT.UnaryExpression, '++', { before: false }, [
									[NT.Identifier, 'i'],
								]],
							]],
						],
						[
							ASTMemberExpression._({
								object: ASTIdentifier._('foo'),
								property: ASTUnaryExpression._({
									before: false,
									operator: '++',
									operand: ASTIdentifier._('i'),
								}),
							}),
						],
					);
				});

				describe('invalid syntax', (): void => {

					it('pre-decrement invalid syntax', (): void => {
						expect(parse('foo---')).toMatchParseTree([
							[NT.BinaryExpression, '-', [
								[NT.UnaryExpression, '--', { before: false }, [
									[NT.Identifier, 'foo'],
								]],
							]],
						]);

						const result = analyze('foo---', true);

						// use assert instead of expect, since we need TS to narrow the type
						assert(result.outcome === 'error', `Expected: "error", Received: "${result.outcome}"`);
						expect(result.error.message).toBe('We were expecting an Expression, but found "undefined"');
					});

					it('pre-increment invalid syntax', (): void => {
						expect(parse('foo+++')).toMatchParseTree([
							[NT.BinaryExpression, '+', [
								[NT.UnaryExpression, '++', { before: false }, [
									[NT.Identifier, 'foo'],
								]],
							]],
						]);

						const result = analyze('foo+++', true);

						// use assert instead of expect, since we need TS to narrow the type
						assert(result.outcome === 'error', `Expected: "error", Received: "${result.outcome}"`);
						expect(result.error.message).toBe('We were expecting an Expression, but found "undefined"');
					});

				});

			});

		});

		describe(NT.BinaryExpression, (): void => {
			describe('with bools', (): void => {
				it('double pipe', (): void => {
					testParseAndAnalyze(
						'a || true',
						[
							[NT.BinaryExpression, '||', [
								[NT.Identifier, 'a'],
								[NT.BoolLiteral, 'true'],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '||',
								left: ASTIdentifier._('a'),
								right: ASTBoolLiteral._(true),
							}),
						],
					);
				});

				it('double ampersand', (): void => {
					testParseAndAnalyze(
						'a && true',
						[
							[NT.BinaryExpression, '&&', [
								[NT.Identifier, 'a'],
								[NT.BoolLiteral, 'true'],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTIdentifier._('a'),
								right: ASTBoolLiteral._(true),
							}),
						],
					);
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

				describe('greater than', (): void => {
					binaryExpressionScenariosCheckingOperator('>');
				});

				describe('greater than or equals', (): void => {
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
					testParseAndAnalyze(
						'foo >= 2 && foo <= 5',
						[
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
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTBinaryExpression._({
									operator: '>=',
									left: ASTIdentifier._('foo'),
									right: ASTNumberLiteral._({format: 'int', value: 2}),
								}),
								right: ASTBinaryExpression._({
									operator: '<=',
									left: ASTIdentifier._('foo'),
									right: ASTNumberLiteral._({format: 'int', value: 5}),
								}),
							}),
						],
					);
				});

				it('makes || higher precedence than equality checks', () => {
					testParseAndAnalyze(
						'foo > 2 || foo < 5',
						[
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
						],
						[
							ASTBinaryExpression._({
								operator: '||',
								left: ASTBinaryExpression._({
									operator: '>',
									left: ASTIdentifier._('foo'),
									right: ASTNumberLiteral._({format: 'int', value: 2}),
								}),
								right: ASTBinaryExpression._({
									operator: '<',
									left: ASTIdentifier._('foo'),
									right: ASTNumberLiteral._({format: 'int', value: 5}),
								}),
							}),
						],
					);
				});

			});

			describe('with parens involved', () => {

				it('around one side', () => {

					testParseAndAnalyze(
						'a && (true)',
						[
							[NT.BinaryExpression, '&&', [
								[NT.Identifier, 'a'],
								[NT.Parenthesized, [
									[NT.BoolLiteral, 'true'],
								]],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTIdentifier._('a'),
								right: ASTBoolLiteral._(true),
							}),
						],
					);

					testParseAndAnalyze(
						'(a) && true',
						[
							[NT.BinaryExpression, '&&', [
								[NT.Parenthesized, [
									[NT.Identifier, 'a'],
								]],
								[NT.BoolLiteral, 'true'],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTIdentifier._('a'),
								right: ASTBoolLiteral._(true),
							}),
						],
					);
				});

				it('with a function call', () => {

					testParseAndAnalyze(
						'a && foo(true)',
						[
							[NT.BinaryExpression, '&&', [
								[NT.Identifier, 'a'],
								[NT.CallExpression, [
									[NT.Identifier, 'foo'],
									[NT.ArgumentsList, [
										[NT.BoolLiteral, 'true'],
									]],
								]],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTIdentifier._('a'),
								right: ASTCallExpression._({
									callee: ASTIdentifier._('foo'),
									args: [
										ASTBoolLiteral._(true),
									],
								}),
							}),
						],
					);

					testParseAndAnalyze(
						'a(true) && foo',
						[
							[NT.BinaryExpression, '&&', [
								[NT.CallExpression, [
									[NT.Identifier, 'a'],
									[NT.ArgumentsList, [
										[NT.BoolLiteral, 'true'],
									]],
								]],
								[NT.Identifier, 'foo'],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTCallExpression._({
									callee: ASTIdentifier._('a'),
									args: [
										ASTBoolLiteral._(true),
									],
								}),
								right: ASTIdentifier._('foo'),
							}),
						],
					);

				});

				it('with a function call in parens', () => {

					testParseAndAnalyze(
						'a && (foo(true))',
						[
							[NT.BinaryExpression, '&&', [
								[NT.Identifier, 'a'],
								[NT.Parenthesized, [
									[NT.CallExpression, [
										[NT.Identifier, 'foo'],
										[NT.ArgumentsList, [
											[NT.BoolLiteral, 'true'],
										]],
									]],
								]],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTIdentifier._('a'),
								right: ASTCallExpression._({
									callee: ASTIdentifier._('foo'),
									args: [
										ASTBoolLiteral._(true),
									],
								}),
							}),
						],
					);

					testParseAndAnalyze(
						'(a(true)) && foo',
						[
							[NT.BinaryExpression, '&&', [
								[NT.Parenthesized, [
									[NT.CallExpression, [
										[NT.Identifier, 'a'],
										[NT.ArgumentsList, [
											[NT.BoolLiteral, 'true'],
										]],
									]],
								]],
								[NT.Identifier, 'foo'],
							]],
						],
						[
							ASTBinaryExpression._({
								operator: '&&',
								left: ASTCallExpression._({
									callee: ASTIdentifier._('a'),
									args: [
										ASTBoolLiteral._(true),
									],
								}),
								right: ASTIdentifier._('foo'),
							}),
						],
					);

				});

			});

		});
	});

	describe('Parens', (): void => {
		describe('mathematical expressions', (): void => {
			it('a simple mathematical formula', (): void => {
				expect(parse(
					'1 + (2 * (-3/-(2.3-4)%9))')).toMatchParseTree(
					[
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
				expect(parse(
					'const foo = 1; let bar = -foo;')).toMatchParseTree(
					[
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

	describe('PostfixIfStatement', (): void => {

		it('after a CallExpression', () => {
			testParseAndAnalyze(
				'do(1) if foo == 2;',
				[
					[NT.PostfixIfStatement, [
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
				],
				[
					ASTPostfixIfStatement._({
						expression: ASTCallExpression._({
							callee: ASTIdentifier._('do'),
							args: [
								ASTNumberLiteral._({format: 'int', value: 1}),
							],
						}),
						test: ASTBinaryExpression._({
							operator: '==',
							left: ASTIdentifier._('foo'),
							right: ASTNumberLiteral._({format: 'int', value: 2}),
						}),
					}),
				],
			);
		});

		describe('in an array', () => {

			it('with bool conditional', () => {
				testParseAndAnalyze(
					'[foo if true, bar];',
					[
						[NT.ArrayExpression, [
							[NT.PostfixIfStatement, [
								[NT.Identifier, 'foo'],
								[NT.BoolLiteral, 'true'],
							]],
							[NT.CommaSeparator],
							[NT.Identifier, 'bar'],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTArrayExpression._({
							type: undefined,
							items: [
								ASTPostfixIfStatement._({
									expression: ASTIdentifier._('foo'),
									test: ASTBoolLiteral._(true),
								}),
								ASTIdentifier._('bar'),
							],
						}),
					],
				);
			});

			it('with identifier conditional', () => {
				testParseAndAnalyze(
					'[9, 10 if isDone?, 11];',
					[
						[NT.ArrayExpression, [
							[NT.NumberLiteral, '9'],
							[NT.CommaSeparator],
							[NT.PostfixIfStatement, [
								[NT.NumberLiteral, '10'],
								[NT.Identifier, 'isDone?'],
							]],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '11'],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('number'),
							items: [
								ASTNumberLiteral._({format: 'int', value: 9}),
								ASTPostfixIfStatement._({
									expression: ASTNumberLiteral._({format: 'int', value: 10}),
									test: ASTIdentifier._('isDone?'),
								}),
								ASTNumberLiteral._({format: 'int', value: 11}),
							],
						}),
					],
				);
			});

			it('with MemberExpression conditional and comment', () => {
				testParseAndAnalyze(
					`[
						9 if this.isDone?, // comment
						10,
						11,
					];`,
					[
						[NT.ArrayExpression, [
							[NT.PostfixIfStatement, [
								[NT.NumberLiteral, '9'],
								[NT.MemberExpression, [
									[NT.ThisKeyword],
									[NT.Identifier, 'isDone?'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.Comment, '// comment'], // will be removed in the AST
							[NT.NumberLiteral, '10'],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '11'],
							[NT.CommaSeparator],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('number'),
							items: [
								ASTPostfixIfStatement._({
									expression: ASTNumberLiteral._({format: 'int', value: 9}),
									test: ASTMemberExpression._({
										object: ASTThisKeyword._(),
										property: ASTIdentifier._('isDone?'),
									}),
								}),
								ASTNumberLiteral._({format: 'int', value: 10}),
								ASTNumberLiteral._({format: 'int', value: 11}),
							],
						}),
					],
				);
			});

			it('with CallExpression conditional', () => {
				testParseAndAnalyze(
					'[9, 10 if this.isDone?([true if true]), 11];',
					[
						[NT.ArrayExpression, [
							[NT.NumberLiteral, '9'],
							[NT.CommaSeparator],
							[NT.PostfixIfStatement, [
								[NT.NumberLiteral, '10'],
								[NT.CallExpression, [
									[NT.MemberExpression, [
										[NT.ThisKeyword],
										[NT.Identifier, 'isDone?'],
									]],
									[NT.ArgumentsList, [
										[NT.ArrayExpression, [
											[NT.PostfixIfStatement, [
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
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('number'),
							items: [
								ASTNumberLiteral._({format: 'int', value: 9}),
								ASTPostfixIfStatement._({
									expression: ASTNumberLiteral._({format: 'int', value: 10}),
									test: ASTCallExpression._({
										callee: ASTMemberExpression._({
											object: ASTThisKeyword._(),
											property: ASTIdentifier._('isDone?'),
										}),
										args: [
											ASTArrayExpression._({
												type: ASTTypePrimitive._('bool'),
												items: [
													ASTPostfixIfStatement._({
														expression: ASTBoolLiteral._(true),
														test: ASTBoolLiteral._(true),
													}),
												],
											}),
										],
									}),
								}),
								ASTNumberLiteral._({format: 'int', value: 11}),
							],
						}),
					],
				);
			});

			it('with BinaryExpression conditional using two NumberLiterals', () => {
				testParseAndAnalyze(
					'[\'foo\', "bar" if 1 < 2];',
					[
						[NT.ArrayExpression, [
							[NT.StringLiteral, 'foo'],
							[NT.CommaSeparator],
							[NT.PostfixIfStatement, [
								[NT.StringLiteral, 'bar'],
								[NT.BinaryExpression, '<', [
									[NT.NumberLiteral, '1'],
									[NT.NumberLiteral, '2'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('string'),
							items: [
								ASTStringLiteral._('foo'),
								ASTPostfixIfStatement._({
									expression: ASTStringLiteral._('bar'),
									test: ASTBinaryExpression._({
										operator: '<',
										left: ASTNumberLiteral._({format: 'int', value: 1}),
										right: ASTNumberLiteral._({format: 'int', value: 2}),
									}),
								}),
							],
						}),
					],
				);
			});

			it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
				testParseAndAnalyze(
					'[true, true, false, false if foo == 2, true, false, true];',
					[
						[NT.ArrayExpression, [
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'false'],
							[NT.CommaSeparator],
							[NT.PostfixIfStatement, [
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
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('bool'),
							items: [
								ASTBoolLiteral._(true),
								ASTBoolLiteral._(true),
								ASTBoolLiteral._(false),
								ASTPostfixIfStatement._({
									expression: ASTBoolLiteral._(false),
									test: ASTBinaryExpression._({
										operator: '==',
										left: ASTIdentifier._('foo'),
										right: ASTNumberLiteral._({format: 'int', value: 2}),
									}),
								}),
								ASTBoolLiteral._(true),
								ASTBoolLiteral._(false),
								ASTBoolLiteral._(true),
							],
						}),
					]);
				},
			);

		});

	});

	describe('Print', () => {

		it('is closed with a semicolon', () => {
			expect(parse(
				'print foo[5];print 5;')).toMatchParseTree(
				[
					[NT.PrintStatement, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.NumberLiteral, '5'],
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
			expect(parse(
				'print myFoo.foo();')).toMatchParseTree(
				[
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

	describe('RangeExpression', (): void => {
		// 2 numbers
		it(`.. with 2 number literals`, (): void => {
			testParseAndAnalyze(
				`1 .. 2;`,
				[
					[NT.RangeExpression, [
						[NT.NumberLiteral, '1'],
						[NT.NumberLiteral, '2'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTRangeExpression._({
						lower: ASTNumberLiteral._({format: 'int', value: 1}),
						upper: ASTNumberLiteral._({format: 'int', value: 2}),
					}),
				],
			);

			testParseAndAnalyze(
				`-1 .. 2;`,
				[
					[NT.RangeExpression, [
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '1'],
						]],
						[NT.NumberLiteral, '2'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTRangeExpression._({
						lower: ASTUnaryExpression._({
							before: true,
							operator: '-',
							operand: ASTNumberLiteral._({format: 'int', value: 1}),
						}),
						upper: ASTNumberLiteral._({format: 'int', value: 2}),
					}),
				],
			);

			testParseAndAnalyze(
				`1 .. -2;`,
				[
					[NT.RangeExpression, [
						[NT.NumberLiteral, '1'],
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '2'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTRangeExpression._({
						lower: ASTNumberLiteral._({format: 'int', value: 1}),
						upper: ASTUnaryExpression._({
							before: true,
							operator: '-',
							operand: ASTNumberLiteral._({format: 'int', value: 2}),
						}),
					}),
				],
			);

			testParseAndAnalyze(
				`-1 .. -2;`,
				[
					[NT.RangeExpression, [
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '1'],
						]],
						[NT.UnaryExpression, '-', { before: true }, [
							[NT.NumberLiteral, '2'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTRangeExpression._({
						lower: ASTUnaryExpression._({
							before: true,
							operator: '-',
							operand: ASTNumberLiteral._({format: 'int', value: 1}),
						}),
						upper: ASTUnaryExpression._({
							before: true,
							operator: '-',
							operand: ASTNumberLiteral._({format: 'int', value: 2}),
						}),
					}),
				],
			);
		});

		// identifier and number
		it(`.. with identifier and number literal`, (): void => {
			testParseAndAnalyze(
				`foo .. 2;`,
				[
					[NT.RangeExpression, [
						[NT.Identifier, 'foo'],
						[NT.NumberLiteral, '2'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTRangeExpression._({
						lower: ASTIdentifier._('foo'),
						upper: ASTNumberLiteral._({format: 'int', value: 2}),
					}),
				],
			);
		});

		it(`.. with number literal and identifier`, (): void => {
			testParseAndAnalyze(
				`1 .. foo;`,
				[
					[NT.RangeExpression, [
						[NT.NumberLiteral, '1'],
						[NT.Identifier, 'foo'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTRangeExpression._({
						lower: ASTNumberLiteral._({format: 'int', value: 1}),
						upper: ASTIdentifier._('foo'),
					}),
				],
			);
		});

		// element access and number
		it(`.. with element access and number literal`, (): void => {
			expect(parse(`foo['a'] .. 2;`)).toMatchParseTree([
				[NT.RangeExpression, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'a'],
					]],
					[NT.NumberLiteral, '2'],
				]],
				[NT.SemicolonSeparator],
			]);
		});

		it(`.. with number literal and element access`, (): void => {
			expect(parse(`1 .. foo['a'];'a'`)).toMatchParseTree([
				[NT.RangeExpression, [
					[NT.NumberLiteral, '1'],
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'a'],
					]],
				]],
				[NT.SemicolonSeparator],
				[NT.StringLiteral, 'a'],
			]);
		});

		// method call and number
		it(`.. with method call and number literal`, (): void => {
			expect(parse(`foo('a') .. 2;`)).toMatchParseTree([
				[NT.RangeExpression, [
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

		it(`.. with number literal and method call`, (): void => {
			expect(parse(`1 .. foo('a');`)).toMatchParseTree([
				[NT.RangeExpression, [
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
		it(`.. with element access and method call`, (): void => {
			expect(parse(`foo['a'] .. bar('b');`)).toMatchParseTree([
				[NT.RangeExpression, [
					[NT.MemberExpression, [
						[NT.Identifier, 'foo'],
						[NT.StringLiteral, 'a'],
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
		it(`.. with method call and element access`, (): void => {
			expect(parse(`foo('a') .. bar['b'];`)).toMatchParseTree([
				[NT.RangeExpression, [
					[NT.CallExpression, [
						[NT.Identifier, 'foo'],
						[NT.ArgumentsList, [
							[NT.StringLiteral, 'a'],
						]],
					]],
					[NT.MemberExpression, [
						[NT.Identifier, 'bar'],
						[NT.StringLiteral, 'b'],
					]],
				]],
				[NT.SemicolonSeparator],
			]);
		});
	});

	describe('RepeatStatement', (): void => {

		it('simple repeat statement', () => {
			expect(parse(
				'repeat {}')).toMatchParseTree(
				[
					[NT.RepeatStatement, [
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with done', () => {
			expect(parse(
				'repeat {\ndone;\n}')).toMatchParseTree(
				[
					[NT.RepeatStatement, [
					[NT.BlockStatement, [
						[NT.DoneStatement],
						[NT.SemicolonSeparator],
					]],
				]],
			]);
		});

	});

	describe('Types', (): void => {
		describe('should understand primitive types', () => {
			it.each(types)('%s is recognized as a type', (type) => {
				expect(parse(
					type)).toMatchParseTree(
					[
						[NT.Type, type],
				]);
			});

			it.each(types)('%s[] is recognized as a one-dimensional array of type', (type) => {
				expect(parse(
					`${type}[]`)).toMatchParseTree(
					[
						[NT.ArrayOf, [
						[NT.Type, type],
					]],
				]);
			});

			it.each(types)('%s[][] is recognized as a two-dimensional array of type', (type) => {
				expect(parse(
					`${type}[][]`)).toMatchParseTree(
					[
						[NT.ArrayOf, [
						[NT.ArrayOf, [
							[NT.Type, type],
						]],
					]],
				]);
			});
		});

		describe('arrays', () => {

			it('should understand a custom array', () => {
				expect(parse(
					'Foo[]')).toMatchParseTree(
					[
						[NT.ArrayOf, [
						[NT.Identifier, 'Foo'],
					]],
				]);

				expect(parse(
					'Foo[][]')).toMatchParseTree(
					[
						[NT.ArrayOf, [
						[NT.ArrayOf, [
							[NT.Identifier, 'Foo'],
						]],
					]],
				]);
			});

		});

		describe('ranges', () => {

			it('should recognize a range type in a variable declaration', () => {
				testParseAndAnalyze(
					'let x: range;',
					[
						[NT.VariableDeclaration, 'let', [
							[NT.Identifier, 'x'],
							[NT.ColonSeparator],
							[NT.Type, 'range'],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: true,
							identifier: ASTIdentifier._('x'),
							declaredType: ASTTypeRange._(),
						}),
					],
				);
			});

			it('should infer a range type for a variable declaration with an initial value and also ignore parentheses', () => {
				testParseAndAnalyze(
					'let x = 1 .. (2);',
					[
						[NT.VariableDeclaration, 'let', [
							[NT.Identifier, 'x'],
							[NT.AssignmentOperator],
							[NT.RangeExpression, [
								[NT.NumberLiteral, '1'],
								[NT.Parenthesized, [
									[NT.NumberLiteral, '2'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: true,
							identifier: ASTIdentifier._('x'),
							initialValue: ASTRangeExpression._({
								lower: ASTNumberLiteral._({format: 'int', value: 1}),
								upper: ASTNumberLiteral._({format: 'int', value: 2}),
							}),
							inferredType: ASTTypeRange._(),
						}),
					],
				);
			});

			it('should recognize a range type in a function parameter and return type', () => {
				testParseAndAnalyze(
					'f foo (x: range) -> range {}',
					[
						[NT.FunctionDeclaration, [
							[NT.Identifier, 'foo'],
							[NT.ParametersList, [
								[NT.Parameter, [
									[NT.Identifier, 'x'],
									[NT.ColonSeparator],
									[NT.Type, 'range'],
								]],
							]],
							[NT.FunctionReturns, [
								[NT.Type, 'range'],
							]],
							[NT.BlockStatement, []],
						]],

					],
					[
						ASTFunctionDeclaration._({
							modifiers: [],
							name: ASTIdentifier._('foo'),
							typeParams: [],
							params: [
								ASTParameter._({
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('x'),
									declaredType: ASTTypeRange._(),
								}),
							],
							returnTypes: [
								ASTTypeRange._(),
							],
							body: ASTBlockStatement._([]),
						}),
					],
				);
			});

		});

	});

	describe('VariableDeclaration', (): void => {
		it('a let assignment with a bool literal', (): void => {
			testParseAndAnalyze(
				'let x = false',
				[
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'x'],
						[NT.AssignmentOperator],
						[NT.BoolLiteral, 'false'],
					]],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifier: ASTIdentifier._('x'),
						initialValue: ASTBoolLiteral._(false),
						inferredType: ASTTypePrimitive._('bool'),
					}),
				]
			)

			testParseAndAnalyze(
				'let x? = false',
				[
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'x?'],
						[NT.AssignmentOperator],
						[NT.BoolLiteral, 'false'],
					]],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifier: ASTIdentifier._('x?'),
						initialValue: ASTBoolLiteral._(false),
						inferredType: ASTTypePrimitive._('bool'),
					}),
				]
			);

		});

		it('a let assignment with a number literal', (): void => {
			testParseAndAnalyze(
				'let x = 1',
				[
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'x'],
						[NT.AssignmentOperator],
						[NT.NumberLiteral, '1'],
					]],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifier: ASTIdentifier._('x'),
						initialValue: ASTNumberLiteral._({format: 'int', value: 1}),
						inferredType: ASTTypePrimitive._('number'),
					}),
				]
			);

			testParseAndAnalyze(
				'const x = -2,300.006^e-2,000; const y = 5;',
				[
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
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('x'),
						initialValue: ASTBinaryExpression._({
							operator: '^e',
							left: ASTUnaryExpression._({
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._({format: 'decimal', value: 2300.006}),
							}),
							right: ASTUnaryExpression._({
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._({format: 'int', value: 2000}),
							}),
						}),
						inferredType: ASTTypePrimitive._('number'),
					}),
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('y'),
						initialValue: ASTNumberLiteral._({format: 'int', value: 5}),
						inferredType: ASTTypePrimitive._('number'),
					}),
				]
			);
		});

		it('a let assignment with a string literal', (): void => {
			testParseAndAnalyze(
				'let x = "foo"',
				[
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'x'],
						[NT.AssignmentOperator],
						[NT.StringLiteral, 'foo'],
					]],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifier: ASTIdentifier._('x'),
						initialValue: ASTStringLiteral._('foo'),
						inferredType: ASTTypePrimitive._('string'),
					}),
				]
			);
		});

		it('a let with a specified type', (): void => {

			testParseAndAnalyze(
				'let x: string;',
				[
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'x'],
						[NT.ColonSeparator],
						[NT.Type, 'string'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifier: ASTIdentifier._('x'),
						declaredType: ASTTypePrimitive._('string'),
					}),
				],
			);

			testParseAndAnalyze(
				'let x?: bool;',
				[
					[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'x?'],
						[NT.ColonSeparator],
						[NT.Type, 'bool'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifier: ASTIdentifier._('x?'),
						declaredType: ASTTypePrimitive._('bool'),
					}),
				],
			);
		});

		it('a const assignment with a specified type', (): void => {
			testParseAndAnalyze(
				'const x: string = "foo"',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'x'],
						[NT.ColonSeparator],
						[NT.Type, 'string'],
						[NT.AssignmentOperator],
						[NT.StringLiteral, 'foo'],
					]],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('x'),
						declaredType: ASTTypePrimitive._('string'),
						initialValue: ASTStringLiteral._('foo'),
						inferredType: ASTTypePrimitive._('string'),
					}),
				],
			);
		});

		it('regex', (): void => {
			testParseAndAnalyze(
				'const x = /[a-z]/;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'x'],
						[NT.AssignmentOperator],
						[NT.RegularExpression, '/[a-z]/'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('x'),
						initialValue: ASTRegularExpression._({pattern: '/[a-z]/', flags: []}),
						inferredType: ASTTypePrimitive._('regex'),
					}),
				],
			);

			testParseAndAnalyze(
				'const x: regex = /[0-9]*/g;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'x'],
						[NT.ColonSeparator],
						[NT.Type, 'regex'],
						[NT.AssignmentOperator],
						[NT.RegularExpression, '/[0-9]*/g'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('x'),
						declaredType: ASTTypePrimitive._('regex'),
						initialValue: ASTRegularExpression._({pattern: '/[0-9]*/', flags: ['g']}),
						inferredType: ASTTypePrimitive._('regex'),
					}),
				],
			);
		});

		it('path', (): void => {
			testParseAndAnalyze(
				'const dir = @/path/to/dir/;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'dir'],
						[NT.AssignmentOperator],
						[NT.Path, '@/path/to/dir/'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('dir'),
						initialValue: ASTPath._({absolute: true, path: '@/path/to/dir/', isDir: true}),
						inferredType: ASTTypePrimitive._('path'),
					}),
				],
			);

			testParseAndAnalyze(
				'const dir = ./myDir/;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'dir'],
						[NT.AssignmentOperator],
						[NT.Path, './myDir/'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('dir'),
						initialValue: ASTPath._({absolute: false, path: './myDir/', isDir: true}),
						inferredType: ASTTypePrimitive._('path'),
					}),
				],
			);

			testParseAndAnalyze(
				'const file: path = @/path/to/file.joe;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'file'],
						[NT.ColonSeparator],
						[NT.Type, 'path'],
						[NT.AssignmentOperator],
						[NT.Path, '@/path/to/file.joe'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('file'),
						declaredType: ASTTypePrimitive._('path'),
						initialValue: ASTPath._({absolute: true, path: '@/path/to/file.joe', isDir: false}),
						inferredType: ASTTypePrimitive._('path'),
					}),
				],
			);
		});

		it('assign to another variable', () => {
			testParseAndAnalyze(
				'const dir = foo;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'dir'],
						[NT.AssignmentOperator],
						[NT.Identifier, 'foo'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('dir'),
						initialValue: ASTIdentifier._('foo'),
					}),
				],
			);
		})

		describe('custom type', (): void => {

			it('one word', (): void => {
				testParseAndAnalyze(
					'const myClass: MyClass = MyClass.create();',
					[
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
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: false,
							identifier: ASTIdentifier._('myClass'),
							declaredType: ASTIdentifier._('MyClass'),
							initialValue: ASTCallExpression._({
								callee: ASTMemberExpression._({
									object: ASTIdentifier._('MyClass'),
									property: ASTIdentifier._('create'),
								}),
								args: [],
							}),
						}),
					],
				);
			});

			it('member expression', (): void => {
				testParseAndAnalyze(
					'const myClass: MyPackage.MyClass = MyClass.create();',
					[
						[NT.VariableDeclaration, 'const', [
							[NT.Identifier, 'myClass'],
							[NT.ColonSeparator],
							[NT.MemberExpression, [
								[NT.Identifier, 'MyPackage'],
								[NT.Identifier, 'MyClass'],
							]],
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
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: false,
							identifier: ASTIdentifier._('myClass'),
							declaredType: ASTMemberExpression._({
								object: ASTIdentifier._('MyPackage'),
								property: ASTIdentifier._('MyClass'),
							}),
							initialValue: ASTCallExpression._({
								callee: ASTMemberExpression._({
									object: ASTIdentifier._('MyClass'),
									property: ASTIdentifier._('create'),
								}),
								args: [],
							}),
						}),
					],
				);
			});

		});

		describe('tuples', () => {

			it('tuple', () => {
				expect(parse(
					'const foo = <1, "pizza", 3.14>;')).toMatchParseTree(
					[
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
				expect(parse(
					'const foo = <>;')).toMatchParseTree(
					[
						[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.TupleExpression, []],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('nested tuples', () => {
				expect(parse(
					`const foo = <
						<1, 'pizza', 3.14>,
						true,
						@/some/file.joe,
						1..3,
						<1, 2, 'fizz', 4, 'buzz'>
					>;`)).toMatchParseTree(
					[
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
				expect(parse(
					`<
						1,
						someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
						true
					>`)).toMatchParseTree(
					[
						[NT.TupleExpression, [
						[NT.NumberLiteral, '1'],
						[NT.CommaSeparator],
						[NT.TernaryExpression, [
							[NT.TernaryCondition, [
								[NT.Identifier, 'someCondition'],
							]],
							[NT.TernaryConsequent, [
								[NT.StringLiteral, 'burnt-orange'],
							]],
							[NT.TernaryAlternate, [
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
				expect(parse(
					'const foo = {tpl: <1>};')).toMatchParseTree(
					[
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
				testParseAndAnalyze(
					'[false, true, true, false]',
					[
						[NT.ArrayExpression, [
							[NT.BoolLiteral, 'false'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'true'],
							[NT.CommaSeparator],
							[NT.BoolLiteral, 'false'],
						]],
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('bool'),
							items: [
								ASTBoolLiteral._(false),
								ASTBoolLiteral._(true),
								ASTBoolLiteral._(true),
								ASTBoolLiteral._(false),
							],
						})
					]
				);
			});

			it('numbers', () => {
				testParseAndAnalyze(
					'[1, -2, 3,456, 3^e-2, 3.14, 1,2,3]',
					[
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
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('number'),
							items: [
								ASTNumberLiteral._({ format: 'int', value: 1 }),
								ASTUnaryExpression._({
									before: true,
									operator: '-',
									operand: ASTNumberLiteral._({ format: 'int', value: 2 }),
								}),
								ASTNumberLiteral._({ format: 'int', value: 3456}),
								ASTBinaryExpression._({
									operator: '^e',
									left: ASTNumberLiteral._({ format: 'int', value: 3 }),
									right: ASTUnaryExpression._({
										before: true,
										operator: '-',
										operand: ASTNumberLiteral._({ format: 'int', value: 2}),
									}),
								}),
								ASTNumberLiteral._({ format: 'decimal', value: 3.14}),
								ASTNumberLiteral._({ format: 'int', value: 123}),
							],
						}),
					]
				);
			});

			it('paths', (): void => {
				expect(parse(
					'[@/file.joe, @/another/file.joe]')).toMatchParseTree(
					[
						[NT.ArrayExpression, [
						[NT.Path, '@/file.joe'],
						[NT.CommaSeparator],
						[NT.Path, '@/another/file.joe'],
					]],
				]);
			});

			it('regexes', (): void => {
				expect(parse(
					'[/[a-z]/i, /[0-9]/g, /\d/]')).toMatchParseTree(
					[
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
				expect(parse(
					'[\'foo\', "bar"]')).toMatchParseTree(
					[
						[NT.ArrayExpression, [
						[NT.StringLiteral, 'foo'],
						[NT.CommaSeparator],
						[NT.StringLiteral, 'bar'],
					]],
				]);
			});

			it('tuples', () => {
				expect(parse(
					"const foo: <string, number, bool>[] = [<'foo', 3.14, false>, <'bar', 900, true>];")).toMatchParseTree(
					[
						[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.ColonSeparator],
						[NT.ArrayOf, [
							[NT.TupleShape, [
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
				expect(parse(
					"const foo: {a: number, b: string}[] = [{a: 4, b: 'c'}];")).toMatchParseTree(
					[
						[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.ColonSeparator],
						[NT.ArrayOf, [
							[NT.ObjectShape, [
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
				testParseAndAnalyze(
					'const numbers = [1, 2];',
					[
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
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: false,
							identifier: ASTIdentifier._('numbers'),
							initialValue: ASTArrayExpression._({
								type: ASTTypePrimitive._('number'),
								items: [
									ASTNumberLiteral._({ format: 'int', value: 1}),
									ASTNumberLiteral._({ format: 'int', value: 2}),
								],
							}),
						}),
					],
				);

				expect(parse(
					'let myArray: bool[] = [];')).toMatchParseTree(
					[
						[NT.VariableDeclaration, 'let', [
						[NT.Identifier, 'myArray'],
						[NT.ColonSeparator],
						[NT.ArrayOf, [
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
				testParseAndAnalyze(
					'const foo = bar ? 1 : 2;',
					[
						[NT.VariableDeclaration, 'const', [
							[NT.Identifier, 'foo'],
							[NT.AssignmentOperator],
							[NT.TernaryExpression, [
								[NT.TernaryCondition, [
									[NT.Identifier, 'bar'],
								]],
								[NT.TernaryConsequent, [
									[NT.NumberLiteral, '1'],
								]],
								[NT.TernaryAlternate, [
									[NT.NumberLiteral, '2'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: false,
							identifier: ASTIdentifier._('foo'),
							initialValue: ASTTernaryExpression._({
								test: ASTTernaryCondition._(
									ASTIdentifier._('bar'),
								),
								consequent: ASTTernaryConsequent._(
									ASTNumberLiteral._({ format: 'int', value: 1}),
								),
								alternate: ASTTernaryAlternate._(
									ASTNumberLiteral._({ format: 'int', value: 2}),
								),
							}),
						}),
					],
				);
			});

			it('should work when nested', () => {
				testParseAndAnalyze(
					'const foo = bar ? (baz ? 3 : 4) : 2;',
					[
						[NT.VariableDeclaration, 'const', [
							[NT.Identifier, 'foo'],
							[NT.AssignmentOperator],
							[NT.TernaryExpression, [
								[NT.TernaryCondition, [
									[NT.Identifier, 'bar'],
								]],
								[NT.TernaryConsequent, [
									[NT.Parenthesized, [
										[NT.TernaryExpression, [
											[NT.TernaryCondition, [
												[NT.Identifier, 'baz'],
											]],
											[NT.TernaryConsequent, [
												[NT.NumberLiteral, '3'],
											]],
											[NT.TernaryAlternate, [
												[NT.NumberLiteral, '4'],
											]],
										]],
									]],
								]],
								[NT.TernaryAlternate, [
									[NT.NumberLiteral, '2'],
								]],
							]],
						]],
						[NT.SemicolonSeparator],
					],
					[
						ASTVariableDeclaration._({
							modifiers: [],
							mutable: false,
							identifier: ASTIdentifier._('foo'),
							initialValue: ASTTernaryExpression._({
								test: ASTTernaryCondition._(
									ASTIdentifier._('bar'),
								),
								consequent: ASTTernaryConsequent._(
									ASTTernaryExpression._({
										test: ASTTernaryCondition._(
											ASTIdentifier._('baz'),
										),
										consequent: ASTTernaryConsequent._(
											ASTNumberLiteral._({ format: 'int', value: 3}),
										),
										alternate: ASTTernaryAlternate._(
											ASTNumberLiteral._({ format: 'int', value: 4}),
										),
									}),
								),
								alternate: ASTTernaryAlternate._(
									ASTNumberLiteral._({ format: 'int', value: 2}),
								),
							}),
						}),
					],
				);
			});

			it('should work in an array', () => {
				testParseAndAnalyze(
					'[foo ? 1 : 2, 3]',
					[
						[NT.ArrayExpression, [
							[NT.TernaryExpression, [
								[NT.TernaryCondition, [
									[NT.Identifier, 'foo'],
								]],
								[NT.TernaryConsequent, [
									[NT.NumberLiteral, '1'],
								]],
								[NT.TernaryAlternate, [
									[NT.NumberLiteral, '2'],
								]],
							]],
							[NT.CommaSeparator],
							[NT.NumberLiteral, '3'],
						]],
					],
					[
						ASTArrayExpression._({
							type: ASTTypePrimitive._('number'),
							items: [
								ASTTernaryExpression._({
									test: ASTTernaryCondition._(
										ASTIdentifier._('foo'),
									),
									consequent: ASTTernaryConsequent._(
										ASTNumberLiteral._({ format: 'int', value: 1}),
									),
									alternate: ASTTernaryAlternate._(
										ASTNumberLiteral._({ format: 'int', value: 2}),
									),
								}),
								ASTNumberLiteral._({ format: 'int', value: 3}),
							],
						}),
					],
				);
			});

			it('should work in a return', () => {
				testParseAndAnalyze(
					`f foo -> bool, number {
						return bar ? true : false, 3;
					}`,
					[
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
										[NT.TernaryConsequent, [
											[NT.BoolLiteral, 'true'],
										]],
										[NT.TernaryAlternate, [
											[NT.BoolLiteral, 'false'],
										]],
									]],
									[NT.CommaSeparator],
									[NT.NumberLiteral, '3'],
								]],
								[NT.SemicolonSeparator],
							]]
						]],
					],
					[
						ASTFunctionDeclaration._({
							modifiers: [],
							name: ASTIdentifier._('foo'),
							typeParams: [],
							params: [],
							returnTypes: [
								ASTTypePrimitive._('bool'),
								ASTTypePrimitive._('number'),
							],
							body: ASTBlockStatement._([
								ASTReturnStatement._([
									ASTTernaryExpression._({
										test: ASTTernaryCondition._(
											ASTIdentifier._('bar'),
										),
										consequent: ASTTernaryConsequent._(
											ASTBoolLiteral._(true),
										),
										alternate: ASTTernaryAlternate._(
											ASTBoolLiteral._(false),
										),
									}),
									ASTNumberLiteral._({ format: 'int', value: 3}),
								]),
							]),
						}),
					],
				);
			});

		});

		describe('pojos', () => {

			it('pojo', () => {
				expect(parse(
					'const foo = {a: 1, b: "pizza", c: 3.14, d: [10, 11]};')).toMatchParseTree(
					[
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
				expect(parse(
					'const foo = {};')).toMatchParseTree(
					[
						[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.ObjectExpression, []],
					]],
					[NT.SemicolonSeparator],
				]);
			});

			it('nested pojos', () => {
				expect(parse(
					`const foo = {
						obj: {a: 1, b: 'pizza', pi: {two_digits: 3.14}},
						bol: true,
						pth: @/some/file.joe,
						rng: {rng: 1..3},
						tpl: <1, 2, 'fizz', 4, 'buzz'>
					};`)).toMatchParseTree(
					[
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
									[NT.Identifier, 'rng'],
									[NT.ObjectExpression, [
										[NT.Property, [
											[NT.Identifier, 'rng'],
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
				expect(parse(
					`{
						a: 1,
						b: someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
						c: true
					}`)).toMatchParseTree(
					[
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
								[NT.TernaryConsequent, [
									[NT.StringLiteral, 'burnt-orange'],
								]],
								[NT.TernaryAlternate, [
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
				expect(parse(
					`{
						a: [1]
					}`)).toMatchParseTree(
					[
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
				expect(parse(
					`{
						a: [foo[1]]
					}`)).toMatchParseTree(
					[
						[NT.ObjectExpression, [
						[NT.Property, [
							[NT.Identifier, 'a'],
							[NT.ArrayExpression, [
								[NT.MemberExpression, [
									[NT.Identifier, 'foo'],
									[NT.NumberLiteral, '1'],
								]],
							]],
						]],
					]],
				]);
			});

		});

		it('should assign this', () => {
			testParseAndAnalyze(
				'const foo = this;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.ThisKeyword],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('foo'),
						initialValue: ASTThisKeyword._(),
					}),
				],
			);
		});

		it('should assign to a property on this instance', () => {
			testParseAndAnalyze(
				'this.foo = 1;',
				[
					[NT.AssignmentExpression, [
						[NT.MemberExpression, [
							[NT.ThisKeyword],
							[NT.Identifier, 'foo'],
						]],
						[NT.AssignmentOperator],
						[NT.NumberLiteral, '1'],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTAssignmentExpression._({
						left: ASTMemberExpression._({
							object: ASTThisKeyword._(),
							property: ASTIdentifier._('foo'),
						}),
						right: ASTNumberLiteral._({format: 'int', value: 1}),
					}),
				],
			);
		});

		it('should assign a range', () => {
			testParseAndAnalyze(
				'const foo = 1..3;',
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'foo'],
						[NT.AssignmentOperator],
						[NT.RangeExpression, [
							[NT.NumberLiteral, '1'],
							[NT.NumberLiteral, '3'],
						]],
					]],
					[NT.SemicolonSeparator],
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('foo'),
						initialValue: ASTRangeExpression._({
							lower: ASTNumberLiteral._({format: 'int', value: 1}),
							upper: ASTNumberLiteral._({format: 'int', value: 3}),
						}),
					}),
				],
			);
		});

	});

	describe('WhenExpression', (): void => {

		it('works with a small example', () => {
			testParseAndAnalyze(
				`when (someNumber) {
					1 -> 'small',
				}`,
				[
					[NT.WhenExpression, [
						[NT.Parenthesized, [
							[NT.Identifier, 'someNumber'],
						]],
						[NT.BlockStatement, [
							[NT.WhenCase, [
								[NT.WhenCaseValues, [
									[NT.NumberLiteral, '1'],
								]],
								[NT.WhenCaseConsequent, [
									[NT.StringLiteral, 'small'],
								]],
							]],
							[NT.CommaSeparator],
						]],
					]],
				],
				[
					ASTWhenExpression._({
						expression: ASTIdentifier._('someNumber'),
						cases: [
							ASTWhenCase._({
								values: [
									ASTNumberLiteral._({format: 'int', value: 1}),
								],
								consequent: ASTStringLiteral._('small'),
							}),
						],
					}),
				],
			);
		});

		it('case with brace', () => {
			testParseAndAnalyze(
				`when someNumber {
					1 -> {
						doThing1();
						doThing2();

						return 'large';
					},
				}`,
				[
					[NT.WhenExpression, [
						[NT.Identifier, 'someNumber'],
						[NT.BlockStatement, [
							[NT.WhenCase, [
								[NT.WhenCaseValues, [
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
				],
				[
					ASTWhenExpression._({
						expression: ASTIdentifier._('someNumber'),
						cases: [
							ASTWhenCase._({
								values: [
									ASTNumberLiteral._({format: 'int', value: 1}),
								],
								consequent: ASTBlockStatement._([
									ASTCallExpression._({
										callee: ASTIdentifier._('doThing1'),
										args: [],
									}),
									ASTCallExpression._({
										callee: ASTIdentifier._('doThing2'),
										args: [],
									}),
									ASTReturnStatement._([
										ASTStringLiteral._('large'),
									]),
								]),
							}),
						],
					}),
				],
			);
		});

		it('works with single values, multiple values, ranges, and ...', (): void => {
			testParseAndAnalyze(
				`const size = when someNumber {
					1, 2 -> 'small',
					3..10 -> 'medium',
					11 -> {
						doThing1();
						doThing2();

						return 'large';
					},
					12 -> doSomethingElse(),
					... -> 'off the charts',
				}`,
				[
					[NT.VariableDeclaration, 'const', [
						[NT.Identifier, 'size'],
						[NT.AssignmentOperator],
						[NT.WhenExpression, [
							[NT.Identifier, 'someNumber'],
							[NT.BlockStatement, [
								[NT.WhenCase, [
									[NT.WhenCaseValues, [
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
									[NT.WhenCaseValues, [
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
									[NT.WhenCaseValues, [
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
									[NT.WhenCaseValues, [
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
									[NT.WhenCaseValues, [
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
				],
				[
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifier: ASTIdentifier._('size'),
						initialValue: ASTWhenExpression._({
							expression: ASTIdentifier._('someNumber'),
							cases: [
								ASTWhenCase._({
									values: [
										ASTNumberLiteral._({format: 'int', value: 1}),
										ASTNumberLiteral._({format: 'int', value: 2}),
									],
									consequent: ASTStringLiteral._('small'),
								}),
								ASTWhenCase._({
									values: [
										ASTRangeExpression._({
											lower: ASTNumberLiteral._({format: 'int', value: 3}),
											upper: ASTNumberLiteral._({format: 'int', value: 10}),
										}),
									],
									consequent: ASTStringLiteral._('medium'),
								}),
								ASTWhenCase._({
									values: [
										ASTNumberLiteral._({format: 'int', value: 11}),
									],
									consequent: ASTBlockStatement._([
										ASTCallExpression._({
											callee: ASTIdentifier._('doThing1'),
											args: [],
										}),
										ASTCallExpression._({
											callee: ASTIdentifier._('doThing2'),
											args: [],
										}),
										ASTReturnStatement._([
											ASTStringLiteral._('large'),
										]),
									]),
								}),
								ASTWhenCase._({
									values: [
										ASTNumberLiteral._({format: 'int', value: 12}),
									],
									consequent: ASTCallExpression._({
										callee: ASTIdentifier._('doSomethingElse'),
										args: [],
									}),
								}),
								ASTWhenCase._({
									values: [
										ASTRestElement._(),
									],
									consequent: ASTStringLiteral._('off the charts'),
								}),
							],
						}),
					}),
				],
			);
		});
	});

	describe('WhileStatement', (): void => {

		it('with CallExpression test', () => {
			expect(parse(
				'while foo() {}')).toMatchParseTree(
				[
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
			expect(parse(
				'while i < 10 {}')).toMatchParseTree(
				[
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
			expect(parse(
				'while !i {}')).toMatchParseTree(
				[
					[NT.WhileStatement, [
					[NT.UnaryExpression, '!', { before: true }, [
						[NT.Identifier, 'i'],
					]],
					[NT.BlockStatement, []],
				]],
			]);
		});

		it('with parens and BinaryExpression', () => {
			expect(parse(
				'while (this.foo != true) {}')).toMatchParseTree(
				[
					[NT.WhileStatement, [
					[NT.Parenthesized, [
						[NT.BinaryExpression, '!=', [
							[NT.MemberExpression, [
								[NT.ThisKeyword],
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
			expect(parse(
				'while (!this.foo()) {}')).toMatchParseTree(
				[
					[NT.WhileStatement, [
					[NT.Parenthesized, [
						[NT.UnaryExpression, '!', { before: true }, [
							[NT.CallExpression, [
								[NT.MemberExpression, [
									[NT.ThisKeyword],
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
			expect(parse(
				`while (!foo) {
					do();
				}`)).toMatchParseTree(
				[
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
			expect(parse(
				'foo()..3')).toMatchParseTree(
				[
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
			expect(parse(
				'[1<2, 4>3];')).toMatchParseTree(
				[
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
			testParseAndAnalyze(
				'f foo(a: number = 1,234, b = true) -> bool {}',
				[
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
				],
				[
					ASTFunctionDeclaration._({
						modifiers: [],
						name: ASTIdentifier._('foo'),
						typeParams: [],
						params: [
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('a'),
								declaredType: ASTTypePrimitive._('number'),
								defaultValue: ASTNumberLiteral._({format: 'int', value: 1234}),
							}),
							ASTParameter._({
								modifiers: [],
								isRest: false,
								name: ASTIdentifier._('b'),
								defaultValue: ASTBoolLiteral._(true),
							}),
						],
						returnTypes: [
							ASTTypePrimitive._('bool'),
						],
						body: ASTBlockStatement._([]),
					}),
				],
			);
		});

	});
});
