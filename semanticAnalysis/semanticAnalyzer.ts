import _ from "lodash";
import { Simplify } from "type-fest";
import { PrimitiveType, primitiveTypes } from "../lexer/types";
import { regexFlags } from "../lexer/util";
import Parser from "../parser/parser";
import {
	AssignableNodeTypes,
	AssignableTypes,
	ExpressionNodeTypes,
	Node,
	NT,
	UnaryExpressionNode,
	validChildrenInTypeArgumentList,
	validChildrenInWhenCaseValues
} from "../parser/types";
import ErrorContext from "../shared/errorContext";
import { has, hasNot } from "../shared/maybe";
import { error, ok, Result, ResultAndAMaybe } from "../shared/result";
import {
	AssignableASTs,
	AST,
	ASTArgumentsList,
	ASTArrayExpression,
	ASTAssignmentExpression,
	ASTBinaryExpression,
	ASTBlockStatement,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTClassDeclaration,
	ASTFunctionDeclaration,
	ASTFunctionType,
	ASTIdentifier,
	ASTIfStatement,
	ASTInterfaceDeclaration,
	ASTMemberExpression,
	ASTModifier,
	ASTNumberLiteral,
	ASTParameter,
	ASTPath,
	ASTPostfixIfStatement,
	ASTPrintStatement,
	ASTProgram,
	ASTRangeExpression,
	ASTRegularExpression,
	ASTRestElement,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTThatHasModifiers,
	ASTThatHasRequiredBody,
	ASTThatHasTypeParams,
	ASTThisKeyword,
	ASTType,
	ASTTypeExceptPrimitive,
	ASTTypeInstantiationExpression,
	ASTTypePrimitive,
	ASTTypePrimitiveBool,
	ASTTypePrimitiveNumber,
	ASTTypePrimitivePath,
	ASTTypePrimitiveRegex,
	ASTTypePrimitiveString,
	ASTUnaryExpression,
	ASTVariableDeclaration,
	ASTWhenCase,
	ASTWhenExpression,
	ASTWhenCaseValue,
	Expression,
	RangeBound,
	Skip
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
	errorMessage: (child: Node | undefined) => string;
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
			`Please implement visit${node.type.at(0)?.toUpperCase()}${node.type.substring(1)}() method`,
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
	handleNodeThatHasValueAndNoChildren<T extends AST>(
		node: Node,
		expectedNodeType: NT,
		callback: (value: string) => T,
		errorCode: AnalysisErrorCode,
		errorMessage: (node: Node) => string,
	): Result<T> {
		if (node.type === expectedNodeType && node.value) {
			const ast = callback(node.value);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(
			errorCode,
			errorMessage(node),
			node,
			this.getErrorContext(node, node.value?.length || 1),
		), this.ast);
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
		// converters?: Record<NT, (node: Node) => Result<R, Error, unknown>>,
	): Result<Array<Exclude<R, Skip>>> {
		const children: Array<Exclude<R, Skip>> = [];

		for (const child of parentNode.children) {
			if (validChildren.includes(child.type)) {
				let result: Result<R>;
				// if (typeof converters !== 'undefined' && child.type in converters) {
				// 	result = converters[child.type].call(this, child);
				// } else {
					result = this.nodeToAST<R>(child);
				// }

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

	handleClassOrInterfaceExtensionsOrImplementsList(node: Node, nodeType: NT): Result<ASTTypeExceptPrimitive[]> {
		const validChildren = [nodeType, NT.CommaSeparator];
		const extensions: ASTTypeExceptPrimitive[] = [];

		for (const child of node.children) {
			if (validChildren.includes(child.type)) {
				const visitResult = this.nodeToAST<ASTTypeExceptPrimitive>(child);
				switch (visitResult.outcome) {
					case 'ok':
						if (visitResult.value instanceof Skip) {
							continue;
						}

						extensions.push(visitResult.value);
						break;
					case 'error': return visitResult; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.ExtraNodesFound,
					`A ${child.type} is not allowed directly in a ${node.type}`,
					child,
					this.getErrorContext(child, child.value?.length || 1),
				), this.ast);
			}
		}

		return ok(extensions);
	}

	private getChildHandlerForModifiers(ast: ASTThatHasModifiers): childNodeHandler {
		return {
			type: NT.ModifiersList,
			required: false,
			callback: (child) => {
				const visitResult = this.visitModifiersList(child);
				switch (visitResult.outcome) {
					case 'ok': ast.modifiers = visitResult.value; return ok(undefined); break;
					case 'error': return visitResult; break;
				}
			},
		};
	}

	private getChildHandlerForRequiredBody(ast: ASTThatHasRequiredBody): childNodeHandler {
		return {
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
			errorMessage: (child: Node | undefined) => 'Class Body Expected',
		};
	}

	private getChildHandlerForTypeParams(ast: ASTThatHasTypeParams): childNodeHandler {
		return {
			type: NT.TypeParametersList,
			required: false,
			callback: (child) => {
				const result = this.visitTypeParametersList(child);
				switch (result.outcome) {
					case 'ok': ast.typeParams = result.value; return ok(undefined); break;
					case 'error': return result; break;
				}
			},
		};
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
				return error(new AnalysisError(
					childHandler.errorCode,
					childHandler.errorMessage(child),
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
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

						return error(new AnalysisError(childHandler.errorCode, childHandler.errorMessage(child), child, this.getErrorContext(child, child.value?.length || 1)), this.ast);
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
				`We did not expect to find an expression of type "${child.type}" here`,
				child,
				this.getErrorContext(child, child.value?.length ?? 1),
			), this.ast);
		}

		if (this.debug) {
			console.debug('end handleNodesChildrenOfDifferentTypes', );
		}

		return ok(undefined);
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
	assignInferredType(valueAST: AssignableASTs, valueNode: Node, assigner: (inferredType: ASTType) => void): Result<void> {
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
	private inferASTTypeFromASTAssignable(expr: AST, node: Node): ResultAndAMaybe<ASTType> {
		switch (expr.constructor) {
			case ASTBoolLiteral: return ok(has(ASTTypePrimitiveBool)); break;
			case ASTNumberLiteral: return ok(has(ASTTypePrimitiveNumber)); break;
			case ASTPath: return ok(has(ASTTypePrimitivePath)); break;
			case ASTPostfixIfStatement:
				const expression = (expr as ASTPostfixIfStatement).expression;
				return this.inferASTTypeFromASTAssignable(expression, node);
				break;
			case ASTRegularExpression: return ok(has(ASTTypePrimitiveRegex)); break;
			case ASTStringLiteral: return ok(has(ASTTypePrimitiveString)); break;
			case ASTUnaryExpression:
				{
					const operator = (expr as ASTUnaryExpression<Expression>).operator;
					switch (operator) {
						case '!':
							return ok(has(ASTTypePrimitiveBool));
							break;

						case '-':
						case '++':
						case '--':
							return ok(has(ASTTypePrimitiveNumber));
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
							return ok(has(ASTTypePrimitiveBool));
							break;
						case '+':
						case '-':
						case '*':
						case '/':
						case '%':
						case '^e':
							return ok(has(ASTTypePrimitiveNumber));
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

	/** Visitees */

	visitArgumentList(node: Node): Result<ASTArgumentsList> {
		const ast = new ASTArgumentsList();

		const argsResult = this.convertNodesChildrenOfSameType<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			AnalysisErrorCode.AssignableExpected,
			(child) => `Assignable Expected: ${child.type}`,
		);
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

		const itemsResult = this.convertNodesChildrenOfSameType<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator, NT.PostfixIfStatement],
			AnalysisErrorCode.AssignableExpected,
			(child) => `We were expecting an assignable here, but we got a ${child.type} instead`,
		);
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

	visitAssignmentExpression(node: Node): Result<ASTAssignmentExpression> {
		const ast = new ASTAssignmentExpression();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(
			node,
			[
				// first child: left-hand side
				{
					type: [NT.Identifier, NT.MemberExpression],
					required: true,
					callback: (child) => {
						const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(child);
						switch (visitResult.outcome) {
							case 'ok': ast.left = visitResult.value; break;
							case 'error': return visitResult; break;
						}

						return ok(undefined);
					},
					errorCode: AnalysisErrorCode.IdentifierExpected,
					errorMessage: (child) => `We were expecting an Identifier here, but we got a ${child?.type} instead`,
				},

				// second child: the assignment operator
				{
					type: [NT.AssignmentOperator],
					required: true,
					callback: skipThisChild,
					errorCode: AnalysisErrorCode.AssignmentOperatorExpected,
					errorMessage: (child) => `We were expecting an Assignment Operator here, but we got a ${child?.type} instead`,
				},

				// third child: the right-hand side
				{
					type: AssignableNodeTypes,
					required: true,
					callback: (child) => {
						const visitResult = this.nodeToAST<AssignableASTs>(child);
						switch (visitResult.outcome) {
							case 'ok': ast.right = visitResult.value; break;
							case 'error': return visitResult; break;
						}

						return ok(undefined);
					},
					errorCode: AnalysisErrorCode.AssignableExpected,
					errorMessage: (child) => `We were expecting a value here, but we got a ${child?.type} instead`,
				},
			],
		);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
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
				errorMessage: (child: Node | undefined) => `We were expecting an Expression, but found "${child?.type}"`,
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
				errorMessage: (child: Node | undefined) => `We were expecting an Expression, but found "${child?.type}"}`,
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
				errorMessage: (child: Node | undefined) => `We were expecting an Identifier, but found "${child?.type}"`,
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

	visitClassDeclaration(node: Node): Result<ASTClassDeclaration> {
		const ast = new ASTClassDeclaration();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the modifiers
			this.getChildHandlerForModifiers(ast),

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
				errorMessage: (child: Node | undefined) => `We were expecting an Identifier, but found "${child?.type}"`,
			},

			// third child: type parameters
			this.getChildHandlerForTypeParams(ast),

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
			this.getChildHandlerForRequiredBody(ast),
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitClassExtensionsList(node: Node): Result<ASTTypeExceptPrimitive[]> {
		return this.handleClassOrInterfaceExtensionsOrImplementsList(node, NT.ClassExtension);
	}

	visitClassImplementsList(node: Node): Result<ASTTypeExceptPrimitive[]> {
		return this.handleClassOrInterfaceExtensionsOrImplementsList(node, NT.ClassImplement);
	}

	visitClassOrInterfaceExtendsOrImplements(node: Node): Result<ASTType> {
		let identifierOrMemberExpression: ASTIdentifier | ASTMemberExpression | undefined;
		let typeArgs: ASTType[] | undefined;

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the identifier
			{
				type: [NT.Identifier, NT.MemberExpression],
				required: true,
				callback: (child) => {
					const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(child);
					switch (visitResult.outcome) {
						case 'ok': identifierOrMemberExpression = visitResult.value; break;
						case 'error': return visitResult; break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => `We were expecting an Identifier, but found "${child?.type}"`,
			},

			// second child: the type arguments
			{
				type: NT.TypeArgumentsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitTypeArgumentsList(child);
					switch (visitResult.outcome) {
						case 'ok': typeArgs = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		if (typeof identifierOrMemberExpression === 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.IdentifierExpected,
				'We were expecting a Type, but found nothing',
				node,
				this.getErrorContext(node, node.value?.length || 1),
			), this.ast);
		}

		if (typeof typeArgs !== 'undefined') {
			const ast = ASTTypeInstantiationExpression._({base: identifierOrMemberExpression, typeArgs});

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		const ast = identifierOrMemberExpression;

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitElseStatement(child: Node): Result<ASTBlockStatement | ASTIfStatement> {
		return this.nodeToAST<ASTBlockStatement | ASTIfStatement>(child);
	}

	visitFunctionDeclaration(node: Node): Result<ASTFunctionDeclaration> {
		const ast = new ASTFunctionDeclaration();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the modifiers
			this.getChildHandlerForModifiers(ast),

			// second child: the name
			{
				type: NT.Identifier,
				required: false,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					switch (result.outcome) {
						case 'ok': ast.name = result.value; return ok(undefined); break;
						case 'error': return result; break;
					}
				},
			},

			// third child: type parameters
			this.getChildHandlerForTypeParams(ast),

			// fourth child: the parameters
			{
				type: NT.ParametersList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitParametersList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.params = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// fifth child: the return types
			{
				type: NT.FunctionReturns,
				required: false,
				callback: (child) => {
					const visitResult = this.visitFunctionReturns(child);
					switch (visitResult.outcome) {
						case 'ok': ast.returnTypes = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// sixth child: the body
			{
				type: NT.BlockStatement,
				required: false,
				callback: (child) => {
					const visitResult = this.visitBlockStatement(child);
					switch (visitResult.outcome) {
						case 'ok': ast.body = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitFunctionReturns(node: Node): Result<ASTType[]> {
		let returns: ASTType[] = [];

		const conversionResult = this.convertNodesChildrenOfSameType<AssignableASTs>(
			node,
			[...AssignableTypes, NT.CommaSeparator],
			AnalysisErrorCode.TypeExpected,
			(child: Node) => `We were expecting to find a Type, but found a "${child.type}"`,
		);
		switch (conversionResult.outcome) {
			case 'ok': returns = conversionResult.value; break;
			case 'error': return conversionResult; break;
		}

		return ok(returns);
	}

	visitFunctionType(node: Node): Result<ASTFunctionType> {
		const ast = new ASTFunctionType();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the modifiers
			this.getChildHandlerForTypeParams(ast),

			// second child: the parameters
			{
				type: NT.ParametersList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitParametersList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.params = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// third child: the return types
			{
				type: NT.FunctionReturns,
				required: false,
				callback: (child) => {
					const visitResult = this.visitFunctionReturns(child);
					switch (visitResult.outcome) {
						case 'ok': ast.returnTypes = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
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
				'We were expecting a Type, but found nothing',
				node,
				this.getErrorContextUnsafe(node, 1),
			), this.ast);
		}

		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Identifier,
			(value) => ASTIdentifier._(value),
			AnalysisErrorCode.IdentifierExpected,
			(node: Node) => `We were expecting an Identifier, but found a "${node.type}"`,
		);
	}

	visitIfStatement(node: Node): Result<ASTIfStatement> {
		const ast = new ASTIfStatement();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the test
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.nodeToAST<Expression>(child);
					switch (visitResult.outcome) {
						case 'ok': ast.test = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: (child: Node | undefined) => `We were expecting an Expression, but found "${child?.type}"`,
			},

			// second child: the consequent
			{
				type: NT.BlockStatement,
				required: true,
				callback: (child) => {
					const visitResult = this.visitBlockStatement(child);
					switch (visitResult.outcome) {
						case 'ok': ast.consequent = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.BodyExpected,
				errorMessage: (child: Node | undefined) => `We were expecting a Body, but found "${child?.type}"`,
			},

			// third child: the alternate
			{
				type: [NT.BlockStatement, NT.IfStatement],
				required: false,
				callback: (child) => {
					const visitResult = this.visitElseStatement(child);
					switch (visitResult.outcome) {
						case 'ok': ast.alternate = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitInterfaceDeclaration(node: Node): Result<ASTInterfaceDeclaration> {
		const ast = new ASTInterfaceDeclaration();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the modifiers
			this.getChildHandlerForModifiers(ast),

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
				errorMessage: (child: Node | undefined) => `We were expecting an Identifier, but found "${child?.type}"`,
			},

			// third child: type parameters
			this.getChildHandlerForTypeParams(ast),

			// fourth child: the extends list
			{
				type: NT.InterfaceExtensionsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitInterfaceExtensionsList(child);
					switch (visitResult.outcome) {
						case 'ok': ast.extends = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
			},

			// fifth child: the body
			this.getChildHandlerForRequiredBody(ast),
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitInterfaceExtensionsList(node: Node): Result<ASTTypeExceptPrimitive[]> {
		return this.handleClassOrInterfaceExtensionsOrImplementsList(node, NT.InterfaceExtension);
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
					'We were expecting an Identifier in this MemberExpression, but found nothing',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			// TODO add NT.CallExpression
			if (([NT.Identifier, NT.MemberExpression, NT.ThisKeyword] as NT[]).includes(child.type)) {
				const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression | ASTThisKeyword>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.object = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			}
		}

		// next grammatical requirement: child (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !([NT.Identifier, NT.InstantiationExpression] as NT[]).includes(child.type)) {
				return error(new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					`We were expecting an Identifier in this MemberExpression, but found "${child?.type}"`,
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			const visitResult = this.nodeToAST<ASTIdentifier | ASTTypeInstantiationExpression>(child);
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
			(node: Node) => `We were expecting a modifier, but found a "${node.type}"`,
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
			(node: Node) => `We were expecting a number, but found a "${node.type}"`,
		);
	}

	visitParameter(node: Node): Result<ASTParameter> {
		// this is significant overlap with the visitVariableDeclaration() function

		const ast = new ASTParameter();

		const handleResult = this.handleNodesChildrenOfDifferentTypes(
			node,
			[
				// TODO add support for modifiers
				// first child: modifiers
				// this.getChildHandlerForModifiers(ast),

				// first child: isRest
				{
					type: NT.RestElement,
					required: false,
					callback: (child) => {
						ast.isRest = true; // if this node is present, then it is a rest parameter

						return ok(undefined);
					}
				},

				// second child: name
				{
					type: NT.Identifier,
					required: true,
					callback: (child) => {
						const visitResult = this.visitIdentifier(child);
						switch (visitResult.outcome) {
							case 'ok': ast.name = visitResult.value; return ok(undefined); break;
							case 'error': return visitResult; break;
						}
					},
					errorCode: AnalysisErrorCode.IdentifierExpected,
					errorMessage: (node: Node | undefined) => `We were expecting an identifier, but found a "${node?.type}"`,
				},

				// third child: a colon
				{
					type: NT.ColonSeparator,
					required: false,

					// do nothing, just skip it
					callback: skipThisChild,
				},

				// third child: type (required if there was a colon separator)
				{
					type: AssignableTypes,
					required: (child, childIndex, allChildren) => {
						return allChildren[childIndex - 1]?.type === NT.ColonSeparator;
					},
					callback: (child) => {
						const visitResult = this.visitType(child);
						switch (visitResult.outcome) {
							case 'ok':
								if (visitResult.value instanceof Skip) {
									return error(new AnalysisError(
										AnalysisErrorCode.TypeExpected,
										`We were expecting a Type, but found a "${child?.type}"`,
										child,
										this.getErrorContext(child, child.value?.length ?? 1),
									), this.ast);
								}

								ast.declaredType = visitResult.value;
								break;
							case 'error': return visitResult; break;
						}

						return ok(undefined);
					},
					errorCode: AnalysisErrorCode.TypeExpected,
					errorMessage: (child: Node | undefined) => `We were expecting a Type, but found "${child?.type}"`,
				},

				// next could be an initial value assignment, or nothing
				{
					type: NT.AssignmentOperator,
					required: false,

					// do nothing, we just want to skip over the assignment operator
					callback: skipThisChild,
				},

				// fourth child: default value
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
								ast.defaultValue = visitResult.value;

								// now attempt to infer the type from the default value

								// ast.defaultValue is guaranteed to be defined at this point
								this.assignInferredType(ast.defaultValue, child, (inferredType: ASTType) => {
									ast.inferredType = inferredType;
								});

								if (typeof ast.declaredType !== 'undefined' && typeof ast.inferredType !== 'undefined' && ast.inferredType.constructor !== ast.declaredType?.constructor) {
									return error(new AnalysisError(
										AnalysisErrorCode.TypeMismatch,
										`cannot assign a "${ast.inferredType}" to a "${ast.declaredType}"`,
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
					errorMessage: (child: Node | undefined) => `We were expecting an assignable expression, but found "${child?.type}"`,
				},
			],
		);
		switch (handleResult.outcome) {
			case 'ok': break;
			case 'error': return handleResult; break;
		}

		// now perform some additional checks

		// if the identifier ends with a '?', check that either the declared type is bool
		// or that the inferred type is bool
		if (ast.name.name.at(-1) === '?') {
			if (typeof ast.declaredType !== 'undefined' && !_.isEqual(ast.declaredType, ASTTypePrimitiveBool)) {
				return error(new AnalysisError(
					AnalysisErrorCode.BoolTypeExpected,
					`bool type expected since the parameter name "${ast.name.name}" ends with a "?"`,
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
			} else if (typeof ast.inferredType !== 'undefined' && !_.isEqual(ast.inferredType, ASTTypePrimitiveBool)) {
				return error(new AnalysisError(
					AnalysisErrorCode.BoolTypeExpected,
					`bool type expected since the parameter name "${ast.name.name}" ends with a "?"`,
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitParametersList(node: Node): Result<ASTParameter[]> {
		return this.convertNodesChildrenOfSameType(
			node,
			[NT.Parameter, NT.CommaSeparator],
			AnalysisErrorCode.ParameterExpected,
			() => 'Parameter Expected',
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

	visitPostfixIfStatement(node: Node): Result<ASTPostfixIfStatement> {
		const ast = new ASTPostfixIfStatement();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the expression
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.nodeToAST<Expression>(child);
					switch (visitResult.outcome) {
						case 'ok': ast.expression = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.BodyExpected,
				errorMessage: (child: Node | undefined) => `We were expecting an expression or value, but found "${child?.type}"`,
			},

			// second child: the test
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.nodeToAST<Expression>(child);
					switch (visitResult.outcome) {
						case 'ok': ast.test = visitResult.value; return ok(undefined); break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: (child: Node | undefined) => `We were expecting an Expression, but found "${child?.type}"`,
			},
		]);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitPrintStatement(node: Node): Result<ASTPrintStatement> {
		const ast = new ASTPrintStatement();

		// first, get the expression to print
		const expressionsResult = this.convertNodesChildrenOfSameType<Expression>(
			node,
			ExpressionNodeTypes,
			AnalysisErrorCode.ExpressionExpected,
			() => 'Expression Expected',
		);
		switch (expressionsResult.outcome) {
			case 'ok': ast.expressions = expressionsResult.value; break;
			case 'error': return expressionsResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitProgram(node: Node): Result<ASTProgram> {
		let validChildren = [NT.ClassDeclaration, NT.Comment, NT.FunctionDeclaration, NT.ImportDeclaration, NT.InterfaceDeclaration, NT.SemicolonSeparator, NT.VariableDeclaration];

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

	visitRangeExpression(node: Node): Result<ASTRangeExpression> {
		const validChildren = [NT.CallExpression, NT.Identifier, NT.MemberExpression, NT.NumberLiteral];

		const ast = new ASTRangeExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first child: the lower bound (required)
		const lowerBound = nodesChildren.shift();
		if (lowerBound?.type && validChildren.includes(lowerBound.type)) {
			const visitResult = this.nodeToAST<RangeBound>(lowerBound);
			switch (visitResult.outcome) {
				case 'ok': ast.lower = visitResult.value; break;
				case 'error': return visitResult; break;
			}
		} else {
			return error(new AnalysisError(
				AnalysisErrorCode.RangeBoundExpected,
				`We were expecting a lower range bound, but instead found a ${lowerBound?.type}`,
				lowerBound,
				this.getErrorContext(node, node?.value?.length || 1),
			), this.ast);
		}

		// second child: the upper bound (required)
		const upperBound = nodesChildren.shift();
		if (upperBound?.type && validChildren.includes(upperBound.type)) {
			const visitResult = this.nodeToAST<RangeBound>(upperBound);
			switch (visitResult.outcome) {
				case 'ok': ast.upper = visitResult.value; break;
				case 'error': return visitResult; break;
			}
		} else {
			return error(new AnalysisError(
				AnalysisErrorCode.RangeBoundExpected,
				`We were expecting an upper range bound, but instead found a ${upperBound?.type}`,
				upperBound,
				this.getErrorContext(node, node?.value?.length || 1),
			), this.ast);
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

	visitRestElement(node: Node): Result<ASTRestElement> {
		if (node?.type === NT.RestElement) {
			const ast = new ASTRestElement();

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(
			AnalysisErrorCode.RestElementExpected,
			`We were expecting to find a rest element "...", but instead found a ${node.type}`,
			node,
			this.getErrorContext(node, node.value?.length || 1)
		), this.ast);
	}

	visitReturnStatement(node: Node): Result<ASTReturnStatement> {
		const ast = new ASTReturnStatement();

		const conversionResult = this.convertNodesChildrenOfSameType<Expression>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			AnalysisErrorCode.AssignableExpected,
			(child: Node | undefined) => `We were expecting an assignable expression, but found "${child?.type}"`,
		);
		switch (conversionResult.outcome) {
			case 'ok': ast.expressions = conversionResult.value; break;
			case 'error': return conversionResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
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

	visitThisKeyword(node: Node): Result<ASTThisKeyword> {
		if (node?.type === NT.ThisKeyword) {
			const ast = new ASTThisKeyword();

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(
			AnalysisErrorCode.ThisKeywordExpected,
			`We were expecting to find a "this" keyword, but instead found a ${node.type}`,
			node,
			this.getErrorContext(node, node.value?.length || 1)
		), this.ast);
	}

	/**
	 * Visits a type node.
	 *
	 * Note this method differs slightly from other visitees, in that it handles
	 * the case where a type is in the form of an Identifier (`T`), a
	 * MemberExpression (`T.U`), or a primitive type (`string`).
	 *
	 * @param node Possibly undefined node to visit. While most visitees have a definite node, this one does not
	 * @returns A result with an ASTType or ASTMemberExpression
	 */
	visitType(node: Node | undefined): Result<ASTType | Skip> {
		const errorResult = error<ASTType>(new AnalysisError(
			AnalysisErrorCode.TypeExpected,
			`Type Expected, received "${node?.type}"`,
			node,
			this.getErrorContextUnsafe(node, node?.value?.length || 1),
		));

		if (!node?.type) {
			return errorResult;
		}

		switch (node.type) {
			// check if it's a FunctionType
			case NT.FunctionType:
				{
					const visitResult = this.visitFunctionType(node);
					switch (visitResult.outcome) {
						case 'ok':
							const ast = visitResult.value;

							this.astPointer = this.ast = ast;

							return ok(ast);
							break;
						case 'error':
							return visitResult;
					}
				}
				break;

			// check if it's a primitive type
			case NT.Type:
				if (node.value && primitiveTypes.includes(node.value as PrimitiveType)) {
					const ast = ASTTypePrimitive._(node.value as PrimitiveType);

					this.astPointer = this.ast = ast;

					return ok(ast);
				} else {
					return errorResult;
				}
				break;

			// or if it's a user-defined type, which could be an Identifier or a MemberExpression
			case NT.Identifier:
			case NT.MemberExpression:
				const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(node);
				switch (visitResult.outcome) {
					case 'ok':
						const ast = visitResult.value;

						this.astPointer = this.ast = ast;

						return ok(ast);
					case 'error':
						return visitResult;
				}
				break;

			// or if it's an InstantiationExpression
			case NT.InstantiationExpression:
				const instantiationResult = this.nodeToAST<ASTTypeInstantiationExpression>(node);
				switch (instantiationResult.outcome) {
					case 'ok':
						const ast = instantiationResult.value;

						this.astPointer = this.ast = ast;

						return ok(ast);
						break;
					case 'error':
						return instantiationResult;
						break;
				}
				break;

			// or if it's a CommaSeparator
			case NT.CommaSeparator:
				return ok(new Skip());
				break;
		}

		// unknown
		return errorResult;
	}

	visitTypeArgumentsList(node: Node): Result<ASTType[]> {
		const typeArgs: ASTType[] = [];

		for (const child of node.children) {
			if (validChildrenInTypeArgumentList.includes(child.type)) {
				// const visitResult = this.nodeToAST(child);
				const visitResult = this.visitType(child);
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
					`Type Expected, received "${child.type}"`,
					child,
					this.getErrorContext(child, child.value?.length || 1),
				));
			}
		}

		return ok(typeArgs);
	}

	visitTypeInstantiationExpression(node: Node): Result<ASTTypeInstantiationExpression> {
		const ast = new ASTTypeInstantiationExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: the type
		const handleResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// the base type
			{
				type: [NT.Identifier, NT.MemberExpression],
				required: true,
				callback: (child: Node) => {
					const typeResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(child);
					switch (typeResult.outcome) {
						case 'ok':
							if (typeResult.value instanceof Skip) {
								return error(new AnalysisError(
									AnalysisErrorCode.TypeExpected,
									`We were expecting to find a Type, but instead found a ${child.type}`,
									child,
									this.getErrorContext(child, child.value?.length || 1),
								), this.ast);
							}

							ast.base = typeResult.value;
							return ok(undefined);
							break;
						case 'error': return typeResult; break;
					}
				},
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => `We were expecting to find a Type, but found a "${child?.type}"`,
			},

			// the type arguments
			{
				type: NT.TypeArgumentsList,
				required: true,
				callback: (child: Node) => {
					const conversionResult = this.convertNodesChildrenOfSameType<ASTType>(
						child,
						validChildrenInTypeArgumentList,
						AnalysisErrorCode.ExtraNodesFound,
						(child: Node) => `A ${child.type} is not allowed directly in a ${node.type}`,
					);
					switch (conversionResult.outcome) {
						case 'ok':
							ast.typeArgs = conversionResult.value;
							return ok(undefined);
							break;
						case 'error': return conversionResult; break;
					}
				},
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => `We were expecting to find a Type, but found a "${child?.type}"`,
			},
		]);
		switch (handleResult.outcome) {
			case 'ok': break;
			case 'error': return handleResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitTypeParameter(node: Node): Result<ASTType | Skip> {
		return this.visitType(node.children[0]);
	}

	visitTypeParametersList(node: Node): Result<ASTTypeExceptPrimitive[]> {
		let typeParams: ASTTypeExceptPrimitive[] = [];

		const conversionResult = this.convertNodesChildrenOfSameType<ASTTypeExceptPrimitive>(
			node,
			[NT.CommaSeparator, NT.TypeParameter],
			AnalysisErrorCode.TypeExpected,
			(child: Node) => `We were expecting to find a Type, but found a "${child.type}"`,
		);
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

	visitVariableDeclaration(node: Node): Result<ASTVariableDeclaration> {
		// there is significant overlap with the visitParameter() function

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
			// first child: the modifiers
			this.getChildHandlerForModifiers(ast),

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
								ast.declaredType = ASTTypePrimitiveBool;
							}

							return ok(undefined);
							break;
						case 'error': return visitResult; break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => `We were expecting an Identifier, but found "${child?.type}"`,
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
				type: AssignableTypes,
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.ColonSeparator;
				},
				callback: (child) => {
					const visitResult = this.visitType(child);
					switch (visitResult.outcome) {
						case 'ok':
							if (visitResult.value instanceof Skip) {
								return error(new AnalysisError(
									AnalysisErrorCode.TypeExpected,
									`We were expecting a Type, but found a "${child?.type}"`,
									child,
									this.getErrorContext(child, child.value?.length ?? 1),
								), this.ast);
							}

							ast.declaredType = visitResult.value;
							break;
						case 'error': return visitResult; break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => `We were expecting a Type in this VariableDeclaration, but found "${child?.type}"`,
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
									`cannot assign a "${ast.inferredType}" to a "${ast.declaredType}"`,
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
				errorMessage: (child: Node | undefined) => `We were expecting an assignable expression, but found "${child?.type}"`,
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
			if (typeof ast.declaredType !== 'undefined' && !_.isEqual(ast.declaredType, ASTTypePrimitiveBool)) {
				return error(new AnalysisError(
					AnalysisErrorCode.BoolTypeExpected,
					`bool type expected since the variable name "${ast.identifier.name}" ends with a "?"`,
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
			} else if (typeof ast.inferredType !== 'undefined' && !_.isEqual(ast.inferredType, ASTTypePrimitiveBool)) {
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

	visitWhenCase(node: Node): Result<ASTWhenCase> {
		const ast = new ASTWhenCase();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(
			node,
			[
				// first child: the values (required)
				{
					type: NT.WhenCaseValues,
					required: true,
					callback: (child) => {
						const visitResult = this.visitWhenCaseValues(child);
						switch (visitResult.outcome) {
							case 'ok': ast.values = visitResult.value; return ok(undefined); break;
							case 'error': return visitResult; break;
						}
					},
					errorCode: AnalysisErrorCode.WhenCaseValueExpected,
					errorMessage: (child: Node | undefined) => `We were expecting a value in this WhenCase, but found "${child?.type}"`,
				},

				// second child: the consequent (required)
				{
					type: NT.WhenCaseConsequent,
					required: true,
					callback: (child) => {
						const visitResult = this.visitWhenCaseConsequent(child);
						switch (visitResult.outcome) {
							case 'ok': ast.consequent = visitResult.value; return ok(undefined); break;
							case 'error': return visitResult; break;
						}
					},
					errorCode: AnalysisErrorCode.WhenCaseConsequentExpected,
					errorMessage: (child: Node | undefined) => `We were expecting a consequent in this WhenCase, but found "${child?.type}"`,
				},
			],
		);
		switch (handlingResult.outcome) {
			case 'ok': break;
			case 'error': return handlingResult; break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitWhenCaseConsequent(node: Node): Result<ASTBlockStatement | AssignableASTs> {
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		const child = nodesChildren.shift();
		if (child?.type && ([NT.BlockStatement, ...AssignableNodeTypes] as NT[]).includes(child.type)) {
			return this.nodeToAST<ASTBlockStatement | AssignableASTs>(child);
		}

		return error(new AnalysisError(
			AnalysisErrorCode.ExpressionExpected,
			`We were expecting an Expression in this WhenCaseConsequent, but found "${child?.type}"`,
			node,
			this.getErrorContext(node, node.value?.length || 1)
		), this.ast);
	}

	visitWhenCaseValues(child: Node): Result<ASTWhenCaseValue[]> {
		return this.convertNodesChildrenOfSameType<ASTWhenCaseValue>(
			child,
			validChildrenInWhenCaseValues,
			AnalysisErrorCode.WhenCaseValueExpected,
			(child: Node | undefined) => `We were expecting a WhenCaseValue, but found "${child?.type}"`
		);
	}

	visitWhenExpression(node: Node): Result<ASTWhenExpression> {
		const ast = new ASTWhenExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first child: the test expression (required)
		{
			const child = nodesChildren.shift();
			if (child?.type && ExpressionNodeTypes.includes(child.type)) {
				const result = this.nodeToAST<Expression>(child);
				switch (result.outcome) {
					case 'ok': ast.expression = result.value; break;
					case 'error': return result; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.ExpressionExpected,
					`We were expecting an expression, but found "${child?.type}"`,
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
			}
		}

		// next child: the when cases (required)
		{
			const child = nodesChildren.shift();
			if (child?.type && child.type === NT.BlockStatement) {
				const conversionResult = this.convertNodesChildrenOfSameType<ASTWhenCase>(
					child,
					[NT.WhenCase, NT.CommaSeparator],
					AnalysisErrorCode.WhenCaseExpected,
					(child) => `We were expecting a WhenCase, but found "${child?.type}"`,
				);
				switch (conversionResult.outcome) {
					case 'ok': ast.cases = conversionResult.value; break;
					case 'error': return conversionResult; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.BlockStatementExpected,
					`We were expecting a BlockStatement with WhenCases, but found "${child?.type}"`,
					node,
					this.getErrorContext(node, node.value?.length || 1),
				), this.ast);
			}
		}

		// there should be no more children
		{
			const child = nodesChildren.shift();
			if (typeof child !== 'undefined') {
				return error(new AnalysisError(
					AnalysisErrorCode.CommaExpected,
					`We were expecting a Comma, but found "${child.type}"`,
					child,
					this.getErrorContext(child, child.value?.length ?? 1),
				), this.ast);
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}
}
