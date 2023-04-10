import { spawn } from 'child_process';
import fsPromises from 'fs/promises';
import path from 'path';
import { inspect } from 'util';
import CompilerError from './src/compiler/error';
import LlvmIrConverter from './src/compiler/llvm_ir_converter';
import LexerError from './src/lexer/error';
import Lexer from './src/lexer/lexer';
import ParserError from './src/parser/error';
import Parser from './src/parser/parser';
import { simplifyTree } from './src/parser/simplifier';
import { Node } from './src/parser/types';
import { ASTProgram } from './src/semanticAnalysis/asts';
import AnalysisError from './src/semanticAnalysis/error';
import SemanticAnalyzer from './src/semanticAnalysis/semanticAnalyzer';
import { SymbolTable } from './src/semanticAnalysis/symbolTable';
import { Result } from './src/shared/result';

const args = process.argv.slice(2);

let buildDir = '';

let sourceFilenameSansExt = '.inline';

const outFiles = {
	tokens: async () => path.join(buildDir, `${sourceFilenameSansExt}.tokens`),
	parseTree: async () => path.join(buildDir, `${sourceFilenameSansExt}.parse-tree`),
	ast: async () => path.join(buildDir, `${sourceFilenameSansExt}.ast.json`),
	symbols: async () => path.join(buildDir, `${sourceFilenameSansExt}.symbolTable`),

	// llvmIr currently supports multiple files, so we need to pass in the filename
	llvmIr: async (filename: string) => {
		return `${buildDir}/${filename.replace('.joe', '.ll')}`;
	},
};

type Only = 'lex' | 'parse' | 'analyze' | undefined;

interface Options {
	input: string;
	debug: boolean;
	only: Only;
}

void (async (): Promise<void> => {
	if (args.length === 0) {
		console.error('No filename or input provided.');
		process.exit(1);
	}

	// if we're analyzing an inline string, we allow all ASTs in an ASTProgram
	const isSourceFromStdin = args.includes('-i');

	const only = getOnlyOption(args);

	const options = {
		// get the input
		input: isSourceFromStdin ? await getSourceFromStdin(args, only) : await getSourceFromFile(args, only),

		// right now, it's a bool
		debug: args.includes('-d') || args.includes('--json'),

		// only run certain steps
		only,
	};

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
				if (!isSourceFromStdin) {
					const output = JSON.stringify(parser.lexer.tokens, null, '\t');
					const outFile = await outFiles.tokens();

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

				if (options.debug || options.only === 'parse') {
					console.groupCollapsed('\n=== Tokens ===\n');
					console.table(parser.lexer.tokens);
					console.groupEnd();

					console.groupCollapsed('\n=== Parse Tree ===\n');
					console.info(output);
					console.groupEnd();
				} else {
					const outFile = await outFiles.parseTree();

					try {
						await fsPromises.writeFile(outFile, output);
					} catch (err) {
						console.error(
							`%cError writing Parse Tree to ${outFile}: ${(err as Error).message}`,
							'color: red',
						);

						process.exit(1);
					}
				}

				if (options.only === 'parse') {
					process.exit(0);
				}

				// analyze
				const analyzerResult = await runSemanticAnalyzer(
					parserResult.value,
					parser,
					isSourceFromStdin,
					options,
				);
				switch (analyzerResult.outcome) {
					case 'ok':
						// compile
						await runCompiler(analyzerResult.value[0], isSourceFromStdin, options);
						break;
					case 'error':
						{
							const analyzerError = analyzerResult.error as AnalysisError;

							console.groupCollapsed(`Error[${analyzerError.getErrorCode()}]: ${analyzerError.message}`);
							analyzerError
								.getContext()
								.toStringArray(analyzerError.message)
								.forEach((str) => console.log(str));
							console.groupEnd();
						}
						break;
				}
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

/** Runs the Semantic Analyzer */
async function runSemanticAnalyzer(
	cst: Node,
	parser: Parser,
	isSourceFromStdin: boolean,
	options: Options,
): Promise<Result<[ASTProgram, SymbolTable]>> {
	const analyzer = new SemanticAnalyzer(cst, parser);
	if (isSourceFromStdin) {
		analyzer.thisIsAnInlineAnalysis();
	}

	const analysisResult = analyzer.analyze();
	switch (analysisResult.outcome) {
		case 'ok':
			{
				const [ast, symbols] = analysisResult.value;

				if (options.debug || options.only === 'analyze') {
					// output ast
					console.groupCollapsed('\n=== Abstract Syntax Tree ===\n');
					if (args.includes('--json')) {
						console.info(JSON.stringify(ast, null, '\t'));
					} else {
						console.info(inspect(ast, { compact: 1, showHidden: false, depth: null }));
					}
					console.groupEnd();

					// output symbol table
					console.groupCollapsed('\n=== Symbol Table ===\n');
					console.info(
						inspect(symbols, {
							compact: 1,
							showHidden: false,
							depth: null,
						}),
					);
					console.groupEnd();
				}

				// stop here if the user only wants to analyze
				if (options.only === 'analyze') {
					process.exit(0);
				}

				if (!isSourceFromStdin) {
					// otherwise, write the AST and symbol table to files
					{
						const output = JSON.stringify(ast, null, '\t');
						const outFile = await outFiles.ast();

						try {
							await fsPromises.writeFile(outFile, output);
						} catch (err) {
							console.error(`%cError writing AST to ${outFile}: ${(err as Error).message}`, 'color: red');
							return analysisResult;
						}
					}

					{
						const output = inspect(symbols, { compact: 1, showHidden: false, depth: null });
						const outFile = await outFiles.symbols();

						try {
							await fsPromises.writeFile(outFile, output);
						} catch (err) {
							console.error(
								`%cError writing Symbols to ${outFile}: ${(err as Error).message}`,
								'color: red',
							);
							return analysisResult;
						}
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

			return analysisResult;
			break;
	}

	return analysisResult;
}

/** Runs the Compiler */
async function runCompiler(ast: ASTProgram, isSourceFromStdin: boolean, options: Options): Promise<void> {
	// convert AST to LLVM IR and compile
	const llvmIrConverter = new LlvmIrConverter();

	const conversions = llvmIrConverter.convert({ [`${sourceFilenameSansExt}.joe`]: ast });
	for await (const [filename, conversionResult] of Object.entries(conversions)) {
		switch (conversionResult.outcome) {
			case 'ok':
				{
					const llvmModule = conversionResult.value;
					if (options.debug) {
						console.groupCollapsed('\n=== LLVM IR ===\n');
						console.info(llvmModule.print());
						console.groupEnd();
					}

					const output = llvmModule.print();
					const outFile = await outFiles.llvmIr(filename);

					try {
						await fsPromises.writeFile(outFile, output);

						// for inline analyses, we don't care about the executable file,
						// so it can go into the build directory. Otherwise, we need it.
						let executablePath = `${path.dirname(buildDir)}/${sourceFilenameSansExt}`;
						if (isSourceFromStdin) {
							executablePath = `${buildDir}/${sourceFilenameSansExt}`;
						}

						const commands = [
							// generate assembly file
							[
								`llc`,
								`${buildDir}/${sourceFilenameSansExt}.ll`,
								`-o`,
								`${buildDir}/${sourceFilenameSansExt}.s`,
							],

							// generate object file
							[
								`llc`,
								`-O2`,
								`-filetype=obj`,
								`-relocation-model=pic`,
								`${buildDir}/${sourceFilenameSansExt}.ll`,
								`-o`,
								`${buildDir}/${sourceFilenameSansExt}.o`,
							],

							// generate executable
							[`gcc`, `${buildDir}/${sourceFilenameSansExt}.o`, `-o`, executablePath],

							// make executable
							[`chmod`, `+x`, executablePath],

							// run executable
							[`${executablePath}`],
						];

						for await (const command of commands) {
							try {
								const childProcess = spawn(command.shift() as string, command, {
									shell: true,
								});

								// stdout
								if (childProcess.stdout) {
									for await (const chunkBytes of childProcess.stdout) {
										const chunk = String(chunkBytes);

										console.info(chunk);
									}
								}
								childProcess?.stdout?.on('data', function (data: string): void {
									console.info(`command output: ${data}`);
								});

								// stderr
								let stderr = '';
								if (childProcess.stderr) {
									for await (const chunk of childProcess.stderr) {
										stderr += chunk;
									}
								}

								if (stderr) {
									console.error(`Stderr Error: ${stderr}`);
								}

								// wait for childProcess to complete
								await new Promise((resolve, _reject): void => {
									childProcess.on('close', resolve);
								});
							} catch (err) {
								console.error(err);
							}
						}
					} catch (err) {
						console.error(`%cError[Compiler]: ${outFile}: ${(err as Error).message}`, 'color: red');
						continue;
					}
				}
				break;
			case 'error':
				{
					const llvmIrError = conversionResult.error as CompilerError;

					console.error(`Error[Compiler]: ${llvmIrError.getFilename()} ${llvmIrError.message}`);
				}
				break;
		}
	}
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

async function getSourceFromStdin(args: string[], only: Only): Promise<string> {
	if (args.length < 2) {
		console.error('No input string provided.');
		process.exit(1);
	}

	buildDir = await setupBuildDir(process.cwd(), only);

	const inputIndex = args.indexOf('-i') + 1;

	return args[inputIndex];
}

function getOnlyOption(args: string[]): Only {
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

	const onlyAnalyze = args.includes('-a');
	if (onlyAnalyze && (onlyLex || onlyParse)) {
		console.error('The -a option is not supported with the -l or -p options.');
		process.exit(1);
	}

	return onlyLex ? 'lex' : onlyParse ? 'parse' : onlyAnalyze ? 'analyze' : undefined;
}

async function setupBuildDir(root: string, only: Only): Promise<string> {
	const buildDir = `${root}/.build`;
	await fsPromises.mkdir(buildDir, { recursive: true });

	// delete all files in build dir if we're compiling to ensure build dir is empty
	// if `only` is set, that means we're not going all the way to the compile step.
	if (typeof only === 'undefined') {
		for (const file of await fsPromises.readdir(buildDir)) {
			await fsPromises.unlink(path.join(buildDir, file));
		}
	}

	return buildDir;
}

async function getSourceFromFile(args: string[], only: Only): Promise<string> {
	const filename = args[0];

	try {
		const buf = await fsPromises.readFile(filename, undefined);

		const parsed = path.parse(path.resolve(filename));
		buildDir = await setupBuildDir(parsed.dir, only);
		sourceFilenameSansExt = parsed.name;

		// read the file
		return buf.toString();
	} catch (err) {
		console.error(`File ${filename} does not exist.`);
		process.exit(1);
	}
}
