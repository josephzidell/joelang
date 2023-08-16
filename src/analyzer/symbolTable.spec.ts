// import assert from 'node:assert/strict';
import { describe, it } from '@jest/globals';
import { mockParent, mockPos } from '../../jestMocks';
import '../../jestSetup'; // for the types
import {
	ASTIdentifier,
	ASTNumberLiteral,
	ASTRegularExpression,
	ASTStringLiteral,
	ASTTypeNumber,
	ASTTypeNumberInt16,
	ASTTypeNumberInt8,
	ASTTypePrimitive,
	ASTTypePrimitiveRegex,
	ASTTypePrimitiveString,
	ASTVariableDeclaration,
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
							identifiersList: [ASTIdentifier._('foo', mockPos, mockParent)],
							declaredTypes: [ASTTypeNumberInt16(mockPos, mockParent)],
							initialValues: [ASTNumberLiteral._(1, 'int16', mockPos, mockParent)],
							inferredTypes: [ASTTypeNumberInt16(mockPos, mockParent)],
						},
						mockPos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos, mockParent)],
							declaredTypes: [ASTTypeNumberInt16(mockPos, mockParent)],
							initialValues: [ASTIdentifier._('foo', mockPos, mockParent)],
							inferredTypes: [ASTTypeNumberInt16(mockPos, mockParent)], // this is coming from the symbol table
						},
						mockPos,
						mockParent,
					),
				]);
			});

			it('should get declared type from one variable to another in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo: int16 = 1; const bar = foo;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos, mockParent)],
							declaredTypes: [ASTTypeNumber._('int16', mockPos, mockParent)],
							initialValues: [ASTNumberLiteral._(1, 'int8', mockPos, mockParent)],
							inferredTypes: [ASTTypeNumberInt8(mockPos, mockParent)],
						},
						mockPos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos, mockParent)],
							declaredTypes: [ASTTypeNumberInt16(mockPos, mockParent)],
							initialValues: [ASTIdentifier._('foo', mockPos, mockParent)],
							inferredTypes: [ASTTypeNumberInt16(mockPos, mockParent)], // this is coming from the symbol table
						},
						mockPos,
						mockParent,
					),
				]);
			});

			it('should get inferred types from one variable to another in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo = 1; const bar = foo;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('foo', mockPos, mockParent)],
							declaredTypes: [ASTTypeNumberInt8(mockPos, mockParent)],
							initialValues: [ASTNumberLiteral._(1, 'int8', mockPos, mockParent)],
							inferredTypes: [ASTTypeNumberInt8(mockPos, mockParent)],
						},
						mockPos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos, mockParent)],
							declaredTypes: [ASTTypeNumberInt8(mockPos, mockParent)],
							initialValues: [ASTIdentifier._('foo', mockPos, mockParent)],
							inferredTypes: [ASTTypeNumberInt8(mockPos, mockParent)], // this is coming from the symbol table
						},
						mockPos,
						mockParent,
					),
				]);
			});

			it('should get inferred types from one variable to another in a chained assignment in the same global scope', () => {
				testAnalyzeAndSymbolTable('let foo = "hello"; let bar = foo; let baz = bar;', [
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('foo', mockPos, mockParent)],
							declaredTypes: [ASTTypePrimitive._('string', mockPos, mockParent)],
							initialValues: [ASTStringLiteral._('hello', mockPos, mockParent)],
							inferredTypes: [ASTTypePrimitiveString(mockPos, mockParent)],
						},
						mockPos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('bar', mockPos, mockParent)],
							declaredTypes: [ASTTypePrimitive._('string', mockPos, mockParent)],
							initialValues: [ASTIdentifier._('foo', mockPos, mockParent)],
							inferredTypes: [ASTTypePrimitiveString(mockPos, mockParent)], // this is coming from the symbol table
						},
						mockPos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: true,
							identifiersList: [ASTIdentifier._('baz', mockPos, mockParent)],
							declaredTypes: [ASTTypePrimitive._('string', mockPos, mockParent)],
							initialValues: [ASTIdentifier._('bar', mockPos, mockParent)],
							inferredTypes: [ASTTypePrimitiveString(mockPos, mockParent)], // this is coming from the symbol table
						},
						mockPos,
						mockParent,
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
							identifiersList: [ASTIdentifier._('foo', mockPos, mockParent)],
							declaredTypes: [ASTTypePrimitiveRegex(mockPos, mockParent)],
							initialValues: [ASTRegularExpression._({ pattern: '/a-z/', flags: [] }, mockPos, mockParent)],
							inferredTypes: [ASTTypePrimitiveRegex(mockPos, mockParent)],
						},
						mockPos,
						mockParent,
					),
					ASTVariableDeclaration._(
						{
							modifiers: [],
							mutable: false,
							identifiersList: [ASTIdentifier._('bar', mockPos, mockParent), ASTIdentifier._('baz', mockPos, mockParent)],
							declaredTypes: [ASTTypePrimitiveRegex(mockPos, mockParent), ASTTypePrimitiveRegex(mockPos, mockParent)],
							initialValues: [ASTIdentifier._('foo', mockPos, mockParent), ASTIdentifier._('foo', mockPos, mockParent)],
							inferredTypes: [ASTTypePrimitiveRegex(mockPos, mockParent), ASTTypePrimitiveRegex(mockPos, mockParent)], // this is coming from the symbol table
						},
						mockPos,
						mockParent,
					),
				]);
			});
		});
	});
});
