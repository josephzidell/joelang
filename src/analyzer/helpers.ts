import _ from 'lodash';
import { Node } from '../parser/types';
import ErrorContext from '../shared/errorContext';
import { getNumberSizesFromTypes, numberSizeDetails, numberSizesSignedInts } from '../shared/numbers/sizes';
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
import SemanticError, { SemanticErrorCode } from './semanticError';
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

/**
 * This function attempts to infer a type and if successful, run the assigner callback.
 *
 * Intentionally does not return an error if unable to infer anything. That is not an error scenario.
 *
 * Only returns an error if there is a problem in this.inferASTTypeFromASTAssignable()
 *
 * @see {@link inferPossibleASTTypesFromASTAssignable()}
 */
export function assignInferredPossibleTypes(
	valueAST: AssignableASTs,
	valueNode: Node,
	assigner: (possibleTypes: ASTType[]) => void,
	options: Options,
): Result<ASTType[], SemanticError> {
	const typesResult = inferPossibleASTTypesFromASTAssignable(valueAST, options);

	if (typesResult.isOk()) {
		assigner(typesResult.value);
	}

	return typesResult;
}

/**
 * Attempts to infer possible ASTTypes from an ASTAssignable.
 * This is very forgiving, and only returns an error in extremely unlikely cases.
 */
export function inferPossibleASTTypesFromASTAssignable(expr: AssignableASTs, options: Options): Result<ASTType[], SemanticError> {
	const errorCouldNotInfer = (ofThis: string): ResultError<SemanticError, ASTType[]> => {
		return error(
			new SemanticError(
				SemanticErrorCode.CouldNotInferType,
				`We could not infer the type of this ${ofThis}`,
				expr,
				// TODO actually get the code for getErrorContext()
				getErrorContext(expr.toString(), expr.pos.line, expr.pos.col, expr.pos.end - expr.pos.start),
			),
		);
	};

	switch (expr.constructor) {
		case ASTArrayExpression:
			{
				const aryExpr = expr as ASTArrayExpression<ExpressionASTs>;

				// if the array is empty, we can't infer anything
				if (aryExpr.items.length === 0) {
					return errorCouldNotInfer('array');
				}

				const possibleTypesResult = inferPossibleASTTypesFromASTAssignable(aryExpr.items[0], options);

				// map the child type maybe into a Maybe<ASTArrayOf>
				// if we can infer the type of the child, we can infer the type of the array
				return possibleTypesResult.mapValue((types) => types.map((childType) => ASTArrayOf._(childType, expr.pos))) as Result<
					ASTType[],
					SemanticError
				>;
			}
			break;
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
						return ok([ASTTypePrimitiveBool(expr.pos)]);
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
							const leftNumberPossibleTypesResult = inferPossibleASTTypesFromASTAssignable(binaryExpr.left, options);
							if (!leftNumberPossibleTypesResult.isOk()) {
								return errorCouldNotInfer("BinaryExpression's left-hand side");
							}
							const rightNumberPossibleTypesResult = inferPossibleASTTypesFromASTAssignable(binaryExpr.right, options);
							if (!rightNumberPossibleTypesResult.isOk()) {
								return errorCouldNotInfer("BinaryExpression's right-hand side");
							}

							// ensure all are ASTTypeNumbers and get sizes

							const leftNumberPossibleSizes = getNumberSizesFromTypes(leftNumberPossibleTypesResult.value);
							const rightNumberPossibleSizes = getNumberSizesFromTypes(rightNumberPossibleTypesResult.value);

							// for exponent
							if (operator === '^e') {
								// if the right side is a negative exponent, the number size must be a decimal
								if (binaryExpr.right.constructor === ASTUnaryExpression && binaryExpr.right.operator === '-') {
									// get the lowest bit count of the left number's possible sizes
									const [firstNumberSize, ...rest] = leftNumberPossibleSizes;
									const lowestBitCount = getLowestBitCountOf(firstNumberSize, ...rest);

									// return decimal number sizes that are at least as big as the left number's lowest bit count
									return CreateResultFrom.dataArrayNotHavingLength0(
										filterASTTypeNumbersWithBitCountsLowerThan(
											NumberSizesDecimalASTs.map((ns) => ns(expr.pos)),
											lowestBitCount,
										),
										errorCouldNotInfer('number').error,
									);
								}

								// take the left number size
								return CreateResultFrom.dataArrayNotHavingLength0(
									leftNumberPossibleSizes.map((ns) => ASTTypeNumber._(ns, expr.pos)),
									errorCouldNotInfer('number').error,
								);
							}

							// or if both numbers are the same size, take that size
							if (_.isEqual(leftNumberPossibleSizes, rightNumberPossibleSizes)) {
								return CreateResultFrom.dataArrayNotHavingLength0(
									leftNumberPossibleSizes.map((ns) => ASTTypeNumber._(ns, expr.pos)),
									errorCouldNotInfer('number').error,
								);
							}

							return CreateResultFrom.dataArrayNotHavingLength0(
								_.intersection(leftNumberPossibleSizes, rightNumberPossibleSizes).map((ns) =>
									ASTTypeNumber._(ns, expr.pos),
								),
								errorCouldNotInfer('number').error,
							);
						}
						break;
				}

				return errorCouldNotInfer(`binary operator "${operator}"`);
			}
			break;
		case ASTBlockStatement:
			{
				const blockStmt = expr as ASTBlockStatement;

				const returnExpressions = getReturnExpressionsFromBlockStatement(blockStmt, undefined).value;

				// get possible types from the when cases
				const possibleTypesResultsByReturn = returnExpressions.map((expr) => {
					return inferPossibleASTTypesFromASTAssignable(expr, options);
				});
				if (!Results.allOk(possibleTypesResultsByReturn)) {
					return errorCouldNotInfer('BlockStatement');
				}

				const intersection = intersectN(possibleTypesResultsByReturn.map((r: ResultOk<ASTType[]>) => r.value));

				return ok(intersection);
			}
			break;
		case ASTBoolLiteral:
			return ok([ASTTypePrimitiveBool(expr.pos)]);
			break;
		case ASTCallExpression:
			{
				const callExpr = expr as ASTCallExpression;
				switch (callExpr.callee.constructor) {
					// TODO ASTCallExpression | ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression
					case ASTIdentifier:
						return inferPossibleASTTypesFromASTAssignable(callExpr.callee, options);
					case ASTMemberExpression:
						return inferPossibleASTTypesFromASTAssignable(callExpr.callee, options);
				}

				// // look up the callee in the symbol table
				// const lookupResult = symbolTable.lookup(callExpr.callee.);
				return errorCouldNotInfer(`CallExpression using ${callExpr.callee.constructor.name}`);
			}
			break;
		case ASTIdentifier:
			{
				const identifier = expr as ASTIdentifier;

				// look up the identifier in the symbol table
				const lookupResult = SymbolTable.lookup(identifier.name, symbolKinds, options).map((value: SymbolInfo) => {
					const mapType: {
						[key in keyof kindToSymMap]: (value: kindToSymMap[key]) => Result<ASTType[], SemanticError>;
					} = {
						class: (value: ClassSym): Result<ASTType[], SemanticError> => {
							return ok([ASTIdentifier._(identifier.name, value.pos)]); // create a type from the name
						},
						enum: (value: EnumSym): Result<ASTType[], SemanticError> => {
							return ok([ASTIdentifier._(identifier.name, value.pos)]); // create a type from the name
						},
						function: (value: FuncSym): Result<ASTType[], SemanticError> => {
							// if the function has declared return types, return those
							if (value.returnTypes) {
								return ok(value.returnTypes);
							}

							// otherwise, we can't infer anything
							return errorCouldNotInfer("this function's returns");
						},
						interface: (value: InterfaceSym): Result<ASTType[], SemanticError> => {
							return ok([ASTIdentifier._(identifier.name, value.pos)]); // create a type from the name
						},
						parameter: (value: ParamSym): Result<ASTType[], SemanticError> => {
							// if the parameter has a declared type, return that
							if (value.type) {
								return ok([value.type]);
							}

							// if the parameter has a default value, infer the type of the value
							if (value.defaultValue) {
								return inferPossibleASTTypesFromASTAssignable(value.defaultValue, options);
							}

							// otherwise, we can't infer anything
							return errorCouldNotInfer('parameter');
						},
						variable: (value: VarSym): Result<ASTType[], SemanticError> => {
							// if the variable has a declared type, return that
							if (value.type) {
								return ok([value.type]);
							}

							// if the variable has a value, infer the type of the value
							if (value.value) {
								return inferPossibleASTTypesFromASTAssignable(value.value, options);
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
					return error(
						new SemanticError(
							SemanticErrorCode.UnknownIdentifier,
							`We don't recognize the "${identifier.name}" Identifier`,
							expr,
							// TODO actually get the code for getErrorContext()
							getErrorContext(expr.toString(), expr.pos.line, expr.pos.col, expr.pos.end - expr.pos.start),
						),
					);
				}
				return lookupResult.value;
			}
			break;
		case ASTMemberExpression:
			{
				const memberExpr = expr as ASTMemberExpression;

				// get object's type(s)
				const objectTypesResult = inferPossibleASTTypesFromASTAssignable(memberExpr.object, options);
				if (objectTypesResult.isError()) {
					return objectTypesResult;
				}
				console.debug({ objectTypesResult });

				return error(
					new SemanticError(
						SemanticErrorCode.Temp,
						'Semantic.inferPossibleASTTypesFromASTAssignable(ASTMemberExpression) not implemented',
						expr,
						// TODO actually get the code for getErrorContext()
						getErrorContext(expr.toString(), expr.pos.line, expr.pos.col, expr.pos.end - expr.pos.start),
					),
				);
			}
			break;
		case ASTNumberLiteral:
			return CreateResultFrom.dataArrayNotHavingLength0(
				(expr as ASTNumberLiteral).possibleSizes.map((size) => ASTTypeNumber._(size, expr.pos)),
				errorCouldNotInfer('number').error,
			);
		case ASTObjectExpression:
			{
				const objExpr = expr as ASTObjectExpression;

				const propertiesShapesTypesResults = inferPossibleASTTypesFromMultipleASTAssignables(
					objExpr,
					objExpr.properties.map((property) => property.value),
					`We could not infer the type of this Object expression's properties`,
					options,
				);
				if (!propertiesShapesTypesResults.isOk()) {
					return propertiesShapesTypesResults;
				}

				const propertiesShapes = objExpr.properties.map((property, index) =>
					ASTPropertyShape._(property.key, propertiesShapesTypesResults.value[index], expr.pos),
				);

				return ok([ASTObjectShape._(propertiesShapes, expr.pos)]);
			}
			break;
		case ASTPath:
			return ok([ASTTypePrimitivePath(expr.pos)]);
			break;
		case ASTPostfixIfStatement:
			return inferPossibleASTTypesFromASTAssignable((expr as ASTPostfixIfStatement).expression, options);
			break;
		case ASTRangeExpression:
			return ok([ASTTypeRange._(expr.pos)]);
			break;
		case ASTRegularExpression:
			return ok([ASTTypePrimitiveRegex(expr.pos)]);
			break;
		case ASTStringLiteral:
			return ok([ASTTypePrimitiveString(expr.pos)]);
			break;
		case ASTTernaryExpression:
			{
				const ternaryExpr = expr as ASTTernaryExpression<AssignableASTs, AssignableASTs>;
				const typesOfConsequentResult = inferPossibleASTTypesFromASTAssignable(ternaryExpr.consequent.value, options);
				if (typesOfConsequentResult.isError()) {
					return typesOfConsequentResult;
				}

				const typesOfAlternateResult = inferPossibleASTTypesFromASTAssignable(ternaryExpr.alternate.value, options);
				if (typesOfAlternateResult.isError()) {
					return typesOfAlternateResult;
				}

				return ok(_.intersectionBy(typesOfConsequentResult.value, typesOfAlternateResult.value, astUniqueness));
			}
			break;
		case ASTThisKeyword:
			{
				// find the nearest class
				const hasClass = SymbolTable.findNearestClass(options);
				if (!hasClass.has()) {
					return error(
						new SemanticError(
							SemanticErrorCode.ThisUsedOutsideOfClass,
							`We can't use the "this" keyword outside of a Class`,
							expr,
							getErrorContext(expr.toString(), expr.pos.line, expr.pos.col, expr.pos.end - expr.pos.start),
						),
					);
				}

				// return the class's type
				return ok([ASTIdentifier._(hasClass.value.name, hasClass.value.pos)]);
			}
			break;
		case ASTTupleExpression:
			{
				const tplExpr = expr as ASTTupleExpression;

				const itemsShapesTypesResults = inferPossibleASTTypesFromMultipleASTAssignables(
					tplExpr,
					tplExpr.items,
					`We could not infer the type of this Tuple expression's items`,
					options,
				);
				if (!itemsShapesTypesResults.isOk()) {
					return itemsShapesTypesResults;
				}

				return ok([ASTTupleShape._(itemsShapesTypesResults.value, expr.pos)]);
			}
			break;
		case ASTUnaryExpression:
			{
				const unaryExpression = expr as ASTUnaryExpression<ExpressionASTs>;
				const operator = unaryExpression.operator;
				switch (operator) {
					case '!':
						return ok([ASTTypePrimitiveBool(expr.pos)]);
						break;

					case '-':
					case '++':
					case '--':
						// at this point, we can only infer the type of the expression if we know
						// the type of the operand. If we don't, we can't infer anything
						if (unaryExpression.operand.constructor === ASTNumberLiteral) {
							let possibleSizes = unaryExpression.operand.possibleSizes;

							// if using an '-' operator, the possible sizes cannot include unsigned
							if (operator === '-') {
								possibleSizes = _.intersection(possibleSizes, numberSizesSignedInts);
							}

							if (possibleSizes.length === 0) {
								return errorCouldNotInfer('unary expression');
							}

							// otherwise include all possible sizes, and map them to ASTTypeNumbers
							return ok(possibleSizes.map((ns) => ASTTypeNumber._(ns, expr.pos)));
						}

						// todo check the possible types of other operands
						break;
				}

				return errorCouldNotInfer(`unary operator "${operator}"`);
			}
			break;
		case ASTWhenExpression:
			{
				const whenExpr = expr as ASTWhenExpression;

				const singleResultHavingIndicesWeCouldNotInferFrom = inferPossibleASTTypesFromMultipleASTAssignables(
					whenExpr,
					whenExpr.cases.map((whenCase) => whenCase.consequent),
					`We could not infer the type of this When expression's cases`,
					options,
				);

				if (singleResultHavingIndicesWeCouldNotInferFrom.isOk()) {
					// calculate the intersection of N arrays
					return ok(intersectN(singleResultHavingIndicesWeCouldNotInferFrom.value));
				}

				return singleResultHavingIndicesWeCouldNotInferFrom;
			}
			break;
	}

	// TODO more work needed here. Discover inferred type of CallExpression, MemberExpression, MemberListExpression, and more
	return errorCouldNotInfer(`unhandled expression type ${expr.constructor.name}`);
}

function inferPossibleASTTypesFromMultipleASTAssignables(
	parent: AST,
	assignables: AssignableASTs[],
	errorMessage: string,
	options: Options,
): Result<ASTType[][], SemanticError, number[]> {
	// get possible types from the assignables
	const possibleTypes = assignables.map((assignable) => {
		return inferPossibleASTTypesFromASTAssignable(assignable, options);
	});

	// get a single result with possible error data containing a list if indices we could not infer from
	const singleResultHavingIndicesWeCouldNotInferFrom = setIndicesWhereWeCouldNotInferFrom(possibleTypes);

	if (singleResultHavingIndicesWeCouldNotInferFrom.isOk()) {
		return singleResultHavingIndicesWeCouldNotInferFrom;
	}

	// if there's an error
	return error(
		new SemanticError(
			SemanticErrorCode.CouldNotInferType,
			errorMessage,
			parent,
			// TODO actually get the code for getErrorContext()
			getErrorContext(parent.toString(), parent.pos.line, parent.pos.col, parent.pos.end - parent.pos.start),
		),
		singleResultHavingIndicesWeCouldNotInferFrom.data as number[],
	);
}

/**
 * Checks that the value has exactly one inferred type, and returns it.
 * Returns an error if no types could be inferred, or if more than
 * one type could be inferred.
 *
 * @param value Of which to infer the type
 * @param err To return if there is not exactly one inferred type
 * @param options
 * @returns The inferred type, or an error
 */
export function getSingleInferredASTTypeFromASTAssignable(
	value: AssignableASTs,
	err: SemanticError,
	options: Options,
): Result<ASTType, SemanticError> {
	const inferredTypesResult = inferPossibleASTTypesFromASTAssignable(value, options);
	if (inferredTypesResult.isError()) {
		return inferredTypesResult;
	}

	if (inferredTypesResult.value.length !== 1) {
		return error(err);
	}

	return ok(inferredTypesResult.value[0]);
}

/**
 * Takes an array of the form: Result<ASTType[], SemanticError>[]
 * which usually comes from when cases, object properties, etc., and finds
 * the index numbers that have issues. It then creates a single Result
 * from the array of Results, and sets that number list as the error
 * data of that Result, which we can use to help the user debug.
 */
function setIndicesWhereWeCouldNotInferFrom<T extends Result<ASTType[], SemanticError>>(
	list: T[],
): Result<ASTType[][], SemanticError, number[]> {
	const combinedResult = CreateResultFrom.arrayOfResults<ASTType[], SemanticError>(list);

	return combinedResult.mapErrorData(
		list
			.map((result, index): [number, T] => [index, result])
			.filter(([, result]) => {
				return !result.isOk() || result.value.length === 0;
			})
			.map(([index]) => index),
	) as Result<ASTType[][], SemanticError, number[]>;
}

/**
 * Reusable getErrorContext method for several analyzer needs.
 */
export function getErrorContext(code: string, line: number, col: number, length: number): ErrorContext {
	return new ErrorContext(code, line, col, length);
}

interface MatchingReturns {
	types: ASTType[];
	errors: {
		ifMissing: ResultError<AnalysisError, ASTBlockStatement>;
		ifHasIncorrectNumberOfExpressions: (expected: number, actual: number) => ResultError<AnalysisError, ASTBlockStatement>;
	};
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
 * getReturnExpressionsFromBlockStatement(node, ast, [type...]) // will check count and types, and return whatever is there
 * getReturnExpressionsFromBlockStatement(node, ast, []) // will check count is zero, and return whatever is there
 * getReturnExpressionsFromBlockStatement(node, ast, undefined) // won't check count or types, but will return whatever is there
 * ```
 *
 * @param node The Node
 * @param ast The ASTBlockStatement
 * @param typesToMatch If defined, will check the number and types match. If undefined, won't check
 * @returns
 */
export function getReturnExpressionsFromBlockStatement(
	ast: ASTBlockStatement,
	mustMatch: MatchingReturns,
): Result<AssignableASTs[], AnalysisError>;
export function getReturnExpressionsFromBlockStatement(ast: ASTBlockStatement, mustMatch: undefined): ResultOk<AssignableASTs[]>;
export function getReturnExpressionsFromBlockStatement(
	ast: ASTBlockStatement,
	mustMatch: MatchingReturns | undefined,
): Result<AssignableASTs[], AnalysisError> {
	// for now, check the last statement to ensure it's a return statement with the correct return types
	// TODO control flow analysis
	let lastStatement = ast.expressions.at(-1);
	if (typeof lastStatement === 'undefined' || lastStatement.kind !== 'ReturnStatement') {
		// if the func has return types
		if (typeof mustMatch !== 'undefined' && mustMatch.types.length > 0) {
			return mustMatch.errors.ifMissing;
		}

		// if no return types, we add an empty return statement
		lastStatement = ASTReturnStatement._([], ast.pos);
		ast.expressions.push(lastStatement);
	}

	const returnStmt = lastStatement as ASTReturnStatement;
	const returnExprs = returnStmt.expressions;

	// ensure the correct number of expressions are there
	if (typeof mustMatch !== 'undefined' && returnExprs.length !== mustMatch.types.length) {
		const actual = returnExprs.length;
		const expected = mustMatch.types.length;

		return mustMatch.errors.ifHasIncorrectNumberOfExpressions(expected, actual);
	}

	return ok(returnExprs);
}

/** function to check if a value may be assigned to a variable/parameter of a given type */
export function isAssignable(value: AssignableASTs, type: ASTType, options: Options): [boolean, ASTType[]] {
	const inferredTypesResult = inferPossibleASTTypesFromASTAssignable(value, options);
	if (inferredTypesResult.isError()) {
		return [
			false,
			Array.isArray(inferredTypesResult.data) && typeof inferredTypesResult.data[0] === 'object' // preclude number[]
				? inferredTypesResult.data
				: [],
		];
	}

	const inferredTypes = inferredTypesResult.value;

	// most of time checking whether the inferred types include the destination
	// type suffices, which will be done below. However, for numbers the
	// behavior can be different in that a small number can be assigned
	// to a larger number, being careful that ints/uints/decs remain separate.
	if (type instanceof ASTTypeNumber && inferredTypes.some((t) => t.kind === 'TypeNumber')) {
		// check if all of the inferred number sizes are smaller than the desination size
		const inferredSizes = getNumberSizesFromTypes(inferredTypes).map((size) => numberSizeDetails[size]);

		// check int vs uint vs dec
		const destSize = numberSizeDetails[type.size];

		// check if any inferred type's type (int/uint/dec) does not match the desintation's
		if (inferredSizes.some((inferredSize) => inferredSize.type !== destSize.type)) {
			return [false, inferredTypes];
		}

		// check if all inferred types' bits are smaller than the desintation's
		if (inferredSizes.some((size) => size.bits > destSize.bits)) {
			return [false, inferredTypes];
		}

		return [true, inferredTypes];
	}

	// a non-number check
	const inferredTypesMapped = inferredTypes.map(astUniqueness);
	const typeUnique = astUniqueness(type);
	const includes = inferredTypesMapped.includes(typeUnique);

	return [includes, inferredTypes];
}

/**
 * function to check if a type argument may be assigned to a type parameter
 *
 * **TODO** build this function out
 */
export function isTypeAssignable(_arg: ASTType, _param: ASTType, _options: Options): boolean {
	// try uniqness first, only if they match
	const argUniqness = astUniqueness(_arg);
	const paramUniqness = astUniqueness(_param);
	if (argUniqness === paramUniqness) {
		return true;
	}

	// TODO build type constraints

	// TODO check if arg is a subtype of param
	// TODO check if arg is a supertype of param

	return false;
}

/**
 * Finds the intersection of 2 arrays
 *
 * @param items1 Array 1
 * @param items2 Array 2
 * @returns
 */
export function intersect<T extends ASTType>(items1: T[], items2: T[]): T[] {
	return _.intersectionBy(items1, items2, astUniqueness);
}

/**
 * Finds the intersection of N arrays
 *
 * @param items Array of arrays
 * @returns A 1D array
 */
export function intersectN<T extends ASTType>(items: T[][]): T[] {
	return items.reduce(intersect);
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
export function findDuplicates(arr: string[]): number[][] {
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

/** Reusable message stencil */
export const messageStencil = (prefix: string, expecting: string, node: Node | undefined) => {
	return `${prefix}: We were expecting ${expecting}${node ? `, but found a "${node.type}" instead` : ''}`;
};
