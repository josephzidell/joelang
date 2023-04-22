import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Helper function to get all subdirectories of a directory
function getSubdirectories(dirPath: string): string[] {
	return readdirSync(dirPath, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(dirPath, entry.name));
}

// Iterate over all subdirectories within the `tests/` directory

const testDirectories = getSubdirectories(join(__dirname, '..', '..', 'test'));

it('Test case: 1', () => {
	expect(testDirectories.length).toEqual(1);
});

testDirectories.forEach((testDir) => {
	const testName = `Test case: ${testDir.split('/').pop()}`;

	it(testName, () => {
		// Compile and run the test program and capture its output
		const actualOutput = execSync(`node _build/compile.js ${join(testDir, 'main.joe')}`).toString();

		// Read the expected output from a file
		const expectedOutput = readFileSync(join(testDir, 'expected.out'), 'utf-8');

		// Compare the actual output to the expected output
		expect(actualOutput).toEqual(expectedOutput);
	});
});
