import Context from '../shared/context';
import loggers from '../shared/log';
import { maybeIfNotUndefined } from '../shared/maybe';
import { CreateResultFrom, Result, error, ok } from '../shared/result';
import {
	AST,
	ASTArgumentsList,
	ASTArrayExpression,
	ASTCallExpression,
	ASTClassDeclaration,
	ASTEnumDeclaration,
	ASTExtOrImpl,
	ASTFunctionDeclaration,
	ASTIdentifier,
	ASTInterfaceDeclaration,
	ASTMemberExpression,
	ASTNumberLiteral,
	ASTObjectExpression,
	ASTParameter,
	ASTPrintStatement,
	ASTProgram,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTThisKeyword,
	ASTTupleExpression,
	ASTType,
	ASTTypeInstantiationExpression,
	ASTTypeList,
	ASTTypeParameter,
	ASTTypePrimitiveString,
	ASTVariableDeclaration,
	AssignableASTs,
	MemberExpressionObjectASTs,
	isASTExtOrImplInstanceOf,
} from './asts';
import Helpers from './helpers';
import SemanticError from './semanticError';
import SymbolError from './symbolError';
import {
	ClassSym,
	EnumSym,
	ExtendableSymbol,
	FuncSym,
	InterfaceSym,
	ParamSym,
	SymNode,
	SymbolInfo,
	SymbolKind,
	SymbolTable,
	VarSym,
	kindToSymMap,
	symbolKinds,
} from './symbolTable';

const log = loggers.semantics;

type SemanticsOptions = {
	isASnippet: boolean;
};

export default class Semantics {
	private ast: ASTProgram;
	private loc: string[];
	private options: SemanticsOptions;

	constructor(ast: ASTProgram, loc: string[], options: SemanticsOptions) {
		this.ast = ast;
		this.loc = loc;
		this.options = options;
	}

	public checkForErrors(): Result<unknown, SemanticError | SymbolError> {
		const dedentFunc = log.indentWithInfo('begin ...');

		// check for `main()`
		if (!this.options.isASnippet) {
			const result = this.mainFileMustHaveMainFunction(this.ast);
			if (result.isError()) {
				log.warnAndDedent(dedentFunc, result.error.message);

				return result;
			}
		}

		// kick off semantic analysis
		for (const decl of this.ast.declarations) {
			const result = this.checkASTNode(decl);
			if (result.isError()) {
				log.warnAndDedent(dedentFunc, result.error.message);

				return result;
			}
		}

		log.successAndDedent(dedentFunc, 'completed');

		return ok(undefined);
	}

	private checkASTNode(ast: AST): Result<unknown, SemanticError | SymbolError> {
		switch (ast.constructor) {
			case ASTArrayExpression:
				// if it's not empty, we can get the type from the first element
				if ((ast as ASTArrayExpression<AssignableASTs>).items.length > 0) {
					return this.checkArrayExpressionAndGetType(ast as ASTArrayExpression<AssignableASTs>);
				}
				break;
			case ASTCallExpression:
				return this.checkCallExpressionAndGetTypes(ast as ASTCallExpression);
			case ASTClassDeclaration:
				return this.checkClassDeclaration(ast as ASTClassDeclaration);
			case ASTFunctionDeclaration:
				return this.checkFunctionDeclaration(ast as ASTFunctionDeclaration);
			case ASTInterfaceDeclaration:
				return this.checkInterfaceDeclaration(ast as ASTInterfaceDeclaration);
			case ASTNumberLiteral:
			case ASTStringLiteral:
				return ok(undefined);
			case ASTPrintStatement:
				return this.checkPrintStatement(ast as ASTPrintStatement);
			// [ASTReturnStatement]: // this is handled in checkFunctionDeclaration() since it's a special case
			case ASTVariableDeclaration:
				return this.checkVariableDeclaration(ast as ASTVariableDeclaration);
		}

		// TODO this should go away once we've handled all AST types
		return error(SemanticError.TODOThisIsTemp(`Semantics.checkASTNode(${ast.constructor.name}) is unhandled`, ast, this.ctx(ast)));
	}

	private getSymTypeParams(value: SymbolInfo): ASTTypeList<ASTTypeParameter> {
		const mapType: {
			[key in keyof kindToSymMap]: (value: kindToSymMap[key]) => ASTTypeList<ASTTypeParameter>;
		} = {
			class: (value: ClassSym): ASTTypeList<ASTTypeParameter> => value.typeParams,
			enum: (value: EnumSym): ASTTypeList<ASTTypeParameter> => value.typeParams,
			function: (value: FuncSym): ASTTypeList<ASTTypeParameter> => value.typeParams,
			interface: (value: InterfaceSym): ASTTypeList<ASTTypeParameter> => value.typeParams,
			parameter: (value: ParamSym): ASTTypeList<ASTTypeParameter> => ASTTypeList.empty(value.pos), // TODO
			variable: (value: VarSym): ASTTypeList<ASTTypeParameter> => ASTTypeList.empty(value.pos), // TODO
		};

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return mapType[value.kind](value);
	}

	/**
	 * Checks an array expression and returns the type of the values.
	 *
	 * @param ast
	 * @returns The return type of the array
	 */
	private checkArrayExpressionAndGetType(ast: ASTArrayExpression<AssignableASTs>): Result<ASTType, SemanticError | SymbolError> {
		// if there's at least one item, use that to infer the type
		if (ast.items.length > 0) {
			const result = this.checkASTNode(ast.items[0]);
			if (result.isError()) {
				return result;
			}

			return Helpers.inferType(ast.items[0], this.ctx(ast.items[0]));
		}

		/**
		 * otherwise, check the context. Traversing up the tree, check for a number of possiblities:
		 * 1. In a Variable declaration - get type from declaration
		 * 2. Passed as an argument - get type from param
		 * 3. In an array, object, tuple - get type from shape
		 */

		const parent = ast.parent;
		if (typeof parent === 'undefined') {
			// if the parent is undefined and there are no items in the array, we cannot determine the type
			return error(SemanticError.CouldNotInferType('array', ast, this.ctx(ast)));
		}

		switch (parent.constructor) {
			case ASTVariableDeclaration: {
				const varDecl = parent as ASTVariableDeclaration;

				// get the index of this array in the (potentially) multi-valued declaration
				const index = varDecl.initialValues.findIndex((initialValue) => initialValue === ast);

				// get the declared type
				// TODO handle ASTCallExpressions that have multiple return types
				const type = varDecl.declaredTypes[index];

				return ok(type);
			}
			case ASTArgumentsList: {
				// get the callExpression
				// const callExpr = parent as ASTCallExpression;

				// TODO do similar work as in checkCallExpressionAndGetTypes()

				return error(
					SemanticError.TODOThisIsTemp(
						'semantics.checkArrayExpressionAndGetType() for an ASTArgumentsList',
						ast,
						this.ctx(parent),
					),
				);
			}
			case ASTArrayExpression: {
				// get the parent's array's type since the "type" in the array is the type of all children
				// this potentially can go up the chain and/or lead to other cases in this switch
				return this.checkArrayExpressionAndGetType(parent as ASTArrayExpression<AssignableASTs>);
			}
			case ASTObjectExpression: {
				return error(
					SemanticError.TODOThisIsTemp(
						'semantics.checkArrayExpressionAndGetType() for an ASTObjectExpression',
						ast,
						this.ctx(parent),
					),
				);
			}
			case ASTTupleExpression: {
				return error(
					SemanticError.TODOThisIsTemp(
						'semantics.checkArrayExpressionAndGetType() for an ASTTupleExpression',
						ast,
						this.ctx(parent),
					),
				);
			}
		}

		return error(
			SemanticError.TODOThisIsTemp(
				`semantics.checkArrayExpressionAndGetType() for an ${parent.constructor.name}`,
				ast,
				this.ctx(parent),
			),
		);
	}

	/**
	 * Checks a call expression and returns the return types of the function.
	 *
	 * @param ast
	 * @returns The return types of the function
	 */
	private checkCallExpressionAndGetTypes(ast: ASTCallExpression): Result<ASTTypeList<ASTType>, SemanticError | SymbolError> {
		let sym: FuncSym;
		let calleeTypeParams: ASTTypeList<ASTTypeParameter> = ASTTypeList.empty(ast.pos);

		if (ast.callee.constructor === ASTIdentifier) {
			const funcSymResult = this.getSymbolForIdentifier(ast.callee, ['function']);
			if (funcSymResult.isError()) {
				return error(SemanticError.NotFound('function', (ast.callee as ASTIdentifier).name, ast, this.ctx(ast.callee)));
			}

			// TODO: call a var that's assigned a func. `const foo = f {}; foo();`
			sym = funcSymResult.value;
			calleeTypeParams = funcSymResult
				.mapValue<ASTTypeList<ASTTypeParameter>>((value: SymbolInfo) => this.getSymTypeParams(value))
				.unwrapOr<ASTTypeList<ASTTypeParameter>>(ASTTypeList.empty(ast.pos));

			return ok(sym.returnTypes);
		} else if (ast.callee.constructor === ASTCallExpression) {
			// TODO check: f foo -> f {return f {};}
			return error(
				SemanticError.Impossible('A call expression cannot have a call expression as its callee', ast, this.ctx(ast.callee)),
			);
		} else if (ast.callee.constructor === ASTMemberExpression) {
			const result = this.checkMemberExpressionAndGetType(ast.callee);
			if (result.isError()) {
				return result;
			}

			const [, symbolInfo] = result.value;

			if (symbolInfo.kind !== 'function') {
				return error(SemanticError.CallExpressionNotAFunction(ast.callee.toString(), ast, this.ctx(ast.callee)));
			}

			sym = symbolInfo;
			calleeTypeParams = this.getSymTypeParams(sym);

			return ok(sym.returnTypes);
		} else if (ast.callee.constructor === ASTTypeInstantiationExpression) {
			return error(
				SemanticError.Impossible(
					'A call expression cannot have a type instantiation expression as its callee',
					ast,
					this.ctx(ast.callee),
				),
			);
		}

		// check type arguments
		if (ast.typeArgs.length > 0) {
			// get the callee's type parameters
			// check number of type args matches number of type params
			if (calleeTypeParams.items.length !== ast.typeArgs.length) {
				return error(
					SemanticError.TypeArgumentsLengthMismatch(
						calleeTypeParams.items.length,
						ast.typeArgs.length,
						'type arguments',
						ast,
						this.ctx(ast),
					),
				);
			}

			// check whether type args are assignable to type params
			for (const [index, typeArg] of ast.typeArgs.entries()) {
				const typeParam = calleeTypeParams.items[index];

				// TODO check type arg is assignable to type param
				if (!Helpers.isTypeAssignable(typeArg, typeParam, typeArg, this.ctx(typeArg))) {
					return error(SemanticError.NotAssignable.TypeArgument(typeArg, typeParam, ast, this.ctx(typeArg)));
				}
			}
		}

		// check arguments
		for (const [index, arg] of ast.args.entries()) {
			const result = this.checkASTNode(arg);
			if (result.isError()) {
				return result;
			}

			const isValAssignable = Helpers.isAssignable(arg, sym!.params.items[index].type!, arg, this.ctx(arg));
			if (isValAssignable.isError()) {
				return error(
					SemanticError.NotAssignable.Argument(arg, sym!.params.items[index], ast, this.ctx(arg), isValAssignable.error),
				);
			}
		}

		// TODO check this over
		return error(SemanticError.CallExpressionNotAFunction(ast.callee.toString(), ast, this.ctx(ast)));
	}

	private checkClassDeclaration(ast: ASTClassDeclaration): Result<undefined, SemanticError | SymbolError> {
		const defer = () => {
			// exit the class's scope
			SymbolTable.tree.exit();
		};

		log.info(`checking ClassDeclaration ${ast.name.fqn}`);

		const wasAbleToEnter = SymbolTable.tree.enter(ast.name.name);
		if (wasAbleToEnter.isError()) {
			defer();

			return wasAbleToEnter;
		}

		// TODO check modifiers

		// TODO check type parameters

		// TODO check extends
		for (const ext of ast.extends.items) {
			const classSymResult = this.getSymbolForExt<ClassSym>('class', ext);
			if (classSymResult.isError()) {
				defer();

				return classSymResult;
			}

			// TODO check that the class can be extended
		}

		// TODO check implements
		// for (const impl of ast.implements.items) {
		// 	const interfaceSymResult = this.getSymbolForClassImpl(impl);
		// 	if (interfaceSymResult.isError()) {
		// 		defer();

		// 		return interfaceSymResult;
		// 	}

		// TODO check that the interface can be implemented
		// TODO check that the class implements all the interface's methods correctly
		// }

		for (const expr of ast.body.expressions) {
			const result = this.checkASTNode(expr);
			if (result.isError()) {
				defer();

				return result;
			}
		}

		defer();

		return ok(undefined);
	}

	private getSymbolForExt<S extends ExtendableSymbol>(symbolKind: SymbolKind, ext: ASTExtOrImpl): Result<S, SemanticError> {
		// the possible types of ext are: ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression

		switch (ext.constructor) {
			case ASTIdentifier: {
				const identifier = ext as ASTIdentifier;

				const extResult = this.getSymbolForIdentifier(identifier, [symbolKind]) as Result<S, SemanticError>;
				if (extResult.isError()) {
					return error(SemanticError.NotFound(symbolKind, identifier.name, identifier, this.ctx(identifier), extResult.error));
				}

				return ok(extResult.value);
			}
			case ASTMemberExpression: {
				const memberExpr = ext as ASTMemberExpression;

				const extResult = this.checkMemberExpressionAndGetType(memberExpr);
				if (extResult.isError()) {
					return error(
						SemanticError.NotFound(
							symbolKind,
							`${memberExpr.object.toString()}.${memberExpr.property.toString()}`,
							memberExpr,
							this.ctx(memberExpr),
							extResult.error,
						),
					);
				}

				// check recursively
				const [, symbolInfo] = extResult.value;
				if (symbolInfo.kind !== symbolKind) {
					return error(SemanticError.NotA(memberExpr, symbolKind, memberExpr, this.ctx(memberExpr)));
				}

				return ok(symbolInfo as S);
			}
			case ASTTypeInstantiationExpression: {
				const typeInstExpr = ext as ASTTypeInstantiationExpression;

				return this.getSymbolForExt(symbolKind, typeInstExpr.base);
			}
		}

		return error(SemanticError.Impossible(`Unknown ${symbolKind} extension type ${ext.constructor.name}`, ext, this.ctx(ext)));
	}

	private checkFunctionDeclaration(ast: ASTFunctionDeclaration): Result<undefined, SemanticError | SymbolError> {
		const defer = () => {
			// exit the function's scope
			SymbolTable.tree.exit();
		};

		const dedentFunc = log.indentWithInfo('checking FunctionDeclaration', ast.name.fqn);

		const wasAbleToEnter = SymbolTable.tree.enter(ast.name.name);
		if (wasAbleToEnter.isError()) {
			log.warnAndDedent(dedentFunc, 'could not enter function scope');

			defer();

			return wasAbleToEnter;
		}

		// TODO check modifiers

		// check parameters
		const result = this.checkParametersList(ast.params);
		if (result.isError()) {
			log.warnAndDedent(dedentFunc, 'could not check parameters');

			defer();

			return result;
		}

		for (const expr of ast.body?.expressions || []) {
			// return statements need to know the return types of the function
			if (expr.constructor === ASTReturnStatement) {
				const result = this.checkReturnStatement(expr, ast.returnTypes);
				if (result.isError()) {
					log.warnAndDedent(dedentFunc, 'Error checking return statement');

					defer();

					return result;
				}

				// continue to next statement
				continue;
			}

			// check any other statements
			const result = this.checkASTNode(expr);
			if (result.isError()) {
				log.warnAndDedent(dedentFunc, 'Error checking', expr.toString());

				defer();

				return result;
			}
		}

		log.successAndDedent(dedentFunc, ast.name.fqn, 'all good');

		defer();

		return ok(undefined);
	}

	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: ['class']): Result<ClassSym, SemanticError>;
	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: ['enum']): Result<EnumSym, SemanticError>;
	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: ['function']): Result<FuncSym, SemanticError>;
	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: ['interface']): Result<InterfaceSym, SemanticError>;
	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: ['parameter']): Result<ParamSym, SemanticError>;
	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: ['variable']): Result<VarSym, SemanticError>;
	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: SymbolKind[]): Result<SymbolInfo, SemanticError>;
	private getSymbolForIdentifier(ast: ASTIdentifier, symKinds: SymbolKind[]): Result<SymbolInfo, SemanticError> {
		return CreateResultFrom.maybe(
			SymbolTable.lookup(ast.fqn, symKinds),
			SemanticError.UnrecognizedIdentifier(ast.fqn, ast, this.ctx(ast)),
		);
	}

	private getASTTypes(ast: AST, sym: SymbolInfo): ASTType[] {
		const mapType: {
			[key in keyof kindToSymMap]: (value: kindToSymMap[key]) => ASTType[];
		} = {
			class: (_value: ClassSym): ASTType[] => [(ast as ASTClassDeclaration).name],
			enum: (_value: EnumSym): ASTType[] => [(ast as ASTEnumDeclaration).name],
			function: (_value: FuncSym): ASTType[] => (ast as ASTFunctionDeclaration).returnTypes.items,
			interface: (_value: InterfaceSym): ASTType[] => [(ast as ASTInterfaceDeclaration).name],

			// by the time we get here, the declared type will have been set, either by the user
			// or by type inference, and, if type inference failed, we won't get here.
			parameter: (_value: ParamSym): ASTType[] => [(ast as ASTParameter).type as ASTType],
			variable: (_value: VarSym): ASTType[] => [_value.type as ASTType], // TODO
		};

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return mapType[sym.kind](sym);
	}

	private checkInterfaceDeclaration(ast: ASTInterfaceDeclaration): Result<undefined, SemanticError | SymbolError> {
		const defer = () => {
			// exit the interface's scope
			SymbolTable.tree.exit();
		};

		log.info(`checking InterfaceDeclaration ${ast.name.fqn}`);

		const wasAbleToEnter = SymbolTable.tree.enter(ast.name.name);
		if (wasAbleToEnter.isError()) {
			defer();

			return wasAbleToEnter;
		}

		// TODO check modifiers

		// TODO check type parameters

		// TODO check extends
		for (const ext of ast.extends.items) {
			const interfaceSymResult = this.getSymbolForExt<InterfaceSym>('interface', ext);
			if (interfaceSymResult.isError()) {
				defer();

				return interfaceSymResult;
			}

			// TODO check that the interface can be extended
		}

		for (const expr of ast.body.expressions) {
			const result = this.checkASTNode(expr);
			if (result.isError()) {
				defer();

				return result;
			}
		}

		defer();

		return ok(undefined);
	}

	/**
	 * Checks a member expression and returns the type of the member expression.
	 *
	 * @param ast
	 * @returns The type of the member expression, and the symbol info of the member expression
	 */
	private checkMemberExpressionAndGetType(ast: ASTMemberExpression): Result<[ASTType, SymbolInfo], SemanticError | SymbolError> {
		/**
		 * The object could be one of several things:
		 * - a class
		 * - an enum
		 * - an array
		 * - a string
		 * - a tuple
		 * - an object
		 *
		 * If it's a class, we need to check the property against the class's properties.
		 * If it's an enum, we need to check the property against the enum's values.
		 * If it's an array, we need to check the property against the array's values.
		 * If it's a string, we need to get a substring.
		 * If it's a tuple, we need to check the index against the tuple's values.
		 * If it's an object, we need to check the property against the object's properties.
		 */

		// check the object
		const objectResult = this.checkMemberExpressionObjectASTAndGetSymNode(ast.object);
		if (objectResult.isError()) {
			return objectResult;
		}

		const symNode = objectResult.value;

		/**
		 * The 'property' itself, which is a MemberExpressionPropertyASTs, can be one of several things:
		 * - ASTBinaryExpression
		 * - ASTCallExpression
		 * - ASTIdentifier
		 * - ASTMemberExpression
		 * - ASTNumberLiteral
		 * - ASTRangeExpression
		 * - ASTStringLiteral
		 * - ASTTernaryExpression
		 * - ASTTypeInstantiationExpression
		 * - ASTUnaryExpression
		 */

		// we'll start with ASTIdentifier
		switch (ast.property.constructor) {
			case ASTIdentifier: {
				const expr = ast.property as ASTIdentifier;

				if (symNode.kind === 'class') {
					// update the property's identifier's FQN
					expr.prependParentToFqn(`${symNode.name}.`);

					return this._unpackMemberExpressions.class(symNode, expr);
				} // TODO check more scenarios here

				// default to an error
				return error(
					SemanticError.TODOThisIsTemp(
						`checkMemberExpressionAndGetTypes() ASTIdentifier property needs to support ${symNode.kind}`,
						ast,
						this.ctx(expr),
					),
				);
			}
			case ASTTypeInstantiationExpression: {
				const expr = ast.property as ASTTypeInstantiationExpression;

				// this.parent<|T|> is a special case
				if (expr.base instanceof ASTIdentifier && expr.base.name === 'parent') {
					if (expr.typeArgs.length !== 1) {
						return error(SemanticError.TypeArgumentsLengthMismatch(1, expr.typeArgs.length, 'parent', expr, this.ctx(expr)));
					}

					// check if this class extends this parent
					const unverifiedParent = expr.typeArgs[0];
					const actualParentsList: Result<ASTTypeList<ASTExtOrImpl>, SemanticError | SymbolError> = CreateResultFrom.maybe(
						SymbolTable.findNearestClass(),
						SemanticError.ClassNotFound(expr, this.ctx(expr)),
					)
						// get the SymNode's parent
						.mapResultIfOk((symNode) =>
							CreateResultFrom.maybe(symNode.parent, SymbolError.AtTopAndNotExpectingToBe(symNode, this.ctx(expr))),
						)
						// get the ClassSym
						.mapResultIfOk((parent) =>
							CreateResultFrom.maybe(
								parent.get(symNode.name, ['class']),
								SymbolError.SymbolNotFound(symNode.name, parent, this.ctx(expr)),
								this.ctx(expr),
							),
						)
						// get the extends
						.mapResultIfOk((cls) =>
							CreateResultFrom.astListNotBeingEmpty(
								cls._extends,
								SemanticError.ClassExtendNotFound(unverifiedParent.toString(), expr.typeArgs[0], this.ctx(expr)),
							),
						);
					if (actualParentsList.isError()) {
						return actualParentsList;
					}

					// check if the parent is in the list of parents
					const actualParents = actualParentsList.value;
					const parent = actualParents.items.find((parent) => isASTExtOrImplInstanceOf(parent, unverifiedParent));
					if (typeof parent === 'undefined') {
						return error(SemanticError.ClassExtendNotFound(unverifiedParent.toString(), expr.typeArgs[0], this.ctx(expr)));
					}

					const classSymMaybe = SymbolTable.lookup(unverifiedParent.toString(), ['class']);
					if (!classSymMaybe.has()) {
						return error(SemanticError.ClassNotFound(expr, this.ctx(expr)));
					}

					return ok([unverifiedParent, classSymMaybe.value]);
				}
				console.debug({ expr });
				break;
			}
		}

		return error(
			SemanticError.TODOThisIsTemp(
				`checkMemberExpressionAndGetTypes() property needs to support ${ast.property.constructor.name}`,
				ast,
				this.ctx(ast.property),
			),
		);
	}

	private _unpackMemberExpressions = {
		class: (classSymNode: SymNode, expr: ASTIdentifier): Result<[ASTType, SymbolInfo], SemanticError> => {
			// check the property
			const maybeSymbolInfo = classSymNode.get(expr.fqn, symbolKinds);
			if (!maybeSymbolInfo.has()) {
				return error(SemanticError.NotFound('Property', expr.fqn, expr, this.ctx(expr)));
			}

			const symbolInfo = maybeSymbolInfo.value;
			switch (symbolInfo.kind) {
				case 'class':
				case 'enum':
					return ok([expr, symbolInfo]);
				case 'function':
					return ok([symbolInfo.returnTypes, symbolInfo]);
				case 'variable':
					return ok([symbolInfo.type, symbolInfo]);
			}

			// even though we're using a symbol kind here, it's still a SemanticError
			return error(SemanticError.ClassPropertyKindNotSupported(symbolInfo.kind, expr, this.ctx(expr)));
		},
	};

	private checkMemberExpressionObjectASTAndGetSymNode(obj: MemberExpressionObjectASTs): Result<SymNode, SemanticError | SymbolError> {
		switch (obj.constructor) {
			case ASTCallExpression:
				break;
			case ASTIdentifier: {
				const expr = obj as ASTIdentifier;
				return CreateResultFrom.maybe(
					SymbolTable.lookupSymNode(expr.fqn, symbolKinds),
					SemanticError.NotFound('Object', expr.fqn, obj, this.ctx(expr)),
				);
			}
			case ASTMemberExpression: {
				const result = this.checkMemberExpressionAndGetType(obj as ASTMemberExpression);
				if (result.isError()) {
					return result;
				}

				const [, symbolInfo] = result.value;

				return CreateResultFrom.maybe(
					SymbolTable.lookupSymNode(symbolInfo.name, symbolKinds),
					SemanticError.NotFound('Object', symbolInfo.fqn, obj, this.ctx(obj)),
				);
			}
			case ASTThisKeyword: {
				const that = obj as ASTThisKeyword;

				return CreateResultFrom.maybe(
					SymbolTable.findNearestClass(),
					SemanticError.NotFound('Class', 'for this', that, this.ctx(that)),
				);
			}
			case ASTTypeInstantiationExpression:
				break;
		}

		return error(SemanticError.MemberExpressionObjectNotSupported(obj, obj, this.ctx(obj)));
	}

	private checkParametersList(paramsList: ASTTypeList<ASTParameter>): Result<undefined, SemanticError> {
		const asts = paramsList.items;
		// ensure rest param is at end
		const restIndex = asts.findIndex((ast) => ast.isRest);
		if (restIndex > -1 && restIndex < asts.length - 1) {
			return error(SemanticError.RestParameterMustBeAtEnd(asts[restIndex], this.ctx(asts[restIndex])));
		}

		// params cannot have the same names
		for (const dup of Helpers.findDuplicates(asts.map((ast) => ast.name.name)).flat()) {
			// will return on the first instance
			return error(SemanticError.DuplicateIdentifier(asts[dup].name.name, asts[dup], this.ctx(asts[dup])));
		}

		for (const ast of asts) {
			// if it has a default value, check it is assignable to the type
			if (typeof ast.defaultValue !== 'undefined') {
				const isValAssignable = Helpers.isAssignable(ast.defaultValue, ast.type, ast, this.ctx(ast.defaultValue));
				if (isValAssignable.isError()) {
					return error(
						SemanticError.NotAssignable.Type(
							ast.defaultValue,
							ast.type,
							ast,
							this.ctx(ast.defaultValue),
							isValAssignable.error,
						),
					);
				}
			}

			// if it has a default value but not a type, check that there is only one inferred type
			if (typeof ast.type === 'undefined' && typeof ast.defaultValue !== 'undefined') {
				const typeResult = Helpers.inferType(ast.defaultValue, this.ctx(ast.defaultValue));
				if (typeResult.isError()) {
					return typeResult;
				}

				// set the type to the inferred type
				ast.type = typeResult.value;
			}
		}

		return ok(undefined);
	}

	private checkPrintStatement(ast: ASTPrintStatement): Result<undefined, SemanticError> {
		// ensure all expressions are assignable to a string
		for (const [, expr] of ast.expressions.entries()) {
			const isValAssignable = Helpers.isAssignable(expr, ASTTypePrimitiveString(ast.pos, ast), expr, this.ctx(expr));
			if (!isValAssignable) {
				return error(SemanticError.CastNotDefined(expr, ASTTypePrimitiveString(ast.pos, ast), ast, this.ctx(expr)));
			}
		}

		return ok(undefined);
	}

	private checkReturnStatement(ast: ASTReturnStatement, returnTypes: ASTTypeList<ASTType>): Result<undefined, SemanticError> {
		// check number of type args matches number of type params
		if (ast.expressions.length !== returnTypes.items.length) {
			return error(
				SemanticError.TypeArgumentsLengthMismatch(
					returnTypes.items.length,
					ast.expressions.length,
					'expressions',
					ast,
					this.ctx(ast),
				),
			);
		}

		// ensure all expressions are assignable to the return types
		for (const [index, expr] of ast.expressions.entries()) {
			const isValAssignable = Helpers.isAssignable(expr, returnTypes.items[index], expr, this.ctx(expr));
			if (isValAssignable.isError()) {
				// return error(SemanticError.NotAssignable.Value(expr, returnTypes.items[index], ast, this.ctx(expr), isValAssignable.error));
				// the original error is more useful
				return isValAssignable;
			}
		}

		return ok(undefined);
	}

	// private checkTypeInstantiationExpression(ast: ASTTypeInstantiationExpression): Result<ASTType, SemanticError> {
	// 	if (baseTypeResult.isError()) {
	// 		return baseTypeResult;
	// 	}

	// 	// get the type arguments
	// 	const typeArgumentsResults = typeInstantiationExpr.typeArgs.map((typeArg) => Helpers.inferType(typeArg, ctx));
	// 	if (typeArgumentsResults.some((result) => result.isError())) {
	// 		// set the first type as the type, it doesn't matter since this is an error
	// 		return CreateResultFrom.arrayOfResults(typeArgumentsResults).mapValue((results) => results[0]);
	// 	}

	// 	// get the type parameters
	// 	const typeParameters = baseTypeResult.value;

	// }

	private checkVariableDeclaration(ast: ASTVariableDeclaration): Result<undefined, SemanticError> {
		for (const [index, identifier] of ast.identifiersList.entries()) {
			const declaredType = ast.declaredTypes[index];
			const defaultValue = ast.initialValues[index];

			// check if there is neither a declared type nor a default value
			if (typeof declaredType === 'undefined' && typeof defaultValue === 'undefined') {
				return error(SemanticError.VariableDeclarationTypeNotDefined(identifier, this.ctx(identifier)));
			}

			// if it has a default value, check that it is assignable to the type
			if (typeof defaultValue !== 'undefined') {
				const isValAssignable = Helpers.isAssignable(defaultValue, declaredType, identifier, this.ctx(defaultValue));
				if (!isValAssignable) {
					return error(SemanticError.NotAssignable.Value(defaultValue, declaredType, ast, this.ctx(defaultValue)));
				}
			}
		}

		return ok(undefined);
	}

	private mainFileMustHaveMainFunction(ast: ASTProgram): Result<undefined, SemanticError> {
		const mainFunction = maybeIfNotUndefined(
			ast.declarations.find((decl) => {
				return decl instanceof ASTFunctionDeclaration && decl.name?.name === 'main';
			}) as ASTFunctionDeclaration | undefined,
		);

		if (!mainFunction.has()) {
			return error(SemanticError.NotFound('function', 'main()', ast, this.ctx(ast)));
		}

		// check that `main()` has no type parameters
		if (mainFunction.value.typeParams.items.length > 0) {
			return error(SemanticError.TypeParametersNotExpected('main()', ast, this.ctx(mainFunction.value.typeParams.items[0])));
		}

		// check that `main()` has no parameters
		if (mainFunction.value.params.items.length > 0) {
			return error(SemanticError.ParameterNotExpected('main()', ast, this.ctx(mainFunction.value.params.items[0])));
		}

		// check that `main()` has no return type
		if (mainFunction.value.returnTypes.items.length > 0) {
			return error(
				SemanticError.ReturnTypeNotExpected('main()', mainFunction.value, this.ctx(mainFunction.value.returnTypes.items[0])),
			);
		}

		return ok(undefined);
	}

	/**
	 * Main and preferred way to get an error context, this requires a node
	 *
	 * In many cases, even if we're unsure whether a child node exists, this
	 * method should still be used, and pass in `child || node`, so we have
	 * at least closely-relevant positional information.
	 */
	private ctx(ast: AST): Context {
		return new Context(this.loc[ast.pos.line - 1], ast.pos.line, ast.pos.col, ast.pos.end - ast.pos.start);
	}
}
