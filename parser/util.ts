import { Get } from "type-fest";
import { ASTProgram } from "../semanticAnalysis/asts";
import SemanticAnalyzer from "../semanticAnalysis/semanticAnalyzer";
import { error, Result } from "../shared/result";
import Parser from "./parser";
import { SParseTree } from "./simplifier";
import { Node } from './types';

/** Shortcut method to `new Parser(code).parse()` */
export const parse = (code: string): Result<Node> => new Parser(code).parse();

/** Shortcut method to `new SemanticAnalysis(cst, parser).analyze()` */
export const analyze = (code: string, isAnInlineAnalysis: boolean): Result<ASTProgram> => {
	const parser = new Parser(code);
	const nodeResult = parser.parse();
	switch (nodeResult.outcome) {
		case 'ok':
			const analyzer = new SemanticAnalyzer(nodeResult.value, parser);

			if (isAnInlineAnalysis) {
				analyzer.thisIsAnInlineAnalysis();
			}

			return analyzer.analyze();
		case 'error':
			return error(nodeResult.error);
	}
};

// function that takes code, a simplified parse tree, and an AST
// and compares the parsed value of the code to the simplified parse tree
// and the analyzed value of the code to the AST
export function testParseAndAnalyze (code: string, simplifiedParseTree: SParseTree, ast: Get<ASTProgram, 'expressions'>) {
	expect(parse(code)).toMatchParseTree(simplifiedParseTree);
	expect(analyze(code, true)).toMatchAST(ast);
}
