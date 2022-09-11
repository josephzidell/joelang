import { TODO, VisitorSet } from "../types";
import * as Syntax from "../../syntax/types";

export default class GoTranspiler {
	private syntaxTree;
	// private tree;
	private out = '';

	constructor (syntaxTree: Syntax.ProgramNode) {
		this.syntaxTree = syntaxTree;
	}

	transpile (): string {
		// root node is Program, so we begin with it
		return this.visitors.Program(this.syntaxTree);
	}

	visitors: VisitorSet = {
		AdditionOperator: TODO<Syntax.AdditionOperatorNode>,
		ArgumentsList: TODO<Syntax.ArgumentsListNode>,
		ArrayExpression: TODO,
		AssignmentOperator: TODO,
		BinaryExpression: TODO,
		BlockStatement: TODO,
		BoolLiteral: TODO,
		CallExpression: TODO,
		ColonSeparator: TODO,
		CommaSeparator: TODO,
		Comment: (node: Syntax.CommentNode): string => {
			// Go only supports // style comments

			const comment = node.content;
			if (comment.at(0) === '#') {
				return comment.replace('#', '//'); // replace just the first instance
			}

			return comment;
		},
		DivisionOperator: TODO,
		FunctionDefinition: (node: Syntax.FunctionDefinitionNode): string => {
			return `func ${node.name} (${node.parameters}) {\n${node.body}\n}\n`;
		},
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
		NumberLiteral: (node: Syntax.NumberLiteralNode): string => node.value,
		Parenthesized: TODO,
		Path: TODO,
		PrintStatement: (node: Syntax.PrintStatementNode): string => {
			let out = 'import "fmt";\nfmt.Print(';
			node.contents.forEach(child => {
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
		Program: (node: Syntax.ProgramNode): string => node.children.map(child => this.visitors[child.type](child)).join('\n'),
		RangeExpression: TODO,
		RegularExpression: TODO,
		RestElement: TODO,
		ReturnStatement: TODO,
		RightArrowOperator: TODO,
		SemicolonSeparator: TODO,
		StringLiteral: (node: Syntax.StringLiteralNode): string => `"${node.value}"` || '""',
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
