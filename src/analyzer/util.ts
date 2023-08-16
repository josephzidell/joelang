import { expect } from '@jest/globals';
import { Get } from 'type-fest';
import LexerError from '../lexer/error';
import ParserError from '../parser/error';
import Parser from '../parser/parser';
import { error, Result } from '../shared/result';
import { ASTProgram } from './asts';
import AnalysisError from './error';
import SemanticAnalyzer from './semanticAnalyzer';
import SemanticError from './semanticError';
import SymbolError from './symbolError';
import { SymTree } from './symbolTable';

/** Shortcut method to `new SemanticAnalysis(cst, parser).analyze()` */
export const analyze = (
	code: string,
	isASnippet: boolean,
	checkSemantics: boolean,
): Result<[ASTProgram, SymTree], LexerError | ParserError | AnalysisError | SemanticError | SymbolError> => {
	const parser = new Parser(code);
	const nodeResult = parser.parse();
	switch (nodeResult.outcome) {
		case 'ok': {
			return SemanticAnalyzer.analyze(nodeResult.value, parser, code.split('\n'), {
				isASnippet,
				checkSemantics,
			}).result;
		}
		case 'error':
			return error(nodeResult.error);
	}
};

// function that takes code, an AST, and a SymbolTable
// and compares the analyzed value of the code to the AST
// and the symbol table to the structure of the SymbolTable
// this also check the semantics
export function testAnalyzeAndSymbolTable(code: string, ast: Get<ASTProgram, 'declarations'>, _symTree?: SymTree) {
	expect(analyze(code, true, true)).toMatchAST(ast);
}
