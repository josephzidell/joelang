import _ from "lodash";
import { Simplify } from "type-fest";
import { builtInTypes } from "../lexer/types";
import { regexFlags } from "../lexer/util";
import Parser from "../parser/parser";
import { AssignableNodeTypes, ExpressionNodeTypes, Node, NT, UnaryExpressionNode } from "../parser/types";
import ErrorContext from "../shared/errorContext";
import { has, hasNot } from "../shared/maybe";
import { error, ok, Result, ResultAndAMaybe } from "../shared/result";
import {
	AssignableASTs,
	AST,
	ASTArgumentsList,
	ASTArrayExpression,
	ASTBinaryExpression,
	ASTBlockStatement,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTClassDeclaration,
	ASTIdentifier,
	ASTIdentifierWithTypeParams,
	ASTIdentifierOrMemberExpressionWithTypeArgs,
	ASTMemberExpression,
	ASTModifier,
	ASTNumberLiteral,
	ASTPath,
	ASTProgram,
	ASTRegularExpression,
	ASTStringLiteral,
	ASTType,
	ASTTypeArgument,
	ASTTypeBuiltIn,
	ASTTypeBuiltInBool,
	ASTTypeBuiltInNumber,
	ASTTypeBuiltInPath,
	ASTTypeBuiltInRegex,
	ASTTypeBuiltInString,
	ASTTypeUserDefined,
	ASTUnaryExpression,
	ASTVariableDeclaration,
	Expression,
	Skip,
} from "./asts";
import AnalysisError, { AnalysisErrorCode } from "./error";
import visitorMap, { visitor } from "./visitorMap";

// reusable handler callback for child nodes if we want to skip them
const skipThisChild = (child: Node) => ok(undefined);

type childNodeHandler = Simplify<{
	type: NT | NT[];
	callback: (child: Node) => Result<void>;
} & ({
	required: true | ((child: Node | undefined, childIndex: number, allChildren: Node[]) => boolean);
	errorCode: AnalysisErrorCode;
	errorMessage: string;
} | {
	required: false;
})>;

export default class SemanticAnalyzer {
	currentNode: Node;
	private _parser: Parser;
	public get parser(): Parser {
		return this._parser;
	}
	private readonly cst: Node;
	private ast!: AST;
	private astPointer = this.ast;

	/** Inline analyses are more lenient than a file */
	private isAnInlineAnalysis = false;

	private debug = false;

	constructor(cst: Node, parser: Parser) {
		this.cst = cst;
		this.currentNode = cst;
		this._parser = parser;
	}

	thisIsAnInlineAnalysis() {
		this.isAnInlineAnalysis = true;
	}

	analyze(): Result<ASTProgram> {
		if (this.debug && this.isAnInlineAnalysis) {
			console.info(`[SemanticAnalyzer] Analyzing '${this.parser.lexer.code}'`);
		}

		// this will call child nodes recursively and build the AST
		return this.nodeToAST<ASTProgram>(this.cst);
	}

	getAST(): AST {
		return this.ast;
	}

	nodeToAST<T = AST>(node: Node): Result<T> {
		this.currentNode = node;

		if (node.type in visitorMap) {
			return (visitorMap[node.type] as visitor)(node, this);
		}

		return error(new AnalysisError(
			AnalysisErrorCode.MissingVisitee,
			`Please implement visit${node.type.at(0)?.toUpperCase}${node.type.substring(1)}() method`,
			node,
			new ErrorContext(
				this.parser.lexer.code,
				node.pos.line,
				node.pos.col,
				node.value?.length || 1,
			),
		), this.getAST);
	}

	// reusable function to handle a node that has a value
	// we will check the node type and that the node has a value
	// if it does, we will call the callback to assign the value to the AST node
	// if it doesn't, we will return an error
	handleNodeThatHasValueAndNoChildren<T extends AST>(node: Node, expectedNodeType: NT, callback: (value: string) => T, errorCode: AnalysisErrorCode, errorMessage: string): Result<T> {
		if (node.type === expectedNodeType && node.value) {
			const ast = callback(node.value);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(errorCode, errorMessage, node, this.getErrorContext(node, node.value?.length || 1)), this.ast);
	}

	// reusable function to handle a node that has children of the same type
	// we will check the node type and that the node has a value
	// if it does, we will call the callback to assign the value to the AST node
	// if it doesn't, we will return an error
	convertNodesChildrenOfSameType<R>(
		parentNode: Node,
		validChildren: NT[],
		errorCode: AnalysisErrorCode,
		errorMessageFn: (child: Node) => string,
		converter?: (node: Node) => Result<R, Error, unknown>,
	): Result<Array<Exclude<R, Skip>>> {
		const children: Array<Exclude<R, Skip>> = [];

		for (const child of parentNode.children) {
			if (validChildren.includes(child.type)) {
				let result: Result<R>;
				if (typeof converter === 'undefined') {
					result = this.nodeToAST(child);
				} else {
					result = converter.call(this, child);
				}

				switch (result.outcome) {
					case 'ok':
						if (result.value instanceof Skip) {
							continue;
						}

						children.push(result.value as Exclude<R, Skip>);
						break;
					case 'error': return result; break;
				}
			} else {
				return error(new AnalysisError(errorCode, errorMessageFn(child), child, this.getErrorContext(child, 1)), this.ast);
			}
		}

		return ok(children);
	}

	visitArgumentList(node: Node): Result<ASTArgumentsList> {
		const ast = new ASTArgumentsList();

		const argsResult = this.convertNodesChildrenOfSameType<AssignableASTs>(node, [...AssignableNodeTypes, NT.CommaSeparator], AnalysisErrorCode.AssignableExpected, (child) => `Assignable Expected: ${child.type}`);
		switch (argsResult.outcome) {
			case 'ok': ast.args = argsResult.value; break;
			case 'error': return argsResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/** An ArrayExpression needs a type, which can be evaluated either via the first item or via the context (VariableDeclaration, Argument Type, etc.) */
	visitArrayExpression(node: Node): Result<ASTArrayExpression> {
		const ast = new ASTArrayExpression();

		const itemsResult = this.convertNodesChildrenOfSameType<AssignableASTs>(node, [...AssignableNodeTypes, NT.CommaSeparator], AnalysisErrorCode.AssignableExpected, (child) => `Assignable Expected: ${child.type}`);
		switch (itemsResult.outcome) {
			case 'ok': ast.items = itemsResult.value; break;
			case 'error': return itemsResult; break;
		}

		// infer the type from the first value
		if (ast.items.length > 0) {
			const assignmentResult = this.assignInferredType(ast.items[0], node.children[0], (inferredType: ASTType) => {
				ast.type = inferredType;
			});
			if (assignmentResult.outcome === 'error') {
				return error(assignmentResult.error, this.ast);
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitBinaryExpression(node: Node): Result<ASTBinaryExpression<Expression, Expression>> {
		const ast = new ASTBinaryExpression<Expression, Expression>();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: the operator
		if (!node.value) {
			return error(new AnalysisError(
				AnalysisErrorCode.OperatorExpected,
				'Operator Expected',
				node,
				this.getErrorContext(node, 1),
			), this.ast);
		}

		ast.operator = node.value;

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: left-hand side
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.nodeToAST<Expression>(child);
					switch (visitResult.outcome) {
						case 'ok': ast.left = visitResult.value; break;
						case 'error': return visitResult; break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: 'Expression Expected',
			},

			// second child: right-hand side
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.nodeToAST<Expression>(child);
					switch (visitResult.outcome) {
						case 'ok': ast.right = visitResult.value; break;
						case 'error': return visitResult; break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: 'Expression Expected',
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitBlockStatement(node: Node): Result<ASTBlockStatement> {
		const validChildren = Object.values(NT).filter(nt => nt !== NT.ImportDeclaration);

		const ast = new ASTBlockStatement();

		// next, get the expressions from the children
		const expressionsResult = this.convertNodesChildrenOfSameType<AST>(
			node,
			validChildren,
			AnalysisErrorCode.ExtraNodesFound,
			(child: Node) => `A ${child.type} is not allowed directly in a ${node.type}`,
		);
		switch (expressionsResult.outcome) {
			case 'ok': ast.expressions = expressionsResult.value; break;
			case 'error': return expressionsResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitBoolLiteral(node: Node): Result<ASTBoolLiteral> {
		if (node?.type === NT.BoolLiteral && node.value) {
			const ast = ASTBoolLiteral._(node.value === 'true');

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.BoolLiteralExpected, 'Bool Expected', node, this.getErrorContext(node, 1)), this.ast);
	}

	visitCallExpression(node: Node): Result<ASTCallExpression> {
		const ast = new ASTCallExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the callee
			{
				type: [NT.Identifier, NT.MemberExpression],
				required: true,
				callback: (child) => {
					const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(child);
					switch (visitResult.outcome) {
						case 'ok': ast.callee = visitResult.value; break;
						case 'error': return visitResult; break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: 'Identifier Expected',
			},

			// second child: the type arguments
			{
				type: NT.TypeArgumentsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitTypeArgumentsList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.typeArgs = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// third child: the arguments
			{
				type: NT.ArgumentsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitArgumentList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.args = visitResult.value.args; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				}
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitClassExtensionsList(node: Node): Result<Array<ASTIdentifier | ASTMemberExpression | ASTIdentifierOrMemberExpressionWithTypeArgs>> {
		return this.convertNodesChildrenOfSameType(
			node,
			[NT.Identifier, NT.MemberExpression, NT.TypeArgumentsList, NT.CommaSeparator],
			AnalysisErrorCode.IdentifierExpected,
			() => 'Identifier Expected',
			this.handleIdentifierOrMemberExpressionWithPossibleTypeArgs
		);
	}

	visitClassImplementsList(node: Node): Result<Array<ASTIdentifier | ASTMemberExpression | ASTIdentifierOrMemberExpressionWithTypeArgs>> {
		return this.convertNodesChildrenOfSameType(
			node,
			[NT.Identifier, NT.MemberExpression, NT.TypeArgumentsList],
			AnalysisErrorCode.IdentifierExpected,
			() => 'Identifier Expected',
			this.handleIdentifierOrMemberExpressionWithPossibleTypeArgs,
		);
	}

	handleIdentifierOrMemberExpressionWithPossibleTypeArgs(node: Node): Result<ASTIdentifier | ASTMemberExpression | ASTIdentifierOrMemberExpressionWithTypeArgs | Skip> {
		if (node.type === NT.Identifier || node.type === NT.MemberExpression) {
			const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(node);
			switch (visitResult.outcome) {
				case 'ok': return ok(visitResult.value); break;
				case 'error': return visitResult; break;
			}
		} else if (node.type === NT.TypeArgumentsList) {
			const visitResult = this.visitTypeArgumentsList(node);
			switch (visitResult.outcome) {
				case 'ok': return ok(visitResult.value); break;
				case 'error': return visitResult; break;
			}
		} else if (node.type === NT.CommaSeparator) {
			return this.nodeToAST(node);
		} else {
			return error(new AnalysisError(
				AnalysisErrorCode.ExpressionNotExpected,
				`Unexpected expression ${node.type}`,
				node,
				this.getErrorContext(node, node.value?.length || 1),
			), this.ast);
		}
	}

	visitIdentifierWithTypeParameters(node: Node): Result<ASTIdentifierWithTypeParams> {
		const ast = new ASTIdentifierWithTypeParams();

		const childrenResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the name
			{
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const visitResult = this.visitIdentifier(child);
					switch (visitResult.outcome) {
						case 'ok': ast.identifier = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: 'Identifier Expected',
			},

			// second child: the type parameters
			{
				type: NT.TypeParametersList,
				required: true,
				callback: (child) => {
					const visitResult = this.visitTypeParametersList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.typeParams = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: 'Type Expected',
			},
		]);
		if (childrenResult.outcome === 'error') {
			return childrenResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitClassDeclaration(node: Node): Result<ASTClassDeclaration> {
		const ast = new ASTClassDeclaration();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the modifiers
			{
				type: NT.ModifiersList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitModifiersList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.modifiers = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// second child: the name
			{
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					switch (result.outcome) {
						case 'ok': ast.name = result.value; return ok(undefined); break;
						case 'error': return result; break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: 'Identifier Expected',
			},

			// third child: type parameters
			{
				type: NT.TypeParametersList,
				required: false,
				callback: (child) => {
					const result = this.visitTypeParametersList(child);
					switch (result.outcome) {
						case 'ok': ast.typeParams = result.value; return ok(undefined); break;
						case 'error': return result; break;
					}
				},
			},

			// fourth child: the extends list
			{
				type: NT.ClassExtensionsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitClassExtensionsList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.extends = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// fifth child: the implements list
			{
				type: NT.ClassImplementsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitClassImplementsList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.implements = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// sixth child: the body
			{
				type: NT.BlockStatement,
				required: true,
				callback: (child) => {
					const visitResult = this.visitBlockStatement(child);
					switch (visitResult.outcome) {
						case 'ok': ast.body = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.BodyExpected,
				errorMessage: 'Class Body Expected',
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/**
	 * @param node Possibly undefined node to visit. While most visitees have a definite node, this one does not
	 * @returns
	 */
	visitIdentifier(node: Node | undefined): Result<ASTIdentifier> {
		// this node is special so needs this check for undefined
		if (typeof node === 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.IdentifierExpected,
				'Identifier Expected',
				node,
				this.getErrorContextUnsafe(node, 1),
			), this.ast);
		}

		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Identifier,
			(value) => ASTIdentifier._(value),
			AnalysisErrorCode.IdentifierExpected,
			'Identifier Expected'
		);
	}

	visitMemberExpression(node: Node): Result<ASTMemberExpression> {
		const ast = new ASTMemberExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type) {
				return error(new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'Identifier Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			// TODO add NT.CallExpression
			if (([NT.Identifier, NT.MemberExpression] as NT[]).includes(child.type)) {
				const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.object = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			}
		}

		// next grammatical requirement: child (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || child.type !== NT.Identifier) {
				return error(new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'Identifier Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			const visitResult = this.nodeToAST<ASTIdentifier>(child);
			switch (visitResult.outcome) {
				case 'ok': ast.property = visitResult.value; break;
				case 'error': return visitResult; break;
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.SemicolonExpected,
				'Semicolon Expected',
				child,
				this.getErrorContext(child, 1),
			), this.ast);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitModifier(node: Node): Result<ASTModifier> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Modifier,
			(value) => ASTModifier._(value),
			AnalysisErrorCode.ModifierExpected,
			'Modifier Expected'
		);
	}

	visitModifiersList(node: Node): Result<ASTModifier[]> {
		return this.convertNodesChildrenOfSameType(
			node,
			[NT.Modifier],
			AnalysisErrorCode.ModifierExpected,
			() => 'Modifier Expected',
		);
	}

	visitNumberLiteral(node: Node): Result<ASTNumberLiteral> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.NumberLiteral,
			(value) => {
				const commasRemoved = value.replace(/\,/g, '');

				// TODO test this
				if (value.includes('.')) {
					return ASTNumberLiteral._({ format: 'decimal', value: parseFloat(commasRemoved) });
				} else {
					return ASTNumberLiteral._({ format: 'int', value: parseInt(commasRemoved) });
				}
			},
			AnalysisErrorCode.NumberLiteralExpected,
			'Number Expected'
		);
	}

	visitParenthesized(node: Node): Result<AssignableASTs> {
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: the assignable
		{
			const child = nodesChildren.shift();
			if (!child?.type || !AssignableNodeTypes.includes(child.type)) {
				return error(new AnalysisError(
					AnalysisErrorCode.AssignableExpected,
					'Assignable Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			// this is a pass-through node, aka return the child, since we don't retain parentheses
			return this.nodeToAST<AssignableASTs>(child);
		}
	}

	visitPath(node: Node): Result<ASTPath> {
		if (node?.type === NT.Path && node.value) {
			const ast = new ASTPath();

			// first, determine if the path is relative or absolute
			ast.absolute = node.value.startsWith('@');

			// next, split the path into its parts
			ast.path = node.value;

			// finally, check if there's a trailing slash
			ast.isDir = ast.path.endsWith('/');

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.ValidPathExpected, 'Valid Path Expected', node, this.getErrorContext(node, 1)), this.ast);
	}

	visitProgram(node: Node): Result<ASTProgram> {
		let validChildren = [NT.ClassDeclaration, NT.FunctionDeclaration, NT.ImportDeclaration, NT.InterfaceDeclaration, NT.SemicolonSeparator, NT.VariableDeclaration];

		// if this is an inline analysis, allow all ASTs in the program, to avoid having
		// to wrap code in a function, class, or variable declaration just to analyze it
		if (this.isAnInlineAnalysis) {
			validChildren = Object.values(NT);
		}

		const ast = new ASTProgram();

		// next, get the expressions from the children
		const expressionsResult = this.convertNodesChildrenOfSameType<AST>(
			node,
			validChildren,
			AnalysisErrorCode.ExtraNodesFound,
			(child: Node) => `A ${child.type} is not allowed directly in a ${node.type}`,
		);
		switch (expressionsResult.outcome) {
			case 'ok': ast.expressions = expressionsResult.value; break;
			case 'error': return expressionsResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitRegularExpression(node: Node): Result<ASTRegularExpression> {
		if (node?.type === NT.RegularExpression && node.value) {
			const ast = new ASTRegularExpression();

			// separate pattern and flags
			const lastSlashStringIndex = node.value?.lastIndexOf('/');

			// first grammatical requirement: pattern (required)
			{
				const pattern = node.value.slice(0, lastSlashStringIndex + 1);

				// check if pattern is valid
				var isValid = true;
				try {
					new RegExp(pattern);
				} catch (e) {
					isValid = false;
				}

				if (!isValid) {
					return error(new AnalysisError(AnalysisErrorCode.InvalidRegularExpression, 'Invalid regular expression pattern', node, this.getErrorContext(node, node.value.length)));
				}

				ast.pattern = pattern;
			}

			// second grammatical requirement: flags (optional)
			{
				const flags = node.value.slice(lastSlashStringIndex + 1).split('');

				// check for unidentified flags. this probably isn't neessary since the lexer does this, but it's a double check
				const unidentifiedFlags = flags.filter(f => !regexFlags.includes(f));
				if (unidentifiedFlags.length > 0) {
					return error(new AnalysisError(AnalysisErrorCode.InvalidRegularExpression, 'Invalid regular expression flags', node, this.getErrorContext(node, node.value.length)));
				}

				ast.flags = flags;
			}

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.ExpressionExpected, 'Regular Expression expected', node, this.getErrorContext(node, 1)));
	}

	visitStringLiteral(node: Node): Result<ASTStringLiteral> {
		if (node?.type === NT.StringLiteral && node.value) {
			const ast = new ASTStringLiteral();

			ast.value = node.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.BoolLiteralExpected, 'Bool Expected', node, this.getErrorContext(node, 1)), this.ast);
	}

	/**
	 * Visits a type node.
	 *
	 * Note this method differs slightly from other visitees, in that it handles
	 * the case where a type is in the form of a MemberExpression (`Foo.Bar`)
	 *
	 * @param node Possibly undefined node to visit. While most visitees have a definite node, this one does not
	 * @returns A result with an ASTType or ASTMemberExpression
	 */
	visitType(node: Node | undefined): Result<ASTType | ASTMemberExpression> {
		const errorResult = error<ASTType | ASTMemberExpression>(new AnalysisError(
			AnalysisErrorCode.TypeExpected,
			`Type Expected, received "${node?.value}"`,
			node,
			this.getErrorContextUnsafe(node, node?.value?.length || 1),
		));

		if (!node?.type) {
			return errorResult;
		}

		switch (node.type) {
			// check if it's a built-in type
			case NT.Type:
				if (node.value && builtInTypes.includes(node.value)) {
					const ast = new ASTTypeBuiltIn();

					ast.type = node.value;

					this.astPointer = this.ast = ast;

					return ok(ast);
				} else {
					return errorResult;
				}
				break;

			// otherwise it's a user-defined type, which could be an Identifier or a MemberExpression
			case NT.Identifier:
			case NT.MemberExpression:
				const visitResult = this.nodeToAST(node);
				switch (visitResult.outcome) {
					case 'ok':
						const ast = new ASTTypeUserDefined();

						// nodeToAST() uses type AST, so some casting is necessary
						ast.type = visitResult.value as ASTIdentifier | ASTMemberExpression;

						this.astPointer = this.ast = ast;

						return ok(ast);
					case 'error':
						return visitResult;
				}
				break;
		}

		// unknown
		return errorResult;
	}

	visitTypeArgumentsList(node: Node): Result<ASTTypeArgument[]> {
		const validChildren = [NT.CommaSeparator, NT.Identifier, NT.MemberExpression, NT.Type];

		const typeArgs: ASTTypeArgument[] = [];

		for (const child of node.children) {
			if (validChildren.includes(child.type)) {
				const visitResult = this.nodeToAST(child);
				switch (visitResult.outcome) {
					case 'ok':
						if (visitResult.value instanceof Skip) {
							continue;
						}

						typeArgs.push(visitResult.value);
						break;
					case 'error':
						return visitResult;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.TypeExpected,
					`Type Expected, received "${child.value}"`,
					child,
					this.getErrorContext(child, child.value?.length || 1),
				));
			}
		}

		return ok(typeArgs);
	}

	visitTypeParameter(node: Node): Result<ASTIdentifier> {
		const nodesChildren = [...node.children]; // clone the children so we can modify them

		// first grammatical requirement: identifier
		{
			const firstChild = nodesChildren.shift();
			if (firstChild?.type === NT.Identifier) {
				return this.visitIdentifier(firstChild);
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'Identifier Expected',
					node,
					this.getErrorContext(node, node.value?.length || 1),
				));
			}
		}
	}

	visitTypeParametersList(node: Node): Result<ASTIdentifier[]> {
		let typeParams: ASTIdentifier[] = [];

		const conversionResult = this.convertNodesChildrenOfSameType<ASTIdentifier>(node, [NT.TypeParameter], AnalysisErrorCode.TypeExpected, () => 'Type Expected');
		switch (conversionResult.outcome) {
			case 'ok': typeParams = conversionResult.value; break;
			case 'error': return conversionResult; break;
		}

		return ok(typeParams);
	}

	visitUnaryExpression(node: UnaryExpressionNode): Result<ASTUnaryExpression<Expression>> {
		const ast = new ASTUnaryExpression<Expression>();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: is the operator before or after the operand
		ast.before = node.before;

		// second grammatical requirement: the operator
		if (!node.value) {
			return error(new AnalysisError(
				AnalysisErrorCode.OperatorExpected,
				'Operator Expected',
				node,
				this.getErrorContext(node, 1),
			), this.ast);
		}

		ast.operator = node.value;

		// third grammatical requirement: the operand
		{
			const child = nodesChildren.shift();
			if (child?.type && ExpressionNodeTypes.includes(child.type)) {
				const visitResult = this.nodeToAST<Expression>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.operand = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.ExpressionExpected,
					'Expression Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.SemicolonExpected,
				'Semicolon Expected',
				child,
				this.getErrorContext(child, 1),
			), this.ast);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	// reusable function to handle a node that has children of different types
	// each child can be either required, optional, or dependent on whether a previous child of certain type was present
	// each child will have a callback that will be called if the child is present
	// if the child is not present, and it is required, we will return an error
	handleNodesChildrenOfDifferentTypes(
		node: Node,
		childrenHandlers: Array<childNodeHandler>,
	): Result<undefined> {
		const children = [...node.children]; // make a copy to avoid mutating the original node

		if (this.debug) {
			// debug that we're beginning this function
			console.debug('begin handleNodesChildrenOfDifferentTypes...', );

			// debug the children
			console.groupCollapsed('children.length', children.length);
			console.debug({ children });
			console.groupEnd();

			// debug children handlers
			console.groupCollapsed('childrenHandlers.length', childrenHandlers.length);
			console.debug({ childrenHandlers });
			console.groupEnd();
		}

		// get the first child
		let child = children.shift();
		if (this.debug) {
			console.groupCollapsed('handling child of type', child?.type);
			console.debug({ child });
			console.groupEnd();
		}

		// loop through the children handlers
		for (const [index, childHandler] of childrenHandlers.entries()) {
			// debug the handler number
			if (this.debug) {
				console.groupCollapsed('checking child handler', index, 'against child of type', child?.type);
				console.debug({ childHandler });
				console.groupEnd();
			}

			// concretize the required function if it is a function
			const definitelyRequired = typeof childHandler.required === 'boolean' && childHandler.required;
			// when running a callback, provide *the unmodified children array*
			const required = definitelyRequired || (typeof childHandler.required === 'function' && childHandler.required(child, index, node.children));
			if (this.debug) {
				console.debug('handler required', required);
			}

			// if the child is required and it is not present, return an error
			if (required && !child) {
				return error(new AnalysisError(childHandler.errorCode, childHandler.errorMessage, node, this.getErrorContext(node, node.value?.length || 1)), this.ast);
			}

			// if the child is present
			if (child) {
				// is the type acceptable?
				const isTheTypeAcceptable = typeof childHandler.type === 'undefined'
					|| (typeof childHandler.type === 'string' && child.type === childHandler.type)
					|| (Array.isArray(childHandler.type) && childHandler.type.includes(child.type));

				// debug the isTheTypeAcceptable value
				if (this.debug) {
					console.groupCollapsed('isTheTypeAcceptable', isTheTypeAcceptable);
					if (!isTheTypeAcceptable) {
						console.debug('found child.type', child.type);
						console.debug('wanted childHandler.type', childHandler.type);
					}
					console.groupEnd();
				}

				// if it's required, AND there is a type, check that the child type is the expected type
				if (!isTheTypeAcceptable) {
					if (required) {
						// debug the situation
						if (this.debug) {
							console.debug("we're expecting a child of type", childHandler.type, 'but we found a child of type', child.type);
							console.debug('and this child is required, so we will return an error');
						}

						return error(new AnalysisError(childHandler.errorCode, childHandler.errorMessage, child, this.getErrorContext(child, child.value?.length || 1)), this.ast);
					} else {
						// debug the situation
						if (this.debug) {
							console.debug("we're expecting a child of type", childHandler.type, 'but we found a child of type', child.type);
							console.debug('since this handler is not required, we will skip it');
						}
						continue;
					}
				}

				// call the callback
				const callbackResult = childHandler.callback(child);

				// debug the callback result
				if (this.debug) {
					console.debug('callbackResult', callbackResult);
				}

				if (callbackResult.outcome === 'error') {
					return callbackResult;
				}
			}

			// lastly, we can get the next child, if there is one
			child = children.shift();

			// debug the next child
			if (this.debug) {
				if (child) {
					console.groupCollapsed('child', child?.type);
					console.debug({ child });
					console.groupEnd();
				} else {
					console.debug('no more children');
				}
			}
		}

		// there should be no more children
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.ExpressionNotExpected,
				'Expression Not Expected',
				child,
				this.getErrorContext(child, child.value?.length ?? 1),
			), this.ast);
		}

		if (this.debug) {
			console.debug('end handleNodesChildrenOfDifferentTypes', );
		}

		return ok(undefined);
	}

	visitVariableDeclaration(node: Node): Result<ASTVariableDeclaration> {
		const ast = new ASTVariableDeclaration();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: mutability keyword (from the value)
		if (node.value && ['const', 'let'].includes(node.value)) {
			ast.mutable = node.value === 'let';
		} else {
			return error(new AnalysisError(
				AnalysisErrorCode.KeywordExpected,
				'Expecting keyword "const" or "let"',
				node,
				this.getErrorContext(node, 1),
			), this.ast);
		}

		// handle the child nodes of different types
		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// next grammatical requirement: identifier (required)
			{
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const visitResult = this.visitIdentifier(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.identifier = visitResult.value;

							// if the identifer ends with a '?', that _is_ declaring the type as bool
							if (ast.identifier.name.at(-1) === '?') {
								ast.declaredType = ASTTypeBuiltInBool;
							}

							return ok(undefined);
							break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: 'Expecting identifier',
			},

			// next grammatical requirement: type annotation (optional)
			{
				type: NT.ColonSeparator,
				required: false,

				// do nothing, we just want to skip over the colon separator
				callback: skipThisChild,
			},

			// next grammatical requirement: type annotation (requied if there was a colon separator)
			{
				type: [NT.Identifier, NT.MemberExpression, NT.Type],
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.ColonSeparator;
				},
				callback: (child) => {
					const visitResult = this.visitType(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.declaredType = visitResult.value;
							break;
						case 'error': return visitResult; break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: 'Expecting type',
			},

			// next could be an initial value assignment, or nothing
			{
				type: NT.AssignmentOperator,
				required: false,

				// do nothing, we just want to skip over the assignment operator
				callback: skipThisChild,
			},

			// next child must be an expression if there was an assignment operator
			// or nothing if there was no assignment operator
			{
				type: AssignableNodeTypes,

				// if the previous child was an assignment operator, then this child is required
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.AssignmentOperator;
				},

				callback: (child) => {
					const visitResult = this.nodeToAST<AssignableASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.initialValue = visitResult.value;

							// now attempt to infer the type from the initial value

							// ast.initialValue is guaranteed to be defined at this point
							this.assignInferredType(ast.initialValue, child, (inferredType: ASTType) => {
								ast.inferredType = inferredType;
							});

							// console.debug({
							// 	inferredType: ast.inferredType,
							// 	inferredConstructor: ast.inferredType.constructor,
							// 	declaredType: ast.declaredType,
							// 	declaredConstructor: ast.declaredType?.constructor,
							// 	match: ast.inferredType.constructor !== ast.declaredType?.constructor,
							// })
							if (typeof ast.declaredType !== 'undefined' && typeof ast.inferredType !== 'undefined' && ast.inferredType.constructor !== ast.declaredType?.constructor) {
								return error(new AnalysisError(
									AnalysisErrorCode.TypeMismatch,
									`cannot assign a "${ast.inferredType}" to a "bool"`,
									child,
									this.getErrorContext(child, child.value?.length || 1),
								));
							}
							break;
						case 'error': return visitResult; break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.AssignableExpected,
				errorMessage: 'Expecting assignable expression',
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		// now perform some additional checks

		// if the identifier ends with a '?', check that either the declared type is bool
		// or that the inferred type is bool
		if (ast.identifier.name.at(-1) === '?') {
			if (typeof ast.declaredType !== 'undefined' && !_.isEqual(ast.declaredType, ASTTypeBuiltInBool)) {
				return error(new AnalysisError(
					AnalysisErrorCode.BoolTypeExpected,
					`bool type expected since the variable name "${ast.identifier.name}" ends with a "?"`,
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
			} else if (typeof ast.inferredType !== 'undefined' && !_.isEqual(ast.inferredType, ASTTypeBuiltInBool)) {
				return error(new AnalysisError(
					AnalysisErrorCode.BoolTypeExpected,
					`bool type expected since the variable name "${ast.identifier.name}" ends with a "?"`,
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/**
	 * This function attempts to infer a type and if successful, run the assigner callback.
	 *
	 * Intentionally does not return an error if unable to infer anything. That is not an error scenario.
	 *
	 * Only returns an error if there is a problem in this.inferASTTypeFromASTAssignable()
	 *
	 * @see {@link inferASTTypeFromASTAssignable()}
	 */
	assignInferredType(valueAST: AssignableASTs, valueNode: Node, assigner: (inferredType: AST) => void): Result<void> {
		const inferredTypeResult = this.inferASTTypeFromASTAssignable(valueAST, valueNode);
		switch (inferredTypeResult.outcome) {
			case 'ok':
				const inferredTypeMaybe = inferredTypeResult.value;
				if (inferredTypeMaybe.has) {
					assigner(inferredTypeMaybe.value);
				}

				// could not infer a type: ok :)

				// either way, we're done
				return ok(undefined);

			// Ruh roh
			case 'error':
				return inferredTypeResult;
		}
	}

	noop(node: Node): Result<AST> {
		const ast = new Skip();

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/**
	 * Main and preferred way to get an error context, this requires a node
	 *
	 * In many cases, even if we're unsure whether a child node exists, this
	 * method should still be used, and pass in `child || node`, so we have
	 * at least closely-relevant positional information.
	 */
	getErrorContext(node: Node, length: number): ErrorContext {
		return new ErrorContext(
			this.parser.lexer.code,
			node.pos.line,
			node.pos.col,
			length,
		);
	}

	/**
	 * If there is no way to guarantee a node is defined, use this backup method to get an error context
	 *
	 * This should only be used if there is absolutely no way to get a valid node,
	 * and we can't even be sure the parent node is valid.
	 *
	 * If the node is undefined, we have no positional information.
	 */
	getErrorContextUnsafe(node: Node | undefined, length: number): ErrorContext {
		return new ErrorContext(
			this.parser.lexer.code,
			node?.pos.line || 1,
			node?.pos.col || 1,
			length,
		);
	}

	/** Attempts to infer an ASTType from an ASTAssignable. This is very forgiving, and only returns an error in extremely unlikely cases */
	private inferASTTypeFromASTAssignable(expr: AST, node: Node): ResultAndAMaybe<AST> {
		switch (expr.constructor) {
			case ASTBoolLiteral: return ok(has(ASTTypeBuiltInBool)); break;
			case ASTNumberLiteral: return ok(has(ASTTypeBuiltInNumber)); break;
			case ASTPath: return ok(has(ASTTypeBuiltInPath)); break;
			case ASTRegularExpression: return ok(has(ASTTypeBuiltInRegex)); break;
			case ASTStringLiteral: return ok(has(ASTTypeBuiltInString)); break;
			case ASTUnaryExpression:
				{
					const operator = (expr as ASTUnaryExpression<Expression>).operator;
					switch (operator) {
						case '!':
							return ok(has(ASTTypeBuiltInBool));
							break;

						case '-':
						case '++':
						case '--':
							return ok(has(ASTTypeBuiltInNumber));
							break;
						default:
							return error(new AnalysisError(AnalysisErrorCode.UnknownOperator, `Cannot infer type from unary operator "${operator}"`, node, this.getErrorContext(node, 1)));
					}
				}
				break;
			case ASTBinaryExpression:
				{
					const operator = (expr as ASTBinaryExpression<Expression, Expression>).operator;
					switch (operator) {
						case '==':
						case '!=':
						case '>':
						case '>=':
						case '<':
						case '<=':
						case '&&':
						case '||':
							return ok(has(ASTTypeBuiltInBool));
							break;
						case '+':
						case '-':
						case '*':
						case '/':
						case '%':
						case '^e':
							return ok(has(ASTTypeBuiltInNumber));
							break;
						default:
							return error(new AnalysisError(AnalysisErrorCode.UnknownOperator, `Cannot infer type from binary operator "${operator}"`, node, this.getErrorContext(node, 1)));
					}
				}
				break;
			default:
				// TODO more work needed here. Discover inferred type of MemberExpression, CallExpression
				return ok(hasNot());
		}
	}
}
