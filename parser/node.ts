import { Node, NodeType, UnaryExpressionNode } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

export function MakeNode (type: NodeType, token: Token, parent: Node): Node {
	const node: Node = {
		type,
		value: token.value,
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
