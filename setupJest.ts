import { diffString } from 'json-diff';
import { Token, TokenType } from "./lexer/types";
import { simplifyTree, SParseTree } from "./parser/simplifier";
import { Node } from "./parser/types";
import { Result } from "./shared/result";

export interface CustomMatchers<R = unknown> {
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
				let diff = diffString(simplifiedVersion, simplifiedTree);

				return {pass: false, message: () => `they do not match. (Minus in red is what what expected, plus in green is what was received). Diff: ${diff}`};
			}
			break;
		case 'error':
			return {pass: false, message: () => treeResult.error.message};
	}
};

expect.extend({
	toMatchParseTree: matchParseTree,
});
