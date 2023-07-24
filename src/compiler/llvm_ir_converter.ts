import fsPromises from 'fs/promises';
import llvm, { TargetRegistry, config } from 'llvm-bindings';
import {
	AST,
	ASTCallExpression,
	ASTFunctionDeclaration,
	ASTIdentifier,
	ASTNumberLiteral,
	ASTPrintStatement,
	ASTProgram,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTType,
	ASTTypeNumber,
	ASTTypePrimitive,
	ASTVariableDeclaration,
	primitiveAstType,
} from '../analyzer/asts';
import { FunctionSymbol, SymbolTable } from '../analyzer/symbolTable';
import ErrorContext from '../shared/errorContext';
import { Maybe } from '../shared/maybe';
import { NumberSize, SizeInfo, numberSizeDetails } from '../shared/numbers/sizes';
import {
	Result,
	allOk,
	anyIsError,
	error,
	flattenResults,
	getFirstError,
	mapResult,
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
	private loc: string[] = [];
	private valueMap = new Map<string, llvm.AllocaInst>();
	private targetMachine: llvm.TargetMachine;
	private targetTriple: string;
	private symbolTable: SymbolTable;
	private debug = false;

	// Sometimes we need to track our own context which will cross function
	// boundaries, and this avoids the complexity of passing extra params.
	//
	// NOTE: this may expand in the future. Right now, the only use-case is
	// whether we're in `main()`.
	private inMain = false;

	constructor(symbolTable: SymbolTable, debug: boolean) {
		this.symbolTable = symbolTable;
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

	public convert(files: Record<string, { ast: ASTProgram; loc: string[] }>): Record<string, Result<llvm.Module>> {
		const map = {} as Record<string, Result<llvm.Module>>;

		for (const [filename, { ast, loc }] of Object.entries(files)) {
			this.filename = filename;
			this.loc = loc;
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
		return new ErrorContext(
			this.loc[node.pos.line - 1],
			node.pos.line,
			node.pos.col,
			length ?? node.pos.end - node.pos.start,
		);
	}

	// convert an AST node to LLVM IR
	private convertNode(node: AST): Result<llvm.Value | llvm.Value[]> {
		switch (node.constructor.name) {
			case 'ASTCallExpression':
				return this.convertCallExpression(node as ASTCallExpression);
			case 'ASTFunctionDeclaration':
				return this.convertFunctionDeclaration(node as ASTFunctionDeclaration);
			case 'ASTIdentifier':
				return this.convertIdentifier(node as ASTIdentifier);
			case 'ASTNumberLiteral':
				return this.convertNumberLiteral(node as ASTNumberLiteral);
			case 'ASTPrintStatement':
				return this.convertPrintStatement(node as ASTPrintStatement);
			case 'ASTReturnStatement':
				return this.convertReturnStatement(node as ASTReturnStatement);
			case 'ASTStringLiteral':
				return this.convertStringLiteral(node as ASTStringLiteral);
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

	private convertCallExpression(node: ASTCallExpression): Result<llvm.Value> {
		const callExpr = node as ASTCallExpression;
		switch (callExpr.callee.constructor) {
			// TODO ASTCallExpression | ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression
			case ASTIdentifier:
				{
					const callee = node.callee as ASTIdentifier;
					const funcLookupMaybe = this.symbolTable.lookup(callee.name, ['function']) as Maybe<FunctionSymbol>;
					if (!funcLookupMaybe.has()) {
						return error(
							new CompilerError(
								`We don't recognize "${callee.name}"`,
								this.filename,
								this.getErrorContext(node),
							),
						);
					}

					const args = flattenResults(node.args.map((arg) => this.convertNode(arg)));
					if (args.outcome === 'error') {
						return args;
					}

					const llvmFunction = funcLookupMaybe.value.llvmFunction;
					if (typeof llvmFunction === 'undefined') {
						return error(
							new CompilerError(
								`Function ${callee.name} has no LLVM IR function`,
								this.filename,
								this.getErrorContext(node),
							),
						);
					}

					// TODO handle multiple return types
					return ok(this.builder.CreateCall(llvmFunction, args.value as llvm.Value[]));
				}
				break;
			default:
				return mapResult(this.convertNode(callExpr.callee), (callee) => callee as llvm.Value);
		}
	}

	private convertFunctionDeclaration(node: ASTFunctionDeclaration): Result<llvm.Function> {
		// special handling for `main()`
		let isMain = false;
		if (node.name?.name === 'main' && typeof node.body !== 'undefined') {
			isMain = true;
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

		const params = this.convertTypes(node.params);
		if (params.outcome === 'error') {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			return params;
		}

		// create function type
		const functionType = llvm.FunctionType.get(
			funcReturnTypeResult.value,
			params.value,
			node.params.some((p) => p.isRest),
		);

		// TOOD deal with anon functions
		const funcName = node.name?.name ?? '<anon>';

		// create function
		const func = llvm.Function.Create(
			functionType,
			llvm.Function.LinkageTypes.ExternalLinkage,
			funcName,
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

		// set the func in the symbol table
		this.symbolTable.setFunctionLLVMFunction(funcName, func);

		if (this.inMain && isMain) {
			this.inMain = false;
		}

		return ok(func);
	}

	private convertIdentifier(node: ASTIdentifier): Result<llvm.Value> {
		const allocaInst = this.valueMap.get(node.name);
		if (typeof allocaInst === 'undefined') {
			return error(
				new CompilerError(`We don't recognize "${node.name}"`, this.filename, this.getErrorContext(node)),
			);
		}

		const load = this.builder.CreateLoad(allocaInst.getType().getPointerElementType(), allocaInst);

		return ok(load);
	}

	private convertNumberLiteral(node: ASTNumberLiteral): Result<llvm.ConstantInt> {
		const size: SizeInfo = numberSizeDetails[node.declaredSize ?? node.possibleSizes[0]];

		let value;
		if (typeof node.value === 'number') {
			value = node.value;
		} else {
			const expr = node.value;

			value = expr.operand;
			if (expr.operator === '-') {
				value = -value;
			}
		}

		if (size.type === 'dec') {
			// TODO dec32 should use getFloatTy()
			return ok(llvm.ConstantFP.get(this.builder.getDoubleTy(), value.toString()));
		}

		// TODO handle signed/unsigned
		return ok(this.builder.getIntN(size.bits, value));
	}

	// convert an ASTPrintStatement to an LLVM IR printf call
	private convertPrintStatement(ast: ASTPrintStatement): Result<llvm.Value> {
		const printfFunc = llvm.Function.Create(
			cFuncTypes.printf(this.builder),
			llvm.Function.LinkageTypes.ExternalLinkage,
			'printf',
			this.module,
		);

		const exprToPrintResults: Array<Result<llvm.Value | string>> = ast.expressions.map((expr) => {
			return this.convertNode(expr) as Result<llvm.Value>;
		});
		// check if any of the expressions failed
		if (anyIsError(exprToPrintResults)) {
			return getFirstError(exprToPrintResults);
		}

		const exprsToPrint = unwrapResults(exprToPrintResults);

		// create format string
		const formatStrings = exprsToPrint.map((expr) => {
			if (typeof expr === 'string') {
				return '%s';
			}

			switch (expr.getType().getTypeID()) {
				case this.builder.getInt8Ty().getTypeID():
				case this.builder.getInt16Ty().getTypeID():
				case this.builder.getInt32Ty().getTypeID():
				case this.builder.getInt64Ty().getTypeID():
				case this.builder.getInt128Ty().getTypeID():
					return '%d';
				case this.builder.getFloatTy().getTypeID():
				case this.builder.getDoubleTy().getTypeID():
					return '%f';
				default: // TODO handle other llvm.Value types
					return '%s';
			}
		});

		const format = this.builder.CreateGlobalStringPtr(formatStrings.join(' '));

		// convert everything to `llvm.Value`s
		const valuesToPrint = exprsToPrint.map((expr) => {
			if (typeof expr === 'string') {
				return this.builder.CreateGlobalStringPtr(expr);
			}

			return expr;
		});

		// create printf call
		const printfCall = this.builder.CreateCall(printfFunc, [format, ...valuesToPrint]);

		return ok(printfCall);
	}

	private convertReturnStatement(ast: ASTReturnStatement): Result<llvm.Value> {
		if (ast.expressions.length === 0) {
			// blank `return;`
			// In C, `main()` must return an int for the exit code, therefore
			// we polyfill any empty return, including nested ones
			if (this.inMain) {
				return ok(this.builder.CreateRet(this.builder.getInt32(0)));
			}

			return ok(this.builder.CreateRetVoid());
		}

		const exprsToReturn: Array<Result<llvm.Value>> = ast.expressions.map((expr) => {
			// each expression can only be one value
			return this.convertNode(expr) as Result<llvm.Value>;
		});
		// check if any of the expressions failed
		if (!allOk(exprsToReturn)) {
			return getFirstError(exprsToReturn);
		}

		// TODO handle multiple return values
		return ok(this.builder.CreateRet(exprsToReturn[0].value));
	}

	private convertStringLiteral(node: ASTStringLiteral): Result<llvm.ConstantInt> {
		return ok(this.builder.CreateGlobalStringPtr(node.value));
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
						dec32: this.builder.getDoubleTy(), // TODO dec32: should use getFloatTy()
						dec64: this.builder.getDoubleTy(), // 64 bit is double
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

	private convertTypes(asts: ASTType[]): Result<llvm.Type[]> {
		return flattenResults(asts.map((ast) => this.convertType(ast)));
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

				const initialValue = ast.initialValues.at(index);
				if (typeof initialValue !== 'undefined') {
					const llvmValue = this.convertNode(initialValue);
					if (llvmValue.outcome === 'error') {
						return llvmValue;
					}

					this.builder.CreateStore(llvmValue.value as llvm.Value, allocaInst);
				}

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
