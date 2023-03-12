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
	InterfaceDeclaration = 'InterfaceDeclaration',
	InterfaceExtension = 'InterfaceExtension',
	InterfaceExtensionsList = 'InterfaceExtensionsList',
	JoeDoc = 'JoeDoc', // for Class, Function, Interface, or Variable
	Keyword = 'Keyword',
	Loop = 'Loop',
	MemberExpression = 'MemberExpression',
	MemberList = 'MemberList',
	MemberListExpression = 'MemberListExpression',
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
	TernaryAlternate = 'TernaryAlternate',
	TernaryCondition = 'TernaryCondition',
	TernaryConsequent = 'TernaryConsequent',
	TernaryExpression = 'TernaryExpression',
	ThisKeyword = 'ThisKeyword',
	TupleExpression = 'TupleExpression',
	TupleShape = 'TupleShape',
	Type = 'Type',
	TypeArgumentsList = 'TypeArgumentsList',
	TypeInstantiationExpression = 'TypeInstantiationExpression',
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
	NT.MemberListExpression,
	NT.Parenthesized,
	NT.RangeExpression,
	NT.TernaryExpression,
	NT.TypeInstantiationExpression,
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
export const AssignableTypes: NT[] = [NT.FunctionSignature, NT.Identifier, NT.MemberExpression, NT.MemberListExpression, NT.Type, NT.TypeInstantiationExpression];

export const CallableTypes: NT[] = [NT.CallExpression, NT.Identifier, NT.MemberExpression, NT.TypeInstantiationExpression];

/** These apply equally to MemberExpressions as well as MemberListExpressions */
export const validChildrenAsMemberObject = [
	NT.CallExpression, // eg. foo()['bar'] or foo()['bar', 'baz']
	NT.Identifier, // eg. foo['bar'] or foo['bar', 'baz']
	NT.MemberExpression, // eg. foo.bar['baz'] or foo.bar['baz', 'qux']
	NT.ThisKeyword, // eg. this.bar or this['bar', 'baz']
	NT.TypeInstantiationExpression, // eg. foo<|T|>['bar'] or foo<|T|>['bar', 'baz']
];

export const validChildrenAsMemberProperty = [
	NT.BinaryExpression, // eg. foo[index + 1]
	NT.CallExpression, // eg. foo[bar() -> number]
	NT.CommaSeparator, // eg. foo[bar, baz]
	NT.Identifier, // eg. foo[bar: number]
	NT.MemberExpression, // eg. foo[bar.baz]
	NT.NumberLiteral, // eg. foo[1]
	NT.RangeExpression, // eg. foo[1..2]
	NT.StringLiteral, // eg. foo['bar']
	NT.TernaryExpression, // eg. foo[bar ? 1 : 2]
	NT.TypeInstantiationExpression, // eg. foo.Foo<|T|>
	NT.UnaryExpression, // eg. foo[index++]
];

export const validChildrenInTypeArgumentList = [
	NT.ArrayOf,
	NT.CommaSeparator,
	NT.FunctionSignature,
	NT.Identifier,
	NT.MemberExpression,
	NT.ObjectShape,
	NT.TupleShape,
	NT.Type,
	NT.TypeInstantiationExpression,
];

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
