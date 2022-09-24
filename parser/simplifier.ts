import { Node, NodeType, UnaryExpressionNode } from "./types";

// SParseTree = Simplified Parse Tree

/** Certain nodes need extra information beyond the usual */
type extraInformation = {
	before?: boolean;
}
type SParseNodeWithoutValueAndWithoutChildren = [NodeType]; // eg ['SemicolonSeparator']
type SParseNodeWithValueAndWithoutChildren = [NodeType, string]; // eg ['NumberLiteral', '1']
type SParseNodeWithoutValueWithChildren = [NodeType, SParseTree]
type SParseNodeWithValueWithChildren = [NodeType, string, SParseTree]
type SParseNodeWithValueWithChildrenWithExtraInformation = [NodeType, string, extraInformation, SParseTree]
type SParseNode = SParseNodeWithoutValueAndWithoutChildren | SParseNodeWithValueAndWithoutChildren | SParseNodeWithoutValueWithChildren | SParseNodeWithValueWithChildren | SParseNodeWithValueWithChildrenWithExtraInformation;
export type SParseTree = SParseNode[];

export const simplifyTree = (nodes: Node[]): SParseTree => {
	return nodes.map((node: Node): SParseNode => {
		const children = simplifyTree(node.children);

		// a node will have either a value, or children, or both, or neither
		let hasValue = typeof node.value !== 'undefined';
		// in a few cases, we really don't need the value
		if (node.type === 'ColonSeparator' || node.type === 'CommaSeparator' || node.type === 'SemicolonSeparator') {
			hasValue = false;
		}

		// in a few cases we want the children array to be there even when empty
		let hasChildren = children.length > 0;
		if (node.type === 'ArgumentsList' || node.type === 'BlockStatement' || node.type === 'ParametersList') {
			hasChildren = true; // force it to be true
		}

		let extraInformation = {};
		switch (node.type) {
			case 'UnaryExpression':
				extraInformation = {before: (node as UnaryExpressionNode).before};
				break;
		}

		let snode: SParseNode;
		if (!hasValue && !hasChildren) {
			snode = [node.type];
		} else if (!hasValue && hasChildren) {
			snode = [
				node.type,
				children,
			];
		} else if (hasValue && !hasChildren) {
			snode = [
				node.type,
				node.value as string,
			];
		} else if (Object.keys(extraInformation).length > 0) { // has extraInformation && hasValue && hasChildren
			snode = [
				node.type,
				node.value as string,
				extraInformation,
				children,
			];
		} else { // hasValue && hasChildren
			snode = [
				node.type,
				node.value as string,
				children,
			];
		}

		return snode;
	});
};
