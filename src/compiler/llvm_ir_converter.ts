import fsPromises from 'fs/promises';
import llvm, { TargetRegistry, config } from 'llvm-bindings';
import {
	AST,
	ASTClassDeclaration,
	ASTFunctionDeclaration,
	ASTIdentifier,
	ASTNumberLiteral,
	ASTPrintStatement,
	ASTProgram,
	ASTReturnStatement,
	ASTType,
	ASTTypeNumber,
	ASTTypePrimitive,
	ASTUnaryExpression,
	ASTVariableDeclaration,
	primitiveAstType,
} from '../analyzer/asts';
import ErrorContext from '../shared/errorContext';
import { NumberSize, SizeInfo, numberSizeDetails } from '../shared/numbers/sizes';
import {
	Result,
	allOk,
	anyIsError,
	error,
	flattenResults,
	getFirstError,
	ifNotUndefined,
	ok,
	unwrapResults,
} from '../shared/result';
import CompilerError from './error';
import convertStdLib from './stdlib';
import { cFuncTypes } from './stdlibs.types';

export default class LlvmIrConverter {
	private context: llvm.LLVMContext;
	private module!: llvm.Module;
	private builder!: llvm.IRBuilder;
	private stdlib!: llvm.Module;
	private filename = '';
	private valueMap = new Map<string, llvm.Value>();
	private targetMachine: llvm.TargetMachine;
	private targetTriple: string;
	private debug = false;

	// Sometimes we need to track our own context which will cross function
	// boundaries, and this avoids the complexity of passing extra params.
	//
	// NOTE: this may expand in the future. Right now, the only use-case is
	// whether we're in `main()`.
	private inMain = false;

	constructor(debug: boolean) {
		this.debug = debug;

		// following https://llvm.org/docs/tutorial/MyFirstLanguageFrontend/LangImpl08.html

		llvm.InitializeAllTargetInfos();
		llvm.InitializeAllTargets();
		llvm.InitializeAllTargetMCs();
		llvm.InitializeAllAsmParsers();
		llvm.InitializeAllAsmPrinters();

		this.context = new llvm.LLVMContext();

		// 8.2 Choosing a Target
		this.targetTriple = config.LLVM_DEFAULT_TARGET_TRIPLE;
		if (this.debug) {
			console.debug({
				LLVM_DEFAULT_TARGET_TRIPLE: config.LLVM_DEFAULT_TARGET_TRIPLE,
				LLVM_HOST_TRIPLE: config.LLVM_HOST_TRIPLE,
				LLVM_ON_UNIX: config.LLVM_ON_UNIX,
				LLVM_VERSION_MAJOR: config.LLVM_VERSION_MAJOR,
				LLVM_VERSION_MINOR: config.LLVM_VERSION_MINOR,
				LLVM_VERSION_PATCH: config.LLVM_VERSION_PATCH,
				LLVM_VERSION_STRING: config.LLVM_VERSION_STRING,
			});
		}

		const target = TargetRegistry.lookupTarget(this.targetTriple);
		if (target === null) {
			throw new Error(`Could not find target for ${this.targetTriple}`);
		}

		// 8.3 TargetMachine
		this.targetMachine = target.createTargetMachine(this.targetTriple, 'x86-64', '');

		// convert the stdlib
		this.stdlib = convertStdLib(this.context);
	}

	public convert(files: Record<string, ASTProgram>): Record<string, Result<llvm.Module>> {
		const map = {} as Record<string, Result<llvm.Module>>;

		for (const [filename, ast] of Object.entries(files)) {
			this.filename = filename;
			this.module = new llvm.Module(this.filename, this.context);
			this.builder = new llvm.IRBuilder(this.context);

			// 8.4 Configuring the Module
			this.module.setDataLayout(this.targetMachine.createDataLayout());
			this.module.setTargetTriple(this.targetTriple);
			this.module.setModuleIdentifier(this.filename);

			// 8.5 Emit Object Code
			if (this.debug) {
				console.debug({
					ModuleIdentifier: this.module.getModuleIdentifier(),
					SourceFileName: this.module.getSourceFileName(),
					Name: this.module.getName(),
					TargetTriple: this.module.getTargetTriple(),
					Print: this.module.print(),
				});
			}

			// walk the AST and convert each node to LLVM IR
			const conversionResult = this.convertNodes(ast.declarations);
			if (conversionResult.outcome === 'error') {
				map[this.filename] = error(conversionResult.error);
				continue;
			}

			if (llvm.verifyModule(this.module)) {
				map[this.filename] = error(
					new CompilerError('Verifying module failed', this.filename, this.getErrorContext(ast, 1)),
				);
				continue;
			}

			map[this.filename] = ok(this.module);
		}

		return map;
	}

	public async generateBitcode(filePath: string): Promise<Result<undefined>> {
		try {
			// TODO handle multiple modules
			// generate object file
			llvm.WriteBitcodeToFile(this.module, filePath);
			await fsPromises.chmod(filePath, 0o775);

			return ok(undefined);
		} catch (err) {
			return error(err as Error);
		}
	}

	getErrorContext(node: AST, length?: number): ErrorContext {
		return new ErrorContext(node.toString(), node.pos.line, node.pos.col, length ?? node.pos.end - node.pos.start);
	}

	// convert an AST node to LLVM IR
	private convertNode(node: AST): Result<llvm.Value | llvm.Value[]> {
		switch (node.constructor.name) {
			case 'ASTFunctionDeclaration':
				return this.convertFunctionDeclaration(node as ASTFunctionDeclaration);
			case 'ASTNumberLiteral':
				return this.convertNumberLiteral(node as ASTNumberLiteral);
			case 'ASTPrintStatement':
				return this.convertPrintStatement(node as ASTPrintStatement);
			case 'ASTReturnStatement':
				return this.convertReturnStatement(node as ASTReturnStatement);
			case 'ASTVariableDeclaration':
				return this.convertVariableDeclaration(node as ASTVariableDeclaration);
		}

		return error(
			new CompilerError(
				`convertNode: Unknown AST node "${node.constructor.name}"`,
				this.filename,
				this.getErrorContext(node),
			),
		);
	}

	// convert multiple AST nodes to LLVM IR
	private convertNodes(nodes: AST[]): Result<llvm.Value[]> {
		const values: llvm.Value[] = [];

		for (const node of nodes) {
			const result = this.convertNode(node);

			if (result.outcome === 'error') {
				return result;
			}

			// if the node returns multiple values, add them all to the list
			if (Array.isArray(result.value)) {
				values.push(...result.value);
			} else {
				values.push(result.value);
			}
		}

		return ok(values);
	}

	private convertFunctionDeclaration(node: ASTFunctionDeclaration): Result<llvm.Function> {
		// special handling for `main()`
		const isMain = node.name?.name === 'main' && node.returnTypes.length === 0 && typeof node.body !== 'undefined';
		if (node.name?.name === 'main' && node.returnTypes.length === 0 && typeof node.body !== 'undefined') {
			this.inMain = true; // set context

			node.returnTypes = [ASTTypeNumber._('int32', node.pos)]; // the position doesn't matter

			// guarantee a return statement
			const lastExpressionInBody = node.body.expressions.at(node.body.expressions.length - 1);
			// append a `return 0;` for the exit code if there is no return
			if (typeof lastExpressionInBody === 'undefined' || lastExpressionInBody.kind !== 'ReturnStatement') {
				node.body.expressions.push(
					ASTReturnStatement._([ASTNumberLiteral._(0, 'int32', ['int32'], node.pos)], node.pos),
				);
			}
		}

		// TODO handle multiple return types
		const funcReturnTypeResult = this.convertType(node.returnTypes[0]);
		if (funcReturnTypeResult.outcome === 'error') {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			return funcReturnTypeResult;
		}

		const params = flattenResults(node.params.map((param) => this.convertType(param.declaredType)));
		if (params.outcome === 'error') {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			return params;
		}

		// create function type
		const functionType = llvm.FunctionType.get(funcReturnTypeResult.value, params.value, false);

		// create function
		const func = llvm.Function.Create(
			functionType,
			llvm.Function.LinkageTypes.ExternalLinkage,
			node.name?.name ?? '<anon>',
			this.module,
		);

		// create block for function body
		const entryBB = llvm.BasicBlock.Create(this.context, 'entry', func);
		this.builder.SetInsertPoint(entryBB);

		// convert body expressions
		const conversionResult = this.convertNodes(node.body?.expressions ?? []);
		if (conversionResult.outcome === 'error') {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			return conversionResult;
		}

		// return value for void
		if (funcReturnTypeResult.value.getTypeID() === this.builder.getVoidTy().getTypeID()) {
			this.builder.CreateRetVoid();
		}

		// verify it
		if (llvm.verifyFunction(func)) {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			return error(new CompilerError('Verifying function failed', this.filename, this.getErrorContext(node)));
		}

		if (this.inMain && isMain) {
			this.inMain = false;
		}

		return ok(func);
	}

	private convertNumberLiteral(node: ASTNumberLiteral): Result<llvm.ConstantInt> {
		const size: SizeInfo = numberSizeDetails[node.declaredSize ?? node.possibleSizes[0]];

		// TODO handle ASTUnaryExpression<number> better
		const value = typeof node.value === 'number' ? node.value : (node.value as ASTUnaryExpression<number>).operand;

		if (size.type === 'dec') {
			// TODO handle decimals
			// this is a placeholder
			return error(new Error('Decimals not implemented yet in convertNumberLiteral()'));
			// return ok(new llvm.APFloat(value));
		} else {
			// TODO handle signed/unsigned
			return ok(this.builder.getIntN(size.bits, value));
			// return ok(new llvm.APInt(size.bits, value, size.type.startsWith('u')));
		}
	}

	// convert an ASTPrintStatement to an LLVM IR printf call
	private convertPrintStatement(ast: ASTPrintStatement): Result<llvm.Value> {
		const printfFunc = llvm.Function.Create(
			cFuncTypes.printf(this.builder),
			llvm.Function.LinkageTypes.ExternalLinkage,
			'printf',
			this.module,
		);

		// create format string
		const exprToPrint: Array<Result<llvm.Value | string>> = ast.expressions.map((expr) => {
			// if it's an identifier, get the value from the value map
			if (expr.constructor.name === 'ASTIdentifier') {
				return ifNotUndefined(
					this.valueMap.get((expr as ASTIdentifier).name),
					new CompilerError(
						`PrintStatement: We don't recognize "${(expr as ASTIdentifier).name}"`,
						this.filename,
						this.getErrorContext(expr),
					),
				);
			}

			return ok(expr.toString());
		});
		// check if any of the expressions failed
		if (anyIsError(exprToPrint)) {
			return getFirstError(exprToPrint);
		}

		const formatStrings = unwrapResults(exprToPrint).map((expr) =>
			// TODO handle an llvm.Value
			this.builder.CreateGlobalStringPtr(expr.toString()),
		);

		// create printf call
		const printfCall = this.builder.CreateCall(printfFunc, formatStrings);

		return ok(printfCall);
	}

	private convertReturnStatement(ast: ASTReturnStatement): Result<llvm.Value> {
		if (ast.expressions.length === 0) { // blank `return;`
			// `main()` must return an int for the exit code, therefore
			// we polyfill any empty return, including nested ones
			if (this.inMain) {
				return ok(this.builder.CreateRet(this.builder.getInt32(0)));
			}

			return ok(this.builder.CreateRetVoid());
		}

		const exprToReturn: Array<Result<llvm.Value>> = ast.expressions.map((expr) => {
			// if it's an identifier, get the value from the value map
			if (expr.constructor.name === 'ASTIdentifier') {
				return ifNotUndefined(
					this.valueMap.get((expr as ASTIdentifier).name),
					new CompilerError(
						`ReturnStatement: We don't recognize "${(expr as ASTIdentifier).name}"`,
						this.filename,
						this.getErrorContext(expr),
					),
				);
			}

			// each expression can only be one value
			return this.convertNode(expr) as Result<llvm.Value>;
		});
		// check if any of the expressions failed
		if (!allOk(exprToReturn)) {
			return getFirstError(exprToReturn);
		}

		// TODO handle multiple return values
		return ok(this.builder.CreateRet(exprToReturn[0].value));
	}

	// convert ASTType to LLVM IR type
	private convertType(ast: ASTType | undefined): Result<llvm.Type> {
		if (typeof ast === 'undefined') {
			return ok(this.builder.getVoidTy());
		}

		switch (ast.constructor.name) {
			case 'ASTIdentifier':
				{
					const arg = this.valueMap.get((ast as ASTIdentifier).name);
					if (typeof arg === 'undefined') {
						return error(
							new CompilerError(
								`We don't recognize "${(ast as ASTIdentifier).name}"`,
								this.filename,
								this.getErrorContext(ast),
							),
						);
					}

					return ok(arg.getType());
				}
				break;
			case 'ASTTypeNumber':
				{
					// map number size to LLVM IR type
					const sizeMap: Record<NumberSize, llvm.IntegerType> = {
						int8: this.builder.getInt8Ty(),
						int16: this.builder.getInt16Ty(),
						int32: this.builder.getInt32Ty(),
						int64: this.builder.getInt64Ty(),
						uint8: this.builder.getInt8Ty(), // TODO: unsigned types
						uint16: this.builder.getInt16Ty(), // TODO: unsigned types
						uint32: this.builder.getInt32Ty(), // TODO: unsigned types
						uint64: this.builder.getInt64Ty(), // TODO: unsigned types
						dec32: this.builder.getDoubleTy(), // TODO: decimal size
						dec64: this.builder.getDoubleTy(), // TODO: decimal size
					};

					if ((ast as ASTTypeNumber).size in sizeMap) {
						return ok(sizeMap[(ast as ASTTypeNumber).size]);
					} else {
						return error(
							new CompilerError(
								`Unknown number size "${(ast as ASTTypeNumber).size}"`,
								this.filename,
								this.getErrorContext(ast),
							),
						);
					}
				}
				break;
			case 'ASTTypePrimitive':
				{
					// map primitive type to LLVM IR type
					const typeMap: Record<primitiveAstType, llvm.Type> = {
						bool: this.builder.getInt1Ty(),
						path: this.builder.getInt8PtrTy(), // TODO: path type
						regex: this.builder.getInt8PtrTy(), // TODO: regex type
						string: this.builder.getInt8PtrTy(), // TODO: string type
					};

					if ((ast as ASTTypePrimitive).type in typeMap) {
						return ok(typeMap[(ast as ASTTypePrimitive).type]);
					} else {
						return error(
							new CompilerError(
								`Unknown primitive type "${(ast as ASTTypePrimitive).type}"`,
								this.filename,
								this.getErrorContext(ast),
							),
						);
					}
				}
				break;
		}

		return error(
			new CompilerError(
				`convertType: Please add AST type "${ast.constructor.name}" to the list`,
				this.filename,
				this.getErrorContext(ast),
			),
		);
	}

	// convert an ASTVariableDeclaration to an LLVM IR alloca instruction
	private convertVariableDeclaration(ast: ASTVariableDeclaration): Result<llvm.Value[]> {
		const allocas = ast.identifiersList.map((identifier, index) => {
			const astType = ast.declaredTypes.at(index) || ast.inferredPossibleTypes.at(index)?.at(0);
			if (typeof astType === 'undefined') {
				return error(
					new CompilerError(
						`convertVariableDeclaration: We don't know the type of "${identifier.name}"`,
						this.filename,
						this.getErrorContext(ast),
					),
				);
			}

			const type = this.convertType(astType);
			if (type.outcome === 'error') {
				return type;
			}

			try {
				const allocaInst = this.builder.CreateAlloca(type.value, null, identifier.name);

				this.valueMap.set(identifier.name, allocaInst);

				return ok(allocaInst);
			} catch (err) {
				return error(err as Error);
			}
		}) satisfies Result<llvm.Value>[];

		return flattenResults(allocas);
	}

	public getModule(): llvm.Module {
		return this.module;
	}

	public getBuilder(): llvm.IRBuilder {
		return this.builder;
	}

	public getContext(): llvm.LLVMContext {
		return this.context;
	}
}
