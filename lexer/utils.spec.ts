import { standardizeLineEndings } from './util';

describe('utils.ts', (): void => {
	describe('standardizeLineEndings', (): void => {
		it('does not change anything with unix line endings', (): void => {
			expect(standardizeLineEndings('a\nb')).toBe('a\nb');
		});

		it('fixes windows line endings', (): void => {
			expect(standardizeLineEndings('a\r\nb')).toBe('a\nb');
		});
	});
});
