'use strict';

const DEFAULT_MIN_LENGTH = 0;

function wordsIn(name) {
  const stripped = String(name).replace(/^[_$]+/, '').replace(/[_$]+$/, '');

  if (!stripped)
    return [];

  return stripped
    .replace(/([a-z0-9])([A-Z])/g, '$1\0$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1\0$2')
    .split(/[\0_$]+/)
    .filter((part) => part.length > 0 && !/^\d+$/.test(part));
}

function isSentenceName(name) {
  return wordsIn(name).length >= 2;
}

function isFunctionValue(node) {
  return Boolean(
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'TSEmptyBodyFunctionExpression')
  );
}

function keyName(key) {
  if (!key)
    return '';

  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier')
    return key.name;

  return '';
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require self-explaining sentence-style function and method names instead of short single words other developers cannot understand'
    },
    schema: [
      {
        type: 'object',
        properties: {
          minLength: { type: 'integer', minimum: 0 },
          exceptions: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      preferSentence:
        '{{kind}} "{{name}}" is a single word. Use a self-explaining sentence so other developers can tell what it does.'
    }
  },
  create(context) {
    const options = context.options[0] ?? {};
    const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;
    const exceptions = new Set(options.exceptions ?? []);

    function checkName(node, idName, kind) {
      if (typeof idName !== 'string' || idName.length === 0)
        return;

      if (exceptions.has(idName) || /^_+$/.test(idName) || idName === 'constructor')
        return;

      if (idName.length < minLength)
        return;

      if (isSentenceName(idName))
        return;

      context.report({
        node,
        messageId: 'preferSentence',
        data: { name: idName, kind }
      });
    }

    function checkKey(key, kind) {
      const name = keyName(key);

      if (name)
        checkName(key, name, kind);
    }

    function checkMethod(node) {
      if (node.kind === 'constructor' || node.computed)
        return;

      checkKey(node.key, 'Method');
    }

    return {
      FunctionDeclaration(node) {
        if (node.id)
          checkName(node.id, node.id.name, 'Function');
      },
      FunctionExpression(node) {
        if (!node.id)
          return;

        const parent = node.parent;

        if (parent && parent.type === 'Property' && parent.value === node)
          return;

        checkName(node.id, node.id.name, 'Function');
      },
      MethodDefinition: checkMethod,
      TSAbstractMethodDefinition: checkMethod,
      TSMethodSignature(node) {
        if (node.computed)
          return;

        checkKey(node.key, 'Method');
      },
      Property(node) {
        if (node.computed || node.shorthand)
          return;

        if (node.method || node.kind === 'get' || node.kind === 'set' || isFunctionValue(node.value))
          checkKey(node.key, 'Method');
      }
    };
  }
};
