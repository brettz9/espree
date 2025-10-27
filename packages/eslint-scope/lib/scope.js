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

/**
 * @import * as acorn from "acorn";
 */

import estraverse from "estraverse";

import Reference from "./reference.js";
import Variable from "./variable.js";
import { Definition } from "./definition.js";
import { assert } from "./assert.js";

/**
 * @import ScopeManager from "./scope-manager.js";
 * @import * as estreeJsx from "estree-jsx";
 */

const { Syntax } = estraverse;

/**
 * Test if scope is struct
 * @param {Scope} scope scope
 * @param {acorn.Node} block block
 * @param {boolean} isMethodDefinition is method definition
 * @returns {boolean} is strict scope
 */
function isStrictScope(scope, block, isMethodDefinition) {

    /** @type {acorn.Program|acorn.BlockStatement} */
    let body;

    // When upper scope is exists and strict, inner scope is also strict.
    if (scope.upper && scope.upper.isStrict) {
        return true;
    }

    if (isMethodDefinition) {
        return true;
    }

    if (scope.type === "class" || scope.type === "module") {
        return true;
    }

    if (scope.type === "block" || scope.type === "switch") {
        return false;
    }

    if (scope.type === "function") {
        if (block.type === Syntax.ArrowFunctionExpression &&

            /** @type {acorn.ArrowFunctionExpression} */
            (block).body.type !== Syntax.BlockStatement) {
            return false;
        }

        if (block.type === Syntax.Program) {
            body = /** @type {acorn.Program} */ (block);
        } else {
            body =
                /**
                 * @type {acorn.FunctionDeclaration}
                 */ (block).body;
        }

        if (!body) {
            return false;
        }
    } else if (scope.type === "global") {
        body = /** @type {acorn.Program} */ (block);
    } else {
        return false;
    }

    // Search for a 'use strict' directive.
    for (let i = 0, iz = body.body.length; i < iz; ++i) {
        const stmt = body.body[i];

        /*
         * Check if the current statement is a directive.
         * If it isn't, then we're past the directive prologue
         * so stop the search because directives cannot
         * appear after this point.
         *
         * Some parsers set `directive:null` on non-directive
         * statements, so the `typeof` check is safer than
         * checking for property existence.
         */
        if (!("directive" in stmt) || typeof stmt.directive !== "string") {
            break;
        }

        if (stmt.directive === "use strict") {
            return true;
        }
    }

    return false;
}

/**
 * Register scope
 * @param {ScopeManager} scopeManager scope manager
 * @param {Scope} scope scope
 * @returns {void}
 */
function registerScope(scopeManager, scope) {
    scopeManager.scopes.push(scope);

    const scopes = scopeManager.__nodeToScope.get(scope.block);

    if (scopes) {
        scopes.push(scope);
    } else {
        scopeManager.__nodeToScope.set(scope.block, [scope]);
    }
}

/**
 * @constructor Scope
 */
class Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {"global" | "module" | "function" |
     *   "function-expression-name" | "block" | "switch" | "catch" |
     *   "with" | "for" | "class" | "class-field-initializer" |
     *   "class-static-block"} type The type of scope
     * @param {Scope | null} upperScope The upper scope of the scope
     * @param {acorn.Node} block A reference to the scope-defining syntax node.
     * @param {boolean} isMethodDefinition Whether the scope is a method definition
     */
    constructor(scopeManager, type, upperScope, block, isMethodDefinition) {

        /**
         * One of "global", "module", "function", "function-expression-name", "block", "switch", "catch", "with", "for",
         * "class", "class-field-initializer", "class-static-block".
         * @member {string} Scope#type
         */
        this.type = type;

        /**
         * The scoped {@link Variable}s of this scope, as <code>{ Variable.name
         * : Variable }</code>.
         * @member {Map} Scope#set
         */
        /** @type {Map<string, Variable>} */
        this.set = new Map();

        /**
         * The tainted variables of this scope, as <code>{ Variable.name :
         * boolean }</code>.
         *  @member {Map} Scope#taints
         */
        this.taints = new Map();

        /**
         * Generally, through the lexical scoping of JS you can always know
         * which variable an identifier in the source code refers to. There are
         * a few exceptions to this rule. With 'global' and 'with' scopes you
         * can only decide at runtime which variable a reference refers to.
         * Moreover, if 'eval()' is used in a scope, it might introduce new
         * bindings in this or its parent scopes.
         * All those scopes are considered 'dynamic'.
         * @member {boolean} Scope#dynamic
         */
        this.dynamic = this.type === "global" || this.type === "with";

        /**
         * A reference to the scope-defining syntax node.
         * @member {espree.Node} Scope#block
         */
        this.block = block;

        /**
         * The {@link Reference|references} that are not resolved with this scope.
         * @member {Reference[]} Scope#through
         */
        /** @type {Reference[]} */
        this.through = [];

        /**
         * The scoped {@link Variable}s of this scope. In the case of a
         * 'function' scope this includes the automatic argument <em>arguments</em> as
         * its first element, as well as all further formal arguments.
         * @member {Variable[]} Scope#variables
         */
        /** @type {Variable[]} */
        this.variables = [];

        /**
         * Any variable {@link Reference|reference} found in this scope. This
         * includes occurrences of local variables as well as variables from
         * parent scopes (including the global scope). For local variables
         * this also includes defining occurrences (like in a 'var' statement).
         * In a 'function' scope this does not include the occurrences of the
         * formal parameter in the parameter list.
         * @member {Reference[]} Scope#references
         */
        /** @type {Reference[]} */
        this.references = [];

        /**
         * For 'global' and 'function' scopes, this is a self-reference. For
         * other scope types this is the <em>variableScope</em> value of the
         * parent scope.
         * @member {Scope} Scope#variableScope
         */

        /** @type {Scope | undefined} */
        this.variableScope =
            this.type === "global" ||
            this.type === "module" ||
            this.type === "function" ||
            this.type === "class-field-initializer" ||
            this.type === "class-static-block"
                ? this
                : upperScope?.variableScope;

        /**
         * Whether this scope is created by a FunctionExpression.
         * @member {boolean} Scope#functionExpressionScope
         */
        this.functionExpressionScope = false;

        /**
         * Whether this is a scope that contains an 'eval()' invocation.
         * @member {boolean} Scope#directCallToEvalScope
         */
        this.directCallToEvalScope = false;

        /**
         * @member {boolean} Scope#thisFound
         */
        this.thisFound = false;

        /** @type {Reference[] | null} */
        this.__left = [];

        /**
         * Reference to the parent {@link Scope|scope}.
         * @member {Scope} Scope#upper
         */
        /** @type {Scope | null} */
        this.upper = upperScope;

        /**
         * Whether 'use strict' is in effect in this scope.
         * @member {boolean} Scope#isStrict
         */
        this.isStrict = scopeManager.isStrictModeSupported()
            ? isStrictScope(this, block, isMethodDefinition)
            : false;

        /**
         * List of nested {@link Scope}s.
         * @member {Scope[]} Scope#childScopes
         */
        /** @type {Scope[]} */
        this.childScopes = [];

        if (this.upper) {
            this.upper.childScopes.push(this);
        }

        this.__declaredVariables = scopeManager.__declaredVariables;

        registerScope(scopeManager, this);
    }

    /**
     * Should statically close
     * @param {ScopeManager} scopeManager The scope manager
     * @returns {boolean} Whether it should statically close
     */
    __shouldStaticallyClose(scopeManager) {
        return (!this.dynamic || scopeManager.__isOptimistic() || this.type === "global");
    }

    /**
     * To statically close reference
     * @param {Reference} ref The reference
     * @returns {void}
     */
    __staticCloseRef(ref) {
        if (!this.__resolve(ref)) {
            this.__delegateToUpperScope(ref);
        }
    }

    /**
     * To dynamically close reference
     * @param {Reference} ref The reference
     * @returns {void}
     */
    __dynamicCloseRef(ref) {

        // notify all names are through to global
        /** @type {Scope | null} */
        let current = this;

        do {
            current.through.push(ref);
            current = current.upper;
        } while (current);
    }

    /**
     * To close
     * @param {ScopeManager} scopeManager The scope manager
     * @returns {Scope | null} The upper scope
     */
    __close(scopeManager) {
        let closeRef;

        if (this.__shouldStaticallyClose(scopeManager)) {
            closeRef = this.__staticCloseRef;
        } else {
            closeRef = this.__dynamicCloseRef;
        }

        // Try resolving all references in this scope.
        const left = /** @type {Reference[]} */ (this.__left);

        for (let i = 0, iz = left.length; i < iz; ++i) {
            const ref = left[i];

            closeRef.call(this, ref);
        }
        this.__left = null;

        return this.upper;
    }

    /**
     * Checks whether it is a valid resolution.
     * To override by function scopes.
     * References in default parameters isn't resolved to variables which are
     *  in their function body.
     * @param {Reference} ref The reference to check
     * @param {Variable} variable The variable to check
     * @returns {boolean} Whether it is a valid resolution
     */
    __isValidResolution(ref, variable) { // eslint-disable-line class-methods-use-this, no-unused-vars  -- Desired as instance method with signature
        return true;
    }

    /**
     * Checks whether the reference can be resolved
     * @param {Reference} ref The reference to check
     * @returns {boolean} Whether the reference can be resolved
     */
    __resolve(ref) {
        const name = ref.identifier.name;

        if (!this.set.has(name)) {
            return false;
        }
        const variable = /** @type {Variable} */ (this.set.get(name));

        if (!this.__isValidResolution(ref, variable)) {
            return false;
        }
        variable.references.push(ref);
        variable.stack = variable.stack && ref.from.variableScope === this.variableScope;
        if (ref.tainted) {
            variable.tainted = true;
            this.taints.set(variable.name, true);
        }
        ref.resolved = variable;

        return true;
    }

    /**
     * Delegates the reference to the upper scope
     * @param {Reference} ref The reference to check
     * @returns {void}
     */
    __delegateToUpperScope(ref) {
        if (this.upper) {
            this.upper.__left?.push(ref);
        }
        this.through.push(ref);
    }

    /**
     * Add declared variables of the given node.
     * @param {Variable} variable The variable
     * @param {acorn.Node | null | undefined} node The node
     * @returns {void}
     */
    __addDeclaredVariablesOfNode(variable, node) {
        if (node === null || node === void 0) {
            return;
        }

        let variables = this.__declaredVariables.get(node);

        if (variables === null || variables === void 0) {
            variables = [];
            this.__declaredVariables.set(node, variables);
        }
        if (!variables.includes(variable)) {
            variables.push(variable);
        }
    }

    /**
     * Defines generic
     * @param {string} name The name
     * @param {Map<string, Variable>} set The set
     * @param {Variable[]} variables The variables
     * @param {acorn.Identifier | null} node The identifier node
     * @param {Definition | null} def The definition
     * @returns {void}
     */
    __defineGeneric(name, set, variables, node, def) {
        let variable;

        variable = set.get(name);
        if (!variable) {
            variable = new Variable(name, this);
            set.set(name, variable);
            variables.push(variable);
        }

        if (def) {
            variable.defs.push(def);
            this.__addDeclaredVariablesOfNode(variable, def.node);
            this.__addDeclaredVariablesOfNode(variable, def.parent);
        }
        if (node) {
            variable.identifiers.push(node);
        }
    }

    /**
     * Define generic if the node is an identifier
     * @param {acorn.Node} node The node
     * @param {Definition} def The definition
     * @returns {void}
     */
    __define(node, def) {
        if (node && node.type === Syntax.Identifier) {
            this.__defineGeneric(

                /** @type {acorn.Identifier} */
                (node).name,
                this.set,
                this.variables,

                /** @type {acorn.Identifier} */
                (node),
                def
            );
        }
    }

    /**
     * Referencing.
     * @param {acorn.Node|estreeJsx.JSXIdentifier} node The node
     * @param {1|2|3} [assign] The flag
     * @param {acorn.Node | null} [writeExpr] If reference is writeable, this is the tree being written to it.
     * @param {{
     *   pattern: acorn.Node,
     *   node: acorn.Node
     * } | null | undefined} [maybeImplicitGlobal] Whether it may be an implicit global.
     * @param {boolean} [partial] The partial
     * @param {boolean} [init] The init
     * @returns {void}
     */
    __referencing(node, assign, writeExpr, maybeImplicitGlobal, partial, init) {

        // because Array element may be null
        if (!node || (node.type !== Syntax.Identifier && node.type !== "JSXIdentifier")) {
            return;
        }

        const nde = /** @type {acorn.Identifier} */ (node);

        // Specially handle like `this`.
        if (nde.name === "super") {
            return;
        }

        const ref = new Reference(nde, this, assign || Reference.READ, writeExpr, maybeImplicitGlobal, !!partial, !!init);

        this.references.push(ref);
        this.__left?.push(ref);
    }

    __detectEval() {

        /** @type {Scope | null} */
        let current = this;

        this.directCallToEvalScope = true;
        do {
            current.dynamic = true;
            current = current.upper;
        } while (current);
    }

    __detectThis() {
        this.thisFound = true;
    }

    __isClosed() {
        return this.__left === null;
    }

    /**
     * returns resolved {Reference}
     * @function Scope#resolve
     * @param {acorn.Identifier} ident identifier to be resolved.
     * @returns {Reference|null} reference
     */
    resolve(ident) {
        let ref, i, iz;

        assert(this.__isClosed(), "Scope should be closed.");
        assert(ident.type === Syntax.Identifier, "Target should be identifier.");
        for (i = 0, iz = this.references.length; i < iz; ++i) {
            ref = this.references[i];
            if (ref.identifier === ident) {
                return ref;
            }
        }
        return null;
    }

    /**
     * returns this scope is static
     * @function Scope#isStatic
     * @returns {boolean} static
     */
    isStatic() {
        return !this.dynamic;
    }

    /**
     * returns this scope has materialized arguments
     * @function Scope#isArgumentsMaterialized
     * @returns {boolean} arguemnts materialized
     */
    isArgumentsMaterialized() { // eslint-disable-line class-methods-use-this -- Desired as instance method
        return true;
    }

    /**
     * returns this scope has materialized `this` reference
     * @function Scope#isThisMaterialized
     * @returns {boolean} this materialized
     */
    isThisMaterialized() { // eslint-disable-line class-methods-use-this -- Desired as instance method
        return true;
    }

    /**
     * Checks whether the name is used
     * @param {string} name The name to check
     * @returns {boolean} Whether the name is used
     */
    isUsedName(name) {
        if (this.set.has(name)) {
            return true;
        }
        for (let i = 0, iz = this.through.length; i < iz; ++i) {
            if (this.through[i].identifier.name === name) {
                return true;
            }
        }
        return false;
    }
}

/**
 * Global scope.
 */
class GlobalScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, block) {
        super(scopeManager, "global", null, block, false);
        this.implicit = {

            /** @type {Map<string, Variable>} */
            set: new Map(),

            /** @type {Variable[]} */
            variables: [],

            /**
             * List of {@link Reference}s that are left to be resolved (i.e. which
             * need to be linked to the variable they refer to).
             * @member {Reference[]} Scope#implicit#left
             */
            /** @type {Reference[]} */
            left: []
        };
    }

    /**
     * Closes
     * @param {ScopeManager} scopeManager The scope manager
     * @returns {Scope | null} The upper scope
     */
    __close(scopeManager) {
        const implicit = [];

        const left = /** @type {Reference[]} */ (this.__left);

        for (let i = 0, iz = left.length; i < iz; ++i) {
            const ref = left[i];

            if (ref.__maybeImplicitGlobal && !this.set.has(ref.identifier.name)) {
                implicit.push(ref.__maybeImplicitGlobal);
            }
        }

        // create an implicit global variable from assignment expression
        for (let i = 0, iz = implicit.length; i < iz; ++i) {
            const info = implicit[i];

            this.__defineImplicit(info.pattern,
                new Definition(
                    Variable.ImplicitGlobalVariable,
                    info.pattern,
                    info.node,
                    null,
                    null,
                    null
                ));

        }

        super.__close(scopeManager);

        this.implicit.left = [...this.through];

        return null;
    }

    /**
     * Define implicit
     * @param {acorn.Node} node The node
     * @param {Definition} def The definition
     * @returns {void}
     */
    __defineImplicit(node, def) {
        if (node && node.type === Syntax.Identifier) {
            this.__defineGeneric(

                /** @type {acorn.Identifier} */
                (node).name,
                this.implicit.set,
                this.implicit.variables,

                /** @type {acorn.Identifier} */
                (node),
                def
            );
        }
    }

    /**
     * Add variables and resolve their references.
     * @param {string[]} names Names of global variables to add.
     * @returns {void}
     */
    __addVariables(names) {
        for (const name of names) {
            this.__defineGeneric(
                name,
                this.set,
                this.variables,
                null,
                null
            );
        }

        const namesSet = new Set(names);

        this.through = this.through.filter(reference => {
            const name = reference.identifier.name;

            if (namesSet.has(name)) {
                const variable = this.set.get(name);

                reference.resolved = variable;
                variable?.references.push(reference);

                return false;
            }

            return true;
        });

        this.implicit.variables = this.implicit.variables.filter(variable => {
            const name = variable.name;

            if (namesSet.has(name)) {
                this.implicit.set.delete(name);

                return false;
            }

            return true;
        });

        this.implicit.left = this.implicit.left.filter(
            reference => !namesSet.has(reference.identifier.name)
        );
    }
}

/**
 * Module scope.
 */
class ModuleScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "module", upperScope, block, false);
    }
}

/**
 * Function expression name scope.
 */
class FunctionExpressionNameScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.FunctionExpression} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "function-expression-name", upperScope, block, false);

        const blk =
            /**
             * @type {acorn.FunctionExpression & {
             *   id: NonNullable<Required<acorn.FunctionExpression>["id"]>
             * }}
             */ (block);

        this.__define(blk.id,
            new Definition(
                Variable.FunctionName,
                blk.id,
                blk,
                null,
                null,
                null
            ));
        this.functionExpressionScope = true;
    }
}

/**
 * Catch scope.
 */
class CatchScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "catch", upperScope, block, false);
    }
}

/**
 * With statement scope.
 */
class WithScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "with", upperScope, block, false);
    }

    /**
     * Closes
     * @param {ScopeManager} scopeManager The scope manager
     * @returns {Scope | null} The upper scope
     */
    __close(scopeManager) {
        if (this.__shouldStaticallyClose(scopeManager)) {
            return super.__close(scopeManager);
        }

        const left = /** @type {Reference[]} */ (this.__left);

        for (let i = 0, iz = left.length; i < iz; ++i) {
            const ref = left[i];

            ref.tainted = true;
            this.__delegateToUpperScope(ref);
        }
        this.__left = null;

        return this.upper;
    }
}

/**
 * Block scope.
 */
class BlockScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "block", upperScope, block, false);
    }
}

/**
 * Switch scope.
 */
class SwitchScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "switch", upperScope, block, false);
    }
}

/**
 * Function scope.
 */
class FunctionScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     * @param {boolean} isMethodDefinition Whether it is a method definition
     */
    constructor(scopeManager, upperScope, block, isMethodDefinition) {
        super(scopeManager, "function", upperScope, block, isMethodDefinition);

        // section 9.2.13, FunctionDeclarationInstantiation.
        // NOTE Arrow functions never have an arguments objects.
        if (this.block.type !== Syntax.ArrowFunctionExpression) {
            this.__defineArguments();
        }
    }

    isArgumentsMaterialized() {

        // TODO(Constellation)
        // We can more aggressive on this condition like this.
        //
        // function t() {
        //     // arguments of t is always hidden.
        //     function arguments() {
        //     }
        // }
        if (this.block.type === Syntax.ArrowFunctionExpression) {
            return false;
        }

        if (!this.isStatic()) {
            return true;
        }

        const variable = /** @type {Variable} */ (this.set.get("arguments"));

        assert(variable, "Always have arguments variable.");
        return variable.tainted || variable.references.length !== 0;
    }

    isThisMaterialized() {
        if (!this.isStatic()) {
            return true;
        }
        return this.thisFound;
    }

    __defineArguments() {
        this.__defineGeneric(
            "arguments",
            this.set,
            this.variables,
            null,
            null
        );
        this.taints.set("arguments", true);
    }

    // References in default parameters isn't resolved to variables which are in their function body.
    //     const x = 1
    //     function f(a = x) { // This `x` is resolved to the `x` in the outer scope.
    //         const x = 2
    //         console.log(a)
    //     }

    /**
     * Checks whether it is a valid resolution
     * @param {Reference} ref The reference to check
     * @param {Variable} variable The variable to check
     * @returns {boolean} Whether it is a valid resolution
     */
    __isValidResolution(ref, variable) {

        // If `options.nodejsScope` is true, `this.block` becomes a Program node.
        if (this.block.type === "Program") {
            return true;
        }

        const bodyStart = /** @type {number} */ (
            /** @type {acorn.FunctionDeclaration|acorn.FunctionExpression} */ (
                this.block
            ).body.range?.[0]
        );

        // It's invalid resolution in the following case:
        return !(
            variable.scope === this &&

            /** @type {number} */
            (
                ref.identifier.range?.[0]
            ) < bodyStart && // the reference is in the parameter part.
            variable.defs.every(
                d =>

                    /** @type {number} */
                    (d.name.range?.[0]) >= bodyStart
            ) // the variable is in the body.
        );
    }
}

/**
 * Scope of for, for-in, and for-of statements.
 */
class ForScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "for", upperScope, block, false);
    }
}

/**
 * Class scope.
 */
class ClassScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "class", upperScope, block, false);
    }
}

/**
 * Class field initializer scope.
 */
class ClassFieldInitializerScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "class-field-initializer", upperScope, block, true);
    }
}

/**
 * Class static block scope.
 */
class ClassStaticBlockScope extends Scope {

    /**
     * @param {ScopeManager} scopeManager The scope manager
     * @param {Scope | null} upperScope The upper scope
     * @param {acorn.Node} block The block node
     */
    constructor(scopeManager, upperScope, block) {
        super(scopeManager, "class-static-block", upperScope, block, true);
    }
}

export {
    Scope,
    GlobalScope,
    ModuleScope,
    FunctionExpressionNameScope,
    CatchScope,
    WithScope,
    BlockScope,
    SwitchScope,
    FunctionScope,
    ForScope,
    ClassScope,
    ClassFieldInitializerScope,
    ClassStaticBlockScope
};

/* vim: set sw=4 ts=4 et tw=80 : */
