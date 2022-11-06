declare function _default(): (Parser: import('acorn-jsx').AcornJsxParserCtor) => EspreeParserCtor;
export default _default;
export type EspreeParser = {
    tokenize: () => import('../espree').EspreeTokens | null;
    finishNode: (node: import('acorn').Node, type: string) => import('acorn').Node;
    finishNodeAt: (node: import('acorn').Node, type: string, pos: number, loc: import('acorn').Position) => import('acorn').Node;
    parse: () => {
        sourceType?: "script" | "module" | "commonjs";
        comments?: EsprimaComment[];
        tokens?: import('./token-translator').EsprimaToken[];
        body: import('acorn').Node[];
    } & import('acorn').Node;
    parseTopLevel: (node: import('acorn').Node) => import('acorn').Node;
    raise: (pos: number, message: string) => void;
    raiseRecoverable: (pos: number, message: string) => void;
    unexpected: (pos: number) => void;
    jsx_readString: (quote: number) => void;
} & acorn.Parser;
export type EspreeParserCtor = (new (opts: import('../espree').ParserOptions | null, code: string | object) => EspreeParser) & Pick<typeof acorn.Parser, "prototype" | "acorn" | "parse" | "parseExpressionAt" | "tokenizer" | "extend">;
export type EnhancedSyntaxError = {
    index?: number;
    lineNumber?: number;
    column?: number;
} & SyntaxError;
export type EnhancedTokTypes = {
    jsxAttrValueToken?: import('acorn').TokenType;
} & import('acorn-jsx').TokTypes;
export type EsprimaComment = {
    type: string;
    value: string;
    range?: [number, number];
    start?: number;
    end?: number;
    loc?: {
        start: import('acorn').Position | undefined;
        end: import('acorn').Position | undefined;
    };
};
import * as acorn from "acorn";
//# sourceMappingURL=espree.d.ts.map