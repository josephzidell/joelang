import { inspect } from 'util';
import Lexer from '../lexer/lexer';
import { Token, tokenTypesUsingSymbols } from '../lexer/types';
import ErrorContext from '../shared/errorContext';
import { error, ok, Result } from '../shared/result';
import ParserError, { ParserErrorCode } from './error';
import { ChangeNodeType, MakeNode, MakeUnaryExpressionNode } from './node';
import { Node, NT, validNodeTypesAsMemberObject } from './types';

export default class Parser {
	prevToken: Token | undefined;

	currentToken: Result<Token> = error(new Error('No tokens found'));

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
		NT.AssignablesList,
		NT.AssignmentExpression,
		NT.BinaryExpression,
		NT.FunctionDeclaration, // for abstract functions
		NT.FunctionReturns, // for abstract functions
		NT.IfStatement,
		NT.MemberExpression,
		NT.MemberListExpression,
		NT.ObjectExpression,
		NT.PostfixIfStatement,
		NT.PrintStatement,
		NT.Property,
		NT.RangeExpression,
		NT.RegularExpression,
		NT.ReturnStatement,
		NT.TernaryAlternate,
		NT.TernaryExpression,
		NT.TypeArgumentsList,
		NT.UnaryExpression,
		NT.VariableDeclaration,
		NT.WhenExpression,
	];

	nodeTypesThatAllowAPostfixIf: NT[] = [NT.ArrayExpression];

	mapParentNodeToChild: Partial<Record<NT, NT>> = {
		[NT.ParametersList]: NT.Parameter,
		[NT.TypeParametersList]: NT.TypeParameter,
		[NT.ClassExtensionsList]: NT.ClassExtension,
		[NT.ClassImplementsList]: NT.ClassImplement,
		[NT.EnumExtensionsList]: NT.EnumExtension,
		[NT.InterfaceExtensionsList]: NT.InterfaceExtension,
	};

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
			console.debug('Getting started parsing');
		}
	}

	getErrorContext(length: number): ErrorContext {
		switch (this.currentToken.outcome) {
			case 'ok':
				return new ErrorContext(
					this.lexer.code,
					this.currentToken.value.line,
					this.currentToken.value.col,
					length,
				);
				break;
			case 'error':
				// we have no information about the line or col
				// since line and col are 1-based, we use 1
				return new ErrorContext(this.lexer.code, 1, 1, 0);
		}
	}

	public lineage(node: Node | undefined, separator = '>'): string {
		if (typeof node === 'undefined') {
			return 'end';
		}

		return `${node.type}${separator}${this.lineage(node.parent, separator)}`;
	}

	public parse(): Result<Node> {
		do {
			// before going on to the next token, update this.prevToken
			this.prevToken = this.currentToken.outcome === 'ok' ? this.currentToken.value : undefined;

			// get the next token
			this.currentToken = this.getNextToken();
			if (this.currentToken.outcome === 'error') {
				return error(this.currentToken.error);
			}

			const token = this.currentToken.value;
			if (token.type === 'eof') {
				return ok(this.root);
			}

			if (this.debug) {
				console.debug(`Found token type "${token.type}" with value "${token.value}"`);
			}

			if (token.type === 'paren_open') {
				const [prev, prevType] = this.prev();
				switch (prevType) {
					// if previous was an Identifier, then this is either a CallExpression or FunctionDeclaration
					case NT.Identifier:
						if (
							this.currentRoot.type === NT.FunctionDeclaration ||
							this.currentRoot.type === NT.FunctionSignature
						) {
							this.beginExpressionWith(MakeNode(NT.ParametersList, token, this.currentRoot, true));

							// next case:
							// the only way this could be a CallExpression is if the previous token was an identifier or close of generic type list
							// even though we're already checking the previous Node, we still need to check the previous token, since we could be
							// in the right-hand side of a BinaryExpression where the operator adopts the left-hand side and the "previous Node"
							// is that left-hand side rather than the operator. And we cannot check whether we're _in_ a BinaryExpression since
							// we could legitimately could be in a CallExpression on the right-hand side, i.e. `a && (c)` and `a && c()` both
							// have the same previous Node and the same currentRoot.
						} else if (
							this.prevToken?.type &&
							['identifier', 'triangle_close'].includes(this.prevToken.type)
						) {
							const result = this.beginExpressionWithAdoptingPreviousNode(
								MakeNode(NT.CallExpression, token, this.currentRoot, true),
							);
							if (result.outcome === 'error') {
								return result;
							}

							this.beginExpressionWith(MakeNode(NT.ArgumentsList, token, this.currentRoot, true));
						} else {
							this.beginExpressionWith(MakeNode(NT.Parenthesized, token, this.currentRoot, true));
						}
						break;
					case NT.MemberExpression:
						// the only way this could be a CallExpression is if the previous token was an identifier or close of generic type list
						// even though we're already checking the previous Node, we still need to check the previous token, since we could be
						// in the right-hand side of a BinaryExpression where the operator adopts the left-hand side and the "previous Node"
						// is that left-hand side rather than the operator. And we cannot check whether we're _in_ a BinaryExpression since
						// we could legitimately could be in a CallExpression on the right-hand side, i.e. `a.b && (c)` and `a.b && c()` both
						// have the same previous Node and the same currentRoot.
						if (this.prevToken?.type && ['identifier', 'triangle_close'].includes(this.prevToken.type)) {
							const result = this.beginExpressionWithAdoptingPreviousNode(
								MakeNode(NT.CallExpression, token, this.currentRoot, true),
							);
							if (result.outcome === 'error') {
								return result;
							}

							this.beginExpressionWith(MakeNode(NT.ArgumentsList, token, this.currentRoot, true));
						} else {
							this.beginExpressionWith(MakeNode(NT.Parenthesized, token, this.currentRoot, true));
						}
						break;
					case NT.TypeArgumentsList:
						{
							const [twoBack, twoBackType] = this.prev(2);

							if (
								twoBackType &&
								([NT.Identifier, NT.MemberExpression, NT.ThisKeyword] as NT[]).includes(twoBackType)
							) {
								// we're in a CallExpression after the GenericTypesList
								const callExpressionNode = MakeNode(NT.CallExpression, token, this.currentRoot, true);
								let wasAdopted = this.adoptNode(this.currentRoot, twoBack, callExpressionNode);
								if (wasAdopted.outcome === 'error') {
									return error(wasAdopted.error);
								}

								wasAdopted = this.adoptNode(this.currentRoot, prev, callExpressionNode);
								this.beginExpressionWith(callExpressionNode);
							}

							// begin the ArgumentsList
							this.beginExpressionWith(MakeNode(NT.ArgumentsList, token, this.currentRoot, true));
						}
						break;
					case NT.TypeParametersList:
						if (
							this.currentRoot.type === NT.FunctionDeclaration ||
							this.currentRoot.type === NT.FunctionSignature
						) {
							// we're in a FunctionDeclaration after the GenericTypesList
							this.beginExpressionWith(MakeNode(NT.ParametersList, token, this.currentRoot, true));
						}
						break;
					default:
						if (
							this.currentRoot.type === NT.FunctionDeclaration ||
							this.currentRoot.type === NT.FunctionSignature
						) {
							// we're in an anonymous FunctionDeclaration after the `f` keyword
							// and there is no previous node
							this.beginExpressionWith(MakeNode(NT.ParametersList, token, this.currentRoot, true));
						} else {
							this.beginExpressionWith(MakeNode(NT.Parenthesized, token, this.currentRoot, true));
						}
						break;
				}
			} else if (token.type === 'paren_close') {
				// check if we're in a TernaryAlternate and then in a TernaryExpression, if so, it's finished
				// eg `(foo ? true : false)`
				this.endExpressionIfIn(NT.TernaryAlternate);
				this.endExpressionIfIn(NT.TernaryExpression);

				// check if we're in a BinaryExpression, if so, it's finished
				// eg `while (foo != true) {}`
				this.endExpressionWhileIn([NT.BinaryExpression]);

				// check if currentRoot is a UnaryExpression, if so, it's also finished
				// eg `!foo()`
				this.endExpressionIfIn(NT.UnaryExpression);

				// end the ArgumentsList or Parenthesized
				this.endExpression();

				// check if we're in a CallExpression, if so, it's also finished
				this.endExpressionIfIn(NT.CallExpression);

				// check if we're in a FunctionReturns, if so, it's finished
				// eg `f foo (bar: int64, callback: f -> bool)`
				this.endExpressionIfIn(NT.FunctionReturns);

				// check if we're in a FunctionSignature, if so, it's finished
				// eg `let foo: f (bar: string) = f (bar) {}`
				this.endExpressionIfIn(NT.FunctionSignature);

				// check if we're in a Parameter, if so, it's also finished
				this.endExpressionIfIn(NT.Parameter);

				// check if we're in a ParametersList, if so, it's also finished
				this.endExpressionIfIn(NT.ParametersList);

				// ... and then, check if currentRoot is a UnaryExpression, if so, it's also finished
				// eg `(x * -2)`
				this.endExpressionIfIn(NT.UnaryExpression);
			} else if (token.type === 'brace_open') {
				this.endExpressionWhileIn([NT.BinaryExpression]);
				this.endExpressionWhileIn([NT.FunctionSignature, NT.FunctionReturns]);
				this.endExpressionIfIn(NT.ClassExtension);
				this.endExpressionIfIn(NT.ClassExtensionsList);
				this.endExpressionIfIn(NT.ClassImplement);
				this.endExpressionIfIn(NT.ClassImplementsList);
				this.endExpressionIfIn(NT.EnumExtension);
				this.endExpressionIfIn(NT.EnumExtensionsList);
				this.endExpressionIfIn(NT.InterfaceExtension);
				this.endExpressionIfIn(NT.InterfaceExtensionsList);
				this.endExpressionIfIn(NT.UnaryExpression);

				// if in `for let i = 0; i < 10; i++ {}`, we need to end the UnaryExpression of i++
				if (this.currentRoot.parent?.type === NT.ForStatement) {
					this.endExpression(); // end the UnaryExpression
				}

				// this could be a BlockStatement or an ObjectExpression
				const [, prevType] = this.prev();
				const nodeTypesThatPrecedeAnObjectExpression: NT[] = [
					NT.AssignablesList,
					NT.ArgumentsList,
					NT.TypeArgumentsList,
				];
				const nodeTypesThatParentAnObjectExpression: NT[] = [NT.AssignablesList];
				const nodeTypesThatParentAnObjectShape: NT[] = [NT.ArgumentsList, NT.TypeArgumentsList];
				if (nodeTypesThatParentAnObjectShape.includes(this.currentRoot.type)) {
					if (this.debug) {
						console.debug('Beginning an ObjectShape');
					}

					this.beginExpressionWith(MakeNode(NT.ObjectShape, token, this.currentRoot, true));
				} else if (nodeTypesThatParentAnObjectExpression.includes(this.currentRoot.type)) {
					if (this.debug) {
						console.debug('Beginning an ObjectExpression');
					}

					this.beginExpressionWith(MakeNode(NT.ObjectExpression, token, this.currentRoot, true));
				} else if (typeof prevType === 'undefined') {
					if (this.debug) {
						console.debug('Beginning a BlockStatement');
					}

					this.beginExpressionWith(MakeNode(NT.BlockStatement, token, this.currentRoot, true));
				} else if (
					nodeTypesThatPrecedeAnObjectExpression.includes(prevType) ||
					(this.currentRoot.type === NT.Property && prevType === NT.Identifier)
				) {
					if (this.debug) {
						console.debug('Beginning an ObjectExpression');
					}

					this.beginExpressionWith(MakeNode(NT.ObjectExpression, token, this.currentRoot, true));
				} else {
					if (this.debug) {
						console.debug('Beginning a BlockStatement');
					}

					this.beginExpressionWith(MakeNode(NT.BlockStatement, token, this.currentRoot, true));
				}
			} else if (token.type === 'brace_close') {
				this.endExpression();

				this.endExpressionIfIn(NT.LoopStatement);
				this.endExpressionIfIn(NT.ForStatement);
				this.endExpressionIfIn(NT.FunctionDeclaration);
				this.endExpressionIfIn(NT.FunctionSignature);
				this.endExpressionIfIn(NT.ClassDeclaration);
				this.endExpressionIfIn(NT.EnumDeclaration);
				this.endExpressionIfIn(NT.InterfaceDeclaration);
				this.endExpressionIfIn(NT.ObjectExpression);
				this.endExpressionIfIn(NT.ObjectShape);
			} else if (token.type === 'bracket_open') {
				const isNextABracketClose = this.lexer.peek(0) === tokenTypesUsingSymbols.bracket_close;
				const [, prevType] = this.prev();

				if (typeof prevType === 'undefined') {
					this.beginExpressionWith(MakeNode(NT.ArrayExpression, token, this.currentRoot, true));
				} else {
					if (
						isNextABracketClose &&
						([NT.ArrayOf, NT.Identifier, NT.ObjectShape, NT.TupleShape, NT.Type] as NT[]).includes(prevType)
					) {
						// we have an array type
						const result = this.beginExpressionWithAdoptingPreviousNode(
							MakeNode(NT.ArrayOf, token, this.currentRoot, true),
						);
						if (result.outcome === 'error') {
							return result;
						}

						// the second condition is to preclude this `{a: [1]}`
					} else if (
						validNodeTypesAsMemberObject.includes(prevType) &&
						!(this.currentRoot.type === NT.Property && prevType === NT.Identifier)
					) {
						// since we're an opening bracket, we're definitely either a MemberExpression or a MemberListExpression
						// the difference being based on what is between the brackets. At this point, we don't know, so we'll
						// assume it's a MemberListExpression, and then at the bracket_close, we can retroactively determine
						// if it's a MemberListExpression or a MemberExpression (and then change the type of the node)

						const result = this.beginExpressionWithAdoptingPreviousNode(
							MakeNode(NT.MemberListExpression, token, this.currentRoot, true),
						);
						if (result.outcome === 'error') {
							return result;
						}

						this.beginExpressionWith(MakeNode(NT.MemberList, token, this.currentRoot, true));
					} else {
						this.beginExpressionWith(MakeNode(NT.ArrayExpression, token, this.currentRoot, true));
					}
				}
			} else if (token.type === 'bracket_close') {
				this.endExpressionIfIn(NT.IfStatement);
				this.endExpressionIfIn(NT.PostfixIfStatement);
				this.endExpressionIfIn(NT.TernaryAlternate);
				this.endExpressionIfIn(NT.TernaryExpression);
				this.endExpressionIfIn(NT.UnaryExpression);
				this.endExpressionIfIn(NT.BinaryExpression);

				// we may be ending a MemberList, and need to determine if it should become a MemberExpression or remain a MemberListExpression
				// and that depends on the children of the MemberList. If there is only one child, and it matches the rules for what a
				// MemberExpression looks like, then we can convert it to a MemberExpression, otherwise we leave it alone.

				// we have to determine which of these scenarios we're in:
				// - arr[0]
				// - arr[index]
				// - arr[0, 2, 4]
				// - keys = [0, 2, 4]; arr[...keys]
				// - arr[1 .. 3]
				// - lower = 1; upper = 3; arr[lower .. upper]
				// - obj['prop']
				// - obj['prop', 'other']
				// - keys = ['prop', 'other']; obj[...keys]

				// a few other cases:
				// - arr[index + 1]
				// - arr[index + 1, index + 2]
				// - arr[index + 1 .. index + 3]
				// - arr[index++]
				// - arr[++index]
				// - arr[index--]
				// - arr[--index]
				// - arr[index += 1], etc.

				// rules are when it's a single item (number or string), it's a MemberExpression
				// if it's a variable, we treat it as a single item

				// if it's a spread, we treat it as a MemberListExpression (even if the spreaded array has only a single item)
				// if it's a range, we treat it as a MemberListExpression (even if the range has only a single item)
				// if it's a comma separated list, we treat it as a MemberListExpression

				// If it should be a MemberListExpression, we don't need to do anything, because that's what it already is.
				// But if it should be a MemberExpression, we need to change the type of the node(, and then move the
				// children of the MemberList to the children of the MemberExpression).

				if (
					this.currentRoot.type === NT.MemberList &&
					this.currentRoot.parent?.type === NT.MemberListExpression &&
					this.currentRoot.children.length === 1 &&
					// object property
					(this.currentRoot.children[0].type === NT.StringLiteral ||
						// array, string, or tuple index
						this.currentRoot.children[0].type === NT.NumberLiteral ||
						// an Identifier is assumed to be an index of property name
						this.currentRoot.children[0].type === NT.Identifier ||
						// a MemberExpression is assumed to contain an index or property name
						this.currentRoot.children[0].type === NT.MemberExpression ||
						// a CallExpression is assumed to return an index or property name
						this.currentRoot.children[0].type === NT.CallExpression ||
						// a UnaryExpression is checked whether is contains a mathematical operation
						(this.currentRoot.children[0].type === NT.UnaryExpression &&
							this.currentRoot.children[0].value &&
							[
								tokenTypesUsingSymbols.plus_plus,
								tokenTypesUsingSymbols.minus_minus,
								tokenTypesUsingSymbols.minus,
							].includes(this.currentRoot.children[0].value)) ||
						// a BinaryExpression is checked whether is contains a mathematical operation
						(this.currentRoot.children[0].type === NT.BinaryExpression &&
							this.currentRoot.children[0].value &&
							[
								tokenTypesUsingSymbols.plus,
								tokenTypesUsingSymbols.plus_equals,
								tokenTypesUsingSymbols.minus,
								tokenTypesUsingSymbols.minus_equals,
								tokenTypesUsingSymbols.asterisk,
								tokenTypesUsingSymbols.asterisk_equals,

								// we don't support division or modulus operations since they return floats, which cannot be used as an index
								// if the user wants to use division or modulus, they can use a CallExpression instead that returns an integer
							].includes(this.currentRoot.children[0].value)) ||
						// a TernaryExpression is assumed to return an index or property name
						// it's possible it'll return an incompatiable type, but we'll let the compiler handle that
						this.currentRoot.children[0].type === NT.TernaryExpression)
				) {
					// some surgery is required:
					// we're in a MemberListExpression.MemberList, and need to be a MemberExpression
					// we're changing from a MemberListExpression -> [objectNode, propertyNode: MemberList -> this] to MemberExpression -> [objectNode, propertyNode: this]
					ChangeNodeType(this.currentRoot.parent, NT.MemberExpression);

					// make a copy of the current node, replacing the parent with the parent of the newly changed MemberExpression
					// keep this in a variable, rather than inlining it, to avoid pointer issues
					const currentRootIncumbent: Node = {
						...this.currentRoot.children[0],
						parent: this.currentRoot.parent,
					};

					this.currentRoot = this.currentRoot.parent;

					// replace the second child with the new node (the first child is the member object which we're not touching, the second child is the member property)
					this.currentRoot.children[1] = currentRootIncumbent;
				}

				this.endExpressionIfIn(NT.ArrayExpression);
				this.endExpressionIfIn(NT.ArrayOf);
				this.endExpressionIfIn(NT.MemberList);
				this.endExpressionIfIn(NT.MemberListExpression);
				this.endExpressionWhileIn([NT.TypeInstantiationExpression]);
				this.endExpressionIfIn(NT.MemberExpression);
			} else if (token.type === 'bool') {
				this.addNode(MakeNode(NT.BoolLiteral, token, this.currentRoot));
			} else if (token.type === 'number') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				if (this.debug) {
					console.debug(
						`Creating a NumberLiteral Node in ${this.lineage(this.currentRoot)} for "${token.value}"`,
					);
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

				// check if we're in one of the known Parent node types, if so, begin a child
				if (this.currentRoot.type in this.mapParentNodeToChild) {
					const subNode = this.mapParentNodeToChild[this.currentRoot.type] as NT;
					if (this.debug) {
						console.debug(
							`Currently there is a ${this.currentRoot.type} open; now creating a ${subNode} Node in it`,
						);
					}

					this.beginExpressionWith(MakeNode(subNode, token, this.currentRoot, true));
				}

				// if we're in a VariableDeclaration, we begin an AssigneesList
				if (this.currentRoot.type === NT.VariableDeclaration) {
					if (this.debug) {
						console.debug(
							`Creating an AssigneesList Node in ${this.currentRoot.type} for "${token.value}"`,
						);
					}

					// begin an AssigneesList node
					this.beginExpressionWith(MakeNode(NT.AssigneesList, token, this.currentRoot, true));
				}

				if (this.debug) {
					console.debug(`Creating an Identifier Node in ${this.currentRoot.type} for "${token.value}"`);
				}

				this.addNode(MakeNode(NT.Identifier, token, this.currentRoot));

				// check if currentRoot is a MemberExpression and next token is not a <| (types), and if so, it's finished
				// since there may not be brackets. eg. `a.b` vs `a['b']`
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
				// end an AssigneesList if we're in one
				this.endExpressionIfIn(NT.AssigneesList);

				// end a TypeArgumentsList if we're in one
				this.endExpressionIfIn(NT.TypeArgumentsList);

				if (!([NT.Parameter, NT.VariableDeclaration] as NT[]).includes(this.currentRoot.type)) {
					// create an AssigneesList node taking the previous node as its child
					{
						const result = this.beginExpressionWithAdoptingPreviousNode(
							MakeNode(NT.AssigneesList, token, this.currentRoot, true),
						);
						if (result.outcome === 'error') {
							return result;
						}
					}

					// then create an AssignmentExpression node taking the AssigneesList as its child
					{
						const result = this.beginExpressionWithAdoptingCurrentRoot(
							MakeNode(NT.AssignmentExpression, token, this.currentRoot, true),
						);
						if (result.outcome === 'error') {
							return result;
						}
					}

					// the currentRoot is now the AssignmentExpression and its child is the AssigneesList

					// Check backwards for other identifiers as this may be assigning
					// multiple variables. Get this.currentRoot's previous siblings
					// in pairs of two and check if they're an identifier and a comma
					let oneSiblingBack = this.currentRoot.parent?.children.at(-2);
					let twoSiblingsBack = this.currentRoot.parent?.children.at(-3);
					while (oneSiblingBack?.type === NT.CommaSeparator && twoSiblingsBack?.type === NT.Identifier) {
						// adopt the CommaSeparator and place it as the currentRoot's first grandchild
						this.adoptNode(this.currentRoot.parent, oneSiblingBack, this.currentRoot.children[0], false);

						// adopt the Identifier and place it as the currentRoot's first grandchild
						this.adoptNode(this.currentRoot.parent, twoSiblingsBack, this.currentRoot.children[0], false);

						// keep on going back and checking for more identifiers and commas
						// we don't have to decrement the index because each time a node
						// is adopted, it is removed from the parent's children array
						// This cycle continues in pairs of two.
						oneSiblingBack = this.currentRoot.parent?.children.at(-2);
						twoSiblingsBack = this.currentRoot.parent?.children.at(-3);
					}
				}

				this.addNode(MakeNode(NT.AssignmentOperator, token, this.currentRoot, true));

				if (
					this.currentRoot.type === NT.VariableDeclaration ||
					this.currentRoot.type === NT.AssignmentExpression
				) {
					// now begin an NT.AssignablesList node
					this.beginExpressionWith(MakeNode(NT.AssignablesList, token, this.currentRoot, true));
				}
			} else if (token.type === 'plus') {
				this.endExpressionIfIn(NT.UnaryExpression);
				const result = this.handleBinaryExpression(token);
				if (result.outcome === 'error') {
					return result;
				}
			} else if (token.type === 'minus') {
				if (
					this.currentRoot.children.length > 0 &&
					this.nodeTypesPrecedingArithmeticOperator.includes(
						this.currentRoot.children[this.currentRoot.children.length - 1].type,
					) &&
					this.currentRoot.type !== NT.BinaryExpression &&
					this.currentRoot.type !== NT.RangeExpression // excludes scenarios such as `3^e-2`, `3 + -2`, `1 .. -2`
				) {
					this.endExpressionIfIn(NT.UnaryExpression);
					const result = this.handleBinaryExpression(token);
					if (result.outcome === 'error') {
						return result;
					}
				} else {
					// otherwise this is a unary operator
					this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
				}
			} else if (token.type === 'plus_plus' || token.type === 'minus_minus') {
				// check token before, then check token after
				// works on an Identifier, and MemberExpression
				const [, prevType] = this.prev();
				if (prevType === NT.Identifier || prevType === NT.MemberExpression) {
					// this is postfix
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeUnaryExpressionNode(token, false, this.currentRoot),
					);
					if (result.outcome === 'error') {
						return result;
					}
				} else {
					// this is prefix
					this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
				}
			} else if (token.type === 'asterisk') {
				const result = this.handleBinaryExpression(token);
				if (result.outcome === 'error') {
					return result;
				}
			} else if (token.type === 'forward_slash') {
				const result = this.handleBinaryExpression(token);
				if (result.outcome === 'error') {
					return result;
				}
			} else if (token.type === 'mod') {
				const result = this.handleBinaryExpression(token);
				if (result.outcome === 'error') {
					return result;
				}
			} else if (token.type === 'exponent') {
				const result = this.beginExpressionWithAdoptingPreviousNode(
					MakeNode(NT.BinaryExpression, token, this.currentRoot),
				);
				if (result.outcome === 'error') {
					return result;
				}
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
				let [prev, prevType] = this.prev();

				if (prev && prevType === NT.TypeArgumentsList) {
					const [twoBack, twoBackType] = this.prev(2);
					if (
						twoBackType &&
						([NT.Identifier, NT.MemberExpression, NT.ThisKeyword] as NT[]).includes(twoBackType)
					) {
						// we're in a MemberExpression after the GenericTypesList
						// eg. `foo<bar>.baz`
						// we need to create a new TypeInstantiationExpression node
						// capturing the previous two nodes of Identifier and GenericTypesList
						const typeInstantiationExpressionNode = MakeNode(
							NT.TypeInstantiationExpression,
							token,
							this.currentRoot,
							true,
						);
						let wasAdopted = this.adoptNode(this.currentRoot, twoBack, typeInstantiationExpressionNode);
						if (wasAdopted.outcome === 'error') {
							return error(wasAdopted.error);
						}

						wasAdopted = this.adoptNode(this.currentRoot, prev, typeInstantiationExpressionNode);
						this.beginExpressionWith(typeInstantiationExpressionNode);
						this.endExpression(); // end the TypeInstantiationExpression

						// once done, this new node then becomes the "previous" for the next if
						prev = typeInstantiationExpressionNode;
						prevType = this.getEffectiveTypeOfNode(prev);
					}
				} // do not connect this to the next if since this is independent of the next if

				if (
					prevType === NT.CallExpression ||
					prevType === NT.Identifier ||
					prevType === NT.MemberExpression ||
					prevType === NT.Type ||
					prevType === NT.TypeInstantiationExpression ||
					prevType === NT.ThisKeyword
				) {
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeNode(NT.MemberExpression, token, this.currentRoot, true),
					);
					if (result.outcome === 'error') {
						return result;
					}
				}
			} else if (token.type === 'dotdotdot') {
				this.ifInWhenExpressionBlockStatementBeginCase(token);

				// check if we're in a ParametersList, if so, begin a Parameter
				if (this.currentRoot.type === NT.ParametersList) {
					this.beginExpressionWith(MakeNode(NT.Parameter, token, this.currentRoot, true));
				}

				this.addNode(MakeNode(NT.RestElement, token, this.currentRoot));
			} else if (token.type === 'colon') {
				if (this.currentRoot.type === NT.TernaryConsequent) {
					// TernaryExpression
					this.endExpression(); // end the TernaryConsequent
					this.beginExpressionWith(MakeNode(NT.TernaryAlternate, token, this.currentRoot, true));
				} else if (this.currentRoot.type === NT.ObjectExpression && this.prev()[1] === NT.Identifier) {
					// POJOs notation
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeNode(NT.Property, token, this.currentRoot, true),
					);
					if (result.outcome === 'error') {
						return result;
					}
				} else if (this.currentRoot.type === NT.ObjectShape && this.prev()[1] === NT.Identifier) {
					// POJOs notation
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeNode(NT.PropertyShape, token, this.currentRoot, true),
					);
					if (result.outcome === 'error') {
						return result;
					}
				} else {
					if (this.currentRoot.type === NT.BlockStatement) {
						// convert BlockStatement to an ObjectExpression and create a Property node
						this.currentRoot.type = NT.ObjectExpression;

						const result = this.beginExpressionWithAdoptingPreviousNode(
							MakeNode(NT.Property, token, this.currentRoot, true),
						);
						if (result.outcome === 'error') {
							return result;
						}
					} else {
						this.endExpressionIfIn(NT.AssigneesList);

						this.addNode(MakeNode(NT.ColonSeparator, token, this.currentRoot));

						if (this.currentRoot.type === NT.VariableDeclaration) {
							this.beginExpressionWith(MakeNode(NT.TypeArgumentsList, token, this.currentRoot, true));
						}
					}
				}
			} else if (token.type === 'comma') {
				if (this.currentRoot.type === NT.TernaryAlternate) {
					this.endExpression(); // end the TernaryAlternate
					this.endExpression(); // end the TernaryExpression
					this.endExpressionIfIn(NT.Property); // end if in Property
				} else if (this.currentRoot.type === NT.WhenCaseConsequent) {
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (
					this.currentRoot.type === NT.CallExpression &&
					this.currentRoot.parent?.type === NT.WhenCaseConsequent
				) {
					this.endExpression(); // end the CallExpression
					this.endExpression(); // end the WhenCaseConsequent
					this.endExpression(); // end the WhenCase
				} else if (this.currentRoot.type === NT.BinaryExpression) {
					this.endExpression();
				} else if (this.currentRoot.type === NT.UnaryExpression) {
					this.endExpression();
				} else if (this.currentRoot.type === NT.Parameter || this.currentRoot.type === NT.TypeParameter) {
					this.endExpression();
				} else if (
					this.currentRoot.type === NT.ClassExtension ||
					this.currentRoot.type === NT.ClassImplement ||
					this.currentRoot.type === NT.EnumExtension ||
					this.currentRoot.type === NT.InterfaceExtension
				) {
					this.endExpression();
				} else if (this.currentRoot.type === NT.Property || this.currentRoot.type === NT.PropertyShape) {
					this.endExpression();
				} else if (this.currentRoot.type === NT.RangeExpression) {
					this.endExpression();
				}

				// postfix `if` in an array
				// this is separate from the above if/elses since this can happen _after and in addition to_ one of the above scenarios
				if (
					this.currentRoot.type === NT.PostfixIfStatement &&
					this.currentRoot.parent?.type === NT.ArrayExpression
				) {
					this.endExpression(); // end the IfStatement which _is_ the entry
				}

				this.addNode(MakeNode(NT.CommaSeparator, token, this.currentRoot));
			} else if (
				[
					// logic
					'and',
					'or',

					// math
					'asterisk_equals',
					'forward_slash_equals',
					'minus_equals',
					'mod_equals',
					'plus_equals',

					// comparison
					'compare',
					'equals',
					'less_than_equals',
					'more_than_equals',
					'not_equals',
				].includes(token.type)
			) {
				// '<=>' can be a function name
				if (token.type === 'compare' && this.isCurrentRootAFunctionInAClass()) {
					this.addNode(MakeNode(NT.Identifier, token, this.currentRoot));
				} else {
					const result = this.handleBinaryExpression(token);
					if (result.outcome === 'error') {
						return result;
					}
				}
			} else if (token.type === 'type') {
				// check if we're in one of the known Parent node types, if so, begin a child
				if (this.currentRoot.type in this.mapParentNodeToChild) {
					const subNode = this.mapParentNodeToChild[this.currentRoot.type] as NT;
					if (this.debug) {
						console.debug(
							`Currently there is a ${this.currentRoot.type} open; now creating a ${subNode} Node in it`,
						);
					}

					this.beginExpressionWith(MakeNode(subNode, token, this.currentRoot, true));
				}

				this.addNode(MakeNode(NT.Type, token, this.currentRoot));
			} else if (token.type === 'bang') {
				this.beginExpressionWith(MakeUnaryExpressionNode(token, true, this.currentRoot));
			} else if (token.type === 'right_arrow') {
				if (this.currentRoot.type === NT.WhenCaseValues) {
					this.endExpression();
					this.beginExpressionWith(MakeNode(NT.WhenCaseConsequent, token, this.currentRoot, true));
				} else if (
					this.currentRoot.type === NT.FunctionDeclaration ||
					this.currentRoot.type === NT.FunctionSignature
				) {
					this.beginExpressionWith(MakeNode(NT.FunctionReturns, token, this.currentRoot, true));
				} else {
					this.addNode(MakeNode(NT.RightArrowOperator, token, this.currentRoot));
				}
			} else if (token.type === 'dotdot') {
				const result = this.beginExpressionWithAdoptingPreviousNode(
					MakeNode(NT.RangeExpression, token, this.currentRoot, true),
				);
				if (result.outcome === 'error') {
					return result;
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

				if (
					(
						[
							NT.ClassDeclaration,
							NT.EnumDeclaration,
							NT.FunctionDeclaration,
							NT.FunctionSignature,
							NT.InterfaceDeclaration,
						] as NT[]
					).includes(this.currentRoot.type)
				) {
					this.beginExpressionWith(MakeNode(NT.TypeParametersList, token, this.currentRoot, true));
				} else {
					const [, prevType] = this.prev();
					if (
						this.currentRoot.type === NT.ArgumentsList ||
						// foo.bar<|T|>
						(this.currentRoot.type === NT.MemberExpression && prevType === NT.Identifier)
					) {
						const result = this.beginExpressionWithAdoptingPreviousNode(
							MakeNode(NT.TypeInstantiationExpression, token, this.currentRoot, true),
						);
						if (result.outcome === 'error') {
							return result;
						}
					}

					this.beginExpressionWith(MakeNode(NT.TypeArgumentsList, token, this.currentRoot, true));
				}
			} else if (token.type === 'triangle_close') {
				this.endExpressionIfIn(NT.TypeArgumentsList);
				this.endExpressionIfIn(NT.TypeInstantiationExpression);

				this.endExpressionIfIn(NT.TypeParameter);
				this.endExpressionIfIn(NT.TypeParametersList);

				const [prev, prevType] = this.prev();
				if (prevType === NT.TypeArgumentsList) {
					const [twoBack, twoBackType] = this.prev(2);

					if (
						twoBackType &&
						([NT.Identifier, NT.MemberExpression, NT.ThisKeyword] as NT[]).includes(twoBackType) &&
						!(
							[NT.ClassExtension, NT.ClassImplement, NT.EnumExtension, NT.InterfaceExtension] as NT[]
						).includes(this.currentRoot.type) &&
						this.lexer.peek(0) !== tokenTypesUsingSymbols.paren_open // CallExpression
					) {
						// we're in a MemberExpression after the GenericTypesList
						// eg. `foo<bar>.baz`
						// we need to create a new TypeInstantiationExpression node
						// capturing the previous two nodes of Identifier and GenericTypesList
						const typeInstantiationExpressionNode = MakeNode(
							NT.TypeInstantiationExpression,
							token,
							this.currentRoot,
							true,
						);
						let wasAdopted = this.adoptNode(this.currentRoot, twoBack, typeInstantiationExpressionNode);
						if (wasAdopted.outcome === 'error') {
							return error(wasAdopted.error);
						}

						wasAdopted = this.adoptNode(this.currentRoot, prev, typeInstantiationExpressionNode);
						this.beginExpressionWith(typeInstantiationExpressionNode);
						this.endExpression(); // end the TypeInstantiationExpression
					}
				}

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

				const [, prevType] = this.prev();

				const literals: NT[] = [NT.BoolLiteral, NT.NumberLiteral, NT.StringLiteral];
				const nodeTypesThatPrecedeABinaryExpression: NT[] = [
					NT.Identifier,
					...literals,
					NT.CallExpression,
					NT.MemberExpression,
					NT.UnaryExpression,
				];

				if (this.currentRoot.type === NT.FunctionReturns || this.currentRoot.type === NT.TypeArgumentsList) {
					this.beginExpressionWith(MakeNode(NT.TupleShape, token, this.currentRoot, true));
				} else if (typeof prevType === 'undefined') {
					// TupleExpression
					this.beginExpressionWith(MakeNode(NT.TupleExpression, token, this.currentRoot, true));
				} else if (this.currentRoot.type === NT.Property && prevType === NT.Identifier) {
					// TupleExpression
					this.beginExpressionWith(MakeNode(NT.TupleExpression, token, this.currentRoot, true));
				} else if (this.currentRoot.type === NT.PropertyShape && prevType === NT.Identifier) {
					// TupleShape
					this.beginExpressionWith(MakeNode(NT.TupleShape, token, this.currentRoot, true));
				} else if (nodeTypesThatPrecedeABinaryExpression.includes(prevType)) {
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeNode(NT.BinaryExpression, token, this.currentRoot),
					);
					if (result.outcome === 'error') {
						return result;
					}
				} else if (prevType === NT.ArgumentsList && this.currentRoot.type === NT.CallExpression) {
					// we need to go 2 levels up
					const result = this.beginExpressionWithAdoptingCurrentRoot(
						MakeNode(NT.BinaryExpression, token, this.currentRoot),
					);
					if (result.outcome === 'error') {
						return result;
					}
				} else if (prevType === NT.ColonSeparator && this.currentRoot.type !== NT.ObjectExpression) {
					this.beginExpressionWith(MakeNode(NT.TupleShape, token, this.currentRoot, true));
				} else {
					this.beginExpressionWith(MakeNode(NT.TupleExpression, token, this.currentRoot, true));
				}
			} else if (token.type === 'more_than') {
				/**
				 * > can be:
				 * - a number comparison
				 * - the end of a TupleExpression
				 */

				// first close out a ternary
				if (this.currentRoot.type === NT.TernaryAlternate) {
					this.endExpression(); // end the TernaryAlternate
					this.endExpression(); // end the TernaryExpression
				}

				// then, then other stuff

				if (this.currentRoot.type === NT.TupleExpression || this.currentRoot.type === NT.TupleShape) {
					this.endExpression(); // end the TupleExpression or TupleShape
				} else {
					// 'more than' BinaryExpression
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeNode(NT.BinaryExpression, token, this.currentRoot),
					);
					if (result.outcome === 'error') {
						return result;
					}
				}
			} else if (token.type === 'this') {
				this.addNode(MakeNode(NT.ThisKeyword, token, this.currentRoot, true));
			} else if (token.type === 'keyword') {
				if (this.debug) {
					console.debug(`Handling keyword "${token.value}"`);
				}

				switch (token.value) {
					case 'abstract':
					case 'static':
						// can either be a ClassDeclaration, EnumDeclaration, FunctionDeclaration or VariableDeclaration

						// the simplest way is to start a ModifiersList,
						// then when we come across a one of those declarations, we check if this.currentRoot is a ModifiersList

						if (this.currentRoot.type !== NT.ModifiersList) {
							if (this.debug) {
								console.debug('Beginning a ModifiersList');
							}

							this.beginExpressionWith(MakeNode(NT.ModifiersList, token, this.currentRoot, true));
						}

						if (this.debug) {
							console.debug(
								`Creating a Modifier Node in ${this.lineage(this.currentRoot)} for "${token.value}"`,
							);
						}

						this.addNode(MakeNode(NT.Modifier, token, this.currentRoot));
						break;
					case 'class':
						{
							const classDeclaration = this.parseClassOrEnumDeclaration(
								token,
								NT.ClassDeclaration,
								'ClassDeclaration',
							);

							if (classDeclaration.outcome === 'error') {
								return classDeclaration;
							}

							// do NOT return for ok bec if you do, it will exit the loop
						}
						break;
					case 'const':
					case 'let':
						{
							let variableNode: Result<Node>;

							// the VariableDeclaration may have already started with some Modifier(s)
							if (this.currentRoot.type === NT.ModifiersList) {
								if (this.debug) {
									console.debug(
										'Currently there is a ModifiersList open; now beginning VariableDeclaration and adopting the ModifiersList',
									);
								}

								variableNode = this.beginExpressionWithAdoptingCurrentRoot(
									MakeNode(NT.VariableDeclaration, token, this.currentRoot),
								);
							} else {
								if (this.debug) {
									console.debug(
										'There is no ModifiersList open; now beginning a VariableDeclaration',
									);
								}

								variableNode = ok(
									this.beginExpressionWith(MakeNode(NT.VariableDeclaration, token, this.currentRoot)),
								);
							}

							switch (variableNode.outcome) {
								// do NOT return for ok bec if you do, it will exit the loop
								case 'ok':
									this.adoptPrecedingJoeDocIfPresent(variableNode.value);
									break;
								case 'error':
									return error(variableNode.error);
									break;
							}
						}
						break;
					case 'done':
						this.addNode(MakeNode(NT.DoneStatement, token, this.currentRoot, true));
						break;
					case 'else':
						// no need to do anything with this.
						// A subsequent BlockStatement will go into the previous IfStatement
						// A subsequent IfStatement will do the same
						// Just check if we're in an IfStatement
						if (this.currentRoot.type !== NT.IfStatement) {
							return error(
								new ParserError(
									ParserErrorCode.MisplacedKeyword,
									'`else` keyword is used with if statements',
									this.currentRoot,
									this.getErrorContext(token.value.length),
								),
							);
						}
						break;

					case 'enum':
						{
							const enumDeclaration = this.parseClassOrEnumDeclaration(
								token,
								NT.EnumDeclaration,
								'EnumDeclaration',
							);

							if (enumDeclaration.outcome === 'error') {
								return enumDeclaration;
							}

							// do NOT return for ok bec if you do, it will exit the loop
						}
						break;

					case 'extends':
						if (this.currentRoot.type === NT.ClassDeclaration) {
							this.beginExpressionWith(MakeNode(NT.ClassExtensionsList, token, this.currentRoot, true));
						} else if (this.currentRoot.type === NT.EnumDeclaration) {
							this.beginExpressionWith(MakeNode(NT.EnumExtensionsList, token, this.currentRoot, true));
						} else if (this.currentRoot.type === NT.InterfaceDeclaration) {
							this.beginExpressionWith(
								MakeNode(NT.InterfaceExtensionsList, token, this.currentRoot, true),
							);
						} else {
							return error(
								new ParserError(
									ParserErrorCode.MisplacedKeyword,
									'`extends` keyword is used for a Class, Enum, or Interface to extend another',
									this.currentRoot,
									this.getErrorContext(token.value.length),
								),
							);
						}
						break;
					case 'f':
						{
							// the FunctionDeclaration may have already started with a Modifier
							let fNode: Result<Node>;
							if (this.currentRoot.type === NT.ModifiersList) {
								if (this.debug) {
									console.debug(
										'Currently there is a ModifiersList open; now beginning FunctionDeclaration and adopting the ModifiersList',
									);
								}

								fNode = this.beginExpressionWithAdoptingCurrentRoot(
									MakeNode(NT.FunctionDeclaration, token, this.currentRoot, true),
								);
							} else {
								if (this.debug) {
									console.debug(
										'There is no ModifiersList open; now beginning a FunctionDeclaration',
									);
								}

								// if we're after a ColonSeparator, then this is a FunctionSignature
								if (
									this.prev()[1] === NT.ColonSeparator ||
									this.currentRoot.type === NT.FunctionReturns
								) {
									fNode = ok(
										this.beginExpressionWith(
											MakeNode(NT.FunctionSignature, token, this.currentRoot, true),
										),
									);
								} else {
									fNode = ok(
										this.beginExpressionWith(
											MakeNode(NT.FunctionDeclaration, token, this.currentRoot, true),
										),
									);
								}
							}

							switch (fNode.outcome) {
								// do NOT return for ok bec if you do, it will exit the loop
								case 'ok':
									this.adoptPrecedingJoeDocIfPresent(fNode.value);
									break;
								case 'error':
									return error(fNode.error);
									break;
							}
						}
						break;
					case 'from':
						this.addNode(MakeNode(NT.FromKeyword, token, this.currentRoot, true));
						break;
					case 'for':
						this.beginExpressionWith(MakeNode(NT.ForStatement, token, this.currentRoot, true));
						break;
					case 'if':
						{
							// check token before, then check token after
							// works on a CallExpression as well as Literal in an ArrayExpression
							const [, prevType] = this.prev();
							if (
								prevType === NT.CallExpression ||
								this.nodeTypesThatAllowAPostfixIf.includes(this.currentRoot.type)
							) {
								// this is after, therefore take the CallExpression, array element, or Property
								const result = this.beginExpressionWithAdoptingPreviousNode(
									MakeNode(NT.PostfixIfStatement, token, this.currentRoot, true),
								);
								if (result.outcome === 'error') {
									return result;
								}
							} else {
								// this is before

								// if prev token is 'else', this IfStatement goes into current node
								// Otherwise it's a new IfStatement and we must first close the current IfStatement if we're in one.

								// the token is already ready for the next, so we need to go 2 back
								const prevToken = this.lexer.prevToken(2);
								if (
									this.currentRoot.type === NT.IfStatement &&
									typeof prevToken !== 'undefined' &&
									!(prevToken.type === 'keyword' && prevToken.value === 'else')
								) {
									if (this.debug) {
										console.debug(
											'Found an "if" statement after another "if" without an "else"; now closing the first IfStatement',
										);
									}

									this.endExpression(); // end the IfStatement
								}

								this.beginExpressionWith(MakeNode(NT.IfStatement, token, this.currentRoot, true));
							}
						}
						break;
					case 'implements':
						this.endExpressionIfIn(NT.ClassExtension);
						this.endExpressionIfIn(NT.ClassExtensionsList);

						this.beginExpressionWith(MakeNode(NT.ClassImplementsList, token, this.currentRoot, true));
						break;
					case 'import':
						this.beginExpressionWith(MakeNode(NT.ImportDeclaration, token, this.currentRoot, true));
						break;
					case 'in':
						{
							// eg. for const i in ary {}, so we end the VariableDeclaration
							this.endExpressionIfIn(NT.AssigneesList);
							this.endExpressionIfIn(NT.VariableDeclaration);

							// check the previous node, which should be either a VariableDeclaration or an Identifier
							const [prev, prevType] = this.prev();
							if (typeof prev === 'undefined') {
								return error(
									new ParserError(
										ParserErrorCode.MissingPreviousNode,
										'We hoped to find a variable before it, but alas!',
										this.currentRoot,
										this.getErrorContext((token.value || '').length),
									),
								);
							}

							if (
								(this.currentRoot.type === NT.ForStatement ||
									(this.currentRoot.type === NT.Parenthesized &&
										this.currentRoot.parent?.type === NT.ForStatement)) &&
								([NT.Identifier, NT.VariableDeclaration] as NT[]).includes(prevType)
							) {
								this.addNode(MakeNode(NT.InKeyword, token, this.currentRoot, true));
							} else {
								return error(
									new ParserError(
										ParserErrorCode.MissingParentNode,
										'Misplaced keyword "in" found. Do you mean to use a "for" loop?',
										this.currentRoot,
										this.getErrorContext((token.value || '').length),
									),
								);
							}
						}
						break;
					case 'interface':
						{
							const interfaceNode = this.beginExpressionWith(
								MakeNode(NT.InterfaceDeclaration, token, this.currentRoot, true),
							);
							const result = this.adoptPrecedingJoeDocIfPresent(interfaceNode);
							// do NOT return for ok bec if you do, it will exit the loop
							if (result.outcome === 'error') {
								return result;
							}
						}
						break;
					case 'loop':
						this.beginExpressionWith(MakeNode(NT.LoopStatement, token, this.currentRoot, true));
						break;
					case 'next':
						this.addNode(MakeNode(NT.NextStatement, token, this.currentRoot, true));
						break;
					case 'or':
						{
							const result = this.beginExpressionWithAdoptingPreviousNode(
								MakeNode(NT.BinaryExpression, token, this.currentRoot),
							);
							if (result.outcome === 'error') {
								return result;
							}
						}
						break;
					case 'print':
						this.beginExpressionWith(MakeNode(NT.PrintStatement, token, this.currentRoot, true));
						break;
					case 'return':
						this.beginExpressionWith(MakeNode(NT.ReturnStatement, token, this.currentRoot, true));
						break;
					case 'when':
						this.beginExpressionWith(MakeNode(NT.WhenExpression, token, this.currentRoot, true));
						break;
					default:
						return error(
							new ParserError(
								ParserErrorCode.UnknownKeyword,
								`Unknown keyword "${token.value}"`,
								this.currentRoot,
								this.getErrorContext((token.value || '').length),
							),
						);
						break;
				}
			} else if (token.type === 'path') {
				this.addNode(MakeNode(NT.Path, token, this.currentRoot));
			} else if (token.type === 'question') {
				{
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeNode(NT.TernaryExpression, token, this.currentRoot, true),
					);
					if (result.outcome === 'error') {
						return result;
					}
				}

				{
					const result = this.beginExpressionWithAdoptingPreviousNode(
						MakeNode(NT.TernaryCondition, token, this.currentRoot, true),
					);
					if (result.outcome === 'error') {
						return result;
					}
				}

				this.endExpression(); // end the TernaryCondition
				this.beginExpressionWith(MakeNode(NT.TernaryConsequent, token, this.currentRoot, true));
			} else {
				return error(
					new ParserError(
						ParserErrorCode.UnknownToken,
						`Unknown token "${token.value}"`,
						this.currentRoot,
						this.getErrorContext((token.value || '').length),
					),
				);
			}
		} while (this.currentToken.outcome === 'ok');

		if (this.debug) {
			console.debug(inspect(this.root, { showHidden: true, depth: null }));
		}

		return ok(this.root);
	}

	private parseClassOrEnumDeclaration(token: Token, nodeType: NT, name: string): Result<Node, Error, unknown> {
		// the Declaration may have already started with some Modifier(s)
		let declarationNode: Result<Node>;
		if (this.currentRoot.type === NT.ModifiersList) {
			if (this.debug) {
				console.debug(
					`Currently there is a ModifiersList open; now beginning ${name} and adopting the ModifiersList`,
				);
			}

			declarationNode = this.beginExpressionWithAdoptingCurrentRoot(
				MakeNode(nodeType, token, this.currentRoot, true),
			);
		} else {
			if (this.debug) {
				console.debug(`There is no ModifiersList open; now beginning a ${name}`);
			}

			// beginExpressionWith doesn't return a Result<>
			declarationNode = ok(this.beginExpressionWith(MakeNode(nodeType, token, this.currentRoot, true)));
		}

		switch (declarationNode.outcome) {
			case 'ok':
				this.adoptPrecedingJoeDocIfPresent(declarationNode.value);

				return declarationNode;
				break;
			case 'error':
				return error(declarationNode.error);
				break;
		}
	}

	/**
	 * When applicable, checks for the presence of a preceding JoeDoc and adopts it
	 *
	 * @param applicableNode for Class, Enum, Function, Interface, or Variable
	 * @returns the applicableNode regardless
	 */
	private adoptPrecedingJoeDocIfPresent(applicableNode: Node): Result<Node> {
		// grab preceding JoeDoc, if any
		const prevNode = this.currentRoot.parent?.children.at(-2);

		// if can't find, that's ok and just return
		if (typeof prevNode === 'undefined' || prevNode?.type !== NT.JoeDoc) {
			return ok(applicableNode);
		}

		const wasAdopted = this.adoptNode(this.currentRoot.parent, prevNode, applicableNode);
		switch (wasAdopted.outcome) {
			case 'ok':
				return ok(applicableNode);
				break;
			case 'error':
				return error(wasAdopted.error);
				break;
		}
	}

	/**
	 * Shortcut method to handle all scenarios of a BinaryExpression
	 *
	 * @param token Current token
	 */
	private handleBinaryExpression(token: Token): Result<Node> {
		// TODO add PEMDAS

		if (this.currentRoot.type === NT.BinaryExpression && ['and', 'or'].includes(token.type)) {
			// && and || have higher order precedence than equality checks
			return this.beginExpressionWithAdoptingCurrentRoot(MakeNode(NT.BinaryExpression, token, this.currentRoot));
		} else {
			return this.beginExpressionWithAdoptingPreviousNode(
				MakeNode(NT.BinaryExpression, token, this.currentRoot),
				'a value',
			);
		}
	}

	/** Shortcut method to check if the current root is a FunctionDeclaration and is inside of a ClassDeclaration */
	private isCurrentRootAFunctionInAClass() {
		return (
			this.currentRoot.type === NT.FunctionDeclaration &&
			this.currentRoot.parent?.parent?.type === NT.ClassDeclaration
		);
	}

	private ifInWhenExpressionBlockStatementBeginCase(token: Token) {
		if (this.currentRoot.type === NT.BlockStatement && this.currentRoot.parent?.type === NT.WhenExpression) {
			this.beginExpressionWith(MakeNode(NT.WhenCase, token, this.currentRoot, true));
			this.beginExpressionWith(MakeNode(NT.WhenCaseValues, token, this.currentRoot, true));
		}
	}

	/**
	 * Gets a previous node and its effective type. We recommend using this instead of prev.type
	 *
	 * @see {@link getEffectiveTypeOfNode} for more details on effective type
	 *
	 * @param howMany - How many to go back? Defaults to 1
	 * @returns [the previous node, the effective type of the previous node] or [undefined, undefined]
	 */
	private prev(howMany = 1): [Node, NT] | [undefined, undefined] {
		const prevAtX = this.currentRoot.children.at(-howMany);
		if (typeof prevAtX === 'undefined') {
			return [undefined, undefined];
		}

		return [prevAtX, this.getEffectiveTypeOfNode(prevAtX)];
	}

	/**
	 * Sometimes we want to know the effective type of a node in order to make decisions.
	 * In most cases, this is the same as the node's type. However, there are some cases
	 * where the effective type is different than the node's type. For example, a Parenthesized
	 * node's effective type is the type of its child. This method handles those cases.
	 *
	 * @param node To get the effective type of
	 */
	private getEffectiveTypeOfNode(node: Node): NT;
	private getEffectiveTypeOfNode(node: undefined): undefined;
	private getEffectiveTypeOfNode(node: Node | undefined): NT | undefined {
		if (typeof node === 'undefined') {
			return undefined;
		}

		if (node.type === NT.Parenthesized && node.children.length === 1) {
			// there should only ever be one child
			return this.getEffectiveTypeOfNode(node.children[0]);
		}

		// if we get here, we can just return the node's type because either it's not a
		// Parenthesized node or it is a Parenthesized node with not exactly 1 child,
		// so return the node's type as-is.
		return node.type;
	}

	/**
	 * Gets the next token
	 *
	 * @returns the next token
	 */
	private getNextToken(): Result<Token> {
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
	 * @returns A response error if there is no previous node
	 */
	private beginExpressionWithAdoptingPreviousNode(newKid: Node, whatWeExpectInPrevNode?: string): Result<Node> {
		return this.beginExpressionWithAdopting(newKid, this.prev()[0], whatWeExpectInPrevNode);
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
	 * @returns A response error if there is no previous node
	 */
	private beginExpressionWithAdoptingCurrentRoot(newKid: Node): Result<Node> {
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
	private beginExpressionWithAdopting(
		newKid: Node,
		adoptee: Node | undefined,
		whatWeExpectInPrevNode?: string,
	): Result<Node> {
		if (typeof adoptee === 'undefined') {
			return error(
				new ParserError(
					ParserErrorCode.MissingPreviousNode,
					`"${newKid.value}" is a ${newKid.type} and we hoped to find ${
						whatWeExpectInPrevNode || 'something'
					} before it, but alas!`,
					this.currentRoot,
					this.getErrorContext((newKid.value || '').length),
				),
			);
		}

		if (this.debug) {
			// Note in this case, it IS possible for adoptee to be a Parenthesized, and while under
			// many circumstances, we would want to get the effective type, but here we want to log
			// the actual type for debugging, so we use adoptee.type instead of the effective type.
			console.debug(`Moving ${adoptee.type} to under ${newKid.type}`);
		}

		// make a reference for convenience
		const adopteesParent = adoptee.parent as Node;

		// this.currentRoot will be reassigned toward the end

		const wasAdopted = this.adoptNode(adopteesParent, adoptee, newKid);
		switch (wasAdopted.outcome) {
			case 'ok':
				// (c) Attach newKid to currentRoot's parent's children
				adopteesParent.children.push(newKid);
				newKid.parent = adopteesParent;

				// (d) Update this.currentRoot = newKid
				// The currentRoot is dead (well, not really). Long live the currentRoot.
				this.currentRoot = newKid;

				if (this.debug) {
					console.debug(
						`Finished moving this.currentRoot; this.currentRoot is now ${this.lineage(this.currentRoot)}`,
					);
				}

				return ok(newKid);
			case 'error':
				return error(wasAdopted.error);
		}
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
	 * @param addToEnd - Whether to add to the end of the adopter's children. Default is true. If false, it will add to the beginning of the adopter's children.
	 */
	private adoptNode(
		adopteesParent: Node | undefined,
		adoptee: Node,
		adopter: Node,
		addToEnd = true,
	): Result<undefined> {
		if (typeof adopteesParent === 'undefined') {
			return error(
				new ParserError(
					ParserErrorCode.MissingParentNode,
					'Cannot find parent node',
					this.currentRoot,
					this.getErrorContext((adoptee.value || '').length),
				),
			);
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
		if (addToEnd) {
			// at the end
			adopter.children.push(copy);
		} else {
			// at the beginning
			adopter.children.unshift(copy);
		}

		copy.parent = adopter;

		return ok(undefined);
	}

	/**
	 * Runs when an expression has ended
	 */
	private endExpression() {
		if (this.debug) {
			console.debug(
				`Ending a ${this.lineage(this.currentRoot)}; this.currentRoot is now ${this.lineage(
					this.currentRoot.parent,
				)}`,
			);
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
	private endExpressionWhileIn(types: NT[]) {
		while (types.includes(this.currentRoot.type)) {
			this.endExpression();
		}
	}
}
