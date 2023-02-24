import { IfStatementNode, Node, NT, UnaryExpressionNode } from "./types";

// SParseTree = Simplified Parse Tree

/** Certain nodes need extra information beyond the usual */
type extraInformation = {
	before?: boolean;
}
type SParseNodeWithoutValueAndWithoutChildren = [NT]; // eg [NodeType.SemicolonSeparator]
type SParseNodeWithValueAndWithoutChildren = [NT, string]; // eg [NodeType.NumberLiteral, '1']
type SParseNodeWithoutValueWithChildren = [NT, SParseTree] // eg ['ArgumentList', [...]]
type SParseNodeWithoutValueWithChildrenWithExtraInformation = [NT, extraInformation, SParseTree] // eg [NodeType.IfStatement, {before}, [...]]
type SParseNodeWithValueWithChildren = [NT, string, SParseTree] // eg [NodeType.BinaryExpression, '==', [...]]
type SParseNodeWithValueWithChildrenWithExtraInformation = [NT, string, extraInformation, SParseTree] // eg [NodeType.UnaryExpression, '++', {before}, [...]]
type SParseNode = SParseNodeWithoutValueAndWithoutChildren |
	SParseNodeWithValueAndWithoutChildren |
	SParseNodeWithoutValueWithChildren |
	SParseNodeWithoutValueWithChildrenWithExtraInformation |
	SParseNodeWithValueWithChildren |
	SParseNodeWithValueWithChildrenWithExtraInformation;
export type SParseTree = SParseNode[];

export const simplifyTree = (nodes: Node[]): SParseTree => {
	return nodes.map((node: Node): SParseNode => {
		const children = simplifyTree(node.children);

		// a node will have either a value, or children, or both, or neither
		let hasValue = typeof node.value !== 'undefined';
		// in a few cases, we really don't need the value
		if (node.type === NT.ColonSeparator || node.type === NT.CommaSeparator || node.type === NT.SemicolonSeparator) {
			hasValue = false;
		}

		// in a few cases we want the children array to be there even when empty
		const nodeTypesThatShouldAlwaysHaveChildren: NT[] = [
			NT.ArgumentsList,
			NT.ArrayExpression,
			NT.BlockStatement,
			NT.ObjectExpression,
			NT.ParametersList,
			NT.TypeArgumentsList,
			NT.TypeParametersList,
			NT.TupleExpression,
		];
		let hasChildren = children.length > 0;
		if (nodeTypesThatShouldAlwaysHaveChildren.includes(node.type)) {
			hasChildren = true; // force it to be true
		}

		let extraInformation = {};
		switch (node.type) {
			case NT.IfStatement:
				extraInformation = {before: (node as IfStatementNode).before};
				break;
			case NT.UnaryExpression:
				extraInformation = {before: (node as UnaryExpressionNode).before};
				break;
		}

		let snode: SParseNode;
		const hasExtraInformation = Object.keys(extraInformation).length > 0;
		if (!hasValue && !hasChildren) {
			snode = [node.type];
		} else if (!hasValue && hasChildren) {
			if (hasExtraInformation) {
				snode = [
					node.type,
					extraInformation,
					children,
				];
			} else {
				snode = [
					node.type,
					children,
				];
			}
		} else if (hasValue && !hasChildren) {
			snode = [
				node.type,
				node.value as string,
			];
		} else if (hasExtraInformation) { // has extraInformation && hasValue && hasChildren
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
