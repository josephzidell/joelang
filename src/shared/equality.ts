enum Equality {
	LessThan = -1,
	Equal = 0,
	GreaterThan = 1,
}

export default Equality;

/** Equality helper funcs */
export const EqualityChecks = {
	/** Helper func to check if an Equality is lessThan */
	lessThan: (equality: Equality): boolean => {
		return equality === Equality.LessThan;
	},

	/** Helper func to check if an Equality is lessThanOrEqual */
	lessThanOrEqual: (equality: Equality): boolean => {
		return equality === Equality.LessThan || equality === Equality.Equal;
	},

	/** Helper func to check if an Equality is greaterThan */
	greaterThan: (equality: Equality): boolean => {
		return equality === Equality.GreaterThan;
	},

	/** Helper func to check if an Equality is greaterThanOrEqual */
	greaterThanOrEqual: (equality: Equality): boolean => {
		return equality === Equality.GreaterThan || equality === Equality.Equal;
	},

	/** Helper func to check if an Equality is equal */
	equal: (equality: Equality): boolean => {
		return equality === Equality.Equal;
	},

	/** Helper func to check if an Equality is notEqual */
	notEqual: (equality: Equality): boolean => {
		return equality !== Equality.Equal;
	},
};
