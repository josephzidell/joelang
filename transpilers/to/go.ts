import { TODO, VisitorSet } from "../types";
import * as Parse from "../../parser/types";
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
		FunctionDeclaration: (node: Syntax.FunctionDeclarationNode): string => {
			return `func ${node.name} (${node.parameters}) {\n${node.body}\n}\n`;
		},
		FunctionReturns: TODO,
		Identifier: TODO,
		ImportDeclaration: TODO,
		Keyword: TODO,
		MemberExpression: TODO,
		MembersList: TODO,
		NumberLiteral: (node: Syntax.NumberLiteralNode): string => node.value,
		Parameter: TODO,
		ParametersList: TODO,
		Parenthesized: TODO,
		Path: TODO,
		PrintStatement: (node: Syntax.PrintStatementNode): string => {
			let out = 'import "fmt";\nfmt.Print(';
			node.contents.forEach(child => {
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
		Program: (node: Syntax.ProgramNode): string => node.children.map(child => this.visitors[child.type](child)).join('\n'),
		RangeExpression: TODO,
		RegularExpression: TODO,
		RestElement: TODO,
		ReturnStatement: TODO,
		RightArrowOperator: TODO,
		SemicolonSeparator: TODO,
		StringLiteral: (node: Syntax.StringLiteralNode): string => `"${node.value}"` || '""',
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
