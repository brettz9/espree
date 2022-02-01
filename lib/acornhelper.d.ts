import * as acorn from 'acorn';

type tokTypesType = typeof acorn.tokTypes;

type ecmaVersion = 10 | 9 | 8 | 7 | 6 | 5 | 3 | 11 | 12 | 13 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 'latest';

export interface FixedAcornNode extends acorn.Node {
  tail?: boolean
}

export interface EsprimaNode extends acorn.Node {
  generator?: boolean
}

export interface EsprimaComment {
  type: string,
  value: string,
  start?: number,
  end?: number,
  range?: [number, number],
  loc?: {
    start: acorn.Position | undefined,
    end: acorn.Position | undefined
  }
}

export interface EsprimaProgramNode extends acorn.Node {
  sourceType?: "script"|"module"|"commonjs";
  comments?: EsprimaComment[];
  tokens?: acorn.Token[],
  body: acorn.Node[]
}

export interface BaseStateObject {
  originalSourceType: "script"|"module"|"commonjs";
  ecmaVersion: ecmaVersion,
  comments: EsprimaComment[]|null;
  impliedStrict: boolean;
  lastToken: acorn.Token|null;
  templateElements: (FixedAcornNode)[];
  jsxAttrValueToken: boolean;
}

export interface StateObject extends BaseStateObject {
  tokens: null;
}

export interface StateObjectWithTokens extends BaseStateObject {
  tokens: EspreeTokens;
}

// Based on the `acorn.Token` class, but without a fixed `type` (since we need
//   it to be a string)
export interface BaseEsprimaToken {
  // Avoiding `type` lets us make one extending interface more strict and
  //   another more lax

  // We could make this more strict even though the original is `any`
  // value: string;
  value: any;

  // Required in `acorn.Token`
  start?: number;
  end?: number;

  // From `acorn.Token`
  loc?: acorn.SourceLocation;
  range?: [number, number];

  // Adds:
  regex?: {flags: string, pattern: string};
}

export interface EsprimaToken extends BaseEsprimaToken {
  type: string;
}

export interface EsprimaTokenFlexible extends BaseEsprimaToken {
  type: string | acorn.TokenType;
}

export interface ExtraNoTokens {
  jsxAttrValueToken: boolean
  ecmaVersion: ecmaVersion
}

export interface Extra extends ExtraNoTokens {
  tokens: EsprimaTokenFlexible[]
}

export type EspreeTokens = acorn.Token[] & {
  comments?: EsprimaComment[]
}

export interface EnhancedSyntaxError extends SyntaxError {
  index?: number;
  lineNumber?: number;
  column?: number;
}

type CopyAll<T> = {
  [K in keyof T]: T[K]
};

export interface EnhancedTokTypes extends CopyAll<tokTypesType> {
  invalidTemplate: acorn.TokenType;
  jsxName: acorn.TokenType;
  jsxTagEnd: acorn.TokenType;
  jsxTagStart: acorn.TokenType;
  jsxAttrValueToken: acorn.TokenType;
  questionDot: acorn.TokenType;
}

export class AcornParser extends acorn.Parser  {
    constructor(options: acorn.Options, input: string, startPos?: number);

    parse(): acorn.Node;

    next(): void;
    nextToken(): void;

    jsx_readString(quote: number): void;

    parseTopLevel(node: acorn.Node): acorn.Node;

    finishNode(node: acorn.Node, type: string): acorn.Node;

    finishNodeAt(node: acorn.Node, type: string, pos: number, loc: acorn.Position): acorn.Node;

    options: {
      ecmaVersion: ecmaVersion,
      locations: object
    };

    lineStart: number | undefined;
    curLine: number;
    start: number;
    end: number;
    input: string;
    type: acorn.TokenType;

    static acorn: {
      tokTypes: tokTypesType,
      getLineInfo: typeof acorn.getLineInfo
    }

    static acornJsx?: {
      tokTypes: tokTypesType
    }
}
