import { describe, expect, it } from '@jest/globals';
import assert from 'node:assert';
import { mockParent, mockPos as pos } from '../../jestMocks';
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
	ASTTypeNumberDec32,
	ASTTypeNumberDec64,
	ASTTypeNumberInt16,
	ASTTypeNumberInt8,
	ASTTypeNumberUint32,
	ASTTypeParameter,
	ASTTypePrimitive,
	ASTTypePrimitiveBool,
	ASTTypePrimitivePath,
	ASTTypePrimitiveRegex,
	ASTTypePrimitiveString,
	ASTTypeRange,
	ASTUnaryExpression,
	ASTUseDeclaration,
	ASTVariableDeclaration,
	ASTWhenCase,
	ASTWhenExpression,
} from '../analyzer/asts';
import { primitiveTypes } from '../lexer/types';
import { testAnalyze } from '../parser/util';
import { numberSizesAll } from '../shared/numbers/sizes';
import { analyze } from './util';

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
					pos,
					mockParent,
					(value: string) => new Error(value), // won't be used, so doesn't need to be any specific subclass of Error
				);
				expect(astNumberLiteral).toEqual({
					outcome: 'ok',
					value: ASTNumberLiteral._(10, 'int8', pos, mockParent),
				});
			});
		});
	});

	describe('AssignmentExpressions', () => {
		it('should assign to a single identifier', () => {
			testAnalyze('foo = 1;', [
				ASTAssignmentExpression._(
					{
						left: [ASTIdentifier._('foo', pos, mockParent)],
						right: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
					},
					pos,
					mockParent,
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
									object: ASTThisKeyword._(pos, mockParent),
									property: ASTIdentifier._('foo', pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						right: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('should assign to multiple identifiers and member expressions', () => {
			testAnalyze('x, foo.bar = 0, 1;', [
				ASTAssignmentExpression._(
					{
						left: [
							ASTIdentifier._('x', pos, mockParent),
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									property: ASTIdentifier._('bar', pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						right: [ASTNumberLiteral._(0, 'int8', pos, mockParent), ASTNumberLiteral._(1, 'int8', pos, mockParent)],
					},
					pos,
					mockParent,
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
							name: ASTIdentifier._('foo', pos, mockParent),
							typeParams: [],
							params: [],
							returnTypes: [],
							body: ASTBlockStatement._(
								[
									ASTPrintStatement._([ASTStringLiteral._('hello', pos, mockParent)], pos, mockParent),
									ASTBlockStatement._(
										[ASTPrintStatement._([ASTStringLiteral._('world', pos, mockParent)], pos, mockParent)],
										pos,
										mockParent,
									),
									ASTPrintStatement._([ASTStringLiteral._('!', pos, mockParent)], pos, mockParent),
									ASTReturnStatement._([], pos, mockParent),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('foo', pos, mockParent),
							typeParams: [],
							params: [],
							returnTypes: [],
							body: ASTBlockStatement._(
								[
									ASTPrintStatement._([ASTStringLiteral._('hello', pos, mockParent)], pos, mockParent),
									ASTBlockStatement._(
										[
											ASTPrintStatement._([ASTStringLiteral._('world', pos, mockParent)], pos, mockParent),
											ASTBlockStatement._(
												[
													ASTVariableDeclaration._(
														{
															modifiers: [],
															mutable: false,
															identifiersList: [ASTIdentifier._('x', pos, mockParent)],
															declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
															initialValues: [ASTNumberLiteral._(4, 'int8', pos, mockParent)],
															inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
														},
														pos,
														mockParent,
													),
												],
												pos,
												mockParent,
											),
											ASTBlockStatement._(
												[ASTPrintStatement._([ASTIdentifier._('x', pos, mockParent)], pos, mockParent)],
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
									ASTPrintStatement._([ASTStringLiteral._('!', pos, mockParent)], pos, mockParent),
									ASTReturnStatement._([], pos, mockParent),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
				],
			);
		});
	});

	describe('CallExpression', () => {
		it.skip('should work with multiple return types and a VariableDeclaration', () => {
			testAnalyze(
				`f doSomething -> string, bool { return '', true; };
				const goLangStyle, ok = doSomething();
				`,
				[
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('doSomething', pos, mockParent),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitiveString(pos, mockParent), ASTTypePrimitiveBool(pos, mockParent)],
							body: ASTBlockStatement._(
								[
									ASTReturnStatement._(
										[ASTStringLiteral._('', pos, mockParent), ASTBoolLiteral._(true, pos, mockParent)],
										pos,
										mockParent,
									),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('goLangStyle', pos, mockParent), ASTIdentifier._('ok', pos, mockParent)],
							declaredTypes: [],
							initialValues: [
								ASTCallExpression._(
									{
										callee: ASTIdentifier._('doSomething', pos, mockParent),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTTypePrimitiveString(pos, mockParent), ASTTypePrimitiveBool(pos, mockParent)],
						},
						pos,
						mockParent,
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
												object: ASTIdentifier._('a', pos, mockParent),
												property: ASTIdentifier._('b', pos, mockParent),
											},
											pos,
											mockParent,
										),
										property: ASTIdentifier._('c', pos, mockParent),
									},
									pos,
									mockParent,
								),
								property: ASTIdentifier._('d', pos, mockParent),
							},
							pos,
							mockParent,
						),
						typeArgs: [],
						args: [ASTNumberLiteral._(4, 'int8', pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('call followed by property', () => {
			testAnalyze('a(1).b', [
				ASTMemberExpression._(
					{
						object: ASTCallExpression._(
							{
								callee: ASTIdentifier._('a', pos, mockParent),
								typeArgs: [],
								args: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
							},
							pos,
							mockParent,
						),
						property: ASTIdentifier._('b', pos, mockParent),
					},
					pos,
					mockParent,
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
										callee: ASTIdentifier._('a', pos, mockParent),
										typeArgs: [],
										args: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
									},
									pos,
									mockParent,
								),
								property: ASTIdentifier._('b', pos, mockParent),
							},
							pos,
							mockParent,
						),
						typeArgs: [],
						args: [ASTNumberLiteral._(2, 'int8', pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('generics', () => {
			testAnalyze('a(b<|T|>);', [
				ASTCallExpression._(
					{
						callee: ASTIdentifier._('a', pos, mockParent),
						typeArgs: [],
						args: [
							ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('b', pos, mockParent),
									typeArgs: [ASTIdentifier._('T', pos, mockParent)],
								},
								pos,
								mockParent,
							),
						],
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('a<|T|>(b);', [
				ASTCallExpression._(
					{
						callee: ASTIdentifier._('a', pos, mockParent),
						typeArgs: [ASTIdentifier._('T', pos, mockParent)],
						args: [ASTIdentifier._('b', pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('more advanced generics', () => {
			testAnalyze('class Foo {} const foo = Foo<|T, T[]|>();', [
				ASTClassDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
						declaredTypes: [ASTIdentifier._('Foo', pos, mockParent)],
						initialValues: [
							ASTCallExpression._(
								{
									callee: ASTIdentifier._('Foo', pos, mockParent),
									typeArgs: [
										ASTIdentifier._('T', pos, mockParent),
										ASTArrayOf._(ASTIdentifier._('T', pos, mockParent), pos, mockParent),
									],
									args: [],
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [ASTIdentifier._('Foo', pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('multiple inheritance manual resolution', () => {
			// expect(1).toBe(2);
			testAnalyze(
				`class C extends A, B {
					f foo () -> int8 {
						return this.parent<|B|>.foo(); // <-- Specify to use B.foo
					}
				}`,
				[
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('C', pos, mockParent),
							typeParams: [],
							extends: [ASTIdentifier._('A', pos, mockParent), ASTIdentifier._('B', pos, mockParent)],
							implements: [],
							body: ASTBlockStatement._(
								[
									ASTFunctionDeclaration._(
										{
											modifiers: [],
											name: ASTIdentifier._('foo', pos, mockParent, 'C.foo'),
											typeParams: [],
											params: [],
											returnTypes: [],
											body: ASTBlockStatement._(
												[
													ASTCallExpression._(
														{
															callee: ASTMemberExpression._(
																{
																	object: ASTMemberExpression._(
																		{
																			object: ASTThisKeyword._(pos, mockParent),
																			property: ASTTypeInstantiationExpression._(
																				{
																					base: ASTIdentifier._('parent', pos, mockParent),
																					typeArgs: [ASTIdentifier._('B', pos, mockParent)],
																				},
																				pos,
																				mockParent,
																			),
																		},
																		pos,
																		mockParent,
																	),
																	property: ASTIdentifier._('foo', pos, mockParent),
																},
																pos,
																mockParent,
															),
															typeArgs: [],
															args: [],
														},
														pos,
														mockParent,
													),
													ASTReturnStatement._([ASTNumberLiteral._(0, 'int8', pos, mockParent)], pos, mockParent),
												],
												pos,
												mockParent,
											),
										},
										pos,
										mockParent,
									),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
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
								object: ASTIdentifier._('foo', pos, mockParent),
								property: ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('bar', pos, mockParent),
										typeArgs: [ASTIdentifier._('T', pos, mockParent)],
									},
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
						),
						typeArgs: [],
						args: [],
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('this.bar<|T|>()', [
				ASTCallExpression._(
					{
						callee: ASTMemberExpression._(
							{
								object: ASTThisKeyword._(pos, mockParent),
								property: ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('bar', pos, mockParent),
										typeArgs: [ASTIdentifier._('T', pos, mockParent)],
									},
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
						),
						typeArgs: [],
						args: [],
					},
					pos,
					mockParent,
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
										object: ASTIdentifier._('A', pos, mockParent),
										property: ASTIdentifier._('create', pos, mockParent),
									},
									pos,
									mockParent,
								),
								typeArgs: [],
								args: [],
							},
							pos,
							mockParent,
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
											base: ASTIdentifier._('A', pos, mockParent),
											typeArgs: [ASTIdentifier._('T', pos, mockParent), ASTIdentifier._('U', pos, mockParent)],
										},
										pos,
										mockParent,
									),
									property: ASTIdentifier._('create', pos, mockParent),
								},
								pos,
								mockParent,
							),
							typeArgs: [],
							args: [
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('T', pos, mockParent),
												property: ASTIdentifier._('create', pos, mockParent),
											},
											pos,
											mockParent,
										),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('U', pos, mockParent),
												property: ASTIdentifier._('create', pos, mockParent),
											},
											pos,
											mockParent,
										),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
								ASTStringLiteral._('foo', pos, mockParent),
							],
						},
						pos,
						mockParent,
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
																object: ASTIdentifier._('A', pos, mockParent),
																property: ASTIdentifier._('B', pos, mockParent),
															},
															pos,
															mockParent,
														),
														property: ASTIdentifier._('C', pos, mockParent),
													},
													pos,
													mockParent,
												),
												property: ASTIdentifier._('D', pos, mockParent),
											},
											pos,
											mockParent,
										),
										property: ASTIdentifier._('create', pos, mockParent),
									},
									pos,
									mockParent,
								),
								typeArgs: [],
								args: [],
							},
							pos,
							mockParent,
						),
					],
				);
			});
		});
	});

	describe('ClassDeclaration', (): void => {
		it('empty class', (): void => {
			testAnalyze('class Foo {}', [
				ASTClassDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze(
				'class Foo <| T, U.V, bool |> {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent),
								ASTTypeParameter._(
									ASTMemberExpression._(
										{
											object: ASTIdentifier._('U', pos, mockParent),
											property: ASTIdentifier._('V', pos, mockParent),
										},
										pos,
										mockParent,
									),
									undefined,
									undefined,
									pos,
									mockParent,
								),
								ASTTypeParameter._(ASTTypePrimitiveBool(pos, mockParent), undefined, undefined, pos, mockParent),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
				],
			);
		});

		it('class with properties and methods', (): void => {
			testAnalyze('class Foo {\nconst foo = "bar";\nf bar {}}\n# bar\n', [
				ASTClassDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [],
						extends: [],
						implements: [],
						body: ASTBlockStatement._(
							[
								ASTVariableDeclaration._(
									{
										modifiers: [],
										mutable: false,
										identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
										declaredTypes: [ASTTypePrimitiveString(pos, mockParent)],
										initialValues: [ASTStringLiteral._('bar', pos, mockParent)],
										inferredTypes: [ASTTypePrimitiveString(pos, mockParent)],
									},
									pos,
									mockParent,
								),
								ASTFunctionDeclaration._(
									{
										modifiers: [],
										name: ASTIdentifier._('bar', pos, mockParent),
										typeParams: [],
										params: [],
										returnTypes: [],
										body: ASTBlockStatement._([], pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('class extends multiple and implements multiple', (): void => {
			testAnalyze('class Foo extends Bar, Baz implements AbstractFooBar, AnotherAbstractClass {}', [
				ASTClassDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [],
						extends: [ASTIdentifier._('Bar', pos, mockParent), ASTIdentifier._('Baz', pos, mockParent)],
						implements: [
							ASTIdentifier._('AbstractFooBar', pos, mockParent),
							ASTIdentifier._('AnotherAbstractClass', pos, mockParent),
						],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent),
								ASTTypeParameter._(ASTIdentifier._('U', pos, mockParent), undefined, undefined, pos, mockParent),
							],
							extends: [
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('Bar', pos, mockParent),
										typeArgs: [
											ASTTypeInstantiationExpression._(
												{
													base: ASTIdentifier._('T', pos, mockParent),
													typeArgs: [ASTIdentifier._('RE', pos, mockParent)],
												},
												pos,
												mockParent,
											),
											ASTTypePrimitivePath(pos, mockParent),
										],
									},
									pos,
									mockParent,
								),
								ASTIdentifier._('Baz', pos, mockParent),
							],
							implements: [
								ASTIdentifier._('AbstractFooBar', pos, mockParent),
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('AnotherAbstractClass', pos, mockParent),
										typeArgs: [ASTIdentifier._('U', pos, mockParent)],
									},
									pos,
									mockParent,
								),
							],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							modifiers: [ASTModifier._('abstract', pos, mockParent)],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
				],
			);

			testAnalyze(
				'abstract class Foo<|T|> {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', pos, mockParent)],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent)],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							modifiers: [ASTModifier._('abstract', pos, mockParent)],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._(
								[
									ASTVariableDeclaration._(
										{
											modifiers: [
												ASTModifier._('abstract', pos, mockParent),
												ASTModifier._('readonly', pos, mockParent),
											],
											mutable: false,
											identifiersList: [ASTIdentifier._('baz', pos, mockParent)],
											declaredTypes: [ASTTypeNumber._('int8', pos, mockParent)],
											initialValues: [],
											inferredTypes: [],
										},
										pos,
										mockParent,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [
												ASTModifier._('abstract', pos, mockParent),
												ASTModifier._('static', pos, mockParent),
											],
											name: ASTIdentifier._('hello', pos, mockParent),
											typeParams: [
												ASTTypeParameter._(
													ASTIdentifier._('T', pos, mockParent),
													undefined,
													undefined,
													pos,
													mockParent,
												),
											],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('name', pos, mockParent),
														type: ASTTypePrimitiveString(pos, mockParent),
														defaultValue: ASTStringLiteral._('World', pos, mockParent),
													},
													pos,
													mockParent,
												),
											],
											returnTypes: [
												ASTIdentifier._('Greeting', pos, mockParent),
												ASTIdentifier._('T', pos, mockParent),
											],
											body: undefined,
										},
										pos,
										mockParent,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('pub', pos, mockParent), ASTModifier._('static', pos, mockParent)],
											name: ASTIdentifier._('world', pos, mockParent),
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('name', pos, mockParent),
														type: ASTTypePrimitiveString(pos, mockParent),
														defaultValue: ASTStringLiteral._('Earth', pos, mockParent),
													},
													pos,
													mockParent,
												),
											],
											returnTypes: [],
											body: undefined,
										},
										pos,
										mockParent,
									),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
				],
			);

			testAnalyze(
				'abstract class Foo {}\nclass Bar extends Foo {}',

				[
					ASTClassDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', pos, mockParent)],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Bar', pos, mockParent),
							typeParams: [],
							extends: [ASTIdentifier._('Foo', pos, mockParent)],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [],
							extends: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
				],
			);

			testAnalyze(
				'enum Foo <| T, U |> {}',

				[
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent),
								ASTTypeParameter._(ASTIdentifier._('U', pos, mockParent), undefined, undefined, pos, mockParent),
							],
							extends: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [],
							extends: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
					ASTEnumDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Bar', pos, mockParent),
							typeParams: [],
							extends: [ASTIdentifier._('Foo', pos, mockParent)],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [],
							extends: [ASTIdentifier._('Bar', pos, mockParent), ASTIdentifier._('Baz', pos, mockParent)],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [
								ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent),
								ASTTypeParameter._(ASTIdentifier._('U', pos, mockParent), undefined, undefined, pos, mockParent),
							],
							extends: [
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('Bar', pos, mockParent),
										typeArgs: [ASTIdentifier._('T', pos, mockParent)],
									},
									pos,
									mockParent,
								),
								ASTTypeInstantiationExpression._(
									{
										base: ASTIdentifier._('Baz', pos, mockParent),
										typeArgs: [ASTIdentifier._('U', pos, mockParent)],
									},
									pos,
									mockParent,
								),
							],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
									identifiersList: [ASTIdentifier._('i', pos, mockParent)],
									declaredTypes: [],
									initialValues: [],
									inferredTypes: [],
								},
								pos,
								mockParent,
							),
							iterable: ASTRangeExpression._(
								{
									lower: ASTNumberLiteral._(0, 'int8', pos, mockParent),
									upper: ASTNumberLiteral._(9, 'int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
								identifiersList: [ASTIdentifier._('i', pos, mockParent)],
								declaredTypes: [],
								initialValues: [],
								inferredTypes: [],
							},
							pos,
							mockParent,
						),
						iterable: ASTRangeExpression._(
							{
								lower: ASTNumberLiteral._(0, 'int8', pos, mockParent),
								upper: ASTNumberLiteral._(9, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('with identifier', () => {
			testAnalyze('const foo = [1, 2, 3]; for let i in foo {}', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
						declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
						initialValues: [
							ASTArrayExpression._(
								{
									items: [
										ASTNumberLiteral._(1, 'int8', pos, mockParent),
										ASTNumberLiteral._(2, 'int8', pos, mockParent),
										ASTNumberLiteral._(3, 'int8', pos, mockParent),
									],
									type: ASTTypeNumberInt8(pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
					},
					pos,
					mockParent,
				),
				ASTForStatement._(
					{
						initializer: ASTVariableDeclaration._(
							{
								modifiers: [],
								mutable: true,
								identifiersList: [ASTIdentifier._('i', pos, mockParent)],
								declaredTypes: [],
								initialValues: [],
								inferredTypes: [],
							},
							pos,
							mockParent,
						),
						iterable: ASTIdentifier._('foo', pos, mockParent),
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
									identifiersList: [ASTIdentifier._('n', pos, mockParent), ASTIdentifier._('i', pos, mockParent)],
									declaredTypes: [],
									initialValues: [],
									inferredTypes: [],
								},
								pos,
								mockParent,
							),
							iterable: ASTArrayExpression._(
								{
									items: [
										ASTNumberLiteral._(1, 'int8', pos, mockParent),
										ASTNumberLiteral._(2, 'int8', pos, mockParent),
										ASTNumberLiteral._(3, 'int8', pos, mockParent),
									],
									type: ASTTypeNumberInt8(pos, mockParent),
								},
								pos,
								mockParent,
							),
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
									identifiersList: [ASTIdentifier._('i', pos, mockParent)],
									declaredTypes: [],
									initialValues: [],
									inferredTypes: [],
								},
								pos,
								mockParent,
							),
							iterable: ASTCallExpression._(
								{
									callee: ASTIdentifier._('foo', pos, mockParent),
									typeArgs: [],
									args: [],
								},
								pos,
								mockParent,
							),
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
									identifiersList: [ASTIdentifier._('i', pos, mockParent)],
									declaredTypes: [],
									initialValues: [],
									inferredTypes: [],
								},
								pos,
								mockParent,
							),
							iterable: ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									property: ASTIdentifier._('bar', pos, mockParent),
								},
								pos,
								mockParent,
							),
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
									identifiersList: [ASTIdentifier._('i', pos, mockParent)],
									declaredTypes: [],
									initialValues: [],
									inferredTypes: [],
								},
								pos,
								mockParent,
							),
							iterable: ASTMemberListExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									properties: [
										ASTNumberLiteral._(0, 'int8', pos, mockParent),
										ASTNumberLiteral._(2, 'int8', pos, mockParent),
										ASTNumberLiteral._(4, 'int8', pos, mockParent),
									],
								},
								pos,
								mockParent,
							),
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
									identifiersList: [ASTIdentifier._('i', pos, mockParent)],
									declaredTypes: [],
									initialValues: [],
									inferredTypes: [],
								},
								pos,
								mockParent,
							),
							iterable: ASTMemberListExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									properties: [
										ASTRangeExpression._(
											{
												lower: ASTNumberLiteral._(0, 'int8', pos, mockParent),
												upper: ASTNumberLiteral._(4, 'int8', pos, mockParent),
											},
											pos,
											mockParent,
										),
									],
								},
								pos,
								mockParent,
							),
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
								identifiersList: [ASTIdentifier._('i', pos, mockParent)],
								declaredTypes: [],
								initialValues: [],
								inferredTypes: [],
							},
							pos,
							mockParent,
						),
						iterable: ASTIdentifier._('foo', pos, mockParent),
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
				ASTPrintStatement._([ASTStringLiteral._('something after', pos, mockParent)], pos, mockParent),
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
								identifiersList: [ASTIdentifier._('i', pos, mockParent)],
								declaredTypes: [],
								initialValues: [],
								inferredTypes: [],
							},
							pos,
							mockParent,
						),
						iterable: ASTIdentifier._('foo', pos, mockParent),
						body: ASTBlockStatement._(
							[
								ASTForStatement._(
									{
										initializer: ASTVariableDeclaration._(
											{
												modifiers: [],
												mutable: true,
												identifiersList: [ASTIdentifier._('j', pos, mockParent)],
												declaredTypes: [],
												initialValues: [],
												inferredTypes: [],
											},
											pos,
											mockParent,
										),
										iterable: ASTIdentifier._('bar', pos, mockParent),
										body: ASTBlockStatement._([], pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
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
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [],
						returnTypes: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('no params with single return type', (): void => {
			testAnalyze('f foo -> bool {} 5;', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [],
						returnTypes: [ASTTypePrimitiveBool(pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
				ASTNumberLiteral._(5, 'int8', pos, mockParent),
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
							name: ASTIdentifier._('foo', pos, mockParent),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitiveBool(pos, mockParent), ASTTypePrimitiveString(pos, mockParent)],
							body: ASTBlockStatement._(
								[
									ASTReturnStatement._(
										[ASTBoolLiteral._(true, pos, mockParent), ASTStringLiteral._('hey', pos, mockParent)],
										pos,
										mockParent,
									),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
				],
			);
		});

		it('param parens but no return types', (): void => {
			testAnalyze('f foo () {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [],
						returnTypes: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('param parens with return types', (): void => {
			testAnalyze('f foo () -> bool {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [],
						returnTypes: [ASTTypePrimitiveBool(pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('params but no return types', (): void => {
			testAnalyze('f foo (a: int8, callback: f (a: int8) -> string, bool) {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTTypeNumber._('int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('callback', pos, mockParent),
									type: ASTFunctionSignature._(
										{
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('a', pos, mockParent),
														type: ASTTypeNumber._('int8', pos, mockParent),
													},
													pos,
													mockParent,
												),
											],
											returnTypes: [ASTTypePrimitiveString(pos, mockParent), ASTTypePrimitiveBool(pos, mockParent)],
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
							),
						],
						returnTypes: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('params and return types', (): void => {
			testAnalyze('f foo (a: int8, r: regex) -> regex, bool {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTTypeNumber._('int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('r', pos, mockParent),
									type: ASTTypePrimitiveRegex(pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						returnTypes: [ASTTypePrimitiveRegex(pos, mockParent), ASTTypePrimitiveBool(pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('params and return types using functions', (): void => {
			testAnalyze('f foo <|T|>(a: f -> T) -> f -> Result<|Maybe<|T|>|> {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent)],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTFunctionSignature._(
										{
											typeParams: [],
											params: [],
											returnTypes: [ASTIdentifier._('T', pos, mockParent)],
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
												base: ASTIdentifier._('Result', pos, mockParent),
												typeArgs: [
													ASTTypeInstantiationExpression._(
														{
															base: ASTIdentifier._('Maybe', pos, mockParent),
															typeArgs: [ASTIdentifier._('T', pos, mockParent)],
														},
														pos,
														mockParent,
													),
												],
											},
											pos,
											mockParent,
										),
									],
								},
								pos,
								mockParent,
							),
						],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('params and return types using tuples', (): void => {
			testAnalyze('f foo (a: <bool>) -> <dec64> {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTTupleShape._([ASTTypePrimitiveBool(pos, mockParent)], pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						returnTypes: [ASTTupleShape._([ASTTypeNumber._('dec64', pos, mockParent)], pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('params and return types using tuples and arrays', (): void => {
			testAnalyze('f foo (a: <bool[]>[]) -> <int32> {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTArrayOf._(
										ASTTupleShape._(
											[ASTArrayOf._(ASTTypePrimitiveBool(pos, mockParent), pos, mockParent)],
											pos,
											mockParent,
										),
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
							),
						],
						returnTypes: [ASTTupleShape._([ASTTypeNumber._('int32', pos, mockParent)], pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('with arrays', (): void => {
			testAnalyze('f foo(a: int8[] = [5], b: string[][], ...c: Foo[]) -> regex, path[][][] {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTArrayOf._(ASTTypeNumber._('int8', pos, mockParent), pos, mockParent),
									defaultValue: ASTArrayExpression._(
										{
											items: [ASTNumberLiteral._(5, 'int8', pos, mockParent)],
											type: ASTTypeNumberInt8(pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('b', pos, mockParent),
									type: ASTArrayOf._(
										ASTArrayOf._(ASTTypePrimitiveString(pos, mockParent), pos, mockParent),
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: true,
									name: ASTIdentifier._('c', pos, mockParent),
									type: ASTArrayOf._(ASTIdentifier._('Foo', pos, mockParent), pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						returnTypes: [
							ASTTypePrimitiveRegex(pos, mockParent),
							ASTArrayOf._(
								ASTArrayOf._(ASTArrayOf._(ASTTypePrimitivePath(pos, mockParent), pos, mockParent), pos, mockParent),
								pos,
								mockParent,
							),
						],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
							name: ASTIdentifier._('school', pos, mockParent),
							typeParams: [],
							params: [
								ASTParameter._(
									{
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('age', pos, mockParent),
										type: ASTTypeNumber._('int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							returnTypes: [ASTTypePrimitiveString(pos, mockParent)],
							body: ASTBlockStatement._(
								[
									ASTReturnStatement._(
										[
											ASTWhenExpression._(
												{
													expression: ASTIdentifier._('age', pos, mockParent),
													cases: [
														ASTWhenCase._(
															{
																values: [ASTNumberLiteral._(11, 'int8', pos, mockParent)],
																consequent: ASTStringLiteral._('Hogwarts First Year', pos, mockParent),
															},
															pos,
															mockParent,
														),
														ASTWhenCase._(
															{
																values: [
																	ASTRangeExpression._(
																		{
																			lower: ASTNumberLiteral._(12, 'int8', pos, mockParent),
																			upper: ASTNumberLiteral._(17, 'int8', pos, mockParent),
																		},
																		pos,
																		mockParent,
																	),
																],
																consequent: ASTStringLiteral._('Another Year at Hogwarts', pos, mockParent),
															},
															pos,
															mockParent,
														),
														ASTWhenCase._(
															{
																values: [
																	ASTNumberLiteral._(18, 'int8', pos, mockParent),
																	ASTNumberLiteral._(19, 'int8', pos, mockParent),
																],
																consequent: ASTStringLiteral._('Auror Training', pos, mockParent),
															},
															pos,
															mockParent,
														),
														ASTWhenCase._(
															{
																values: [ASTRestElement._(pos, mockParent)],
																consequent: ASTStringLiteral._('Auror', pos, mockParent),
															},
															pos,
															mockParent,
														),
													],
												},
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('foo', pos, mockParent),
							typeParams: [],
							params: [
								ASTParameter._(
									{
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('age', pos, mockParent),
										type: ASTTypeNumber._('uint16', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							returnTypes: [ASTTypeNumber._('uint16', pos, mockParent), ASTTypePrimitiveString(pos, mockParent)],
							body: ASTBlockStatement._(
								[
									ASTReturnStatement._(
										[
											ASTNumberLiteral._(5, 'int8', pos, mockParent),
											ASTWhenExpression._(
												{
													expression: ASTIdentifier._('age', pos, mockParent),
													cases: [
														ASTWhenCase._(
															{
																values: [ASTRestElement._(pos, mockParent)],
																consequent: ASTStringLiteral._('No more foos', pos, mockParent),
															},
															pos,
															mockParent,
														),
													],
												},
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
				],
			);
		});

		it('generics', (): void => {
			testAnalyze('f foo <|T|> (a: T) -> T {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent)],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTIdentifier._('T', pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						returnTypes: [ASTIdentifier._('T', pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
							modifiers: [ASTModifier._('abstract', pos, mockParent)],
							name: ASTIdentifier._('A', pos, mockParent),
							typeParams: [],
							extends: [],
							implements: [],
							body: ASTBlockStatement._(
								[
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', pos, mockParent)],
											name: ASTIdentifier._('foo1', pos, mockParent),
											typeParams: [],
											params: [],
											returnTypes: [],
											body: undefined,
										},
										pos,
										mockParent,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', pos, mockParent)],
											name: ASTIdentifier._('foo2', pos, mockParent),
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														name: ASTIdentifier._('arg', pos, mockParent),
														isRest: false,
														type: ASTTypeNumber._('int64', pos, mockParent),
													},
													pos,
													mockParent,
												),
											],
											returnTypes: [],
											body: undefined,
										},
										pos,
										mockParent,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', pos, mockParent)],
											name: ASTIdentifier._('foo3', pos, mockParent),
											typeParams: [
												ASTTypeParameter._(
													ASTIdentifier._('T', pos, mockParent),
													undefined,
													undefined,
													pos,
													mockParent,
												),
											],
											params: [],
											returnTypes: [ASTTypePrimitiveBool(pos, mockParent)],
											body: undefined,
										},
										pos,
										mockParent,
									),
									ASTFunctionDeclaration._(
										{
											modifiers: [ASTModifier._('abstract', pos, mockParent)],
											name: ASTIdentifier._('foo4', pos, mockParent),
											typeParams: [],
											params: [
												ASTParameter._(
													{
														modifiers: [],
														isRest: false,
														name: ASTIdentifier._('arg', pos, mockParent),
														type: ASTTypeNumber._('dec32', pos, mockParent),
													},
													pos,
													mockParent,
												),
											],
											returnTypes: [ASTTypePrimitiveBool(pos, mockParent)],
											body: undefined,
										},
										pos,
										mockParent,
									),
								],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
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
						identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
						declaredTypes: [],
						initialValues: [
							ASTFunctionDeclaration._(
								{
									modifiers: [],
									name: ASTIdentifier._('#f_anon_', pos, mockParent),
									typeParams: [],
									params: [],
									returnTypes: [],
									body: ASTBlockStatement._([], pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('anonymous complex', () => {
			testAnalyze('const foo = f <|T|>(a: T) -> T {\ndo();\n};', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
						declaredTypes: [],
						initialValues: [
							ASTFunctionDeclaration._(
								{
									modifiers: [],
									name: ASTIdentifier._('#f_anon_', pos, mockParent),
									typeParams: [
										ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent),
									],
									params: [
										ASTParameter._(
											{
												modifiers: [],
												isRest: false,
												name: ASTIdentifier._('a', pos, mockParent),
												type: ASTIdentifier._('T', pos, mockParent),
											},
											pos,
											mockParent,
										),
									],
									returnTypes: [ASTIdentifier._('T', pos, mockParent)],
									body: ASTBlockStatement._(
										[
											ASTCallExpression._(
												{
													callee: ASTIdentifier._('do', pos, mockParent),
													typeArgs: [],
													args: [],
												},
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('anonymous abstract', () => {
			testAnalyze(
				'abstract const foo = f;',

				[
					ASTVariableDeclaration._(
						{
							modifiers: [ASTModifier._('abstract', pos, mockParent)],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [],
							initialValues: [
								ASTFunctionDeclaration._(
									{
										modifiers: [],
										name: ASTIdentifier._('#f_anon_', pos, mockParent),
										typeParams: [],
										params: [],
										returnTypes: [],
										body: undefined,
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [],
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('danger?', pos, mockParent),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitiveBool(pos, mockParent)],
							body: ASTBlockStatement._(
								[ASTReturnStatement._([ASTBoolLiteral._(true, pos, mockParent)], pos, mockParent)],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
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
								name: ASTIdentifier._('A', pos, mockParent),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._(
									[
										ASTFunctionDeclaration._(
											{
												modifiers: [],
												name: ASTIdentifier._('<=>', pos, mockParent),
												typeParams: [],
												params: [],
												returnTypes: [],
												body: ASTBlockStatement._([], pos, mockParent),
											},
											pos,
											mockParent,
										),
									],
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
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
						test: ASTBoolLiteral._(true, pos, mockParent),
						consequent: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
								left: ASTNumberLiteral._(1, 'int8', pos, mockParent),
								right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
						consequent: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
								left: ASTIdentifier._('foo', pos, mockParent),
								right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
						consequent: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
										callee: ASTIdentifier._('foo', pos, mockParent),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
								right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
						consequent: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
												callee: ASTIdentifier._('foo', pos, mockParent),
												typeArgs: [],
												args: [],
											},
											pos,
											mockParent,
										),
										right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
								right: ASTBinaryExpression._(
									{
										operator: '<',
										left: ASTIdentifier._('a', pos, mockParent),
										right: ASTNumberLiteral._(3, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
						),
						consequent: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
											callee: ASTIdentifier._('foo', pos, mockParent),
											typeArgs: [],
											args: [],
										},
										pos,
										mockParent,
									),
									right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
							consequent: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
													callee: ASTIdentifier._('foo', pos, mockParent),
													typeArgs: [],
													args: [],
												},
												pos,
												mockParent,
											),
											right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
									right: ASTBinaryExpression._(
										{
											operator: '<',
											left: ASTIdentifier._('a', pos, mockParent),
											right: ASTNumberLiteral._(3, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
							),
							consequent: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});
		});

		it('with just else', () => {
			testAnalyze('if true {} else {}', [
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(true, pos, mockParent),
						consequent: ASTBlockStatement._([], pos, mockParent),
						alternate: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('with else if', () => {
			testAnalyze('if true {} else if false {}', [
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(true, pos, mockParent),
						consequent: ASTBlockStatement._([], pos, mockParent),
						alternate: ASTIfStatement._(
							{
								test: ASTBoolLiteral._(false, pos, mockParent),
								consequent: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('with a subsequent if and should be two separate IfStatements', () => {
			testAnalyze('if true {} if false {}', [
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(true, pos, mockParent),
						consequent: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
				ASTIfStatement._(
					{
						test: ASTBoolLiteral._(false, pos, mockParent),
						consequent: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [],
						extends: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('interface Foo <| T, U |> {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [
							ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent),
							ASTTypeParameter._(ASTIdentifier._('U', pos, mockParent), undefined, undefined, pos, mockParent),
						],
						extends: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('interface extends other', (): void => {
			testAnalyze('interface Foo {} interface Bar extends Foo {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [],
						extends: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Bar', pos, mockParent),
						typeParams: [],
						extends: [ASTIdentifier._('Foo', pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('interface extends multiple', (): void => {
			testAnalyze('interface Foo extends Bar, Baz {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [],
						extends: [ASTIdentifier._('Bar', pos, mockParent), ASTIdentifier._('Baz', pos, mockParent)],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('interface extends multiple with generics', (): void => {
			testAnalyze('interface Foo<|T,U|> extends Bar<|T|>, Baz<|U|> {}', [
				ASTInterfaceDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('Foo', pos, mockParent),
						typeParams: [
							ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent),
							ASTTypeParameter._(ASTIdentifier._('U', pos, mockParent), undefined, undefined, pos, mockParent),
						],
						extends: [
							ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('Bar', pos, mockParent),
									typeArgs: [ASTIdentifier._('T', pos, mockParent)],
								},
								pos,
								mockParent,
							),
							ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('Baz', pos, mockParent),
									typeArgs: [ASTIdentifier._('U', pos, mockParent)],
								},
								pos,
								mockParent,
							),
						],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
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
									pos,
									mockParent,
								),
								modifiers: [],
								name: ASTIdentifier._('Foo', pos, mockParent),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
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
									pos,
									mockParent,
								),
								modifiers: [ASTModifier._('abstract', pos, mockParent)],
								name: ASTIdentifier._('Foo', pos, mockParent),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
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
								name: ASTIdentifier._('Foo', pos, mockParent),
								typeParams: [],
								extends: [],
								implements: [],
								body: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
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
								joeDoc: ASTJoeDoc._('/** foo */', pos, mockParent),
								modifiers: [],
								name: ASTIdentifier._('foo', pos, mockParent),
								typeParams: [],
								params: [],
								returnTypes: [],
								body: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
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
								name: ASTIdentifier._('foo', pos, mockParent),
								typeParams: [],
								params: [],
								returnTypes: [],
								body: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
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
								joeDoc: ASTJoeDoc._('/** foo */', pos, mockParent),
								modifiers: [],
								name: ASTIdentifier._('Foo', pos, mockParent),
								typeParams: [],
								extends: [],
								body: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
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
								name: ASTIdentifier._('Foo', pos, mockParent),
								typeParams: [],
								extends: [],
								body: ASTBlockStatement._([], pos, mockParent),
							},
							pos,
							mockParent,
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
								joeDoc: ASTJoeDoc._('/** foo */', pos, mockParent),
								modifiers: [],
								mutable: false,
								identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
								declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
								initialValues: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
								inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
							},
							pos,
							mockParent,
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
								identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
								declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
								initialValues: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
								inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
							},
							pos,
							mockParent,
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
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('with done', () => {
			testAnalyze('loop {\ndone;\n}', [
				ASTLoopStatement._(
					{
						body: ASTBlockStatement._([ASTDoneStatement._(pos, mockParent)], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('with next', () => {
			testAnalyze('loop {\nnext;\n}', [
				ASTLoopStatement._(
					{
						body: ASTBlockStatement._([ASTNextStatement._(pos, mockParent)], pos, mockParent),
					},
					pos,
					mockParent,
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
										object: ASTIdentifier._('a', pos, mockParent),
										property: ASTIdentifier._('b', pos, mockParent),
									},
									pos,
									mockParent,
								),
								property: ASTIdentifier._('c', pos, mockParent),
							},
							pos,
							mockParent,
						),
						property: ASTIdentifier._('d', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('works with this', () => {
			testAnalyze('this.foo', [
				ASTMemberExpression._(
					{
						object: ASTThisKeyword._(pos, mockParent),
						property: ASTIdentifier._('foo', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		describe('works with a TypeInstantiationExpression', () => {
			it('on the property', () => {
				testAnalyze('foo.bar<|T|>', [
					ASTMemberExpression._(
						{
							object: ASTIdentifier._('foo', pos, mockParent),
							property: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('bar', pos, mockParent),
									typeArgs: [ASTIdentifier._('T', pos, mockParent)],
								},
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('on the object and uses dot notation', () => {
				testAnalyze('foo<|T|>.bar', [
					ASTMemberExpression._(
						{
							object: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('foo', pos, mockParent),
									typeArgs: [ASTIdentifier._('T', pos, mockParent)],
								},
								pos,
								mockParent,
							),
							property: ASTIdentifier._('bar', pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('on the object and uses bracket notation', () => {
				testAnalyze('foo<|T|>["bar"]', [
					ASTMemberExpression._(
						{
							object: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('foo', pos, mockParent),
									typeArgs: [ASTIdentifier._('T', pos, mockParent)],
								},
								pos,
								mockParent,
							),
							property: ASTStringLiteral._('bar', pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('with this', () => {
				testAnalyze('this.bar<|T|>', [
					ASTMemberExpression._(
						{
							object: ASTThisKeyword._(pos, mockParent),
							property: ASTTypeInstantiationExpression._(
								{
									base: ASTIdentifier._('bar', pos, mockParent),
									typeArgs: [ASTIdentifier._('T', pos, mockParent)],
								},
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
				]);
			});
		});

		it('should parse a string in brackets as a MemberExpression property', () => {
			testAnalyze('foo["bar"]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', pos, mockParent),
						property: ASTStringLiteral._('bar', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('should parse a number in brackets as a MemberExpression property', () => {
			testAnalyze('foo[0]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', pos, mockParent),
						property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('should parse an identifier in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', pos, mockParent),
						property: ASTIdentifier._('bar', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('should parse a MemberExpression in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar.baz]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', pos, mockParent),
						property: ASTMemberExpression._(
							{
								object: ASTIdentifier._('bar', pos, mockParent),
								property: ASTIdentifier._('baz', pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('should parse a CallExpression in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar()]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', pos, mockParent),
						property: ASTCallExpression._(
							{
								callee: ASTIdentifier._('bar', pos, mockParent),
								typeArgs: [],
								args: [],
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		it.each(unaryMathOperatorScenarios)(
			'should parse a UnaryExpression with a ${operator} operator in brackets as a MemberExpression property',
			({ operator, before, expression }) => {
				testAnalyze(`foo[${expression}]`, [
					ASTMemberExpression._(
						{
							object: ASTIdentifier._('foo', pos, mockParent),
							property: ASTUnaryExpression._(
								{
									before,
									operator,
									operand: ASTIdentifier._('bar', pos, mockParent),
								},
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
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
							object: ASTIdentifier._('foo', pos, mockParent),
							property: ASTBinaryExpression._(
								{
									operator,
									left: ASTIdentifier._('index', pos, mockParent),
									right: ASTNumberLiteral._(1, 'int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
				]);
			},
		);

		it('should parse a TernaryExpression in brackets as a MemberExpression property', () => {
			testAnalyze('foo[bar ? 0 : 1]', [
				ASTMemberExpression._(
					{
						object: ASTIdentifier._('foo', pos, mockParent),
						property: ASTTernaryExpression._(
							{
								test: ASTTernaryCondition._(ASTIdentifier._('bar', pos, mockParent), pos, mockParent),
								consequent: ASTTernaryConsequent._(ASTNumberLiteral._(0, 'int8', pos, mockParent), pos, mockParent),
								alternate: ASTTernaryAlternate._(ASTNumberLiteral._(1, 'int8', pos, mockParent), pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
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
									items: [ASTStringLiteral._('A', pos, mockParent), ASTStringLiteral._('B', pos, mockParent)],
									type: ASTTypePrimitiveString(pos, mockParent),
								},
								pos,
								mockParent,
							),
							property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should work on a StringLiteral', () => {
				testAnalyze('"A"[0]', [
					ASTMemberExpression._(
						{
							object: ASTStringLiteral._('A', pos, mockParent),
							property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should work on an TupleExpression', () => {
				testAnalyze('<4, "B">[0]', [
					ASTMemberExpression._(
						{
							object: ASTTupleExpression._(
								[ASTNumberLiteral._(4, 'int8', pos, mockParent), ASTStringLiteral._('B', pos, mockParent)],
								pos,
								mockParent,
							),
							property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
						},
						pos,
						mockParent,
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
										callee: ASTIdentifier._('foo', pos, mockParent),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
								property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
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
										items: [ASTStringLiteral._('A', pos, mockParent), ASTStringLiteral._('B', pos, mockParent)],
										type: ASTTypePrimitiveString(pos, mockParent),
									},
									pos,
									mockParent,
								),
								property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
					],
				);
			});

			it('should work on a StringLiteral', () => {
				testAnalyze('(("A"))[0]', [
					ASTMemberExpression._(
						{
							object: ASTStringLiteral._('A', pos, mockParent),
							property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
						},
						pos,
						mockParent,
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
									[ASTNumberLiteral._(4, 'int8', pos, mockParent), ASTStringLiteral._('B', pos, mockParent)],
									pos,
									mockParent,
								),
								property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
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
										callee: ASTIdentifier._('foo', pos, mockParent),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
								property: ASTNumberLiteral._(0, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
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
									object: ASTThisKeyword._(pos, mockParent),
									property: ASTIdentifier._('foo', pos, mockParent),
								},
								pos,
								mockParent,
							),
							properties: [ASTStringLiteral._('a', pos, mockParent), ASTStringLiteral._('b', pos, mockParent)],
						},
						pos,
						mockParent,
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
									object: ASTThisKeyword._(pos, mockParent),
									property: ASTIdentifier._('foo', pos, mockParent),
								},
								pos,
								mockParent,
							),
							properties: [ASTNumberLiteral._(1, 'int8', pos, mockParent), ASTNumberLiteral._(3, 'int8', pos, mockParent)],
						},
						pos,
						mockParent,
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
							object: ASTIdentifier._('foo', pos, mockParent),
							properties: [ASTIdentifier._('a', pos, mockParent), ASTIdentifier._('b', pos, mockParent)],
						},
						pos,
						mockParent,
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
										base: ASTIdentifier._('foo', pos, mockParent),
										typeArgs: [ASTIdentifier._('bar', pos, mockParent), ASTIdentifier._('baz', pos, mockParent)],
									},
									pos,
									mockParent,
								),
								properties: [ASTStringLiteral._('a', pos, mockParent), ASTStringLiteral._('b', pos, mockParent)],
							},
							pos,
							mockParent,
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
							object: ASTIdentifier._('foo', pos, mockParent),
							properties: [
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
										upper: ASTNumberLiteral._(3, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
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
							object: ASTIdentifier._('foo', pos, mockParent),
							properties: [
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
										upper: ASTNumberLiteral._(3, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(5, 'int8', pos, mockParent),
										upper: ASTNumberLiteral._(7, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
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
							object: ASTIdentifier._('foo', pos, mockParent),
							properties: [
								ASTUnaryExpression._(
									{
										before: true,
										operator: '!',
										operand: ASTIdentifier._('bar', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
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
								object: ASTIdentifier._('foo', pos, mockParent),
								properties: [
									ASTUnaryExpression._(
										{
											before,
											operator,
											operand: ASTIdentifier._('bar', pos, mockParent),
										},
										pos,
										mockParent,
									),
									ASTUnaryExpression._(
										{
											before,
											operator,
											operand: ASTIdentifier._('bar', pos, mockParent),
										},
										pos,
										mockParent,
									),
								],
							},
							pos,
							mockParent,
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
							object: ASTIdentifier._('foo', pos, mockParent),
							properties: [
								ASTBinaryExpression._(
									{
										operator,
										left: ASTIdentifier._('index', pos, mockParent),
										right: ASTNumberLiteral._(1, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
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
								object: ASTIdentifier._('foo', pos, mockParent),
								properties: [
									ASTBinaryExpression._(
										{
											operator,
											left: ASTIdentifier._('index', pos, mockParent),
											right: ASTNumberLiteral._(1, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
									ASTBinaryExpression._(
										{
											operator,
											left: ASTIdentifier._('index', pos, mockParent),
											right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
								],
							},
							pos,
							mockParent,
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
								operand: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);
				});

				it('with Identifier in parens', (): void => {
					testAnalyze('(!foo);', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '!',
								operand: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
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
											callee: ASTIdentifier._('bar', pos, mockParent),
											typeArgs: [],
											args: [],
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
												object: ASTIdentifier._('foo', pos, mockParent),
												property: ASTIdentifier._('bar', pos, mockParent),
											},
											pos,
											mockParent,
										),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
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
								operand: ASTNumberLiteral._(1, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);
				});

				it('with parens', (): void => {
					testAnalyze('(-1)', [
						ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(1, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
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
								operand: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);

					testAnalyze(
						'foo[--i]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									property: ASTUnaryExpression._(
										{
											before: true,
											operator: '--',
											operand: ASTIdentifier._('i', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
								operand: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);
				});

				it('post-decrement in array index', (): void => {
					testAnalyze(
						'foo[i--]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									property: ASTUnaryExpression._(
										{
											before: false,
											operator: '--',
											operand: ASTIdentifier._('i', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
								operand: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);

					testAnalyze(
						'foo[++i]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									property: ASTUnaryExpression._(
										{
											before: true,
											operator: '++',
											operand: ASTIdentifier._('i', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
								operand: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);

					testAnalyze(
						'foo[i++]',

						[
							ASTMemberExpression._(
								{
									object: ASTIdentifier._('foo', pos, mockParent),
									property: ASTUnaryExpression._(
										{
											before: false,
											operator: '++',
											operand: ASTIdentifier._('i', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
								left: ASTIdentifier._('a', pos, mockParent),
								right: ASTBoolLiteral._(true, pos, mockParent),
							},
							pos,
							mockParent,
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
									left: ASTIdentifier._('a', pos, mockParent),
									right: ASTBoolLiteral._(true, pos, mockParent),
								},
								pos,
								mockParent,
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
											left: ASTIdentifier._('foo', pos, mockParent),
											right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
									right: ASTBinaryExpression._(
										{
											operator: '<=',
											left: ASTIdentifier._('foo', pos, mockParent),
											right: ASTNumberLiteral._(5, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
											left: ASTIdentifier._('foo', pos, mockParent),
											right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
									right: ASTBinaryExpression._(
										{
											operator: '<',
											left: ASTIdentifier._('foo', pos, mockParent),
											right: ASTNumberLiteral._(5, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
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
									left: ASTIdentifier._('a', pos, mockParent),
									right: ASTBoolLiteral._(true, pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
					);

					testAnalyze('(a) && true', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTIdentifier._('a', pos, mockParent),
								right: ASTBoolLiteral._(true, pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);
				});

				it('with a function call', () => {
					testAnalyze('a && foo(true)', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTIdentifier._('a', pos, mockParent),
								right: ASTCallExpression._(
									{
										callee: ASTIdentifier._('foo', pos, mockParent),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, pos, mockParent)],
									},
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
						),
					]);

					testAnalyze('a(true) && foo', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTCallExpression._(
									{
										callee: ASTIdentifier._('a', pos, mockParent),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, pos, mockParent)],
									},
									pos,
									mockParent,
								),
								right: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
						),
					]);
				});

				it('with a function call in parens', () => {
					testAnalyze('a && (foo(true))', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTIdentifier._('a', pos, mockParent),
								right: ASTCallExpression._(
									{
										callee: ASTIdentifier._('foo', pos, mockParent),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, pos, mockParent)],
									},
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
						),
					]);

					testAnalyze('(a(true)) && foo', [
						ASTBinaryExpression._(
							{
								operator: '&&',
								left: ASTCallExpression._(
									{
										callee: ASTIdentifier._('a', pos, mockParent),
										typeArgs: [],
										args: [ASTBoolLiteral._(true, pos, mockParent)],
									},
									pos,
									mockParent,
								),
								right: ASTIdentifier._('foo', pos, mockParent),
							},
							pos,
							mockParent,
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
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
							initialValues: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
							inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
						},
						pos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('bar', pos, mockParent)],
							declaredTypes: [],
							initialValues: [
								ASTUnaryExpression._(
									{
										before: true,
										operator: '-',
										operand: ASTIdentifier._('foo', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [],
						},
						pos,
						mockParent,
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
								callee: ASTIdentifier._('do', pos, mockParent),
								typeArgs: [],
								args: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
							},
							pos,
							mockParent,
						),
						test: ASTBinaryExpression._(
							{
								operator: '==',
								left: ASTIdentifier._('foo', pos, mockParent),
								right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		describe('in an array', () => {
			it('with bool conditional', () => {
				testAnalyze('const foo, bar = "foo1", "bar1"; [foo if true, bar];', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', pos, mockParent), ASTIdentifier._('bar', pos, mockParent)],
							declaredTypes: [ASTTypePrimitiveString(pos, mockParent), ASTTypePrimitiveString(pos, mockParent)],
							initialValues: [ASTStringLiteral._('foo1', pos, mockParent), ASTStringLiteral._('bar1', pos, mockParent)],
							inferredTypes: [ASTTypePrimitiveString(pos, mockParent), ASTTypePrimitiveString(pos, mockParent)],
						},
						pos,
						mockParent,
					),
					ASTArrayExpression._(
						{
							items: [
								ASTPostfixIfStatement._(
									{
										expression: ASTIdentifier._('foo', pos, mockParent),
										test: ASTBoolLiteral._(true, pos, mockParent),
									},
									pos,
									mockParent,
								),
								ASTIdentifier._('bar', pos, mockParent),
							],
							type: ASTTypePrimitiveString(pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('with identifier conditional', () => {
				testAnalyze('[9, 10 if isDone?, 11];', [
					ASTArrayExpression._(
						{
							items: [
								ASTNumberLiteral._(9, 'int8', pos, mockParent),
								ASTPostfixIfStatement._(
									{
										expression: ASTNumberLiteral._(10, 'int8', pos, mockParent),
										test: ASTIdentifier._('isDone?', pos, mockParent),
									},
									pos,
									mockParent,
								),
								ASTNumberLiteral._(11, 'int8', pos, mockParent),
							],
							type: ASTTypeNumberInt8(pos, mockParent),
						},
						pos,
						mockParent,
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
											expression: ASTNumberLiteral._(9, 'int8', pos, mockParent),
											test: ASTMemberExpression._(
												{
													object: ASTThisKeyword._(pos, mockParent),
													property: ASTIdentifier._('isDone?', pos, mockParent),
												},
												pos,
												mockParent,
											),
										},
										pos,
										mockParent,
									),
									ASTNumberLiteral._(10, 'int8', pos, mockParent),
									ASTNumberLiteral._(11, 'int8', pos, mockParent),
								],
								type: ASTTypeNumberInt8(pos, mockParent),
							},
							pos,
							mockParent,
						),
					],
				);
			});

			it('with CallExpression conditional', () => {
				testAnalyze('[9, 10 if this.isDone?([true if true]), 11];', [
					ASTArrayExpression._(
						{
							items: [
								ASTNumberLiteral._(9, 'int8', pos, mockParent),
								ASTPostfixIfStatement._(
									{
										expression: ASTNumberLiteral._(10, 'int8', pos, mockParent),
										test: ASTCallExpression._(
											{
												callee: ASTMemberExpression._(
													{
														object: ASTThisKeyword._(pos, mockParent),
														property: ASTIdentifier._('isDone?', pos, mockParent),
													},
													pos,
													mockParent,
												),
												typeArgs: [],
												args: [
													ASTArrayExpression._(
														{
															items: [
																ASTPostfixIfStatement._(
																	{
																		expression: ASTBoolLiteral._(true, pos, mockParent),
																		test: ASTBoolLiteral._(true, pos, mockParent),
																	},
																	pos,
																	mockParent,
																),
															],
															type: ASTTypePrimitiveBool(pos, mockParent),
														},
														pos,
														mockParent,
													),
												],
											},
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
								ASTNumberLiteral._(11, 'int8', pos, mockParent),
							],
							type: ASTTypeNumberInt8(pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('with BinaryExpression conditional using two NumberLiterals', () => {
				testAnalyze('[\'foo\', "bar" if 1 < 2];', [
					ASTArrayExpression._(
						{
							items: [
								ASTStringLiteral._('foo', pos, mockParent),
								ASTPostfixIfStatement._(
									{
										expression: ASTStringLiteral._('bar', pos, mockParent),
										test: ASTBinaryExpression._(
											{
												operator: '<',
												left: ASTNumberLiteral._(1, 'int8', pos, mockParent),
												right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
											},
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
							],
							type: ASTTypePrimitiveString(pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('with BinaryExpression conditional using an Identifier and a NumberLiteral', () => {
				testAnalyze('[true, true, false, false if foo == 2, true, false, true];', [
					ASTArrayExpression._(
						{
							items: [
								ASTBoolLiteral._(true, pos, mockParent),
								ASTBoolLiteral._(true, pos, mockParent),
								ASTBoolLiteral._(false, pos, mockParent),
								ASTPostfixIfStatement._(
									{
										expression: ASTBoolLiteral._(false, pos, mockParent),
										test: ASTBinaryExpression._(
											{
												operator: '==',
												left: ASTIdentifier._('foo', pos, mockParent),
												right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
											},
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
								ASTBoolLiteral._(true, pos, mockParent),
								ASTBoolLiteral._(false, pos, mockParent),
								ASTBoolLiteral._(true, pos, mockParent),
							],
							type: ASTTypePrimitiveBool(pos, mockParent),
						},
						pos,
						mockParent,
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
								object: ASTIdentifier._('foo', pos, mockParent),
								property: ASTNumberLiteral._(5, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
					],
					pos,
					mockParent,
				),
				ASTPrintStatement._([ASTNumberLiteral._(5, 'int8', pos, mockParent)], pos, mockParent),
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
										object: ASTIdentifier._('myFoo', pos, mockParent),
										property: ASTIdentifier._('foo', pos, mockParent),
									},
									pos,
									mockParent,
								),
								typeArgs: [],
								args: [],
							},
							pos,
							mockParent,
						),
					],
					pos,
					mockParent,
				),
			]);
		});

		it('should work with a comma-delimited list', () => {
			testAnalyze('print 1, "a", [true], <"high", 5>;', [
				ASTPrintStatement._(
					[
						ASTNumberLiteral._(1, 'int8', pos, mockParent),
						ASTStringLiteral._('a', pos, mockParent),
						ASTArrayExpression._(
							{
								items: [ASTBoolLiteral._(true, pos, mockParent)],
								type: ASTTypePrimitiveBool(pos, mockParent),
							},
							pos,
							mockParent,
						),
						ASTTupleExpression._(
							[ASTStringLiteral._('high', pos, mockParent), ASTNumberLiteral._(5, 'int8', pos, mockParent)],
							pos,
							mockParent,
						),
					],
					pos,
					mockParent,
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
							lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
							upper: ASTNumberLiteral._(2, 'int8', pos, mockParent),
						},
						pos,
						mockParent,
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
								operand: ASTNumberLiteral._(1, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
						upper: ASTNumberLiteral._(2, 'int8', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('1 .. -2;', [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
						upper: ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(2, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('-1 .. -2;', [
				ASTRangeExpression._(
					{
						lower: ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(1, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
						upper: ASTUnaryExpression._(
							{
								before: true,
								operator: '-',
								operand: ASTNumberLiteral._(2, 'int8', pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		// identifier and number
		it('.. with identifier and number literal', (): void => {
			testAnalyze('foo .. 2;', [
				ASTRangeExpression._(
					{
						lower: ASTIdentifier._('foo', pos, mockParent),
						upper: ASTNumberLiteral._(2, 'int8', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('.. with number literal and identifier', (): void => {
			testAnalyze('1 .. foo;', [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
						upper: ASTIdentifier._('foo', pos, mockParent),
					},
					pos,
					mockParent,
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
								object: ASTIdentifier._('foo', pos, mockParent),
								property: ASTStringLiteral._('a', pos, mockParent),
							},
							pos,
							mockParent,
						),
						upper: ASTNumberLiteral._(2, 'int8', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('.. with number literal and element access', (): void => {
			testAnalyze("1 .. foo['a'];'a'", [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
						upper: ASTMemberExpression._(
							{
								object: ASTIdentifier._('foo', pos, mockParent),
								property: ASTStringLiteral._('a', pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
				ASTStringLiteral._('a', pos, mockParent),
			]);
		});

		// method call and number
		it('.. with method call and number literal', (): void => {
			testAnalyze("foo('a') .. 2;", [
				ASTRangeExpression._(
					{
						lower: ASTCallExpression._(
							{
								callee: ASTIdentifier._('foo', pos, mockParent),
								typeArgs: [],
								args: [ASTStringLiteral._('a', pos, mockParent)],
							},
							pos,
							mockParent,
						),
						upper: ASTNumberLiteral._(2, 'int8', pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('.. with number literal and method call', (): void => {
			testAnalyze("1 .. foo('a');", [
				ASTRangeExpression._(
					{
						lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
						upper: ASTCallExpression._(
							{
								callee: ASTIdentifier._('foo', pos, mockParent),
								typeArgs: [],
								args: [ASTStringLiteral._('a', pos, mockParent)],
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
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
								object: ASTIdentifier._('foo', pos, mockParent),
								property: ASTStringLiteral._('a', pos, mockParent),
							},
							pos,
							mockParent,
						),
						upper: ASTCallExpression._(
							{
								callee: ASTIdentifier._('bar', pos, mockParent),
								typeArgs: [],
								args: [ASTStringLiteral._('b', pos, mockParent)],
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('.. with method call and element access', (): void => {
			testAnalyze("foo('a') .. bar['b'];", [
				ASTRangeExpression._(
					{
						lower: ASTCallExpression._(
							{
								callee: ASTIdentifier._('foo', pos, mockParent),
								typeArgs: [],
								args: [ASTStringLiteral._('a', pos, mockParent)],
							},
							pos,
							mockParent,
						),
						upper: ASTMemberExpression._(
							{
								object: ASTIdentifier._('bar', pos, mockParent),
								property: ASTStringLiteral._('b', pos, mockParent),
							},
							pos,
							mockParent,
						),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('.. with two in a row', () => {
			testAnalyze('let count, countDown = 1 .. myArray[2], myArray[1] .. 0;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('count', pos, mockParent), ASTIdentifier._('countDown', pos, mockParent)],
						declaredTypes: [],
						initialValues: [
							ASTRangeExpression._(
								{
									lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
									upper: ASTMemberExpression._(
										{
											object: ASTIdentifier._('myArray', pos, mockParent),
											property: ASTNumberLiteral._(2, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
								},
								pos,
								mockParent,
							),
							ASTRangeExpression._(
								{
									lower: ASTMemberExpression._(
										{
											object: ASTIdentifier._('myArray', pos, mockParent),
											property: ASTNumberLiteral._(1, 'int8', pos, mockParent),
										},
										pos,
										mockParent,
									),
									upper: ASTNumberLiteral._(0, 'int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [ASTTypeRange._(pos, mockParent), ASTTypeRange._(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});
	});

	describe.skip('Types', (): void => {
		describe('should understand primitive types', () => {
			it.each(primitiveTypes)('%s is recognized as its own primitive type', (type) => {
				testAnalyze(type, [ASTTypePrimitive._(type, pos, mockParent)]);
			});

			it.each(numberSizesAll)('%s is recognized as a number type', (size) => {
				testAnalyze(size, [ASTTypeNumber._(size, pos, mockParent)]);
			});

			it('range is recognized as a type', () => {
				testAnalyze('range', [ASTTypeRange._(pos, mockParent)]);
			});

			it.each(primitiveTypes)('%s[] is recognized as a one-dimensional array of type', (type) => {
				testAnalyze(`${type}[]`, [ASTArrayOf._(ASTTypePrimitive._(type, pos, mockParent), pos, mockParent)]);
			});

			it.each(numberSizesAll)('%s[] is recognized as a one-dimensional array of type', (size) => {
				testAnalyze(`${size}[]`, [ASTArrayOf._(ASTTypeNumber._(size, pos, mockParent), pos, mockParent)]);
			});

			it('range[] is recognized as a one-dimensional array of type', () => {
				testAnalyze('range[]', [ASTArrayOf._(ASTTypeRange._(pos, mockParent), pos, mockParent)]);
			});

			it.each(primitiveTypes)('%s[][] is recognized as a two-dimensional array of primitive type', (type) => {
				testAnalyze(`${type}[][]`, [
					ASTArrayOf._(ASTArrayOf._(ASTTypePrimitive._(type, pos, mockParent), pos, mockParent), pos, mockParent),
				]);
			});

			it.each(numberSizesAll)('%s[][] is recognized as a two-dimensional array of number type', (size) => {
				testAnalyze(`${size}[][]`, [
					ASTArrayOf._(ASTArrayOf._(ASTTypeNumber._(size, pos, mockParent), pos, mockParent), pos, mockParent),
				]);
			});
		});

		describe('arrays', () => {
			it('should understand a custom array', () => {
				testAnalyze('Foo[]', [ASTArrayOf._(ASTIdentifier._('Foo', pos, mockParent), pos, mockParent)]);

				testAnalyze('Foo[][]', [
					ASTArrayOf._(ASTArrayOf._(ASTIdentifier._('Foo', pos, mockParent), pos, mockParent), pos, mockParent),
				]);
			});
		});

		describe('ranges', () => {
			it('should recognize a range type in a variable declaration', () => {
				testAnalyze('let x: range;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('x', pos, mockParent)],
							declaredTypes: [ASTTypeRange._(pos, mockParent)],
							initialValues: [],
							inferredTypes: [],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should infer a range type for a variable declaration with an initial value and also ignore parentheses', () => {
				testAnalyze('let x = 1 .. (2);', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('x', pos, mockParent)],
							declaredTypes: [ASTTypeRange._(pos, mockParent)],
							initialValues: [
								ASTRangeExpression._(
									{
										lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
										upper: ASTNumberLiteral._(2, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTTypeRange._(pos, mockParent)],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should recognize a range type in a function parameter and return type', () => {
				testAnalyze('f foo (x: range) -> range {}', [
					ASTFunctionDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('foo', pos, mockParent),
							typeParams: [],
							params: [
								ASTParameter._(
									{
										modifiers: [],
										isRest: false,
										name: ASTIdentifier._('x', pos, mockParent),
										type: ASTTypeRange._(pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							returnTypes: [ASTTypeRange._(pos, mockParent)],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [ASTTypeParameter._(ASTIdentifier._('T', pos, mockParent), undefined, undefined, pos, mockParent)],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should accept a type and a constraint', () => {
				testAnalyze('class Foo<|T: Bar|> {}', [
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [
								ASTTypeParameter._(
									ASTIdentifier._('T', pos, mockParent),
									ASTIdentifier._('Bar', pos, mockParent),
									undefined,
									pos,
									mockParent,
								),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should accept a type and a default type', () => {
				testAnalyze('class Foo<|T = Bar|> {}', [
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [
								ASTTypeParameter._(
									ASTIdentifier._('T', pos, mockParent),
									undefined,
									ASTIdentifier._('Bar', pos, mockParent),
									pos,
									mockParent,
								),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should accept a type, a constraint, and a default type', () => {
				testAnalyze('class Foo<|T: Bar = Baz|> {}', [
					ASTClassDeclaration._(
						{
							modifiers: [],
							name: ASTIdentifier._('Foo', pos, mockParent),
							typeParams: [
								ASTTypeParameter._(
									ASTIdentifier._('T', pos, mockParent),
									ASTIdentifier._('Bar', pos, mockParent),
									ASTIdentifier._('Baz', pos, mockParent),
									pos,
									mockParent,
								),
							],
							extends: [],
							implements: [],
							body: ASTBlockStatement._([], pos, mockParent),
						},
						pos,
						mockParent,
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
							identifier: ASTIdentifier._('mainJoeFile', pos, mockParent),
							source: ASTPath._(
								{
									absolute: false,
									path: './some/dir/',
									isDir: true,
								},
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
					ASTUseDeclaration._(
						{
							identifier: ASTIdentifier._('another', pos, mockParent),
							source: ASTPath._(
								{
									absolute: true,
									path: '@/lexer.joe',
									isDir: false,
								},
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
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
						identifiersList: [ASTIdentifier._('x', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveBool(pos, mockParent)],
						initialValues: [ASTBoolLiteral._(false, pos, mockParent)],
						inferredTypes: [ASTTypePrimitiveBool(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('let x?, y = false, true', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x?', pos, mockParent), ASTIdentifier._('y', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveBool(pos, mockParent)],
						initialValues: [ASTBoolLiteral._(false, pos, mockParent), ASTBoolLiteral._(true, pos, mockParent)],
						inferredTypes: [ASTTypePrimitiveBool(pos, mockParent), ASTTypePrimitiveBool(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('a double bool assignment and the second one has a question mark', (): void => {
			const declaredTypes = <ASTType[]>[];
			declaredTypes[1] = ASTTypePrimitiveBool(pos, mockParent);

			testAnalyze('let x, y? = false, true', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', pos, mockParent), ASTIdentifier._('y?', pos, mockParent)],
						declaredTypes: declaredTypes,
						initialValues: [ASTBoolLiteral._(false, pos, mockParent), ASTBoolLiteral._(true, pos, mockParent)],
						inferredTypes: [ASTTypePrimitiveBool(pos, mockParent), ASTTypePrimitiveBool(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('a let assignment with a number literal', (): void => {
			testAnalyze('let x = 1', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', pos, mockParent)],
						declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
						initialValues: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
						inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
					},
					pos,
					mockParent,
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
							identifiersList: [ASTIdentifier._('x', pos, mockParent)],
							declaredTypes: [ASTTypeNumberDec32(pos, mockParent)],
							initialValues: [
								ASTBinaryExpression._(
									{
										operator: '^e',
										left: ASTUnaryExpression._(
											{
												before: true,
												operator: '-',
												operand: ASTNumberLiteral._(2300.006, 'dec32', pos, mockParent),
											},
											pos,
											mockParent,
										),
										right: ASTUnaryExpression._(
											{
												before: true,
												operator: '-',
												operand: ASTNumberLiteral._(2000, 'int32', pos, mockParent),
											},
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTTypeNumberDec32(pos, mockParent)],
						},
						pos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('y', pos, mockParent)],
							declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
							initialValues: [ASTNumberLiteral._(5, 'int8', pos, mockParent)],
							inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('a 64-bit main number and a negative exponent should infer the possible types as dec64 and higher only', (): void => {
				testAnalyze('const x = 214748364723^e-2;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('x', pos, mockParent)],
							declaredTypes: [ASTTypeNumberDec64(pos, mockParent)],
							initialValues: [
								ASTBinaryExpression._(
									{
										operator: '^e',
										left: ASTNumberLiteral._(214748364723, 'int64', pos, mockParent),
										right: ASTUnaryExpression._(
											{
												before: true,
												operator: '-',
												operand: ASTNumberLiteral._(2, 'int8', pos, mockParent),
											},
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTTypeNumberDec64(pos, mockParent)],
						},
						pos,
						mockParent,
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
						identifiersList: [ASTIdentifier._('x', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveString(pos, mockParent)],
						initialValues: [ASTStringLiteral._('foo', pos, mockParent)],
						inferredTypes: [ASTTypePrimitiveString(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('a let with a specified type', (): void => {
			testAnalyze('let x: string;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveString(pos, mockParent)],
						initialValues: [],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('let x?: bool;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('x?', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveBool(pos, mockParent)],
						initialValues: [],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('a const assignment with a specified type', (): void => {
			testAnalyze('const x: string = "foo"', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('x', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveString(pos, mockParent)],
						initialValues: [ASTStringLiteral._('foo', pos, mockParent)],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('regex', (): void => {
			testAnalyze('const x = /[a-z]/;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('x', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveRegex(pos, mockParent)],
						initialValues: [ASTRegularExpression._({ pattern: '/[a-z]/', flags: [] }, pos, mockParent)],
						inferredTypes: [ASTTypePrimitiveRegex(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('const x: regex = /[0-9]*/g;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('x', pos, mockParent)],
						declaredTypes: [ASTTypePrimitiveRegex(pos, mockParent)],
						initialValues: [ASTRegularExpression._({ pattern: '/[0-9]*/', flags: ['g'] }, pos, mockParent)],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('path', (): void => {
			testAnalyze('const dir = @/path/to/dir/;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('dir', pos, mockParent)],
						declaredTypes: [ASTTypePrimitivePath(pos, mockParent)],
						initialValues: [
							ASTPath._(
								{
									absolute: true,
									path: '@/path/to/dir/',
									isDir: true,
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [ASTTypePrimitivePath(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('const dir = ./myDir/;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('dir', pos, mockParent)],
						declaredTypes: [ASTTypePrimitivePath(pos, mockParent)],
						initialValues: [ASTPath._({ absolute: false, path: './myDir/', isDir: true }, pos, mockParent)],
						inferredTypes: [ASTTypePrimitivePath(pos, mockParent)],
					},
					pos,
					mockParent,
				),
			]);

			testAnalyze('const file: path = @/path/to/file.joe;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('file', pos, mockParent)],
						declaredTypes: [ASTTypePrimitivePath(pos, mockParent)],
						initialValues: [
							ASTPath._(
								{
									absolute: true,
									path: '@/path/to/file.joe',
									isDir: false,
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('assign to another variable', () => {
			testAnalyze('const dir = foo;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('dir', pos, mockParent)],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('foo', pos, mockParent)],
						inferredTypes: [],
					},
					pos,
					mockParent,
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
							identifiersList: [ASTIdentifier._('myClass', pos, mockParent)],
							declaredTypes: [ASTIdentifier._('MyClass', pos, mockParent)],
							initialValues: [
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('MyClass', pos, mockParent),
												property: ASTIdentifier._('create', pos, mockParent),
											},
											pos,
											mockParent,
										),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('member expression', (): void => {
				testAnalyze('const myClass: MyPackage.MyClass = MyClass.create();', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('myClass', pos, mockParent)],
							declaredTypes: [
								ASTMemberExpression._(
									{
										object: ASTIdentifier._('MyPackage', pos, mockParent),
										property: ASTIdentifier._('MyClass', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							initialValues: [
								ASTCallExpression._(
									{
										callee: ASTMemberExpression._(
											{
												object: ASTIdentifier._('MyClass', pos, mockParent),
												property: ASTIdentifier._('create', pos, mockParent),
											},
											pos,
											mockParent,
										),
										typeArgs: [],
										args: [],
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [],
						},
						pos,
						mockParent,
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
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [],
							initialValues: [
								ASTTupleExpression._(
									[
										ASTNumberLiteral._(1, 'int8', pos, mockParent),
										ASTStringLiteral._('pizza', pos, mockParent),
										ASTNumberLiteral._(3.14, 'dec32', pos, mockParent),
									],
									pos,
									mockParent,
								),
							],
							inferredTypes: [
								ASTTupleShape._(
									[
										ASTTypeNumberInt8(pos, mockParent),
										ASTTypePrimitiveString(pos, mockParent),
										ASTTypeNumberDec32(pos, mockParent),
									],
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('empty tuple', () => {
				testAnalyze('const foo = <>;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [],
							initialValues: [ASTTupleExpression._([], pos, mockParent)],
							inferredTypes: [ASTTupleShape._([], pos, mockParent)],
						},
						pos,
						mockParent,
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
								identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
								declaredTypes: [],
								initialValues: [
									ASTTupleExpression._(
										[
											ASTTupleExpression._(
												[
													ASTNumberLiteral._(1, 'int8', pos, mockParent),
													ASTStringLiteral._('pizza', pos, mockParent),
													ASTNumberLiteral._(3.14, 'dec32', pos, mockParent),
												],
												pos,
												mockParent,
											),
											ASTBoolLiteral._(true, pos, mockParent),
											ASTPath._(
												{
													absolute: true,
													path: '@/some/file.joe',
													isDir: false,
												},
												pos,
												mockParent,
											),
											ASTRangeExpression._(
												{
													lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
													upper: ASTNumberLiteral._(3, 'int8', pos, mockParent),
												},
												pos,
												mockParent,
											),
											ASTTupleExpression._(
												[
													ASTNumberLiteral._(1, 'int8', pos, mockParent),
													ASTNumberLiteral._(2, 'int8', pos, mockParent),
													ASTStringLiteral._('fizz', pos, mockParent),
													ASTNumberLiteral._(4, 'int8', pos, mockParent),
													ASTStringLiteral._('buzz', pos, mockParent),
												],
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
								],
								inferredTypes: [
									ASTTupleShape._(
										[
											ASTTupleShape._(
												[
													ASTTypeNumberInt8(pos, mockParent),
													ASTTypePrimitiveString(pos, mockParent),
													ASTTypeNumberDec32(pos, mockParent),
												],
												pos,
												mockParent,
											),
											ASTTypePrimitiveBool(pos, mockParent),
											ASTTypePrimitivePath(pos, mockParent),
											ASTTypeRange._(pos, mockParent),
											ASTTupleShape._(
												[
													ASTTypeNumberInt8(pos, mockParent),
													ASTTypeNumberInt8(pos, mockParent),
													ASTTypePrimitiveString(pos, mockParent),
													ASTTypeNumberInt8(pos, mockParent),
													ASTTypePrimitiveString(pos, mockParent),
												],
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
								],
							},
							pos,
							mockParent,
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
								ASTNumberLiteral._(1, 'int8', pos, mockParent),
								ASTTernaryExpression._(
									{
										test: ASTTernaryCondition._(ASTIdentifier._('someCondition', pos, mockParent), pos, mockParent),
										consequent: ASTTernaryConsequent._(
											ASTStringLiteral._('burnt-orange', pos, mockParent),
											pos,
											mockParent,
										),
										alternate: ASTTernaryAlternate._(ASTStringLiteral._('', pos, mockParent), pos, mockParent),
									},
									pos,
									mockParent,
								),
								ASTBoolLiteral._(true, pos, mockParent),
							],
							pos,
							mockParent,
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
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [],
							initialValues: [
								ASTObjectExpression._(
									[
										ASTProperty._(
											ASTIdentifier._('tpl', pos, mockParent),
											ASTTupleExpression._([ASTNumberLiteral._(1, 'int8', pos, mockParent)], pos, mockParent),
											pos,
											mockParent,
										),
									],
									pos,
									mockParent,
								),
							],
							inferredTypes: [
								ASTObjectShape._(
									[
										ASTPropertyShape._(
											ASTIdentifier._('tpl', pos, mockParent),
											ASTTupleShape._([ASTTypeNumberInt8(pos, mockParent)], pos, mockParent),
											pos,
											mockParent,
										),
									],
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
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
								ASTBoolLiteral._(false, pos, mockParent),
								ASTBoolLiteral._(true, pos, mockParent),
								ASTBoolLiteral._(true, pos, mockParent),
								ASTBoolLiteral._(false, pos, mockParent),
							],
							type: ASTTypePrimitiveBool(pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('numbers', () => {
				testAnalyze('[1, -2, 3_456, 1_2_3]', [
					ASTArrayExpression._(
						{
							items: [
								ASTNumberLiteral._(1, 'int8', pos, mockParent),
								ASTUnaryExpression._(
									{
										before: true,
										operator: '-',
										operand: ASTNumberLiteral._(2, 'int8', pos, mockParent),
									},
									pos,
									mockParent,
								),
								ASTNumberLiteral._(3456, 'int16', pos, mockParent),
								ASTNumberLiteral._(123, 'int8', pos, mockParent),
							],
							type: ASTTypeNumberInt16(pos, mockParent),
						},
						pos,
						mockParent,
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
									pos,
									mockParent,
								),
								ASTPath._(
									{
										absolute: true,
										path: '@/another/file.joe',
										isDir: false,
									},
									pos,
									mockParent,
								),
							],
							type: ASTTypePrimitivePath(pos, mockParent),
						},
						pos,
						mockParent,
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
									pos,
									mockParent,
								),
								ASTRegularExpression._(
									{
										pattern: '/[0-9]/',
										flags: ['g'],
									},
									pos,
									mockParent,
								),
								ASTRegularExpression._(
									{
										pattern: '/d/',
										flags: [],
									},
									pos,
									mockParent,
								),
							],
							type: ASTTypePrimitiveRegex(pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('strings', (): void => {
				testAnalyze('[\'foo\', "bar"]', [
					ASTArrayExpression._(
						{
							items: [ASTStringLiteral._('foo', pos, mockParent), ASTStringLiteral._('bar', pos, mockParent)],
							type: ASTTypePrimitiveString(pos, mockParent),
						},
						pos,
						mockParent,
					),
				]);
			});

			it('tuples', () => {
				testAnalyze("const foo: <string, uint64, bool>[] = [<'foo', 314, false>, <'bar', 900, true>];", [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [
								ASTArrayOf._(
									ASTTupleShape._(
										[
											ASTTypePrimitiveString(pos, mockParent),
											ASTTypeNumber._('uint64', pos, mockParent),
											ASTTypePrimitiveBool(pos, mockParent),
										],
										pos,
										mockParent,
									),
									pos,
									mockParent,
								),
							],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [
											ASTTupleExpression._(
												[
													ASTStringLiteral._('foo', pos, mockParent),
													ASTNumberLiteral._(314, 'uint64', pos, mockParent),
													ASTBoolLiteral._(false, pos, mockParent),
												],
												pos,
												mockParent,
											),
											ASTTupleExpression._(
												[
													ASTStringLiteral._('bar', pos, mockParent),
													ASTNumberLiteral._(900, 'uint64', pos, mockParent),
													ASTBoolLiteral._(true, pos, mockParent),
												],
												pos,
												mockParent,
											),
										],
										type: ASTTupleShape._(
											[
												ASTTypePrimitiveString(pos, mockParent),
												ASTTypeNumber._('uint64', pos, mockParent),
												ASTTypePrimitiveBool(pos, mockParent),
											],
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('pojos', () => {
				testAnalyze("const foo: {a: uint32, b: string}[] = [{a: 4, b: 'c'}];", [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [
								ASTArrayOf._(
									ASTObjectShape._(
										[
											ASTPropertyShape._(
												ASTIdentifier._('a', pos, mockParent),
												ASTTypeNumberUint32(pos, mockParent),
												pos,
												mockParent,
											),
											ASTPropertyShape._(
												ASTIdentifier._('b', pos, mockParent),
												ASTTypePrimitiveString(pos, mockParent),
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
									pos,
									mockParent,
								),
							],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [
											ASTObjectExpression._(
												[
													ASTProperty._(
														ASTIdentifier._('a', pos, mockParent),
														ASTNumberLiteral._(4, 'int8', pos, mockParent),
														pos,
														mockParent,
													),
													ASTProperty._(
														ASTIdentifier._('b', pos, mockParent),
														ASTStringLiteral._('c', pos, mockParent),
														pos,
														mockParent,
													),
												],
												pos,
												mockParent,
											),
										],
										type: ASTObjectShape._(
											[
												ASTPropertyShape._(
													ASTIdentifier._('a', pos, mockParent),
													ASTTypeNumberUint32(pos, mockParent),
													pos,
													mockParent,
												),
												ASTPropertyShape._(
													ASTIdentifier._('b', pos, mockParent),
													ASTTypePrimitiveString(pos, mockParent),
													pos,
													mockParent,
												),
											],
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('assignments', () => {
				testAnalyze('const int32s = [1, 2];', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('int32s', pos, mockParent)],
							declaredTypes: [],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [
											ASTNumberLiteral._(1, 'int8', pos, mockParent),
											ASTNumberLiteral._(2, 'int8', pos, mockParent),
										],
										type: ASTTypeNumberInt8(pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTArrayOf._(ASTTypeNumberInt8(pos, mockParent), pos, mockParent)],
						},
						pos,
						mockParent,
					),
				]);

				testAnalyze('let myArray: bool[] = [];', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('myArray', pos, mockParent)],
							declaredTypes: [ASTArrayOf._(ASTTypePrimitiveBool(pos, mockParent), pos, mockParent)],
							initialValues: [
								ASTArrayExpression._(
									{
										items: [],
										type: ASTTypePrimitiveBool(pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [],
						},
						pos,
						mockParent,
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
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
							initialValues: [
								ASTTernaryExpression._(
									{
										test: ASTTernaryCondition._(ASTIdentifier._('bar', pos, mockParent), pos, mockParent),
										consequent: ASTTernaryConsequent._(ASTNumberLiteral._(1, 'int8', pos, mockParent), pos, mockParent),
										alternate: ASTTernaryAlternate._(ASTNumberLiteral._(2, 'int8', pos, mockParent), pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('should work when nested', () => {
				testAnalyze('const foo = bar ? (baz ? 3 : 4) : 2;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [ASTTypeNumberInt8(pos, mockParent)],
							initialValues: [
								ASTTernaryExpression._(
									{
										test: ASTTernaryCondition._(ASTIdentifier._('bar', pos, mockParent), pos, mockParent),
										consequent: ASTTernaryConsequent._(
											ASTTernaryExpression._(
												{
													test: ASTTernaryCondition._(ASTIdentifier._('baz', pos, mockParent), pos, mockParent),
													consequent: ASTTernaryConsequent._(
														ASTNumberLiteral._(3, 'int8', pos, mockParent),
														pos,
														mockParent,
													),
													alternate: ASTTernaryAlternate._(
														ASTNumberLiteral._(4, 'int8', pos, mockParent),
														pos,
														mockParent,
													),
												},
												pos,
												mockParent,
											),
											pos,
											mockParent,
										),
										alternate: ASTTernaryAlternate._(ASTNumberLiteral._(2, 'int8', pos, mockParent), pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTTypeNumberInt8(pos, mockParent)],
						},
						pos,
						mockParent,
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
										test: ASTTernaryCondition._(ASTIdentifier._('foo', pos, mockParent), pos, mockParent),
										consequent: ASTTernaryConsequent._(ASTNumberLiteral._(1, 'int8', pos, mockParent), pos, mockParent),
										alternate: ASTTernaryAlternate._(ASTNumberLiteral._(2, 'int8', pos, mockParent), pos, mockParent),
									},
									pos,
									mockParent,
								),
								ASTNumberLiteral._(3, 'int8', pos, mockParent),
							],
							type: ASTTypeNumberInt8(pos, mockParent),
						},
						pos,
						mockParent,
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
								name: ASTIdentifier._('foo', pos, mockParent),
								typeParams: [],
								params: [],
								returnTypes: [ASTTypePrimitiveBool(pos, mockParent), ASTTypeNumber._('uint64', pos, mockParent)],
								body: ASTBlockStatement._(
									[
										ASTReturnStatement._(
											[
												ASTTernaryExpression._(
													{
														test: ASTTernaryCondition._(
															ASTIdentifier._('bar', pos, mockParent),
															pos,
															mockParent,
														),
														consequent: ASTTernaryConsequent._(
															ASTBoolLiteral._(true, pos, mockParent),
															pos,
															mockParent,
														),
														alternate: ASTTernaryAlternate._(
															ASTBoolLiteral._(false, pos, mockParent),
															pos,
															mockParent,
														),
													},
													pos,
													mockParent,
												),
												ASTNumberLiteral._(3, 'int8', pos, mockParent),
											],
											pos,
											mockParent,
										),
									],
									pos,
									mockParent,
								),
							},
							pos,
							mockParent,
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
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [],
							initialValues: [
								ASTObjectExpression._(
									[
										ASTProperty._(
											ASTIdentifier._('a', pos, mockParent),
											ASTNumberLiteral._(1, 'int8', pos, mockParent),
											pos,
											mockParent,
										),
										ASTProperty._(
											ASTIdentifier._('b', pos, mockParent),
											ASTStringLiteral._('pizza', pos, mockParent),
											pos,
											mockParent,
										),
										ASTProperty._(
											ASTIdentifier._('c', pos, mockParent),
											ASTNumberLiteral._(3.14, 'dec32', pos, mockParent),
											pos,
											mockParent,
										),
										ASTProperty._(
											ASTIdentifier._('d', pos, mockParent),
											ASTArrayExpression._(
												{
													items: [
														ASTNumberLiteral._(10, 'int8', pos, mockParent),
														ASTNumberLiteral._(11, 'int8', pos, mockParent),
													],
													type: ASTTypeNumberInt8(pos, mockParent),
												},
												pos,
												mockParent,
											),
											pos,
											mockParent,
										),
									],
									pos,
									mockParent,
								),
							],
							inferredTypes: [
								ASTObjectShape._(
									[
										ASTPropertyShape._(
											ASTIdentifier._('a', pos, mockParent),
											ASTTypeNumberInt8(pos, mockParent),
											pos,
											mockParent,
										),
										ASTPropertyShape._(
											ASTIdentifier._('b', pos, mockParent),
											ASTTypePrimitiveString(pos, mockParent),
											pos,
											mockParent,
										),
										ASTPropertyShape._(
											ASTIdentifier._('c', pos, mockParent),
											ASTTypeNumberDec32(pos, mockParent),
											pos,
											mockParent,
										),
										ASTPropertyShape._(
											ASTIdentifier._('d', pos, mockParent),
											ASTArrayOf._(ASTTypeNumberInt8(pos, mockParent), pos, mockParent),
											pos,
											mockParent,
										),
									],
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
					),
				]);
			});

			it('empty pojo', () => {
				testAnalyze('const foo = {};', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
							declaredTypes: [],
							initialValues: [ASTObjectExpression._([], pos, mockParent)],
							inferredTypes: [ASTObjectShape._([], pos, mockParent)],
						},
						pos,
						mockParent,
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
								identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
								declaredTypes: [],
								initialValues: [
									ASTObjectExpression._(
										[
											ASTProperty._(
												ASTIdentifier._('obj', pos, mockParent),
												ASTObjectExpression._(
													[
														ASTProperty._(
															ASTIdentifier._('a', pos, mockParent),
															ASTNumberLiteral._(1, 'int8', pos, mockParent),
															pos,
															mockParent,
														),
														ASTProperty._(
															ASTIdentifier._('b', pos, mockParent),
															ASTStringLiteral._('pizza', pos, mockParent),
															pos,
															mockParent,
														),
														ASTProperty._(
															ASTIdentifier._('pi', pos, mockParent),
															ASTObjectExpression._(
																[
																	ASTProperty._(
																		ASTIdentifier._('two_digits', pos, mockParent),
																		ASTNumberLiteral._(3.14, 'dec32', pos, mockParent),
																		pos,
																		mockParent,
																	),
																],
																pos,
																mockParent,
															),
															pos,
															mockParent,
														),
													],
													pos,
													mockParent,
												),
												pos,
												mockParent,
											),
											ASTProperty._(
												ASTIdentifier._('bol', pos, mockParent),
												ASTBoolLiteral._(true, pos, mockParent),
												pos,
												mockParent,
											),
											ASTProperty._(
												ASTIdentifier._('pth', pos, mockParent),
												ASTPath._(
													{
														absolute: true,
														path: '@/some/file.joe',
														isDir: false,
													},
													pos,
													mockParent,
												),
												pos,
												mockParent,
											),
											ASTProperty._(
												ASTIdentifier._('rng', pos, mockParent),
												ASTObjectExpression._(
													[
														ASTProperty._(
															ASTIdentifier._('rng', pos, mockParent),
															ASTRangeExpression._(
																{
																	lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
																	upper: ASTNumberLiteral._(3, 'int8', pos, mockParent),
																},
																pos,
																mockParent,
															),
															pos,
															mockParent,
														),
													],
													pos,
													mockParent,
												),
												pos,
												mockParent,
											),
											ASTProperty._(
												ASTIdentifier._('tpl', pos, mockParent),
												ASTTupleExpression._(
													[
														ASTNumberLiteral._(1, 'int8', pos, mockParent),
														ASTNumberLiteral._(2, 'int8', pos, mockParent),
														ASTStringLiteral._('fizz', pos, mockParent),
														ASTNumberLiteral._(4, 'int8', pos, mockParent),
														ASTStringLiteral._('buzz', pos, mockParent),
													],
													pos,
													mockParent,
												),
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
								],
								inferredTypes: [
									ASTObjectShape._(
										[
											ASTPropertyShape._(
												ASTIdentifier._('obj', pos, mockParent),
												ASTObjectShape._(
													[
														ASTPropertyShape._(
															ASTIdentifier._('a', pos, mockParent),
															ASTTypeNumberInt8(pos, mockParent),
															pos,
															mockParent,
														),
														ASTPropertyShape._(
															ASTIdentifier._('b', pos, mockParent),
															ASTTypePrimitiveString(pos, mockParent),
															pos,
															mockParent,
														),
														ASTPropertyShape._(
															ASTIdentifier._('pi', pos, mockParent),
															ASTObjectShape._(
																[
																	ASTPropertyShape._(
																		ASTIdentifier._('two_digits', pos, mockParent),
																		ASTTypeNumberDec32(pos, mockParent),
																		pos,
																		mockParent,
																	),
																],
																pos,
																mockParent,
															),
															pos,
															mockParent,
														),
													],
													pos,
													mockParent,
												),
												pos,
												mockParent,
											),
											ASTPropertyShape._(
												ASTIdentifier._('bol', pos, mockParent),
												ASTTypePrimitiveBool(pos, mockParent),
												pos,
												mockParent,
											),
											ASTPropertyShape._(
												ASTIdentifier._('pth', pos, mockParent),
												ASTTypePrimitivePath(pos, mockParent),
												pos,
												mockParent,
											),
											ASTPropertyShape._(
												ASTIdentifier._('rng', pos, mockParent),
												ASTObjectShape._(
													[
														ASTPropertyShape._(
															ASTIdentifier._('rng', pos, mockParent),
															ASTTypeRange._(pos, mockParent),
															pos,
															mockParent,
														),
													],
													pos,
													mockParent,
												),
												pos,
												mockParent,
											),
											ASTPropertyShape._(
												ASTIdentifier._('tpl', pos, mockParent),
												ASTTupleShape._(
													[
														ASTTypeNumberInt8(pos, mockParent),
														ASTTypeNumberInt8(pos, mockParent),
														ASTTypePrimitiveString(pos, mockParent),
														ASTTypeNumberInt8(pos, mockParent),
														ASTTypePrimitiveString(pos, mockParent),
													],
													pos,
													mockParent,
												),
												pos,
												mockParent,
											),
										],
										pos,
										mockParent,
									),
								],
							},
							pos,
							mockParent,
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
									ASTIdentifier._('a', pos, mockParent),
									ASTNumberLiteral._(1, 'int8', pos, mockParent),
									pos,
									mockParent,
								),
								ASTProperty._(
									ASTIdentifier._('b', pos, mockParent),
									ASTTernaryExpression._(
										{
											test: ASTTernaryCondition._(ASTIdentifier._('someCondition', pos, mockParent), pos, mockParent),
											consequent: ASTTernaryConsequent._(
												ASTStringLiteral._('burnt-orange', pos, mockParent),
												pos,
												mockParent,
											),
											alternate: ASTTernaryAlternate._(ASTStringLiteral._('', pos, mockParent), pos, mockParent),
										},
										pos,
										mockParent,
									),
									pos,
									mockParent,
								),
								ASTProperty._(
									ASTIdentifier._('c', pos, mockParent),
									ASTBoolLiteral._(true, pos, mockParent),
									pos,
									mockParent,
								),
							],
							pos,
							mockParent,
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
									ASTIdentifier._('a', pos, mockParent),
									ASTArrayExpression._(
										{
											items: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
											type: ASTTypeNumberInt8(pos, mockParent),
										},
										pos,
										mockParent,
									),
									pos,
									mockParent,
								),
							],
							pos,
							mockParent,
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
									ASTIdentifier._('a', pos, mockParent),
									ASTArrayExpression._(
										{
											items: [
												ASTMemberExpression._(
													{
														object: ASTIdentifier._('foo', pos, mockParent),
														property: ASTNumberLiteral._(1, 'int8', pos, mockParent),
													},
													pos,
													mockParent,
												),
											],
											type: ASTTypeNumberInt8(pos, mockParent),
										},
										pos,
										mockParent,
									),
									pos,
									mockParent,
								),
							],
							pos,
							mockParent,
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
						identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
						declaredTypes: [],
						initialValues: [ASTThisKeyword._(pos, mockParent)],
						inferredTypes: [],
					},
					pos,
					mockParent,
				),
			]);
		});

		it('should assign a range', () => {
			testAnalyze('const foo = 1 .. 3;', [
				ASTVariableDeclaration._(
					{
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo', pos, mockParent)],
						declaredTypes: [ASTTypeRange._(pos, mockParent)],
						initialValues: [
							ASTRangeExpression._(
								{
									lower: ASTNumberLiteral._(1, 'int8', pos, mockParent),
									upper: ASTNumberLiteral._(3, 'int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						inferredTypes: [ASTTypeRange._(pos, mockParent)],
					},
					pos,
					mockParent,
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
							expression: ASTIdentifier._('someNumber', pos, mockParent),
							cases: [
								ASTWhenCase._(
									{
										values: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
										consequent: ASTStringLiteral._('small', pos, mockParent),
									},
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
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
							expression: ASTIdentifier._('someNumber', pos, mockParent),
							cases: [
								ASTWhenCase._(
									{
										values: [ASTNumberLiteral._(1, 'int8', pos, mockParent)],
										consequent: ASTBlockStatement._(
											[
												ASTCallExpression._(
													{
														callee: ASTIdentifier._('doThing1', pos, mockParent),
														typeArgs: [],
														args: [],
													},
													pos,
													mockParent,
												),
												ASTCallExpression._(
													{
														callee: ASTIdentifier._('doThing2', pos, mockParent),
														typeArgs: [],
														args: [],
													},
													pos,
													mockParent,
												),
												ASTReturnStatement._([ASTStringLiteral._('large', pos, mockParent)], pos, mockParent),
											],
											pos,
											mockParent,
										),
									},
									pos,
									mockParent,
								),
							],
						},
						pos,
						mockParent,
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
							name: ASTIdentifier._('doSomethingElse', pos, mockParent),
							typeParams: [],
							params: [],
							returnTypes: [ASTTypePrimitiveString(pos, mockParent)],
							body: ASTBlockStatement._(
								[ASTReturnStatement._([ASTStringLiteral._('', pos, mockParent)], pos, mockParent)],
								pos,
								mockParent,
							),
						},
						pos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('size', pos, mockParent)],
							declaredTypes: [ASTTypePrimitiveString(pos, mockParent)],
							initialValues: [
								ASTWhenExpression._(
									{
										expression: ASTIdentifier._('someNumber', pos, mockParent),
										cases: [
											ASTWhenCase._(
												{
													values: [
														ASTNumberLiteral._(1, 'int8', pos, mockParent),
														ASTNumberLiteral._(2, 'int8', pos, mockParent),
													],
													consequent: ASTStringLiteral._('small', pos, mockParent),
												},
												pos,
												mockParent,
											),
											ASTWhenCase._(
												{
													values: [
														ASTRangeExpression._(
															{
																lower: ASTNumberLiteral._(3, 'int8', pos, mockParent),
																upper: ASTNumberLiteral._(10, 'int8', pos, mockParent),
															},
															pos,
															mockParent,
														),
													],
													consequent: ASTStringLiteral._('medium', pos, mockParent),
												},
												pos,
												mockParent,
											),
											ASTWhenCase._(
												{
													values: [ASTNumberLiteral._(11, 'int8', pos, mockParent)],
													consequent: ASTBlockStatement._(
														[
															ASTCallExpression._(
																{
																	callee: ASTIdentifier._('doThing1', pos, mockParent),
																	typeArgs: [],
																	args: [],
																},
																pos,
																mockParent,
															),
															ASTCallExpression._(
																{
																	callee: ASTIdentifier._('doThing2', pos, mockParent),
																	typeArgs: [],
																	args: [],
																},
																pos,
																mockParent,
															),
															ASTReturnStatement._(
																[ASTStringLiteral._('large', pos, mockParent)],
																pos,
																mockParent,
															),
														],
														pos,
														mockParent,
													),
												},
												pos,
												mockParent,
											),
											ASTWhenCase._(
												{
													values: [ASTNumberLiteral._(12, 'int8', pos, mockParent)],
													consequent: ASTCallExpression._(
														{
															callee: ASTIdentifier._('doSomethingElse', pos, mockParent),
															typeArgs: [],
															args: [],
														},
														pos,
														mockParent,
													),
												},
												pos,
												mockParent,
											),
											ASTWhenCase._(
												{
													values: [ASTRestElement._(pos, mockParent)],
													consequent: ASTStringLiteral._('off the charts', pos, mockParent),
												},
												pos,
												mockParent,
											),
										],
									},
									pos,
									mockParent,
								),
							],
							inferredTypes: [ASTTypePrimitiveString(pos, mockParent)],
						},
						pos,
						mockParent,
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
								callee: ASTIdentifier._('foo', pos, mockParent),
								typeArgs: [],
								args: [],
							},
							pos,
							mockParent,
						),
						upper: ASTNumberLiteral._(3, 'int8', pos, mockParent),
					},
					pos,
					mockParent,
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
									left: ASTNumberLiteral._(1, 'int8', pos, mockParent),
									right: ASTNumberLiteral._(2, 'int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
							ASTBinaryExpression._(
								{
									operator: '>',
									left: ASTNumberLiteral._(4, 'int8', pos, mockParent),
									right: ASTNumberLiteral._(3, 'int8', pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						type: ASTTypePrimitiveBool(pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});

		it('"f foo(a: int16 = 1_234, b = true) {}" should correctly see the underscore as a separator', () => {
			testAnalyze('f foo(a: int16 = 1_234, b = true) {}', [
				ASTFunctionDeclaration._(
					{
						modifiers: [],
						name: ASTIdentifier._('foo', pos, mockParent),
						typeParams: [],
						params: [
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('a', pos, mockParent),
									type: ASTTypeNumber._('int16', pos, mockParent),
									defaultValue: ASTNumberLiteral._(1234, 'int16', pos, mockParent),
								},
								pos,
								mockParent,
							),
							ASTParameter._(
								{
									modifiers: [],
									isRest: false,
									name: ASTIdentifier._('b', pos, mockParent),
									type: ASTTypePrimitiveBool(pos, mockParent),
									defaultValue: ASTBoolLiteral._(true, pos, mockParent),
								},
								pos,
								mockParent,
							),
						],
						returnTypes: [],
						body: ASTBlockStatement._([], pos, mockParent),
					},
					pos,
					mockParent,
				),
			]);
		});
	});

	describe('error scenarios', (): void => {
		it.skip('array of ints and decs do not mix', () => {
			const result = analyze('[1, -2, 3_456, 3^e-2, 3.14, 1_2_3]', true, false);
			// use assert instead of expect, since we need TS to narrow the type

			assert(result.isError(), `Expected: "error", Received: "ok"`);
			expect(result.error.message).toBe(`Unexpected end of program; expecting`);
		});
	});
});
