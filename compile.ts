import fsPromises from 'fs/promises';
import { basename, extname, join } from 'path';
import { inspect } from 'util';
import LexerError from './lexer/error';
import ParserError from './parser/error';
import Parser from './parser/parser';
import { simplifyTree } from './parser/simplifier';
import AnalysisError from './semanticAnalysis/error';
import SemanticAnalyzer from './semanticAnalysis/semanticAnalyzer';

const args = process.argv.slice(2);
let input: string;
let outfile: string | undefined;

void (async (): Promise<void> => {
	if (args.length === 0) {
		console.error('No filename or input provided.');
		process.exit(1);
	}

	// if we're analyzing an inline string, we allow all ASTs in an ASTProgram
	const isThisAnInlineAnalysis = args.includes('-i');

	if (isThisAnInlineAnalysis) {
		if (args.length < 2) {
			console.error('No input string provided.');
			process.exit(1);
		}

		const inputIndex = args.indexOf('-i') + 1;
		input = args[inputIndex];
	} else {
		const filename = args[0];

		try {
			const buf = await fsPromises.readFile(filename, undefined);
			input = buf.toString();
		} catch (err) {
			console.error(`File ${filename} does not exist.`);
			process.exit(1);
		}

		if (!args.includes('-o')) {
			const baseName = basename(filename, extname(filename));
			const outExt = process.platform === 'win32' ? '.exe' : '';
			outfile = join(process.cwd(), `${baseName}${outExt}`);
		}
	}

	if (args.includes('-o')) {
		const outfileIndex = args.indexOf('-o') + 1;

		if (outfileIndex >= args.length) {
			console.error('No outfile filename provided.');
			process.exit(1);
		}

		outfile = args[outfileIndex];
	}

	// right now, it's a bool
	const debug = args.includes('-d');

	const onlyParse = args.includes('-p');

	// compile
	// for now, parse and output AST
	const parser = new Parser(input, debug);
	const treeResult = parser.parse();
	switch (treeResult.outcome) {
		case 'ok':
			// NEW: continue to SemanticAnalysis
			if (!onlyParse) {
				const analyzer = new SemanticAnalyzer(treeResult.value, parser);
				if (isThisAnInlineAnalysis) {
					analyzer.thisIsAnInlineAnalysis();
				}

				const analysisResult = analyzer.analyze();
				switch (analysisResult.outcome) {
					case 'ok':
						{
							const output = inspect(analysisResult.value, { compact: 1, showHidden: false, depth: null });
							console.info(output);
						}
						break;
					case 'error':
						{
							const analysisError = analysisResult.error as AnalysisError;

							console.groupCollapsed(`Error[Analysis]: ${analysisError.message}`);
							analysisError.getContext().toStringArray(analysisError.message).forEach(str => console.info(str));
							console.groupEnd();

							console.groupCollapsed('Current Node');
							console.info(analysisError.getNode());
							console.groupEnd();

							console.groupCollapsed('CST');
							const parseTree = simplifyTree([treeResult.value]);
							const output = inspect(parseTree, { compact: 1, showHidden: false, depth: null });
							console.info(output);
							console.groupEnd();
						}

						process.exit(1);
						break;
				}
			}

			// output simplified tree
			const parseTree = simplifyTree([treeResult.value]);
			const output = inspect(parseTree, { compact: 1, showHidden: false, depth: null });

			if (typeof outfile === 'string') {
				try {
					await fsPromises.writeFile(outfile, output);
				} catch (err) {
					console.error(`%cError writing to outfile ${outfile}: ${(err as Error).message}`, 'color: red');
					process.exit(1);
				}
			} else {
				console.info(output);
			}
			break;
		case 'error':
			switch (treeResult.error.constructor) {
				case LexerError:
					const lexerError = treeResult.error as LexerError;

					console.groupCollapsed(`Error[Lexer]: ${lexerError.message}`);
					lexerError.getContext().toStringArray(lexerError.message).forEach(str => console.log(str));
					console.groupEnd();
					break;
				case ParserError:
					const parserError = treeResult.error as ParserError;

					console.groupCollapsed(`Error[${parserError.getErrorCode()}]: ${parserError.message}`);
					parserError.getContext().toStringArray(parserError.message).forEach(str => console.log(str));
					console.groupEnd();

					if ('getTree' in parserError) {
						console.debug('Derived CST:');
						console.debug(parserError.getTree());
					}
					console.groupEnd();

					break;
			}
			break;
	}
})();
