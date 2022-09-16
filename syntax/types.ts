import {ValueOf} from 'type-fest';

/** A node's positional information */
type Pos = {
	/** cursor position of the beginning of this node, counting chars from the beginning of the file */
	start: number;

	/** cursor position immediately after this node */
	end: number;

	/** line number this node begins at, counting from 1 */
	line: number;

	/** col position this node begins at, counting from 1, within the line of the first char (similar to `start`, but within the line - if the entire file were one line, then `col` would be `start + 1`) */
	col: number;
}

export type BaseNode = {
	type: string;
	pos: Pos;
	parent: Node;
}

export type AdditionOperatorNode = BaseNode & {
	type: 'AdditionOperator';
};

export type ArgumentNode = BaseNode & {
	type: 'Argument';
	value: LiteralNode;
	rest: boolean;
};

export type ArgumentsListNode = BaseNode & {
	type: 'ArgumentsList';
	args: Array<ArgumentNode>;
};

export type ArrayExpressionNode = BaseNode & {
	type: 'ArrayExpression';
	elements: Array<BaseNode>;
};

export type AssignmentOperatorNode = BaseNode & {
	type: 'AssignmentOperator';
	operator: string;
	subject: Node;
};

export type BinaryExpressionNode = BaseNode & {
	type: 'BinaryExpression';
	lhs: Node;
	operator: string;
	rhs: Node;
};

export type BlockStatementNode = BaseNode & {
	type: 'BlockStatement';
	stmts: Array<BaseNode>;
};

export type BoolLiteralNode = BaseNode & {
	type: 'BoolLiteral';
	value: boolean;
};

export type CallExpressionNode = BaseNode & {
	type: 'CallExpression';
	callee: IdentifierNode; // TODO add nested calls this.foo
	types?: GenericTypesListNode;
	arguments: ArgumentsListNode;
};

export type ColonSeparatorNode = BaseNode & {
	type: 'ColonSeparator';
};

export type CommaSeparatorNode = BaseNode & {
	type: 'CommaSeparator';
};

export type CommentNode = BaseNode & {
	type: 'Comment';
	content: string;
};

export type DivisionOperatorNode = BaseNode & {
	type: 'DivisionOperator';
};

export type FunctionDefinitionNode = BaseNode & {
	type: 'FunctionDefinition';
	name: IdentifierNode;
	types?: GenericTypesListNode;
	parameters: ParametersListNode;
	returns?: FunctionReturnsNode;
	body: BlockStatementNode;
	// TODO add visibility, etc.
};

export type FunctionReturnsNode = BaseNode & {
	type: 'FunctionReturns';
	types: Array<IdentifierNode | TypeNode>;
};

export type GenericTypesListNode = BaseNode & {
	type: 'GenericTypesList';
	types: Array<IdentifierNode | TypeNode>;
};

export type IdentifierNode = BaseNode & {
	type: 'Identifier';
	name: string;
};

export type ImportDeclarationNode = BaseNode & {
	type: 'ImportDeclaration';
	specifier: IdentifierNode;
	source: PathNode; // TODO add support for package
};

export type KeywordNode = BaseNode & {
	type: 'Keyword';
	which: string;
};

export type MemberExpressionNode = BaseNode & {
	type: 'MemberExpression';
	object: IdentifierNode;
	properties: MembersListNode;
};

export type MembersListNode = BaseNode & {
	type: 'MembersList';
	members: Array<IdentifierNode>;
};

export type ModOperatorNode = BaseNode & {
	type: 'ModOperator';
};

export type MultiplicationOperatorNode = BaseNode & {
	type: 'MultiplicationOperator';
};

export type NilNode = BaseNode & {
	type: 'Nil';
};

export type NumberLiteralNode = BaseNode & {
	type: 'NumberLiteral';
	value: string; // since we support exponents and commas, which Typescript does not
};

export type ParameterNode = BaseNode & {
	type: 'Parameter';
	name: IdentifierNode;
	argType: TypeNode;
	default?: LiteralNode;
	rest: boolean;
};

export type ParametersListNode = BaseNode & {
	type: 'ParametersList';
	parameters: Array<ParameterNode>;
};

export type ParenthesizedNode = BaseNode & {
	type: 'Parenthesized';
	content: Node;
};

export type PathNode = BaseNode & {
	type: 'Path';
	dest: string;
};

export type PrintStatementNode = BaseNode & {
	type: 'PrintStatement';
	contents: Array<Node>;
};

export type ProgramNode = Omit<BaseNode, 'parent'> & {
// export type ProgramNode = BaseNode & {
	type: 'Program';
	children: Node[];
};

export type RangeExpressionNode = BaseNode & {
	type: 'RangeExpression';
	lhs: NumberLiteralNode | MemberExpressionNode | CallExpressionNode;
	rhs: NumberLiteralNode | MemberExpressionNode | CallExpressionNode;
};

export type RegularExpressionNode = BaseNode & {
	type: 'RegularExpression';
	pattern: string;
	flags?: string;
};

export type RestElementNode = BaseNode & {
	type: 'RestElement';
};

export type ReturnStatementNode = BaseNode & {
	type: 'ReturnStatement';
	values: Array<BaseNode>;
};

export type RightArrowOperatorNode = BaseNode & {
	type: 'RightArrowOperator';
};

export type SemicolonSeparatorNode = BaseNode & {
	type: 'SemicolonSeparator';
};

export type StringLiteralNode = BaseNode & {
	type: 'StringLiteral';
	value: string;
};

export type SubtractionOperatorNode = BaseNode & {
	type: 'SubtractionOperator';
};

export type TypeNode = BaseNode & {
	type: 'Type';
	value: string;
};

export type UnaryExpressionNode = BaseNode & {
	type: 'UnaryExpression';
	operator: string;
	before: boolean;
	object: Node;
}

export type UnknownNode = BaseNode & {
	type: 'Unknown';
};

export type VariableDeclarationNode = BaseNode & {
	type: 'VariableDeclaration';
	kind: 'const' | 'let';
	identifier: IdentifierNode;
	idenType?: TypeNode;
	value?: Node;
};

export type WhenExpressionNode = BaseNode & {
	type: 'WhenExpression';
	discriminant: IdentifierNode; // TODO add more types
	cases: Array<WhenCaseNode>;
};

export type WhenCaseNode = BaseNode & {
	type: 'WhenCase';
	test: WhenCaseTestsNode;
	consequent: WhenCaseConsequentNode;
};

export type WhenCaseTestsNode = BaseNode & {
	type: 'WhenCaseTests';
	tests: RangeExpressionNode | RestElementNode | Array<BoolLiteralNode | NumberLiteralNode | StringLiteralNode | RegularExpressionNode>;
};

export type WhenCaseConsequentNode = BaseNode & {
	type: 'WhenCaseConsequent';
	body: BlockStatementNode | BoolLiteralNode | NumberLiteralNode | StringLiteralNode | RegularExpressionNode | CallExpressionNode;
};

// TODO add tuple, object
export type LiteralNode = ArrayExpressionNode | BoolLiteralNode | NumberLiteralNode | RegularExpressionNode | StringLiteralNode;

export type nodes = {
	AdditionOperator: AdditionOperatorNode;
	Argument: ArgumentNode;
	ArgumentsList: ArgumentsListNode;
	ArrayExpression: ArrayExpressionNode;
	AssignmentOperator: AssignmentOperatorNode;
	BinaryExpression: BinaryExpressionNode;
	BlockStatement: BlockStatementNode;
	BoolLiteral: BoolLiteralNode;
	CallExpression: CallExpressionNode;
	ColonSeparator: ColonSeparatorNode;
	CommaSeparator: CommaSeparatorNode;
	Comment: CommentNode;
	DivisionOperator: DivisionOperatorNode;
	FunctionDefinition: FunctionDefinitionNode;
	FunctionReturns: FunctionReturnsNode;
	GenericTypesList: GenericTypesListNode;
	Identifier: IdentifierNode;
	ImportDeclaration: ImportDeclarationNode;
	Keyword: KeywordNode;
	MemberExpression: MemberExpressionNode;
	MembersList: MembersListNode;
	ModOperator: ModOperatorNode;
	MultiplicationOperator: MultiplicationOperatorNode;
	Nil: NilNode;
	NumberLiteral: NumberLiteralNode;
	Parameter: ParameterNode;
	ParametersList: ParametersListNode;
	Parenthesized: ParenthesizedNode;
	Path: PathNode;
	Program: ProgramNode;
	PrintStatement: PrintStatementNode;
	RangeExpression: RangeExpressionNode;
	RegularExpression: RegularExpressionNode;
	RestElement: RestElementNode;
	ReturnStatement: ReturnStatementNode;
	RightArrowOperator: RightArrowOperatorNode;
	SemicolonSeparator: SemicolonSeparatorNode;
	StringLiteral: StringLiteralNode;
	SubtractionOperator: SubtractionOperatorNode;
	Type: TypeNode;
	UnaryExpression: UnaryExpressionNode;
	Unknown: UnknownNode;
	VariableDeclaration: VariableDeclarationNode;
	WhenExpression: WhenExpressionNode;
	WhenCase: WhenCaseNode;
	WhenCaseTests: WhenCaseTestsNode;
	WhenCaseConsequent: WhenCaseConsequentNode;
};

export type Node = ValueOf<nodes>;
