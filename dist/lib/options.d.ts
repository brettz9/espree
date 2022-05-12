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
 * @returns {{ecmaVersion: import('../espree').ecmaVersion; sourceType: "script" | "module"; range?: boolean; loc?: boolean; allowReserved: boolean | "never"; ecmaFeatures?: {jsx?: boolean; globalReturn?: boolean; impliedStrict?: boolean}; ranges: boolean; locations: boolean; allowReturnOutsideFunction: boolean; tokens?: boolean; comment?: boolean}} normalized options
 */
export function normalizeOptions(options: import('../espree').ParserOptions): {
    ecmaVersion: import('../espree').ecmaVersion;
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
    tokens?: boolean | undefined;
    comment?: boolean | undefined;
};
//# sourceMappingURL=options.d.ts.map