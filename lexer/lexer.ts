import LexerError from "./error";

// token types
type TokenType = 'paren' | 'bracket' | 'brace' | 'bool' | 'number' | 'string' | 'name' | 'keyword' | 'operator' | 'nil' | 'filepath' | 'separator' | 'comment';

// info about a token
export type Token = {
	type: TokenType;
	start: number; // cursor position of the beginning of this token
	end: number; // cursor position immediately after this token
	value: string;
};

// reserved keywords
export const keywords = ['const', 'let', 'if', 'is', 'in', 'for', 'switch', 'return', 'import', 'from', 'class', 'extends', 'implements', 'this', 'static', 'public', 'private'] as const;
type Keyword = typeof keywords[number];

// operators
export const operators = ['+', '++', '-', '--', '*', '/', '%', '^e', '^^', '|', '||', '&', '&&', '.', '..', '...', '!', ':', ';', ',', '<', '>', '=', '==', '!=', '===', '!==', '<=>'] as const;
type Operator = typeof operators[number];

// special Values
const specialValues = ['true', 'false', 'nil'] as const;
type SpecialValue = typeof specialValues[number];
const specialValueTypes: Record<SpecialValue, TokenType> = {
	true: 'bool',
	false: 'bool',
	nil: 'nil',
};

// syntax patterns
const patterns = {
	// single characters
	AMPERSAND: '&',
	ASTERISK: '*',
	BANG: '!',
	CARET: '^',
	COLON: ':',
	COMMA: ',',
	DOUBLE_QUOTE: '"',
	EQUALS: '=',
	FORWARD_SLASH: '/',
	HASH: '#',
	MINUS: '-',
	PIPE: '|',
	PERIOD: '.',
	PLUS: '+',
	QUESTION: '?',
	SEMICOLON: ';',
	SINGLE_QUOTE: "'",
	UNDERSCORE: '_',

	// regexes
	DIGITS: /[0-9]/,
	FILEPATH: /[a-zA-Z0-9-_./]/, // characters in filepath, excluding the front: @
	LETTERS: /[a-z]/i,
	NEWLINE: /(\r\n|\r|\n)/,
	WHITESPACE: /\s/,
};

export default function (code: string) {
	// position begins at 0
	let currentPosition = 0;

	// track all tokens
    let tokens: Token[] = [];

	// loop through all characters
	while (currentPosition < code.length) {
		let char = code[currentPosition];

		// joelang ignores whitespace
		if (patterns.WHITESPACE.test(char)) {
			currentPosition++;

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
		if (char === patterns.FORWARD_SLASH) {
			const start = currentPosition;

			// check if next char is asterisk or another forward slash - comment time
			const nextChar = code[currentPosition + 1];

			// if undefined, we're at the end of the script
			if (typeof nextChar === 'undefined') {
				char = code[++currentPosition];
				tokens.push({ type: 'operator', start, end: currentPosition, value: '/'});
				continue;
			}

			// if next char is / it's a single line comment
			if (nextChar === char) {
				({ currentPosition, char } = processSingleLineComment(currentPosition, code, char, tokens, start));

				continue;
			}

			// if next char is * it's a multiline comment
			if (nextChar === patterns.ASTERISK) {
				let value = '';

				// continue as long there are no more chars, and the current char isn't an * and the following char isn't a /
				while (currentPosition < code.length && !(char === patterns.ASTERISK && code[currentPosition + 1] === patterns.FORWARD_SLASH)) {
					value += char;
					char = code[++currentPosition];
				}

				// skip the asterisk and slash
				currentPosition += 2;
				tokens.push({ type: 'comment', start, end: currentPosition, value: value + '*/'});
				continue;
			}

			// if previous token is a number, this is a division symbol
			if (tokens[tokens.length - 1].type === 'number') {
				char = code[++currentPosition];
				tokens.push({ type: 'operator', start, end: currentPosition, value: '/'});
				continue;
			}

			// otherwise it's a filepath
			({ char, currentPosition } = processFilepath(char, currentPosition, code, tokens));

			continue;
		}

		/** Hash */
		if (char === patterns.HASH) {
			({ currentPosition, char } = processSingleLineComment(currentPosition, code, char, tokens, currentPosition));

			continue;
		}

		/**
		 * Operator characters that can be single or double: + ++, - --, | ||, & &&, ? ??
		 */
		if (char === patterns.PLUS || char === patterns.MINUS || char === patterns.PIPE || char === patterns.AMPERSAND || char === patterns.QUESTION) {
			// peek at the next char
			const nextChar = code[currentPosition + 1];
			// it's the same, so we're hitting a double
			if (char === nextChar) {
				tokens.push({type: 'operator', start: currentPosition, end: currentPosition + 2, value: char + char});

				++currentPosition; // skip next character

			// single
			} else {
				tokens.push({type: 'operator', start: currentPosition, end: currentPosition + 1, value: char});
			}

			currentPosition++;

			continue;
		}

		/** Numbers */
		if (patterns.DIGITS.test(char)) {
			({ char, currentPosition } = processNumbers(char, currentPosition, code, tokens));

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
		 * invalid 123e // this is a number followed by a name token
		 *
		 * if it's a caret, we check the previous and next chars
		 */
		 if (char === patterns.CARET) {
			const start = currentPosition;

			/**
			 * Check the previous and next chars to see if it's part of an exponent
			 */
			const prevChar = code[currentPosition - 1];
			const nextChar = code[currentPosition + 1];
			if (patterns.DIGITS.test(prevChar) && typeof nextChar !== 'undefined' && code[currentPosition + 1] === 'e') {
				// if the next char doesn't exist, it's a trailing caret, and is not part of the number
				// or it does exist but isn't an 'e', the number is finished
				// This takes care of cases such as '1^a', '1^', '^1', etc.
				++currentPosition; // skip next character

				char = code[++currentPosition];

				tokens.push({type: 'operator', start, end: currentPosition, value: '^e'});

				continue;
			}

			// nope it's a caret
			char = code[++currentPosition];

			tokens.push({type: 'operator', start, end: currentPosition, value: '^'});

			continue;
		}

		/** Strings */
		if (patterns.DOUBLE_QUOTE === char || patterns.SINGLE_QUOTE === char) {
			// TODO double-quoted strings can have interpolation

			let value = '';
			const start = currentPosition;
			const quoteChar = char; // capture the type of quote to check for closing

			char = code[++currentPosition]; // skip the quote char itself

			while (currentPosition < code.length && char !== quoteChar) {
				value += char;
				char = code[++currentPosition];
			}

			// skip the closing quote char
			char = code[++currentPosition];

			tokens.push({type: 'string', start, end: currentPosition, value});

			continue;
		}

		/** Separators: Semicolons, Comma, Colon */
		if (char === patterns.SEMICOLON || char === patterns.COMMA || char === patterns.COLON) {
			tokens.push({type: 'separator', start: currentPosition, end: currentPosition + 1, value: char});
			currentPosition++;
			continue;
		}

		/** Braces */
		if (char === '{' || char === '}') {
			tokens.push({type: 'brace', start: currentPosition, end: currentPosition + 1, value: char});
			currentPosition++;
			continue;
		}

		/** Brackets */
		if (char === '[' || char === ']') {
			tokens.push({type: 'bracket', start: currentPosition, end: currentPosition + 1, value: char});
			currentPosition++;
			continue;
		}

		/** Parens */
		if (char === '(' || char === ')') {
			tokens.push({type: 'paren', start: currentPosition, end: currentPosition + 1, value: char});
			currentPosition++;
			continue;
		}

		/** Letters */
		if (patterns.LETTERS.test(char)) {
			let value = '';
			const start = currentPosition;
			while (currentPosition < code.length && (patterns.LETTERS.test(char) || patterns.DIGITS.test(char) || char === patterns.UNDERSCORE)) {
				value += char;
				char = code[++currentPosition];
			}

			// check for '?'
			if (char === patterns.QUESTION) {
				value += char;
				char = code[++currentPosition];
			}

			// check for '!'
			if (char === patterns.BANG) {
				value += char;
				char = code[++currentPosition];
			}

			// check if it's a keyword, then check if it's a special value, otherwise fall back to 'name'
			// keywords in joelang are case sensitive
			if ((keywords as unknown as string[]).includes(value)) {
				tokens.push({type: 'keyword', start, end: currentPosition, value});
			} else {
				let type: TokenType = (specialValueTypes as Record<string, TokenType>)[value] || 'name';

				tokens.push({type, start, end: currentPosition, value});
			}

			continue;
		}

		if (char === patterns.EQUALS) {
			tokens.push({
				type: 'operator',
				start: currentPosition,
				end: currentPosition + 1,
				value: char,
			})

			char = code[++currentPosition];
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
		if (char === patterns.PERIOD) {
			const start = currentPosition;

			// get next value
			const secondChar = code[currentPosition + 1];

			// if undefined, at the end of the script
			if (typeof secondChar === 'undefined') {
				char = code[++currentPosition];
				tokens.push({ type: 'operator', start, end: currentPosition, value: '.'});
				continue;
			}

			// if nextChar is a forward slash - it's a file
			if (secondChar === patterns.FORWARD_SLASH) {
				({ char, currentPosition } = processFilepath(char, currentPosition, code, tokens));

				continue;
			}

			// check for triple dot, then for double dot, then default to single dot
			if (secondChar === char) { // if the second one's a dot
				const thirdChar = code[currentPosition + 2];
				if (typeof thirdChar !== 'undefined' && thirdChar === char) { // third is a dot
					// skip the next 2 dots
					currentPosition += 2;

					char = code[++currentPosition];
					tokens.push({ type: 'operator', start, end: currentPosition, value: '...'});
					continue;
				} else {
					// skip the next dot
					++currentPosition;

					// no third dot, we have a ..
					char = code[++currentPosition];
					tokens.push({ type: 'operator', start, end: currentPosition, value: '..'});
					continue;
				}
			} else {
				// no second dot, we have a .
				char = code[++currentPosition];
				tokens.push({ type: 'operator', start, end: currentPosition, value: '.'});
				continue;
			}
		}

		// something we don't recognize
		throw new LexerError('Syntax Error. Unknown character: "' + char + '"', tokens);
    }

	return tokens;
}

function processFilepath(char: string, currentPosition: number, code: string, tokens: Token[]) {
	let value = '';
	const start = currentPosition;
	while (currentPosition < code.length && patterns.FILEPATH.test(char)) {
		value += char;
		char = code[++currentPosition];
	}

	tokens.push({type: 'filepath', start, end: currentPosition, value});

	return { char, currentPosition };
}

function processNumbers(char: string, currentPosition: number, code: string, tokens: Token[]) {
	let value = '';
	const start = currentPosition;
	while (currentPosition < code.length && patterns.DIGITS.test(char) || char === patterns.COMMA || char === patterns.PERIOD) {
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
		if (char === patterns.COMMA || char === patterns.PERIOD) {
			/**
			 * Even though a comma must be preceeded by a number, we don't need to check.
			 *
			 * Take this case '1,,2':
			 *
			 * The first character is a number: good.
			 * The second character is a comma: check the next one. Since it's a comma,
			 * even this first comma isn't part of the number, and we exit this loop
			 */
			const nextChar = code[currentPosition + 1];
			if (typeof nextChar === 'undefined' || !patterns.DIGITS.test(code[currentPosition + 1])) {
				// if the next char doesn't exist, it's a trailing comma, and is not part of the number
				// or it does exist but isn't a number, the number is finished
				// This takes care of cases such as '1,a', '1,.', '1,,', etc.
				tokens.push({ type: 'number', start, end: currentPosition, value });

				return { char, currentPosition };
			}
		}

		value += char;
		char = code[++currentPosition];
	}

	tokens.push({ type: 'number', start, end: currentPosition, value });

	return { char, currentPosition };
}

function processSingleLineComment(currentPosition: number, code: string, char: string, tokens: Token[], start: number) {
	let value = '';

	while (currentPosition < code.length && !patterns.NEWLINE.test(char)) {
		value += char;
		char = code[++currentPosition];
	}

	tokens.push({ type: 'comment', start, end: currentPosition, value: value });
	return { currentPosition, char };
}
