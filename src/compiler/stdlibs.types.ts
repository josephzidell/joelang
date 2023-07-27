import llvm from 'llvm-bindings';

const cFuncs = ['printf', 'readStr'] as const;
type cFunc = (typeof cFuncs)[number];

/**
 * stdlibFuncTypes is a map of stdlib function names to their llvm.FunctionType
 */
export const stdlibLlvmFuncTypes: { [key in cFunc]: (builder: llvm.IRBuilder) => llvm.FunctionType } = {
	printf: (builder: llvm.IRBuilder): llvm.FunctionType =>
		llvm.FunctionType.get(builder.getInt32Ty(), [builder.getInt8PtrTy()], true),
	readStr: (builder: llvm.IRBuilder): llvm.FunctionType => llvm.FunctionType.get(builder.getInt8PtrTy(), [], false),
};

/**
 * stdlibFuncs will get the llvm.Function from the module or declare it if it doesn't exist
 *
 * @param name the name of the function
 * @param module the llvm.Module
 * @param builder the llvm.IRBuilder
 * @returns the llvm.Function
 */
export const stdlibLlvmFunc = (name: cFunc, module: llvm.Module, builder: llvm.IRBuilder) => {
	return (
		module.getFunction(name) ||
		llvm.Function.Create(
			stdlibLlvmFuncTypes[name](builder),
			llvm.Function.LinkageTypes.ExternalLinkage,
			name,
			module,
		)
	);
};

/**
 * Proxy will proxy stdlib function calls by:
 * 1. taking args similar to the func,
 * 2. getting the llvm.Function from llvmFunctions
 * 3. creating a call
 */
export class Proxy {
	private context: llvm.LLVMContext;
	private module: llvm.Module;
	private builder: llvm.IRBuilder;

	constructor(context: llvm.LLVMContext, module: llvm.Module, builder: llvm.IRBuilder) {
		this.context = context;
		this.module = module;
		this.builder = builder;
	}

	public printf(format: string, ...values: Array<string | llvm.Value>): llvm.CallInst {
		const formatStr = this.builder.CreateGlobalStringPtr(format);

		// create printf call
		const printfFunc = stdlibLlvmFunc('printf', this.module, this.builder);

		return this.builder.CreateCall(printfFunc, [
			formatStr,
			...values.map((expr) => {
				// convert everything to `llvm.Value`s
				if (typeof expr === 'string') {
					return this.builder.CreateGlobalStringPtr(expr);
				}

				return expr;
			}),
		]);
	}

	public readStr(): llvm.CallInst {
		const readStrFunc = stdlibLlvmFunc('readStr', this.module, this.builder);

		return this.builder.CreateCall(readStrFunc, 'readStrCall');
	}
}
