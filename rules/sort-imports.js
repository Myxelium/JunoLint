'use strict';

function isImport(node) {
  return node && node.type === 'ImportDeclaration';
}

function importRuns(body) {
  const runs = [];
  let current = [];

  for (const statement of body) {
    if (isImport(statement)) {
      current.push(statement);
      continue;
    }

    if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }

  if (current.length > 0)
    runs.push(current);

  return runs;
}

function isSideEffect(node) {
  return node.specifiers.length === 0;
}

function sourceValue(node) {
  const value = node.source && node.source.value;
  return typeof value === 'string' ? value : '';
}

function isRelativeSource(source) {
  return source.startsWith('.') || source.startsWith('/');
}

function compareStrings(left, right) {
  const insensitive = left.localeCompare(right, 'en', { sensitivity: 'base' });

  if (insensitive !== 0)
    return insensitive;

  if (left === right)
    return 0;

  return left < right ? -1 : 1;
}

function specifierName(specifier) {
  const imported = specifier.imported;

  if (imported) {
    if (imported.type === 'Identifier' || imported.type === 'PrivateIdentifier')
      return imported.name;

    if (imported.type === 'Literal')
      return String(imported.value);
  }

  return specifier.local && specifier.local.type === 'Identifier' ? specifier.local.name : '';
}

function typeRank(node) {
  return node.importKind === 'type' ? 1 : 0;
}

function syntaxRank(node) {
  if (node.specifiers.some((specifier) => specifier.type === 'ImportNamespaceSpecifier'))
    return 0;

  if (node.specifiers.some((specifier) => specifier.type === 'ImportDefaultSpecifier'))
    return 1;

  return 2;
}

function compareNamed(left, right) {
  const byName = compareStrings(specifierName(left), specifierName(right));

  if (byName !== 0)
    return byName;

  return typeRank(left) - typeRank(right);
}

function compareImports(left, right) {
  const leftSource = sourceValue(left);
  const rightSource = sourceValue(right);
  const leftRelative = isRelativeSource(leftSource) ? 1 : 0;
  const rightRelative = isRelativeSource(rightSource) ? 1 : 0;

  if (leftRelative !== rightRelative)
    return leftRelative - rightRelative;

  const bySource = compareStrings(leftSource, rightSource);

  if (bySource !== 0)
    return bySource;

  const byType = typeRank(left) - typeRank(right);

  if (byType !== 0)
    return byType;

  return syntaxRank(left) - syntaxRank(right);
}

function specifierStart(sourceCode, specifier) {
  if (specifier.importKind !== 'type')
    return specifier.range[0];

  const text = sourceCode.getText(specifier);

  if (text.startsWith('type'))
    return specifier.range[0];

  const first = sourceCode.getFirstToken(specifier);
  const prev = first ? sourceCode.getTokenBefore(first) : null;

  if (prev && prev.value === 'type')
    return prev.range[0];

  return specifier.range[0];
}

function namedSpecifierText(sourceCode, specifier) {
  let end = specifier.range[1];

  for (const comment of sourceCode.getCommentsAfter(specifier)) {
    const between = sourceCode.text.slice(end, comment.range[0]);

    if (between.includes('\n'))
      break;

    end = comment.range[1];
  }

  return sourceCode.text.slice(specifierStart(sourceCode, specifier), end);
}

function formatNamedList(sourceCode, named, sorted, openBrace, closeBrace) {
  const texts = sorted.map((specifier) => namedSpecifierText(sourceCode, specifier));
  const multiline = openBrace.loc.start.line !== closeBrace.loc.start.line;

  if (!multiline)
    return ` ${texts.join(', ')} `;

  const firstLine = sourceCode.lines[named[0].loc.start.line - 1] ?? '';
  const indentMatch = firstLine.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '  ';
  const closeLine = sourceCode.lines[closeBrace.loc.start.line - 1] ?? '';
  const closeIndentMatch = closeLine.match(/^(\s*)/);
  const closeIndent = closeIndentMatch ? closeIndentMatch[1] : '';

  return `\n${texts.map((text) => `${indent}${text}`).join(',\n')}\n${closeIndent}`;
}

function rewriteImport(sourceCode, node) {
  const named = node.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');

  if (named.length < 2)
    return sourceCode.getText(node);

  const sorted = [...named].sort(compareNamed);

  if (named.every((specifier, index) => specifier === sorted[index]))
    return sourceCode.getText(node);

  const openBrace = sourceCode.getTokenBefore(named[0], (token) => token.value === '{');
  const closeBrace = sourceCode.getTokenAfter(named[named.length - 1], (token) => token.value === '}');

  if (!openBrace || !closeBrace)
    return sourceCode.getText(node);

  return sourceCode.text.slice(node.range[0], openBrace.range[1])
    + formatNamedList(sourceCode, named, sorted, openBrace, closeBrace)
    + sourceCode.text.slice(closeBrace.range[0], node.range[1]);
}

function hasBlankLineBetween(text) {
  return /\n\s*\n/.test(text);
}

function lineStartIfBlank(sourceCode, index, minStart) {
  const text = sourceCode.text;
  let start = index;

  while (start > minStart && text[start - 1] !== '\n')
    start -= 1;

  if (text.slice(start, index).trim() !== '')
    return index;

  return Math.max(start, minStart);
}

function attachedCommentsBefore(sourceCode, node, minStart) {
  const comments = sourceCode.getCommentsBefore(node)
    .filter((comment) => comment.range[0] >= minStart);
  const attached = [];
  let nextStart = node.range[0];

  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const comment = comments[index];
    const between = sourceCode.text.slice(comment.range[1], nextStart);

    if (hasBlankLineBetween(between))
      break;

    attached.unshift(comment);
    nextStart = comment.range[0];
  }

  return attached;
}

function trailingCommentEnd(sourceCode, node, maxEnd) {
  let end = node.range[1];

  for (const comment of sourceCode.getCommentsAfter(node)) {
    if (comment.range[1] > maxEnd)
      break;

    const between = sourceCode.text.slice(end, comment.range[0]);

    if (between.includes('\n'))
      break;

    end = comment.range[1];
  }

  return end;
}

function importSlice(sourceCode, node, minStart, maxEnd) {
  const attached = attachedCommentsBefore(sourceCode, node, minStart);
  const start = attached.length > 0
    ? lineStartIfBlank(sourceCode, attached[0].range[0], minStart)
    : node.range[0];
  const end = trailingCommentEnd(sourceCode, node, maxEnd);
  const leading = sourceCode.text.slice(start, node.range[0]);
  const trailing = sourceCode.text.slice(node.range[1], end);

  return {
    node,
    start,
    end,
    text: leading + rewriteImport(sourceCode, node) + trailing
  };
}

function formatValueSegment(slices) {
  const sorted = [...slices].sort((left, right) => compareImports(left.node, right.node));
  const external = [];
  const relative = [];

  for (const slice of sorted) {
    if (isRelativeSource(sourceValue(slice.node)))
      relative.push(slice.text);
    else
      external.push(slice.text);
  }

  const blocks = [];

  if (external.length > 0)
    blocks.push(external.join('\n'));

  if (relative.length > 0)
    blocks.push(relative.join('\n'));

  return blocks.join('\n\n');
}

function formatRun(slices) {
  const parts = [];
  let values = [];

  const flushValues = () => {
    if (values.length === 0)
      return;

    parts.push({ kind: 'value', text: formatValueSegment(values) });
    values = [];
  };

  for (const slice of slices) {
    if (isSideEffect(slice.node)) {
      flushValues();
      parts.push({ kind: 'side-effect', text: slice.text });
      continue;
    }

    values.push(slice);
  }

  flushValues();

  let result = '';

  for (let index = 0; index < parts.length; index += 1) {
    if (index > 0) {
      const pack = parts[index - 1].kind === 'side-effect' && parts[index].kind === 'side-effect';
      result += pack ? '\n' : '\n\n';
    }

    result += parts[index].text;
  }

  return result;
}

function previousEnd(body, first) {
  const index = body.indexOf(first);

  if (index <= 0)
    return 0;

  return body[index - 1].range[1];
}

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Sort import declarations alphabetically (packages, then relative paths) and named specifiers alphabetically'
    },
    fixable: 'code',
    schema: [],
    messages: {
      unsortedImports:
        'Imports must be sorted alphabetically: packages, then relative paths. Named specifiers must also be alphabetical.'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      Program(program) {
        for (const run of importRuns(program.body)) {
          const minStart = previousEnd(program.body, run[0]);
          const afterRun = program.body[program.body.indexOf(run[run.length - 1]) + 1];
          const runLimit = afterRun ? afterRun.range[0] : sourceCode.text.length;
          const slices = [];

          for (const node of run) {
            const startFrom = slices.length > 0 ? slices[slices.length - 1].end : minStart;
            slices.push(importSlice(sourceCode, node, startFrom, runLimit));
          }

          const current = sourceCode.text.slice(slices[0].start, slices[slices.length - 1].end);
          const desired = formatRun(slices);

          if (current === desired)
            continue;

          context.report({
            node: run[0],
            messageId: 'unsortedImports',
            fix(fixer) {
              return fixer.replaceTextRange(
                [slices[0].start, slices[slices.length - 1].end],
                desired
              );
            }
          });
        }
      }
    };
  }
};
