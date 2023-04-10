import llvm from 'llvm-bindings';
import {
	AST,
	ASTFunctionDeclaration,
	ASTIdentifier,
	ASTPrintStatement,
	ASTProgram,
	ASTType,
	ASTTypeNumber,
	ASTTypePrimitive,
	ASTVariableDeclaration,
	primitiveAstType,
} from '../analyzer/asts';
import { NumberSize } from '../shared/numbers/sizes';
import { Result, error, flattenResults, ok } from '../shared/result';
import CompilerError from './error';
import convertStdLib from './stdlib';

export default class LlvmIrConverter {
	private context: llvm.LLVMContext;
	private module!: llvm.Module;
	private builder!: llvm.IRBuilder;
	private stdlib!: llvm.Module;
	private filename = '';
	private valueMap = new Map<string, llvm.Value>();

	constructor() {
		this.context = new llvm.LLVMContext();
	}

	public convert(files: Record<string, ASTProgram>): Record<string, Result<llvm.Module>> {
		const map = {} as Record<string, Result<llvm.Module>>;

		for (const [filename, ast] of Object.entries(files)) {
			this.filename = filename;
			this.module = new llvm.Module(this.filename, this.context);
			this.builder = new llvm.IRBuilder(this.context);

			// compile standard library
			this.stdlib = convertStdLib(this.context, this.module, this.builder);

			// walk the AST and convert each node to LLVM IR
			const conversionResult = this.convertNodes(ast.declarations);
			if (conversionResult.outcome === 'error') {
				map[this.filename] = error(conversionResult.error);
				continue;
			}

			if (llvm.verifyModule(this.module)) {
				map[this.filename] = error(new CompilerError('Verifying module failed', this.filename));
				continue;
			}

			map[this.filename] = ok(this.module);
		}

		return map;
	}

	// convert an AST node to LLVM IR
	private convertNode(node: AST): Result<llvm.Value | llvm.Value[]> {
		switch (node.constructor.name) {
			case 'ASTFunctionDeclaration':
				return this.convertFunctionDeclaration(node as ASTFunctionDeclaration);
			case 'ASTPrintStatement':
				return this.convertPrintStatement(node as ASTPrintStatement);
			case 'ASTVariableDeclaration':
				return this.convertVariableDeclaration(node as ASTVariableDeclaration);
		}

		return error(new CompilerError(`convertNode: Unknown AST node "${node.constructor.name}"`, this.filename));
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
		// TODO handle multiple return types
		const funcReturnType = this.convertType(node.returnTypes[0]);
		if (funcReturnType.outcome === 'error') {
			return funcReturnType;
		}

		const params = flattenResults(node.params.map((param) => this.convertType(param.declaredType)));
		if (params.outcome === 'error') {
			return params;
		}

		// create function type
		const functionType = llvm.FunctionType.get(funcReturnType.value, params.value, false);

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
			return conversionResult;
		}

		// return value
		if (funcReturnType.value.getTypeID() === this.builder.getVoidTy().getTypeID()) {
			this.builder.CreateRetVoid();
		} else {
			this.builder.CreateRet(conversionResult.value[0]);
		}

		// verify it
		if (llvm.verifyFunction(func)) {
			return error(new CompilerError('Verifying function failed', this.filename));
		}

		return ok(func);
	}

	// convert an ASTPrintStatement to an LLVM IR printf call
	private convertPrintStatement(ast: ASTPrintStatement): Result<llvm.Value> {
		// get printf function
		const printfFunc = this.stdlib.getFunction('printf');
		if (printfFunc === null) {
			return error(new CompilerError('printf function not found', this.filename));
		}

		// create format string
		const exprToPrint = ast.expressions
			.map((expr) => {
				if (expr.constructor.name === 'ASTIdentifier') {
					const arg = this.valueMap.get((expr as ASTIdentifier).name);
					if (typeof arg === 'undefined') {
						return error(
							new CompilerError(
								`PrintStatement: We don't recognize "${(expr as ASTIdentifier).name}"`,
								this.filename,
							),
						);
					}

					return arg;
				}

				return expr.toString();
			})
			.join(' ');

		const formatString = this.builder.CreateGlobalStringPtr(exprToPrint);

		// create printf call
		const printfCall = this.builder.CreateCall(printfFunc, [formatString]);

		return ok(printfCall);
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
							new CompilerError(`We don't recognize "${(ast as ASTIdentifier).name}"`, this.filename),
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
							new CompilerError(`Unknown number size "${(ast as ASTTypeNumber).size}"`, this.filename),
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
							),
						);
					}
				}
				break;
		}

		return error(
			new CompilerError(`convertType: Please add AST type "${ast.constructor.name}" to the list`, this.filename),
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

new LlvmIrConverter();
