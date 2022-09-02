import { Token, TokenType } from "../lexer/types";
import { Node, NodeType } from './types';
import ParserError from './error';
import { AdditionOperatorNode, AssignmentOperatorNode, CommentNode, DivisionOperatorNode, FilePathNode, KeywordNode, GenericNode, IdentifierNode, ImportDeclarationNode, LiteralNode, ModulusOperatorNode, MultiplicationOperatorNode, ParenthesizedNode, SemicolonSeparatorNode, SubtractionOperatorNode, UnaryExpressionNode, VariableDeclarationNode, BlockStatementNode } from './expressions';
import { inspect } from 'util';

export default class {
	tokens: Token[] = [];
	root: Node;
	currentLeaf: Node;
	debug = false; // if on, will output the AST at the end

	constructor(tokens: Token[], debug = false) {
		this.tokens = tokens;
		this.root = {
			type: 'Program',
			start: 0,
			end: 0, // this will be updated
			nodes: [],
		};

		this.currentLeaf = this.root;

		this.debug = debug;
	}

	public parse () {
		// node types that would come before a minus `-` symbol indicating it's a subtraction operator, rather than a unary operator
		const nodeTypesPrecedingSubtraction: NodeType[] = ['NumberLiteral', 'Identifier'];

		for (let i = 0; i < this.tokens.length; i++) {
			const token = this.tokens[i];

			if (token.type === 'paren') {
				if (token.value === '(') {
					this.beginExpressionWith(ParenthesizedNode(this.currentLeaf, token.start));
				} else {
					this.endExpression();

					// check if current leaf is a unary, if so, it's finished
					this.ifInUnaryExpressionEndIt();
				}
			} else if (token.type === 'brace') {
				if (token.value === '{') {
					this.beginExpressionWith(BlockStatementNode(token, this.currentLeaf));
				} else {
					this.endExpression();
				}
			} else if (token.type === 'bool') {
				this.currentLeaf.nodes.push(LiteralNode(token, this.currentLeaf, this.currentLeaf));
			} else if (token.type === 'number') {
				this.currentLeaf.nodes.push(LiteralNode(token, this.currentLeaf, this.currentLeaf));

				// check if current leaf is a unary, if so, it's finished
				this.ifInUnaryExpressionEndIt();
			} else if (token.type === 'string') {
				this.currentLeaf.nodes.push(LiteralNode(token, this.currentLeaf, this.currentLeaf));
			} else if (token.type === 'identifier') {
				this.currentLeaf.nodes.push(IdentifierNode(token, this.currentLeaf));

				// check if current leaf is a unary, if so, it's finished
				this.ifInUnaryExpressionEndIt();
			} else if (token.type === 'comment') {
				this.currentLeaf.nodes.push(CommentNode(token, this.currentLeaf));
			} else if (token.type === 'operator') {
				switch (token.value) {
					case '=': this.currentLeaf.nodes.push(AssignmentOperatorNode(token, this.currentLeaf)); break;
					case '+': this.currentLeaf.nodes.push(AdditionOperatorNode(token, this.currentLeaf)); break;
					case '-':
						// if previous node is a number, then this is subtraction
						if (this.currentLeaf.nodes.length > 0 && nodeTypesPrecedingSubtraction.includes(this.currentLeaf.nodes[this.currentLeaf.nodes.length - 1].type)) {
							this.currentLeaf.nodes.push(SubtractionOperatorNode(token, this.currentLeaf));
						} else {
							// otherwise this is a unary operator
							this.beginExpressionWith(UnaryExpressionNode(token, this.currentLeaf));
						}
						break;
					case '*': this.currentLeaf.nodes.push(MultiplicationOperatorNode(token, this.currentLeaf)); break;
					case '/': this.currentLeaf.nodes.push(DivisionOperatorNode(token, this.currentLeaf)); break;
					case '%': this.currentLeaf.nodes.push(ModulusOperatorNode(token, this.currentLeaf)); break;
					default: this.currentLeaf.nodes.push(GenericNode(token, this.currentLeaf)); break;
				}
			} else if (token.type === 'separator') {
				switch (token.value) {
					case ';':
						this.currentLeaf.nodes.push(SemicolonSeparatorNode(token, this.currentLeaf));
						this.endExpression();
						break;
					case ':':
						// TODO do this
						this.currentLeaf.nodes.push(GenericNode(token, this.currentLeaf));
						break;
					case ',':
						// TODO do this
						this.currentLeaf.nodes.push(GenericNode(token, this.currentLeaf));
						break;
					default:
						this.currentLeaf.nodes.push(GenericNode(token, this.currentLeaf));
						break;
				}
			} else if (token.type === 'keyword') {
				switch (token.value) {
					case 'const':
					case 'let':
						this.beginExpressionWith(VariableDeclarationNode(token, this.currentLeaf));
						break;
					case 'import':
						this.beginExpressionWith(ImportDeclarationNode(token, this.currentLeaf));
						break;
					default:
						this.currentLeaf.nodes.push(KeywordNode('Keyword', token, this.currentLeaf));
						break;

				}
			} else if (token.type === 'filepath') {
				this.currentLeaf.nodes.push(FilePathNode(token, this.currentLeaf));
			} else {
				this.currentLeaf.nodes.push(GenericNode(token, this.currentLeaf));
			}
		}

		if (this.debug) {
			console.debug(inspect(this.root, { showHidden: true, depth: null }));
		}

		return this.root;
	}

	/**
	 * Begins an expression with a node
	 *
	 * @param node - To push
	 */
	private beginExpressionWith(node: Node) {
		this.currentLeaf.nodes.push(node);
		this.currentLeaf = node;
	}

	/**
	 * Runs when an expression has ended
	 */
	private endExpression() {
		// capure this one's end
		const nigh = this.currentLeaf.end;

		// go up one level by setting the current leaf to the current leaf's parent
		this.currentLeaf = this.currentLeaf.parent as Node;

		// this should never happen, but it's here as a fallback
		if (typeof this.currentLeaf === 'undefined') {
			this.currentLeaf = this.root;
		}

		// once up, update the currentLeaf's .end with this one's end
		this.currentLeaf.end = nigh;
	}

	/**
	 * check if current leaf is a unary, if so, it's finished
	 */
	private ifInUnaryExpressionEndIt () {
		if (this.currentLeaf.type === 'UnaryExpression') {
			this.endExpression();
		}
	}
}
