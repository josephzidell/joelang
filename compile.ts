import { Compiler } from './src/compiler/compiler';

const args = process.argv.slice(2);

void (async (): Promise<void> => {
	const compiler = new Compiler(args);
	await compiler.compile();
})();
