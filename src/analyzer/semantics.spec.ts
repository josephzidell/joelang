import { describe, it } from '@jest/globals';
import { testAnalyzeExpectingSemanticError } from '../parser/util';

describe('semantics.spec.ts', (): void => {
	describe('mainFileMustHaveMainFunction', (): void => {
		it('should return an error if main() is not found', (): void => {
			testAnalyzeExpectingSemanticError(
				'', // No main() function
				'function main() not found',
			);

			testAnalyzeExpectingSemanticError(
				'f Main {}', // capitalization matters
				'function main() not found',
			);
		});

		it('should return an error if main() has type parameters', (): void => {
			testAnalyzeExpectingSemanticError('f main<|T|>() {}', 'main() cannot have type parameters');
		});

		it('should return an error if main() has parameters', (): void => {
			testAnalyzeExpectingSemanticError('f main(a: int32) {}', 'main() cannot have parameters');
		});

		it('should return an error if main() has a return type', (): void => {
			testAnalyzeExpectingSemanticError('f main() -> int32 { return 0; }', 'main() cannot have a return type');
		});
	});
});
