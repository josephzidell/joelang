import _ from 'lodash';
import { Node } from '../parser/types';
import { getNumberSizesFromTypes, numberSizeDetails, numberSizesSignedInts } from '../shared/numbers/sizes';
import { filterASTTypeNumbersWithBitCountsLowerThan, getLowestBitCountOf } from '../shared/numbers/utils';
import { Result, ok } from '../shared/result';
import {
	AST,
	ASTArrayExpression,
	ASTArrayOf,
	ASTBinaryExpression,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTIdentifier,
	ASTNumberLiteral,
	ASTObjectExpression,
	ASTObjectShape,
	ASTPath,
	ASTPostfixIfStatement,
	ASTPropertyShape,
	ASTRangeExpression,
	ASTRegularExpression,
	ASTStringLiteral,
	ASTTernaryExpression,
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
	AssignableASTs,
	ExpressionASTs,
	NumberSizesDecimalASTs,
	astUniqueness,
} from './asts';
import { SymbolTable } from './symbolTable';

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
): Result<void> {
	// whether we got types or not, call the assigner.
	// Worst case, we could not infer possible types: ok :) 🤷 ¯\_(ツ)_/¯
	// TODO: This will change as the compiler is built out more
	assigner(inferPossibleASTTypesFromASTAssignable(valueAST, options));

	// either way, we're done
	return ok(undefined);
}

/**
 * Attempts to infer possible ASTTypes from an ASTAssignable.
 * This is very forgiving, and only returns an error in extremely unlikely cases.
 */
export function inferPossibleASTTypesFromASTAssignable(expr: AST, options: Options): ASTType[] {
	switch (expr.constructor) {
		case ASTArrayExpression:
			{
				// if the array is empty, we can't infer anything
				if ((expr as ASTArrayExpression<ExpressionASTs>).items.length === 0) {
					return [];
				}

				// map the child type maybe into a Maybe<ASTArrayOf>
				// if we can infer the type of the child, we can infer the type of the array
				return inferPossibleASTTypesFromASTAssignable(
					(expr as ASTArrayExpression<ExpressionASTs>).items[0],
					options,
				).map((childType) => ASTArrayOf._(childType, expr.pos));
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
						return [ASTTypePrimitiveBool(expr.pos)];
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
							const leftNumberPossibleTypes = inferPossibleASTTypesFromASTAssignable(
								binaryExpr.left,
								options,
							);
							const rightNumberPossibleTypes = inferPossibleASTTypesFromASTAssignable(
								binaryExpr.right,
								options,
							);

							// ensure all are ASTTypeNumbers and get sizes

							const leftNumberPossibleSizes = getNumberSizesFromTypes(leftNumberPossibleTypes);
							const rightNumberPossibleSizes = getNumberSizesFromTypes(rightNumberPossibleTypes);

							// for exponent
							if (operator === '^e') {
								// if the right side is a negative exponent, the number size must be a decimal
								if (
									binaryExpr.right.constructor === ASTUnaryExpression &&
									binaryExpr.right.operator === '-'
								) {
									// get the lowest bit count of the left number's possible sizes
									const [firstNumberSize, ...rest] = leftNumberPossibleSizes;
									const lowestBitCount = getLowestBitCountOf(firstNumberSize, ...rest);

									// return decimal number sizes that are at least as big as the left number's lowest bit count
									return filterASTTypeNumbersWithBitCountsLowerThan(
										NumberSizesDecimalASTs.map((ns) => ns(expr.pos)),
										lowestBitCount,
									);
								}

								// take the left number size
								return leftNumberPossibleSizes.map((ns) => ASTTypeNumber._(ns, expr.pos));
							}

							// or if both numbers are the same size, take that size
							if (_.isEqual(leftNumberPossibleSizes, rightNumberPossibleSizes)) {
								return leftNumberPossibleSizes.map((ns) => ASTTypeNumber._(ns, expr.pos));
							}

							return _.intersection(leftNumberPossibleSizes, rightNumberPossibleSizes).map((ns) =>
								ASTTypeNumber._(ns, expr.pos),
							);
						}
						break;
				}
			}
			break;
		case ASTBoolLiteral:
			return [ASTTypePrimitiveBool(expr.pos)];
			break;
		case ASTCallExpression:
			{
				const callExpr = expr as ASTCallExpression;
				switch (callExpr.callee.constructor) {
					// TODO ASTCallExpression | ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression
					case ASTIdentifier:
						return inferPossibleASTTypesFromASTAssignable(callExpr.callee, options);
				}
				// // look up the callee in the symbol table
				// const lookupResult = symbolTable.lookup(callExpr.callee.);
			}
			break;
		case ASTIdentifier:
			{
				const identifier = expr as ASTIdentifier;

				// look up the identifier in the symbol table
				const lookupResult = SymbolTable.lookup(
					identifier.name,
					['function', 'parameter', 'variable'],
					options,
				);
				if (!lookupResult.has()) {
					// TODO: return an undefined variable error
					return [];
				}

				if (lookupResult.value.kind === 'function') {
					// if the function has declared return types, return those
					if (lookupResult.value.returnTypes) {
						return lookupResult.value.returnTypes;
					}

					// otherwise, we can't infer anything
					return [];
				} else if (lookupResult.value.kind === 'variable') {
					// if the variable has a declared type, return that
					if (lookupResult.value.declaredType) {
						return [lookupResult.value.declaredType];
					}

					// if the variable has a value, infer the type of the value
					if (lookupResult.value.value) {
						return inferPossibleASTTypesFromASTAssignable(lookupResult.value.value, options);
					}

					// otherwise, we can't infer anything
					return [];
				} else if (lookupResult.value.kind === 'parameter') {
					// if the parameter has a declared type, return that
					if (lookupResult.value.type) {
						return [lookupResult.value.type];
					}

					// if the parameter has a default value, infer the type of the value
					if (lookupResult.value.defaultValue) {
						return inferPossibleASTTypesFromASTAssignable(lookupResult.value.defaultValue, options);
					}

					// otherwise, we can't infer anything
					return [];
				}

				return [];
			}
			break;
		case ASTNumberLiteral:
			return (expr as ASTNumberLiteral).possibleSizes.map((size) => ASTTypeNumber._(size, expr.pos));
			break;
		case ASTObjectExpression:
			{
				const propertiesShapes = (expr as ASTObjectExpression).properties.map((property) =>
					ASTPropertyShape._(
						property.key,
						inferPossibleASTTypesFromASTAssignable(property.value, options),
						expr.pos,
					),
				);

				return [ASTObjectShape._(propertiesShapes, expr.pos)];
			}
			break;
		case ASTPath:
			return [ASTTypePrimitivePath(expr.pos)];
			break;
		case ASTPostfixIfStatement:
			return inferPossibleASTTypesFromASTAssignable((expr as ASTPostfixIfStatement).expression, options);
			break;
		case ASTRangeExpression:
			return [ASTTypeRange._(expr.pos)];
			break;
		case ASTRegularExpression:
			return [ASTTypePrimitiveRegex(expr.pos)];
			break;
		case ASTStringLiteral:
			return [ASTTypePrimitiveString(expr.pos)];
			break;
		case ASTTernaryExpression:
			{
				const ternaryExpr = expr as ASTTernaryExpression<AssignableASTs, AssignableASTs>;
				const typesOfConsequent = inferPossibleASTTypesFromASTAssignable(ternaryExpr.consequent.value, options);
				const typesOfAlternate = inferPossibleASTTypesFromASTAssignable(ternaryExpr.alternate.value, options);

				return _.intersectionBy(typesOfConsequent, typesOfAlternate, astUniqueness);
			}
			break;
		case ASTTupleExpression:
			{
				const possibleShapes = (expr as ASTTupleExpression).items.map((item) =>
					inferPossibleASTTypesFromASTAssignable(item, options),
				);

				return [ASTTupleShape._(possibleShapes, expr.pos)];
			}
			break;
		case ASTUnaryExpression:
			{
				const unaryExpression = expr as ASTUnaryExpression<ExpressionASTs>;
				const operator = unaryExpression.operator;
				switch (operator) {
					case '!':
						return [ASTTypePrimitiveBool(expr.pos)];
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

							// otherwise include all possible sizes, and map them to ASTTypeNumbers
							return possibleSizes.map((ns) => ASTTypeNumber._(ns, expr.pos));
						}

						// todo check the possible types of other operands
						break;
				}
			}
			break;
		// case ASTWhenExpression:
		// 	{
		// 		const whenExpr = expr as ASTWhenExpression;

		// 		// get possible types from the first when case
		// 		const possibleTypesFromWhenCases = whenExpr.cases.map((whenCase) => {
		// 			return inferPossibleASTTypesFromASTAssignable(whenCase.consequent, symbolTable);
		// 		});

		// 		const intersection = intersectN(possibleTypesFromWhenCases);

		// 		return intersection;
		// 	}
		// 	break;
		default:
			console.error('inferPossibleASTTypesFromASTAssignable: unhandled expression type', expr.constructor.name);
			// TODO more work needed here. Discover inferred type of CallExpression, MemberExpression, MemberListExpression, and more
			return [];
	}

	return [];
}

/** function to check if a value may be assigned to a variable/parameter of a given type */
export function isAssignable(value: AssignableASTs, type: ASTType, options: Options): [boolean, ASTType[]] {
	const inferredTypes = inferPossibleASTTypesFromASTAssignable(value, options);
	const inferredTypesMapped = inferredTypes.map(astUniqueness);
	const typeUnique = astUniqueness(type);

	const includes = inferredTypesMapped.includes(typeUnique);
	// most of time checking whether the inferred types include the destination
	// type suffices. However, for numbers the behavior can be different in that
	// a small number can be assigned to a larger number, being careful that
	// ints/uints/decs remain separate.
	if (includes || !(type instanceof ASTTypeNumber && inferredTypes.some((t) => t.kind === 'TypeNumber'))) {
		return [includes, inferredTypes];
	}

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

/**
 * Finds the intersection of 2 arrays
 *
 * @param items1 Array 1
 * @param items2 Array 2
 * @returns
 */
export function intersect<T>(items1: T[], items2: T[]): T[] {
	const map = new Map<T, number>();
	for (const item of items1) {
		map.set(item, (map.get(item) ?? 0) + 1);
	}

	const res = [];
	for (const item of items2) {
		if (map.has(item) && map.get(item) !== 0) {
			res.push(item);
			map.set(item, (map.get(item) ?? 0) - 1);
		}
	}
	return res;
}

/**
 * Finds the intersection of N arrays
 *
 * @param items Array of arrays
 * @returns A 1D array
 */
export function intersectN<T>(...items: T[][]) {
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
