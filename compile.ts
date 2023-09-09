import { Compiler } from './src/compiler/compiler';
import System from './src/compiler/system';
import loggers from './src/shared/log';

const log = loggers.compiler;

// Asynchronous function to check system requirements and compile the code
async function main(slicedArgs: string[]) {
	process.env.DEBUG = process.argv.includes('-d') ? '1' : '0';

	// Check if the system meets the requirements for compilation
	System.checkRequirements();

	// Create a new compiler instance with the given arguments
	const compiler = new Compiler(slicedArgs);

	// Compile the code
	const wasSuccessful = await compiler.compile();

	process.exit(wasSuccessful ? 0 : 1);
}

(async (): Promise<void> => {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		// Log the error message and exit the process
		log.warn((error as Error).message);
		if (process.argv.includes('-d')) {
			log.warn((error as Error).stack);
		}
		log.warn('\nExiting...');
		process.exit(1);
	}
})();
