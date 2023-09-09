import _ from 'lodash';
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
import Context from '../shared/context';
import loggers, { DedentFunc } from '../shared/log';
import { Maybe, maybeIfNotUndefined } from '../shared/maybe';
import { NumberSize, numberSizesAll } from '../shared/numbers/sizes';
import { Pos } from '../shared/pos';
import { CreateResultFrom, error, ok, Result } from '../shared/result';
import { when } from '../shared/when';
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
	ASTExtOrImpl,
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
	ASTTypeInstantiationExpression,
	ASTTypeList,
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
import AnalysisError from './error';
import Helpers from './helpers';
import SemanticError from './semanticError';
import Semantics from './semantics';
import SymbolError from './symbolError';
import { SymbolInfo, SymbolKind, SymbolTable, SymTree } from './symbolTable';
import visitorMap from './visitorMap';

const log = loggers.analyzer;

// reusable handler callback for child nodes if we want to skip them
const skipThisChild = (_child: Node) => ok(undefined);

type AnalyzerOptions = { isASnippet: boolean; checkSemantics: boolean };
type AnalyzerResult = Result<[ASTProgram, SymTree], AnalysisError | SemanticError | SymbolError>;

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
				analysisError: (child: Node | undefined) => AnalysisError;
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

	private symTree!: SymTree;

	/**
	 * The stack holds ASTs in the order they were opened,
	 * so that we can ensure that they are exited correctly.
	 *
	 * A general rule is anytime an opening brace/bracket/triangle/parens
	 * is found, that gets an item on the stack. When it's closed, the
	 * item is popped.
	 */
	private stack: AST[] = [];

	/**
	 * Snippets are more lenient than regular programs.
	 *
	 * If checkSemantics is true, we will check semantics. If false, we
	 * will only generate the AST. This is useful for unit tests.
	 */
	private options: AnalyzerOptions;

	readonly result: Result<[ASTProgram, SymTree], AnalysisError | SemanticError | SymbolError>;

	private constructor(cst: Node, parser: Parser, loc: string[], options: AnalyzerOptions) {
		this.cst = cst;
		this.currentNode = cst;
		this._parser = parser;
		this.loc = loc;
		this.options = options;
		function analyzerEnd(ok: boolean, dedent: DedentFunc) {
			// log that we're exiting
			if (!ok) {
				log.warnAndDedent(dedent, 'done with errors');
			} else {
				log.successAndDedent(dedent, 'done');
			}
		}

		// log that we're beginning this function
		const dedentFunc = log.indentWithInfo('begin ...');

		// step 1: generate the AST
		const astGenerationResult = this.generateAST();
		if (astGenerationResult.isError()) {
			analyzerEnd(false, dedentFunc);

			this.result = astGenerationResult;
			return;
		}

		// ensure stack is empty
		if (this.stack.length > 0) {
			analyzerEnd(false, dedentFunc);
			this.result = error(AnalysisError.UnexpectedEndOfProgram(this.currentNode, this.ctx(this.currentNode)));
			return;
		}

		const [ast, symTree] = astGenerationResult.value;

		// we're done the analysis portion
		analyzerEnd(true, dedentFunc);

		// if we are not checking semantics, we are done
		if (!this.options.checkSemantics) {
			this.result = ok([ast, symTree]);
			return;
		}

		// step 2: check semantics
		const semanticError = new Semantics(ast, this.loc, options).checkForErrors();
		if (semanticError.isError()) {
			this.result = semanticError;
			return;
		}

		this.result = ok([ast, symTree]);
		return;
	}

	public static analyze(cst: Node, parser: Parser, loc: string[], options: AnalyzerOptions): SemanticAnalyzer {
		return new SemanticAnalyzer(cst, parser, loc, options);
	}

	private generateAST(): AnalyzerResult {
		// this will call child nodes recursively and build the AST
		return this.visitAST<ASTProgram>(this.cst).mapValue((ast: ASTProgram) => [ast, this.symTree]);
	}

	visitProgram(node: Node): Result<ASTProgram, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTProgram(node.pos, this.stack.at(-1));
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		this.symTree = SymbolTable.newTree('global', this.cst.pos, this.loc, ast);

		// the uses
		// skip for now

		// the declarations

		// the error passed to this.visitChildren() is different than the one we want for an empty file
		if (node.children.length === 0) {
			return error(SemanticError.NotFound('function', 'main()', this.ast, this.ctx(node)));
		}

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
		if (this.options.isASnippet) {
			validChildren = Object.values(NT);
		}

		const declarationsResult = this.visitChildren<AST>(
			node,
			validChildren,
			true, // there must be at least one declaration
			(child: Node | undefined) =>
				AnalysisError.ExtraNodesFound(
					`${child ? `A "${child.type}"` : 'This'} is not allowed directly in a ${node.type}. Please wrap in main()`,
					child,
					this.ctx(child || node),
				),
		);
		switch (declarationsResult.outcome) {
			case 'ok':
				ast.declarations = declarationsResult.value;
				break;
			case 'error':
				return declarationsResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	// reusable function to handle a node that has a value
	// we will check the node type and that the node has a value
	// if it does, we will call the callback to assign the value to the AST node
	// if it doesn't, we will return an error
	handleNodeThatHasValueAndNoChildren<T extends AST>(
		node: Node,
		expectedNodeType: NT,
		callback: (value: string) => Result<T, AnalysisError>,
		analysisError: (node: Node) => AnalysisError,
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

		return error(analysisError(node), this.ast);
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
	 * @param errorFn Function to return an AnalysisError
	 * @returns
	 */
	visitChildren<R extends AST | AST[]>(
		parentNode: Node,
		validChildren: NT[],
		areChildrenRequired: boolean,
		errorFn: (parentNode: Node) => AnalysisError,
	): Result<Array<Exclude<R, SkipAST>>, AnalysisError | SemanticError | SymbolError> {
		if (areChildrenRequired && parentNode.children.length === 0) {
			return error(errorFn(parentNode), this.ast);
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
				return error(errorFn(child), this.ast);
			}
		}

		return ok(children);
	}

	handleExtensionsOrImplementsList(
		node: Node,
		nodeType: NT,
	): Result<ASTTypeList<ASTExtOrImpl>, AnalysisError | SemanticError | SymbolError> {
		const validChildren = [nodeType, NT.CommaSeparator];
		const extensions: ASTExtOrImpl[] = [];

		for (const child of node.children) {
			if (validChildren.includes(child.type)) {
				const visitResult = this.visitAST<ASTExtOrImpl>(child);
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
					AnalysisError.ExtraNodesFound(`A ${child.type} is not allowed directly in a ${node.type}`, child, this.ctx(child)),
					this.ast,
				);
			}
		}

		return ok(ASTTypeList._(extensions, node.pos));
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
			analysisError: (child: Node | undefined) =>
				AnalysisError.Expected.Body(
					Helpers.messageStencil('Body', 'a Body', child),
					child,
					this.ctx(child || (ast as unknown as AST)),
				),
		};
	}

	private getChildHandlerForTypeParams(
		ast: ASTThatHasTypeParams,
		setInSymbolTable: ((typeParams: ASTTypeList<ASTTypeParameter>) => Result<SymbolInfo, SymbolError>) | undefined,
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
					ast.typeParams = ASTTypeList.empty((ast as unknown as { pos: Pos }).pos);
				},
			},
		};
	}

	/**
	 * General-use function to handle AST nodes that are declarations.
	 *
	 * It returns a Result with the name or an error.
	 *
	 * @param node The original node
	 * @param ast The AST node
	 * @param parentFqn The parent's FQN, if any
	 * @param nodeType The node type (enum, interface, etc)
	 * @param extensionsListVisitor The visitor func for the extends list
	 * @param symbolTableStuff Instructions on dealing with the symbol table
	 * @param symbolTableStuff.kind The symbol kind
	 * @param symbolTableStuff.symNodeName The temporary name for the symNode. This will be updated when we handle the name
	 * @param symbolTableStuff.setTypeParamsCurry Curry func to set the type params in the symbol table
	 * @param symbolTableStuff.setExtendsCurry Curry func to set the extends in the symbol table
	 */
	private handleASTDeclaration(
		node: Node,
		ast: AST & ASTDeclaration,
		parentFqn: string,
		nodeType: NT,
		extensionsListVisitor: (node: Node) => Result<ASTTypeList<ASTExtOrImpl>, AnalysisError | SemanticError | SymbolError>,
		symbolTableStuff: {
			kind: SymbolKind;
			symNodeName: string;
			/** Curry func to set the type params in the symbol table */
			setTypeParamsCurry: (
				ast: AST & ASTDeclaration,
			) => (typeParams: ASTTypeList<ASTTypeParameter>) => Result<SymbolInfo, SymbolError>;
			/** Curry func to set the extends in the symbol table */
			setExtendsCurry: (ast: AST & ASTDeclaration) => (_extends: ASTTypeList<ASTExtOrImpl>) => Result<SymbolInfo, SymbolError>;
		},
	): Result<string, AnalysisError | SemanticError | SymbolError> {
		let symNodeName = symbolTableStuff.symNodeName;

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// the joeDoc
			joedoc: this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			modifiers: this.getChildHandlerForModifiers(ast),

			// the name
			name: {
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					if (result.isError()) {
						log.warn('Failed when visiting Identifier:', result.error.message);

						return result;
					}

					ast.name = result.value;
					ast.name.prependParentToFqn(parentFqn);

					// update the symbol table
					const updateResult = SymbolTable.updateName(
						symNodeName,
						ast.name.name,
						ast.name.fqn,
						symbolTableStuff.kind,
						this.ctx(ast),
						true,
					);
					if (updateResult.isError()) {
						log.warn('Failed when updating symbol name:', updateResult.error.message);

						return updateResult;
					}

					// update node name and FQN
					symNodeName = ast.name.name;

					return ok(undefined);
				},
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('Declaration Name', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// the type parameters
			typeParams: this.getChildHandlerForTypeParams(ast, symbolTableStuff.setTypeParamsCurry(ast)),

			// the extends list
			extends: {
				type: nodeType,
				required: false,
				callback: (child) => {
					const visitResult = extensionsListVisitor.call(this, child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.extends = visitResult.value;

							symbolTableStuff.setExtendsCurry(ast)(ast.extends);

							return ok(undefined);
							break;
						case 'error':
							log.warn('Failed when visiting extends list:', visitResult.error.message);

							return visitResult;
							break;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.extends = ASTTypeList._([], ast.pos);
					},
				},
			},

			// the body
			body: this.getChildHandlerForRequiredBody(ast),
		});

		return handlingResult.mapValue(() => symNodeName);
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
		errorFn: (child: Node) => AnalysisError = (child) =>
			AnalysisError.ExpressionNotExpected(
				`We did not expect to find an expression of type "${child.type}" here`,
				child,
				this.ctx(child),
			),
	): Result<undefined, AnalysisError> {
		if (typeof child === 'undefined') {
			return ok(undefined);
		}

		return error(errorFn(child), this.ast);
	}

	// reusable function to handle a node that has children of different types
	// each child can be either required, optional, or dependent on whether a previous child of certain type was present
	// each child will have a callback that will be called if the child is present
	// if the child is not present, and it is required, we will return an error
	handleNodesChildrenOfDifferentTypes(
		node: Node,
		childrenHandlers: Record<string, childNodeHandler>,
	): Result<undefined, AnalysisError | SemanticError | SymbolError> {
		const children = [...node.children]; // make a copy to avoid mutating the original node
		let childIndex = 0;

		// debug that we're beginning this function
		const dedentFuncMain = log.indentWithInfo(
			'begin',
			node.type,
			'handleNodesChildrenOfDifferentTypes with',
			Object.keys(childrenHandlers).length,
			'handlers and',
			children.length,
			'children',
		);

		// get the first child
		let child = children.shift();

		// loop through the children handlers
		for (const [handlerName, childHandler] of Object.entries(childrenHandlers)) {
			// concretize the required function if it is a function
			const definitelyRequired = typeof childHandler.required === 'boolean' && childHandler.required;
			// when running any handler callback, provide *the unmodified children array*
			const required =
				definitelyRequired ||
				(typeof childHandler.required === 'function' && childHandler.required(child, childIndex, node.children));

			// log.indentWithInfo(`${required ? 'required' : 'optional'} handler`, handlerName);
			// const logPiecesForChild = ['child', childIndex, '/', node.children.length, child?.type];

			// if the child is required and it is not present, return an error
			if (required && !child) {
				log.warnAndDedent(dedentFuncMain, 'Required handler', handlerName, 'failed because child not found');

				return error(childHandler.analysisError(child), this.ast);
			}

			// if the child is present
			if (child) {
				// is the type acceptable?
				const isTheTypeAcceptable =
					typeof childHandler.type === 'undefined' ||
					(typeof childHandler.type === 'string' && child.type === childHandler.type) ||
					(Array.isArray(childHandler.type) && childHandler.type.includes(child.type));

				if (!isTheTypeAcceptable) {
					// not acceptable but required
					if (required) {
						log.warnAndDedent(
							dedentFuncMain,
							'Required handler',
							handlerName,
							'failed because we were expecting a',
							childHandler.type,
							'but found a',
							child.type,
						);

						return error(childHandler.analysisError(child), this.ast);
					}

					// not acceptable but optional

					// call fallback if relevant
					// in this scenario, there is a child, but it is not the right type, which means
					// the handler is not going to be called, so we need to call the fallback
					if (typeof childHandler.options?.fallbackIfNotRequiredAndChildNotThere === 'function') {
						childHandler.options.fallbackIfNotRequiredAndChildNotThere();

						log.info('Optional handler', handlerName, 'using fallback');
					} else {
						log.info('Optional handler', handlerName, 'skipped');
					}

					continue;
				}

				// at this point, we know the child is acceptable, so we can call the callback
				const dedentFuncMatch = log.indentWithInfo(
					'Handler',
					handlerName,
					'matches with child',
					child?.type,
					childIndex,
					'/',
					node.children.length,
				);

				// call the callback
				const callbackResult = childHandler.callback(child);
				if (callbackResult.isError()) {
					log.warnAndDedent(dedentFuncMatch, 'Handler', handlerName, 'failed because callback returned error');

					log.warnAndDedent(dedentFuncMain, 'end handleNodesChildrenOfDifferentTypes');

					return callbackResult;
				}

				// log the callback result
				log.successAndDedent(dedentFuncMatch, 'Handler', handlerName);
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
			if (child) {
				log.info('next child', childIndex, '/', node.children.length, child?.type);
			} else {
				// do not exit the loop, so that we can process more
				// possible required handlers or fallbacks
			}
		}

		// there should be no more children
		const moreChildrenResult = this.ensureNoMoreChildren(child);
		if (moreChildrenResult.isError()) {
			log.warnAndDedent(dedentFuncMain, 'end handleNodesChildrenOfDifferentTypes');

			return moreChildrenResult;
		}

		log.successAndDedent(dedentFuncMain, 'no more children; end handleNodesChildrenOfDifferentTypes');

		return ok(undefined);
	}

	noop(node: Node): Result<SkipAST, AnalysisError> {
		const ast = new SkipAST(node.pos, this.astPointer);

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
	ctx(node: Node | AST): Context {
		const length = 'value' in node && typeof node.value !== 'undefined' ? node.value.length : node.pos.end - node.pos.start;

		return new Context(this.parser.lexer.code, node.pos.line, node.pos.col, length);
	}

	/**
	 * If there is no way to guarantee a node is defined, use this backup method to get an error context
	 *
	 * This should only be used if there is absolutely no way to get a valid node,
	 * and we can't even be sure the parent node is valid.
	 *
	 * If the node is undefined, we have no positional information.
	 */
	ctxUnsafe(node: Node | undefined): Context {
		return new Context(this.parser.lexer.code, node?.pos.line || 1, node?.pos.col || 1, node?.value?.length || 1);
	}

	/** Visitees */

	visitAST<T extends AST | AST[]>(node: Node): Result<T, AnalysisError | SemanticError | SymbolError> {
		this.currentNode = node;

		return visitorMap[node.type](node, this) as Result<T, AnalysisError | SemanticError | SymbolError>;
	}

	visitArgumentList(node: Node): Result<ASTArgumentsList, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTArgumentsList(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const argsResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			false,
			(child: Node | undefined) =>
				AnalysisError.Expected.Assignable(Helpers.messageStencil('ArgumentList', 'a value', child), child, this.ctx(child || node)),
		);
		switch (argsResult.outcome) {
			case 'ok':
				ast.args = argsResult.value;
				break;
			case 'error':
				return argsResult;
				break;
		}

		this.stack.pop();

		return ok(ast);
	}

	/** An ArrayExpression needs a type, which can be evaluated either via the first item or via the context (VariableDeclaration, Argument Type, etc.) */
	visitArrayExpression(node: Node): Result<ASTArrayExpression<AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTArrayExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const itemsResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator, NT.PostfixIfStatement],
			false,
			(child: Node | undefined) =>
				AnalysisError.Expected.Assignable(
					Helpers.messageStencil('ArrayExpression', 'a value', child),
					child,
					this.ctx(child || node),
				),
		);
		switch (itemsResult.outcome) {
			case 'ok':
				ast.items = itemsResult.value;
				break;
			case 'error':
				return itemsResult;
				break;
		}

		// infer the type from the first value
		if (ast.items.length > 0) {
			const assignmentResult = Helpers.assignInferredType(
				ast.items[0],
				node.children[0],
				(type: ASTType) => {
					ast.type = type;
				},
				this.ctx(node.children[0]),
			);
			if (assignmentResult.isError()) {
				return error(assignmentResult.error, this.ast);
			}
		}

		this.stack.pop();

		return ok(ast);
	}

	visitArrayOf(node: Node): Result<ASTArrayOf, AnalysisError | SemanticError | SymbolError> {
		if (node.children.length !== 1) {
			return error(
				AnalysisError.Expected.Type(`We were expecting one type, but found ${node.children.length} types`, node, this.ctx(node)),
				this.ast,
			);
		}

		const visitResult = this.visitType(node.children[0]);
		switch (visitResult.outcome) {
			case 'ok':
				{
					if (visitResult.value instanceof SkipAST) {
						return error(
							AnalysisError.Expected.Type(
								Helpers.messageStencil('Array Type', 'a Type', node.children[0]),
								node,
								this.ctx(node),
							),
							this.ast,
						);
					}

					const ast = ASTArrayOf._(visitResult.value, node.pos, this.astPointer);

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
			(child: Node | undefined) =>
				AnalysisError.Expected.Assignable(
					Helpers.messageStencil('AssignablesList', 'a value', child),
					child,
					this.ctx(child || node),
				),
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
		return this.visitChildren<T>(node, [NT.CommaSeparator, ...validChildren], true, (child: Node | undefined) =>
			AnalysisError.Expected.Identifier(
				Helpers.messageStencil('AssigneesList', 'an Identifier', child),
				child,
				this.ctx(child || node),
			),
		);
	}

	visitAssignmentExpression(node: Node): Result<ASTAssignmentExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTAssignmentExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: left-hand side
			names: {
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
				analysisError: (child) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('AssignmentExpression', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the assignment operator
			equalsSign: {
				type: [NT.AssignmentOperator],
				required: true,
				callback: skipThisChild,
				analysisError: (child) =>
					AnalysisError.Expected.AssignmentOperator(
						Helpers.messageStencil('AssignmentExpression', 'an Assignment Operator', child),
						child,
						this.ctx(child || node),
					),
			},

			// third child: the right-hand side
			values: {
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
				analysisError: (child) =>
					AnalysisError.Expected.Assignable(
						Helpers.messageStencil('AssignmentExpression', 'a value', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitBinaryExpression(
		node: Node,
	): Result<ASTBinaryExpression<ExpressionASTs, ExpressionASTs>, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTBinaryExpression<ExpressionASTs, ExpressionASTs>(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		// first grammatical requirement: the operator
		if (!node.value) {
			return error(AnalysisError.Expected.Operator('Operator Expected', node, this.ctx(node)), this.ast);
		}

		ast.operator = node.value;

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: left-hand side
			lhs: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Expression(
						Helpers.messageStencil('BinaryExpression', 'an Expression', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: right-hand side
			rhs: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Expression(
						Helpers.messageStencil('BinaryExpression', 'an Expression', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitBlockStatement(node: Node): Result<ASTBlockStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTBlockStatement(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		// next, get the expressions from the children
		const validChildren = Object.values(NT).filter((nt) => nt !== NT.UseDeclaration);
		const expressionsResult = this.visitChildren<AST>(node, validChildren, false, (child) =>
			AnalysisError.ExtraNodesFound(
				`${child ? `A "${child.type}"` : 'This'} is not allowed directly in a ${node.type}`,
				child,
				this.ctx(child),
			),
		);
		switch (expressionsResult.outcome) {
			case 'ok':
				ast.expressions = expressionsResult.value;
				break;
			case 'error':
				return expressionsResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitBoolLiteral(node: Node): Result<ASTBoolLiteral, AnalysisError> {
		if (node?.type === NT.BoolLiteral && node.value) {
			const ast = ASTBoolLiteral._(node.value === 'true', node.pos, this.astPointer);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(AnalysisError.Expected.BoolLiteral('Bool Expected', node, this.ctx(node)), this.ast);
	}

	visitCallExpression(node: Node): Result<ASTCallExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTCallExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the callee
			callee: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('CallExpression', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the type arguments
			typeArgs: {
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
			args: {
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
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitClassDeclaration(node: Node): Result<ASTClassDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTClassDeclaration(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;

		// before pushing to the stack, check if this class is in another class or function
		const maybeIsIn = this.isIn([ASTClassDeclaration, ASTFunctionDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the class name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		let symNodeName = `#c_anon__${_.random(100_000, false)}`;
		let symNodeFqn = `${parentFqn}${symNodeName}`;
		log.warn(`Generated temp name for class: ${symNodeName}`);

		// define the class in the parent symbol table using this name
		const classSymResult = SymbolTable.insertClass([], symNodeName, symNodeFqn, [], [], [], ast.pos);
		if (classSymResult.isError()) {
			return classSymResult;
		}

		// set the symbol
		ast.symbol = classSymResult.value;

		// create a new node with this name
		log.info(`visiting ClassDeclaration ${symNodeName}`);

		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, symNodeFqn, 'class', node.pos);

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// the joeDoc
			joedoc: this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			modifiers: this.getChildHandlerForModifiers(ast),

			// the name
			name: {
				type: NT.Identifier,
				required: true,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					if (result.isError()) {
						return result;
					}

					ast.name = result.value;
					ast.name.prependParentToFqn(parentFqn);

					// rename the symbol
					const updateResult = SymbolTable.updateName(symNodeName, ast.name.name, ast.name.fqn, 'class', this.ctx(ast), true);
					if (updateResult.isError()) {
						return updateResult;
					}

					// update node name and FQN
					symNodeName = ast.name.name;
					symNodeFqn = ast.name.fqn;

					return ok(undefined);
				},
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('ClassDeclaration', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// type parameters
			typeParams: this.getChildHandlerForTypeParams(ast, (typeParams: ASTTypeList<ASTTypeParameter>) => {
				// add the type params to the symbol table
				return SymbolTable.setClassTypeParams(symNodeName, typeParams);
			}),

			// the extends list
			extends: {
				type: NT.ExtensionsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitExtensionsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							{
								ast.extends = visitResult.value;

								// add the extends to the symbol table
								const setResults = SymbolTable.setClassExtends(symNodeName, ast.extends);
								if (setResults.isError()) {
									return setResults;
								}

								// insert 'parent' as a variable
								const parentVarResult = SymbolTable.insertVariable(
									'parent',
									`${parentFqn}parent`,
									false,
									ast.extends,
									ast.extends,
									ast.extends.pos,
								);
								if (parentVarResult.isError()) {
									return parentVarResult;
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
						ast.extends = ASTTypeList.empty(ast.pos);
					},
				},
			},

			// the implements list
			implements: {
				type: NT.ClassImplementsList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitClassImplementsList(child);
					switch (visitResult.outcome) {
						case 'ok':
							{
								ast.implements = visitResult.value;

								// add the implements to the symbol table
								const setResults = SymbolTable.setClassImplements(symNodeName, ast.implements);
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
						ast.implements = ASTTypeList.empty(ast.pos);
					},
				},
			},

			// the body
			body: this.getChildHandlerForRequiredBody(ast),
		});

		// exit the SymNode and go back to parent, whether there was an error or not
		log.success(`finish visiting ClassDeclaration ${symNodeName}`);

		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitClassImplementsList(node: Node): Result<ASTTypeList<ASTExtOrImpl>, AnalysisError | SemanticError | SymbolError> {
		return this.handleExtensionsOrImplementsList(node, NT.ClassImplement);
	}

	visitDeclarationExtendsOrImplements(node: Node): Result<ASTType, AnalysisError | SemanticError | SymbolError> {
		let identifierOrMemberExpression: ASTIdentifier | ASTMemberExpression | undefined;
		let typeArgs: ASTType[] | undefined;

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the identifier
			identifier: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('Declaration', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the type arguments
			typeArgs: {
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
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		if (typeof identifierOrMemberExpression === 'undefined') {
			return error(
				AnalysisError.Expected.Identifier(Helpers.messageStencil('Declaration', 'Type', undefined), node, this.ctx(node)),
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
				this.astPointer,
			);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		const ast = identifierOrMemberExpression;

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitDoneStatement(node: Node): Result<ASTDoneStatement, AnalysisError> {
		return ok(ASTDoneStatement._(node.pos, this.astPointer));
	}

	visitElseStatement(node: Node): Result<ASTBlockStatement | ASTIfStatement, AnalysisError | SemanticError | SymbolError> {
		return this.visitAST<ASTBlockStatement | ASTIfStatement>(node);
	}

	visitEnumDeclaration(node: Node): Result<ASTEnumDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTEnumDeclaration(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;

		// before pushing to the stack, check if this enum is in a class, function, or interface
		const maybeIsIn = this.isIn([ASTClassDeclaration, ASTFunctionDeclaration, ASTInterfaceDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the enum name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		const symNodeName = `#e_anon__${_.random(100_000, false)}`;
		const symNodeFqn = `${parentFqn}${symNodeName}`;
		log.warn(`Generated temp name for class: ${symNodeName}`);

		// define the class in the parent symbol table using this name
		const enumSymResult = SymbolTable.insertEnum(symNodeName, symNodeFqn, [], [], ast.pos);
		if (enumSymResult.isError()) {
			return enumSymResult;
		}

		// set the symbol
		ast.symbol = enumSymResult.value;

		// create a new node with this name
		log.info(`visiting EnumDeclaration ${symNodeName}`);

		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, symNodeFqn, 'enum', node.pos);

		const handlingResult = this.handleASTDeclaration(node, ast, parentFqn, NT.ExtensionsList, this.visitExtensionsList, {
			kind: 'enum',
			symNodeName,
			setTypeParamsCurry: (ast: AST & ASTDeclaration) => (typeParams: ASTTypeList<ASTTypeParameter>) => {
				// add the type params to the symbol table
				return SymbolTable.setEnumTypeParams(ast.name.name, typeParams);
			},
			setExtendsCurry: (ast: AST & ASTDeclaration) => (_extends: ASTTypeList<ASTExtOrImpl>) => {
				// add the extends to the symbol table
				return SymbolTable.setEnumExtends(ast.name.name, _extends);
			},
		});

		// exit the SymNode and go back to parent, whether there was an error or not
		log.info(`finish visiting EnumDeclaration ${symNodeName}`);

		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitExtensionsList(node: Node): Result<ASTTypeList<ASTExtOrImpl>, AnalysisError | SemanticError | SymbolError> {
		return this.handleExtensionsOrImplementsList(node, NT.Extension);
	}

	visitForStatement(node: Node): Result<ASTForStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTForStatement(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		// if the first child is a parenthesized node, then we need to unwrap it
		// and replace it with its children
		if (node.children[0].type === NT.Parenthesized) {
			node.children = [...node.children[0].children, ...node.children.slice(1)];
		}

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// the initializer variable
			initializer: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('ForStatement', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// the InKeyword
			in: {
				type: NT.InKeyword,
				required: true,
				callback: skipThisChild,
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.InKeyword(
						Helpers.messageStencil('ForStatement', '"... in ..."', child),
						child,
						this.ctx(child || node),
					),
			},

			// the iterable
			iterable: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Iterable(
						Helpers.messageStencil('ForStatement', 'an Iterable', child),
						child,
						this.ctx(child || node),
					),
			},

			// the body
			body: this.getChildHandlerForRequiredBody(ast),
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitFunctionDeclaration(node: Node): Result<ASTFunctionDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTFunctionDeclaration(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;

		// before pushing to the stack, check if this func is in a class or interface
		const maybeIsIn = this.isIn([ASTClassDeclaration, ASTInterfaceDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the function name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		let symNodeName = `#f_anon__${_.random(100_000, false)}`;
		let symNodeFqn = `${parentFqn}${symNodeName}`;
		const dedentFunc = log.indentWithInfo('visiting FunctionDeclaration', symNodeName);

		// define the function in the parent symbol table using this random name
		// It will renamed if the func has a name
		const funcSymResult = SymbolTable.insertFunction(symNodeName, symNodeFqn, [], [], [], ast.pos);
		if (funcSymResult.isError()) {
			log.warnAndDedent(dedentFunc, 'Failed to insert function into symbol table:', funcSymResult.error.message);

			return funcSymResult;
		}

		// set the symbol
		ast.symbol = funcSymResult.value;

		// create a new node with this random name. It will renamed if the func has a name
		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, symNodeFqn, 'function', node.pos);

		// handle the children
		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// the joeDoc
			joedoc: this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			modifiers: this.getChildHandlerForModifiers(ast),

			// the identifier
			name: {
				type: NT.Identifier,
				required: false,
				callback: (child) => {
					const result = this.visitIdentifier(child);
					if (result.isError()) {
						// [ ] TODO deal with assigning an anon func to a var
						// [ ] TODO deal with passing an anon func as an arg
						// [ ] TODO deal with an array of anon funcs (with postfix if), or in a tuple, or POJO

						log.warn('Failed when visiting Identifier:', result.error.message);

						return result;
					}

					ast.name = result.value;
					ast.name.prependParentToFqn(parentFqn);

					// update the symbol table
					const updateResult = SymbolTable.updateName(symNodeName, ast.name.name, ast.name.fqn, 'function', this.ctx(ast), true);
					if (updateResult.isError()) {
						log.warn('Failed to update symbol name:', updateResult.error.message);

						return updateResult;
					}

					// update node name and FQN
					symNodeName = ast.name.name;
					symNodeFqn = ast.name.fqn;

					return ok(undefined);
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						// create an ASTIdentifier with the random name
						ast.name = ASTIdentifier._(symNodeName, node.pos, this.astPointer);

						// no need to update the symbol table's node name
						// no need to rename the symbol
						// no need to update node name with parent's FQN prefixed
					},
				},
			},

			// the type parameters
			typeParams: this.getChildHandlerForTypeParams(ast, (typeParams: ASTTypeList<ASTTypeParameter>) => {
				// add the type params to the symbol table
				return SymbolTable.setFunctionTypeParams(symNodeName, typeParams);
			}),

			// the parameters
			params: {
				type: NT.ParametersList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitParametersList(child);
					if (visitResult.isError()) {
						log.warn('Failed when visiting ParametersList:', visitResult.error.message);

						return visitResult;
					}

					ast.params = visitResult.value;

					// add the parameters to the symbol table
					const setResults = SymbolTable.setFunctionParams(symNodeName, ast.params);
					if (setResults.isError()) {
						log.warn('Failed when setting function params in Symbol Table:', setResults.error.message);

						return setResults;
					}

					// add the param as a param the to func's SymTab so it's available for lookup
					const insertionResults = CreateResultFrom.arrayOfResults(
						ast.params.items.map((param) => {
							const paramSymResult = SymbolTable.insertParameter(
								param.name.name,
								`${symNodeFqn}${param.name.name}`,
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
						log.warn('Failed when inserting params into Symbol Table:', insertionResults.error.message);

						return insertionResults;
					}

					return ok(undefined);
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.params = ASTTypeList.empty(ast.pos);
					},
				},
			},

			// the return types
			returns: {
				type: NT.FunctionReturns,
				required: false,
				callback: (child) => {
					const visitResult = this.visitFunctionReturns(child);
					switch (visitResult.outcome) {
						case 'ok': {
							ast.returnTypes = visitResult.value;

							// add the return types to the symbol table
							const setResults = SymbolTable.setFunctionReturnTypes(symNodeName, ast.returnTypes, ast.pos);
							if (setResults.isError()) {
								log.warn('Failed when setting function return types in Symbol Table:', setResults.error.message);

								return setResults;
							}

							return ok(undefined);
						}
						case 'error':
							log.warn('Failed when visiting FunctionReturns:', visitResult.error.message);

							return visitResult;
					}
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.returnTypes = ASTTypeList.empty(ast.pos);
					},
				},
			},

			// the body
			body: {
				type: NT.BlockStatement,
				required: false,
				callback: (child) => {
					const visitResult = this.visitBlockStatement(child);
					switch (visitResult.outcome) {
						case 'ok':
							{
								ast.body = visitResult.value;

								return ok(undefined);
								// there could be multiple return statements based on control flow
								// const returnValuesResults = getReturnsExpressionsFromBlockStatement(ast.body, {
								// 	types: ast.returnTypes,
								// 	errors: {
								// 		ifMissing: error(
								// 			AnalysisError.Expected.ReturnStatement(
								// 				Helpers.messageStencil('Function', 'a ReturnStatement', undefined),
								// 				child,
								// 				this.ctx(child.children.at(-1) || child), // this might be on the semicolon, but :shrug:
								// 			),
								// 			this.ast as ASTReturnStatement,
								// 		),
								// 		ifHasIncorrectNumberOfExpressions: (expected: number, actual: number) => {
								// 			return error(
								// 				AnalysisError.NumberOfReturnsMismatch(
								// 					expected,
								// 					actual,
								// 					// -1 is the last, which a semicolon
								// 					// TODO fix this to find the last return
								// 					child.children.at(-2),
								// 					this.ctx(child.children.at(-2) || node),
								// 				),
								// 				this.ast as ASTReturnStatement,
								// 			);
								// 		},
								// 	},
								// });
								// if (!Results.allOk(returnValuesResults)) {
								// 	return returnValuesResults;
								// }

								// const arraysOfResults: Result<boolean, AnalysisError | SemanticError, unknown>[] = returnValuesResults.map(
								// 	(returnValuesResult) => {
								// 		const arrayOfResults = returnValuesResult.value.map((returnExpr, index) => {
								// 			const typeOfExpr = inferType(returnExpr);
								// 			if (typeOfExpr.isError()) {
								// 				log.vars({ child, returnExpr });
								// 				// return typeOfExpr;
								// 				return error(
								// 					AnalysisError.UnknownValue(
								// 						'We could not determine the type of the return expression',
								// 						child,
								// 						this.ctx(child),
								// 						typeOfExpr.error,
								// 					),
								// 				);
								// 			}

								// 			const isReturnValAssignable = isTypeAssignable(typeOfExpr.value, ast.returnTypes.items[index]);

								// 			const ret = astUniqueness(ast.returnTypes.items[index]);
								// 			return CreateResultFrom.boolean(
								// 				isReturnValAssignable,
								// 				AnalysisError.TypeMismatch(
								// 					`We cannot return a ${typeOfExpr.value} for a ${ret}`,
								// 					child,
								// 					this.ctx(child),
								// 				),
								// 			);
								// 		});

								// 		// check the types, returning an error upon mismatch
								// 		return CreateResultFrom.arrayOfResults(arrayOfResults);
								// 	},
								// );

								// // check the types, returning an error upon mismatch
								// return CreateResultFrom.arrayOfResults(arraysOfResults);
							}
							break;
						case 'error':
							log.warn('Failed when visiting BlockStatement:', visitResult.error.message);

							return visitResult;
							break;
					}
				},
			},
		});

		// exit the SymNode and go back to parent, whether there was an error or not
		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			log.warnAndDedent(dedentFunc, 'Failed when handling FunctionDeclaration', symNodeName, handlingResult.error.message);

			return handlingResult;
		}

		log.successAndDedent(dedentFunc, 'finish visiting FunctionDeclaration', symNodeName);

		this.stack.pop();

		return ok(ast);
	}

	visitFunctionReturns(node: Node): Result<ASTTypeList<ASTType>, AnalysisError | SemanticError | SymbolError> {
		let returns: ASTType[] = [];

		const conversionResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableTypes, NT.CommaSeparator],
			false, // TODO possibly change this to true?
			(child: Node | undefined) =>
				AnalysisError.Expected.Type(Helpers.messageStencil('FunctionReturns', 'a Type', child), child, this.ctx(child || node)),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				returns = conversionResult.value;
				break;
			case 'error':
				return conversionResult;
				break;
		}

		return ok(ASTTypeList.wrapArray(returns, node.pos));
	}

	visitFunctionSignature(node: Node): Result<ASTFunctionSignature, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTFunctionSignature(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the type parameters
			typeParams: this.getChildHandlerForTypeParams(ast, undefined), // TODO: set the type params in the symbol table?

			// second child: the parameters
			params: {
				type: NT.ParametersList,
				required: false,
				callback: (child) => {
					const visitResult = this.visitParametersList(child);
					if (visitResult.isError()) {
						return visitResult;
					}

					ast.params = visitResult.value;
					return ok(undefined);
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.params = ASTTypeList.empty(ast.pos);
					},
				},
			},

			// third child: the return types
			returns: {
				type: NT.FunctionReturns,
				required: false,
				callback: (child) => {
					const visitResult = this.visitFunctionReturns(child);
					if (visitResult.isError()) {
						return visitResult;
					}

					ast.returnTypes = visitResult.value;
					return ok(undefined);
				},
				options: {
					fallbackIfNotRequiredAndChildNotThere: () => {
						ast.returnTypes = ASTTypeList.empty(ast.pos);
					},
				},
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

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
				AnalysisError.Expected.Identifier('We were expecting a Type, but found nothing', node, this.ctxUnsafe(node)),
				this.ast,
			);
		}

		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Identifier,
			(value) => ok(ASTIdentifier._(value, node.pos, this.astPointer)),
			(node: Node) =>
				AnalysisError.Expected.Identifier(Helpers.messageStencil('Identifier', 'an Identifier', node), node, this.ctx(node)),
		);
	}

	visitIfStatement(node: Node): Result<ASTIfStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTIfStatement(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the test
			condition: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Expression(
						Helpers.messageStencil('IfStatement', 'an Expression', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the consequent
			consequent: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Body(Helpers.messageStencil('IfStatement', 'a Body', child), child, this.ctx(child || node)),
			},

			// third child: the alternate
			alternate: {
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
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitInterfaceDeclaration(node: Node): Result<ASTInterfaceDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTInterfaceDeclaration(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;

		// before pushing to the stack, check if this interface is in another interface
		const maybeIsIn = this.isIn([ASTInterfaceDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		// Add to symbol table and start a new SymNode.
		// The node name is either the interface name or an auto-generated name.
		// This auto-generated name could never collide with a user-defined name since it's not a valid identifier.
		let symNodeName = `#i_anon__${_.random(100_000, false)}`;
		const symNodeFqn = `${parentFqn}${symNodeName}`;
		const dedentFunc = log.indentWithInfo('visiting InterfaceDeclaration', symNodeName);

		// define the interface in the parent symbol table using this name
		const interfaceSymResult = SymbolTable.insertInterface(symNodeName, symNodeFqn, [], [], ast.pos);
		if (interfaceSymResult.isError()) {
			log.warnAndDedent(dedentFunc, 'Failed to insert interface into symbol table:', interfaceSymResult.error.message);

			return interfaceSymResult;
		}

		// set the symbol
		ast.symbol = interfaceSymResult.value;

		// create a new node with this name
		SymbolTable.tree.createNewSymNodeAndEnter(symNodeName, symNodeFqn, 'interface', node.pos);

		const handlingResult = this.handleASTDeclaration(node, ast, parentFqn, NT.ExtensionsList, this.visitExtensionsList, {
			kind: 'interface',
			symNodeName,
			setTypeParamsCurry: (ast: AST & ASTDeclaration) => (typeParams: ASTTypeList<ASTTypeParameter>) => {
				// add the type params to the symbol table
				return SymbolTable.setInterfaceTypeParams(ast.name.name, typeParams);
			},
			setExtendsCurry: (ast: AST & ASTDeclaration) => (_extends: ASTTypeList<ASTExtOrImpl>) => {
				// add the extends to the symbol table
				return SymbolTable.setInterfaceExtends(ast.name.name, _extends);
			},
		});

		// see if we have an updated name
		symNodeName = handlingResult.isOk() ? handlingResult.value : symNodeName;

		// exit the SymNode and go back to parent, whether there was an error or not
		SymbolTable.tree.exit();

		if (handlingResult.isError()) {
			log.warnAndDedent(dedentFunc, 'Failed when handling InterfaceDeclaration', symNodeName, handlingResult.error.message);

			return handlingResult;
		}

		log.successAndDedent(dedentFunc, 'finish visiting InterfaceDeclaration', symNodeName);

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
			return ok(ASTJoeDoc._(node.value, node.pos, this.astPointer));
		}

		// TODO check the contents of the JoeDoc

		// TODO TBD if this will ever actually be used / enforced
		return error(AnalysisError.Expected.JoeDoc(Helpers.messageStencil('JoeDoc', 'a JoeDoc', node), node, this.ctx(node)));
	}

	visitLoopStatement(node: Node): Result<ASTLoopStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTLoopStatement(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// TODO add the guard
			// guard: {},

			// the body
			body: this.getChildHandlerForRequiredBody(ast),
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitMemberExpression(node: Node): Result<ASTMemberExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTMemberExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !validNodeTypesAsMemberObject.includes(child.type)) {
				return error(
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('MemberExpression', 'an Identifier', child),
						child || node,
						this.ctx(child || node),
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
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('MemberExpression', 'an Identifier', child),
						child || node,
						this.ctx(child || node),
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
		const moreChildrenResult = this.ensureNoMoreChildren(nodesChildren.shift(), () =>
			AnalysisError.Expected.Semicolon(node, this.ctx(node)),
		);
		if (moreChildrenResult.isError()) {
			return moreChildrenResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitMemberList(node: Node): Result<MemberExpressionPropertyASTs[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<MemberExpressionPropertyASTs>(node, validChildrenAsMemberProperty, true, (child: Node | undefined) =>
			AnalysisError.Expected.Identifier(Helpers.messageStencil('MemberList', 'an Identifier', child), child, this.ctx(child || node)),
		);
	}

	visitMemberListExpression(node: Node): Result<ASTMemberListExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTMemberListExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || !validNodeTypesAsMemberObject.includes(child.type)) {
				return error(
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('MemberListExpression', 'an Identifier', child),
						child || node,
						this.ctx(child || node),
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
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('MemberListExpression', 'a MemberList', child),
						child || node,
						this.ctx(child || node),
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
		const moreChildrenResult = this.ensureNoMoreChildren(nodesChildren.shift(), () =>
			AnalysisError.Expected.Semicolon(node, this.ctx(node)),
		);
		if (moreChildrenResult.isError()) {
			return moreChildrenResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitModifier(node: Node): Result<ASTModifier, AnalysisError> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.Modifier,
			(value) => ok(ASTModifier._(value, node.pos, this.astPointer)),
			(node: Node) => AnalysisError.Expected.Modifier(Helpers.messageStencil('Modifier', 'a Modifier', node), node, this.ctx(node)),
		);
	}

	visitModifiersList(node: Node): Result<ASTModifier[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<ASTModifier>(node, [NT.Modifier], false, () =>
			AnalysisError.Expected.Modifier('Modifier Expected', node, this.ctx(node)),
		);
	}

	visitNextStatement(node: Node): Result<ASTNextStatement, AnalysisError> {
		return ok(ASTNextStatement._(node.pos, this.astPointer));
	}

	visitNumberLiteral(node: Node): Result<ASTNumberLiteral, AnalysisError> {
		return this.handleNodeThatHasValueAndNoChildren(
			node,
			NT.NumberLiteral,
			(value) =>
				ASTNumberLiteral.convertNumberValueTo(value, node.pos, this.astPointer, (value: string) => {
					return AnalysisError.InvalidNumberFound(`Invalid int: ${value}`, node, this.ctx(node));
				}),
			(node: Node) =>
				AnalysisError.Expected.NumberLiteral(Helpers.messageStencil('NumberLiteral', 'a Number', node), node, this.ctx(node)),
		);
	}

	visitObjectExpression(node: Node): Result<ASTObjectExpression, AnalysisError | SemanticError | SymbolError> {
		const conversionResult = this.visitChildren<ASTProperty>(
			node,
			[NT.Property, NT.CommaSeparator],
			false, // there can be no properties in an empty object, and they get added later
			(child: Node | undefined) =>
				AnalysisError.Expected.Property(
					Helpers.messageStencil('ObjectExpression', 'a Property', child),
					child,
					this.ctx(child || node),
				),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				{
					const ast = ASTObjectExpression._(conversionResult.value, node.pos, this.astPointer);

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
			(child: Node | undefined) =>
				AnalysisError.Expected.Property(Helpers.messageStencil('ObjectShape', 'a Property', child), child, this.ctx(child || node)),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				{
					const ast = ASTObjectShape._(conversionResult.value, node.pos, this.astPointer);

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

		const ast = new ASTParameter(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;

		// before pushing to the stack, get the func that this is in
		const maybeIsIn = this.isIn([ASTFunctionDeclaration]);
		const parentFqn = maybeIsIn.has()
			? when(maybeIsIn.value.constructor.name, {
					[ASTFunctionDeclaration.name]: () =>
						typeof (maybeIsIn.value as ASTFunctionDeclaration).name.fqn !== 'undefined'
							? `${(maybeIsIn.value as ASTFunctionDeclaration).name.fqn}.`
							: '',
					'...': () => '',
			  })
			: '';

		// now add to stack
		this.stack.push(ast); // push pointer to this AST Node

		const handleResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// TODO add support for modifiers
			// first child: modifiers
			// this.getChildHandlerForModifiers(ast),

			// first child: isRest
			rest: {
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
			name: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('Parameter', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// third child: a colon
			colon: {
				type: NT.ColonSeparator,
				required: false,

				// do nothing, just skip it
				callback: skipThisChild,
			},

			// third child: type (required if there was a colon separator)
			type: {
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
									AnalysisError.Expected.Type(
										Helpers.messageStencil('Parameter', 'a Type', child),
										child,
										this.ctx(child),
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Type(Helpers.messageStencil('Parameter', 'a Type', child), child, this.ctx(child || node)),
			},

			// next could be an initial value assignment, or nothing
			equals: {
				type: NT.AssignmentOperator,
				required: false,

				// do nothing, we just want to skip over the assignment operator
				callback: skipThisChild,
			},

			// fourth child: default value
			defaultValue: {
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
								const assignmentResult = Helpers.assignInferredType(
									ast.defaultValue,
									child,
									(type: ASTType) => {
										ast.type = type;
									},
									this.ctx(child),
								);
								if (assignmentResult.isError()) {
									return assignmentResult;
								}
							} else {
								const isValAssignable = Helpers.isAssignable(
									ast.defaultValue,
									ast.type,
									ast.defaultValue,
									this.ctx(ast.defaultValue),
								);
								if (isValAssignable.isError()) {
									return error(
										AnalysisError.TypeMismatch(
											`[Compiler] The default value for this parameter is not assignable to a ${ast.type}`,
											child,
											this.ctx(child),
											isValAssignable.error,
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Assignable(
						Helpers.messageStencil('Parameter', 'a value', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handleResult.isError()) {
			return handleResult;
		}

		// now perform some additional checks

		// if the identifier ends with a '?', check that either the declared type is bool
		// or that the inferred type is bool
		if (ast.name.name.at(-1) === '?' && !_.isEqual(ast.type, ASTTypePrimitiveBool)) {
			return error(
				AnalysisError.Expected.BoolType(
					`bool type expected since the parameter name "${ast.name.name}" ends with a "?"`,
					node,
					this.ctx(node),
				),
				this.ast,
			);
		}

		this.stack.pop();

		return ok(ast);
	}

	visitParametersList(node: Node): Result<ASTTypeList<ASTParameter>, AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<ASTParameter>(node, [NT.Parameter, NT.CommaSeparator], false, () =>
			AnalysisError.Expected.Parameter('Parameter Expected', node, this.ctx(node)),
		).mapValue((params) => ASTTypeList.wrapArray(params, node.pos));
	}

	visitParenthesized(node: Node): Result<AssignableASTs, AnalysisError | SemanticError | SymbolError> {
		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: the assignable
		const child = nodesChildren.shift();
		if (!child?.type || !AssignableNodeTypes.includes(child.type)) {
			return error(AnalysisError.Expected.Assignable('Assignable Expected', child || node, this.ctx(child || node)), this.ast);
		}

		// this is a pass-through node, aka return the child, since we don't retain parentheses
		return this.visitAST<AssignableASTs>(child);
	}

	visitPath(node: Node): Result<ASTPath, AnalysisError> {
		if (node?.type === NT.Path && node.value) {
			const ast = new ASTPath(node.pos, this.astPointer);
			this.astPointer = this.ast = ast;

			// first, determine if the path is relative or absolute
			ast.absolute = node.value.startsWith('@');

			// next, split the path into its parts
			ast.path = node.value;

			// finally, check if there's a trailing slash
			ast.isDir = ast.path.endsWith('/');

			return ok(ast);
		}

		return error(AnalysisError.Expected.ValidPath('Valid Path Expected', node, this.ctx(node)), this.ast);
	}

	visitPostfixIfStatement(node: Node): Result<ASTPostfixIfStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTPostfixIfStatement(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the expression
			expression: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Body(
						Helpers.messageStencil('PostfixIfStatement', 'an Expression', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the test
			condition: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Expression(
						Helpers.messageStencil('PostfixIfStatement', 'a Condition', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitPrintStatement(node: Node): Result<ASTPrintStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTPrintStatement(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		// first, get the expression to print
		const expressionsResult = this.visitChildren<ExpressionASTs>(
			node,
			[...ExpressionNodeTypes, NT.CommaSeparator],
			true, // you have to print something
			(parentNode: Node) => AnalysisError.Expected.Expression('Expression Expected', parentNode, this.ctx(parentNode)),
		);
		switch (expressionsResult.outcome) {
			case 'ok':
				ast.expressions = expressionsResult.value;
				break;
			case 'error':
				return expressionsResult;
				break;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitProperty(node: Node): Result<ASTProperty, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTProperty(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the property name
			key: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('Property', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the property value
			value: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Value(Helpers.messageStencil('Property', 'a value', child), child, this.ctx(child || node)),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitPropertyShape(node: Node): Result<ASTPropertyShape, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTPropertyShape(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the property name
			key: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('PropertyShape', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the property type
			type: {
				type: [...AssignableTypes, NT.CommaSeparator],
				required: true,
				callback: (child) => {
					const visitResult = this.visitAST<ASTType>(child);
					switch (visitResult.outcome) {
						case 'ok':
							ast.type = visitResult.value;
							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Value(Helpers.messageStencil('PropertyShape', 'a Type', child), child, this.ctx(child || node)),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitRangeExpression(node: Node): Result<ASTRangeExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTRangeExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first child: the lower bound (required)
		const lowerBound = nodesChildren.shift();
		const validChildren = [
			NT.CallExpression,
			NT.Identifier,
			NT.MemberExpression,
			NT.NumberLiteral,
			NT.Parenthesized,
			NT.UnaryExpression,
		];
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
				AnalysisError.Expected.RangeBound(
					`We were expecting a lower range bound, but instead found a ${lowerBound?.type}`,
					lowerBound,
					this.ctx(node),
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
				AnalysisError.Expected.RangeBound(
					`We were expecting an upper range bound, but instead found a ${upperBound?.type}`,
					upperBound,
					this.ctx(node),
				),
				this.ast,
			);
		}

		this.stack.pop();

		return ok(ast);
	}

	visitRegularExpression(node: Node): Result<ASTRegularExpression, AnalysisError> {
		if (node?.type === NT.RegularExpression && node.value) {
			const ast = new ASTRegularExpression(node.pos, this.astPointer);
			this.astPointer = this.ast = ast;

			// separate pattern and flags
			const lastSlashStringIndex = node.value?.lastIndexOf('/');

			// first grammatical requirement: pattern (required)
			{
				const pattern = node.value.slice(0, lastSlashStringIndex + 1);

				// check if pattern is valid
				try {
					new RegExp(pattern);
				} catch (e) {
					return error(AnalysisError.InvalidRegularExpression('Invalid regular expression pattern', node, this.ctx(node)));
				}

				ast.pattern = pattern;
			}

			// second grammatical requirement: flags (optional)
			{
				const flags = node.value.slice(lastSlashStringIndex + 1).split('');

				// check for unidentified flags. this probably isn't necessary since the lexer does this, but it's a double check
				const unidentifiedFlags = flags.filter((f) => !regexFlags.includes(f));
				if (unidentifiedFlags.length > 0) {
					return error(AnalysisError.InvalidRegularExpression('Invalid regular expression flags', node, this.ctx(node)));
				}

				ast.flags = flags;
			}

			return ok(ast);
		}

		return error(AnalysisError.Expected.Expression('Regular Expression expected', node, this.ctx(node)), this.ast);
	}

	visitRestElement(node: Node): Result<ASTRestElement, AnalysisError> {
		if (node?.type === NT.RestElement) {
			const ast = new ASTRestElement(node.pos, this.astPointer);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			AnalysisError.Expected.RestElement(
				`We were expecting to find a rest element "...", but instead found a ${node.type}`,
				node,
				this.ctx(node),
			),
			this.ast,
		);
	}

	visitReturnStatement(node: Node): Result<ASTReturnStatement, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTReturnStatement(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const conversionResult = this.visitChildren<ExpressionASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			false, // it is valid to have an empty return statement
			(child: Node | undefined) =>
				AnalysisError.Expected.Assignable(
					Helpers.messageStencil('ReturnStatement', 'an Expression', child),
					child,
					this.ctx(child || node),
				),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				ast.expressions = conversionResult.value;
				break;
			case 'error':
				return conversionResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitStringLiteral(node: Node): Result<ASTStringLiteral, AnalysisError> {
		// check if the value is undefined, since empty strings are valid
		if (node?.type === NT.StringLiteral && typeof node.value !== 'undefined') {
			const ast = new ASTStringLiteral(node.pos, this.astPointer);
			this.astPointer = this.ast = ast;

			ast.value = node.value;

			return ok(ast);
		}

		return error(AnalysisError.Expected.StringLiteral(node, this.ctx(node)), this.ast);
	}

	visitTernaryAlternate(node: Node): Result<ASTTernaryAlternate<AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		if (node?.type === NT.TernaryAlternate) {
			const visitResult = this.visitAST<AssignableASTs>(node.children[0]);
			if (visitResult.isError()) {
				return visitResult;
			}

			const ast = new ASTTernaryAlternate<AssignableASTs>(node.pos, this.astPointer);
			this.astPointer = this.ast = ast;

			ast.value = visitResult.value;

			return ok(ast);
		}

		return error(AnalysisError.Expected.TernaryAlternate('Ternary Alternate Expected', node, this.ctx(node)), this.ast);
	}

	visitTernaryCondition(node: Node): Result<ASTTernaryCondition, AnalysisError | SemanticError | SymbolError> {
		if (node?.type === NT.TernaryCondition) {
			const visitResult = this.visitAST<AssignableASTs>(node.children[0]);
			if (visitResult.isError()) {
				return visitResult;
			}

			const ast = new ASTTernaryCondition(node.pos, this.astPointer);
			this.astPointer = this.ast = ast;

			ast.expression = visitResult.value;

			return ok(ast);
		}

		return error(AnalysisError.Expected.TernaryCondition('Ternary Condition Expected', node, this.ctx(node)), this.ast);
	}

	visitTernaryConsequent(node: Node): Result<ASTTernaryConsequent<AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		if (node?.type === NT.TernaryConsequent) {
			const visitResult = this.visitAST<AssignableASTs>(node.children[0]);
			if (visitResult.isError()) {
				return visitResult;
			}

			const ast = new ASTTernaryConsequent<AssignableASTs>(node.pos, this.astPointer);
			this.astPointer = this.ast = ast;

			ast.value = visitResult.value;

			return ok(ast);
		}

		return error(AnalysisError.Expected.TernaryConsequent('Ternary Consequent Expected', node, this.ctx(node)), this.ast);
	}

	visitTernaryExpression(
		node: Node,
	): Result<ASTTernaryExpression<AssignableASTs, AssignableASTs>, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTernaryExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the test
			condition: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.TernaryCondition(
						Helpers.messageStencil('TernaryExpression', 'a Condition', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the consequent
			consqeuent: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.TernaryConsequent(
						Helpers.messageStencil('TernaryExpression', 'an Expression for the "then" clause', child),
						child,
						this.ctx(child || node),
					),
			},

			// third child: the alternate
			alternate: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.TernaryAlternate(
						Helpers.messageStencil('TernaryExpression', 'an Expression for the "else" clause', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitThisKeyword(node: Node): Result<ASTThisKeyword, AnalysisError> {
		if (node?.type === NT.ThisKeyword) {
			const ast = new ASTThisKeyword(node.pos, this.astPointer);

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(
			AnalysisError.Expected.ThisKeyword(
				`We were expecting to find a "this" keyword, but instead found a ${node.type}`,
				node,
				this.ctx(node),
			),
			this.ast,
		);
	}

	visitTupleExpression(node: Node): Result<ASTTupleExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTupleExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.visitChildren<AssignableASTs>(
			node,
			[...AssignableNodeTypes, NT.CommaSeparator],
			false, // TODO do we allow empty tuples? Tuples are immutable...
			(child) =>
				AnalysisError.Expected.Assignable(Helpers.messageStencil('TupleExpression', 'a value', child), child, this.ctx(child)),
		);
		switch (handlingResult.outcome) {
			case 'ok':
				ast.items = handlingResult.value;
				break;
			case 'error':
				return handlingResult;
				break;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitTupleShape(node: Node): Result<ASTTupleShape, AnalysisError | SemanticError | SymbolError> {
		if (node.children.length < 1) {
			return error(
				AnalysisError.Expected.Type('We were expecting at least one type, but found none', node, this.ctx(node)),
				this.ast,
			);
		}

		const children: Array<Exclude<ASTType, SkipAST>> = [];

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

						children.push(visitResult.value as Exclude<ASTType, SkipAST>);
						break;
					case 'error':
						return visitResult;
						break;
				}
			} else {
				return error(
					AnalysisError.Expected.Type(Helpers.messageStencil('TupleShape', 'a Type', child), child, this.ctx(child)),
					this.ast,
				);
			}
		}

		const ast = ASTTupleShape._(children, node.pos, this.astPointer);

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
		const errorResult = error(AnalysisError.Expected.Type(`Type Expected, received "${node?.type}"`, node, this.ctxUnsafe(node)));

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
					const ast = ASTTypeNumber._(node.value as NumberSize, node.pos, this.astPointer);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				// check if it's a primitive type
				if (primitiveTypes.includes(node.value as primitiveAstType)) {
					const ast = ASTTypePrimitive._(node.value as primitiveAstType, node.pos, this.astPointer);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				// check if it's a range
				if (node.value === 'range') {
					const ast = ASTTypeRange._(node.pos, this.astPointer);

					this.astPointer = this.ast = ast;

					return ok(ast);
				}

				return errorResult;
				break;

			// or if it's a CommaSeparator
			case NT.CommaSeparator:
				return ok(new SkipAST(node.pos, this.astPointer));
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
				return error(AnalysisError.Expected.Type(`Type Expected, received "${child.type}"`, child, this.ctx(child)));
			}
		}

		return ok(typeArgs);
	}

	visitTypeInstantiationExpression(node: Node): Result<ASTTypeInstantiationExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTypeInstantiationExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		// first grammatical requirement: the type
		const handleResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// the base type
			baseType: {
				type: [NT.Identifier, NT.MemberExpression],
				required: true,
				callback: (child: Node) => {
					const typeResult = this.visitAST<ASTIdentifier | ASTMemberExpression>(child);
					switch (typeResult.outcome) {
						case 'ok':
							if (typeResult.value instanceof SkipAST) {
								return error(
									AnalysisError.Expected.Type(
										`We were expecting to find a Type, but instead found a ${child.type}`,
										child,
										this.ctx(child),
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Type(
						Helpers.messageStencil('TypeInstantiationExpression', 'a base Type', child),
						child,
						this.ctx(child || node),
					),
			},

			// the type arguments
			typeArgs: {
				type: NT.TypeArgumentsList,
				required: true,
				callback: (child: Node) => {
					const conversionResult = this.visitChildren<ASTType>(
						child,
						validChildrenInTypeArgumentList,
						true, // once you're in a list, arguments are required
						(child: Node | undefined) =>
							AnalysisError.ExtraNodesFound(
								`${child ? `A "${child.type}"` : 'This'} is not allowed directly in a ${node.type}`,
								child,
								this.ctx(node),
							),
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Type(
						Helpers.messageStencil('TypeInstantiationExpression', 'a Type', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handleResult.isError()) {
			return handleResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitTypeParameter(node: Node): Result<ASTType | SkipAST, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTTypeParameter(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handleResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// the type
			type: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Type(Helpers.messageStencil('TypeParameter', 'a Type', child), child, this.ctx(child || node)),
			},

			// the colon (optional)
			colon: {
				type: NT.ColonSeparator,
				required: false,

				// do nothing, we just want to skip over the colon separator
				callback: skipThisChild,
			},

			// the constraint type (required if there was a colon separator)
			constraint: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Type(
						Helpers.messageStencil('TypeParameter', 'a Type constraint', child),
						child,
						this.ctx(child || node),
					),
			},

			// next could be a default type, or nothing
			equals: {
				type: NT.AssignmentOperator,
				required: false,

				// do nothing, we just want to skip over the assignment operator
				callback: skipThisChild,
			},

			// next child must be a type if there was an assignment operator
			// or nothing if there was no assignment operator
			defaultType: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Assignable(
						Helpers.messageStencil('TypeParameter', 'a default Type', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handleResult.isError()) {
			return handleResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitTypeParametersList(node: Node): Result<ASTTypeList<ASTTypeParameter>, AnalysisError | SemanticError | SymbolError> {
		let typeParams: ASTTypeList<ASTTypeParameter>;

		const conversionResult = this.visitChildren<ASTTypeParameter>(
			node,
			[NT.CommaSeparator, NT.TypeParameter],
			true, // cannot have empty <||>
			(child: Node | undefined) =>
				AnalysisError.Expected.Type(Helpers.messageStencil('TypeParametersList', 'a Type', child), child, this.ctx(child || node)),
		);
		switch (conversionResult.outcome) {
			case 'ok':
				typeParams = ASTTypeList.wrapArray(conversionResult.value, node.pos);
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
		const ast = new ASTUnaryExpression<ExpressionASTs>(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const nodesChildren = [...node.children]; // make a copy to avoid mutating the original node

		// first grammatical requirement: is the operator before or after the operand
		ast.before = node.before;

		// second grammatical requirement: the operator
		if (!node.value) {
			return error(AnalysisError.Expected.Operator('Operator Expected', node, this.ctx(node)), this.ast);
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
						// then the number's size can not be unsigned
						if (ast.operator === '-' && ast.operand instanceof ASTNumberLiteral && ast.operand.size.startsWith('u')) {
							return error(
								SemanticError.CannotNegateUnsignedNumber(ast.operand.size, ast.operand, this.ctx(ast.operand)),
								this.ast,
							);
						}
						break;
					case 'error':
						return visitResult;
						break;
				}
			} else {
				return error(AnalysisError.Expected.Expression('Expression Expected', child || node, this.ctx(child || node)), this.ast);
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(AnalysisError.Expected.Semicolon(child, this.ctx(child)), this.ast);
		}

		this.stack.pop();

		return ok(ast);
	}

	visitUseDeclaration(node: Node): Result<ASTUseDeclaration, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTUseDeclaration(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the identifier
			identifier: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('UseDeclaration', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the "from" keyword
			from: {
				type: NT.FromKeyword,
				required: false,
				callback: skipThisChild,
			},

			// third child: the path
			path: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Path(Helpers.messageStencil('UseDeclaration', 'a Path', child), child, this.ctx(child || node)),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

		this.stack.pop();

		return ok(ast);
	}

	visitVariableDeclaration(node: Node): Result<ASTVariableDeclaration, AnalysisError | SemanticError | SymbolError> {
		// there is significant overlap with the visitParameter() function

		const ast = new ASTVariableDeclaration(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;

		// before pushing to the stack, check if this variable is in a class, enum, function, or interface
		const maybeIsIn = this.isIn([ASTClassDeclaration, ASTEnumDeclaration, ASTFunctionDeclaration, ASTInterfaceDeclaration]);
		const parentFqn = maybeIsIn.has() && typeof maybeIsIn.value.name !== 'undefined' ? `${maybeIsIn.value.name.fqn}.` : '';

		this.stack.push(ast); // push pointer to this AST Node

		// first grammatical requirement: mutability keyword (from the value)
		if (node.value && ['const', 'let'].includes(node.value)) {
			ast.mutable = node.value === 'let';
		} else {
			return error(AnalysisError.Expected.Keyword('Expecting keyword "const" or "let"', node, this.ctx(node)), this.ast);
		}

		// handle the child nodes of different types
		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// the joeDoc
			joedoc: this.getChildHandlerForJoeDoc(ast),

			// the modifiers
			modifiers: this.getChildHandlerForModifiers(ast),

			// the AssigneesList - names (required)
			names: {
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
									ast.declaredTypes[index] = ASTTypePrimitiveBool(child.pos, this.astPointer);
								}
							});

							return ok(undefined);
							break;
						case 'error':
							return visitResult;
							break;
					}
				},
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Identifier(
						Helpers.messageStencil('VariableDeclaration', 'an Identifier', child),
						child,
						this.ctx(child || node),
					),
			},

			// the colon (optional)
			colon: {
				type: NT.ColonSeparator,
				required: false,

				// do nothing, we just want to skip over the colon separator
				callback: skipThisChild,
			},

			// the types (required if there was a colon separator)
			types: {
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
									AnalysisError.Expected.Type(
										Helpers.messageStencil('VariableDeclaration', 'a Type', child),
										child,
										this.ctx(child),
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Type(
						Helpers.messageStencil('VariableDeclaration', 'a Type', child),
						child,
						this.ctx(child || node),
					),
			},

			// next could be an initial value assignment, or nothing
			equals: {
				type: NT.AssignmentOperator,
				required: false,

				// do nothing, we just want to skip over the assignment operator
				callback: skipThisChild,
			},

			// next child must be an expression if there was an assignment operator
			// or nothing if there was no assignment operator
			initialValues: {
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
						// infer type of the initial value and assign it thereto
						const assignmentResult = Helpers.assignInferredType(
							initialValue,
							child,
							(type: ASTType) => {
								ast.inferredTypes[index] = type;
							},
							this.ctx(ast.initialValues[index]),
						);
						if (assignmentResult.isError()) {
							return assignmentResult;
						}

						// put inferred type into a variable
						const inferredType = ast.inferredTypes[index];

						// if there is a declared type, then the inferred type must be assignable to it
						if (typeof ast.declaredTypes[index] !== 'undefined') {
							const isValAssignable = Helpers.isAssignable(
								ast.initialValues[index],
								ast.declaredTypes[index],
								ast.initialValues[index],
								this.ctx(ast.initialValues[index]),
							);
							if (isValAssignable.isError()) {
								const uniqueTypeName = astUniqueness(ast.declaredTypes[index]);
								const message = `A ${astUniqueness(inferredType)} value cannot be assigned to a ${uniqueTypeName} variable`;

								return error(AnalysisError.TypeMismatch(message, child, this.ctx(child), isValAssignable.error));
							}
						} else {
							// In this case, there is no declared type, so we set the declared type to the inferred type.
							ast.declaredTypes[index] = inferredType;
						}

						return ok(undefined);
					});

					return CreateResultFrom.arrayOfResults<undefined, AnalysisError | SemanticError>(areAssignable);
				},
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.Assignable(
						Helpers.messageStencil('VariableDeclaration', 'an initial value', child),
						child,
						this.ctx(child || node),
					),
			},
		});
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
							AnalysisError.Expected.BoolType(
								`bool type expected since the variable name "${identifier.name}" ends with a "?"`,
								node,
								this.ctx(node),
							),
							this.ast,
						);
					} else if (
						typeof ast.inferredTypes[index] !== 'undefined' &&
						!_.isEqual(ast.inferredTypes[index], ASTTypePrimitiveBool)
					) {
						return error(
							AnalysisError.Expected.BoolType(
								`bool type expected since the variable name "${identifier.name}" ends with a "?"`,
								node,
								this.ctx(node),
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
					`${parentFqn}${identifier.name}`,
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

		this.stack.pop();

		return ok(ast);
	}

	visitWhenCase(node: Node): Result<ASTWhenCase, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTWhenCase(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
		this.stack.push(ast); // push pointer to this AST Node

		const handlingResult = this.handleNodesChildrenOfDifferentTypes(node, {
			// first child: the values (required)
			values: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.WhenCaseValue(
						Helpers.messageStencil('WhenCase', 'a value', child),
						child,
						this.ctx(child || node),
					),
			},

			// second child: the consequent (required)
			consequent: {
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
				analysisError: (child: Node | undefined) =>
					AnalysisError.Expected.WhenCaseConsequent(
						Helpers.messageStencil('WhenCase', 'a consequent', child),
						child,
						this.ctx(child || node),
					),
			},
		});
		if (handlingResult.isError()) {
			return handlingResult;
		}

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
			AnalysisError.Expected.Expression(Helpers.messageStencil('WhenCaseConsequent', 'an Expression', child), node, this.ctx(node)),
			this.ast,
		);
	}

	visitWhenCaseValues(node: Node): Result<WhenCaseValueASTs[], AnalysisError | SemanticError | SymbolError> {
		return this.visitChildren<WhenCaseValueASTs>(
			node,
			validChildrenInWhenCaseValues,
			true, // must have at least one value
			(child: Node | undefined) =>
				AnalysisError.Expected.WhenCaseValue(
					Helpers.messageStencil('WhenCaseValues', 'a value', child),
					child,
					this.ctx(child || node),
				),
		);
	}

	visitWhenExpression(node: Node): Result<ASTWhenExpression, AnalysisError | SemanticError | SymbolError> {
		const ast = new ASTWhenExpression(node.pos, this.astPointer);
		this.astPointer = this.ast = ast;
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
					AnalysisError.Expected.Expression(
						Helpers.messageStencil('WhenExpression', 'an Expression', child),
						child,
						this.ctx(child || node),
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
					(child) =>
						AnalysisError.Expected.WhenCase(
							Helpers.messageStencil('WhenExpression', 'a WhenCase', child),
							child,
							this.ctx(child),
						),
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
					AnalysisError.Expected.BlockStatement(
						Helpers.messageStencil('WhenExpression', 'a BlockStatement with WhenCases', child),
						child || node,
						this.ctx(child || node),
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
					AnalysisError.Expected.Comma(Helpers.messageStencil('WhenExpression', 'a Comma', child), child, this.ctx(child)),
					this.ast,
				);
			}
		}

		this.stack.pop();

		return ok(ast);
	}
}
