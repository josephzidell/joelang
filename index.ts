import Lexer from "./lexer/lexer";
import LexerError from "./lexer/error";
import fs from 'fs-extra';
import Parser from "./parser/parser";
import ParserError from "./parser/error";
import { inspect } from 'util';
import { simplifyTree } from "./parser/simplifier";
// import SyntaxTreeGenerator from './syntax/generator';
// import TranspilerToGo from './transpilers/to/go';
// import TranspilerToTypescript from './transpilers/to/ts';
import { program } from 'commander';

void (async (): Promise<void> => {
	program
		.command('lexify')
		.description('Split your .joe code into tokens')
		.argument('<code>', 'code to lexify')
		.option('-v, --verbose', 'display debugging information')
		.option('-o, --output', 'file path to send the output to')
		.action(async (sourceCode, options, command) => {
			// console.debug({sourceCode, options, command});

			try {
				const tokens = new Lexer(sourceCode).lexify();

				// filename is 3rd arg
				if (options.output) {
					await fs.writeFile(options.output, JSON.stringify(tokens, undefined, '\t'));
				} else {
					console.table(tokens);
				}
			} catch (e) {
				const error = e as LexerError;

				console.log(`Error: ${error.message}`);
				if (typeof error.getTokens === 'function') {
					console.debug('Extracted tokens:');
					console.table(error.getTokens());
				}

				console.log('Stack Trace:');
				console.error(error.stack);
			}
		});

	program
		.command('parse')
		.description('Parse your .joe code into a Parse Tree')
		.argument('<code>', 'code to parse')
		.option('-v, --verbose', 'display debugging information')
		.option('-o, --output', 'file path to send the output to');

	program
		.command('syntax')
		.description('Generate an Abstract Syntax Tree (AST) from your .joe code')
		.argument('<code>', 'code')
		.option('-v, --verbose', 'display debugging information')
		.option('-o, --output', 'file path to send the output to');

	program
		.command('transpile')
		.description('Transpile your .joe code into another language')
		.argument('<lang>', 'language')
		.argument('<code>', 'code')
		.option('-v, --verbose', 'display debugging information', false)
		.option('-o, --output <filename>', 'file path to send the output to');

	program.parse();
	const options = program.opts();
	console.debug({options});
	return;

	const command = process.argv[2];

	switch (command) {
		case 'lexify':
			try {
				const [, , , sourceCode, outputFile] = process.argv;

				const tokens = new Lexer(sourceCode).lexify();

				// filename is 3rd arg
				if (outputFile) {
					await fs.writeFile(outputFile, JSON.stringify(tokens, undefined, '\t'));
				} else {
					console.table(tokens);
				}
			} catch (e) {
				const error = e as LexerError;

				console.log(`Error: ${error.message}`);
				if (typeof error.getTokens === 'function') {
					console.debug('Extracted tokens:');
					console.table(error.getTokens());
				}

				console.log('Stack Trace:');
				console.error(error.stack);
			}
			break;

		case 'parse':
			try {
				const [, , , sourceCode, outputFile] = process.argv;

				// output simplified tree
				// TODO add `-v|--verbose` option
				const parseTree = simplifyTree([new Parser(new Lexer(sourceCode).lexify()).parse()]);

				if (outputFile) {
					await fs.writeFile(outputFile, inspect(parseTree, { showHidden: true, depth: null }));
				} else {
					console.debug(inspect(parseTree, { showHidden: true, depth: null }));
				}
			} catch (e) {
				const error = e as ParserError;

				console.log(`Error: ${error.message}`);
				console.debug('Derived CST:');
				console.debug(error.getTree());

				console.log('Stack Trace:');
				console.error(error.stack);
			}
			break;

		case 'syntax':
			try {
				const [, , , sourceCode, outputFile] = process.argv;

				// const syntaxTree = new SyntaxTreeGenerator(new Parser(new Lexer(sourceCode).lexify()).parse()).generate();

				// if (outputFile) {
				// 	await fs.writeFile(outputFile, inspect(syntaxTree, { showHidden: true, depth: null }));
				// } else {
				// 	console.debug(inspect(syntaxTree, { showHidden: true, depth: null }));
				// }
			} catch (e) {
				const error = e as ParserError;

				console.log(`Error: ${error.message}`);
				console.debug('Derived CST:');
				console.debug(error.getTree());

				console.log('Stack Trace:');
				console.error(error.stack);
			}
			break;

		case 'transpile':
			try {
				const [, , , lang, sourceCode, outputFile] = process.argv;

				const cst = new Parser(new Lexer(sourceCode).lexify()).parse();
				let destCode = '';

				switch (lang) {
					case 'go':
						// destCode = new TranspilerToGo(cst).transpile();
						break;
					case 'ts':
						// destCode = new TranspilerToTypescript(cst).transpile();
						break;
				}

				if (outputFile) {
					await fs.writeFile(outputFile, destCode);
				} else {
					console.log(destCode);
				}
			} catch (e) {
				const error = e as Error;

				console.error(`Error: ${error.message}`);
				console.error('Stack Trace:');
				console.error(error.stack);
			}
			break;
	}
})();
