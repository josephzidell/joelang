const nodeTypes = [
	'AdditionOperator',
	'ArgumentsList',
	'ArrayExpression',
	'AssignmentOperator',
	'BinaryExpression',
	'BlockStatement',
	'BoolLiteral',
	'CallExpression',
	'ColonSeparator',
	'CommaSeparator',
	'Comment',
	'DivisionOperator',
	'Expression',
	'FilePath',
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
	'Parenthesized',
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
export type NodeType = typeof nodeTypes[number];

export type Node = {
	type: NodeType;
	value?: string;
	start: number;
	end: number;
	parent?: Node;
	children: Node[];
}

/** UnaryExpression nodes have more info than a regular node, owing to the need to know whether the operator is before or after the object */
export type UnaryExpressionNode = Node & {
	before: boolean;
}
