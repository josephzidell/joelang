import llvm from 'llvm-bindings';

export const cFuncTypes = {
	printf: (builder: llvm.IRBuilder): llvm.FunctionType => {
		return llvm.FunctionType.get(builder.getInt32Ty(), [builder.getInt8PtrTy()], true);
	},
	readStr: (builder: llvm.IRBuilder): llvm.FunctionType => {
		return llvm.FunctionType.get(builder.getInt8PtrTy(), [], false);
	},
};

export const cFuncMap = {
	printf: (module: llvm.Module, builder: llvm.IRBuilder) => {
		return (
			module.getFunction('printf') ||
			llvm.Function.Create(
				cFuncTypes.printf(builder),
				llvm.Function.LinkageTypes.ExternalLinkage,
				'printf',
				module,
			)
		);
	},
	readStr: (module: llvm.Module, builder: llvm.IRBuilder): llvm.Function => {
		// Declare the readStr function
		return (
			module.getFunction('readStr') ||
			llvm.Function.Create(
				cFuncTypes.readStr(builder),
				llvm.Function.LinkageTypes.ExternalLinkage,
				'readStr',
				module,
			)
		);
	},
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

	public readStr(): llvm.CallInst {
		const readStrFunc = cFuncMap.readStr(this.module, this.builder);

		return this.builder.CreateCall(readStrFunc, [], 'readStrCall');
	}

	public printf(format: string, ...values: Array<string | llvm.Value>): llvm.CallInst {
		const formatStr = this.builder.CreateGlobalStringPtr(format);

		// create printf call
		const printfFunc = cFuncMap.printf(this.module, this.builder);
		const printfCall = this.builder.CreateCall(printfFunc, [
			formatStr,
			...values.map((expr) => {
				// convert everything to `llvm.Value`s
				if (typeof expr === 'string') {
					return this.builder.CreateGlobalStringPtr(expr);
				}

				return expr;
			}),
		]);

		return printfCall;
	}
}
