import _ from 'lodash';
import { Node } from '../parser/types';
import { allASTTypesEqual } from '../shared/arrays';
import Context from '../shared/context';
import { EqualityChecks } from '../shared/equality';
import { NumberSize, compareSizeInfos, max, numberSizeDetails } from '../shared/numbers/sizes';
import { filterASTTypeNumbersWithBitCountsLowerThan, getLowestBitCountOf } from '../shared/numbers/utils';
import { CreateResultFrom, Result, ResultError, ResultOk, Results, error, ok } from '../shared/result';
import {
	AST,
	ASTArrayExpression,
	ASTArrayOf,
	ASTBinaryExpression,
	ASTBlockStatement,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTFunctionDeclaration,
	ASTFunctionSignature,
	ASTIdentifier,
	ASTMemberExpression,
	ASTNumberLiteral,
	ASTObjectExpression,
	ASTObjectShape,
	ASTPath,
	ASTPostfixIfStatement,
	ASTPropertyShape,
	ASTRangeExpression,
	ASTRegularExpression,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTTernaryExpression,
	ASTThisKeyword,
	ASTTupleExpression,
	ASTTupleShape,
	ASTType,
	ASTTypeInstantiationExpression,
	ASTTypeList,
	ASTTypeNumber,
	ASTTypePrimitiveBool,
	ASTTypePrimitivePath,
	ASTTypePrimitiveRegex,
	ASTTypePrimitiveString,
	ASTTypeRange,
	ASTUnaryExpression,
	ASTWhenExpression,
	AssignableASTs,
	ExpressionASTs,
	NumberSizesDecimalASTs,
	astUniqueness,
} from './asts';
import AnalysisError from './error';
import SemanticError from './semanticError';
import {
	ClassSym,
	EnumSym,
	FuncSym,
	InterfaceSym,
	ParamSym,
	SymbolInfo,
	SymbolTable,
	VarSym,
	kindToSymMap,
	symbolKinds,
} from './symbolTable';

class Helpers {
	/**
	 * This function attempts to infer a type and if successful, run the assigner callback.
	 *
	 * Runs the assigner callback if there is an inferred type, otherwise returns an error.
	 *
	 * @see {@link inferType()}
	 */
	public static assignInferredType(
		valueAST: AssignableASTs,
		valueNode: Node,
		assigner: (type: ASTType) => void,
		ctx: Context,
	): Result<ASTType, SemanticError> {
		const typeResult = Helpers.inferType(valueAST, ctx);

		if (typeResult.isOk()) {
			assigner(typeResult.value);
		}

		return typeResult;
	}

	/**
	 * Attempts to infer the ASTType from an ASTAssignable.
	 * Returns an error if unable to infer anything.
	 */
	public static inferType(expr: AssignableASTs, ctx: Context): Result<ASTType, SemanticError> {
		const errorCouldNotInfer = (ofThis: string): ResultError<SemanticError, ASTType> => {
			return error(SemanticError.CouldNotInferType(ofThis, expr, ctx));
		};

		switch (expr.constructor) {
			case ASTArrayExpression: {
				const aryExpr = expr as ASTArrayExpression<ExpressionASTs>;

				// if the array is empty, we can't infer anything
				if (aryExpr.items.length === 0) {
					return errorCouldNotInfer('array');
				}

				const typeResult = Helpers.inferType(aryExpr.items[0], ctx);

				// map the child type maybe into a Maybe<ASTArrayOf>
				// if we can infer the type of the child, we can infer the type of the array
				return typeResult.mapValue((type) => ASTArrayOf._(type, expr.pos, aryExpr)) as Result<ASTType, SemanticError>;
			}
			case ASTBinaryExpression:
				{
					const operator = (expr as ASTBinaryExpression<ExpressionASTs, ExpressionASTs>).operator;
					switch (operator) {
						case '==':
						case '!=':
						case '>':
						case '>=':
						case '<':
						case '<=':
						case '&&':
						case '||':
							return ok(ASTTypePrimitiveBool(expr.pos, expr));
							break;
						case '+':
						case '-':
						case '*':
						case '/':
						case '%':
						case '^e':
							{
								const binaryExpr = expr as ASTBinaryExpression<
									ASTNumberLiteral | ASTUnaryExpression<ASTNumberLiteral>,
									ASTNumberLiteral | ASTUnaryExpression<ASTNumberLiteral>
								>;

								// each side could either be an ASTNumberLiteral or an ASTUnaryExpression
								const lhsType = Helpers.inferType(binaryExpr.left, ctx);
								if (!lhsType.isOk()) {
									return errorCouldNotInfer("BinaryExpression's left-hand side");
								}
								const rhsType = Helpers.inferType(binaryExpr.right, ctx);
								if (!rhsType.isOk()) {
									return errorCouldNotInfer("BinaryExpression's right-hand side");
								}

								// ensure all are ASTTypeNumbers and get sizes
								// TODO deal with ASTUnaryExpressions
								const lhsSize: NumberSize = (lhsType.value as ASTTypeNumber).size;
								const rhsSize = (rhsType.value as ASTTypeNumber).size;

								// for exponent
								if (operator === '^e') {
									// if the right side is a negative exponent, the number size must be a decimal
									if (binaryExpr.right.constructor === ASTUnaryExpression && binaryExpr.right.operator === '-') {
										const relevantSizes = filterASTTypeNumbersWithBitCountsLowerThan(
											NumberSizesDecimalASTs.map((ns) => ns(expr.pos, binaryExpr)),
											getLowestBitCountOf(lhsSize),
										);

										// return decimal number sizes that are at least as big as the left number's lowest bit count
										return CreateResultFrom.possiblyUndefined(relevantSizes[0], errorCouldNotInfer('number').error);
									}

									// take the left number size
									return CreateResultFrom.possiblyUndefined(
										ASTTypeNumber._(lhsSize, expr.pos, binaryExpr),
										errorCouldNotInfer('number').error,
									);
								}

								// or if both numbers are the same size, take that size
								if (_.isEqual(lhsSize, rhsSize)) {
									return CreateResultFrom.possiblyUndefined(
										ASTTypeNumber._(lhsSize, expr.pos, binaryExpr),
										errorCouldNotInfer('number').error,
									);
								}

								return ok(ASTTypeNumber._(max(lhsSize, rhsSize), expr.pos, binaryExpr));
							}
							break;
					}

					return errorCouldNotInfer(`binary operator "${operator}"`);
				}
				break;
			case ASTBlockStatement: {
				const blockStmt = expr as ASTBlockStatement;

				const returnsExpressions = Helpers.getReturnsExpressionsFromBlockStatement(blockStmt, undefined);

				// get types from return statements
				const typeResultsByReturn = returnsExpressions.map((oneReturn) => {
					const exprs = oneReturn.value;
					return exprs.map((expr) => Helpers.inferType(expr, ctx));
				});
				if (typeResultsByReturn.some((typeResults) => !Results.allOk(typeResults))) {
					return errorCouldNotInfer('BlockStatement');
				}

				// now we know they're all ok
				const typesByReturn = (typeResultsByReturn as ResultOk<ASTType>[][]).map((typeResults) => {
					return typeResults.map((typeResult) => typeResult.value);
				});

				/**
				 * get unique types from return statements, so for each return statement, map
				 * the types to their uniqueni (uniquenesses), and then string them together.
				 * This ensures that if we have two return statements where at least one type
				 * differs, we'll get at least 2 unique strings.
				 */
				const uniques = _.uniqBy(typesByReturn, (types) => types.map((r) => astUniqueness(r)).join());

				// if there's only one unique set of types across the return statements, then we can infer the type of the block
				if (uniques.length === 1) {
					return ok(ASTTypeList._(typesByReturn[0], blockStmt.pos));
				}

				return errorCouldNotInfer('BlockStatement');
			}
			case ASTBoolLiteral:
				return ok(ASTTypePrimitiveBool(expr.pos, expr as ASTBlockStatement));
			case ASTCallExpression: {
				const callExpr = expr as ASTCallExpression;
				switch (callExpr.callee.constructor) {
					// TODO ASTCallExpression | ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression
					case ASTIdentifier:
						return Helpers.inferType(callExpr.callee, ctx);
					case ASTMemberExpression:
						return Helpers.inferType(callExpr.callee, ctx);
				}

				// // look up the callee in the symbol table
				// const lookupResult = symbolTable.lookup(callExpr.callee.);
				return errorCouldNotInfer(`CallExpression using ${callExpr.callee.constructor.name}`);
			}
			case ASTFunctionDeclaration: {
				const func = expr as ASTFunctionDeclaration;

				return ok(
					ASTFunctionSignature._(
						{
							typeParams: func.typeParams,
							params: func.params,
							returnTypes: func.returnTypes,
						},
						expr.pos,
						expr,
					),
				);
			}
			case ASTIdentifier: {
				const identifier = expr as ASTIdentifier;

				// some identifiers are keywords in certain contexts
				if (identifier.name === 'parent') {
					// find the nearest class
					const classNode = SymbolTable.findNearestClass();
					// if we're not in a class, it's a normal identifier and flow continues
					if (classNode.has() && classNode.value.parent.has()) {
						// get the class's extends
						const maybeSymbolInfo = classNode.value.parent.value.table.contains(classNode.value.name, ['class']);
						if (maybeSymbolInfo.has()) {
							const classSym = maybeSymbolInfo.value;
							const _extends = classSym._extends; // this is a ASTTypeList<ASTTypeExceptPrimitive>
							switch (_extends.items.length) {
								case 0:
									return error(SemanticError.ParentUsedInClassWithoutParent(identifier, ctx));
								case 1:
									return Helpers.inferType(_extends.items[0], ctx);
								default:
									return ok(_extends);
							}
						}
					}
				}

				// otherwise, look up the identifier in the symbol table
				const lookupResult = SymbolTable.lookup(identifier.fqn, symbolKinds).map((value: SymbolInfo) => {
					const mapType: {
						[key in keyof kindToSymMap]: (value: kindToSymMap[key]) => Result<ASTType, SemanticError>;
					} = {
						class: (value: ClassSym): Result<ASTType, SemanticError> => {
							return ok(ASTIdentifier._(identifier.name, value.pos, identifier)); // create a type from the name
						},
						enum: (value: EnumSym): Result<ASTType, SemanticError> => {
							return ok(ASTIdentifier._(identifier.name, value.pos, identifier)); // create a type from the name
						},
						function: (value: FuncSym): Result<ASTType, SemanticError> => {
							return ok(
								ASTFunctionSignature._(
									{
										typeParams: value.typeParams,
										params: value.params,
										returnTypes: value.returnTypes,
									},
									value.pos,
									identifier,
								),
							); // create a type from the signature
							// if the function has declared return types, return those
							switch (value.returnTypes.items.length) {
								case 0:
									return error(SemanticError.CannotReturnAReturnlessFunction(expr.parent as ASTReturnStatement, ctx));
								case 1:
									return ok(value.returnTypes.items[0]);
								default:
									// TODO handle multiple return types
									return errorCouldNotInfer('TODO: inferType() for a function with multiple return types');
							}
						},
						interface: (value: InterfaceSym): Result<ASTType, SemanticError> => {
							return ok(ASTIdentifier._(identifier.name, value.pos, identifier)); // create a type from the name
						},
						parameter: (value: ParamSym): Result<ASTType, SemanticError> => {
							// if the parameter has a declared type, return that
							if (value.type) {
								return ok(value.type);
							}

							// if the parameter has a default value, infer the type of the value
							if (value.defaultValue) {
								return Helpers.inferType(value.defaultValue, ctx);
							}

							// otherwise, we can't infer anything
							return errorCouldNotInfer('parameter');
						},
						variable: (value: VarSym): Result<ASTType, SemanticError> => {
							// if the variable has a declared type, return that
							if (value.type) {
								return ok(value.type);
							}

							// if the variable has a value, infer the type of the value
							if (value.value) {
								return Helpers.inferType(value.value, ctx);
							}

							// otherwise, we can't infer anything
							return errorCouldNotInfer('variable');
						},
					};

					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-ignore
					return mapType[value.kind](value);
				});
				if (!lookupResult.has()) {
					return error(SemanticError.UnrecognizedIdentifier(identifier.name, expr, ctx));
				}
				return lookupResult.value;
				break;
			}
			case ASTMemberExpression: {
				const memberExpr = expr as ASTMemberExpression;

				/**
				 * First, check the AST of the object and resolve it to an ASTType, potentially recursively.
				 *
				 * Second, resolve to one of the following general ASTs, which can be generic:
				 * - Array
				 * - Class
				 * - Enum
				 * - Interface
				 * - Object
				 * - String
				 * - Tuple
				 *
				 * Third, check the AST of the property and resolve it to an ASTType, potentially recursively.
				 *
				 * Fourth, resolve to one of the following general ASTs:
				 * - Identifier(can be generic)
				 * - Literal
				 * - Range
				 * - <=>
				 *
				 * Lastly, based on the object's AST, different properties will be valid while others won't.
				 * - Array(number or range)
				 * - Class(string property or method, can be generic)
				 * - Enum(string value)
				 * - Interface(string property or method, can be generic)
				 * - Object(string property)
				 * - String(number or range)
				 * - Tuple(number or range)
				 */

				// First: get object's type
				let objectTypeResult = Helpers.inferType(memberExpr.object, ctx);
				if (objectTypeResult.isError()) {
					return objectTypeResult;
				}
				// const objectType = when(objectTypeResult.value.constructor.name, {
				// 	ASTCallExpression: () => {
				// 		return Helpers.inferType(objectTypeResult.value, ctx);
				// 	},
				// 	ASTIdentifier: () => {
				// 		return Helpers.inferType(objectTypeResult.value, ctx);
				// 	},
				// 	ASTMemberExpression: () => {
				// 		return Helpers.inferType(objectTypeResult.value, ctx);
				// 	},
				// 	ASTThisKeyword: () => {
				// 		return Helpers.inferType(objectTypeResult.value, ctx);
				// 	},
				// 	ASTTypeInstantiationExpression: () => {
				// 		return Helpers.inferType(objectTypeResult.value, ctx);
				// 	},
				// 	'...': () => {
				// 		return HelperASTTypeInstantiationExpressions.inferType(objectTypeResult.value, ctx);
				// 	},
				// });

				// Second, get the object from the Symbol Table
				// If it's an ASTIdentifier, look it up, otherwise, send back to inferType()
				// recursively
				while ([ASTCallExpression.name, ASTMemberExpression.name].includes(objectTypeResult.value.constructor.name)) {
					objectTypeResult = Helpers.inferType(objectTypeResult.value, ctx);
					if (objectTypeResult.isError()) {
						return objectTypeResult;
					}
				}

				let objSymbol: SymbolInfo;
				if (objectTypeResult.value.constructor === ASTTypeInstantiationExpression) {
					const typeInstExpr = objectTypeResult.value as ASTTypeInstantiationExpression;
					if (typeInstExpr.base.constructor === ASTMemberExpression) {
						return Helpers.inferType(typeInstExpr.base, ctx);
					}

					const baseExpr = typeInstExpr.base as ASTIdentifier;
					const maybeSymbolInfo = SymbolTable.lookup(baseExpr.fqn, symbolKinds);
					if (!maybeSymbolInfo.has()) {
						return error(SemanticError.NotFound('Object', baseExpr.fqn, expr, ctx));
					}
					objSymbol = maybeSymbolInfo.value;
				} else if (objectTypeResult.value.constructor === ASTIdentifier) {
					const expr = objectTypeResult.value as ASTIdentifier;
					const maybeSymbolInfo = SymbolTable.lookup(expr.fqn, symbolKinds);
					if (!maybeSymbolInfo.has()) {
						return error(SemanticError.NotFound('Object', expr.fqn, expr, ctx));
					}
					objSymbol = maybeSymbolInfo.value;
				} else {
					return error(SemanticError.MemberExpressionObjectNotSupported(objectTypeResult.value, expr, ctx));
				}

				// * - Array(number or range)
				// * - Class(string property or method, can be generic)
				// * - Enum(string value)
				// * - Interface(string property or method, can be generic)
				// * - Object(string property)
				// * - String(number or range)
				// * - Tuple(number or range)

				// const validPairs = {
				// 	[ASTArrayExpression.name]: [ASTIdentifier.name, ASTNumberLiteral.name, ASTTypeRange.name, ASTUnaryExpression.name],
				// 	class: [ASTIdentifier.name, ASTTypeInstantiationExpression.name],
				// 	[ASTEnumDeclaration.name]: [ASTIdentifier.name],
				// 	[ASTInterfaceDeclaration.name]: [ASTIdentifier.name, ASTTypeInstantiationExpression.name],
				// 	[ASTObjectExpression.name]: [ASTIdentifier.name],
				// 	[ASTStringLiteral.name]: [ASTIdentifier.name, ASTNumberLiteral.name, ASTTypeRange.name, ASTUnaryExpression.name],
				// 	[ASTTupleExpression.name]: [ASTIdentifier.name, ASTNumberLiteral.name, ASTTypeRange.name, ASTUnaryExpression.name],
				// };

				// if (!validPairs[objSymbol.kind].includes(propertyTypeResult.value.constructor.name)) {
				// 	return error(SemanticError.MemberExpressionPropertyNotSupported(propertyTypeResult.value, expr, ctx));
				// }

				switch (objSymbol.kind) {
					case 'class': {
						// const cls = objSymbol;

						// special case: parent
						if (
							memberExpr.property.constructor === ASTTypeInstantiationExpression &&
							(memberExpr.property as ASTTypeInstantiationExpression).base.constructor === ASTIdentifier //&&
							// ((memberExpr.property as ASTTypeInstantiationExpression).base as ASTIdentifier).fqn === 'parent'
						) {
							// get property's type
							const propertyTypeResult = Helpers.inferType(memberExpr.property, ctx);
							if (propertyTypeResult.isError()) {
								return propertyTypeResult;
							}
							return propertyTypeResult;
						}

						if (
							memberExpr.property.constructor === ASTIdentifier /*&& (memberExpr.property as ASTIdentifier).fqn === 'parent'*/
						) {
							// get property's type
							// append the parent's fqn to the property's fqn
							memberExpr.property.prependParentToFqn(`${objSymbol.name}.`);
							const propertyTypeResult = Helpers.inferType(memberExpr.property, ctx);
							if (propertyTypeResult.isError()) {
								return propertyTypeResult;
							}
							return propertyTypeResult;
						}

						return error(
							SemanticError.TODOThisIsTemp(
								`Semantic.inferType(ASTMemberExpression) not implemented for objSymbol class with memberExpr ${
									memberExpr.property.constructor.name
								}: ${memberExpr.property.toString()}`,
								expr,
								ctx,
							),
						);
						break;
					}
					// case 'variable': {
					// 	const variable = objSymbol;
					// 	// array
					// 	if (variable.type.constructor.name === ASTArrayOf.constructor.name) {
					// 		const aryExpr = objectTypeResult.value as unknown as ASTArrayOf;

					// 		// identifier
					// 		if (propertyTypeResult.value.constructor === ASTIdentifier) {
					// 			const propExpr = propertyTypeResult.value as ASTIdentifier;
					// 			const maybeSymbolInfo = SymbolTable.lookup(propExpr.fqn, symbolKinds);
					// 			if (!maybeSymbolInfo.has()) {
					// 				return error(SemanticError.NotFound('Property', propExpr.fqn, expr, ctx));
					// 			}
					// 			const propSymbol = maybeSymbolInfo.value;
					// 			if (propSymbol.kind === 'variable') {
					// 				if (
					// 					propSymbol.type.constructor.name === ASTTypeNumber.constructor.name ||
					// 					propSymbol.type.constructor.name === ASTUnaryExpression.constructor.name
					// 				) {
					// 					return ok(aryExpr.type);
					// 				}

					// 				if (propSymbol.type.constructor.name === ASTTypeRange.constructor.name) {
					// 					return ok(aryExpr);
					// 				}
					// 			}
					// 		}

					// 		// number
					// 		if (
					// 			propertyTypeResult.value.constructor === ASTNumberLiteral ||
					// 			propertyTypeResult.value.constructor === ASTUnaryExpression<number>
					// 		) {
					// 			return ok(aryExpr.type);
					// 		}

					// 		// range
					// 		if (propertyTypeResult.value.constructor === ASTTypeRange) {
					// 			return ok(aryExpr); // will be a subset of the array
					// 		}
					// 	}
					// }
				}

				/**
				 * Check the type of object:
				 *
				 * Check the type of property:
				 * - Identifier
				 * - Literal
				 * - Range
				 */
				// switch (objSymbol.kind) {
				// 	case 'class': {
				// }

				// array
				// if (objectTypeResult.value instanceof ASTArrayExpression) {
				// 	/**
				// 	 * the property types can be reduced to two categories:
				// 	 * - a number
				// 	 * - a range
				// 	 * (a list of numbers would be an ASTMemberListExpression)
				// 	 *
				// 	 * Some we won't immediately know and need to resolve
				// 	 */

				// 	switch (propertyTypeResult.value.constructor) {
				// 		// numbers
				// 		case ASTNumberLiteral:
				// 		case ASTUnaryExpression<ExpressionASTs>:
				// 			return ok(objectTypeResult.value.type);

				// 		// range
				// 		case ASTRangeExpression: // this is a subset of the array
				// 			return ok(objectTypeResult.value);

				// 		// needs further resolution
				// 		case ASTBinaryExpression<ExpressionASTs, ExpressionASTs>:
				// 		case ASTCallExpression:
				// 		case ASTIdentifier:
				// 		case ASTMemberExpression:
				// 		case ASTTernaryExpression<AssignableASTs, AssignableASTs>: {
				// 			const inferredTypeResult = Helpers.inferType(propertyTypeResult.value, ctx);
				// 			if (inferredTypeResult.isError()) {
				// 				return inferredTypeResult;
				// 			}

				// 			// check the resolved type
				// 			switch (inferredTypeResult.value.constructor) {
				// 				case ASTNumberLiteral:
				// 				case ASTUnaryExpression<ExpressionASTs>:
				// 					return ok(objectTypeResult.value.type);

				// 				case ASTRangeExpression:
				// 					return ok(objectTypeResult.value);

				// 				default: // some other resolved type
				// 					return error(
				// 						SemanticError.MemberExpressionPropertyNotSupported(propertyTypeResult.value, memberExpr, ctx),
				// 					);
				// 			}
				// 		}
				// 		default: // some other type
				// 			return error(SemanticError.MemberExpressionPropertyNotSupported(propertyTypeResult.value, memberExpr, ctx));
				// 	}
				// } else if (objectTypeResult.value instanceof ASTClassDeclaration) {
				// 	// the property must be an identifier
				// 	// TODO deal with <=>
				// 	// if (propertyTypeResult.value instanceof ASTIdentifier) {}
				// }

				return error(
					SemanticError.TODOThisIsTemp(
						`Semantic.inferType(ASTMemberExpression) not implemented for ${
							objectTypeResult.value.constructor.name
						}: ${objectTypeResult.value.toString()}`,
						expr,
						ctx,
					),
				);
			}
			case ASTNumberLiteral:
				return ok(ASTTypeNumber._((expr as ASTNumberLiteral).size, expr.pos, expr as ASTNumberLiteral));
			case ASTObjectExpression:
				{
					const objExpr = expr as ASTObjectExpression;

					const propertiesShapesTypesResults = Helpers.inferASTTypeFromMultipleASTAssignables(
						objExpr,
						objExpr.properties.map((property) => property.value),
						`Object expression's properties`,
						ctx,
					);
					if (!propertiesShapesTypesResults.isOk()) {
						return propertiesShapesTypesResults;
					}

					const propertiesShapes = objExpr.properties.map((property, index) =>
						ASTPropertyShape._(property.key, propertiesShapesTypesResults.value[index], expr.pos, objExpr),
					);

					return ok(ASTObjectShape._(propertiesShapes, expr.pos, objExpr));
				}
				break;
			case ASTPath:
				return ok(ASTTypePrimitivePath(expr.pos, expr as ASTPath));
				break;
			case ASTPostfixIfStatement:
				return Helpers.inferType((expr as ASTPostfixIfStatement).expression, ctx);
				break;
			case ASTRangeExpression:
				return ok(ASTTypeRange._(expr.pos, expr as ASTRangeExpression));
				break;
			case ASTRegularExpression:
				return ok(ASTTypePrimitiveRegex(expr.pos, expr as ASTRegularExpression));
				break;
			case ASTStringLiteral:
				return ok(ASTTypePrimitiveString(expr.pos, expr as ASTStringLiteral));
				break;
			case ASTTernaryExpression:
				{
					const ternaryExpr = expr as ASTTernaryExpression<AssignableASTs, AssignableASTs>;
					const a = Helpers.inferType(ternaryExpr.consequent.value, ctx);
					if (a.isError()) {
						return a;
					}

					const b = Helpers.inferType(ternaryExpr.alternate.value, ctx);
					if (b.isError()) {
						return b;
					}

					if (
						Helpers.isTypeAssignable(a.value, b.value, ternaryExpr.consequent, ctx).isOk() ||
						Helpers.isTypeAssignable(b.value, a.value, ternaryExpr.alternate, ctx).isOk()
					) {
						return ok(a.value); // TODO if numbers, take the larger one
					}

					return errorCouldNotInfer('TernaryExpression');
				}
				break;
			case ASTThisKeyword:
				{
					// find the nearest class
					const hasClass = SymbolTable.findNearestClass();
					if (!hasClass.has()) {
						return error(SemanticError.ThisUsedOutsideOfClass(expr, ctx));
					}

					// return the class's type
					return ok(ASTIdentifier._(hasClass.value.name, hasClass.value.pos, expr as ASTThisKeyword));
				}
				break;
			case ASTTupleExpression: {
				const tplExpr = expr as ASTTupleExpression;

				const itemsShapesTypesResults = Helpers.inferASTTypeFromMultipleASTAssignables(
					tplExpr,
					tplExpr.items,
					`Tuple expression's items`,
					ctx,
				);
				if (!itemsShapesTypesResults.isOk()) {
					return itemsShapesTypesResults;
				}

				return ok(ASTTupleShape._(itemsShapesTypesResults.value, expr.pos, tplExpr));
			}
			case ASTTypeInstantiationExpression: {
				const typeInstantiationExpr = expr as ASTTypeInstantiationExpression;

				// get the base
				const baseTypeResult = Helpers.inferType(typeInstantiationExpr.base, ctx);
				if (baseTypeResult.isError()) {
					return baseTypeResult;
				}

				// get the type arguments
				const typeArgumentsResults = typeInstantiationExpr.typeArgs.map((typeArg) => {
					return Helpers.inferType(typeArg, ctx);
				});
				if (typeArgumentsResults.some((result) => result.isError())) {
					// set the first type as the type, it doesn't matter since this is an error
					return CreateResultFrom.arrayOfResults(typeArgumentsResults).mapValue((results) => results[0]);
				}

				// all are ok
				const typeArgs = (typeArgumentsResults as ResultOk<ASTType>[]).map((result) => result.value);

				// special case if the base is 'parent' and there is one type argument
				if (typeInstantiationExpr.base instanceof ASTIdentifier && typeInstantiationExpr.base.name === 'parent') {
					if (typeArgs.length !== 1) {
						return error(SemanticError.ParentMustHaveOneTypeArgument(typeInstantiationExpr, ctx));
					}

					// get the class we're in and find the parent class
					const classSymNodeResult = SymbolTable.findNearestClass();
					if (!classSymNodeResult.has()) {
						return error(SemanticError.ParentUsedOutsideOfClass(typeInstantiationExpr, ctx));
					}

					// get the parent class
					const classSymResult = SymbolTable.lookup(classSymNodeResult.value.name, ['class']);
					if (!classSymResult.has()) {
						return error(SemanticError.ClassNotFound(typeInstantiationExpr, ctx));
					}

					// get the class's parents
					const exts = classSymResult.value._extends.items;
					let parent = exts.find(
						(ext) =>
							ext.constructor === ASTIdentifier && typeArgs[0].constructor === ASTIdentifier && ext.name === typeArgs[0].name,
					);
					// check parents that use Identifiers
					if (typeof parent !== 'undefined') {
						return ok(parent);
					}

					parent = exts.find(
						(ext) =>
							ext.constructor === ASTMemberExpression &&
							typeArgs[0].constructor === ASTMemberExpression &&
							ext.toString() === typeArgs[0].toString(),
					);
					// check parents that use MemberExpressions
					if (typeof parent !== 'undefined') {
						return ok(parent);
					}
				}

				// TODO check if the type arguments are valid for the base type

				return baseTypeResult;
			}
			case ASTUnaryExpression: {
				const unaryExpression = expr as ASTUnaryExpression<ExpressionASTs>;
				const operator = unaryExpression.operator;
				switch (operator) {
					case '!':
						return ok(ASTTypePrimitiveBool(expr.pos, unaryExpression));
						break;

					case '-':
					case '++':
					case '--':
						// at this point, we can only infer the type of the expression if we know
						// the type of the operand. If we don't, we can't infer anything
						if (unaryExpression.operand.constructor === ASTNumberLiteral) {
							const size = unaryExpression.operand.size;

							// if using an '-' operator, the size cannot be unsigned
							if (operator === '-' && numberSizeDetails[size].cat === 'uint') {
								return errorCouldNotInfer('unary expression');
							}

							return ok(ASTTypeNumber._(size, expr.pos, unaryExpression));
						}

						// todo check the types of other operands
						break;
				}

				return errorCouldNotInfer(`unary operator "${operator}"`);
			}
			case ASTWhenExpression:
				{
					const whenExpr = expr as ASTWhenExpression;

					// this result has Error Data which is an array of indices of cases that we could not infer from
					const result = Helpers.inferASTTypeFromMultipleASTAssignables(
						whenExpr,
						whenExpr.cases.map((whenCase) => whenCase.consequent),
						`When expression's cases`,
						ctx,
					);

					if (result.isOk()) {
						// see if all the types are the same
						if (allASTTypesEqual(result.value)) {
							return ok(result.value[0]);
						}

						return errorCouldNotInfer('WhenExpression has multiple types');
					}

					return result;
				}
				break;
		}

		// TODO more work needed here. Discover inferred type of CallExpression, MemberExpression, MemberListExpression, and more
		return error(SemanticError.TODOThisIsTemp(`Analyzer/Helpers.inferType(${expr.constructor.name}) needs to be handled`, expr, ctx));
	}

	public static inferASTTypeFromMultipleASTAssignables(
		parent: AST,
		assignables: AssignableASTs[],
		ofThis: string,
		ctx: Context,
	): Result<ASTType[], SemanticError, number[]> {
		// get types from the assignables
		const types = assignables.map((assignable) => Helpers.inferType(assignable, ctx));

		// get a single result with possible error data containing a list if indices we could not infer from
		const uninferrableIndices = Helpers.setIndicesWhereWeCouldNotInferFrom(types);
		if (uninferrableIndices.isOk()) {
			return uninferrableIndices;
		}

		// if there's an error
		// TODO actually get the code for ctx()
		return error(SemanticError.CouldNotInferType(ofThis, parent, ctx), uninferrableIndices.data);
	}

	/**
	 * Takes an array of the form: Result<ASTType[], SemanticError>[]
	 * which usually comes from when cases, object properties, etc., and finds
	 * the index numbers that have issues. It then creates a single Result
	 * from the array of Results, and sets that number list as the error
	 * data of that Result, which we can use to help the user debug.
	 */
	public static setIndicesWhereWeCouldNotInferFrom<T extends Result<ASTType, SemanticError>>(
		list: T[],
	): Result<ASTType[], SemanticError, number[]> {
		// combine the results into a single result, but do not filter out the errors since
		// if we do that, we lose the indices which are in relation to all the results
		const combinedResult = CreateResultFrom.arrayOfResults<ASTType, SemanticError>(list);

		// maps the errors to their indices
		return combinedResult.mapErrorData(
			list
				// we need the index and result, so map to the tuple [index, result]
				.map((result, index): [number, T] => [index, result])

				// filter just the ones that have errors
				.filter(([, result]) => !result.isOk())

				// and get each index, so we wind up with a number[]
				.map(([index]) => index),
		) as Result<ASTType[], SemanticError, number[]>;
	}

	/**
	 * Gets return expressions, if any, from an ASTBlockStatement, and optionally checks the types.
	 * This is intended to be versatile to use for function bodies, else consequents, etc.
	 *
	 * In some situations, return expressions are optional. If there should be no return expressions,
	 * pass an empty array.
	 *
	 * Examples
	 * ```ts
	 * getReturnsExpressionsFromBlockStatement(node, ast, [type...]) // will check count and types, and return whatever is there
	 * getReturnsExpressionsFromBlockStatement(node, ast, []) // will check count is zero, and return whatever is there
	 * getReturnsExpressionsFromBlockStatement(node, ast, undefined) // won't check count or types, but will return whatever is there
	 * ```
	 *
	 * @param node The Node
	 * @param ast The ASTBlockStatement
	 * @param typesToMatch If defined, will check the number and types match. If undefined, won't check
	 * @returns
	 */
	public static getReturnsExpressionsFromBlockStatement(
		ast: ASTBlockStatement,
		mustMatch: MatchingReturns,
	): Result<AssignableASTs[], AnalysisError | SemanticError>[];
	public static getReturnsExpressionsFromBlockStatement(ast: ASTBlockStatement, mustMatch: undefined): ResultOk<AssignableASTs[]>[];
	public static getReturnsExpressionsFromBlockStatement(
		ast: ASTBlockStatement,
		mustMatch: MatchingReturns | undefined,
	): Result<AssignableASTs[], AnalysisError | SemanticError>[] {
		// for now, check the last statement to ensure it's a return statement with the correct return types
		// TODO control flow analysis
		const lastStatement = ast.expressions.at(-1);
		if (typeof lastStatement === 'undefined' || lastStatement.kind !== 'ReturnStatement') {
			// if the func has return types
			if (typeof mustMatch !== 'undefined' && mustMatch.types.items.length > 0) {
				return [mustMatch.errors.ifMissing];
			}

			// if no return types, we add an empty return statement - This was moved to llvm_ir_converter
		}

		// TODO control flow analysis
		const returnStmts = [lastStatement as ASTReturnStatement];
		return returnStmts.map((returnStmt) => {
			const returnExprs = returnStmt.expressions;

			// ensure the correct number of expressions are there
			if (typeof mustMatch !== 'undefined' && returnExprs.length !== mustMatch.types.items.length) {
				const actual = returnExprs.length;
				const expected = mustMatch.types.items.length;

				return mustMatch.errors.ifHasIncorrectNumberOfExpressions(expected, actual);
			}

			return ok(returnExprs);
		});
	}

	/**
	 * If a value may be assigned to a variable/parameter of a given type
	 *
	 * @param value The value to check
	 * @param type The type to check against
	 * @param ast The AST node
	 * @param ctx The Context
	 * @returns A Result with the inferred type if it is assignable, or an error if not
	 */
	public static isAssignable(value: AssignableASTs, type: ASTType, ast: AST, ctx: Context): Result<ASTType, SemanticError> {
		const inferredTypeResult = Helpers.inferType(value, ctx);
		if (inferredTypeResult.isError()) {
			return inferredTypeResult;
		}

		// if it's assignable, map and return the inferred type
		return Helpers.isTypeAssignable(inferredTypeResult.value, type, ast, ctx).mapValue(() => inferredTypeResult.value);
	}

	/** If a source type may be assigned to a dest type */
	public static isTypeAssignable(source: ASTType, dest: ASTType, ast: AST, ctx: Context): Result<true, SemanticError> {
		// First check if these are numbers, in which case we check the sizes,
		// being careful that ints/uints/decs remain separate.
		if (source instanceof ASTTypeNumber && dest instanceof ASTTypeNumber) {
			// get size info for the destination type
			const sourceSize = numberSizeDetails[source.size];
			const destSize = numberSizeDetails[dest.size];

			// check int/uint/dec
			if (destSize.cat !== sourceSize.cat) {
				return error(SemanticError.NotAssignable.NumberCat(sourceSize.cat, destSize.cat, ast, ctx));
			}

			// finally, it's assignable if the size is smaller or equal to the desination size
			return EqualityChecks.lessThanOrEqual(compareSizeInfos(sourceSize, destSize))
				? ok(true)
				: error(SemanticError.NotAssignable.NumberBits(sourceSize.bits, destSize.bits, ast, ctx));
		}

		// TODO build type constraints

		// TODO check if the source type is a subtype of the destination type
		// TODO check if the source type is a supertype of the destination type

		// finally, for non-numbers, check if the uniquenesses (uniqueni) match
		const sourceType = astUniqueness(source);
		const destType = astUniqueness(dest);

		return sourceType === destType ? ok(true) : error(SemanticError.NotAssignable.Type(source, dest, ast, ctx));
	}

	/**
	 * Finds the intersection of 2 arrays
	 *
	 * @param items1 Array 1
	 * @param items2 Array 2
	 * @returns
	 */
	public static intersectArrays<T extends ASTType>(items1: T[], items2: T[]): T[] {
		return _.intersectionBy(items1, items2, astUniqueness);
	}

	/**
	 * Finds the intersection of N arrays
	 *
	 * @param items Array of arrays
	 * @returns A 1D array
	 */
	public static intersectNArrays<T extends ASTType>(items: T[][]): T[] {
		return items.reduce(Helpers.intersectArrays);
	}

	/**
	 * Finds duplictes in a string array, and gives them back by index.
	 *
	 * Example:
	 * ```
	 * findDuplicates(['a', 'b', 'a', 'c', 'b'])); // [[0, 2], [1, 4]]
	 * ```
	 *
	 * @param arr In which to check
	 * @returns An array of arrays
	 */
	public static findDuplicates(arr: string[]): number[][] {
		const indices: { [key: string]: number[] } = {};
		const duplicates: number[][] = [];

		for (let i = 0; i < arr.length; i++) {
			if (indices[arr[i]]) {
				indices[arr[i]].push(i);
			} else {
				indices[arr[i]] = [i];
			}
		}

		for (const key in indices) {
			if (indices[key].length > 1) {
				duplicates.push(indices[key]);
			}
		}

		return duplicates;
	}

	/**
	 * Reusable message stencil
	 *
	 * Usage
	 * ```ts
	 * messageStencil(prefix, expecting, undefined) // `${prefix}: We were expecting ${expecting}`
	 * messageStencil(prefix, expecting, node) // `${prefix}: We were expecting ${expecting}, but found a "${node.type}" instead`
	 * ```
	 */
	public static messageStencil(prefix: string, expecting: string, node: Node | undefined) {
		return `${prefix}: We were expecting ${expecting}${node ? `, but found a "${node.type}" instead` : ''}`;
	}
}

export default Helpers;
