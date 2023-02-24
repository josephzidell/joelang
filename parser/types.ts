/** Node Types */
export enum NT {
	ArgumentsList = 'ArgumentsList',
	ArrayExpression = 'ArrayExpression',
	ArrayType = 'ArrayType',
	AssignmentOperator = 'AssignmentOperator',
	BinaryExpression = 'BinaryExpression',
	BlockStatement = 'BlockStatement',
	BoolLiteral = 'BoolLiteral',
	BreakStatement = 'BreakStatement',
	CallExpression = 'CallExpression',
	ClassDeclaration = 'ClassDeclaration',
	ClassExtensionsList = 'ClassExtensionsList',
	ClassImplementsList = 'ClassImplementsList',
	ColonSeparator = 'ColonSeparator',
	CommaSeparator = 'CommaSeparator',
	Comment = 'Comment',
	ElseStatement = 'ElseStatement',
	ForStatement = 'ForStatement',
	FunctionDeclaration = 'FunctionDeclaration',
	FunctionReturns = 'FunctionReturns',
	Identifier = 'Identifier',
	IfStatement = 'IfStatement',
	ImportDeclaration = 'ImportDeclaration',
	InterfaceDeclaration = 'InterfaceDeclaration',
	InterfaceExtensionsList = 'InterfaceExtensionsList',
	JoeDoc = 'JoeDoc', // for Class, Function, Interface, or Variable
	Keyword = 'Keyword',
	Loop = 'Loop',
	MemberExpression = 'MemberExpression',
	MembersList = 'MembersList',
	Modifier = 'Modifier', // for Class, Function, Interface, or Variable
	ModifiersList = 'ModifiersList', // for Class, Function, Interface, or Variable
	NumberLiteral = 'NumberLiteral',
	ObjectExpression = 'ObjectExpression',
	ObjectType = 'ObjectType',
	Parameter = 'Parameter',
	ParametersList = 'ParametersList',
	Parenthesized = 'Parenthesized',
	Path = 'Path',
	PrintStatement = 'PrintStatement',
	Program = 'Program',
	Property = 'Property',
	RangeExpression = 'RangeExpression',
	RegularExpression = 'RegularExpression',
	RepeatStatement = 'RepeatStatement',
	RestElement = 'RestElement',
	ReturnStatement = 'ReturnStatement',
	RightArrowOperator = 'RightArrowOperator',
	SemicolonSeparator = 'SemicolonSeparator',
	StringLiteral = 'StringLiteral',
	TernaryCondition = 'TernaryCondition',
	TernaryElse = 'TernaryElse',
	TernaryExpression = 'TernaryExpression',
	TernaryThen = 'TernaryThen',
	TupleExpression = 'TupleExpression',
	TupleType = 'TupleType',
	Type = 'Type',
	TypeArgumentsList = 'TypeArgumentsList',
	Typed = 'Typed',
	TypeParameter = 'TypeParameter',
	TypeParametersList = 'TypeParametersList',
	UnaryExpression = 'UnaryExpression',
	Unknown = 'Unknown', // this is temp. while the parser is being built, afterwards this becomes a Syntax Error
	VariableDeclaration = 'VariableDeclaration',
	WhenExpression = 'WhenExpression',
	WhenCase = 'WhenCase',
	WhenCaseTests = 'WhenCaseTests',
	WhenCaseConsequent = 'WhenCaseConsequent',
	WhileStatement = 'WhileStatement',
};

export const LiteralTypes: NT[] = [
	NT.ArrayExpression,
	NT.BoolLiteral,
	NT.NumberLiteral,
	NT.ObjectExpression,
	NT.Path,
	NT.RegularExpression,
	NT.StringLiteral,
	NT.TupleExpression,
];

/** A node's positional information */
export type Pos = {
	/** cursor position of the beginning of this node, counting chars from the beginning of the file */
	start: number;

	/** cursor position immediately after this node */
	end: number;

	/** line number this node begins at, counting from 1 */
	line: number;

	/** col position this node begins at, counting from 1, within the line of the first char (similar to `start`, but within the line - if the entire file were one line, then `col` would be `start + 1`) */
	col: number;
}

export type Node = {
	type: NT;
	value?: string;
	pos: Pos;
	parent?: Node;
	children: Node[];
}

/** IfStatement nodes have more info than a regular node, owing to the need to know whether the `if` is before or after the object */
export type IfStatementNode = Node & {
	before: boolean;
}

/** UnaryExpression nodes have more info than a regular node, owing to the need to know whether the operator is before or after the object */
export type UnaryExpressionNode = Node & {
	before: boolean;
}
