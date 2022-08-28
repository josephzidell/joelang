// token types
export type TokenType = 'paren' | 'bracket' | 'brace' | 'bool' | 'number' | 'string' | 'name' | 'keyword' | 'operator' | 'nil' | 'filepath' | 'separator' | 'comment';

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
export const specialValueTypes: Record<SpecialValue, TokenType> = {
	true: 'bool',
	false: 'bool',
	nil: 'nil',
};

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
