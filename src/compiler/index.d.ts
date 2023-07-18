type StopCompilerAfterStep = 'lex' | 'parse' | 'analyze' | undefined;

interface Options {
	input: string;
	debug: boolean;
	stopAfterStep: StopCompilerAfterStep;
}

interface Source {
	fromStdin: boolean;
	code: string;
	loc: string[];
}
