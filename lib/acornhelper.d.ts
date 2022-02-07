import * as acorn from 'acorn';

export class AcornParser extends acorn.Parser {
  // Added by acorn-jsx plugin
  static acornJsx?: {
    tokTypes: typeof acorn.tokTypes
  }

  // In Acorn JSX but not its *.d.ts
  jsx_readString?(quote: number): void;
}
