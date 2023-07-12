import llvm from 'llvm-bindings';

export const cFuncTypes = {
	printf: (builder: llvm.IRBuilder): llvm.FunctionType => {
		return llvm.FunctionType.get(builder.getInt32Ty(), [builder.getInt8PtrTy()], true);
	},
};
