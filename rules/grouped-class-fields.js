'use strict';

const {
  fieldName,
  fieldRuns,
  groupKey,
  groupLabel,
  sameFieldGroup,
  shouldPackFields
} = require('./class-field-groups');

function memberGapStart(sourceCode, node) {
  const after = sourceCode.getTokenAfter(node, { includeComments: false });

  if (after && after.value === ';')
    return after.range[1];

  return node.range[1];
}

function desiredGap(gapText, sameGroup) {
  if (!gapText.includes('\n'))
    return null;

  const lines = gapText.split('\n');
  const first = lines[0];
  const last = lines[lines.length - 1];
  const comments = lines.slice(1, -1).filter((line) => line.trim() !== '');
  const blank = sameGroup ? '' : '\n';
  const commentBlock = comments.length > 0 ? `${comments.join('\n')}\n` : '';

  return `${first}\n${blank}${commentBlock}${last}`;
}

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Pack consecutive single-line class fields that share a top-level initializer call, and put one blank line between different groups. Multiline fields keep their surrounding blank lines.'
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      unexpectedBlankLine:
        'Keep "{{left}}" and "{{right}}" together ({{group}}); drop the blank line.',
      missingBlankLine:
        'Put a blank line between "{{left}}" ({{leftGroup}}) and "{{right}}" ({{rightGroup}}).',
      extraBlankLine:
        'Use one blank line between "{{left}}" ({{leftGroup}}) and "{{right}}" ({{rightGroup}}).'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      ClassBody(node) {
        for (const run of fieldRuns(node.body)) {
          for (let index = 1; index < run.length; index += 1) {
            const left = run[index - 1];
            const right = run[index];
            const gapStart = memberGapStart(sourceCode, left);
            const gapEnd = right.range[0];
            const gapText = sourceCode.text.slice(gapStart, gapEnd);
            if (sameFieldGroup(left, right) && !shouldPackFields(left, right))
              continue;

            const packed = shouldPackFields(left, right);
            const nextGap = desiredGap(gapText, packed);

            if (nextGap === null || nextGap === gapText)
              continue;

            const leftGroup = groupLabel(groupKey(left));
            const rightGroup = groupLabel(groupKey(right));
            const leftLabel = fieldName(left) || leftGroup;
            const rightLabel = fieldName(right) || rightGroup;
            let messageId = 'missingBlankLine';

            if (packed)
              messageId = 'unexpectedBlankLine';
            else if (gapText.split('\n').slice(1, -1).some((line) => line.trim() === ''))
              messageId = 'extraBlankLine';

            context.report({
              node: right,
              messageId,
              data: {
                left: leftLabel,
                right: rightLabel,
                group: leftGroup,
                leftGroup,
                rightGroup
              },
              fix(fixer) {
                return fixer.replaceTextRange([gapStart, gapEnd], nextGap);
              }
            });
          }
        }
      }
    };
  }
};
