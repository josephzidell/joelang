import llvm from 'llvm-bindings';

export default function convertStdLib(
	context: llvm.LLVMContext,
	module: llvm.Module,
	builder: llvm.IRBuilder,
): llvm.Module {
	createPrintfDeclaration(context, module, builder);

	return module;
}

function createPrintfDeclaration(context: llvm.LLVMContext, module: llvm.Module, builder: llvm.IRBuilder) {
	module.getOrInsertFunction(
		'printf',
		llvm.FunctionType.get(
			builder.getInt32Ty(), // return type
			[builder.getInt8PtrTy()], // any string is an array of chars, which are i8s
			true,
		),
	);
}
