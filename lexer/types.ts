// token types
export type TokenType = 'paren' | 'bracket' | 'brace' | 'bool' | 'number' | 'string' | 'identifier' | 'keyword' | 'operator' | 'nil' | 'filepath' | 'separator' | 'comment';

// info about a token
export type Token = {
	/** the type of token */
	type: TokenType;

	/** the value, always represented as a string. The parser will take care of converting */
	value: string;

	/** cursor position of the beginning of this token, counting from the beginning of the file */
	start: number;

	/** cursor position immediately after this token */
	end: number;

	/** line number, begins at 1 */
	line: number;

	/** col position, begins at 1, within the line of the first char (similar to `start`, but within the line - if the entire file were one line, then `pos` would be the same as `start`) */
	col: number;
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
export const specialValueTypes: Record<SpecialValue, TokenType> = {
	true: 'bool',
	false: 'bool',
	nil: 'nil',
};

export const mathematicalPatterns = {
	PLUS: '+',
	MINUS: '-',
	MULTIPLICATION: '*',
	DIVIDE: '/',
	MODULUS: '%',
}

// syntax patterns
export const patterns = {
	// single characters
	AMPERSAND: '&',
	ASTERISK: '*',
	BANG: '!',
	CARET: '^',
	COLON: ':',
	COMMA: ',',
	DOUBLE_QUOTE: '"',
	EQUALS: '=',
	ESCAPE: '\\',
	FORWARD_SLASH: '/',
	HASH: '#',
	PIPE: '|',
	PERIOD: '.',
	QUESTION: '?',
	SEMICOLON: ';',
	SINGLE_QUOTE: "'",
	UNDERSCORE: '_',

	// regexes
	DIGITS: /[0-9]/,
	FILEPATH: /[a-zA-Z0-9-_./]/, // characters in filepath, excluding the front: @
	LETTERS: /[a-z]/i,
	NEWLINE: /\n/,
	WHITESPACE: /\s/,

	...mathematicalPatterns,
};
