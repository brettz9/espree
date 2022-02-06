/* eslint-disable no-param-reassign*/
import TokenTranslator from "./token-translator.js";
import { normalizeOptions } from "./options.js";
import * as acorn from "acorn";

const STATE = Symbol("espree's internal state");
const ESPRIMA_FINISH_NODE = Symbol("espree's esprimaFinishNode");

/**
 * Suggests an integer
 * @typedef {number} int
 */
/**
 * @typedef {import('acorn')} acorn
 * @typedef {acorn.ecmaVersion} ecmaVersion
 * @typedef {typeof import('acorn-jsx').tokTypes} tokTypesType
 * @typedef {typeof import('acorn-jsx').AcornJsxParser} AcornJsxParser
 * @typedef {import('../espree').ParserOptions} ParserOptions
 *
 * @typedef {{
 *   generator?: boolean
 * } & acorn.Node} EsprimaNode
 *
 */
/**
 * We add `jsxAttrValueToken` ourselves.
 *
 * `jsxName`, `jsxTagEnd`, and `jsxTagStart` are used in Acorn JSX but not
 * in its *d.ts
 *
 * `invalidTemplate` and `questionDot` are not in *.d.ts
 * @todo Move three to acorn JSX?
 * @typedef {{
 *   jsxAttrValueToken?: acorn.TokenType;
 * } & tokTypesType} EnhancedTokTypes
 */
/**
 * First three properties as in `acorn.Comment`; next two as in `acorn.Comment`
 * but optional. Last is different as has to allow `undefined`
 * @typedef {{
 *   type: string,
 *   value: string,
 *   range?: [number, number],
 *   start?: number,
 *   end?: number,
 *   loc?: {
 *     start: acorn.Position | undefined,
 *     end: acorn.Position | undefined
 *   }
 * }} EsprimaComment
 *
 * @typedef {{
 *   comments?: EsprimaComment[]
 * } & acorn.Token[]} EspreeTokens
 *
 * @typedef {{
 *   tail?: boolean
 * } & acorn.Node} AcornTemplateNode
 *
 * @typedef {{
 *   originalSourceType: "script"|"module"|"commonjs";
 *   ecmaVersion: ecmaVersion;
 *   comments: EsprimaComment[]|null;
 *   impliedStrict: boolean;
 *   lastToken: acorn.Token|null;
 *   templateElements: (AcornTemplateNode)[];
 *   jsxAttrValueToken: boolean;
 * }} BaseStateObject
 *
 * @typedef {{
 *   tokens: null;
 * } & BaseStateObject} StateObject
 *
 * @typedef {{
 *   tokens: EspreeTokens;
 * } & BaseStateObject} StateObjectWithTokens
 *
 * @typedef {{
 *   sourceType?: "script"|"module"|"commonjs";
 *   comments?: EsprimaComment[];
 *   tokens?: acorn.Token[];
 *   body: acorn.Node[];
 * } & acorn.Node} EsprimaProgramNode
 */
/**
 * @typedef {{
 *   index?: number;
 *   lineNumber?: number;
 *   column?: number;
 * } & SyntaxError} EnhancedSyntaxError
 */

/*
NOT USING:
* @typedef {{
*   parse(): EsprimaProgramNode;
*   tokenize(): EspreeTokens|null;
* }} IEspreeParser
*
* @typedef {{
*   new(options: ParserOptions, input: string, startPos?: number): IEspreeParser;
* }} EspreeParser
 */

export class EspreeParser extends acorn.Parser {

    /* eslint-disable class-methods-use-this, no-useless-constructor */
    /**
     * Constructor for EspreeParser
     * @param {ParserOptions} options The parser options
     * @param {string} input The input text
     * @param {number} [startPos] The starting position
     */
    constructor(options, input, startPos) {
        super(/** @type {acorn.Options} */ (options), input, startPos);
    }

    /**
     * Parse
     * @returns {EsprimaProgramNode} The Espree program Node
     */
    parse() {
        return /** @type {EsprimaProgramNode} */ ({});
    }

    /**
     * Tokenize
     * @returns {EspreeTokens|null} The Espree tokens
     */
    tokenize() {
        return null;
    }
    /* eslint-enable class-methods-use-this, no-useless-constructor */
}

/**
 * Converts an Acorn comment to an Esprima comment.
 * @callback AcornToEsprimaCommentConverter
 * @param {boolean} block True if it's a block comment, false if not.
 * @param {string} text The text of the comment.
 * @param {int} start The index at which the comment starts.
 * @param {int} end The index at which the comment ends.
 * @param {acorn.Position|undefined} startLoc The location at which the comment starts.
 * @param {acorn.Position|undefined} endLoc The location at which the comment ends.
 */

/**
 * Converts an Acorn comment to an Esprima comment.
 * @type {AcornToEsprimaCommentConverter}
 * @returns {EsprimaComment} The comment object.
 * @private
 */
function convertAcornCommentToEsprimaComment(block, text, start, end, startLoc, endLoc) {
    const comment = /** @type {EsprimaComment} */ ({
        type: block ? "Block" : "Line",
        value: text
    });

    if (typeof start === "number") {
        comment.start = start;
        comment.end = end;
        comment.range = [start, end];
    }

    if (typeof startLoc === "object") {
        comment.loc = {
            start: startLoc,
            end: endLoc
        };
    }

    return comment;
}

/* eslint-disable arrow-body-style -- Need to supply formatted JSDoc for type info */
export default () => {

    /**
     * Returns the Espree parser.
     * @param {AcornJsxParser} Parser The Acorn parser
     * @returns {typeof EspreeParser} The Espree parser
     */
    return Parser => {
        const tokTypes = /** @type {EnhancedTokTypes} */ (Object.assign({}, Parser.acorn.tokTypes));

        if (Parser.acornJsx) {
            Object.assign(tokTypes, Parser.acornJsx.tokTypes);
        }

        // eslint-disable-next-line no-shadow -- Using first class as type
        return class EspreeParser extends Parser {
            /* eslint-disable jsdoc/check-types -- Allows generic object */
            /**
             * Adapted parser for Espree.
             * @param {ParserOptions|null} opts Espree options
             * @param {string|object} code The source code
             */
            constructor(opts, code) {
                /* eslint-enable jsdoc/check-types -- Allows generic object */

                /** @type {ParserOptions} */
                const newOpts = (typeof opts !== "object" || opts === null)
                    ? {}
                    : opts;

                const codeString = typeof code === "string"
                    ? /** @type {string} */ (code)
                    : String(code);

                // save original source type in case of commonjs
                const originalSourceType = newOpts.sourceType;
                const options = normalizeOptions(newOpts);
                const ecmaFeatures = options.ecmaFeatures || {};
                const tokenTranslator =
                    options.tokens === true
                        ? new TokenTranslator(tokTypes, codeString)
                        : null;

                // Initialize acorn parser.
                super({

                    // do not use spread, because we don't want to pass any unknown options to acorn
                    ecmaVersion: options.ecmaVersion,
                    sourceType: options.sourceType,
                    ranges: options.ranges,
                    locations: options.locations,
                    allowReserved: options.allowReserved,

                    // Truthy value is true for backward compatibility.
                    allowReturnOutsideFunction: options.allowReturnOutsideFunction,

                    // Collect tokens
                    onToken: /** @param {acorn.Token} token */ token => {
                        if (tokenTranslator) {

                            // Use `tokens`, `ecmaVersion`, and `jsxAttrValueToken` in the state.
                            tokenTranslator.onToken(token, /** @type {StateObjectWithTokens} */ (this[STATE]));
                        }
                        if (token.type !== tokTypes.eof) {
                            this[STATE].lastToken = token;
                        }
                    },

                    // Collect comments
                    /**
                     * Converts an Acorn comment to an Esprima comment.
                     * @type {AcornToEsprimaCommentConverter}
                     */
                    onComment: (block, text, start, end, startLoc, endLoc) => {
                        if (this[STATE].comments) {
                            const comment = convertAcornCommentToEsprimaComment(block, text, start, end, startLoc, endLoc);

                            this[STATE].comments?.push(comment);
                        }
                    }
                }, codeString);

                // Force for TypeScript (indicating that `lineStart` is not undefined)
                if (!this.lineStart) {
                    this.lineStart = 0;
                }

                /**
                 * Data that is unique to Espree and is not represented internally in
                 * Acorn. We put all of this data into a symbol property as a way to
                 * avoid potential naming conflicts with future versions of Acorn.
                 * @type {StateObjectWithTokens|StateObject}
                 */
                this[STATE] = {
                    originalSourceType: originalSourceType || options.sourceType,
                    tokens: tokenTranslator ? /** @type {EspreeTokens} */ ([]) : null,
                    comments: options.comment === true
                        ? /** @type {EsprimaComment[]} */ ([])
                        : null,
                    impliedStrict: ecmaFeatures.impliedStrict === true && this.options.ecmaVersion >= 5,
                    ecmaVersion: this.options.ecmaVersion,
                    jsxAttrValueToken: false,

                    /** @type {acorn.Token|null} */
                    lastToken: null,

                    /** @type {(AcornTemplateNode)[]} */
                    templateElements: []
                };
            }

            /**
             * Returns Espree tokens.
             * @returns {EspreeTokens|null} Espree tokens
             */
            tokenize() {
                do {
                    this.next();
                } while (this.type !== tokTypes.eof);

                // Consume the final eof token
                this.next();

                const extra = this[STATE];
                const tokens = extra.tokens;

                if (extra.comments && tokens) {
                    tokens.comments = extra.comments;
                }

                return tokens;
            }

            /**
             * Calls parent.
             * @param {acorn.Node} node The node
             * @param {string} type The type
             * @returns {acorn.Node} The altered Node
             */
            finishNode(node, type) {
                const result = super.finishNode(node, type);

                return this[ESPRIMA_FINISH_NODE](result);
            }

            /**
             * Calls parent.
             * @param {acorn.Node} node The node
             * @param {string} type The type
             * @param {number} pos The position
             * @param {acorn.Position} loc The location
             * @returns {acorn.Node} The altered Node
             */
            finishNodeAt(node, type, pos, loc) {
                const result = super.finishNodeAt(node, type, pos, loc);

                return this[ESPRIMA_FINISH_NODE](result);
            }

            /**
             * Parses.
             * @returns {EsprimaProgramNode} The program Node
             */
            parse() {
                const extra = this[STATE];

                const program = /** @type {EsprimaProgramNode} */ (super.parse());

                program.sourceType = extra.originalSourceType;

                if (extra.comments) {
                    program.comments = extra.comments;
                }
                if (extra.tokens) {
                    program.tokens = extra.tokens;
                }

                /*
                 * Adjust opening and closing position of program to match Esprima.
                 * Acorn always starts programs at range 0 whereas Esprima starts at the
                 * first AST node's start (the only real difference is when there's leading
                 * whitespace or leading comments). Acorn also counts trailing whitespace
                 * as part of the program whereas Esprima only counts up to the last token.
                 */
                if (program.body.length) {
                    const [firstNode] = program.body;

                    if (program.range && firstNode.range) {
                        program.range[0] = firstNode.range[0];
                    }
                    if (program.loc && firstNode.loc) {
                        program.loc.start = firstNode.loc.start;
                    }
                    program.start = firstNode.start;
                }
                if (extra.lastToken) {
                    if (program.range && extra.lastToken.range) {
                        program.range[1] = extra.lastToken.range[1];
                    }
                    if (program.loc && extra.lastToken.loc) {
                        program.loc.end = extra.lastToken.loc.end;
                    }
                    program.end = extra.lastToken.end;
                }


                /*
                 * https://github.com/eslint/espree/issues/349
                 * Ensure that template elements have correct range information.
                 * This is one location where Acorn produces a different value
                 * for its start and end properties vs. the values present in the
                 * range property. In order to avoid confusion, we set the start
                 * and end properties to the values that are present in range.
                 * This is done here, instead of in finishNode(), because Acorn
                 * uses the values of start and end internally while parsing, making
                 * it dangerous to change those values while parsing is ongoing.
                 * By waiting until the end of parsing, we can safely change these
                 * values without affect any other part of the process.
                 */
                this[STATE].templateElements.forEach(templateElement => {
                    const startOffset = -1;
                    const endOffset = templateElement.tail ? 1 : 2;

                    templateElement.start += startOffset;
                    templateElement.end += endOffset;

                    if (templateElement.range) {
                        templateElement.range[0] += startOffset;
                        templateElement.range[1] += endOffset;
                    }

                    if (templateElement.loc) {
                        templateElement.loc.start.column += startOffset;
                        templateElement.loc.end.column += endOffset;
                    }
                });

                return program;
            }

            /**
             * Parses top level.
             * @param {acorn.Node} node AST Node
             * @returns {acorn.Node} The changed node
             */
            parseTopLevel(node) {
                if (this[STATE].impliedStrict) {
                    this.strict = true;
                }
                return super.parseTopLevel(node);
            }

            /**
             * Overwrites the default raise method to throw Esprima-style errors.
             * @param {int} pos The position of the error.
             * @param {string} message The error message.
             * @throws {EnhancedSyntaxError} A syntax error.
             * @returns {void}
             */
            raise(pos, message) {
                const loc = Parser.acorn.getLineInfo(this.input, pos);

                /** @type {EnhancedSyntaxError} */
                const err = new SyntaxError(message);

                err.index = pos;
                err.lineNumber = loc.line;
                err.column = loc.column + 1; // acorn uses 0-based columns
                throw err;
            }

            /**
             * Overwrites the default raise method to throw Esprima-style errors.
             * @param {int} pos The position of the error.
             * @param {string} message The error message.
             * @throws {EnhancedSyntaxError} A syntax error.
             * @returns {void}
             */
            raiseRecoverable(pos, message) {
                this.raise(pos, message);
            }

            /**
             * Overwrites the default unexpected method to throw Esprima-style errors.
             * @param {int} pos The position of the error.
             * @throws {EnhancedSyntaxError} A syntax error.
             * @returns {void}
             */
            unexpected(pos) {
                let message = "Unexpected token";

                if (pos !== null && pos !== void 0) {
                    this.pos = pos;

                    if (this.options.locations) {
                        while (this.pos < /** @type {number} */ (this.lineStart)) {

                            /** @type {number} */
                            this.lineStart = this.input.lastIndexOf("\n", /** @type {number} */ (this.lineStart) - 2) + 1;
                            --this.curLine;
                        }
                    }

                    this.nextToken();
                }

                if (this.end > this.start) {
                    message += ` ${this.input.slice(this.start, this.end)}`;
                }

                this.raise(this.start, message);
            }

            /**
             * Esprima-FB represents JSX strings as tokens called "JSXText", but Acorn-JSX
             * uses regular tt.string without any distinction between this and regular JS
             * strings. As such, we intercept an attempt to read a JSX string and set a flag
             * on extra so that when tokens are converted, the next token will be switched
             * to JSXText via onToken.
             * @param {number} quote A character code
             * @returns {void}
             */
            jsx_readString(quote) { // eslint-disable-line camelcase
                if (typeof super.jsx_readString === "undefined") {
                    throw new Error("Not a JSX parser");
                }
                const result = super.jsx_readString(quote);

                if (this.type === tokTypes.string) {
                    this[STATE].jsxAttrValueToken = true;
                }
                return result;
            }

            /**
             * Performs last-minute Esprima-specific compatibility checks and fixes.
             * @param {acorn.Node} result The node to check.
             * @returns {EsprimaNode} The finished node.
             */
            [ESPRIMA_FINISH_NODE](result) {

                const esprimaResult = /** @type {EsprimaNode} */ (result);

                // Acorn doesn't count the opening and closing backticks as part of templates
                // so we have to adjust ranges/locations appropriately.
                if (result.type === "TemplateElement") {

                    // save template element references to fix start/end later
                    this[STATE].templateElements.push(result);
                }

                if (result.type.includes("Function") && !esprimaResult.generator) {
                    esprimaResult.generator = false;
                }

                return esprimaResult;
            }
        };
    };
};
