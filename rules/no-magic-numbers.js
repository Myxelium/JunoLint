'use strict';

const SMALL_COMMON = new Set([-2, -1, 0, 1, 2]);

const VALUE_WRAPPERS = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion'
]);

function isNumericLiteral(node) {
  return Boolean(
    node &&
    node.type === 'Literal' &&
    (typeof node.value === 'number' || typeof node.value === 'bigint')
  );
}

function isIntegerPowerOfTen(value) {
  if (typeof value === 'bigint') {
    let current = value < 0n ? -value : value;

    if (current < 10n)
      return false;

    while (current % 10n === 0n)
      current /= 10n;

    return current === 1n;
  }

  if (!Number.isFinite(value))
    return false;

  const absolute = Math.abs(value);

  if (!Number.isInteger(absolute) || absolute < 10 || absolute > Number.MAX_SAFE_INTEGER)
    return false;

  let current = absolute;

  while (current > 1) {
    if (current % 10 !== 0)
      return false;

    current /= 10;
  }

  return true;
}

function isCommonNumber(value) {
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
      return isIntegerPowerOfTen(value);

    return isCommonNumber(Number(value));
  }

  return SMALL_COMMON.has(value) || isIntegerPowerOfTen(value);
}

function isExtraAllowed(value, allowed) {
  if (allowed.has(value))
    return true;

  if (typeof value === 'bigint' && allowed.has(Number(value)))
    return true;

  if (typeof value === 'number' && Number.isInteger(value) && allowed.has(BigInt(value)))
    return true;

  return false;
}

function outermostValue(node) {
  let current = node;

  while (current.parent && VALUE_WRAPPERS.has(current.parent.type)) {
    const parent = current.parent;

    if (parent.expression && parent.expression !== current)
      break;

    current = parent;
  }

  return current;
}

function isNamedNumber(fullNumberNode) {
  const valueNode = outermostValue(fullNumberNode);
  const parent = valueNode.parent;

  if (!parent)
    return false;

  switch (parent.type) {
    case 'VariableDeclarator':
      return parent.init === valueNode;
    case 'PropertyDefinition':
    case 'AccessorProperty':
      return parent.value === valueNode;
    case 'AssignmentPattern':
      return parent.right === valueNode;
    case 'Property':
      return parent.value === valueNode || parent.key === valueNode;
    case 'TSEnumMember':
      return true;
    case 'AssignmentExpression':
      return parent.right === valueNode && parent.left.type !== 'Identifier';
    default:
      return false;
  }
}

function isTypeLiteral(fullNumberNode) {
  return fullNumberNode.parent && fullNumberNode.parent.type === 'TSLiteralType';
}

function isParseIntRadix(fullNumberNode) {
  const parent = fullNumberNode.parent;

  if (!parent || parent.type !== 'CallExpression' || parent.arguments[1] !== fullNumberNode)
    return false;

  const callee = parent.callee;

  if (callee.type === 'Identifier' && callee.name === 'parseInt')
    return true;

  return Boolean(
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Number' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'parseInt'
  );
}

function isMemberIndex(fullNumberNode) {
  const parent = fullNumberNode.parent;

  return Boolean(
    parent &&
    parent.type === 'MemberExpression' &&
    parent.computed &&
    parent.property === fullNumberNode
  );
}

function isJsxNumber(fullNumberNode) {
  return Boolean(fullNumberNode.parent && String(fullNumberNode.parent.type).startsWith('JSX'));
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow unexplained numeric literals; common values such as 0, 1, 100, and 1000 are allowed'
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowed: {
            type: 'array',
            items: { type: 'number' },
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      noMagic:
        '{{raw}} is a magic number. Extract it to a named constant (0, 1, 100, and 1000 are allowed).'
    }
  },
  create(context) {
    const allowed = new Set(context.options[0]?.allowed ?? []);

    function checkNumber(fullNumberNode, value, raw) {
      if (isCommonNumber(value) || isExtraAllowed(value, allowed))
        return;

      if (
        isNamedNumber(fullNumberNode) ||
        isTypeLiteral(fullNumberNode) ||
        isParseIntRadix(fullNumberNode) ||
        isMemberIndex(fullNumberNode) ||
        isJsxNumber(fullNumberNode)
      )
        return;

      context.report({
        node: fullNumberNode,
        messageId: 'noMagic',
        data: { raw }
      });
    }

    return {
      Literal(node) {
        if (!isNumericLiteral(node))
          return;

        if (
          node.parent &&
          node.parent.type === 'UnaryExpression' &&
          (node.parent.operator === '-' || node.parent.operator === '+')
        ) {
          checkNumber(
            node.parent,
            node.parent.operator === '-' ? -node.value : node.value,
            `${node.parent.operator}${node.raw}`
          );
          return;
        }

        checkNumber(node, node.value, node.raw);
      }
    };
  }
};
