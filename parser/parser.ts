import { mathematicalPatterns, Token, TokenType } from "../lexer/types";
import { IdentifierNode, LiteralNode, Node } from './types';
import ParserError from './error';
import { Identifier, Literal, EnterVariableDeclaration, EnterExpression, EnterBinaryOperation } from './expressions';

export default class {
	tokens: Token[] = [];
	root: Node;
	currentLeaf;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
		this.root = {
			type: 'Program',
			start: 0,
			end: 0, // this will be updated
			nodes: [],
		};

		this.currentLeaf = this.root;
	}

	parse () {
		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];

			if (token.type === 'keyword') {
				if (token.value === 'let' || token.value === 'const') {
					// we expect 3 nodes followed by a semicolon:
					// the var name
					// the assignment operator, equal sign
					// the value

					// create variable declaration and attach to current leaf
					const variableDeclarationNode = EnterVariableDeclaration(token.value, token.start, this.currentLeaf);
					this.currentLeaf.nodes.push(variableDeclarationNode);
					this.currentLeaf = variableDeclarationNode;

					// update root.end
					this.root.end = semicolon.end;
				}
			} else if (token.type === 'identifier') {
				// get identifier and attach to current leaf
				this.getIdentifier(i, this.currentLeaf);
			} else if (token.type === 'paren') {
				if (token.value === '(') {
					const node = Enter
				}
			} else if (token.type === 'operator') {
				switch (token.value) {
					case '=':
						if (this.currentLeaf.type === 'VariableDeclaration') {
							this.currentLeaf.equals = '=';
						}
						break;
					case '+':
					case '-':
					case '*':
					case '/':
					case '%':
						// in foo = 1 + (2 * 3), we could be in the first or second operator
						// if in first, the currentLeaf is a VariableDeclaration
						// if in second, the currentLeaf is an Expression

						const node = EnterBinaryOperation(token.start, this.currentLeaf);

						if (this.currentLeaf.type === 'VariableDeclaration') {
							// move the rhs to here
							node.lhs = this.currentLeaf.rhs;

							// and this takes its place
							this.currentLeaf.rhs = node;
						} else if (this.currentLeaf.type === 'BinaryOperation') {
							// move the rhs to here
							node.lhs = this.currentLeaf.rhs;

							// and this takes its place
							this.currentLeaf.rhs = node;
						}
						break;
				}
			} else if (token.type === 'bool' || token.type === 'number' || token.type === 'string') {
				const node = Literal(token, this.currentLeaf, this.root)
				if (this.currentLeaf.type === 'VariableDeclaration') {
					this.currentLeaf.rhs = node;
				}
			}



					const rhs = this.getTokenOfTypes(++i, ['paren', 'bool', 'number', 'string']); // TODO add method invocation
					if (rhs.type === 'paren') {
						// create parens node and attach to leaf
						const expressionNode = EnterExpression(rhs.start, variableDeclarationNode);
						variableDeclarationNode.rhs = expressionNode;
					}
					const valueNode = this.getLiteral(i + 3);
					const semicolon = this.getTokenOfTypeAndValue(i + 4, 'separator', ';');

					(this.root.nodes = this.root.nodes || []).push(VariableDeclaration(
						token.value,
						identifierNodeLHS,
						valueNode,
						identifierNodeLHS.start,
						semicolon.end,
						this.root,
					));

		}

		return this.root;
	}

	getIdentifier (index: number, parent?: Node): IdentifierNode {
		const token = this.getTokenOfType(index, 'identifier');

		return {
			type: 'Identifier',
			name: token.value,
			start: token.start,
			end: token.end,
			parent,
			nodes: [],
		}
	}

	getLiteral (index: number): LiteralNode {
		const token = this.getTokenOfTypes(index, ['bool', 'number', 'string']);

		return Literal(token, undefined, this.root);

		// return {
		// 	type: 'Literal',
		// 	name: token.value,
		// 	start: token.start,
		// 	end: token.end,
		// }
	}

	/**
	 * attempts to get a token of one of the specified types at the specifed index.
	 * if undefined or incorrect type, throw an error
	 *
	 * @param index of the token
	 */
	getTokenOfTypes (index: number, types: TokenType[]) {
		const token = this.tokens[index];
		const prevToken = this.tokens[index - 1];
		if (typeof token === 'undefined') {
			throw new ParserError(`one of ${types.join(' or ')} expected at line ${prevToken.line}:${prevToken.end}`, this.root);
		}

		if (!types.includes(token.type)) {
			throw new ParserError(`one of ${types.join(' or ')} expected at line ${prevToken.line}:${prevToken.end}, ${token.type} found`, this.root);
		}

		return token;
	}

	/**
	 * attempts to get a token of specified type at the specifed index.
	 * if undefined or incorrect type, throw an error
	 *
	 * @param index of the token
	 */
	getTokenOfType (index: number, type: TokenType) {
		const token = this.tokens[index];
		const prevToken = this.tokens[index - 1];
		if (typeof token === 'undefined') {
			throw new ParserError(`${type} expected at line ${prevToken.line}:${prevToken.end}`, this.root);
		}

		if (token.type !== type) {
			throw new ParserError(`${type} expected at line ${prevToken.line}:${prevToken.end}, ${token.type} found`, this.root);
		}

		return token;
	}

	/**
	 * attempts to get a token of specified type and value at the specifed index.
	 * if undefined or incorrect type or value, throw an error
	 *
	 * @param index of the token
	 */
	 getTokenOfTypeAndValue (index: number, type: TokenType, value: string) {
		const token = this.tokens[index];
		const prevToken = this.tokens[index - 1];
		if (typeof token === 'undefined') {
			throw new ParserError(`${type} expected at line ${prevToken.line}:${prevToken.end}`, this.root);
		}

		if (token.type !== type) {
			throw new ParserError(`${type} expected at line ${prevToken.line}:${prevToken.end}, ${token.type} found`, this.root);
		}

		if (token.value !== value) {
			throw new ParserError(`${value} expected at line ${prevToken.line}:${prevToken.end}, ${value} found`, this.root);
		}

		return token;
	}
}
