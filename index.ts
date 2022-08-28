import lexer from "./lexer";

void (async (): Promise<void> => {
    try {
		console.log(lexer(process.argv[2]));
	} catch (e) {
		console.log(`Error: ${(e as Error).message}, ${(e as Error).stack}`)
	}
})();
