import llvm from 'llvm-bindings';
import { cFuncTypes } from './stdlibs.types';

export default function defineStdLib(
	context: llvm.LLVMContext,
	module: llvm.Module,
	builder: llvm.IRBuilder,
): [llvm.Module, llvm.IRBuilder] {
	createPrintfDeclaration(context, module, builder);

	return [module, builder];
}

function createPrintfDeclaration(context: llvm.LLVMContext, module: llvm.Module, builder: llvm.IRBuilder) {
	module.getOrInsertFunction('printf', cFuncTypes.printf(builder));
}
