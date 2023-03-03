import { Get } from "type-fest";
import SemanticAnalysis, { AST, ASTProgram } from "../sean/sean";
import { error, Result } from "../shared/result";
import Parser from "./parser";
import { SParseTree } from "./simplifier";
import { Node } from './types';

/** Shortcut method to `new Parser(code).parse()` */
export const parse = (code: string): Result<Node> => new Parser(code).parse();

/** Shortcut method to `new SemanticAnalysis(cst, parser).analyze()` */
export const analyze = (code: string): Result<ASTProgram> => {
	const parser = new Parser(code);
	const nodeResult = parser.parse();
	switch (nodeResult.outcome) {
		case 'ok':
			return new SemanticAnalysis(nodeResult.value, parser).analyze();
		case 'error':
			return error(nodeResult.error);
	}
};

// function that takes code, a simplified parse tree, and an AST
// and compares the parsed value of the code to the simplified parse tree
// and the analyzed value of the code to the AST
export function testParseAndAnalyze (code: string, simplifiedParseTree: SParseTree, ast: Get<ASTProgram, 'expressions'>) {
	expect(parse(code)).toMatchParseTree(simplifiedParseTree);
	expect(analyze(code)).toMatchAST(ast);
}
