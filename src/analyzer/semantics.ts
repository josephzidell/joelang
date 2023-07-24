import ErrorContext from '../shared/errorContext';
import { maybeIfNotUndefined } from '../shared/maybe';
import { AST, ASTCallExpression, ASTFunctionDeclaration, ASTParameter, ASTProgram } from './asts';
import { findDuplicates } from './helpers';
import SemanticError, { SemanticErrorCode } from './semanticError';

type SemanticsOptions = Options & {
	isASnippet: boolean;
};

export default class Semantics {
	private ast: ASTProgram;
	private loc: string[];
	private isASnippet: boolean;
	private debug: boolean;

	constructor(ast: ASTProgram, loc: string[], options: SemanticsOptions) {
		this.ast = ast;
		this.loc = loc;
		this.isASnippet = options.isASnippet;
		this.debug = options.debug;
	}

	checkForErrors(): SemanticError[] {
		const errors: SemanticError[] = [];

		// check for `main()`
		if (!this.isASnippet) {
			const result = this.mainFileMustHaveMainFunction(this.ast);
			if (typeof result !== 'undefined') {
				errors.push(result);
			}
		}

		// kick off semantic analysis
		this.ast.declarations.forEach((decl) => {
			switch (decl.constructor.name) {
				case ASTCallExpression.name:
					// console.debug('Hello')
					break;
				case ASTFunctionDeclaration.name:
					errors.push(...this.visitFunctionDeclaration(decl as ASTFunctionDeclaration));
					break;

				// case ASTPrintStatement.name:
				// 	const printStmt = decl as ASTPrintStatement;
				// 	// make sure we're printing something
				// 	if (printStmt.expressions.length > 0) {

				// 	}
			}
		});

		return errors;
	}

	visitFunctionDeclaration(ast: ASTFunctionDeclaration): SemanticError[] {
		const errors: SemanticError[] = [];

		// TODO check modifiers

		// check parameters
		errors.push(...this.visitParametersList(ast.params));

		return errors;
	}

	visitParametersList(asts: ASTParameter[]): SemanticError[] {
		const errors: SemanticError[] = [];

		// ensure rest param is at end
		const restIndex = asts.findIndex((ast) => ast.isRest);
		if (restIndex > -1 && restIndex < asts.length - 1) {
			errors.push(
				new SemanticError(
					SemanticErrorCode.ParameterNotExpected,
					'Semantic: A rest parameter must be the last one',
					asts[restIndex],
					this.getErrorContext(asts[restIndex]),
				),
			);
		}

		// params cannot have the same names
		findDuplicates(asts.map((ast) => ast.name.name))
			.flat()
			.forEach((dup) => {
				errors.push(
					new SemanticError(
						SemanticErrorCode.DuplicateIdentifier,
						`Semantic: Duplicate identifier found ${asts[dup].name.name}`,
						asts[dup],
						this.getErrorContext(asts[dup]),
					),
				);
			});

		return errors;
	}

	mainFileMustHaveMainFunction(ast: ASTProgram): SemanticError | undefined {
		const mainFunction = maybeIfNotUndefined(
			ast.declarations.find((decl) => {
				return decl instanceof ASTFunctionDeclaration && decl.name?.name === 'main';
			}) as ASTFunctionDeclaration | undefined,
		);

		if (!mainFunction.has()) {
			return new SemanticError(
				SemanticErrorCode.FunctionNotFound,
				'No main() function found',
				ast,
				this.getErrorContext(ast),
			);
		}

		// check that `main()` has no type parameters
		if (mainFunction.value.typeParams.length > 0) {
			return new SemanticError(
				SemanticErrorCode.TypeParametersNotExpected,
				'main() function cannot have type parameters',
				ast,
				this.getErrorContext(mainFunction.value.typeParams[0]),
			);
		}

		// check that `main()` has no parameters
		if (mainFunction.value.params.length > 0) {
			return new SemanticError(
				SemanticErrorCode.ParameterNotExpected,
				'main() function cannot have parameters',
				ast,
				this.getErrorContext(mainFunction.value.params[0]),
			);
		}

		// check that `main()` has no return type
		if (mainFunction.value.returnTypes.length > 0) {
			return new SemanticError(
				SemanticErrorCode.ReturnTypeNotExpected,
				'main() function cannot have a return type',
				mainFunction.value,
				this.getErrorContext(mainFunction.value.returnTypes[0]),
			);
		}
	}

	/**
	 * Main and preferred way to get an error context, this requires a node
	 *
	 * In many cases, even if we're unsure whether a child node exists, this
	 * method should still be used, and pass in `child || node`, so we have
	 * at least closely-relevant positional information.
	 */
	getErrorContext(ast: AST): ErrorContext {
		return new ErrorContext(this.loc[ast.pos.line - 1], ast.pos.line, ast.pos.col, 1); // TODO fix length
	}
}
