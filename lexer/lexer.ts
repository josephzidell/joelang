import LexerError from "./error";
import {Token, TokenType, keywords, patterns, specialValueTypes} from './types';
import { standardizeLineEndings } from "./util";

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

	lexify (code: string) {
		// fix line endings
		this.code = standardizeLineEndings(code);

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
			 * - The beginning of a Filepath
			 */
			if (this.char === patterns.FORWARD_SLASH) {
				// check if next char is asterisk or another forward slash - comment time
				const nextChar = this.peek();

				// if undefined, we're at the end of the script
				if (typeof nextChar === 'undefined') {
					this.tokens.push({ type: 'operator', start, end: this.cursorPosition + 1, value: '/', line, col });
					this.next();
					continue;
				}

				// if next char is / it's a single line comment
				if (nextChar === this.char) {
					this.processSingleLineComment();

					continue;
				}

				// if next char is * it's a multiline comment
				if (nextChar === patterns.ASTERISK) {
					// continue as long there are no more chars, and the current char isn't an * and the following char isn't a /
					let value = this.gobbleUntil(() => this.char === patterns.ASTERISK && this.peek() === patterns.FORWARD_SLASH);

					// skip the asterisk and slash
					this.cursorPosition += 2;
					this.col += 2;
					this.tokens.push({ type: 'comment', start, end: this.cursorPosition, value: value + '*/', line, col });
					continue;
				}

				// if previous token is a number, this is a division symbol
				if (this.tokens[this.tokens.length - 1].type === 'number') {
					this.tokens.push({ type: 'operator', start, end: this.cursorPosition, value: '/', line, col });
					this.next();
					continue;
				}

				// otherwise it's a filepath
				this.processFilepath();

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
			if (this.char === patterns.PLUS || this.char === patterns.MINUS || this.char === patterns.PIPE || this.char === patterns.AMPERSAND || this.char === patterns.QUESTION) {
				// peek at the next char - it's the same, we're hitting a double
				if (this.char === this.peek()) {
					this.tokens.push({ type: 'operator', start: this.cursorPosition, end: this.cursorPosition + 2, value: this.char + this.char, line, col });

					this.next(); // skip next character

				// single
				} else {
					this.tokens.push({ type: 'operator', start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col });
				}

				this.next();

				continue;
			}

			/** Other operators */
			if ([patterns.EQUALS, patterns.MULTIPLICATION, patterns.MODULUS].includes(this.char)) {
				this.tokens.push({ type: 'operator', start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col })
				this.next();
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
				/**
				 * Check the previous and next chars to see if it's part of an exponent
				 */
				if (this.matchesRegex(patterns.DIGITS, this.prev()) && this.peek() === 'e') {
					// If the next char doesn't exist, then this is a trailing caret, and is not part of the number.
					// Or the next char *does* exist but isn't an 'e', this is not an exponent, which makes the caret it's own thing, and the number is thus finished.
					// This takes care of cases such as '1^a', '1^', '^1', etc.
					this.tokens.push({ type: 'operator', start, end: this.cursorPosition + 2, value: '^e', line, col });

					this.next(); // skip next character

					this.next();

					continue;
				}

				// nope it's a just a plain ol' caret
				this.tokens.push({ type: 'operator', start, end: this.cursorPosition + 1, value: '^', line, col });

				this.next();

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
					if (this.char === quoteChar && this.prev() !== patterns.ESCAPE) {
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

			/** Separators: Semicolon, Colon, Comma */
			if (this.char === patterns.SEMICOLON || this.char === patterns.COLON || this.char === patterns.COMMA) {
				this.tokens.push({ type: 'separator', start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col });
				this.next();
				continue;
			}

			/** Braces */
			if (this.char === '{' || this.char === '}') {
				this.tokens.push({ type: 'brace', start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col });
				this.next();
				continue;
			}

			/** Brackets */
			if (this.char === '[' || this.char === ']') {
				this.tokens.push({ type: 'bracket', start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col });
				this.next();
				continue;
			}

			/** Parens */
			if (this.char === '(' || this.char === ')') {
				this.tokens.push({ type: 'paren', start: this.cursorPosition, end: this.cursorPosition + 1, value: this.char, line, col });
				this.next();
				continue;
			}

			/** Letters */
			if (this.matchesRegex(patterns.LETTERS, this.char)) {
				let value = this.gobbleAsLongAs(() => this.matchesRegex(patterns.LETTERS, this.char) || this.matchesRegex(patterns.DIGITS, this.char) || this.char === patterns.UNDERSCORE);

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
				// get next value
				const secondChar = this.peek();

				// if undefined, at the end of the script
				if (typeof secondChar === 'undefined') {
					this.tokens.push({ type: 'operator', start, end: this.cursorPosition + 1, value: '.', line, col });
					this.next();
					continue;
				}

				// if nextChar is a forward slash - it's a file
				if (secondChar === patterns.FORWARD_SLASH) {
					this.processFilepath();

					continue;
				}

				// check for triple dot, then for double dot, then default to single dot
				if (secondChar === this.char) { // if the second one's a dot
					const thirdChar = this.code[this.cursorPosition + 2];
					if (typeof thirdChar !== 'undefined' && thirdChar === this.char) { // third is a dot
						// skip the next 2 dots
						this.cursorPosition += 2;
						this.col += 2;

						this.tokens.push({ type: 'operator', start, end: this.cursorPosition + 1, value: '...', line, col });

						this.next();
						continue;
					} else {
						// no third dot, we have a ..
						this.tokens.push({ type: 'operator', start, end: this.cursorPosition + 2, value: '..', line, col });

						this.next(); // skip the next dot
						this.next();

						continue;
					}
				} else {
					// no second dot, we have a .
					this.tokens.push({ type: 'operator', start, end: this.cursorPosition + 1, value: '.', line, col });
					this.next();
					continue;
				}
			}

			// something we don't recognize
			throw new LexerError('Syntax Error. Unknown character: "' + this.char + '"', this.tokens);
		}

		return this.tokens;
	}

	/** Captures the current char, advances position, and returns current char */
	getChar () {
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
	prev(): string {
		return this.code[this.cursorPosition - 1];
	}

	/** Peeks ahead at the next char */
	peek(): string | undefined {
		return this.code[this.cursorPosition + 1];
	}

	processFilepath() {
		// capture these at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

		let value = this.gobbleAsLongAs(() => this.matchesRegex(patterns.FILEPATH, this.char));
		this.tokens.push({ type: 'filepath', start, end: this.cursorPosition, value, line, col });
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
				 * Even though a comma must be preceeded by a number, we don't need to check.
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
