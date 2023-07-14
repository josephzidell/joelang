export type BitCount = 8 | 16 | 32 | 64; // TODO add support for 128 bit numbers

export type SizeInfo = {
	type: 'int' | 'uint' | 'dec';
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

export const numberSizeDetails: Record<NumberSize, SizeInfo> = {
	int8: {
		type: 'int',
		bits: 8,
		min: -128,
		max: 127,
	},
	int16: {
		type: 'int',
		bits: 16,
		min: -32768,
		max: 32767,
	},
	int32: {
		type: 'int',
		bits: 32,
		min: -2147483648,
		max: 2147483647,
	},
	int64: {
		type: 'int',
		bits: 64,
		min: -9223372036854775808,
		max: 9223372036854775807n,
	},
	uint8: {
		type: 'uint',
		bits: 8,
		min: 0,
		max: 255,
	},
	uint16: {
		type: 'uint',
		bits: 16,
		min: 0,
		max: 65535,
	},
	uint32: {
		type: 'uint',
		bits: 32,
		min: 0,
		max: 4294967295,
	},
	uint64: {
		type: 'uint',
		bits: 64,
		min: 0,
		max: 18446744073709551615n,
	},
	dec32: {
		type: 'dec',
		bits: 32,
		// eslint-disable-next-line prettier/prettier
		min: -0.000000e-95,
		max: 9.999999e96,
	},
	dec64: {
		type: 'dec',
		bits: 64,
		// eslint-disable-next-line prettier/prettier
		min: -0.000000000000000e-383,
		// eslint-disable-next-line @typescript-eslint/no-loss-of-precision
		max: 9.999999999999999e384,
	},
};
