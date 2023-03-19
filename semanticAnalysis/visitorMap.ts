import { Node, NT, UnaryExpressionNode } from '../parser/types';
import { Result } from '../shared/result';
import SemanticAnalyzer from './semanticAnalyzer';

export type visitor = <T>(node: Node, analyzer: SemanticAnalyzer) => Result<T>;

const visitorMap: Partial<Record<NT, visitor>> = {
	[NT.ArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitArgumentList(node) as Result<T>,
	[NT.ArrayExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitArrayExpression(node) as Result<T>,
	[NT.ArrayOf]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitArrayOf(node) as Result<T>,
	[NT.AssignmentOperator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.noop(node) as Result<T>,
	[NT.AssignmentExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitAssignmentExpression(node) as Result<T>,
	[NT.BinaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitBinaryExpression(node) as Result<T>,
	[NT.BlockStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitBlockStatement(node) as Result<T>,
	[NT.BoolLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitBoolLiteral(node) as Result<T>,
	[NT.CallExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitCallExpression(node) as Result<T>,
	[NT.ClassDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitClassDeclaration(node) as Result<T>,
	[NT.ClassExtension]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitClassOrInterfaceExtendsOrImplements(node) as Result<T>,
	[NT.ClassExtensionsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitClassExtensionsList(node) as Result<T>,
	[NT.ClassImplement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitClassOrInterfaceExtendsOrImplements(node) as Result<T>,
	[NT.ClassImplementsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitClassImplementsList(node) as Result<T>,
	[NT.ColonSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.noop(node) as Result<T>,
	[NT.CommaSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.noop(node) as Result<T>,
	[NT.Comment]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.noop(node) as Result<T>,
	[NT.DoneStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitDoneStatement(node) as Result<T>,
	[NT.ElseStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitElseStatement(node) as Result<T>,
	[NT.ForStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitForStatement(node) as Result<T>,
	[NT.FunctionDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitFunctionDeclaration(node) as Result<T>,
	[NT.FunctionReturns]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitFunctionReturns(node) as Result<T>,
	[NT.FunctionSignature]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitFunctionSignature(node) as Result<T>,
	[NT.Identifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitIdentifier(node) as Result<T>,
	[NT.IfStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitIfStatement(node) as Result<T>,
	[NT.ImportDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitImportDeclaration(node) as Result<T>,
	[NT.InterfaceDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitInterfaceDeclaration(node) as Result<T>,
	[NT.InterfaceExtension]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitClassOrInterfaceExtendsOrImplements(node) as Result<T>,
	[NT.InterfaceExtensionsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitInterfaceExtensionsList(node) as Result<T>,
	[NT.JoeDoc]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitJoeDoc(node) as Result<T>,
	// [NT.Keyword]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitKeyword(node) as Result<T>,
	[NT.LoopStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitLoopStatement(node) as Result<T>,
	[NT.MemberExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitMemberExpression(node) as Result<T>,
	[NT.MemberList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitMemberList(node) as Result<T>,
	[NT.MemberListExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitMemberListExpression(node) as Result<T>,
	[NT.Modifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitModifier(node) as Result<T>,
	[NT.ModifiersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitModifiersList(node) as Result<T>,
	[NT.NextStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitNextStatement(node) as Result<T>,
	[NT.NumberLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitNumberLiteral(node) as Result<T>,
	[NT.ObjectExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitObjectExpression(node) as Result<T>,
	[NT.ObjectShape]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitObjectShape(node) as Result<T>,
	[NT.Parameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitParameter(node) as Result<T>,
	[NT.ParametersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitParametersList(node) as Result<T>,
	[NT.Parenthesized]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitParenthesized(node) as Result<T>,
	[NT.Path]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitPath(node) as Result<T>,
	[NT.PostfixIfStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitPostfixIfStatement(node) as Result<T>,
	[NT.PrintStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitPrintStatement(node) as Result<T>,
	[NT.Program]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitProgram(node) as Result<T>,
	[NT.Property]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitProperty(node) as Result<T>,
	[NT.PropertyShape]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitPropertyShape(node) as Result<T>,
	[NT.RangeExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitRangeExpression(node) as Result<T>,
	[NT.RegularExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitRegularExpression(node) as Result<T>,
	[NT.RestElement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitRestElement(node) as Result<T>,
	[NT.ReturnStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitReturnStatement(node) as Result<T>,
	[NT.RightArrowOperator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.noop(node) as Result<T>,
	[NT.SemicolonSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.noop(node) as Result<T>,
	[NT.StringLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitStringLiteral(node) as Result<T>,
	[NT.TernaryAlternate]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTernaryAlternate(node) as Result<T>,
	[NT.TernaryCondition]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTernaryCondition(node) as Result<T>,
	[NT.TernaryConsequent]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTernaryConsequent(node) as Result<T>,
	[NT.TernaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTernaryExpression(node) as Result<T>,
	[NT.ThisKeyword]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitThisKeyword(node) as Result<T>,
	[NT.TupleExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTupleExpression(node) as Result<T>,
	[NT.TupleShape]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTupleShape(node) as Result<T>,
	[NT.Type]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitType(node) as Result<T>,
	[NT.TypeArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTypeArgumentsList(node) as Result<T>,
	[NT.TypeInstantiationExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTypeInstantiationExpression(node) as Result<T>,
	[NT.TypeParameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTypeParameter(node) as Result<T>,
	[NT.TypeParametersList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitTypeParametersList(node) as Result<T>,
	[NT.UnaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitUnaryExpression(node as UnaryExpressionNode) as Result<T>,
	[NT.VariableDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitVariableDeclaration(node) as Result<T>,
	[NT.WhenCase]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitWhenCase(node) as Result<T>,
	[NT.WhenCaseConsequent]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitWhenCaseConsequent(node) as Result<T>,
	[NT.WhenCaseValues]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitWhenCaseValues(node) as Result<T>,
	[NT.WhenExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> =>
		analyzer.visitWhenExpression(node) as Result<T>,
};

export default visitorMap;
