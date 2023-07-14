import ErrorContext from '../shared/errorContext';

export default class CompilerError extends TypeError {
	private filename;
	private context;

	constructor(message: string, filename: string, context: ErrorContext) {
		super(message);

		this.filename = filename;
		this.context = context;
	}

	getFilename(): string {
		return this.filename;
	}

	getContext(): ErrorContext {
		return this.context;
	}
}
