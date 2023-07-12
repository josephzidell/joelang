import { Compiler } from './src/compiler/compiler';
import { checkSystemRequirements } from './src/compiler/system';

const args = process.argv.slice(2);

void (async (): Promise<void> => {
	await checkSystemRequirements();

	const compiler = new Compiler(args);
	await compiler.compile();
})();
