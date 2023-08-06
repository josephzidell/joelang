import { describe, it } from '@jest/globals';
import { testAnalyzeExpectingSemanticError } from '../parser/util';
import { SemanticErrorCode } from './semanticError';

describe('semantics.spec.ts', (): void => {
	describe('mainFileMustHaveMainFunction', (): void => {
		it('should return an error if main() is not found', (): void => {
			testAnalyzeExpectingSemanticError(
				'', // No main() function
				SemanticErrorCode.FunctionNotFound,
			);

			testAnalyzeExpectingSemanticError(
				'f Main {}', // capitalization matters
				SemanticErrorCode.FunctionNotFound,
			);
		});

		it('should return an error if main() has type parameters', (): void => {
			testAnalyzeExpectingSemanticError('f main<|T|>() {}', SemanticErrorCode.TypeParametersNotExpected);
		});

		it('should return an error if main() has parameters', (): void => {
			testAnalyzeExpectingSemanticError('f main(a: int32) {}', SemanticErrorCode.ParameterNotExpected);
		});

		it('should return an error if main() has a return type', (): void => {
			testAnalyzeExpectingSemanticError('f main() -> int32 { return 0; }', SemanticErrorCode.ReturnTypeNotExpected);
		});
	});
});
