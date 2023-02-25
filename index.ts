#!/usr/bin/env node

import Lexer from "./lexer/lexer";
import LexerError from "./lexer/error";
import fs from 'fs-extra';

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
	}
})();
