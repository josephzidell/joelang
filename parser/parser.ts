import { Token, TokenType, tokenTypesUsingSymbols } from "../lexer/types";
import { LiteralTypes, Node, NT } from './types';
import ParserError from './error';
import { MakeIfStatementNode, MakeNode, MakeUnaryExpressionNode } from './node';
import { inspect } from 'util';
import _ from 'lodash';
import Lexer from "../lexer/lexer";

export default class Parser {
	prevToken: Token | undefined;

	currentToken: Token | undefined;

	/** Root node of the Concrete Syntax Tree (CST) */
	root: Node;

	/** Current root node of the Concrete Syntax Tree (CST) */
	currentRoot: Node;

	/** if on, will output the CST at the end */
	debug = false;

	// node types that would come before a minus `-` symbol indicating it's a subtraction operator, rather than a unary operator
	nodeTypesPrecedingArithmeticOperator: NT[] = [NT.NumberLiteral, NT.Identifier];

	// node types that when faced with a semicolon, will be ended
	nodeTypesThatASemicolonEnds: NT[] = [
		NT.ArrayExpression,
		NT.BinaryExpression,
		NT.FunctionDeclaration, // for abstract functions
		NT.FunctionReturns, // for abstract functions
		NT.IfStatement,
		NT.MemberExpression,
		NT.ObjectExpression,
		NT.PrintStatement,
		NT.Property,
		NT.RangeExpression,
		NT.RegularExpression,
		NT.ReturnStatement,
		NT.TernaryElse,
		NT.TernaryExpression,
		NT.UnaryExpression,
		NT.VariableDeclaration,
		NT.WhenExpression,
	];

	nodeTypesThatAllowAPostfixIf: NT[] = [
		NT.ArrayExpression,
		NT.Property,
	];

	lexer: Lexer;
	
	constructor(code: string, debug = false) {
		this.lexer = new Lexer(code);

		this.root = {
			type: NT.Program,
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
			console.debug(`Getting started parsing`);
		}
	}

	public lineage(node: Node | undefined, separator = '>'): string {
		if (typeof node === 'undefined') {
			return 'end';
		}

		return `${node.type}${separator}${this.lineage(node.parent, separator)}`;
	}

	public parse(): Node {
		do {
			this.currentToken = this.getNextToken();
			if (typeof this.currentToken === 'undefined') {
				break;
			}

			const token = this.currentToken;

			if (this.debug) {
				console.debug(`Found token type "${token.type}" with value "${token.value}"`);
			}

			if (token.type === 'paren_open') {
				const prev = this.prev();
				switch (prev?.type) {
					// if previous is an Identifier or Typed, then this is either a CallExpression or FunctionDeclaration
					case NT.Identifier:
					case NT.Typed:
						if (this.currentRoot.type === NT.FunctionDeclaration) {
							this.beginExpressionWith(MakeNode(NT.ParametersList, token, this.currentRoot, true));
						} else {
							this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.CallExpression, token, this.currentRoot, true));
							this.beginExpressionWith(MakeNode(NT.ArgumentsList, token, this.currentRoot, true));
						}
						break;
					case NT.TypeArgumentsList:
						const twoBack = this.prev(2);

						if (twoBack?.type && ([NT.Identifier, NT.MemberExpression, NT.Typed] as NT[]).includes(twoBack?.type)) {
							// we're in a CallExpression after the GenericTypesList
							const callExpressionNode = MakeNode(NT.CallExpression, token, this.currentRoot, true);
							this.adoptNode(this.currentRoot, twoBack, callExpressionNode);
							this.adoptNode(this.currentRoot, prev, callExpressionNode);
							this.beginExpressionWith(callExpressionNode);
						}

						// begin the ArgumentsList
						this.beginExpressionWith(MakeNode(NT.ArgumentsList, token, this.currentRoot, true));

						break;
					case NT.TypeParametersList:
						if (this.currentRoot.type === NT.FunctionDeclaration) {
							// we're in a FunctionDeclaration after the GenericTypesList
							this.beginExpressionWith(MakeNode(NT.ParametersList, token, this.currentRoot, true));
						}
						break;
					case NT.MemberExpression:
						this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.CallExpression, token, this.currentRoot, true));
						this.beginExpressionWith(MakeNode(NT.ArgumentsList, token, this.currentRoot, true));
						break;
					default:
						this.beginExpressionWith(MakeNode(NT.Parenthesized, token, this.currentRoot, true));
						break;
				}
			} else if (token.type === 'paren_close') {
				// check if we're in a TernaryElse and then in a TernaryExpression, if so, it's finished
				// eg `(foo ? true : false)`
				this.endExpressionIfIn(NT.TernaryElse);
				this.endExpressionIfIn(NT.TernaryExpression);

				// check if we're in a BinaryExpression, if so, it's finished
				// eg `while (foo != true) {}`
				this.endExpressionWhileIn(NT.BinaryExpression);

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				// eg `!foo()`
				this.endExpressionIfIn(NT.UnaryExpression);

				// end the Parenthesized
				this.endExpression();

				// check if we're in a CallExpression, if so, it's also finished
				this.endExpressionIfIn(NT.CallExpression);

				// check if we're in a ParametersList, if so, it's also finished
				this.endExpressionIfIn(NT.ParametersList);

				// ... and then, check if currentRoot is a UnaryExpression, if so, it's also finished
				// eg `(x * -2)`
				this.endExpressionIfIn(NT.UnaryExpression);
			} else if (token.type === 'brace_open') {
				this.endExpressionWhileIn(NT.BinaryExpression);
				this.endExpressionIfIn(NT.FunctionReturns);
				this.endExpressionIfIn(NT.ClassExtensionsList);
				this.endExpressionIfIn(NT.ClassImplementsList);
				this.endExpressionIfIn(NT.InterfaceExtensionsList);
				this.endExpressionIfIn(NT.UnaryExpression);

				// if in `for let i = 0; i < 10; i++ {}`, we need to end the UnaryExpression of i++
				if (this.currentRoot.parent?.type === NT.ForStatement) {
					this.endExpression(); // end the UnaryExpression
				}

				// this could be a BlockStatement or an ObjectExpression
				const prevType = this.prev()?.type;
				const nodeTypesThatPrecedeAnObjectExpression: NT[] = [
					NT.AssignmentOperator,
					NT.ArgumentsList,
					NT.TypeArgumentsList,
				];
				const nodeTypesThatParentAnObjectType: NT[] = [
					NT.VariableDeclaration,
					NT.ArgumentsList,
				];
				if (typeof prevType === 'undefined') {
					if (this.debug) {
						console.debug('Beginning a BlockStatement');
					}

					this.beginExpressionWith(MakeNode(NT.BlockStatement, token, this.currentRoot, true));
				} else if (nodeTypesThatPrecedeAnObjectExpression.includes(prevType) || (this.currentRoot.type === NT.Property && prevType === NT.Identifier)) {
					if (this.debug) {
						console.debug('Beginning an ObjectExpression');
					}

					this.beginExpressionWith(MakeNode(NT.ObjectExpression, token, this.currentRoot, true));
				} else if (nodeTypesThatParentAnObjectType.includes(this.currentRoot.type)) {
					if (this.debug) {
						console.debug('Beginning an ObjectType');
					}

					this.beginExpressionWith(MakeNode(NT.ObjectType, token, this.currentRoot, true));
				} else {
					if (this.debug) {
						console.debug('Beginning a BlockStatement');
					}

					this.beginExpressionWith(MakeNode(NT.BlockStatement, token, this.currentRoot, true));
				}
			} else if (token.type === 'brace_close') {
				this.endExpression();

				this.endExpressionIfIn(NT.Loop);
				this.endExpressionIfIn(NT.FunctionDeclaration);
				this.endExpressionIfIn(NT.ClassDeclaration);
				this.endExpressionIfIn(NT.InterfaceDeclaration);
				this.endExpressionIfIn(NT.ObjectExpression);
				this.endExpressionIfIn(NT.ObjectType);
				this.endExpressionIfIn(NT.WhileStatement);
			} else if (token.type === 'bracket_open') {
				const isNextABracketClose = this.lexer.peek(0) === tokenTypesUsingSymbols.bracket_close;
				const prevType = this.prev()?.type;

				if (typeof prevType === 'undefined') {
					this.beginExpressionWith(MakeNode(NT.ArrayExpression, token, this.currentRoot, true));
				} else if (isNextABracketClose && (([NT.ArrayType, NT.Identifier, NT.ObjectType, NT.TupleType, NT.Type] as NT[]).includes(prevType))) { // TODO or member chain
					// we have an array type
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.ArrayType, token, this.currentRoot, true));

					// the second condition is to preclude this `{a: [1]}`
				} else if (([NT.CallExpression, NT.Identifier, NT.MemberExpression] as NT[]).includes(prevType) && !(this.currentRoot.type === NT.Property && prevType === NT.Identifier)) {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.MemberExpression, token, this.currentRoot, true));
					this.beginExpressionWith(MakeNode(NT.MembersList, token, this.currentRoot, true));
				} else {
					this.beginExpressionWith(MakeNode(NT.ArrayExpression, token, this.currentRoot, true));
				}
			} else if (token.type === 'bracket_close') {
				this.endExpressionIfIn(NT.IfStatement);
				this.endExpressionIfIn(NT.TernaryElse);
				this.endExpressionIfIn(NT.TernaryExpression);

				this.endExpression(); // ArrayExpression, ArrayType or MemberList
				this.endExpressionIfIn(NT.MemberExpression);
			} else if (token.type === 'bool') {
				this.addNode(MakeNode(NT.BoolLiteral, token, this.currentRoot));
			} else if (token.type === 'number') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				if (this.debug) {
					console.debug(`Creating a NumberLiteral Node in ${this.lineage(this.currentRoot)} for "${token.value}"`);
				}

				this.addNode(MakeNode(NT.NumberLiteral, token, this.currentRoot));

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				this.endExpressionIfIn(NT.UnaryExpression);

				// check if currentRoot is a RangeExpression, if so, it's also finished
				this.endExpressionIfIn(NT.RangeExpression);
			} else if (token.type === 'regex') {
				this.addNode(MakeNode(NT.RegularExpression, token, this.currentRoot));
			} else if (token.type === 'string') {
				this.addNode(MakeNode(NT.StringLiteral, token, this.currentRoot));
			} else if (token.type === 'identifier') {
				if (this.debug) {
					console.debug(`Handling identifier "${token.value}"`);
				}

				// check if we're in a ParametersList, if so, begin a Parameter
				if (this.currentRoot.type === NT.ParametersList) {
					if (this.debug) {
						console.debug('Currently there is a ParametersList open; now creating a Parameter Node in it');
					}

					this.beginExpressionWith(MakeNode(NT.Parameter, token, this.currentRoot, true));
				} else if (this.currentRoot.type === NT.TypeParametersList) {
					if (this.debug) {
						console.debug('Currently there is a TypeParametersList open; now creating a TypeParameter Node in it');
					}

					this.beginExpressionWith(MakeNode(NT.TypeParameter, token, this.currentRoot, true));
				}

				if (this.debug) {
					console.debug(`Creating an Identifier Node in ${this.currentRoot.type} for "${token.value}"`);
				}

				this.addNode(MakeNode(NT.Identifier, token, this.currentRoot));

				// check if currentRoot is a MemberExpression and next token is not a <| (types), and if so, it's finished
				if (`${this.lexer.peek(0)}${this.lexer.peek(1)}` !== tokenTypesUsingSymbols.triangle_open) {
					this.endExpressionIfIn(NT.MemberExpression);
				}
			} else if (token.type === 'comment') {
				if (token.value.substring(0, 3) === '/**') {
					this.addNode(MakeNode(NT.JoeDoc, token, this.currentRoot));
				} else {
					this.addNode(MakeNode(NT.Comment, token, this.currentRoot));
				}
			} else if (token.type === 'assign') {
				this.addNode(MakeNode(NT.AssignmentOperator, token, this.currentRoot, true));
			} else if (token.type === 'plus') {
				this.endExpressionIfIn(NT.UnaryExpression);
				this.handleBinaryExpression(token, this.prev());
			} else if (token.type === 'minus') {
				if (this.currentRoot.children.length > 0 &&
					this.nodeTypesPrecedingArithmeticOperator.includes(this.currentRoot.children[this.currentRoot.children.length - 1].type) &&
					this.currentRoot.type !== NT.BinaryExpression && this.currentRoot.type !== NT.RangeExpression // excludes scenarios such as `3^e-2`, `3 + -2`, `1..-2`
				) {
					this.endExpressionIfIn(NT.UnaryExpression);
					this.handleBinaryExpression(token, this.prev());
				} else {
					// otherwise this is a unary operator
					this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
				}
			} else if (token.type === 'plus_plus' || token.type === 'minus_minus') {
				// check token before, then check token after
				// works on an Identifier, and MemberExpression
				const prev = this.prev();
				if (prev?.type === NT.Identifier || prev?.type === NT.MemberExpression) {
					// this is postfix
					this.beginExpressionWithAdoptingPreviousNode(MakeUnaryExpressionNode(token, false, this.currentRoot));
				} else {
					// this is prefix
					this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
				}
			} else if (token.type === 'asterisk') {
				this.handleBinaryExpression(token, this.prev());
			} else if (token.type === 'forward_slash') {
				this.handleBinaryExpression(token, this.prev());
			} else if (token.type === 'mod') {
				this.handleBinaryExpression(token, this.prev());
			} else if (token.type === 'exponent') {
				this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.BinaryExpression, token, this.currentRoot));
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
				if (this.currentRoot.type !== NT.BlockStatement) {
					this.endExpression();
				}

				// greedy ending - end as many nodes as relevantly possible
				while (this.nodeTypesThatASemicolonEnds.includes(this.currentRoot.type)) {
					this.endExpression();
				}

				this.addNode(MakeNode(NT.SemicolonSeparator, token, this.currentRoot));
			} else if (token.type === 'dot') {
				const prev = this.prev();

				if (prev?.type === NT.CallExpression ||
					prev?.type === NT.Identifier ||
					prev?.type === NT.MemberExpression ||
					prev?.type === NT.Typed ||
					(prev?.type === NT.Keyword && prev.value === 'this')
				) {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.MemberExpression, token, this.currentRoot, true));
				}
			} else if (token.type === 'dotdotdot') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				// check if we're in a ParametersList, if so, begin a Parameter
				if (this.currentRoot.type === NT.ParametersList) {
					this.beginExpressionWith(MakeNode(NT.Parameter, token, this.currentRoot, true));
				}

				this.addNode(MakeNode(NT.RestElement, token, this.currentRoot));
			} else if (token.type === 'colon') {
				if (this.currentRoot.type === NT.TernaryThen) {
					// TernaryExpression
					this.endExpression(); // end the TernaryThen
					this.beginExpressionWith(MakeNode(NT.TernaryElse, token, this.currentRoot, true));

				} else if ([NT.ObjectExpression, NT.ObjectType].includes(this.currentRoot.type) && this.prev()?.type === NT.Identifier) {
					// POJOs notation
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.Property, token, this.currentRoot, true));

				} else {
					if (this.currentRoot.type === NT.BlockStatement) {
						// convert BlockStatement to an ObjectExpression and create a Property node
						this.currentRoot.type = NT.ObjectExpression;

						this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.Property, token, this.currentRoot, true));
					} else {
						this.addNode(MakeNode(NT.ColonSeparator, token, this.currentRoot));
					}
				}

			} else if (token.type === 'comma') {
				if (this.currentRoot.type === NT.TernaryElse) {
					this.endExpression(); // end the TernaryElse
					this.endExpression(); // end the TernaryExpression
					this.endExpressionIfIn(NT.Property); // end if in Property
				} else if (this.currentRoot.type === NT.WhenCaseConsequent) {
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentRoot.type === NT.CallExpression && this.currentRoot.parent?.type === NT.WhenCaseConsequent) {
					this.endExpression(); // end the CallExpression
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentRoot.type === NT.BinaryExpression) {
					this.endExpression();
				} else if (this.currentRoot.type === NT.Parameter || this.currentRoot.type === NT.TypeParameter) {
					this.endExpression();
				} else if (this.currentRoot.type === NT.Property) {
					this.endExpression();
				}

				// postfix `if` in an array
				// this is separate from the above if/elses since this can happen _after and in addition to_ one of the above scenarios
				if (this.currentRoot.type === NT.IfStatement && this.currentRoot.parent?.type === NT.ArrayExpression) {
					this.endExpression(); // end the IfStatement which _is_ the entry
				} else if (this.currentRoot.type === NT.IfStatement && this.currentRoot.parent?.type === NT.Property) {
					this.endExpression(); // end the IfStatement
					this.endExpression(); // end the Property
				}

				this.addNode(MakeNode(NT.CommaSeparator, token, this.currentRoot));
			} else if (['and', 'compare', 'equals', 'greater_than_equals', 'less_than_equals', 'not_equals', 'or'].includes(token.type)) {
				const prev = this.prev();

				// '<=>' can be a function name
				if (token.type === 'compare' && this.isCurrentRootAFunctionInAClass()) {
					this.addNode(MakeNode(NT.Identifier, token, this.currentRoot));

				} else {
					this.handleBinaryExpression(token, prev);
				}
			} else if (token.type === 'type') {
				this.addNode(MakeNode(NT.Type, token, this.currentRoot));
			} else if (token.type === 'bang') {
				this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
			} else if (token.type === 'right_arrow') {
				if (this.currentRoot.type === NT.WhenCaseTests) {
					this.endExpression();
					this.beginExpressionWith(MakeNode(NT.WhenCaseConsequent, token, this.currentRoot, true));
				} else if (this.currentRoot.type === NT.FunctionDeclaration) {
					this.beginExpressionWith(MakeNode(NT.FunctionReturns, token, this.currentRoot, true));
				} else {
					this.addNode(MakeNode(NT.RightArrowOperator, token, this.currentRoot));
				}
			} else if (token.type === 'dotdot') {
				const prev = this.prev();

				// we need to go 2 levels up
				if (this.currentRoot.type === NT.BinaryExpression || this.currentRoot.type === NT.Parenthesized) {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.RangeExpression, token, this.currentRoot, true));
				} else if (prev?.type === NT.ArgumentsList && this.currentRoot.type === NT.CallExpression) {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.RangeExpression, token, this.currentRoot, true));
				} else if (prev?.type === NT.MembersList && this.currentRoot.type === NT.MemberExpression) {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.RangeExpression, token, this.currentRoot, true));
				} else {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.RangeExpression, token, this.currentRoot, true));
				}
			} else if (token.type === 'triangle_open') {
				/**
				 *
				 * + f foo<|T|> {} // FunctionDeclaration[TypeDeclaration[Identifier, TypeParametersList[TypeParameter...]], BlockStatement]
				 * + a(B<|T|>); // CallExpression[Identifier, ArgumentsList[Argument[TypeInstantiation[Identifier, TypeArgumentsList[Type...]]]]]
				 *
				 * - class Foo<|T|> {} // ClassDeclaration[Type]
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

				if (([NT.ClassDeclaration, NT.FunctionDeclaration, NT.InterfaceDeclaration] as NT[]).includes(this.currentRoot.type)) {
					if (this.prev()?.type === NT.Identifier) {
						this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.Typed, token, this.currentRoot, true));
					}

					this.beginExpressionWith(MakeNode(NT.TypeParametersList, token, this.currentRoot, true));
				} else {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.Typed, token, this.currentRoot, true));

					this.beginExpressionWith(MakeNode(NT.TypeArgumentsList, token, this.currentRoot, true));
				}
			} else if (token.type === 'triangle_close') {
				this.endExpressionIfIn(NT.TypeArgumentsList);
				this.endExpressionIfIn(NT.Typed);

				this.endExpressionIfIn(NT.TypeParameter);
				this.endExpressionIfIn(NT.TypeParametersList);
				this.endExpressionIfIn(NT.Typed);

				this.endExpressionIfIn(NT.MemberExpression);
			} else if (token.type === 'less_than') {
				/**
				 * < can be:
				 * - a comparison
				 *   - Foo<T; // BinaryExpression
				 *   - let foo = [Foo < T, U > 3]; // Bool Array with 2 BinaryExpressions
				 *   - let foo = [Foo < T, U > (3+4)]; // same
				 *
				 * - the beginning of a tuple expression
				 *   - <> // empty Tuple
				 *   - <T> // Tuple
				 *   - foo = <T>; // tuple
				 *   - foo(<T>) // tuple
				 *   - [<T>] // tuple in array
				 *   - {a: <T>} // tuple in pojo
				 *
				 * - the beginning of a tuple type
				 */

				const prevType = this.prev()?.type;
				// console.debug({prevType, currentRoot: this.currentRoot});

				const literals: NT[] = [NT.BoolLiteral, NT.NumberLiteral, NT.StringLiteral];
				const nodeTypesThatPrecedeABinaryExpression: NT[] = [
					NT.Identifier,
					...literals,
					NT.CallExpression,
					NT.MemberExpression,
					NT.UnaryExpression,
				];

				if (this.currentRoot.type === NT.FunctionReturns) {
					this.beginExpressionWith(MakeNode(NT.TupleType, token, this.currentRoot, true));

				} else if (typeof prevType === 'undefined') {
					// tuple
					this.beginExpressionWith(MakeNode(NT.TupleExpression, token, this.currentRoot, true));

				} else if (this.currentRoot.type === NT.Property && prevType === NT.Identifier) {
					// tuple
					this.beginExpressionWith(MakeNode(NT.TupleExpression, token, this.currentRoot, true));

				} else if (nodeTypesThatPrecedeABinaryExpression.includes(prevType)) {
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.BinaryExpression, token, this.currentRoot));

				} else if (prevType === NT.ArgumentsList && this.currentRoot.type === NT.CallExpression) {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));

				} else if (prevType === NT.MembersList && this.currentRoot.type === NT.MemberExpression) {
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));

				} else if (prevType === NT.ColonSeparator && this.currentRoot.type !== NT.ObjectExpression) {
					this.beginExpressionWith(MakeNode(NT.TupleType, token, this.currentRoot, true));

				} else {
					this.beginExpressionWith(MakeNode(NT.TupleExpression, token, this.currentRoot, true));
				}
			} else if (token.type === 'greater_than') {
				/**
				 * > can be:
				 * - a number comparison
				 * - the end of a TupleExpression
				 */
				const prevType = this.prev()?.type;

				// first close out a ternary
				if (this.currentRoot.type === NT.TernaryElse) {
					this.endExpression(); // end the TernaryElse
					this.endExpression(); // end the TernaryExpression
				}

				// then, then other stuff

				if (this.currentRoot.type === NT.TupleExpression || this.currentRoot.type === NT.TupleType) {
					this.endExpression(); // end the TupleExpression or TupleType

				} else if (prevType === NT.NumberLiteral) {
					// if prev is a number, this is a comparison
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.BinaryExpression, token, this.currentRoot));

				} else if (prevType === NT.Identifier) {
					/**
					 * if prev is an Identifier, it can be a BooleanExpression or a Tuple
					 * - foo = 5; foo<6; // number comparison
					 * - foo = <T>; // tuple
					 */

					// 'less than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.BinaryExpression, token, this.currentRoot));

				} else if (prevType === NT.ArgumentsList && this.currentRoot.type === NT.CallExpression) {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));

				} else if (prevType === NT.MembersList && this.currentRoot.type === NT.MemberExpression) {
					// we need to go 2 levels up
					this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));

				} else {
					// 'greater than' BinaryExpression
					this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.BinaryExpression, token, this.currentRoot));
				}

			} else if (token.type === 'keyword') {
				if (this.debug) {
					console.debug(`Handling keyword "${token.value}"`);
				}

				switch (token.value) {
					case 'abstract':
					case 'static':
						// can either be a ClassDeclaration, FunctionDeclaration or VariableDeclaration

						// the simplest way is to start a ModifiersList,
						// then when we come across a one of those declarations, we check if this.currentRoot is a ModifiersList

						if (this.currentRoot.type !== NT.ModifiersList) {
							if (this.debug) {
								console.debug('Beginning a ModifiersList');
							}

							this.beginExpressionWith(MakeNode(NT.ModifiersList, token, this.currentRoot, true));
						}

						if (this.debug) {
							console.debug(`Creating a Modifier Node in ${this.lineage(this.currentRoot)} for "${token.value}"`);
						}

						this.addNode(MakeNode(NT.Modifier, token, this.currentRoot));
						break;
					case 'class':
						// the ClassDeclaration may have already started with some Modifier(s)
						let classNode: Node;
						if (this.currentRoot.type === NT.ModifiersList) {
							if (this.debug) {
								console.debug('Currently there is a ModifiersList open; now beginning ClassDeclaration and adopting the ModifiersList');
							}

							classNode = this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.ClassDeclaration, token, this.currentRoot, true));
						} else {
							if (this.debug) {
								console.debug('There is no ModifiersList open; now beginning a ClassDeclaration');
							}

							classNode = this.beginExpressionWith(MakeNode(NT.ClassDeclaration, token, this.currentRoot, true));
						}

						this.adoptPrecedingJoeDocIfPresent(classNode);
						break;
					case 'const':
					case 'let':
						let variableNode: Node;

						// the VariableDeclaration may have already started with some Modifier(s)
						if (this.currentRoot.type === NT.ModifiersList) {
							if (this.debug) {
								console.debug('Currently there is a ModifiersList open; now beginning VariableDeclaration and adopting the ModifiersList');
							}

							variableNode = this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.VariableDeclaration, token, this.currentRoot));
						} else {
							if (this.debug) {
								console.debug('There is no ModifiersList open; now beginning a VariableDeclaration');
							}

							variableNode = this.beginExpressionWith(MakeNode(NT.VariableDeclaration, token, this.currentRoot));
						}

						this.adoptPrecedingJoeDocIfPresent(variableNode);
						break;
					case 'break':
						this.addNode(MakeNode(NT.BreakStatement, token, this.currentRoot, true));
						break;
					case 'else':
						// no need to do anything with this.
						// A subsequent BlockStatement will go into the previous IfStatement
						// A subsequent IfStatement will do the same
						// Just check if we're in an IfStatement
						if (this.currentRoot.type !== NT.IfStatement) {
							throw new ParserError('`else` keyword is used with if statements', this.currentRoot);
						}
						break;
					case 'extends':
						if (this.currentRoot.type === NT.ClassDeclaration) {
							this.beginExpressionWith(MakeNode(NT.ClassExtensionsList, token, this.currentRoot, true));
						} else if (this.currentRoot.type === NT.InterfaceDeclaration) {
							this.beginExpressionWith(MakeNode(NT.InterfaceExtensionsList, token, this.currentRoot, true));
						} else {
							throw new ParserError('`extends` keyword is used for a Class or Interface to extend another', this.currentRoot);
						}
						break;
					case 'f':
						// the FunctionDeclaration may have already started with a Modifier
						let fNode: Node;
						if (this.currentRoot.type === NT.ModifiersList) {
							if (this.debug) {
								console.debug('Currently there is a ModifiersList open; now beginning FunctionDeclaration and adopting the ModifiersList');
							}

							fNode = this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.FunctionDeclaration, token, this.currentRoot, true));
						} else {
							if (this.debug) {
								console.debug('There is no ModifiersList open; now beginning a FunctionDeclaration');
							}

							fNode = this.beginExpressionWith(MakeNode(NT.FunctionDeclaration, token, this.currentRoot, true));
						}

						this.adoptPrecedingJoeDocIfPresent(fNode);
						break;
					case 'for':
						this.beginExpressionWith(MakeNode(NT.ForStatement, token, this.currentRoot, true));
						break;
					case 'if':
						// check token before, then check token after
						// works on a CallExpression as well as Literal in an ArrayExpression
						const prev = this.prev();
						if (prev?.type === NT.CallExpression || this.nodeTypesThatAllowAPostfixIf.includes(this.currentRoot.type)) {
							// this is after, therefore take the CallExpression, array element, or Property
							this.beginExpressionWithAdoptingPreviousNode(MakeIfStatementNode(token, false, this.currentRoot));
						} else {
							// this is before

							// if prev token is 'else', this IfStatement goes into current node
							// Otherwise it's a new IfStatement and we must first close the current IfStatement if we're in one.
							
							// the token is already ready for the next, so we need to go 2 back
							const prevToken = this.lexer.prevToken(2);
							if (this.currentRoot.type === NT.IfStatement && typeof prevToken !== 'undefined' && !(prevToken.type === 'keyword' && prevToken.value === 'else')) {
								if (this.debug) {
									console.debug('Found an "if" statement after another "if" without an "else"; now closing the first IfStatement');
								}

								this.endExpression(); // end the IfStatement
							}

							this.beginExpressionWith(MakeIfStatementNode(token, true, this.currentRoot));
						}
						break;
					case 'implements':
						this.endExpressionIfIn(NT.ClassExtensionsList);

						this.beginExpressionWith(MakeNode(NT.ClassImplementsList, token, this.currentRoot, true));
						break;
					case 'import':
						this.beginExpressionWith(MakeNode(NT.ImportDeclaration, token, this.currentRoot, true));
						break;
					case 'interface':
						const interfaceNode = this.beginExpressionWith(MakeNode(NT.InterfaceDeclaration, token, this.currentRoot, true));
						this.adoptPrecedingJoeDocIfPresent(interfaceNode);
						break;
					case 'loop':
						this.beginExpressionWith(MakeNode(NT.Loop, token, this.currentRoot, true));
						break;
					case 'or':
						this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.BinaryExpression, token, this.currentRoot));
						break;
					case 'print':
						this.beginExpressionWith(MakeNode(NT.PrintStatement, token, this.currentRoot, true));
						break;
					case 'repeat':
						this.beginExpressionWith(MakeNode(NT.RepeatStatement, token, this.currentRoot, true));
						break;
					case 'return':
						this.beginExpressionWith(MakeNode(NT.ReturnStatement, token, this.currentRoot, true));
						break;
					case 'when':
						this.beginExpressionWith(MakeNode(NT.WhenExpression, token, this.currentRoot, true));
						break;
					case 'while':
						this.beginExpressionWith(MakeNode(NT.WhileStatement, token, this.currentRoot, true));
						break;
					default:
						this.addNode(MakeNode(NT.Keyword, token, this.currentRoot));
						break;
				}
			} else if (token.type === 'path') {
				this.addNode(MakeNode(NT.Path, token, this.currentRoot));
			} else if (token.type === 'question') {
				this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.TernaryExpression, token, this.currentRoot, true));
				this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.TernaryCondition, token, this.currentRoot, true));
				this.endExpression(); // end the TernaryCondition
				this.beginExpressionWith(MakeNode(NT.TernaryThen, token, this.currentRoot, true));
			} else {
				// this should eventually turn into an error
				this.addNode(MakeNode(NT.Unknown, token, this.currentRoot));
			}
		} while (typeof this.currentToken !== 'undefined');

		if (this.debug) {
			console.debug(inspect(this.root, { showHidden: true, depth: null }));
		}

		return this.root;
	}

	/**
	 * When applicable, checks for the presence of a preceding JoeDoc and adopts it
	 *
	 * @param applicableNode for Class, Function, Interface, or Variable
	 * @returns the applicableNode regardless
	 */
	private adoptPrecedingJoeDocIfPresent(applicableNode: Node): Node {
		const maybeJoeDoc = this.currentRoot.parent?.children.at(-2);
		// grab preceding JoeDoc, if any
		if (typeof maybeJoeDoc !== 'undefined' && maybeJoeDoc?.type === NT.JoeDoc) {
			this.adoptNode(this.currentRoot.parent, maybeJoeDoc, applicableNode);
		}

		return applicableNode;
	}

	/**
	 * Shortcut method to handle all scenarios of a BinaryExpression
	 *
	 * @param token Current token
	 * @param prev Previous Node
	 */
	private handleBinaryExpression(token: Token, prev: Node | undefined) {
		if (this.currentRoot.type === NT.BinaryExpression && ['and', 'or'].includes(token.type)) {
			// && and || have higher order precedence than equality checks
			this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));
		} else if (prev?.type === NT.ArgumentsList && this.currentRoot.type === NT.CallExpression) {
			this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));
		} else if (prev?.type === NT.MembersList && this.currentRoot.type === NT.MemberExpression) {
			this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));
		} else {
			this.beginExpressionWithAdoptingPreviousNode(MakeNode(NT.BinaryExpression, token, this.currentRoot), 'a value');
		}
	}

	/** Shortcut method to check if the current root is a FunctionDeclaration and is inside of a ClassDeclaration */
	private isCurrentRootAFunctionInAClass() {
		return this.currentRoot.type === NT.FunctionDeclaration && this.currentRoot.parent?.parent?.type === NT.ClassDeclaration;
	}

	private ifInWhenExpressionBlockStatementBeginCase(token: Token) {
		if (this.currentRoot.type === NT.BlockStatement && this.currentRoot.parent?.type === NT.WhenExpression) {
			this.beginExpressionWith(MakeNode(NT.WhenCase, token, this.currentRoot, true));
			this.beginExpressionWith(MakeNode(NT.WhenCaseTests, token, this.currentRoot, true));
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
	 * Gets the next token
	 *
	 * @returns the next token
	 */
	private getNextToken(): Token | undefined {
		return this.lexer.getToken();
	}

	private addNode(node: Node, to?: Node) {
		if (typeof to === 'undefined') {
			this.currentRoot.children.push(node);
		} else {
			const currentRoot = this.currentRoot;
			this.currentRoot = to;
			this.currentRoot.children.push(node);
			this.currentRoot = currentRoot;
		}
	}

	/**
	 * Begins an expression with a node
	 *
	 * @param node - To push
	 * @returns the node, for ease of development
	 */
	private beginExpressionWith(node: Node, addingTo?: Node): Node {
		this.addNode(node, addingTo);
		this.currentRoot = node;

		return node;
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
	 * @param whatWeExpectInPrevNode - Human-readable phrase for expected prev node
	 * @returns - newKid
	 *
	 * @throws Error if there is no previous node
	 */
	private beginExpressionWithAdoptingPreviousNode(newKid: Node, whatWeExpectInPrevNode?: string): Node {
		return this.beginExpressionWithAdopting(newKid, this.prev(), whatWeExpectInPrevNode);
	}

	/**
	 * Begins an expression with a node and also "adopts" this.currentRoot as its first node
	 *
	 * Here's a diagram depicting what happens:
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
 	 * @param whatWeExpectInPrevNode - Human-readable phrase for expected prev node
	 * @returns - newKid
	 */
	private beginExpressionWithAdopting(newKid: Node, adoptee: Node | undefined, whatWeExpectInPrevNode?: string): Node {
		if (typeof adoptee === 'undefined') {
			throw new ParserError(`"${newKid.value}" is a ${newKid.type} and we hoped to find ${whatWeExpectInPrevNode || 'something'} before it, but alas!`, this.currentRoot);
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
	 * This process has 2 steps:
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
	private endExpressionIfIn(type: NT) {
		if (this.currentRoot.type === type) {
			this.endExpression();
		}
	}

	/**
	 * check if currentRoot is of the desired type, if so, it's finished
	 * rinse and repeat
	 */
	private endExpressionWhileIn(type: NT) {
		while (this.currentRoot.type === type) {
			this.endExpression();
		}
	}
}
