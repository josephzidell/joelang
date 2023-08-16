import { AST } from './src/analyzer/asts';
import { Pos } from './src/shared/pos';

/** Mock the Pos for unit tests. */
export const mockPos: Pos = { start: 0, end: 0, line: 1, col: 1 };

export const mockParent = undefined as unknown as AST;

const mocks = {
	pos: mockPos,
	parent: mockParent,
};

export default mocks;
