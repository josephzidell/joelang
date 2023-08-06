import { Node } from '../parser/types';
import ErrorContext from '../shared/errorContext';

/**
 * Analysis error codes.
 */
export enum AnalysisErrorCode {
	MissingCST = 'A000',
	MissingPreviousNode = 'A001',
	MissingParentNode = 'A002',
	ExtraNodesFound = 'A003',
	IdentifierExpected = 'A005',
	KeywordExpected = 'A006',
	ExpressionExpected = 'A007',
	SemicolonExpected = 'A008',
	TypeExpected = 'A009',
	NumberLiteralExpected = 'A010',
	BoolLiteralExpected = 'A011',
	OperatorExpected = 'A012',
	UnknownOperator = 'A013',
	InvalidRegularExpression = 'A014',
	BoolTypeExpected = 'A015',
	TypeMismatch = 'A016',
	ValidPathExpected = 'A017',
	ExpressionNotExpected = 'A018',
	ModifierExpected = 'A019',
	AssignableExpected = 'A020',
	AssignmentOperatorExpected = 'A021',
	BodyExpected = 'A022',
	ParameterExpected = 'A023',
	ThisKeywordExpected = 'A024',
	WhenCaseExpected = 'A025',
	WhenCaseValueExpected = 'A026',
	WhenCaseConsequentExpected = 'A027',
	RestElementExpected = 'A028',
	RangeBoundExpected = 'A029',
	BlockStatementExpected = 'A030',
	CommaExpected = 'A031',
	TernaryConditionExpected = 'A032',
	TernaryConsequentExpected = 'A033',
	TernaryAlternateExpected = 'A034',
	StringLiteralExpected = 'A035',
	PropertyExpected = 'A036',
	ValueExpected = 'A037',
	IterableExpected = 'A038',
	InKeywordExpected = 'A039',
	JoeDocExpected = 'A040',
	PathExpected = 'A041',
	FromKeywordExpected = 'A042',
	UnknownValue = 'A043',
	ReturnStatementExpected = 'A044',
	ParameterNotExpected = 'A045',
	InvalidNumberFound = 'A046',
	UnexpectedEndOfProgram = 'A047',
}

/**
 * Custom error class so that we can display the Node
 * which will help the user see where the analyzer is up to and got stuck
 */
export default class AnalysisError extends TypeError {
	private errorCode;
	private node;
	private context;

	constructor(errorCode: AnalysisErrorCode, message: string, node: Node | undefined, context: ErrorContext) {
		super(message);

		this.errorCode = errorCode;
		this.node = node;
		this.context = context;
	}

	getErrorCode(): AnalysisErrorCode {
		return this.errorCode;
	}

	getNode(): Node | undefined {
		return this.node;
	}

	getContext(): ErrorContext {
		return this.context;
	}
}
