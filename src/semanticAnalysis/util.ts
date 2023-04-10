import { Get } from 'type-fest';
import Parser from '../parser/parser';
import { error, Result } from '../shared/result';
import { ASTProgram } from './asts';
import SemanticAnalyzer from './semanticAnalyzer';
import { SymbolTable } from './symbolTable';

/** Shortcut method to `new SemanticAnalysis(cst, parser).analyze()` */
export const analyze = (code: string, isAnInlineAnalysis: boolean): Result<[ASTProgram, SymbolTable]> => {
	const parser = new Parser(code);
	const nodeResult = parser.parse();
	switch (nodeResult.outcome) {
		case 'ok': {
			const analyzer = new SemanticAnalyzer(nodeResult.value, parser);

			if (isAnInlineAnalysis) {
				analyzer.thisIsAnInlineAnalysis();
			}

			return analyzer.analyze();
		}
		case 'error':
			return error(nodeResult.error);
	}
};

// function that takes code, an AST, and a SymbolTable
// and compares the analyzed value of the code to the AST
// and the symbol table to the structure of the SymbolTable
export function testAnalyzeAndSymbolTable(
	code: string,
	ast: Get<ASTProgram, 'declarations'>,
	_symbolTable?: SymbolTable,
) {
	expect(analyze(code, true)).toMatchAST(ast);
}
