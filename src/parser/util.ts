import { Get } from 'type-fest';
import { ASTProgram } from '../semanticAnalysis/asts';
import { analyze } from '../semanticAnalysis/util';
import { Result } from '../shared/result';
import Parser from './parser';
import { SParseTree } from './simplifier';
import { Node } from './types';

/** Shortcut method to `new Parser(code).parse()` */
export const parse = (code: string): Result<Node> => new Parser(code).parse();

// function that takes code, a simplified parse tree, and an AST
// and compares the parsed value of the code to the simplified parse tree
// and the analyzed value of the code to the AST
export function testParseAndAnalyze(
	code: string,
	simplifiedParseTree: SParseTree,
	ast: Get<ASTProgram, 'declarations'>,
) {
	expect(parse(code)).toMatchParseTree(simplifiedParseTree);
	expect(analyze(code, true)).toMatchAST(ast);
}
