import { TODO, Visitor, VisitorSet } from "../types";
import { Node as SyntaxNode } from "../../parser/types";
import * as Parse from "../../parser/types";
import { ParameterNode, ParametersListNode } from "../../syntax/types";

export default class GoTranspiler {
	private syntaxTree;
	private out = '';

	constructor (syntaxTree: SyntaxNode) {
		this.syntaxTree = syntaxTree;
	}

	transpile (): string {
		// root node is Program, so we begin with it
		return this.visitors.Program(this.syntaxTree);
	}

	visitors: VisitorSet = {
		ArgumentsList: TODO,
		ArrayExpression: TODO,
		AssignmentOperator: TODO,
		BinaryExpression: TODO,
		BlockStatement: TODO,
		BoolLiteral: TODO,
		CallExpression: TODO,
		ColonSeparator: TODO,
		CommaSeparator: TODO,
		Comment: (node: SyntaxNode): string => {
			// Typescript doesn't support # style comments
			const comment = node.value || '//';
			if (comment.at(0) === '#') {
				return comment.replace('#', '//'); // replace just the first instance
			}

			return comment;
		},
		FunctionDeclaration: TODO,
		FunctionReturns: TODO,
		Identifier: TODO,
		ImportDeclaration: TODO,
		Keyword: TODO,
		MemberExpression: TODO,
		MembersList: TODO,
		NumberLiteral: (node: SyntaxNode): string => node.value || '0',
		Parameter: TODO,
		ParametersList: TODO,
		Parenthesized: TODO,
		Path: TODO,
		PrintStatement: (node: SyntaxNode): string => {
			let out = 'console.log(';
			node.children.forEach(child => {
				switch (child.type) {
					case Parse.NT.NumberLiteral:
					case Parse.NT.StringLiteral:
						out += this.visitors[child.type](child);
						break;
				}
			});
			out += ');\n';

			return out;
		},
		Program: (node: SyntaxNode): string => node.children.map(child => this.visitors[child.type](child)).join('\n'),
		RangeExpression: TODO,
		RegularExpression: TODO,
		RestElement: TODO,
		ReturnStatement: TODO,
		RightArrowOperator: TODO,
		SemicolonSeparator: TODO,
		StringLiteral: (node: SyntaxNode): string => `"${node.value}"` || '""',
		Type: TODO,
		TypeArgumentsList: TODO,
		TypeParametersList: TODO,
		UnaryExpression: TODO,
		Unknown: TODO,
		VariableDeclaration: TODO,
		WhenExpression: TODO,
		WhenCase: TODO,
		WhenCaseTests: TODO,
		WhenCaseConsequent: TODO,
	}
}
