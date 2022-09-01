import { LiteralNode, IdentifierNode, Node, NodeType, VariableDeclarationNode, VariableDeclarationKind, ExpressionNode, BinaryOperationNode } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

export function EnterVariableDeclaration (kind: VariableDeclarationKind, start: number, parent: Node): VariableDeclarationNode {
	const node: VariableDeclarationNode = {
		type: 'VariableDeclaration',
		kind,
		start,
		end: start, // will update it in ExitVariableDeclaration
		parent,
		lhs: undefined, // will be updated
		rhs: undefined, // will be updated
		nodes: [],
	};

	return node;
}

export function ExitVariableDeclaration (node: VariableDeclarationNode, end: number, nodes: Node[]): VariableDeclarationNode {
	node.end = end;
	node.nodes = nodes;

	return node;
}

export function EnterBinaryOperation (start: number, parent: Node): BinaryOperationNode {
	const node: BinaryOperationNode = {
		type: 'BinaryOperation',
		start,
		end: start, // will update it in ExitExpression
		parent,
		nodes: [], // will update it in ExitExpression
	};

	return node;
}

export function ExitExpression (node: ExpressionNode, end: number, nodes: Node[]): ExpressionNode {
	node.end = end;
	node.nodes = nodes;

	return node;
}

export function Identifier (token: Token, parent: Node): IdentifierNode {
	return {
		type: 'Identifier',
		name: token.value,
		start: token.start,
		end: token.end,
		parent,
		nodes: [],
	}
}

const Literal = (token: Token, parent: Node | undefined, tree: Node): LiteralNode => {
	let type: NodeType;
	switch (token.type) {
		case 'bool': type = 'BoolLiteral'; break;
		case 'number': type = 'NumberLiteral'; break;
		case 'string': type = 'StringLiteral'; break;
		default: throw new ParserError(`one of ${['bool', 'number', 'string'].join(' or ')} expected at line ${token.line}:${token.end}`, tree);
	}

	return {
		type: type,
		value: token.value,
		start: token.start,
		end: token.end,
		parent,
		nodes: [],
	}
}

export {Literal}
