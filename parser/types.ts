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
	'ModulusOperator',
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

export type BinaryOperationNode = Node & {
	type: 'BinaryOperation';
	lhs?: IdentifierNode;
	operator?: OperatorNode;
	rhs?: ExpressionNode;
}

export type FilePathNode = Node & {
	type: 'FilePath';
}

export type IdentifierNode = Node & {
	name: string;
}

export type OperatorNode = Node & {
	operator: string;
}

export type ExpressionNode = Node & {
	type: 'Expression';
}

export type ImportDeclarationNode = Node & {
	type: 'ImportDeclaration';
}

export type UnaryExpressionNode = Node & {
	type: 'UnaryExpression';
	operator: string;
}

export type VariableDeclarationKind = 'let' | 'const';
export type VariableDeclarationNode = Node & {
	type: 'VariableDeclaration';
	kind: VariableDeclarationKind;
}

type LiteralValue<T> = Node & {
	value: T;
}
export type BoolLiteralNode = LiteralValue<boolean>;
export type NumberLiteralNode = LiteralValue<number>;
export type StringLiteralNode = LiteralValue<string>;
export type LiteralNode = BoolLiteralNode | NumberLiteralNode | StringLiteralNode;
