module.exports = {
	env: {
		browser: true,
		es2021: true,
		amd: true,
		node: true,
	},
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:prettier/recommended'],
	ignorePatterns: ['node_modules', '_build'],
	overrides: [],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 'latest',
		sourceType: 'module',
	},
	plugins: ['@typescript-eslint', 'prettier'],
	rules: {
		// typescript replacements
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

		// typescript rules
		'@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
		'@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],

		// prettier rules
		// 'prettier/prettier': 'error',

		// general rules
		// 'indent': ['error', 'tab', {SwitchCase: 1}],
		// 'linebreak-style': ['error', 'unix'],
		// 'quotes': ['error', 'single', {avoidEscape: true, allowTemplateLiterals: true}],
		// 'semi': ['error', 'always']
	},
};
