// import assert from 'node:assert/strict';
import '../../setupJest'; // for the types
import { numberSizesInts } from '../shared/numbers/sizes';
import { mockPos } from '../shared/pos';
import {
	ASTIdentifier,
	ASTNumberLiteral,
	ASTRegularExpression,
	ASTStringLiteral,
	ASTTypeNumber,
	ASTTypePrimitive,
	ASTTypePrimitiveRegex,
	ASTVariableDeclaration,
	NumberSizesIntASTs,
} from './asts';
import { testAnalyzeAndSymbolTable } from './util';

describe('symbolTable', () => {
	describe('inference', () => {
		describe('from single variable to single variable', () => {
			it("should get number size from one variable's value to another in the same global scope", () => {
				testAnalyzeAndSymbolTable('const foo = 1_int16; const bar = foo;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [ASTNumberLiteral._(1, 'int16', ['int16'], mockPos)],
							inferredPossibleTypes: [[ASTTypeNumber._('int16', mockPos)]],
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos)],
							declaredTypes: [],
							initialValues: [ASTIdentifier._('foo', mockPos)],
							inferredPossibleTypes: [[ASTTypeNumber._('int16', mockPos)]], // this is coming from the symbol table
						},
						mockPos,
					),
				]);
			});

			it('should get declared type from one variable to another in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo: int16 = 1; const bar = foo;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [ASTTypeNumber._('int16', mockPos)],
							initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
							inferredPossibleTypes: [[]],
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos)],
							declaredTypes: [],
							initialValues: [ASTIdentifier._('foo', mockPos)],
							inferredPossibleTypes: [[ASTTypeNumber._('int16', mockPos)]], // this is coming from the symbol table
						},
						mockPos,
					),
				]);
			});

			it('should get inferred types from one variable to another in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo = 1; const bar = foo;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts], mockPos)],
							inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))],
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos)],
							declaredTypes: [],
							initialValues: [ASTIdentifier._('foo', mockPos)],
							inferredPossibleTypes: [NumberSizesIntASTs.map((ns) => ns(mockPos))], // this is coming from the symbol table
						},
						mockPos,
					),
				]);
			});

			it('should get inferred types from one variable to another in a chained assignment in the same global scope', () => {
				testAnalyzeAndSymbolTable('let foo = "hello"; let bar = foo; let baz = bar;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [ASTStringLiteral._('hello', mockPos)],
							inferredPossibleTypes: [[ASTTypePrimitive._('string', mockPos)]],
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('bar', mockPos)],
							declaredTypes: [],
							initialValues: [ASTIdentifier._('foo', mockPos)],
							inferredPossibleTypes: [[ASTTypePrimitive._('string', mockPos)]], // this is coming from the symbol table
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('baz', mockPos)],
							declaredTypes: [],
							initialValues: [ASTIdentifier._('bar', mockPos)],
							inferredPossibleTypes: [[ASTTypePrimitive._('string', mockPos)]], // this is coming from the symbol table
						},
						mockPos,
					),
				]);
			});
		});

		describe('from single variable to two variables', () => {
			it('should get inferred types from one variable to two variables in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo = /a-z/; const bar, baz = foo, foo;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos)],
							declaredTypes: [],
							initialValues: [ASTRegularExpression._({ pattern: '/a-z/', flags: [] }, mockPos)],
							inferredPossibleTypes: [[ASTTypePrimitiveRegex(mockPos)]],
						},
						mockPos,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos), ASTIdentifier._('baz', mockPos)],
							declaredTypes: [],
							initialValues: [ASTIdentifier._('foo', mockPos), ASTIdentifier._('foo', mockPos)],
							inferredPossibleTypes: [[ASTTypePrimitiveRegex(mockPos)], [ASTTypePrimitiveRegex(mockPos)]], // this is coming from the symbol table
						},
						mockPos,
					),
				]);
			});
		});
	});
});
