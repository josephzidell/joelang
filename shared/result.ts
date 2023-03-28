import { Maybe } from './maybe';

/**
 * This is an adaptation of the Result enum in Joelang
 */
export type Result<T, E extends Error = Error, ED = unknown> =
	| {
			outcome: 'ok';
			value: T;
	  }
	| {
			outcome: 'error';
			error: E;
			data?: ED;
	  };

/** Shortcut to create an ok Result */
export function ok<T>(value: T): Result<T> {
	return { outcome: 'ok', value };
}

/** Shortcut to create an error Result */
export function error<T, E extends Error = Error, ED = unknown>(error: E, data?: ED): Result<T, E, ED> {
	return { outcome: 'error', error, data };
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
