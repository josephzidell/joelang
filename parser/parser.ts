import { Token, TokenType } from "../lexer/types";
import { Node, NodeType } from './types';
import ParserError from './error';
import { MakeAdditionNode, MakeAssignmentNode, MakeCommentNode, MakeDivisionNode, MakeImportDeclarationNode, MakeModNode, MakeMultiplicationNode, MakeParenthesizedNode, MakeSemicolonNode, MakeSubtractionNode, MakeUnaryExpressionNode, MakeVariableDeclarationNode, MakeBlockStatementNode, MakeUnknownNode, MakeColonNode, MakeCommaNode, MakeFilePathNode, MakeBoolLiteralNode, MakeNumberLiteralNode, MakeStringLiteralNode, MakeIdentifierNode, MakeKeywordNode } from './node';
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

			if (token.type === 'paren_open') {
				this.beginExpressionWith(MakeParenthesizedNode(token, this.currentLeaf));
			} else if (token.type === 'paren_close') {
				this.endExpression();

				// check if current leaf is a unary, if so, it's finished
				this.ifInUnaryExpressionEndIt();
			} else if (token.type === 'brace_open') {
				this.beginExpressionWith(MakeBlockStatementNode(token, this.currentLeaf));
			} else if (token.type === 'brace_close') {
				this.endExpression();
			} else if (token.type === 'bool') {
				this.currentLeaf.nodes.push(MakeBoolLiteralNode(token, this.currentLeaf));
			} else if (token.type === 'number') {
				this.currentLeaf.nodes.push(MakeNumberLiteralNode(token, this.currentLeaf));

				// check if current leaf is a unary, if so, it's finished
				this.ifInUnaryExpressionEndIt();
			} else if (token.type === 'string') {
				this.currentLeaf.nodes.push(MakeStringLiteralNode(token, this.currentLeaf));
			} else if (token.type === 'identifier') {
				this.currentLeaf.nodes.push(MakeIdentifierNode(token, this.currentLeaf));

				// check if current leaf is a unary, if so, it's finished
				this.ifInUnaryExpressionEndIt();
			} else if (token.type === 'comment') {
				this.currentLeaf.nodes.push(MakeCommentNode(token, this.currentLeaf));
			} else if (token.type === 'assign') {
				this.currentLeaf.nodes.push(MakeAssignmentNode(token, this.currentLeaf));
			} else if (token.type === 'plus') {
				this.currentLeaf.nodes.push(MakeAdditionNode(token, this.currentLeaf));
			} else if (token.type === 'minus') {
				// if previous node is a number, then this is subtraction
				if (this.currentLeaf.nodes.length > 0 && nodeTypesPrecedingSubtraction.includes(this.currentLeaf.nodes[this.currentLeaf.nodes.length - 1].type)) {
					this.currentLeaf.nodes.push(MakeSubtractionNode(token, this.currentLeaf));
				} else {
					// otherwise this is a unary operator
					this.beginExpressionWith(MakeUnaryExpressionNode(token, this.currentLeaf));
				}
			} else if (token.type === 'asterisk') {
				this.currentLeaf.nodes.push(MakeMultiplicationNode(token, this.currentLeaf));
			} else if (token.type === 'forward_slash') {
				this.currentLeaf.nodes.push(MakeDivisionNode(token, this.currentLeaf));
			} else if (token.type === 'mod') {
				this.currentLeaf.nodes.push(MakeModNode(token, this.currentLeaf));
			} else if (token.type === 'semicolon') {
				this.currentLeaf.nodes.push(MakeSemicolonNode(token, this.currentLeaf));
				this.endExpression();
			} else if (token.type === 'colon') {
				// TODO do this
				this.currentLeaf.nodes.push(MakeColonNode(token, this.currentLeaf));
			} else if (token.type === 'comma') {
				// TODO do this
				this.currentLeaf.nodes.push(MakeCommaNode(token, this.currentLeaf));
			} else if (token.type === 'keyword') {
				switch (token.value) {
					case 'const':
					case 'let':
						this.beginExpressionWith(MakeVariableDeclarationNode(token, this.currentLeaf));
						break;
					case 'import':
						this.beginExpressionWith(MakeImportDeclarationNode(token, this.currentLeaf));
						break;
					default:
						this.currentLeaf.nodes.push(MakeKeywordNode(token, this.currentLeaf));
						break;
				}
			} else if (token.type === 'filepath') {
				this.currentLeaf.nodes.push(MakeFilePathNode(token, this.currentLeaf));
			} else {
				this.currentLeaf.nodes.push(MakeUnknownNode(token, this.currentLeaf));
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
