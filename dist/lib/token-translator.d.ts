export default TokenTranslator;
export type EsprimaToken = {
    type: string;
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
};
declare class TokenTranslator {
    /**
     * Contains logic to translate Acorn tokens into Esprima tokens.
     * @param {import('./espree').EnhancedTokTypes} acornTokTypes The Acorn token types.
     * @param {string} code The source code Acorn is parsing. This is necessary
     *      to correct the "value" property of some tokens.
     */
    constructor(acornTokTypes: import('./espree').EnhancedTokTypes, code: string);
    _acornTokTypes: import("./espree").EnhancedTokTypes;
    /** @type {import('acorn').Token[]} */ _tokens: import('acorn').Token[];
    _curlyBrace: import("acorn").Token | null;
    _code: string;
    /**
     * Translates a single Acorn token to a single Esprima token. This may be
     * inaccurate due to how templates are handled differently in Esprima and
     * Acorn, but should be accurate for all other tokens.
     * @param {import('acorn').Token} token The Acorn token to translate.
     * @param {{jsxAttrValueToken: boolean; ecmaVersion: import('../espree').ecmaVersion}} extra Espree extra object.
     * @returns {EsprimaToken} The Esprima version of the token.
     */
    translate(token: import('acorn').Token, extra: {
        jsxAttrValueToken: boolean;
        ecmaVersion: import('../espree').ecmaVersion;
    }): EsprimaToken;
    /**
     * Function to call during Acorn's onToken handler.
     * @param {import('acorn').Token} token The Acorn token.
     * @param {{tokens: EsprimaToken[]} & {jsxAttrValueToken: boolean; ecmaVersion: import('../espree').ecmaVersion}} extra The Espree extra object.
     * @returns {void}
     */
    onToken(token: import('acorn').Token, extra: {
        tokens: EsprimaToken[];
    } & {
        jsxAttrValueToken: boolean;
        ecmaVersion: import('../espree').ecmaVersion;
    }): void;
}
//# sourceMappingURL=token-translator.d.ts.map