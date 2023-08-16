import { describe, expect, it } from '@jest/globals';
import { mockParent, mockPos } from '../../jestMocks';
import { ASTTypePrimitiveString } from './asts';
import Helpers from './helpers';

describe('analyzer/helpers.ts', (): void => {
	describe('intersect', (): void => {
		it('should take 1 type in each array and return that 1 type', () => {
			expect(
				Helpers.intersectArrays([ASTTypePrimitiveString(mockPos, mockParent)], [ASTTypePrimitiveString(mockPos, mockParent)]),
			).toEqual([ASTTypePrimitiveString(mockPos, mockParent)]);
		});
	});
});
