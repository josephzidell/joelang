import { testParseAndAnalyze, testAnalyzeExpectingSemanticError } from "../parser/util";
import SemanticError, { SemanticErrorCode } from "./semanticError";

describe('semantics.spec.ts', (): void => {
	describe('mainFileMustHaveMainFunction', (): void => {
		it('should return an error if main() is not found', (): void => {
			testAnalyzeExpectingSemanticError(
				'', // No main() function
				SemanticErrorCode.MainFunctionNotFound,
			);

			testAnalyzeExpectingSemanticError(
				'f Main {}', // capitalization matters
				SemanticErrorCode.MainFunctionNotFound,
			);
		});

		it('should return an error if main() has type parameters', (): void => {
			testAnalyzeExpectingSemanticError(
				'f main<|T|>() {}',
				SemanticErrorCode.MainFunctionHasTypeParameters,
			);
		});

		it('should return an error if main() has parameters', (): void => {
			testAnalyzeExpectingSemanticError(
				'f main(a: int32) {}',
				SemanticErrorCode.MainFunctionHasParameters,
			);
		});

		it('should return an error if main() has a return type', (): void => {
			testAnalyzeExpectingSemanticError(
				'f main() -> int32 {}',
				SemanticErrorCode.MainFunctionHasReturnType,
			);
		});
	});
})
