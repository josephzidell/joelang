// token types
type TokenType = 'paren' | 'bracket' | 'brace' | 'bool' | 'number' | 'string' | 'name' | 'keyword' | 'operator' | 'nil';

// info about a token
type Token = {
	type: TokenType;
	start: number; // cursor position of the beginning of this token
	end: number; // cursor position immediately after this token
	value: string;
};

// reserved keywords
export const keywords = ['const', 'let', 'if', 'is', 'in', 'for', 'switch', 'return'] as const;
type Keyword = typeof keywords[number];

// operators
type Operator = '+' | '++' | '-' | '--' | '*' | '/' | '%' | '^e' | '^^' | '|' | '||' | '&' | '&&' | '.' | '..' | '...' | '!' | ':' | ';' | ',' | '<' | '>' | '=' | '==' | '!=' | '===' | '!==' | '<=>';

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
	CARET: '^',
	COMMA: ',',
	DOUBLE_QUOTE: '"',
	EQUALS: '=',
	MINUS: '-',
	PIPE: '|',
	PERIOD: '.',
	PLUS: '+',
	SINGLE_QUOTE: "'",

	// regexes
	DIGITS: /[0-9]/,
	LETTERS: /[a-z]/i,
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
		 * Operator characters that can be single or double: + ++, - --, | ||, & &&
		 */
		if (char === patterns.PLUS || char === patterns.MINUS || char === patterns.PIPE || char === patterns.AMPERSAND) {
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

		/** Braces */
		if (char === '{' || char === '}') {
			tokens.push({
				type: 'brace',
				start: currentPosition,
				end: currentPosition + 1,
				value: char,
			});

			currentPosition++;

			continue;
		}

		/** Brackets */
		if (char === '[' || char === ']') {
			tokens.push({
				type: 'bracket',
				start: currentPosition,
				end: currentPosition + 1,
				value: char,
			});

			currentPosition++;

			continue;
		}

		/** Parens */
		if (char === '(' || char === ')') {
			tokens.push({
				type: 'paren',
				start: currentPosition,
				end: currentPosition + 1,
				value: char,
			});

			currentPosition++;

			continue;
		}

		/** Letters */
		if (patterns.LETTERS.test(char)) {
			let value = '';
			const start = currentPosition;
			while (currentPosition < code.length && patterns.LETTERS.test(char)) {
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

		// something we don't recognize
		throw new TypeError('I dont know what this character is: ' + char);
    }

	return tokens;
}

function processNumbers(char: string, currentPosition: number, code: string, tokens: Token[]) {
	let value = '';
	const start = currentPosition;
	while (currentPosition < code.length && patterns.DIGITS.test(char) || char === patterns.COMMA || char === patterns.PERIOD) {
		/**
		 * Commas and Periods
		 *
		 * For a comma to be part of the number, the chars immediately before and after must also be numbers
		 * valid: 1,234
		 * valid 123,356
		 * invalid 123,,456
		 * invalid ,123
		 * invalid 123, // this is a number following by a comma token
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
				++currentPosition;

				return { char, currentPosition };
			}
		}

		value += char;
		char = code[++currentPosition];
	}

	tokens.push({
		type: 'number',
		start,
		end: currentPosition,
		value,
	});

	return { char, currentPosition };
}

