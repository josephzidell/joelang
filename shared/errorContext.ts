export default class ErrorContext {
	/** the source code */
	code = '';

	/** line begins at 1 */
	line = 1;

	/** position on the line begins at one and resets each time the line changes */
	col = 1;

	/** The length of the erroneous code, or how many ^^^s to use */
	length = 1;

	constructor(code: string, line: number, col: number, length: number) {
		this.code = code;
		this.line = line;
		this.col = col;
		this.length = length;
	}

	toStringArray(errorMessage: string): string[] {
		const lines = this.code.split('\n');

		type Line = {
			number: number;
			content: string;
		};

		// prev line
		const prevLine: Line | undefined =
			this.line > 1
				? {
						number: this.line - 1,
						content: lines[this.line - 2],
				  }
				: undefined;

		// current line
		const currentLine: Line = {
			number: this.line,
			content: lines[this.line - 1],
		};

		// next line
		const nextLine: Line | undefined =
			this.line < lines.length - 1
				? {
						number: this.line + 1,
						content: lines[this.line],
				  }
				: undefined;

		const prefix = `${' '.repeat((nextLine?.number ?? currentLine.number).toString().length)} |`;

		const lineToString = (line: Line): string => `${line.number} | ${line.content}`;

		return [
			// blank line to start
			prefix,

			// previous line, if any
			...(prevLine ? [lineToString(prevLine)] : []),

			// current line
			lineToString(currentLine),

			// ^^^
			`${prefix} ${' '.repeat(this.col - 1)}${'^'.repeat(this.length)} ${errorMessage}`,

			// next line, if any
			...(nextLine ? [lineToString(nextLine)] : []),

			// blank line to end
			prefix,
		];
	}
}
