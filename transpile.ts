import Lexer from "./lexer/lexer";
import Parser from "./parser/parser";
import fs from 'fs-extra';
import TranspilerToGo from './transpilers/to/go';
import TranspilerToTypescript from './transpilers/to/ts';

void (async (): Promise<void> => {
    try {
		const [, , lang, code, outputFile] = process.argv;

		const ast = new Parser(new Lexer(code).lexify()).parse();
		let newCode = '';

		switch (lang) {
			case 'go':
				newCode = new TranspilerToGo(ast).transpile();
				break;
			case 'ts':
				newCode = new TranspilerToTypescript(ast).transpile();
				break;
		}

		// filename is 4th arg
		if (outputFile) {
			await fs.writeFile(outputFile, newCode);
		} else {
			console.log(newCode);
		}
	} catch (e) {
		const error = e as Error;

		console.error(`Error: ${error.message}`);
		console.error('Stack Trace:');
		console.error(error.stack);
	}
})();
