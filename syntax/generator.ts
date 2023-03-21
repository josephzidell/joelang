// import { Token, TokenType } from "../lexer/types";
// import { CST } from './types';
import SyntaxError from './error';
import { MakeSyntaxNode } from './node';
import { inspect } from 'util';
import * as Parse from '../parser/types';
import * as Syntax from './types';

export default class {
	debug = false; // if on, will output the Syntax Tree at the end

	/** Root node of the Parse Tree (aka Concrete Synax Tree or CST) */
	parseTreeRoot: Parse.Node;

	/** Current root node of the Parse Tree */
	currentParseTreeRoot: Parse.Node;

	/** Root node of the Syntax Tree (aka Abstract Syntax Tree or AST) */
	syntaxTreeRoot: Syntax.ProgramNode;

	/** Current root node of the Syntax Tree */
	currentSyntaxTreeRoot: Syntax.ProgramNode | Syntax.BaseNode;

	constructor(parseTree: Parse.Node, debug = false) {
		this.parseTreeRoot = parseTree;
		this.currentParseTreeRoot = this.parseTreeRoot;

		this.syntaxTreeRoot = {
			type: Parse.NT.Program,
			pos: {
				start: 0,
				end: 0, // this will be updated
				line: 1,
				col: 1,
			},
			children: [],
		};

		this.currentSyntaxTreeRoot = this.syntaxTreeRoot;

		this.debug = debug;
	}

	public generate (): Syntax.Node {
		const allowedChildren = this.getAllowedChildrenFor(this.currentParseTreeRoot.type);
		this.currentParseTreeRoot.children.forEach(child => {
			if (!allowedChildren.includes(child.type)) {
				throw new SyntaxError(`TBH, we were not expecting a ${child.type}. Instead we were hoping for one of these (${allowedChildren.join(', ')})`, this.syntaxTreeRoot);
			}

			if (this.currentSyntaxTreeRoot.type === Parse.NT.Program) {
				(this.currentSyntaxTreeRoot as Syntax.ProgramNode).children.push(this.convert(child));
			}
		});

		if (this.debug) {
			console.debug(inspect(this.syntaxTreeRoot, { showHidden: true, depth: null }));
		}

		return this.syntaxTreeRoot;
	}

	private getAllowedChildrenFor (node: Parse.NT) {
		const hasNoChildren: Parse.NT[] = [];

		const hasValue: Parse.NT[] = [Parse.NT.ArrayExpression, Parse.NT.BoolLiteral, Parse.NT.CallExpression, Parse.NT.Identifier, Parse.NT.NumberLiteral, Parse.NT.RegularExpression, Parse.NT.StringLiteral, Parse.NT.WhenExpression]; // TODO add Tuple, POJO

		const map: { [key in Parse.NT]: Parse.NT[] } = {
			[Parse.NT.ArgumentsList]: hasValue,
			[Parse.NT.ArrayExpression]: hasValue,
			[Parse.NT.AssignmentOperator]: hasNoChildren,
			[Parse.NT.BinaryExpression]: [Parse.NT.BoolLiteral, Parse.NT.NumberLiteral],
			[Parse.NT.BlockStatement]: [Parse.NT.CallExpression, Parse.NT.ReturnStatement, Parse.NT.VariableDeclaration, Parse.NT.WhenExpression],
			[Parse.NT.BoolLiteral]: hasNoChildren,
			[Parse.NT.CallExpression]: [Parse.NT.Identifier, Parse.NT.TypeArgumentsList, Parse.NT.ArgumentsList],
			[Parse.NT.ColonSeparator]: hasNoChildren,
			[Parse.NT.CommaSeparator]: hasNoChildren,
			[Parse.NT.Comment]: hasNoChildren,
			[Parse.NT.FunctionDeclaration]: [Parse.NT.Identifier, Parse.NT.TypeParametersList, Parse.NT.ParametersList, Parse.NT.FunctionReturns, Parse.NT.BlockStatement],
			[Parse.NT.FunctionReturns]: [Parse.NT.Identifier, Parse.NT.Type],
			[Parse.NT.TypeArgumentsList]: [Parse.NT.Identifier, Parse.NT.Type],
			[Parse.NT.Identifier]: hasNoChildren,
			[Parse.NT.ImportDeclaration]: [Parse.NT.Identifier, Parse.NT.Path],
			[Parse.NT.Keyword]: hasNoChildren,
			[Parse.NT.MemberExpression]: [Parse.NT.Identifier, Parse.NT.NumberLiteral],
			[Parse.NT.MembersList]: [Parse.NT.Identifier, Parse.NT.NumberLiteral, Parse.NT.StringLiteral],
			[Parse.NT.NumberLiteral]: hasNoChildren,
			[Parse.NT.ParametersList]: [Parse.NT.Identifier, Parse.NT.ColonSeparator, Parse.NT.Type, Parse.NT.AssignmentOperator, Parse.NT.ArrayExpression, Parse.NT.BoolLiteral, Parse.NT.NumberLiteral, Parse.NT.RegularExpression, Parse.NT.RestElement, Parse.NT.StringLiteral],
			[Parse.NT.Parenthesized]: hasNoChildren,
			[Parse.NT.Path]: hasNoChildren,
			[Parse.NT.PrintStatement]: hasValue,
			[Parse.NT.Program]: [Parse.NT.FunctionDeclaration],
			[Parse.NT.RangeExpression]: [Parse.NT.NumberLiteral, Parse.NT.CallExpression, Parse.NT.MemberExpression],
			[Parse.NT.RegularExpression]: hasNoChildren,
			[Parse.NT.RestElement]: [Parse.NT.Type],
			[Parse.NT.ReturnStatement]: hasValue,
			[Parse.NT.RightArrowOperator]: hasNoChildren,
			[Parse.NT.SemicolonSeparator]: hasNoChildren,
			[Parse.NT.StringLiteral]: hasNoChildren,
			[Parse.NT.Type]: hasNoChildren,
			[Parse.NT.UnaryExpression]: [Parse.NT.BoolLiteral, Parse.NT.NumberLiteral, Parse.NT.CallExpression, Parse.NT.MemberExpression],
			[Parse.NT.Unknown]: hasNoChildren,
			[Parse.NT.VariableDeclaration]: [Parse.NT.Identifier, Parse.NT.ColonSeparator, Parse.NT.Type, Parse.NT.AssignmentOperator, ...hasValue],
			[Parse.NT.WhenCase]: [Parse.NT.WhenCaseTests, Parse.NT.WhenCaseConsequent],
			[Parse.NT.WhenCaseConsequent]: [Parse.NT.BlockStatement, ...hasValue],
			[Parse.NT.WhenCaseTests]: [Parse.NT.BoolLiteral, Parse.NT.NumberLiteral, Parse.NT.StringLiteral, Parse.NT.RestElement],
			[Parse.NT.WhenExpression]: [Parse.NT.Identifier, Parse.NT.CallExpression, Parse.NT.MemberExpression, Parse.NT.WhenCase],
			
			// TODO
			[Parse.NT.ArrayType]: [],
			[Parse.NT.BreakStatement]: [],
			[Parse.NT.ClassDeclaration]: [],
			[Parse.NT.ClassExtensionsList]: [],
			[Parse.NT.ClassImplementsList]: [],
			[Parse.NT.ElseStatement]: [],
			[Parse.NT.ForStatement]: [],
			[Parse.NT.IfStatement]: [],
			[Parse.NT.InterfaceDeclaration]: [],
			[Parse.NT.InterfaceExtensionsList]: [],
			[Parse.NT.JoeDoc]: [],
			[Parse.NT.Loop]: [],
			[Parse.NT.Modifier]: [],
			[Parse.NT.ModifiersList]: [],
			[Parse.NT.ObjectExpression]: [],
			[Parse.NT.ObjectType]: [],
			[Parse.NT.Parameter]: [],
			[Parse.NT.Property]: [],
			[Parse.NT.RepeatStatement]: [],
			[Parse.NT.TernaryCondition]: [],
			[Parse.NT.TernaryElse]: [],
			[Parse.NT.TernaryExpression]: [],
			[Parse.NT.TernaryThen]: [],
			[Parse.NT.TupleExpression]: [],
			[Parse.NT.TupleType]: [],
			[Parse.NT.Typed]: [],
			[Parse.NT.TypeParameter]: [],
			[Parse.NT.TypeParametersList]: [],
			[Parse.NT.WhileStatement]: []
		};

		return map[node];
	}

	/**
	 * @returns the previous node
	 */
	private prev (): Parse.Node | undefined {
		return this.currentParseTreeRoot.children.at(-1);
	}

	/**
	 * Begins an expression with a node
	 *
	 * @param node - To push
	 * @param removeValue - Should the value be cleared out? Sometimes, the value is useless, and adds noise
	 */
	private beginExpressionWith(node: Parse.Node, removeValue = false) {
		if (removeValue) {
			node.value = undefined;
		}

		this.currentParseTreeRoot.children.push(node);
		this.currentParseTreeRoot = node;
	}

	/**
	 * Runs when an expression has ended
	 */
	private endExpression() {
		// capure this one's pos.end
		const nigh = this.currentParseTreeRoot.pos.end;

		// go up one level by setting the currentRoot to the currentRoot's parent
		this.currentParseTreeRoot = this.currentParseTreeRoot.parent as Parse.Node;

		// this should never happen, but it's here as a fallback
		if (typeof this.currentParseTreeRoot === 'undefined') {
			this.currentParseTreeRoot = this.parseTreeRoot;
		}

		// once up, update the currentRoot's pos.end with this one's pos.end
		this.currentParseTreeRoot.pos.end = nigh;
	}

	/**
	 * check if currentRoot is of the desired type, if so, it's finished
	 */
	private endExpressionIfIn (type: Parse.NT) {
		if (this.currentParseTreeRoot.type === type) {
			this.endExpression();
		}
	}
}
