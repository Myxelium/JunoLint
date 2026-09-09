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

function checkPattern(checkName, node) {
  if (!node)
    return;

  switch (node.type) {
    case 'Identifier':
      checkName(node, node.name);
      break;
    case 'AssignmentPattern':
      checkPattern(checkName, node.left);
      break;
    case 'ObjectPattern':
      for (const property of node.properties) {
        if (property.type === 'RestElement')
          checkPattern(checkName, property.argument);
        else if (property.value)
          checkPattern(checkName, property.value);
      }
      break;
    case 'ArrayPattern':
      for (const element of node.elements)
        checkPattern(checkName, element);
      break;
    case 'RestElement':
      checkPattern(checkName, node.argument);
      break;
    case 'TSParameterProperty':
      checkPattern(checkName, node.parameter);
      break;
    default:
      break;
  }
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require self-explaining sentence-style variable names instead of short single words other developers cannot understand'
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
        'Variable "{{name}}" is a single word. Use a self-explaining sentence so other developers can tell what it holds.'
    }
  },
  create(context) {
    const options = context.options[0] ?? {};
    const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;
    const exceptions = new Set(options.exceptions ?? []);

    function checkName(node, idName) {
      if (typeof idName !== 'string' || idName.length === 0)
        return;

      if (exceptions.has(idName) || /^_+$/.test(idName))
        return;

      if (idName.length < minLength)
        return;

      if (isSentenceName(idName))
        return;

      context.report({
        node,
        messageId: 'preferSentence',
        data: { name: idName }
      });
    }

    function checkBinding(node) {
      checkPattern(checkName, node);
    }

    function checkParams(params) {
      for (const param of params)
        checkBinding(param);
    }

    return {
      VariableDeclarator(node) {
        checkBinding(node.id);
      },
      FunctionDeclaration(node) {
        checkParams(node.params);
      },
      FunctionExpression(node) {
        checkParams(node.params);
      },
      ArrowFunctionExpression(node) {
        checkParams(node.params);
      },
      CatchClause(node) {
        checkBinding(node.param);
      },
      PropertyDefinition(node) {
        if (node.computed)
          return;

        if (node.key.type === 'Identifier')
          checkName(node.key, node.key.name);
        else if (node.key.type === 'PrivateIdentifier')
          checkName(node.key, node.key.name);
      },
      TSParameterProperty(node) {
        checkBinding(node.parameter);
      }
    };
  }
};
