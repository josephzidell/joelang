// write a class Compiler that takes cli args

import { spawn } from 'child_process';
import fsPromises from 'fs/promises';
import llvm from 'llvm-bindings';
import path from 'path';
import { inspect } from 'util';
import { ASTProgram } from '../analyzer/asts';
import AnalysisError from '../analyzer/error';
import SemanticAnalyzer from '../analyzer/semanticAnalyzer';
import { SymbolTable } from '../analyzer/symbolTable';
import CompilerError from '../compiler/error';
import LexerError from '../lexer/error';
import Lexer from '../lexer/lexer';
import ParserError from '../parser/error';
import Parser from '../parser/parser';
import { simplifyTree } from '../parser/simplifier';
import { Node } from '../parser/types';
import { Result } from '../shared/result';
import LlvmIrConverter from './llvm_ir_converter';

export class Compiler {
	private cliArgs: string[];
	private buildDir = '';
	private source: Source = {
		fromStdin: false,
		code: '',
	};
	private debug = false;
	private stopAfterStep: StopCompilerAfterStep;
	private sourceFilenameSansExt = '.inline';

	private targetPaths = {
		tokens: async () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.tokens`),
		parseTree: async () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.parse-tree`),
		ast: async () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.ast.json`),
		symbols: async () => path.join(this.buildDir, `${this.sourceFilenameSansExt}.symbolTable`),

		// llvmIr currently supports multiple files, so we need to pass in the filename
		llvmIr: async (filename: string) => {
			return `${this.buildDir}/${filename.replace('.joe', '.ll')}`;
		},
	};

	public constructor(args: string[]) {
		if (args.length === 0) {
			throw new Error('No filename or input provided.');
		}

		this.cliArgs = args;

		this.source.fromStdin = this.cliArgs.includes('-i');
	}

	public async compile(): Promise<void> {
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

			return;
		}
		await this.afterParser(parser, parserResult);
		if (this.stopAfterStep === 'parse') {
			process.exit(0);
		}

		// continue to the semantic analyzer
		const analyzerResult = await this.runSemanticAnalyzer(parserResult.value, parser);
		if (analyzerResult.outcome === 'error') {
			this.handleErrorFromSemanticAnalyzer(analyzerResult);

			return;
		}

		// continue to the compiler
		await this.runCompiler(analyzerResult.value[0]);
		await this.afterCompiler();
	}

	private async afterCompiler() {
		// delete the this.buildDir directory
		await fsPromises.rm(this.buildDir, { recursive: true });
	}

	private handleErrorFromSemanticAnalyzer(analyzerResult: { outcome: 'error'; error: Error; data?: unknown }) {
		const analyzerError = analyzerResult.error as AnalysisError;

		console.groupCollapsed(`Error[${analyzerError.getErrorCode()}]: ${analyzerError.message}`);
		analyzerError
			.getContext()
			.toStringArray(analyzerError.message)
			.forEach((str) => console.log(str));
		console.groupEnd();
	}

	private async afterParser(parser: Parser, parserResult: { outcome: 'ok'; value: Node }) {
		// first output tokens
		if (!this.source.fromStdin) {
			const output = JSON.stringify(parser.lexer.tokens, null, '\t');
			const tokensFilePath = await this.targetPaths.tokens();

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
			const parseTreeFilePath = await this.targetPaths.parseTree();

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
	private async runCompiler(ast: ASTProgram): Promise<void> {
		// convert AST to LLVM IR and compile
		const llvmIrConverter = new LlvmIrConverter();

		const conversions = llvmIrConverter.convert({ [`${this.sourceFilenameSansExt}.joe`]: ast });
		for await (const [filename, conversionResult] of Object.entries(conversions)) {
			if (conversionResult.outcome === 'error') {
				const llvmIrError = conversionResult.error as CompilerError;

				console.error(`Error[Compiler]: ${llvmIrError.getFilename()} ${llvmIrError.message}`);

				continue;
			}

			const llvmModule = conversionResult.value;
			if (this.debug) {
				console.groupCollapsed('\n=== LLVM IR ===\n');
				console.info(llvmModule.print());
				console.groupEnd();
			}

			const output = llvmModule.print();
			const llvmIrFilePath = await this.targetPaths.llvmIr(filename);

			try {
				await fsPromises.writeFile(llvmIrFilePath, output);

				// for inline analyses, we don't care about the executable file,
				// so it can go into the build directory. Otherwise, we need it.
				let executablePath = `${path.dirname(this.buildDir)}/${this.sourceFilenameSansExt}`;
				if (this.source.fromStdin) {
					executablePath = `${this.buildDir}/${this.sourceFilenameSansExt}`;
				}

				this.generateObjectFile(
					`${this.buildDir}/${this.sourceFilenameSansExt}.ll`,
					`${this.buildDir}/${this.sourceFilenameSansExt}1.o`,
				);

				const commands = [
					// generate object file
					[
						`llc`,
						`-O2`,
						`-filetype=obj`,
						`-relocation-model=pic`,
						`${this.buildDir}/${this.sourceFilenameSansExt}.ll`,
						`-o`,
						`${this.buildDir}/${this.sourceFilenameSansExt}.o`,
					],

					// generate executable
					[`gcc`, `${this.buildDir}/${this.sourceFilenameSansExt}.o`, `-o`, executablePath],

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
				console.error(`%cError[Compiler]: ${llvmIrFilePath}: ${(err as Error).message}`, 'color: red');
				continue;
			}
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

		return stopAfterLex ? 'lex' : stopAfterParse ? 'parse' : stopAfterAnalyze ? 'analyze' : undefined;
	}

	private async processOptions(): Promise<void> {
		// get the input
		this.source.code = this.source.fromStdin ? await this.getSourceFromStdin() : await this.getSourceFromFile();

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
	private async runSemanticAnalyzer(cst: Node, parser: Parser): Promise<Result<[ASTProgram, SymbolTable]>> {
		const analyzer = new SemanticAnalyzer(cst, parser);
		if (this.source.fromStdin) {
			analyzer.thisIsAnInlineAnalysis();
		}

		const analysisResult = analyzer.analyze();
		switch (analysisResult.outcome) {
			case 'ok':
				{
					const [ast, symbols] = analysisResult.value;

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
							inspect(symbols, {
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
							const output = inspect(symbols, { compact: 1, showHidden: false, depth: null });
							const symbolTableFilePath = await this.targetPaths.symbols();

							if (!(await this.writeToFile(symbolTableFilePath, output, 'Symbol Table'))) {
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

	private async generateObjectFile(inputFile: string, objectFile: string): Promise<void> {
		llvm.InitializeAllTargets();
		llvm.InitializeAllTargetInfos();
		llvm.InitializeAllTargetMCs();
		llvm.InitializeAllAsmPrinters();
		llvm.InitializeAllAsmParsers();

		const smDiagnostic = new llvm.SMDiagnostic();
		const context = new llvm.LLVMContext();
		const llModule = llvm.parseIRFile(inputFile, smDiagnostic, context);

		// Generate the .o file
		await fsPromises.writeFile(objectFile, llModule.getDataLayoutStr());
	}
}