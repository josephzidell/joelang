import { Log } from './log';

/**
 * This is an adaptation of the Maybe enum in Joelang
 */
export abstract class Maybe<T> {
	/**
	 * Indicates if this maybe has a value or not
	 */
	readonly _has!: boolean;

	constructor(has: boolean) {
		this._has = has;
	}

	public has(): this is MaybeHas<T> {
		return this._has;
	}

	public hasNot(): this is MaybeHasNot {
		return !this._has;
	}

	public unwrapOr(other: T): T {
		if (this.has()) {
			return this.value;
		}

		return other;
	}

	public mustGetValue(): T {
		const that = this as unknown as MaybeHas<T>;

		return that.value;
	}

	/**
	 * If this maybe has a value, maps it to another value.
	 *
	 * @param fn The function to map with
	 * @returns A new maybe, has if this maybe has, hasNot if this maybe has not
	 *
	 * @example
	 * const maybe = has(1);
	 * const mapped = maybe.map(value => value + 1);
	 * // mapped is has(2)
	 *
	 * @example
	 * const maybe = hasNot();
	 * const mapped = maybe.map(value => value + 1);
	 * // mapped is hasNot()
	 */
	public map<U>(fn: (value: T) => U): Maybe<U> {
		if (this.has()) {
			return has(fn(this.value));
		}

		return hasNot();
	}

	/**
	 * If this maybe has a value, maps it to another maybe and flatten to a single maybe.
	 *
	 * @param fn The function to map with
	 * @returns A new maybe, has if this maybe has, hasNot if this maybe has not
	 *
	 * @example
	 * const maybe = has(1);
	 * const mapped = maybe.map(value => has(value + 1));
	 * // mapped is has(2)
	 *
	 * @example
	 * const maybe = hasNot();
	 * const mapped = maybe.map(value => has(value + 1));
	 * // mapped is hasNot()
	 */
	public mapFlat<U>(fn: (value: T) => Maybe<U>): Maybe<U> {
		if (this.has()) {
			return fn(this.value);
		}

		return hasNot();
	}

	public debug(log: Log) {
		if (this.has()) {
			log.vars({
				has: this._has,
				value: this.value,
			});
		} else {
			log.vars({
				has: this._has,
			});
		}
	}

	static allHave<T>(maybes: Maybe<T>[]): maybes is MaybeHas<T>[] {
		return maybes.every((maybe) => maybe.has());
	}

	static anyHasNot<T>(maybes: Maybe<T>[]): maybes is MaybeHasNot[] {
		return maybes.some((maybe) => !maybe.has());
	}

	/**
	 * Flattens an array of maybes into a single maybe, only 1 level deep.
	 *
	 * Note this is not recursive. Also note all the maybes must be the same type.
	 *
	 * @param maybes To flatten
	 * @returns A new Maybe, has if all the maybes have, hasNot if any of the maybes have not
	 */
	static flatten<T>(maybes: Maybe<T>[]): Maybe<T[]> {
		if (Maybe.allHave(maybes)) {
			return has(maybes.map((maybe) => maybe.value));
		}

		return hasNot();
	}
}

class MaybeHas<T> extends Maybe<T> {
	/**
	 * The value of this maybe
	 */
	readonly value: T;

	constructor(value: T) {
		super(true);

		this.value = value;
	}
}

class MaybeHasNot extends Maybe<never> {
	constructor() {
		super(false);
	}
}

export function has<T>(value: T): MaybeHas<T> {
	return new MaybeHas(value);
}

export function hasNot(): MaybeHasNot {
	return new MaybeHasNot();
}

export function maybeIfNotUndefined<T>(value: T | undefined): Maybe<T> {
	if (typeof value === 'undefined') {
		return hasNot();
	}

	return has(value);
}
