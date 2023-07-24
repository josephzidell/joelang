import { Get } from 'type-fest';
import Parser from '../parser/parser';
import { error, Result } from '../shared/result';
import { ASTProgram } from './asts';
import SemanticAnalyzer from './semanticAnalyzer';
import { SymTree } from './symbolTable';

/** Shortcut method to `new SemanticAnalysis(cst, parser).analyze()` */
export const analyze = (code: string, isASnippet: boolean): Result<[ASTProgram, SymTree]> => {
	const parser = new Parser(code);
	const nodeResult = parser.parse();
	switch (nodeResult.outcome) {
		case 'ok': {
			const analyzer = new SemanticAnalyzer(nodeResult.value, parser, code.split('\n'), {
				isASnippet,
				debug: false,
			});

			return analyzer.analyze();
		}
		case 'error':
			return error(nodeResult.error);
	}
};

// function that takes code, an AST, and a SymbolTable
// and compares the analyzed value of the code to the AST
// and the symbol table to the structure of the SymbolTable
export function testAnalyzeAndSymbolTable(code: string, ast: Get<ASTProgram, 'declarations'>, _symTree?: SymTree) {
	expect(analyze(code, true)).toMatchAST(ast);
}
