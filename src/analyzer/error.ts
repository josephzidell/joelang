import { Node } from '../parser/types';
import ErrorContext from '../shared/errorContext';

/**
 * Analysis error codes.
 */
export enum Code {
	MissingCST = 'S000',
	MissingPreviousNode = 'S001',
	MissingParentNode = 'S002',
	ExtraNodesFound = 'S003',
	IdentifierExpected = 'S005',
	KeywordExpected = 'S006',
	ExpressionExpected = 'S007',
	SemicolonExpected = 'S008', // kinda passive aggressive, but ok, lol
	TypeExpected = 'S009',
	NumberLiteralExpected = 'S010',
	BoolLiteralExpected = 'S011',
	OperatorExpected = 'S012',
	UnknownOperator = 'S013',
	InvalidRegularExpression = 'S014',
	BoolTypeExpected = 'S015',
	TypeMismatch = 'S016',
	ValidPathExpected = 'S017',
	ExpressionNotExpected = 'S018',
	ModifierExpected = 'S019',
	AssignableExpected = 'S020',
	AssignmentOperatorExpected = 'S021',
	BodyExpected = 'S022',
	ParameterExpected = 'S023',
	ThisKeywordExpected = 'S024',
	WhenCaseExpected = 'S025',
	WhenCaseValueExpected = 'S026',
	WhenCaseConsequentExpected = 'S027',
	RestElementExpected = 'S028',
	RangeBoundExpected = 'S029',
	BlockStatementExpected = 'S030',
	CommaExpected = 'S031',
	TernaryConditionExpected = 'S032',
	TernaryConsequentExpected = 'S033',
	TernaryAlternateExpected = 'S034',
	StringLiteralExpected = 'S035',
	PropertyExpected = 'S036',
	ValueExpected = 'S037',
	IterableExpected = 'S038',
	InKeywordExpected = 'S039',
	JoeDocExpected = 'S040', // TBD if this will ever actually be used / enforced
	PathExpected = 'S041',
	FromKeywordExpected = 'S042',
}

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class AnalysisError extends TypeError {
	private errorCode;
	private node;
	private context;

	constructor(errorCode: Code, message: string, node: Node | undefined, context: ErrorContext) {
		super(message);

		this.errorCode = errorCode;
		this.node = node;
		this.context = context;
	}

	getErrorCode(): Code {
		return this.errorCode;
	}

	getNode(): Node | undefined {
		return this.node;
	}

	getContext(): ErrorContext {
		return this.context;
	}
}
