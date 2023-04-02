/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
	setupFilesAfterEnv: ['./setupJest.ts'],
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['**/*.spec.js'],
};
