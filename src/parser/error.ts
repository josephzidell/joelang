import Context from '../shared/context';
import JoelangError from '../shared/errors/error';
import { Node } from './types';

/**
 * Custom error class so that we can display the Concrete Syntax Tree
 * which will help the user see where the parser is up to and got stuck
 */
export default class ParserError extends JoelangError {
	static MisplacedKeyword = (msg: string, tree: Node, ctx: Context) => new ParserError('P000', msg, tree, ctx);
	static MissingPreviousNode = (msg: string, tree: Node, ctx: Context) => new ParserError('P001', msg, tree, ctx);
	static MissingParentNode = (msg: string, tree: Node, ctx: Context) => new ParserError('P002', msg, tree, ctx);
	static UnknownKeyword = (msg: string, tree: Node, ctx: Context) => new ParserError('P003', msg, tree, ctx);
	static UnknownToken = (msg: string, tree: Node, ctx: Context) => new ParserError('P004', msg, tree, ctx);
	static UnexpectedEndOfProgram = (msg: string, tree: Node, ctx: Context) => new ParserError('P005', msg, tree, ctx);
	static UnexpectedToken = (msg: string, tree: Node, ctx: Context) => new ParserError('P006', msg, tree, ctx);

	private tree;

	private constructor(code: string, message: string, tree: Node, context: Context, cause?: JoelangError) {
		super(code, message, context, cause);

		this.tree = tree;
	}

	getTree(): Node {
		return this.tree;
	}
}
