/** Positional information for an item: A Node, an AST, etc. */
export type Pos = {
	/** cursor position of the beginning of this item, counting chars from the beginning of the file */
	start: number;

	/** cursor position immediately after this item */
	end: number;

	/** line number this item begins at, counting from 1 */
	line: number;

	/** col position this item begins at, counting from 1, within the line of the first char (similar to `start`, but within the line - if the entire file were one line, then `col` would be `start + 1`) */
	col: number;
};
