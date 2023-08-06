import { Result, ResultError } from './result';

export function whenResult<R, T, E extends Error = Error, ED = unknown>(
	condition: Result<T, E, ED>,
	cases: {
		Ok: (value: T) => R;
		Error: (error: E, data: ED | undefined, condition: ResultError<E, ED>) => R;
	},
): R {
	if (condition.isOk()) {
		return cases.Ok(condition.value);
	}

	return cases.Error(condition.error, condition.data, condition);
}
