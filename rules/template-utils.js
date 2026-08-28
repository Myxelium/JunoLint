'use strict';

const LAYOUT_TYPES = new Set([
  'Element',
  'Template',
  'IfBlock',
  'ForLoopBlock',
  'SwitchBlock',
  'DeferredBlock',
  'Content',
  'LetDeclaration'
]);

const COMMENT_RE = /<!--[\s\S]*?-->/g;

function isLayoutNode(node) {
  return Boolean(node) && LAYOUT_TYPES.has(node.type);
}

function isNgContainer(node) {
  if (!node || node.type !== 'Element' || typeof node.name !== 'string')
    return false;

  return node.name === 'ng-container' || node.name.endsWith(':ng-container');
}

function isExplicitNgTemplate(node) {
  return node.type === 'Template' && /^(:svg:)?ng-template$/i.test(node.tagName || '');
}

function isImplicitTemplate(node) {
  return node.type === 'Template' && !isExplicitNgTemplate(node);
}

function countsTowardNesting(node) {
  if (!node)
    return false;

  if (node.type === 'Content')
    return true;

  return node.type === 'Element' && !isNgContainer(node);
}

function layoutChildren(node) {
  const children = node.type === 'Program' ? node.templateNodes : node.children;
  if (!Array.isArray(children))
    return [];

  return children.filter(isLayoutNode);
}

function offsetOf(span, edge) {
  if (!span || !span[edge])
    return null;

  return span[edge].offset;
}

function nodeStart(node) {
  return offsetOf(node.startSourceSpan, 'start') ?? offsetOf(node.sourceSpan, 'start');
}

function nodeEnd(node) {
  return offsetOf(node.sourceSpan, 'end') ?? offsetOf(node.endSourceSpan, 'end');
}

function openEnd(node) {
  if (node.type === 'Program')
    return 0;

  return offsetOf(node.startSourceSpan, 'end') ?? offsetOf(node.sourceSpan, 'start');
}

function closeStart(node, textLength) {
  if (node.type === 'Program')
    return textLength;

  if (node.type === 'ForLoopBlock' && node.empty && node.empty.startSourceSpan)
    return node.empty.startSourceSpan.start.offset;

  if (node.type === 'DeferredBlock') {
    const connected = node.placeholder || node.loading || node.error;
    if (connected && connected.startSourceSpan)
      return connected.startSourceSpan.start.offset;
  }

  return offsetOf(node.endSourceSpan, 'start') ?? offsetOf(node.sourceSpan, 'end');
}

function locFromOffsets(sourceCode, start, end) {
  return {
    start: sourceCode.getLocFromIndex(start),
    end: sourceCode.getLocFromIndex(Math.max(start, end))
  };
}

function indentOf(text, offset) {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const leading = text.slice(lineStart, offset).match(/^[ \t]*/);
  return leading ? leading[0] : '';
}

function detectIndent(text) {
  let tabLines = 0;
  let spaceLines = 0;
  const increases = [];
  let previous = 0;

  for (const line of text.split('\n')) {
    if (!line.trim())
      continue;

    const match = line.match(/^(\t+|[ ]+)/);
    if (match && match[1][0] === '\t') {
      tabLines += 1;
      const width = match[1].length;
      if (width > previous)
        increases.push('\t');
      previous = width;
      continue;
    }

    if (match) {
      spaceLines += 1;
      const width = match[1].length;
      if (width > previous)
        increases.push(width - previous);
      previous = width;
      continue;
    }

    previous = 0;
  }

  if (tabLines > spaceLines)
    return '\t';

  const freq = new Map();
  for (const size of increases) {
    if (typeof size !== 'number' || size < 1 || size > 8)
      continue;
    freq.set(size, (freq.get(size) || 0) + 1);
  }

  let best = 2;
  let bestCount = -1;
  for (const candidate of [2, 4, 8, 3, 1]) {
    const count = freq.get(candidate) || 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  if (bestCount <= 0)
    return '  ';

  return ' '.repeat(best);
}

function parentIndent(text, parent) {
  if (parent.type === 'Program')
    return '';

  return indentOf(text, nodeStart(parent) ?? 0);
}

function childIndent(text, parent, unit) {
  if (parent.type === 'Program')
    return '';

  return parentIndent(text, parent) + (unit ?? detectIndent(text));
}

function isSignificantGap(gap) {
  return /\S/.test(gap.replace(COMMENT_RE, ''));
}

function commentsIn(gap) {
  return gap.match(COMMENT_RE) || [];
}

module.exports = {
  childIndent,
  closeStart,
  commentsIn,
  countsTowardNesting,
  detectIndent,
  indentOf,
  isImplicitTemplate,
  isSignificantGap,
  layoutChildren,
  locFromOffsets,
  nodeEnd,
  nodeStart,
  openEnd,
  parentIndent
};
