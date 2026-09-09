'use strict';

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

function startsWithThe(name) {
  const words = wordsIn(name);

  return words.length > 0 && words[0].toLowerCase() === 'the';
}

function keyName(key) {
  if (!key)
    return '';

  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier')
    return key.name;

  return '';
}

function isFunctionValue(node) {
  return Boolean(
    node &&
    (node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'TSEmptyBodyFunctionExpression')
  );
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
      description: 'Disallow names that start with the word "the" (themeStudio is allowed; theHttpClient is not)'
    },
    schema: [],
    messages: {
      noLeadingThe:
        'Name "{{name}}" starts with the word "the". Drop the article and name the thing itself (themeStudio is fine).'
    }
  },
  create(context) {
    function checkName(node, idName) {
      if (typeof idName !== 'string' || idName.length === 0)
        return;

      if (idName === 'constructor' || /^_+$/.test(idName))
        return;

      if (!startsWithThe(idName))
        return;

      context.report({
        node,
        messageId: 'noLeadingThe',
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

    function checkKey(key) {
      const name = keyName(key);

      if (name)
        checkName(key, name);
    }

    function checkMethod(node) {
      if (node.kind === 'constructor' || node.computed)
        return;

      checkKey(node.key);
    }

    return {
      VariableDeclarator(node) {
        checkBinding(node.id);
      },
      FunctionDeclaration(node) {
        if (node.id)
          checkName(node.id, node.id.name);

        checkParams(node.params);
      },
      FunctionExpression(node) {
        if (node.id) {
          const parent = node.parent;
          const propertyName = parent && parent.type === 'Property' && parent.value === node
            ? keyName(parent.key)
            : '';

          if (propertyName !== node.id.name)
            checkName(node.id, node.id.name);
        }

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

        checkKey(node.key);
      },
      TSParameterProperty(node) {
        checkBinding(node.parameter);
      },
      MethodDefinition: checkMethod,
      TSAbstractMethodDefinition: checkMethod,
      TSMethodSignature(node) {
        if (node.computed)
          return;

        checkKey(node.key);
      },
      Property(node) {
        if (node.computed || node.shorthand)
          return;

        if (node.method || node.kind === 'get' || node.kind === 'set' || isFunctionValue(node.value))
          checkKey(node.key);
      }
    };
  }
};
