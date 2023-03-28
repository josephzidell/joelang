# joelang
A scripting language focused on easy reading. [Read the docs](https://joelang.dev)

## Quick Start

```bash
# compile a .joe file (ATM only analyzes)
./joec main.joe # outputs 3 files [main.tokens, main.parse-tree, main.ast.json]

# There is an example .joe file at examples/example1/main.joe

# play with the compiler, parser, or lexer
./joec -i '...' # run the compiler; will output the AST as objects
./joec -i '...' --json # run the compiler; will output the AST as JSON
./joec -i '...' -p # parse only, do not analyze; will output the Parse Tree
./joec -i '...' -l # (that's the lowercase L, not the number 1) lex only, do not parse; will console.table()'s the Tokens

# run the tests
npm test
```

## Challenge
Many languages are verbose and difficult to read. The goal of joelang is for the developer to read code smoothly, and not have to do mental gymnastics to understand the flow of logic.

Let's establish a few ground truths, which I think we can agree on:
- Code is read far more often than it is written
- Code maintenance is longer than the time it took to write the original version
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
