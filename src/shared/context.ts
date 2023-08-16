import JoelangError from './errors/error';
import { Pos } from './pos';

export default class Context {
	/** the source code */
	code = '';

	/** line begins at 1 */
	line = 1;

	/** position on the line begins at one and resets each time the line changes */
	col = 1;

	/** The length of the erroneous code, or how many ^^^s to use */
	length = 1;

	constructor(code: string, ast: { pos: Pos });
	constructor(code: string, line: number, col: number, length: number);
	constructor(code: string, astOrLine: { pos: Pos } | number, col?: number, length?: number) {
		this.code = code;

		if (typeof astOrLine === 'number') {
			this.line = astOrLine;
			this.col = col || 1;
			this.length = length || 1;
		} else {
			this.line = astOrLine.pos.line;
			this.col = astOrLine.pos.col;
			this.length = length || astOrLine.pos.end - astOrLine.pos.start;
		}
	}

	toStringArray(error: JoelangError): string[] {
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

		// The number of carets should be the length of the erroneous
		// code, or the length of the line, whichever is smaller
		// For example, if the line has 5 chars, and the issue is on 2 of them,
		// then we want 2 carets. But, if the issue is longer than the line,
		// just put carets on the whole line but shouldn't extend beyond that.
		const caretCount = Math.min(this.length, currentLine.content.length);

		return [
			// blank line to start
			prefix,

			// previous line, if any
			...(prevLine ? [lineToString(prevLine)] : []),

			// current line
			lineToString(currentLine),

			// ^^^
			`${prefix} ${' '.repeat(this.col - 1)}${'^'.repeat(caretCount)} ${error.getCode()}: ${error.message}`,

			// next line, if any
			...(nextLine ? [lineToString(nextLine)] : []),

			// blank line to end
			prefix,
		];
	}
}
