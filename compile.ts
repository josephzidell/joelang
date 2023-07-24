import { Compiler } from './src/compiler/compiler';
import System from './src/compiler/system';

// Asynchronous function to check system requirements and compile the code
async function main(slicedArgs: string[]) {
	// Check if the system meets the requirements for compilation
	System.checkRequirements();

	// Create a new compiler instance with the given arguments
	const compiler = new Compiler(slicedArgs);
	// Compile the code
	await compiler.compile();
}

(async (): Promise<void> => {
	try {
		await main(process.argv.slice(2));
	} catch (error) {
		// Log the error message and exit the process
		console.error((error as Error).message);
		if (process.argv.includes('-d')) {
			console.error((error as Error).stack);
		}
		console.error('\nExiting...');
		process.exit(1);
	}
})();
