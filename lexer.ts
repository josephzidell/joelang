import Lexer from "./lexer/lexer";
import LexerError from "./lexer/error";
import fs from 'fs-extra';

void (async (): Promise<void> => {
    try {
		const tokens = new Lexer(process.argv[2]).lexify();

		// filename is 3rd arg
		if (process.argv[3]) {
			await fs.writeFile(process.argv[3], JSON.stringify(tokens, undefined, '\t'));
		} else {
			console.table(tokens);
		}
	} catch (e) {
		const error = e as LexerError;

		console.log(`Error: ${error.message}`);
		console.debug('Extracted tokens:');
		console.table(error.getTokens());

		console.log('Stack Trace:');
		console.error(error.stack);
	}
})();
