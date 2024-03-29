import assert from 'node:assert';
import { Maybe } from './maybe';
import { AST, ASTTypeList } from '../analyzer/asts';

export type Result<T, E extends Error = Error, ED = unknown> = ResultOk<T> | ResultError<E, ED>;

/**
 * This is an adaptation of the Result enum in Joelang
 */
abstract class SomeResult<T, E extends Error = Error, ED = unknown> {
	// /**
	//  * Indicates if this result is OK or not
	//  */
	// readonly _ok!: boolean;

	// constructor(ok: boolean) {
	// 	this._ok = ok;
	// }

	public abstract isOk(): this is ResultOk<T>;

	public abstract isError(): this is ResultError<E, ED>;

	// /**
	//  * Maps the value, error, and error data of a Result to new values
	//  *
	//  * @param valueFn To convert the value of an OK result
	//  * @param errorFn To convert the error of an error result
	//  * @param errorDataFn To convert the error data of an error result
	//  * @returns a modified result
	//  */
	// public mapResultIfOk<U, F extends Error = Error, FD = unknown>(
	// 	result: Result<U, F, FD>,
	// ): Result<U, E | F, ED | FD> {
	// 	if (this.isOk()) {
	// 		return result;
	// 	}

	// 	return this;
	// }

	/**
	 * Maps the value of a Result in the event it's OK
	 *
	 * @param fn To convert the value of an OK result
	 * @returns a possibly modified result
	 */
	public mapValue<U, E extends Error = Error, ED = unknown>(fn: (value: T) => U): Result<U, E, ED> {
		if (this.isOk()) {
			return ok(fn(this.value));
		}

		assert(this.isError()); // needed for TS
		return error(this.error, this.data) as unknown as Result<U, E, ED>;
	}

	/**
	 * Maps the error of a Result in the event it's an error
	 *
	 * @param errorFn To convert the error of an error result
	 * @returns a possibly modified result
	 */
	public mapError<F extends Error = Error, FD = unknown>(
		errorFn: (error: E) => F,
		dataFn: (data: ED | undefined) => FD | undefined,
	): Result<T, F, FD> {
		if (this.isOk()) {
			return ok(this.value);
		}

		assert(this.isError()); // needed for TS
		return error(errorFn(this.error), typeof this.data !== 'undefined' ? dataFn(this.data) : this.data); // as unknown as Result<T, F, ED>;
	}

	/**
	 * Maps the error data of a Result in the event it's an Error
	 *
	 * @param fn To convert the error data of an Error result
	 * @returns a possibly modified result
	 */
	public mapErrorData<NewData>(data: NewData): Result<T, E, NewData> {
		if (this.isError()) {
			return error(this.error, data);
		}

		assert(this.isOk()); // needed for TS
		return ok(this.value);
	}
}

export class ResultOk<T> extends SomeResult<T> {
	/**
	 * Indicates if this result is OK or not
	 */
	readonly outcome = 'ok';

	/**
	 * The value of this maybe
	 */
	readonly value: T;

	constructor(value: T) {
		super();

		this.value = value;
	}

	public isOk(): this is ResultOk<T> {
		return true;
	}

	public isError(): this is ResultError<Error, unknown> {
		return false;
	}

	public unwrapOr(_defaultValue: T): T {
		return this.value;
	}

	/**
	 * If the Result is Ok, map the value, error, and error data of a Result to new values,
	 * otherwise keep the same error and error data.
	 *
	 * This is useful for chaining together multiple results, where the error and error data
	 * of the first result should be kept if it's an error, otherwise keep on going to
	 * subsequent chained calls.
	 *
	 * @param valueFn To convert the value of an OK result
	 * @param errorFn To convert the error of an error result
	 * @param errorDataFn To convert the error data of an error result
	 * @returns a modified result
	 */
	public mapResultIfOk<U, F extends Error = Error, FD = unknown>(result: (oldValue: T) => Result<U, F, FD>): Result<U, F, FD> {
		return result(this.value);
	}
}

export class ResultError<E extends Error, ED = unknown> extends SomeResult<never, E, ED> {
	/**
	 * Indicates if this result is OK or not
	 */
	readonly outcome = 'error';
	readonly error: E;
	readonly data?: ED;
	constructor(error: E, data?: ED) {
		super();

		this.error = error;
		this.data = data;
	}

	public isOk(): this is ResultOk<never> {
		return false;
	}

	public isError(): this is ResultError<E, ED> {
		return true;
	}

	public unwrapOr<T>(defaultValue: T): T {
		return defaultValue;
	}

	/**
	 * If the Result is Ok, map the value, error, and error data of a Result to new values,
	 * otherwise keep the same error and error data.
	 *
	 * This is useful for chaining together multiple results, where the error and error data
	 * of the first result should be kept if it's an error, otherwise keep on going to
	 * subsequent chained calls.
	 *
	 * @param valueFn To convert the value of an OK result
	 * @param errorFn To convert the error of an error result
	 * @param errorDataFn To convert the error data of an error result
	 * @returns a modified result
	 */
	public mapResultIfOk<U, F extends Error = Error, FD = unknown>(): Result<U, E | F, ED | FD> {
		return this;
	}
}

/** Shortcut to create an ok Result */
export function ok<T>(value: T): ResultOk<T> {
	return new ResultOk(value);
}

/** Shortcut to create an error Result */
export function error<E extends Error = Error, ED = unknown>(error: E, data?: ED): ResultError<E, ED> {
	return new ResultError(error, data);
}

export const Results = {
	allOk<T>(results: Result<T>[]): results is ResultOk<T>[] {
		return results.every((result) => result.isOk());
	},

	anyIsError<T>(results: Result<T>[]): boolean {
		return results.some((result) => !result.isOk());
	},

	/**
	 * Gets the first error in an array of Results, one of which definitely has an error.
	 *
	 * WANRING: Be sure to call allOk() or anyIsError() first!
	 *
	 * @param results
	 * @returns
	 */
	getFirstError<T, E extends Error, ED = unknown>(results: Result<T, E, ED>[]): ResultError<E, ED> {
		return results.find((result) => result.isError()) as ResultError<E, ED>;
	},

	/**
	 * get values of array of results. If any of the results are errors, throw an error.
	 * @param results To unwrap
	 * @returns An array of the values of the results
	 */
	unwrapResults<T>(results: Result<T>[]): T[] {
		return results.map((result) => {
			if (result.isError()) {
				throw new Error(`unwrapResults: result is not ok: ${result.error.message}`);
			}

			return result.value;
		});
	},
};

export const CreateResultFrom = {
	/**
	 * Creates a Result from an array of Results by flattening the array into a single result, only 1 level deep.
	 *
	 * Note this is not recursive. Also note all array elements must be the same type.
	 *
	 * @param results To flatten
	 * @returns A new Result, ok if all the results are ok, error if any of the results have an error
	 */
	arrayOfResults<T, E extends Error = Error, ED = unknown>(results: Result<T, E, ED>[]): Result<T[], E, ED> {
		if (Results.allOk(results)) {
			return ok(results.map((result) => result.value));
		}

		const errors = results.filter((result) => result.isError()).map((result) => (result as unknown as ResultError<E, ED>).error);

		// TODO: this is a bit of a hack, but it's the best I can do for now
		// This combines all the errors into a single error, recycling the first one
		// since we need an instance of E, and I'm not sure how to create a new one
		const firstError = errors[0];
		firstError.message = errors.map((error) => error.message).join(';');

		return error(firstError);
	},

	boolean<T extends boolean, E extends Error = Error, ED = unknown>(value: T, errorIfFalse: E, data?: ED): Result<T, E, ED> {
		if (value === false) {
			return error(errorIfFalse, data);
		}

		return ok(value) as unknown as Result<T, E, ED>;
	},

	dataArrayNotHavingLength0<Item, T extends Item[], E extends Error = Error, ED = unknown>(
		value: T,
		errorIfFalse: E,
		data?: ED,
	): Result<T, E, ED> {
		if (value.length === 0) {
			return error(errorIfFalse, data);
		}

		return ok(value) as unknown as Result<T, E, ED>;
	},

	astListNotBeingEmpty<A extends AST, T extends ASTTypeList<A>, E extends Error = Error, ED = unknown>(
		value: T,
		errorIfFalse: E,
		data?: ED,
	): Result<T, E, ED> {
		if (value.items.length === 0) {
			return error(errorIfFalse, data);
		}

		return ok(value);
	},

	maybe<T, E extends Error = Error, ED = unknown>(maybe: Maybe<T>, err: E, data?: ED): Result<T, E, ED> {
		if (maybe.has()) {
			return ok(maybe.value);
		}

		return error(err, data);
	},

	possiblyUndefined<T, E extends Error = Error, ED = unknown>(value: T | undefined, errorIfUndefined: E, data?: ED): Result<T, E, ED> {
		if (typeof value === 'undefined') {
			return error(errorIfUndefined, data);
		}

		return ok(value) as unknown as Result<T, E, ED>;
	},
};

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
 * const someResult = listenForRequest();
 * switch (someResult.outcome) { // outcome: `ok` or `error`
 * 	case 'ok':
 * 		const somePossibility = someResult.value;
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
 * 		console.error(someResult.error);
 * 		break;
 * }
 * ```
 */
export type ResultAndAMaybe<T, E extends Error = Error, ED = unknown> = Result<Maybe<T>, E, ED>;
