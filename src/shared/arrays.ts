import { ASTType, astUniqueness } from '../analyzer/asts';

export function allStringsEqual(arr: string[]): boolean {
	return arr.every((val) => val === arr[0]);
}

export function allASTTypesEqual(arr: ASTType[]): boolean {
	return allStringsEqual(arr.map((val) => astUniqueness(val)));
}
