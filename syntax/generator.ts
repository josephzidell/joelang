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
			type: 'Program',
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

			if (this.currentSyntaxTreeRoot.type === 'Program') {
				(this.currentSyntaxTreeRoot as Syntax.ProgramNode).children.push(this.convert(child));
			}
		});

		if (this.debug) {
			console.debug(inspect(this.syntaxTreeRoot, { showHidden: true, depth: null }));
		}

		return this.syntaxTreeRoot;
	}

	private getAllowedChildrenFor (node: Parse.NodeType) {
		const hasNoChildren: Parse.NodeType[] = [];

		const hasValue: Parse.NodeType[] = ['ArrayExpression', 'BoolLiteral', 'CallExpression', 'Identifier', 'NumberLiteral', 'RegularExpression', 'StringLiteral', 'WhenExpression']; // TODO add Tuple, POJO

		const map: { [key in Parse.NodeType]: Parse.NodeType[] } = {
			'AdditionOperator': hasNoChildren,
			'ArgumentsList': hasValue,
			'ArrayExpression': hasValue,
			'AssignmentOperator': hasNoChildren,
			'BinaryExpression': ['BoolLiteral', 'NumberLiteral'],
			'BlockStatement': ['CallExpression', 'ReturnStatement', 'VariableDeclaration', 'WhenExpression'], // TODO add if, loop
			'BoolLiteral': hasNoChildren,
			'CallExpression': ['Identifier', 'GenericTypesList', 'ArgumentsList'],
			'ColonSeparator': hasNoChildren,
			'CommaSeparator': hasNoChildren,
			'Comment': hasNoChildren,
			'DivisionOperator': hasNoChildren,
			'FunctionDefinition': ['Identifier', 'GenericTypesList', 'ParametersList', 'FunctionReturns', 'BlockStatement'],
			'FunctionReturns': ['Identifier', 'Type'],
			'GenericTypesList': ['Identifier', 'Type'],
			'Identifier': hasNoChildren,
			'ImportDeclaration': ['Identifier', 'Path'],
			'Keyword': hasNoChildren,
			'MemberExpression': ['Identifier', 'NumberLiteral'], // TODO make this work with symbols instead?
			'MembersList': ['Identifier', 'NumberLiteral', 'StringLiteral'],
			'ModOperator': hasNoChildren,
			'MultiplicationOperator': hasNoChildren,
			'Nil': hasNoChildren,
			'NumberLiteral': hasNoChildren,
			'ParametersList': ['Identifier', 'ColonSeparator', 'Type', 'AssignmentOperator', 'ArrayExpression', 'BoolLiteral', 'NumberLiteral', 'RegularExpression', 'RestElement', 'StringLiteral'], // TODO add Tuple, POJO
			'Parenthesized': hasNoChildren,
			'Path': hasNoChildren,
			'PrintStatement': hasValue,
			'Program': ['FunctionDefinition'],
			'RangeExpression': ['NumberLiteral', 'CallExpression', 'MemberExpression'],
			'RegularExpression': hasNoChildren,
			'RestElement': ['Type'],
			'ReturnStatement': hasValue,
			'RightArrowOperator': hasNoChildren,
			'SemicolonSeparator': hasNoChildren,
			'StringLiteral': hasNoChildren,
			'SubtractionOperator': hasNoChildren,
			'Type': hasNoChildren,
			'UnaryExpression': ['BoolLiteral', 'NumberLiteral', 'CallExpression', 'MemberExpression'],
			'Unknown': hasNoChildren, // lol
			'VariableDeclaration': ['Identifier', 'ColonSeparator', 'Type', 'AssignmentOperator', ...hasValue],
			'WhenCase': ['WhenCaseTests', 'WhenCaseConsequent'],
			'WhenCaseConsequent': ['BlockStatement', ...hasValue],
			'WhenCaseTests': ['BoolLiteral', 'NumberLiteral', 'StringLiteral', 'RestElement'],
			'WhenExpression': ['Identifier', 'CallExpression', 'MemberExpression', 'WhenCase'],
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
	private endExpressionIfIn (type: Parse.NodeType) {
		if (this.currentParseTreeRoot.type === type) {
			this.endExpression();
		}
	}
}
