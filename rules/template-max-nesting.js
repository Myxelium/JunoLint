'use strict';

const { countsTowardNesting, locFromOffsets, nodeEnd, nodeStart } = require('./template-utils');

const DEFAULT_MAX = 7;

function nestingDepth(node) {
  let depth = 0;
  let current = node;

  while (current && current.type !== 'Program') {
    if (countsTowardNesting(current))
      depth += 1;

    current = current.parent;
  }

  return depth;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow template elements nested deeper than 7 levels, ignoring ng-container, ng-template, and Angular control-flow blocks'
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'integer', minimum: 1 }
        },
        additionalProperties: false
      }
    ],
    messages: {
      tooDeep: 'Template nesting is {{depth}} levels deep (max {{max}}). Extract a new component.'
    }
  },
  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX;
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function check(node) {
      if (!countsTowardNesting(node))
        return;

      const depth = nestingDepth(node);
      if (depth <= max)
        return;

      const start = nodeStart(node);
      const end = nodeEnd(node);
      context.report({
        loc: start != null && end != null
          ? locFromOffsets(sourceCode, start, Math.min(end, start + (node.startSourceSpan ? node.startSourceSpan.end.offset - start : 1)))
          : node.loc,
        messageId: 'tooDeep',
        data: { depth: String(depth), max: String(max) }
      });
    }

    return {
      Element: check,
      Content: check
    };
  }
};
