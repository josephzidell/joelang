import { Node, NodeType } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

function GenericNode (type: NodeType, token: Token, parent: Node): Node {
	const node: Node = {
		type,
		value: token.value,
		start: token.start,
		end: token.end,
		parent,
		nodes: [],
	}

	return node;
}

export const MakeAdditionNode = (token: Token, parent: Node) => GenericNode('AdditionOperator', token, parent);
export const MakeAssignmentNode = (token: Token, parent: Node) => GenericNode('AssignmentOperator', token, parent);
export const MakeBlockStatementNode = (token: Token, parent: Node) => GenericNode('BlockStatement', token, parent);
export const MakeBoolLiteralNode = (token: Token, parent: Node) => GenericNode('BoolLiteral', token, parent);
export const MakeColonNode = (token: Token, parent: Node) => GenericNode('ColonSeparator', token, parent);
export const MakeCommaNode = (token: Token, parent: Node) => GenericNode('CommaSeparator', token, parent);
export const MakeCommentNode = (token: Token, parent: Node) => GenericNode('Comment', token, parent);
export const MakeDivisionNode = (token: Token, parent: Node) => GenericNode('DivisionOperator', token, parent);
export const MakeFilePathNode = (token: Token, parent: Node): Node => GenericNode('FilePath', token, parent);
export const MakeIdentifierNode = (token: Token, parent: Node) => GenericNode('Identifier', token, parent);
export const MakeImportDeclarationNode = (token: Token, parent: Node) => GenericNode('ImportDeclaration', token, parent);
export const MakeKeywordNode = (token: Token, parent: Node) => GenericNode('Keyword', token, parent);
export const MakeModNode = (token: Token, parent: Node) => GenericNode('ModOperator', token, parent);
export const MakeMultiplicationNode = (token: Token, parent: Node) => GenericNode('MultiplicationOperator', token, parent);
export const MakeNumberLiteralNode = (token: Token, parent: Node) => GenericNode('NumberLiteral', token, parent);
export const MakeParenthesizedNode = (token: Token, parent: Node): Node => GenericNode('Parenthesized', token, parent);
export const MakeSemicolonNode = (token: Token, parent: Node) => GenericNode('SemicolonSeparator', token, parent);
export const MakeStringLiteralNode = (token: Token, parent: Node) => GenericNode('StringLiteral', token, parent);
export const MakeSubtractionNode = (token: Token, parent: Node) => GenericNode('SubtractionOperator', token, parent);
export const MakeUnaryExpressionNode = (token: Token, parent: Node) => GenericNode('UnaryExpression', token, parent);
export const MakeVariableDeclarationNode = (token: Token, parent: Node) => GenericNode('VariableDeclaration', token, parent);

// TODO remove this
export const MakeUnknownNode = (token: Token, parent: Node) => GenericNode('Unknown', token, parent);
