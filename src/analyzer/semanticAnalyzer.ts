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
import { Maybe, maybeIfNotUndefined } from '../shared/maybe';
import { NumberSize, numberSizesAll, numberSizesUnsignedInts } from '../shared/numbers/sizes';
import { CreateResultFrom, error, ok, Result } from '../shared/result';
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
	ASTUseDeclaration,
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
import AnalysisError, { AnalysisErrorCode } from './error';
import {
	assignInferredPossibleTypes,
	getErrorContext,
	getReturnExpressionsFromBlockStatement,
	isAssignable,
	messageStencil,
} from './helpers';
import SemanticError, { SemanticErrorCode } from './semanticError';
import Semantics from './semantics';
import SymbolError from './symbolError';
import { SymbolInfo, SymbolKind, SymbolTable, SymTree } from './symbolTable';
import visitorMap from './visitorMap';

// reusable handler callback for child nodes if we want to skip them
const skipThisChild = (_child: Node) => ok(undefined);

type childNodeHandler = Simplify<
	{
		type: NT | NT[];
		callback: (child: Node) => Result<unknown, AnalysisError | SemanticError | SymbolError>;
		options?: {
			/**
			 * Optional fallback method to invoke if the child is not required and not there.
			 *
			 * NOTE: This cannot return anything and must not throw an error.
			 *
			 * @returns Nothing
			 */
			fallbackIfNotRequiredAndChildNotThere?: () => void;
		};
	} & (
		| {
				required: true | ((child: Node | undefined, childIndex: number, allChildren: Node[]) => boolean);
				errorCode: AnalysisErrorCode;
				errorMessage: (child: Node | undefined) => string;
		  }
		| {
				required: false;
		  }
	)
>;

export default class SemanticAnalyzer {
	currentNode: Node;
	private _parser: Parser;
	public get parser(): Parser {
		return this._parser;
	}
	public readonly cst: Node;
	private readonly loc: string[];
	private ast!: AST;
	private astPointer = this.ast;

	private symTree: SymTree;

	/**
	 * The stack holds ASTs in the order they were opened,
	 * so that we can ensure that they are exited correctly.
	 *
	 * A general rule is anytime an opening brace/bracket/triangle/parens
	 * is found, that gets an item on the stack. When it's closed, the
	 * item is popped.
	 */
	private stack: AST[] = [];

	/** Snippets are more lenient than regular programs */
	private isASnippet = false;

	private debug = false;

	/**
	 * If true, we will check semantics. If false, we will only generate the AST.
	 * This is useful for unit tests.
	 */
	private checkSemantics = true;

	constructor(cst: Node, parser: Parser, loc: string[], options: Options & { isASnippet: boolean }) {
		this.cst = cst;
		this.currentNode = cst;
		this._parser = parser;
		this.loc = loc;
		this.isASnippet = options.isASnippet;
		this.debug = options.debug;
		this.symTree = SymbolTable.newTree('global', cst.pos, loc, options);
	}

	analyze(): Result<[ASTProgram, SymTree], AnalysisError | SemanticError | SymbolError> {
		function anlyzerEnd(ok: boolean) {
			if (!ok) {
				console.info('Analyzer: done with errors');
			} else {
				console.info('Analyzer: done');
			}

			// debug that we're exiting
			console.groupEnd();
		}

		if (this.debug) {
			// debug that we're beginning this function
			console.groupCollapsed('Analyzer: begin ...');
		}

		// step 1: generate the AST
		const astGenerationResult = this.generateAST();
		if (astGenerationResult.isError()) {
			if (this.debug) {
				anlyzerEnd(false);
			}

			return astGenerationResult;
		}

		// ensure stack is empty
		if (this.stack.length > 0) {
			if (this.debug) {
				anlyzerEnd(false);
			}

			return error(
				new AnalysisError(
					AnalysisErrorCode.UnexpectedEndOfProgram,
					`We weren't expecting the program to end so soon`,
					this.currentNode,
					this.getErrorContext(this.currentNode),
				),
			);
		}

		const [ast, symTree] = astGenerationResult.value;

		// we're done the analysis portion
		if (this.debug) {
			anlyzerEnd(true);
		}

		// if we are not checking semantics, we are done
		if (!this.checkSemantics) {
			return ok([ast, symTree]);
		}

		// step 2: check semantics
		const semanticError = new Semantics(ast, this.loc, {
			isASnippet: this.isASnippet,
			debug: this.debug,
		}).checkForErrors();
		if (semanticError.isError()) {
			return semanticError;
		}

		return ok([ast, symTree]);
	}

	private generateAST(): Result<[ASTProgram, SymTree], AnalysisError | SemanticError | SymbolError> {
		// this will call child nodes recursively and build the AST
		return this.visitAST<ASTProgram>(this.cst).mapValue((ast: ASTProgram) => [ast, this.symTree]);
	}

	// reusable function to handle a node that has a value
	// we will check the node type and that the node has a value
	// if it does, we will call the callback to assign the value to the AST node
	// if it doesn't, we will return an error
	handleNodeThatHasValueAndNoChildren<T extends AST>(
		node: Node,
		expectedNodeType: NT,
		callback: (value: string) => Result<T, AnalysisError>,
		errorCode: AnalysisErrorCode,
		errorMessage: (node: Node) => string,
	): Result<T, AnalysisError> {
		if (node.type === expectedNodeType && node.value) {
			const callbackResult = callback(node.value);
			if (callbackResult.isError()) {
				return callbackResult;
			}

			const ast = callbackResult.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(errorCode, errorMessage(node), node, this.getErrorContext(node)), this.ast);
	}

	/**
	 * Reusable function to visit all of a node's children, and return them in an array
	 * This method skips comments and any SkipAST nodes.
	 *
	 * In addition, it will check that the children are of the expected type, and return an error if they are not.
	 *
	 * @param parentNode Whose children we are visiting
	 * @param validChildren The types of children we are expecting
	 * @param areChildrenRequired If true, we'll check there are children
	 * @param errorCode Error code to use if a child is invalid
	 * @param errorMessageFn Function to generate an error message if a child is invalid
	 * @returns
	 */
	visitChildren<R extends AST | AST[]>(
		parentNode: Node,
		validChildren: NT[],
		areChildrenRequired: boolean,
		errorCode: AnalysisErrorCode,
		errorMessageFn: (child: Node | undefined) => string,
	): Result<Array<Exclude<R, SkipAST>>, AnalysisError | SemanticError | SymbolError> {
		if (areChildrenRequired && parentNode.children.length === 0) {
			return error(new AnalysisError(errorCode, errorMessageFn(undefined), parentNode, this.getErrorContext(parentNode)), this.ast);
		}

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
				return error(new AnalysisError(errorCode, errorMessageFn(child), child, this.getErrorContext(child)), this.ast);
			}
		}

		return ok(children);
	}

	handleExtensionsOrImplementsList(
		node: Node,
		nodeType: NT,
	): Result<ASTTypeExceptPrimitive[], AnalysisError | SemanticError | SymbolError> {
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
						AnalysisErrorCode.ExtraNodesFound,
						`A ${child.type} is not allowed directly in a ${node.type}`,
						child,
						this.getErrorContext(child),
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
				if (joeDocResult.isOk()) {
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
			options: {
				fallbackIfNotRequiredAndChildNotThere: () => {
					ast.modifiers = [];
				},
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
			errorCode: AnalysisErrorCode.BodyExpected,
			errorMessage: (child: Node | undefined) => messageStencil('Body', 'a Body', child),
		};
	}

	private getChildHandlerForTypeParams(
		ast: ASTThatHasTypeParams,
		setInSymbolTable: ((typeParams: ASTTypeParameter[]) => Result<SymbolInfo, SymbolError>) | undefined,
	): childNodeHandler {
		return {
			type: NT.TypeParametersList,
			required: false,
			callback: (child) => {
				const result = this.visitTypeParametersList(child);
				switch (result.outcome) {
					case 'ok':
						{
							ast.typeParams = result.value;

							if (typeof setInSymbolTable === 'function') {
								const setResult = setInSymbolTable(ast.typeParams);
								if (setResult.isError()) {
									return setResult;
								}
							}

							return ok(undefined);
						}
						break;
					case 'error':
						return result;
						break;
				}
			},
			options: {
				fallbackIfNotRequiredAndChildNotThere: () => {
					ast.typeParams = [];
				},
			},
		};
	}

	private handleASTDeclaration(
		node: Node,
		ast: ASTDeclaration,
		parentFqn: string,
		nodeType: NT,
		extensionsListVisitor: (node: Node) => Result<ASTTypeExceptPrimitive[], AnalysisError | SemanticError | SymbolError>,
		symbolTableStuff: {
			kind: SymbolKind;
			symNodeName: string;
			/** Curry func to set the type params in the symbol table */
			setTypeParamsCurry: (symNodeName: string) => (typeParams: ASTTypeParameter[]) => Result<SymbolInfo, SymbolError>;
			/** Curry func to set the extends in the symbol table */
			setExtendsCurry: (symNodeName: string) => (_extends: ASTTypeExceptPrimitive[]) => Result<SymbolInfo, SymbolError>;
		},
	) {
		let symNodeName = symbolTableStuff.symNodeName;

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
							ast.name.prependParentToFqn(parentFqn);

							// update the symbol table's node name
							SymbolTable.tree.updateSymNodeName(`${parentFqn}${ast.name.name}`);

							// rename the symbol, ignoring a false response which
							// would indicate the old name wasn't deleted, since
							// the old anon name is random and won't be used
							SymbolTable.updateSymbolName(symNodeName, `${parentFqn}${ast.name.name}`, symbolTableStuff.kind, true);

							// update node name with parent's FQN prefixed
							symNodeName = `${parentFqn}${ast.name.name}`;

							return ok(undefined);
							break;
						case 'error':
							return result;
							break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('Declaration Name', 'an Identifier', child),
			},

			// the type parameters
			this.getChildHandlerForTypeParams(ast, symbolTableStuff.setTypeParamsCurry(symNodeName)),

			// the extends list
			{
				type: nodeType,
				required: false,
				callback: (child) => {
					const visitResult = extensionsListVisitor.call(this, child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.extends = visitResult.value;

							symbolTableStuff.setExtendsCurry(symNodeName)(ast.extends);

							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.extends = [];
					},
				},
			},

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);
	}

	/**
	 * Checks if the currentNode is in one of several ASTs, which it does by
	 * checking if any of the above stack items match.
	 *
	 * Example:
	 * ```joe
	 * class C {
	 *     f foo {}
	 * }
	 * ```
	 *
	 * When we're visiting the `foo` AST,
	 * ```joe
	 * `isIn([ASTClassDeclaration, ASTInterfaceDeclaration])` // return the `C` AST.
	 * `isIn([ASTInterfaceDeclaration])` // return a Maybe hasNot().
	 * ```
	 */
	isIn<A extends AnyASTConstructor[]>(astsToCheck: A): Maybe<InstanceTypes<A>> {
		let foundAst: AST | undefined = undefined;

		for (const ast of this.stack.slice().reverse()) {
			if (astsToCheck.some((astToCheck) => ast instanceof astToCheck)) {
				foundAst = ast;
				break;
			}
		}

		return maybeIfNotUndefined(foundAst as InstanceTypes<A> | undefined);
	}

	/** Ensures the child is undefined */
	ensureNoMoreChildren(
		child: Node | undefined,
		errorCode: AnalysisErrorCode = AnalysisErrorCode.ExpressionNotExpected,
		errorMessage: (child: Node) => string = (child) => `We did not expect to find an expression of type "${child.type}" here`,
	): Result<undefined, AnalysisError> {
		if (typeof child === 'undefined') {
			return ok(undefined);
		}

		return error(new AnalysisError(errorCode, errorMessage(child), child, this.getErrorContext(child)), this.ast);
	}

	// reusable function to handle a node that has children of different types
	// each child can be either required, optional, or dependent on whether a previous child of certain type was present
	// each child will have a callback that will be called if the child is present
	// if the child is not present, and it is required, we will return an error
	handleNodesChildrenOfDifferentTypes(
		node: Node,
		childrenHandlers: Array<childNodeHandler>,
	): Result<undefined, AnalysisError | SemanticError | SymbolError> {
		const children = [...node.children]; // make a copy to avoid mutating the original node
		let childIndex = 0;

		if (this.debug) {
			// debug that we're beginning this function
			console.debug('Analyzer: begin handleNodesChildrenOfDifferentTypes...');

			// debug the children
			console.groupCollapsed('Analyzer: children.length', children.length);
			console.debug({ children });
			console.groupEnd();

			// debug children handlers
			console.groupCollapsed('Analyzer: childrenHandlers.length', childrenHandlers.length);
			console.debug({ childrenHandlers });
			console.groupEnd();
		}

		// get the first child
		let child = children.shift();
		if (this.debug) {
			console.groupCollapsed('Analyzer: handling child', childIndex, 'of type', child?.type);
			console.debug({ child });
			console.groupEnd();
		}

		// loop through the children handlers
		for (const [handlerIndex, childHandler] of childrenHandlers.entries()) {
			// concretize the required function if it is a function
			const definitelyRequired = typeof childHandler.required === 'boolean' && childHandler.required;
			// when running a callback, provide *the unmodified children array*
			const required =
				definitelyRequired ||
				(typeof childHandler.required === 'function' && childHandler.required(child, childIndex, node.children));
			if (this.debug) {
				// debug the handler number
				console.groupCollapsed(
					`Analyzer: checking ${required ? 'required' : 'optional'} child handler`,
					handlerIndex,
					'against',
					child?.type,
					'child',
				);
				console.debug({ childHandler });
				console.groupEnd();
			}

			// if the child is required and it is not present, return an error
			if (required && !child) {
				return error(
					new AnalysisError(childHandler.errorCode, childHandler.errorMessage(child), node, this.getErrorContext(node)),
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
					console.groupCollapsed('Analyzer: isTheTypeAcceptable', isTheTypeAcceptable);
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
							console.debug(`Analyzer: We were expecting a ${childHandler.type} child, but found a "${child.type}"`);
						}

						return error(
							new AnalysisError(childHandler.errorCode, childHandler.errorMessage(child), child, this.getErrorContext(child)),
							this.ast,
						);
					} else {
						// debug the situation
						if (this.debug) {
							console.debug('Analyzer: Skipping handler');
						}

						// call fallback if relevant
						// in this scenario, there is a child, but it is not the right type, which means
						// the handler is not going to be called, so we need to call the fallback
						if (typeof childHandler.options?.fallbackIfNotRequiredAndChildNotThere === 'function') {
							childHandler.options.fallbackIfNotRequiredAndChildNotThere();
						}

						continue;
					}
				}

				// call the callback
				const callbackResult = childHandler.callback(child);

				// debug the callback result
				if (this.debug) {
					console.debug('Analyzer: callbackResult', callbackResult);
				}

				if (callbackResult.isError()) {
					return callbackResult;
				}
			}

			// call fallback if relevant
			// in this scenario, there is no child, and it is not required, so we need to call the fallback
			if (
				!required &&
				typeof child === 'undefined' &&
				typeof childHandler.options?.fallbackIfNotRequiredAndChildNotThere === 'function'
			) {
				childHandler.options.fallbackIfNotRequiredAndChildNotThere();
			}

			// lastly, we can get the next child, if there is one
			child = children.shift();
			childIndex++;

			// debug the next child
			if (this.debug) {
				if (child) {
					console.groupCollapsed('Analyzer: next child', childIndex, child?.type);
					console.debug({ childIndex, child });
					console.groupEnd();
				} else {
					console.debug('Analyzer: no more children');
				}
			}
		}

		// there should be no more children
		const moreChildrenResult = this.ensureNoMoreChildren(child);
		if (moreChildrenResult.isError()) {
			return moreChildrenResult;
		}

		if (this.debug) {
			console.debug('Analyzer: end handleNodesChildrenOfDifferentTypes');
		}

		return ok(undefined);
	}

	noop(node: Node): Result<SkipAST, AnalysisError> {
		const ast = new SkipAST(node.pos);

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
	getErrorContext(node: Node): ErrorContext {
		return getErrorContext(this.parser.lexer.code, node.pos.line, node.pos.col, node.value?.length || 1);
	}

	/**
	 * If there is no way to guarantee a node is defined, use this backup method to get an error context
	 *
	 * This should only be used if there is absolutely no way to get a valid node,
	 * and we can't even be sure the parent node is valid.
	 *
	 * If the node is undefined, we have no positional information.
	 */
	getErrorContextUnsafe(node: Node | undefined): ErrorContext {
		return new ErrorContext(this.parser.lexer.code, node?.pos.line || 1, node?.pos.col || 1, node?.value?.length || 1);
	}

	/** Visitees */

	visitAST<T extends AST | AST[]>(node: Node): Result<T, AnalysisError | SemanticError | SymbolError> {
		this.currentNode = node;

		return visitorMap[node.type](node, this) as Result<T, AnalysisError | SemanticError | SymbolError>;
	}

	visitArgumentList(node: Node): Result<ASTArgumentsList, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTArgumentsList(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const argsResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			false,
			AnalysisErrorCode.AssignableExpected,
			(child: Node | undefined) => messageStencil('ArgumentList', 'a value', child),
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
		this.stack.pop();

		return ok(ast);
	}

	/** An ArrayExpression needs a type, which can be evaluated either via the first item or via the context (VariableDeclaration, Argument Type, etc.) */
	visitArrayExpression(node: Node): Result<ASTArrayExpression<AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTArrayExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const itemsResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator, NT.PostfixIfStatement],
			false,
			AnalysisErrorCode.AssignableExpected,
			(child: Node | undefined) => messageStencil('ArrayExpression', 'a value', child),
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
				{ debug: this.debug },
			);
			if (assignmentResult.isError()) {
				return error(assignmentResult.error, this.ast);
			}
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitArrayOf(node: Node): Result<ASTArrayOf, AnalysisError | SemanticError | SymbolError> {
		if (node.children.length !== 1) {
			return error(
				new AnalysisError(
					AnalysisErrorCode.TypeExpected,
					`We were expecting one type, but found ${node.children.length} types`,
					node,
					this.getErrorContext(node),
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
								AnalysisErrorCode.TypeExpected,
								messageStencil('Array Type', 'a Type', node.children[0]),
								node,
								this.getErrorContext(node),
							),
							this.ast,
						);
					}

					const ast = ASTArrayOf._(visitResult.value, node.pos);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}
				break;
			case 'error':
				return visitResult;
				break;
		}
	}

	visitAssignablesList(node: Node): Result<AssignableASTs[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<AssignableASTs>(
			node,
			[NT.CommaSeparator, ...AssignableNodeTypes],
			true, // if there's an assignment operator, assignable(s) are required
			AnalysisErrorCode.AssignableExpected,
			(child: Node | undefined) => messageStencil('AssignablesList', 'a value', child),
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
	visitAssigneesList<T extends AST | AST[] = ASTIdentifier>(
		node: Node,
		validChildren: NT[] = [NT.Identifier],
	): Result<T[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<T>(
			node,
			[NT.CommaSeparator, ...validChildren],
			true,
			AnalysisErrorCode.IdentifierExpected,
			(child: Node | undefined) => messageStencil('AssigneesList', 'an Identifier', child),
		);
	}

	visitAssignmentExpression(node: Node): Result<ASTAssignmentExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTAssignmentExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child) => messageStencil('AssignmentExpression', 'an Identifier', child),
			},

			// second child: the assignment operator
			{
				type: [NT.AssignmentOperator],
				required: true,
				callback: skipThisChild,
				errorCode: AnalysisErrorCode.AssignmentOperatorExpected,
				errorMessage: (child) => messageStencil('AssignmentExpression', 'an Assignment Operator', child),
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
				errorCode: AnalysisErrorCode.AssignableExpected,
				errorMessage: (child) => messageStencil('AssignmentExpression', 'a value', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitBinaryExpression(
		node: Node,
	): Result<ASTBinaryExpression<ExpressionASTs, ExpressionASTs>, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTBinaryExpression<ExpressionASTs, ExpressionASTs>(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		// first grammatical requirement: the operator
		if (!node.value) {
			return error(
				new AnalysisError(AnalysisErrorCode.OperatorExpected, 'Operator Expected', node, this.getErrorContext(node)),
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
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: (child: Node | undefined) => messageStencil('BinaryExpression', 'an Expression', child),
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
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: (child: Node | undefined) => messageStencil('BinaryExpression', 'an Expression', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitBlockStatement(node: Node): Result<ASTBlockStatement, AnalysisError | SemanticError | SymbolError> {
		const validChildren = Object.values(NT).filter((nt) => nt !== NT.UseDeclaration);

		const ast = new ASTBlockStatement(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		// next, get the expressions from the children
		const expressionsResult = this.visitChildren<AST>(
			node,
			validChildren,
			false,
			AnalysisErrorCode.ExtraNodesFound,
			(child: Node | undefined) => `${child ? `A "${child.type}"` : 'This'} is not allowed directly in a ${node.type}`,
		);
		switch (expressionsResult.outcome) {
			case 'ok':
				ast.expressions = expressionsResult.value;
				break;
			case 'error':
				return expressionsResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitBoolLiteral(node: Node): Result<ASTBoolLiteral, AnalysisError> {
		if (node?.type === NT.BoolLiteral && node.value) {
			const ast = ASTBoolLiteral._(node.value === 'true', node.pos);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.BoolLiteralExpected, 'Bool Expected', node, this.getErrorContext(node)), this.ast);
	}

	visitCallExpression(node: Node): Result<ASTCallExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTCallExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('CallExpression', 'an Identifier', child),
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
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.typeArgs = [];
					},
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
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.args = [];
					},
				},
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitClassDeclaration(node: Node): Result<ASTClassDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTClassDeclaration(node.pos);

		// before pushing to the stack, check if this class is in another class or function
		const maybeIsIn = this.isIn([ASTClassDeclaration, ASTFunctionDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the class name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		let symNodeName = `${parentFqn || '.'}c_anon_${node.toString()}_${random(100_000, false)}`;
		if (this.debug) {
			console.debug(`Analyzer: Generated temp name for class: ${symNodeName}`);
		}

		// define the class in the parent symbol table using this name
		const classSymResult = SymbolTable.insertClass(symNodeName, [], [], [], ast.pos);
		if (classSymResult.isError()) {
			return classSymResult;
		}

		// set the symbol
		ast.symbol = classSymResult.value;

		// create a new node with this name
		if (this.debug) {
			console.log(`Analyzer: visiting ClassDeclaration ${symNodeName}`);
		}
		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, 'class', node.pos);

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
							ast.name.prependParentToFqn(parentFqn);

							// update the symbol table's node name
							SymbolTable.tree.updateSymNodeName(`${parentFqn}${ast.name.name}`);

							// rename the symbol, ignoring a false response which
							// would indicate the old name wasn't deleted, since
							// the old anon name is random and won't be used
							SymbolTable.updateSymbolName(symNodeName, `${parentFqn}${ast.name.name}`, 'class', true);

							// update node name with parent's FQN prefixed
							symNodeName = `${parentFqn}${ast.name.name}`;

							return ok(undefined);
							break;
						case 'error':
							return result;
							break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('ClassDeclaration', 'an Identifier', child),
			},

			// type parameters
			this.getChildHandlerForTypeParams(ast, (typeParams: ASTTypeParameter[]) => {
				// add the type params to the symbol table
				return SymbolTable.setClassTypeParams(symNodeName, typeParams, {
					debug: this.debug,
				});
			}),

			// the extends list
			{
				type: NT.ExtensionsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitExtensionsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							{
								ast.extends = visitResult.value;

								// add the extends to the symbol table
								const setResults = SymbolTable.setClassExtends(symNodeName, ast.extends, {
									debug: this.debug,
								});
								if (setResults.isError()) {
									return setResults;
								}

								return ok(undefined);
							}
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.extends = [];
					},
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
							{
								ast.implements = visitResult.value;

								// add the implements to the symbol table
								const setResults = SymbolTable.setClassImplements(symNodeName, ast.implements, {
									debug: this.debug,
								});
								if (setResults.isError()) {
									return setResults;
								}

								return ok(undefined);
							}
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.implements = [];
					},
				},
			},

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);

		// exit the SymNode and go back to parent, whether there was an error or not
		if (this.debug) {
			console.log(`Analyzer: finish visiting ClassDeclaration ${symNodeName}`);
		}
		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitClassImplementsList(node: Node): Result<ASTTypeExceptPrimitive[], AnalysisError | SemanticError | SymbolError> {
		return this.handleExtensionsOrImplementsList(node, NT.ClassImplement);
	}

	visitDeclarationExtendsOrImplements(node: Node): Result<ASTType, AnalysisError | SemanticError | SymbolError> {
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
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('Declaration', 'an Identifier', child),
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
		if (handlingResult.isError()) {
			return handlingResult;
		}

		if (typeof identifierOrMemberExpression === 'undefined') {
			return error(
				new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'We were expecting a Type, but found nothing',
					node,
					this.getErrorContext(node),
				),
				this.ast,
			);
		}

		if (typeof typeArgs !== 'undefined') {
			const ast = ASTTypeInstantiationExpression._(
				{
					base: identifierOrMemberExpression,
					typeArgs,
				},
				node.pos,
			);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		const ast = identifierOrMemberExpression;

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitDoneStatement(node: Node): Result<ASTDoneStatement, AnalysisError> {
		return ok(ASTDoneStatement._(node.pos));
	}

	visitElseStatement(child: Node): Result<ASTBlockStatement | ASTIfStatement, AnalysisError | SemanticError | SymbolError> {
		return this.visitAST<ASTBlockStatement | ASTIfStatement>(child);
	}

	visitEnumDeclaration(node: Node): Result<ASTEnumDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTEnumDeclaration(node.pos);

		// before pushing to the stack, check if this enum is in a class, function, or interface
		const maybeIsIn = this.isIn([ASTClassDeclaration, ASTFunctionDeclaration, ASTInterfaceDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the enum name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		const symNodeName = `${parentFqn || '.'}e_anon_${node.toString()}_${random(100_000, false)}`;
		if (this.debug) {
			console.debug(`Analyzer: Generated temp name for class: ${symNodeName}`);
		}

		// define the class in the parent symbol table using this name
		const enumSymResult = SymbolTable.insertEnum(symNodeName, [], [], [], ast.pos);
		if (enumSymResult.isError()) {
			return enumSymResult;
		}

		// set the symbol
		ast.symbol = enumSymResult.value;

		// create a new node with this name
		if (this.debug) {
			console.log(`Analyzer: visiting EnumDeclaration ${symNodeName}`);
		}
		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, 'enum', node.pos);

		const handlingResult = this.handleASTDeclaration(node, ast, parentFqn, NT.ExtensionsList, this.visitExtensionsList, {
			kind: 'enum',
			symNodeName,
			setTypeParamsCurry: (symNodeName: string) => (typeParams: ASTTypeParameter[]) => {
				// add the type params to the symbol table
				return SymbolTable.setEnumTypeParams(symNodeName, typeParams, {
					debug: this.debug,
				});
			},
			setExtendsCurry: (symNodeName: string) => (_extends: ASTTypeExceptPrimitive[]) => {
				// add the extends to the symbol table
				return SymbolTable.setEnumExtends(symNodeName, _extends, {
					debug: this.debug,
				});
			},
		});

		// exit the SymNode and go back to parent, whether there was an error or not
		if (this.debug) {
			console.log(`Analyzer: finish visiting EnumDeclaration ${symNodeName}`);
		}
		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitExtensionsList(node: Node): Result<ASTTypeExceptPrimitive[], AnalysisError | SemanticError | SymbolError> {
		return this.handleExtensionsOrImplementsList(node, NT.Extension);
	}

	visitForStatement(node: Node): Result<ASTForStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTForStatement(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('ForStatement', 'an Identifier', child),
			},

			// the InKeyword
			{
				type: NT.InKeyword,
				required: true,
				callback: skipThisChild,
				errorCode: AnalysisErrorCode.InKeywordExpected,
				errorMessage: (child: Node | undefined) => messageStencil('ForStatement', '"... in ..."', child),
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
				errorCode: AnalysisErrorCode.IterableExpected,
				errorMessage: (child: Node | undefined) => messageStencil('ForStatement', 'an Iterable', child),
			},

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitFunctionDeclaration(node: Node): Result<ASTFunctionDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTFunctionDeclaration(node.pos);

		// before pushing to the stack, check if this func is in a class or interface
		const maybeIsIn = this.isIn([ASTClassDeclaration, ASTInterfaceDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the function name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		let symNodeName = `${parentFqn}.f_anon_${node.toString()}_${random(100_000, false)}`;
		if (this.debug) {
			console.debug(`Analyzer: Generated temp name for func: ${symNodeName}`);
		}

		// define the function in the parent symbol table using this random name
		// It will renamed if the func has a name
		const funcSymResult = SymbolTable.insertFunction(symNodeName, [], [], [], ast.pos);
		if (funcSymResult.isError()) {
			return funcSymResult;
		}

		// set the symbol
		ast.symbol = funcSymResult.value;

		// create a new node with this random name. It will renamed if the func has a name
		if (this.debug) {
			console.log(`Analyzer: visiting FunctionDeclaration ${symNodeName}`);
		}

		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, 'function', node.pos);

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
							{
								ast.name = result.value;
								ast.name.prependParentToFqn(parentFqn);

								// update the symbol table's node name
								SymbolTable.tree.updateSymNodeName(ast.name.fqn);

								// rename the symbol, ignoring a false response which
								// would indicate the old name wasn't deleted, since
								// the old anon name is random and won't be used
								SymbolTable.updateSymbolName(symNodeName, ast.name.fqn, 'function', true);

								// update node name with parent's FQN prefixed
								symNodeName = ast.name.fqn;

								return ok(undefined);
							}
							break;
						case 'error':
							// [ ] TODO deal with assigning an anon func to a var
							// [ ] TODO deal with passing an anon func as an arg
							// [ ] TODO deal with an array of anon funcs (with postfix if), or in a tuple, or POJO
							return result;
							break;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						// create an ASTIdentifier with the random name
						ast.name = ASTIdentifier._(symNodeName, node.pos);

						// no need to update the symbol table's node name
						// no need to rename the symbol
						// no need to update node name with parent's FQN prefixed
					},
				},
			},

			// the type parameters
			this.getChildHandlerForTypeParams(ast, (typeParams: ASTTypeParameter[]) => {
				// add the type params to the symbol table
				return SymbolTable.setFunctionTypeParams(symNodeName, typeParams, {
					debug: this.debug,
				});
			}),

			// the parameters
			{
				type: NT.ParametersList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitParametersList(child);
					switch (visitResult.outcome) {
						case 'ok':
							{
								ast.params = visitResult.value;

								// add the parameters to the symbol table
								const setResults = SymbolTable.setFunctionParams(symNodeName, ast.params, {
									debug: this.debug,
								});
								if (setResults.isError()) {
									return setResults;
								}

								const insertionResults = CreateResultFrom.arrayOfResults(
									ast.params.map((param) => {
										// add the param as a param the to func's SymTab so it's available for lookup
										const paramSymResult = SymbolTable.insertParameter(
											param.name.name,
											param.type,
											param.defaultValue,
											param.isRest,
											undefined,
											param.pos,
										);
										if (paramSymResult.isError()) {
											return paramSymResult;
										}

										// set the symbol
										param.symbol = paramSymResult.value;

										return ok(undefined);
									}),
								);
								if (insertionResults.isError()) {
									return insertionResults;
								}

								return ok(undefined);
							}
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.params = [];
					},
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
							{
								ast.returnTypes = visitResult.value;

								// add the return types to the symbol table
								const setResults = SymbolTable.setFunctionReturnTypes(symNodeName, ast.returnTypes, {
									debug: this.debug,
								});
								if (setResults.isError()) {
									return setResults;
								}

								return ok(undefined);
							}
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.returnTypes = [];
					},
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
							{
								ast.body = visitResult.value;

								const returnValuesResult = getReturnExpressionsFromBlockStatement(ast.body, {
									types: ast.returnTypes,
									errors: {
										ifMissing: error(
											new AnalysisError(
												AnalysisErrorCode.ReturnStatementExpected,
												messageStencil('Function', 'a ReturnStatement', undefined),
												child,
												this.getErrorContext(child.children.at(-1) || child), // this might be on the semicolon, but :shrug:
											),
											this.ast as ASTReturnStatement,
										),
										ifHasIncorrectNumberOfExpressions: (expected: number, actual: number) => {
											const errorCode =
												actual > expected
													? AnalysisErrorCode.ExpressionNotExpected
													: AnalysisErrorCode.ExpressionExpected;

											return error(
												new AnalysisError(
													errorCode,
													`Analyzer: We expected ${expected} return values, but found ${actual}`,
													// -1 is the last, which a semicolon
													// TODO fix this to find the last return
													child.children.at(-2),
													this.getErrorContext(child.children.at(-2) || node),
												),
												this.ast as ASTReturnStatement,
											);
										},
									},
								});
								if (returnValuesResult.isError()) {
									return returnValuesResult;
								}

								// check the types, returning an error upon mismatch
								return CreateResultFrom.arrayOfResults(
									returnValuesResult.value.map((returnExpr, index) => {
										const [isReturnValAssignable, inferredTypes] = isAssignable(returnExpr, ast.returnTypes[index], {
											debug: this.debug,
										});

										const infUniq = inferredTypes.map(astUniqueness);
										if (infUniq.length === 0) {
											return CreateResultFrom.boolean(
												isReturnValAssignable,
												new AnalysisError(
													AnalysisErrorCode.UnknownValue,
													'Analyzer: We could not determine the type of the return expression',
													child,
													this.getErrorContext(child),
												),
											);
										}

										const ret = astUniqueness(ast.returnTypes[index]);
										return CreateResultFrom.boolean(
											isReturnValAssignable,
											new AnalysisError(
												AnalysisErrorCode.TypeMismatch,
												`We cannot return a value of possible types [${infUniq.join(', ')}] for a ${ret}`,
												child,
												this.getErrorContext(child),
											),
										);
									}),
								);
							}
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
			},
		]);

		// exit the SymNode and go back to parent, whether there was an error or not
		if (this.debug) {
			console.log(`Analyzer: finish visiting FunctionDeclaration ${symNodeName}`);
		}
		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitFunctionReturns(node: Node): Result<ASTType[], AnalysisError | SemanticError | SymbolError> {
		let returns: ASTType[] = [];

		const conversionResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableTypes, NT.CommaSeparator],
			false, // TODO possibly change this to true?
			AnalysisErrorCode.TypeExpected,
			(child: Node | undefined) => messageStencil('FunctionReturns', 'a Type', child),
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

	visitFunctionSignature(node: Node): Result<ASTFunctionSignature, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTFunctionSignature(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the type parameters
			this.getChildHandlerForTypeParams(ast, undefined), // TODO: set the type params in the symbol table?

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
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.params = [];
					},
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
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.returnTypes = [];
					},
				},
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	/**
	 * @param node Possibly undefined node to visit. While most visitees have a definite node, this one does not
	 * @returns
	 */
	visitIdentifier(node: Node | undefined): Result<ASTIdentifier, AnalysisError> {
		// this node is special so needs this check for undefined
		if (typeof node === 'undefined') {
			return error(
				new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'We were expecting a Type, but found nothing',
					node,
					this.getErrorContextUnsafe(node),
				),
				this.ast,
			);
		}

		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Identifier,
			(value) => ok(ASTIdentifier._(value, node.pos)),
			AnalysisErrorCode.IdentifierExpected,
			(node: Node) => messageStencil('Identifier', 'an Identifier', node),
		);
	}

	visitIfStatement(node: Node): Result<ASTIfStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTIfStatement(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: (child: Node | undefined) => messageStencil('IfStatement', 'an Expression', child),
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
				errorCode: AnalysisErrorCode.BodyExpected,
				errorMessage: (child: Node | undefined) => messageStencil('IfStatement', 'a Body', child),
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
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitInterfaceDeclaration(node: Node): Result<ASTInterfaceDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTInterfaceDeclaration(node.pos);

		// before pushing to the stack, check if this interface is in another interface
		const maybeIsIn = this.isIn([ASTInterfaceDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the interface name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		const symNodeName = `${parentFqn || '.'}i_anon_${node.toString()}_${random(100_000, false)}`;
		if (this.debug) {
			console.debug(`Analyzer: Generated temp name for interface: ${symNodeName}`);
		}

		// define the interface in the parent symbol table using this name
		const interfaceSymResult = SymbolTable.insertInterface(symNodeName, [], [], [], ast.pos);
		if (interfaceSymResult.isError()) {
			return interfaceSymResult;
		}

		// set the symbol
		ast.symbol = interfaceSymResult.value;

		// create a new node with this name
		if (this.debug) {
			console.log(`Analyzer: visiting InterfaceDeclaration ${symNodeName}`);
		}
		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, 'interface', node.pos);

		const handlingResult = this.handleASTDeclaration(node, ast, parentFqn, NT.ExtensionsList, this.visitExtensionsList, {
			kind: 'interface',
			symNodeName,
			setTypeParamsCurry: (symNodeName: string) => (typeParams: ASTTypeParameter[]) => {
				// add the type params to the symbol table
				return SymbolTable.setInterfaceTypeParams(symNodeName, typeParams, {
					debug: this.debug,
				});
			},
			setExtendsCurry: (symNodeName: string) => (_extends: ASTTypeExceptPrimitive[]) => {
				// add the extends to the symbol table
				return SymbolTable.setInterfaceExtends(symNodeName, _extends, {
					debug: this.debug,
				});
			},
		});

		// exit the SymNode and go back to parent, whether there was an error or not
		if (this.debug) {
			console.log(`Analyzer: finish visiting InterfaceDeclaration ${symNodeName}`);
		}
		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

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
	visitJoeDoc(node: Node): Result<ASTJoeDoc, AnalysisError> {
		if (node.type === NT.JoeDoc && node.value) {
			return ok(ASTJoeDoc._(node.value, node.pos));
		}

		// TODO check the contents of the JoeDoc

		// TODO TBD if this will ever actually be used / enforced
		return error(
			new AnalysisError(
				AnalysisErrorCode.JoeDocExpected,
				messageStencil('JoeDoc', 'a JoeDoc', node),
				node,
				this.getErrorContext(node),
			),
		);
	}

	visitLoopStatement(node: Node): Result<ASTLoopStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTLoopStatement(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// TODO add the guard

			// the body
			this.getChildHandlerForRequiredBody(ast),
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitMemberExpression(node: Node): Result<ASTMemberExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTMemberExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !validNodeTypesAsMemberObject.includes(child.type)) {
				return error(
					new AnalysisError(
						AnalysisErrorCode.IdentifierExpected,
						messageStencil('MemberExpression', 'an Identifier', child),
						child || node,
						this.getErrorContext(child || node),
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
						AnalysisErrorCode.IdentifierExpected,
						messageStencil('MemberExpression', 'an Identifier', child),
						child || node,
						this.getErrorContext(child || node),
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
			AnalysisErrorCode.SemicolonExpected,
			() => 'Semicolon Expected',
		);
		if (moreChildrenResult.isError()) {
			return moreChildrenResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitMemberList(node: Node): Result<MemberExpressionPropertyASTs[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<MemberExpressionPropertyASTs>(
			node,
			validChildrenAsMemberProperty,
			true,
			AnalysisErrorCode.IdentifierExpected,
			(child: Node | undefined) => messageStencil('MemberList', 'an Identifier', child),
		);
	}

	visitMemberListExpression(node: Node): Result<ASTMemberListExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTMemberListExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !validNodeTypesAsMemberObject.includes(child.type)) {
				return error(
					new AnalysisError(
						AnalysisErrorCode.IdentifierExpected,
						messageStencil('MemberListExpression', 'an Identifier', child),
						child || node,
						this.getErrorContext(child || node),
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
						AnalysisErrorCode.IdentifierExpected,
						messageStencil('MemberListExpression', 'a MemberList', child),
						child || node,
						this.getErrorContext(child || node),
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
			AnalysisErrorCode.SemicolonExpected,
			() => 'Semicolon Expected',
		);
		if (moreChildrenResult.isError()) {
			return moreChildrenResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitModifier(node: Node): Result<ASTModifier, AnalysisError> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Modifier,
			(value) => ok(ASTModifier._(value, node.pos)),
			AnalysisErrorCode.ModifierExpected,
			(node: Node) => messageStencil('Modifier', 'a Modifier', node),
		);
	}

	visitModifiersList(node: Node): Result<ASTModifier[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<ASTModifier>(node, [NT.Modifier], false, AnalysisErrorCode.ModifierExpected, () => 'Modifier Expected');
	}

	visitNextStatement(node: Node): Result<ASTNextStatement, AnalysisError> {
		return ok(ASTNextStatement._(node.pos));
	}

	visitNumberLiteral(node: Node): Result<ASTNumberLiteral, AnalysisError> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.NumberLiteral,
			(value) =>
				ASTNumberLiteral.convertNumberValueTo(value, node.pos, (value: string) => {
					return new AnalysisError(
						AnalysisErrorCode.InvalidNumberFound,
						`Invalid int: ${value}`,
						node,
						this.getErrorContext(node),
					);
				}),
			AnalysisErrorCode.NumberLiteralExpected,
			(node: Node) => messageStencil('NumberLiteral', 'a Number', node),
		);
	}

	visitObjectExpression(node: Node): Result<ASTObjectExpression, AnalysisError | SemanticError | SymbolError> {
		const conversionResult = this.visitChildren<ASTProperty>(
			node,
			[NT.Property, NT.CommaSeparator],
			false, // there can be no properties in an empty object, and they get added later
			AnalysisErrorCode.PropertyExpected,
			(child: Node | undefined) => messageStencil('ObjectExpression', 'a Property', child),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				{
					const ast = ASTObjectExpression._(conversionResult.value, node.pos);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}
				break;
			case 'error':
				return conversionResult;
				break;
		}
	}

	visitObjectShape(node: Node): Result<ASTObjectShape, AnalysisError | SemanticError | SymbolError> {
		const conversionResult = this.visitChildren<ASTPropertyShape>(
			node,
			[NT.PropertyShape, NT.CommaSeparator],
			true, // there must be at least one property in the shape
			AnalysisErrorCode.PropertyExpected,
			(child: Node | undefined) => messageStencil('ObjectShape', 'a Property', child),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				{
					const ast = ASTObjectShape._(conversionResult.value, node.pos);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}
				break;
			case 'error':
				return conversionResult;
				break;
		}
	}

	visitParameter(node: Node): Result<ASTParameter, AnalysisError | SemanticError | SymbolError> {
		// this is significant overlap with the visitVariableDeclaration() function

		const ast = new ASTParameter(node.pos);

		// before pushing to the stack, get the func that this is in
		const maybeIsIn = this.isIn([ASTFunctionDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

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
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.isRest = false; // if this node is not present, then it is not a rest parameter
					},
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
							ast.name.prependParentToFqn(parentFqn);
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (node: Node | undefined) => messageStencil('Parameter', 'an Identifier', node),
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
										AnalysisErrorCode.TypeExpected,
										messageStencil('Parameter', 'a Type', child),
										child,
										this.getErrorContext(child),
									),
									this.ast,
								);
							}

							ast.type = visitResult.value;
							break;
						case 'error':
							return visitResult;
							break;
					}

					return ok(undefined);
				},
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => messageStencil('Parameter', 'a Type', child),
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
							if (typeof ast.type === 'undefined') {
								// ast.defaultValue is guaranteed to be defined at this point
								const assignmentResult = assignInferredPossibleTypes(
									ast.defaultValue,
									child,
									(possibleTypes: ASTType[]) => {
										if (possibleTypes.length !== 1) {
											return error(
												new AnalysisError(
													AnalysisErrorCode.TypeExpected,
													'We could not determine the type of this parameter',
													child,
													this.getErrorContext(child),
												),
											);
										}

										ast.type = possibleTypes[0];
									},
									{ debug: this.debug },
								);
								if (assignmentResult.isError()) {
									return assignmentResult;
								}
							} else {
								const [isReturnValAssignable] = isAssignable(ast.defaultValue, ast.type, {
									debug: this.debug,
								});
								if (!isReturnValAssignable) {
									return error(
										new AnalysisError(
											AnalysisErrorCode.TypeMismatch,
											`[Compiler] The default value for this parameter is not assignable to a ${ast.type}`,
											child,
											this.getErrorContext(child),
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
				errorCode: AnalysisErrorCode.AssignableExpected,
				errorMessage: (child: Node | undefined) => messageStencil('Parameter', 'a value', child),
			},
		]);
		if (handleResult.isError()) {
			return handleResult;
		}

		// now perform some additional checks

		// if the identifier ends with a '?', check that either the declared type is bool
		// or that the inferred type is bool
		if (ast.name.name.at(-1) === '?' && !_.isEqual(ast.type, ASTTypePrimitiveBool)) {
			return error(
				new AnalysisError(
					AnalysisErrorCode.BoolTypeExpected,
					`bool type expected since the parameter name "${ast.name.name}" ends with a "?"`,
					node,
					this.getErrorContext(node),
				),
				this.ast,
			);
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitParametersList(node: Node): Result<ASTParameter[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<ASTParameter>(
			node,
			[NT.Parameter, NT.CommaSeparator],
			false,
			AnalysisErrorCode.ParameterExpected,
			() => 'Parameter Expected',
		);
	}

	visitParenthesized(node: Node): Result<AssignableASTs, AnalysisError | SemanticError | SymbolError> {
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: the assignable
		const child = nodesChildren.shift();
		if (!child?.type || !AssignableNodeTypes.includes(child.type)) {
			return error(
				new AnalysisError(
					AnalysisErrorCode.AssignableExpected,
					'Assignable Expected',
					child || node,
					this.getErrorContext(child || node),
				),
				this.ast,
			);
		}

		// this is a pass-through node, aka return the child, since we don't retain parentheses
		return this.visitAST<AssignableASTs>(child);
	}

	visitPath(node: Node): Result<ASTPath, AnalysisError> {
		if (node?.type === NT.Path && node.value) {
			const ast = new ASTPath(node.pos);

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
			new AnalysisError(AnalysisErrorCode.ValidPathExpected, 'Valid Path Expected', node, this.getErrorContext(node)),
			this.ast,
		);
	}

	visitPostfixIfStatement(node: Node): Result<ASTPostfixIfStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTPostfixIfStatement(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the expression
			{
				type: ExpressionNodeTypes,
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ExpressionASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.expression = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.BodyExpected,
				errorMessage: (child: Node | undefined) => messageStencil('PostfixIfStatement', 'an Expression', child),
			},

			// second child: the test
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
				errorCode: AnalysisErrorCode.ExpressionExpected,
				errorMessage: (child: Node | undefined) => messageStencil('PostfixIfStatement', 'a Condition', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitPrintStatement(node: Node): Result<ASTPrintStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTPrintStatement(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		// first, get the expression to print
		const expressionsResult = this.visitChildren<ExpressionASTs>(
			node,
			[...ExpressionNodeTypes, NT.CommaSeparator],
			true, // you have to print something
			AnalysisErrorCode.ExpressionExpected,
			() => 'Expression Expected',
		);
		switch (expressionsResult.outcome) {
			case 'ok':
				ast.expressions = expressionsResult.value;
				break;
			case 'error':
				return expressionsResult;
				break;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitProgram(node: Node): Result<ASTProgram, AnalysisError | SemanticError | SymbolError> {
		let validChildren = [
			NT.ClassDeclaration,
			NT.Comment,
			NT.EnumDeclaration,
			NT.FunctionDeclaration,
			NT.InterfaceDeclaration,
			NT.SemicolonSeparator,
			NT.UseDeclaration,
		];

		// if this is a snippet, allow all ASTs in the program, to avoid having to wrap
		// code in a function, class, or variable declaration just to analyze it
		if (this.isASnippet) {
			validChildren = Object.values(NT);
		}

		const ast = new ASTProgram(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		// the uses
		// skip for now

		// the declarations

		// the error passed to this.visitChildren() is different than the one we want for an empty file
		if (node.children.length === 0) {
			return error(
				new SemanticError(SemanticErrorCode.FunctionNotFound, 'No main() function found', this.ast, this.getErrorContext(node)),
			);
		}
		const declarationsResult = this.visitChildren<AST>(
			node,
			validChildren,
			true, // there must be at least one declaration
			AnalysisErrorCode.ExtraNodesFound,
			(child: Node | undefined) =>
				`${child ? `A "${child.type}"` : 'This'} is not allowed directly in a ${node.type}. Please wrap in main()`,
		);
		switch (declarationsResult.outcome) {
			case 'ok':
				ast.declarations = declarationsResult.value;
				break;
			case 'error':
				return declarationsResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitProperty(node: Node): Result<ASTProperty, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTProperty(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the property name
			{
				type: [NT.Identifier],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ASTIdentifier>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.key = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('Property', 'an Identifier', child),
			},

			// second child: the property value
			{
				type: [...AssignableNodeTypes, NT.CommaSeparator],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<AssignableASTs>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.value = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.ValueExpected,
				errorMessage: (child: Node | undefined) => messageStencil('Property', 'a value', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitPropertyShape(node: Node): Result<ASTPropertyShape, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTPropertyShape(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the property name
			{
				type: [NT.Identifier],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ASTIdentifier>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.key = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('PropertyShape', 'an Identifier', child),
			},

			// second child: the property type
			{
				type: [...AssignableTypes, NT.CommaSeparator],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ASTType>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.possibleTypes = [visitResult.value];
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.ValueExpected,
				errorMessage: (child: Node | undefined) => messageStencil('PropertyShape', 'a Type', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitRangeExpression(node: Node): Result<ASTRangeExpression, AnalysisError | SemanticError | SymbolError> {
		const validChildren = [
			NT.CallExpression,
			NT.Identifier,
			NT.MemberExpression,
			NT.NumberLiteral,
			NT.Parenthesized,
			NT.UnaryExpression,
		];

		const ast = new ASTRangeExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first child: the lower bound (required)
		const lowerBound = nodesChildren.shift();
		if (lowerBound?.type && validChildren.includes(lowerBound.type)) {
			const visitResult = this.visitAST<RangeBoundASTs>(lowerBound);
			switch (visitResult.outcome) {
				case 'ok':
					ast.lower = visitResult.value;
					break;
				case 'error':
					return visitResult;
					break;
			}
		} else {
			return error(
				new AnalysisError(
					AnalysisErrorCode.RangeBoundExpected,
					`We were expecting a lower range bound, but instead found a ${lowerBound?.type}`,
					lowerBound,
					this.getErrorContext(node),
				),
				this.ast,
			);
		}

		// second child: the upper bound (required)
		const upperBound = nodesChildren.shift();
		if (upperBound?.type && validChildren.includes(upperBound.type)) {
			const visitResult = this.visitAST<RangeBoundASTs>(upperBound);
			switch (visitResult.outcome) {
				case 'ok':
					ast.upper = visitResult.value;
					break;
				case 'error':
					return visitResult;
					break;
			}
		} else {
			return error(
				new AnalysisError(
					AnalysisErrorCode.RangeBoundExpected,
					`We were expecting an upper range bound, but instead found a ${upperBound?.type}`,
					upperBound,
					this.getErrorContext(node),
				),
				this.ast,
			);
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitRegularExpression(node: Node): Result<ASTRegularExpression, AnalysisError> {
		if (node?.type === NT.RegularExpression && node.value) {
			const ast = new ASTRegularExpression(node.pos);

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
							AnalysisErrorCode.InvalidRegularExpression,
							'Invalid regular expression pattern',
							node,
							this.getErrorContext(node),
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
							AnalysisErrorCode.InvalidRegularExpression,
							'Invalid regular expression flags',
							node,
							this.getErrorContext(node),
						),
					);
				}

				ast.flags = flags;
			}

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(AnalysisErrorCode.ExpressionExpected, 'Regular Expression expected', node, this.getErrorContext(node)),
			this.ast,
		);
	}

	visitRestElement(node: Node): Result<ASTRestElement, AnalysisError> {
		if (node?.type === NT.RestElement) {
			const ast = new ASTRestElement(node.pos);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(
				AnalysisErrorCode.RestElementExpected,
				`We were expecting to find a rest element "...", but instead found a ${node.type}`,
				node,
				this.getErrorContext(node),
			),
			this.ast,
		);
	}

	visitReturnStatement(node: Node): Result<ASTReturnStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTReturnStatement(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const conversionResult = this.visitChildren<ExpressionASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			false, // it is valid to have an empty return statement
			AnalysisErrorCode.AssignableExpected,
			(child: Node | undefined) => messageStencil('ReturnStatement', 'an Expression', child),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				ast.expressions = conversionResult.value;
				break;
			case 'error':
				return conversionResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitStringLiteral(node: Node): Result<ASTStringLiteral, AnalysisError> {
		// check if the value is undefined, since empty strings are valid
		if (node?.type === NT.StringLiteral && typeof node.value !== 'undefined') {
			const ast = new ASTStringLiteral(node.pos);

			ast.value = node.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(AnalysisErrorCode.StringLiteralExpected, 'String Expected', node, this.getErrorContext(node)),
			this.ast,
		);
	}

	visitTernaryAlternate(node: Node): Result<ASTTernaryAlternate<AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		if (node?.type === NT.TernaryAlternate) {
			const visitResult = this.visitAST<AssignableASTs>(node.children[0]);
			if (visitResult.isError()) {
				return visitResult;
			}

			const ast = new ASTTernaryAlternate<AssignableASTs>(node.pos);

			ast.value = visitResult.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(AnalysisErrorCode.TernaryAlternateExpected, 'Ternary Alternate Expected', node, this.getErrorContext(node)),
			this.ast,
		);
	}

	visitTernaryCondition(node: Node): Result<ASTTernaryCondition, AnalysisError | SemanticError | SymbolError> {
		if (node?.type === NT.TernaryCondition) {
			const visitResult = this.visitAST<AssignableASTs>(node.children[0]);
			if (visitResult.isError()) {
				return visitResult;
			}

			const ast = new ASTTernaryCondition(node.pos);

			ast.expression = visitResult.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(AnalysisErrorCode.TernaryConditionExpected, 'Ternary Condition Expected', node, this.getErrorContext(node)),
			this.ast,
		);
	}

	visitTernaryConsequent(node: Node): Result<ASTTernaryConsequent<AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		if (node?.type === NT.TernaryConsequent) {
			const visitResult = this.visitAST<AssignableASTs>(node.children[0]);
			if (visitResult.isError()) {
				return visitResult;
			}

			const ast = new ASTTernaryConsequent<AssignableASTs>(node.pos);

			ast.value = visitResult.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(AnalysisErrorCode.TernaryConsequentExpected, 'Ternary Consequent Expected', node, this.getErrorContext(node)),
			this.ast,
		);
	}

	visitTernaryExpression(
		node: Node,
	): Result<ASTTernaryExpression<AssignableASTs, AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTernaryExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the test
			{
				type: NT.TernaryCondition,
				required: true,
				callback: (child) => {
					const visitResult = this.visitTernaryCondition(child);
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
				errorCode: AnalysisErrorCode.TernaryConditionExpected,
				errorMessage: (child: Node | undefined) => messageStencil('TernaryExpression', 'a Condition', child),
			},

			// second child: the consequent
			{
				type: NT.TernaryConsequent,
				required: true,
				callback: (child) => {
					const visitResult = this.visitTernaryConsequent(child);
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
				errorCode: AnalysisErrorCode.TernaryConsequentExpected,
				errorMessage: (child: Node | undefined) =>
					messageStencil('TernaryExpression', 'an Expression for the "then" clause', child),
			},

			// third child: the alternate
			{
				type: NT.TernaryAlternate,
				required: true,
				callback: (child) => {
					const visitResult = this.visitTernaryAlternate(child);
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
				errorCode: AnalysisErrorCode.TernaryAlternateExpected,
				errorMessage: (child: Node | undefined) =>
					messageStencil('TernaryExpression', 'an Expression for the "else" clause', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitThisKeyword(node: Node): Result<ASTThisKeyword, AnalysisError> {
		if (node?.type === NT.ThisKeyword) {
			const ast = new ASTThisKeyword(node.pos);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			new AnalysisError(
				AnalysisErrorCode.ThisKeywordExpected,
				`We were expecting to find a "this" keyword, but instead found a ${node.type}`,
				node,
				this.getErrorContext(node),
			),
			this.ast,
		);
	}

	visitTupleExpression(node: Node): Result<ASTTupleExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTupleExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			false, // TODO do we allow empty tuples? Tuples are immutable...
			AnalysisErrorCode.AssignableExpected,
			(child) => messageStencil('TupleExpression', 'a value', child),
		);
		switch (handlingResult.outcome) {
			case 'ok':
				ast.items = handlingResult.value;
				break;
			case 'error':
				return handlingResult;
				break;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitTupleShape(node: Node): Result<ASTTupleShape, AnalysisError | SemanticError | SymbolError> {
		if (node.children.length < 1) {
			return error(
				new AnalysisError(
					AnalysisErrorCode.TypeExpected,
					'We were expecting at least one type, but found none',
					node,
					this.getErrorContext(node),
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
						AnalysisErrorCode.TypeExpected,
						messageStencil('TupleShape', 'a Type', child),
						child,
						this.getErrorContext(child),
					),
					this.ast,
				);
			}
		}

		const ast = ASTTupleShape._(children, node.pos);

		this.astPointer = this.ast = ast;

		return ok(ast);
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
	visitType(node: Node | undefined): Result<ASTType | SkipAST, AnalysisError | SemanticError | SymbolError> {
		const errorResult = error(
			new AnalysisError(
				AnalysisErrorCode.TypeExpected,
				`Type Expected, received "${node?.type}"`,
				node,
				this.getErrorContextUnsafe(node),
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
					const ast = ASTTypeNumber._(node.value as NumberSize, node.pos);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				// check if it's a primitive type
				if (primitiveTypes.includes(node.value as primitiveAstType)) {
					const ast = ASTTypePrimitive._(node.value as primitiveAstType, node.pos);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				// check if it's a range
				if (node.value === 'range') {
					const ast = ASTTypeRange._(node.pos);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				return errorResult;
				break;

			// or if it's a CommaSeparator
			case NT.CommaSeparator:
				return ok(new SkipAST(node.pos));
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

	visitTypeArgumentsList(node: Node): Result<ASTType[], AnalysisError | SemanticError | SymbolError> {
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
						AnalysisErrorCode.TypeExpected,
						`Type Expected, received "${child.type}"`,
						child,
						this.getErrorContext(child),
					),
				);
			}
		}

		return ok(typeArgs);
	}

	visitTypeInstantiationExpression(node: Node): Result<ASTTypeInstantiationExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTypeInstantiationExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
										AnalysisErrorCode.TypeExpected,
										`We were expecting to find a Type, but instead found a ${child.type}`,
										child,
										this.getErrorContext(child),
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
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => messageStencil('TypeInstantiationExpression', 'a base Type', child),
			},

			// the type arguments
			{
				type: NT.TypeArgumentsList,
				required: true,
				callback: (child: Node) => {
					const conversionResult = this.visitChildren<ASTType>(
						child,
						validChildrenInTypeArgumentList,
						true, // once you're in a list, arguments are required
						AnalysisErrorCode.ExtraNodesFound,
						(child: Node | undefined) => `${child ? `A "${child.type}"` : 'This'} is not allowed directly in a ${node.type}`,
					);
					switch (conversionResult.outcome) {
						case 'ok':
							ast.typeArgs = conversionResult.value;
							return ok(undefined);
							break;
						case 'error':
							return conversionResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => messageStencil('TypeInstantiationExpression', 'a Type', child),
			},
		]);
		if (handleResult.isError()) {
			return handleResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitTypeParameter(node: Node): Result<ASTType | SkipAST, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTypeParameter(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => messageStencil('TypeParameter', 'a Type', child),
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
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => messageStencil('TypeParameter', 'a Type constraint', child),
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
				errorCode: AnalysisErrorCode.AssignableExpected,
				errorMessage: (child: Node | undefined) => messageStencil('TypeParameter', 'a default Type', child),
			},
		]);
		if (handleResult.isError()) {
			return handleResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitTypeParametersList(node: Node): Result<ASTTypeParameter[], AnalysisError | SemanticError | SymbolError> {
		let typeParams: ASTTypeParameter[] = [];

		const conversionResult = this.visitChildren<ASTTypeParameter>(
			node,
			[NT.CommaSeparator, NT.TypeParameter],
			true, // cannot have empty <||>
			AnalysisErrorCode.TypeExpected,
			(child: Node | undefined) => messageStencil('TypeParametersList', 'a Type', child),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				typeParams = conversionResult.value;
				break;
			case 'error':
				return conversionResult;
				break;
		}

		return ok(typeParams);
	}

	visitUnaryExpression(
		node: UnaryExpressionNode,
	): Result<ASTUnaryExpression<ExpressionASTs>, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTUnaryExpression<ExpressionASTs>(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: is the operator before or after the operand
		ast.before = node.before;

		// second grammatical requirement: the operator
		if (!node.value) {
			return error(
				new AnalysisError(AnalysisErrorCode.OperatorExpected, 'Operator Expected', node, this.getErrorContext(node)),
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
						AnalysisErrorCode.ExpressionExpected,
						'Expression Expected',
						child || node,
						this.getErrorContext(child || node),
					),
					this.ast,
				);
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(
				new AnalysisError(AnalysisErrorCode.SemicolonExpected, 'Semicolon Expected', child, this.getErrorContext(child)),
				this.ast,
			);
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitUseDeclaration(node: Node): Result<ASTUseDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTUseDeclaration(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('UseDeclaration', 'an Identifier', child),
			},

			// second child: the "from" keyword
			{
				type: NT.FromKeyword,
				required: false,
				callback: skipThisChild,
			},

			// third child: the path
			{
				type: NT.Path,
				required: (child, childIndex, allChildren) => {
					return allChildren[childIndex - 1]?.type === NT.FromKeyword;
				},
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
				errorCode: AnalysisErrorCode.PathExpected,
				errorMessage: (child: Node | undefined) => messageStencil('ImportDeclaration', 'a Path', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitVariableDeclaration(node: Node): Result<ASTVariableDeclaration, AnalysisError | SemanticError | SymbolError> {
		// there is significant overlap with the visitParameter() function

		const ast = new ASTVariableDeclaration(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		// first grammatical requirement: mutability keyword (from the value)
		if (node.value && ['const', 'let'].includes(node.value)) {
			ast.mutable = node.value === 'let';
		} else {
			return error(
				new AnalysisError(
					AnalysisErrorCode.KeywordExpected,
					'Expecting keyword "const" or "let"',
					node,
					this.getErrorContext(node),
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
									ast.declaredTypes[index] = ASTTypePrimitiveBool(child.pos);
								}
							});

							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.IdentifierExpected,
				errorMessage: (child: Node | undefined) => messageStencil('VariableDeclaration', 'an Identifier', child),
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
										AnalysisErrorCode.TypeExpected,
										messageStencil('VariableDeclaration', 'a Type', child),
										child,
										this.getErrorContext(child),
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
				errorCode: AnalysisErrorCode.TypeExpected,
				errorMessage: (child: Node | undefined) => messageStencil('VariableDeclaration', 'a Type', child),
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
					if (visitResult.isError()) {
						return visitResult;
					}

					ast.initialValues = visitResult.value;

					// now attempt to infer the type from the initial value

					// ast.initialValues is guaranteed to be defined at this point
					const areAssignable = ast.initialValues.map((initialValue, index) => {
						// infer possible types of the initial value and assign it thereto
						const assignmentResult = assignInferredPossibleTypes(
							initialValue,
							child,
							(possibleTypes: ASTType[]) => {
								ast.inferredPossibleTypes[index] = possibleTypes;
							},
							{ debug: this.debug },
						);
						if (assignmentResult.isError()) {
							return assignmentResult;
						}

						if (ast.inferredPossibleTypes[index].length === 0) {
							return error(
								new AnalysisError(
									AnalysisErrorCode.UnknownValue,
									`We cannot infer the type of this value "${ast.identifiersList[index]}"`,
									child,
									this.getErrorContext(child),
								),
							);
						}

						if (typeof ast.declaredTypes[index] !== 'undefined') {
							const [isReturnValAssignable] = isAssignable(ast.initialValues[index], ast.declaredTypes[index], {
								debug: this.debug,
							});
							if (!isReturnValAssignable) {
								const possibleTypes = ast.inferredPossibleTypes[index].map(astUniqueness);
								const message =
									possibleTypes.length === 1
										? `We cannot assign a ${possibleTypes[0]} value to a "${astUniqueness(
												ast.declaredTypes[index],
										  )}" variable`
										: `We cannot assign a value of possible type [${possibleTypes.join(', ')}] to a "${astUniqueness(
												ast.declaredTypes[index],
										  )}" variable`;

								return error(
									new AnalysisError(AnalysisErrorCode.TypeMismatch, message, child, this.getErrorContext(child)),
								);
							}
						}

						return ok(undefined);
					});

					return CreateResultFrom.arrayOfResults<undefined, AnalysisError | SemanticError>(areAssignable);
				},
				errorCode: AnalysisErrorCode.AssignableExpected,
				errorMessage: (child: Node | undefined) => messageStencil('VariableDeclaration', 'an initial value', child),
			},
		]);
		if (handlingResult.isError()) {
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
					if (typeof ast.declaredTypes[index] !== 'undefined' && !_.isEqual(ast.declaredTypes[index], ASTTypePrimitiveBool)) {
						return error(
							new AnalysisError(
								AnalysisErrorCode.BoolTypeExpected,
								`bool type expected since the variable name "${identifier.name}" ends with a "?"`,
								node,
								this.getErrorContext(node),
							),
							this.ast,
						);
					} else if (
						typeof ast.inferredPossibleTypes[index] !== 'undefined' &&
						!_.isEqual(ast.inferredPossibleTypes[index], ASTTypePrimitiveBool)
					) {
						return error(
							new AnalysisError(
								AnalysisErrorCode.BoolTypeExpected,
								`bool type expected since the variable name "${identifier.name}" ends with a "?"`,
								node,
								this.getErrorContext(node),
							),
							this.ast,
						);
					}
				}
			});
		}

		// add to symbol table
		const insertionResults = CreateResultFrom.arrayOfResults(
			ast.identifiersList.map((identifier, index) => {
				const varSymResult = SymbolTable.insertVariable(
					identifier.name,
					ast.mutable,
					ast.declaredTypes[index],
					ast.initialValues[index],
					identifier.pos,
				);
				if (varSymResult.isOk()) {
					// set the symbol
					ast.symbols[index] = varSymResult.value;
				}

				return varSymResult;
			}),
		);
		if (insertionResults.isError()) {
			return insertionResults;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitWhenCase(node: Node): Result<ASTWhenCase, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTWhenCase(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, [
			// first child: the values (required)
			{
				type: NT.WhenCaseValues,
				required: true,
				callback: (child) => {
					const visitResult = this.visitWhenCaseValues(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.values = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				errorCode: AnalysisErrorCode.WhenCaseValueExpected,
				errorMessage: (child: Node | undefined) => messageStencil('WhenCase', 'a value', child),
			},

			// second child: the consequent (required)
			{
				type: NT.WhenCaseConsequent,
				required: true,
				callback: (child) => {
					const visitResult = this.visitWhenCaseConsequent(child);
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
				errorCode: AnalysisErrorCode.WhenCaseConsequentExpected,
				errorMessage: (child: Node | undefined) => messageStencil('WhenCase', 'a consequent', child),
			},
		]);
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	visitWhenCaseConsequent(node: Node): Result<ASTBlockStatement | AssignableASTs, AnalysisError | SemanticError | SymbolError> {
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		const child = nodesChildren.shift();
		if (child?.type && ([NT.BlockStatement, ...AssignableNodeTypes] as NT[]).includes(child.type)) {
			return this.visitAST<ASTBlockStatement | AssignableASTs>(child);
		}

		return error(
			new AnalysisError(
				AnalysisErrorCode.ExpressionExpected,
				messageStencil('WhenCaseConsequent', 'an Expression', child),
				node,
				this.getErrorContext(node),
			),
			this.ast,
		);
	}

	visitWhenCaseValues(child: Node): Result<WhenCaseValueASTs[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<WhenCaseValueASTs>(
			child,
			validChildrenInWhenCaseValues,
			true, // must have at least one value
			AnalysisErrorCode.WhenCaseValueExpected,
			(child: Node | undefined) => messageStencil('WhenCaseValues', 'a value', child),
		);
	}

	visitWhenExpression(node: Node): Result<ASTWhenExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTWhenExpression(node.pos);
		this.stack.push(ast); // push pointer to this AST Node

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
						AnalysisErrorCode.ExpressionExpected,
						messageStencil('WhenExpression', 'an Expression', child),
						node,
						this.getErrorContext(node),
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
					true, // must have at least one when case
					AnalysisErrorCode.WhenCaseExpected,
					(child) => messageStencil('WhenExpression', 'a WhenCase', child),
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
						AnalysisErrorCode.BlockStatementExpected,
						messageStencil('WhenExpression', 'a BlockStatement with WhenCases', child),
						node,
						this.getErrorContext(node),
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
						AnalysisErrorCode.CommaExpected,
						messageStencil('WhenExpression', 'a Comma', child),
						child,
						this.getErrorContext(child),
					),
					this.ast,
				);
			}
		}

		this.astPointer = this.ast = ast;
		this.stack.pop();

		return ok(ast);
	}

	public setCheckSemantics(checkSemantics: boolean): void {
		this.checkSemantics = checkSemantics;
	}
}
