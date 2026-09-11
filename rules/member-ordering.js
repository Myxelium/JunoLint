'use strict';

const { shouldPackFields } = require('./class-field-groups');

const LIFECYCLE = Object.freeze([
  'ngOnInit',
  'ngOnChanges',
  'ngDoCheck',
  'ngAfterContentInit',
  'ngAfterContentChecked',
  'ngAfterViewInit',
  'ngAfterViewChecked'
]);

const DESTROY = 'ngOnDestroy';

const GROUP_RANK = Object.freeze({
  'static-field': 0,
  'static-block': 1,
  'static-method': 2,
  'instance-field': 3,
  other: 4,
  constructor: 5,
  lifecycle: 6,
  'instance-method': 7,
  ngOnDestroy: 8
});

const ACCESS_RANK = Object.freeze({
  public: 0,
  protected: 1,
  private: 2
});

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression'
]);

const NESTED_CLASS_TYPES = new Set([
  'ClassDeclaration',
  'ClassExpression'
]);

const INIT_TIME_TYPES = new Set([
  'AccessorProperty',
  'PropertyDefinition',
  'StaticBlock',
  'TSAbstractPropertyDefinition',
  'TSIndexSignature'
]);

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

      const name = memberName(node);

      if (name === DESTROY)
        return 'ngOnDestroy';

      if (LIFECYCLE.includes(name))
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

function isInitTimeMember(node) {
  return INIT_TIME_TYPES.has(node.type);
}

function unwrap(node) {
  while (node) {
    switch (node.type) {
      case 'TSAsExpression':
      case 'TSTypeAssertion':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSInstantiationExpression':
      case 'ChainExpression':
        node = node.expression;
        continue;
      default:
        return node;
    }
  }

  return node;
}

function isFunctionNode(node) {
  return Boolean(node && FUNCTION_TYPES.has(node.type));
}

function invokedFunction(callNode) {
  const callee = unwrap(callNode.callee);

  if (isFunctionNode(callee))
    return callee;

  if (
    callee &&
    (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression')
  ) {
    const prop = callee.property;
    const name = !callee.computed && prop && prop.type === 'Identifier' ? prop.name : '';

    if (name === 'call' || name === 'apply') {
      const target = unwrap(callee.object);

      if (isFunctionNode(target))
        return target;
    }
  }

  return null;
}

function referencedMemberName(node) {
  const object = unwrap(node.object);
  const property = node.property;

  if (object.type !== 'ThisExpression' && object.type !== 'Identifier')
    return '';

  if (node.computed) {
    if (property.type === 'Literal')
      return String(property.value);

    return '';
  }

  if (property.type === 'Identifier' || property.type === 'PrivateIdentifier')
    return property.name;

  return '';
}

function addImmediateMemberUse(used, node, className) {
  const object = unwrap(node.object);

  if (object.type === 'ThisExpression') {
    const name = referencedMemberName(node);

    if (name)
      used.add(name);

    return;
  }

  if (className && object.type === 'Identifier' && object.name === className) {
    const name = referencedMemberName(node);

    if (name)
      used.add(name);
  }
}

function collectImmediateUses(root, className) {
  const used = new Set();

  if (!root)
    return used;

  function visit(node, immediate) {
    if (!node || typeof node !== 'object' || !node.type)
      return;

    if (NESTED_CLASS_TYPES.has(node.type))
      return;

    if (
      node.type === 'MemberExpression' ||
      node.type === 'OptionalMemberExpression'
    ) {
      if (immediate)
        addImmediateMemberUse(used, node, className);

      visit(node.object, immediate);

      if (node.computed)
        visit(node.property, immediate);

      return;
    }

    if (isFunctionNode(node)) {
      for (const param of node.params ?? [])
        visit(param, false);

      return;
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      const invoked = invokedFunction(node);

      visit(node.callee, immediate);

      for (const argument of node.arguments)
        visit(argument, immediate);

      if (invoked && invoked.body)
        visit(invoked.body, immediate);

      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'parent' || key === 'range' || key === 'loc' || key === 'tokens')
        continue;

      const child = node[key];

      if (Array.isArray(child)) {
        for (const item of child)
          visit(item, immediate);
      } else if (child && typeof child === 'object' && child.type) {
        visit(child, immediate);
      }
    }
  }

  visit(root, true);
  return used;
}

function immediateUsesOf(member, className) {
  const used = new Set();

  if (member.computed && member.key) {
    for (const name of collectImmediateUses(member.key, className))
      used.add(name);
  }

  switch (member.type) {
    case 'PropertyDefinition':
    case 'AccessorProperty':
    case 'TSAbstractPropertyDefinition':
      for (const name of collectImmediateUses(member.value, className))
        used.add(name);
      break;
    case 'StaticBlock':
      for (const name of collectImmediateUses(member, className))
        used.add(name);
      break;
    default:
      break;
  }

  return used;
}

function classNameOf(classBody) {
  const parent = classBody.parent;

  if (parent && parent.id && parent.id.type === 'Identifier')
    return parent.id.name;

  return '';
}

function preferredOrder(members) {
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

function addEdge(successors, before, after) {
  if (before === after)
    return false;

  const next = successors.get(before);

  if (next.has(after))
    return false;

  next.add(after);
  return true;
}

function reaches(successors, from, target) {
  const stack = [from];
  const seen = new Set();

  while (stack.length > 0) {
    const current = stack.pop();

    if (current === target)
      return true;

    if (seen.has(current))
      continue;

    seen.add(current);

    for (const next of successors.get(current))
      stack.push(next);
  }

  return false;
}

function preserveGroupOrder(members, successors, group) {
  const grouped = members.filter((member) => groupOf(member) === group);

  for (let index = 0; index < grouped.length - 1; index++)
    addEdge(successors, grouped[index], grouped[index + 1]);
}

function sortMembers(members, className) {
  const preferred = preferredOrder(members);
  const successors = new Map(members.map((member) => [member, new Set()]));

  preserveGroupOrder(members, successors, 'static-field');
  preserveGroupOrder(members, successors, 'static-block');
  preserveGroupOrder(members, successors, 'instance-field');

  const initByName = new Map();

  for (const member of members) {
    if (!isInitTimeMember(member))
      continue;

    const name = memberName(member);

    if (name && !initByName.has(name))
      initByName.set(name, member);
  }

  for (const member of members) {
    for (const name of immediateUsesOf(member, className)) {
      const used = initByName.get(name);

      if (!used)
        continue;

      if (reaches(successors, member, used))
        continue;

      addEdge(successors, used, member);
    }
  }

  const indegree = new Map(members.map((member) => [member, 0]));

  for (const next of successors.values()) {
    for (const member of next)
      indegree.set(member, indegree.get(member) + 1);
  }

  const preferredIndex = new Map(preferred.map((member, index) => [member, index]));
  const ready = members
    .filter((member) => indegree.get(member) === 0)
    .sort((left, right) => preferredIndex.get(left) - preferredIndex.get(right));
  const ordered = [];

  while (ready.length > 0) {
    const current = ready.shift();
    ordered.push(current);

    const newlyReady = [];

    for (const next of successors.get(current)) {
      const degree = indegree.get(next) - 1;
      indegree.set(next, degree);

      if (degree === 0)
        newlyReady.push(next);
    }

    if (newlyReady.length === 0)
      continue;

    ready.push(...newlyReady);
    ready.sort((left, right) => preferredIndex.get(left) - preferredIndex.get(right));
  }

  if (ordered.length === members.length)
    return ordered;

  for (const member of members) {
    if (!ordered.includes(member))
      ordered.push(member);
  }

  return ordered;
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

function joinMembers(sourceCode, members, indent) {
  return members.map((member, index) => {
    const line = `${indent}${memberText(sourceCode, member)}`;

    if (index === 0)
      return line;

    const packed = shouldPackFields(members[index - 1], member);
    return `${packed ? '\n' : '\n\n'}${line}`;
  }).join('');
}

module.exports = {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Order class members: fields stay in source order, then constructor, ngOnInit, other lifecycle hooks, methods, and ngOnDestroy last'
    },
    fixable: 'code',
    schema: [],
    messages: {
      incorrectOrder:
        'Member "{{name}}" is in the wrong place. Fields keep source order (inject()/init safe); then constructor, ngOnInit, other lifecycle hooks, methods (public → private), and ngOnDestroy last.'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      ClassBody(node) {
        const members = node.body;

        if (members.length < 2)
          return;

        const ordered = sortMembers(members, classNameOf(node));

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
            const body = joinMembers(sourceCode, ordered, indent);
            return fixer.replaceTextRange([open.range[1], close.range[0]], `\n${body}\n`);
          }
        });
      }
    };
  }
};
