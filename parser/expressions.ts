import { LiteralNode, IdentifierNode, Node, NodeType, FilePathNode, ImportDeclarationNode, VariableDeclarationNode, UnaryExpressionNode, ExpressionNode, BinaryOperationNode, VariableDeclarationKind } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

export function GenericNode (token: Token, parent: Node) {
	const node: Node = {
		type: 'Unknown',
		value: token.value,
		parent,
		start: token.start,
		end: token.end,
		nodes: [],
	}

	return node;
}

export function BlockStatementNode (token: Token, parent: Node): Node {
	const node: Node = {
		type: 'BlockStatement',
		value: '',
		parent,
		start: token.start,
		end: token.end,
		nodes: [],
	}

	return node;
}

export function CommentNode (token: Token, parent: Node) {
	const node: Node = {
		type: 'Comment',
		value: token.value,
		parent,
		start: token.start,
		end: token.end,
		nodes: [],
	}

	return node;
}

function OperatorNode (type: NodeType, value: string, token: Token, parent: Node): Node {
	const node: Node = {
		type,
		value,
		parent,
		start: token.start,
		end: token.end,
		nodes: [],
	}

	return node;
}
export const AssignmentOperatorNode = (token: Token, parent: Node) => OperatorNode('AssignmentOperator', '=', token, parent);
export const AdditionOperatorNode = (token: Token, parent: Node) => OperatorNode('AdditionOperator', '+', token, parent);
export const SubtractionOperatorNode = (token: Token, parent: Node) => OperatorNode('SubtractionOperator', '-', token, parent);
export const MultiplicationOperatorNode = (token: Token, parent: Node) => OperatorNode('MultiplicationOperator', '*', token, parent);
export const DivisionOperatorNode = (token: Token, parent: Node) => OperatorNode('DivisionOperator', '/', token, parent);
export const ModulusOperatorNode = (token: Token, parent: Node) => OperatorNode('ModulusOperator', '%', token, parent);

export function KeywordNode (type: NodeType, token: Token, parent: Node): Node {
	const node: Node = {
		type,
		value: token.value,
		parent,
		start: token.start,
		end: token.end,
		nodes: [],
	}

	return node;
}

function SeparatorNode (type: NodeType, value: string, token: Token, parent: Node): Node {
	const node: Node = {
		type,
		value,
		parent,
		start: token.start,
		end: token.end,
		nodes: [],
	}

	return node;
}
export const SemicolonSeparatorNode = (token: Token, parent: Node) => SeparatorNode('SemicolonSeparator', ';', token, parent);
export const ColonSeparatorNode = (token: Token, parent: Node) => SeparatorNode('ColonSeparator', ':', token, parent);
export const CommaSeparatorNode = (token: Token, parent: Node) => SeparatorNode('CommaSeparator', ',', token, parent);

export function UnaryExpressionNode (token: Token, parent: Node): UnaryExpressionNode {
	const node: UnaryExpressionNode = {
		type: 'UnaryExpression',
		operator: token.value,
		parent,
		start: token.start,
		end: token.end,
		nodes: [],
	}

	return node;
}

export function ParenthesizedNode (parent: Node, start: number): Node {
	const node: Node = {
		type: 'Parenthesized',
		value: '(',
		parent,
		start,
		end: start, // will be updated
		nodes: [],
	}

	return node;
}

export function ImportDeclarationNode (token: Token, parent: Node): ImportDeclarationNode {
	const node: ImportDeclarationNode = {
		type: 'ImportDeclaration',
		start: token.start,
		end: token.end,
		parent,
		nodes: [],
	};

	return node;
}

export function VariableDeclarationNode (token: Token, parent: Node): VariableDeclarationNode {
	const node: VariableDeclarationNode = {
		type: 'VariableDeclaration',
		kind: token.value as VariableDeclarationKind,
		start: token.start,
		end: token.end,
		parent,
		nodes: [],
	};

	return node;
}

export function ExitExpression (node: ExpressionNode, end: number, nodes: Node[]): ExpressionNode {
	node.end = end;
	node.nodes = nodes;

	return node;
}

export function FilePathNode (token: Token, parent: Node): FilePathNode {
	return {
		type: 'FilePath',
		value: token.value,
		start: token.start,
		end: token.end,
		parent,
		nodes: [],
	}
}

export function IdentifierNode (token: Token, parent: Node): IdentifierNode {
	return {
		type: 'Identifier',
		name: token.value,
		start: token.start,
		end: token.end,
		parent,
		nodes: [],
	}
}

export function LiteralNode (token: Token, parent: Node, tree: Node): LiteralNode {
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
