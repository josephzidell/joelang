import { Node } from '../parser/types';
import Context from '../shared/context';
import JoelangError from '../shared/errors/error';

/**
 * Custom error class so that we can display the Node
 * which will help the user see where the analyzer is up to and got stuck
 */
export default class AnalysisError extends JoelangError {
	static code: string;

	static MissingCST = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A000', msg, node, ctx, cause);
	static MissingPreviousNode = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A001', msg, node, ctx, cause);
	static MissingParentNode = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A002', msg, node, ctx, cause);
	static ExtraNodesFound = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A003', msg, node, ctx, cause);
	static UnknownOperator = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A013', msg, node, ctx, cause);
	static InvalidRegularExpression = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A014', msg, node, ctx, cause);
	static TypeMismatch = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A016', msg, node, ctx, cause);
	static ExpressionNotExpected = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A018', msg, node, ctx, cause);
	static ParameterNotExpected = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A045', msg, node, ctx, cause);
	static UnknownValue = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A043', msg, node, ctx, cause);
	static InvalidNumberFound = (msg: string, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A046', msg, node, ctx, cause);
	/** msg: `We weren't expecting the program to end so soon` */
	static UnexpectedEndOfProgram = (node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A047', `We weren't expecting the program to end so soon`, node, ctx, cause);
	/** msg: `Analyzer: We expected ${expected} return values, but found ${actual}` */
	static NumberOfReturnsMismatch = (expected: number, actual: number, node: Node | undefined, ctx: Context, cause?: JoelangError) =>
		new AnalysisError('A048', `Analyzer: We expected ${expected} return values, but found ${actual}`, node, ctx, cause);

	static Expected = {
		Assignable: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A020', msg, node, ctx),
		AssignmentOperator: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A021', msg, node, ctx),
		BlockStatement: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A030', msg, node, ctx),
		Body: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A022', msg, node, ctx),
		BoolLiteral: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A011', msg, node, ctx),
		BoolType: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A015', msg, node, ctx),
		Comma: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A031', msg, node, ctx),
		Expression: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A007', msg, node, ctx),
		FromKeyword: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A042', msg, node, ctx),
		Identifier: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A005', msg, node, ctx),
		InKeyword: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A039', msg, node, ctx),
		Iterable: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A038', msg, node, ctx),
		JoeDoc: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A040', msg, node, ctx),
		Keyword: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A006', msg, node, ctx),
		Modifier: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A019', msg, node, ctx),
		NumberLiteral: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A010', msg, node, ctx),
		Operator: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A012', msg, node, ctx),
		Parameter: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A023', msg, node, ctx),
		Path: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A041', msg, node, ctx),
		Property: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A036', msg, node, ctx),
		RangeBound: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A029', msg, node, ctx),
		RestElement: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A028', msg, node, ctx),
		ReturnStatement: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A044', msg, node, ctx),
		/** msg: 'Semicolon Expected' */
		Semicolon: (node: Node | undefined, ctx: Context) => new AnalysisError('A008', 'Semicolon Expected', node, ctx),
		/** msg: 'String Expected' */
		StringLiteral: (node: Node | undefined, ctx: Context) => new AnalysisError('A035', 'String Expected', node, ctx),
		TernaryAlternate: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A034', msg, node, ctx),
		TernaryCondition: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A032', msg, node, ctx),
		TernaryConsequent: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A033', msg, node, ctx),
		ThisKeyword: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A024', msg, node, ctx),
		Type: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A009', msg, node, ctx),
		ValidPath: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A017', msg, node, ctx),
		Value: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A037', msg, node, ctx),
		WhenCase: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A025', msg, node, ctx),
		WhenCaseConsequent: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A027', msg, node, ctx),
		WhenCaseValue: (msg: string, node: Node | undefined, ctx: Context) => new AnalysisError('A026', msg, node, ctx),
	};

	private node;

	private constructor(code: string, message: string, node: Node | undefined, context: Context, cause?: JoelangError) {
		super(code, message, context, cause);

		this.node = node;
	}

	getNode(): Node | undefined {
		return this.node;
	}
}
