'use strict';

const LIFECYCLE = Object.freeze([
  'ngOnChanges',
  'ngOnInit',
  'ngDoCheck',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewInit',
  'ngAfterViewChecked',
  'ngOnDestroy'
]);

const GROUP_RANK = Object.freeze({
  'static-field': 0,
  'static-block': 1,
  'static-method': 2,
  'instance-field': 3,
  other: 4,
  constructor: 5,
  lifecycle: 6,
  'instance-method': 7
});

const ACCESS_RANK = Object.freeze({
  public: 0,
  protected: 1,
  private: 2
});

function memberName(node) {
  if (node.kind === 'constructor')
    return 'constructor';

  const key = node.key;

  if (!key)
    return '';

  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier')
    return key.name;

  if (key.type === 'Literal')
    return String(key.value);

  return '';
}

function accessibilityOf(node) {
  if (node.accessibility)
    return node.accessibility;

  const key = node.key;

  if (key && key.type === 'PrivateIdentifier')
    return 'private';

  return 'public';
}

function groupOf(node) {
  const isStatic = node.static === true;

  switch (node.type) {
    case 'PropertyDefinition':
    case 'AccessorProperty':
    case 'TSAbstractPropertyDefinition':
    case 'TSIndexSignature':
      return isStatic ? 'static-field' : 'instance-field';
    case 'StaticBlock':
      return 'static-block';
    case 'MethodDefinition':
    case 'TSAbstractMethodDefinition':
      if (node.kind === 'constructor')
        return 'constructor';

      if (isStatic)
        return 'static-method';

      if (LIFECYCLE.includes(memberName(node)))
        return 'lifecycle';

      return 'instance-method';
    default:
      return 'other';
  }
}

function subRank(node, originalIndex) {
  const group = groupOf(node);

  if (group === 'static-field' || group === 'instance-field' || group === 'static-block' || group === 'other')
    return originalIndex;

  if (group === 'lifecycle') {
    const index = LIFECYCLE.indexOf(memberName(node));
    return index === -1 ? originalIndex : index;
  }

  if (group === 'instance-method' || group === 'static-method')
    return ACCESS_RANK[accessibilityOf(node)] ?? 0;

  return 0;
}

function sortMembers(members) {
  return members
    .map((node, originalIndex) => ({ node, originalIndex }))
    .sort((left, right) => {
      const groupDelta = GROUP_RANK[groupOf(left.node)] - GROUP_RANK[groupOf(right.node)];

      if (groupDelta !== 0)
        return groupDelta;

      const subDelta = subRank(left.node, left.originalIndex) - subRank(right.node, right.originalIndex);

      if (subDelta !== 0)
        return subDelta;

      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.node);
}

function sameOrder(left, right) {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}

function indentOf(sourceCode, node) {
  const line = sourceCode.lines[node.loc.start.line - 1] ?? '';
  const match = line.match(/^(\s*)/);
  return match ? match[1] : '  ';
}

function memberText(sourceCode, node) {
  return sourceCode.getText(node);
}

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Order class members without reordering instance/static fields, so Angular inject() field init stays valid'
    },
    fixable: 'code',
    schema: [],
    messages: {
      incorrectOrder:
        'Member "{{name}}" is in the wrong place. Fields keep their source order (inject()/init safe); then constructor, lifecycle hooks, and methods (public → private).'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      ClassBody(node) {
        const members = node.body;

        if (members.length < 2)
          return;

        const ordered = sortMembers(members);

        if (sameOrder(members, ordered))
          return;

        const firstWrong = members.find((member, index) => member !== ordered[index]);
        const open = sourceCode.getFirstToken(node);
        const close = sourceCode.getLastToken(node);
        const indent = indentOf(sourceCode, members[0]);

        context.report({
          node: firstWrong,
          messageId: 'incorrectOrder',
          data: { name: memberName(firstWrong) || firstWrong.type },
          fix(fixer) {
            const body = ordered.map((member) => `${indent}${memberText(sourceCode, member)}`).join('\n\n');
            return fixer.replaceTextRange([open.range[1], close.range[0]], `\n${body}\n`);
          }
        });
      }
    };
  }
};
