import Lexer from "../lexer/lexer";
import { Token } from "../lexer/types";
import Parser from "./parser";
import { Node } from "./types";
import { inspect } from 'util';

interface CustomMatchers<R = unknown> {
	toMatchAST(simplifiedVersion: SAST): R;
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

// SAST = Simplified AST
type SASTNodeWithValueAndWithoutChildren = [string, string]; // eg ['NumberLiteral', '1']
type SASTNodeWithoutValueWithChildren = [string, SAST]
type SASTNodeWithValueWithChildren = [string, string, SAST]
type SAST = Array<SASTNodeWithValueAndWithoutChildren | SASTNodeWithoutValueWithChildren | SASTNodeWithValueWithChildren>;

function matchAST (tree: Node, simplifiedVersion: SAST): CustomMatcherResult {
	const treeNodes = tree.nodes;

	if (typeof simplifiedVersion === 'undefined') {
		return {message: () => `child nodes expected, found none`, pass: false};
	}

	// the lengths should be equal
	if (treeNodes.length !== simplifiedVersion.length) {
		return { message: () => `expected ${treeNodes.length} nodes, ${simplifiedVersion.length} found in ${tree.type}`, pass: false };
	}

	for (let index = 0; index < treeNodes.length; index++) {
		if (typeof simplifiedVersion[index] === 'undefined') {
			return {message: () => `${treeNodes[index].type} node expected`, pass: false};
		}

		const node = treeNodes[index];

		// check node type
		let result = expectSingleNodeToMatch(simplifiedVersion[index][0], node.type);
		if (!result.pass) {
			return result;
		}

		// has children but no value
		if (node.type === 'Parenthesized' || node.type === 'BlockStatement' || node.type === 'ImportDeclaration') {
			result = matchAST(node, simplifiedVersion[index][1] as SAST);
			if (!result.pass) {
				return result;
			}

		// has value and children
		} else if (node.type === 'UnaryExpression') {
			// match operator
			const result = matchValueAndChildren(node, node.value as string, simplifiedVersion, index);
			if (!result.pass) {
				return result;
			}

		} else if (node.type === 'VariableDeclaration') {
			// match operator
			const result = matchValueAndChildren(node, node.value as string, simplifiedVersion, index);
			if (!result.pass) {
				return result;
			}

		// has value but no children
		} else if (node.type === 'Identifier') {
			const result = expectSingleNodeToMatch(simplifiedVersion[index][1] as string, node.value as string);
			if (!result.pass) {
				return result;
			}

		} else {
			const result = expectSingleNodeToMatch(simplifiedVersion[index][1] as string, node.value as string);
			if (!result.pass) {
				return result;
			}
		}
	}

	return { message: () => 'matched', pass: true };
};

function matchValueAndChildren (node: Node, value: string, simplifiedVersion: SAST, index: number) {
	const foo = simplifiedVersion[index];
	let result = expectSingleNodeToMatch(simplifiedVersion[index][1] as string, value);
	if (!result.pass) { // only return upon failure
		return result;
	}

	// match children
	result = matchAST(node, simplifiedVersion[index][2] as SAST);

	// always return the last result
	return result;
}


expect.extend({
	toMatchAST: matchAST,
});

function expectSingleNodeToMatch(actual: string, expected: string): CustomMatcherResult {
	if (actual === expected) {
		return {message: () => 'matched', pass: true};
	}

	return {message: () => `expected "${expected}", found "${actual}"`, pass: false};
}

describe('lexer.ts', (): void => {
	describe('parses', (): void => {
		it('a let expression with a bool literal', (): void => {
			const tokens: Token[] = new Lexer('let x = false').lexify()
			expect(new Parser(tokens).parse()).toMatchAST([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['BoolLiteral', 'false'],
				]],
			])
		});

		it('a let expression with a number literal', (): void => {
			const tokens: Token[] = new Lexer('let x = 1').lexify()
			expect(new Parser(tokens).parse()).toMatchAST([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['NumberLiteral', '1'],
				]],
			])
		});

		it('a let expression with a string literal', (): void => {
			const tokens: Token[] = new Lexer('let x = "foo"').lexify()
			expect(new Parser(tokens).parse()).toMatchAST([
				['VariableDeclaration', 'let', [
					['Identifier', 'x'],
					['AssignmentOperator', '='],
					['StringLiteral', 'foo'],
				]],
			])
		});

		it('a single-line comment', (): void => {
			const tokens: Token[] = new Lexer('# let x = "foo"').lexify()
			expect(new Parser(tokens).parse()).toMatchAST([
				['Comment', '# let x = "foo"'],
			])
		});

		describe('block statements', (): void => {
			it('empty class', (): void => {
				const tokens: Token[] = new Lexer('class Foo {}').lexify()
				expect(new Parser(tokens).parse()).toMatchAST([
					["Keyword", "class"],
					["Identifier", "Foo"],
					['BlockStatement', []],
				]);
			});

			it('class with comment', (): void => {
				const tokens: Token[] = new Lexer('class Foo {\n# foo\n}').lexify()
				expect(new Parser(tokens).parse()).toMatchAST([
					["Keyword", "class"],
					["Identifier", "Foo"],
					['BlockStatement', [
						['Comment', '# foo'],
					]],
				]);
			});
		});

		describe('imports', (): void => {
			it('single, default import', (): void => {
				const tokens: Token[] = new Lexer('import lexer from ./lexer;import lexer2 from @/lexer;import lexer3 from @/lexer.joe;').lexify()
				expect(new Parser(tokens).parse()).toMatchAST([
					['ImportDeclaration', [
						["Identifier", "lexer"],
						["Keyword", "from"],
						["FilePath", "./lexer"],
						["SemicolonSeparator", ";"],
					]],
					['ImportDeclaration', [
						["Identifier", "lexer2"],
						["Keyword", "from"],
						["FilePath", "@/lexer"],
						["SemicolonSeparator", ";"],
					]],
					['ImportDeclaration', [
						["Identifier", "lexer3"],
						["Keyword", "from"],
						["FilePath", "@/lexer.joe"],
						["SemicolonSeparator", ";"],
					]],
				]);
			});
		});

		describe('mathematical expressions', (): void => {
			it('a simple mathematical formula', (): void => {
				const tokens: Token[] = new Lexer('1 + (2 * (-3/-(2.3-4)%9))').lexify()
				expect(new Parser(tokens).parse()).toMatchAST([
					['NumberLiteral', '1'],
					['AdditionOperator', '+'],
					['Parenthesized', [
						['NumberLiteral', '2'],
						['MultiplicationOperator', '*'],
						['Parenthesized', [
							['UnaryExpression', '-', [
								['NumberLiteral', '3'],
							]],
							['DivisionOperator', '/'],
							['UnaryExpression', '-', [
								['Parenthesized', [
									['NumberLiteral', '2.3'],
									['SubtractionOperator', '-'],
									['NumberLiteral', '4'],
								]],
							]],
							['ModOperator', '%'],
							['NumberLiteral', '9'],
						]]
					]]
				])
			});

			it('supports mathematical expressions with variables', (): void => {
				const tokens: Token[] = new Lexer('const foo = 1; let bar = -foo;').lexify()
				expect(new Parser(tokens).parse()).toMatchAST([
					['VariableDeclaration', 'const', [
						['Identifier', 'foo'],
						['AssignmentOperator', '='],
						['NumberLiteral', '1'],
						['SemicolonSeparator', ';'],
					]],
					['VariableDeclaration', 'let', [
						['Identifier', 'bar'],
						['AssignmentOperator', '='],
						['UnaryExpression', '-', [
							['Identifier', 'foo'],
						]],
						['SemicolonSeparator', ';'],
					]],
				]);
			});
		});
	});
});
