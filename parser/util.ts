import { Result } from "../shared/result";
import Parser from "./parser";
import { Node } from './types';

/** Shortcut method to `new Parser(code).parse()` */
export const parse = (code: string): Result<Node> => new Parser(code).parse();
