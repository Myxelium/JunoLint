'use strict';

const { detectIndent, indentOf, isImplicitTemplate, locFromOffsets } = require('./template-utils');

const WRAP_AT = 3;

function splitAttributes(inner) {
  const attrs = [];
  let index = 0;

  while (index < inner.length) {
    while (index < inner.length && /\s/.test(inner[index]))
      index += 1;

    if (index >= inner.length)
      break;

    const start = index;
    while (index < inner.length) {
      const char = inner[index];
      if (char === '"' || char === '\'' || char === '`') {
        index += 1;
        while (index < inner.length && inner[index] !== char) {
          if (inner[index] === '\\')
            index += 1;
          index += 1;
        }
        index += 1;
        break;
      }

      if (/\s/.test(char))
        break;

      index += 1;
    }

    const attr = inner.slice(start, index).trim();
    if (attr)
      attrs.push(attr);
  }

  return attrs;
}

function parseOpenTag(openText) {
  const match = openText.match(/^<([^\s>/]+)/);
  if (!match)
    return null;

  const selfClosing = /\/\s*>\s*$/.test(openText);
  const innerEnd = selfClosing ? openText.search(/\/\s*>\s*$/) : openText.lastIndexOf('>');
  if (innerEnd < match[0].length)
    return null;

  return {
    tagName: match[1],
    attrs: splitAttributes(openText.slice(match[0].length, innerEnd)),
    selfClosing
  };
}

function formatOpenTag(parsed, indent, unit) {
  const closer = parsed.selfClosing ? '/>' : '>';
  const attrIndent = `${indent}${unit}`;
  return [
    `<${parsed.tagName}`,
    ...parsed.attrs.map((attr) => `${attrIndent}${attr}`),
    `${indent}${closer}`
  ].join('\n');
}

function singleLineTag(parsed) {
  const attrs = parsed.attrs.map((attr) => ` ${attr}`).join('');
  if (parsed.selfClosing)
    return `<${parsed.tagName}${attrs} />`;

  return `<${parsed.tagName}${attrs}>`;
}

function expectedOpenTag(parsed, indent, unit) {
  if (parsed.attrs.length >= WRAP_AT)
    return formatOpenTag(parsed, indent, unit);

  return singleLineTag(parsed);
}

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description: 'Put each attribute on its own line when a template tag has 3 or more attributes; keep 1–2 attributes on one line'
    },
    fixable: 'code',
    schema: [],
    messages: {
      wrapAttrs: 'Tags with 3 or more attributes must put each attribute on its own line, with ">" on a new line.',
      collapseAttrs: 'Tags with fewer than 3 attributes must stay on one line.'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const text = sourceCode.text;
    const unit = detectIndent(text);

    function check(node) {
      if (isImplicitTemplate(node))
        return;

      const span = node.startSourceSpan;
      if (!span)
        return;

      const start = span.start.offset;
      const end = span.end.offset;
      const openText = text.slice(start, end);
      if (openText.includes('<!--'))
        return;

      const parsed = parseOpenTag(openText);
      if (!parsed || parsed.attrs.length === 0)
        return;

      const tagIndent = indentOf(text, start);
      const expectedOpen = expectedOpenTag(parsed, tagIndent, unit);
      const needsNewlineAfter =
        !parsed.selfClosing &&
        parsed.attrs.length >= WRAP_AT &&
        text.startsWith('</', end);
      const expected = expectedOpen + (needsNewlineAfter ? `\n${tagIndent}` : '');
      if (expected === openText)
        return;

      context.report({
        loc: locFromOffsets(sourceCode, start, end),
        messageId: parsed.attrs.length >= WRAP_AT ? 'wrapAttrs' : 'collapseAttrs',
        fix: (fixer) => fixer.replaceTextRange([start, end], expected)
      });
    }

    return {
      Element: check,
      Template: check
    };
  }
};
