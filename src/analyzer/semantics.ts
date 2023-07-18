import ErrorContext from '../shared/errorContext';
import { maybeIfNotUndefined } from '../shared/maybe';
import { AST, ASTFunctionDeclaration, ASTProgram } from './asts';
import SemanticError, { SemanticErrorCode } from './semanticError';

export default class Semantics {
	private ast: ASTProgram;
	private loc: string[];
	private isASnippet: boolean;

	constructor(ast: ASTProgram, loc: string[], isASnippet: boolean) {
		this.ast = ast;
		this.loc = loc;
		this.isASnippet = isASnippet;
	}

	checkForErrors(): SemanticError[] {
		const errors: SemanticError[] = [];

		// check for `main()`
		if (!this.isASnippet) {
			const result = this.mainFileMustHaveMainFunction();
			if (typeof result !== 'undefined') {
				errors.push(result);
			}
		}

		return errors;
	}

	mainFileMustHaveMainFunction(): SemanticError | undefined {
		const mainFunction = maybeIfNotUndefined(
			this.ast.declarations.find((decl) => {
				return decl instanceof ASTFunctionDeclaration && decl.name?.name === 'main';
			}) as ASTFunctionDeclaration | undefined,
		);

		if (!mainFunction.has()) {
			return new SemanticError(
				SemanticErrorCode.MainFunctionNotFound,
				'No main() function found',
				this.ast,
				this.getErrorContext(this.ast),
			);
		}

		// check that `main()` has no type parameters
		if (mainFunction.value.typeParams.length > 0) {
			return new SemanticError(
				SemanticErrorCode.MainFunctionHasTypeParameters,
				'main() function cannot have type parameters',
				this.ast,
				this.getErrorContext(mainFunction.value.typeParams[0]),
			);
		}

		// check that `main()` has no parameters
		if (mainFunction.value.params.length > 0) {
			return new SemanticError(
				SemanticErrorCode.MainFunctionHasParameters,
				'main() function cannot have parameters',
				this.ast,
				this.getErrorContext(mainFunction.value.params[0]),
			);
		}

		// check that `main()` has no return type
		if (mainFunction.value.returnTypes.length > 0) {
			return new SemanticError(
				SemanticErrorCode.MainFunctionHasReturnType,
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
