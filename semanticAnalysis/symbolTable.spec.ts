// import assert from 'node:assert/strict';
import { numberSizesInts } from '../shared/numbers/sizes';
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
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo')],
						declaredTypes: [],
						initialValues: [ASTNumberLiteral._(1, 'int16', ['int16'])],
						inferredPossibleTypes: [[ASTTypeNumber._('int16')]],
					}),
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('bar')],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('foo')],
						inferredPossibleTypes: [[ASTTypeNumber._('int16')]], // this is coming from the symbol table
					}),
				]);
			});

			it('should get declared type from one variable to another in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo: int16 = 1; const bar = foo;', [
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo')],
						declaredTypes: [ASTTypeNumber._('int16')],
						initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts])],
						inferredPossibleTypes: [[...NumberSizesIntASTs]],
					}),
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('bar')],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('foo')],
						inferredPossibleTypes: [[ASTTypeNumber._('int16')]], // this is coming from the symbol table
					}),
				]);
			});

			it('should get inferred types from one variable to another in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo = 1; const bar = foo;', [
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo')],
						declaredTypes: [],
						initialValues: [ASTNumberLiteral._(1, undefined, [...numberSizesInts])],
						inferredPossibleTypes: [[...NumberSizesIntASTs]],
					}),
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('bar')],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('foo')],
						inferredPossibleTypes: [[...NumberSizesIntASTs]], // this is coming from the symbol table
					}),
				]);
			});

			it('should get inferred types from one variable to another in a chained assignment in the same global scope', () => {
				testAnalyzeAndSymbolTable('let foo = "hello"; let bar = foo; let baz = bar;', [
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('foo')],
						declaredTypes: [],
						initialValues: [ASTStringLiteral._('hello')],
						inferredPossibleTypes: [[ASTTypePrimitive._('string')]],
					}),
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('bar')],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('foo')],
						inferredPossibleTypes: [[ASTTypePrimitive._('string')]], // this is coming from the symbol table
					}),
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: true,
						identifiersList: [ASTIdentifier._('baz')],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('bar')],
						inferredPossibleTypes: [[ASTTypePrimitive._('string')]], // this is coming from the symbol table
					}),
				]);
			});
		});

		describe('from single variable to two variables', () => {
			it('should get inferred types from one variable to two variables in the same global scope', () => {
				testAnalyzeAndSymbolTable('const foo = /a-z/; const bar, baz = foo, foo;', [
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('foo')],
						declaredTypes: [],
						initialValues: [ASTRegularExpression._({ pattern: '/a-z/', flags: [] })],
						inferredPossibleTypes: [[ASTTypePrimitiveRegex]],
					}),
					ASTVariableDeclaration._({
						modifiers: [],
						mutable: false,
						identifiersList: [ASTIdentifier._('bar'), ASTIdentifier._('baz')],
						declaredTypes: [],
						initialValues: [ASTIdentifier._('foo'), ASTIdentifier._('foo')],
						inferredPossibleTypes: [[ASTTypePrimitiveRegex], [ASTTypePrimitiveRegex]], // this is coming from the symbol table
					}),
				]);
			});
		});
	});
});
