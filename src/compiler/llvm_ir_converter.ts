import fsPromises from 'fs/promises';
import llvm, { TargetRegistry, config } from 'llvm-bindings';
import {
	AST,
	ASTBinaryExpression,
	ASTBoolLiteral,
	ASTCallExpression,
	ASTFunctionDeclaration,
	ASTIdentifier,
	ASTNumberLiteral,
	ASTParameter,
	ASTPrintStatement,
	ASTProgram,
	ASTReturnStatement,
	ASTStringLiteral,
	ASTType,
	ASTTypeNumber,
	ASTTypePrimitive,
	ASTUnaryExpression,
	ASTVariableDeclaration,
	AssignableASTs,
	ExpressionASTs,
	primitiveAstType,
} from '../analyzer/asts';
import SymbolError from '../analyzer/symbolError';
import { FuncSym, ParamSym, SymTab, SymTree, SymbolTable, VarSym } from '../analyzer/symbolTable';
import ErrorContext from '../shared/errorContext';
import { Maybe, has, hasNot } from '../shared/maybe';
import { NumberSize, SizeInfo, numberSizeDetails } from '../shared/numbers/sizes';
import { CreateResultFrom, Result, Results, error, ok } from '../shared/result';
import CompilerError from './error';
import { Proxy, stdlibLlvmFunc } from './stdlibs.types';

export default class LlvmIrConverter {
	private context: llvm.LLVMContext;
	private module!: llvm.Module;
	private builder!: llvm.IRBuilder;
	private stdlib!: llvm.Module;
	private proxy!: Proxy;
	private filename = '';
	private loc: string[] = [];
	private valueMap = new Map<string, llvm.AllocaInst | llvm.Argument>();
	private targetMachine: llvm.TargetMachine;
	private targetTriple: string;
	private symTree: SymTree;
	private debug = false;

	// Sometimes we need to track our own context which will cross function
	// boundaries, and this avoids the complexity of passing extra params.
	//
	// NOTE: this may expand in the future. Right now, the only use-case is
	// whether we're in `main()`.
	private inMain = false;

	constructor(symTree: SymTree, debug: boolean) {
		this.symTree = symTree;
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

		// // set the func in the symbol table
		// const wasSet = SymbolTable.setFunctionLLVMFunction(funcName, func, {
		// 	debug: this.debug,
		// });

		// convert the stdlib
		// let _builder: llvm.IRBuilder;
		// this.module = new llvm.Module('stdlib', this.context);
		// this.stdlib = this.module;
		// this.builder = new llvm.IRBuilder(this.context);

		// // console.debug(this.symTree.proxy())
		// this.symTree.proxy((symTab: SymTab) => {
		// 	return symTab.setFunctionData('readStr', (funcSymbol: FuncSym) => {
		// 		funcSymbol.llvmFunction = llvmFunctions.readStr(this.stdlib, this.builder, this.context);
		// 	});
		// });
		// console.debug({wasSet})
	}

	private static newModule(
		name: string,
		context: llvm.LLVMContext,
		t3: string,
		machine: llvm.TargetMachine,
	): llvm.Module {
		const module = new llvm.Module(name, context);

		// 8.4 Configuring the Module
		module.setDataLayout(machine.createDataLayout());
		module.setTargetTriple(t3);
		module.setModuleIdentifier(name);

		return module;
	}

	public convert(
		filename: string,
		ast: ASTProgram,
		loc: string[],
	): Result<llvm.Module, CompilerError | SymbolError, llvm.Module> {
		this.filename = filename;
		this.loc = loc;

		this.module = LlvmIrConverter.newModule(this.filename, this.context, this.targetTriple, this.targetMachine);
		this.builder = new llvm.IRBuilder(this.context);
		this.proxy = new Proxy(this.context, this.module, this.builder);

		SymbolTable.tree.proxy((symTab: SymTab) => {
			return symTab.setFunctionData('readStr', (funcSymbol: FuncSym) => {
				funcSymbol.llvmFunction = stdlibLlvmFunc('readStr', this.module, this.builder);
			});
		});

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
		if (conversionResult.isError()) {
			return conversionResult.mapErrorData(this.module);
		}

		if (llvm.verifyModule(this.module)) {
			return error(
				new CompilerError('LLVM IR: Verifying module failed', this.filename, this.getErrorContext(ast, 1)),
				this.module,
			);
		}

		return ok(this.module);
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
	private convertNode(node: AST): Result<llvm.Value | llvm.Value[], CompilerError | SymbolError> {
		switch (node.constructor) {
			case ASTBinaryExpression:
				return this.convertBinaryExpression(node as ASTBinaryExpression<AssignableASTs, AssignableASTs>);
			case ASTBoolLiteral:
				return this.convertBoolLiteral(node as ASTBoolLiteral);
			case ASTCallExpression:
				return this.convertCallExpression(node as ASTCallExpression);
			case ASTFunctionDeclaration:
				return this.convertFunctionDeclaration(node as ASTFunctionDeclaration);
			case ASTIdentifier:
				return this.convertIdentifier(node as ASTIdentifier);
			case ASTNumberLiteral:
				return this.convertNumberLiteral(node as ASTNumberLiteral);
			case ASTParameter:
				// no need to convert parameters as the function declaration takes care of that
				// an "array" of llvm.Values. This value will never be used
				return this.checkParameter(node as ASTParameter).mapValue(() => []);
			case ASTPrintStatement:
				return this.convertPrintStatement(node as ASTPrintStatement);
			case ASTReturnStatement:
				return this.convertReturnStatement(node as ASTReturnStatement);
			case ASTStringLiteral:
				return this.convertStringLiteral(node as ASTStringLiteral);
			case ASTVariableDeclaration:
				return this.convertVariableDeclaration(node as ASTVariableDeclaration);
		}

		return error(
			new CompilerError(
				`LLVM IR: TODO: llvm_ir_converter.convertNode(${node.constructor.name}) is unhandled`,
				this.filename,
				this.getErrorContext(node),
			),
		);
	}

	// convert multiple AST nodes to LLVM IR
	private convertNodes(nodes: AST[]): Result<llvm.Value[], CompilerError | SymbolError> {
		const values: llvm.Value[] = [];

		for (const node of nodes) {
			const result = this.convertNode(node);

			if (result.isError()) {
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

	/**
	 * ICmpEQ: equal to
	 * ICmpNE: not equal to
	 * ICmpUGT: unsigned greater than
	 * ICmpUGE: unsigned greater than or equal to
	 * ICmpULT: unsigned less than
	 * ICmpULE: unsigned less than or equal to
	 * ICmpSGT: signed greater than
	 * ICmpSGE: signed greater than or equal to
	 * ICmpSLT: signed less than
	 * ICmpSLE: signed less than or equal to
	 * @param ast
	 * @returns
	 */
	private convertBinaryExpression(
		ast: ASTBinaryExpression<ExpressionASTs, ExpressionASTs>,
	): Result<llvm.Value, CompilerError | SymbolError> {
		const { operator, left, right } = ast;

		const leftResult = this.convertNode(left);
		if (leftResult.isError()) {
			return leftResult;
		}

		const rightResult = this.convertNode(right);
		if (rightResult.isError()) {
			return rightResult;
		}

		const leftValue = leftResult.value as llvm.Value;
		const rightValue = rightResult.value as llvm.Value;

		// https://calculla.com/math_operands_names
		switch (operator) {
			case '+': {
				// return ok(this.builder.CreateAdd(leftValue, rightValue, 'result of "+"'));
				// Create an add instruction that adds the parameters together
				if (this.debug) {
					console.debug(`IR Converter: Creating Add with left ${left} and right ${right} called result`);
				}
				const sum = this.builder.CreateAdd(leftValue, rightValue, 'result');

				// equivalent to: const overflow = sum < leftValue
				if (this.debug) {
					console.debug(`IR Converter: Creating ICmpSLT with sum called overflow`);
				}
				const overflow = this.builder.CreateICmpSLT(sum, leftValue, 'overflow');

				const funcName = SymbolTable.tree.getCurrentNode().name;
				const maybeFunc = SymbolTable.lookup(funcName, ['function'], {
					debug: this.debug,
				});
				const llvmFunction = maybeFunc.map((func) => func.llvmFunction);
				const func = llvmFunction.has() ? llvmFunction.value : undefined;
				if (typeof func === 'undefined') {
					return error(
						new CompilerError(
							`LLVM IR: No llvm.Function found for ${funcName}`,
							this.filename,
							this.getErrorContext(ast),
						),
					);
				}

				// Create a conditional branch instruction that branches to an error handling block if there was an overflow
				if (this.debug) {
					console.debug(`IR Converter: Creating BasicBlock "error"`);
				}
				const errorBlock = llvm.BasicBlock.Create(this.context, 'error', func);
				if (this.debug) {
					console.debug(`IR Converter: Creating BasicBlock "continue"`);
				}
				const continueBlock = llvm.BasicBlock.Create(this.context, 'continue', func);
				if (this.debug) {
					console.debug(`IR Converter: Creating CondBr`);
				}
				this.builder.CreateCondBr(overflow, errorBlock, continueBlock);

				// now deal with errorBlock
				if (this.debug) {
					console.debug('IR Converter: Setting Insert Point to errorBlock');
				}
				this.builder.SetInsertPoint(errorBlock);
				// print an error message, and return a special error value
				if (this.debug) {
					console.debug(`IR Converter: Printing error message`);
				}
				this.proxy.printf('%s', 'Error: overflow detected\n');

				if (maybeFunc.has()) {
					const returnType = this.convertType(maybeFunc.value.returnTypes[0]);
					if (returnType.isOk()) {
						if (this.debug) {
							console.debug(`IR Converter: Creating Return 0`);
						}
						this.builder.CreateRet(llvm.ConstantInt.get(returnType.value, 0));
					} // ignore error
				}

				// now deal with continueBlock
				if (this.debug) {
					console.debug('IR Converter: Setting Insert Point to continueBlock');
				}
				this.builder.SetInsertPoint(continueBlock);
				// do NOT create a return here, to allow other expressions to be converted

				return ok(sum);
			}
			case '-':
				return ok(this.builder.CreateSub(leftValue, rightValue, 'result of "-"'));
			case '*':
				return ok(this.builder.CreateMul(leftValue, rightValue, 'result of "*"'));
			case '/':
				return ok(this.builder.CreateSDiv(leftValue, rightValue, 'result of "/"'));
			case '%':
				return ok(this.builder.CreateSRem(leftValue, rightValue, 'result of "%"'));
			case '==':
				return ok(this.builder.CreateICmpEQ(leftValue, rightValue, 'result of "=="'));
			case '!=':
				return ok(this.builder.CreateICmpNE(leftValue, rightValue, 'result of "!="'));
			case '<':
				return ok(this.builder.CreateICmpSLT(leftValue, rightValue, 'result of "<"'));
			case '<=':
				return ok(this.builder.CreateICmpSLE(leftValue, rightValue, 'result of "<="'));
			case '>':
				return ok(this.builder.CreateICmpSGT(leftValue, rightValue, 'result of ">"'));
			case '>=':
				return ok(this.builder.CreateICmpSGE(leftValue, rightValue, 'result of ">="'));
			default:
				return error(
					new CompilerError(
						`LLVM IR: We don't recognize "${operator}"`,
						this.filename,
						this.getErrorContext(ast),
					),
				);
		}
	}

	private convertBoolLiteral(node: ASTBoolLiteral): Result<llvm.ConstantInt, CompilerError | SymbolError> {
		const boolType = this.builder.getInt1Ty();

		const val = node.value;
		if (val instanceof ASTUnaryExpression) {
			const unariedVal = this.convertNode(val);
			if (unariedVal.isError()) {
				return unariedVal;
			}

			// TODO
			// return ok(llvm.ConstantInt.get(boolType, unariedVal.value as llvm.Value, true));
		}

		return ok(llvm.ConstantInt.get(boolType, val ? 1 : 0, true));
	}

	private convertCallExpression(ast: ASTCallExpression): Result<llvm.Value, CompilerError | SymbolError> {
		const callExpr = ast as ASTCallExpression;
		switch (callExpr.callee.constructor) {
			// TODO ASTCallExpression | ASTIdentifier | ASTMemberExpression | ASTTypeInstantiationExpression
			case ASTIdentifier:
				{
					const callee = ast.callee as ASTIdentifier;
					const funcLookupMaybe = SymbolTable.lookup(callee.name, ['function'], {
						debug: this.debug,
					}) as Maybe<FuncSym>;
					if (!funcLookupMaybe.has()) {
						return error(
							new CompilerError(
								`LLVM IR: We don't recognize the "${callee.name}" function`,
								this.filename,
								this.getErrorContext(ast.callee),
							),
						);
					}

					const args = CreateResultFrom.arrayOfResults(ast.args.map((arg) => this.convertNode(arg)));
					if (args.isError()) {
						return args;
					}

					const llvmFunction = funcLookupMaybe.value.llvmFunction;
					if (typeof llvmFunction === 'undefined') {
						return error(
							new CompilerError(
								`LLVM IR: Function ${callee.name} has no LLVM IR function`,
								this.filename,
								this.getErrorContext(ast),
							),
						);
					}

					// TODO move this to a class that would be `use`d in the code
					if (callee.name === 'readStr' && args.value.length === 0) {
						return ok(this.proxy.readStr());
					}

					// TODO handle multiple return types
					return ok(this.builder.CreateCall(llvmFunction, args.value as llvm.Value[]));
				}
				break;
			default: {
				const nodeConversion = this.convertNode(callExpr.callee) as Result<
					llvm.Value,
					SymbolError | CompilerError
				>;
				return nodeConversion.mapValue((callee) => callee);
			}
		}
	}

	private convertFunctionDeclaration(
		node: ASTFunctionDeclaration,
	): Result<llvm.Function, CompilerError | SymbolError> {
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
		const returnTypeResult = this.convertType(node.returnTypes[0]);
		if (returnTypeResult.isError()) {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			return returnTypeResult;
		}

		// params
		const paramTypesResult = CreateResultFrom.arrayOfResults(node.params.map((p) => this.convertType(p.type)));
		if (paramTypesResult.isError()) {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			return paramTypesResult;
		}

		// check if last param is rest. We already ensured that it must be the last one
		const isLastParamRest = node.params.at(-1)?.isRest ?? false;

		// create function type
		const functionType = llvm.FunctionType.get(returnTypeResult.value, paramTypesResult.value, isLastParamRest);

		// TOOD deal with anon functions
		const funcName = node.name?.name ?? '<anon>';

		// create function
		const func = llvm.Function.Create(
			functionType,
			llvm.Function.LinkageTypes.ExternalLinkage,
			funcName,
			this.module,
		);

		if (!isMain) {
			// console.debug({nodeParams: node.params, funcParamArguments})
			// Object.entries(funcParamArguments).forEach(([paramName, llvmArgument]) => {
			// 	this.symbolTable.setParameterLlvmArgument(paramName, llvmArgument);
			// });
			// console.log(`--------------------- ${funcName}: After Setting Parameter llvm.Argument ------------------------`);
			// this.symbolTable.debug();
		}

		// TODO deal with anon funcs
		if (this.debug) {
			console.log(`IR Converter: converting FunctionDeclaration ${funcName}`);
		}
		const wasAbleToEnter = SymbolTable.tree.enter(funcName);
		if (wasAbleToEnter.isError()) {
			return wasAbleToEnter;
		}

		// set the func in the symbol table
		const wasSet = SymbolTable.setFunctionLLVMFunction(funcName, func, {
			debug: this.debug,
		});
		if (wasSet.isError()) {
			return wasSet;
		}

		// const funcParamArguments: Record<string, llvm.Argument> =
		node.params.map((param, index) => {
			const llvmArgument = func.getArg(index);

			if (this.debug) {
				console.log(`IR Converter: Setting Parameter llvm.Arguments for ${funcName}(${param.name.name})`);
			}
			const wasSet = SymbolTable.setParameterLlvmArgument(param.name.name, llvmArgument, {
				debug: this.debug,
			});
			if (wasSet.isError()) {
				return [param.name, wasSet];
			}

			return [param.name, ok(llvmArgument)];
		});

		// create block for function body
		const entryBB = llvm.BasicBlock.Create(this.context, 'entry', func);
		if (this.debug) {
			console.debug('IR Converter: Setting Insert Point to entry');
		}
		this.builder.SetInsertPoint(entryBB);

		// convert body expressions
		const conversionResult = this.convertNodes(node.body?.expressions ?? []);
		if (conversionResult.isError()) {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			if (this.debug) {
				console.log(
					`IR Converter: stopped converting FunctionDeclaration ${funcName} due to error converting body nodes`,
				);
			}
			SymbolTable.tree.exit();

			return conversionResult;
		}

		// verify it
		if (llvm.verifyFunction(func)) {
			if (this.inMain && isMain) {
				this.inMain = false;
			}

			if (this.debug) {
				console.log(
					`IR Converter: stopped converting FunctionDeclaration ${funcName} due to error verifying the function`,
				);
			}
			SymbolTable.tree.exit();

			return error(
				new CompilerError('LLVM IR: Verifying function failed', this.filename, this.getErrorContext(node)),
			);
		}

		if (this.inMain && isMain) {
			this.inMain = false;
		}

		if (this.debug) {
			console.log(`IR Converter: finished converting FunctionDeclaration ${funcName}`);
		}
		SymbolTable.tree.exit();

		return ok(func);
	}

	private convertIdentifier(node: ASTIdentifier): Result<llvm.Value, CompilerError | SymbolError> {
		const aParam = this.getParameter(node);
		if (aParam.has()) {
			return ok(aParam.value);
		}

		return this.getVariable(node);
	}

	private getParameter(node: ASTIdentifier): Maybe<llvm.Argument> {
		const maybeSymbolInfo = SymbolTable.lookup(node.name, ['parameter'], {
			debug: this.debug,
		});
		if (!maybeSymbolInfo.has()) {
			return hasNot();
		}

		const llvmArgument = (maybeSymbolInfo.value as ParamSym).llvmArgument;
		if (typeof llvmArgument === 'undefined') {
			if (this.debug) {
				console.debug(`IR Converter: Found parameter ${node.name}, but it doesn't have an llvmArgument`);
			}

			return hasNot();
		}

		return has(llvmArgument);
	}

	private getVariable(node: ASTIdentifier): Result<llvm.Value, CompilerError> {
		const maybeSymbolInfo = SymbolTable.lookup(node.name, ['variable'], {
			debug: this.debug,
		});
		const err = error<CompilerError>(
			new CompilerError(
				`LLVM IR: We don't recognize the "${node.name}" Identifier`,
				this.filename,
				this.getErrorContext(node),
			),
		);

		if (!maybeSymbolInfo.has()) {
			return err;
		}

		const allocaInst = (maybeSymbolInfo.value as VarSym).allocaInst;
		if (typeof allocaInst === 'undefined') {
			return err;
		}

		const load = this.builder.CreateLoad(allocaInst.getType().getPointerElementType(), allocaInst);

		return ok(load);
	}

	private convertNumberLiteral(node: ASTNumberLiteral): Result<llvm.ConstantInt, CompilerError | SymbolError> {
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
		// llvm.ConstantInt.get()
		return ok(this.builder.getIntN(size.bits, value));
	}

	/** Unline other convertXyz methods, this does no conversion, but rather checks */
	private checkParameter(ast: ASTParameter): Result<undefined, CompilerError | SymbolError> {
		const astType = ast.type;
		if (typeof astType === 'undefined') {
			return error(
				new CompilerError(
					`LLVM IR: We don't know the type of ${ast.name.name}`,
					this.filename,
					this.getErrorContext(ast),
				),
			);
		}

		const type = this.convertType(astType);
		if (type.isError()) {
			return type;
		}

		return ok(undefined);
		// try {
		// 	const allocaInst = this.builder.CreateAlloca(type.value, null, ast.name.name);

		// 	this.valueMap.set(ast.name.name, allocaInst);

		// 	const defaultValue = ast.defaultValue;
		// 	if (typeof defaultValue !== 'undefined') {
		// 		const llvmValue = this.convertNode(defaultValue);
		// 		if (llvmValue.isError()) {
		// 			return llvmValue;
		// 		}

		// 		this.builder.CreateStore(llvmValue.value as llvm.Value, allocaInst);
		// 	}

		// 	return ok(allocaInst);
		// } catch (err) {
		// 	return error(err as Error);
		// }
	}

	// convert an ASTPrintStatement to an LLVM IR printf call
	private convertPrintStatement(ast: ASTPrintStatement): Result<llvm.Value, CompilerError | SymbolError> {
		const exprToPrintResults: Array<Result<llvm.Value | string, CompilerError>> = ast.expressions.map((expr) => {
			return this.convertNode(expr) as Result<llvm.Value, CompilerError>;
		});
		// check if any of the expressions failed
		if (Results.anyIsError(exprToPrintResults)) {
			return Results.getFirstError(exprToPrintResults);
		}

		const exprsToPrint = Results.unwrapResults(exprToPrintResults);

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

		const format = formatStrings.join(' ');

		return ok(this.proxy.printf(format, ...exprsToPrint));
	}

	private convertReturnStatement(ast: ASTReturnStatement): Result<llvm.Value, CompilerError | SymbolError> {
		if (ast.expressions.length === 0) {
			// blank `return;`
			// In C, `main()` must return an int for the exit code, therefore
			// we polyfill any empty return, including nested ones
			if (this.inMain) {
				return ok(this.builder.CreateRet(this.builder.getInt32(0)));
			}

			return ok(this.builder.CreateRetVoid());
		}

		const exprsToReturn: Array<Result<llvm.Value, CompilerError>> = ast.expressions.map((expr) => {
			// each expression can only be one value
			return this.convertNode(expr) as Result<llvm.Value, CompilerError>;
		});
		// check if any of the expressions failed
		if (!Results.allOk(exprsToReturn)) {
			return Results.getFirstError(exprsToReturn);
		}

		// TODO handle multiple return values
		if (this.debug) {
			console.debug(`IR Converter: Creating Return`);
		}
		return ok(this.builder.CreateRet(exprsToReturn[0].value));
	}

	private convertStringLiteral(node: ASTStringLiteral): Result<llvm.ConstantInt, CompilerError | SymbolError> {
		return ok(this.builder.CreateGlobalStringPtr(node.value));
	}

	// convert ASTType to LLVM IR type
	private convertType(ast: ASTType | undefined): Result<llvm.Type, CompilerError | SymbolError> {
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
								`LLVM IR: We don't recognize the "${(ast as ASTIdentifier).name}" Identifier`,
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
								`LLVM IR: Unknown number size "${(ast as ASTTypeNumber).size}"`,
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
								`LLVM IR: Unknown primitive type "${(ast as ASTTypePrimitive).type}"`,
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
				`LLVM IR: TODO: llvm_ir_converter.convertType(${ast.constructor.name}) is unsupported`,
				this.filename,
				this.getErrorContext(ast),
			),
		);
	}

	private convertTypes(asts: ASTType[]): Result<llvm.Type[], CompilerError | SymbolError> {
		return CreateResultFrom.arrayOfResults(asts.map((ast) => this.convertType(ast)));
	}

	// convert an ASTVariableDeclaration to an LLVM IR alloca instruction
	private convertVariableDeclaration(ast: ASTVariableDeclaration): Result<llvm.Value[], CompilerError | SymbolError> {
		const allocas = ast.identifiersList.map((identifier, index) => {
			const astType = ast.declaredTypes.at(index) || ast.inferredPossibleTypes.at(index)?.at(0);
			if (typeof astType === 'undefined') {
				return error(
					new CompilerError(
						`LLVM IR: We don't know the type of ${identifier.name}`,
						this.filename,
						this.getErrorContext(ast),
					),
				);
			}

			const type = this.convertType(astType);
			if (type.isError()) {
				return type;
			}

			try {
				const allocaInst = this.builder.CreateAlloca(type.value, null, identifier.name);

				const wasSet = SymbolTable.setVariableAllocaInst(identifier.name, allocaInst, {
					debug: this.debug,
				});
				if (wasSet.isError()) {
					return wasSet;
				}
				// this.valueMap.set(identifier.name, allocaInst);

				const initialValue = ast.initialValues.at(index);
				if (typeof initialValue !== 'undefined') {
					const llvmValue = this.convertNode(initialValue);
					if (llvmValue.isError()) {
						return llvmValue;
					}

					this.builder.CreateStore(llvmValue.value as llvm.Value, allocaInst);
				}

				return ok(allocaInst);
			} catch (err) {
				return error(err as CompilerError | SymbolError);
			}
		}) satisfies Result<llvm.Value, CompilerError | SymbolError>[];

		return CreateResultFrom.arrayOfResults(allocas);
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
