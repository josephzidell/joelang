import { Get } from "type-fest";
import { Token } from "../lexer/types";
import { Node, NT, UnaryExpressionNode } from "./types";

/**
 * Makes a Node
 *
 * @param type - NodeType
 * @param token - The Token from the lexer
 * @param parent - The parent Node
 * @param discardValue - Should the value be discarded? Sometimes the value is useless and adds noise
 * @returns A Node
 */
export function MakeNode (type: NT, token: Token, parent: Node, discardValue = false): Node {
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

/** Changes the type of a Node */
export function ChangeNodeType (node: Node, newType: NT): void {
	node.type = newType;
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
		type: NT.UnaryExpression,
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
