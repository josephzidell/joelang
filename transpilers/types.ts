import { AdditionOperatorNode, MultiplicationOperatorNode, nodes } from "../syntax/types";

export type VisitorSet = { [ key in keyof nodes ] : (node: nodes[key]) => string };

/** This visitor is yet to be implemented */
export const TODO = <T>(node: T): string => String(node) || '';
