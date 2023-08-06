import { describe, expect, it } from '@jest/globals';
import { intersect } from './helpers';
import { ASTTypePrimitiveString } from './asts';
import { mockPos } from '../shared/pos';

describe('analyzer/helpers.ts', (): void => {
	describe('intersect', (): void => {
		it('should take 1 type in each array and return that 1 type', () => {
			expect(intersect([ASTTypePrimitiveString(mockPos)], [ASTTypePrimitiveString(mockPos)])).toEqual([
				ASTTypePrimitiveString(mockPos),
			]);
		});
	});
});
