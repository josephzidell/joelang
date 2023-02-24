import {ValueOf} from 'type-fest';
import * as Parse from '../parser/types';

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

export type ArgumentsListNode = BaseNode & {
	type: Parse.NT.ArgumentsList;
	args: Array<BaseNode>;
};

export type ArrayExpressionNode = BaseNode & {
	type: Parse.NT.ArrayExpression;
	elements: Array<BaseNode>;
};

export type AssignmentOperatorNode = BaseNode & {
	type: Parse.NT.AssignmentOperator;
	operator: string;
	subject: Node;
};

export type BinaryExpressionNode = BaseNode & {
	type: Parse.NT.BinaryExpression;
	lhs: Node;
	operator: string;
	rhs: Node;
};

export type BlockStatementNode = BaseNode & {
	type: Parse.NT.BlockStatement;
	stmts: Array<BaseNode>;
};

export type BoolLiteralNode = BaseNode & {
	type: Parse.NT.BoolLiteral;
	value: boolean;
};

export type CallExpressionNode = BaseNode & {
	type: Parse.NT.CallExpression;
	callee: IdentifierNode; // TODO add nested calls this.foo
	types?: TypeArgumentsListNode;
	arguments: ArgumentsListNode;
};

export type ColonSeparatorNode = BaseNode & {
	type: Parse.NT.ColonSeparator;
};

export type CommaSeparatorNode = BaseNode & {
	type: Parse.NT.CommaSeparator;
};

export type CommentNode = BaseNode & {
	type: Parse.NT.Comment;
	content: string;
};

export type FunctionDeclarationNode = BaseNode & {
	type: Parse.NT.FunctionDeclaration;
	name: IdentifierNode;
	types?: TypeParametersListNode;
	parameters: ParametersListNode;
	returns?: FunctionReturnsNode;
	body: BlockStatementNode;
	// TODO add visibility, etc.
};

export type FunctionReturnsNode = BaseNode & {
	type: Parse.NT.FunctionReturns;
	types: Array<IdentifierNode | TypeNode>;
};

export type IdentifierNode = BaseNode & {
	type: Parse.NT.Identifier;
	name: string;
};

export type ImportDeclarationNode = BaseNode & {
	type: Parse.NT.ImportDeclaration;
	specifier: IdentifierNode;
	source: PathNode; // TODO add support for package
};

export type KeywordNode = BaseNode & {
	type: Parse.NT.Keyword;
	which: string;
};

export type MemberExpressionNode = BaseNode & {
	type: Parse.NT.MemberExpression;
	object: IdentifierNode;
	properties: MembersListNode;
};

export type MembersListNode = BaseNode & {
	type: Parse.NT.MembersList;
	members: Array<IdentifierNode>;
};

export type NumberLiteralNode = BaseNode & {
	type: Parse.NT.NumberLiteral;
	value: string; // since we support exponents and commas, which Typescript does not
};

export type ParameterNode = BaseNode & {
	type: Parse.NT.Parameter;
	name: IdentifierNode;
	argType: TypeNode;
	default?: LiteralNode;
	rest: boolean;
};

export type ParametersListNode = BaseNode & {
	type: Parse.NT.ParametersList;
	parameters: Array<ParameterNode>;
};

export type ParenthesizedNode = BaseNode & {
	type: Parse.NT.Parenthesized;
	content: Node;
};

export type PathNode = BaseNode & {
	type: Parse.NT.Path;
	dest: string;
};

export type PrintStatementNode = BaseNode & {
	type: Parse.NT.PrintStatement;
	contents: Array<Node>;
};

export type ProgramNode = Omit<BaseNode, 'parent'> & {
// export type ProgramNode = BaseNode & {
	type: Parse.NT.Program;
	children: Node[];
};

export type RangeExpressionNode = BaseNode & {
	type: Parse.NT.RangeExpression;
	lhs: NumberLiteralNode | MemberExpressionNode | CallExpressionNode;
	rhs: NumberLiteralNode | MemberExpressionNode | CallExpressionNode;
};

export type RegularExpressionNode = BaseNode & {
	type: Parse.NT.RegularExpression;
	pattern: string;
	flags?: string;
};

export type RestElementNode = BaseNode & {
	type: Parse.NT.RestElement;
};

export type ReturnStatementNode = BaseNode & {
	type: Parse.NT.ReturnStatement;
	values: Array<BaseNode>;
};

export type RightArrowOperatorNode = BaseNode & {
	type: Parse.NT.RightArrowOperator;
};

export type SemicolonSeparatorNode = BaseNode & {
	type: Parse.NT.SemicolonSeparator;
};

export type StringLiteralNode = BaseNode & {
	type: Parse.NT.StringLiteral;
	value: string;
};

export type TypeArgumentsListNode = BaseNode & {
	type: Parse.NT.TypeArgumentsList;
	types: Array<IdentifierNode | TypeNode>;
};

export type TypeNode = BaseNode & {
	type: Parse.NT.Type;
	value: string;
};

export type TypeParametersListNode = BaseNode & {
	type: Parse.NT.TypeParametersList;
	types: Array<IdentifierNode | TypeNode>;
};

export type UnaryExpressionNode = BaseNode & {
	type: Parse.NT.UnaryExpression;
	operator: string;
	before: boolean;
	object: Node;
}

export type UnknownNode = BaseNode & {
	type: Parse.NT.Unknown;
};

export type VariableDeclarationNode = BaseNode & {
	type: Parse.NT.VariableDeclaration;
	kind: 'const' | 'let';
	identifier: IdentifierNode;
	idenType?: TypeNode;
	value?: Node;
};

export type WhenExpressionNode = BaseNode & {
	type: Parse.NT.WhenExpression;
	discriminant: IdentifierNode; // TODO add more types
	cases: Array<WhenCaseNode>;
};

export type WhenCaseNode = BaseNode & {
	type: Parse.NT.WhenCase;
	test: WhenCaseTestsNode;
	consequent: WhenCaseConsequentNode;
};

export type WhenCaseTestsNode = BaseNode & {
	type: Parse.NT.WhenCaseTests;
	tests: RangeExpressionNode | RestElementNode | Array<BoolLiteralNode | NumberLiteralNode | StringLiteralNode | RegularExpressionNode>;
};

export type WhenCaseConsequentNode = BaseNode & {
	type: Parse.NT.WhenCaseConsequent;
	body: BlockStatementNode | BoolLiteralNode | NumberLiteralNode | StringLiteralNode | RegularExpressionNode | CallExpressionNode;
};

// TODO add tuple, object
export type LiteralNode = ArrayExpressionNode | BoolLiteralNode | NumberLiteralNode | RegularExpressionNode | StringLiteralNode;

export type nodes = {
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
	FunctionDeclaration: FunctionDeclarationNode;
	FunctionReturns: FunctionReturnsNode;
	Identifier: IdentifierNode;
	ImportDeclaration: ImportDeclarationNode;
	Keyword: KeywordNode;
	MemberExpression: MemberExpressionNode;
	MembersList: MembersListNode;
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
	Type: TypeNode;
	TypeArgumentsList: TypeArgumentsListNode;
	TypeParametersList: TypeParametersListNode;
	UnaryExpression: UnaryExpressionNode;
	Unknown: UnknownNode;
	VariableDeclaration: VariableDeclarationNode;
	WhenExpression: WhenExpressionNode;
	WhenCase: WhenCaseNode;
	WhenCaseTests: WhenCaseTestsNode;
	WhenCaseConsequent: WhenCaseConsequentNode;
};

export type Node = ValueOf<nodes>;
