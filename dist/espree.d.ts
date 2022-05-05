declare module "lib/token-translator" {
    export default TokenTranslator;
    class TokenTranslator {
        /**
         * Contains logic to translate Acorn tokens into Esprima tokens.
         * @param {import('../lib/espree').EnhancedTokTypes} acornTokTypes The Acorn token types.
         * @param {string} code The source code Acorn is parsing. This is necessary
         *      to correct the "value" property of some tokens.
         */
        constructor(acornTokTypes: import('../lib/espree').EnhancedTokTypes, code: string);
        _acornTokTypes: import("lib/espree").EnhancedTokTypes;
        /** @type {(import('acorn').Token)[]} */ _tokens: (import("../node_modules/acorn/dist/acorn").Token)[];
        _curlyBrace: import("acorn").Token | null;
        _code: string;
        /**
         * Translates a single Esprima token to a single Acorn token. This may be
         * inaccurate due to how templates are handled differently in Esprima and
         * Acorn, but should be accurate for all other tokens.
         * @param {import('acorn').Token} token The Acorn token to translate.
         * @param {{jsxAttrValueToken: boolean; ecmaVersion: import('acorn').ecmaVersion}} extra Espree extra object.
         * @returns {{type: string} & {value: any; start?: number; end?: number; loc?: import('acorn').SourceLocation; range?: [number, number]; regex?: {flags: string, pattern: string}}} The Esprima version of the token.
         */
        translate(token: import('acorn').Token, extra: {
            jsxAttrValueToken: boolean;
            ecmaVersion: import('acorn').ecmaVersion;
        }): {
            type: string;
        } & {
            value: any;
            start?: number | undefined;
            end?: number | undefined;
            loc?: import("acorn").SourceLocation | undefined;
            range?: [number, number] | undefined;
            regex?: {
                flags: string;
                pattern: string;
            } | undefined;
        };
        /**
         * Function to call during Acorn's onToken handler.
         * @param {import('acorn').Token} token The Acorn token.
         * @param {{tokens: ({type: string | import('acorn').TokenType} & {value: any; start?: number; end?: number; loc?: import('acorn').SourceLocation; range?: [number, number]; regex?: {flags: string, pattern: string}})[]} & {jsxAttrValueToken: boolean; ecmaVersion: import('acorn').ecmaVersion}} extra The Espree extra object.
         * @returns {void}
         */
        onToken(token: import('acorn').Token, extra: {
            tokens: ({
                type: string | import('acorn').TokenType;
            } & {
                value: any;
                start?: number;
                end?: number;
                loc?: import('acorn').SourceLocation;
                range?: [number, number];
                regex?: {
                    flags: string;
                    pattern: string;
                };
            })[];
        } & {
            jsxAttrValueToken: boolean;
            ecmaVersion: import('acorn').ecmaVersion;
        }): void;
    }
}
declare module "lib/options" {
    /**
     * Get the latest ECMAScript version supported by Espree.
     * @returns {number} The latest ECMAScript version.
     */
    export function getLatestEcmaVersion(): number;
    /**
     * Get the list of ECMAScript versions supported by Espree.
     * @returns {number[]} An array containing the supported ECMAScript versions.
     */
    export function getSupportedEcmaVersions(): number[];
    /**
     * Normalize parserOptions
     * @param {import('../espree').ParserOptions} options the parser options to normalize
     * @throws {Error} throw an error if found invalid option.
     * @returns {{ecmaVersion: 10 | 9 | 8 | 7 | 6 | 5 | 3 | 11 | 12 | 13 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | "latest"; sourceType: "script" | "module"; range?: boolean; loc?: boolean; allowReserved: boolean | "never"; ecmaFeatures?: {jsx?: boolean; globalReturn?: boolean; impliedStrict?: boolean}; ranges: boolean; locations: boolean; allowReturnOutsideFunction: boolean; tokens?: boolean | null; comment?: boolean}} normalized options
     */
    export function normalizeOptions(options: import("espree").ParserOptions): {
        ecmaVersion: 10 | 9 | 8 | 7 | 6 | 5 | 3 | 11 | 12 | 13 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | "latest";
        sourceType: "script" | "module";
        range?: boolean | undefined;
        loc?: boolean | undefined;
        allowReserved: boolean | "never";
        ecmaFeatures?: {
            jsx?: boolean | undefined;
            globalReturn?: boolean | undefined;
            impliedStrict?: boolean | undefined;
        } | undefined;
        ranges: boolean;
        locations: boolean;
        allowReturnOutsideFunction: boolean;
        tokens?: boolean | null | undefined;
        comment?: boolean | undefined;
    };
}
declare module "lib/espree" {
    function _default(): (Parser: typeof import('acorn-jsx').AcornJsxParser) => typeof EspreeParser;
    export default _default;
    export class EspreeParser extends acorn.Parser {
        /**
         * Adapted parser for Espree.
         * @param {import('../espree').ParserOptions | null} opts Espree options
         * @param {string | object} code The source code
         */
        constructor(opts: import('../espree').ParserOptions | null, code: string | object);
        /**
         * Returns Espree tokens.
         * @returns {{comments?: {type: string; value: string; range?: [number, number]; start?: number; end?: number; loc?: {start: import('acorn').Position | undefined; end: import('acorn').Position | undefined}}[]} & import('acorn').Token[] | null} Espree tokens
         */
        tokenize(): {
            comments?: {
                type: string;
                value: string;
                range?: [number, number];
                start?: number;
                end?: number;
                loc?: {
                    start: import('acorn').Position | undefined;
                    end: import('acorn').Position | undefined;
                };
            }[];
        } & import('acorn').Token[] | null;
        /**
         * Parses.
         * @returns {{sourceType?: "script" | "module" | "commonjs"; comments?: {type: string; value: string; range?: [number, number]; start?: number; end?: number; loc?: {start: import('acorn').Position | undefined; end: import('acorn').Position | undefined}}[]; tokens?: import('acorn').Token[]; body: import('acorn').Node[]} & import('acorn').Node} The program Node
         */
        parse(): {
            sourceType?: "script" | "module" | "commonjs";
            comments?: {
                type: string;
                value: string;
                range?: [number, number];
                start?: number;
                end?: number;
                loc?: {
                    start: import('acorn').Position | undefined;
                    end: import('acorn').Position | undefined;
                };
            }[];
            tokens?: import('acorn').Token[];
            body: import('acorn').Node[];
        } & import('acorn').Node;
        /**
         * Overwrites the default raise method to throw Esprima-style errors.
         * @param {number} pos The position of the error.
         * @param {string} message The error message.
         * @throws {EnhancedSyntaxError} A syntax error.
         * @returns {void}
         */
        raiseRecoverable(pos: number, message: string): void;
        /**
         * Esprima-FB represents JSX strings as tokens called "JSXText", but Acorn-JSX
         * uses regular tt.string without any distinction between this and regular JS
         * strings. As such, we intercept an attempt to read a JSX string and set a flag
         * on extra so that when tokens are converted, the next token will be switched
         * to JSXText via onToken.
         * @param {number} quote A character code
         * @returns {void}
         */
        jsx_readString(quote: number): void;
    }
    export type EnhancedSyntaxError = {
        index?: number;
        lineNumber?: number;
        column?: number;
    } & SyntaxError;
    /**
     * We add `jsxAttrValueToken` ourselves.
     */
    export type EnhancedTokTypes = {
        jsxAttrValueToken?: import("../node_modules/acorn/dist/acorn").TokenType;
    } & typeof import("../../acorn-jsx/index").tokTypes;
    import * as acorn from "acorn";
}
declare module "lib/version" {
    export default version;
    const version: "main";
}
declare module "espree" {
    /**
     * Tokenizes the given code.
     * @param {string} code The code to tokenize.
     * @param {ParserOptions} options Options defining how to tokenize.
     * @returns {import('acorn').Token[] | null} An array of tokens.
     * @throws {import('./lib/espree').EnhancedSyntaxError} If the input code is invalid.
     * @private
     */
    export function tokenize(code: string, options: ParserOptions): import("../node_modules/acorn/dist/acorn").Token[] | null;
    /**
     * Parses the given code.
     * @param {string} code The code to tokenize.
     * @param {ParserOptions} options Options defining how to tokenize.
     * @returns {import('acorn').Node} The "Program" AST node.
     * @throws {import('./lib/espree').EnhancedSyntaxError} If the input code is invalid.
     */
    export function parse(code: string, options: ParserOptions): import("../node_modules/acorn/dist/acorn").Node;
    export const version: "main";
    export const VisitorKeys: visitorKeys.VisitorKeys;
    export const Syntax: {
        [x: string]: string;
    };
    export const latestEcmaVersion: number;
    export const supportedEcmaVersions: number[];
    /**
     * `jsx.Options` gives us 2 optional properties, so extend it
     * `allowReserved`, `ranges`, `locations`, `allowReturnOutsideFunction`,
     * `onToken`, and `onComment` are as in `acorn.Options`
     * `ecmaVersion` as in `acorn.Options` though optional
     * `sourceType` as in `acorn.Options` but also allows `commonjs`
     * `ecmaFeatures`, `range`, `loc`, `tokens` are not in `acorn.Options`
     * `comment` is not in `acorn.Options` and doesn't err without it, but is used
     */
    export type ParserOptions = {
        allowReserved?: boolean;
        ecmaVersion?: import("../node_modules/acorn/dist/acorn").ecmaVersion;
        sourceType?: "script" | "module" | "commonjs";
        ecmaFeatures?: {
            jsx?: boolean;
            globalReturn?: boolean;
            impliedStrict?: boolean;
        };
        range?: boolean;
        loc?: boolean;
        tokens?: boolean | null;
        comment?: boolean;
    };
    import * as visitorKeys from "eslint-visitor-keys";
    import jsx from "acorn-jsx";
}
declare module "lib/features" {
    namespace _default {
        const jsx: boolean;
        const globalReturn: boolean;
        const impliedStrict: boolean;
    }
    export default _default;
}
//# sourceMappingURL=espree.d.ts.map