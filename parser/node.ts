import { Node, NodeType, UnaryExpressionNode } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

export function MakeNode (type: NodeType, token: Token, parent: Node): Node {
	const node: Node = {
		type,
		value: token.value,
		start: token.start,
		end: token.end,
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
		start: token.start,
		end: token.end,
		parent,
		children: [],
	}

	return node;
}
