import ErrorContext from '../shared/errorContext';
import { has, hasNot, Maybe } from '../shared/maybe';
import { NumberSize, numberSizesAll } from '../shared/numbers/sizes';
import { error, ok, Result } from '../shared/result';
import LexerError from './error';
import { declarableTypes, keywords, patterns, specialValueTypes, Token, TokenType } from './types';
import { regexFlags, standardizeLineEndings } from './util';

export default class Lexer {
	/** position begins at 0 and counts till the end of the script */
	cursorPosition = 0;

	/** line begins at 1 */
	line = 1;

	/** position on the line begins at one and resets each time the line changes */
	col = 1;

	/** the source code */
	code = '';

	/** track all tokens */
	tokens: Token[] = [];

	/** char at the cursorPosition */
	char = '';

	singleCharTokens: Record<string, TokenType> = {
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

	/**
	 * Sets up the lexer, and standardizes the line endings
	 *
	 * @param code - Source code
	 */
	constructor(code: string) {
		this.code = code;

		// fix line endings
		this.code = standardizeLineEndings(this.code);
	}

	/**
	 * Gets the next token, if any
	 *
	 * @returns a Token
	 */
	getToken(): Result<Token> {
		// get a char
		this.char = this.code[this.cursorPosition];
		if (typeof this.char === 'undefined') {
			return ok({
				type: 'eof',
				start: this.cursorPosition,
				end: this.cursorPosition,
				value: '',
				line: this.line,
				col: this.col,
			});
		}

		// joelang ignores whitespace
		if (this.matchesRegex(patterns.WHITESPACE, this.char)) {
			this.gobbleAsLongAs(() => this.matchesRegex(patterns.WHITESPACE, this.char));

			this.char = this.code[this.cursorPosition];
			if (typeof this.char === 'undefined') {
				return ok({
					type: 'eof',
					start: this.cursorPosition,
					end: this.cursorPosition,
					value: '',
					line: this.line,
					col: this.col,
				});
			}
		}

		// capture these token must-haves at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

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
			return this.peekAndHandle(
				{
					[patterns.EQUALS]: 'forward_slash_equals',
					[patterns.FORWARD_SLASH]: (): Result<Token> => ok(this.processSingleLineComment()),
					[patterns.ASTERISK]: (): Result<Token> => {
						// continue as long there are no more chars, and the current char isn't an * and the following char isn't a /
						const value = this.gobbleUntil(
							() => this.char === patterns.ASTERISK && this.peek() === patterns.FORWARD_SLASH,
						);

						// skip the trailing asterisk and slash
						this.cursorPosition += 2;
						this.col += 2;

						const token: Token = {
							type: 'comment',
							start,
							end: this.cursorPosition,
							value: value + '*/',
							line,
							col,
						};
						this.tokens.push(token);

						return ok(token);
					},
				},
				(): Token => {
					// these tokens precede a forward slash, so if they're found, this is NOT a regular expression
					const tokensThatPrecedeForwardSlash: TokenType[] = [
						'bracket_close',
						'identifier',
						'number',
						'paren_close',
					];
					const prevToken = this.prevToken();
					const nextChar = this.peek();
					if (
						(typeof prevToken !== 'undefined' && tokensThatPrecedeForwardSlash.includes(prevToken.type)) ||
						typeof nextChar === 'undefined' ||
						this.matchesRegex(patterns.WHITESPACE, nextChar)
					) {
						const token: Token = {
							type: 'forward_slash',
							start,
							end: this.cursorPosition + 1,
							value: '/',
							line,
							col,
						};
						this.tokens.push(token);

						this.next();

						return token;
					}

					// regular expression
					const value =
						// opening slash
						this.getChar() +
						// everything until the trailing slash
						// continue as long there are no more chars, and the current char isn't a / and the previous char isn't whitespace
						this.gobbleUntil(
							() => this.char === patterns.FORWARD_SLASH && this.prevChar() !== patterns.ESCAPE,
						) +
						// the trailing slash itself
						(this.getChar() ?? '') + // this is needed in case of a partial regex at the end of the code
						// check for flags
						this.gobbleAsLongAs(() => regexFlags.includes(this.char));

					const token: Token = {
						type: 'regex',
						start,
						end: this.cursorPosition,
						value,
						line,
						col,
					};
					this.tokens.push(token);

					return token;
				},
				line,
				col,
			);
		}

		/** Hash */
		if (this.char === patterns.HASH) {
			return ok(this.processSingleLineComment());
		}

		/**
		 * Operator characters that can be single or double: + ++, - --, | ||, & &&, ? ??
		 */
		if (this.char === patterns.PLUS) {
			return this.peekAndHandle(
				{
					[patterns.PLUS]: 'plus_plus',
					[patterns.EQUALS]: 'plus_equals',
				},
				'plus',
				line,
				col,
			);
		}

		if (this.char === patterns.MINUS) {
			return this.peekAndHandle(
				{
					[patterns.MINUS]: 'minus_minus',
					[patterns.EQUALS]: 'minus_equals',
					[patterns.MORE_THAN]: 'right_arrow',
				},
				'minus',
				line,
				col,
			);
		}

		if (this.char === patterns.ASTERISK) {
			return this.peekAndHandle(
				{
					[patterns.EQUALS]: 'asterisk_equals',
				},
				'asterisk',
				line,
				col,
			);
		}

		if (this.char === patterns.MOD) {
			return this.peekAndHandle(
				{
					[patterns.EQUALS]: 'mod_equals',
				},
				'mod',
				line,
				col,
			);
		}

		if (this.char === patterns.PIPE) {
			return this.peekAndHandle(
				{
					[patterns.PIPE]: 'or',
					[patterns.MORE_THAN]: 'triangle_close',
				},
				undefined,
				line,
				col,
			);
		}

		if (this.char === patterns.AMPERSAND) {
			return this.peekAndHandle(
				{
					[patterns.AMPERSAND]: 'and',
				},
				undefined,
				line,
				col,
			);
		}

		/** Other operators */
		if (this.char === patterns.EQUALS) {
			return this.peekAndHandle(
				{
					[patterns.EQUALS]: 'equals',
				},
				'assign',
				line,
				col,
			);
		}

		if (this.char === patterns.BANG) {
			return this.peekAndHandle(
				{
					[patterns.EQUALS]: 'not_equals',
				},
				'bang',
				line,
				col,
			);
		}

		if (this.char === patterns.LESS_THAN) {
			return this.peekAndHandle(
				{
					[patterns.EQUALS]: (): Result<Token> => {
						return this.peekAndHandle(
							{
								[patterns.MORE_THAN]: 'compare', // <=>
							},
							'less_than_equals',
							line,
							col,
							2,
						);
					},
					[patterns.PIPE]: 'triangle_open',
				},
				'less_than',
				line,
				col,
			);
		}

		if (this.char === patterns.MORE_THAN) {
			return this.peekAndHandle(
				{
					[patterns.EQUALS]: 'more_than_equals',
				},
				'more_than',
				line,
				col,
			);
		}

		/** Numbers */
		if (this.matchesRegex(patterns.DIGITS, this.char)) {
			return this.processNumbers();
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
			return this.peekAndHandle(
				{
					e: 'exponent',
				},
				'caret',
				line,
				col,
			);
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
			const token: Token = {
				type: 'string',
				start,
				end: this.cursorPosition + 1,
				value,
				line,
				col,
			};
			this.tokens.push(token);

			this.next();

			return ok(token);
		}

		if (this.char === patterns.SEMICOLON) {
			const token: Token = {
				type: 'semicolon',
				start: this.cursorPosition,
				end: this.cursorPosition + 1,
				value: this.char,
				line,
				col,
			};
			this.tokens.push(token);

			this.next();

			return ok(token);
		}

		/** Single Character Tokens */
		if (typeof this.singleCharTokens[this.char] !== 'undefined') {
			const token: Token = {
				type: this.singleCharTokens[this.char],
				start: this.cursorPosition,
				end: this.cursorPosition + 1,
				value: this.char,
				line,
				col,
			};
			this.tokens.push(token);

			this.next();

			return ok(token);
		}

		/** Letters or unicode */
		if (this.matchesRegex(patterns.LETTERS, this.char) || this.matchesRegex(patterns.UNICODE, this.char)) {
			let value = this.gobbleAsLongAs(
				() =>
					this.matchesRegex(patterns.LETTERS, this.char) ||
					this.matchesRegex(patterns.DIGITS, this.char) ||
					this.matchesRegex(patterns.UNICODE, this.char) ||
					this.char === patterns.UNDERSCORE,
			);

			// check for '?'
			if (this.char === patterns.QUESTION) {
				value += this.getChar();
			}

			// check if it's a keyword, then check if it's a special value, otherwise it's an identifier
			// keywords in joelang are case sensitive
			let token: Token;
			if (value === 'this') {
				token = { type: 'this', start, end: this.cursorPosition, value, line, col };
			} else if ((keywords as unknown as string[]).includes(value)) {
				token = { type: 'keyword', start, end: this.cursorPosition, value, line, col };
			} else if ((declarableTypes as unknown as string[]).includes(value)) {
				token = { type: 'type', start, end: this.cursorPosition, value, line, col };
			} else {
				const type: TokenType = (specialValueTypes as Record<string, TokenType>)[value] || 'identifier';

				token = { type, start, end: this.cursorPosition, value, line, col };
			}

			this.tokens.push(token);

			return ok(token);
		}

		/**
		 * The Dot
		 *
		 * It can be one of many things:
		 * - A singular dot, for member access
		 * - A double dot, for a range
		 * - A triple dot, for destructuring or rest
		 * - The beginning of a FileType
		 */
		if (this.char === patterns.PERIOD) {
			return this.peekAndHandle(
				{
					[patterns.FORWARD_SLASH]: (): Result<Token> => ok(this.processPath()),
					[patterns.PERIOD]: (): Result<Token> => {
						return this.peekAndHandle(
							{
								[patterns.PERIOD]: 'dotdotdot',
							},
							'dotdot',
							line,
							col,
							2,
						);
					},
				},
				'dot',
				line,
				col,
			);
		}

		if (this.char === patterns.AT) {
			return this.peekAndHandle(
				{
					[patterns.FORWARD_SLASH]: (): Result<Token> => ok(this.processPath()),
				},
				undefined,
				line,
				col,
			);
		}

		// something we don't recognize
		return error(
			new LexerError(
				`Syntax Error. Unknown character: "${this.char}"`,
				this.tokens,
				this.getErrorContext(this.char.length),
			),
		);
	}

	public getAllTokens(): Result<Token[]> {
		const tokens: Token[] = [];

		let currentToken = this.getToken();
		while (currentToken.outcome !== 'error' && currentToken.value.type !== 'eof') {
			tokens.push(currentToken.value);

			// get next
			currentToken = this.getToken();
		}

		if (currentToken.outcome === 'error') {
			return error(currentToken.error);
		}

		// token is eof, and we're done
		return ok(tokens);
	}

	/**
	 * Peeks at the next char and creates a token based on it, If not found, creates a token with just the current char
	 *
	 * Ex:
	 * ```ts
	 * return this.peekAndHandle({
	 *     [patterns.MINUS]: 'minus_minus',
	 *     [patterns.EQUALS]: 'minus_equals',
	 * }, 'minus', line, col);
	 * ```
	 *
	 * Nested example:
	 * ```ts
	 * return this.peekAndHandle({
	 *     [patterns.FORWARD_SLASH]: (): Result<Node> => ok(this.processPath()),
	 *     [patterns.PERIOD]: (): Result<Node> => {
	 *         return this.peekAndHandle({
	 *            [patterns.PERIOD]: 'dotdotdot',
	 *         }, 'dotdot', line, col, 2); // notice the `2` here
	 *     },
	 * }, 'dot', line, col);
	 * ```
	 *
	 * @param mapNextChar - mapping of the next possible char with what to do: a string means it's a token type, or a callback to run (in that case, we don't call this.next())
	 * @param fallback - token type to fall back on if none of the next chars match. May be undefined. In that case, if we cannot find a valid next character and the fallback is undefined, a result error will be returned
	 * @param line - of the token
	 * @param col - of the token
	 * @param level - which level is this being called at. This defaults to 1, and equals the number chars to process for the fallback case. Each time this method is nested, increase this.
	 *
	 * @returns Result error if fallback is undefined and next char isn't defined in the map
	 */
	private peekAndHandle(
		mapNextChar: Record<string, TokenType | (() => Result<Token>)>,
		fallback: TokenType | (() => Token) | undefined,
		line: number,
		col: number,
		level = 1,
	): Result<Token> {
		const nextChar = this.peek(level);
		if (typeof nextChar !== 'undefined' && typeof mapNextChar[nextChar] !== 'undefined') {
			/* since there is a next char, everything in this block uses `level + 1`, since we're at the next char */

			const tokenTypeOrCallback = mapNextChar[nextChar];

			if (typeof tokenTypeOrCallback === 'function') {
				return tokenTypeOrCallback();
			}

			const token = {
				type: tokenTypeOrCallback,
				start: this.cursorPosition,
				end: this.cursorPosition + level + 1,
				value: this.code.substring(this.cursorPosition, this.cursorPosition + level + 1),
				line,
				col,
			};

			this.tokens.push(token);

			// skip next ${level + 1} characters
			for (let index = 0; index < level + 1; index++) {
				this.next();
			}

			return ok(token);

			// if this is undefined, there is no valid token for this last char, so ignore
		} else if (typeof fallback === 'string') {
			const token = {
				type: fallback,
				start: this.cursorPosition,
				end: this.cursorPosition + level,
				value: this.code.substring(this.cursorPosition, this.cursorPosition + level),
				line,
				col,
			};

			this.tokens.push(token);

			// skip next ${level} characters
			for (let index = 0; index < level; index++) {
				this.next();
			}

			return ok(token);

			// if fallback is a callback
		} else if (typeof fallback === 'function') {
			return ok(fallback());

			// if fallback is undefined and the next character isn't accounted for
		} else {
			// something we don't recognize
			return error(
				new LexerError(
					`Syntax Error. Unknown syntax: "${this.code.substring(
						this.cursorPosition,
						this.cursorPosition + level,
					)}"`,
					this.tokens,
					this.getErrorContext(level),
				),
			);
		}
	}

	/** Captures the current char, advances position, and returns current char */
	getChar(): string | undefined {
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
	prevToken(howMany = 1): Token | undefined {
		return this.tokens[this.tokens.length - howMany];
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
	processPath(): Token {
		// capture these at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

		let value = '';

		// if the path begins with an `@`, treat it differently, since that isn't in the patterns.PATH regex
		if (this.char === patterns.AT) {
			value += this.char;
			this.next();
		}

		value += this.gobbleAsLongAs(() => this.matchesRegex(patterns.PATH, this.char));

		const token: Token = { type: 'path', start, end: this.cursorPosition, value, line, col };
		this.tokens.push(token);

		return token;
	}

	processNumbers(): Result<Token> {
		// capture these at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

		let value = '';
		while (
			(this.cursorPosition < this.code.length && this.matchesRegex(patterns.DIGITS, this.char)) ||
			this.char === patterns.UNDERSCORE ||
			this.char === patterns.PERIOD
		) {
			/**
			 * Underscores and Periods
			 *
			 * For an underscore to be part of the number, the chars immediately before and after must also be numbers
			 * valid number: 1_234
			 * valid number: 123_356
			 * invalid number: 123__456
			 * invalid number: _123
			 * invalid number: 123_ // this is a number following by an underscore token
			 *
			 * if it's an underscore or period, we check the previous and next chars
			 */
			if (this.char === patterns.UNDERSCORE || this.char === patterns.PERIOD) {
				/**
				 * Even though an underscore must be preceded by a number, we don't need to check.
				 *
				 * Take this case '1__2':
				 *
				 * The first character is a number: good.
				 * The second character is an underscore: check the next one. Since it's an underscore,
				 * even this first underscore isn't part of the number, and we exit this loop
				 */
				const nextChar = this.peek();
				if (typeof nextChar === 'undefined' || !this.matchesRegex(patterns.DIGITS, nextChar)) {
					// - if the next char doesn't exist, this is a trailing underscore, and is not part of the number
					// - if the next char does exist but isn't a number or the begininng of a number size, the number is finished
					// This takes care of cases such as '1_a', '1_.', '1__', etc.

					// if this char is an underscore, we need to gobble the following chars if it's a number size
					if (this.char === patterns.UNDERSCORE) {
						const maybeNumberSize = this.gobbleNumberSizeIfPresent();
						if (maybeNumberSize.has()) {
							value += `_${maybeNumberSize.value}`;
						}
					}

					const token: Token = {
						type: 'number',
						start,
						end: this.cursorPosition,
						value,
						line,
						col,
					};
					this.tokens.push(token);

					return ok(token);
				}
			}

			value += this.getChar();
		}

		const token: Token = {
			type: 'number',
			start,
			end: this.cursorPosition,
			value,
			line,
			col,
		};

		this.tokens.push(token);

		return ok(token);
	}

	/**
	 * Check if next few chars is a number size
	 * If so, gobble and return it
	 */
	gobbleNumberSizeIfPresent(): Maybe<NumberSize> {
		const upToNextSixChars = this.code.slice(this.cursorPosition + 1, this.cursorPosition + 7);

		let size: NumberSize | undefined;
		numberSizesAll.forEach((numberSize) => {
			if (upToNextSixChars.startsWith(numberSize)) {
				size = numberSize;
			}
		});

		if (size) {
			this.cursorPosition += size.length + 1;
			this.col += size.length + 1;

			return has(size);
		}

		return hasNot();
	}

	processSingleLineComment(): Token {
		// capture these at the start of a potentially multi-character token
		const [start, line, col] = [this.cursorPosition, this.line, this.col];

		const value = this.gobbleUntil(() => this.matchesRegex(patterns.NEWLINE, this.char));

		const token: Token = { type: 'comment', start, end: this.cursorPosition, value, line, col };
		this.tokens.push(token);

		return token;
	}

	getErrorContext(length: number): ErrorContext {
		return new ErrorContext(this.code, this.line, this.col, length);
	}
}
