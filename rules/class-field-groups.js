'use strict';

const FIELD_TYPES = new Set([
  'PropertyDefinition',
  'TSAbstractPropertyDefinition',
  'AccessorProperty'
]);

function isClassField(node) {
  return Boolean(node && FIELD_TYPES.has(node.type));
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

function calleeRootName(node) {
  let current = unwrap(node);

  while (current) {
    current = unwrap(current);

    if (!current)
      return null;

    if (current.type === 'Identifier' || current.type === 'PrivateIdentifier')
      return current.name;

    if (current.type === 'ThisExpression')
      return 'this';

    if (current.type === 'Super')
      return 'super';

    if (
      current.type === 'MemberExpression' ||
      current.type === 'OptionalMemberExpression'
    ) {
      current = current.object;
      continue;
    }

    if (
      current.type === 'CallExpression' ||
      current.type === 'OptionalCallExpression' ||
      current.type === 'NewExpression'
    ) {
      current = current.callee;
      continue;
    }

    return null;
  }

  return null;
}

function groupKey(node) {
  if (!isClassField(node))
    return null;

  const value = unwrap(node.value);

  if (!value)
    return 'uninitialized';

  if (
    value.type === 'CallExpression' ||
    value.type === 'OptionalCallExpression'
  ) {
    const name = calleeRootName(value.callee);
    return name ? `call:${name}` : 'expr:CallExpression';
  }

  if (value.type === 'NewExpression') {
    const name = calleeRootName(value.callee);
    return name ? `new:${name}` : 'expr:NewExpression';
  }

  return `expr:${value.type}`;
}

function groupLabel(key) {
  if (!key)
    return 'other';

  if (key.startsWith('call:'))
    return key.slice(5);

  if (key.startsWith('new:'))
    return `new ${key.slice(4)}`;

  if (key.startsWith('expr:'))
    return key.slice(5);

  return key;
}

function sameFieldGroup(left, right) {
  if (!isClassField(left) || !isClassField(right))
    return false;

  return groupKey(left) === groupKey(right);
}

function isMultilineMember(node) {
  return Boolean(node && node.loc && node.loc.start.line !== node.loc.end.line);
}

function shouldPackFields(left, right) {
  return sameFieldGroup(left, right) && !isMultilineMember(left) && !isMultilineMember(right);
}

function fieldName(node) {
  const key = node && node.key;

  if (!key)
    return '';

  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier')
    return key.name;

  if (key.type === 'Literal')
    return String(key.value);

  return '';
}

function fieldRuns(members) {
  const runs = [];
  let current = [];

  for (const member of members) {
    if (isClassField(member)) {
      current.push(member);
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

module.exports = {
  fieldName,
  fieldRuns,
  groupKey,
  groupLabel,
  isClassField,
  isMultilineMember,
  sameFieldGroup,
  shouldPackFields
};
