import { inspect } from 'util';
import JoelangError from './errors/error';

export enum Color {
	Red = 31,
	Green = 32,
	Yellow = 93,
	Blue = 34,
	Magenta = 35,
	Cyan = 36,
	White = 37,
	Grey = 90,
	LightBlue = 94,
	Orange = '38;5;208',
}

export function colorize(text: string, color: Color, bold: boolean = false): string {
	const boldCode = bold ? '1;' : '';
	const escapeCode = `\u001b[${boldCode}${color}m`;
	const resetCode = '\u001b[0m';
	return `${escapeCode}${text}${resetCode}`;
}

function autoColorize(item: unknown): string {
	if (typeof item === 'string') {
		return colorize(item, Color.Green);
	} else if (typeof item === 'number') {
		return colorize(item.toString(), Color.Yellow);
	} else if (typeof item === 'boolean') {
		return colorize(item.toString(), Color.Blue);
	} else if (item === null) {
		return colorize('null', Color.White, true);
	} else if (item === undefined) {
		return colorize('undefined', Color.Grey);
	} else if (typeof item === 'symbol') {
		return colorize(item.toString(), Color.Green);
	} else if (typeof item === 'object') {
		return colorize(objToString(item), Color.Cyan);
	} else {
		return item.toString();
	}
}

export function stripColor(text: string): string {
	// eslint-disable-next-line no-control-regex
	return text.replace(/\u001b\[[0-9;]*m/g, '');
}

export function objToString(obj: unknown): string {
	return inspect(obj, { compact: 1, showHidden: false, depth: null, colors: true });
}

export type DedentFunc = () => void;

export class Log {
	private static indentation = 0;

	constructor(
		private color: Color,
		private name: string,
	) {}

	log(...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.log(this.preambleForCont(), ' ', ...args);
	}

	debug(...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.debug(this.preambleForCont(), '🐞', ...args);
	}

	info(...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.info(this.preambleForCont(), '📢', ...args);
	}

	warn(...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.warn(this.preambleForCont(), '⚠️', ...args);
	}

	/**
	 * This works differently than the other methods here in that:
	 * - it takes a Joelang Error rather than a custom message
	 * - it displays even if debug is off
	 *
	 * @param type Error type
	 * @param error The Joelang Error
	 * @param additional Callback for any additional logging after the context is displayed
	 */
	error(type: string, error: JoelangError, additional?: () => void) {
		console.error(this.preambleForCont(), '🚨', `Error[${type}/${error.getCode()}]: ${error.message}`);
		if (error.cause) {
			console.error(this.preambleForCont(), '🚨', `Caused by: ${error.cause}`);
		}
		error
			.getContext()
			.toStringArray(error)
			.forEach((str) => console.error(this.preambleForCont(), '🚨', str));

		if (additional) {
			additional();
		}
	}

	success(...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.log(this.preambleForCont(), '✅', ...args);
	}

	vars(...objs: Array<Record<string, unknown>>) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		for (const obj of objs) {
			this.printObject(obj);
		}
	}

	table(caption: string, tabularData: unknown) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.log(this.preambleForCont(), '📊', caption);
		// console.table(tabularData);
		this.captureConsoleTable(() => {
			console.table(tabularData);
		}).forEach((line) => console.log(this.preambleForCont(), '📊', line));
	}

	/** Indents with info message, and returns a dedent function */
	indentWithInfo(...args: unknown[]): DedentFunc {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return () => {};
		}

		this.info(...args); // log first so the indentation lines will come from it, beneath it

		return this.indent();
	}

	debugAndDedent(dedent: DedentFunc, ...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.debug(this.preambleForEnd(), '🐞', ...args);

		dedent();
	}

	infoAndDedent(dedent: DedentFunc, ...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.info(this.preambleForEnd(), '📢', ...args);

		dedent();
	}

	successAndDedent(dedent: DedentFunc, ...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.log(this.preambleForEnd(), '✅', ...args);

		dedent();
	}

	warnAndDedent(dedent: DedentFunc, ...args: unknown[]) {
		if (typeof process.env.DEBUG === 'undefined' || process.env.DEBUG === '0') {
			return;
		}

		console.warn(this.preambleForEnd(), '⚠️', ...args);

		dedent();
	}

	indentFor(fn: () => void) {
		const dedentFn = this.indent();
		fn();
		dedentFn();
	}

	private captureConsoleTable(fn: () => void) {
		let output = '';
		const originalLog = console.log;
		console.log = (message) => {
			output += message + '\n';
		};
		try {
			fn();
		} finally {
			console.log = originalLog;
		}
		return output.split('\n');
	}

	private printObject(obj: Record<string, unknown>) {
		this.renderObjAsTable(obj).forEach((line) => this.log(line));
	}

	private dividerLine(left: string, between: string, right: string, widestKey: number, widestLineInValue: number) {
		return left + '─'.repeat(widestKey + 2) + between + '─'.repeat(widestLineInValue + 2) + right;
	}

	private renderObjAsTable(data: Record<string, unknown>) {
		const rows: Array<[string, string[]]> = [];

		// Prepare the table rows and calculate column widths
		let widestKey = 0;
		let widestLineInValue = 0;
		for (const [key, value] of Object.entries(data)) {
			// update widest key
			widestKey = Math.max(widestKey, key.length);

			// value can be a string, multiline string, or anything else
			let valueLines: string[] = [];

			if (typeof value === 'object' && value !== null) {
				valueLines = objToString(value).split('\n');
			} else if (typeof value === 'string' && value.includes('\n')) {
				valueLines = value.split('\n').map(autoColorize);
			} else {
				valueLines = [autoColorize(value)];
			}

			// get widest line in value
			widestLineInValue = valueLines.reduce((max, line) => Math.max(max, stripColor(line).length), widestLineInValue);

			rows.push([key, valueLines]);
		}

		return [
			// Top divider
			this.dividerLine('┌', '┬', '┐', widestKey, widestLineInValue),

			// all the lines
			...rows.flatMap(([v, lines], index) => {
				const newLines: string[] = [];

				newLines.push(
					...lines.map((line, index) => {
						// coloring adds control characters to the string, which when used in padding calculations,
						// yields a technically correct but visually wrong result, since the control characters
						// collpase. So we need to strip the control characters before calculating the padding,
						// and then add them back in after by replacing the raw string with the colorized one.
						const rawLine = stripColor(line); // we need this to calculate the padding
						const paddedVal = rawLine.padEnd(widestLineInValue).replace(rawLine, line);

						return `│ ${(index === 0 ? v : '').padEnd(widestKey)} │ ${paddedVal} │`;
					}),
				);

				// divider line for every var except the last
				if (index < rows.length - 1) {
					newLines.push(this.dividerLine('├', '┼', '┤', widestKey, widestLineInValue));
				}

				return newLines;
			}),

			// Bottom divider
			this.dividerLine('└', '┴', '┘', widestKey, widestLineInValue),
		];
	}

	/** Indents and returns a dedent function */
	private indent(): DedentFunc {
		Log.indentation++;

		return () => {
			this.dedent();
		};
	}

	private dedent() {
		// we could silently ignore, but we need logging to be done right
		if (Log.indentation === 0) {
			throw new Error('Cannot dedent when indent is 0');
		}

		// if (includeEndLine) {
		// 	console.log(Log.indentationEnd() + colorize(this.name, this.color) + ' End');
		// }

		Log.indentation--;

		return this;
	}

	private preambleForCont(): string {
		return Log.indentationCont() + colorize(this.name, this.color);
	}

	private preambleForEnd(): string {
		return Log.indentationEnd() + colorize(this.name, this.color);
	}

	private static indentationEnd(): string {
		switch (Log.indentation) {
			case 0:
				return '';
			case 1:
				return ' └── ';
			case 2:
				return ' │   └── ';
			case 3:
				return ' │   │   └── ';
			case 4:
				return ' │   │   │   └── ';
			case 5:
				return ' │   │   │   │   └── ';
			case 6:
				return ' │   │   │   │   │   └── ';
			case 7:
				return ' │   │   │   │   │   │   └── ';
			case 8:
				return ' │   │   │   │   │   │   │   └── ';
			case 9:
				return ' │   │   │   │   │   │   │   │   └── ';
			case 10:
				return ' │   │   │   │   │   │   │   │   │   └── ';
			default:
				return ' │   │   │   │   │   │   │   │   │   │   └── ';
		}
	}

	private static indentationCont(): string {
		switch (Log.indentation) {
			case 0:
				return '';
			case 1:
				return ' ├── ';
			case 2:
				return ' │   ├── ';
			case 3:
				return ' │   │   ├── ';
			case 4:
				return ' │   │   │   ├── ';
			case 5:
				return ' │   │   │   │   ├── ';
			case 6:
				return ' │   │   │   │   │   ├── ';
			case 7:
				return ' │   │   │   │   │   │   ├── ';
			case 8:
				return ' │   │   │   │   │   │   │   ├── ';
			case 9:
				return ' │   │   │   │   │   │   │   │   ├── ';
			case 10:
				return ' │   │   │   │   │   │   │   │   │   ├── ';
			default:
				return ' │   │   │   │   │   │   │   │   │   │   ├── ';
		}
	}
}

export default {
	lexer: new Log(Color.LightBlue, 'Lexer      '),
	parser: new Log(Color.Green, 'Parser     '),
	analyzer: new Log(Color.Yellow, 'Analyzer   '),
	semantics: new Log(Color.Orange, 'Semantics  '),
	symbolTable: new Log(Color.Magenta, 'SymbolTable'),
	llvm: new Log(Color.Cyan, 'LLVM       '),
	compiler: new Log(Color.Red, 'Compiler   '),
};
