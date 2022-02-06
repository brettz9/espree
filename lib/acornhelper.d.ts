import * as acorn from 'acorn';
import jsx from "acorn-jsx";

type tokTypesType = typeof acorn.tokTypes;

type ecmaVersion = 10 | 9 | 8 | 7 | 6 | 5 | 3 | 11 | 12 | 13 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 'latest';

export interface FixedAcornNode extends acorn.Node {
  tail?: boolean
}

export interface EsprimaNode extends acorn.Node {
  generator?: boolean
}

export interface EsprimaComment {
  // As in `acorn.Comment`
  type: string,
  value: string,
  range?: [number, number],

  // As in `acorn.Comment` but optional
  start?: number,
  end?: number,

  // Different from `acorn.Comment` (`acorn.SourceLocation` -> `acorn.Position`) as
  //    has to allow `undefined` for `start`/`end`
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
  // From?
  jsxAttrValueToken?: acorn.TokenType;

  // Used in Acorn JSX but not its *.d.ts
  jsxName?: acorn.TokenType;
  jsxTagEnd?: acorn.TokenType;
  jsxTagStart?: acorn.TokenType;

  // Used in Acorn but not its *.d.ts
  invalidTemplate: acorn.TokenType;
  questionDot: acorn.TokenType;
}

// jsx.Options gives us 2 optional properties, so extend it
export interface ParserOptions extends jsx.Options {
  // As in `acorn.Options`
  allowReserved?: boolean | "never",
  ranges?: boolean,
  locations?: boolean,
  allowReturnOutsideFunction?: boolean,
  onToken?: ((token: acorn.Token) => any) | acorn.Token[]
  onComment?: ((
    isBlock: boolean, text: string, start: number, end: number, startLoc?: acorn.Position,
    endLoc?: acorn.Position
  ) => void) | acorn.Comment[]

  // As in `acorn.Options` though optional
  ecmaVersion?: ecmaVersion,

  // As in `acorn.Options` but also allows `commonjs`
  sourceType?: "script"|"module"|"commonjs",

  // Not in `acorn.Options`
  ecmaFeatures?: {
   jsx?: boolean,
   globalReturn?: boolean,
   impliedStrict?: boolean
  },
  range?: boolean,
  loc?: boolean,
  tokens?: boolean | null

  // Not in `acorn.Options` and doesn't err without it, but is used
  comment?: boolean,
}

export class AcornParser extends acorn.Parser {
  // Unspecified in Acorn *.d.ts file, but provided by Acorn
  static acorn: {
    tokTypes: tokTypesType,
    getLineInfo: typeof acorn.getLineInfo
  }

  // Added by acorn-jsx plugin
  static acornJsx?: {
    tokTypes: tokTypesType
  }

  // In Acorn but not its *.d.ts
  next(): void;
  nextToken(): void;
  parseTopLevel(node: acorn.Node): acorn.Node;
  finishNode(node: acorn.Node, type: string): acorn.Node;
  finishNodeAt(node: acorn.Node, type: string, pos: number, loc: acorn.Position): acorn.Node;
  options: {
    ecmaVersion: ecmaVersion,
    locations: object
  };
  curLine: number;
  start: number;
  end: number;
  input: string;
  type: acorn.TokenType;

  // TS not erring without these, but we do use some, and it is in Acorn (though not its *.d.ts)
  lineStart: number | undefined;
  raise(pos: number, message: string) : void;
  raiseRecoverable(pos: number, message: string) : void;
  unexpected(pos: number) : void;

  // In Acorn JSX but not its *.d.ts
  jsx_readString?(quote: number): void;
}

export class EspreeParser extends AcornParser  {
    constructor(options: ParserOptions, input: string, startPos?: number);

    tokenize() : EspreeTokens|null;
}
