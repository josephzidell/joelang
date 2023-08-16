import Context from '../shared/context';
import JoelangError from '../shared/errors/error';

export default class LLVMError extends JoelangError {
	/** TODO this is temporary while Joelang is being built */
	static TODOThisIsTemp = (yourMsg: string, filename: string, context: Context) =>
		new LLVMError('Temp', `LLVM: TODO: ${yourMsg}`, filename, context);

	/** msg: `LLVM: Verifying module failed` */
	static VerifyModuleFailed = (filename: string, ctx: Context) => new LLVMError('IR001', 'LLVM: Verifying module failed', filename, ctx);
	/** msg: `LLVM: No llvm.Function found for ${funcName}` */
	static FuncNotFound = (funcName: string, filename: string, ctx: Context) =>
		new LLVMError('IR002', `LLVM IR: No llvm.Function found for ${funcName}`, filename, ctx);
	/** msg: `LLVM: LLVM IR: We don't recognize ${what}` */
	static Unrecognized = (what: string, filename: string, ctx: Context) =>
		new LLVMError('IR003', `LLVM IR: LLVM IR: We don't recognize ${what}`, filename, ctx);
	/** msg: `LLVM: Verifying function failed` */
	static VerifyFuncFailed = (funcName: string, filename: string, ctx: Context) =>
		new LLVMError('IR004', `LLVM: Verifying function ${funcName} failed`, filename, ctx);
	/** msg: `LLVM: LLVM IR: We don't know ${what}` */
	static Unknown = (what: string, filename: string, ctx: Context) =>
		new LLVMError('IR005', `LLVM IR: LLVM IR: We don't know ${what}`, filename, ctx);

	private filename;

	constructor(code: string, message: string, filename: string, context: Context, cause?: JoelangError) {
		super(code, message, context, cause);

		this.filename = filename;
	}

	getFilename(): string {
		return this.filename;
	}
}
