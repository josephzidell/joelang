#!/usr/bin/env node

import Lexer from "./lexer/lexer";
import LexerError from "./lexer/error";
import fs from 'fs-extra';
import Parser from "./parser/parser";
import ParserError from "./parser/error";
import { inspect } from 'util';
import { simplifyTree } from "./parser/simplifier";

void (async (): Promise<void> => {
	const command = process.argv[2];

	switch (command) {
		case 'lexify':
			try {
				const [, , , sourceCode, outputFile] = process.argv;

				const tokens = new Lexer(sourceCode).getAllTokens();

				// filename is 3rd arg
				if (outputFile) {
					await fs.writeFile(outputFile, JSON.stringify(tokens, undefined, '\t'));
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
				const [, , , sourceCode, outputFile] = process.argv;

				const debug = false;

				// output simplified tree
				// TODO add `-v|--verbose` option
				const parseTree = simplifyTree([new Parser(sourceCode, debug).parse()]);

				if (outputFile) {
					await fs.writeFile(outputFile, inspect(parseTree, { showHidden: true, depth: null }));
				} else {
					console.debug(inspect(parseTree, { showHidden: true, depth: null }));
				}
			} catch (e) {
				const error = e as ParserError;

				console.log(`Error: ${error.message}`);
				console.debug('Derived CST:');
				if ('getTree' in error) {
					console.debug(error.getTree());
				}

				console.log('Stack Trace:');
				console.error(error.stack);
			}
			break;
	}
})();
