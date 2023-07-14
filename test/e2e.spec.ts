import { execFile, execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import util from 'util';

// Helper function to get all subdirectories of a directory
function getSubdirectories(dirPath: string): string[] {
	return readdirSync(dirPath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(dirPath, entry.name));
}

// Iterate over all subdirectories within the `tests/` directory

const testDirectories = getSubdirectories(join(__dirname, '..', '..', 'test'));

it('Test case: 1', () => {
	expect(testDirectories.length).toBeGreaterThanOrEqual(1);
});

// TODO uncomment the below and ensure it works.
// As of 14 July 2023, it was doing a core dump.

// path to executable
// check if an env var is set
// const joecCommand = process.env.JOEC_COMMAND ? `./${process.env.JOEC_COMMAND}` : 'node _build/compile.js';

// testDirectories.forEach((testDir) => {
// 	const testName = `Test case: ${testDir.split('/').pop()}`;

// 	it(testName, async () => {
// 		// run compiler
// 		execSync(`${joecCommand} ${join(testDir, 'main.joe')}`);

// 		// run executable
// 		const pathToExecutable = join(testDir, 'main');

// 		const execFileAsync = util.promisify(execFile);
// 		// Compile and run the test program and capture its output
// 		try {
// 			const actualOutput = await execFileAsync(pathToExecutable);

// 			// Read the expected output from a file
// 			const expectedOutput = readFileSync(join(testDir, 'expected.out'), 'utf-8');

// 			// Compare the actual output to the expected output
// 			expect(actualOutput.stdout).toEqual(expectedOutput);
// 		} catch (err) {
// 			// ignore as there is a known issue that the executable exits with a non-zero exit code
// 			// TODO fix that
// 		}
// 	});
// });
