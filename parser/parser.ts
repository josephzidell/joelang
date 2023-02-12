import { Token, TokenType } from "../lexer/types";
import { LiteralTypes, Node, NodeType } from './types';
import ParserError from './error';
import { MakeIfStatementNode, MakeNode, MakeUnaryExpressionNode } from './node';
import { inspect } from 'util';
import _ from 'lodash';

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

		if (this.debug) {
			console.debug(`Getting started with ${this.tokens.length} tokens`);
		}
	}

	public lineage(node: Node | undefined, separator = '>'): string {
		if (typeof node === 'undefined') {
			return 'end';
		}

		return `${node.type}${separator}${this.lineage(node.parent, separator)}`;
	}

	public parse(): Node {
		// node types that would come before a minus `-` symbol indicating it's a subtraction operator, rather than a unary operator
		const nodeTypesPrecedingArithmeticOperator: NodeType[] = ['NumberLiteral', 'Identifier'];

		// node types that when faced with a semicolon, will be ended
		const nodeTypesThatASemicolonEnds: NodeType[] = [
			'ArrayExpression',
			'BinaryExpression',
			'FunctionDeclaration', // for abstract functions
			'FunctionReturns', // for abstract functions
			'IfStatement',
			'MemberExpression',
			'PrintStatement',
			'RangeExpression',
			'RegularExpression',
			'ReturnStatement',
			'UnaryExpression',
			'VariableDeclaration',
			'WhenExpression',
		];

		const nodeTypesThatAllowAPostfixIf: NodeType[] = [
			'ArrayExpression',
			'Property',
		];

		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];

			if (this.debug) {
				console.debug(`Found token type "${token.type}" with value "${token.value}"`);
			}

			if (token.type === 'paren_open') {
				const prev = this.prev();
				switch (prev?.type) {
					// if previous is an Identifier, then this is either a CallExpression or FunctionDeclaration
					case 'Identifier':
						if (this.currentRoot.type === 'FunctionDeclaration') {
							this.beginExpressionWith(MakeNode('ParametersList', token, this.currentRoot, true));
						} else {
							this.beginExpressionWithAdoptingPreviousNode(MakeNode('CallExpression', token, this.currentRoot, true));
							this.beginExpressionWith(MakeNode('ArgumentsList', token, this.currentRoot, true));
						}
						break;
					case 'TypeArgumentsList':
						const twoBack = this.prev(2);

						if (twoBack?.type === 'Identifier' || twoBack?.type === 'MemberExpression') {
							// we're in a CallExpression after the GenericTypesList
							const callExpressionNode = MakeNode('CallExpression', token, this.currentRoot, true);
							this.adoptNode(this.currentRoot, twoBack, callExpressionNode);
							this.adoptNode(this.currentRoot, prev, callExpressionNode);
							this.beginExpressionWith(callExpressionNode);
						}

						// begin the ArgumentsList
						this.beginExpressionWith(MakeNode('ArgumentsList', token, this.currentRoot, true));

						break;
					case 'TypeParametersList':
						if (this.currentRoot.type === 'FunctionDeclaration') {
							// we're in a FunctionDeclaration after the GenericTypesList
							this.beginExpressionWith(MakeNode('ParametersList', token, this.currentRoot, true));
						}
						break;
					case 'MemberExpression':
						this.beginExpressionWithAdoptingPreviousNode(MakeNode('CallExpression', token, this.currentRoot, true));
						this.beginExpressionWith(MakeNode('ArgumentsList', token, this.currentRoot, true));
						break;
					default:
						this.beginExpressionWith(MakeNode('Parenthesized', token, this.currentRoot, true));
						break;
				}
			} else if (token.type === 'paren_close') {
				// check if we're in a BinaryExpression, if so, it's finished
				// eg `while (foo != true) {}`
				this.endExpressionIfIn('BinaryExpression');

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				// eg `!foo()`
				this.endExpressionIfIn('UnaryExpression');

				// end the Parenthesized
				this.endExpression();

				// check if we're in a CallExpression, if so, it's also finished
				this.endExpressionIfIn('CallExpression');

				// check if we're in a ParametersList, if so, it's also finished
				this.endExpressionIfIn('ParametersList');

				// ... and then, check if currentRoot is a UnaryExpression, if so, it's also finished
				// eg `(x * -2)`
				this.endExpressionIfIn('UnaryExpression');
			} else if (token.type === 'brace_open') {
				this.endExpressionIfIn('BinaryExpression');
				this.endExpressionIfIn('FunctionReturns');
				this.endExpressionIfIn('ClassExtensionsList');
				this.endExpressionIfIn('ClassImplementsList');
				this.endExpressionIfIn('InterfaceExtensionsList');
				this.endExpressionIfIn('UnaryExpression');

				// if in `for let i = 0; i < 10; i++ {}`, we need to end the UnaryExpression of i++
				if (this.currentRoot.parent?.type === 'ForStatement') {
					this.endExpression(); // end the UnaryExpression
				}

				// this could be a BlockStatement or an ObjectExpression
				const prevType = this.prev()?.type;
				if (prevType === 'AssignmentOperator' || this.currentRoot.type === 'ArgumentsList' || this.currentRoot.type === 'TypeArgumentsList') {
					if (this.debug) {
						console.debug('Beginning an ObjectExpression');
					}

					this.beginExpressionWith(MakeNode('ObjectExpression', token, this.currentRoot, true));
				} else {
					if (this.debug) {
						console.debug('Beginning a BlockStatement');
					}

					this.beginExpressionWith(MakeNode('BlockStatement', token, this.currentRoot, true));
				}
			} else if (token.type === 'brace_close') {
				this.endExpression();

				this.endExpressionIfIn('FunctionDeclaration');
				this.endExpressionIfIn('ClassDeclaration');
				this.endExpressionIfIn('InterfaceDeclaration');
				this.endExpressionIfIn('ObjectExpression');
				this.endExpressionIfIn('WhileStatement');
			} else if (token.type === 'bracket_open') {
				const isNextABracketClose = this.nextToken(i, 1)?.type === 'bracket_close';
				const prev = this.prev();

				if (isNextABracketClose && (prev?.type === 'ArrayType' || prev?.type === 'Identifier' || prev?.type === 'Type')) { // TODO or member chain
					// we have an array type
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('ArrayType', token, this.currentRoot, true));
				} else if (prev?.type === 'Identifier') {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('MemberExpression', token, this.currentRoot, true));
					this.beginExpressionWith(MakeNode('MembersList', token, this.currentRoot, true));
				} else {
					this.beginExpressionWith(MakeNode('ArrayExpression', token, this.currentRoot, true));
				}
			} else if (token.type === 'bracket_close') {
				this.endExpressionIfIn('IfStatement');
				this.endExpression(); // ArrayExpression, ArrayType or MemberList
				this.endExpressionIfIn('MemberExpression');
			} else if (token.type === 'bool') {
				this.addNode(MakeNode('BoolLiteral', token, this.currentRoot));
			} else if (token.type === 'nil') {
				this.addNode(MakeNode('Nil', token, this.currentRoot));
			} else if (token.type === 'number') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				if (this.debug) {
					console.debug(`Creating a NumberLiteral Node in ${this.lineage(this.currentRoot)} for "${token.value}"`);
				}

				this.addNode(MakeNode('NumberLiteral', token, this.currentRoot));

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				this.endExpressionIfIn('UnaryExpression');

				// check if currentRoot is a RangeExpression, if so, it's also finished
				this.endExpressionIfIn('RangeExpression');
			} else if (token.type === 'regex') {
				this.addNode(MakeNode('RegularExpression', token, this.currentRoot));
			} else if (token.type === 'string') {
				this.addNode(MakeNode('StringLiteral', token, this.currentRoot));
			} else if (token.type === 'identifier') {
				if (this.debug) {
					console.debug(`Handling identifier "${token.value}"`);
				}

				// check if we're in a ParametersList, if so, begin a Parameter
				if (this.currentRoot.type === 'ParametersList') {
					if (this.debug) {
						console.debug('Currently there is a ParametersList open; now creating a Parameter Node in it');
					}

					this.beginExpressionWith(MakeNode('Parameter', token, this.currentRoot, true));
				} else if (this.currentRoot.type === 'TypeParametersList') {
					if (this.debug) {
						console.debug('Currently there is a TypeParametersList open; now creating a TypeParameter Node in it');
					}

					this.beginExpressionWith(MakeNode('TypeParameter', token, this.currentRoot, true));
				}

				if (this.debug) {
					console.debug(`Creating an Identifier Node in ${this.currentRoot.type} for "${token.value}"`);
				}

				this.addNode(MakeNode('Identifier', token, this.currentRoot));

				// check if currentRoot is a MemberExpression, if so, it's finished
				this.endExpressionIfIn('MemberExpression');
			} else if (token.type === 'comment') {
				this.addNode(MakeNode('Comment', token, this.currentRoot));
			} else if (token.type === 'assign') {
				this.addNode(MakeNode('AssignmentOperator', token, this.currentRoot, true));
			} else if (token.type === 'plus') {
				this.endExpressionIfIn('UnaryExpression');
				this.addNode(MakeNode('AdditionOperator', token, this.currentRoot));
			} else if (token.type === 'minus') {
				if (this.currentRoot.children.length > 0 &&
					nodeTypesPrecedingArithmeticOperator.includes(this.currentRoot.children[this.currentRoot.children.length - 1].type) &&
					this.currentRoot.type !== 'BinaryExpression' && this.currentRoot.type !== 'RangeExpression' // excludes scenarios such as `3^e-2`, `3 + -2`, `1..-2`
				) {
					this.endExpressionIfIn('UnaryExpression');
					this.addNode(MakeNode('SubtractionOperator', token, this.currentRoot));
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
				this.addNode(MakeNode('MultiplicationOperator', token, this.currentRoot));
			} else if (token.type === 'forward_slash') {
				this.addNode(MakeNode('DivisionOperator', token, this.currentRoot));
			} else if (token.type === 'mod') {
				this.addNode(MakeNode('ModOperator', token, this.currentRoot));
			} else if (token.type === 'exponent') {
				this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
			} else if (token.type === 'semicolon') {
				/**
				 * this conditional is needed for situations like this
				 * ```
				 * when foo {
				 * 	1 -> {
				 * 		doThing1(); // <-- this semicolon would end the BlockStatement
				 * 		doThing2();
				 * 	}
				 * }
				 */
				if (this.currentRoot.type !== 'BlockStatement') {
					this.endExpression();
				}

				// greedy ending - end as many nodes as relevantly possible
				while (nodeTypesThatASemicolonEnds.includes(this.currentRoot.type)) {
					this.endExpression();
				}

				this.addNode(MakeNode('SemicolonSeparator', token, this.currentRoot));
			} else if (token.type === 'dot') {
				const prev = this.prev();
				if (prev?.type === 'CallExpression' ||
					prev?.type === 'Identifier' ||
					prev?.type === 'MemberExpression' ||
					(prev?.type === 'Keyword' && prev.value === 'this')
				) {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('MemberExpression', token, this.currentRoot, true));
				}
			} else if (token.type === 'dotdotdot') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				// check if we're in a ParametersList, if so, begin a Parameter
				if (this.currentRoot.type === 'ParametersList') {
					this.beginExpressionWith(MakeNode('Parameter', token, this.currentRoot, true));
				}

				this.addNode(MakeNode('RestElement', token, this.currentRoot));
			} else if (token.type === 'colon') {
				// TODO do this
				if (this.currentRoot.type === 'ObjectExpression' && this.prev()?.type === 'Identifier') {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('Property', token, this.currentRoot, true));
				} else {
					this.addNode(MakeNode('ColonSeparator', token, this.currentRoot));
				}
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
				} else if (this.currentRoot.type === 'NewExpression') {
					this.endExpression();
				} else if (this.currentRoot.type === 'Parameter' || this.currentRoot.type === 'TypeParameter') {
					this.endExpression();
				} else if (this.currentRoot.type === 'Property') {
					this.endExpression();
				}

				// postfix `if` in an array
				// this is separate from the above if/elses since this can happen _after and in addition to_ one of the above scenarios
				if (this.currentRoot.type === 'IfStatement' && this.currentRoot.parent?.type === 'ArrayExpression') {
					this.endExpression(); // end the IfStatement which _is_ the entry
				} else if (this.currentRoot.type === 'IfStatement' && this.currentRoot.parent?.type === 'Property') {
					this.endExpression(); // end the IfStatement
					this.endExpression(); // end the Property
				}

				this.addNode(MakeNode('CommaSeparator', token, this.currentRoot));
			} else if (['and', 'compare', 'equals', 'greater_than_equals', 'less_than_equals', 'not_equals', 'or'].includes(token.type)) {
				const prev = this.prev();

				// we need to go 2 levels up

				if (this.currentRoot.type === 'BinaryExpression' && ['and', 'or'].includes(token.type)) {
					// && and || have higher order precedence than equality checks
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));
				} else if (prev?.type === 'ArgumentsList' && this.currentRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));
				} else if (prev?.type === 'MembersList' && this.currentRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('BinaryExpression', token, this.currentRoot));
				} else {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
				}
			} else if (token.type === 'type') {
				this.addNode(MakeNode('Type', token, this.currentRoot));
			} else if (token.type === 'bang') {
				this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
			} else if (token.type === 'right_arrow') {
				if (this.currentRoot.type === 'WhenCaseTests') {
					this.endExpression();
					this.beginExpressionWith(MakeNode('WhenCaseConsequent', token, this.currentRoot, true));
				} else if (this.currentRoot.type === 'FunctionDeclaration') {
					this.beginExpressionWith(MakeNode('FunctionReturns', token, this.currentRoot, true));
				} else {
					this.addNode(MakeNode('RightArrowOperator', token, this.currentRoot));
				}
			} else if (token.type === 'dotdot') {
				const prev = this.prev();

				// we need to go 2 levels up
				if (this.currentRoot.type === 'BinaryExpression' || this.currentRoot.type === 'Parenthesized') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('RangeExpression', token, this.currentRoot, true));
				} else if (prev?.type === 'ArgumentsList' && this.currentRoot.type === 'CallExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('RangeExpression', token, this.currentRoot, true));
				} else if (prev?.type === 'MembersList' && this.currentRoot.type === 'MemberExpression') {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode('RangeExpression', token, this.currentRoot, true));
				} else {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('RangeExpression', token, this.currentRoot, true));
				}
			} else if (token.type === 'triangle_open') {
				/**
				 *
				 * + f foo<|T|> {} // FunctionDeclaration
				 * + a(B<|T|>); // CallExpression
				 *
				 * - class Foo<|T|> {} // ClassDeclaration
				 * - class Foo extends Bar<|T|> {} //
				 *
				 * - interface Foo<|T|> {} // InterfaceDeclaration
				 * - class Bar implements Foo<|T|> {} //
				 *
				 * const foo = f <|T|>(x: T) -> x {}; // anonymous generic FunctionDeclaration
				 * Foo<|{T: T}, T[]|>(); // generic CallExpression
				 * const foo = Foo<|{string: string}, string[]|>; // concrete function assignment to a variable
				 * let foo = [Foo <| T, U |> ()]; // Some Array with 1 CallExpression
				 * let foo = Foo <| T, U |>; // A Function Type
				 * foo(Foo <| T.S, U |>) // CallExpression with Function Type as Argument
				 * class A<|T|> {}
				 * class B extends A<|T|> {}
				 * interface A<|T|> {}
				 * class B implements A<|T|> {}
				 */

				if (this.currentRoot.type === 'FunctionDeclaration' || this.currentRoot.type === 'ClassDeclaration' || this.currentRoot.type === 'InterfaceDeclaration') {
					this.beginExpressionWith(MakeNode('TypeParametersList', token, this.currentRoot, true));
					this.beginExpressionWith(MakeNode('TypeParameter', token, this.currentRoot, true));
				} else {
					this.beginExpressionWith(MakeNode('TypeArgumentsList', token, this.currentRoot, true));
					// throw error
				}
			} else if (token.type === 'triangle_close') {
				this.endExpressionIfIn('TypeArgumentsList');
				this.endExpressionIfIn('TypeParameter');
				this.endExpressionIfIn('TypeParametersList');
			} else if (token.type === 'less_than') {
				/**
				 * < can be:
				 * - a number comparison
				 * - beginning of type information in a function or class declaration, or in a function/class call
				 * - the beginning of a tuple expression
				 */
				const prevType = this.prev()?.type;
				// console.debug({prevType, currentRoot: this.currentRoot});

				const literals: NodeType[] = ['BoolLiteral', 'NumberLiteral', 'StringLiteral'];
				const tupleExpression = {
					in: [
						'ArgumentsList',
						'ArrayExpression',
						'BlockStatement',
						'Parameter',
						'Property',
						'TupleExpression',
						'VariableDeclaration',
						'WhenCaseConsequent',
					],
					follow: {
						tokens: [{type: 'assign', value: '='}],
					},
					notFollow: {
						nodes: [
							'Identifier',
							...literals,
							'CallExpression',
							'MemberExpression',
						],
					},
				};
				const typeParametersList = {
					in: [
						'ClassDeclaration',
						'FunctionDeclaration',
						'InterfaceDeclaration',
						'TypeDeclaration',
					],
					follow: {
						nodes: ['Identifier'],
						tokens: [{type: 'keyword', value: 'f'}],
					},
				};
				const typeArgumentsList = {
					in: [
						'CallExpression',
						'ClassExtensionsList',
						'ClassImplementsList',
						'InterfaceExtensionsList',
						'NewExpression',
						'TypeDeclaration',
						'VariableDeclaration',
					],
					follow: {
						nodes: ['Identifier', 'MemberExpression'],
						tokens: [{type: 'assign', value: '='}],
					},
				};
				const lessThan = {
					follow: [
						'Identifier',
						...literals,
						'CallExpression',
						'MemberExpression',
					],
				};

				if (prevType === 'NumberLiteral' || this.nextToken(i, 1)?.type === 'number') {
					// if prev is a number, this is a comparison
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));

				} else if (prevType === 'AssignmentOperator') {
					// this is a Tuple, eg `foo = <T>`
					// TODO create Tuple Node
				} else if (prevType === 'Identifier') {
					/**
					 * Since it follows an Identifier, this is either a TypeArgumentsList, TypeParametersList, or BinaryExpression
					 *
					 * - foo = 5; foo<6; // number comparison
					 *
					 * Some exceptions:
					 * - <> // empty Tuple
					 * - foo = <T>; // tuple
					 * - foo(<T>) // tuple
					 * - [<T>] // tuple in array
					 *
					 * Foo<T; // BinaryExpression
					 * let foo = [Foo < T, U > 3]; // Bool Array with 2 BinaryExpressions
					 * let foo = [Foo < T, U > (3+4)]; // same
					 * let foo = f <|T|>()
					 * // <> // Tuple
					 * // <T> // Tuple
					 *
					 */

					// if (this.currentRoot.type === 'ArgumentsList') {
					// 	this.beginExpressionWith(MakeNode('GenericTypesList', token, this.currentRoot, true));
					// } else {
					// 	// 'less than' BinaryExpression
					// 	this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
					// }

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
				 * - end of a GenericTypesList
				 * - the end of a TupleExpression
				 */
				const prevType = this.prev()?.type;

				if (this.currentRoot.type === 'TypeArgumentsList') {
					this.endExpression();

				} else if (prevType === 'TypeParameter') {
					this.endExpression(); // end the TypeParameter
					this.endExpression(); // end the TypeParametersList
				} else if (prevType === 'NumberLiteral') {
					// if prev is a number, this is a comparison
					this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));

				} else if (prevType === 'Identifier') {
					/**
					 * if prev is an Identifier, this is complicated. Here are some examples why:
					 * - f foo<T> {} // method generic
					 * - foo = 5; foo<6; // number comparison
					 * - foo = f <T>(x: T) -> x; // anonymous method generic
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
				if (this.debug) {
					console.debug(`Handling keyword "${token.value}"`);
				}

				switch (token.value) {
					case 'abstract':
						// can either be a ClassDeclaration, FunctionDeclaration or VariableDeclaration

						// the simplest way is to start a ModifiersList,
						// then when we come across a one of those declarations, we check if this.currentRoot is a ModifiersList

						if (this.debug) {
							console.debug('Beginning a ModifiersList');
						}

						this.beginExpressionWith(MakeNode('ModifiersList', token, this.currentRoot, true));

						if (this.debug) {
							console.debug(`Creating a Modifier Node in ${this.lineage(this.currentRoot)} for "${token.value}"`);
						}

						this.addNode(MakeNode('Modifier', token, this.currentRoot));
						break;
					case 'class':
						// the ClassDeclaration may have already started with some Modifier(s)
						if (this.currentRoot.type === 'ModifiersList') {
							if (this.debug) {
								console.debug('Currently there is a ModifiersList open; now beginning ClassDeclaration and adopting the ModifiersList');
							}

							this.beginExpressionWithAdoptingCurrentRoot(MakeNode('ClassDeclaration', token, this.currentRoot, true));
						} else {
							if (this.debug) {
								console.debug('There is no ModifiersList open; now beginning a ClassDeclaration');
							}

							this.beginExpressionWith(MakeNode('ClassDeclaration', token, this.currentRoot, true));
						}
						break;
					case 'const':
					case 'let':
						// the VariableDeclaration may have already started with some Modifier(s)
						if (this.currentRoot.type === 'ModifiersList') {
							if (this.debug) {
								console.debug('Currently there is a ModifiersList open; now beginning VariableDeclaration and adopting the ModifiersList');
							}

							this.beginExpressionWithAdoptingCurrentRoot(MakeNode('VariableDeclaration', token, this.currentRoot));
						} else {
							if (this.debug) {
								console.debug('There is no ModifiersList open; now beginning a VariableDeclaration');
							}

							this.beginExpressionWith(MakeNode('VariableDeclaration', token, this.currentRoot));
						}
						break;
					case 'break':
						this.addNode(MakeNode('BreakStatement', token, this.currentRoot, true));
						break;
					case 'extends':
						if (this.currentRoot.type === 'ClassDeclaration') {
							this.beginExpressionWith(MakeNode('ClassExtensionsList', token, this.currentRoot, true));
						} else if (this.currentRoot.type === 'InterfaceDeclaration') {
							this.beginExpressionWith(MakeNode('InterfaceExtensionsList', token, this.currentRoot, true));
						} else {
							throw new ParserError('`extends` keyword is used for a Class or Interface to extend another', this.currentRoot);
						}
						break;
					case 'f':
						// the FunctionDeclaration may have already started with a Modifier
						if (this.currentRoot.type === 'ModifiersList') {
							if (this.debug) {
								console.debug('Currently there is a ModifiersList open; now beginning FunctionDeclaration and adopting the ModifiersList');
							}

							this.beginExpressionWithAdoptingCurrentRoot(MakeNode('FunctionDeclaration', token, this.currentRoot, true));
						} else {
							if (this.debug) {
								console.debug('There is no ModifiersList open; now beginning a FunctionDeclaration');
							}

							this.beginExpressionWith(MakeNode('FunctionDeclaration', token, this.currentRoot, true));
						}
						break;
					case 'for':
						this.beginExpressionWith(MakeNode('ForStatement', token, this.currentRoot, true));
						break;
					case 'if':
						// check token before, then check token after
						// works on a CallExpression as well as Literal in an ArrayExpression
						const prev = this.prev();
						if (prev?.type === 'CallExpression' || nodeTypesThatAllowAPostfixIf.includes(this.currentRoot.type)) {
							// this is after, therefore take the CallExpression, array element, or Property
							this.beginExpressionWithAdoptingPreviousNode(MakeIfStatementNode(token, false, this.currentRoot));
						} else {
							// this is before
							this.beginExpressionWith(MakeIfStatementNode(token, true, this.currentRoot));
						}
						break;
					case 'implements':
						this.endExpressionIfIn('ClassExtensionsList');

						this.beginExpressionWith(MakeNode('ClassImplementsList', token, this.currentRoot, true));
						break;
					case 'import':
						this.beginExpressionWith(MakeNode('ImportDeclaration', token, this.currentRoot, true));
						break;
					case 'interface':
						this.beginExpressionWith(MakeNode('InterfaceDeclaration', token, this.currentRoot, true));
						break;
					case 'new':
						this.beginExpressionWith(MakeNode('NewExpression', token, this.currentRoot, true));
						break;
					case 'or':
						this.beginExpressionWithAdoptingPreviousNode(MakeNode('BinaryExpression', token, this.currentRoot));
						break;
					case 'print':
						this.beginExpressionWith(MakeNode('PrintStatement', token, this.currentRoot, true));
						break;
					case 'repeat':
						this.beginExpressionWith(MakeNode('RepeatStatement', token, this.currentRoot, true));
						break;
					case 'return':
						this.beginExpressionWith(MakeNode('ReturnStatement', token, this.currentRoot, true));
						break;
					case 'when':
						this.beginExpressionWith(MakeNode('WhenExpression', token, this.currentRoot, true));
						break;
					case 'while':
						this.beginExpressionWith(MakeNode('WhileStatement', token, this.currentRoot, true));
						break;
					default:
						this.addNode(MakeNode('Keyword', token, this.currentRoot));
						break;
				}
			} else if (token.type === 'path') {
				this.addNode(MakeNode('Path', token, this.currentRoot));
			} else {
				// this should eventually turn into an error
				this.addNode(MakeNode('Unknown', token, this.currentRoot));
			}
		}

		if (this.debug) {
			console.debug(inspect(this.root, { showHidden: true, depth: null }));
		}

		return this.root;
	}

	private ifInWhenExpressionBlockStatementBeginCase(token: Token) {
		if (this.currentRoot.type === 'BlockStatement' && this.currentRoot.parent?.type === 'WhenExpression') {
			this.beginExpressionWith(MakeNode('WhenCase', token, this.currentRoot, true));
			this.beginExpressionWith(MakeNode('WhenCaseTests', token, this.currentRoot, true));
		}
	}

	/**
	 * Gets a previous node
	 *
	 * @param howMany - How many to go back? Defaults to 1
	 * @returns the previous node
	 */
	private prev(howMany = 1): Node | undefined {
		return this.currentRoot.children.at(-howMany);
	}

	/**
	 * Gets a next token
	 *
	 * @param howMany - How many to go forward? Defaults to 1
	 * @returns the next token
	 */
	private nextToken(i: number, howMany = 1): Token | undefined {
		if (i + howMany > this.tokens.length) {
			return undefined;
		}

		return this.tokens[i + howMany];
	}

	private addNode(node: Node) {
		this.currentRoot.children.push(node);
	}

	/**
	 * Begins an expression with a node
	 *
	 * @param node - To push
	 */
	private beginExpressionWith(node: Node) {
		this.addNode(node);
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
	 * @returns - newKid
	 *
	 * @throws Error if there is no previous node
	 */
	private beginExpressionWithAdoptingPreviousNode(newKid: Node): Node {
		return this.beginExpressionWithAdopting(newKid, this.prev());
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
	 * │    currentRoot    │                │    │    currentRoot    │         ^       │    └─────────┬─────────┘
	 * └────┬──────────┬───┘                │    └────┬──────────┬───┘         ^       │              │
	 *      │          │                    │         │          │             ^       │              │
	 *      │          │                    │         │          │             ^       │    ┌─────────▼─────────┐
	 *      │          │                    │         │          │             ^       │    │    currentRoot    │
	 * ┌────▼───┐  ┌───▼───┐     ┌─────┐    │    ┌────▼───┐  ┌───▼───┐      ┌──^──┐    │    └────┬──────────┬───┘
	 * │ other  │  │  prev │     │ new │    │    │ other  │  │  prev │      │ new │    │         │          │
	 * │ node   │  │  node │     │ kid │    │    │ node   │  │  node │      │ kid │    │         │          │
	 * └────────┘  └───────┘     └─────┘    │    └────────┘  └───────┘      └─────┘    │         │          │
	 *                                      │                                          │    ┌────▼───┐  ┌───▼───┐
	 *                                      │                                          │    │ other  │  │  prev │
	 *                                      │                                          │    │ node   │  │  node │
	 *                                      │                                          │    └────────┘  └───────┘
	 *
	 * This process has 4 steps:
	 * (a) Cut currentRoot from its parent
	 * (b) Attach currentRoot to newKid's children
	 * (c) Attach newKid to currentRoot's parent's children
	 * (d) Update this.currentRoot = newKid
	 *
	 * @param newKid - To begin the expression with
	 * @returns - newKid
	 *
	 * @throws Error if there is no previous node
	 */
	private beginExpressionWithAdoptingCurrentRoot(newKid: Node): Node {
		return this.beginExpressionWithAdopting(newKid, this.currentRoot);
	}

	/**
	 * Begins an expression with a node and also "adopts" a node
	 *
	 * @param newKid - Node to begin expression with and is the adopter
	 * @param adoptee - Node To adopt
	 * @returns - newKid
	 */
	private beginExpressionWithAdopting(newKid: Node, adoptee: Node | undefined): Node {
		if (typeof adoptee === 'undefined') {
			throw new ParserError('Cannot find previous node', this.currentRoot);
		}

		if (typeof adoptee === 'undefined') {
			throw new ParserError('Cannot find previous node', this.currentRoot);
		}

		if (this.debug) {
			console.debug(`Moving ${adoptee.type} to under ${newKid.type}`);
		}

		// make a reference for convenience
		const adopteesParent = adoptee.parent as Node;

		// this.currentRoot will be reassigned toward the end

		this.adoptNode(adopteesParent, adoptee, newKid);

		// (c) Attach newKid to currentRoot's parent's children
		adopteesParent.children.push(newKid);
		newKid.parent = adopteesParent;

		// (d) Update this.currentRoot = newKid
		// The currentRoot is dead (well, not really). Long live the currentRoot.
		this.currentRoot = newKid;

		if (this.debug) {
			console.debug(`Finished moving this.currentRoot; this.currentRoot is now ${this.lineage(this.currentRoot)}`);
		}

		return newKid;
	}

	/**
	 *
	 * This process has 4 steps:
	 * (a) Cut adoptee from its parent
	 * (b) Attach adoptee to adopter's children
	 *
	 * @param adopteesParent - Parent node
	 * @param childIndex - Of the child up for adoption
	 * @param adopter - The adopter
	 */
	 private adoptNode(adopteesParent: Node | undefined, adoptee: Node, adopter: Node): void {
		if (typeof adopteesParent === 'undefined') {
			throw new ParserError('Cannot find parent node', this.currentRoot);
		}

		// make a copy to avoid circular reference issues
		const copy = { ...adoptee };

		// (a) Cut currentRoot from its parent
		copy.parent = undefined;
		// adopteesParent.children.pop();
		const childIndex = adopteesParent.children.indexOf(adoptee);
		// console.debug({before: true, childIndex, children: {...adopteesParent.children}});
		adopteesParent.children.splice(childIndex, 1);
		// console.debug({after: true, children: {...adopteesParent.children}});
		// console.debug(adopteesParent.children);

		// (b) Attach currentRoot to newKid's children
		adopter.children.push(copy);
		copy.parent = adopter;
	}

	/**
	 * Runs when an expression has ended
	 */
	private endExpression() {
		if (this.debug) {
			console.debug(`Ending a ${this.lineage(this.currentRoot)}; this.currentRoot is now ${this.lineage(this.currentRoot.parent)}`);
		}

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
	private endExpressionIfIn(type: NodeType) {
		if (this.currentRoot.type === type) {
			this.endExpression();
		}
	}
}
