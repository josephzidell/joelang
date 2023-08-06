import { expect } from '@jest/globals';
import assert from 'node:assert';
import { Get } from 'type-fest';
import { AST, ASTProgram } from './src/analyzer/asts';
import { SymTab } from './src/analyzer/symbolTable';
import { Token, TokenType } from './src/lexer/types';
import { SParseTree, simplifyTree } from './src/parser/simplifier';
import { Node } from './src/parser/types';
import { mockPos } from './src/shared/pos';
import { Result } from './src/shared/result';

interface CustomMatcherResult {
	pass: boolean;
	message: () => string;
}

////////////////////////////////////////////////////////////
// Lexer Stuff
////////////////////////////////////////////////////////////

// STokens = Simplified Token array without any positional information
export type SToken = [
	/** the type of token */
	type: TokenType,

	/** the value, always represented as a string. The parser will take care of converting */
	value: string,
];

const toMatchTokens = (tokensResult: Result<Token[]>, simplifiedVersion: SToken[]): CustomMatcherResult => {
	if (typeof simplifiedVersion === 'undefined') {
		return {
			message: () => 'a simplified token array expected, found none',
			pass: false,
		};
	}

	if (tokensResult.isError()) {
		return { pass: false, message: () => tokensResult.error.message };
	}

	// the lengths should be equal
	if (tokensResult.value.length !== simplifiedVersion.length) {
		return {
			message: () => `expected ${tokensResult.value.length} tokens, ${simplifiedVersion.length} found`,
			pass: false,
		};
	}

	// first convert tokens to simplified tokens, where we only need the type and value, stripping the position
	const simplifiedTokens = tokensResult.value.map((token: Token): SToken => [token.type, token.value]);

	try {
		expect(simplifiedTokens).toStrictEqual(simplifiedVersion);

		return { pass: true, message: () => 'they match' };
	} catch {
		return {
			pass: false,
			message: () => `they do not match. Expected: ${JSON.stringify(simplifiedVersion)}, Got: ${JSON.stringify(simplifiedTokens)}`,
		};
	}
};

////////////////////////////////////////////////////////////
// Parser Stuff
////////////////////////////////////////////////////////////

const toMatchParseTree = (treeResult: Result<Node>, simplifiedVersion: SParseTree): CustomMatcherResult => {
	if (typeof simplifiedVersion === 'undefined') {
		return { message: () => 'child nodes expected, found none', pass: false };
	}

	if (treeResult.isError()) {
		return { pass: false, message: () => treeResult.error.message };
	}

	assert(treeResult.isOk());
	const treeNodes = treeResult.value.children;

	// the lengths should be equal
	if (treeNodes.length !== simplifiedVersion.length) {
		return {
			message: () => `expected ${treeNodes.length} nodes, ${simplifiedVersion.length} found in ${treeResult.value.type}`,
			pass: false,
		};
	}

	const simplifiedTree = simplifyTree(treeNodes);

	try {
		expect(simplifiedTree).toStrictEqual(simplifiedVersion);

		return { pass: true, message: () => 'they match' };
	} catch {
		const diff = diffObjects(simplifiedVersion, simplifiedTree, undefined, undefined);

		return {
			pass: false,
			message: () =>
				`the parse trees do not match. (Plus in green is what was received, minus in red is what was expected). Diff:\n${diff}`,
		};
	}
};

////////////////////////////////////////////////////////////
// Semantic Analyzer Stuff
////////////////////////////////////////////////////////////

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockASTPos = (obj: any): any => {
	if (Array.isArray(obj)) {
		return obj.map(mockASTPos);
	} else if (typeof obj === 'object' && obj !== null) {
		const mocked: typeof obj = {};
		for (const key in obj) {
			if (obj instanceof AST && ['pos', 'symbol', 'symbols'].includes(key)) {
				mocked[key] = mockPos;
			} else {
				mocked[key] = mockASTPos(obj[key]);
			}
		}
		return mocked as typeof obj;
	} else {
		return obj;
	}
};

const toEqualAstMockingPosProperty = (received: unknown, expected: unknown): CustomMatcherResult => {
	const mockedReceived = mockASTPos(received);
	const mockedExpected = mockASTPos(expected);
	try {
		expect(mockedReceived).toEqual(mockedExpected);

		return {
			message: () => `expected ${mockedReceived} not to be deeply equal to ${mockedExpected}`,
			pass: true,
		};
	} catch (e) {
		return {
			message: () => `expected ${mockedReceived} to be deeply equal to ${mockedExpected}`,
			pass: false,
		};
	}
};

const toMatchAST = (
	actualASTResult: Result<[ASTProgram, SymTab]>,
	expectedASTProgramDeclarations: Get<ASTProgram, 'declarations'>,
): CustomMatcherResult => {
	if (actualASTResult.isError()) {
		return { pass: false, message: () => actualASTResult.error.message };
	}

	const [actualAst] = actualASTResult.value;
	const actualAstDeclarations = actualAst.declarations;

	// the lengths should be equal
	if (actualAstDeclarations.length !== expectedASTProgramDeclarations.length) {
		return {
			message: () =>
				`expected ${actualAstDeclarations.length} AST nodes, ${expectedASTProgramDeclarations.length} found in ${actualAstDeclarations}`,
			pass: false,
		};
	}

	try {
		// don't use .toMatchObject() because it only matches partially
		expect(actualAstDeclarations).toEqualAstMockingPosProperty(expectedASTProgramDeclarations);

		return { pass: true, message: () => 'they match' };
	} catch {
		const diff = diffObjects(expectedASTProgramDeclarations, actualAstDeclarations, '', {
			changedPathRegex: /\.(pos\.(start|end|line|col)|symbols?)$/,
			diffPathParts: ['pos'],
		});

		return {
			pass: false,
			message: () => `the ASTs do not match. (Plus in green is what was received, minus in red is what was expected). Diff:\n${diff}`,
		};
	}
};

// other stuff

const toHaveKey = (symTab: SymTab, key: string): CustomMatcherResult => {
	// the lengths should be equal
	if (!symTab.symbols.has(key)) {
		return {
			message: () =>
				`expected symTab ${symTab.ownerNode.name} to have key ${key}, found keys [${Array.from(symTab.symbols.keys()).join(', ')}]`,
			pass: false,
		};
	}

	return { pass: true, message: () => 'map has key ${key}' };
};

expect.extend({
	toHaveKey,
	toMatchTokens,
	toMatchParseTree,
	toEqualAstMockingPosProperty,
	toMatchAST,
});

declare module 'expect' {
	interface AsymmetricMatchers {
		toBeWithinRange(floor: number, ceiling: number): void;
	}
	interface Matchers<R> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		toEqualAstMockingPosProperty<E = any>(expected: E): R;

		/**
		 * Checks the a map has a key
		 *
		 * @param map
		 * @param key
		 */
		toHaveKey<K>(key: K): R;

		/**
		 *
		 * @param expectedAST An array of AST nodes inside the ASTProgram.expressions
		 */
		toMatchAST(expectedASTProgramExpressions: AST[]): R;

		/**
		 *
		 * @param simplifiedVersion An array of simplified nodes, such as `["Keyword", "let"]`, etc.
		 */
		toMatchParseTree(simplifiedVersion: SParseTree): R;

		/**
		 * Matches against a simplified version of tokens, matching the type and value only.
		 *
		 * @param simplifiedVersion An array of simplified tokens such as `['keyword', 'let']`, etc.
		 */
		toMatchTokens(simplifiedVersion: SToken[]): R;
	}
}

interface IgnoreDiff {
	changedPathRegex: RegExp;
	diffPathParts: string[];
}

////////////////////////////////////////////////////////////
// Miscellaneous Stuff
////////////////////////////////////////////////////////////

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diffObjects(expected: any, received: any, path = '', ignore: IgnoreDiff | undefined): string {
	const expectedKeys = Object.keys(expected);
	const receivedKeys = Object.keys(received);
	const addedKeys = receivedKeys.filter((key) => !expectedKeys.includes(key));
	const removedKeys = expectedKeys.filter((key) => !receivedKeys.includes(key));
	const changedKeys = expectedKeys.filter((key) => receivedKeys.includes(key) && expected[key] !== received[key]);

	let output = '';

	addedKeys.forEach((key) => {
		const fullPath = `${path}.${key}`;
		const value = stringify(received[key], ignore);
		output += `${colorize(`+ ${fullPath}: ${value}`, Colors.Green)}\n`;
	});

	removedKeys.forEach((key) => {
		const fullPath = `${path}.${key}`;
		const value = stringify(expected[key], ignore);
		output += `${colorize(`- ${fullPath}: ${value}`, Colors.Red)}\n`;
	});

	changedKeys.forEach((key) => {
		const fullPath = `${path}.${key}`;
		if (ignore?.changedPathRegex.test(fullPath)) {
			return;
		}

		const expectedValue = expected[key];
		const receivedValue = received[key];
		if (Array.isArray(expectedValue) && Array.isArray(receivedValue)) {
			const arrayDiff = diffArrays(expectedValue, receivedValue, `${fullPath}`, ignore);
			if (arrayDiff !== '') {
				output += arrayDiff;
			}
		} else if (typeof expectedValue === 'object' && typeof receivedValue === 'object') {
			const objectDiff = diffObjects(expectedValue, receivedValue, `${fullPath}`, ignore);
			if (objectDiff !== '') {
				output += objectDiff;
			}
		} else {
			const expectedString = stringify(expectedValue, ignore);
			const receivedString = stringify(receivedValue, ignore);
			output += `${colorize(`- ${fullPath}: ${expectedString}`, Colors.Red)}\n`;
			output += `${colorize(`+ ${fullPath}: ${receivedString}`, Colors.Green)}\n`;
		}
	});

	return output;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diffArrays(expected: any[], received: any[], path = '', ignore: IgnoreDiff | undefined): string {
	const addedElements = received.filter((item) => !expected.includes(item));
	const removedElements = expected.filter((item) => !received.includes(item));
	let output = '';
	addedElements.forEach((item, index) => {
		const fullPath = `${path}[${expected.length + index}]`;
		const value = stringify(item, ignore);
		output += `${colorize(`+ ${fullPath}: ${value}`, Colors.Green)}\n`;
	});
	removedElements.forEach((item, index) => {
		const fullPath = `${path}[${received.length + index}]`;
		const value = stringify(item, ignore);
		output += `${colorize(`- ${fullPath}: ${value}`, Colors.Red)}\n`;
	});
	return output;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stringify(obj: any, ignore: IgnoreDiff | undefined): string {
	if (typeof obj === 'string') {
		return `"${obj}"`;
	} else if (typeof obj === 'number' || typeof obj === 'boolean' || obj === null || obj === undefined) {
		return String(obj);
	} else if (Array.isArray(obj)) {
		const elements = obj.map((element) => stringify(element, ignore)).join(', ');
		return `[${elements}]`;
	} else if (typeof obj === 'object') {
		const keys = Object.keys(obj);
		const properties = keys
			.filter((key) => typeof ignore === 'undefined' || !ignore.diffPathParts.includes(key)) // ignore
			.map((key) => `${key}: ${stringify(obj[key], ignore)}`)
			.join(', ');
		return `{${properties}}`;
	} else {
		return obj.toString();
	}
}

enum Colors {
	Red = 31,
	Green = 32,
	Yellow = 33,
	Blue = 34,
	Magenta = 35,
	Cyan = 36,
	White = 37,
}

function colorize(text: string, colorCode: number): string {
	const escapeCode = `\u001b[${colorCode}m`;
	const resetCode = '\u001b[0m';
	return `${escapeCode}${text}${resetCode}`;
}
