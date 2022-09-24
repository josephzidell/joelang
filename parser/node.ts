import { IfStatementNode, Node, NodeType, UnaryExpressionNode } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

/**
 * Makes a Node
 *
 * @param type - NodeType
 * @param token - The Token from the lexer
 * @param parent - The parent Node
 * @param discardValue - Should the value be discarded? Sometimes the value is useless and adds noise
 * @returns A Node
 */
export function MakeNode (type: NodeType, token: Token, parent: Node, discardValue = false): Node {
	const node: Node = {
		type,
		value: discardValue ? undefined : token.value,
		pos: {
			start: token.start,
			end: token.end,
			line: token.line,
			col: token.col,
		},
		parent,
		children: [],
	}

	return node;
}

/**
 * Makes an IfStatement Node
 *
 * @param token - The Token from the lexer
 * @param before - Was the operator before the expression?
 * @param parent - The parent Node
 * @returns A IfStatement Node
 */
export function MakeIfStatementNode (token: Token, before: boolean, parent: Node): IfStatementNode {
	const node: IfStatementNode = {
		type: 'IfStatement',
		value: undefined,
		before,
		pos: {
			start: token.start,
			end: token.end,
			line: token.line,
			col: token.col,
		},
		parent,
		children: [],
	}

	return node;
}

/**
 * Makes an UnaryExpression Node
 *
 * @param token - The Token from the lexer
 * @param before - Was the operator before the expression?
 * @param parent - The parent Node
 * @returns A UnaryExpression Node
 */
export function MakeUnaryExpressionNode (token: Token, before: boolean, parent: Node): UnaryExpressionNode {
	const node: UnaryExpressionNode = {
		type: 'UnaryExpression',
		value: token.value,
		before,
		pos: {
			start: token.start,
			end: token.end,
			line: token.line,
			col: token.col,
		},
		parent,
		children: [],
	}

	return node;
}
