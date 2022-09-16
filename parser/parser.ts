import { Token, TokenType } from "../lexer/types";
import { Node, NodeType } from './types';
import ParserError from './error';
import { MakeNode, MakeUnaryExpressionNode } from './node';
import { inspect } from 'util';

export default class {
	tokens: Token[] = [];

	/** Root node of the Concrete Syntax Tree (CST) */
	root: Node;

	/** Current root node of the Concrete Syntax Tree (CST) */
	currentRoot: Node;

	/** if on, will output the CST at the end */
	debug = false;

	constructor(tokens: Token[], debug = false) {
		this.tokens = tokens;
		this.root = {
			type: 'Program',
			pos: {
				start: 0,
				end: 0, // this will be updated
				line: 1,
				col: 1,
			},
			children: [],
		};

		this.currentRoot = this.root;

		this.debug = debug;
	}

	public parse (): Node {
		// node types that would come before a minus `-` symbol indicating it's a subtraction operator, rather than a unary operator
		const nodeTypesPrecedingArithmeticOperator: NodeType[] = ['NumberLiteral', 'Identifier'];

		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];

			if (token.type === 'paren_open') {
				// if previous is an Identifier, then this is either a CallExpression or FunctionDefinition
				switch (this.prev()?.type) {
					case 'Identifier':
						if (this.currentRoot.type === 'FunctionDefinition') {
							this.beginExpressionWith(MakeNode('ParametersList', token, this.currentRoot), true);
						} else {
							this.beginExpressionWithAdoptingPreviousNode(MakeNode('CallExpression', token, this.currentRoot), true);
							this.beginExpressionWith(MakeNode('ArgumentsList', token, this.currentRoot), true);
						}
						break;
					case 'GenericTypesList':
						if (this.currentRoot.type === 'FunctionDefinition') {
							this.beginExpressionWith(MakeNode('ParametersList', token, this.currentRoot), true);
						} else {
							this.beginExpressionWith(MakeNode('ArgumentsList', token, this.currentRoot), true);
						}
						break;
					default:
						this.beginExpressionWith(MakeNode('Parenthesized', token, this.currentRoot), true);
						break;
				}
			} else if (token.type === 'paren_close') {
				this.endExpression();

				// ... and then, check if currentRoot is a unary, if so, it's also finished
				this.endExpressionIfIn('UnaryExpression');
			} else if (token.type === 'brace_open') {
				if (this.currentRoot.type === 'FunctionReturns') {
					this.endExpression();
				}

				this.beginExpressionWith(MakeNode('BlockStatement', token, this.currentRoot), true);
			} else if (token.type === 'brace_close') {
				this.endExpression();

				if (this.currentRoot.type === 'FunctionDefinition') {
					this.endExpression();
				}
			} else if (token.type === 'bracket_open') {
				if (this.prev()?.type === 'Identifier') {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('MemberExpression', token, this.currentRoot), true);
					this.beginExpressionWith(MakeNode('MembersList', token, this.currentRoot), true);
				} else {
					this.beginExpressionWith(MakeNode('ArrayExpression', token, this.currentRoot), true);
				}
			} else if (token.type === 'bracket_close') {
				this.endExpression();
			} else if (token.type === 'bool') {
				this.currentRoot.children.push(MakeNode('BoolLiteral', token, this.currentRoot));
			} else if (token.type === 'nil') {
				this.currentRoot.children.push(MakeNode('Nil', token, this.currentRoot));
			} else if (token.type === 'number') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				this.currentRoot.children.push(MakeNode('NumberLiteral', token, this.currentRoot));

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				this.endExpressionIfIn('UnaryExpression');

				// check if currentRoot is a RangeExpression, if so, it's also finished
				this.endExpressionIfIn('RangeExpression');
			} else if (token.type === 'regex') {
				this.currentRoot.children.push(MakeNode('RegularExpression', token, this.currentRoot));
			} else if (token.type === 'string') {
				this.currentRoot.children.push(MakeNode('StringLiteral', token, this.currentRoot));
			} else if (token.type === 'identifier') {
				this.currentRoot.children.push(MakeNode('Identifier', token, this.currentRoot));

				// check if currentRoot is a UnaryExpression, if so, it's finished
				this.endExpressionIfIn('UnaryExpression');
			} else if (token.type === 'comment') {
				this.currentRoot.children.push(MakeNode('Comment', token, this.currentRoot));
			} else if (token.type === 'assign') {
				this.currentRoot.children.push(MakeNode('AssignmentOperator', token, this.currentRoot));
			} else if (token.type === 'plus') {
				this.endExpressionIfIn('UnaryExpression');
				this.currentRoot.children.push(MakeNode('AdditionOperator', token, this.currentRoot));
			} else if (token.type === 'minus') {
				if (this.currentRoot.children.length > 0 && nodeTypesPrecedingArithmeticOperator.includes(this.currentRoot.children[this.currentRoot.children.length - 1].type)) {
					this.endExpressionIfIn('UnaryExpression');
					this.currentRoot.children.push(MakeNode('SubtractionOperator', token, this.currentRoot));
				} else {
					// otherwise this is a unary operator
					this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
				}
			} else if (token.type === 'plus_plus' || token.type === 'minus_minus') {
				// check token before, then check token after
				// works on an Identifier, and MemberExpression
				const prev = this.prev();
				if (prev?.type === 'Identifier' || prev?.type === 'MemberExpression') {
					// this is postfix
					this.beginExpressionWithAdoptingPreviousNode(MakeUnaryExpressionNode(token, false, this.currentRoot));
				} else {
					// this is prefix
					this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
				}
			} else if (token.type === 'asterisk') {
				this.currentRoot.children.push(MakeNode('MultiplicationOperator', token, this.currentRoot));
			} else if (token.type === 'forward_slash') {
				this.currentRoot.children.push(MakeNode('DivisionOperator', token, this.currentRoot));
			} else if (token.type === 'mod') {
				this.currentRoot.children.push(MakeNode('ModOperator', token, this.currentRoot));
			} else if (token.type === 'semicolon') {
				this.currentRoot.children.push(MakeNode('SemicolonSeparator', token, this.currentRoot));
				this.endExpression();

				// check if currentRoot is a CallExpression, if so, it's also finished
				this.endExpressionIfIn('CallExpression');

				// check if currentRoot is a BinaryExpression, if so, it's also finished
				this.endExpressionIfIn('BinaryExpression');
			} else if (token.type === 'dotdotdot') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				this.currentRoot.children.push(MakeNode('RestElement', token, this.currentRoot));
			} else if (token.type === 'colon') {
				// TODO do this
				this.currentRoot.children.push(MakeNode('ColonSeparator', token, this.currentRoot));
			} else if (token.type === 'comma') {
				if (this.currentRoot.type === 'WhenCaseConsequent') {
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentRoot.type === 'CallExpression' && this.currentRoot.parent?.type === 'WhenCaseConsequent') {
					this.endExpression(); // end the CallExpression
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentRoot.type === 'BinaryExpression') {
					this.endExpression();
				} else {
					this.currentRoot.children.push(MakeNode('CommaSeparator', token, this.currentRoot));
				}
			} else if (['and', 'compare', 'equals', 'greater_than_equals', 'less_than_equals', 'not_equals', 'or'].includes(token.type)) {
				// we need to go 2 levels up
				if (this.prev()?.type === 'ArgumentsList' && this.currentRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));
				} else if (this.prev()?.type === 'MembersList' && this.currentRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));
				} else {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
				}
			} else if (token.type === 'type') {
				this.currentRoot.children.push(MakeNode('Type', token, this.currentRoot));
			} else if (token.type === 'right_arrow') {
				if (this.currentRoot.type === 'WhenCaseTests') {
					this.endExpression();
					this.beginExpressionWith(MakeNode('WhenCaseConsequent', token, this.currentRoot), true);
				} else if (this.currentRoot.type === 'FunctionDefinition') {
					this.beginExpressionWith(MakeNode('FunctionReturns', token, this.currentRoot), true);
				} else {
					this.currentRoot.children.push(MakeNode('RightArrowOperator', token, this.currentRoot));
				}
			} else if (token.type === 'dotdot') {
				// we need to go 2 levels up
				if (this.prev()?.type === 'ArgumentsList' && this.currentRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('RangeExpression', token, this.currentRoot), true);
				} else {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('RangeExpression', token, this.currentRoot), true);
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
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));

				} else if (prevType === 'Identifier') {
					/**
					 * if prev is an Identifier, this is complicated. Here are some examples why:
					 * - f foo<T> {} // method generic
					 * - foo = 5; foo<6; // number comparison
					 * - foo = <T>(x: T) -> x; // anonymous method generic
					 * - foo = <T>; // tuple
					 */

					// if in method definition
					if (this.currentRoot.type === 'FunctionDefinition') {
						this.beginExpressionWith(MakeNode('GenericTypesList', token, this.currentRoot), true);
					} else {
						// 'less than' BinaryExpression
						this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
					}

				} else if (prevType === 'ArgumentsList' && this.currentRoot.type === 'CallExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));

				} else if (prevType === 'MembersList' && this.currentRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));

				} else {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
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

				if (this.currentRoot.type === 'GenericTypesList') {
					this.endExpression();

				} else if (prevType === 'NumberLiteral') {
					// if prev is a number, this is a comparison
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));

				} else if (prevType === 'Identifier') {
					/**
					 * if prev is an Identifier, this is complicated. Here are some examples why:
					 * - f foo<T> {} // method generic
					 * - foo = 5; foo<6; // number comparison
					 * - foo = <T>(x: T) -> x; // anonymous method generic
					 * - foo = <T>; // tuple
					 */

					// 'less than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));

				} else if (prevType === 'ArgumentsList' && this.currentRoot.type === 'CallExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));

				} else if (prevType === 'MembersList' && this.currentRoot.type === 'MemberExpression') {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));

				} else {
					// 'greater than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
				}

			} else if (token.type === 'keyword') {
				switch (token.value) {
					case 'const':
					case 'let':
						this.beginExpressionWith(MakeNode('VariableDeclaration', token, this.currentRoot));
						break;
					case 'f':
						this.beginExpressionWith(MakeNode('FunctionDefinition', token, this.currentRoot), true);
						break;
					case 'import':
						this.beginExpressionWith(MakeNode('ImportDeclaration', token, this.currentRoot), true);
						break;
					case 'or':
						this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
						break;
					case 'print':
						this.beginExpressionWith(MakeNode('PrintStatement', token, this.currentRoot), true);
						break;
					case 'return':
						this.beginExpressionWith(MakeNode('ReturnStatement', token, this.currentRoot), true);
						break;
					case 'when':
						this.beginExpressionWith(MakeNode('WhenExpression', token, this.currentRoot), true);
						break;
					default:
						this.currentRoot.children.push(MakeNode('Keyword', token, this.currentRoot));
						break;
				}
			} else if (token.type === 'path') {
				this.currentRoot.children.push(MakeNode('Path', token, this.currentRoot));
			} else {
				// this
				this.currentRoot.children.push(MakeNode('Unknown', token, this.currentRoot));
			}
		}

		if (this.debug) {
			console.debug(inspect(this.root, { showHidden: true, depth: null }));
		}

		return this.root;
	}

	private ifInWhenExpressionBlockStatementBeginCase(token: Token) {
		if (this.currentRoot.type === 'BlockStatement' && this.currentRoot.parent?.type === 'WhenExpression') {
			this.beginExpressionWith(MakeNode('WhenCase', token, this.currentRoot), true);
			this.beginExpressionWith(MakeNode('WhenCaseTests', token, this.currentRoot), true);
		}
	}

	/**
	 * @returns the previous node
	 */
	private prev (): Node | undefined {
		return this.currentRoot.children.at(-1);
	}

	/**
	 * Begins an expression with a node
	 *
	 * @param node - To push
	 * @param removeValue - Should the value be cleared out? Sometimes, the value is useless, and adds noise
	 */
	private beginExpressionWith(node: Node, removeValue = false) {
		if (removeValue) {
			node.value = undefined;
		}

		this.currentRoot.children.push(node);
		this.currentRoot = node;
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
	 private beginExpressionWithAdoptingPreviousNode(newKid: Node, removeValue = false) {
		// get nodes in currentRoot
		const nodesInCurrentRoot = this.currentRoot.children;

		// get last node and remove
		const prev = nodesInCurrentRoot.pop();

		// if no last node, this is a parser error
		// cannot have a free floating ..
		if (typeof prev === 'undefined') {
			throw new ParserError('Cannot find previous node', this.currentRoot);
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
		this.currentRoot.children = nodesInCurrentRoot;

		// and finally, this one is now the new currentRoot.
		// The currentRoot is dead (well, not really). Long live the currentRoot.
		this.currentRoot = newKid;
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
	 private beginExpressionWithAdoptingCurrentRoot(newKid: Node, removeValue = false) {
		if (removeValue) {
			newKid.value = undefined;
		}

		// get currentRoot's siblings in a variable
		const currentRootsSiblings = (this.currentRoot.parent as Node).children;

		// remove last node (a.k.a. this.currentRoot)
		const currentRoot = currentRootsSiblings.pop() as Node;

		// add this one onto that array
		currentRootsSiblings.push(newKid);

		// add to this one's nodes
		newKid.children.push(currentRoot);

		// update the currentRoot's nodes with the modified array
		(this.currentRoot.parent as Node).children = currentRootsSiblings;

		// and finally, this one is now the new currentRoot.
		// The currentRoot is dead (well, not really). Long live the currentRoot.
		this.currentRoot = newKid;
	}

	/**
	 * Runs when an expression has ended
	 */
	private endExpression() {
		// capure this one's pos.end
		const nigh = this.currentRoot.pos.end;

		// go up one level by setting the currentRoot to the currentRoot's parent
		this.currentRoot = this.currentRoot.parent as Node;

		// this should never happen, but it's here as a fallback
		if (typeof this.currentRoot === 'undefined') {
			this.currentRoot = this.root;
		}

		// once up, update the currentRoot's pos.end with this one's pos.end
		this.currentRoot.pos.end = nigh;
	}

	/**
	 * check if currentRoot is of the desired type, if so, it's finished
	 */
	private endExpressionIfIn (type: NodeType) {
		if (this.currentRoot.type === type) {
			this.endExpression();
		}
	}
}
