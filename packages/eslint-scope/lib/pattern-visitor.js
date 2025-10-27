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

/**
 * @import * as acorn from "acorn";
 */

/**
 * @typedef {(node: acorn.Node, info: {
 *   topLevel: boolean,
 *   rest: boolean,
 *   assignments: (acorn.AssignmentPattern|acorn.AssignmentExpression)[]
 * }) => void} PatternVisitorCallback
 */

const { Syntax } = estraverse;

/**
 * Get last array element
 * @param {Array<any>} xs array
 * @returns {any} Last elment
 */
function getLast(xs) {
    return xs.at(-1) || null;
}

/**
 * Visitor for destructuring patterns.
 */
class PatternVisitor extends esrecurse.Visitor {

    /**
     * Checks whether the supplied `node` is a `Pattern`
     * @param {acorn.Node} node The node to check
     * @returns {boolean} Whether the `node` is a `Pattern`
     */
    static isPattern(node) {
        const nodeType = node.type;

        return (
            nodeType === Syntax.Identifier ||
            nodeType === Syntax.ObjectPattern ||
            nodeType === Syntax.ArrayPattern ||
            nodeType === Syntax.SpreadElement ||
            nodeType === Syntax.RestElement ||
            nodeType === Syntax.AssignmentPattern
        );
    }

    /**
     * @param {esrecurse.VisitorOptions} options The Pattern visitor options
     * @param {acorn.Node | null | undefined} rootPattern The node to match to identify the root
     * @param {PatternVisitorCallback} callback Callback to invoke upon visiting an `Identifier`
     */
    constructor(options, rootPattern, callback) {
        super(null, options);
        this.rootPattern = rootPattern;
        this.callback = callback;

        /** @type {(acorn.AssignmentPattern|acorn.AssignmentExpression)[]} */
        this.assignments = [];

        /** @type {acorn.Node[]} */
        this.rightHandNodes = [];

        /** @type {acorn.RestElement[]} */
        this.restElements = [];
    }

    /**
     * Calls the callback for the visited `Identifier`.
     * @param {acorn.Identifier} pattern The pattern being visited.
     * @returns {void}
     */
    Identifier(pattern) {
        const lastRestElement = getLast(this.restElements);

        this.callback(pattern, {
            topLevel: pattern === this.rootPattern,
            rest: lastRestElement !== null && lastRestElement !== void 0 && lastRestElement.argument === pattern,
            assignments: this.assignments
        });
    }

    /**
     * Visits the property's `value`.
     * @param {acorn.Property} property The property being visited.
     * @returns {void}
     */
    Property(property) {

        // Computed property's key is a right hand node.
        if (property.computed) {
            this.rightHandNodes.push(property.key);
        }

        // If it's shorthand, its key is same as its value.
        // If it's shorthand and has its default value, its key is same as its value.left (the value is AssignmentPattern).
        // If it's not shorthand, the name of new variable is its value's.
        this.visit(property.value);
    }

    /**
     * Visits the array pattern's elements.
     * @param {acorn.ArrayPattern} pattern The array pattern being visited.
     * @returns {void}
     */
    ArrayPattern(pattern) {
        for (let i = 0, iz = pattern.elements.length; i < iz; ++i) {
            const element = pattern.elements[i];

            this.visit(element);
        }
    }

    /**
     * Visits the assignment pattern's `left` property.
     * @param {acorn.AssignmentPattern} pattern The assignment pattern being visited.
     * @returns {void}
     */
    AssignmentPattern(pattern) {
        this.assignments.push(pattern);
        this.visit(pattern.left);
        this.rightHandNodes.push(pattern.right);
        this.assignments.pop();
    }

    /**
     * Visits the rest element's argument.
     * @param {acorn.RestElement} pattern The rest element being visited.
     * @returns {void}
     */
    RestElement(pattern) {
        this.restElements.push(pattern);
        this.visit(pattern.argument);
        this.restElements.pop();
    }

    /**
     * Tracks the member expression's properties.
     * @param {acorn.MemberExpression} node The member expression being visited.
     * @returns {void}
     */
    MemberExpression(node) {

        // Computed property's key is a right hand node.
        if (node.computed) {
            this.rightHandNodes.push(node.property);
        }

        // the object is only read, write to its property.
        this.rightHandNodes.push(node.object);
    }

    //
    // ForInStatement.left and AssignmentExpression.left are LeftHandSideExpression.
    // By spec, LeftHandSideExpression is Pattern or MemberExpression.
    //   (see also: https://github.com/estree/estree/pull/20#issuecomment-74584758)
    // But espree 2.0 parses to ArrayExpression, ObjectExpression, etc...
    //

    /**
     * Visits the spread element's argument.
     * @param {acorn.SpreadElement} node The spread element being visited.
     * @returns {void}
     */
    SpreadElement(node) {
        this.visit(node.argument);
    }

    /**
     * Visits the array expression's elements.
     * @param {acorn.ArrayExpression} node The array expression being visited.
     * @returns {void}
     */
    ArrayExpression(node) {
        node.elements.forEach(this.visit, this);
    }

    /**
     * Visits the assignment expression's `left` argument.
     * @param {acorn.AssignmentExpression} node The assignment expression being visited.
     * @returns {void}
     */
    AssignmentExpression(node) {
        this.assignments.push(node);
        this.visit(node.left);
        this.rightHandNodes.push(node.right);
        this.assignments.pop();
    }

    /**
     * Visits the call expression's callee.
     * @param {acorn.CallExpression} node The call expression being visited.
     * @returns {void}
     */
    CallExpression(node) {

        // arguments are right hand nodes.
        node.arguments.forEach(a => {
            this.rightHandNodes.push(a);
        });
        this.visit(node.callee);
    }
}

export default PatternVisitor;

/* vim: set sw=4 ts=4 et tw=80 : */
