// token types
export const tokenTypesUsingSymbols = {
	'and': '&&',
	'assign': '=',
	'asterisk_equals': '*=',
	'asterisk': '*',
	'bang': '!',
	'brace_close': '}',
	'brace_open': '{',
	'bracket_close': ']',
	'bracket_open': '[',
	'caret': '^',
	'colon': ':',
	'comma': ',',
	'compare': '<=>',
	'dot': '.',
	'dotdot': '..',
	'dotdotdot': '...',
	'equals': '==',
	'exponent': '^e',
	'forward_slash_equals': '/=',
	'forward_slash': '/',
	'greater_than_equals': '>=',
	'greater_than': '>',
	'less_than_equals': '<=',
	'less_than': '<',
	'minus_equals': '-=',
	'minus_minus': '--',
	'minus': '-',
	'mod_equals': '%=',
	'mod': '%',
	'not_equals': '!=',
	'or': '||',
	'paren_close': ')',
	'paren_open': '(',
	'plus': '+',
	'plus_equals': '+=',
	'plus_plus': '++',
	'question': '?',
	'right_arrow': '->',
	'semicolon': ';',
	'triangle_open': '<|',
	'triangle_close': '|>',
};
const otherTokenTypes = [
	'bool',
	'comment',
	'identifier',
	'keyword',
	'nil',
	'number',
	'path',
	'regex',
	'string',
	'type',
] as const;
export type TokenType = keyof typeof tokenTypesUsingSymbols | typeof otherTokenTypes[number];

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
export const keywords = [
	'abstract',
	'break',
	'class',
	'const',
	'else',
	'extends',
	'f',
	'for',
	'from',
	'if',
	'implements',
	'import',
	'in',
	'interface',
	'is',
	'let',
	'new',
	'print',
	'private',
	'public',
	'repeat',
	'return',
	'static',
	'this',
	'when',
	'while',
] as const;
type Keyword = typeof keywords[number];

// types
export const types = [
	'bool',
	'number',
	'path',
	'regex',
	'string',
] as const;
type Type = typeof types[number];

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
	AT: '@',
	BANG: '!',
	CARET: '^',
	COLON: ':',
	COMMA: ',',
	DOUBLE_QUOTE: '"',
	EQUALS: '=',
	ESCAPE: '\\',
	FORWARD_SLASH: '/',
	GREATER_THAN: '>',
	HASH: '#',
	LESS_THAN: '<',
	MINUS: '-',
	MOD: '%',
	PERIOD: '.',
	PIPE: '|',
	PLUS: '+',
	QUESTION: '?',
	SEMICOLON: ';',
	SINGLE_QUOTE: "'",
	UNDERSCORE: '_',

	// regexes
	DIGITS: /[0-9]/,
	LETTERS: /[a-z]/i,
	NEWLINE: /\n/,
	PATH: /[a-zA-Z0-9-_./]/, // characters in path, excluding the front: @ or .
	WHITESPACE: /\s/,
};
