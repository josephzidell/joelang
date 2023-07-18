import { Result } from '../shared/result';
import Lexer from './lexer';
import { Token } from './types';

export const standardizeLineEndings = (code: string): string => code.replace(/\r\n/g, '\n');
export const regexFlags = ['g', 'i', 'm', 's'];

/** Shortcut method to `new Lexer(code).getAllTokens()` */
export const lex = (code: string): Result<Token[]> => new Lexer(standardizeLineEndings(code)).getAllTokens();
