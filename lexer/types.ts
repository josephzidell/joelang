// token types
export const tokenTypesUsingSymbols = {
	and: '&&',
	assign: '=',
	asterisk_equals: '*=',
	asterisk: '*',
	bang: '!',
	brace_close: '}',
	brace_open: '{',
	bracket_close: ']',
	bracket_open: '[',
	caret: '^',
	colon: ':',
	comma: ',',
	compare: '<=>',
	dot: '.',
	dotdot: '..',
	dotdotdot: '...',
	equals: '==',
	exponent: '^e',
	forward_slash_equals: '/=',
	forward_slash: '/',
	less_than_equals: '<=',
	less_than: '<',
	minus_equals: '-=',
	minus_minus: '--',
	minus: '-',
	mod_equals: '%=',
	mod: '%',
	more_than_equals: '>=',
	more_than: '>',
	not_equals: '!=',
	or: '||',
	paren_close: ')',
	paren_open: '(',
	plus: '+',
	plus_equals: '+=',
	plus_plus: '++',
	question: '?',
	right_arrow: '->',
	semicolon: ';',
	triangle_open: '<|',
	triangle_close: '|>',
};

export const primitiveTypes = ['bool', 'number', 'path', 'regex', 'string'] as const;
export type PrimitiveType = (typeof primitiveTypes)[number];

const otherTokenTypes = [
	'bool',
	'comment',
	'eof',
	'identifier',
	'keyword',
	'number',
	'path',
	'regex',
	'string',
	'this',
	'type',
] as const;
export type TokenType = keyof typeof tokenTypesUsingSymbols | (typeof otherTokenTypes)[number];

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
	'class',
	'const',
	'done', // aka break
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
	'let',
	'loop',
	'next', // aka continue
	'print',
	'return',
	'static',
	'when',
] as const;

// types
export const types = ['bool', 'number', 'path', 'range', 'regex', 'string'] as const;

// special Values
const specialValues = ['true', 'false'] as const;
type SpecialValue = (typeof specialValues)[number];
export const specialValueTypes: Record<SpecialValue, TokenType> = {
	true: 'bool',
	false: 'bool',
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
	HASH: '#',
	LESS_THAN: '<',
	MINUS: '-',
	MOD: '%',
	MORE_THAN: '>',
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
	// eslint-disable-next-line no-control-regex
	UNICODE: /[^\x00-\x7F]/, // characters above ASCII and in the Unicode standard, see https://stackoverflow.com/a/72733569
	WHITESPACE: /\s/,
};
