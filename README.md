# joelang
A scripting language focused on easy reading

## Quick Start

```bash
# run the compiler (ATM only analyzes)
./joec main.joe # compiles a .joe file
./joec main.joe -o outfile # specify output file
./joec -i '...' # compiles an expression

# play with the parser
./joec main.joe -p # parses a .joe file
./joec main.joe -p -o outfile # specify output file
./joec -i '...' -p # parses an expression

# play with the lexer
npm run --silent lexify -- 'your expression' # lexify an expression
npm run --silent lexify -- "$(cat path/to/file.joe)" # lexify a .joe file
npm run --silent lexify -- '...' file.tokens # send the tokens output to a file

# run the tests
npm test

# run lexer example1
npm run --silent lexify -- "$(cat examples/example1/main.joe)" examples/example1/main.tokens
# run parser example1
./joec examples/example1/main.joe -p -o examples/example1/main.parse-tree
# run analyzer example1
./joec examples/example1/main.joe -o examples/example1/main.parse-tree
```

## Challenge
Many languages are verbose and difficult to read. The goal of joelang is for the developer to read code smoothly, and not have to do mental gymnastics to understand the flow of logic.

Let's establish a few ground truths, which I think we can agree on:
- Code is read far more often than it is written
- Code maintenace is longer than the time it took to write the original version
- Computing power is now cheaper than human time


## Solution
[KISS](https://en.wikipedia.org/wiki/KISS_principle). Keep the syntax simple, and easy to read and understand.

In reality, simplicity is hard. But we do the hard work so you can do the easy work.

## Design

See the [design](DESIGN.md)

## Comparison

<table>
	<tr>
		<th>Use Case</th>
		<th>joelang</th>
		<th>Other Langs</th>
	</tr>
	<tr><th colspan="3">Conditions</th></tr>
	<tr>
		<td>Conditions to set a variable</td>
		<td>

![image](docs_assets/joelang-switch.svg)

</td>
<td>

![image](docs_assets/js-switch.svg)

</td>
</tr>

<tr>
	<td>Conditionally add an item to array</td>
	<td>

![image](docs_assets/joelang-conditional-arrays.svg)

</td>
<td>

![image](docs_assets/js-conditional-arrays.svg)

</td>
</tr>
<tr><th colspan="3">Tuple / Array / Object / String access and splicing</th></tr>
<tr><td>Get some items from array</td><td>

![image](docs_assets/joelang-access.svg)

- also works on tuples ...
- and on strings ...
- and objects too ... (the selective syntax)

</td>
<td>

![image](docs_assets/js-access.svg)

</td>
</tr>
</table>

More to come...
