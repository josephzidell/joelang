/**
 * Options used in the entire Analyzer phase.
 */
type AnyASTConstructor = new (pos: import('../shared/pos').Pos, parent: import('./asts').AST) => import('./asts').AST;
type InstanceTypes<T extends AnyASTConstructor[]> = {
	[K in keyof T]: T[K] extends new (pos: import('../shared/pos').Pos, parent: import('./asts').AST) => infer U ? U : never;
}[number];

interface MatchingReturns {
	types: ASTTypeList<ASTType>;
	errors: {
		ifMissing: ResultError<AnalysisError | SemanticError, ASTBlockStatement>;
		ifHasIncorrectNumberOfExpressions: (
			expected: number,
			actual: number,
		) => ResultError<AnalysisError | SemanticError, ASTBlockStatement>;
	};
}
