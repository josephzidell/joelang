# joelang
A scripting language focused on easy reading

## Quick Start

```bash
# run the lexer

npm run --silent run -- 'your expression'

# run tests

npx jest
```

## Challenge
Many languages are verbose and difficult to read. The goal of joelang is for the developer to read code smoothly, and not have to do mental gymnastics to understand the flow of logic.

Let's establish a few ground truths, which I think we can agree on:
- Code is read far more often than it is written
- Code maintenace is longer than the time it took to write the original version
- Computing power is now cheaper than human time


## Solution
[KISS](https://en.wikipedia.org/wiki/KISS_principle). Keep the syntax concise, simlar to ruby, but without the magic.

In reality, simplicity is hard. But we do the hard work so you can do the easy work.

## Basics

### Types

- Numbers `123`, `9,876`, `100001.0002`, `3^e2` :heavy_check_mark: Lexer
- Strings `'foo'`, `"foo ${bar}"` Paritally implemented in Lexer, TODO interpolation
- Boolean `true`, `false` :heavy_check_mark: Lexer
- Nil `nil`
- Filepath `/absolute/path/to/file`, `./path/relative/to/current/file`, `@/path/relative/to/project/dir` (this will be cross-OS, so Windows paths will be converted to Unix style, eg: `C:\code\joe\file` -> `/c/code/joe/file`
- Tuple `[1, 2, 3]`, `['a', 'b']`, `[1, 2 if condition, 3]`
- POJO (Plain Old Joe Object) `{a: 1, b: 2 if condition, c: 3}`
- Switch statements return a value (if not default case, returns `nil`)
    ```joelang
	const size = switch someNumber {
		is 1, is 2: 'small';
		is in 3..10: 'medium';
		is 11: 'large';
		else: 'off the charts';
	}
	```

More to come...
