import { Token, TokenType } from "./lexer/types";
import { Node, UnaryExpressionNode } from "./parser/types";
import { diffString, diff } from 'json-diff';
import { inspect } from 'util';

export interface CustomMatchers<R = unknown> {
	/**
	 *
	 * @param simplifiedVersion An array of simplified nodes, such as `["Keyword", "let"]`, etc.
	 */
	toMatchAST(simplifiedVersion: SAST): R;

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

function matchTokens (tokens: Token[], simplifiedVersion: SToken[]): CustomMatcherResult {
	if (typeof simplifiedVersion === 'undefined') {
		return {message: () => `a simplified token array expected, found none`, pass: false};
	}

	// the lengths should be equal
	if (tokens.length !== simplifiedVersion.length) {
		return { message: () => `expected ${tokens.length} tokens, ${simplifiedVersion.length} found`, pass: false };
	}

	// first convert tokens to simplified tokens, where we only need the type and value
	const simplifiedTokens = tokens.map((token: Token): SToken => [token.type, token.value]);

	try {
		expect(simplifiedTokens).toStrictEqual(simplifiedVersion);

		return {pass: true, message: () => 'they match'};
	} catch {
		return {pass: false, message: () => `they do not match. Expected: ${JSON.stringify(simplifiedVersion)}, Got: ${JSON.stringify(simplifiedTokens)}`};
	}
}

expect.extend({
	toMatchTokens: matchTokens,
});

////////////////////////////////////////////////////////////
// Parser Stuff
////////////////////////////////////////////////////////////

// SAST = Simplified AST

/** Certain nodes need extra information beyond the usual */
type extraInformation = {
	before?: boolean;
}
type SASTNodeWithValueAndWithoutChildren = [string, string]; // eg ['NumberLiteral', '1']
type SASTNodeWithoutValueWithChildren = [string, SAST]
type SASTNodeWithValueWithChildren = [string, string, SAST]
type SASTNodeWithValueWithChildrenWithExtraInformation = [string, string, extraInformation, SAST]
type SNode = SASTNodeWithValueAndWithoutChildren | SASTNodeWithoutValueWithChildren | SASTNodeWithValueWithChildren | SASTNodeWithValueWithChildrenWithExtraInformation;
type SAST = SNode[];

const simplifyTree = (nodes: Node[]): SAST => nodes.map((node: Node): SNode => {
	const children = simplifyTree(node.children);

	// a node will have either a value, or children, or both. Never neither
	const hasValue = typeof node.value !== 'undefined';
	let hasChildren = children.length > 0;

	// in a few cases we want the children array to be there even when empty
	if (node.type === 'ArgumentsList' || node.type === 'BlockStatement' || node.type === 'ParametersList') {
		hasChildren = true; // force it to be true
	}

	let extraInformation = {};
	switch (node.type) {
		case 'UnaryExpression':
			extraInformation = {before: (node as UnaryExpressionNode).before};
			break;
	}

	let snode: SNode;
	if (!hasValue && hasChildren) {
		snode = [
			node.type,
			children,
		];
	} else if (hasValue && !hasChildren) {
		snode = [
			node.type,
			node.value as string,
		];
	} else if (Object.keys(extraInformation).length > 0) { // has extraInformation && hasValue && hasChildren
		snode = [
			node.type,
			node.value as string,
			extraInformation,
			children,
		];
	} else { // hasValue && hasChildren
		snode = [
			node.type,
			node.value as string,
			children,
		];
	}

	return snode;
});

export function matchAST (tree: Node, simplifiedVersion: SAST): CustomMatcherResult {
	const treeNodes = tree.children;

	if (typeof simplifiedVersion === 'undefined') {
		return {message: () => `child nodes expected, found none`, pass: false};
	}

	// the lengths should be equal
	if (treeNodes.length !== simplifiedVersion.length) {
		return { message: () => `expected ${treeNodes.length} nodes, ${simplifiedVersion.length} found in ${tree.type}`, pass: false };
	}

	const simplifiedTree = simplifyTree(treeNodes);

	try {
		expect(simplifiedTree).toStrictEqual(simplifiedVersion);

		return {pass: true, message: () => 'they match'};
	} catch {
		let diff = diffString(simplifiedVersion, simplifiedTree);
		// console.debug(inspect(simplifiedVersion, {depth: null}));
		// console.debug(inspect(simplifiedTree, {depth: null}));

		return {pass: false, message: () => `they do not match. Diff: ${diff}`};
		// return {pass: false, message: () => `they do not match.\nExpected: ${JSON.stringify(simplifiedVersion)}, Got: ${JSON.stringify(simplifiedTree)}`};
	}
};

expect.extend({
	toMatchAST: matchAST,
});
