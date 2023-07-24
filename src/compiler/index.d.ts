type StopCompilerAfterStep = 'lex' | 'parse' | 'analyze' | 'll' | undefined;

interface CompilerOptions {
	input: string;
	debug: boolean;
	stopAfterStep: StopCompilerAfterStep;
}

interface Source {
	fromStdin: boolean;
	code: string;
	loc: string[];
}
