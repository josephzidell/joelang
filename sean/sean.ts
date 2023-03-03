import _ from "lodash";
import { builtInTypes } from "../lexer/types";
import { regexFlags } from "../lexer/util";
import Parser from "../parser/parser";
import { AssignableNodeTypes, ExpressionNodeTypes, Node, NT, UnaryExpressionNode } from "../parser/types";
import ErrorContext from "../shared/errorContext";
import { has, hasNot } from "../shared/maybe";
import { error, ok, Result, ResultAndAMaybe } from "../shared/result";
import AnalysisError, { AnalysisErrorCode } from "./error";
import visitorMap from "./visitorMap";

export interface AST { }

export class ASTArgumentsList implements AST {
	args: Expression[] = []; // usually this is empty and thus undefined, but the parser ensures it's an array, so we mimic that here

	// factory function
	static _ (args: Expression[]): ASTArgumentsList {
		const ast = new ASTArgumentsList();
		ast.args = args;
		return ast;
	}
}

export class ASTArrayExpression implements AST { }

export class ASTBinaryExpression<L, R> implements AST {
	operator!: string;
	lhs!: L;
	rhs!: R;

	// factory function
	static _ <L, R> ({ operator, lhs, rhs }: { operator: string, lhs: L, rhs: R }): ASTBinaryExpression<L, R> {
		const ast = new ASTBinaryExpression<L, R>();
		ast.operator = operator;
		ast.lhs = lhs;
		ast.rhs = rhs;
		return ast;
	}
}

export class ASTBoolLiteral implements AST {
	value!: boolean | ASTUnaryExpression<boolean>;

	// factory function
	static _ (value: boolean | ASTUnaryExpression<boolean>): ASTBoolLiteral {
		const ast = new ASTBoolLiteral();
		ast.value = value;
		return ast;
	}
}

export class ASTCallExpression implements AST {
	callee!: ASTIdentifier | ASTMemberExpression;
	typeArgs!: ASTType[];
	args!: Expression[];

	// factory function
	static _ ({ callee, typeArgs, args }: { callee: ASTIdentifier | ASTMemberExpression, typeArgs?: ASTType[], args: Expression[] }): ASTCallExpression {
		const ast = new ASTCallExpression();
		ast.callee = callee;

		if (typeArgs) {
			ast.typeArgs = typeArgs;
		}

		ast.args = args;
		return ast;
	}
}

export class ASTFunctionDeclaration implements AST { }

export class ASTIdentifier implements AST {
	name!: string;

	// factory function
	static _ (name: string): ASTIdentifier {
		const ast = new ASTIdentifier();
		ast.name = name;
		return ast;
	}
}

export class ASTMemberExpression implements AST {
	object!: ASTIdentifier | ASTMemberExpression; // TODO add ASTCallExpression
	property!: ASTIdentifier;

	// factory function
	static _ ({ object, property }: { object: ASTIdentifier | ASTMemberExpression, property: ASTIdentifier }): ASTMemberExpression {
		const ast = new ASTMemberExpression();
		ast.object = object;
		ast.property = property;
		return ast;
	}
}

export class ASTNumberLiteral implements AST { // TODO make decimal its own type
	format!: 'int' | 'decimal';
	value!: number | ASTUnaryExpression<number>;

	// factory function
	static _ ({ format, value }: { format: 'int' | 'decimal', value: number | ASTUnaryExpression<number> }): ASTNumberLiteral {
		const ast = new ASTNumberLiteral();
		ast.format = format;
		ast.value = value;
		return ast;
	}
}

export class ASTObjectExpression implements AST { }

export class ASTPath implements AST {
	absolute!: boolean;
	path!: string;
	isDir!: boolean;

	// factory function
	static _ ({ absolute, path, isDir }: { absolute: boolean, path: string, isDir: boolean }): ASTPath {
		const ast = new ASTPath();
		ast.absolute = absolute;
		ast.path = path;
		ast.isDir = isDir;
		return ast;
	}
}

export class ASTProgram implements AST {
	expressions: AST[] = [];
}

export class ASTRegularExpression implements AST {
	pattern!: string;
	flags!: string[];

	// factory function
	static _ ({ pattern, flags }: { pattern: string, flags: string[] }): ASTRegularExpression {
		const ast = new ASTRegularExpression();
		ast.pattern = pattern;
		ast.flags = flags;
		return ast;
	}
}

export class ASTStringLiteral implements AST {
	value!: string;

	// factory function
	static _ (value: string): ASTStringLiteral {
		const ast = new ASTStringLiteral();
		ast.value = value;
		return ast;
	}
}

export class ASTTupleExpression implements AST { }


/** Begin ASTType */
abstract class ASTType implements AST { }
export class ASTTypeBuiltIn extends ASTType {
	definition!: 'built-in';
	type!: string;

	// factory function
	static _ (type: string): ASTTypeBuiltIn {
		const ast = new ASTTypeBuiltIn();
		ast.type = type;
		return ast;
	}
}
export class ASTTypeUserDefined extends ASTType {
	definition!: 'user-defined';
	type!: ASTIdentifier | ASTMemberExpression;

	// factory function
	static _ (type: ASTIdentifier | ASTMemberExpression): ASTTypeUserDefined {
		const ast = new ASTTypeUserDefined();
		ast.type = type;
		return ast;
	}
}
const ASTTypeBuiltInBool = new ASTTypeBuiltIn();
ASTTypeBuiltInBool.type = 'bool';

const ASTTypeBuiltInNumber = new ASTTypeBuiltIn();
ASTTypeBuiltInNumber.type = 'number';

const ASTTypeBuiltInPath = new ASTTypeBuiltIn();
ASTTypeBuiltInPath.type = 'path';

const ASTTypeBuiltInRegex = new ASTTypeBuiltIn();
ASTTypeBuiltInRegex.type = 'regex';

const ASTTypeBuiltInString = new ASTTypeBuiltIn();
ASTTypeBuiltInString.type = 'string';

/** End ASTType */

export class ASTTypeArgumentsList implements AST {
	typeArgs: Array<ASTIdentifier | ASTMemberExpression | ASTType> = []; // for now, but this will be expanded to include extensions, renames, and other generic types

	// factory function
	static _ (typeArgs: Array<ASTIdentifier | ASTMemberExpression | ASTType>): ASTTypeArgumentsList {
		const ast = new ASTTypeArgumentsList();
		ast.typeArgs = typeArgs;
		return ast;
	}
}

export class ASTUnaryExpression<T> implements AST {
	before!: boolean;
	operator!: string;
	operand!: T;

	// factory function
	static _ <T> ({ before, operator, operand }: { before: boolean, operator: string, operand: T }): ASTUnaryExpression<T> {
		const ast = new ASTUnaryExpression<T>();
		ast.before = before;
		ast.operator = operator;
		ast.operand = operand;
		return ast;
	}
}

export class ASTWhenExpression implements AST { }

export class ASTVariableDeclaration implements AST {
	mutable!: boolean;
	identifier!: ASTIdentifier;

	/** The type declared by the source code, if any */
	declaredType?: ASTType

	/** The type inferred from the initial value, if any */
	inferredType?: ASTType

	initialValue?: AST; // TODO should specify AssignableNodeTypes;

	// factory function
	static _ ({ mutable, identifier, declaredType, inferredType, initialValue }: {
		mutable: boolean;
		identifier: ASTIdentifier;
		declaredType?: ASTType;
		inferredType?: ASTType;
		initialValue?: AST;
	}): ASTVariableDeclaration {
		const ast = new ASTVariableDeclaration();
		ast.mutable = mutable;
		ast.identifier = identifier;

		if (declaredType) { // only set if it's not undefined
			ast.declaredType = declaredType;
		}

		if (inferredType) { // only set if it's not undefined
			ast.inferredType = inferredType;
		}

		if (initialValue) { // only set if it's not undefined
			ast.initialValue = initialValue;
		}

		return ast;
	}
}

// noop
class Skip implements AST { }

/** ASTs that can be used in UnaryExpressions and BinaryExpressions */
type Expression =
	ASTArrayExpression |
	ASTBinaryExpression<Expression, Expression> |
	ASTBoolLiteral |
	ASTCallExpression |
	ASTIdentifier |
	ASTMemberExpression |
	ASTNumberLiteral |
	ASTObjectExpression |
	ASTPath |
	ASTRegularExpression |
	ASTStringLiteral |
	ASTTupleExpression |
	ASTUnaryExpression<Expression> |
	ASTWhenExpression;

/** ASTs that can be assigned to a variable or passed as an argument */
type AssignableASTs = Expression | ASTFunctionDeclaration;

export default class SemanticAnalysis {
	currentNode: Node;
	private _parser: Parser;
	public get parser(): Parser {
		return this._parser;
	}
	private readonly cst: Node;
	private ast!: AST;
	private astPointer = this.ast;

	constructor(cst: Node, parser: Parser) {
		this.cst = cst;
		this.currentNode = cst;
		this._parser = parser;
	}

	analyze(): Result<ASTProgram> {
		// this will call child nodes recursively and build the AST
		return this.nodeToAST<ASTProgram>(this.cst);
	}

	getAST(): AST {
		return this.ast;
	}

	nodeToAST<T = AST>(node: Node): Result<T> {
		this.currentNode = node;

		return visitorMap[node.type](node, this);
	}

	visitArgumentList(node: Node): Result<ASTArgumentsList> {
		const ast = new ASTArgumentsList();

		for (const child of node.children) {
			if (ExpressionNodeTypes.includes(child?.type)) {
				const visitResult = this.nodeToAST<Expression>(child);
				switch (visitResult.outcome) {
					case 'ok':
						ast.args.push(visitResult.value);
						break;
					case 'error':
						return error(visitResult.error, this.ast);
				}
			} else if (child?.type === NT.CommaSeparator) {
				continue; // skip commas
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitBinaryExpression(node: Node): Result<ASTBinaryExpression<Expression, Expression>> {
		const ast = new ASTBinaryExpression<Expression, Expression>();
		const nodesChildren = structuredClone(node.children); // clone to avoid mutating the original node

		// first grammatical requirement: the operator
		if (!node.value) {
			return error(new AnalysisError(
				AnalysisErrorCode.OperatorExpected,
				'Operator Expected',
				node,
				this.getErrorContext(node, 1),
			), this.ast);
		}

		ast.operator = node.value;

		// second grammatical requirement: left-hand side (required)
		{
			const child = nodesChildren.shift();
			if (child?.type && ExpressionNodeTypes.includes(child.type)) {
				const visitResult = this.nodeToAST<Expression>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.lhs = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.ExpressionExpected,
					'Expression Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}
		}

		// next grammatical requirement: child (required)
		{
			const child = nodesChildren.shift();
			if (child?.type && ExpressionNodeTypes.includes(child.type)) {
				const visitResult = this.nodeToAST<Expression>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.rhs = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.ExpressionExpected,
					'Expression Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.SemicolonExpected,
				'Semicolon Expected',
				child,
				this.getErrorContext(child, 1),
			), this.ast);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitBoolLiteral(node: Node): Result<ASTBoolLiteral> {
		if (node?.type === NT.BoolLiteral && node.value) {
			const ast = new ASTBoolLiteral();

			ast.value = node.value === 'true';

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.BoolLiteralExpected, 'Bool Expected', node, this.getErrorContext(node, 1)), this.ast);
	}

	visitCallExpression(node: Node): Result<ASTCallExpression> {
		const ast = new ASTCallExpression();
		const nodesChildren = structuredClone(node.children); // clone to avoid mutating the original node

		// first grammatical requirement: the callee (required)
		{
			const child = nodesChildren.shift();
			if (child?.type && ([NT.Identifier, NT.MemberExpression] satisfies NT[]).includes(child.type as NT.Identifier | NT.MemberExpression)) {
				const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.callee = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'Identifier Expected',
					child || node,
					this.getErrorContext(child || node, child?.value?.length || 1),
				), this.ast);
			}
		}

		// next grammatical requirement: the type arguments (optional)
		{
			if (nodesChildren[0]?.type === NT.TypeArgumentsList) {
				const visitResult = this.visitTypeArgumentsList(nodesChildren.shift() as Node);
				switch (visitResult.outcome) {
					case 'ok': ast.typeArgs = visitResult.value.typeArgs; break;
					case 'error': return visitResult; break;
				}
			}
		}

		// next grammatical requirement: the arguments (optional)
		{
			if (nodesChildren[0]?.type === NT.ArgumentsList) {
				const visitResult = this.nodeToAST<ASTArgumentsList>(nodesChildren.shift() as Node);
				switch (visitResult.outcome) {
					case 'ok': ast.args = visitResult.value.args; break;
					case 'error': return visitResult; break;
				}
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.SemicolonExpected,
				'Semicolon Expected',
				child,
				this.getErrorContext(child, 1),
			), this.ast);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/**
	 * @param node Possibly undefined node to visit. While most visitees have a definite node, this one does not
	 * @returns
	 */
	visitIdentifier(node: Node | undefined): Result<ASTIdentifier> {
		if (node?.type === NT.Identifier && node.value) {
			const ast = new ASTIdentifier();

			ast.name = node.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.IdentifierExpected, 'Identifier Expected', node, this.getErrorContextUnsafe(node, 1)), this.ast);
	}

	visitMemberExpression(node: Node): Result<ASTMemberExpression> {
		const ast = new ASTMemberExpression();
		const nodesChildren = structuredClone(node.children); // clone to avoid mutating the original node

		// first grammatical requirement: parent (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type) {
				return error(new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'Identifier Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			// TODO add NT.CallExpression
			if (([NT.Identifier, NT.MemberExpression] as NT[]).includes(child.type)) {
				const visitResult = this.nodeToAST<ASTIdentifier | ASTMemberExpression>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.object = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			}
		}

		// next grammatical requirement: child (required)
		{
			const child = nodesChildren.shift();
			if (!child?.type || child.type !== NT.Identifier) {
				return error(new AnalysisError(
					AnalysisErrorCode.IdentifierExpected,
					'Identifier Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			const visitResult = this.nodeToAST<ASTIdentifier>(child);
			switch (visitResult.outcome) {
				case 'ok': ast.property = visitResult.value; break;
				case 'error': return visitResult; break;
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.SemicolonExpected,
				'Semicolon Expected',
				child,
				this.getErrorContext(child, 1),
			), this.ast);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitNumberLiteral(node: Node): Result<ASTNumberLiteral> {
		if (node?.type === NT.NumberLiteral && node.value) {
			const ast = new ASTNumberLiteral();

			if (node.value.includes('.')) {
				ast.format = 'decimal';
			} else {
				ast.format = 'int';
			}

			const commasRemoved = node.value.replace(/\,/g, '');

			// TODO test this
			if (node.value.includes('.')) {
				ast.value = parseFloat(commasRemoved);
			} else {
				ast.value = parseInt(commasRemoved);
			}

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.NumberLiteralExpected, 'Number Expected', node, this.getErrorContext(node, 1)), this.ast);
	}

	visitParenthesized(node: Node): Result<Expression> {
		const nodesChildren = structuredClone(node.children); // clone to avoid mutating the original node

		// first grammatical requirement: the expression
		{
			const child = nodesChildren.shift();
			if (!child?.type || !ExpressionNodeTypes.includes(child.type)) {
				return error(new AnalysisError(
					AnalysisErrorCode.ExpressionExpected,
					'Expression Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}

			// this is a pass-through node, aka return the child, since we don't retain parentheses
			return this.nodeToAST<Expression>(child);
		}
	}

	visitPath(node: Node): Result<ASTPath> {
		if (node?.type === NT.Path && node.value) {
			const ast = new ASTPath();

			// first, determine if the path is relative or absolute
			ast.absolute = node.value.startsWith('@');

			// next, split the path into its parts
			ast.path = node.value;

			// finally, check if there's a trailing slash
			ast.isDir = ast.path.endsWith('/');

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.ValidPathExpected, 'Valid Path Expected', node, this.getErrorContext(node, 1)), this.ast);
	}

	visitProgram(node: Node): Result<ASTProgram> {
		const validChildren = [NT.ClassDeclaration, NT.FunctionDeclaration, NT.ImportDeclaration, NT.InterfaceDeclaration, NT.SemicolonSeparator, NT.VariableDeclaration];

		const ast = new ASTProgram();

		for (const child of node.children) {
			if (validChildren.includes(child.type)) {
				const result = this.nodeToAST(child);
				switch (result.outcome) {
					case 'ok':
						if (result.value instanceof Skip) {
							continue;
						}

						ast.expressions.push(result.value);
						break;
					case 'error':
						return result;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.ExtraNodesFound,
					`A ${child.type} is not allowed directly in a ${node.type}`,
					child,
					this.getErrorContext(child, child.value?.length || 1),
				), this.ast);
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitRegularExpression(node: Node): Result<ASTRegularExpression> {
		if (node?.type === NT.RegularExpression && node.value) {
			const ast = new ASTRegularExpression();

			// separate pattern and flags
			const lastSlashStringIndex = node.value?.lastIndexOf('/');

			// first grammatical requirement: pattern (required)
			{
				const pattern = node.value.slice(0, lastSlashStringIndex + 1);

				// check if pattern is valid
				var isValid = true;
				try {
					new RegExp(pattern);
				} catch (e) {
					isValid = false;
				}

				if (!isValid) {
					return error(new AnalysisError(AnalysisErrorCode.InvalidRegularExpression, 'Invalid regular expression pattern', node, this.getErrorContext(node, node.value.length)));
				}

				ast.pattern = pattern;
			}

			// second grammatical requirement: flags (optional)
			{
				const flags = node.value.slice(lastSlashStringIndex + 1).split('');

				// check for unidentified flags. this probably isn't neessary since the lexer does this, but it's a double check
				const unidentifiedFlags = flags.filter(f => !regexFlags.includes(f));
				if (unidentifiedFlags.length > 0) {
					return error(new AnalysisError(AnalysisErrorCode.InvalidRegularExpression, 'Invalid regular expression flags', node, this.getErrorContext(node, node.value.length)));
				}

				ast.flags = flags;
			}

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.ExpressionExpected, 'Regular Expression expected', node, this.getErrorContext(node, 1)));
	}

	visitStringLiteral(node: Node): Result<ASTStringLiteral> {
		if (node?.type === NT.StringLiteral && node.value) {
			const ast = new ASTStringLiteral();

			ast.value = node.value;

			this.astPointer = this.ast = ast;

			return ok(ast);
		}

		return error(new AnalysisError(AnalysisErrorCode.BoolLiteralExpected, 'Bool Expected', node, this.getErrorContext(node, 1)), this.ast);
	}

	/**
	 * Visits a type node.
	 *
	 * Note this method differs slightly from other visitees, in that it handles
	 * the case where a type is in the form of a MemberExpression (`Foo.Bar`)
	 *
	 * @param node Possibly undefined node to visit. While most visitees have a definite node, this one does not
	 * @returns A result with an ASTType or ASTMemberExpression
	 */
	visitType(node: Node | undefined): Result<ASTType | ASTMemberExpression> {
		const errorResult = error<ASTType | ASTMemberExpression>(new AnalysisError(
			AnalysisErrorCode.TypeExpected,
			`Type Expected, received "${node?.value}"`,
			node,
			this.getErrorContextUnsafe(node, node?.value?.length || 1),
		));

		if (!node?.type) {
			return errorResult;
		}

		switch (node.type) {
			// check if it's a built-in type
			case NT.Type:
				if (node.value && builtInTypes.includes(node.value)) {
					const ast = new ASTTypeBuiltIn();

					ast.type = node.value;

					this.astPointer = this.ast = ast;

					return ok(ast);
				} else {
					return errorResult;
				}
				break;

			// otherwise it's a user-defined type, which could be an Identifier or a MemberExpression
			case NT.Identifier:
			case NT.MemberExpression:
				const visitResult = this.nodeToAST(node);
				switch (visitResult.outcome) {
					case 'ok':
						const ast = new ASTTypeUserDefined();

						// nodeToAST() uses type AST, so some casting is necessary
						ast.type = visitResult.value as ASTIdentifier | ASTMemberExpression;

						this.astPointer = this.ast = ast;

						return ok(ast);
					case 'error':
						return visitResult;
				}
				break;
		}

		// unknown
		return errorResult;
	}

	visitTypeArgumentsList(node: Node): Result<ASTTypeArgumentsList> {
		const validChildren = [NT.Type, NT.Identifier, NT.MemberExpression];

		const ast = new ASTTypeArgumentsList();

		for (const child of node.children) {
			if (validChildren.includes(child.type)) {
				const visitResult = this.visitType(child);
				switch (visitResult.outcome) {
					case 'ok':
						if (visitResult.value instanceof Skip) {
							continue;
						}

						ast.typeArgs.push(visitResult.value);
						break;
					case 'error':
						return visitResult;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.TypeExpected,
					`Type Expected, received "${child.value}"`,
					child,
					this.getErrorContext(child, child.value?.length || 1),
				));
			}
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}



	visitUnaryExpression(node: UnaryExpressionNode): Result<ASTUnaryExpression<Expression>> {
		const ast = new ASTUnaryExpression<Expression>();
		const nodesChildren = structuredClone(node.children); // clone to avoid mutating the original node

		// first grammatical requirement: is the operator before or after the operand
		ast.before = node.before;

		// second grammatical requirement: the operator
		if (!node.value) {
			return error(new AnalysisError(
				AnalysisErrorCode.OperatorExpected,
				'Operator Expected',
				node,
				this.getErrorContext(node, 1),
			), this.ast);
		}

		ast.operator = node.value;

		// third grammatical requirement: the operand
		{
			const child = nodesChildren.shift();
			if (child?.type && ExpressionNodeTypes.includes(child.type)) {
				const visitResult = this.nodeToAST<Expression>(child);
				switch (visitResult.outcome) {
					case 'ok': ast.operand = visitResult.value; break;
					case 'error': return visitResult; break;
				}
			} else {
				return error(new AnalysisError(
					AnalysisErrorCode.ExpressionExpected,
					'Expression Expected',
					child || node,
					this.getErrorContext(child || node, 1),
				), this.ast);
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.SemicolonExpected,
				'Semicolon Expected',
				child,
				this.getErrorContext(child, 1),
			), this.ast);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	visitVariableDeclaration(node: Node): Result<ASTVariableDeclaration> {
		const ast = new ASTVariableDeclaration();
		const nodesChildren = structuredClone(node.children); // clone to avoid mutating the original node

		// first grammatical requirement: mutability keyword
		if (node.value && ['const', 'let'].includes(node.value)) {
			ast.mutable = node.value === 'let';
		} else {
			return error(new AnalysisError(
				AnalysisErrorCode.KeywordExpected,
				'Expecting keyword "const" or "let"',
				node,
				this.getErrorContext(node, 1),
			), this.ast);
		}

		// next grammatical requirement: identifier (required)
		{
			const child = nodesChildren.shift();
			const visitResult = this.visitIdentifier(child);
			switch (visitResult.outcome) {
				case 'ok': ast.identifier = visitResult.value; break;
				case 'error': return visitResult; break;
			}
		}

		// if the identifer ends with a '?', that _is_ declaring the type as bool
		{
			if (ast.identifier.name.at(-1) === '?') {
				ast.declaredType = ASTTypeBuiltInBool;
			}
		}

		// next could be a Type or MemberExpression, initial value assignment, or nothing
		{
			let child = nodesChildren.shift();
			if (child?.type === NT.ColonSeparator) {
				// ignore the colon, and get next child, which then must be a type
				child = nodesChildren.shift();
				const visitResult = this.visitType(child);
				switch (visitResult.outcome) {
					case 'ok':
						// once we get here, child is definitely a defined Node
						child = child as Node;

						// the only way the declaredType can already be defined is by dint of the identifier ending with a '?'
						// in that case, check that the declared type matches

						// console.debug({
						// 	declaredType: ast.declaredType,
						// 	visitResult: visitResult.value,
						// 	ASTTypeBuiltInBool,
						// })

						if (typeof ast.declaredType !== 'undefined' && !_.isEqual(visitResult.value, ASTTypeBuiltInBool)) {
							return error(new AnalysisError(
								AnalysisErrorCode.BoolTypeExpected,
								`bool type expected since the variable name "${ast.identifier.name}" ends with a "?"`,
								child,
								this.getErrorContext(child, child.value?.length || 1),
							));

							// otherwise, set it
						} else {
							ast.declaredType = visitResult.value;
						}

						break;
					case 'error': return visitResult; break;
				}

				// get next child
				child = nodesChildren.shift();
			}

			// next could be an initial value assignment, or nothing
			if (child?.type === NT.AssignmentOperator) {
				// ignore the equals sign, and get next child, which then must be a value
				child = nodesChildren.shift();
				if (!child?.type || !AssignableNodeTypes.includes(child?.type)) {
					return error(new AnalysisError(
						AnalysisErrorCode.ExpressionExpected,
						'Expression Expected',
						child || node,
						this.getErrorContext(child || node, 1),
					), this.ast);
				}

				const visitResult = this.nodeToAST<AssignableASTs>(child);
				switch (visitResult.outcome) {
					case 'ok':
						ast.initialValue = visitResult.value;

						// now attempt to infer the type from the default value
						const inferredTypeResult = this.inferASTTypeFromASTAssignable(ast.initialValue, child);
						switch (inferredTypeResult.outcome) {
							case 'ok':
								const inferredTypeMaybe = inferredTypeResult.value;
								switch (inferredTypeMaybe.has) {
									case true:
										ast.inferredType = inferredTypeMaybe.value;

										// console.debug({
										// 	inferredType: ast.inferredType,
										// 	inferredConstructor: ast.inferredType.constructor,
										// 	declaredType: ast.declaredType,
										// 	declaredConstructor: ast.declaredType?.constructor,
										// 	match: ast.inferredType.constructor !== ast.declaredType?.constructor,
										// })
										if (typeof ast.declaredType !== 'undefined' && ast.inferredType.constructor !== ast.declaredType?.constructor) {
											return error(new AnalysisError(
												AnalysisErrorCode.TypeMismatch,
												`cannot assign a "${ast.inferredType}" to a "bool"`,
												child,
												this.getErrorContext(child, child.value?.length || 1),
											));
										}
										break;
									case false:
										// could not infer a type: ok :)
										break;
								}
								break;

							// Ruh roh
							case 'error':
								return inferredTypeResult;
								break;
						}

						break;
					case 'error': return visitResult; break;
				}
			}
		}

		// there should be no more children
		const child = nodesChildren.shift();
		if (typeof child !== 'undefined') {
			return error(new AnalysisError(
				AnalysisErrorCode.SemicolonExpected,
				'Semicolon Expected',
				child,
				this.getErrorContext(child, 1),
			), this.ast);
		}

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	noop(node: Node): Result<AST> {
		const ast = new Skip();

		this.astPointer = this.ast = ast;

		return ok(ast);
	}

	/**
	 * Main and preferred way to get an error context, this requires a node
	 *
	 * In many cases, even if we're unsure whether a child node exists, this
	 * method should still be used, and pass in `child || node`, so we have
	 * at least closely-relevant positional information.
	 */
	getErrorContext(node: Node, length: number): ErrorContext {
		return new ErrorContext(
			this.parser.lexer.code,
			node.pos.line,
			node.pos.col,
			length,
		);
	}

	/**
	 * If there is no way to guarantee a node is defined, use this backup method to get an error context
	 *
	 * This should only be used if there is absolutely no way to get a valid node,
	 * and we can't even be sure the parent node is valid.
	 *
	 * If the node is undefined, we have no positional information.
	 */
	getErrorContextUnsafe(node: Node | undefined, length: number): ErrorContext {
		return new ErrorContext(
			this.parser.lexer.code,
			node?.pos.line || 1,
			node?.pos.col || 1,
			length,
		);
	}

	private inferASTTypeFromASTAssignable(expr: AST, node: Node): ResultAndAMaybe<AST> {
		switch (expr.constructor) {
			case ASTBoolLiteral: return ok(has(ASTTypeBuiltInBool)); break;
			case ASTNumberLiteral: return ok(has(ASTTypeBuiltInNumber)); break;
			case ASTPath: return ok(has(ASTTypeBuiltInPath)); break;
			case ASTRegularExpression: return ok(has(ASTTypeBuiltInRegex)); break;
			case ASTStringLiteral: return ok(has(ASTTypeBuiltInString)); break;
			case ASTUnaryExpression:
				{
					const operator = (expr as ASTUnaryExpression<Expression>).operator;
					switch (operator) {
						case '!':
							return ok(has(ASTTypeBuiltInBool));
							break;

						case '-':
						case '++':
						case '--':
							return ok(has(ASTTypeBuiltInNumber));
							break;
						default:
							return error(new AnalysisError(AnalysisErrorCode.UnknownOperator, `Cannot infer type from unary operator "${operator}"`, node, this.getErrorContext(node, 1)));
					}
				}
				break;
			case ASTBinaryExpression:
				{
					const operator = (expr as ASTBinaryExpression<Expression, Expression>).operator;
					switch (operator) {
						case '==':
						case '!=':
						case '>':
						case '>=':
						case '<':
						case '<=':
						case '&&':
						case '||':
							return ok(has(ASTTypeBuiltInBool));
							break;
						case '+':
						case '-':
						case '*':
						case '/':
						case '%':
						case '^e':
							return ok(has(ASTTypeBuiltInNumber));
							break;
						default:
							return error(new AnalysisError(AnalysisErrorCode.UnknownOperator, `Cannot infer type from binary operator "${operator}"`, node, this.getErrorContext(node, 1)));
					}
				}
				break;
			default:
				// TODO more work needed here. Discover inferred type of MemberExpression, CallExpression
				return ok(hasNot());
		}
	}
}
