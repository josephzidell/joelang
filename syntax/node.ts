import { AdditionOperatorNode, BaseNode, IdentifierNode, LiteralNode, Node, ParameterNode, ParametersListNode, TypeNode, UnaryExpressionNode } from "./types";
import { Token, TokenType } from "../lexer/types";
import ParserError from './error';

export const MakeSyntaxNode = {
	AdditionOperator: (token: Token, parent: Node): AdditionOperatorNode => {
		return {
			type: 'AdditionOperator',
			pos: { start: token.start, end: token.end, line: token.line, col: token.col },
			parent,
		}
	},
	Parameter: (token: Token, name: IdentifierNode, type: TypeNode, defaultVal: LiteralNode, rest: boolean, parent: Node): ParameterNode => {
		return {
			type: 'Parameter',
			name,
			argType: type,
			default: defaultVal,
			rest,
			pos: { start: token.start, end: token.end, line: token.line, col: token.col },
			parent,
		}
	},
	ParametersList: (token: Token, args: ParameterNode[], parent: Node): ParametersListNode => {
		return {
			type: 'ParametersList',
			args,
			pos: { start: token.start, end: token.end, line: token.line, col: token.col },
			parent,
		}
	},
	UnaryExpression: (token: Token, operator: string, before: boolean, object: Node, parent: Node): UnaryExpressionNode => {
		return {
			type: 'UnaryExpression',
			operator,
			before,
			object,
			pos: { start: token.start, end: token.end, line: token.line, col: token.col },
			parent,
		}
	},
};

// Argument
// ArgumentsList
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
// FunctionDeclaration
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

export function MakeNodeGen (type: Node['type'], token: Token, parent: BaseNode): BaseNode {
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
