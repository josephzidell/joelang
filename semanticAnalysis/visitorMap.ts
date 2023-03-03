import { Node, NT, UnaryExpressionNode } from "../parser/types";
import ErrorContext from "../shared/errorContext";
import { error, Result } from "../shared/result";
import AnalysisError, { AnalysisErrorCode } from "./error";
import SemanticAnalyzer from "./semanticAnalyzer";

type visitor = <T>(node: Node, analyzer: SemanticAnalyzer) => Result<T>;

// temp method to handle unimplemented visitees
function err <T>(message: string, node: Node, analyzer: SemanticAnalyzer): Result<T> {
	return error(new AnalysisError(
		AnalysisErrorCode.MissingVisitee,
		message,
		node,
		new ErrorContext(
			analyzer.parser.lexer.code,
			node.pos.line,
			node.pos.col,
			node.value?.length || 1,
		),
	), analyzer.getAST);
}

const visitorMap: Record<NT, visitor> = {
	[NT.ArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitArgumentList(node) as Result<T>,
	[NT.ArrayExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitArrayExpression(node) as Result<T>,
	[NT.ArrayType]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitArrayType() method and add it to visitorMap.ts', node, analyzer),
	[NT.AssignmentOperator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitAssignmentOperator() method and add it to visitorMap.ts', node, analyzer),
	[NT.BinaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitBinaryExpression(node) as Result<T>,
	[NT.BlockStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitBlockStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.BoolLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitBoolLiteral(node) as Result<T>,
	[NT.BreakStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitBreakStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.CallExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitCallExpression(node) as Result<T>,
	[NT.ClassDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitClassDeclaration() method and add it to visitorMap.ts', node, analyzer),
	[NT.ClassExtensionsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitClassExtensionsList() method and add it to visitorMap.ts', node, analyzer),
	[NT.ClassImplementsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitClassImplementsList() method and add it to visitorMap.ts', node, analyzer),
	[NT.ColonSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitColonSeparator() method and add it to visitorMap.ts', node, analyzer),
	[NT.CommaSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.noop(node) as Result<T>,
	[NT.Comment]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitComment() method and add it to visitorMap.ts', node, analyzer),
	[NT.ElseStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitElseStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.ForStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitForStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.FunctionDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitFunctionDeclaration() method and add it to visitorMap.ts', node, analyzer),
	[NT.FunctionReturns]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitFunctionReturns() method and add it to visitorMap.ts', node, analyzer),
	[NT.Identifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitIdentifier(node) as Result<T>,
	[NT.IfStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitIfStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.ImportDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitImportDeclaration() method and add it to visitorMap.ts', node, analyzer),
	[NT.InterfaceDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitInterfaceDeclaration() method and add it to visitorMap.ts', node, analyzer),
	[NT.InterfaceExtensionsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitInterfaceExtensionsList() method and add it to visitorMap.ts', node, analyzer),
	[NT.JoeDoc]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitJoeDoc() method and add it to visitorMap.ts', node, analyzer),
	[NT.Keyword]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitKeyword() method and add it to visitorMap.ts', node, analyzer),
	[NT.Loop]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitLoop() method and add it to visitorMap.ts', node, analyzer),
	[NT.MemberExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitMemberExpression(node) as Result<T>,
	[NT.MembersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitMembersList() method and add it to visitorMap.ts', node, analyzer),
	[NT.Modifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitModifier() method and add it to visitorMap.ts', node, analyzer),
	[NT.ModifiersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitModifiersList() method and add it to visitorMap.ts', node, analyzer),
	[NT.NumberLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitNumberLiteral(node) as Result<T>,
	[NT.ObjectExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitObjectExpression() method and add it to visitorMap.ts', node, analyzer),
	[NT.ObjectType]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitObjectType() method and add it to visitorMap.ts', node, analyzer),
	[NT.Parameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitParameter() method and add it to visitorMap.ts', node, analyzer),
	[NT.ParametersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitParametersList() method and add it to visitorMap.ts', node, analyzer),
	[NT.Parenthesized]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitParenthesized(node) as Result<T>,
	[NT.Path]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitPath(node) as Result<T>,
	[NT.PrintStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitPrintStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.Program]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitProgram(node) as Result<T>,
	[NT.Property]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitProperty() method and add it to visitorMap.ts', node, analyzer),
	[NT.RangeExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitRangeExpression() method and add it to visitorMap.ts', node, analyzer),
	[NT.RegularExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitRegularExpression(node) as Result<T>,
	[NT.RepeatStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitRepeatStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.RestElement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitRestElement() method and add it to visitorMap.ts', node, analyzer),
	[NT.ReturnStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitReturnStatement() method and add it to visitorMap.ts', node, analyzer),
	[NT.RightArrowOperator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitRightArrowOperator() method and add it to visitorMap.ts', node, analyzer),
	[NT.SemicolonSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.noop(node) as Result<T>,
	[NT.StringLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitStringLiteral(node) as Result<T>,
	[NT.TernaryCondition]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTernaryCondition() method and add it to visitorMap.ts', node, analyzer),
	[NT.TernaryElse]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTernaryElse() method and add it to visitorMap.ts', node, analyzer),
	[NT.TernaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTernaryExpression() method and add it to visitorMap.ts', node, analyzer),
	[NT.TernaryThen]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTernaryThen() method and add it to visitorMap.ts', node, analyzer),
	[NT.TupleExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTupleExpression() method and add it to visitorMap.ts', node, analyzer),
	[NT.TupleType]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTupleType() method and add it to visitorMap.ts', node, analyzer),
	[NT.Type]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitType(node) as Result<T>,
	[NT.TypeArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitTypeArgumentsList(node) as Result<T>,
	[NT.Typed]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTyped() method and add it to visitorMap.ts', node, analyzer),
	[NT.TypeParameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTypeParameter() method and add it to visitorMap.ts', node, analyzer),
	[NT.TypeParametersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitTypeParametersList() method and add it to visitorMap.ts', node, analyzer),
	[NT.UnaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitUnaryExpression(node as UnaryExpressionNode) as Result<T>,
	[NT.Unknown]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitUnknown() method and add it to visitorMap.ts', node, analyzer),
	[NT.VariableDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitVariableDeclaration(node) as Result<T>,
	[NT.WhenExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitWhenExpression() method and add it to visitorMap.ts', node, analyzer),
	[NT.WhenCase]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitWhenCase() method and add it to visitorMap.ts', node, analyzer),
	[NT.WhenCaseTests]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitWhenCaseTests() method and add it to visitorMap.ts', node, analyzer),
	[NT.WhenCaseConsequent]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitWhenCaseConsequent() method and add it to visitorMap.ts', node, analyzer),
	[NT.WhileStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => err('Please implement visitWhileStatement() method and add it to visitorMap.ts', node, analyzer),
}

export default visitorMap;
