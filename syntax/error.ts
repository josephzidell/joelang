import { Pos } from '../parser/types';
import { ProgramNode } from './types';

/**
 * Custom error class so that we can display the already-extracted tokens
 * which will help the user see where the lexer is up to and got stuck
 */
export default class SyntaxError extends TypeError {
	private tree;

	constructor (message: string, tree: Pos) {
		super(message);

		this.tree = tree;
	}

	// getTree (): ProgramNode {
	// 	return this.tree;
	// }
}
