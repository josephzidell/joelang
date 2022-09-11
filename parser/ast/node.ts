import { AdditionOperatorNode, ArgumentDefNode, ArgumentsDefListNode, BaseNode, IdentifierNode, LiteralNode, Node, NodeType, TypeNode, UnaryExpressionNode } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

export const MakeASTNode = {
	AdditionOperator: (token: Token, parent: Node): AdditionOperatorNode => {
		const node: AdditionOperatorNode = {
			type: 'AdditionOperator',
			pos: {
				start: token.start,
				end: token.end,
				line: token.line,
				col: token.col,
			},
			parent,
		}

		return node;
	},
	ArgumentDef: (token: Token, name: IdentifierNode, type: TypeNode, defaultVal: LiteralNode, rest: boolean, parent: Node): ArgumentDefNode => {
		const node: ArgumentDefNode = {
			type: 'ArgumentDef',
			name,
			argType: type,
			default: defaultVal,
			rest,
			pos: {
				start: token.start,
				end: token.end,
				line: token.line,
				col: token.col,
			},
			parent,
		}

		return node;
	},
	ArgumentsDefList: (token: Token, parent: Node): ArgumentsDefListNode => {
		const node: ArgumentsDefListNode = {
			type: 'ArgumentsDefList',
			pos: {
				start: token.start,
				end: token.end,
				line: token.line,
				col: token.col,
			},
			parent,
		}

		return node;
	},
	UnaryExpression: (token: Token, operator: string, before: boolean, object: Node, parent: Node): UnaryExpressionNode => {
		const node: UnaryExpressionNode = {
			type: 'UnaryExpression',
			operator,
			before,
			object,
			pos: {
				start: token.start,
				end: token.end,
				line: token.line,
				col: token.col,
			},
			parent,
		}

		return node;
	},
};

// ArgumentsDefList
// ArgumentLiteral
// ArgumentsLiteralList
// ArrayExpression
// AssignmentOperator
// BinaryExpression
// BlockStatement
// BoolLiteral
// CallExpression
// ColonSeparator
// CommaSeparator
// Comment
// DivisionOperator
// FunctionDefinition
// FunctionReturns
// GenericTypesList
// Identifier
// ImportDeclaration
// Keyword
// MemberExpression
// MembersList
// ModOperator
// MultiplicationOperator
// Nil
// NumberLiteral
// Parenthesized
// Path
// PrintStatement
// RangeExpression
// RegularExpression
// RestElement
// ReturnStatement
// RightArrowOperator
// SemicolonSeparator
// StringLiteral
// SubtractionOperator
// Type
// UnaryExpression
// Unknown
// VariableDeclaration
// WhenExpression
// WhenCase
// WhenCaseTests
// WhenCaseConsequent


export function MakeNodeGen (type: NodeType, token: Token, parent: BaseNode): BaseNode {
	const node: BaseNode = {
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
