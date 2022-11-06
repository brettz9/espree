/**
 * @fileoverview Tool to prepare JavaScript (+JSDoc) for TypeScript, inlining
 * `@local`-marked `@typedef`'s, and building a faux class for `@export`-marked
 * classes so the type can be exported out of a given file.
 * @author Brett Zamir
 */

//-----------------------------------------------------------------------------
// Requirements
//-----------------------------------------------------------------------------

import js2tsAssistant from "@es-joy/js2ts-assistant";

// ----------------------------------------------------------------------------
// Modify output
// ----------------------------------------------------------------------------

await js2tsAssistant({
    customClassHandling({
        ast, builders, superClassName
    }) {

        // Since we're not tracking types as in using a proper TS transformer
        //  (like `ttypescript`?), we hack this one for now; for generating
        //  our dummy version of the private
        //  `class EspreeParser extends Parser`, we ensure `acorn` exists to be
        //  imported and that we extend from a reference accessible at the root
        //  level of the module
        if (superClassName === "Parser") {

            // Make import available
            ast.body.unshift(
                builders.importDeclaration(
                    [
                        builders.importNamespaceSpecifier(
                            builders.identifier("acorn")
                        )
                    ],
                    builders.literal("acorn"),
                    "value"
                )
            );
            return "acorn.Parser";
        }
        return null;
    }
});
