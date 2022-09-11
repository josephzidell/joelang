import { Token, TokenType } from "../lexer/types";
// import { CST } from './types';
import ParserError from './error';
import { MakeNode } from './node';
import { inspect } from 'util';

export default class {
	tokens: Token[] = [];
	debug = false; // if on, will output the AST at the end

	/** Root node of the Concrete Syntax Tree (CST) */
	cstRoot: CST.Node;

	/** Current root node of the Concrete Syntax Tree (CST) */
	currentCSTRoot: CST.Node;

	/** Root node of the Abstract Syntax Tree (AST) */
	astRoot: AST.ProgramNode;

	/** Current root node of the Abstract Syntax Tree (AST) */
	currentASTRoot: AST.ProgramNode | AST.Node;

	constructor(tokens: Token[], debug = false) {
		this.tokens = tokens;
		this.cstRoot = {
			type: 'Program',
			pos: {
				start: 0,
				end: 0, // this will be updated
				line: 1,
				col: 1,
			},
			children: [],
		};

		this.currentCSTRoot = this.cstRoot;

		this.astRoot = {
			type: 'Program',
			pos: {
				start: 0,
				end: 0, // this will be updated
				line: 1,
				col: 1,
			},
			children: [],
		};

		this.currentASTRoot = this.astRoot;

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
						if (this.currentCSTRoot.type !== 'FunctionDefinition') {
							this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('CallExpression', token, this.currentCSTRoot), true);
						}

						this.beginExpressionWith(CST.MakeNode('ArgumentsList', token, this.currentCSTRoot), true);
						break;
					case 'GenericTypesList':
						this.beginExpressionWith(CST.MakeNode('ArgumentsList', token, this.currentCSTRoot), true);
						break;
					default:
						this.beginExpressionWith(CST.MakeNode('Parenthesized', token, this.currentCSTRoot), true);
						break;
				}
			} else if (token.type === 'paren_close') {
				this.endExpression();

				// ... and then, check if currentRoot is a unary, if so, it's also finished
				this.endExpressionIfIn('UnaryExpression');
			} else if (token.type === 'brace_open') {
				if (this.currentCSTRoot.type === 'FunctionReturns') {
					this.endExpression();
				}

				this.beginExpressionWith(CST.MakeNode('BlockStatement', token, this.currentCSTRoot), true);
			} else if (token.type === 'brace_close') {
				this.endExpression();

				if (this.currentCSTRoot.type === 'FunctionDefinition') {
					this.endExpression();
				}
			} else if (token.type === 'bracket_open') {
				if (this.prev()?.type === 'Identifier') {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('MemberExpression', token, this.currentCSTRoot), true);
					this.beginExpressionWith(CST.MakeNode('MembersList', token, this.currentCSTRoot), true);
				} else {
					this.beginExpressionWith(CST.MakeNode('ArrayExpression', token, this.currentCSTRoot), true);
				}
			} else if (token.type === 'bracket_close') {
				this.endExpression();
			} else if (token.type === 'bool') {
				this.currentCSTRoot.children.push(CST.MakeNode('BoolLiteral', token, this.currentCSTRoot));
			} else if (token.type === 'nil') {
				this.currentCSTRoot.children.push(CST.MakeNode('Nil', token, this.currentCSTRoot));
			} else if (token.type === 'number') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				this.currentCSTRoot.children.push(CST.MakeNode('NumberLiteral', token, this.currentCSTRoot));

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				this.endExpressionIfIn('UnaryExpression');

				// check if currentRoot is a RangeExpression, if so, it's also finished
				this.endExpressionIfIn('RangeExpression');
			} else if (token.type === 'regex') {
				this.currentCSTRoot.children.push(CST.MakeNode('RegularExpression', token, this.currentCSTRoot));
			} else if (token.type === 'string') {
				this.currentCSTRoot.children.push(CST.MakeNode('StringLiteral', token, this.currentCSTRoot));
			} else if (token.type === 'identifier') {
				this.currentCSTRoot.children.push(CST.MakeNode('Identifier', token, this.currentCSTRoot));

				// check if currentRoot is a UnaryExpression, if so, it's finished
				this.endExpressionIfIn('UnaryExpression');
			} else if (token.type === 'comment') {
				this.currentCSTRoot.children.push(CST.MakeNode('Comment', token, this.currentCSTRoot));
			} else if (token.type === 'assign') {
				this.currentCSTRoot.children.push(CST.MakeNode('AssignmentOperator', token, this.currentCSTRoot));
			} else if (token.type === 'plus') {
				this.endExpressionIfIn('UnaryExpression');
				this.currentCSTRoot.children.push(CST.MakeNode('AdditionOperator', token, this.currentCSTRoot));
			} else if (token.type === 'minus') {
				if (this.currentCSTRoot.children.length > 0 && nodeTypesPrecedingArithmeticOperator.includes(this.currentCSTRoot.children[this.currentCSTRoot.children.length - 1].type)) {
					this.endExpressionIfIn('UnaryExpression');
					this.currentCSTRoot.children.push(CST.MakeNode('SubtractionOperator', token, this.currentCSTRoot));
				} else {
					// otherwise this is a unary operator
					this.beginExpressionWith(CST.MakeUnaryExpressionNode(token, true, this.currentCSTRoot));
				}
			} else if (token.type === 'plus_plus' || token.type === 'minus_minus') {
				// check token before, then check token after
				// works on an Identifier, and MemberExpression
				const prev = this.prev();
				if (prev?.type === 'Identifier' || prev?.type === 'MemberExpression') {
					// this is postfix
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeUnaryExpressionNode(token, false, this.currentCSTRoot));
				} else {
					// this is prefix
					this.beginExpressionWith(CST.MakeUnaryExpressionNode(token, true, this.currentCSTRoot));
				}
			} else if (token.type === 'asterisk') {
				this.currentCSTRoot.children.push(CST.MakeNode('MultiplicationOperator', token, this.currentCSTRoot));
			} else if (token.type === 'forward_slash') {
				this.currentCSTRoot.children.push(CST.MakeNode('DivisionOperator', token, this.currentCSTRoot));
			} else if (token.type === 'mod') {
				this.currentCSTRoot.children.push(CST.MakeNode('ModOperator', token, this.currentCSTRoot));
			} else if (token.type === 'semicolon') {
				this.currentCSTRoot.children.push(CST.MakeNode('SemicolonSeparator', token, this.currentCSTRoot));
				this.endExpression();

				// check if currentRoot is a CallExpression, if so, it's also finished
				this.endExpressionIfIn('CallExpression');

				// check if currentRoot is a BinaryExpression, if so, it's also finished
				this.endExpressionIfIn('BinaryExpression');
			} else if (token.type === 'dotdotdot') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				this.currentCSTRoot.children.push(CST.MakeNode('RestElement', token, this.currentCSTRoot));
			} else if (token.type === 'colon') {
				// TODO do this
				this.currentCSTRoot.children.push(CST.MakeNode('ColonSeparator', token, this.currentCSTRoot));
			} else if (token.type === 'comma') {
				if (this.currentCSTRoot.type === 'WhenCaseConsequent') {
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentCSTRoot.type === 'CallExpression' && this.currentCSTRoot.parent?.type === 'WhenCaseConsequent') {
					this.endExpression(); // end the CallExpression
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentCSTRoot.type === 'BinaryExpression') {
					this.endExpression();
				} else {
					this.currentCSTRoot.children.push(CST.MakeNode('CommaSeparator', token, this.currentCSTRoot));
				}
			} else if (['and', 'compare', 'equals', 'greater_than_equals', 'less_than_equals', 'not_equals', 'or'].includes(token.type)) {
				// we need to go 2 levels up
				if (this.prev()?.type === 'ArgumentsList' && this.currentCSTRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));
				} else if (this.prev()?.type === 'MembersList' && this.currentCSTRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));
				} else {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));
				}
			} else if (token.type === 'type') {
				this.currentCSTRoot.children.push(CST.MakeNode('Type', token, this.currentCSTRoot));
			} else if (token.type === 'right_arrow') {
				if (this.currentCSTRoot.type === 'WhenCaseTests') {
					this.endExpression();
					this.beginExpressionWith(CST.MakeNode('WhenCaseConsequent', token, this.currentCSTRoot), true);
				} else if (this.currentCSTRoot.type === 'FunctionDefinition') {
					this.beginExpressionWith(CST.MakeNode('FunctionReturns', token, this.currentCSTRoot), true);
				} else {
					this.currentCSTRoot.children.push(CST.MakeNode('RightArrowOperator', token, this.currentCSTRoot));
				}
			} else if (token.type === 'dotdot') {
				// we need to go 2 levels up
				if (this.prev()?.type === 'ArgumentsList' && this.currentCSTRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('RangeExpression', token, this.currentCSTRoot), true);
				} else {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('RangeExpression', token, this.currentCSTRoot), true);
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
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));

				} else if (prevType === 'Identifier') {
					/**
					 * if prev is an Identifier, this is complicated. Here are some examples why:
					 * - f foo<T> {} // method generic
					 * - foo = 5; foo<6; // number comparison
					 * - foo = <T>(x: T) -> x; // anonymous method generic
					 * - foo = <T>; // tuple
					 */

					// if in method definition
					if (this.currentCSTRoot.type === 'FunctionDefinition') {
						this.beginExpressionWith(CST.MakeNode('GenericTypesList', token, this.currentCSTRoot), true);
					} else {
						// 'less than' BinaryExpression
						this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));
					}

				} else if (prevType === 'ArgumentsList' && this.currentCSTRoot.type === 'CallExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));

				} else if (prevType === 'MembersList' && this.currentCSTRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));

				} else {
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));
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

				if (this.currentCSTRoot.type === 'GenericTypesList') {
					this.endExpression();

				} else if (prevType === 'NumberLiteral') {
					// if prev is a number, this is a comparison
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));

				} else if (prevType === 'Identifier') {
					/**
					 * if prev is an Identifier, this is complicated. Here are some examples why:
					 * - f foo<T> {} // method generic
					 * - foo = 5; foo<6; // number comparison
					 * - foo = <T>(x: T) -> x; // anonymous method generic
					 * - foo = <T>; // tuple
					 */

					// 'less than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));

				} else if (prevType === 'ArgumentsList' && this.currentCSTRoot.type === 'CallExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));

				} else if (prevType === 'MembersList' && this.currentCSTRoot.type === 'MemberExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));

				} else {
					// 'greater than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));
				}

			} else if (token.type === 'keyword') {
				switch (token.value) {
					case 'const':
					case 'let':
						this.beginExpressionWith(CST.MakeNode('VariableDeclaration', token, this.currentCSTRoot));
						break;
					case 'f':
						this.beginExpressionWith(CST.MakeNode('FunctionDefinition', token, this.currentCSTRoot), true);
						break;
					case 'import':
						this.beginExpressionWith(CST.MakeNode('ImportDeclaration', token, this.currentCSTRoot), true);
						break;
					case 'or':
						this.beginExpressionWithAdoptingPreviousNode(CST.MakeNode('BinaryExpression', token, this.currentCSTRoot));
						break;
					case 'print':
						this.beginExpressionWith(CST.MakeNode('PrintStatement', token, this.currentCSTRoot), true);
						break;
					case 'return':
						this.beginExpressionWith(CST.MakeNode('ReturnStatement', token, this.currentCSTRoot), true);
						break;
					case 'when':
						this.beginExpressionWith(CST.MakeNode('WhenExpression', token, this.currentCSTRoot), true);
						break;
					default:
						this.currentCSTRoot.children.push(CST.MakeNode('Keyword', token, this.currentCSTRoot));
						break;
				}
			} else if (token.type === 'filepath') {
				this.currentCSTRoot.children.push(CST.MakeNode('FilePath', token, this.currentCSTRoot));
			} else {
				// this
				this.currentCSTRoot.children.push(CST.MakeNode('Unknown', token, this.currentCSTRoot));
			}
		}

		if (this.debug) {
			console.debug(inspect(this.cstRoot, { showHidden: true, depth: null }));
		}

		return this.cstRoot;
	}

	private ifInWhenExpressionBlockStatementBeginCase(token: Token) {
		if (this.currentCSTRoot.type === 'BlockStatement' && this.currentCSTRoot.parent?.type === 'WhenExpression') {
			this.beginExpressionWith(CST.MakeNode('WhenCase', token, this.currentCSTRoot), true);
			this.beginExpressionWith(CST.MakeNode('WhenCaseTests', token, this.currentCSTRoot), true);
		}
	}

	/**
	 * @returns the previous node
	 */
	private prev (): CST.Node | undefined {
		return this.currentCSTRoot.children.at(-1);
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

		this.currentCSTRoot.children.push(node);
		this.currentCSTRoot = node;
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
		const nodesInCurrentRoot = this.currentCSTRoot.children;

		// get last node and remove
		const prev = nodesInCurrentRoot.pop();

		// if no last node, this is a parser error
		// cannot have a free floating ..
		if (typeof prev === 'undefined') {
			throw new ParserError('Cannot find previous node', this.currentCSTRoot);
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
		this.currentCSTRoot.children = nodesInCurrentRoot;

		// and finally, this one is now the new currentRoot.
		// The currentRoot is dead (well, not really). Long live the currentRoot.
		this.currentCSTRoot = newKid;
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
		const currentRootsSiblings = (this.currentCSTRoot.parent as CST.Node).children;

		// remove last node (a.k.a. this.currentRoot)
		const currentRoot = currentRootsSiblings.pop() as CST.Node;

		// add this one onto that array
		currentRootsSiblings.push(newKid);

		// add to this one's nodes
		newKid.children.push(currentRoot);

		// update the currentRoot's nodes with the modified array
		(this.currentCSTRoot.parent as CST.Node).children = currentRootsSiblings;

		// and finally, this one is now the new currentRoot.
		// The currentRoot is dead (well, not really). Long live the currentRoot.
		this.currentCSTRoot = newKid;
	}

	/**
	 * Runs when an expression has ended
	 */
	private endExpression() {
		// capure this one's pos.end
		const nigh = this.currentCSTRoot.pos.end;

		// go up one level by setting the currentRoot to the currentRoot's parent
		this.currentCSTRoot = this.currentCSTRoot.parent as CST.Node;

		// this should never happen, but it's here as a fallback
		if (typeof this.currentCSTRoot === 'undefined') {
			this.currentCSTRoot = this.cstRoot;
		}

		// once up, update the currentRoot's pos.end with this one's pos.end
		this.currentCSTRoot.pos.end = nigh;
	}

	/**
	 * check if currentRoot is of the desired type, if so, it's finished
	 */
	private endExpressionIfIn (type: CST.NodeType) {
		if (this.currentCSTRoot.type === type) {
			this.endExpression();
		}
	}
}
