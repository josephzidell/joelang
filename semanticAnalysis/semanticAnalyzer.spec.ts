// write tests for semanticAnalyzer

import { ASTNumberLiteral } from './asts';

// Path: semanticAnalysis/semanticAnalyzer.ts

describe('semanticAnalyzer', () => {
	describe('ASTNumberLiteral', () => {
		describe('convertNumberValueTo', () => {
			it('should convert a number value to an AST number literal', () => {
				const numberValue = '10';
				const astNumberLiteral = ASTNumberLiteral.convertNumberValueTo(numberValue);
				expect(astNumberLiteral).toEqual({
					outcome: 'ok',
					value: ASTNumberLiteral._(10, undefined, [
						'int8',
						'int16',
						'int32',
						'int64',
						'uint8',
						'uint16',
						'uint32',
						'uint64',
					]),
				});
			});
		});
	});
});
