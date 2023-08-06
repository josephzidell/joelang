import { ASTNumberLiteral, ASTTypeNumber, ASTUnaryExpression } from '../../analyzer/asts';
import { Result, error, ok } from '../result';
import { BitCount, NumberSize, numberSizeDetails } from './sizes';

/**
 * Gets the lowest bit count of number sizes. This method must have at least one number size.
 *
 * @param requiredNumberSize First number size to compare
 * @param optionalMoreNumberSizes More number sizes to compare
 * @returns A number bit size that is the lowest bit size of all the number sizes
 */
export const getLowestBitCountOf = (
	requiredNumberSize: NumberSize,
	...optionalMoreNumberSizes: NumberSize[]
): BitCount => {
	const bitCounts = [requiredNumberSize, ...optionalMoreNumberSizes].map(
		(numberSize) => numberSizeDetails[numberSize].bits,
	);

	return Math.min(...bitCounts) as BitCount;
};

/** Determines the possible sizes of a number */
export const determinePossibleNumberSizes = <E extends Error>(
	value: string,
	errFn: (value: string) => E,
): Result<NumberSize[], E> => {
	// remove underscores
	value = value.replace(/_/g, '');

	const possibleSizes: NumberSize[] = [];

	if (value.includes('.')) {
		const num = parseFloat(value);

		if (num >= numberSizeDetails.dec32.min && num <= numberSizeDetails.dec32.max) {
			possibleSizes.push('dec32');
		}

		if (num >= numberSizeDetails.dec64.min && num <= numberSizeDetails.dec64.max) {
			possibleSizes.push('dec64');
		}

		if (possibleSizes.length > 0) {
			return ok(possibleSizes);
		}

		return error(errFn(value));
	}

	const num = parseInt(value);

	if (num >= numberSizeDetails.int8.min && num <= numberSizeDetails.int8.max) {
		possibleSizes.push('int8');
	}

	if (num >= numberSizeDetails.int16.min && num <= numberSizeDetails.int16.max) {
		possibleSizes.push('int16');
	}

	if (num >= numberSizeDetails.int32.min && num <= numberSizeDetails.int32.max) {
		possibleSizes.push('int32');
	}

	if (num >= numberSizeDetails.int64.min && num <= numberSizeDetails.int64.max) {
		possibleSizes.push('int64');
	}

	if (num >= numberSizeDetails.uint8.min && num <= numberSizeDetails.uint8.max) {
		possibleSizes.push('uint8');
	}

	if (num >= numberSizeDetails.uint16.min && num <= numberSizeDetails.uint16.max) {
		possibleSizes.push('uint16');
	}

	if (num >= numberSizeDetails.uint32.min && num <= numberSizeDetails.uint32.max) {
		possibleSizes.push('uint32');
	}

	if (num >= numberSizeDetails.uint64.min && num <= numberSizeDetails.uint64.max) {
		possibleSizes.push('uint64');
	}

	if (possibleSizes.length > 0) {
		return ok(possibleSizes);
	}

	return error(errFn(value));
};

/**
 * Filters ASTTypeNumbers with bit counts lower than a given bit count.
 * @param asts ASTs to filter
 * @param bitCount Bit count to filter by
 * @returns ASTs with bit counts equal to or higher than the given bit count
 *
 * @example
 * filterASTTypeNumbersWithBitCountsLowerThan([ASTTypeNumber._('uint8'), ASTTypeNumber._('int16')], 16) // returns [ASTTypeNumber._('int16')]
 */
export const filterASTTypeNumbersWithBitCountsLowerThan = (
	asts: ASTTypeNumber[],
	bitCount: BitCount,
): ASTTypeNumber[] => {
	return asts.filter((ast) => numberSizeDetails[ast.size].bits >= bitCount);
};

export function getPossibleSizesFromNumberOrUnary(
	expr: ASTNumberLiteral | ASTUnaryExpression<ASTNumberLiteral>,
): NumberSize[] {
	if (expr.constructor === ASTNumberLiteral) {
		return expr.possibleSizes;
	}

	// if it's a unary expression, it could be a negative number
	// so we can only infer the size if the number is a literal
	if (expr.constructor === ASTUnaryExpression) {
		const unaryExpr = expr as ASTUnaryExpression<ASTNumberLiteral>;
		if (unaryExpr.operand.constructor === ASTNumberLiteral) {
			return unaryExpr.operand.possibleSizes;
		}
	}

	return [];
}
