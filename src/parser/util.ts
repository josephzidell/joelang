import assert from 'assert';
import { Get } from 'type-fest';
import { ASTProgram } from '../analyzer/asts';
import SemanticError from '../analyzer/semanticError';
import { analyze } from '../analyzer/util';
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
	codeSnippet: string,
	simplifiedParseTree: SParseTree,
	ast: Get<ASTProgram, 'declarations'>,
) {
	expect(parse(codeSnippet)).toMatchParseTree(simplifiedParseTree);
	expect(analyze(codeSnippet, true)).toMatchAST(ast);
}

/**
 * Analyze some code, expecting a SemanticError.
 *
 * NOTE: unlike other testXyz() shortcut methods, this method
 * expects a full program including a `main()` function.
 */
export function testAnalyzeExpectingSemanticError(codeFullProgram: string, errorCode: string) {
	const result = analyze(codeFullProgram, false); // false because we're testing for any semantic error, so treat this as a full program
	expect(result.outcome).toEqual('error'); // this is for Developer Experience
	assert(result.outcome === 'error'); // this is for TypeScript
	assert(
		result.error instanceof SemanticError,
		`Expected result.error to be an instance of SemanticError, but it was '${result.error}'`,
	);
	expect(result.error.getErrorCode()).toEqual(errorCode);
}
