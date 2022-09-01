const nodeTypes = ['Program', 'Identifier', 'VariableDeclaration', 'BoolLiteral', 'NumberLiteral', 'StringLiteral', 'Expression', 'BinaryOperation'] as const;
export type NodeType = typeof nodeTypes[number];

export type Node = {
	type: NodeType;
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

export type IdentifierNode = Node & {
	name: string;
}

export type OperatorNode = Node & {
	operator: string;
}

export type ExpressionNode = Node & {
	type: 'Expression';
}

export type VariableDeclarationKind = 'let' | 'const';
export type VariableDeclarationNode = Node & {
	kind: VariableDeclarationKind;
	lhs?: IdentifierNode;
	equals?: '=';
	rhs?: ExpressionNode;
}

type LiteralValue<T> = Node & {
	value: T;
}
export type BoolLiteralNode = LiteralValue<boolean>;
export type NumberLiteralNode = LiteralValue<number>;
export type StringLiteralNode = LiteralValue<string>;
export type LiteralNode = BoolLiteralNode | NumberLiteralNode | StringLiteralNode;
