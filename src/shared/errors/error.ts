import Context from '../context';

abstract class JoelangError extends Error {
	private code;
	private context;

	constructor(code: string, message: string, context: Context, cause?: JoelangError) {
		super(message);

		this.code = code;
		this.context = context;
		this.cause = cause;
	}

	getCode(): string {
		return this.code;
	}

	getContext(): Context {
		return this.context;
	}
}

export default JoelangError;
