import { Node, NT, UnaryExpressionNode } from '../parser/types';
import { Result } from '../shared/result';
import AnalysisError from './error';
import SemanticAnalyzer from './semanticAnalyzer';

export type visitor = <T>(node: Node, analyzer: SemanticAnalyzer) => Result<T, AnalysisError>;

const visitorMap: Record<NT, visitor> = {
	[NT.ArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitArgumentList(node) as Result<T, AnalysisError>,
	[NT.ArrayExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitArrayExpression(node) as Result<T, AnalysisError>,
	[NT.ArrayOf]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitArrayOf(node) as Result<T, AnalysisError>,
	[NT.AssignablesList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitAssignablesList(node) as Result<T, AnalysisError>,
	[NT.AssigneesList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitAssigneesList(node) as Result<T, AnalysisError>,
	[NT.AssignmentExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitAssignmentExpression(node) as Result<T, AnalysisError>,
	[NT.AssignmentOperator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.BinaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitBinaryExpression(node) as Result<T, AnalysisError>,
	[NT.BlockStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitBlockStatement(node) as Result<T, AnalysisError>,
	[NT.BoolLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitBoolLiteral(node) as Result<T, AnalysisError>,
	[NT.CallExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitCallExpression(node) as Result<T, AnalysisError>,
	[NT.ClassDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitClassDeclaration(node) as Result<T, AnalysisError>,
	[NT.ClassImplement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitDeclarationExtendsOrImplements(node) as Result<T, AnalysisError>,
	[NT.ClassImplementsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitClassImplementsList(node) as Result<T, AnalysisError>,
	[NT.ColonSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.CommaSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.Comment]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.DoneStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitDoneStatement(node) as Result<T, AnalysisError>,
	[NT.ElseStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitElseStatement(node) as Result<T, AnalysisError>,
	[NT.EnumDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitEnumDeclaration(node) as Result<T, AnalysisError>,
	[NT.Extension]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitDeclarationExtendsOrImplements(node) as Result<T, AnalysisError>,
	[NT.ExtensionsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitExtensionsList(node) as Result<T, AnalysisError>,
	[NT.ForStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitForStatement(node) as Result<T, AnalysisError>,
	[NT.FromKeyword]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.FunctionDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitFunctionDeclaration(node) as Result<T, AnalysisError>,
	[NT.FunctionReturns]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitFunctionReturns(node) as Result<T, AnalysisError>,
	[NT.FunctionSignature]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitFunctionSignature(node) as Result<T, AnalysisError>,
	[NT.Identifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitIdentifier(node) as Result<T, AnalysisError>,
	[NT.IfStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitIfStatement(node) as Result<T, AnalysisError>,
	[NT.InKeyword]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.InterfaceDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitInterfaceDeclaration(node) as Result<T, AnalysisError>,
	[NT.JoeDoc]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitJoeDoc(node) as Result<T, AnalysisError>,
	[NT.LoopStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitLoopStatement(node) as Result<T, AnalysisError>,
	[NT.MemberExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitMemberExpression(node) as Result<T, AnalysisError>,
	[NT.MemberList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitMemberList(node) as Result<T, AnalysisError>,
	[NT.MemberListExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitMemberListExpression(node) as Result<T, AnalysisError>,
	[NT.Modifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitModifier(node) as Result<T, AnalysisError>,
	[NT.ModifiersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitModifiersList(node) as Result<T, AnalysisError>,
	[NT.NextStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitNextStatement(node) as Result<T, AnalysisError>,
	[NT.NumberLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitNumberLiteral(node) as Result<T, AnalysisError>,
	[NT.ObjectExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitObjectExpression(node) as Result<T, AnalysisError>,
	[NT.ObjectShape]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitObjectShape(node) as Result<T, AnalysisError>,
	[NT.Parameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitParameter(node) as Result<T, AnalysisError>,
	[NT.ParametersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitParametersList(node) as Result<T, AnalysisError>,
	[NT.Parenthesized]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitParenthesized(node) as Result<T, AnalysisError>,
	[NT.Path]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitPath(node) as Result<T, AnalysisError>,
	[NT.PostfixIfStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitPostfixIfStatement(node) as Result<T, AnalysisError>,
	[NT.PrintStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitPrintStatement(node) as Result<T, AnalysisError>,
	[NT.Program]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitProgram(node) as Result<T, AnalysisError>,
	[NT.Property]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitProperty(node) as Result<T, AnalysisError>,
	[NT.PropertyShape]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitPropertyShape(node) as Result<T, AnalysisError>,
	[NT.RangeExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitRangeExpression(node) as Result<T, AnalysisError>,
	[NT.RegularExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitRegularExpression(node) as Result<T, AnalysisError>,
	[NT.RestElement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitRestElement(node) as Result<T, AnalysisError>,
	[NT.ReturnStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitReturnStatement(node) as Result<T, AnalysisError>,
	[NT.RightArrowOperator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.SemicolonSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.noop(node) as Result<T, AnalysisError>,
	[NT.StringLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitStringLiteral(node) as Result<T, AnalysisError>,
	[NT.TernaryAlternate]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTernaryAlternate(node) as Result<T, AnalysisError>,
	[NT.TernaryCondition]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTernaryCondition(node) as Result<T, AnalysisError>,
	[NT.TernaryConsequent]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTernaryConsequent(node) as Result<T, AnalysisError>,
	[NT.TernaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTernaryExpression(node) as Result<T, AnalysisError>,
	[NT.ThisKeyword]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitThisKeyword(node) as Result<T, AnalysisError>,
	[NT.TupleExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTupleExpression(node) as Result<T, AnalysisError>,
	[NT.TupleShape]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTupleShape(node) as Result<T, AnalysisError>,
	[NT.Type]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitType(node) as Result<T, AnalysisError>,
	[NT.TypeArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTypeArgumentsList(node) as Result<T, AnalysisError>,
	[NT.TypeInstantiationExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTypeInstantiationExpression(node) as Result<T, AnalysisError>,
	[NT.TypeParameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTypeParameter(node) as Result<T, AnalysisError>,
	[NT.TypeParametersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitTypeParametersList(node) as Result<T, AnalysisError>,
	[NT.UnaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitUnaryExpression(node as UnaryExpressionNode) as Result<T, AnalysisError>,
	[NT.UseDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitUseDeclaration(node) as Result<T, AnalysisError>,
	[NT.VariableDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitVariableDeclaration(node) as Result<T, AnalysisError>,
	[NT.WhenCase]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitWhenCase(node) as Result<T, AnalysisError>,
	[NT.WhenCaseConsequent]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitWhenCaseConsequent(node) as Result<T, AnalysisError>,
	[NT.WhenCaseValues]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitWhenCaseValues(node) as Result<T, AnalysisError>,
	[NT.WhenExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T, AnalysisError> =>
		analyzer.visitWhenExpression(node) as Result<T, AnalysisError>,
};

export default visitorMap;
