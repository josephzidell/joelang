import Lexer from "./lexer/lexer";
import fs from 'fs-extra';
import Parser from "./parser/parser";
import ParserError from "./parser/error";
import { inspect } from 'util';

void (async (): Promise<void> => {
    try {
		const tokens = new Lexer(process.argv[2]).lexify();
		const ast = new Parser(tokens).parse();

		// filename is 3rd arg
		if (process.argv[3]) {
			await fs.writeFile(process.argv[3], inspect(ast, { showHidden: true, depth: null }));
		} else {
			console.debug(inspect(ast, { showHidden: true, depth: null }));
		}
	} catch (e) {
		const error = e as ParserError;

		console.log(`Error: ${error.message}`);
		console.debug('Derived AST:');
		console.debug(error.getTree());

		console.log('Stack Trace:');
		console.error(error.stack);
	}
})();
