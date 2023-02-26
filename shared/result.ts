/**
 * This is an adaptation of the Result enum in Joelang
 */
export type Result<T> = {
	outcome: 'ok',
	value: T
} | {
	outcome: 'error',
	error: Error,
};

export function ok<T>(value: T): Result<T> {
	return { outcome: 'ok', value };
}

export function error<T,>(error: Error): Result<T> {
	return { outcome: 'error', error };
}
