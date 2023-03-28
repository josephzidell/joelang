import fsPromises from 'fs/promises';
import { extname } from 'path';
import { inspect } from 'util';
import LexerError from './lexer/error';
import Lexer from './lexer/lexer';
import ParserError from './parser/error';
import Parser from './parser/parser';
import { simplifyTree } from './parser/simplifier';
import { Node } from './parser/types';
import AnalysisError from './semanticAnalysis/error';
import SemanticAnalyzer from './semanticAnalysis/semanticAnalyzer';

const args = process.argv.slice(2);
// let input: string;
let pathSansExt = '';
const outFiles = {
	tokens: (pathSansExt: string) => `${pathSansExt}.tokens`,
	parseTree: (pathSansExt: string) => `${pathSansExt}.parse-tree`,
	ast: (pathSansExt: string) => `${pathSansExt}.ast.json`,
};

interface Options {
	input: string;
	debug: boolean;
	only?: 'lex' | 'parse';
}

void (async (): Promise<void> => {
	if (args.length === 0) {
		console.error('No filename or input provided.');
		process.exit(1);
	}

	// if we're analyzing an inline string, we allow all ASTs in an ASTProgram
	const isThisAnInlineAnalysis = args.includes('-i');

	const options = isThisAnInlineAnalysis ? getOptionsForInlineAnalysis(args) : await getOptionsForFileAnalysis(args);

	// if the user only wants to lex, we don't need to do anything else
	// this only applies for inline analyses
	if (options.only === 'lex') {
		const exitCode = handleLexOnly(options);

		process.exit(exitCode);
	}

	// run the parser
	const parser = new Parser(options.input, options.debug);
	const parserResult = parser.parse();
	switch (parserResult.outcome) {
		case 'ok':
			{
				// first output tokens
				if (!isThisAnInlineAnalysis) {
					const output = JSON.stringify(parser.lexer.tokens, null, '\t');
					const outFile = outFiles.tokens(pathSansExt);

					try {
						await fsPromises.writeFile(outFile, output);
					} catch (err) {
						console.error(`%cError writing Tokens to ${outFile}: ${(err as Error).message}`, 'color: red');
						process.exit(1);
					}
				}

				// then output parse tree
				const parseTree = simplifyTree([parserResult.value]);
				const output = inspect(parseTree, { compact: 1, showHidden: false, depth: null });

				if (!isThisAnInlineAnalysis) {
					const outFile = outFiles.parseTree(pathSansExt);

					try {
						await fsPromises.writeFile(outFile, output);
					} catch (err) {
						console.error(
							`%cError writing Parse Tree to ${outFile}: ${(err as Error).message}`,
							'color: red',
						);
						process.exit(1);
					}
				} else if (options.only === 'parse') {
					// this option is only supported for inline analyses
					console.info(output);

					process.exit(0);
				}

				// compile
				// analyze
				await runSemanticAnalyzer(parserResult.value, parser, isThisAnInlineAnalysis);
			}
			break;
		case 'error':
			switch (parserResult.error.constructor) {
				case LexerError:
					{
						const lexerError = parserResult.error as LexerError;

						console.groupCollapsed(`Error[Lexer]: ${lexerError.message}`);
						lexerError
							.getContext()
							.toStringArray(lexerError.message)
							.forEach((str) => console.log(str));
						console.groupEnd();
					}
					break;
				case ParserError:
					{
						const parserError = parserResult.error as ParserError;

						console.groupCollapsed(`Error[${parserError.getErrorCode()}]: ${parserError.message}`);
						parserError
							.getContext()
							.toStringArray(parserError.message)
							.forEach((str) => console.log(str));
						console.groupEnd();

						if ('getTree' in parserError) {
							console.debug('Derived CST:');
							console.debug(parserError.getTree());
						}
						console.groupEnd();
					}
					break;
			}
			break;
	}
})();

/** Runs the Semantic Analyzer and returns the exit code */
async function runSemanticAnalyzer(cst: Node, parser: Parser, isThisAnInlineAnalysis: boolean) {
	const analyzer = new SemanticAnalyzer(cst, parser);
	if (isThisAnInlineAnalysis) {
		analyzer.thisIsAnInlineAnalysis();
	}

	const analysisResult = analyzer.analyze();
	switch (analysisResult.outcome) {
		case 'ok':
			{
				if (isThisAnInlineAnalysis) {
					if (args.includes('--json')) {
						const output = JSON.stringify(analysisResult.value, null, '\t');
						console.info(output);
					} else {
						const output = inspect(analysisResult.value, {
							compact: 1,
							showHidden: false,
							depth: null,
						});
						console.info(output);
					}
				} else {
					const output = JSON.stringify(analysisResult.value, null, '\t');
					const outFile = outFiles.ast(pathSansExt);

					try {
						await fsPromises.writeFile(outFile, output);
					} catch (err) {
						console.error(`%cError writing AST to ${outFile}: ${(err as Error).message}`, 'color: red');
						return 1;
					}
				}
			}
			break;
		case 'error':
			{
				const analysisError = analysisResult.error as AnalysisError;

				console.groupCollapsed(`Error[Analysis]: ${analysisError.message}`);
				analysisError
					.getContext()
					.toStringArray(analysisError.message)
					.forEach((str) => console.info(str));
				console.groupEnd();

				console.groupCollapsed('Current Node');
				console.info(analysisError.getNode());
				console.groupEnd();

				console.groupCollapsed('CST');
				const parseTree = simplifyTree([cst]);
				const output = inspect(parseTree, { compact: 1, showHidden: false, depth: null });
				console.info(output);
				console.groupEnd();
			}

			return 1;
			break;
	}

	return 0;
}

/**
 * For lexing only, we run just the lexer. Otherwise, the parser calls the lexer itself and streams.
 *
 * @returns {number} The exit code
 */
function handleLexOnly(options: Options): number {
	const tokensResult = new Lexer(options.input).getAllTokens();

	switch (tokensResult.outcome) {
		case 'ok':
			if (tokensResult.value.length === 0) {
				console.error('No source code found');
				return 1;
			}

			console.table(tokensResult.value);
			break;
		case 'error':
			{
				const lexerError = tokensResult.error as LexerError;

				console.groupCollapsed(`Error[Lexer]: ${lexerError.message}`);
				lexerError
					.getContext()
					.toStringArray(lexerError.message)
					.forEach((str) => console.log(str));
				console.groupEnd();

				const tokens = lexerError.getTokens();
				if (tokens.length > 0) {
					console.info('Extracted tokens:');
					console.table(tokens);
				}

				return 1;
			}
			break;
	}

	return 0;
}

function getOptionsForInlineAnalysis(args: string[]): Options {
	if (args.length < 2) {
		console.error('No input string provided.');
		process.exit(1);
	}

	const inputIndex = args.indexOf('-i') + 1;

	const onlyLex = args.includes('-l');
	if (onlyLex && args.includes('-p')) {
		console.error('The -l and -p options are mutually exclusive and may not be used together.');
		process.exit(1);
	}

	const onlyParse = args.includes('-p');

	if ((onlyLex || onlyParse) && args.includes('--json')) {
		console.error('The --json option is not supported with the -l or -p options.');
		process.exit(1);
	}

	return {
		input: args[inputIndex],

		// right now, it's a bool
		debug: args.includes('-d'),

		// these options are only supported for inline analyses
		only: onlyLex ? 'lex' : onlyParse ? 'parse' : undefined,
	};
}

async function getOptionsForFileAnalysis(args: string[]): Promise<Options> {
	if (args.includes('-l')) {
		console.error('The -l option is only supported with the -i option.');
		process.exit(1);
	}

	if (args.includes('-p')) {
		console.error('The -p option is only supported with the -i option.');
		process.exit(1);
	}

	if (args.includes('--json')) {
		console.error('The --json option is only supported with the -i option.');
		process.exit(1);
	}

	const filename = args[0];

	try {
		const buf = await fsPromises.readFile(filename, undefined);

		pathSansExt = filename.replace(extname(filename), '');

		return {
			input: buf.toString(),
			debug: false, // for now
			only: undefined,
		};
	} catch (err) {
		console.error(`File ${filename} does not exist.`);
		process.exit(1);
	}
}
