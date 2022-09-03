const nodeTypes = [
	'AdditionOperator',
	'AssignmentOperator',
	'BinaryOperation',
	'BlockStatement',
	'BoolLiteral',
	'ColonSeparator',
	'CommaSeparator',
	'Comment',
	'DivisionOperator',
	'Expression',
	'FilePath',
	'Identifier',
	'ImportDeclaration',
	'Keyword',
	'ModOperator',
	'MultiplicationOperator',
	'NumberLiteral',
	'Parenthesized',
	'Program',
	'SemicolonSeparator',
	'StringLiteral',
	'SubtractionOperator',
	'UnaryExpression',
	'Unknown', // this is temp. while the parser is being built, afterwards this becomes a Syntax Error
	'VariableDeclaration',
] as const;
export type NodeType = typeof nodeTypes[number];

export type Node = {
	type: NodeType;
	value?: string;
	start: number;
	end: number;
	parent?: Node;
	nodes: Node[];
}
