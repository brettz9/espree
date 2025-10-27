/*
  Copyright (C) 2015 Yusuke Suzuki <utatane.tea@gmail.com>

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
  DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
  (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
  LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
  ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

import estraverse from "estraverse";
import esrecurse from "esrecurse";
import Reference from "./reference.js";
import Variable from "./variable.js";
import PatternVisitor from "./pattern-visitor.js";
import { Definition, ParameterDefinition } from "./definition.js";
import { assert } from "./assert.js";

/**
 * @import * as acorn from "acorn";
 * @import * as estreeJsx from "estree-jsx";
 * @import { PatternVisitorCallback } from "./pattern-visitor.js";
 * @import { Scope } from "./scope.js";
 * @import ScopeManager from "./scope-manager.js";
 */

const { Syntax } = estraverse;

/**
 * Traverse identifier in pattern
 * @param {esrecurse.VisitorOptions} options options
 * @param {acorn.Node | null | undefined} rootPattern root pattern
 * @param {Referencer|null} referencer referencer
 * @param {PatternVisitorCallback} callback callback
 * @returns {void}
 */
function traverseIdentifierInPattern(options, rootPattern, referencer, callback) {

    // Call the callback at left hand identifier nodes, and Collect right hand nodes.
    const visitor = new PatternVisitor(options, rootPattern, callback);

    visitor.visit(rootPattern);

    // Process the right hand nodes recursively.
    if (referencer !== null && referencer !== void 0) {
        visitor.rightHandNodes.forEach(referencer.visit, referencer);
    }
}

// Importing ImportDeclaration.
// http://people.mozilla.org/~jorendorff/es6-draft.html#sec-moduledeclarationinstantiation
// https://github.com/estree/estree/blob/master/es6.md#importdeclaration
// FIXME: Now, we don't create module environment, because the context is
// implementation dependent.

/**
 * Visitor for import specifiers.
 */
class Importer extends esrecurse.Visitor {

    /**
     * @param {acorn.Node} declaration The parent of the specifier
     * @param {Referencer} referencer The configuration to assist in visiting import specifiers
     */
    constructor(declaration, referencer) {
        super(null, referencer.options);
        this.declaration = declaration;
        this.referencer = referencer;
    }

    /**
     * Visits an import specifier
     * @param {acorn.Identifier} id The id
     * @param {acorn.Node} specifier The specifier to visit
     * @returns {void}
     */
    visitImport(id, specifier) {
        this.referencer.visitPattern(id, pattern => {
            this.referencer.currentScope()?.__define(pattern,
                new Definition(
                    Variable.ImportBinding,
                    pattern,
                    specifier,
                    this.declaration,
                    null,
                    null
                ));
        });
    }

    /**
     * Visits the namespace import specifier.
     * @param {acorn.ImportNamespaceSpecifier} node The import namespace specifier node
     * @returns {void}
     */
    ImportNamespaceSpecifier(node) {
        const local = (
            node.local || ("id" in node && node.id)
        );

        if (local) {
            this.visitImport(local, node);
        }
    }

    /**
     * Visits the default import specifier.
     * @param {acorn.ImportNamespaceSpecifier} node The default import specifier node
     * @returns {void}
     */
    ImportDefaultSpecifier(node) {
        const local = (
            node.local ||
            "id" in node && node.id
        );

        this.visitImport(local, node);
    }

    /**
     * Visits the import specifier.
     * @param {acorn.ImportSpecifier} node The import specifier node
     * @returns {void}
     */
    ImportSpecifier(node) {
        const local = (
            node.local ||
            ("id" in node && node.id)
        );

        if ("name" in node && node.name) {
            this.visitImport(

                /** @type {acorn.Identifier} */
                (node.name),
                node
            );
        } else {
            this.visitImport(local, node);
        }
    }
}

/**
 * Referencing variables and creating bindings.
 */
class Referencer extends esrecurse.Visitor {

    /**
     * @param {esrecurse.VisitorOptions} options The options to pass to the parent visitor
     * @param {ScopeManager} scopeManager The scope manager
     */
    constructor(options, scopeManager) {
        super(null, options);
        this.options = options;
        this.scopeManager = scopeManager;

        /** @type {acorn.Node | null} */
        this.parent = null;

        this.isInnerMethodDefinition = false;
    }

    currentScope() {
        return this.scopeManager.__currentScope;
    }

    /**
     * Closes the node
     * @param {acorn.Node} node The node to match
     * @returns {void}
     */
    close(node) {
        while (this.currentScope() && node === this.currentScope()?.block) {
            this.scopeManager.__currentScope = this.currentScope()?.__close(this.scopeManager) ?? null;
        }
    }

    /**
     * Sets the inner method definition and returns the previous value.
     * @param {boolean} isInnerMethodDefinition The inner method defintiion value to set.
     * @returns {boolean} The previous inner method definition value.
     */
    pushInnerMethodDefinition(isInnerMethodDefinition) {
        const previous = this.isInnerMethodDefinition;

        this.isInnerMethodDefinition = isInnerMethodDefinition;
        return previous;
    }

    /**
     * Sets the inner method definition.
     * @param {boolean} isInnerMethodDefinition The inner method defintiion value to set.
     * @returns {void}
     */
    popInnerMethodDefinition(isInnerMethodDefinition) {
        this.isInnerMethodDefinition = isInnerMethodDefinition;
    }

    /**
     * References default value.
     * @param {acorn.Node} pattern The pattern
     * @param {(acorn.AssignmentPattern|acorn.AssignmentExpression)[]} assignments The assignments
     * @param {{
     *   pattern: acorn.Node,
     *   node: acorn.Node
     * } | null | undefined} maybeImplicitGlobal Whether it is an implicit global
     * @param {boolean} init Whether the Reference is to write of initialization.
     * @returns {void}
     */
    referencingDefaultValue(pattern, assignments, maybeImplicitGlobal, init) {
        const scope = this.currentScope();

        assignments.forEach(assignment => {
            scope?.__referencing(
                pattern,
                Reference.WRITE,
                assignment.right,
                maybeImplicitGlobal,
                pattern !== assignment.left,
                init
            );
        });
    }

    /**
     * @typedef {{
     *   processRightHandNodes: boolean
     * }} VisitPatternOptions
     */

    /**
     * Visits a pattern.
     * @param {acorn.Node | null | undefined} node The node to visit
     * @param {VisitPatternOptions|PatternVisitorCallback} options The options for traversing the identifier
     * @param {PatternVisitorCallback} [callback] The callback for  traversing the identifier
     * @returns {void}
     */
    visitPattern(node, options, callback) {
        let visitPatternOptions = options;
        let visitPatternCallback = callback;

        if (typeof options === "function") {
            visitPatternCallback = /** @type {PatternVisitorCallback} */ (
                options
            );
            visitPatternOptions = { processRightHandNodes: false };
        }

        traverseIdentifierInPattern(
            this.options,
            node,

            /** @type {VisitPatternOptions} */
            (visitPatternOptions).processRightHandNodes ? this : null,

            /** @type {PatternVisitorCallback} */
            (visitPatternCallback)
        );
    }

    /**
     * Visit a function
     * @param {acorn.FunctionDeclaration|acorn.FunctionExpression|
     *   acorn.ArrowFunctionExpression} node The node
     * @returns {void}
     */
    visitFunction(node) {

        /** @type {number} */
        let i,
            iz;

        // FunctionDeclaration name is defined in upper scope
        // NOTE: Not referring variableScope. It is intended.
        // Since
        //  in ES5, FunctionDeclaration should be in FunctionBody.
        //  in ES6, FunctionDeclaration should be block scoped.

        if (node.type === Syntax.FunctionDeclaration) {

            // id is defined in upper scope
            this.currentScope()?.__define(

                /** @type {acorn.Identifier} */
                (node.id),
                new Definition(
                    Variable.FunctionName,

                    /** @type {acorn.Identifier} */
                    (node.id),
                    node,
                    null,
                    null,
                    null
                )
            );
        }

        // FunctionExpression with name creates its special scope;
        // FunctionExpressionNameScope.
        if (node.type === Syntax.FunctionExpression && node.id) {
            this.scopeManager.__nestFunctionExpressionNameScope(

                /** @type {acorn.FunctionExpression} */
                (node)
            );
        }

        // Consider this function is in the MethodDefinition.
        this.scopeManager.__nestFunctionScope(node, this.isInnerMethodDefinition);

        const that = this;

        /**
         * Visit pattern callback
         * @type {PatternVisitorCallback}
         */
        function visitPatternCallback(pattern, info) {
            that.currentScope()?.__define(pattern,
                new ParameterDefinition(
                    pattern,
                    node,
                    i,
                    info.rest
                ));

            that.referencingDefaultValue(pattern, info.assignments, null, true);
        }

        // Process parameter declarations.
        for (i = 0, iz = node.params.length; i < iz; ++i) {
            this.visitPattern(node.params[i], { processRightHandNodes: true }, visitPatternCallback);
        }

        // if there's a rest argument, add that
        if ("rest" in node && node.rest) {
            this.visitPattern(/** @type {acorn.RestElement} */ ({
                type: "RestElement",
                argument: node.rest
            }), pattern => {
                this.currentScope()?.__define(pattern,
                    new ParameterDefinition(
                        pattern,
                        node,
                        node.params.length,
                        true
                    ));
            });
        }

        // In TypeScript there are a number of function-like constructs which have no body,
        // so check it exists before traversing
        if (node.body) {

            // Skip BlockStatement to prevent creating BlockStatement scope.
            if (node.body.type === Syntax.BlockStatement) {
                this.visitChildren(node.body);
            } else {
                this.visit(node.body);
            }
        }

        this.close(node);
    }

    /**
     * Visits a class
     * @param {acorn.ClassDeclaration|acorn.ClassExpression} node The node to visit
     * @returns {void}
     */
    visitClass(node) {
        if (node.type === Syntax.ClassDeclaration) {
            this.currentScope()?.__define(

                /** @type {acorn.Identifier} */
                (node.id),
                new Definition(
                    Variable.ClassName,

                    /** @type {acorn.Identifier} */
                    (node.id),
                    node,
                    null,
                    null,
                    null
                )
            );
        }

        this.scopeManager.__nestClassScope(node);

        if (node.id) {
            this.currentScope()?.__define(node.id,
                new Definition(
                    Variable.ClassName,
                    node.id,
                    node
                ));
        }

        this.visit(node.superClass);
        this.visit(node.body);

        this.close(node);
    }

    /**
     * Visits a property
     * @param {acorn.Property|acorn.MethodDefinition} node The node to visit
     * @returns {void}
     */
    visitProperty(node) {
        let previous;

        if (node.computed) {
            this.visit(node.key);
        }

        const isMethodDefinition = node.type === Syntax.MethodDefinition;

        if (isMethodDefinition) {
            previous = this.pushInnerMethodDefinition(true);
        }
        this.visit(node.value);
        if (isMethodDefinition) {
            this.popInnerMethodDefinition(/** @type {boolean} */ (previous));
        }
    }

    /**
     * Visits a property
     * @param {acorn.ForInStatement|acorn.ForOfStatement} node The node to visit
     * @returns {void}
     */
    visitForIn(node) {
        if (node.left.type === Syntax.VariableDeclaration &&

            /** @type {acorn.VariableDeclaration} */
            (node.left).kind !== "var") {
            this.scopeManager.__nestForScope(node);
        }

        if (node.left.type === Syntax.VariableDeclaration) {
            this.visit(node.left);
            this.visitPattern(

                /** @type {acorn.VariableDeclaration} */
                (node.left).declarations[0].id,
                pattern => {
                    this.currentScope()?.__referencing(pattern, Reference.WRITE, node.right, null, true, true);
                }
            );
        } else {
            this.visitPattern(node.left, { processRightHandNodes: true }, (pattern, info) => {
                let maybeImplicitGlobal = null;

                if (!this.currentScope()?.isStrict) {
                    maybeImplicitGlobal = {
                        pattern,
                        node
                    };
                }
                this.referencingDefaultValue(pattern, info.assignments, maybeImplicitGlobal, false);
                this.currentScope()?.__referencing(pattern, Reference.WRITE, node.right, maybeImplicitGlobal, true, false);
            });
        }
        this.visit(node.right);
        this.visit(node.body);

        this.close(node);
    }

    /**
     * Visits the variable declaration
     * @param {Scope | null | undefined} variableTargetScope The variable's targt scope
     * @param {string} type The node type
     * @param {acorn.VariableDeclaration} node The node to visit
     * @param {number} index The index of the iteration
     * @returns {void}
     */
    visitVariableDeclaration(variableTargetScope, type, node, index) {

        const decl = node.declarations[index];
        const init = decl.init;

        this.visitPattern(decl.id, { processRightHandNodes: true }, (pattern, info) => {
            variableTargetScope?.__define(
                pattern,
                new Definition(
                    type,
                    pattern,
                    decl,
                    node,
                    index,
                    node.kind
                )
            );

            this.referencingDefaultValue(pattern, info.assignments, null, true);
            if (init) {
                this.currentScope()?.__referencing(pattern, Reference.WRITE, init, null, !info.topLevel, true);
            }
        });
    }

    /**
     * Visits the assignment expression
     * @param {acorn.AssignmentExpression} node The node to visit
     * @returns {void}
     */
    AssignmentExpression(node) {
        if (PatternVisitor.isPattern(node.left)) {
            if (node.operator === "=") {
                this.visitPattern(node.left, { processRightHandNodes: true }, (pattern, info) => {
                    let maybeImplicitGlobal = null;

                    if (!this.currentScope()?.isStrict) {
                        maybeImplicitGlobal = {
                            pattern,
                            node
                        };
                    }
                    this.referencingDefaultValue(pattern, info.assignments, maybeImplicitGlobal, false);
                    this.currentScope()?.__referencing(pattern, Reference.WRITE, node.right, maybeImplicitGlobal, !info.topLevel, false);
                });
            } else {
                this.currentScope()?.__referencing(node.left, Reference.RW, node.right);
            }
        } else {
            this.visit(node.left);
        }
        this.visit(node.right);
    }

    /**
     * Visits the catch clause
     * @param {acorn.CatchClause} node The node to visit
     * @returns {void}
     */
    CatchClause(node) {
        this.scopeManager.__nestCatchScope(node);

        this.visitPattern(node.param, { processRightHandNodes: true }, (pattern, info) => {
            this.currentScope()?.__define(pattern,
                new Definition(
                    Variable.CatchClause,
                    pattern,
                    node,
                    null,
                    null,
                    null
                ));
            this.referencingDefaultValue(pattern, info.assignments, null, true);
        });
        this.visit(node.body);

        this.close(node);
    }

    /**
     * Visits the catch clause
     * @param {acorn.Program} node The node to visit
     * @returns {void}
     */
    Program(node) {
        this.scopeManager.__nestGlobalScope(node);

        if (this.scopeManager.isGlobalReturn()) {

            // Force strictness of GlobalScope to false when using node.js scope.
            const currScope = /** @type {Scope} */ (this.currentScope());

            currScope.isStrict = false;
            this.scopeManager.__nestFunctionScope(node, false);
        }

        if (this.scopeManager.__isES6() && this.scopeManager.isModule()) {
            this.scopeManager.__nestModuleScope(node);
        }

        if (this.scopeManager.isStrictModeSupported() && this.scopeManager.isImpliedStrict()) {
            const currScope = /** @type {Scope} */ (this.currentScope());

            currScope.isStrict = true;
        }

        this.visitChildren(node);
        this.close(node);
    }

    /**
     * Visits the identifier
     * @param {acorn.Identifier} node The node to visit
     * @returns {void}
     */
    Identifier(node) {
        this.currentScope()?.__referencing(node);
    }

    // eslint-disable-next-line class-methods-use-this -- Desired as instance method
    PrivateIdentifier() {

        // Do nothing.
    }

    /**
     * Visits the update expression
     * @param {acorn.UpdateExpression} node The node to visit
     * @returns {void}
     */
    UpdateExpression(node) {
        if (PatternVisitor.isPattern(node.argument)) {
            this.currentScope()?.__referencing(node.argument, Reference.RW, null);
        } else {
            this.visitChildren(node);
        }
    }

    /**
     * Visits the member expression
     * @param {acorn.MemberExpression} node The node to visit
     * @returns {void}
     */
    MemberExpression(node) {
        this.visit(node.object);
        if (node.computed) {
            this.visit(node.property);
        }
    }

    /**
     * Visits the property
     * @param {acorn.Property} node The node to visit
     * @returns {void}
     */
    Property(node) {
        this.visitProperty(node);
    }

    /**
     * Visits the property definition
     * @param {acorn.PropertyDefinition} node The node to visit
     * @returns {void}
     */
    PropertyDefinition(node) {
        const { computed, key, value } = node;

        if (computed) {
            this.visit(key);
        }
        if (value) {
            this.scopeManager.__nestClassFieldInitializerScope(value);
            this.visit(value);
            this.close(value);
        }
    }

    /**
     * Visits the static block
     * @param {acorn.StaticBlock} node The node to visit
     * @returns {void}
     */
    StaticBlock(node) {
        this.scopeManager.__nestClassStaticBlockScope(node);

        this.visitChildren(node);

        this.close(node);
    }

    /**
     * Visits the method definition
     * @param {acorn.MethodDefinition} node The node to visit
     * @returns {void}
     */
    MethodDefinition(node) {
        this.visitProperty(node);
    }

    BreakStatement() {} // eslint-disable-line class-methods-use-this -- Desired as instance method

    ContinueStatement() {} // eslint-disable-line class-methods-use-this -- Desired as instance method

    /**
     * Visits the labeled statement
     * @param {acorn.LabeledStatement} node The node to visit
     * @returns {void}
     */
    LabeledStatement(node) {
        this.visit(node.body);
    }

    /**
     * Visits the for statement
     * @param {acorn.ForStatement} node The node to visit
     * @returns {void}
     */
    ForStatement(node) {

        // Create ForStatement declaration.
        // NOTE: In ES6, ForStatement dynamically generates
        // per iteration environment. However, escope is
        // a static analyzer, we only generate one scope for ForStatement.
        if (node.init && node.init.type === Syntax.VariableDeclaration &&

            /** @type {acorn.VariableDeclaration} */
            (node.init).kind !== "var") {
            this.scopeManager.__nestForScope(node);
        }

        this.visitChildren(node);

        this.close(node);
    }

    /**
     * Visits the class expression
     * @param {acorn.ClassExpression} node The node to visit
     * @returns {void}
     */
    ClassExpression(node) {
        this.visitClass(node);
    }

    /**
     * Visits the class declaration
     * @param {acorn.ClassDeclaration} node The node to visit
     * @returns {void}
     */
    ClassDeclaration(node) {
        this.visitClass(node);
    }

    /**
     * Visits the call expression
     * @param {acorn.CallExpression} node The node to visit
     * @returns {void}
     */
    CallExpression(node) {

        // Check this is direct call to eval
        if (!this.scopeManager.__ignoreEval() && node.callee.type === Syntax.Identifier &&

            /** @type {acorn.Identifier} */
            (node.callee).name === "eval") {

            // NOTE: This should be `variableScope`. Since direct eval call always creates Lexical environment and
            // let / const should be enclosed into it. Only VariableDeclaration affects on the caller's environment.
            this.currentScope()?.variableScope?.__detectEval();
        }
        this.visitChildren(node);
    }

    /**
     * Visits the block statement
     * @param {acorn.BlockStatement} node The node to visit
     * @returns {void}
     */
    BlockStatement(node) {
        if (this.scopeManager.__isES6()) {
            this.scopeManager.__nestBlockScope(node);
        }

        this.visitChildren(node);

        this.close(node);
    }

    ThisExpression() {
        this.currentScope()?.variableScope?.__detectThis();
    }

    /**
     * Visits the `with` statement
     * @param {acorn.WithStatement} node The node to visit
     * @returns {void}
     */
    WithStatement(node) {
        this.visit(node.object);

        // Then nest scope for WithStatement.
        this.scopeManager.__nestWithScope(node);

        this.visit(node.body);

        this.close(node);
    }

    /**
     * Visits the variable declaration
     * @param {acorn.VariableDeclaration} node The node to visit
     * @returns {void}
     */
    VariableDeclaration(node) {
        const variableTargetScope = (node.kind === "var") ? this.currentScope()?.variableScope : this.currentScope();

        for (let i = 0, iz = node.declarations.length; i < iz; ++i) {
            const decl = node.declarations[i];

            this.visitVariableDeclaration(variableTargetScope, Variable.Variable, node, i);
            if (decl.init) {
                this.visit(decl.init);
            }
        }
    }

    // sec 13.11.8
    /**
     * Visits the switch statement
     * @param {acorn.SwitchStatement} node The node to visit
     * @returns {void}
     */
    SwitchStatement(node) {
        this.visit(node.discriminant);

        if (this.scopeManager.__isES6()) {
            this.scopeManager.__nestSwitchScope(node);
        }

        for (let i = 0, iz = node.cases.length; i < iz; ++i) {
            this.visit(node.cases[i]);
        }

        this.close(node);
    }

    /**
     * Visits the function declaration
     * @param {acorn.FunctionDeclaration} node The node to visit
     * @returns {void}
     */
    FunctionDeclaration(node) {
        this.visitFunction(node);
    }

    /**
     * Visits the function expression
     * @param {acorn.FunctionExpression} node The node to visit
     * @returns {void}
     */
    FunctionExpression(node) {
        this.visitFunction(node);
    }

    /**
     * Visits the for-of statement
     * @param {acorn.ForOfStatement} node The node to visit
     * @returns {void}
     */
    ForOfStatement(node) {
        this.visitForIn(node);
    }

    /**
     * Visits the for-in statement
     * @param {acorn.ForInStatement} node The node to visit
     * @returns {void}
     */
    ForInStatement(node) {
        this.visitForIn(node);
    }

    /**
     * Visits the arrow function expression
     * @param {acorn.ArrowFunctionExpression} node The node to visit
     * @returns {void}
     */
    ArrowFunctionExpression(node) {
        this.visitFunction(node);
    }

    /**
     * Visits the import declaration
     * @param {acorn.ImportDeclaration} node The node to visit
     * @returns {void}
     */
    ImportDeclaration(node) {
        assert(this.scopeManager.__isES6() && this.scopeManager.isModule(), "ImportDeclaration should appear when the mode is ES6 and in the module context.");

        const importer = new Importer(node, this);

        importer.visit(node);
    }

    /**
     * Visits the export declaration
     * @param {acorn.ExportAllDeclaration|acorn.ExportDefaultDeclaration|
     *   acorn.ExportNamedDeclaration} node The node to visit
     * @returns {void}
     */
    visitExportDeclaration(node) {
        if ("source" in node && node.source) {
            return;
        }
        if ("declaration" in node && node.declaration) {
            this.visit(node.declaration);
            return;
        }

        this.visitChildren(node);
    }

    // TODO: ExportDeclaration doesn't exist. for bc?
    /**
     * Visits the export declaration
     * @param {acorn.ExportAllDeclaration|acorn.ExportDefaultDeclaration|
     *   acorn.ExportNamedDeclaration} node The node to visit
     * @returns {void}
     */
    ExportDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    /**
     * Visits the export all declaration
     * @param {acorn.ExportAllDeclaration} node The node to visit
     * @returns {void}
     */
    ExportAllDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    /**
     * Visits the export default declaration
     * @param {acorn.ExportDefaultDeclaration} node The node to visit
     * @returns {void}
     */
    ExportDefaultDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    /**
     * Visits the named export declaration
     * @param {acorn.ExportNamedDeclaration} node The node to visit
     * @returns {void}
     */
    ExportNamedDeclaration(node) {
        this.visitExportDeclaration(node);
    }

    /**
     * Visits the named export specifier
     * @param {acorn.ExportSpecifier} node The node to visit
     * @returns {void}
     */
    ExportSpecifier(node) {

        // TODO: `node.id` doesn't exist. for bc?
        const local = (("id" in node && node.id) || node.local);

        this.visit(local);
    }

    MetaProperty() { // eslint-disable-line class-methods-use-this -- Desired as instance method

        // do nothing.
    }

    /**
     * Visits the JSX identifier
     * @param {estreeJsx.JSXIdentifier} node The node to visit
     * @returns {void}
     */
    JSXIdentifier(node) {

        // Special case: "this" should not count as a reference
        if (this.scopeManager.__isJSXEnabled() && node.name !== "this") {
            this.currentScope()?.__referencing(node);
        }
    }

    /**
     * Visits the JSX member expression
     * @param {estreeJsx.JSXMemberExpression} node The node to visit
     * @returns {void}
     */
    JSXMemberExpression(node) {
        this.visit(node.object);
    }

    /**
     * Visits the JSX element
     * @param {estreeJsx.JSXElement} node The node to visit
     * @returns {void}
     */
    JSXElement(node) {
        if (this.scopeManager.__isJSXEnabled()) {
            this.visit(node.openingElement);
            node.children.forEach(this.visit, this);
        } else {
            this.visitChildren(node);
        }
    }

    /**
     * Visits the JSX opening element
     * @param {estreeJsx.JSXOpeningElement} node The node to visit
     * @returns {void}
     */
    JSXOpeningElement(node) {
        if (this.scopeManager.__isJSXEnabled()) {

            const nameNode = node.name;
            const isComponentName = nameNode.type === "JSXIdentifier" && nameNode.name[0].toUpperCase() === nameNode.name[0];
            const isComponent = isComponentName || nameNode.type === "JSXMemberExpression";

            // we only want to visit JSXIdentifier nodes if they are capitalized
            if (isComponent) {
                this.visit(nameNode);
            }
        }

        node.attributes.forEach(this.visit, this);
    }

    /**
     * Visits the JSX attribute
     * @param {estreeJsx.JSXAttribute} node The node to visit
     * @returns {void}
     */
    JSXAttribute(node) {
        if ("value" in node && node.value) {
            this.visit(node.value);
        }
    }

    /**
     * Visits the JSX expression container
     * @param {estreeJsx.JSXExpressionContainer} node The node to visit
     * @returns {void}
     */
    JSXExpressionContainer(node) {
        this.visit(node.expression);
    }

    /**
     * Visits the JSX namespaced name
     * @param {estreeJsx.JSXNamespacedName} node The node to visit
     * @returns {void}
     */
    JSXNamespacedName(node) {
        this.visit(node.namespace);
        this.visit(node.name);
    }
}

export default Referencer;

/* vim: set sw=4 ts=4 et tw=80 : */
