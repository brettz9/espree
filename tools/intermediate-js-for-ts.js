import { readFile } from "fs/promises";

import esquery from "esquery";
import { globby } from "globby";

import * as recast from "recast";

import * as jsdocEslintParser from "@es-joy/jsdoc-eslint-parser/typescript.js";

import estreeToBabel from "estree-to-babel";

// import generator from "@babel/generator";
// const generate = generator.default;

const {
    include,
    exclude: ignoreFiles
} = JSON.parse(await readFile("tsconfig.json"));

const files = await globby(include, {
    ignoreFiles
});

// await Promise.all(files.map(async file => {
await Promise.all([files[1]].map(async file => {
    const contents = await readFile(file, "utf8");

    let visitorKeys;
    const { program: estreeAST } = recast.parse(contents, {
        parser: {
            parse(source) {
                const parsedTree = jsdocEslintParser.parseForESLint(source, {
                    mode: "typescript",
                    throwOnTypeParsingErrors: true,
                    babelOptions: {
                        filePath: "babel.config.cjs"
                    }
                });

                ({ visitorKeys } = parsedTree);

                return estreeToBabel(parsedTree.ast);
            }
        }
    });

    console.log('estreeAST', estreeAST);
    throw '';

    // const { visitorKeys, ast: estreeAST } = tree;

    // escodegen.attachComments(estreeAST, estreeAST.comments, estreeAST.tokens);

    const ast = estreeAST;

    // const ast = estreeToBabel(estreeAST);
    // console.log("babelAST", ast);

    // const jsdoc = esquery.query(ast, 'JsdocBlock:has(JsdocTag[tag=local])', { // JsdocTag[tag=param][name=code] :has() not working
    const typedefSiblingsOfLocal = "JsdocTag[tag=local] ~ JsdocTag[tag=typedef]";
    const typedefs = esquery.query(ast, typedefSiblingsOfLocal, {
        visitorKeys
    });

    // Replace type shorthands with our typedef long form
    typedefs.forEach(({ name, parsedType }) => {
        const nameNodes = esquery.query(ast, `JsdocTypeName[value=${name}]`, {
            visitorKeys
        });

        // Rather than splice from a child whose index we don't know (though we
        //   could add a property on `jsdoc-eslint-parser`), just copy the keys to
        //   the existing object

        // Todo: Serialize and graft `parsedType` onto source code so preserve
        //   accurate positions
        nameNodes.forEach(nameNode => {
            Object.keys(nameNode).forEach(prop => {
                delete nameNode[prop];
            });
            Object.entries(parsedType).forEach(([prop, val]) => {
                nameNode[prop] = val;
            });
        });
    });

    // Remove local typedefs from AST
    for (const typedef of typedefs) {
        const { tags } = typedef.parent;
        const idx = tags.indexOf(typedef);

        tags.splice(idx, 1);
    }

    // Now remove the empty locals
    const emptyLocals = esquery.query(ast, "JsdocBlock:has(JsdocTag:not([tag!=local]))", {
        visitorKeys
    });

    for (const emptyLocal of emptyLocals) {
        const idx = ast.jsdocBlocks.indexOf(emptyLocal);

        ast.jsdocBlocks.splice(idx, 1);
    }

    const exportBlocks = esquery.query(ast, "JsdocBlock:has(JsdocTag[tag=export])", {
        visitorKeys
    });

    for (const exportBlock of exportBlocks) {
        switch (exportBlock.parent.type) {
            case "ReturnStatement":
                console.log("exportBlock", exportBlock.parent.argument.type);
                break;
            default:
                throw new Error("Currently unsupported AST export structure");
        }
    }

    console.log(recast.print(ast).code);
}));
