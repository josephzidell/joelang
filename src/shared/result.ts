import { Maybe } from './maybe';

type ResultOk<T> = {
	outcome: 'ok';
	value: T;
};

export type ResultError<E extends Error, ED> = {
	outcome: 'error';
	error: E;
	data?: ED;
};

/**
 * This is an adaptation of the Result enum in Joelang
 */
export type Result<T, E extends Error = Error, ED = unknown> = ResultOk<T> | ResultError<E, ED>;

/** Shortcut to create an ok Result */
export function ok<T, E extends Error = Error, ED = unknown>(value: T): Result<T, E, ED> {
	return { outcome: 'ok', value };
}

/** Shortcut to create an error Result */
export function error<T, E extends Error = Error, ED = unknown>(error: E, data?: ED): Result<T, E, ED> {
	return { outcome: 'error', error, data };
}

export function createResultFromPossiblyUndefined<T, E extends Error = Error, ED = unknown>(
	value: T | undefined,
	errorIfUndefined: E,
	data?: ED,
): Result<T, E, ED> {
	if (typeof value === 'undefined') {
		return error(errorIfUndefined, data);
	}

	return ok(value);
}

export function createResultFromBoolean<T extends boolean, E extends Error = Error, ED = unknown>(
	value: T,
	errorIfFalse: E,
	data?: ED,
): Result<T, E, ED> {
	if (value === false) {
		return error(errorIfFalse, data);
	}

	return ok(value);
}

export function mapResult<T, U, E extends Error = Error>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
	if (result.outcome === 'ok') {
		return ok(fn(result.value));
	}

	return result;
}

export function isOk<T>(result: Result<T>): result is ResultOk<T> {
	return result.outcome === 'ok';
}

export function isError<T>(result: Result<T>): result is ResultError<Error, unknown> {
	return result.outcome === 'error';
}

export function allOk<T>(results: Result<T>[]): results is ResultOk<T>[] {
	return results.every((result) => result.outcome === 'ok');
}

export function anyIsError<T>(results: Result<T>[]): boolean {
	return results.some((result) => isError(result));
}

// get first error
export function getFirstError<T>(results: Result<T>[]): ResultError<Error, unknown> {
	return results.find((result) => result.outcome === 'error') as ResultError<Error, unknown>;
}

/**
 * get values of array of results. If any of the results are errors, throw an error.
 * @param results To unwrap
 * @returns An array of the values of the results
 */
export function unwrapResults<T>(results: Result<T>[]): T[] {
	return results.map((result) => {
		if (!isOk(result)) {
			throw new Error(`unwrapResults: result is not ok: ${result.error.message}`);
		}

		return result.value;
	});
}

/**
 * Flattens an array of results into a single result, only 1 level deep.
 *
 * Note this is not recursive. Also note all the results must be the same type.
 *
 * @param results To flatten
 * @returns A new Result, ok if all the results are ok, error if any of the results have an error
 */
export function flattenResults<T, E extends Error = Error, ED = unknown>(
	results: Result<T, E, ED>[],
): Result<T[], E, ED> {
	if (allOk(results)) {
		return ok(results.map((result) => result.value));
	}

	const errors = results.filter((result) => isError(result)).map((result) => (result as ResultError<E, ED>).error);

	// TODO: this is a bit of a hack, but it's the best I can do for now
	// This combines all the errors into a single error, recycling the first one
	// since we need an instance of E, and I'm not sure how to create a new one
	const firstError = errors[0];
	firstError.message = errors.map((error) => error.message).join(';');

	return error(firstError);
}

/**
 * Result And A Maybe
 *
 * This is a shortcut to represent a three-state possibilty:
 * a) returned data
 * b) did not result data but is ok
 * c) did not return data and is not ok
 *
 * Some scenarios where this could be useful are polling for new Http Requests,
 * checking a Queue, etc.
 *
 * Example:
 * ```
 * function listenForRequest(): ResultAndAMaybe<Http.Request> {
 * 	// - return ok(has(Http.Request)) if there is a new Request
 * 	// - ok(hasNot()) if there are no new requests
 * 	// - error(new Error('...')) if something went awry
 * }
 *
 * const somePossibleResult = listenForRequest();
 * switch (somePossibleResult.outcome) { // outcome: `ok` or `error`
 * 	case 'ok':
 * 		const somePossibility = somePossibleResult.value;
 * 		if (somePossibility.has()) { // has: true or false
 * 			// use the data
 * 			const req: Http.Request = somePossibility.value;
 * 			req.handle(); // etc
 * 		}
 * 		// no new requests: ok :)
 *
 * 		break;
 *
 * 	// An error occurred
 * 	case 'error':
 * 		console.error(somePossibleResult.error);
 * 		break;
 * }
 * ```
 */
export type ResultAndAMaybe<T, E extends Error = Error, ED = unknown> = Result<Maybe<T>, E, ED>;
