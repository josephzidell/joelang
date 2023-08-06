/**
 * Options used in the entire Analyzer phase.
 */
interface Options {
	debug: boolean;
}

type AnyASTConstructor = new (pos: import('../shared/pos').Pos) => AST;
type InstanceTypes<T extends AnyASTConstructor[]> = {
	[K in keyof T]: T[K] extends new (pos: import('../shared/pos').Pos) => infer U ? U : never;
}[number];
