import { spawn } from 'child_process';
import fsPromises from 'fs/promises';
import path from 'path';
import { inspect } from 'util';
import { ASTProgram } from '../analyzer/asts';
import AnalysisError from '../analyzer/error';
import SemanticAnalyzer from '../analyzer/semanticAnalyzer';
import SemanticError from '../analyzer/semanticError';
import SymbolError from '../analyzer/symbolError';
import { SymTree } from '../analyzer/symbolTable';
import CompilerError from '../compiler/error';
import LexerError from '../lexer/error';
import Lexer from '../lexer/lexer';
import { standardizeLineEndings } from '../lexer/util';
import ParserError from '../parser/error';
import Parser from '../parser/parser';
import { simplifyTree } from '../parser/simplifier';
import { Node } from '../parser/types';
import { handleProcessOutput } from '../shared/command';
import { Result, ResultError, error, ok } from '../shared/result';
import LlvmIrConverter from './llvm_ir_converter';
import { llcCommand } from './system';

export class Compiler {
	private cliArgs: string[];
	private buildDir = '';
	private source: Source = {
		fromStdin: false,
		code: '',
		loc: [],
	};
	private isASnippet: boolean;
	private debug = false;
	private stopAfterStep: StopCompilerAfterStep;
	private sourceFilenameSansExt = '.inline';

	private targetPaths = {
		tokens: () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.tokens`),
		parseTree: () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.parse-tree`),
		ast: () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.ast.json`),
		symbols: () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.symbolTable`),

		llvmIr: (filename: string) => path.join(this.buildDir, filename.replace('.joe', '.ll')),
		llvmBitcode: () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.bc`),

		executable: () => {
			// for inline analyses, we don't care about the executable file,
			// so it can go into the build directory. Otherwise, we need it.
			if (this.source.fromStdin) {
				return `${this.buildDir}/${this.sourceFilenameSansExt}`;
			}

			return `${path.dirname(this.buildDir)}/${this.sourceFilenameSansExt}`;
		},
	};

	public constructor(args: string[]) {
		if (args.length === 0) {
			throw new Error('No filename or input provided.');
		}

		this.cliArgs = args;

		this.source.fromStdin = this.cliArgs.includes('-i');

		this.isASnippet = false;
	}

	/**
	 * Compile the code.
	 *
	 * @returns `true` if the compilation was successful, `false` otherwise
	 */
	public async compile(): Promise<boolean> {
		await this.processOptions();

		// if the user wants to stop after lex, we don't need to do anything else
		// this only applies for inline analyses
		if (this.stopAfterStep === 'lex') {
			const exitCode = this.handleLexOnly();

			process.exit(exitCode);
		}

		// continue to the parser
		const parser = new Parser(this.source.code, this.debug);
		const parserResult = parser.parse();
		if (parserResult.outcome === 'error') {
			this.handleErrorFromParser(parserResult);

			return false;
		}
		await this.afterParser(parser, parserResult);
		if (this.stopAfterStep === 'parse') {
			process.exit(0);
		}

		// continue to the semantic analyzer
		const analyzerResult = await this.runSemanticAnalyzer(parserResult.value, parser);
		if (analyzerResult.outcome === 'error') {
			this.handleErrorFromSemanticAnalyzer(analyzerResult);

			return false;
		}

		// continue to the compiler
		const [ast, symTree] = analyzerResult.value;
		const compilerResult = await this.runCompiler(ast, symTree, this.source.loc);
		if (compilerResult.outcome === 'error') {
			this.handleErrorFromCompiler(compilerResult);

			await this.afterCompiler(false);

			return false;
		}

		await this.afterCompiler(compilerResult.outcome === 'ok');

		return true;
	}

	private async afterCompiler(runExecutable: boolean) {
		// for inline analyses, we need to run the executable
		if (runExecutable && this.source.fromStdin) {
			const childProcess = spawn(this.targetPaths.executable());

			await handleProcessOutput(childProcess);
		}

		// delete the this.buildDir directory
		if (!this.debug) {
			await fsPromises.rm(this.buildDir, { recursive: true });
		}
	}

	private handleErrorFromSemanticAnalyzer(
		errorResult: ResultError<AnalysisError | SemanticError | SymbolError, unknown>,
	) {
		if (errorResult.error instanceof AnalysisError) {
			const error = errorResult.error;

			console.groupCollapsed(`Error[Analysis/${error.getErrorCode()}]: ${error.message}`);
			error
				.getContext()
				.toStringArray(error.message)
				.forEach((str) => console.info(str));
			console.groupEnd();

			if (this.debug) {
				console.groupCollapsed('Current Node');
				console.info(error.getNode());
				console.groupEnd();

				if (typeof errorResult.data !== 'undefined' && errorResult.data?.constructor.name === 'Node') {
					console.groupCollapsed('CST');
					const parseTree = simplifyTree([errorResult.data as unknown as Node]);
					const output = inspect(parseTree, { compact: 1, showHidden: false, depth: null });
					console.info(output);
					console.groupEnd();
				}
			}
		} else if (errorResult.error instanceof SemanticError) {
			const error = errorResult.error;

			console.groupCollapsed(`Error[Semantics/${error.getErrorCode()}]: ${error.message}`);
			error
				.getContext()
				.toStringArray(error.message)
				.forEach((str) => console.info(str));
			console.groupEnd();

			if (this.debug) {
				console.groupCollapsed('Current AST');
				console.info(error.getAST());
				console.groupEnd();
			}
		} else if (errorResult.error instanceof SymbolError) {
			const error = errorResult.error;

			console.groupCollapsed(`Error[Symbol]: ${error.getErrorCode()} ${error.message}`);
			error
				.getContext()
				.toStringArray(error.message)
				.forEach((str) => console.info(str));
			if (this.debug) {
				error.getSymNode()?.getDebug();
			}
			console.groupEnd();
		} else {
			const error = errorResult.error as Error;

			console.error(`Unhandled Error type in handleErrorFromSemanticAnalyzer: ${error.constructor.name}`);
			console.error(`Error[Unknown]: ${error.message}`);
		}
	}

	private handleErrorFromCompiler(compilerResult: { outcome: 'error'; error: Error; data?: unknown }) {
		if (compilerResult.error instanceof CompilerError) {
			const llvmIrError = compilerResult.error as CompilerError;

			console.groupCollapsed(`Error[Compiler/LLVM]: ${llvmIrError.getFilename()} ${llvmIrError.message}`);
			llvmIrError
				.getContext()
				.toStringArray(llvmIrError.message)
				.forEach((str) => console.log(str));
			console.groupEnd();
		} else {
			console.groupCollapsed(`Error[Compiler]: ${compilerResult.error.message}`);
			console.log(compilerResult.error);
			console.groupEnd();
		}
	}

	private async afterParser(parser: Parser, parserResult: { outcome: 'ok'; value: Node }) {
		// first output tokens
		if (!this.source.fromStdin) {
			const output = JSON.stringify(parser.lexer.tokens, null, '\t');
			const tokensFilePath = this.targetPaths.tokens();

			if (!(await this.writeToFile(tokensFilePath, output, 'Tokens'))) {
				process.exit(1);
			}
		}

		// then output parse tree
		const parseTree = simplifyTree([parserResult.value]);
		const output = inspect(parseTree, { compact: 1, showHidden: false, depth: null });

		if (this.debug || this.stopAfterStep === 'parse') {
			console.groupCollapsed('\n=== Tokens ===\n');
			console.table(parser.lexer.tokens);
			console.groupEnd();

			console.groupCollapsed('\n=== Parse Tree ===\n');
			console.info(output);
			console.groupEnd();
		} else {
			const parseTreeFilePath = this.targetPaths.parseTree();

			if (!(await this.writeToFile(parseTreeFilePath, output, 'Parse Tree'))) {
				process.exit(1);
			}
		}
	}

	private handleErrorFromParser(parserResult: { outcome: 'error'; error: Error; data?: unknown }) {
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

					console.groupCollapsed(`Error[Parser/${parserError.getErrorCode()}]: ${parserError.message}`);
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
	}

	private async writeToFile(filePath: string, contents: string, nameForErrorMessage: string): Promise<boolean> {
		try {
			await fsPromises.writeFile(filePath, contents);

			return true;
		} catch (err) {
			console.error(
				`%cError writing ${nameForErrorMessage} to ${filePath}: ${(err as Error).message}`,
				'color: red',
			);

			return false;
		}
	}

	/** Runs the Compiler */
	private async runCompiler(ast: ASTProgram, symTree: SymTree, loc: string[]): Promise<Result<unknown>> {
		// convert AST to LLVM IR and compile
		try {
			const llvmIrConverter = new LlvmIrConverter(symTree, this.debug);
			const filename = `${this.sourceFilenameSansExt}.joe`;
			const conversionResult = llvmIrConverter.convert(filename, ast, loc);

			// if the conversion was successful, the module will be in the value property
			// otherwise, it will be in the data property
			// Although usually we would return early in the case of an error, however
			// we want to output the LLVM IR even if there is an error
			const llvmModule = conversionResult.outcome === 'ok' ? conversionResult.value : conversionResult.data;
			if (typeof llvmModule === 'undefined') {
				return conversionResult;
			}

			if (this.debug) {
				console.groupCollapsed('\n=== LLVM IR ===\n');
				console.info(llvmModule.print());
				console.groupEnd();
			}

			const output = llvmModule.print();
			const llvmIrFilePath = this.targetPaths.llvmIr(filename);

			try {
				await fsPromises.writeFile(llvmIrFilePath, output);
			} catch (err) {
				console.error(`%cError[Compiler]: ${llvmIrFilePath}: ${(err as Error).message}`, 'color: red');
			}

			// now, we return early if there was a conversion error
			if (conversionResult.outcome === 'error') {
				process.exit(-1);
			}

			if (this.stopAfterStep === 'll') {
				process.exit(0);
			}

			const bitcodePath = this.targetPaths.llvmBitcode();
			const generateBitcodeFileResult = await llvmIrConverter.generateBitcode(bitcodePath);
			if (generateBitcodeFileResult.outcome === 'error') {
				return generateBitcodeFileResult;
			}

			const executablePath = this.targetPaths.executable();

			const commands = [
				// generate object file
				[
					llcCommand,
					`-O2`,
					`-filetype=obj`,
					`-relocation-model=pic`,
					`${this.buildDir}/${this.sourceFilenameSansExt}.ll`,
					`-o`,
					`${this.buildDir}/${this.sourceFilenameSansExt}.o`,
				],

				// generate executable
				[
					`gcc`,
					`${this.buildDir}/${this.sourceFilenameSansExt}.o`,
					`${process.env.PWD}/stdlib/c/io.o`,
					`-o`,
					executablePath,
				],
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

			return ok(undefined);
		} catch (err) {
			return error(err as Error);
		}
	}

	private getOptionToStopAfterStep(): StopCompilerAfterStep {
		const stopAfterLex = this.cliArgs.includes('-l');
		if (stopAfterLex && this.cliArgs.includes('-p')) {
			throw new Error('The -l and -p options are mutually exclusive and may not be used together.');
		}

		const stopAfterParse = this.cliArgs.includes('-p');
		if ((stopAfterLex || stopAfterParse) && this.cliArgs.includes('--json')) {
			throw new Error('The --json option is not supported with the -l or -p options.');
		}

		const stopAfterAnalyze = this.cliArgs.includes('-a');
		if (stopAfterAnalyze && (stopAfterLex || stopAfterParse)) {
			throw new Error('The -a option is not supported with the -l or -p options.');
		}

		const stopAfterLLVM = this.cliArgs.includes('-ll');
		if (stopAfterLLVM && (stopAfterAnalyze || stopAfterLex || stopAfterParse)) {
			throw new Error('The -ll option is not supported with the -l, -p, or -a options.');
		}

		return stopAfterLex
			? 'lex'
			: stopAfterParse
			? 'parse'
			: stopAfterAnalyze
			? 'analyze'
			: stopAfterLLVM
			? 'll'
			: undefined;
	}

	private async processOptions(): Promise<void> {
		// get the input and fix line endings
		this.source.code = this.source.fromStdin ? await this.getSourceFromStdin() : await this.getSourceFromFile();
		this.source.code = standardizeLineEndings(this.source.code);

		// get the loc
		this.source.loc = this.source.code.split('\n');

		// right now, it's a bool
		this.debug = this.cliArgs.includes('-d') || this.cliArgs.includes('--json');

		// stop after running certain steps
		this.stopAfterStep = this.getOptionToStopAfterStep();
	}

	private async getSourceFromStdin(): Promise<string> {
		if (this.cliArgs.length < 2) {
			throw new Error('No input string provided.');
		}

		this.buildDir = await this.setupBuildDir(process.cwd());

		const inputIndex = this.cliArgs.indexOf('-i') + 1;

		return this.cliArgs[inputIndex];
	}

	private async getSourceFromFile(): Promise<string> {
		const userPassedPath = this.cliArgs[0];
		let fileToCompile = userPassedPath;
		// check if the userPassedPath is a directory
		// if it is, we'll look for a file named main.joe in that directory
		if ((await fsPromises.stat(userPassedPath)).isDirectory()) {
			fileToCompile = path.resolve(userPassedPath, 'main.joe');
		}

		try {
			const buf = await fsPromises.readFile(fileToCompile, undefined);

			const parsed = path.parse(path.resolve(userPassedPath));
			this.buildDir = await this.setupBuildDir(parsed.dir);
			this.sourceFilenameSansExt = parsed.name;

			// read the file
			return buf.toString();
		} catch (err) {
			console.error(`File ${fileToCompile} does not exist.`);
			process.exit(1);
		}
	}

	/**
	 * For lexing only, we run just the lexer. Otherwise, the parser calls the lexer itself and streams.
	 *
	 * @returns {number} The exit code
	 */
	private handleLexOnly(): number {
		const tokensResult = new Lexer(this.source.code).getAllTokens();

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

	private async setupBuildDir(root: string): Promise<string> {
		const buildDir = `${root}/.build`;
		await fsPromises.mkdir(buildDir, { recursive: true });

		// delete all files in build dir if we're compiling, to ensure build dir is empty
		// if `stopAfterStep` is set, that means we're not going all the way to the compile step.
		if (typeof this.getOptionToStopAfterStep() === 'undefined') {
			for (const file of await fsPromises.readdir(buildDir)) {
				await fsPromises.unlink(path.join(buildDir, file));
			}
		}

		return buildDir;
	}

	/** Runs the Semantic Analyzer */
	private async runSemanticAnalyzer(
		cst: Node,
		parser: Parser,
	): Promise<Result<[ASTProgram, SymTree], AnalysisError | SemanticError | SymbolError>> {
		const analyzer = new SemanticAnalyzer(cst, parser, this.source.loc, {
			isASnippet: false,
			debug: this.debug,
		});

		const analysisResult = analyzer.analyze();
		switch (analysisResult.outcome) {
			case 'ok':
				{
					const [ast, symTree] = analysisResult.value;

					if (this.debug || this.stopAfterStep === 'analyze') {
						// output ast
						console.groupCollapsed('\n=== Abstract Syntax Tree ===\n');
						if (this.cliArgs.includes('--json')) {
							console.info(JSON.stringify(ast, null, '\t'));
						} else {
							console.info(inspect(ast, { compact: 1, showHidden: false, depth: null }));
						}
						console.groupEnd();

						// output symbol table
						console.groupCollapsed('\n=== Symbol Table ===\n');
						console.info(
							inspect(symTree.root.table, {
								compact: 1,
								showHidden: false,
								depth: null,
							}),
						);
						console.groupEnd();
					}

					// stop here if the user wants to stop after analyze
					if (this.stopAfterStep === 'analyze') {
						process.exit(0);
					}

					if (!this.source.fromStdin) {
						// otherwise, write the AST and symbol table to files
						{
							const output = JSON.stringify(ast, null, '\t');
							const astFilePath = await this.targetPaths.ast();

							if (!(await this.writeToFile(astFilePath, output, 'AST'))) {
								return analysisResult;
							}
						}

						{
							const output = inspect(symTree, { compact: 1, showHidden: false, depth: null });
							const symbolTableFilePath = this.targetPaths.symbols();

							if (!(await this.writeToFile(symbolTableFilePath, output, 'Symbol Table'))) {
								return analysisResult;
							}
						}
					}
				}
				break;
			case 'error':
				analysisResult.data = analyzer.cst;
				return analysisResult;
				break;
		}

		return analysisResult;
	}
}
