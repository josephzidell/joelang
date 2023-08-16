/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	setupFilesAfterEnv: ['./jestSetup.ts'],
	preset: 'ts-jest',
	silent: false,
	testEnvironment: 'node',
	testMatch: ['**/*.spec.ts'],
	transform: {
		// '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
		// '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				// ts-jest configuration goes here
			},
		],
	},
};
