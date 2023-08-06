import { describe, expect, it } from '@jest/globals';
import {
	ASTArrayExpression,
	ASTArrayOf,
	ASTAssignmentExpression,
	ASTBinaryExpression,
	ASTBlockStatement,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTClassDeclaration,
	ASTDoneStatement,
	ASTEnumDeclaration,
	ASTForStatement,
	ASTFunctionDeclaration,
	ASTFunctionSignature,
	ASTIdentifier,
	ASTIfStatement,
	ASTInterfaceDeclaration,
	ASTJoeDoc,
	ASTLoopStatement,
	ASTMemberExpression,
	ASTMemberListExpression,
	ASTModifier,
	ASTNextStatement,
	ASTNumberLiteral,
	ASTObjectExpression,
	ASTObjectShape,
	ASTParameter,
	ASTPath,
	ASTPostfixIfStatement,
	ASTPrintStatement,
	ASTProperty,
	ASTPropertyShape,
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
	ASTTupleExpression,
	ASTTupleShape,
	ASTType,
	ASTTypeInstantiationExpression,
	ASTTypeNumber,
	ASTTypeParameter,
	ASTTypePrimitive,
	ASTTypePrimitiveBool,
	ASTTypePrimitiveString,
	ASTTypeRange,
	ASTUnaryExpression,
	ASTUseDeclaration,
	ASTVariableDeclaration,
	ASTWhenCase,
	ASTWhenExpression,
	NumberSizesDecimalASTs,
	NumberSizesIntASTs,
} from '../analyzer/asts';
import { primitiveTypes } from '../lexer/types';
import { testAnalyze } from '../parser/util';
import { numberSizesAll, numberSizesDecimals, numberSizesInts, numberSizesSignedInts } from '../shared/numbers/sizes';
import { mockPos } from '../shared/pos';
import { analyze } from './util';
import assert from 'node:assert';

const binaryMathOperatorsThatArePartOfAMemberExpression = ['+', '+=', '-', '-=', '*', '*='];
const binaryMathOperatorsThatArePartOfAMemberListExpression = ['/', '/=', '%', '%='];
const unaryMathOperatorScenarios = [
	{ operator: '++', before: true, expression: '++bar' },
	{ operator: '++', before: false, expression: 'bar++' },
	{ operator: '--', before: true, expression: '--bar' },
	{ operator: '--', before: false, expression: 'bar--' },
	{ operator: '-', before: true, expression: '-bar' },
];

describe('semanticAnalyzer', () => {
	describe('FQNs', () => {
		function keyToPyramid(key: string): string[] {
			const parts = key.split('.');
			const steps = [];

			for (let i = 0; i < parts.length; i++) {
				steps.push(parts.slice(0, i + 1).join('.'));
			}

			return steps;
		}

		function toHaveKeyPath(code: string, keyPath: string) {
			const result = analyze(code, true, false);
			assert(result.isOk());
			const [, symTree] = result.value;
			const pyramid = keyToPyramid(keyPath);
			let symNode = symTree.getCurrentNode();
			for (const step of pyramid) {
				expect(symNode.table).toHaveKey(step + '');
				symNode = symNode.table.ownerNode.children[step];
			}
		}

		it('main', () => {
			toHaveKeyPath('f main {}', 'main');
		});

		it('class with nested items', () => {
			toHaveKeyPath('class C{f foo {}class Bar{}}', 'C.foo');
			toHaveKeyPath('class C{f foo {}class Bar{class D{class E{}}}}', 'C.Bar.D.E');
		});
	});

	describe('ASTNumberLiteral', () => {
		describe('convertNumberValueTo', () => {
			it('should convert a number value to an AST number literal', () => {
				const numberValue = '10';
				const astNumberLiteral = ASTNumberLiteral.convertNumberValueTo(
					numberValue,
					mockPos,
					(value: string) => new Error(value), // won't be used, so doesn't need to be any specific subclass of Error
				);
				expect(astNumberLiteral).toEqual({
					outcome: 'ok',
					value: ASTNumberLiteral._(
						10,
						undefined,
						['int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64'],
						mockPos,
					),
				});
			});
		});
	});

	describe('AssignmentExpressions', () => {
		it('should assign to a single identifier', () => {
			testAnalyze('foo = 1;', [
				ASTAssignmentExpression._(
					{
						left: [ASTIdentifier._('foo', mockPos)],
						right: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
					},
					mockPos,
				),
			]);
		});

		it('should assign to a property on this instance', () => {
			testAnalyze('this.foo = 1;', [
				ASTAssignmentExpression._(
					{
						left: [
							ASTMemberExpression._(
								{
									object: ASTThisKeyword._(mockPos),
									property: ASTIdentifier._('foo', mockPos),
								},
								mockPos,
							),
						],
						right: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
					},
					mockPos,
				),
			]);
		});

		it('should assign to multiple identifiers and member expressions', () => {
			testAnalyze('x, foo.bar = 0, 1;', [
				ASTAssignmentExpression._(
					{
						left: [
							ASTIdentifier._('x', mockPos),
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									property: ASTIdentifier._('bar', mockPos),
								},
								mockPos,
							),
						],
						right: [
							ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
							ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
						],
					},
					mockPos,
				),
			]);
		});
	});

	describe('Braces', () => {
		it('allows a code block in middle of a function', () => {
			testAnalyze(
				`f foo {
					print 'hello';

					{
						print 'world';
					}

					print '!';
				}`,
				[
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('foo', mockPos),
							typeParams: [],
							params: [],
							returnTypes: [],
							body: ASTBlockStatement._(
								[
									ASTPrintStatement._([ASTStringLiteral._('hello', mockPos)], mockPos),
									ASTBlockStatement._([ASTPrintStatement._([ASTStringLiteral._('world', mockPos)], mockPos)], mockPos),
									ASTPrintStatement._([ASTStringLiteral._('!', mockPos)], mockPos),
									ASTReturnStatement._([], mockPos),
								],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);
		});

		it('allows nested code blocks in middle of a function', () => {
			testAnalyze(
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
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('foo', mockPos),
							typeParams: [],
							params: [],
							returnTypes: [],
							body: ASTBlockStatement._(
								[
									ASTPrintStatement._([ASTStringLiteral._('hello', mockPos)], mockPos),
									ASTBlockStatement._(
										[
											ASTPrintStatement._([ASTStringLiteral._('world', mockPos)], mockPos),
											ASTBlockStatement._(
												[
													ASTVariableDeclaration._(
														{
															modifiers: [],
															mutable: false,
															identifiersList: [ASTIdentifier._('x', mockPos)],
															declaredTypes: [],
															initialValues: [
																ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
															],
															inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
														},
														mockPos,
													),
												],
												mockPos,
											),
											ASTBlockStatement._([ASTPrintStatement._([ASTIdentifier._('x', mockPos)], mockPos)], mockPos),
										],
										mockPos,
									),
									ASTPrintStatement._([ASTStringLiteral._('!', mockPos)], mockPos),
									ASTReturnStatement._([], mockPos),
								],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);
		});
	});

	describe('CallExpression', () => {
		it('should work with multiple return types and a VariableDeclaration', () => {
			testAnalyze(
				`f doSomething -> string, bool { return '', true; };
				const goLangStyle, ok = doSomething();
				`,
				[
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('doSomething', mockPos),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitive._('string', mockPos), ASTTypePrimitive._('bool', mockPos)],
							body: ASTBlockStatement._(
								[ASTReturnStatement._([ASTStringLiteral._('', mockPos), ASTBoolLiteral._(true, mockPos)], mockPos)],
								mockPos,
							),
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('goLangStyle', mockPos), ASTIdentifier._('ok', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTCallExpression._(
									{
										callee: ASTIdentifier._('doSomething', mockPos),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[ASTTypePrimitiveString(mockPos), ASTTypePrimitiveBool(mockPos)]],
						},
						mockPos,
					),
				],
			);
		});

		it('works with several nested layers', () => {
			testAnalyze('a.b.c.d(4);', [
				ASTCallExpression._(
					{
						callee: ASTMemberExpression._(
							{
								object: ASTMemberExpression._(
									{
										object: ASTMemberExpression._(
											{
												object: ASTIdentifier._('a', mockPos),
												property: ASTIdentifier._('b', mockPos),
											},
											mockPos,
										),
										property: ASTIdentifier._('c', mockPos),
									},
									mockPos,
								),
								property: ASTIdentifier._('d', mockPos),
							},
							mockPos,
						),
						typeArgs: [],
						args: [ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos)],
					},
					mockPos,
				),
			]);
		});

		it('call followed by property', () => {
			testAnalyze('a(1).b', [
				ASTMemberExpression._(
					{
						object: ASTCallExpression._(
							{
								callee: ASTIdentifier._('a', mockPos),
								typeArgs: [],
								args: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
							},
							mockPos,
						),
						property: ASTIdentifier._('b', mockPos),
					},
					mockPos,
				),
			]);
		});

		it('call followed by a call', () => {
			testAnalyze('a(1).b(2)', [
				ASTCallExpression._(
					{
						callee: ASTMemberExpression._(
							{
								object: ASTCallExpression._(
									{
										callee: ASTIdentifier._('a', mockPos),
										typeArgs: [],
										args: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
									},
									mockPos,
								),
								property: ASTIdentifier._('b', mockPos),
							},
							mockPos,
						),
						typeArgs: [],
						args: [ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos)],
					},
					mockPos,
				),
			]);
		});

		it('generics', () => {
			testAnalyze('a(b<|T|>);', [
				ASTCallExpression._(
					{
						callee: ASTIdentifier._('a', mockPos),
						typeArgs: [],
						args: [
							ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('b', mockPos),
									typeArgs: [ASTIdentifier._('T', mockPos)],
								},
								mockPos,
							),
						],
					},
					mockPos,
				),
			]);

			testAnalyze('a<|T|>(b);', [
				ASTCallExpression._(
					{
						callee: ASTIdentifier._('a', mockPos),
						typeArgs: [ASTIdentifier._('T', mockPos)],
						args: [ASTIdentifier._('b', mockPos)],
					},
					mockPos,
				),
			]);
		});

		it('more advanced generics', () => {
			testAnalyze('class Foo {} const foo = Foo<|T, T[]|>();', [
				ASTClassDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', mockPos)],
						declaredTypes: [],
						initialValues: [
							ASTCallExpression._(
								{
									callee: ASTIdentifier._('Foo', mockPos),
									typeArgs: [ASTIdentifier._('T', mockPos), ASTArrayOf._(ASTIdentifier._('T', mockPos), mockPos)],
									args: [],
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [[ASTIdentifier._('Foo', mockPos)]],
					},
					mockPos,
				),
			]);
		});

		it('multiple inheritance manual resolution', () => {
			testAnalyze(
				`class C extends A, B {
					f foo () {
						return this.parent<|B|>.foo(); // <-- Specify to use B.foo
					}
				}`,
				[
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('C', mockPos),
							typeParams: [],
							extends: [ASTIdentifier._('A', mockPos), ASTIdentifier._('B', mockPos)],
							implements: [],
							body: ASTBlockStatement._(
								[
									ASTFunctionDeclaration._(
										{
											modifiers: [],
											name: ASTIdentifier._('foo', mockPos),
											typeParams: [],
											params: [],
											returnTypes: [],
											body: ASTBlockStatement._(
												[
													ASTReturnStatement._(
														[
															ASTCallExpression._(
																{
																	callee: ASTMemberExpression._(
																		{
																			object: ASTMemberExpression._(
																				{
																					object: ASTThisKeyword._(mockPos),
																					property: ASTTypeInstantiationExpression._(
																						{
																							base: ASTIdentifier._('parent', mockPos),
																							typeArgs: [ASTIdentifier._('B', mockPos)],
																						},
																						mockPos,
																					),
																				},
																				mockPos,
																			),
																			property: ASTIdentifier._('foo', mockPos),
																		},
																		mockPos,
																	),
																	typeArgs: [],
																	args: [],
																},
																mockPos,
															),
														],
														mockPos,
													),
												],
												mockPos,
											),
										},
										mockPos,
									),
								],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);
		});

		it('works with a TypeInstantiationExpression', () => {
			testAnalyze('foo.bar<|T|>()', [
				ASTCallExpression._(
					{
						callee: ASTMemberExpression._(
							{
								object: ASTIdentifier._('foo', mockPos),
								property: ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('bar', mockPos),
										typeArgs: [ASTIdentifier._('T', mockPos)],
									},
									mockPos,
								),
							},
							mockPos,
						),
						typeArgs: [],
						args: [],
					},
					mockPos,
				),
			]);

			testAnalyze('this.bar<|T|>()', [
				ASTCallExpression._(
					{
						callee: ASTMemberExpression._(
							{
								object: ASTThisKeyword._(mockPos),
								property: ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('bar', mockPos),
										typeArgs: [ASTIdentifier._('T', mockPos)],
									},
									mockPos,
								),
							},
							mockPos,
						),
						typeArgs: [],
						args: [],
					},
					mockPos,
				),
			]);
		});

		describe('works with create', () => {
			it('simple', () => {
				testAnalyze(
					'A.create();',

					[
						ASTCallExpression._(
							{
								callee: ASTMemberExpression._(
									{
										object: ASTIdentifier._('A', mockPos),
										property: ASTIdentifier._('create', mockPos),
									},
									mockPos,
								),
								typeArgs: [],
								args: [],
							},
							mockPos,
						),
					],
				);
			});

			it('with GenericTypes and Arguments', () => {
				testAnalyze('A<|T, U|>.create(T.create(), U.create(), "foo");', [
					ASTCallExpression._(
						{
							callee: ASTMemberExpression._(
								{
									object: ASTTypeInstantiationExpression._(
										{
											base: ASTIdentifier._('A', mockPos),
											typeArgs: [ASTIdentifier._('T', mockPos), ASTIdentifier._('U', mockPos)],
										},
										mockPos,
									),
									property: ASTIdentifier._('create', mockPos),
								},
								mockPos,
							),
							typeArgs: [],
							args: [
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('T', mockPos),
												property: ASTIdentifier._('create', mockPos),
											},
											mockPos,
										),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('U', mockPos),
												property: ASTIdentifier._('create', mockPos),
											},
											mockPos,
										),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
								ASTStringLiteral._('foo', mockPos),
							],
						},
						mockPos,
					),
				]);
			});

			it('with several nested layers', () => {
				testAnalyze(
					'A.B.C.D.create();',

					[
						ASTCallExpression._(
							{
								callee: ASTMemberExpression._(
									{
										object: ASTMemberExpression._(
											{
												object: ASTMemberExpression._(
													{
														object: ASTMemberExpression._(
															{
																object: ASTIdentifier._('A', mockPos),
																property: ASTIdentifier._('B', mockPos),
															},
															mockPos,
														),
														property: ASTIdentifier._('C', mockPos),
													},
													mockPos,
												),
												property: ASTIdentifier._('D', mockPos),
											},
											mockPos,
										),
										property: ASTIdentifier._('create', mockPos),
									},
									mockPos,
								),
								typeArgs: [],
								args: [],
							},
							mockPos,
						),
					],
				);
			});
		});
	});

	describe('ClassDeclaration', (): void => {
		it('empty class', (): void => {
			testAnalyze(
				'class Foo {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);

			testAnalyze(
				'class Foo <| T, U.V, bool |> {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos),
								ASTTypeParameter._(
									ASTMemberExpression._(
										{
											object: ASTIdentifier._('U', mockPos),
											property: ASTIdentifier._('V', mockPos),
										},
										mockPos,
									),
									undefined,
									undefined,
									mockPos,
								),
								ASTTypeParameter._(ASTTypePrimitive._('bool', mockPos), undefined, undefined, mockPos),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('class with comment', (): void => {
			testAnalyze(
				'class Foo {\n# foo\n}\n# bar\n',

				[
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('class with properties and methods', (): void => {
			testAnalyze('class Foo {\nconst foo = "bar";\nf bar {}}\n# bar\n', [
				ASTClassDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._(
							[
								ASTVariableDeclaration._(
									{
										modifiers: [],
										mutable: false,
										identifiersList: [ASTIdentifier._('foo', mockPos)],
										declaredTypes: [],
										initialValues: [ASTStringLiteral._('bar', mockPos)],
										inferredPossibleTypes: [[ASTTypePrimitive._('string', mockPos)]],
									},
									mockPos,
								),
								ASTFunctionDeclaration._(
									{
										modifiers: [],
										name: ASTIdentifier._('bar', mockPos),
										typeParams: [],
										params: [],
										returnTypes: [],
										body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
									},
									mockPos,
								),
							],
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		it('class extends multiple and implements multiple', (): void => {
			testAnalyze('class Foo extends Bar, Baz implements AbstractFooBar, AnotherAbstractClass {}', [
				ASTClassDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [],
						extends: [ASTIdentifier._('Bar', mockPos), ASTIdentifier._('Baz', mockPos)],
						implements: [ASTIdentifier._('AbstractFooBar', mockPos), ASTIdentifier._('AnotherAbstractClass', mockPos)],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('class extends multiple and implements multiple with generics', (): void => {
			testAnalyze(
				'class Foo<|T,U|> extends Bar<|T<|RE|>, path|>, Baz implements AbstractFooBar, AnotherAbstractClass<|U|> {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos),
								ASTTypeParameter._(ASTIdentifier._('U', mockPos), undefined, undefined, mockPos),
							],
							extends: [
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('Bar', mockPos),
										typeArgs: [
											ASTTypeInstantiationExpression._(
												{
													base: ASTIdentifier._('T', mockPos),
													typeArgs: [ASTIdentifier._('RE', mockPos)],
												},
												mockPos,
											),
											ASTTypePrimitive._('path', mockPos),
										],
									},
									mockPos,
								),
								ASTIdentifier._('Baz', mockPos),
							],
							implements: [
								ASTIdentifier._('AbstractFooBar', mockPos),
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('AnotherAbstractClass', mockPos),
										typeArgs: [ASTIdentifier._('U', mockPos)],
									},
									mockPos,
								),
							],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('abstract class', (): void => {
			testAnalyze(
				'abstract class Foo {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', mockPos)],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);

			testAnalyze(
				'abstract class Foo<|T|> {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', mockPos)],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos)],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);

			testAnalyze(
				`abstract class Foo {
					abstract readonly const baz: int8;

					abstract static f hello<|T|> (name = 'World') -> Greeting, T;

					pub static f world (name = 'Earth');
				}`,
				[
					ASTClassDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', mockPos)],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._(
								[
									ASTVariableDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', mockPos), ASTModifier._('readonly', mockPos)],
											mutable: false,
											identifiersList: [ASTIdentifier._('baz', mockPos)],
											declaredTypes: [ASTTypeNumber._('int8', mockPos)],
											initialValues: [],
											inferredPossibleTypes: [],
										},
										mockPos,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', mockPos), ASTModifier._('static', mockPos)],
											name: ASTIdentifier._('hello', mockPos),
											typeParams: [ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos)],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('name', mockPos),
														type: ASTTypePrimitive._('string', mockPos),
														defaultValue: ASTStringLiteral._('World', mockPos),
													},
													mockPos,
												),
											],
											returnTypes: [ASTIdentifier._('Greeting', mockPos), ASTIdentifier._('T', mockPos)],
											body: undefined,
										},
										mockPos,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('pub', mockPos), ASTModifier._('static', mockPos)],
											name: ASTIdentifier._('world', mockPos),
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('name', mockPos),
														type: ASTTypePrimitive._('string', mockPos),
														defaultValue: ASTStringLiteral._('Earth', mockPos),
													},
													mockPos,
												),
											],
											returnTypes: [],
											body: undefined,
										},
										mockPos,
									),
								],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);

			testAnalyze(
				'abstract class Foo {}\nclass Bar extends Foo {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', mockPos)],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Bar', mockPos),
							typeParams: [],
							extends: [ASTIdentifier._('Foo', mockPos)],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});
	});

	describe('Comment', (): void => {
		it('a single-line comment', (): void => {
			testAnalyze(
				'# let x = "foo"',
				[], // empty program
			);
		});

		it('a multi-line comment', (): void => {
			testAnalyze(
				'/* let x = "foo" */',
				[], // empty program
			);
		});
	});

	describe('EnumDeclaration', (): void => {
		it('empty enum', (): void => {
			testAnalyze(
				'enum Foo {}',

				[
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);

			testAnalyze(
				'enum Foo <| T, U |> {}',

				[
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos),
								ASTTypeParameter._(ASTIdentifier._('U', mockPos), undefined, undefined, mockPos),
							],
							extends: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('enum extends other', (): void => {
			testAnalyze(
				'enum Foo {} enum Bar extends Foo {}',

				[
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Bar', mockPos),
							typeParams: [],
							extends: [ASTIdentifier._('Foo', mockPos)],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('enum extends multiple', (): void => {
			testAnalyze(
				'enum Foo extends Bar, Baz {}',

				[
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [],
							extends: [ASTIdentifier._('Bar', mockPos), ASTIdentifier._('Baz', mockPos)],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('enum extends multiple with generics', (): void => {
			testAnalyze(
				'enum Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}',

				[
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos),
								ASTTypeParameter._(ASTIdentifier._('U', mockPos), undefined, undefined, mockPos),
							],
							extends: [
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('Bar', mockPos),
										typeArgs: [ASTIdentifier._('T', mockPos)],
									},
									mockPos,
								),
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('Baz', mockPos),
										typeArgs: [ASTIdentifier._('U', mockPos)],
									},
									mockPos,
								),
							],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});
	});

	describe('ForStatement', (): void => {
		it('simple for statement with range', () => {
			testAnalyze(
				'for let i in 0 .. 9 {}',

				[
					ASTForStatement._(
						{
							initializer: ASTVariableDeclaration._(
								{
									modifiers: [],
									mutable: true,
									identifiersList: [ASTIdentifier._('i', mockPos)],
									declaredTypes: [],
									initialValues: [],
									inferredPossibleTypes: [],
								},
								mockPos,
							),
							iterable: ASTRangeExpression._(
								{
									lower: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
									upper: ASTNumberLiteral._(9, undefined, [...numberSizesInts], mockPos),
								},
								mockPos,
							),
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('with range in parens', () => {
			testAnalyze('for (let i in 0 .. 9) {}', [
				ASTForStatement._(
					{
						initializer: ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: true,
								identifiersList: [ASTIdentifier._('i', mockPos)],
								declaredTypes: [],
								initialValues: [],
								inferredPossibleTypes: [],
							},
							mockPos,
						),
						iterable: ASTRangeExpression._(
							{
								lower: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
								upper: ASTNumberLiteral._(9, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with identifier', () => {
			testAnalyze('const foo = [1, 2, 3]; for let i in foo {}', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', mockPos)],
						declaredTypes: [],
						initialValues: [
							ASTArrayExpression._(
								{
									items: [
										ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
									],
									possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ASTArrayOf._(ns(mockPos), mockPos))],
					},
					mockPos,
				),
				ASTForStatement._(
					{
						initializer: ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: true,
								identifiersList: [ASTIdentifier._('i', mockPos)],
								declaredTypes: [],
								initialValues: [],
								inferredPossibleTypes: [],
							},
							mockPos,
						),
						iterable: ASTIdentifier._('foo', mockPos),
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with array (and multiple variables)', () => {
			testAnalyze(
				'for let n, i in [1, 2, 3] {}',

				[
					ASTForStatement._(
						{
							initializer: ASTVariableDeclaration._(
								{
									modifiers: [],
									mutable: true,
									identifiersList: [ASTIdentifier._('n', mockPos), ASTIdentifier._('i', mockPos)],
									declaredTypes: [],
									initialValues: [],
									inferredPossibleTypes: [],
								},
								mockPos,
							),
							iterable: ASTArrayExpression._(
								{
									items: [
										ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
									],
									possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
								},
								mockPos,
							),
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('with call expression', () => {
			testAnalyze(
				'for let i in foo() {}',

				[
					ASTForStatement._(
						{
							initializer: ASTVariableDeclaration._(
								{
									modifiers: [],
									mutable: true,
									identifiersList: [ASTIdentifier._('i', mockPos)],
									declaredTypes: [],
									initialValues: [],
									inferredPossibleTypes: [],
								},
								mockPos,
							),
							iterable: ASTCallExpression._(
								{
									callee: ASTIdentifier._('foo', mockPos),
									typeArgs: [],
									args: [],
								},
								mockPos,
							),
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('with member expression', () => {
			testAnalyze(
				'for let i in foo.bar {}',

				[
					ASTForStatement._(
						{
							initializer: ASTVariableDeclaration._(
								{
									modifiers: [],
									mutable: true,
									identifiersList: [ASTIdentifier._('i', mockPos)],
									declaredTypes: [],
									initialValues: [],
									inferredPossibleTypes: [],
								},
								mockPos,
							),
							iterable: ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									property: ASTIdentifier._('bar', mockPos),
								},
								mockPos,
							),
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('with member list expression', () => {
			testAnalyze(
				'for let i in foo[0, 2, 4] {}',

				[
					ASTForStatement._(
						{
							initializer: ASTVariableDeclaration._(
								{
									modifiers: [],
									mutable: true,
									identifiersList: [ASTIdentifier._('i', mockPos)],
									declaredTypes: [],
									initialValues: [],
									inferredPossibleTypes: [],
								},
								mockPos,
							),
							iterable: ASTMemberListExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									properties: [
										ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
										ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
									],
								},
								mockPos,
							),
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('with member list expression using a range', () => {
			testAnalyze(
				'for let i in foo[0 .. 4] {}',

				[
					ASTForStatement._(
						{
							initializer: ASTVariableDeclaration._(
								{
									modifiers: [],
									mutable: true,
									identifiersList: [ASTIdentifier._('i', mockPos)],
									declaredTypes: [],
									initialValues: [],
									inferredPossibleTypes: [],
								},
								mockPos,
							),
							iterable: ASTMemberListExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									properties: [
										ASTRangeExpression._(
											{
												lower: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
												upper: ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
											},
											mockPos,
										),
									],
								},
								mockPos,
							),
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		it('should end with the closing brace and next expression comes after', () => {
			testAnalyze('for let i in foo {}print "something after";', [
				ASTForStatement._(
					{
						initializer: ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: true,
								identifiersList: [ASTIdentifier._('i', mockPos)],
								declaredTypes: [],
								initialValues: [],
								inferredPossibleTypes: [],
							},
							mockPos,
						),
						iterable: ASTIdentifier._('foo', mockPos),
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
				ASTPrintStatement._([ASTStringLiteral._('something after', mockPos)], mockPos),
			]);
		});

		it('should behave correctly with nested ForStatements', () => {
			testAnalyze('for let i in foo { for let j in bar {} }', [
				ASTForStatement._(
					{
						initializer: ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: true,
								identifiersList: [ASTIdentifier._('i', mockPos)],
								declaredTypes: [],
								initialValues: [],
								inferredPossibleTypes: [],
							},
							mockPos,
						),
						iterable: ASTIdentifier._('foo', mockPos),
						body: ASTBlockStatement._(
							[
								ASTForStatement._(
									{
										initializer: ASTVariableDeclaration._(
											{
												modifiers: [],
												mutable: true,
												identifiersList: [ASTIdentifier._('j', mockPos)],
												declaredTypes: [],
												initialValues: [],
												inferredPossibleTypes: [],
											},
											mockPos,
										),
										iterable: ASTIdentifier._('bar', mockPos),
										body: ASTBlockStatement._([], mockPos),
									},
									mockPos,
								),
							],
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});
	});

	describe('FunctionDeclaration', (): void => {
		it('no params or return types', (): void => {
			testAnalyze('f foo {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [],
						returnTypes: [],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('no params with single return type', (): void => {
			testAnalyze('f foo -> bool {} 5;', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [],
						returnTypes: [ASTTypePrimitive._('bool', mockPos)],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
				ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos),
			]);
		});

		it('no params with multiple return types', (): void => {
			testAnalyze(
				`f foo -> bool, string {
					return true, 'hey';
				}`,
				[
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('foo', mockPos),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitive._('bool', mockPos), ASTTypePrimitive._('string', mockPos)],
							body: ASTBlockStatement._(
								[ASTReturnStatement._([ASTBoolLiteral._(true, mockPos), ASTStringLiteral._('hey', mockPos)], mockPos)],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);
		});

		it('param parens but no return types', (): void => {
			testAnalyze('f foo () {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [],
						returnTypes: [],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('param parens with return types', (): void => {
			testAnalyze('f foo () -> bool {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [],
						returnTypes: [ASTTypePrimitive._('bool', mockPos)],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('params but no return types', (): void => {
			testAnalyze('f foo (a: int8, callback: f (a: int8) -> string, bool) {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTTypeNumber._('int8', mockPos),
								},
								mockPos,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('callback', mockPos),
									type: ASTFunctionSignature._(
										{
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('a', mockPos),
														type: ASTTypeNumber._('int8', mockPos),
													},
													mockPos,
												),
											],
											returnTypes: [ASTTypePrimitive._('string', mockPos), ASTTypePrimitive._('bool', mockPos)],
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
						returnTypes: [],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('params and return types', (): void => {
			testAnalyze('f foo (a: int8, r: regex) -> regex, bool {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTTypeNumber._('int8', mockPos),
								},
								mockPos,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('r', mockPos),
									type: ASTTypePrimitive._('regex', mockPos),
								},
								mockPos,
							),
						],
						returnTypes: [ASTTypePrimitive._('regex', mockPos), ASTTypePrimitive._('bool', mockPos)],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('params and return types using functions', (): void => {
			testAnalyze('f foo <|T|>(a: f -> T) -> f -> Result<|Maybe<|T|>|> {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos)],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTFunctionSignature._(
										{
											typeParams: [],
											params: [],
											returnTypes: [ASTIdentifier._('T', mockPos)],
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
						returnTypes: [
							ASTFunctionSignature._(
								{
									typeParams: [],
									params: [],
									returnTypes: [
										ASTTypeInstantiationExpression._(
											{
												base: ASTIdentifier._('Result', mockPos),
												typeArgs: [
													ASTTypeInstantiationExpression._(
														{
															base: ASTIdentifier._('Maybe', mockPos),
															typeArgs: [ASTIdentifier._('T', mockPos)],
														},
														mockPos,
													),
												],
											},
											mockPos,
										),
									],
								},
								mockPos,
							),
						],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('params and return types using tuples', (): void => {
			testAnalyze('f foo (a: <bool>) -> <dec64> {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTTupleShape._([[ASTTypePrimitive._('bool', mockPos)]], mockPos),
								},
								mockPos,
							),
						],
						returnTypes: [ASTTupleShape._([[ASTTypeNumber._('dec64', mockPos)]], mockPos)],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('params and return types using tuples and arrays', (): void => {
			testAnalyze('f foo (a: <bool[]>[]) -> <int32> {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTArrayOf._(
										ASTTupleShape._([[ASTArrayOf._(ASTTypePrimitive._('bool', mockPos), mockPos)]], mockPos),
										mockPos,
									),
								},
								mockPos,
							),
						],
						returnTypes: [ASTTupleShape._([[ASTTypeNumber._('int32', mockPos)]], mockPos)],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with arrays', (): void => {
			testAnalyze('f foo(a: int8[] = [5], b: string[][], ...c: Foo[]) -> regex, path[][][] {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTArrayOf._(ASTTypeNumber._('int8', mockPos), mockPos),
									defaultValue: ASTArrayExpression._(
										{
											items: [ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos)],
											possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
										},
										mockPos,
									),
								},
								mockPos,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('b', mockPos),
									type: ASTArrayOf._(ASTArrayOf._(ASTTypePrimitive._('string', mockPos), mockPos), mockPos),
								},
								mockPos,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: true,
									name: ASTIdentifier._('c', mockPos),
									type: ASTArrayOf._(ASTIdentifier._('Foo', mockPos), mockPos),
								},
								mockPos,
							),
						],
						returnTypes: [
							ASTTypePrimitive._('regex', mockPos),
							ASTArrayOf._(ASTArrayOf._(ASTArrayOf._(ASTTypePrimitive._('path', mockPos), mockPos), mockPos), mockPos),
						],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('return when', () => {
			testAnalyze(
				`f school (age: int8) -> string {
					return when age {
						11 -> 'Hogwarts First Year',
						12 .. 17 -> 'Another Year at Hogwarts',
						18, 19 -> 'Auror Training',
						... -> 'Auror',
					};
				}`,
				[
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('school', mockPos),
							typeParams: [],
							params: [
								ASTParameter._(
									{
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('age', mockPos),
										type: ASTTypeNumber._('int8', mockPos),
									},
									mockPos,
								),
							],
							returnTypes: [ASTTypePrimitive._('string', mockPos)],
							body: ASTBlockStatement._(
								[
									ASTReturnStatement._(
										[
											ASTWhenExpression._(
												{
													expression: ASTIdentifier._('age', mockPos),
													cases: [
														ASTWhenCase._(
															{
																values: [ASTNumberLiteral._(11, undefined, [...numberSizesInts], mockPos)],
																consequent: ASTStringLiteral._('Hogwarts First Year', mockPos),
															},
															mockPos,
														),
														ASTWhenCase._(
															{
																values: [
																	ASTRangeExpression._(
																		{
																			lower: ASTNumberLiteral._(
																				12,
																				undefined,
																				[...numberSizesInts],
																				mockPos,
																			),
																			upper: ASTNumberLiteral._(
																				17,
																				undefined,
																				[...numberSizesInts],
																				mockPos,
																			),
																		},
																		mockPos,
																	),
																],
																consequent: ASTStringLiteral._('Another Year at Hogwarts', mockPos),
															},
															mockPos,
														),
														ASTWhenCase._(
															{
																values: [
																	ASTNumberLiteral._(18, undefined, [...numberSizesInts], mockPos),
																	ASTNumberLiteral._(19, undefined, [...numberSizesInts], mockPos),
																],
																consequent: ASTStringLiteral._('Auror Training', mockPos),
															},
															mockPos,
														),
														ASTWhenCase._(
															{
																values: [ASTRestElement._(mockPos)],
																consequent: ASTStringLiteral._('Auror', mockPos),
															},
															mockPos,
														),
													],
												},
												mockPos,
											),
										],
										mockPos,
									),
								],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);
		});

		it('multiple returns with when', () => {
			testAnalyze(
				`f foo (age: uint16) -> uint16, string {
					return 5, when age {... -> 'No more foos',};
				}`,
				[
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('foo', mockPos),
							typeParams: [],
							params: [
								ASTParameter._(
									{
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('age', mockPos),
										type: ASTTypeNumber._('uint16', mockPos),
									},
									mockPos,
								),
							],
							returnTypes: [ASTTypeNumber._('uint16', mockPos), ASTTypePrimitive._('string', mockPos)],
							body: ASTBlockStatement._(
								[
									ASTReturnStatement._(
										[
											ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos),
											ASTWhenExpression._(
												{
													expression: ASTIdentifier._('age', mockPos),
													cases: [
														ASTWhenCase._(
															{
																values: [ASTRestElement._(mockPos)],
																consequent: ASTStringLiteral._('No more foos', mockPos),
															},
															mockPos,
														),
													],
												},
												mockPos,
											),
										],
										mockPos,
									),
								],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);
		});

		it('generics', (): void => {
			testAnalyze('f foo <|T|> (a: T) -> T {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos)],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTIdentifier._('T', mockPos),
								},
								mockPos,
							),
						],
						returnTypes: [ASTIdentifier._('T', mockPos)],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('abstract functions', () => {
			testAnalyze(
				`abstract class A {
					abstract f foo1;
					abstract f foo2 (arg: int64);
					abstract f foo3<| T |> -> bool;
					abstract f foo4 (arg: dec32) -> bool;
				}`,
				[
					ASTClassDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', mockPos)],
							name: ASTIdentifier._('A', mockPos),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._(
								[
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', mockPos)],
											name: ASTIdentifier._('foo1', mockPos),
											typeParams: [],
											params: [],
											returnTypes: [],
											body: undefined,
										},
										mockPos,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', mockPos)],
											name: ASTIdentifier._('foo2', mockPos),
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														name: ASTIdentifier._('arg', mockPos),
														isRest: false,
														type: ASTTypeNumber._('int64', mockPos),
													},
													mockPos,
												),
											],
											returnTypes: [],
											body: undefined,
										},
										mockPos,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', mockPos)],
											name: ASTIdentifier._('foo3', mockPos),
											typeParams: [ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos)],
											params: [],
											returnTypes: [ASTTypePrimitive._('bool', mockPos)],
											body: undefined,
										},
										mockPos,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', mockPos)],
											name: ASTIdentifier._('foo4', mockPos),
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('arg', mockPos),
														type: ASTTypeNumber._('dec32', mockPos),
													},
													mockPos,
												),
											],
											returnTypes: [ASTTypePrimitive._('bool', mockPos)],
											body: undefined,
										},
										mockPos,
									),
								],
								mockPos,
							),
						},
						mockPos,
					),
				],
			);
		});

		it('anonymous simple', () => {
			testAnalyze('const foo = f {};', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', mockPos)],
						declaredTypes: [],
						initialValues: [
							ASTFunctionDeclaration._(
								{
									modifiers: [],
									name: ASTIdentifier._('.f_anon_', mockPos),
									typeParams: [],
									params: [],
									returnTypes: [],
									body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [[]],
					},
					mockPos,
				),
			]);
		});

		it('anonymous complex', () => {
			testAnalyze('const foo = f <|T|>(a: T) -> T {\ndo();\n};', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', mockPos)],
						declaredTypes: [],
						initialValues: [
							ASTFunctionDeclaration._(
								{
									modifiers: [],
									name: ASTIdentifier._('.f_anon_', mockPos),
									typeParams: [ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos)],
									params: [
										ASTParameter._(
											{
												modifiers: [],
												isRest: false,
												name: ASTIdentifier._('a', mockPos),
												type: ASTIdentifier._('T', mockPos),
											},
											mockPos,
										),
									],
									returnTypes: [ASTIdentifier._('T', mockPos)],
									body: ASTBlockStatement._(
										[
											ASTCallExpression._(
												{
													callee: ASTIdentifier._('do', mockPos),
													typeArgs: [],
													args: [],
												},
												mockPos,
											),
										],
										mockPos,
									),
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [[]],
					},
					mockPos,
				),
			]);
		});

		it('anonymous abstract', () => {
			testAnalyze(
				'abstract const foo = f;',

				[
					ASTVariableDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', mockPos)],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTFunctionDeclaration._(
									{
										modifiers: [],
										name: ASTIdentifier._('.f_anon_', mockPos),
										typeParams: [],
										params: [],
										returnTypes: [],
										body: undefined,
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
				],
			);
		});

		it('ending with a question mark', () => {
			testAnalyze(
				`f danger? -> bool {
					return true;
				}`,

				[
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('danger?', mockPos),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitive._('bool', mockPos)],
							body: ASTBlockStatement._([ASTReturnStatement._([ASTBoolLiteral._(true, mockPos)], mockPos)], mockPos),
						},
						mockPos,
					),
				],
			);
		});

		describe('special function names', () => {
			describe('<=>', () => {
				// in a class
				it('<=> as function name inside of a class should be an innocent Identifier', (): void => {
					testAnalyze('class A{f <=> {}}', [
						ASTClassDeclaration._(
							{
								modifiers: [],
								name: ASTIdentifier._('A', mockPos),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._(
									[
										ASTFunctionDeclaration._(
											{
												modifiers: [],
												name: ASTIdentifier._('<=>', mockPos),
												typeParams: [],
												params: [],
												returnTypes: [],
												body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
											},
											mockPos,
										),
									],
									mockPos,
								),
							},
							mockPos,
						),
					]);
				});
			});
		});
	});

	describe('IfStatement', (): void => {
		it('with bool conditional', () => {
			testAnalyze('if true {}', [
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(true, mockPos),
						consequent: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with BinaryExpression conditional using two NumberLiterals', () => {
			testAnalyze('if 1 < 2 {}', [
				ASTIfStatement._(
					{
						test: ASTBinaryExpression._(
							{
								operator: '<',
								left: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
								right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
						consequent: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
			testAnalyze('if foo == 2 {}', [
				ASTIfStatement._(
					{
						test: ASTBinaryExpression._(
							{
								operator: '==',
								left: ASTIdentifier._('foo', mockPos),
								right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
						consequent: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with BinaryExpression conditional using a CallExpression and a NumberLiteral', () => {
			testAnalyze('if foo() == 2 {}', [
				ASTIfStatement._(
					{
						test: ASTBinaryExpression._(
							{
								operator: '==',
								left: ASTCallExpression._(
									{
										callee: ASTIdentifier._('foo', mockPos),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
								right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
						consequent: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with two conditions', () => {
			testAnalyze('if foo() == 2 && a < 3 {}', [
				ASTIfStatement._(
					{
						test: ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTBinaryExpression._(
									{
										operator: '==',
										left: ASTCallExpression._(
											{
												callee: ASTIdentifier._('foo', mockPos),
												typeArgs: [],
												args: [],
											},
											mockPos,
										),
										right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
									},
									mockPos,
								),
								right: ASTBinaryExpression._(
									{
										operator: '<',
										left: ASTIdentifier._('a', mockPos),
										right: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
									},
									mockPos,
								),
							},
							mockPos,
						),
						consequent: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		describe('with parens', () => {
			it('and one condition', () => {
				testAnalyze('if (foo() == 2) {}', [
					ASTIfStatement._(
						{
							test: ASTBinaryExpression._(
								{
									operator: '==',
									left: ASTCallExpression._(
										{
											callee: ASTIdentifier._('foo', mockPos),
											typeArgs: [],
											args: [],
										},
										mockPos,
									),
									right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
								},
								mockPos,
							),
							consequent: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('and two conditions', () => {
				testAnalyze('if (foo() == 2 && a < 3) {}', [
					ASTIfStatement._(
						{
							test: ASTBinaryExpression._(
								{
									operator: '&&',
									left: ASTBinaryExpression._(
										{
											operator: '==',
											left: ASTCallExpression._(
												{
													callee: ASTIdentifier._('foo', mockPos),
													typeArgs: [],
													args: [],
												},
												mockPos,
											),
											right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
									right: ASTBinaryExpression._(
										{
											operator: '<',
											left: ASTIdentifier._('a', mockPos),
											right: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
							consequent: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				]);
			});
		});

		it('with just else', () => {
			testAnalyze('if true {} else {}', [
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(true, mockPos),
						consequent: ASTBlockStatement._([], mockPos),
						alternate: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with else if', () => {
			testAnalyze('if true {} else if false {}', [
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(true, mockPos),
						consequent: ASTBlockStatement._([], mockPos),
						alternate: ASTIfStatement._(
							{
								test: ASTBoolLiteral._(false, mockPos),
								consequent: ASTBlockStatement._([], mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		it('with a subsequent if and should be two separate IfStatements', () => {
			testAnalyze('if true {} if false {}', [
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(true, mockPos),
						consequent: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(false, mockPos),
						consequent: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});
	});

	describe('InterfaceDeclaration', (): void => {
		it('empty interface', (): void => {
			testAnalyze('interface Foo {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [],
						extends: [],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);

			testAnalyze('interface Foo <| T, U |> {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [
							ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos),
							ASTTypeParameter._(ASTIdentifier._('U', mockPos), undefined, undefined, mockPos),
						],
						extends: [],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('interface extends other', (): void => {
			testAnalyze('interface Foo {} interface Bar extends Foo {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [],
						extends: [],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Bar', mockPos),
						typeParams: [],
						extends: [ASTIdentifier._('Foo', mockPos)],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('interface extends multiple', (): void => {
			testAnalyze('interface Foo extends Bar, Baz {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [],
						extends: [ASTIdentifier._('Bar', mockPos), ASTIdentifier._('Baz', mockPos)],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('interface extends multiple with generics', (): void => {
			testAnalyze('interface Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', mockPos),
						typeParams: [
							ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos),
							ASTTypeParameter._(ASTIdentifier._('U', mockPos), undefined, undefined, mockPos),
						],
						extends: [
							ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('Bar', mockPos),
									typeArgs: [ASTIdentifier._('T', mockPos)],
								},
								mockPos,
							),
							ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('Baz', mockPos),
									typeArgs: [ASTIdentifier._('U', mockPos)],
								},
								mockPos,
							),
						],
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});
	});

	describe('JoeDoc', () => {
		// for Class, Function, Interface, or Variable

		describe('for a class', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testAnalyze(
					`/**
					 * foo
					 */
					class Foo {}`,
					[
						ASTClassDeclaration._(
							{
								joeDoc: ASTJoeDoc._(
									`/**
					 * foo
					 */`,
									mockPos,
								),
								modifiers: [],
								name: ASTIdentifier._('Foo', mockPos),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._([], mockPos),
							},
							mockPos,
						),
					],
				);
			});

			it('even when there are modifiers', () => {
				testAnalyze(
					`/**
					 * foo
					 */
					abstract class Foo {}`,
					[
						ASTClassDeclaration._(
							{
								joeDoc: ASTJoeDoc._(
									`/**
					 * foo
					 */`,
									mockPos,
								),
								modifiers: [ASTModifier._('abstract', mockPos)],
								name: ASTIdentifier._('Foo', mockPos),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._([], mockPos),
							},
							mockPos,
						),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testAnalyze(
					`/* foo */
					class Foo {}`,
					[
						ASTClassDeclaration._(
							{
								modifiers: [],
								name: ASTIdentifier._('Foo', mockPos),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._([], mockPos),
							},
							mockPos,
						),
					],
				);
			});
		});

		describe('for a function', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testAnalyze(
					`/** foo */
					f foo {}`,
					[
						ASTFunctionDeclaration._(
							{
								joeDoc: ASTJoeDoc._('/** foo */', mockPos),
								modifiers: [],
								name: ASTIdentifier._('foo', mockPos),
								typeParams: [],
								params: [],
								returnTypes: [],
								body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
							},
							mockPos,
						),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testAnalyze(
					`/* foo */
					f foo {}`,
					[
						ASTFunctionDeclaration._(
							{
								modifiers: [],
								name: ASTIdentifier._('foo', mockPos),
								typeParams: [],
								params: [],
								returnTypes: [],
								body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
							},
							mockPos,
						),
					],
				);
			});
		});

		describe('for an interface', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testAnalyze(
					`/** foo */
					interface Foo {}`,
					[
						ASTInterfaceDeclaration._(
							{
								joeDoc: ASTJoeDoc._('/** foo */', mockPos),
								modifiers: [],
								name: ASTIdentifier._('Foo', mockPos),
								typeParams: [],
								extends: [],
								body: ASTBlockStatement._([], mockPos),
							},
							mockPos,
						),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testAnalyze(
					`/* foo */
					interface Foo {}`,
					[
						ASTInterfaceDeclaration._(
							{
								modifiers: [],
								name: ASTIdentifier._('Foo', mockPos),
								typeParams: [],
								extends: [],
								body: ASTBlockStatement._([], mockPos),
							},
							mockPos,
						),
					],
				);
			});
		});

		describe('for a variable', () => {
			it('a properly formatted JoeDoc should be adopted', () => {
				testAnalyze(
					`/** foo */
					const foo = 1;`,
					[
						ASTVariableDeclaration._(
							{
								joeDoc: ASTJoeDoc._('/** foo */', mockPos),
								modifiers: [],
								mutable: false,
								identifiersList: [ASTIdentifier._('foo', mockPos)],
								declaredTypes: [],
								initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
								inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
							},
							mockPos,
						),
					],
				);
			});

			it('but a regular comment should not be adopted', () => {
				testAnalyze(
					`/* foo */
					const foo = 1;`,
					[
						ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: false,
								identifiersList: [ASTIdentifier._('foo', mockPos)],
								declaredTypes: [],
								initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
								inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
							},
							mockPos,
						),
					],
				);
			});
		});
	});

	describe('LoopStatement', (): void => {
		it('simple loop', () => {
			testAnalyze('loop {}', [
				ASTLoopStatement._(
					{
						body: ASTBlockStatement._([], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with done', () => {
			testAnalyze('loop {\ndone;\n}', [
				ASTLoopStatement._(
					{
						body: ASTBlockStatement._([ASTDoneStatement._(mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('with next', () => {
			testAnalyze('loop {\nnext;\n}', [
				ASTLoopStatement._(
					{
						body: ASTBlockStatement._([ASTNextStatement._(mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});
	});

	describe.skip('MemberExpression', () => {
		it('works with several nested layers', () => {
			testAnalyze('a.b.c.d', [
				ASTMemberExpression._(
					{
						object: ASTMemberExpression._(
							{
								object: ASTMemberExpression._(
									{
										object: ASTIdentifier._('a', mockPos),
										property: ASTIdentifier._('b', mockPos),
									},
									mockPos,
								),
								property: ASTIdentifier._('c', mockPos),
							},
							mockPos,
						),
						property: ASTIdentifier._('d', mockPos),
					},
					mockPos,
				),
			]);
		});

		it('works with this', () => {
			testAnalyze('this.foo', [
				ASTMemberExpression._(
					{
						object: ASTThisKeyword._(mockPos),
						property: ASTIdentifier._('foo', mockPos),
					},
					mockPos,
				),
			]);
		});

		describe('works with a TypeInstantiationExpression', () => {
			it('on the property', () => {
				testAnalyze('foo.bar<|T|>', [
					ASTMemberExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							property: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('bar', mockPos),
									typeArgs: [ASTIdentifier._('T', mockPos)],
								},
								mockPos,
							),
						},
						mockPos,
					),
				]);
			});

			it('on the object and uses dot notation', () => {
				testAnalyze('foo<|T|>.bar', [
					ASTMemberExpression._(
						{
							object: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('foo', mockPos),
									typeArgs: [ASTIdentifier._('T', mockPos)],
								},
								mockPos,
							),
							property: ASTIdentifier._('bar', mockPos),
						},
						mockPos,
					),
				]);
			});

			it('on the object and uses bracket notation', () => {
				testAnalyze('foo<|T|>["bar"]', [
					ASTMemberExpression._(
						{
							object: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('foo', mockPos),
									typeArgs: [ASTIdentifier._('T', mockPos)],
								},
								mockPos,
							),
							property: ASTStringLiteral._('bar', mockPos),
						},
						mockPos,
					),
				]);
			});

			it('with this', () => {
				testAnalyze('this.bar<|T|>', [
					ASTMemberExpression._(
						{
							object: ASTThisKeyword._(mockPos),
							property: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('bar', mockPos),
									typeArgs: [ASTIdentifier._('T', mockPos)],
								},
								mockPos,
							),
						},
						mockPos,
					),
				]);
			});
		});

		it('should parse a string in brackets as a MemberExpression property', () => {
			testAnalyze('foo["bar"]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', mockPos),
						property: ASTStringLiteral._('bar', mockPos),
					},
					mockPos,
				),
			]);
		});

		it('should parse a number in brackets as a MemberExpression property', () => {
			testAnalyze('foo[0]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', mockPos),
						property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('should parse an identifier in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', mockPos),
						property: ASTIdentifier._('bar', mockPos),
					},
					mockPos,
				),
			]);
		});

		it('should parse a MemberExpression in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar.baz]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', mockPos),
						property: ASTMemberExpression._(
							{
								object: ASTIdentifier._('bar', mockPos),
								property: ASTIdentifier._('baz', mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		it('should parse a CallExpression in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar()]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', mockPos),
						property: ASTCallExpression._(
							{
								callee: ASTIdentifier._('bar', mockPos),
								typeArgs: [],
								args: [],
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		it.each(unaryMathOperatorScenarios)(
			'should parse a UnaryExpression with a ${operator} operator in brackets as a MemberExpression property',
			({ operator, before, expression }) => {
				testAnalyze(`foo[${expression}]`, [
					ASTMemberExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							property: ASTUnaryExpression._(
								{
									before,
									operator,
									operand: ASTIdentifier._('bar', mockPos),
								},
								mockPos,
							),
						},
						mockPos,
					),
				]);
			},
		);

		it.each(binaryMathOperatorsThatArePartOfAMemberExpression)(
			'should parse a BinaryExpression with a ${operator} operator in brackets as a MemberExpression property',
			(operator) => {
				testAnalyze(`foo[index ${operator} 1]`, [
					ASTMemberExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							property: ASTBinaryExpression._(
								{
									operator,
									left: ASTIdentifier._('index', mockPos),
									right: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
								},
								mockPos,
							),
						},
						mockPos,
					),
				]);
			},
		);

		it('should parse a TernaryExpression in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar ? 0 : 1]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', mockPos),
						property: ASTTernaryExpression._(
							{
								test: ASTTernaryCondition._(ASTIdentifier._('bar', mockPos), mockPos),
								consequent: ASTTernaryConsequent._(
									ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
									mockPos,
								),
								alternate: ASTTernaryAlternate._(ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos), mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		describe('on literals', () => {
			it('should work on an ArrayExpression', () => {
				testAnalyze('["A", "B"][0]', [
					ASTMemberExpression._(
						{
							object: ASTArrayExpression._(
								{
									items: [ASTStringLiteral._('A', mockPos), ASTStringLiteral._('B', mockPos)],
									possibleTypes: [ASTTypePrimitive._('string', mockPos)],
								},
								mockPos,
							),
							property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('should work on a StringLiteral', () => {
				testAnalyze('"A"[0]', [
					ASTMemberExpression._(
						{
							object: ASTStringLiteral._('A', mockPos),
							property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('should work on an TupleExpression', () => {
				testAnalyze('<4, "B">[0]', [
					ASTMemberExpression._(
						{
							object: ASTTupleExpression._(
								[ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos), ASTStringLiteral._('B', mockPos)],
								mockPos,
							),
							property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('should work directly on a CallExpression', () => {
				testAnalyze(
					'foo()[0]',

					[
						ASTMemberExpression._(
							{
								object: ASTCallExpression._(
									{
										callee: ASTIdentifier._('foo', mockPos),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
								property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
					],
				);
			});
		});

		describe('should work on parenthesized objects', () => {
			it('should work on an ArrayExpression', () => {
				testAnalyze(
					'(["A", "B"])[0]',

					[
						ASTMemberExpression._(
							{
								object: ASTArrayExpression._(
									{
										items: [ASTStringLiteral._('A', mockPos), ASTStringLiteral._('B', mockPos)],
										possibleTypes: [ASTTypePrimitive._('string', mockPos)],
									},
									mockPos,
								),
								property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
					],
				);
			});

			it('should work on a StringLiteral', () => {
				testAnalyze('(("A"))[0]', [
					ASTMemberExpression._(
						{
							object: ASTStringLiteral._('A', mockPos),
							property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('should work on an TupleExpression', () => {
				testAnalyze(
					'(((((<4, "B">)))))[0]',

					[
						ASTMemberExpression._(
							{
								object: ASTTupleExpression._(
									[ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos), ASTStringLiteral._('B', mockPos)],
									mockPos,
								),
								property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
					],
				);
			});

			it('should work directly on a CallExpression', () => {
				testAnalyze(
					'(foo())[0]',

					[
						ASTMemberExpression._(
							{
								object: ASTCallExpression._(
									{
										callee: ASTIdentifier._('foo', mockPos),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
								property: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
					],
				);
			});
		});
	});

	describe.skip('MemberListExpression', () => {
		it('should parse string properties correctly', () => {
			testAnalyze(
				`this.foo['a', 'b'];`,

				[
					ASTMemberListExpression._(
						{
							object: ASTMemberExpression._(
								{
									object: ASTThisKeyword._(mockPos),
									property: ASTIdentifier._('foo', mockPos),
								},
								mockPos,
							),
							properties: [ASTStringLiteral._('a', mockPos), ASTStringLiteral._('b', mockPos)],
						},
						mockPos,
					),
				],
			);
		});

		it('should parse number indexes correctly', () => {
			testAnalyze(
				'this.foo[1, 3];',

				[
					ASTMemberListExpression._(
						{
							object: ASTMemberExpression._(
								{
									object: ASTThisKeyword._(mockPos),
									property: ASTIdentifier._('foo', mockPos),
								},
								mockPos,
							),
							properties: [
								ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
								ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
							],
						},
						mockPos,
					),
				],
			);
		});

		it('should parse identifier indexes correctly', () => {
			testAnalyze(
				'foo[a, b];',

				[
					ASTMemberListExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							properties: [ASTIdentifier._('a', mockPos), ASTIdentifier._('b', mockPos)],
						},
						mockPos,
					),
				],
			);
		});

		describe('works with a TypeInstantiationExpression', () => {
			it('on the object', () => {
				testAnalyze(
					'foo<|bar, baz|>["a", "b"];',

					[
						ASTMemberListExpression._(
							{
								object: ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('foo', mockPos),
										typeArgs: [ASTIdentifier._('bar', mockPos), ASTIdentifier._('baz', mockPos)],
									},
									mockPos,
								),
								properties: [ASTStringLiteral._('a', mockPos), ASTStringLiteral._('b', mockPos)],
							},
							mockPos,
						),
					],
				);
			});
		});

		it('should parse a RangeExpression in brackets as part of a MemberListExpression', () => {
			testAnalyze(
				'foo[1 .. 3]',

				[
					ASTMemberListExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							properties: [
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										upper: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
									},
									mockPos,
								),
							],
						},
						mockPos,
					),
				],
			);
		});

		it('should parse multiple RangeExpressions in brackets as part of a MemberListExpression', () => {
			testAnalyze(
				'foo[1 .. 3, 5 .. 7]',

				[
					ASTMemberListExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							properties: [
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										upper: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
									},
									mockPos,
								),
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos),
										upper: ASTNumberLiteral._(7, undefined, [...numberSizesInts], mockPos),
									},
									mockPos,
								),
							],
						},
						mockPos,
					),
				],
			);
		});

		it('should parse a UnaryExpression with a logical operator in brackets as part of a MemberListExpression', () => {
			testAnalyze(
				'foo[!bar]',

				[
					ASTMemberListExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							properties: [
								ASTUnaryExpression._(
									{
										before: true,
										operator: '!',
										operand: ASTIdentifier._('bar', mockPos),
									},
									mockPos,
								),
							],
						},
						mockPos,
					),
				],
			);
		});

		it.each([unaryMathOperatorScenarios])(
			'should parse multiple UnaryExpressions with any operators in brackets as part of a MemberListExpression',
			({ operator, before, expression }) => {
				testAnalyze(
					`foo[${expression}, ${expression}]`,

					[
						ASTMemberListExpression._(
							{
								object: ASTIdentifier._('foo', mockPos),
								properties: [
									ASTUnaryExpression._(
										{
											before,
											operator,
											operand: ASTIdentifier._('bar', mockPos),
										},
										mockPos,
									),
									ASTUnaryExpression._(
										{
											before,
											operator,
											operand: ASTIdentifier._('bar', mockPos),
										},
										mockPos,
									),
								],
							},
							mockPos,
						),
					],
				);
			},
		);

		it.each(binaryMathOperatorsThatArePartOfAMemberListExpression)(
			'should parse a BinaryExpression with a ${operator} operator in brackets as part of a MemberListExpression',
			(operator) => {
				testAnalyze(`foo[index ${operator} 1]`, [
					ASTMemberListExpression._(
						{
							object: ASTIdentifier._('foo', mockPos),
							properties: [
								ASTBinaryExpression._(
									{
										operator,
										left: ASTIdentifier._('index', mockPos),
										right: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
									},
									mockPos,
								),
							],
						},
						mockPos,
					),
				]);
			},
		);

		it.each(binaryMathOperatorsThatArePartOfAMemberListExpression)(
			'should parse multiple BinaryExpressions with ${operator} operators in brackets as part of a MemberListExpression',
			(operator) => {
				testAnalyze(
					`foo[index ${operator} 1, index ${operator} 2]`,

					[
						ASTMemberListExpression._(
							{
								object: ASTIdentifier._('foo', mockPos),
								properties: [
									ASTBinaryExpression._(
										{
											operator,
											left: ASTIdentifier._('index', mockPos),
											right: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
									ASTBinaryExpression._(
										{
											operator,
											left: ASTIdentifier._('index', mockPos),
											right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
								],
							},
							mockPos,
						),
					],
				);
			},
		);
	});

	describe.skip('Operators', (): void => {
		describe('UnaryExpression', (): void => {
			describe('negation', () => {
				it('with Identifier', (): void => {
					testAnalyze('!foo;', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '!',
								operand: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);
				});

				it('with Identifier in parens', (): void => {
					testAnalyze('(!foo);', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '!',
								operand: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);
				});

				it('with CallExpression', (): void => {
					testAnalyze(
						'!bar();',

						[
							ASTUnaryExpression._(
								{
									before: true,
									operator: '!',
									operand: ASTCallExpression._(
										{
											callee: ASTIdentifier._('bar', mockPos),
											typeArgs: [],
											args: [],
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
					);
				});

				it('with nested CallExpression', (): void => {
					testAnalyze('!foo.bar();', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '!',
								operand: ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('foo', mockPos),
												property: ASTIdentifier._('bar', mockPos),
											},
											mockPos,
										),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
							},
							mockPos,
						),
					]);
				});
			});

			describe('negative number', () => {
				it('without parens', (): void => {
					testAnalyze('-1', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(1, undefined, [...numberSizesSignedInts], mockPos),
							},
							mockPos,
						),
					]);
				});

				it('with parens', (): void => {
					testAnalyze('(-1)', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(1, undefined, [...numberSizesSignedInts], mockPos),
							},
							mockPos,
						),
					]);
				});
			});

			describe('increment and decrement', () => {
				it('pre-decrement', (): void => {
					testAnalyze('--foo', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '--',
								operand: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);

					testAnalyze(
						'foo[--i]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									property: ASTUnaryExpression._(
										{
											before: true,
											operator: '--',
											operand: ASTIdentifier._('i', mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
					);
				});

				it('post-decrement', (): void => {
					testAnalyze('foo--', [
						ASTUnaryExpression._(
							{
								before: false,
								operator: '--',
								operand: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);
				});

				it('post-decrement in array index', (): void => {
					testAnalyze(
						'foo[i--]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									property: ASTUnaryExpression._(
										{
											before: false,
											operator: '--',
											operand: ASTIdentifier._('i', mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
					);
				});

				it('pre-increment', (): void => {
					testAnalyze('++foo', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '++',
								operand: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);

					testAnalyze(
						'foo[++i]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									property: ASTUnaryExpression._(
										{
											before: true,
											operator: '++',
											operand: ASTIdentifier._('i', mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
					);
				});

				it('post-increment', (): void => {
					testAnalyze('foo++', [
						ASTUnaryExpression._(
							{
								before: false,
								operator: '++',
								operand: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);

					testAnalyze(
						'foo[i++]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', mockPos),
									property: ASTUnaryExpression._(
										{
											before: false,
											operator: '++',
											operand: ASTIdentifier._('i', mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
					);
				});

				describe('invalid syntax', (): void => {
					it('pre-decrement invalid syntax', (): void => {
						const result = analyze('foo---', true, false);

						// use assert instead of expect, since we need TS to narrow the type
						assert(result.isError(), `Expected: "error", Received: "ok"`);
						expect(result.error.message).toBe('We were expecting an Expression, but found "undefined"');
					});

					it('pre-increment invalid syntax', (): void => {
						const result = analyze('foo+++', true, false);

						// use assert instead of expect, since we need TS to narrow the type
						assert(result.isError(), `Expected: "error", Received: "ok"`);
						expect(result.error.message).toBe('We were expecting an Expression, but found "undefined"');
					});
				});
			});
		});

		describe('BinaryExpression', (): void => {
			describe('with bools', (): void => {
				it('double pipe', (): void => {
					testAnalyze('a || true', [
						ASTBinaryExpression._(
							{
								operator: '||',
								left: ASTIdentifier._('a', mockPos),
								right: ASTBoolLiteral._(true, mockPos),
							},
							mockPos,
						),
					]);
				});

				it('double ampersand', (): void => {
					testAnalyze(
						'a && true',

						[
							ASTBinaryExpression._(
								{
									operator: '&&',
									left: ASTIdentifier._('a', mockPos),
									right: ASTBoolLiteral._(true, mockPos),
								},
								mockPos,
							),
						],
					);
				});
			});

			describe('compound with operator precedence', (): void => {
				it('makes && higher precedence than equality checks', () => {
					testAnalyze(
						'foo >= 2 && foo <= 5',

						[
							ASTBinaryExpression._(
								{
									operator: '&&',
									left: ASTBinaryExpression._(
										{
											operator: '>=',
											left: ASTIdentifier._('foo', mockPos),
											right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
									right: ASTBinaryExpression._(
										{
											operator: '<=',
											left: ASTIdentifier._('foo', mockPos),
											right: ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
					);
				});

				it('makes || higher precedence than equality checks', () => {
					testAnalyze(
						'foo > 2 || foo < 5',

						[
							ASTBinaryExpression._(
								{
									operator: '||',
									left: ASTBinaryExpression._(
										{
											operator: '>',
											left: ASTIdentifier._('foo', mockPos),
											right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
									right: ASTBinaryExpression._(
										{
											operator: '<',
											left: ASTIdentifier._('foo', mockPos),
											right: ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
						],
					);
				});
			});

			describe('with parens involved', () => {
				it('around one side', () => {
					testAnalyze(
						'a && (true)',

						[
							ASTBinaryExpression._(
								{
									operator: '&&',
									left: ASTIdentifier._('a', mockPos),
									right: ASTBoolLiteral._(true, mockPos),
								},
								mockPos,
							),
						],
					);

					testAnalyze('(a) && true', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTIdentifier._('a', mockPos),
								right: ASTBoolLiteral._(true, mockPos),
							},
							mockPos,
						),
					]);
				});

				it('with a function call', () => {
					testAnalyze('a && foo(true)', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTIdentifier._('a', mockPos),
								right: ASTCallExpression._(
									{
										callee: ASTIdentifier._('foo', mockPos),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, mockPos)],
									},
									mockPos,
								),
							},
							mockPos,
						),
					]);

					testAnalyze('a(true) && foo', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTCallExpression._(
									{
										callee: ASTIdentifier._('a', mockPos),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, mockPos)],
									},
									mockPos,
								),
								right: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);
				});

				it('with a function call in parens', () => {
					testAnalyze('a && (foo(true))', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTIdentifier._('a', mockPos),
								right: ASTCallExpression._(
									{
										callee: ASTIdentifier._('foo', mockPos),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, mockPos)],
									},
									mockPos,
								),
							},
							mockPos,
						),
					]);

					testAnalyze('(a(true)) && foo', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTCallExpression._(
									{
										callee: ASTIdentifier._('a', mockPos),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, mockPos)],
									},
									mockPos,
								),
								right: ASTIdentifier._('foo', mockPos),
							},
							mockPos,
						),
					]);
				});
			});
		});
	});

	describe.skip('Parens', (): void => {
		describe('mathematical expressions', (): void => {
			it('a simple mathematical formula', (): void => {
				testAnalyze('1 + (2 * (-3/-(2.3-4)%9))', []);
			});

			it('supports mathematical expressions with variables', (): void => {
				testAnalyze('const foo = 1; let bar = -foo;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
							inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('bar', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTUnaryExpression._(
									{
										before: true,
										operator: '-',
										operand: ASTIdentifier._('foo', mockPos),
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
				]);
			});
		});
	});

	describe.skip('PostfixIfStatement', (): void => {
		it('after a CallExpression', () => {
			testAnalyze('do(1) if foo == 2;', [
				ASTPostfixIfStatement._(
					{
						expression: ASTCallExpression._(
							{
								callee: ASTIdentifier._('do', mockPos),
								typeArgs: [],
								args: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
							},
							mockPos,
						),
						test: ASTBinaryExpression._(
							{
								operator: '==',
								left: ASTIdentifier._('foo', mockPos),
								right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		describe('in an array', () => {
			it('with bool conditional', () => {
				testAnalyze('[foo if true, bar];', [
					ASTArrayExpression._(
						{
							items: [
								ASTPostfixIfStatement._(
									{
										expression: ASTIdentifier._('foo', mockPos),
										test: ASTBoolLiteral._(true, mockPos),
									},
									mockPos,
								),
								ASTIdentifier._('bar', mockPos),
							],
							possibleTypes: [],
						},
						mockPos,
					),
				]);
			});

			it('with identifier conditional', () => {
				testAnalyze('[9, 10 if isDone?, 11];', [
					ASTArrayExpression._(
						{
							items: [
								ASTNumberLiteral._(9, undefined, [...numberSizesInts], mockPos),
								ASTPostfixIfStatement._(
									{
										expression: ASTNumberLiteral._(10, undefined, [...numberSizesInts], mockPos),
										test: ASTIdentifier._('isDone?', mockPos),
									},
									mockPos,
								),
								ASTNumberLiteral._(11, undefined, [...numberSizesInts], mockPos),
							],
							possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
						},
						mockPos,
					),
				]);
			});

			it('with MemberExpression conditional and comment', () => {
				testAnalyze(
					`[
						9 if this.isDone?, // comment
						10,
						11,
					];`,
					[
						ASTArrayExpression._(
							{
								items: [
									ASTPostfixIfStatement._(
										{
											expression: ASTNumberLiteral._(9, undefined, [...numberSizesInts], mockPos),
											test: ASTMemberExpression._(
												{
													object: ASTThisKeyword._(mockPos),
													property: ASTIdentifier._('isDone?', mockPos),
												},
												mockPos,
											),
										},
										mockPos,
									),
									ASTNumberLiteral._(10, undefined, [...numberSizesInts], mockPos),
									ASTNumberLiteral._(11, undefined, [...numberSizesInts], mockPos),
								],
								possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
							},
							mockPos,
						),
					],
				);
			});

			it('with CallExpression conditional', () => {
				testAnalyze('[9, 10 if this.isDone?([true if true]), 11];', [
					ASTArrayExpression._(
						{
							items: [
								ASTNumberLiteral._(9, undefined, [...numberSizesInts], mockPos),
								ASTPostfixIfStatement._(
									{
										expression: ASTNumberLiteral._(10, undefined, [...numberSizesInts], mockPos),
										test: ASTCallExpression._(
											{
												callee: ASTMemberExpression._(
													{
														object: ASTThisKeyword._(mockPos),
														property: ASTIdentifier._('isDone?', mockPos),
													},
													mockPos,
												),
												typeArgs: [],
												args: [
													ASTArrayExpression._(
														{
															items: [
																ASTPostfixIfStatement._(
																	{
																		expression: ASTBoolLiteral._(true, mockPos),
																		test: ASTBoolLiteral._(true, mockPos),
																	},
																	mockPos,
																),
															],
															possibleTypes: [ASTTypePrimitive._('bool', mockPos)],
														},
														mockPos,
													),
												],
											},
											mockPos,
										),
									},
									mockPos,
								),
								ASTNumberLiteral._(11, undefined, [...numberSizesInts], mockPos),
							],
							possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
						},
						mockPos,
					),
				]);
			});

			it('with BinaryExpression conditional using two NumberLiterals', () => {
				testAnalyze('[\'foo\', "bar" if 1 < 2];', [
					ASTArrayExpression._(
						{
							items: [
								ASTStringLiteral._('foo', mockPos),
								ASTPostfixIfStatement._(
									{
										expression: ASTStringLiteral._('bar', mockPos),
										test: ASTBinaryExpression._(
											{
												operator: '<',
												left: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
												right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
											},
											mockPos,
										),
									},
									mockPos,
								),
							],
							possibleTypes: [ASTTypePrimitive._('string', mockPos)],
						},
						mockPos,
					),
				]);
			});

			it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
				testAnalyze('[true, true, false, false if foo == 2, true, false, true];', [
					ASTArrayExpression._(
						{
							items: [
								ASTBoolLiteral._(true, mockPos),
								ASTBoolLiteral._(true, mockPos),
								ASTBoolLiteral._(false, mockPos),
								ASTPostfixIfStatement._(
									{
										expression: ASTBoolLiteral._(false, mockPos),
										test: ASTBinaryExpression._(
											{
												operator: '==',
												left: ASTIdentifier._('foo', mockPos),
												right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
											},
											mockPos,
										),
									},
									mockPos,
								),
								ASTBoolLiteral._(true, mockPos),
								ASTBoolLiteral._(false, mockPos),
								ASTBoolLiteral._(true, mockPos),
							],
							possibleTypes: [ASTTypePrimitive._('bool', mockPos)],
						},
						mockPos,
					),
				]);
			});
		});
	});

	describe.skip('Print', () => {
		it('is closed with a semicolon', () => {
			testAnalyze('print foo[5];print 5;', [
				ASTPrintStatement._(
					[
						ASTMemberExpression._(
							{
								object: ASTIdentifier._('foo', mockPos),
								property: ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos),
							},
							mockPos,
						),
					],
					mockPos,
				),
				ASTPrintStatement._([ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos)], mockPos),
			]);
		});

		it('should work with a CallExpression', () => {
			testAnalyze('print myFoo.foo();', [
				ASTPrintStatement._(
					[
						ASTCallExpression._(
							{
								callee: ASTMemberExpression._(
									{
										object: ASTIdentifier._('myFoo', mockPos),
										property: ASTIdentifier._('foo', mockPos),
									},
									mockPos,
								),
								typeArgs: [],
								args: [],
							},
							mockPos,
						),
					],
					mockPos,
				),
			]);
		});

		it('should work with a comma-delimited list', () => {
			testAnalyze('print 1, "a", [true], <"high", 5>;', [
				ASTPrintStatement._(
					[
						ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
						ASTStringLiteral._('a', mockPos),
						ASTArrayExpression._(
							{
								items: [ASTBoolLiteral._(true, mockPos)],
								possibleTypes: [ASTTypePrimitive._('bool', mockPos)],
							},
							mockPos,
						),
						ASTTupleExpression._(
							[ASTStringLiteral._('high', mockPos), ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos)],
							mockPos,
						),
					],
					mockPos,
				),
			]);
		});
	});

	describe.skip('RangeExpression', (): void => {
		// 2 numbers
		it('.. with 2 number literals', (): void => {
			testAnalyze(
				'1..2;', // this one should not have spaces since even though we recommend spaces, they are optional
				[
					ASTRangeExpression._(
						{
							lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
							upper: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
						},
						mockPos,
					),
				],
			);

			testAnalyze('-1 .. 2;', [
				ASTRangeExpression._(
					{
						lower: ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(1, undefined, [...numberSizesSignedInts], mockPos),
							},
							mockPos,
						),
						upper: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
					},
					mockPos,
				),
			]);

			testAnalyze('1 .. -2;', [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
						upper: ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(2, undefined, [...numberSizesSignedInts], mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);

			testAnalyze('-1 .. -2;', [
				ASTRangeExpression._(
					{
						lower: ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(1, undefined, [...numberSizesSignedInts], mockPos),
							},
							mockPos,
						),
						upper: ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(2, undefined, [...numberSizesSignedInts], mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		// identifier and number
		it('.. with identifier and number literal', (): void => {
			testAnalyze('foo .. 2;', [
				ASTRangeExpression._(
					{
						lower: ASTIdentifier._('foo', mockPos),
						upper: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('.. with number literal and identifier', (): void => {
			testAnalyze('1 .. foo;', [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
						upper: ASTIdentifier._('foo', mockPos),
					},
					mockPos,
				),
			]);
		});

		// element access and number
		it('.. with element access and number literal', (): void => {
			testAnalyze("foo['a'] .. 2;", [
				ASTRangeExpression._(
					{
						lower: ASTMemberExpression._(
							{
								object: ASTIdentifier._('foo', mockPos),
								property: ASTStringLiteral._('a', mockPos),
							},
							mockPos,
						),
						upper: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('.. with number literal and element access', (): void => {
			testAnalyze("1 .. foo['a'];'a'", [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
						upper: ASTMemberExpression._(
							{
								object: ASTIdentifier._('foo', mockPos),
								property: ASTStringLiteral._('a', mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
				ASTStringLiteral._('a', mockPos),
			]);
		});

		// method call and number
		it('.. with method call and number literal', (): void => {
			testAnalyze("foo('a') .. 2;", [
				ASTRangeExpression._(
					{
						lower: ASTCallExpression._(
							{
								callee: ASTIdentifier._('foo', mockPos),
								typeArgs: [],
								args: [ASTStringLiteral._('a', mockPos)],
							},
							mockPos,
						),
						upper: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('.. with number literal and method call', (): void => {
			testAnalyze("1 .. foo('a');", [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
						upper: ASTCallExpression._(
							{
								callee: ASTIdentifier._('foo', mockPos),
								typeArgs: [],
								args: [ASTStringLiteral._('a', mockPos)],
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		// element access and method call
		it('.. with element access and method call', (): void => {
			testAnalyze("foo['a'] .. bar('b');", [
				ASTRangeExpression._(
					{
						lower: ASTMemberExpression._(
							{
								object: ASTIdentifier._('foo', mockPos),
								property: ASTStringLiteral._('a', mockPos),
							},
							mockPos,
						),
						upper: ASTCallExpression._(
							{
								callee: ASTIdentifier._('bar', mockPos),
								typeArgs: [],
								args: [ASTStringLiteral._('b', mockPos)],
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		it('.. with method call and element access', (): void => {
			testAnalyze("foo('a') .. bar['b'];", [
				ASTRangeExpression._(
					{
						lower: ASTCallExpression._(
							{
								callee: ASTIdentifier._('foo', mockPos),
								typeArgs: [],
								args: [ASTStringLiteral._('a', mockPos)],
							},
							mockPos,
						),
						upper: ASTMemberExpression._(
							{
								object: ASTIdentifier._('bar', mockPos),
								property: ASTStringLiteral._('b', mockPos),
							},
							mockPos,
						),
					},
					mockPos,
				),
			]);
		});

		it('.. with two in a row', () => {
			testAnalyze('let count, countDown = 1 .. myArray[2], myArray[1] .. 0;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('count', mockPos), ASTIdentifier._('countDown', mockPos)],
						declaredTypes: [],
						initialValues: [
							ASTRangeExpression._(
								{
									lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
									upper: ASTMemberExpression._(
										{
											object: ASTIdentifier._('myArray', mockPos),
											property: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
								},
								mockPos,
							),
							ASTRangeExpression._(
								{
									lower: ASTMemberExpression._(
										{
											object: ASTIdentifier._('myArray', mockPos),
											property: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										},
										mockPos,
									),
									upper: ASTNumberLiteral._(0, undefined, [...numberSizesInts], mockPos),
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [[ASTTypeRange._(mockPos)], [ASTTypeRange._(mockPos)]],
					},
					mockPos,
				),
			]);
		});
	});

	describe.skip('Types', (): void => {
		describe('should understand primitive types', () => {
			it.each(primitiveTypes)('%s is recognized as its own primitive type', (type) => {
				testAnalyze(type, [ASTTypePrimitive._(type, mockPos)]);
			});

			it.each(numberSizesAll)('%s is recognized as a number type', (size) => {
				testAnalyze(size, [ASTTypeNumber._(size, mockPos)]);
			});

			it('range is recognized as a type', () => {
				testAnalyze('range', [ASTTypeRange._(mockPos)]);
			});

			it.each(primitiveTypes)('%s[] is recognized as a one-dimensional array of type', (type) => {
				testAnalyze(`${type}[]`, [ASTArrayOf._(ASTTypePrimitive._(type, mockPos), mockPos)]);
			});

			it.each(numberSizesAll)('%s[] is recognized as a one-dimensional array of type', (size) => {
				testAnalyze(`${size}[]`, [ASTArrayOf._(ASTTypeNumber._(size, mockPos), mockPos)]);
			});

			it('range[] is recognized as a one-dimensional array of type', () => {
				testAnalyze('range[]', [ASTArrayOf._(ASTTypeRange._(mockPos), mockPos)]);
			});

			it.each(primitiveTypes)('%s[][] is recognized as a two-dimensional array of primitive type', (type) => {
				testAnalyze(`${type}[][]`, [ASTArrayOf._(ASTArrayOf._(ASTTypePrimitive._(type, mockPos), mockPos), mockPos)]);
			});

			it.each(numberSizesAll)('%s[][] is recognized as a two-dimensional array of number type', (size) => {
				testAnalyze(`${size}[][]`, [ASTArrayOf._(ASTArrayOf._(ASTTypeNumber._(size, mockPos), mockPos), mockPos)]);
			});
		});

		describe('arrays', () => {
			it('should understand a custom array', () => {
				testAnalyze('Foo[]', [ASTArrayOf._(ASTIdentifier._('Foo', mockPos), mockPos)]);

				testAnalyze('Foo[][]', [ASTArrayOf._(ASTArrayOf._(ASTIdentifier._('Foo', mockPos), mockPos), mockPos)]);
			});
		});

		describe('ranges', () => {
			it('should recognize a range type in a variable declaration', () => {
				testAnalyze('let x: range;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('x', mockPos)],
							declaredTypes: [ASTTypeRange._(mockPos)],
							initialValues: [],
							inferredPossibleTypes: [],
						},
						mockPos,
					),
				]);
			});

			it('should infer a range type for a variable declaration with an initial value and also ignore parentheses', () => {
				testAnalyze('let x = 1 .. (2);', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('x', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										upper: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[ASTTypeRange._(mockPos)]],
						},
						mockPos,
					),
				]);
			});

			it('should recognize a range type in a function parameter and return type', () => {
				testAnalyze('f foo (x: range) -> range {}', [
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('foo', mockPos),
							typeParams: [],
							params: [
								ASTParameter._(
									{
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('x', mockPos),
										type: ASTTypeRange._(mockPos),
									},
									mockPos,
								),
							],
							returnTypes: [ASTTypeRange._(mockPos)],
							body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
						},
						mockPos,
					),
				]);
			});
		});

		describe('TypeParameter', () => {
			it('should accept just a type', () => {
				testAnalyze('class Foo<|T|> {}', [
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, undefined, mockPos)],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('should accept a type and a constraint', () => {
				testAnalyze('class Foo<|T: Bar|> {}', [
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', mockPos), ASTIdentifier._('Bar', mockPos), undefined, mockPos),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('should accept a type and a default type', () => {
				testAnalyze('class Foo<|T = Bar|> {}', [
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', mockPos), undefined, ASTIdentifier._('Bar', mockPos), mockPos),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				]);
			});

			it('should accept a type, a constraint, and a default type', () => {
				testAnalyze('class Foo<|T: Bar = Baz|> {}', [
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', mockPos),
							typeParams: [
								ASTTypeParameter._(
									ASTIdentifier._('T', mockPos),
									ASTIdentifier._('Bar', mockPos),
									ASTIdentifier._('Baz', mockPos),
									mockPos,
								),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], mockPos),
						},
						mockPos,
					),
				]);
			});
		});
	});

	describe.skip('UseDeclaration', (): void => {
		describe('uses', (): void => {
			it('single, default use', (): void => {
				testAnalyze('use mainJoeFile from ./some/dir/;use another from @/lexer.joe;', [
					ASTUseDeclaration._(
						{
							identifier: ASTIdentifier._('mainJoeFile', mockPos),
							source: ASTPath._(
								{
									absolute: false,
									path: './some/dir/',
									isDir: true,
								},
								mockPos,
							),
						},
						mockPos,
					),
					ASTUseDeclaration._(
						{
							identifier: ASTIdentifier._('another', mockPos),
							source: ASTPath._(
								{
									absolute: true,
									path: '@/lexer.joe',
									isDir: false,
								},
								mockPos,
							),
						},
						mockPos,
					),
				]);
			});
		});
	});

	describe.skip('VariableDeclaration', (): void => {
		it('a let assignment with a bool literal', (): void => {
			testAnalyze('let x = false', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', mockPos)],
						declaredTypes: [],
						initialValues: [ASTBoolLiteral._(false, mockPos)],
						inferredPossibleTypes: [[ASTTypePrimitive._('bool', mockPos)]],
					},
					mockPos,
				),
			]);

			testAnalyze('let x?, y = false, true', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x?', mockPos), ASTIdentifier._('y', mockPos)],
						declaredTypes: [ASTTypePrimitive._('bool', mockPos)],
						initialValues: [ASTBoolLiteral._(false, mockPos), ASTBoolLiteral._(true, mockPos)],
						inferredPossibleTypes: [[], [ASTTypePrimitive._('bool', mockPos)]], // the question mark declares the type as bool, so no need to infer
					},
					mockPos,
				),
			]);
		});

		it('a double bool assignment and the second one has a question mark', (): void => {
			const declaredTypes = <ASTType[]>[];
			declaredTypes[1] = ASTTypePrimitive._('bool', mockPos);

			testAnalyze('let x, y? = false, true', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', mockPos), ASTIdentifier._('y?', mockPos)],
						declaredTypes: declaredTypes,
						initialValues: [ASTBoolLiteral._(false, mockPos), ASTBoolLiteral._(true, mockPos)],
						inferredPossibleTypes: [[ASTTypePrimitive._('bool', mockPos)], []], // the question mark declares the type as bool, so no need to infer
					},
					mockPos,
				),
			]);
		});

		it('a let assignment with a number literal', (): void => {
			testAnalyze('let x = 1', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', mockPos)],
						declaredTypes: [],
						initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
						inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
					},
					mockPos,
				),
			]);
		});

		describe('a let assignment with exponents', () => {
			it('works with negative exponents', (): void => {
				testAnalyze('const x = -2_300.006^e-2_000; const y = 5;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('x', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTBinaryExpression._(
									{
										operator: '^e',
										left: ASTUnaryExpression._(
											{
												before: true,
												operator: '-',
												operand: ASTNumberLiteral._(2300.006, undefined, [...numberSizesDecimals], mockPos),
											},
											mockPos,
										),
										right: ASTUnaryExpression._(
											{
												before: true,
												operator: '-',
												operand: ASTNumberLiteral._(2000, undefined, ['int16', 'int32', 'int64'], mockPos),
											},
											mockPos,
										),
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [NumberSizesDecimalASTs.map((ns) => ns(mockPos))], // all possible decimal number sizes
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('y', mockPos)],
							declaredTypes: [],
							initialValues: [ASTNumberLiteral._(5, undefined, [...numberSizesInts], mockPos)],
							inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
						},
						mockPos,
					),
				]);
			});

			it('a 64-bit main number and a negative exponent should infer the possible types as dec64 and higher only', (): void => {
				testAnalyze('const x = 214748364723^e-2;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('x', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTBinaryExpression._(
									{
										operator: '^e',
										left: ASTNumberLiteral._(214748364723, undefined, ['int64', 'uint64'], mockPos),
										right: ASTUnaryExpression._(
											{
												before: true,
												operator: '-',
												operand: ASTNumberLiteral._(2, undefined, [...numberSizesSignedInts], mockPos),
											},
											mockPos,
										),
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[ASTTypeNumber._('dec64', mockPos)]], // only 64 bit decimal number sizes or higher
						},
						mockPos,
					),
				]);
			});
		});

		it('a let assignment with a string literal', (): void => {
			testAnalyze('let x = "foo"', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', mockPos)],
						declaredTypes: [],
						initialValues: [ASTStringLiteral._('foo', mockPos)],
						inferredPossibleTypes: [[ASTTypePrimitive._('string', mockPos)]],
					},
					mockPos,
				),
			]);
		});

		it('a let with a specified type', (): void => {
			testAnalyze('let x: string;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', mockPos)],
						declaredTypes: [ASTTypePrimitive._('string', mockPos)],
						initialValues: [],
						inferredPossibleTypes: [],
					},
					mockPos,
				),
			]);

			testAnalyze('let x?: bool;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x?', mockPos)],
						declaredTypes: [ASTTypePrimitive._('bool', mockPos)],
						initialValues: [],
						inferredPossibleTypes: [],
					},
					mockPos,
				),
			]);
		});

		it('a const assignment with a specified type', (): void => {
			testAnalyze('const x: string = "foo"', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('x', mockPos)],
						declaredTypes: [ASTTypePrimitive._('string', mockPos)],
						initialValues: [ASTStringLiteral._('foo', mockPos)],
						inferredPossibleTypes: [[]],
					},
					mockPos,
				),
			]);
		});

		it('regex', (): void => {
			testAnalyze('const x = /[a-z]/;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('x', mockPos)],
						declaredTypes: [],
						initialValues: [ASTRegularExpression._({ pattern: '/[a-z]/', flags: [] }, mockPos)],
						inferredPossibleTypes: [[ASTTypePrimitive._('regex', mockPos)]],
					},
					mockPos,
				),
			]);

			testAnalyze('const x: regex = /[0-9]*/g;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('x', mockPos)],
						declaredTypes: [ASTTypePrimitive._('regex', mockPos)],
						initialValues: [ASTRegularExpression._({ pattern: '/[0-9]*/', flags: ['g'] }, mockPos)],
						inferredPossibleTypes: [[]],
					},
					mockPos,
				),
			]);
		});

		it('path', (): void => {
			testAnalyze('const dir = @/path/to/dir/;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('dir', mockPos)],
						declaredTypes: [],
						initialValues: [
							ASTPath._(
								{
									absolute: true,
									path: '@/path/to/dir/',
									isDir: true,
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [[ASTTypePrimitive._('path', mockPos)]],
					},
					mockPos,
				),
			]);

			testAnalyze('const dir = ./myDir/;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('dir', mockPos)],
						declaredTypes: [],
						initialValues: [ASTPath._({ absolute: false, path: './myDir/', isDir: true }, mockPos)],
						inferredPossibleTypes: [[ASTTypePrimitive._('path', mockPos)]],
					},
					mockPos,
				),
			]);

			testAnalyze('const file: path = @/path/to/file.joe;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('file', mockPos)],
						declaredTypes: [ASTTypePrimitive._('path', mockPos)],
						initialValues: [
							ASTPath._(
								{
									absolute: true,
									path: '@/path/to/file.joe',
									isDir: false,
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [[]],
					},
					mockPos,
				),
			]);
		});

		it('assign to another variable', () => {
			testAnalyze('const dir = foo;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('dir', mockPos)],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('foo', mockPos)],
						inferredPossibleTypes: [[]],
					},
					mockPos,
				),
			]);
		});

		describe('custom type', (): void => {
			it('one word', (): void => {
				testAnalyze('const myClass: MyClass = MyClass.create();', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('myClass', mockPos)],
							declaredTypes: [ASTIdentifier._('MyClass', mockPos)],
							initialValues: [
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('MyClass', mockPos),
												property: ASTIdentifier._('create', mockPos),
											},
											mockPos,
										),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
				]);
			});

			it('member expression', (): void => {
				testAnalyze('const myClass: MyPackage.MyClass = MyClass.create();', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('myClass', mockPos)],
							declaredTypes: [
								ASTMemberExpression._(
									{
										object: ASTIdentifier._('MyPackage', mockPos),
										property: ASTIdentifier._('MyClass', mockPos),
									},
									mockPos,
								),
							],
							initialValues: [
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('MyClass', mockPos),
												property: ASTIdentifier._('create', mockPos),
											},
											mockPos,
										),
										typeArgs: [],
										args: [],
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
				]);
			});
		});

		describe('tuples', () => {
			it('tuple', () => {
				testAnalyze('const foo = <1, "pizza", 3.14>;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTTupleExpression._(
									[
										ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
										ASTStringLiteral._('pizza', mockPos),
										ASTNumberLiteral._(3.14, undefined, [...numberSizesDecimals], mockPos),
									],
									mockPos,
								),
							],
							inferredPossibleTypes: [
								[
									ASTTupleShape._(
										[
											NumberSizesIntASTs.map((ns) => ns(mockPos)),
											[ASTTypePrimitive._('string', mockPos)],
											NumberSizesDecimalASTs.map((ns) => ns(mockPos)),
										],
										mockPos,
									),
								],
							],
						},
						mockPos,
					),
				]);
			});

			it('empty tuple', () => {
				testAnalyze('const foo = <>;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [ASTTupleExpression._([], mockPos)],
							inferredPossibleTypes: [[ASTTupleShape._([], mockPos)]],
						},
						mockPos,
					),
				]);
			});

			it('nested tuples', () => {
				testAnalyze(
					`const foo = <
						<1, 'pizza', 3.14>,
						true,
						@/some/file.joe,
						1 .. 3,
						<1, 2, 'fizz', 4, 'buzz'>
					>;`,
					[
						ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: false,
								identifiersList: [ASTIdentifier._('foo', mockPos)],
								declaredTypes: [],
								initialValues: [
									ASTTupleExpression._(
										[
											ASTTupleExpression._(
												[
													ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
													ASTStringLiteral._('pizza', mockPos),
													ASTNumberLiteral._(3.14, undefined, [...numberSizesDecimals], mockPos),
												],
												mockPos,
											),
											ASTBoolLiteral._(true, mockPos),
											ASTPath._(
												{
													absolute: true,
													path: '@/some/file.joe',
													isDir: false,
												},
												mockPos,
											),
											ASTRangeExpression._(
												{
													lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
													upper: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
												},
												mockPos,
											),
											ASTTupleExpression._(
												[
													ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
													ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
													ASTStringLiteral._('fizz', mockPos),
													ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
													ASTStringLiteral._('buzz', mockPos),
												],
												mockPos,
											),
										],
										mockPos,
									),
								],
								inferredPossibleTypes: [
									[
										ASTTupleShape._(
											[
												[
													ASTTupleShape._(
														[
															NumberSizesIntASTs.map((ns) => ns(mockPos)),
															[ASTTypePrimitive._('string', mockPos)],
															NumberSizesDecimalASTs.map((ns) => ns(mockPos)),
														],
														mockPos,
													),
												],
												[ASTTypePrimitive._('bool', mockPos)],
												[ASTTypePrimitive._('path', mockPos)],
												[ASTTypeRange._(mockPos)],
												[
													ASTTupleShape._(
														[
															NumberSizesIntASTs.map((ns) => ns(mockPos)),
															NumberSizesIntASTs.map((ns) => ns(mockPos)),
															[ASTTypePrimitive._('string', mockPos)],
															NumberSizesIntASTs.map((ns) => ns(mockPos)),
															[ASTTypePrimitive._('string', mockPos)],
														],
														mockPos,
													),
												],
											],
											mockPos,
										),
									],
								],
							},
							mockPos,
						),
					],
				);
			});

			it('with ternary in item', () => {
				testAnalyze(
					`<
						1,
						someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
						true
					>`,
					[
						ASTTupleExpression._(
							[
								ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
								ASTTernaryExpression._(
									{
										test: ASTTernaryCondition._(ASTIdentifier._('someCondition', mockPos), mockPos),
										consequent: ASTTernaryConsequent._(ASTStringLiteral._('burnt-orange', mockPos), mockPos),
										alternate: ASTTernaryAlternate._(ASTStringLiteral._('', mockPos), mockPos),
									},
									mockPos,
								),
								ASTBoolLiteral._(true, mockPos),
							],
							mockPos,
						),
					],
				);
			});

			it('tuple in object', () => {
				testAnalyze('const foo = {tpl: <1>};', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTObjectExpression._(
									[
										ASTProperty._(
											ASTIdentifier._('tpl', mockPos),
											ASTTupleExpression._(
												[ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
												mockPos,
											),
											mockPos,
										),
									],
									mockPos,
								),
							],
							inferredPossibleTypes: [
								[
									ASTObjectShape._(
										[
											ASTPropertyShape._(
												ASTIdentifier._('tpl', mockPos),
												[ASTTupleShape._([NumberSizesIntASTs.map((ns) => ns(mockPos))], mockPos)],
												mockPos,
											),
										],
										mockPos,
									),
								],
							],
						},
						mockPos,
					),
				]);
			});
		});

		describe('arrays of', (): void => {
			it('bools', (): void => {
				testAnalyze('[false, true, true, false]', [
					ASTArrayExpression._(
						{
							items: [
								ASTBoolLiteral._(false, mockPos),
								ASTBoolLiteral._(true, mockPos),
								ASTBoolLiteral._(true, mockPos),
								ASTBoolLiteral._(false, mockPos),
							],
							possibleTypes: [ASTTypePrimitive._('bool', mockPos)],
						},
						mockPos,
					),
				]);
			});

			it('numbers', () => {
				testAnalyze('[1, -2, 3_456, 3^e-2, 3.14, 1_2_3]', [
					ASTArrayExpression._(
						{
							items: [
								ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
								ASTUnaryExpression._(
									{
										before: true,
										operator: '-',
										operand: ASTNumberLiteral._(2, undefined, [...numberSizesSignedInts], mockPos),
									},
									mockPos,
								),
								ASTNumberLiteral._(3456, undefined, ['int16', 'int32', 'int64', 'uint16', 'uint32', 'uint64'], mockPos),
								ASTBinaryExpression._(
									{
										operator: '^e',
										left: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
										right: ASTUnaryExpression._(
											{
												before: true,
												operator: '-',
												operand: ASTNumberLiteral._(2, undefined, [...numberSizesSignedInts], mockPos),
											},
											mockPos,
										),
									},
									mockPos,
								),
								ASTNumberLiteral._(3.14, undefined, [...numberSizesDecimals], mockPos),
								ASTNumberLiteral._(123, undefined, [...numberSizesInts], mockPos),
							],
							possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
						},
						mockPos,
					),
				]);
			});

			it('paths', (): void => {
				testAnalyze('[@/file.joe, @/another/file.joe]', [
					ASTArrayExpression._(
						{
							items: [
								ASTPath._(
									{
										absolute: true,
										path: '@/file.joe',
										isDir: false,
									},
									mockPos,
								),
								ASTPath._(
									{
										absolute: true,
										path: '@/another/file.joe',
										isDir: false,
									},
									mockPos,
								),
							],
							possibleTypes: [ASTTypePrimitive._('path', mockPos)],
						},
						mockPos,
					),
				]);
			});

			it('regexes', (): void => {
				testAnalyze('[/[a-z]/i, /[0-9]/g, /d/]', [
					ASTArrayExpression._(
						{
							items: [
								ASTRegularExpression._(
									{
										pattern: '/[a-z]/',
										flags: ['i'],
									},
									mockPos,
								),
								ASTRegularExpression._(
									{
										pattern: '/[0-9]/',
										flags: ['g'],
									},
									mockPos,
								),
								ASTRegularExpression._(
									{
										pattern: '/d/',
										flags: [],
									},
									mockPos,
								),
							],
							possibleTypes: [ASTTypePrimitive._('regex', mockPos)],
						},
						mockPos,
					),
				]);
			});

			it('strings', (): void => {
				testAnalyze('[\'foo\', "bar"]', [
					ASTArrayExpression._(
						{
							items: [ASTStringLiteral._('foo', mockPos), ASTStringLiteral._('bar', mockPos)],
							possibleTypes: [ASTTypePrimitive._('string', mockPos)],
						},
						mockPos,
					),
				]);
			});

			it('tuples', () => {
				testAnalyze("const foo: <string, uint64, bool>[] = [<'foo', 314, false>, <'bar', 900, true>];", [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [
								ASTArrayOf._(
									ASTTupleShape._(
										[
											[ASTTypePrimitive._('string', mockPos)],
											[ASTTypeNumber._('uint64', mockPos)],
											[ASTTypePrimitive._('bool', mockPos)],
										],
										mockPos,
									),
									mockPos,
								),
							],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [
											ASTTupleExpression._(
												[
													ASTStringLiteral._('foo', mockPos),
													ASTNumberLiteral._(
														314,
														undefined,
														['int16', 'int32', 'int64', 'uint16', 'uint32', 'uint64'],
														mockPos,
													),
													ASTBoolLiteral._(false, mockPos),
												],
												mockPos,
											),
											ASTTupleExpression._(
												[
													ASTStringLiteral._('bar', mockPos),
													ASTNumberLiteral._(
														900,
														undefined,
														['int16', 'int32', 'int64', 'uint16', 'uint32', 'uint64'],
														mockPos,
													),
													ASTBoolLiteral._(true, mockPos),
												],
												mockPos,
											),
										],
										possibleTypes: [
											ASTTupleShape._(
												[
													[ASTTypePrimitive._('string', mockPos)],
													[
														ASTTypeNumber._('int16', mockPos),
														ASTTypeNumber._('int32', mockPos),
														ASTTypeNumber._('int64', mockPos),
														ASTTypeNumber._('uint16', mockPos),
														ASTTypeNumber._('uint32', mockPos),
														ASTTypeNumber._('uint64', mockPos),
													],
													[ASTTypePrimitive._('bool', mockPos)],
												],
												mockPos,
											),
										],
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
				]);
			});

			it('pojos', () => {
				testAnalyze("const foo: {a: uint32, b: string}[] = [{a: 4, b: 'c'}];", [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [
								ASTArrayOf._(
									ASTObjectShape._(
										[
											ASTPropertyShape._(
												ASTIdentifier._('a', mockPos),
												[ASTTypeNumber._('uint32', mockPos)],
												mockPos,
											),
											ASTPropertyShape._(
												ASTIdentifier._('b', mockPos),
												[ASTTypePrimitive._('string', mockPos)],
												mockPos,
											),
										],
										mockPos,
									),
									mockPos,
								),
							],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [
											ASTObjectExpression._(
												[
													ASTProperty._(
														ASTIdentifier._('a', mockPos),
														ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
														mockPos,
													),
													ASTProperty._(ASTIdentifier._('b', mockPos), ASTStringLiteral._('c', mockPos), mockPos),
												],
												mockPos,
											),
										],
										possibleTypes: [
											ASTObjectShape._(
												[
													ASTPropertyShape._(
														ASTIdentifier._('a', mockPos),
														NumberSizesIntASTs.map((ns) => ns(mockPos)),
														mockPos,
													),
													ASTPropertyShape._(
														ASTIdentifier._('b', mockPos),
														[ASTTypePrimitive._('string', mockPos)],
														mockPos,
													),
												],
												mockPos,
											),
										],
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
				]);
			});

			it('assignments', () => {
				testAnalyze('const int32s = [1, 2];', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('int32s', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [
											ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
											ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
										],
										possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [
								[
									ASTArrayOf._(ASTTypeNumber._('int8', mockPos), mockPos),
									ASTArrayOf._(ASTTypeNumber._('int16', mockPos), mockPos),
									ASTArrayOf._(ASTTypeNumber._('int32', mockPos), mockPos),
									ASTArrayOf._(ASTTypeNumber._('int64', mockPos), mockPos),
									ASTArrayOf._(ASTTypeNumber._('uint8', mockPos), mockPos),
									ASTArrayOf._(ASTTypeNumber._('uint16', mockPos), mockPos),
									ASTArrayOf._(ASTTypeNumber._('uint32', mockPos), mockPos),
									ASTArrayOf._(ASTTypeNumber._('uint64', mockPos), mockPos),
								],
							],
						},
						mockPos,
					),
				]);

				testAnalyze('let myArray: bool[] = [];', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('myArray', mockPos)],
							declaredTypes: [ASTArrayOf._(ASTTypePrimitive._('bool', mockPos), mockPos)],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [],
										possibleTypes: [],
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
				]);
			});
		});

		describe('ternary', () => {
			it('should work in a variable declaration', () => {
				testAnalyze('const foo = bar ? 1 : 2;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTTernaryExpression._(
									{
										test: ASTTernaryCondition._(ASTIdentifier._('bar', mockPos), mockPos),
										consequent: ASTTernaryConsequent._(
											ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
											mockPos,
										),
										alternate: ASTTernaryAlternate._(
											ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
											mockPos,
										),
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [
								[
									ASTTypeNumber._('int8', mockPos),
									ASTTypeNumber._('int16', mockPos),
									ASTTypeNumber._('int32', mockPos),
									ASTTypeNumber._('int64', mockPos),
									ASTTypeNumber._('uint8', mockPos),
									ASTTypeNumber._('uint16', mockPos),
									ASTTypeNumber._('uint32', mockPos),
									ASTTypeNumber._('uint64', mockPos),
								],
							],
						},
						mockPos,
					),
				]);
			});

			it('should work when nested', () => {
				testAnalyze('const foo = bar ? (baz ? 3 : 4) : 2;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTTernaryExpression._(
									{
										test: ASTTernaryCondition._(ASTIdentifier._('bar', mockPos), mockPos),
										consequent: ASTTernaryConsequent._(
											ASTTernaryExpression._(
												{
													test: ASTTernaryCondition._(ASTIdentifier._('baz', mockPos), mockPos),
													consequent: ASTTernaryConsequent._(
														ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
														mockPos,
													),
													alternate: ASTTernaryAlternate._(
														ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
														mockPos,
													),
												},
												mockPos,
											),
											mockPos,
										),
										alternate: ASTTernaryAlternate._(
											ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
											mockPos,
										),
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
						},
						mockPos,
					),
				]);
			});

			it('should work in an array', () => {
				testAnalyze('[foo ? 1 : 2, 3]', [
					ASTArrayExpression._(
						{
							items: [
								ASTTernaryExpression._(
									{
										test: ASTTernaryCondition._(ASTIdentifier._('foo', mockPos), mockPos),
										consequent: ASTTernaryConsequent._(
											ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
											mockPos,
										),
										alternate: ASTTernaryAlternate._(
											ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
											mockPos,
										),
									},
									mockPos,
								),
								ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
							],
							possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
						},
						mockPos,
					),
				]);
			});

			it('should work in a return', () => {
				testAnalyze(
					`f foo -> bool, uint64 {
						return bar ? true : false, 3;
					}`,
					[
						ASTFunctionDeclaration._(
							{
								modifiers: [],
								name: ASTIdentifier._('foo', mockPos),
								typeParams: [],
								params: [],
								returnTypes: [ASTTypePrimitive._('bool', mockPos), ASTTypeNumber._('uint64', mockPos)],
								body: ASTBlockStatement._(
									[
										ASTReturnStatement._(
											[
												ASTTernaryExpression._(
													{
														test: ASTTernaryCondition._(ASTIdentifier._('bar', mockPos), mockPos),
														consequent: ASTTernaryConsequent._(ASTBoolLiteral._(true, mockPos), mockPos),
														alternate: ASTTernaryAlternate._(ASTBoolLiteral._(false, mockPos), mockPos),
													},
													mockPos,
												),
												ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
											],
											mockPos,
										),
									],
									mockPos,
								),
							},
							mockPos,
						),
					],
				);
			});
		});

		describe('pojos', () => {
			it('pojo', () => {
				testAnalyze('const foo = {a: 1, b: "pizza", c: 3.14, d: [10, 11]};', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTObjectExpression._(
									[
										ASTProperty._(
											ASTIdentifier._('a', mockPos),
											ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
											mockPos,
										),
										ASTProperty._(ASTIdentifier._('b', mockPos), ASTStringLiteral._('pizza', mockPos), mockPos),
										ASTProperty._(
											ASTIdentifier._('c', mockPos),
											ASTNumberLiteral._(3.14, undefined, [...numberSizesDecimals], mockPos),
											mockPos,
										),
										ASTProperty._(
											ASTIdentifier._('d', mockPos),
											ASTArrayExpression._(
												{
													items: [
														ASTNumberLiteral._(10, undefined, [...numberSizesInts], mockPos),
														ASTNumberLiteral._(11, undefined, [...numberSizesInts], mockPos),
													],
													possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
												},
												mockPos,
											),
											mockPos,
										),
									],
									mockPos,
								),
							],
							inferredPossibleTypes: [
								[
									ASTObjectShape._(
										[
											ASTPropertyShape._(
												ASTIdentifier._('a', mockPos),
												NumberSizesIntASTs.map((ns) => ns(mockPos)),
												mockPos,
											),
											ASTPropertyShape._(
												ASTIdentifier._('b', mockPos),
												[ASTTypePrimitive._('string', mockPos)],
												mockPos,
											),
											ASTPropertyShape._(
												ASTIdentifier._('c', mockPos),
												NumberSizesDecimalASTs.map((ns) => ns(mockPos)),
												mockPos,
											),
											ASTPropertyShape._(
												ASTIdentifier._('d', mockPos),
												NumberSizesIntASTs.map((ns) => ASTArrayOf._(ns(mockPos), mockPos)),
												mockPos,
											),
										],
										mockPos,
									),
								],
							],
						},
						mockPos,
					),
				]);
			});

			it('empty pojo', () => {
				testAnalyze('const foo = {};', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [ASTObjectExpression._([], mockPos)],
							inferredPossibleTypes: [[ASTObjectShape._([], mockPos)]],
						},
						mockPos,
					),
				]);
			});

			it('nested pojos', () => {
				testAnalyze(
					`const foo = {
						obj: {a: 1, b: 'pizza', pi: {two_digits: 3.14}},
						bol: true,
						pth: @/some/file.joe,
						rng: {rng: 1 .. 3},
						tpl: <1, 2, 'fizz', 4, 'buzz'>
					};`,
					[
						ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: false,
								identifiersList: [ASTIdentifier._('foo', mockPos)],
								declaredTypes: [],
								initialValues: [
									ASTObjectExpression._(
										[
											ASTProperty._(
												ASTIdentifier._('obj', mockPos),
												ASTObjectExpression._(
													[
														ASTProperty._(
															ASTIdentifier._('a', mockPos),
															ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
															mockPos,
														),
														ASTProperty._(
															ASTIdentifier._('b', mockPos),
															ASTStringLiteral._('pizza', mockPos),
															mockPos,
														),
														ASTProperty._(
															ASTIdentifier._('pi', mockPos),
															ASTObjectExpression._(
																[
																	ASTProperty._(
																		ASTIdentifier._('two_digits', mockPos),
																		ASTNumberLiteral._(
																			3.14,
																			undefined,
																			[...numberSizesDecimals],
																			mockPos,
																		),
																		mockPos,
																	),
																],
																mockPos,
															),
															mockPos,
														),
													],
													mockPos,
												),
												mockPos,
											),
											ASTProperty._(ASTIdentifier._('bol', mockPos), ASTBoolLiteral._(true, mockPos), mockPos),
											ASTProperty._(
												ASTIdentifier._('pth', mockPos),
												ASTPath._(
													{
														absolute: true,
														path: '@/some/file.joe',
														isDir: false,
													},
													mockPos,
												),
												mockPos,
											),
											ASTProperty._(
												ASTIdentifier._('rng', mockPos),
												ASTObjectExpression._(
													[
														ASTProperty._(
															ASTIdentifier._('rng', mockPos),
															ASTRangeExpression._(
																{
																	lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
																	upper: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
																},
																mockPos,
															),
															mockPos,
														),
													],
													mockPos,
												),
												mockPos,
											),
											ASTProperty._(
												ASTIdentifier._('tpl', mockPos),
												ASTTupleExpression._(
													[
														ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
														ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
														ASTStringLiteral._('fizz', mockPos),
														ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
														ASTStringLiteral._('buzz', mockPos),
													],
													mockPos,
												),
												mockPos,
											),
										],
										mockPos,
									),
								],
								inferredPossibleTypes: [
									[
										ASTObjectShape._(
											[
												ASTPropertyShape._(
													ASTIdentifier._('obj', mockPos),
													[
														ASTObjectShape._(
															[
																ASTPropertyShape._(
																	ASTIdentifier._('a', mockPos),
																	NumberSizesIntASTs.map((ns) => ns(mockPos)),
																	mockPos,
																),
																ASTPropertyShape._(
																	ASTIdentifier._('b', mockPos),
																	[ASTTypePrimitive._('string', mockPos)],
																	mockPos,
																),
																ASTPropertyShape._(
																	ASTIdentifier._('pi', mockPos),
																	[
																		ASTObjectShape._(
																			[
																				ASTPropertyShape._(
																					ASTIdentifier._('two_digits', mockPos),
																					NumberSizesDecimalASTs.map((ns) => ns(mockPos)),
																					mockPos,
																				),
																			],
																			mockPos,
																		),
																	],
																	mockPos,
																),
															],
															mockPos,
														),
													],
													mockPos,
												),
												ASTPropertyShape._(
													ASTIdentifier._('bol', mockPos),
													[ASTTypePrimitive._('bool', mockPos)],
													mockPos,
												),
												ASTPropertyShape._(
													ASTIdentifier._('pth', mockPos),
													[ASTTypePrimitive._('path', mockPos)],
													mockPos,
												),
												ASTPropertyShape._(
													ASTIdentifier._('rng', mockPos),
													[
														ASTObjectShape._(
															[
																ASTPropertyShape._(
																	ASTIdentifier._('rng', mockPos),
																	[ASTTypeRange._(mockPos)],
																	mockPos,
																),
															],
															mockPos,
														),
													],
													mockPos,
												),
												ASTPropertyShape._(
													ASTIdentifier._('tpl', mockPos),
													[
														ASTTupleShape._(
															[
																NumberSizesIntASTs.map((ns) => ns(mockPos)),
																NumberSizesIntASTs.map((ns) => ns(mockPos)),
																[ASTTypePrimitive._('string', mockPos)],
																NumberSizesIntASTs.map((ns) => ns(mockPos)),
																[ASTTypePrimitive._('string', mockPos)],
															],
															mockPos,
														),
													],
													mockPos,
												),
											],
											mockPos,
										),
									],
								],
							},
							mockPos,
						),
					],
				);
			});

			it('with ternary in item', () => {
				testAnalyze(
					`{
						a: 1,
						b: someCondition ? 'burnt-orange' : '', // will always be defined, so the shape is correct
						c: true
					}`,
					[
						ASTObjectExpression._(
							[
								ASTProperty._(
									ASTIdentifier._('a', mockPos),
									ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
									mockPos,
								),
								ASTProperty._(
									ASTIdentifier._('b', mockPos),
									ASTTernaryExpression._(
										{
											test: ASTTernaryCondition._(ASTIdentifier._('someCondition', mockPos), mockPos),
											consequent: ASTTernaryConsequent._(ASTStringLiteral._('burnt-orange', mockPos), mockPos),
											alternate: ASTTernaryAlternate._(ASTStringLiteral._('', mockPos), mockPos),
										},
										mockPos,
									),
									mockPos,
								),
								ASTProperty._(ASTIdentifier._('c', mockPos), ASTBoolLiteral._(true, mockPos), mockPos),
							],
							mockPos,
						),
					],
				);
			});

			it('with array in item', () => {
				testAnalyze(
					`{
						a: [1]
					}`,
					[
						ASTObjectExpression._(
							[
								ASTProperty._(
									ASTIdentifier._('a', mockPos),
									ASTArrayExpression._(
										{
											items: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
											possibleTypes: NumberSizesIntASTs.map((ns) => ns(mockPos)),
										},
										mockPos,
									),
									mockPos,
								),
							],
							mockPos,
						),
					],
				);
			});

			it('with MemberExpression in item', () => {
				testAnalyze(
					`{
						a: [foo[1]]
					}`,
					[
						ASTObjectExpression._(
							[
								ASTProperty._(
									ASTIdentifier._('a', mockPos),
									ASTArrayExpression._(
										{
											items: [
												ASTMemberExpression._(
													{
														object: ASTIdentifier._('foo', mockPos),
														property: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
													},
													mockPos,
												),
											],
											possibleTypes: [],
										},
										mockPos,
									),
									mockPos,
								),
							],
							mockPos,
						),
					],
				);
			});
		});

		it('should assign this', () => {
			testAnalyze('const foo = this;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', mockPos)],
						declaredTypes: [],
						initialValues: [ASTThisKeyword._(mockPos)],
						inferredPossibleTypes: [[]],
					},
					mockPos,
				),
			]);
		});

		it('should assign a range', () => {
			testAnalyze('const foo = 1 .. 3;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', mockPos)],
						declaredTypes: [],
						initialValues: [
							ASTRangeExpression._(
								{
									lower: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
									upper: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
								},
								mockPos,
							),
						],
						inferredPossibleTypes: [[ASTTypeRange._(mockPos)]],
					},
					mockPos,
				),
			]);
		});
	});

	describe.skip('WhenExpression', (): void => {
		it('works with a small example', () => {
			testAnalyze(
				`when (someNumber) {
					1 -> 'small',
				}`,
				[
					ASTWhenExpression._(
						{
							expression: ASTIdentifier._('someNumber', mockPos),
							cases: [
								ASTWhenCase._(
									{
										values: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
										consequent: ASTStringLiteral._('small', mockPos),
									},
									mockPos,
								),
							],
						},
						mockPos,
					),
				],
			);
		});

		it('case with brace', () => {
			testAnalyze(
				`when someNumber {
					1 -> {
						doThing1();
						doThing2();

						return 'large';
					},
				}`,
				[
					ASTWhenExpression._(
						{
							expression: ASTIdentifier._('someNumber', mockPos),
							cases: [
								ASTWhenCase._(
									{
										values: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
										consequent: ASTBlockStatement._(
											[
												ASTCallExpression._(
													{
														callee: ASTIdentifier._('doThing1', mockPos),
														typeArgs: [],
														args: [],
													},
													mockPos,
												),
												ASTCallExpression._(
													{
														callee: ASTIdentifier._('doThing2', mockPos),
														typeArgs: [],
														args: [],
													},
													mockPos,
												),
												ASTReturnStatement._([ASTStringLiteral._('large', mockPos)], mockPos),
											],
											mockPos,
										),
									},
									mockPos,
								),
							],
						},
						mockPos,
					),
				],
			);
		});

		it('works with single values, multiple values, ranges, and ...', (): void => {
			testAnalyze(
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
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('doSomethingElse', mockPos),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitiveString(mockPos)],
							body: ASTBlockStatement._([ASTReturnStatement._([ASTStringLiteral._('', mockPos)], mockPos)], mockPos),
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('size', mockPos)],
							declaredTypes: [],
							initialValues: [
								ASTWhenExpression._(
									{
										expression: ASTIdentifier._('someNumber', mockPos),
										cases: [
											ASTWhenCase._(
												{
													values: [
														ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
														ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
													],
													consequent: ASTStringLiteral._('small', mockPos),
												},
												mockPos,
											),
											ASTWhenCase._(
												{
													values: [
														ASTRangeExpression._(
															{
																lower: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
																upper: ASTNumberLiteral._(10, undefined, [...numberSizesInts], mockPos),
															},
															mockPos,
														),
													],
													consequent: ASTStringLiteral._('medium', mockPos),
												},
												mockPos,
											),
											ASTWhenCase._(
												{
													values: [ASTNumberLiteral._(11, undefined, [...numberSizesInts], mockPos)],
													consequent: ASTBlockStatement._(
														[
															ASTCallExpression._(
																{
																	callee: ASTIdentifier._('doThing1', mockPos),
																	typeArgs: [],
																	args: [],
																},
																mockPos,
															),
															ASTCallExpression._(
																{
																	callee: ASTIdentifier._('doThing2', mockPos),
																	typeArgs: [],
																	args: [],
																},
																mockPos,
															),
															ASTReturnStatement._([ASTStringLiteral._('large', mockPos)], mockPos),
														],
														mockPos,
													),
												},
												mockPos,
											),
											ASTWhenCase._(
												{
													values: [ASTNumberLiteral._(12, undefined, [...numberSizesInts], mockPos)],
													consequent: ASTCallExpression._(
														{
															callee: ASTIdentifier._('doSomethingElse', mockPos),
															typeArgs: [],
															args: [],
														},
														mockPos,
													),
												},
												mockPos,
											),
											ASTWhenCase._(
												{
													values: [ASTRestElement._(mockPos)],
													consequent: ASTStringLiteral._('off the charts', mockPos),
												},
												mockPos,
											),
										],
									},
									mockPos,
								),
							],
							inferredPossibleTypes: [[ASTTypePrimitiveString(mockPos)]],
						},
						mockPos,
					),
				],
			);
		});
	});

	describe.skip('bugs fixed', (): void => {
		it('"foo() .. 3" should place the RangeExpression outside of the CallExpression', (): void => {
			testAnalyze('foo() .. 3', [
				ASTRangeExpression._(
					{
						lower: ASTCallExpression._(
							{
								callee: ASTIdentifier._('foo', mockPos),
								typeArgs: [],
								args: [],
							},
							mockPos,
						),
						upper: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
					},
					mockPos,
				),
			]);
		});

		it('"[1<2, 3>2];" should be a bool array, not a tuple', (): void => {
			testAnalyze('[1<2, 4>3];', [
				ASTArrayExpression._(
					{
						items: [
							ASTBinaryExpression._(
								{
									operator: '<',
									left: ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos),
									right: ASTNumberLiteral._(2, undefined, [...numberSizesInts], mockPos),
								},
								mockPos,
							),
							ASTBinaryExpression._(
								{
									operator: '>',
									left: ASTNumberLiteral._(4, undefined, [...numberSizesInts], mockPos),
									right: ASTNumberLiteral._(3, undefined, [...numberSizesInts], mockPos),
								},
								mockPos,
							),
						],
						possibleTypes: [ASTTypePrimitive._('bool', mockPos)],
					},
					mockPos,
				),
			]);
		});

		it('"f foo(a: int16 = 1_234, b = true) {}" should correctly see the underscore as a separator', () => {
			testAnalyze('f foo(a: int16 = 1_234, b = true) {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', mockPos),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', mockPos),
									type: ASTTypeNumber._('int16', mockPos),
									defaultValue: ASTNumberLiteral._(
										1234,
										undefined,
										['int16', 'int32', 'int64', 'uint16', 'uint32', 'uint64'],
										mockPos,
									),
								},
								mockPos,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('b', mockPos),
									type: ASTTypePrimitive._('bool', mockPos),
									defaultValue: ASTBoolLiteral._(true, mockPos),
								},
								mockPos,
							),
						],
						returnTypes: [],
						body: ASTBlockStatement._([ASTReturnStatement._([], mockPos)], mockPos),
					},
					mockPos,
				),
			]);
		});
	});
});
