#!/usr/bin/env node

import fs from 'fs-extra';
import LexerError from "./lexer/error";
import Lexer from "./lexer/lexer";

void (async (): Promise<void> => {
	const command = process.argv[2];

	switch (command) {
		case 'lexify':
			const [, , , sourceCode, outputFile] = process.argv;

			const tokensResult = new Lexer(sourceCode).getAllTokens();
			if (tokensResult.outcome === 'error') {
				const error = tokensResult.error as LexerError;

				console.error(`Error: ${error.message}`);
				if (typeof error.getTokens === 'function') {
					console.info('Extracted tokens:');
					console.table(error.getTokens());
				}

				console.groupCollapsed('Stack Trace:');
				console.error(error.stack);
				console.groupEnd();

				process.exit(1);
			}

			if (tokensResult.value.length === 0) {
				console.error('No source code found');
				process.exit(1);
			}

			// filename is 3rd arg
			if (outputFile) {
				await fs.writeFile(outputFile, JSON.stringify(tokensResult.value, undefined, '\t'));
			} else {
				console.table(tokensResult.value);
			}
			break;
	}
})();
