'use strict';

const {
  childIndent,
  closeStart,
  commentsIn,
  detectIndent,
  isImplicitTemplate,
  isSignificantGap,
  layoutChildren,
  locFromOffsets,
  nodeEnd,
  nodeStart,
  openEnd,
  parentIndent
} = require('./template-utils');

const CONTAINER_SELECTOR = [
  'Program',
  'Element',
  'Template',
  'IfBlockBranch',
  'ForLoopBlock',
  'ForLoopBlockEmpty',
  'SwitchBlockCaseGroup',
  'DeferredBlock',
  'DeferredBlockPlaceholder',
  'DeferredBlockLoading',
  'DeferredBlockError',
  'Content'
].join(', ');

function desiredFirstGap(gap, indent, isProgram, forceMultiline) {
  if (isSignificantGap(gap))
    return null;

  const comments = commentsIn(gap);

  if (isProgram) {
    if (comments.length === 0)
      return '';

    return `${comments.join('\n')}\n`;
  }

  if (!forceMultiline && !gap.includes('\n') && comments.length === 0)
    return gap;

  if (comments.length === 0)
    return `\n${indent}`;

  return `\n${comments.map((comment) => `${indent}${comment}`).join('\n')}\n${indent}`;
}

function desiredLastGap(gap, indent, isProgram, forceMultiline, unit) {
  if (isSignificantGap(gap))
    return null;

  const comments = commentsIn(gap);

  if (isProgram) {
    const ending = gap.endsWith('\n') ? '\n' : '';
    if (comments.length === 0)
      return ending;

    return `\n${comments.join('\n')}${ending}`;
  }

  if (!forceMultiline && !gap.includes('\n') && comments.length === 0)
    return gap;

  if (comments.length === 0)
    return `\n${indent}`;

  return `\n${comments.map((comment) => `${indent}${unit}${comment}`).join('\n')}\n${indent}`;
}

function isCompactNode(node, text) {
  const start = nodeStart(node);
  const end = nodeEnd(node);
  if (start == null || end == null)
    return false;

  return !text.slice(start, end).includes('\n');
}

function desiredSiblingGap(gap, indent, pack) {
  if (isSignificantGap(gap))
    return null;

  const comments = commentsIn(gap);
  const blank = pack ? '\n' : '\n\n';

  if (comments.length === 0)
    return `${blank}${indent}`;

  return `${blank}${comments.map((comment) => `${indent}${comment}`).join('\n')}\n${indent}`;
}

function onlyIndentChanged(from, to) {
  return from.replace(/[ \t]/g, '') === to.replace(/[ \t]/g, '');
}

function reportGap(context, start, end, next, messageId) {
  const current = context.sourceCode.text.slice(start, end);
  if (next === null || next === current)
    return;

  context.report({
    loc: locFromOffsets(context.sourceCode, start, end),
    messageId: onlyIndentChanged(current, next) ? 'wrongIndent' : messageId,
    fix: (fixer) => fixer.replaceTextRange([start, end], next)
  });
}

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Require a blank line between multiline sibling template nodes; keep single-line siblings packed. Enforce indentation detected from the file (tabs vs spaces). No extra blank line after an opening tag or before a closing tag'
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      betweenSiblings: 'Multiline sibling elements must be separated by a blank line.',
      packSiblings: 'Single-line sibling elements should not be separated by a blank line.',
      afterOpen: 'Do not put a blank line immediately after an opening tag.',
      beforeClose: 'Do not put a blank line immediately before a closing tag.',
      wrongIndent: 'Incorrect indentation.'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const text = sourceCode.text;
    const unit = detectIndent(text);

    return {
      [CONTAINER_SELECTOR](node) {
        if (isImplicitTemplate(node))
          return;

        const startInner = openEnd(node);
        const endInner = closeStart(node, text.length);
        if (startInner == null || endInner == null || endInner < startInner)
          return;

        const siblings = layoutChildren(node);
        if (siblings.length === 0)
          return;

        const indent = childIndent(text, node, unit);
        const closeAt = parentIndent(text, node);
        const isProgram = node.type === 'Program';
        const first = siblings[0];
        const last = siblings[siblings.length - 1];
        const firstAt = nodeStart(first);
        const lastAt = nodeEnd(last);

        if (firstAt == null || lastAt == null)
          return;

        const forceMultiline = siblings.length >= 2;

        reportGap(
          context,
          startInner,
          firstAt,
          desiredFirstGap(text.slice(startInner, firstAt), indent, isProgram, forceMultiline),
          'afterOpen'
        );

        for (let index = 0; index < siblings.length - 1; index += 1) {
          const prevEnd = nodeEnd(siblings[index]);
          const nextStart = nodeStart(siblings[index + 1]);
          if (prevEnd == null || nextStart == null || nextStart < prevEnd)
            continue;

          const pack = isCompactNode(siblings[index], text)
            && isCompactNode(siblings[index + 1], text);
          reportGap(
            context,
            prevEnd,
            nextStart,
            desiredSiblingGap(text.slice(prevEnd, nextStart), indent, pack),
            pack ? 'packSiblings' : 'betweenSiblings'
          );
        }

        reportGap(
          context,
          lastAt,
          endInner,
          desiredLastGap(
            text.slice(lastAt, endInner),
            closeAt,
            isProgram,
            forceMultiline,
            unit
          ),
          'beforeClose'
        );
      }
    };
  }
};
