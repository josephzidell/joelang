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
				const lexerError = tokensResult.error as LexerError;

				console.groupCollapsed(`Error[Lexer]: ${lexerError.message}`);
				lexerError.getContext().toStringArray(lexerError.message).forEach(str => console.log(str));
				console.groupEnd();

				const tokens = lexerError.getTokens();
				if (tokens.length > 0) {
					console.info('Extracted tokens:');
					console.table(tokens);
				}

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
