import { Node, NT, UnaryExpressionNode } from "../parser/types";
import ErrorContext from "../shared/errorContext";
import { error, Result } from "../shared/result";
import AnalysisError, { AnalysisErrorCode } from "./error";
import SemanticAnalyzer from "./semanticAnalyzer";

export type visitor = <T>(node: Node, analyzer: SemanticAnalyzer) => Result<T>;

const visitorMap: Partial<Record<NT, visitor>> = {
	[NT.ArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitArgumentList(node) as Result<T>,
	[NT.ArrayExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitArrayExpression(node) as Result<T>,
	[NT.BinaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitBinaryExpression(node) as Result<T>,
	[NT.BoolLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitBoolLiteral(node) as Result<T>,
	[NT.CallExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitCallExpression(node) as Result<T>,
	[NT.ClassDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitClassDeclaration(node) as Result<T>,
	[NT.ClassExtension]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitClassOrInterfaceExtendsOrImplements(node) as Result<T>,
	[NT.ClassImplement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitClassOrInterfaceExtendsOrImplements(node) as Result<T>,
	[NT.CommaSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.noop(node) as Result<T>,
	[NT.Comment]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.noop(node) as Result<T>,
	[NT.FunctionDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitFunctionDeclaration(node) as Result<T>,
	[NT.FunctionReturns]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitFunctionReturns(node) as Result<T>,
	[NT.FunctionType]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitFunctionType(node) as Result<T>,
	[NT.Identifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitIdentifier(node) as Result<T>,
	[NT.InstantiationExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitTypeInstantiationExpression(node) as Result<T>,
	[NT.InterfaceDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitInterfaceDeclaration(node) as Result<T>,
	[NT.InterfaceExtension]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitClassOrInterfaceExtendsOrImplements(node) as Result<T>,
	[NT.MemberExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitMemberExpression(node) as Result<T>,
	[NT.Modifier]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitModifier(node) as Result<T>,
	[NT.NumberLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitNumberLiteral(node) as Result<T>,
	[NT.Parameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitParameter(node) as Result<T>,
	[NT.Parenthesized]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitParenthesized(node) as Result<T>,
	[NT.Path]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitPath(node) as Result<T>,
	[NT.PrintStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitPrintStatement(node) as Result<T>,
	[NT.Program]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitProgram(node) as Result<T>,
	[NT.RegularExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitRegularExpression(node) as Result<T>,
	[NT.ReturnStatement]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitReturnStatement(node) as Result<T>,
	[NT.SemicolonSeparator]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.noop(node) as Result<T>,
	[NT.StringLiteral]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitStringLiteral(node) as Result<T>,
	[NT.Type]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitType(node) as Result<T>,
	[NT.TypeArgumentsList]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitTypeArgumentsList(node) as Result<T>,
	[NT.TypeParameter]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitTypeParameter(node) as Result<T>,
	[NT.UnaryExpression]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitUnaryExpression(node as UnaryExpressionNode) as Result<T>,
	[NT.VariableDeclaration]: <T>(node: Node, analyzer: SemanticAnalyzer): Result<T> => analyzer.visitVariableDeclaration(node) as Result<T>,
}

export default visitorMap;
