const nodeTypes = [
	'AdditionOperator',
	'ArgumentsList',
	'ArrayExpression',
	'ArrayType',
	'AssignmentOperator',
	'BinaryExpression',
	'BlockStatement',
	'BoolLiteral',
	'CallExpression',
	'ColonSeparator',
	'CommaSeparator',
	'Comment',
	'DivisionOperator',
	'FunctionDefinition',
	'FunctionReturns',
	'GenericTypesList',
	'Identifier',
	'ImportDeclaration',
	'Keyword',
	'MemberExpression',
	'MembersList',
	'ModOperator',
	'MultiplicationOperator',
	'Nil',
	'NumberLiteral',
	'Parameter',
	'ParametersList',
	'Parenthesized',
	'Path',
	'PrintStatement',
	'Program',
	'RangeExpression',
	'RegularExpression',
	'RestElement',
	'ReturnStatement',
	'RightArrowOperator',
	'SemicolonSeparator',
	'StringLiteral',
	'SubtractionOperator',
	'Type',
	'UnaryExpression',
	'Unknown', // this is temp. while the parser is being built, afterwards this becomes a Syntax Error
	'VariableDeclaration',
	'WhenExpression',
	'WhenCase',
	'WhenCaseTests',
	'WhenCaseConsequent',
] as const;

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

/** UnaryExpression nodes have more info than a regular node, owing to the need to know whether the operator is before or after the object */
export type UnaryExpressionNode = Node & {
	before: boolean;
}
