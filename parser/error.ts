import { Node } from './types';

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class ParserError extends TypeError {
	private tree;

	constructor (message: string, tree: Node) {
		super(message);

		this.tree = tree;
	}

	getTree (): Node {
		return this.tree;
	}
}
