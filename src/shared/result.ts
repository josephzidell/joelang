import _ from 'lodash';
import { Maybe } from './maybe';

type ResultOk<T> = {
	outcome: 'ok';
	value: T;
};

type ResultError<E extends Error, ED> = {
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

export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
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

export function allMapOk<T, excludeKeys extends string | symbol>(results: {
	[key in Exclude<keyof T, excludeKeys>]: Result<T[key]>;
}): results is {
	[key in Exclude<keyof T, excludeKeys>]: ResultOk<T[key]>;
} {
	return Object.values(results).every((result) => (result as Result<unknown>).outcome === 'ok');
}

export function anyIsError<T>(results: Result<T>[]): results is ResultError<Error, unknown>[] {
	return results.some((result) => result.outcome === 'error');
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
	firstError.message = `flatten: ${errors.map((error) => error.message).join(';')}`;

	return error(firstError);
}

/**
 * Flattens a record of results into a single result, only 1 level deep.
 *
 * Note this is not recursive. Also note all the errors must be the same type.
 *
 * @param map To flatten
 * @returns A new Result, ok if all the results are ok, error if any of the results have an error
 */
export function flattenResultsMap<T, excludeKeys extends string | symbol, E extends Error = Error, ED = unknown>(map: {
	[Tkey in Exclude<keyof T, excludeKeys>]: Result<T[Tkey], E, ED>;
}): Result<{ [Tkey in keyof T]: T[Tkey] }, E, ED> {
	if (allMapOk<T, excludeKeys>(map)) {
		return ok(_.mapValues(map, (result) => result.value) as { [Tkey in keyof T]: T[Tkey] });
	}

	const errors = Object.values(map)
		.filter((result) => isError(result as Result<unknown>))
		.map((result) => (result as ResultError<E, ED>).error);

	// TODO: this is a bit of a hack, but it's the best I can do for now
	// This combines all the errors into a single error, recycling the first one
	// since we need an instance of E, and I'm not sure how to create a new one
	const firstError = errors[0];
	firstError.message = `flatten: ${errors.map((error) => error.message).join(';')}`;

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
