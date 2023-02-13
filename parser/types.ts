const nodeTypes = [
	'AdditionOperator',
	'ArgumentsList',
	'ArrayExpression',
	'ArrayType',
	'AssignmentOperator',
	'BinaryExpression',
	'BlockStatement',
	'BoolLiteral',
	'BreakStatement',
	'CallExpression',
	'ClassDeclaration',
	'ClassExtensionsList',
	'ClassImplementsList',
	'ColonSeparator',
	'CommaSeparator',
	'Comment',
	'DivisionOperator',
	'ForStatement',
	'FunctionDeclaration',
	'FunctionReturns',
	'Identifier',
	'IfStatement',
	'ImportDeclaration',
	'InterfaceDeclaration',
	'InterfaceExtensionsList',
	'Keyword',
	'MemberExpression',
	'MembersList',
	'Modifier', // for Class, Function, Interface, or Variable
	'ModifiersList', // for Class, Function, Interface, or Variable
	'ModOperator',
	'MultiplicationOperator',
	'NewExpression',
	'Nil',
	'NumberLiteral',
	'ObjectExpression',
	'Parameter',
	'ParametersList',
	'Parenthesized',
	'Path',
	'PrintStatement',
	'Program',
	'Property',
	'RangeExpression',
	'RegularExpression',
	'RepeatStatement',
	'RestElement',
	'ReturnStatement',
	'RightArrowOperator',
	'SemicolonSeparator',
	'StringLiteral',
	'SubtractionOperator',
	'TernaryCondition',
	'TernaryElse',
	'TernaryExpression',
	'TernaryThen',
	'TupleExpression',
	'TupleType',
	'Type',
	'TypeArgumentsList',
	'TypeDeclaration',
	'TypeParameter',
	'TypeParametersList',
	'UnaryExpression',
	'Unknown', // this is temp. while the parser is being built, afterwards this becomes a Syntax Error
	'VariableDeclaration',
	'WhenExpression',
	'WhenCase',
	'WhenCaseTests',
	'WhenCaseConsequent',
	'WhileStatement',
] as const;

export const LiteralTypes: NodeType[] = [
	'ArrayExpression',
	'BoolLiteral',
	'NumberLiteral',
	'ObjectExpression',
	'Path',
	'RegularExpression',
	'StringLiteral',
	'TupleExpression',
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

export type NodeType = typeof nodeTypes[number];

export type Node = {
	type: NodeType;
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
