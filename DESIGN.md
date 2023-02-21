- [Language Design](#language-design)
	- [Types](#types)
		- [Type Inference](#type-inference)
	- [Variables](#variables)
	- [Functions](#functions)
		- [Special Function Situations](#special-function-situations)
	- [Conditionals](#conditionals)
	- [When](#when)

# Language Design

joelang is a strongly typed scripting language focused on easy code writing/reading.

"Any fool can write code that a computer can understand. Good programmers write code that humans can understand." – Martin Fowler

## Types

- Numbers `123`, `9,876`, `100001.0002`, `3^e2`
- Strings `'foo'`, `"foo"`
- Boolean `true`, `false`
- Path `@/path/to/file/relative/to/calling/dir`, `./path/relative/to/current/file` (this will be cross-OS, so Windows paths will use Unix style, eg: use `./code/joe/file` instead of `.\code\joe\file`
- Array `[1, 2, 3]`, `['a', 'b']`, `[1, 2 if condition, 3]`
- Tuple `<1, 'pizza', 3.14>`, `<1, 'pizza' if they have, 3.14>`
- POJO (Plain Ol' Joe Object) `{a: 1, b: 2 if condition, c: 3}`
- When statements return a value

### Type Inference

Often the type can be inferred

```joelang
const boolean = true; // bool
const file = ./foo.joe; // path
const num = 3; // number
const str = "hello"; // string
const ary = ['foo', 'bar']; // array<string>
const range = 1..10; // array<number> since it's a range. In joelang, ranges are always inclusive on both sides
const tpl = <1, 'fun', 3.4, false>; // tuple
const object = {a: 1, b: 2}; // object (POJO - Plain Ol' Joe Object)
const myMethod = f {...} // function type (as opposed to a regular function `f myMethod {}`)
```

If you instantiate a variable without assigning it immediately, a type is required:

```joelang
let myName: string; // assign after, OK
let myName; // error missing type or assigment
const myName; // error missing assignment, since constants cannot be reassigned
```

## Variables

Variable names must match this regular expression: `[_a-zA-Z][_a-zA-Z0-9]*\??`.

Some valid variable names include:
`_`, `foo345`, `isDone?`

Variable names that end with a `?` will be a bool, but is not required to used.

```joelang
// both of these are valid
const isDone = true;
const isDone? = true;

// this, however, is invalid
const num? = 5;
```

## Functions

Functions are defined with the `f` keyword, followed by the function name, optionally arguments, optionally return types, and then curly braces for the body.

Function names must match this regular expression: `[_a-zA-Z][_a-zA-Z0-9]*\??!?`

```joelang
// no args, no return
f myName {};

// args
f myName (arg1: number, arg2: MyType, arg3 = true) {};

// single return
f myName -> string {};

// multiple return
f myName -> string, number, etc. {};

// you can assign a function to a variable (notice the semicolon)
const myName = f {...}; // usual things apply: args, return types, etc.
```

### Special Function Situations

Function names that end with a `?` must return a bool, only. But it is not required, and a function that returns a bool does not need the `?`.

```joelang
// must return bool
f isDone? -> bool {}
```

Functions that (may) throw an error **must** end with a `!`. Conversely, functions that end with a `!` must throw an error in at least one situation.

```joelang
f danger! {
	throw Error if something bad happens;
}
```

If a function returns a bool **and** throws an error, the `?` precedes the `!`

```joelang
f isDone?! {
	throw Error if something bad happens;

	return true;
}
```

## Conditionals

If statements can be specified before or after the statement.

```joelang
// before
if someCondition {
	do();
}

if someCondition {
	do();
} else if otherCondition {
	other();
} else {
	lastResort();
}

// after
do() if someCondition;

// this can be used in arrays
[1, 2 if someCondition, 3] // array will either be [1, 2, 3] or [1, 3]

// in tuples
<1, 'fun', 3.14 if wantPie, false> // same idea

// and in POJOs
{a: 1, b: 2 if condition, c: 3} // `b` will not be in object if condition is false
// if you want the property to always be there, use a ternary
{a: 1, b: condition ? 2 : 0, c: 3} // `b` will definitely be in object
```

## When

Pattern matching is done with the `when` keyword.

Each branch can be one or more values, a range or array of possible values, or `...` for anything else (similar to `default` in C-type languages)

The types of each values must match the type of the conditional variable.
The return type of each branch must be the same.

The `when` structure will always return a value, which may be captured in a variable or returned.

```joelang
// set a string variable
const size = when someNumber {
	// if someNumber is 1 or 2
	1, 2 -> 'small',

	// between 3 and 10 (inclusive)
	3..10 -> 'medium',

	// do stuff before, and use explicit return
	11 -> {
		doThing1();
		doThing2();

		return 'large';
	},

	// or call a function, whose return value will be used
	12 -> someFunction(),

	// any other value
	... -> 'off the charts',
}

// `when`s don't have to return anything
when someNumber {
	// call a function
	1, 2 -> small(),

	3..10 -> medium(),

	// fallback function to call
	... -> offTheCharts(),
}

// if you need to do multiple things in a branch, wrap in braces
when someNumber {
	// call a function
	1, 2 -> somethingSimple(),

	3..10 -> {
		doComplicatedThing1();
		doComplicatedThing2();
	},

	// fallback function to call
	... -> offTheCharts(),
}

// returning
f foo {
	return when ... { ... };
}
```
