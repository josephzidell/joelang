import ErrorContext from '../shared/errorContext';
import { maybeIfNotUndefined } from '../shared/maybe';
import { CreateResultFrom, Result, error, ok } from '../shared/result';
import {
	AST,
	ASTCallExpression,
	ASTClassDeclaration,
	ASTEnumDeclaration,
	ASTFunctionDeclaration,
	ASTIdentifier,
	ASTInterfaceDeclaration,
	ASTMemberExpression,
	ASTNumberLiteral,
	ASTParameter,
	ASTPrintStatement,
	ASTProgram,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTThisKeyword,
	ASTType,
	ASTTypeInstantiationExpression,
	ASTTypePrimitiveString,
	ASTVariableDeclaration,
	MemberExpressionObjectASTs,
} from './asts';
import {
	findDuplicates,
	getErrorContext,
	getSingleInferredASTTypeFromASTAssignable,
	isAssignable,
	isTypeAssignable,
} from './helpers';
import SemanticError, { SemanticErrorCode } from './semanticError';
import SymbolError from './symbolError';
import {
	ClassSym,
	EnumSym,
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

type SemanticsOptions = Options & {
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

	checkForErrors(): Result<unknown, SemanticError | SymbolError> {
		// check for `main()`
		if (!this.options.isASnippet) {
			const result = this.mainFileMustHaveMainFunction(this.ast);
			if (result.isError()) {
				return result;
			}
		}

		// kick off semantic analysis
		for (const decl of this.ast.declarations) {
			const result = this.checkASTNode(decl);
			if (result.isError()) {
				return result;
			}
		}

		return ok(undefined);
	}

	private checkASTNode(ast: AST): Result<unknown, SemanticError | SymbolError> {
		switch (ast.constructor) {
			case ASTCallExpression:
				return this.checkCallExpressionAndGetTypes(ast as ASTCallExpression);
			case ASTClassDeclaration:
				return this.checkClassDeclaration(ast as ASTClassDeclaration);
			case ASTFunctionDeclaration:
				return this.checkFunctionDeclaration(ast as ASTFunctionDeclaration);
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
		return error(
			new SemanticError(
				SemanticErrorCode.Temp,
				`Semantics.checkASTNode(${ast.constructor.name}) is unhandled`,
				ast,
				this.getErrorContext(ast),
			),
		);
	}

	getSymTypeParams(value: SymbolInfo): ASTType[] {
		const mapType: {
			[key in keyof kindToSymMap]: (value: kindToSymMap[key]) => ASTType[];
		} = {
			class: (value: ClassSym): ASTType[] => value.typeParams,
			enum: (value: EnumSym): ASTType[] => value.typeParams,
			function: (value: FuncSym): ASTType[] => value.typeParams,
			interface: (value: InterfaceSym): ASTType[] => value.typeParams,
			parameter: (_value: ParamSym): ASTType[] => [], // TODO
			variable: (_value: VarSym): ASTType[] => [], // TODO
		};

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		return mapType[value.kind](value);
	}

	/**
	 * Checks a call expression and returns the return types of the function.
	 *
	 * @param ast
	 * @returns The return types of the function
	 */
	checkCallExpressionAndGetTypes(ast: ASTCallExpression): Result<ASTType[], SemanticError | SymbolError> {
		let sym: FuncSym;
		let calleeTypeParams: ASTType[] = [];
		let returnTypes: ASTType[] = [];

		if (ast.callee.constructor === ASTIdentifier) {
			const calleeResult = this.getSymbolForIdentifier(ast.callee, 'identifier', ['function']);
			if (calleeResult.isError()) {
				return error(
					new SemanticError(
						SemanticErrorCode.FunctionNotFound,
						`Function '${(ast.callee as ASTIdentifier).name}' not found`,
						ast,
						this.getErrorContext(ast),
					),
				);
			}

			// TODO: call a var that's assigned a func. `const foo = f {}; foo();`
			sym = calleeResult.value;
			calleeTypeParams = calleeResult
				.mapValue<ASTType[]>((value: SymbolInfo) => this.getSymTypeParams(value))
				.unwrapOr<ASTType[]>([]);
			returnTypes = sym.returnTypes;
		} else if (ast.callee.constructor === ASTCallExpression) {
			// TODO check: f foo -> f {return f {};}
			return error(
				new SemanticError(
					SemanticErrorCode.ThisIsImpossible,
					'Impossible: A call expression cannot have a call expression as its callee',
					ast,
					this.getErrorContext(ast),
				),
			);
		} else if (ast.callee.constructor === ASTMemberExpression) {
			const result = this.checkMemberExpressionAndGetTypes(ast.callee);
			if (result.isError()) {
				return result;
			}

			const [types, symbolInfo] = result.value;

			if (symbolInfo.kind !== 'function') {
				return error(
					new SemanticError(
						SemanticErrorCode.CallExpressionNotAFunction,
						`Cannot call '${ast.callee}' because it is not a function`,
						ast,
						this.getErrorContext(ast),
					),
				);
			}

			sym = symbolInfo;
			calleeTypeParams = types;
			returnTypes = sym.returnTypes;
		} else if (ast.callee.constructor === ASTTypeInstantiationExpression) {
			return error(
				new SemanticError(
					SemanticErrorCode.ThisIsImpossible,
					'Impossible: A call expression cannot have a type instantiation expression as its callee',
					ast,
					this.getErrorContext(ast),
				),
			);
		}

		// check type arguments
		if (ast.typeArgs.length > 0) {
			// get the callee's type parameters
			// check number of type args matches number of type params
			if (calleeTypeParams.length !== ast.typeArgs.length) {
				return error(
					new SemanticError(
						SemanticErrorCode.TypeArgumentsLengthMismatch,
						`Semantic: Expected ${calleeTypeParams.length} type arguments, but got ${ast.typeArgs.length}`,
						ast,
						this.getErrorContext(ast),
					),
				);
			} else {
				// check whether type args are assignable to type params
				for (const [index, typeArg] of ast.typeArgs.entries()) {
					const typeParam = calleeTypeParams[index];

					// TODO check type arg is assignable to type param
					if (!isTypeAssignable(typeArg, typeParam, this.options)) {
						return error(
							new SemanticError(
								SemanticErrorCode.TypeArgumentNotAssignable,
								`Semantic: Type argument ${typeArg} is not assignable to type parameter ${typeParam}`,
								ast,
								this.getErrorContext(ast),
							),
						);
					}
				}
			}
		}

		// check arguments
		for (const [index, arg] of ast.args.entries()) {
			const result = this.checkASTNode(arg);
			if (result.isError()) {
				return result;
			}

			const [isReturnValAssignable] = isAssignable(arg, sym!.params[index].type!, this.options);
			if (!isReturnValAssignable) {
				return error(
					new SemanticError(
						SemanticErrorCode.ArgumentNotAssignable,
						`Semantic: ${arg} is not assignable to parameter ${sym!.params[index]}`,
						ast,
						this.getErrorContext(ast),
					),
				);
			}
		}

		return ok(returnTypes);
	}

	checkClassDeclaration(ast: ASTClassDeclaration): Result<undefined, SemanticError | SymbolError> {
		const defer = () => {
			// exit the class's scope
			SymbolTable.tree.exit();
		};

		if (this.options.debug) {
			console.log(`IR Converter: converting ClassDeclaration ${ast.name.fqn}`);
		}

		const wasAbleToEnter = SymbolTable.tree.enter(ast.name.fqn);
		if (wasAbleToEnter.isError()) {
			defer();

			return wasAbleToEnter;
		}

		// TODO check modifiers

		// TODO check type parameters

		// TODO check extends

		// TODO check implements

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

	checkFunctionDeclaration(ast: ASTFunctionDeclaration): Result<undefined, SemanticError | SymbolError> {
		const defer = () => {
			// exit the function's scope
			SymbolTable.tree.exit();
		};

		if (this.options.debug) {
			console.log(`IR Converter: converting FunctionDeclaration ${ast.name.fqn}`);
		}

		const wasAbleToEnter = SymbolTable.tree.enter(ast.name.fqn);
		if (wasAbleToEnter.isError()) {
			defer();

			return wasAbleToEnter;
		}

		// TODO check modifiers

		// check parameters
		const result = this.checkParametersList(ast.params);
		if (result.isError()) {
			defer();

			return result;
		}

		for (const expr of ast.body?.expressions || []) {
			// return statements need to know the return types of the function
			if (expr.constructor === ASTReturnStatement) {
				const result = this.checkReturnStatement(expr, ast.returnTypes);
				if (result.isError()) {
					defer();

					return result;
				}

				// continue to next statement
				continue;
			}

			// check any other statements
			const result = this.checkASTNode(expr);
			if (result.isError()) {
				defer();

				return result;
			}
		}

		defer();

		return ok(undefined);
	}

	public getSymbolForIdentifier(
		ast: ASTIdentifier,
		word: string,
		symKinds: ['class'],
	): Result<ClassSym, SemanticError>;
	public getSymbolForIdentifier(ast: ASTIdentifier, word: string, symKinds: ['enum']): Result<EnumSym, SemanticError>;
	public getSymbolForIdentifier(
		ast: ASTIdentifier,
		word: string,
		symKinds: ['function'],
	): Result<FuncSym, SemanticError>;
	public getSymbolForIdentifier(
		ast: ASTIdentifier,
		word: string,
		symKinds: ['interface'],
	): Result<InterfaceSym, SemanticError>;
	public getSymbolForIdentifier(
		ast: ASTIdentifier,
		word: string,
		symKinds: ['parameter'],
	): Result<ParamSym, SemanticError>;
	public getSymbolForIdentifier(
		ast: ASTIdentifier,
		word: string,
		symKinds: ['variable'],
	): Result<VarSym, SemanticError>;
	public getSymbolForIdentifier(
		ast: ASTIdentifier,
		word: string,
		symKinds: SymbolKind[],
	): Result<SymbolInfo, SemanticError>;
	getSymbolForIdentifier(
		ast: ASTIdentifier,
		word: string,
		symKinds: SymbolKind[],
	): Result<SymbolInfo, SemanticError> {
		return CreateResultFrom.maybe(
			SymbolTable.lookup(ast.fqn, symKinds, this.options),
			new SemanticError(
				SemanticErrorCode.FunctionNotFound,
				`${word} ${ast.fqn} not found`,
				ast,
				this.getErrorContext(ast),
			),
		);
	}

	getASTTypes(ast: AST, sym: SymbolInfo): ASTType[] {
		const mapType: {
			[key in keyof kindToSymMap]: (value: kindToSymMap[key]) => ASTType[];
		} = {
			class: (_value: ClassSym): ASTType[] => [(ast as ASTClassDeclaration).name],
			enum: (_value: EnumSym): ASTType[] => [(ast as ASTEnumDeclaration).name],
			function: (_value: FuncSym): ASTType[] => (ast as ASTFunctionDeclaration).returnTypes,
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

	/**
	 * Checks a member expression and returns the type of the member expression.
	 *
	 * @param ast
	 * @returns The type of the member expression, and the symbol info of the member expression
	 */
	checkMemberExpressionAndGetTypes(ast: ASTMemberExpression): Result<[ASTType[], SymbolInfo], SemanticError> {
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
		 * If it's a tuple, we need to check the property against the tuple's values.
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
					new SemanticError(
						SemanticErrorCode.MemberExpressionObjectNotSupported,
						// TODO change this error message
						`Semantic TODO: checkMemberExpressionAndGetTypes() ASTIdentifier property needs to support ${symNode.kind}`,
						ast,
						this.getErrorContext(ast),
					),
				);
			}
		}

		return error(
			new SemanticError(
				SemanticErrorCode.MemberExpressionObjectNotSupported,
				// TODO change this error message
				`Semantic TODO: checkMemberExpressionAndGetTypes() property needs to support ${ast.property.constructor.name}`,
				ast,
				this.getErrorContext(ast),
			),
		);
	}

	private _unpackMemberExpressions = {
		class: (classSymNode: SymNode, expr: ASTIdentifier): Result<[ASTType[], SymbolInfo], SemanticError> => {
			// check the property
			const maybeSymbolInfo = classSymNode.get(expr.fqn, symbolKinds);
			if (!maybeSymbolInfo.has()) {
				return error(
					new SemanticError(
						SemanticErrorCode.MemberExpressionPropertyNotFound,
						`Semantic: Property ${expr.fqn} not found`,
						expr,
						this.getErrorContext(expr),
					),
				);
			}

			const symbolInfo = maybeSymbolInfo.value;
			switch (symbolInfo.kind) {
				case 'class':
				case 'enum':
					return ok([[expr], symbolInfo]);
				case 'function':
					return ok([symbolInfo.returnTypes, symbolInfo]);
				case 'variable':
					return ok([[symbolInfo.type], symbolInfo]);
			}

			return error(
				new SemanticError(
					SemanticErrorCode.MemberExpressionPropertyNotSupported,
					`Semantic: Class property type ${symbolInfo.kind} not supported`,
					expr,
					this.getErrorContext(expr),
				),
			);
		},
	};

	checkMemberExpressionObjectASTAndGetSymNode(obj: MemberExpressionObjectASTs): Result<SymNode, SemanticError> {
		switch (obj.constructor) {
			case ASTCallExpression:
				break;
			case ASTIdentifier: {
				const expr = obj as ASTIdentifier;
				return CreateResultFrom.maybe(
					SymbolTable.lookupSymNode(expr.fqn, symbolKinds, this.options),
					new SemanticError(
						SemanticErrorCode.MemberExpressionObjectNotSupported,
						`Semantic: Object ${expr.fqn} not found`,
						obj,
						this.getErrorContext(obj),
					),
				);
			}
			case ASTMemberExpression:
				break;
			case ASTThisKeyword:
				break;
			case ASTTypeInstantiationExpression:
				break;
		}

		return error(
			new SemanticError(
				SemanticErrorCode.MemberExpressionObjectNotSupported,
				`Semantic: Member expression object ${obj} not supported`,
				obj,
				this.getErrorContext(obj),
			),
		);
	}

	checkParametersList(asts: ASTParameter[]): Result<undefined, SemanticError> {
		// ensure rest param is at end
		const restIndex = asts.findIndex((ast) => ast.isRest);
		if (restIndex > -1 && restIndex < asts.length - 1) {
			return error(
				new SemanticError(
					SemanticErrorCode.ParameterNotExpected,
					'Semantic: A rest parameter must be the last one',
					asts[restIndex],
					this.getErrorContext(asts[restIndex]),
				),
			);
		}

		// params cannot have the same names
		for (const dup of findDuplicates(asts.map((ast) => ast.name.name)).flat()) {
			return error(
				new SemanticError(
					SemanticErrorCode.DuplicateIdentifier,
					`Semantic: Duplicate identifier found ${asts[dup].name.name}`,
					asts[dup],
					this.getErrorContext(asts[dup]),
				),
			);
		}

		for (const ast of asts) {
			// ensure each param has either a type or a default value
			if (typeof ast.type === 'undefined' && typeof ast.defaultValue === 'undefined') {
				return error(
					new SemanticError(
						SemanticErrorCode.ParameterNotExpected,
						'Semantic: Parameter must have either a type or a default value',
						ast,
						this.getErrorContext(ast),
					),
				);
			}

			// if it has both, check that the default value is assignable to the type
			if (typeof ast.type !== 'undefined' && typeof ast.defaultValue !== 'undefined') {
				const [isReturnValAssignable] = isAssignable(ast.defaultValue, ast.type, this.options);
				if (!isReturnValAssignable) {
					return error(
						new SemanticError(
							SemanticErrorCode.TypeNotAssignable,
							`Semantic: Default value ${ast.defaultValue} is not assignable to type ${ast.type}`,
							ast,
							this.getErrorContext(ast),
						),
					);
				}
			}

			// if it has a default value but not a type, check that there is only one inferred type
			if (typeof ast.type === 'undefined' && typeof ast.defaultValue !== 'undefined') {
				const singleInferredTypeResult = getSingleInferredASTTypeFromASTAssignable(
					ast.defaultValue,
					new SemanticError(
						SemanticErrorCode.TypeNotAssignable,
						`Semantic: Default value ${ast.defaultValue} has more than one possible type`,
						ast,
						this.getErrorContext(ast),
					),
					this.options,
				);
				if (singleInferredTypeResult.isError()) {
					return singleInferredTypeResult;
				}

				// set the type to the (only) inferred type
				ast.type = singleInferredTypeResult.value;
			}
		}

		return ok(undefined);
	}

	checkPrintStatement(ast: ASTPrintStatement): Result<undefined, SemanticError> {
		// ensure all expressions are assignable to a string
		for (const [, expr] of ast.expressions.entries()) {
			const [isReturnValAssignable] = isAssignable(expr, ASTTypePrimitiveString(ast.pos), this.options);
			if (!isReturnValAssignable) {
				return error(
					new SemanticError(
						SemanticErrorCode.TypeNotAssignable,
						`Semantic: Print expression ${expr} cannot be converted to a string`,
						ast,
						this.getErrorContext(ast),
					),
				);
			}
		}

		return ok(undefined);
	}

	checkReturnStatement(ast: ASTReturnStatement, returnTypes: ASTType[]): Result<undefined, SemanticError> {
		// check number of type args matches number of type params
		if (ast.expressions.length !== returnTypes.length) {
			return error(
				new SemanticError(
					SemanticErrorCode.TypeArgumentsLengthMismatch,
					`Semantic: Expected ${returnTypes.length} expressions, but got ${ast.expressions.length}`,
					ast,
					this.getErrorContext(ast),
				),
			);
		}

		// ensure all expressions are assignable to the return types
		for (const [index, expr] of ast.expressions.entries()) {
			const [isReturnValAssignable] = isAssignable(expr, returnTypes[index], this.options);
			if (!isReturnValAssignable) {
				return error(
					new SemanticError(
						SemanticErrorCode.TypeNotAssignable,
						`Semantic: Return expression ${expr} is not assignable to type ${returnTypes[index]}`,
						ast,
						this.getErrorContext(ast),
					),
				);
			}
		}

		return ok(undefined);
	}

	checkVariableDeclaration(ast: ASTVariableDeclaration): Result<undefined, SemanticError> {
		for (const [index] of ast.identifiersList.entries()) {
			const declaredType = ast.declaredTypes[index];
			const defaultValue = ast.initialValues[index];

			// ensure each has either a type or a default value
			if (typeof declaredType === 'undefined' && typeof defaultValue === 'undefined') {
				return error(
					new SemanticError(
						SemanticErrorCode.ParameterNotExpected,
						'Semantic: Parameter must have either a type or a default value',
						ast,
						this.getErrorContext(ast),
					),
				);
			}

			// if it has both, check that the default value is assignable to the type
			if (typeof declaredType !== 'undefined' && typeof defaultValue !== 'undefined') {
				const [isReturnValAssignable] = isAssignable(defaultValue, declaredType, this.options);
				if (!isReturnValAssignable) {
					return error(
						new SemanticError(
							SemanticErrorCode.TypeNotAssignable,
							`Semantic: Default value ${defaultValue} is not assignable to type ${declaredType}`,
							ast,
							this.getErrorContext(ast),
						),
					);
				}
			}

			// if it has a default value but not a type, check that there is only one inferred type
			if (typeof declaredType === 'undefined' && typeof defaultValue !== 'undefined') {
				const singleInferredTypeResult = getSingleInferredASTTypeFromASTAssignable(
					defaultValue,
					new SemanticError(
						SemanticErrorCode.TypeNotAssignable,
						`Semantic: Default value ${defaultValue} has more than one possible type`,
						ast,
						this.getErrorContext(ast),
					),
					this.options,
				);
				if (singleInferredTypeResult.isError()) {
					return singleInferredTypeResult;
				}

				// set the declared type to the (only) inferred type
				ast.declaredTypes[index] = singleInferredTypeResult.value;
			}
		}

		return ok(undefined);
	}

	mainFileMustHaveMainFunction(ast: ASTProgram): Result<undefined, SemanticError> {
		const mainFunction = maybeIfNotUndefined(
			ast.declarations.find((decl) => {
				return decl instanceof ASTFunctionDeclaration && decl.name?.name === 'main';
			}) as ASTFunctionDeclaration | undefined,
		);

		if (!mainFunction.has()) {
			return error(
				new SemanticError(
					SemanticErrorCode.FunctionNotFound,
					'No main() function found',
					ast,
					this.getErrorContext(ast),
				),
			);
		}

		// check that `main()` has no type parameters
		if (mainFunction.value.typeParams.length > 0) {
			return error(
				new SemanticError(
					SemanticErrorCode.TypeParametersNotExpected,
					'main() function cannot have type parameters',
					ast,
					this.getErrorContext(mainFunction.value.typeParams[0]),
				),
			);
		}

		// check that `main()` has no parameters
		if (mainFunction.value.params.length > 0) {
			return error(
				new SemanticError(
					SemanticErrorCode.ParameterNotExpected,
					'main() function cannot have parameters',
					ast,
					this.getErrorContext(mainFunction.value.params[0]),
				),
			);
		}

		// check that `main()` has no return type
		if (mainFunction.value.returnTypes.length > 0) {
			return error(
				new SemanticError(
					SemanticErrorCode.ReturnTypeNotExpected,
					'main() function cannot have a return type',
					mainFunction.value,
					this.getErrorContext(mainFunction.value.returnTypes[0]),
				),
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
	getErrorContext(ast: AST): ErrorContext {
		return getErrorContext(this.loc[ast.pos.line - 1], ast.pos.line, ast.pos.col, 1); // TODO fix length
	}
}
