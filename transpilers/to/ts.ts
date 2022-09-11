import { TODO, Visitor, VisitorSet } from "../types";
import { BaseNode as SyntaxNode } from "../../parser/types";

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
		AdditionOperator: TODO,
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
		DivisionOperator: TODO,
		FunctionDefinition: TODO,
		FunctionReturns: TODO,
		GenericTypesList: TODO,
		Identifier: TODO,
		ImportDeclaration: TODO,
		Keyword: TODO,
		MemberExpression: TODO,
		MembersList: TODO,
		ModOperator: TODO,
		MultiplicationOperator: TODO,
		Nil: TODO,
		NumberLiteral: (node: SyntaxNode): string => node.value || '0',
		Parenthesized: TODO,
		Path: TODO,
		PrintStatement: (node: SyntaxNode): string => {
			let out = 'console.log(';
			node.children.forEach(child => {
				switch (child.type) {
					case 'NumberLiteral':
					case 'StringLiteral':
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
		SubtractionOperator: TODO,
		Type: TODO,
		UnaryExpression: TODO,
		Unknown: TODO,
		VariableDeclaration: TODO,
		WhenExpression: TODO,
		WhenCase: TODO,
		WhenCaseTests: TODO,
		WhenCaseConsequent: TODO,
	}
}
