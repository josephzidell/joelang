/**
 * This is an adaptation of the Maybe enum in Joelang
 */
export type Maybe<T> = {
	has: true,
	value: T
} | {
	has: false,
};

export function has<T>(value: T): Maybe<T> {
	return { has: true, value };
}

export function hasNot<T>(): Maybe<T> {
	return { has: false };
}
