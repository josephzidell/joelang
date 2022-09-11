import { AdditionOperatorNode, Node, nodes } from "../parser/ast/types";

type Visitor = <T extends infer SpecificNode ? SpecificNode : T>;
export type VisitorSet = {[key in Node['type']]: Visitor};

/** This visitor is yet to be implemented */
export const TODO = (node: Node): string => node.toString() || '';


// type Distribute<U> = U extends Node ? {(U extends infer V ? `${V}Node` : never): (node: U) => string} : never;
// type NodeToString<T> = T extends `${infer S}Node` ? S : never;


// type Foo = Node;
// type Vs = {[key in keyof Node as NodeToString<Node>]: (node: Node) => string};
// type Vs = Distribute<Node>;

type V1 = { [ key in Node['type'] ] : Node };
type V2 = { [ key in Node['type'] ] : key };
type V3 = { [ key in Node['type'] ] : `${key}Node` };
type V4 = { [ key in Node['type'] ] : `${key}Node` extends infer U ? U : never };

type N1 = { [ key in Node['type'] ] : key extends Node['type'] ? Node : never };

// const foo: Vs = {
// 	AdditionOperator: (node: AdditionOperatorNode): string => {
// 		return 'foo';
// 	},
// 	MultiplicationOperator: (node: AdditionOperatorNode): string => {
// 		return 'foo';
// 	},
// };
