import { readFile } from "fs/promises";

import esquery from "esquery";
import { globby } from "globby";

import * as jsdocEslintParser from "@es-joy/jsdoc-eslint-parser/typescript.js";
import {
    estreeToString, jsdocVisitorKeys, jsdocTypeVisitorKeys
} from "@es-joy/jsdoccomment";

// import estreeToBabel from "estree-to-babel";
// import generator from "@babel/generator";

import * as escodegen from "@es-joy/escodegen";

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

    const tree = jsdocEslintParser.parseForESLint(contents, {
        mode: "typescript",
        throwOnTypeParsingErrors: true,
        babelOptions: {
            filePath: "babel.config.cjs"
        }
    });

    const { visitorKeys, ast: estreeAST } = tree;

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

    // const generated = generate(ast, {
    //     comments: true
    // }, contents);

    // Would avoid need for conversion to Babel, but need ESTree
    //  facilities for AST manipulation
    // const generated = escodegen.generate(ast, {
    //     comment: true,
    //     sourceContent: contents
    // });

    const generated = escodegen.generate(ast, {

        // comment: true,
        sourceContent: contents,
        codegenFactory() {
            const { CodeGenerator } = escodegen;

            Object.keys(jsdocVisitorKeys).forEach(method => {
                CodeGenerator.Statement[method] =
            CodeGenerator.prototype[method] = node =>

                // We have to add our own line break, as `jsdoccomment` (nor
                //   `comment-parser`) keep track of trailing content
                ((
                    node.endLine ? "\n" : ""
                ) + estreeToString(node) +
                (node.endLine ? `\n${node.initial}` : " "));
            });

            Object.keys(jsdocTypeVisitorKeys).forEach(method => {
                CodeGenerator.Statement[method] =
            CodeGenerator.prototype[method] = node =>
                estreeToString(node);
            });

            return new CodeGenerator();
        }
    });

    // console.log(generated);
}));
