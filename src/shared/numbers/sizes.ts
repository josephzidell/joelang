import { ASTType, ASTTypeNumber, ASTUnaryExpression } from '../../analyzer/asts';
import Equality from '../equality';

export type BitCount = 8 | 16 | 32 | 64; // TODO add support for 128 bit numbers

export type NumberCat = 'int' | 'uint' | 'dec';

export type SizeInfo = {
	cat: NumberCat;
	bits: BitCount;
	min: number;
	max: number | bigint;
};

export const numberSizesSignedInts = ['int8', 'int16', 'int32', 'int64'] as const;
export const numberSizesUnsignedInts = ['uint8', 'uint16', 'uint32', 'uint64'] as const;
export const numberSizesInts = [...numberSizesSignedInts, ...numberSizesUnsignedInts] as const;
export const numberSizesDecimals = ['dec32', 'dec64'] as const;
export const numberSizesAll = [...numberSizesInts, ...numberSizesDecimals] as const;
export type NumberSize = (typeof numberSizesAll)[number];

export function compareSizes(a: NumberSize, b: NumberSize): Equality {
	return compareSizeInfos(numberSizeDetails[a], numberSizeDetails[b]);
}

export function compareSizeInfos(a: SizeInfo, b: SizeInfo): Equality {
	if (a.bits < b.bits) {
		return Equality.LessThan;
	}

	if (a.bits > b.bits) {
		return Equality.GreaterThan;
	}

	return Equality.Equal;
}

export const numberSizeDetails: Record<NumberSize, SizeInfo> = {
	int8: {
		cat: 'int',
		bits: 8,
		min: -128,
		max: 127,
	},
	int16: {
		cat: 'int',
		bits: 16,
		min: -32768,
		max: 32767,
	},
	int32: {
		cat: 'int',
		bits: 32,
		min: -2147483648,
		max: 2147483647,
	},
	int64: {
		cat: 'int',
		bits: 64,
		min: -9223372036854775808,
		max: 9223372036854775807n,
	},
	uint8: {
		cat: 'uint',
		bits: 8,
		min: 0,
		max: 255,
	},
	uint16: {
		cat: 'uint',
		bits: 16,
		min: 0,
		max: 65535,
	},
	uint32: {
		cat: 'uint',
		bits: 32,
		min: 0,
		max: 4294967295,
	},
	uint64: {
		cat: 'uint',
		bits: 64,
		min: 0,
		max: 18446744073709551615n,
	},
	dec32: {
		cat: 'dec',
		bits: 32,
		// eslint-disable-next-line prettier/prettier
		min: -0.000000e-95,
		max: 9.999999e96,
	},
	dec64: {
		cat: 'dec',
		bits: 64,
		// eslint-disable-next-line prettier/prettier
		min: -0.000000000000000e-383,
		// eslint-disable-next-line @typescript-eslint/no-loss-of-precision
		max: 9.999999999999999e384,
	},
};

/**
 * This method behaves as follows:
 * - If all types are number types, it returns an array containing JUST the smallest number type.
 * - If any type is not a number type, it returns the original array.
 */
export function filterToSmallestNumberSizeIfAllAreNumberTypes(types: ASTType[]): ASTType[] {
	if (types.length === 0) {
		return types;
	}

	// if any type is not a number type, return the original array
	if (types.some((type) => !(type instanceof ASTTypeNumber) && !(type instanceof ASTUnaryExpression))) {
		return types;
	}

	// take the first one, since they're sorted from smallest to largest
	return [types[0]];
}

export function max(a: NumberSize, b: NumberSize): NumberSize {
	return numberSizesAll[Math.max(numberSizeDetails[a].bits, numberSizeDetails[b].bits)];
}
