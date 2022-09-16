import * as Parse from '../parser/types';
import * as Syntax from './types';
import SyntaxError from './error';
import _ from 'lodash';

const Converters = {
	FunctionDefinition: (parseNode: Parse.Node, parent: Syntax.Node): Syntax.FunctionDefinitionNode => {
		const foo = _.keyBy(parseNode.children, (child => child.type));

		const name = Converters.Identifier(foo.Identifier, node);
		// name = <string>get(parseNode, 'Identifier.0.value');
		// if (!name.name) {
		// 	throw new SyntaxError('Function name cannot be found', null);
		// }

		// name: parseNode.children.filter(child => child.type === 'Identifier')[0].value ?? (() => {throw new SyntaxError('Function name cannot be found', null)})(),
		// types: getNested<string>(parseNode, 'GenericTypesList.0', (child: Parse.Node, path: 'value') => get<string>(child, path),
		const types = Converters.GenericTypesList(foo.GenericTypesList, node);
		// node.types = Converters.GenericTypesList(parseNode.children.filter(child => child.type === 'GenericTypesList')[0], node);
		// parameters: parseNode.children.filter(child => child.type === 'ParametersList')[0],
		const parameters = Converters.ParametersList(foo.ParametersList, node);
		const returns = Converters.FunctionReturns(foo.FunctionReturns, node);
		const body = Converters.BlockStatement(foo.BlockStatement, node);

		const node: Syntax.FunctionDefinitionNode = {
			type: 'FunctionDefinition',
			name,
			types,
			parameters,
			returns,
			body,
			pos: parseNode.pos,
			parent,
		};

		return node;
	},
	FunctionReturns: (parseNode: Parse.Node, parent: Syntax.Node): Syntax.FunctionReturnsNode => {
		const types = parseNode.children.map(child => child.type === 'Identifier' ? Converters.Identifier(child, node) : Converters.Type(child, node));

		const node: Syntax.FunctionReturnsNode = {
			type: 'FunctionReturns',
			types,
			pos: parseNode.pos,
			parent,
		};

		return node;
	},
	GenericTypesList: (parseNode: Parse.Node, parent: Syntax.Node): Syntax.GenericTypesListNode => {
		const types = parseNode.children.map(child => child.type === 'Identifier' ? Converters.Identifier(child, node) : Converters.Type(child, node));

		const node: Syntax.GenericTypesListNode = {
			type: 'GenericTypesList',
			types,
			pos: parseNode.pos,
			parent,
		};

		return node;
	},
	Identifier: (parseNode: Parse.Node, parent: Syntax.Node): Syntax.IdentifierNode => {
		return {
			type: 'Identifier',
			name: parseNode.value as string,
			pos: parent.pos,
			parent,
		}
	},
	// Parameter: (parseNode: Parse.Node, parent: Syntax.Node): Syntax.ParameterNode => {
	// 	const argType = parseNode.children.map(child => Converters.Parameter(child, node));

	// 	const node: Syntax.ParameterNode = {
	// 		type: 'Parameter',
	// 		// parameters,
	// 		pos: parseNode.pos,
	// 		parent,
	// 	};

	// 	return node;
	// },
	ParametersList: (parseNode: Parse.Node, parent: Syntax.Node): Syntax.ParametersListNode => {
		/**
		 * build parameters - syntax is one of:
		 * [...]identifier: type
		 * [...]identifier = default, where default is an ArrayExpression, BoolLiteral, NumberLiteral, RegularExpression, or StringLiteral // TODO add Tuple, POJOs
		 *
		 * The rules are:
		 * - param must either have a type or default (so we can ascertain the type)
		 * - params with defaults must come after those without
		 * - rest param (...) must be last, and only one is allowed
		 */

		function collectParams() {
			const parameters: Syntax.ParameterNode[] = [];
			const paramIndex = 0;
			while (parseNode.children.length > 0) {
				const child = parseNode.children.shift();
				if (typeof child === 'undefined') {
					break;
				}

				switch (child.type) {
					case 'RestElement':
						// must be at beginning of param
						if ()
					case 'Identifier':

				}
			}
			const firstParam = _.takeWhile(parseNode.children, (child) => child.type !== 'CommaSeparator');

			parseNode.children.map(child => Converters.Parameter(child, node));
		}

		const node: Syntax.ParametersListNode = {
			type: 'ParametersList',
			parameters,
			pos: parseNode.pos,
			parent,
		};

		return node;
	},
	Type: (parseNode: Parse.Node, parent: Syntax.Node): Syntax.TypeNode => {
		const value = parseNode.value;
		if (!value) {
			throw new SyntaxError('Type cannot be found', parseNode.pos);
		}

		return {
			type: 'Type',
			value,
			pos: parseNode.pos,
			parent,
		}
	},
}

export default Converters;

function get<T> (parentNode: Parse.Node, path: string): T {
	const parts = path.split('.');
	const childType = parts.shift();
	const children = parentNode.children.filter(child => child.type === childType);
	const index = parseInt(parts.shift() as string);
	const child = children[index];
	const property = parts.shift();

	return child[property as keyof typeof child] as T;
}

function getNested<T> (parentNode: Parse.Node, pathToNodes: string, pathWithinEachNode: string): T[] {
	const parts = pathToNodes.split('.');
	const childType = parts.shift();
	const children = parentNode.children.filter(child => child.type === childType);
	const index = parts.shift();
	if (!index) {
		return children.map(child => get<T>(child, pathWithinEachNode));
	}

	const child = children[parseInt(index)];
	const property = parts.shift();
	if (!property) {
		return child;
	}

	return child[property as keyof typeof child];
}
