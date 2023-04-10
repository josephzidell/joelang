export default class CompilerError extends TypeError {
	private filename;

	constructor(message: string, context: string) {
		super(message);

		this.filename = context;
	}

	getFilename(): string {
		return this.filename;
	}
}
