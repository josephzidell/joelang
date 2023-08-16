import Context from '../shared/context';
import JoelangError from '../shared/errors/error';
import { SymNode, SymbolKind } from './symbolTable';

/**
 * Custom error class so that we can display the Symbol Node and Table
 * which will help the user see where the IR Converter is up to and got stuck
 */
export default class SymbolError extends JoelangError {
	/** msg: `SymNode: Cannot find ${lost} in ${symNode.name}` */
	static SymNodeNotFound = (lost: string, symNode: SymNode, ctx: Context) =>
		new SymbolError('SY001', `SymNode: Cannot find ${lost} in ${symNode.name}`, symNode, ctx);
	/** msg: `We're at the top SymNode; there is no parent` */
	static AtTopAndNotExpectingToBe = (symNode: SymNode, ctx: Context) =>
		new SymbolError('SY002', `We're at the top SymNode; there is no parent`, symNode, ctx);
	/** msg: `Symbol: ${insertWhat}: There already is an item named ${item} in the Symbol Table` */
	static DuplicateIdentifier = (insertWhat: string, item: string, symNode: SymNode, ctx: Context) =>
		new SymbolError('SY003', `Symbol: ${insertWhat}: There already is an item named ${item} in the Symbol Table`, symNode, ctx);
	static UnknownSymbol = (msg: string, symNode: SymNode, ctx: Context) => new SymbolError('SY004', msg, symNode, ctx);
	/** msg: `${kind} symbol ${oldName} could not be updated to ${newName}` */
	static SymbolNameNotUpdated = (oldName: string, newName: string, kind: SymbolKind, symNode: SymNode, ctx: Context) =>
		new SymbolError('SY005', `${kind} symbol ${oldName} could not be updated to ${newName}`, symNode, ctx);

	private symNode: SymNode;

	private constructor(code: string, message: string, symNode: SymNode, context: Context, cause?: JoelangError) {
		super(code, message, context, cause);

		this.symNode = symNode;
	}

	getSymNode(): SymNode {
		return this.symNode;
	}
}
