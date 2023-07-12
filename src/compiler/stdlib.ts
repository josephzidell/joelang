import llvm from 'llvm-bindings';
import { cFuncTypes } from './stdlibs.types';

export default function convertStdLib(context: llvm.LLVMContext): llvm.Module {
	const module = new llvm.Module('stdlib', context);
	const builder = new llvm.IRBuilder(context);

	createPrintfDeclaration(context, module, builder);

	return module;
}

function createPrintfDeclaration(context: llvm.LLVMContext, module: llvm.Module, builder: llvm.IRBuilder) {
	module.getOrInsertFunction('printf', cFuncTypes.printf(builder));
}
