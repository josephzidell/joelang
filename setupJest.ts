import { Get } from 'type-fest';
import { Token, TokenType } from "./lexer/types";
import { simplifyTree, SParseTree } from "./parser/simplifier";
import { Node } from "./parser/types";
import { AST, ASTProgram } from "./semanticAnalysis/asts";
import { Result } from "./shared/result";

export interface CustomMatchers<R = unknown> {
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

declare global {
	namespace jest {
		interface Expect extends CustomMatchers {}
		interface Matchers<R> extends CustomMatchers<R> {}
		interface InverseAsymmetricMatchers extends CustomMatchers {}
	}
}

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

function matchTokens (tokensResult: Result<Token[]>, simplifiedVersion: SToken[]): CustomMatcherResult {
	switch (tokensResult.outcome) {
		case 'ok':
			if (typeof simplifiedVersion === 'undefined') {
				return {message: () => `a simplified token array expected, found none`, pass: false};
			}

			// the lengths should be equal
			if (tokensResult.value.length !== simplifiedVersion.length) {
				return { message: () => `expected ${tokensResult.value.length} tokens, ${simplifiedVersion.length} found`, pass: false };
			}

			// first convert tokens to simplified tokens, where we only need the type and value
			const simplifiedTokens = tokensResult.value.map((token: Token): SToken => [token.type, token.value]);

			try {
				expect(simplifiedTokens).toStrictEqual(simplifiedVersion);

				return {pass: true, message: () => 'they match'};
			} catch {
				return {pass: false, message: () => `they do not match. Expected: ${JSON.stringify(simplifiedVersion)}, Got: ${JSON.stringify(simplifiedTokens)}`};
			}
			break;
		case 'error':
			return {pass: false, message: () => tokensResult.error.message};
	}
}

expect.extend({
	toMatchTokens: matchTokens,
});

////////////////////////////////////////////////////////////
// Parser Stuff
////////////////////////////////////////////////////////////

export function matchParseTree (treeResult: Result<Node>, simplifiedVersion: SParseTree): CustomMatcherResult {
	switch (treeResult.outcome) {
		case 'ok':
			const treeNodes = treeResult.value.children;

			if (typeof simplifiedVersion === 'undefined') {
				return {message: () => `child nodes expected, found none`, pass: false};
			}

			// the lengths should be equal
			if (treeNodes.length !== simplifiedVersion.length) {
				return { message: () => `expected ${treeNodes.length} nodes, ${simplifiedVersion.length} found in ${treeResult.value.type}`, pass: false };
			}

			const simplifiedTree = simplifyTree(treeNodes);

			try {
				expect(simplifiedTree).toStrictEqual(simplifiedVersion);

				return {pass: true, message: () => 'they match'};
			} catch {
				let diff = diffObjects(simplifiedVersion, simplifiedTree);

				return {pass: false, message: () => `the parse trees do not match. (Minus in red is what what expected, plus in green is what was received). Diff:\n${diff}`};
			}
			break;
		case 'error':
			return {pass: false, message: () => treeResult.error.message};
	}
};

expect.extend({
	toMatchParseTree: matchParseTree,
});

////////////////////////////////////////////////////////////
// Semantic Analyzer Stuff
////////////////////////////////////////////////////////////

export function matchAST (actualASTResult: Result<ASTProgram>, expectedASTProgramDeclarations: Get<ASTProgram, 'declarations'>): CustomMatcherResult {
	switch (actualASTResult.outcome) {
		case 'ok':
			const actualAST = actualASTResult.value.declarations;

			// the lengths should be equal
			if (actualAST.length !== expectedASTProgramDeclarations.length) {
				return { message: () => `expected ${actualAST.length} AST nodes, ${expectedASTProgramDeclarations.length} found in ${actualAST}`, pass: false };
			}

			try {
				expect(actualAST).toMatchObject(expectedASTProgramDeclarations);

				return {pass: true, message: () => 'they match'};
			} catch {
				const diff = diffObjects(expectedASTProgramDeclarations, actualAST);

				return {pass: false, message: () => `the ASTs do not match. (Minus in red is what what expected, plus in green is what was received). Diff:\n${diff}`};
			}
			break;
		case 'error':
			return {pass: false, message: () => actualASTResult.error.message};
	}
};

expect.extend({
	toMatchAST: matchAST,
});

////////////////////////////////////////////////////////////
// Miscellaneous Stuff
////////////////////////////////////////////////////////////

function diffObjects(expected: any, received: any, path: string = ''): string {
	const expectedKeys = Object.keys(expected);
	const receivedKeys = Object.keys(received);
	const addedKeys = receivedKeys.filter(key => !expectedKeys.includes(key));
	const removedKeys = expectedKeys.filter(key => !receivedKeys.includes(key));
	const changedKeys = expectedKeys.filter(key => receivedKeys.includes(key) && expected[key] !== received[key]);

	let output = '';

	addedKeys.forEach(key => {
		const fullPath = `${path}.${key}`;
		const value = stringify(received[key]);
		output += `${colorize(`+ ${fullPath}: ${value}`, Colors.Green)}\n`;
	});

	removedKeys.forEach(key => {
		const fullPath = `${path}.${key}`;
		const value = stringify(expected[key]);
		output += `${colorize(`- ${fullPath}: ${value}`, Colors.Red)}\n`;
	});

	changedKeys.forEach(key => {
		const fullPath = `${path}.${key}`;
		const expectedValue = expected[key];
		const receivedValue = received[key];
		if (Array.isArray(expectedValue) && Array.isArray(receivedValue)) {
			const arrayDiff = diffArrays(expectedValue, receivedValue, `${fullPath}`);
			if (arrayDiff !== '') {
				output += arrayDiff;
			}
		} else if (typeof expectedValue === 'object' && typeof receivedValue === 'object') {
			const objectDiff = diffObjects(expectedValue, receivedValue, `${fullPath}`);
			if (objectDiff !== '') {
				output += objectDiff;
			}
		} else {
			const expectedString = stringify(expectedValue);
			const receivedString = stringify(receivedValue);
			output += `${colorize(`- ${fullPath}: ${expectedString}`, Colors.Red)}\n`;
			output += `${colorize(`+ ${fullPath}: ${receivedString}`, Colors.Green)}\n`;
		}
	});

	return output;
}

function diffArrays(expected: any[], received: any[], path: string = ''): string {
	const addedElements = received.filter(item => !expected.includes(item));
	const removedElements = expected.filter(item => !received.includes(item));
	let output = '';
	addedElements.forEach((item, index) => {
		const fullPath = `${path}[${expected.length + index}]`;
		const value = stringify(item);
		output += `${colorize(`+ ${fullPath}: ${value}`, Colors.Green)}\n`;
	});
	removedElements.forEach((item, index) => {
		const fullPath = `${path}[${received.length + index}]`;
		const value = stringify(item);
		output += `${colorize(`- ${fullPath}: ${value}`, Colors.Red)}\n`;
	});
	return output;
}

function stringify(obj: any): string {
	if (typeof obj === 'string') {
		return `"${obj}"`;
	} else if (typeof obj === 'number' || typeof obj === 'boolean' || obj === null || obj === undefined) {
		return String(obj);
	} else if (Array.isArray(obj)) {
		const elements = obj.map(element => stringify(element)).join(', ');
		return `[${elements}]`;
	} else if (typeof obj === 'object') {
		const keys = Object.keys(obj);
		const properties = keys.map(key => `${key}: ${stringify(obj[key])}`).join(', ');
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
