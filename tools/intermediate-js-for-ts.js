import {readFile} from 'fs/promises';
import esquery from 'esquery';
import jsdocEslintParser from '@es-joy/jsdoc-eslint-parser';
import estreeToBabel from 'estree-to-babel';
import generator from '@babel/generator';

const generate = generator.default;

const contents = await readFile('./lib/espree.js', 'utf8');

const {visitorKeys, ast} = jsdocEslintParser.parseForESLint(contents, {
    mode: 'typescript',
    throwOnTypeParsingErrors: true,
    babelOptions: {
        filePath: 'babel.config.cjs'
    }
});

// const jsdoc = esquery.query(ast, 'JsdocBlock:has(JsdocTag[tag=local])', { // JsdocTag[tag=param][name=code]
const typedefSiblingsOfLocal = 'JsdocTag[tag=local] ~ JsdocTag[tag=typedef]';
const typedefs = esquery.query(ast, typedefSiblingsOfLocal, {
    visitorKeys
});

// Replace type shorthands with our typedef long form
typedefs.forEach(({name, parsedType}) => {
    const nameNodes = esquery.query(ast, `JsdocTypeName[value=${name}]`, {
        visitorKeys
    });
    // Rather than splice from a child whose index we don't know (though we
    //   could add a property on `jsdoc-eslint-parser`), just copy the keys to
    //   the existing object

    // Todo: Serialize and graft `rawType` onto source code so preserve
    //   accurate positions
    nameNodes.forEach((nameNode) => {
        Object.keys(nameNode).forEach((prop) => {
            delete nameNode[prop];
        });
        Object.entries(parsedType).forEach(([prop, val]) => {
            nameNode[prop] = val;
        });
    });
});

// Remove local typedefs from AST
typedefs.forEach((typedef) => {
    const {tags} = typedef.parent;
    const idx = tags.indexOf(typedef);
    tags.splice(idx, 1);
});

// console.log('typedefs', typedefs);
// console.log('jsdocBlocks', ast.jsdocBlocks);

// Todo: use `@babel/generator` (and ensure can support `comments`, some of
//   which we need for type information)

const babelAST = estreeToBabel(ast);

const generated = generate(babelAST, {
    comments: true
}, contents);

console.log(generated);
