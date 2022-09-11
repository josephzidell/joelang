import { Token, TokenType } from "../lexer/types";
// import { CST } from './types';
import ParserError from './error';
import { MakeNode } from './node';
import { inspect } from 'util';

export default class {
	tokens: Token[] = [];
	debug = false; // if on, will output the Syntax Tree at the end

	/** Root node of the Parse Tree (aka Concrete Synax Tree or CST) */
	parseTreeRoot: ParseTree.Node;

	/** Current root node of the Parse Tree */
	currentParseTreeRoot: ParseTree.Node;

	/** Root node of the Syntax Tree (aka Abstract Syntax Tree or AST) */
	syntaxTreeRoot: SyntaxTree.ProgramNode;

	/** Current root node of the Syntax Tree */
	currentSyntaxTreeRoot: SyntaxTree.ProgramNode | SyntaxTree.Node;

	constructor(tokens: Token[], debug = false) {
		this.tokens = tokens;
		this.parseTreeRoot = {
			type: 'Program',
			pos: {
				start: 0,
				end: 0, // this will be updated
				line: 1,
				col: 1,
			},
			children: [],
		};

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

	public parse (): CST.ProgramNode {
		// node types that would come before a minus `-` symbol indicating it's a subtraction operator, rather than a unary operator
		const nodeTypesPrecedingArithmeticOperator: CST.NodeType[] = ['NumberLiteral', 'Identifier'];

		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];

			if (token.type === 'paren_open') {
				// if previous is an Identifier, then this is a CallExpression
				switch (this.prev()?.type) {
					case 'Identifier':
						if (this.currentParseTreeRoot.type !== 'FunctionDefinition') {
							this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('CallExpression', token, this.currentParseTreeRoot), true);
						}

						this.beginExpressionWith(CST.MakeNode('ArgumentsList', token, this.currentParseTreeRoot), true);
						break;
					case 'GenericTypesList':
						this.beginExpressionWith(CST.MakeNode('ArgumentsList', token, this.currentParseTreeRoot), true);
						break;
					default:
						this.beginExpressionWith(CST.MakeNode('Parenthesized', token, this.currentParseTreeRoot), true);
						break;
				}
			} else if (token.type === 'paren_close') {
				this.endExpression();

				// ... and then, check if currentRoot is a unary, if so, it's also finished
				this.endExpressionIfIn('UnaryExpression');
			} else if (token.type === 'brace_open') {
				if (this.currentParseTreeRoot.type === 'FunctionReturns') {
					this.endExpression();
				}

				this.beginExpressionWith(CST.MakeNode('BlockStatement', token, this.currentParseTreeRoot), true);
			} else if (token.type === 'brace_close') {
				this.endExpression();

				if (this.currentParseTreeRoot.type === 'FunctionDefinition') {
					this.endExpression();
				}
			} else if (token.type === 'bracket_open') {
				if (this.prev()?.type === 'Identifier') {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('MemberExpression', token, this.currentParseTreeRoot), true);
					this.beginExpressionWith(CST.MakeNode('MembersList', token, this.currentParseTreeRoot), true);
				} else {
					this.beginExpressionWith(CST.MakeNode('ArrayExpression', token, this.currentParseTreeRoot), true);
				}
			} else if (token.type === 'bracket_close') {
				this.endExpression();
			} else if (token.type === 'bool') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('BoolLiteral', token, this.currentParseTreeRoot));
			} else if (token.type === 'nil') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('Nil', token, this.currentParseTreeRoot));
			} else if (token.type === 'number') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				this.currentParseTreeRoot.children.push(CST.MakeNode('NumberLiteral', token, this.currentParseTreeRoot));

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				this.endExpressionIfIn('UnaryExpression');

				// check if currentRoot is a RangeExpression, if so, it's also finished
				this.endExpressionIfIn('RangeExpression');
			} else if (token.type === 'regex') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('RegularExpression', token, this.currentParseTreeRoot));
			} else if (token.type === 'string') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('StringLiteral', token, this.currentParseTreeRoot));
			} else if (token.type === 'identifier') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('Identifier', token, this.currentParseTreeRoot));

				// check if currentRoot is a UnaryExpression, if so, it's finished
				this.endExpressionIfIn('UnaryExpression');
			} else if (token.type === 'comment') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('Comment', token, this.currentParseTreeRoot));
			} else if (token.type === 'assign') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('AssignmentOperator', token, this.currentParseTreeRoot));
			} else if (token.type === 'plus') {
				this.endExpressionIfIn('UnaryExpression');
				this.currentParseTreeRoot.children.push(CST.MakeNode('AdditionOperator', token, this.currentParseTreeRoot));
			} else if (token.type === 'minus') {
				if (this.currentParseTreeRoot.children.length > 0 && nodeTypesPrecedingArithmeticOperator.includes(this.currentParseTreeRoot.children[this.currentParseTreeRoot.children.length - 1].type)) {
					this.endExpressionIfIn('UnaryExpression');
					this.currentParseTreeRoot.children.push(CST.MakeNode('SubtractionOperator', token, this.currentParseTreeRoot));
				} else {
					// otherwise this is a unary operator
					this.beginExpressionWith(CST.MakeUnaryExpressionNode(token, true, this.currentParseTreeRoot));
				}
			} else if (token.type === 'plus_plus' || token.type === 'minus_minus') {
				// check token before, then check token after
				// works on an Identifier, and MemberExpression
				const prev = this.prev();
				if (prev?.type === 'Identifier' || prev?.type === 'MemberExpression') {
					// this is postfix
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeUnaryExpressionNode(token, false, this.currentParseTreeRoot));
				} else {
					// this is prefix
					this.beginExpressionWith(CST.MakeUnaryExpressionNode(token, true, this.currentParseTreeRoot));
				}
			} else if (token.type === 'asterisk') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('MultiplicationOperator', token, this.currentParseTreeRoot));
			} else if (token.type === 'forward_slash') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('DivisionOperator', token, this.currentParseTreeRoot));
			} else if (token.type === 'mod') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('ModOperator', token, this.currentParseTreeRoot));
			} else if (token.type === 'semicolon') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('SemicolonSeparator', token, this.currentParseTreeRoot));
				this.endExpression();

				// check if currentRoot is a CallExpression, if so, it's also finished
				this.endExpressionIfIn('CallExpression');

				// check if currentRoot is a BinaryExpression, if so, it's also finished
				this.endExpressionIfIn('BinaryExpression');
			} else if (token.type === 'dotdotdot') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				this.currentParseTreeRoot.children.push(CST.MakeNode('RestElement', token, this.currentParseTreeRoot));
			} else if (token.type === 'colon') {
				// TODO do this
				this.currentParseTreeRoot.children.push(CST.MakeNode('ColonSeparator', token, this.currentParseTreeRoot));
			} else if (token.type === 'comma') {
				if (this.currentParseTreeRoot.type === 'WhenCaseConsequent') {
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentParseTreeRoot.type === 'CallExpression' && this.currentParseTreeRoot.parent?.type === 'WhenCaseConsequent') {
					this.endExpression(); // end the CallExpression
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentParseTreeRoot.type === 'BinaryExpression') {
					this.endExpression();
				} else {
					this.currentParseTreeRoot.children.push(CST.MakeNode('CommaSeparator', token, this.currentParseTreeRoot));
				}
			} else if (['and', 'compare', 'equals', 'greater_than_equals', 'less_than_equals', 'not_equals', 'or'].includes(token.type)) {
				// we need to go 2 levels up
				if (this.prev()?.type === 'ArgumentsList' && this.currentParseTreeRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));
				} else if (this.prev()?.type === 'MembersList' && this.currentParseTreeRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));
				} else {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));
				}
			} else if (token.type === 'type') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('Type', token, this.currentParseTreeRoot));
			} else if (token.type === 'right_arrow') {
				if (this.currentParseTreeRoot.type === 'WhenCaseTests') {
					this.endExpression();
					this.beginExpressionWith(CST.MakeNode('WhenCaseConsequent', token, this.currentParseTreeRoot), true);
				} else if (this.currentParseTreeRoot.type === 'FunctionDefinition') {
					this.beginExpressionWith(CST.MakeNode('FunctionReturns', token, this.currentParseTreeRoot), true);
				} else {
					this.currentParseTreeRoot.children.push(CST.MakeNode('RightArrowOperator', token, this.currentParseTreeRoot));
				}
			} else if (token.type === 'dotdot') {
				// we need to go 2 levels up
				if (this.prev()?.type === 'ArgumentsList' && this.currentParseTreeRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('RangeExpression', token, this.currentParseTreeRoot), true);
				} else {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('RangeExpression', token, this.currentParseTreeRoot), true);
				}
			} else if (token.type === 'less_than') {
				/**
				 * < can be:
				 * - a number comparison
				 * - beginning of type information
				 * - the beginning of a tuple expression
				 */
				const prevType = this.prev()?.type;

				if (prevType === 'NumberLiteral') {
					// if prev is a number, this is a comparison
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));

				} else if (prevType === 'Identifier') {
					/**
					 * if prev is an Identifier, this is complicated. Here are some examples why:
					 * - f foo<T> {} // method generic
					 * - foo = 5; foo<6; // number comparison
					 * - foo = <T>(x: T) -> x; // anonymous method generic
					 * - foo = <T>; // tuple
					 */

					// if in method definition
					if (this.currentParseTreeRoot.type === 'FunctionDefinition') {
						this.beginExpressionWith(CST.MakeNode('GenericTypesList', token, this.currentParseTreeRoot), true);
					} else {
						// 'less than' BinaryExpression
						this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));
					}

				} else if (prevType === 'ArgumentsList' && this.currentParseTreeRoot.type === 'CallExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));

				} else if (prevType === 'MembersList' && this.currentParseTreeRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));

				} else {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));
				}

					// case 'VariableDeclaration':
			} else if (token.type === 'greater_than') {
				/**
				 * > can be:
				 * - a number comparison
				 * - end of type information
				 * - the end of a tuple expression
				 */
				const prevType = this.prev()?.type;

				if (this.currentParseTreeRoot.type === 'GenericTypesList') {
					this.endExpression();

				} else if (prevType === 'NumberLiteral') {
					// if prev is a number, this is a comparison
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));

				} else if (prevType === 'Identifier') {
					/**
					 * if prev is an Identifier, this is complicated. Here are some examples why:
					 * - f foo<T> {} // method generic
					 * - foo = 5; foo<6; // number comparison
					 * - foo = <T>(x: T) -> x; // anonymous method generic
					 * - foo = <T>; // tuple
					 */

					// 'less than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));

				} else if (prevType === 'ArgumentsList' && this.currentParseTreeRoot.type === 'CallExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));

				} else if (prevType === 'MembersList' && this.currentParseTreeRoot.type === 'MemberExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));

				} else {
					// 'greater than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));
				}

			} else if (token.type === 'keyword') {
				switch (token.value) {
					case 'const':
					case 'let':
						this.beginExpressionWith(CST.MakeNode('VariableDeclaration', token, this.currentParseTreeRoot));
						break;
					case 'f':
						this.beginExpressionWith(CST.MakeNode('FunctionDefinition', token, this.currentParseTreeRoot), true);
						break;
					case 'import':
						this.beginExpressionWith(CST.MakeNode('ImportDeclaration', token, this.currentParseTreeRoot), true);
						break;
					case 'or':
						this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentParseTreeRoot));
						break;
					case 'print':
						this.beginExpressionWith(CST.MakeNode('PrintStatement', token, this.currentParseTreeRoot), true);
						break;
					case 'return':
						this.beginExpressionWith(CST.MakeNode('ReturnStatement', token, this.currentParseTreeRoot), true);
						break;
					case 'when':
						this.beginExpressionWith(CST.MakeNode('WhenExpression', token, this.currentParseTreeRoot), true);
						break;
					default:
						this.currentParseTreeRoot.children.push(CST.MakeNode('Keyword', token, this.currentParseTreeRoot));
						break;
				}
			} else if (token.type === 'filepath') {
				this.currentParseTreeRoot.children.push(CST.MakeNode('FilePath', token, this.currentParseTreeRoot));
			} else {
				// this
				this.currentParseTreeRoot.children.push(CST.MakeNode('Unknown', token, this.currentParseTreeRoot));
			}
		}

		if (this.debug) {
			console.debug(inspect(this.parseTreeRoot, { showHidden: true, depth: null }));
		}

		return this.parseTreeRoot;
	}

	private ifInWhenExpressionBlockStatementBeginCase(token: Token) {
		if (this.currentParseTreeRoot.type === 'BlockStatement' && this.currentParseTreeRoot.parent?.type === 'WhenExpression') {
			this.beginExpressionWith(CST.MakeNode('WhenCase', token, this.currentParseTreeRoot), true);
			this.beginExpressionWith(CST.MakeNode('WhenCaseTests', token, this.currentParseTreeRoot), true);
		}
	}

	/**
	 * @returns the previous node
	 */
	private prev (): CST.Node | undefined {
		return this.currentParseTreeRoot.children.at(-1);
	}

	/**
	 * Begins an expression with a node
	 *
	 * @param node - To push
	 * @param removeValue - Should the value be cleared out? Sometimes, the value is useless, and adds noise
	 */
	private beginExpressionWith(node: CST.Node, removeValue = false) {
		if (removeValue) {
			node.value = undefined;
		}

		this.currentParseTreeRoot.children.push(node);
		this.currentParseTreeRoot = node;
	}

	/**
	 * Begins an expression with a node and also "adopts" the previous node as its first node
	 *
	 * Here's a diagram depicting what happens:
	 *
	 *                                        │
	 *        Before:                         │             After:
	 *                                        │
	 * ┌───────────────────┐                  │      ┌───────────────────┐
	 * │ ... higher up ... │                  │      │ ... higher up ... │
	 * └─────────┬─────────┘                  │      └─────────┬─────────┘
	 *           │                            │                │
	 *           │                            │                │
	 *           │                            │                │
	 * ┌─────────▼─────────┐                  │      ┌─────────▼─────────┐
	 * │    currentNode    │                  │      │    currentNode    │
	 * └────┬──────────┬───┘                  │      └────┬───────────┬──┘
	 *      │          │                      │           │           │
	 *      │          │<<<<<<<<<<<<^         │           │        ┌──▼──┐
	 *      │          │            ^         │           │        │ new │
	 * ┌────▼───┐  ┌───▼───┐     ┌──^──┐      │      ┌────▼───┐    │ kid │
	 * │ other  │  │  prev │     │ new │      │      │ other  │    └──┬──┘
	 * │ node   │  │  node │     │ kid │      │      │ node   │       │
	 * └────────┘  └───────┘     └─────┘      │      └────────┘    ┌──▼───┐
	 *                                        │                    │ prev │
	 *                                        │                    │ node │
	 *                                        │                    └──────┘
	 *                                        │
	 *
	 * @param newKid - To begin expression with
	 * @param removeValue - Should the value be cleared out? Sometimes, the value is useless, and adds noise
	 *
	 * @throws Error if there is no previous node
	 */
	 private beginExpressionWithAdoptingPreviousNode(newKid: CST.Node, removeValue = false) {
		// get nodes in currentRoot
		const nodesInCurrentRoot = this.currentParseTreeRoot.children;

		// get last node and remove
		const prev = nodesInCurrentRoot.pop();

		// if no last node, this is a parser error
		// cannot have a free floating ..
		if (typeof prev === 'undefined') {
			throw new ParserError('Cannot find previous node', this.currentParseTreeRoot);
		}

		// prev's parent becomes this
		prev.parent = newKid;

		// add to this one's nodes
		newKid.children.push(prev);

		if (removeValue) {
			newKid.value = undefined;
		}

		// add this one onto that array
		nodesInCurrentRoot.push(newKid);

		// update the currentRoot's nodes with the modified array
		this.currentParseTreeRoot.children = nodesInCurrentRoot;

		// and finally, this one is now the new currentRoot.
		// The currentRoot is dead (well, not really). Long live the currentRoot.
		this.currentParseTreeRoot = newKid;
	}

	/**
	 * Begins an expression with a node and also "adopts" this.currentRoot as its first node
	 *
	 * Here's a diaram depicting what happens:
	 *
	 *
	 *                                      │                                          │
	 *        Before:                       │          Movement:                       │           Before:
	 *                                      │                                          │
	 * ┌───────────────────┐                │    ┌───────────────────┐                 │    ┌───────────────────┐
	 * │ ... higher up ... │                │    │ ... higher up ... │                 │    │ ... higher up ... │
	 * └─────────┬─────────┘                │    └─────────┬─────────┘                 │    └─────────┬─────────┘
	 *           │                          │              │                           │              │
	 *           │                          │              │<<<<<<<<<<<<<<<<<<<^       │              │
	 *           │                          │              │                   ^       │    ┌─────────▼─────────┐
	 * ┌─────────▼─────────┐                │    ┌─────────▼─────────┐         ^       │    │      new kid      │
	 * │    currentNode    │                │    │    currentNode    │         ^       │    └─────────┬─────────┘
	 * └────┬──────────┬───┘                │    └────┬──────────┬───┘         ^       │              │
	 *      │          │                    │         │          │             ^       │              │
	 *      │          │                    │         │          │             ^       │    ┌─────────▼─────────┐
	 *      │          │                    │         │          │             ^       │    │    currentNode    │
	 * ┌────▼───┐  ┌───▼───┐     ┌─────┐    │    ┌────▼───┐  ┌───▼───┐      ┌──^──┐    │    └────┬──────────┬───┘
	 * │ other  │  │  prev │     │ new │    │    │ other  │  │  prev │      │ new │    │         │          │
	 * │ node   │  │  node │     │ kid │    │    │ node   │  │  node │      │ kid │    │         │          │
	 * └────────┘  └───────┘     └─────┘    │    └────────┘  └───────┘      └─────┘    │         │          │
	 *                                      │                                          │    ┌────▼───┐  ┌───▼───┐
	 *                                      │                                          │    │ other  │  │  prev │
	 *                                      │                                          │    │ node   │  │  node │
	 *                                      │                                          │    └────────┘  └───────┘
	 *
	 *
	 * @param newKid - To begin the expression with
	 * @param removeValue - Should the value be cleared out? Sometimes, the value is useless, and adds noise
	 *
	 * @throws Error if there is no previous node
	 */
	 private beginExpressionWithAdoptingCurrentRoot(newKid: CST.Node, removeValue = false) {
		if (removeValue) {
			newKid.value = undefined;
		}

		// get currentRoot's siblings in a variable
		const currentRootsSiblings = (this.currentParseTreeRoot.parent as CST.Node).children;

		// remove last node (a.k.a. this.currentRoot)
		const currentRoot = currentRootsSiblings.pop() as CST.Node;

		// add this one onto that array
		currentRootsSiblings.push(newKid);

		// add to this one's nodes
		newKid.children.push(currentRoot);

		// update the currentRoot's nodes with the modified array
		(this.currentParseTreeRoot.parent as CST.Node).children = currentRootsSiblings;

		// and finally, this one is now the new currentRoot.
		// The currentRoot is dead (well, not really). Long live the currentRoot.
		this.currentParseTreeRoot = newKid;
	}

	/**
	 * Runs when an expression has ended
	 */
	private endExpression() {
		// capure this one's pos.end
		const nigh = this.currentParseTreeRoot.pos.end;

		// go up one level by setting the currentRoot to the currentRoot's parent
		this.currentParseTreeRoot = this.currentParseTreeRoot.parent as CST.Node;

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
	private endExpressionIfIn (type: CST.NodeType) {
		if (this.currentParseTreeRoot.type === type) {
			this.endExpression();
		}
	}
}
