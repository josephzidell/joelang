import util from 'util';
import _, { random } from 'lodash';
import { Simplify } from 'type-fest';
import { primitiveTypes } from '../lexer/types';
import { regexFlags } from '../lexer/util';
import Parser from '../parser/parser';
import {
	AssignableNodeTypes,
	AssignableTypes,
	CallableTypes,
	ExpressionNodeTypes,
	Node,
	NT,
	UnaryExpressionNode,
	validChildrenAsMemberProperty,
	validChildrenInTypeArgumentList,
	validChildrenInWhenCaseValues,
	validNodeTypesAsMemberObject,
} from '../parser/types';
import ErrorContext from '../shared/errorContext';
import { NumberSize, numberSizesAll, numberSizesUnsignedInts } from '../shared/numbers/sizes';
import { error, flattenResultsMap, mapResult, ok, Result } from '../shared/result';
import {
	AssignableASTs,
	AST,
	ASTArgumentsList,
	ASTArrayExpression,
	ASTArrayOf,
	ASTAssignmentExpression,
	ASTBinaryExpression,
	ASTBlockStatement,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTClassDeclaration,
	ASTDeclaration,
	ASTDoneStatement,
	ASTEnumDeclaration,
	ASTForStatement,
	ASTFunctionDeclaration,
	ASTFunctionSignature,
	ASTIdentifier,
	ASTIfStatement,
	ASTImportDeclaration,
	ASTInterfaceDeclaration,
	ASTJoeDoc,
	ASTLoopStatement,
	ASTMemberExpression,
	ASTMemberListExpression,
	ASTModifier,
	ASTNextStatement,
	ASTNumberLiteral,
	ASTObjectExpression,
	ASTObjectShape,
	ASTParameter,
	ASTPath,
	ASTPostfixIfStatement,
	ASTPrintStatement,
	ASTProgram,
	ASTProperty,
	ASTPropertyShape,
	ASTRangeExpression,
	ASTRegularExpression,
	ASTRestElement,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTTernaryAlternate,
	ASTTernaryCondition,
	ASTTernaryConsequent,
	ASTTernaryExpression,
	ASTThatHasJoeDoc,
	ASTThatHasModifiers,
	ASTThatHasRequiredBody,
	ASTThatHasTypeParams,
	ASTThisKeyword,
	ASTTupleExpression,
	ASTTupleShape,
	ASTType,
	ASTTypeExceptPrimitive,
	ASTTypeInstantiationExpression,
	ASTTypeNumber,
	ASTTypeParameter,
	ASTTypePrimitive,
	ASTTypePrimitiveBool,
	ASTTypeRange,
	ASTUnaryExpression,
	astUniqueness,
	ASTVariableDeclaration,
	ASTWhenCase,
	ASTWhenExpression,
	CallableASTs,
	ExpressionASTs,
	IterableASTs,
	MemberExpressionObjectASTs,
	MemberExpressionPropertyASTs,
	primitiveAstType,
	RangeBoundASTs,
	SkipAST,
	WhenCaseValueASTs,
} from './asts';
import AnalysisError, { Code } from './error';
import { SymbolTable } from './symbolTable';
import visitorMap from './visitorMap';
import { assignInferredPossibleTypes, isAssignable } from './helpers';

// reusable handler callback for child nodes if we want to skip them
const skipThisChild = (_child: Node) => ok(undefined);

type childNodeHandler<T = void> = Simplify<
	{
		type: NT | NT[];
		callback: (child: Node) => Result<T>;
	} & (
		| {
				required: true | ((child: Node | undefined, index: number, allChildren: Node[]) => boolean);
				errorCode: Code;
				errorMessage: (child: Node | undefined) => string;
		  }
		| {
				required: false;
		  }
	)
>;

type childNodeHandlerNew<T = void> = Simplify<
	{
		type: NT | NT[];
		callback: (child: Node) => Result<T>;
	} & (
		| {
				required:
					| true
					| (<U extends AST>(child: Node | undefined, property: keyof U, allChildren: Node[]) => boolean);
				errorCode: Code;
				errorMessage: (child: Node | undefined) => string;
		  }
		| {
				required: false;
		  }
	)
>;

// type to map properties of ast to a callback that will handle the child node
type MapASTPropertyOfToValue<T extends AST> = {
	[key in Exclude<keyof T, 'kind' | 'toString' | typeof util.inspect.custom>]: T[key];
};

type MapASTPropertyOfToResult<T extends AST> = {
	[key in Exclude<keyof T, 'kind' | 'toString' | typeof util.inspect.custom>]: Result<T[key]>;
};

type MapASTPropertyOfToChildHandler<T extends AST> = {
	[key in Exclude<keyof T, 'kind' | 'toString' | typeof util.inspect.custom>]: childNodeHandlerNew<T[key]>;
};

/**
 * A required child node handler
 */
function req<T>(nodeType: NT | NT[], visitee: (child: Node) => Result<T>, errorCode: Code, expectation: string) {
	return {
		type: nodeType,
		required: true,
		callback: visitee,
		errorCode,
		errorMessage: (child: Node | undefined) =>
			`We were expecting ${expectation}, but found ${child?.type || 'nothing'}`,
	};
}

/** A simplified when usage just for this class */
function when<Ast, Temp>(clause: Result<Temp>, onSuccess: (v: Temp) => Result<Ast>): Result<Ast> {
	const handlingResult = clause;
	if (handlingResult.outcome === 'error') {
		return error(handlingResult.error);
	}

	return onSuccess(handlingResult.value);
}

export default class SemanticAnalyzer {
	currentNode: Node;
	private _parser: Parser;
	public get parser(): Parser {
		return this._parser;
	}
	private readonly cst: Node;
	private ast!: AST;
	private astPointer = this.ast;

	private symbolTable: SymbolTable;

	/** Inline analyses are more lenient than a file */
	private isAnInlineAnalysis = false;

	private debug = false;

	constructor(cst: Node, parser: Parser) {
		this.cst = cst;
		this.currentNode = cst;
		this._parser = parser;

		this.symbolTable = new SymbolTable('global');
	}

	thisIsAnInlineAnalysis() {
		this.isAnInlineAnalysis = true;
	}

	analyze(): Result<[ASTProgram, SymbolTable]> {
		if (this.debug && this.isAnInlineAnalysis) {
			console.info(`[SemanticAnalyzer] Analyzing '${this.parser.lexer.code}'`);
		}

		// this will call child nodes recursively and build the AST
		return mapResult(this.visitAST<ASTProgram>(this.cst), (ast: ASTProgram) => {
			return [ast, this.symbolTable];
		});
	}

	// reusable function to handle a node that has a value
	// we will check the node type and that the node has a value
	// if it does, we will call the callback to assign the value to the AST node
	// if it doesn't, we will return an error
	handleNodeThatHasValueAndNoChildren<T extends AST>(
		node: Node,
		expectedNodeType: NT,
		callback: (value: string) => Result<T>,
		errorCode: Code,
		errorMessage: (node: Node) => string,
	): Result<T> {
		if (node.type === expectedNodeType && node.value) {
			const callbackResult = callback(node.value);
			if (callbackResult.outcome === 'error') {
				return callbackResult;
			}

			const ast = callbackResult.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(errorCode, errorMessage(node), node, this.getErrCtx(node)), this.ast);
	}

	/**
	 * Reusable function to visit all of a node's children, and return them in an array
	 * This method skips comments and any SkipAST nodes.
	 *
	 * In addition, it will check that the children are of the expected type, and return an error if they are not.
	 *
	 * @param parentNode Whose children we are visiting
	 * @param validChildren The types of children we are expecting
	 * @param errorCode Error code to use if a child is invalid
	 * @param errorMessageFn Function to generate an error message if a child is invalid
	 * @returns
	 */
	visitChildren<R>(
		parentNode: Node,
		validChildren: NT[],
		errorCode: Code,
		errorMessageFn: (child: Node) => string,
		// converters?: Record<NT, (node: Node) => Result<R, Error, unknown>>,
	): Result<Array<Exclude<R, SkipAST>>> {
		const children: Array<Exclude<R, SkipAST>> = [];

		for (const child of parentNode.children) {
			// ignore comments
			if (child.type === NT.Comment) {
				continue;
			}

			if (validChildren.includes(child.type)) {
				const visitResult = this.visitAST<R>(child);
				switch (visitResult.outcome) {
					case 'ok':
						if (visitResult.value instanceof SkipAST) {
							continue;
						}

						children.push(visitResult.value as Exclude<R, SkipAST>);
						break;
					case 'error':
						return visitResult;
						break;
				}
			} else {
				return error(
					new AnalysisError(errorCode, errorMessageFn(child), child, this.getErrCtx(child)),
					this.ast,
				);
			}
		}

		return ok(children);
	}

	handleExtensionsOrImplementsList(node: Node, nodeType: NT): Result<ASTTypeExceptPrimitive[]> {
		const validChildren = [nodeType, NT.CommaSeparator];
		const extensions: ASTTypeExceptPrimitive[] = [];

		for (const child of node.children) {
			if (validChildren.includes(child.type)) {
				const visitResult = this.visitAST<ASTTypeExceptPrimitive>(child);
				switch (visitResult.outcome) {
					case 'ok':
						if (visitResult.value instanceof SkipAST) {
							continue;
						}

						extensions.push(visitResult.value);
						break;
					case 'error':
						return visitResult;
						break;
				}
			} else {
				return error(
					new AnalysisError(
						Code.ExtraNodesFound,
						`A ${child.type} is not allowed directly in a ${node.type}`,
						child,
						this.getErrCtx(child),
					),
					this.ast,
				);
			}
		}

		return ok(extensions);
	}

	private getChildHandlerForJoeDoc(ast: ASTThatHasJoeDoc): childNodeHandler {
		return {
			type: NT.JoeDoc,
			required: false,
			callback: (child) => {
				const joeDocResult = this.visitJoeDoc(child);
				if (joeDocResult.outcome === 'ok') {
					ast.joeDoc = joeDocResult.value;
				}

				// ignore an error that JoeDoc is missing
				// since it's optional

				return ok(undefined);
			},
		};
	}

	private getChildHandlerForModifiers(ast: ASTThatHasModifiers): childNodeHandler {
		return {
			type: NT.ModifiersList,
			required: false,
			callback: (child) => {
				const visitResult = this.visitModifiersList(child);
				switch (visitResult.outcome) {
					case 'ok':
						ast.modifiers = visitResult.value;
						return ok(undefined);
						break;
					case 'error':
						return visitResult;
						break;
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
					case 'ok':
						ast.body = visitResult.value;
						return ok(undefined);
						break;
					case 'error':
						return visitResult;
						break;
				}
			},
			errorCode: Code.BodyExpected,
			errorMessage: (child: Node | undefined) => `We were expecting a body, but found a ${child?.type} instead`,
		};
	}

	private getChildHandlerForTypeParams(ast: ASTThatHasTypeParams): childNodeHandler {
		return {
			type: NT.TypeParametersList,
			required: false,
			callback: (child) => {
				const result = this.visitTypeParametersList(child);
				switch (result.outcome) {
					case 'ok':
						ast.typeParams = result.value;
						return ok(undefined);
						break;
					case 'error':
						return result;
						break;
				}
			},
		};
	}

	private handleASTDeclaration(
		node: Node,
		ast: ASTDeclaration,
		nodeType: NT,
		extensionsListVisitor: (node: Node) => Result<ASTTypeExceptPrimitive[], Error, unknown>,
	) {
		return this.handleNodesChildrenOfDifferentTypes(node, [
			// the joeDoc
			this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			this.getChildHandlerForModifiers(ast),

			// the name
			{
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					switch (result.outcome) {
						case 'ok':
							ast.name = result.value;
							return ok(undefined);
							break;
						case 'error':
							return result;
							break;
					}
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child: Node | undefined) =>
					`Declaration Name: We were expecting an Identifier, but found "${child?.type}"`,
			},

			// the type parameters
			this.getChildHandlerForTypeParams(ast),

			// the extends list
			{
				type: nodeType,
				required: false,
				callback: (child) => {
					const visitResult = extensionsListVisitor.call(this, child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.extends = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);
	}

	/** Ensures the child is undefined */
	ensureNoMoreChildren(
		child: Node | undefined,
		errorCode: Code = Code.ExpressionNotExpected,
		errorMessage: (child: Node) => string = (child) =>
			`We did not expect to find an expression of type "${child.type}" here`,
	): Result<undefined> {
		if (typeof child === 'undefined') {
			return ok(undefined);
		}

		return error(new AnalysisError(errorCode, errorMessage(child), child, this.getErrCtx(child)), this.ast);
	}

	// reusable function to handle a node that has children of different types
	// each child can be either required, optional, or dependent on whether a previous child of certain type was present
	// each child will have a callback that will be called if the child is present
	// if the child is not present, and it is required, we will return an error
	handleNodesChildrenOfDifferentTypes(node: Node, childrenHandlers: Array<childNodeHandler>): Result<undefined> {
		const children = [...node.children]; // make a copy to avoid mutating the original node

		if (this.debug) {
			// debug that we're beginning this function
			console.debug('begin handleNodesChildrenOfDifferentTypes...');

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
			const required =
				definitelyRequired ||
				(typeof childHandler.required === 'function' && childHandler.required(child, index, node.children));
			if (this.debug) {
				console.debug('handler required', required);
			}

			// if the child is required and it is not present, return an error
			if (required && !child) {
				return error(
					new AnalysisError(
						childHandler.errorCode,
						childHandler.errorMessage(child),
						node,
						this.getErrCtx(node),
					),
					this.ast,
				);
			}

			// if the child is present
			if (child) {
				// is the type acceptable?
				const isTheTypeAcceptable =
					typeof childHandler.type === 'undefined' ||
					(typeof childHandler.type === 'string' && child.type === childHandler.type) ||
					(Array.isArray(childHandler.type) && childHandler.type.includes(child.type));

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
							console.debug(
								`We were expecting a child of type ${childHandler.type}, but found a "${child.type}"`,
							);
							console.debug('and this child is required, so we will return an error');
						}

						return error(
							new AnalysisError(
								childHandler.errorCode,
								childHandler.errorMessage(child),
								child,
								this.getErrCtx(child),
							),
							this.ast,
						);
					} else {
						// debug the situation
						if (this.debug) {
							console.debug(
								`We were expecting a child of type ${childHandler.type}, but found a "${child.type}"`,
							);
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
		const moreChildrenResult = this.ensureNoMoreChildren(child);
		if (moreChildrenResult.outcome === 'error') {
			return moreChildrenResult;
		}

		if (this.debug) {
			console.debug('end handleNodesChildrenOfDifferentTypes');
		}

		return ok(undefined);
	}

	// reusable function to handle a node that has children of different types
	// each child can be either required, optional, or dependent on whether a previous child of certain type was present
	// each child will have a callback that will be called if the child is present
	// if the child is not present, and it is required, we will return an error
	mapChildrenToProperties<T extends AST>(
		node: Node,
		childrenHandlers: MapASTPropertyOfToChildHandler<T>,
	): Result<MapASTPropertyOfToValue<T>> {
		const children = [...node.children]; // make a copy to avoid mutating the original node

		if (this.debug) {
			// debug that we're beginning this function
			console.debug('begin mapChildrenToProperties...');

			// debug the children
			console.groupCollapsed('children.length', children.length);
			console.debug({ children });
			console.groupEnd();

			// debug children handlers
			console.groupCollapsed('childrenHandlers.length', Object.keys(childrenHandlers).length);
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
		const map = _.mapValues(childrenHandlers, (childHandler, astPropertyString) => {
			const astProperty = astPropertyString as keyof T;

			// debug the handler number
			if (this.debug) {
				console.groupCollapsed(
					`checking child handler for ${astPropertyString} against child of type ${child?.type}`,
				);
				console.debug({ childHandler });
				console.groupEnd();
			}

			// concretize the required function if it is a function
			const definitelyRequired = typeof childHandler.required === 'boolean' && childHandler.required;
			// when running a callback, provide *the unmodified children array*
			const required =
				definitelyRequired ||
				(typeof childHandler.required === 'function' &&
					childHandler.required<T>(child, astProperty, node.children));
			if (this.debug) {
				console.debug('handler required', required);
			}

			// if the child is required and it is not present, return an error
			if (required && !child) {
				return error(
					new AnalysisError(
						childHandler.errorCode,
						childHandler.errorMessage(child),
						node,
						this.getErrCtx(node),
					),
					this.ast,
				);
			}

			// if the child is present
			if (child) {
				// is the type acceptable?
				const isTheTypeAcceptable =
					typeof childHandler.type === 'undefined' ||
					(typeof childHandler.type === 'string' && child.type === childHandler.type) ||
					(Array.isArray(childHandler.type) && childHandler.type.includes(child.type));

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
							console.debug(
								`We were expecting a child of type ${childHandler.type}, but found a "${child.type}"`,
							);
							console.debug('and this child is required, so we will return an error');
						}

						return error(
							new AnalysisError(
								childHandler.errorCode,
								childHandler.errorMessage(child),
								child,
								this.getErrCtx(child),
							),
							this.ast,
						);
					} else {
						// debug the situation
						if (this.debug) {
							console.debug(
								`We were expecting a child of type ${childHandler.type}, but found a "${child.type}"`,
							);
							console.debug('since this handler is not required, we will skip it');
						}
						return;
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

				return callbackResult;
			}
		}) as MapASTPropertyOfToResult<T>;

		// there should be no more children
		// const moreChildrenResult = this.ensureNoMoreChildren(child);
		// if (moreChildrenResult.outcome === 'error') {
		// 	return moreChildrenResult;
		// }

		if (this.debug) {
			console.debug('end handleNodesChildrenOfDifferentTypes');
		}

		// function flattenASTResultsMap = flattenResultsMap<
		// Exclude<keyof P, 'kind' | 'toString' | typeof util.inspect.custom>
		return flattenResultsMap<T, 'kind' | 'toString' | typeof util.inspect.custom>(map);
	}

	noop(_node: Node): Result<SkipAST> {
		const ast = new SkipAST();

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
	getErrCtx(node: Node): ErrorContext {
		return new ErrorContext(this.parser.lexer.code, node.pos.line, node.pos.col, node.value?.length || 1);
	}

	/**
	 * If there is no way to guarantee a node is defined, use this backup method to get an error context
	 *
	 * This should only be used if there is absolutely no way to get a valid node,
	 * and we can't even be sure the parent node is valid.
	 *
	 * If the node is undefined, we have no positional information.
	 */
	getErrCtxUnsafe(node: Node | undefined): ErrorContext {
		return new ErrorContext(
			this.parser.lexer.code,
			node?.pos.line || 1,
			node?.pos.col || 1,
			node?.value?.length || 1,
		);
	}

	/** Visitees */

	visitAST<T = AST>(node: Node): Result<T> {
		this.currentNode = node;

		return visitorMap[node.type](node, this);
	}

	visitArgumentList(node: Node): Result<ASTArgumentsList> {
		const ast = new ASTArgumentsList();

		const argsResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			Code.AssignableExpected,
			(child) => `ArgumentList: We were expecting an assignable here, but we got a ${child.type} instead`,
		);
		switch (argsResult.outcome) {
			case 'ok':
				ast.args = argsResult.value;
				break;
			case 'error':
				return argsResult;
				break;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/** An ArrayExpression needs a type, which can be evaluated either via the first item or via the context (VariableDeclaration, Argument Type, etc.) */
	visitArrayExpression(node: Node): Result<ASTArrayExpression<AssignableASTs>> {
		const ast = new ASTArrayExpression();

		const itemsResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator, NT.PostfixIfStatement],
			Code.AssignableExpected,
			(child) => `ArrayExpression: We were expecting an assignable here, but we got a ${child.type} instead`,
		);
		switch (itemsResult.outcome) {
			case 'ok':
				ast.items = itemsResult.value;
				break;
			case 'error':
				return itemsResult;
				break;
		}

		// infer the possible types from the first value
		if (ast.items.length > 0) {
			const assignmentResult = assignInferredPossibleTypes(
				ast.items[0],
				node.children[0],
				(possibleTypes: ASTType[]) => {
					ast.possibleTypes = possibleTypes;
				},
				this.symbolTable,
			);
			if (assignmentResult.outcome === 'error') {
				return error(assignmentResult.error, this.ast);
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitArrayOf(node: Node): Result<ASTArrayOf> {
		if (node.children.length !== 1) {
			return error(
				new AnalysisError(
					Code.TypeExpected,
					this.expect(node, 'one type', `${node.children.length} types`),
					node,
					this.getErrCtx(node),
				),
				this.ast,
			);
		}

		const visitResult = this.visitType(node.children[0]);
		switch (visitResult.outcome) {
			case 'ok':
				{
					if (visitResult.value instanceof SkipAST) {
						return error(
							new AnalysisError(
								Code.TypeExpected,
								this.expect(node, 'a type', node.children[0].type),
								node,
								this.getErrCtx(node),
							),
							this.ast,
						);
					}

					const ast = ASTArrayOf._(visitResult.value);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}
				break;
			case 'error':
				return visitResult;
				break;
		}
	}

	visitAssignablesList(node: Node): Result<AssignableASTs[]> {
		return this.visitChildren<AssignableASTs>(
			node,
			[NT.CommaSeparator, ...AssignableNodeTypes],
			Code.AssignableExpected,
			(child: Node) => this.expect(node, 'an Assignable', child.type),
		);
	}

	/**
	 * This method is used differently depending on the context. In a VariableDeclaration, it can only contain
	 * Identifiers. In an AssignmentExpression, it can contain Identifiers and/or MemberExpressions.
	 *
	 * ```
	 * // For VariableDeclarations
	 * this.visitAssigneesList<ASTIdentifier>(node, [NT.Identifier]);
	 *
	 * // For AssignmentExpressions
	 * this.visitAssigneesList<ASTIdentifier | ASTMemberExpression>(node, [NT.Identifier, NT.MemberExpression]);
	 * ```
	 *
	 * The type param as well as the second param (validChildren) must be optional due to
	 * signature consistency. We default to the limitations of VariableDeclarations.
	 */
	visitAssigneesList<T = ASTIdentifier>(node: Node, validChildren: NT[] = [NT.Identifier]): Result<T[]> {
		return this.visitChildren<T>(
			node,
			[NT.CommaSeparator, ...validChildren],
			Code.IdentifierExpected,
			(child: Node) => this.expect(node, 'an Identifier', child.type),
		);
	}

	visitAssignmentExpression(node: Node): Result<ASTAssignmentExpression> {
		const ast = new ASTAssignmentExpression();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: left-hand side
			{
				type: NT.AssigneesList,
				required: true,
				callback: (child) => {
					// AssignmentExpressions can have Identifiers or MemberExpressions as left-hand side
					const visitResult = this.visitAssigneesList<ASTIdentifier | ASTMemberExpression>(child, [
						NT.Identifier,
						NT.MemberExpression,
					]);
					switch (visitResult.outcome) {
						case 'ok':
							ast.left = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child) => this.expect(ast, 'an Identifier', child?.type),
			},

			// second child: the assignment operator
			{
				type: [NT.AssignmentOperator],
				required: true,
				callback: skipThisChild,
				errorCode: Code.AssignmentOperatorExpected,
				errorMessage: (child) =>
					`We were expecting an Assignment Operator here, but we got a ${child?.type} instead`,
			},

			// third child: the right-hand side
			{
				type: NT.AssignablesList,
				required: true,
				callback: (child) => {
					const visitResult = this.visitAssignablesList(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.right = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.AssignableExpected,
				errorMessage: (child) => `We were expecting a value here, but we got a ${child?.type} instead`,
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitBinaryExpression(node: Node): Result<ASTBinaryExpression<ExpressionASTs, ExpressionASTs>> {
		const ast = new ASTBinaryExpression<ExpressionASTs, ExpressionASTs>();

		// first grammatical requirement: the operator
		if (!node.value) {
			return error(
				new AnalysisError(Code.OperatorExpected, 'Operator Expected', node, this.getErrCtx(node)),
				this.ast,
			);
		}

		ast.operator = node.value;

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: left-hand side
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ExpressionASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.left = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.ExpressionExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting an Expression, but found "${child?.type}"`,
			},

			// second child: right-hand side
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ExpressionASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.right = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.ExpressionExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting an Expression, but found "${child?.type}"`,
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitBlockStatement(node: Node): Result<ASTBlockStatement> {
		const validChildren = Object.values(NT).filter((nt) => nt !== NT.ImportDeclaration);

		const ast = new ASTBlockStatement();

		// next, get the expressions from the children
		const expressionsResult = this.visitChildren<AST>(
			node,
			validChildren,
			Code.ExtraNodesFound,
			(child: Node) => `A ${child.type} is not allowed directly in a ${node.type}`,
		);
		switch (expressionsResult.outcome) {
			case 'ok':
				ast.expressions = expressionsResult.value;
				break;
			case 'error':
				return expressionsResult;
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

		return error(
			new AnalysisError(Code.BoolLiteralExpected, 'Bool Expected', node, this.getErrCtx(node)),
			this.ast,
		);
	}

	visitCallExpression(node: Node): Result<ASTCallExpression> {
		const ast = new ASTCallExpression();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the callee
			{
				type: CallableTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<CallableASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.callee = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child: Node | undefined) =>
					`CallExpression: We were expecting an Identifier, but found "${child?.type}"`,
			},

			// second child: the type arguments
			{
				type: NT.TypeArgumentsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitTypeArgumentsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.typeArgs = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
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
						case 'ok':
							ast.args = visitResult.value.args;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitClassDeclaration(node: Node): Result<ASTClassDeclaration> {
		const ast = new ASTClassDeclaration();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// the joeDoc
			this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			this.getChildHandlerForModifiers(ast),

			// the name
			{
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					switch (result.outcome) {
						case 'ok':
							ast.name = result.value;
							return ok(undefined);
							break;
						case 'error':
							return result;
							break;
					}
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child: Node | undefined) =>
					`ClassDeclaration: We were expecting an Identifier, but found "${child?.type}"`,
			},

			// type parameters
			this.getChildHandlerForTypeParams(ast),

			// the extends list
			{
				type: NT.ExtensionsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitExtensionsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.extends = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},

			// the implements list
			{
				type: NT.ClassImplementsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitClassImplementsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.implements = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitClassImplementsList(node: Node): Result<ASTTypeExceptPrimitive[]> {
		return this.handleExtensionsOrImplementsList(node, NT.ClassImplement);
	}

	visitDeclarationExtendsOrImplements(node: Node): Result<ASTType> {
		let identifierOrMemberExpression: ASTIdentifier | ASTMemberExpression | undefined;
		let typeArgs: ASTType[] | undefined;

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the identifier
			{
				type: [NT.Identifier, NT.MemberExpression],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ASTIdentifier | ASTMemberExpression>(child);
					switch (visitResult.outcome) {
						case 'ok':
							identifierOrMemberExpression = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child: Node | undefined) =>
					`Declaration: We were expecting an Identifier, but found "${child?.type}"`,
			},

			// second child: the type arguments
			{
				type: NT.TypeArgumentsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitTypeArgumentsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							typeArgs = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		if (typeof identifierOrMemberExpression === 'undefined') {
			return error(
				new AnalysisError(
					Code.IdentifierExpected,
					'We were expecting a Type, but found nothing',
					node,
					this.getErrCtx(node),
				),
				this.ast,
			);
		}

		if (typeof typeArgs !== 'undefined') {
			const ast = ASTTypeInstantiationExpression._({
				base: identifierOrMemberExpression,
				typeArgs,
			});

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		const ast = identifierOrMemberExpression;

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitDoneStatement(_node: Node): Result<ASTDoneStatement> {
		return ok(ASTDoneStatement._());
	}

	visitElseStatement(child: Node): Result<ASTBlockStatement | ASTIfStatement> {
		return this.visitAST<ASTBlockStatement | ASTIfStatement>(child);
	}

	visitEnumDeclaration(node: Node): Result<ASTEnumDeclaration> {
		const ast = new ASTEnumDeclaration();

		const handlingResult = this.handleASTDeclaration(node, ast, NT.ExtensionsList, this.visitExtensionsList);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitExtensionsList(node: Node): Result<ASTTypeExceptPrimitive[]> {
		return this.handleExtensionsOrImplementsList(node, NT.Extension);
	}

	visitForStatement(node: Node): Result<ASTForStatement> {
		const ast = new ASTForStatement();

		// if the first child is a parenthesized node, then we need to unwrap it
		// and replace it with its children
		if (node.children[0].type === NT.Parenthesized) {
			node.children = [...node.children[0].children, ...node.children.slice(1)];
		}

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// the initializer variable
			{
				type: [NT.Identifier, NT.VariableDeclaration],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ASTIdentifier | ASTVariableDeclaration>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.initializer = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child: Node | undefined) =>
					`ForStatement: We were expecting an Identifier, but found "${child?.type}"`,
			},

			// the InKeyword
			{
				type: NT.InKeyword,
				required: true,
				callback: skipThisChild,
				errorCode: Code.InKeywordExpected,
				errorMessage: (child: Node | undefined) => `We were expecting "... in ...", but found "${child?.type}"`,
			},

			// the iterable
			{
				type: [
					NT.ArrayExpression,
					NT.CallExpression,
					NT.Identifier,
					NT.MemberExpression,
					NT.MemberListExpression,
					NT.RangeExpression,
				],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<IterableASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.iterable = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.IterableExpected,
				errorMessage: (child: Node | undefined) => `We were expecting an Iterable, but found "${child?.type}"`,
			},

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitFunctionDeclaration(node: Node): Result<ASTFunctionDeclaration> {
		const ast = new ASTFunctionDeclaration();

		// add to symbol table
		// start a new scope
		// the scope name is either the function name, or a auto-generated name
		// this auto-generated name could never collide with a user-defined name since it's not valid syntax
		const scopeName = ast.name?.name ?? `.f_anon_${node.toString()}_${random(100_000, false)}`;
		this.symbolTable.pushScope(scopeName);

		// handle the children
		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// the joeDoc
			this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			this.getChildHandlerForModifiers(ast),

			// the identifier
			{
				type: NT.Identifier,
				required: false,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					switch (result.outcome) {
						case 'ok':
							ast.name = result.value;

							// define the function in the parent symbol table
							this.symbolTable.define(ast.name.name, 'function', [], undefined, true);

							// update the symbol table's scope name
							this.symbolTable.setScopeName(ast.name.name);

							return ok(undefined);
							break;
						case 'error':
							return result;
							break;
					}
				},
			},

			// the type parameters
			this.getChildHandlerForTypeParams(ast),

			// the parameters
			{
				type: NT.ParametersList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitParametersList(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.params = visitResult.value;

							// add the parameters to the symbol table
							ast.params.forEach((param) => {
								this.symbolTable.define(
									param.name.name,
									'parameter',
									[param.declaredType],
									param.defaultValue,
								);
							});
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},

			// the return types
			{
				type: NT.FunctionReturns,
				required: false,
				callback: (child) => {
					const visitResult = this.visitFunctionReturns(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.returnTypes = visitResult.value;

							// add the return types to the symbol table
							this.symbolTable.appendTypes(scopeName, ast.returnTypes);
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},

			// the body
			{
				type: NT.BlockStatement,
				required: false,
				callback: (child) => {
					const visitResult = this.visitBlockStatement(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.body = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},
		]);

		// close the scope whether there was an error or not
		this.symbolTable.popScope();

		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitFunctionReturns(node: Node): Result<ASTType[]> {
		let returns: ASTType[] = [];

		const conversionResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableTypes, NT.CommaSeparator],
			Code.TypeExpected,
			(child: Node) => `We were expecting to find a Type, but found a "${child.type}"`,
		);
		switch (conversionResult.outcome) {
			case 'ok':
				returns = conversionResult.value;
				break;
			case 'error':
				return conversionResult;
				break;
		}

		return ok(returns);
	}

	visitFunctionSignature(node: Node): Result<ASTFunctionSignature> {
		const ast = new ASTFunctionSignature();

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
						case 'ok':
							ast.params = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
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
						case 'ok':
							ast.returnTypes = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
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
			return error(
				new AnalysisError(
					Code.IdentifierExpected,
					'We were expecting a Type, but found nothing',
					node,
					this.getErrCtxUnsafe(node),
				),
				this.ast,
			);
		}

		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Identifier,
			(value) => ok(ASTIdentifier._(value)),
			Code.IdentifierExpected,
			(node: Node) => `Identifier: We were expecting an Identifier, but found a "${node.type}"`,
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
					const visitResult = this.visitAST<ExpressionASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.test = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: Code.ExpressionExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting an Expression, but found "${child?.type}"`,
			},

			// second child: the consequent
			{
				type: NT.BlockStatement,
				required: true,
				callback: (child) => {
					const visitResult = this.visitBlockStatement(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.consequent = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: Code.BodyExpected,
				errorMessage: (child: Node | undefined) => `We were expecting a Body, but found "${child?.type}"`,
			},

			// third child: the alternate
			{
				type: [NT.BlockStatement, NT.IfStatement],
				required: false,
				callback: (child) => {
					const visitResult = this.visitElseStatement(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.alternate = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitImportDeclaration(node: Node): Result<ASTImportDeclaration> {
		const ast = new ASTImportDeclaration();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the identifier
			{
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const visitResult = this.visitIdentifier(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.identifier = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child: Node | undefined) =>
					`ImportDeclaration: We were expecting an Identifier, but found "${child?.type}"`,
			},

			// second child: the "from" keyword
			{
				type: NT.FromKeyword,
				required: true,
				callback: skipThisChild,
				errorCode: Code.FromKeywordExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting a "from" keyword, but found "${child?.type}"`,
			},

			// third child: the path
			{
				type: NT.Path,
				required: true,
				callback: (child) => {
					const visitResult = this.visitPath(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.source = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: Code.PathExpected,
				errorMessage: (child: Node | undefined) => `We were expecting a Path, but found "${child?.type}"`,
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitInterfaceDeclaration(node: Node): Result<ASTInterfaceDeclaration> {
		const ast = new ASTInterfaceDeclaration();

		const handlingResult = this.handleASTDeclaration(node, ast, NT.ExtensionsList, this.visitExtensionsList);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/**
	 * Visits a JoeDoc node. At this point, we have no intention of enforcing that
	 * JoeDocs be present (but that may change, possibly for pub functions).
	 *
	 * TODO: check the contents of the JoeDoc, and enforce any rules
	 *
	 * @param node NT.JoeDoc
	 * @returns A Result containing the AST node if successful, or an error if not
	 */
	visitJoeDoc(node: Node): Result<ASTJoeDoc> {
		if (node.type === NT.JoeDoc && node.value) {
			return ok(ASTJoeDoc._(node.value));
		}

		// check the contents of the JoeDoc

		return error(
			new AnalysisError(
				Code.JoeDocExpected,
				`We were expecting a JoeDoc, but found "${node.type}"`,
				node,
				this.getErrCtx(node),
			),
		);
	}

	visitLoopStatement(node: Node): Result<ASTLoopStatement> {
		const ast = new ASTLoopStatement();

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// TODO add the guard

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitMemberExpression(node: Node): Result<ASTMemberExpression> {
		const ast = new ASTMemberExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !validNodeTypesAsMemberObject.includes(child.type)) {
				return error(
					new AnalysisError(
						Code.IdentifierExpected,
						`MemberExpression Object: We were expecting an Identifier, but found "${child?.type}"`,
						child || node,
						this.getErrCtx(child || node),
					),
					this.ast,
				);
			}

			const visitResult = this.visitAST<MemberExpressionObjectASTs>(child);
			switch (visitResult.outcome) {
				case 'ok':
					ast.object = visitResult.value;
					break;
				case 'error':
					return visitResult;
					break;
			}
		}

		// child (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !validChildrenAsMemberProperty.includes(child.type)) {
				return error(
					new AnalysisError(
						Code.IdentifierExpected,
						`MemberExpression Property: We were expecting an Identifier, but found "${child?.type}"`,
						child || node,
						this.getErrCtx(child || node),
					),
					this.ast,
				);
			}

			const visitResult = this.visitAST<MemberExpressionPropertyASTs>(child);
			switch (visitResult.outcome) {
				case 'ok':
					ast.property = visitResult.value;
					break;
				case 'error':
					return visitResult;
					break;
			}
		}

		// there should be no more children
		const moreChildrenResult = this.ensureNoMoreChildren(
			nodesChildren.shift(),
			Code.SemicolonExpected,
			() => 'Semicolon Expected',
		);
		if (moreChildrenResult.outcome === 'error') {
			return moreChildrenResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitMemberList(node: Node): Result<MemberExpressionPropertyASTs[]> {
		return this.visitChildren<MemberExpressionPropertyASTs>(
			node,
			validChildrenAsMemberProperty,
			Code.IdentifierExpected,
			(child: Node) => `MemberList: We were expecting an Identifier, but found "${child.type}"`,
		);
	}

	visitMemberListExpression(node: Node): Result<ASTMemberListExpression> {
		const ast = new ASTMemberListExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !validNodeTypesAsMemberObject.includes(child.type)) {
				return error(
					new AnalysisError(
						Code.IdentifierExpected,
						`MemberListExpression: We were expecting an Identifier, but found "${child?.type}"`,
						child || node,
						this.getErrCtx(child || node),
					),
					this.ast,
				);
			}

			const visitResult = this.visitAST<MemberExpressionObjectASTs>(child);
			switch (visitResult.outcome) {
				case 'ok':
					ast.object = visitResult.value;
					break;
				case 'error':
					return visitResult;
					break;
			}
		}

		// children (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || child.type !== NT.MemberList) {
				return error(
					new AnalysisError(
						Code.IdentifierExpected,
						`We were expecting a MemberList in this MemberListExpression, but found "${child?.type}"`,
						child || node,
						this.getErrCtx(child || node),
					),
					this.ast,
				);
			}

			const conversionResult = this.visitMemberList(child);
			switch (conversionResult.outcome) {
				case 'ok':
					ast.properties = conversionResult.value;
					break;
				case 'error':
					return conversionResult;
					break;
			}
		}

		// there should be no more children
		const moreChildrenResult = this.ensureNoMoreChildren(
			nodesChildren.shift(),
			Code.SemicolonExpected,
			() => 'Semicolon Expected',
		);
		if (moreChildrenResult.outcome === 'error') {
			return moreChildrenResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitModifier(node: Node): Result<ASTModifier> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Modifier,
			(value) => ok(ASTModifier._(value)),
			Code.ModifierExpected,
			(node: Node) => `We were expecting a modifier, but found a "${node.type}"`,
		);
	}

	visitModifiersList(node: Node): Result<ASTModifier[]> {
		return this.visitChildren(node, [NT.Modifier], Code.ModifierExpected, () => 'Modifier Expected');
	}

	visitNextStatement(_node: Node): Result<ASTNextStatement> {
		return ok(ASTNextStatement._());
	}

	visitNumberLiteral(node: Node): Result<ASTNumberLiteral> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.NumberLiteral,
			(value) => ASTNumberLiteral.convertNumberValueTo(value),
			Code.NumberLiteralExpected,
			(node: Node) => `We were expecting a number, but found a "${node.type}"`,
		);
	}

	visitObjectExpression(node: Node): Result<ASTObjectExpression> {
		const conversionResult = this.visitChildren<ASTProperty>(
			node,
			[NT.Property, NT.CommaSeparator],
			Code.PropertyExpected,
			(child: Node) => `We were expecting a Property in this ObjectExpression, but found "${child.type}"`,
		);
		switch (conversionResult.outcome) {
			case 'ok':
				{
					const ast = ASTObjectExpression._(conversionResult.value);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}
				break;
			case 'error':
				return conversionResult;
				break;
		}
	}

	visitObjectShape(node: Node): Result<ASTObjectShape> {
		const conversionResult = this.visitChildren<ASTPropertyShape>(
			node,
			[NT.PropertyShape, NT.CommaSeparator],
			Code.PropertyExpected,
			(child: Node) => `We were expecting a Property in this ObjectShape, but found "${child.type}"`,
		);
		switch (conversionResult.outcome) {
			case 'ok':
				{
					const ast = ASTObjectShape._(conversionResult.value);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}
				break;
			case 'error':
				return conversionResult;
				break;
		}
	}

	visitParameter(node: Node): Result<ASTParameter> {
		// this is significant overlap with the visitVariableDeclaration() function

		const ast = new ASTParameter();

		const handleResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// TODO add support for modifiers
			// first child: modifiers
			// this.getChildHandlerForModifiers(ast),

			// first child: isRest
			{
				type: NT.RestElement,
				required: false,
				callback: (_child) => {
					ast.isRest = true; // if this node is present, then it is a rest parameter

					return ok(undefined);
				},
			},

			// second child: name
			{
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const visitResult = this.visitIdentifier(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.name = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (node: Node | undefined) =>
					`Parameter: We were expecting an Identifier, but found a "${node?.type}"`,
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
							if (visitResult.value instanceof SkipAST) {
								return error(
									new AnalysisError(
										Code.TypeExpected,
										`We were expecting a Type, but found a "${child?.type}"`,
										child,
										this.getErrCtx(child),
									),
									this.ast,
								);
							}

							ast.declaredType = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.TypeExpected,
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
					const visitResult = this.visitAST<AssignableASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.defaultValue = visitResult.value;

							// now attempt to infer the type from the default value
							if (typeof ast.declaredType === 'undefined') {
								// ast.defaultValue is guaranteed to be defined at this point
								assignInferredPossibleTypes(
									ast.defaultValue,
									child,
									(possibleTypes: ASTType[]) => {
										if (possibleTypes.length !== 1) {
											return error(
												new AnalysisError(
													Code.TypeExpected,
													'We could not determine the type of this parameter',
													child,
													this.getErrCtx(child),
												),
											);
										}

										ast.declaredType = possibleTypes[0];
									},
									this.symbolTable,
								);
							} else {
								if (!isAssignable(ast.defaultValue, ast.declaredType, this.symbolTable)) {
									return error(
										new AnalysisError(
											Code.TypeMismatch,
											`[Compiler] The default value for this parameter is not assignable to the declared type "${ast.declaredType}"`,
											child,
											this.getErrCtx(child),
										),
									);
								}
							}

							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.AssignableExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting an assignable expression, but found "${child?.type}"`,
			},
		]);
		if (handleResult.outcome === 'error') {
			return handleResult;
		}

		// now perform some additional checks

		// if the identifier ends with a '?', check that either the declared type is bool
		// or that the inferred type is bool
		if (ast.name.name.at(-1) === '?' && !_.isEqual(ast.declaredType, ASTTypePrimitiveBool)) {
			return error(
				new AnalysisError(
					Code.BoolTypeExpected,
					`bool type expected since the parameter name "${ast.name.name}" ends with a "?"`,
					node,
					this.getErrCtx(node),
				),
				this.ast,
			);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitParametersList(node: Node): Result<ASTParameter[]> {
		return this.visitChildren(
			node,
			[NT.Parameter, NT.CommaSeparator],
			Code.ParameterExpected,
			() => 'Parameter Expected',
		);
	}

	visitParenthesized(node: Node): Result<AssignableASTs> {
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: the assignable
		const child = nodesChildren.shift();
		if (!child?.type || !AssignableNodeTypes.includes(child.type)) {
			return error(
				new AnalysisError(
					Code.AssignableExpected,
					'Assignable Expected',
					child || node,
					this.getErrCtx(child || node),
				),
				this.ast,
			);
		}

		// this is a pass-through node, aka return the child, since we don't retain parentheses
		return this.visitAST<AssignableASTs>(child);
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

		return error(
			new AnalysisError(Code.ValidPathExpected, 'Valid Path Expected', node, this.getErrCtx(node)),
			this.ast,
		);
	}

	visitPostfixIfStatement(node: Node): Result<ASTPostfixIfStatement> {
		return when(
			this.mapChildrenToProperties(node, {
				/* eslint-disable prettier/prettier */
				expression: req(ExpressionNodeTypes, (child: Node) => this.visitAST<ExpressionASTs>(child), Code.BodyExpected, 'an expression or value'),
				test: req(ExpressionNodeTypes, (child: Node) => this.visitAST<ExpressionASTs>(child), Code.BodyExpected, 'an Expression'),
				/* eslint-enable */
			}),
			(v) => ok((this.astPointer = this.ast = Object.assign(new ASTPostfixIfStatement(), v))),
		);
	}

	visitPrintStatement(node: Node): Result<ASTPrintStatement> {
		return when(
			this.visitChildren<ExpressionASTs>(
				node,
				[...ExpressionNodeTypes, NT.CommaSeparator],
				Code.ExpressionExpected,
				() => 'Expression Expected',
			),
			(expressions) => ok((this.astPointer = this.ast = ASTPrintStatement._(expressions))),
		);
	}

	visitProgram(node: Node): Result<ASTProgram> {
		let validChildren = [
			NT.ClassDeclaration,
			NT.Comment,
			NT.EnumDeclaration,
			NT.FunctionDeclaration,
			NT.ImportDeclaration,
			NT.InterfaceDeclaration,
			NT.PrintStatement,
			NT.SemicolonSeparator,
			NT.VariableDeclaration,
		];

		// if this is an inline analysis, allow all ASTs in the program, to avoid having
		// to wrap code in a function, class, or variable declaration just to analyze it
		if (this.isAnInlineAnalysis) {
			validChildren = Object.values(NT);
		}

		return when(
			this.visitChildren<AST>(
				node,
				validChildren,
				Code.ExtraNodesFound,
				(child: Node) => `A ${child.type} is not allowed directly in a ${node.type}`,
			),
			(declarations) => ok((this.astPointer = this.ast = ASTProgram._(declarations))),
		);
	}

	visitProperty(node: Node): Result<ASTProperty> {
		return when(
			this.mapChildrenToProperties(node, {
				/* eslint-disable prettier/prettier */
				key: req([NT.Identifier], (child: Node) => this.visitAST<ASTIdentifier>(child), Code.IdentifierExpected, 'an Identifier'),
				value: req([...AssignableNodeTypes, NT.CommaSeparator], (child: Node) => this.visitAST<AssignableASTs>(child), Code.ValueExpected, 'a Value'),
				/* eslint-enable */
			}),
			(v) => ok((this.astPointer = this.ast = Object.assign(new ASTProperty(), v))),
		);
	}

	visitPropertyShape(node: Node): Result<ASTPropertyShape> {
		return when(
			this.mapChildrenToProperties(node, {
				/* eslint-disable prettier/prettier */
				key: req([NT.Identifier], (child: Node) => this.visitAST<ASTIdentifier>(child), Code.IdentifierExpected, 'an Identifier'),
				possibleTypes: req(
					[...AssignableTypes, NT.CommaSeparator],
					(child: Node) => mapResult(this.visitAST<ASTType>(child), (r) => [r]),
					Code.ValueExpected,
					'a Value',
				),
				/* eslint-enable */
			}),
			(v) => ok((this.astPointer = this.ast = Object.assign(new ASTPropertyShape(), v))),
		);
	}

	visitRangeExpression(node: Node): Result<ASTRangeExpression> {
		const validChildren = [
			NT.CallExpression,
			NT.Identifier,
			NT.MemberExpression,
			NT.NumberLiteral,
			NT.Parenthesized,
			NT.UnaryExpression,
		];

		return when(
			this.mapChildrenToProperties(node, {
				/* eslint-disable prettier/prettier */
				lower: req(validChildren, (child: Node) => this.visitAST<RangeBoundASTs>(child), Code.RangeBoundExpected, 'a lower range bound'),
				upper: req(validChildren, (child: Node) => this.visitAST<RangeBoundASTs>(child), Code.RangeBoundExpected, 'an upper range bound'),
				/* eslint-enable */
			}),
			(v) => ok((this.astPointer = this.ast = Object.assign(new ASTRangeExpression(), v))),
		);
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
				let isValid = true;
				try {
					new RegExp(pattern);
				} catch (e) {
					isValid = false;
				}

				if (!isValid) {
					return error(
						new AnalysisError(
							Code.InvalidRegularExpression,
							'Invalid regular expression pattern',
							node,
							this.getErrCtx(node),
						),
					);
				}

				ast.pattern = pattern;
			}

			// second grammatical requirement: flags (optional)
			{
				const flags = node.value.slice(lastSlashStringIndex + 1).split('');

				// check for unidentified flags. this probably isn't necessary since the lexer does this, but it's a double check
				const unidentifiedFlags = flags.filter((f) => !regexFlags.includes(f));
				if (unidentifiedFlags.length > 0) {
					return error(
						new AnalysisError(
							Code.InvalidRegularExpression,
							'Invalid regular expression flags',
							node,
							this.getErrCtx(node),
						),
					);
				}

				ast.flags = flags;
			}

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(Code.ExpressionExpected, 'Regular Expression expected', node, this.getErrCtx(node)),
			this.ast,
		);
	}

	visitRestElement(node: Node): Result<ASTRestElement> {
		if (node?.type === NT.RestElement) {
			return ok((this.astPointer = this.ast = new ASTRestElement()));
		}

		return error(
			new AnalysisError(
				Code.RestElementExpected,
				`We were expecting to find a rest element "...", but instead found a ${node.type}`,
				node,
				this.getErrCtx(node),
			),
			this.ast,
		);
	}

	visitReturnStatement(node: Node): Result<ASTReturnStatement> {
		return when(
			this.visitChildren<ExpressionASTs>(
				node,
				[...AssignableNodeTypes, NT.CommaSeparator],
				Code.AssignableExpected,
				(child: Node | undefined) => `We were expecting an assignable expression, but found "${child?.type}"`,
			),
			(v: AssignableASTs[]) => ok((this.astPointer = this.ast = ASTReturnStatement._(v))),
		);
	}

	visitStringLiteral(node: Node): Result<ASTStringLiteral> {
		// check if the value is undefined, since empty strings are valid
		if (node?.type === NT.StringLiteral && typeof node.value !== 'undefined') {
			return ok((this.astPointer = this.ast = ASTStringLiteral._(node.value)));
		}

		return error(
			new AnalysisError(Code.StringLiteralExpected, 'String Expected', node, this.getErrCtx(node)),
			this.ast,
		);
	}

	visitTernaryAlternate(node: Node): Result<ASTTernaryAlternate<AssignableASTs>> {
		if (node?.type === NT.TernaryAlternate) {
			return when(
				/* eslint-disable prettier/prettier */
				this.visitAST<AssignableASTs>(node.children[0]),
				(v) => ok((this.astPointer = this.ast = ASTTernaryAlternate._(v))),
				/* eslint-enable */
			);
		}

		return error(
			new AnalysisError(Code.TernaryAlternateExpected, 'Ternary Alternate Expected', node, this.getErrCtx(node)),
			this.ast,
		);
	}

	visitTernaryCondition(node: Node): Result<ASTTernaryCondition> {
		if (node?.type === NT.TernaryCondition) {
			return when(
				/* elint-disable prettier/prettier */
				this.visitAST<AssignableASTs>(node.children[0]),
				(v) => ok((this.astPointer = this.ast = ASTTernaryCondition._(v))),
				/* eslint-enable */
			);
		}

		return error(
			new AnalysisError(Code.TernaryConditionExpected, 'Ternary Condition Expected', node, this.getErrCtx(node)),
			this.ast,
		);
	}

	visitTernaryConsequent(node: Node): Result<ASTTernaryConsequent<AssignableASTs>> {
		if (node?.type === NT.TernaryConsequent) {
			return when(
				/* eslint-disable prettier/prettier */
				this.visitAST<AssignableASTs>(node.children[0]),
				(v) => ok((this.astPointer = this.ast = ASTTernaryConsequent._(v))),
				/* eslint-enable */
			);
		}

		return error(
			new AnalysisError(
				Code.TernaryConsequentExpected,
				'Ternary Consequent Expected',
				node,
				this.getErrCtx(node),
			),
			this.ast,
		);
	}

	visitTernaryExpression(node: Node): Result<ASTTernaryExpression<AssignableASTs, AssignableASTs>> {
		return when(
			this.mapChildrenToProperties(node, {
				/* eslint-disable prettier/prettier */
				test: req(NT.TernaryCondition, (child: Node) => this.visitTernaryCondition(child), Code.TernaryConditionExpected, 'a ternary condition'),
				consequent: req(NT.TernaryConsequent, (child: Node) => this.visitTernaryConsequent(child), Code.TernaryConsequentExpected, 'a ternary consequent'),
				alternate: req(NT.TernaryAlternate, (child: Node) => this.visitTernaryAlternate(child), Code.TernaryAlternateExpected, 'a ternary alternate'),
				/* eslint-enable */
			}),
			(v) => ok((this.astPointer = this.ast = Object.assign(new ASTTernaryExpression(), v))),
		);
	}

	visitThisKeyword(node: Node): Result<ASTThisKeyword> {
		if (node?.type === NT.ThisKeyword) {
			return ok((this.astPointer = this.ast = new ASTThisKeyword()));
		}

		return error(
			new AnalysisError(
				Code.ThisKeywordExpected,
				`We were expecting to find a "this" keyword, but instead found a ${node.type}`,
				node,
				this.getErrCtx(node),
			),
			this.ast,
		);
	}

	visitTupleExpression(node: Node): Result<ASTTupleExpression> {
		return when(
			this.visitChildren<AssignableASTs>(
				node,
				[...AssignableNodeTypes, NT.CommaSeparator],
				Code.AssignableExpected,
				(child) => `TupleExpression: We were expecting an assignable here, but we got a ${child.type} instead`,
			),
			(v) => ok((this.astPointer = this.ast = ASTTupleExpression._(v))),
		);
	}

	visitTupleShape(node: Node): Result<ASTTupleShape> {
		if (node.children.length < 1) {
			return error(
				new AnalysisError(
					Code.TypeExpected,
					'We were expecting at least one type, but found none',
					node,
					this.getErrCtx(node),
				),
				this.ast,
			);
		}

		const children: Array<Exclude<ASTType, SkipAST>>[] = [];

		for (const child of node.children) {
			// ignore comments
			if (child.type === NT.Comment) {
				continue;
			}

			if ([...AssignableTypes, NT.CommaSeparator].includes(child.type)) {
				const visitResult = this.visitType(child);
				switch (visitResult.outcome) {
					case 'ok':
						if (visitResult.value instanceof SkipAST) {
							continue;
						}

						children.push([visitResult.value as Exclude<ASTType, SkipAST>]);
						break;
					case 'error':
						return visitResult;
						break;
				}
			} else {
				return error(
					new AnalysisError(
						Code.TypeExpected,
						`We were expecting a type here, but we got a ${child.type} instead`,
						child,
						this.getErrCtx(child),
					),
					this.ast,
				);
			}
		}

		return ok((this.astPointer = this.ast = ASTTupleShape._(children)));
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
	visitType(node: Node | undefined): Result<ASTType | SkipAST> {
		const errorResult = error<ASTType>(
			new AnalysisError(
				Code.TypeExpected,
				`Type Expected, received "${node?.type}"`,
				node,
				this.getErrCtxUnsafe(node),
			),
		);

		if (!node?.type) {
			return errorResult;
		}

		switch (node.type) {
			// check if it's a type
			case NT.Type:
				if (typeof node.value === 'undefined') {
					return errorResult;
				}

				// check if it's a number type
				if (numberSizesAll.includes(node.value as NumberSize)) {
					const ast = ASTTypeNumber._(node.value as NumberSize);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				// check if it's a primitive type
				if (primitiveTypes.includes(node.value as primitiveAstType)) {
					const ast = ASTTypePrimitive._(node.value as primitiveAstType);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				// check if it's a range
				if (node.value === 'range') {
					const ast = ASTTypeRange._();

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				return errorResult;
				break;

			// or if it's a CommaSeparator
			case NT.CommaSeparator:
				return ok(new SkipAST());
				break;

			// check if it's a FunctionSignature
			// or a user-defined type, which could be an Identifier or a MemberExpression
			// or an TypeInstantiationExpression
			case NT.ArrayOf:
			case NT.FunctionSignature:
			case NT.Identifier:
			case NT.MemberExpression:
			case NT.ObjectShape:
			case NT.TupleShape:
			case NT.TypeInstantiationExpression:
				return this.visitAST<
					| ASTArrayOf
					| ASTFunctionSignature
					| ASTIdentifier
					| ASTMemberExpression
					| ASTObjectShape
					| ASTTupleShape
					| ASTTypeInstantiationExpression
				>(node);
				break;
		}

		// unknown
		return errorResult;
	}

	visitTypeArgumentsList(node: Node): Result<ASTType[]> {
		const typeArgs: ASTType[] = [];

		for (const child of node.children) {
			if (validChildrenInTypeArgumentList.includes(child.type)) {
				const visitResult = this.visitType(child);
				switch (visitResult.outcome) {
					case 'ok':
						if (visitResult.value instanceof SkipAST) {
							continue;
						}

						typeArgs.push(visitResult.value);
						break;
					case 'error':
						return visitResult;
				}
			} else {
				return error(
					new AnalysisError(
						Code.TypeExpected,
						`Type Expected, received "${child.type}"`,
						child,
						this.getErrCtx(child),
					),
				);
			}
		}

		return ok(typeArgs);
	}

	visitTypeInstantiationExpression(node: Node): Result<ASTTypeInstantiationExpression> {
		const ast = new ASTTypeInstantiationExpression();

		// first grammatical requirement: the type
		const handleResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// the base type
			{
				type: [NT.Identifier, NT.MemberExpression],
				required: true,
				callback: (child: Node) => {
					const typeResult = this.visitAST<ASTIdentifier | ASTMemberExpression>(child);
					switch (typeResult.outcome) {
						case 'ok':
							if (typeResult.value instanceof SkipAST) {
								return error(
									new AnalysisError(
										Code.TypeExpected,
										`We were expecting to find a Type, but instead found a ${child.type}`,
										child,
										this.getErrCtx(child),
									),
									this.ast,
								);
							}

							ast.base = typeResult.value;
							return ok(undefined);
							break;
						case 'error':
							return typeResult;
							break;
					}
				},
				errorCode: Code.TypeExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting to find a Type, but found a "${child?.type}"`,
			},

			// the type arguments
			{
				type: NT.TypeArgumentsList,
				required: true,
				callback: (child: Node) => {
					const conversionResult = this.visitChildren<ASTType>(
						child,
						validChildrenInTypeArgumentList,
						Code.ExtraNodesFound,
						(child: Node) => `A ${child.type} is not allowed directly in a ${node.type}`,
					);
					if (conversionResult.outcome === 'ok') {
						ast.typeArgs = conversionResult.value;
					}

					return mapResult(conversionResult, () => undefined);
				},
				errorCode: Code.TypeExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting to find a Type, but found a "${child?.type}"`,
			},
		]);
		if (handleResult.outcome === 'error') {
			return handleResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitTypeParameter(node: Node): Result<ASTType | SkipAST> {
		const ast = new ASTTypeParameter();

		const handleResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// the type
			{
				type: AssignableTypes,
				required: true,
				callback: (child: Node) => {
					const typeResult = this.visitType(child);
					switch (typeResult.outcome) {
						case 'ok':
							ast.type = typeResult.value;
							return ok(undefined);
							break;
						case 'error':
							return typeResult;
							break;
					}
				},
				errorCode: Code.TypeExpected,
				errorMessage: (child: Node | undefined) =>
					`TypeParameter: We were expecting to find a Type, but found a "${child?.type}"`,
			},

			// the colon (optional)
			{
				type: NT.ColonSeparator,
				required: false,

				// do nothing, we just want to skip over the colon separator
				callback: skipThisChild,
			},

			// the constraint type (required if there was a colon separator)
			{
				type: AssignableTypes,
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.ColonSeparator;
				},
				callback: (child) => {
					const visitResult = this.visitType(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.constraint = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.TypeExpected,
				errorMessage: (child: Node | undefined) =>
					this.expect('VariableDeclaration: TypeParameter', 'a Type constraint', child?.type),
			},

			// next could be a default type, or nothing
			{
				type: NT.AssignmentOperator,
				required: false,

				// do nothing, we just want to skip over the assignment operator
				callback: skipThisChild,
			},

			// next child must be a type if there was an assignment operator
			// or nothing if there was no assignment operator
			{
				type: AssignableTypes,

				// if the previous child was an assignment operator, then this child is required
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.AssignmentOperator;
				},

				callback: (child) => {
					const visitResult = this.visitType(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.defaultType = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.AssignableExpected,
				errorMessage: (child: Node | undefined) => this.expect(ast, 'a default type', child?.type),
			},
		]);
		if (handleResult.outcome === 'error') {
			return handleResult;
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitTypeParametersList(node: Node): Result<ASTTypeParameter[]> {
		return this.visitChildren<ASTTypeParameter>(
			node,
			[NT.CommaSeparator, NT.TypeParameter],
			Code.TypeExpected,
			(child: Node) => `TypeParametersList: We were expecting to find a Type, but found a "${child.type}"`,
		);
	}

	visitUnaryExpression(node: UnaryExpressionNode): Result<ASTUnaryExpression<ExpressionASTs>> {
		const ast = new ASTUnaryExpression<ExpressionASTs>();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: is the operator before or after the operand
		ast.before = node.before;

		// second grammatical requirement: the operator
		if (!node.value) {
			return error(
				new AnalysisError(Code.OperatorExpected, 'Operator Expected', node, this.getErrCtx(node)),
				this.ast,
			);
		}

		ast.operator = node.value;

		// third grammatical requirement: the operand
		{
			const child = nodesChildren.shift();
			if (child?.type && ExpressionNodeTypes.includes(child.type)) {
				const visitResult = this.visitAST<ExpressionASTs>(child);
				switch (visitResult.outcome) {
					case 'ok':
						ast.operand = visitResult.value;

						// if the operator is a '-' and the operand is a number,
						// then the number's possible sizes can not be unsigned
						if (ast.operator === '-' && ast.operand instanceof ASTNumberLiteral) {
							ast.operand.possibleSizes = ast.operand.possibleSizes.filter(
								(size) => !(numberSizesUnsignedInts as unknown as NumberSize[]).includes(size),
							);
						}
						break;
					case 'error':
						return visitResult;
						break;
				}
			} else {
				return error(
					new AnalysisError(
						Code.ExpressionExpected,
						'Expression Expected',
						child || node,
						this.getErrCtx(child || node),
					),
					this.ast,
				);
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(
				new AnalysisError(Code.SemicolonExpected, 'Semicolon Expected', child, this.getErrCtx(child)),
				this.ast,
			);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitVariableDeclaration(node: Node): Result<ASTVariableDeclaration> {
		// there is significant overlap with the visitParameter() function

		const ast = new ASTVariableDeclaration();

		// first grammatical requirement: mutability keyword (from the value)
		if (node.value && ['const', 'let'].includes(node.value)) {
			ast.mutable = node.value === 'let';
		} else {
			return error(
				new AnalysisError(
					Code.KeywordExpected,
					'Expecting keyword "const" or "let"',
					node,
					this.getErrCtx(node),
				),
				this.ast,
			);
		}

		// handle the child nodes of different types
		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// the joeDoc
			this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			this.getChildHandlerForModifiers(ast),

			// the AssigneesList - names (required)
			{
				type: NT.AssigneesList,
				required: true,
				callback: (child) => {
					// VariableDeclarations requires Identifiers as left-hand side
					const visitResult = this.visitAssigneesList<ASTIdentifier>(child, [NT.Identifier]);
					switch (visitResult.outcome) {
						case 'ok':
							ast.identifiersList = visitResult.value;

							// if the identifier ends with a '?', that _is_ declaring the type as bool
							ast.identifiersList.forEach((identifier, index) => {
								if (identifier.name.at(-1) === '?') {
									ast.declaredTypes[index] = ASTTypePrimitiveBool;
								}
							});

							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: Code.IdentifierExpected,
				errorMessage: (child: Node | undefined) =>
					`VariableDeclaration: We were expecting an Identifier, but found "${child?.type}"`,
			},

			// the colon (optional)
			{
				type: NT.ColonSeparator,
				required: false,

				// do nothing, we just want to skip over the colon separator
				callback: skipThisChild,
			},

			// the types (required if there was a colon separator)
			{
				type: NT.TypeArgumentsList,
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.ColonSeparator;
				},
				callback: (child) => {
					const visitResult = this.visitTypeArgumentsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							if (visitResult.value instanceof SkipAST) {
								return error(
									new AnalysisError(
										Code.TypeExpected,
										`We were expecting a Type, but found a "${child?.type}"`,
										child,
										this.getErrCtx(child),
									),
									this.ast,
								);
							}

							ast.declaredTypes = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.TypeExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting a Type in this VariableDeclaration, but found "${child?.type}"`,
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
				type: NT.AssignablesList,

				// if the previous child was an assignment operator, then this child is required
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.AssignmentOperator;
				},

				callback: (child) => {
					const visitResult = this.visitAssignablesList(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.initialValues = visitResult.value;

							// now attempt to infer the type from the initial value

							// ast.initialValues is guaranteed to be defined at this point
							ast.initialValues.forEach((initialValue, index) => {
								// if the type was declared, then we don't need to infer it
								if (typeof ast.declaredTypes[index] === 'undefined') {
									assignInferredPossibleTypes(
										initialValue,
										child,
										(possibleTypes: ASTType[]) => {
											ast.inferredPossibleTypes[index] = possibleTypes;
										},
										this.symbolTable,
									);
								} else {
									ast.inferredPossibleTypes[index] = [];
								}

								if (
									typeof ast.declaredTypes[index] !== 'undefined' &&
									typeof ast.inferredPossibleTypes[index] !== 'undefined' &&
									ast.inferredPossibleTypes[index].constructor !==
										ast.declaredTypes[index]?.constructor
								) {
									return error(
										new AnalysisError(
											Code.TypeMismatch,
											`We cannot assign a value of possible type [${ast.inferredPossibleTypes[
												index
											]
												.map(astUniqueness)
												.join(', ')}] to a "${astUniqueness(
												ast.declaredTypes[index],
											)}" variable`,
											child,
											this.getErrCtx(child),
										),
									);
								}
							});
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: Code.AssignableExpected,
				errorMessage: (child: Node | undefined) =>
					`We were expecting an assignable expression, but found "${child?.type}"`,
			},
		]);
		if (handlingResult.outcome === 'error') {
			return handlingResult;
		}

		// now perform some additional checks

		// if the identifier ends with a '?', check that either the declared type is bool
		// or that the inferred type is bool
		//
		// except if one of the initial values is a function call, then we can't
		// since we don't yet know the return types of the function
		//
		// TODO: move this to another pass
		if (!ast.initialValues.some((initialValue) => initialValue instanceof ASTCallExpression)) {
			ast.identifiersList.forEach((identifier, index) => {
				if (identifier.name.at(-1) === '?') {
					if (
						typeof ast.declaredTypes[index] !== 'undefined' &&
						!_.isEqual(ast.declaredTypes[index], ASTTypePrimitiveBool)
					) {
						return error(
							new AnalysisError(
								Code.BoolTypeExpected,
								`bool type expected since the variable name "${identifier.name}" ends with a "?"`,
								node,
								this.getErrCtx(node),
							),
							this.ast,
						);
					} else if (
						typeof ast.inferredPossibleTypes[index] !== 'undefined' &&
						!_.isEqual(ast.inferredPossibleTypes[index], ASTTypePrimitiveBool)
					) {
						return error(
							new AnalysisError(
								Code.BoolTypeExpected,
								`bool type expected since the variable name "${identifier.name}" ends with a "?"`,
								node,
								this.getErrCtx(node),
							),
							this.ast,
						);
					}
				}
			});
		}

		// add to symbol table
		ast.identifiersList.forEach((identifier, index) => {
			this.symbolTable.define(
				identifier.name,
				node.value as 'const' | 'let',
				ast.declaredTypes[index] ? [ast.declaredTypes[index]] : ast.inferredPossibleTypes[index],
				ast.initialValues[index],
			);
		});

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitWhenCase(node: Node): Result<ASTWhenCase> {
		return when(
			/* eslint-disable prettier/prettier */
			this.mapChildrenToProperties<ASTWhenCase>(node, {
				values: req(NT.WhenCaseValues, (child: Node) => this.visitWhenCaseValues(child), Code.WhenCaseValueExpected, 'a value in this WhenCase'),
				consequent: req(NT.WhenCaseConsequent, (child: Node) => this.visitWhenCaseConsequent(child), Code.WhenCaseConsequentExpected, 'a consequent in this WhenCase'),
			}),
			(v) => ok((this.astPointer = this.ast = ASTWhenCase._({ values: v.values, consequent: v.consequent }))),
			/* eslint-enable */
		);
	}

	visitWhenCaseConsequent(node: Node): Result<ASTBlockStatement | AssignableASTs> {
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		const child = nodesChildren.shift();
		if (child?.type && ([NT.BlockStatement, ...AssignableNodeTypes] as NT[]).includes(child.type)) {
			return this.visitAST<ASTBlockStatement | AssignableASTs>(child);
		}

		return error(
			new AnalysisError(
				Code.ExpressionExpected,
				`We were expecting an Expression in this WhenCaseConsequent, but found "${child?.type}"`,
				node,
				this.getErrCtx(node),
			),
			this.ast,
		);
	}

	visitWhenCaseValues(child: Node): Result<WhenCaseValueASTs[]> {
		return this.visitChildren<WhenCaseValueASTs>(
			child,
			validChildrenInWhenCaseValues,
			Code.WhenCaseValueExpected,
			(child: Node | undefined) => this.expect('WhenCase', 'a WhenCaseValue', child?.type),
		);
	}

	visitWhenExpression(node: Node): Result<ASTWhenExpression> {
		const ast = new ASTWhenExpression();
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first child: the test expression (required)
		{
			const child = nodesChildren.shift();
			if (child?.type && ExpressionNodeTypes.includes(child.type)) {
				const result = this.visitAST<ExpressionASTs>(child);
				switch (result.outcome) {
					case 'ok':
						ast.expression = result.value;
						break;
					case 'error':
						return result;
						break;
				}
			} else {
				return error(
					new AnalysisError(
						Code.ExpressionExpected,
						this.expect(ast, 'an Expression', child?.type),
						node,
						this.getErrCtx(node),
					),
					this.ast,
				);
			}
		}

		// next child: the when cases (required)
		{
			const child = nodesChildren.shift();
			if (child?.type && child.type === NT.BlockStatement) {
				const conversionResult = this.visitChildren<ASTWhenCase>(
					child,
					[NT.WhenCase, NT.CommaSeparator],
					Code.WhenCaseExpected,
					(child) => this.expect(child, 'a WhenCase', child?.type),
				);
				switch (conversionResult.outcome) {
					case 'ok':
						ast.cases = conversionResult.value;
						break;
					case 'error':
						return conversionResult;
						break;
				}
			} else {
				return error(
					new AnalysisError(
						Code.BlockStatementExpected,
						this.expect(ast, 'a BlockStatement with WhenCases', child?.type),
						node,
						this.getErrCtx(node),
					),
					this.ast,
				);
			}
		}

		// there should be no more children
		{
			const child = nodesChildren.shift();
			if (typeof child !== 'undefined') {
				return error(
					new AnalysisError(
						Code.CommaExpected,
						this.expect(ast, 'a Comma', child.type),
						child,
						this.getErrCtx(child),
					),
					this.ast,
				);
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	expect(context: AST | Node | string, expected: string, actual: string | undefined): string {
		const contextString =
			typeof context === 'string' ? context : context instanceof AST ? context.kind : context.type;

		return `[${contextString}] We were expecting ${expected}, but found "${actual ?? 'nothing'}"`;
	}
}
