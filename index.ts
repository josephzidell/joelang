import Lexer from "./lexer/lexer";
import LexerError from "./lexer/error";
import fs from 'fs-extra';
import Parser from "./parser/parser";
import ParserError from "./parser/error";
import { inspect } from 'util';
import TranspilerToGo from './transpilers/to/go';
import TranspilerToTypescript from './transpilers/to/ts';

void (async (): Promise<void> => {
	const command = process.argv[2];

	switch (command) {
		case 'lexify':
			try {
				const [, , sourceCode, fileOut] = process.argv;

				const tokens = new Lexer(sourceCode).lexify();

				// filename is 3rd arg
				if (fileOut) {
					await fs.writeFile(fileOut, JSON.stringify(tokens, undefined, '\t'));
				} else {
					console.table(tokens);
				}
			} catch (e) {
				const error = e as LexerError;

				console.log(`Error: ${error.message}`);
				if (typeof error.getTokens === 'function') {
					console.debug('Extracted tokens:');
					console.table(error.getTokens());
				}

				console.log('Stack Trace:');
				console.error(error.stack);
			}
			break;

		case 'parse':
			try {
				const [, , sourceCode, fileOut] = process.argv;

				const cst = new Parser(new Lexer(sourceCode).lexify()).parse();

				// filename is 3rd arg
				if (fileOut) {
					await fs.writeFile(fileOut, inspect(cst, { showHidden: true, depth: null }));
				} else {
					console.debug(inspect(cst, { showHidden: true, depth: null }));
				}
			} catch (e) {
				const error = e as ParserError;

				console.log(`Error: ${error.message}`);
				console.debug('Derived CST:');
				console.debug(error.getTree());

				console.log('Stack Trace:');
				console.error(error.stack);
			}
			break;

		case 'transpile':
			try {
				const [, , lang, sourceCode, outputFile] = process.argv;

				const cst = new Parser(new Lexer(sourceCode).lexify()).parse();
				let destCode = '';

				switch (lang) {
					case 'go':
						destCode = new TranspilerToGo(cst).transpile();
						break;
					case 'ts':
						destCode = new TranspilerToTypescript(cst).transpile();
						break;
				}

				// filename is 4th arg
				if (outputFile) {
					await fs.writeFile(outputFile, destCode);
				} else {
					console.log(destCode);
				}
			} catch (e) {
				const error = e as Error;

				console.error(`Error: ${error.message}`);
				console.error('Stack Trace:');
				console.error(error.stack);
			}
			break;
	}
})();
