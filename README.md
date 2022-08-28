# joelang
A scripting language focused on easy reading

## Quick Start

```bash
# run the lexer
npm run --silent run -- 'your expression' # run with an expression
npm run --silent run -- "$(cat path/to/file.joe)" # run on a .joe file
npm run --silent run -- '...' file.out # send the output to a file

# run unit tests
npx jest

# run lexer sample
npm run --silent run -- "$(cat tests/fixtures/lexer_sample.joe)" tests/fixtures/lexer_sample.joe.out
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
- Filepath `/path/to/file/relative/to/calling/dir`, `./path/relative/to/current/file` (this will be cross-OS, so Windows paths will use Unix style, eg: use `/code/joe/file` instead of `\code\joe\file`
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
