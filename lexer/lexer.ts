import LexerError from "./error";
import {Token, TokenType, keywords, patterns, specialValueTypes, types} from './types';
import { regexFlags, standardizeLineEndings } from "./util";

export default class {
	/** position begins at 0 and counts till the end of the script */
	cursorPosition = 0;

	/** line begins at 1 */
	line = 1;

	/** position on the line begins at one and resets each time the line changes */
	col = 1;

	/** the source code */
	code: string = '';

	/** track all tokens */
	tokens: Token[] = [];

	/** char at the cursorPosition */
	char = '';

	/**
	 * Sets up the lexer, and standardizes the line endings
	 *
	 * @param code - Source code
	 */
	constructor (code: string) {
		if (typeof code !== 'string' || code.length === 0) {
			throw new LexerError('No source code found', this.tokens);
		}

		this.code = code;

		// fix line endings
		this.code = standardizeLineEndings(this.code);
	}

	/**
	 * Main runner to lexify the source code
	 *
	 * @returns an array of Tokens
	 */
	lexify (): Token[] {
		const singleCharTokens: Record<string, TokenType> = {
			[patterns.SEMICOLON]: 'semicolon',
			[patterns.COLON]: 'colon',
			[patterns.COMMA]: 'comma',
			[patterns.QUESTION]: 'question',
			'{': 'brace_open',
			'}': 'brace_close',
			'[': 'bracket_open',
			']': 'bracket_close',
			'(': 'paren_open',
			')': 'paren_close',
		};

		// loop through all characters
		while (this.cursorPosition < this.code.length) {
			this.char = this.code[this.cursorPosition];

			// capture these token must-haves at the start of a potentially multi-character token
			const [start, line, col] = [this.cursorPosition, this.line, this.col];

			// joelang ignores whitespace
			if (this.matchesRegex(patterns.WHITESPACE, this.char)) {
				this.next();

				continue;
			}

			/**
			 * Forward Slash
			 *
			 * Forward Slash can be:
			 * - The beginning of a comment
			 * - A division artihmetic symbol
			 * - A division/equals artihmetic symbol
			 * - The beginning of a regular expression
			 */
			if (this.char === patterns.FORWARD_SLASH) {
				this.peekAndHandle({
					[patterns.EQUALS]: 'forward_slash_equals',
					[patterns.FORWARD_SLASH]: () => this.processSingleLineComment(),
					[patterns.ASTERISK]: () => {
						// continue as long there are no more chars, and the current char isn't an * and the following char isn't a /
						let value = this.gobbleUntil(() => this.char === patterns.ASTERISK && this.peek() === patterns.FORWARD_SLASH);

						// skip the trailing asterisk and slash
						this.cursorPosition += 2;
						this.col += 2;
						this.tokens.push({ type: 'comment', start, end: this.cursorPosition, value: value + '*/', line, col });
					},
				}, () => {
					// these tokens precede a forward slash, so if they're found, this is NOT a regular expression
					const tokensThatPrecedeForwardSlash: TokenType[] = ['bracket_close', 'identifier', 'number', 'paren_close'];
					const prevToken = this.prevToken();
					const nextChar = this.peek();
					if ((typeof prevToken !== 'undefined' && tokensThatPrecedeForwardSlash.includes(prevToken.type)) || typeof nextChar === 'undefined' || this.matchesRegex(patterns.WHITESPACE, nextChar)) {
						this.tokens.push({ type: 'forward_slash', start, end: this.cursorPosition + 1, value: '/', line, col });
						this.next();

						return;
					}

					// regular expression
					let value =
						// opening slash
						this.getChar()

						// everything until the trailing slash
						// continue as long there are no more chars, and the current char isn't a / and the previous char isn't whitespace
						+ this.gobbleUntil(() => this.char === patterns.FORWARD_SLASH  && this.prevChar() !== patterns.ESCAPE)

						// the trailing slash itself
						+ (this.getChar() ?? '') // this is needed in case of a partial regex at the end of the code

						// check for flags
						+ this.gobbleAsLongAs(() => regexFlags.includes(this.char));

					this.tokens.push({ type: 'regex', start, end: this.cursorPosition, value, line, col });
				}, line, col);

				continue;
			}

			/** Hash */
			if (this.char === patterns.HASH) {
				this.processSingleLineComment();

				continue;
			}

			/**
			 * Operator characters that can be single or double: + ++, - --, | ||, & &&, ? ??
			 */
			if (this.char === patterns.PLUS) {
				this.peekAndHandle({
					[patterns.PLUS]: 'plus_plus',
					[patterns.EQUALS]: 'plus_equals',
				}, 'plus', line, col);

				continue;
			}

			if (this.char === patterns.MINUS) {
				this.peekAndHandle({
					[patterns.MINUS]: 'minus_minus',
					[patterns.EQUALS]: 'minus_equals',
					[patterns.GREATER_THAN]: 'right_arrow',
				}, 'minus', line, col);

				continue;
			}

			if (this.char === patterns.ASTERISK) {
				this.peekAndHandle({
					[patterns.EQUALS]: 'asterisk_equals',
				}, 'asterisk', line, col);

				continue;
			}

			if (this.char === patterns.MOD) {
				this.peekAndHandle({
					[patterns.EQUALS]: 'mod_equals',
				}, 'mod', line, col);

				continue;
			}

			if (this.char === patterns.PIPE) {
				this.peekAndHandle({
					[patterns.PIPE]: 'or',
					[patterns.GREATER_THAN]: 'triangle_close',
				}, undefined, line, col);

				continue;
			}

			if (this.char === patterns.AMPERSAND) {
				this.peekAndHandle({
					[patterns.AMPERSAND]: 'and',
				}, undefined, line, col);

				continue;
			}

			/** Other operators */
			if (this.char === patterns.EQUALS) {
				this.peekAndHandle({
					[patterns.EQUALS]: 'equals',
				}, 'assign', line, col);

				continue;
			}

			if (this.char === patterns.BANG) {
				this.peekAndHandle({
					[patterns.EQUALS]: 'not_equals',
				}, 'bang', line, col);

				continue;
			}

			if (this.char === patterns.LESS_THAN) {
				this.peekAndHandle({
					[patterns.EQUALS]: () => {
						this.peekAndHandle({
							[patterns.GREATER_THAN]: 'compare', // <=>
						}, 'less_than_equals', line, col, 2);
					},
					[patterns.PIPE]: 'triangle_open',
				}, 'less_than', line, col);

				continue;
			}

			if (this.char === patterns.GREATER_THAN) {
				this.peekAndHandle({
					[patterns.EQUALS]: 'greater_than_equals',
				}, 'greater_than', line, col);

				continue;
			}

			/** Numbers */
			if (this.matchesRegex(patterns.DIGITS, this.char)) {
				this.processNumbers();

				continue;
			}

			/**
			 * Exponents 1^e2
			 *
			 * For an exponent to be part of the number, the chars immediately before and after must also be numbers
			 * valid: 1^e234
			 * valid 123^e3
			 * invalid 123^e,456
			 * invalid ^e123
			 * invalid ^123
			 * invalid e123
			 * invalid 123^e // this is a number followed by a caret token
			 * invalid 123^ // this is a number followed by a caret token
			 * invalid 123e // this is a number followed by an identifier token
			 *
			 * if it's a caret, we check the previous and next chars
			 */
			if (this.char === patterns.CARET) {
				this.peekAndHandle({
					e: 'exponent',
				}, 'caret', line, col);

				continue;
			}

			/** Strings */
			if (patterns.DOUBLE_QUOTE === this.char || patterns.SINGLE_QUOTE === this.char) {
				// TODO double-quoted strings can have interpolation

				const quoteChar = this.char; // capture the type of quote to check for closing

				this.next(); // skip the quote char itself

				let value = '';

				while (this.cursorPosition < this.code.length) {
					/**
					 * this current char might be:
					 * - [x] an escape char
					 * - [x] an ending quote
					 * - [ ] beginning or end of interpolation
					 * - [x] an innocent char
					 */

					// ending quote
					if (this.char === quoteChar && this.prevChar() !== patterns.ESCAPE) {
						break;
					}

					// innocent char
					value += this.getChar();
				}

				// skip the closing quote char
				this.tokens.push({ type: 'string', start, end: this.cursorPosition + 1, value, line, col });

				this.next();

				continue;
			}

			if (this.char === patterns.SEMICOLON) {
				this.tokens.push({ type: 'semicolon', start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col });
				this.next();
				continue;
			}

			/** Single Character Tokens */
			if (typeof singleCharTokens[this.char] !== 'undefined') {
				this.tokens.push({ type: singleCharTokens[this.char], start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col });
				this.next();
				continue;
			}

			/** Letters or unicode */
			if (this.matchesRegex(patterns.LETTERS, this.char) || this.matchesRegex(patterns.UNICODE, this.char)) {
				let value = this.gobbleAsLongAs(() => this.matchesRegex(patterns.LETTERS, this.char) || this.matchesRegex(patterns.DIGITS, this.char) || this.matchesRegex(patterns.UNICODE, this.char) || this.char === patterns.UNDERSCORE);

				// check for '?'
				if (this.char === patterns.QUESTION) {
					value += this.getChar();
				}

				// check for '!'
				if (this.char === patterns.BANG) {
					value += this.getChar();
				}

				// check if it's a keyword, then check if it's a special value, otherwise it's an identifier
				// keywords in joelang are case sensitive
				if ((keywords as unknown as string[]).includes(value)) {
					this.tokens.push({ type: 'keyword', start, end: this.cursorPosition, value, line, col });
				} else if ((types as unknown as string[]).includes(value)) {
					this.tokens.push({ type: 'type', start, end: this.cursorPosition, value, line, col });
				} else {
					let type: TokenType = (specialValueTypes as Record<string, TokenType>)[value] || 'identifier';

					this.tokens.push({ type, start, end: this.cursorPosition, value, line, col });
				}

				continue;
			}

			/**
			 * The Dot
			 *
			 * It can be one of many things:
			 * - A singular dot, for member access
			 * - A double dot, for a range
			 * - A triple dot, for destructuring
			 * - The beginning of a FileType
			 */
			if (this.char === patterns.PERIOD) {
				this.peekAndHandle({
					[patterns.FORWARD_SLASH]: () => this.processPath(),
					[patterns.PERIOD]: () => {
						this.peekAndHandle({
							[patterns.PERIOD]: 'dotdotdot',
						}, 'dotdot', line, col, 2);
					},
				}, 'dot', line, col);

				continue;
			}

			if (this.char === patterns.AT) {
				this.peekAndHandle({
					[patterns.FORWARD_SLASH]: () => this.processPath(),
				}, undefined, line, col);

				continue;
			}

			// something we don't recognize
			throw new LexerError('Syntax Error. Unknown character: "' + this.char + '"', this.tokens);
		}

		return this.tokens;
	}

	/**
	 * Peeks at the next char and creates a token based on it, If not found, creates a token with just the current char
	 *
	 * Ex:
	 * ```ts
	 * this.peekAndHandle({
	 *     [patterns.MINUS]: 'minus_minus',
	 *     [patterns.EQUALS]: 'minus_equals',
	 * }, 'minus', line, col);
	 * ```
	 *
	 * Nested example:
	 * ```ts
	 * this.peekAndHandle({
	 *     [patterns.FORWARD_SLASH]: () => this.processPath(),
	 *     [patterns.PERIOD]: () => {
	 *         this.peekAndHandle({
	 *            [patterns.PERIOD]: 'dotdotdot',
	 *         }, 'dotdot', line, col, 2); // notice the `2` here
	 *     },
	 * }, 'dot', line, col);
	 * ```
	 *
	 * @param mapNextChar - mapping of the next possible char with what to do: a string means it's a token type, or a callback to run (in that case, we don't call this.next())
	 * @param fallback - token type to fall back on if none of the next chars match. May be undefined. In that case, if we cannot find a valid next character and the fallback is undefined, an error will be thrown
	 * @param line - of the token
	 * @param col - of the token
	 * @param level - which level is this being called at. This defaults to 1, and equals the number chars to process for the fallback case. Each time this method is nested, increase this.
	 *
	 * @throws Error if fallback is undefined and next char isn't defined in the map
	 */
	private peekAndHandle(mapNextChar: Record<string, TokenType | (() => void)>, fallback: TokenType | (() => void) | undefined, line: number, col: number, level = 1) {
		const nextChar = this.peek(level);
		if (typeof nextChar !== 'undefined' && typeof mapNextChar[nextChar] !== 'undefined') {
			/* since there is a next char, everything in this block uses `level + 1`, since we're at the next char */

			const tokenTypeOrCallback = mapNextChar[nextChar];

			if (typeof tokenTypeOrCallback === 'function') {
				tokenTypeOrCallback();

				return;
			}

			this.tokens.push({
				type: tokenTypeOrCallback,
				start: this.cursorPosition,
				end: this.cursorPosition + level + 1,
				value: this.code.substring(this.cursorPosition, this.cursorPosition + level + 1), // grab the requisite number of chars from the code
				line,
				col,
			});

			// skip next ${level + 1} characters
			for (let index = 0; index < level + 1; index++) {
				this.next();
			}

		// if this is undefined, there is no valid token for this last char, so ignore
		} else if (typeof fallback === 'string') {
			this.tokens.push({
				type: fallback,
				start: this.cursorPosition,
				end: this.cursorPosition + level,
				value: this.code.substring(this.cursorPosition, this.cursorPosition + level), // grab the requisite number of chars from the code
				line,
				col,
			});

			// skip next ${level} characters
			for (let index = 0; index < level; index++) {
				this.next();
			}

		// if fallback is a callback
		} else if (typeof fallback === 'function') {
			fallback();

		// if fallback is undefined and the next character isn't accounted for
		} else {
			// something we don't recognize
			throw new LexerError('Syntax Error. Unknown syntax: "' + this.code.substring(this.cursorPosition, this.cursorPosition + level) + '"', this.tokens);
		}
	}

	/** Captures the current char, advances position, and returns current char */
	getChar (): string | undefined {
		// capture the current char in a var
		const value = this.char;

		this.next();

		// finally, return the original char
		return value;
	}

	/** Grab chars as long as the predicate evaluates to true */
	gobbleAsLongAs(predicate: () => boolean): string {
		let value = '';

		while (this.cursorPosition < this.code.length && predicate()) {
			value += this.getChar();
		}

		return value;
	}

	/** Grab chars until the predicate evaluates to true */
	gobbleUntil(predicate: () => boolean): string {
		let value = '';

		while (this.cursorPosition < this.code.length && !predicate()) {
			value += this.getChar();
		}

		return value;
	}

	/**
	 * Checks whether the char matches the provided regex.
	 *
	 * This is a thin wrapper around RegExp.test(), which return true if the char is undefined, and we don't want that behavior.
	 */
	matchesRegex(regex: RegExp, char: string | undefined): boolean {
		if (typeof char === 'undefined') {
			return false;
		}

		return regex.test(char);
	}

	/**
	 * Advanced the cursorPosition and updates the current char
	 *
	 * This should be called right at the end of an iteration, right before `continue`.
	 *
	 * It can also be called if we're skipping a character.
	 */
	next() {
		// if this char is a newline, update the line and col
		if (this.matchesRegex(patterns.NEWLINE, this.char)) {
			this.line++;
			this.col = 1;
		} else {
			// otherwise just increment the column
			++this.col;
		}

		this.char = this.code[++this.cursorPosition];
	}

	/** Returns the previous char */
	prevChar(): string | undefined {
		return this.code[this.cursorPosition - 1];
	}

	/** Returns the previous token */
	prevToken(): Token | undefined {
		return this.tokens[this.tokens.length - 1];
	}

	/** Peeks ahead at the next char */
	peek(howMany = 1): string | undefined {
		return this.code[this.cursorPosition + howMany];
	}

	/**
	 * Paths can either begin with ./foo, or @/foo
	 *
	 * In the former case, the leading two chars are both part of the patterns.PATH regex
	 * since they are commonly found in paths.
	 *
	 * However, the latter case has the AT symbol which is not normally in paths.
	 * Thus, in that case, as explicitly grab that char, then continue after it with the regex.
	 */
	processPath() {
		// capture these at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

		let value = '';

		// if the path begins with an `@`, treat it differently, since that isn't in the patterns.PATH regex
		if (this.char === patterns.AT) {
			value += this.char;
			this.next();
		}

		value += this.gobbleAsLongAs(() => this.matchesRegex(patterns.PATH, this.char));
		this.tokens.push({ type: 'path', start, end: this.cursorPosition, value, line, col });
	}

	processNumbers() {
		// capture these at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

		let value = '';
		while (this.cursorPosition < this.code.length && this.matchesRegex(patterns.DIGITS, this.char) || this.char === patterns.COMMA || this.char === patterns.PERIOD) {
			/**
			 * Commas and Periods
			 *
			 * For a comma to be part of the number, the chars immediately before and after must also be numbers
			 * valid number: 1,234
			 * valid number: 123,356
			 * invalid number: 123,,456
			 * invalid number: ,123
			 * invalid number: 123, // this is a number following by a comma token
			 *
			 * if it's a comma or period, we check the previous and next chars
			 */
			if (this.char === patterns.COMMA || this.char === patterns.PERIOD) {
				/**
				 * Even though a comma must be preceded by a number, we don't need to check.
				 *
				 * Take this case '1,,2':
				 *
				 * The first character is a number: good.
				 * The second character is a comma: check the next one. Since it's a comma,
				 * even this first comma isn't part of the number, and we exit this loop
				 */
				const nextChar = this.peek();
				if (typeof nextChar === 'undefined' || !this.matchesRegex(patterns.DIGITS, nextChar)) {
					// if the next char doesn't exist, it's a trailing comma, and is not part of the number
					// or it does exist but isn't a number, the number is finished
					// This takes care of cases such as '1,a', '1,.', '1,,', etc.
					this.tokens.push({ type: 'number', start, end: this.cursorPosition, value, line, col });

					return;
				}
			}

			value += this.getChar();
		}

		this.tokens.push({ type: 'number', start, end: this.cursorPosition, value, line, col });
	}

	processSingleLineComment() {
		// capture these at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

		let value = this.gobbleUntil(() => this.matchesRegex(patterns.NEWLINE, this.char));
		this.tokens.push({ type: 'comment', start, end: this.cursorPosition, value, line, col });
	}
}
