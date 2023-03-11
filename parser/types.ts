/** Node Types */
export enum NT {
	ArgumentsList = 'ArgumentsList',
	ArrayExpression = 'ArrayExpression',
	ArrayOf = 'ArrayOf',
	AssignmentExpression = 'AssignmentExpression',
	AssignmentOperator = 'AssignmentOperator',
	BinaryExpression = 'BinaryExpression',
	BlockStatement = 'BlockStatement',
	BoolLiteral = 'BoolLiteral',
	CallExpression = 'CallExpression',
	ClassDeclaration = 'ClassDeclaration',
	ClassExtension = 'ClassExtension',
	ClassExtensionsList = 'ClassExtensionsList',
	ClassImplement = 'ClassImplement',
	ClassImplementsList = 'ClassImplementsList',
	ColonSeparator = 'ColonSeparator',
	CommaSeparator = 'CommaSeparator',
	Comment = 'Comment',
	DoneStatement = 'DoneStatement',
	ElseStatement = 'ElseStatement',
	ForStatement = 'ForStatement',
	FunctionDeclaration = 'FunctionDeclaration',
	FunctionSignature = 'FunctionSignature',
	FunctionReturns = 'FunctionReturns',
	Identifier = 'Identifier',
	IfStatement = 'IfStatement',
	ImportDeclaration = 'ImportDeclaration',
	InstantiationExpression = 'InstantiationExpression',
	InterfaceDeclaration = 'InterfaceDeclaration',
	InterfaceExtension = 'InterfaceExtension',
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
	ObjectShape = 'ObjectShape',
	Parameter = 'Parameter',
	ParametersList = 'ParametersList',
	Parenthesized = 'Parenthesized',
	Path = 'Path',
	PostfixIfStatement = 'PostfixIfStatement',
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
	ThisKeyword = 'ThisKeyword',
	TupleExpression = 'TupleExpression',
	TupleShape = 'TupleShape',
	Type = 'Type',
	TypeArgumentsList = 'TypeArgumentsList',
	TypeParameter = 'TypeParameter',
	TypeParametersList = 'TypeParametersList',
	UnaryExpression = 'UnaryExpression',
	Unknown = 'Unknown', // this is temp. while the parser is being built, afterwards this becomes a Syntax Error
	VariableDeclaration = 'VariableDeclaration',
	WhenExpression = 'WhenExpression',
	WhenCase = 'WhenCase',
	WhenCaseValues = 'WhenCaseValues',
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

export const ExpressionNodeTypes: NT[] = [
	...LiteralTypes,
	NT.BinaryExpression,
	NT.CallExpression,
	NT.Identifier,
	NT.MemberExpression,
	NT.Parenthesized,
	NT.RangeExpression,
	NT.UnaryExpression,
	NT.WhenExpression,
];

/** These are Node Types that are physically assignable to some variable or param. */
export const AssignableNodeTypes: NT[] = [
	...ExpressionNodeTypes,
	NT.FunctionDeclaration,
	NT.ThisKeyword,
];

/** These are the Types corresponding to AssignableNodeTypes */
export const AssignableTypes: NT[] = [NT.FunctionSignature, NT.Identifier, NT.InstantiationExpression, NT.MemberExpression, NT.Type];

export const validChildrenInTypeArgumentList = [NT.CommaSeparator, NT.Identifier, NT.InstantiationExpression, NT.MemberExpression, NT.Type];

export const validChildrenInWhenCaseValues = [
	NT.BoolLiteral,
	NT.CallExpression,
	NT.CommaSeparator,
	NT.Identifier,
	NT.MemberExpression,
	NT.NumberLiteral,
	NT.Path,
	NT.RangeExpression,
	NT.RegularExpression,
	NT.RestElement,
	NT.StringLiteral,
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

/** UnaryExpression nodes have more info than a regular node, owing to the need to know whether the operator is before or after the object */
export type UnaryExpressionNode = Node & {
	before: boolean;
}
