/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
module.exports = {
	setupFilesAfterEnv: ['./setupJest.ts'],
	preset: 'ts-jest',
	silent: false,
	testEnvironment: 'node',
	testMatch: ['**/*.spec.js'],
};
