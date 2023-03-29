/** Node Types */
export enum NT {
	ArgumentsList = 'ArgumentsList',
	ArrayExpression = 'ArrayExpression',
	ArrayOf = 'ArrayOf',
	AssignablesList = 'AssignablesList',
	AssigneesList = 'AssigneesList',
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
	EnumDeclaration = 'EnumDeclaration',
	EnumExtension = 'EnumExtension',
	EnumExtensionsList = 'EnumExtensionsList',
	FromKeyword = 'FromKeyword',
	ForStatement = 'ForStatement',
	FunctionDeclaration = 'FunctionDeclaration',
	FunctionSignature = 'FunctionSignature',
	FunctionReturns = 'FunctionReturns',
	Identifier = 'Identifier',
	IfStatement = 'IfStatement',
	ImportDeclaration = 'ImportDeclaration',
	InKeyword = 'InKeyword',
	InterfaceDeclaration = 'InterfaceDeclaration',
	InterfaceExtension = 'InterfaceExtension',
	InterfaceExtensionsList = 'InterfaceExtensionsList',
	JoeDoc = 'JoeDoc', // for Class, Function, Interface, or Variable
	LoopStatement = 'LoopStatement',
	MemberExpression = 'MemberExpression',
	MemberList = 'MemberList',
	MemberListExpression = 'MemberListExpression',
	Modifier = 'Modifier', // for Class, Function, Interface, or Variable
	ModifiersList = 'ModifiersList', // for Class, Function, Interface, or Variable
	NextStatement = 'NextStatement',
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
	PropertyShape = 'PropertyShape',
	RangeExpression = 'RangeExpression',
	RegularExpression = 'RegularExpression',
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
	VariableDeclaration = 'VariableDeclaration',
	WhenExpression = 'WhenExpression',
	WhenCase = 'WhenCase',
	WhenCaseValues = 'WhenCaseValues',
	WhenCaseConsequent = 'WhenCaseConsequent',
}

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

/** These are Node Types that are physically assignable to some variable, param, or in a return. */
export const AssignableNodeTypes: NT[] = [...ExpressionNodeTypes, NT.FunctionDeclaration, NT.ThisKeyword];

/** These are the Types corresponding to AssignableNodeTypes */
export const AssignableTypes: NT[] = [
	NT.ArrayOf,
	NT.FunctionSignature,
	NT.Identifier,
	NT.MemberExpression,
	NT.MemberListExpression,
	NT.ObjectShape,
	NT.TupleShape,
	NT.Type,
	NT.TypeInstantiationExpression,
];

export const CallableTypes: NT[] = [
	NT.CallExpression,
	NT.Identifier,
	NT.MemberExpression,
	NT.TypeInstantiationExpression,
];

/** These apply equally to MemberExpressions as well as MemberListExpressions */
export const validNodeTypesAsMemberObject = [
	NT.ArrayExpression, // eg. ['A', 'B', 'C'][0] or ['A', 'B', 'C'][0, 1]
	NT.CallExpression, // eg. foo()['bar'] or foo()['bar', 'baz']
	NT.Identifier, // eg. foo['bar'] or foo['bar', 'baz']
	NT.MemberExpression, // eg. foo.bar['baz'] or foo.bar['baz', 'qux']
	NT.Parenthesized, // eg. (foo)[0] or (foo)[0, 1]
	NT.StringLiteral, // eg. "foo"[0] or "foo"[0, 1]
	NT.ThisKeyword, // eg. this.bar or this['bar', 'baz']
	NT.TupleExpression, // eg. <1, "two", [3, 4]>[0] or <1, "two", [3, 4]>[0, 1]
	NT.TypeInstantiationExpression, // eg. foo<|T|>['bar'] or foo<|T|>['bar', 'baz']
];

export const validChildrenAsMemberProperty = [
	NT.BinaryExpression, // eg. foo[index + 1]
	NT.CallExpression, // eg. foo[bar() -> int64]
	NT.CommaSeparator, // eg. foo[bar, baz]
	NT.Identifier, // eg. foo[bar: int32]
	NT.MemberExpression, // eg. foo[bar.baz]
	NT.NumberLiteral, // eg. foo[1]
	NT.RangeExpression, // eg. foo[1 .. 2]
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
};

export type Node = {
	type: NT;
	value?: string;
	pos: Pos;
	parent?: Node;
	children: Node[];
};

/** UnaryExpression nodes have more info than a regular node, owing to the need to know whether the operator is before or after the object */
export type UnaryExpressionNode = Node & {
	before: boolean;
};
