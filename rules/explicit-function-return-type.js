'use strict';

const WRAPPERS = new Set([
  'ChainExpression',
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion'
]);

const BOOLEAN_OPS = new Set([
  '==',
  '!=',
  '===',
  '!==',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'instanceof'
]);

const NUMBER_OPS = new Set([
  '-',
  '*',
  '/',
  '%',
  '**',
  '|',
  '&',
  '^',
  '<<',
  '>>',
  '>>>'
]);

function unwrap(node) {
  while (node && WRAPPERS.has(node.type) && node.expression && node.expression !== node)
    node = node.expression;

  return node;
}

function isFunctionNode(node) {
  return Boolean(
    node &&
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'TSEmptyBodyFunctionExpression' ||
      node.type === 'TSDeclareFunction')
  );
}

function keyName(key, computed) {
  if (computed || !key)
    return '';

  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier')
    return key.name;

  return '';
}

function functionName(node) {
  if (node.id && node.id.type === 'Identifier')
    return node.id.name;

  const parent = node.parent;

  if (!parent)
    return '';

  switch (parent.type) {
    case 'MethodDefinition':
    case 'TSAbstractMethodDefinition':
    case 'Property':
    case 'PropertyDefinition':
    case 'TSMethodSignature':
      return keyName(parent.key, parent.computed);
    case 'VariableDeclarator':
      return parent.id && parent.id.type === 'Identifier' ? parent.id.name : '';
    default:
      return '';
  }
}

function isConstructorOrSetter(node) {
  const parent = node.parent;

  if (!parent)
    return false;

  if (parent.type === 'MethodDefinition' || parent.type === 'TSAbstractMethodDefinition' || parent.type === 'TSMethodSignature')
    return parent.kind === 'constructor' || parent.kind === 'set';

  if (parent.type === 'Property')
    return parent.kind === 'set';

  return false;
}

function hasBindingType(node) {
  const parent = node.parent;

  if (!parent)
    return false;

  if (parent.type === 'VariableDeclarator')
    return Boolean(parent.id && parent.id.typeAnnotation);

  if (parent.type === 'PropertyDefinition')
    return Boolean(parent.typeAnnotation);

  if (parent.type === 'AssignmentPattern' && parent.right === node)
    return Boolean(parent.left && parent.left.typeAnnotation);

  return false;
}

function isCallbackLike(node) {
  let current = node;

  while (current.parent) {
    const parent = current.parent;

    if (parent.type === 'CallExpression' || parent.type === 'NewExpression')
      return parent.callee !== current;

    if (parent.type === 'JSXExpressionContainer' || parent.type === 'JSXSpreadAttribute')
      return true;

    if (parent.type === 'Property' && parent.value === current) {
      current = parent;
      continue;
    }

    if (parent.type === 'ObjectExpression' || parent.type === 'ArrayExpression') {
      current = parent;
      continue;
    }

    if (parent.type === 'SpreadElement' && parent.argument === current) {
      current = parent;
      continue;
    }

    if (
      WRAPPERS.has(parent.type) ||
      parent.type === 'ConditionalExpression' ||
      parent.type === 'LogicalExpression' ||
      parent.type === 'SequenceExpression'
    ) {
      current = parent;
      continue;
    }

    return false;
  }

  return false;
}

function isConstType(typeNode) {
  return Boolean(
    typeNode &&
    typeNode.type === 'TSTypeReference' &&
    typeNode.typeName &&
    typeNode.typeName.type === 'Identifier' &&
    typeNode.typeName.name === 'const'
  );
}

function isConstAssertion(node) {
  let current = node;

  while (current && (current.type === 'ParenthesizedExpression' || current.type === 'TSSatisfiesExpression'))
    current = current.expression;

  if (!current)
    return false;

  if (current.type === 'TSAsExpression' || current.type === 'TSTypeAssertion')
    return isConstType(current.typeAnnotation);

  return false;
}

function isConstAssertionArrow(node) {
  if (node.type !== 'ArrowFunctionExpression' || node.body.type === 'BlockStatement')
    return false;

  let body = node.body;

  while (body && body.type === 'TSSatisfiesExpression')
    body = body.expression;

  return isConstAssertion(body);
}

function returnedFromTypedFunction(node) {
  let ancestor = node.parent;

  if (ancestor && ancestor.type === 'Property')
    ancestor = ancestor.value;

  const isReturned = ancestor && ancestor.type === 'ReturnStatement';
  const isArrowBody = ancestor &&
    ancestor.type === 'ArrowFunctionExpression' &&
    ancestor.body === node;

  if (!isReturned && !isArrowBody)
    return false;

  while (ancestor) {
    if (isFunctionNode(ancestor) && ancestor.returnType)
      return true;

    if (ancestor.type === 'VariableDeclarator')
      return Boolean(ancestor.id && ancestor.id.typeAnnotation);

    if (ancestor.type === 'PropertyDefinition')
      return Boolean(ancestor.typeAnnotation);

    if (ancestor.type === 'ExpressionStatement')
      return false;

    ancestor = ancestor.parent;
  }

  return false;
}

function lastStatement(node) {
  if (!node)
    return null;

  if (node.type === 'BlockStatement')
    return lastStatement(node.body[node.body.length - 1]);

  return node;
}

function statementAlwaysThrows(node) {
  const current = lastStatement(node);

  if (!current)
    return false;

  if (current.type === 'ThrowStatement')
    return true;

  if (current.type === 'IfStatement')
    return statementAlwaysThrows(current.consequent) && statementAlwaysThrows(current.alternate);

  return false;
}

function statementAlwaysExits(node) {
  const current = lastStatement(node);

  if (!current)
    return false;

  if (current.type === 'ReturnStatement' || current.type === 'ThrowStatement')
    return true;

  if (current.type === 'IfStatement')
    return statementAlwaysExits(current.consequent) && statementAlwaysExits(current.alternate);

  return false;
}

function assertionType(node, sourceCode) {
  let current = node;

  while (current && current.type === 'ParenthesizedExpression')
    current = current.expression;

  if (!current)
    return null;

  if (current.type !== 'TSAsExpression' && current.type !== 'TSTypeAssertion')
    return null;

  if (isConstType(current.typeAnnotation))
    return null;

  return sourceCode.getText(current.typeAnnotation);
}

function simpleTypeOf(node, sourceCode) {
  const asserted = assertionType(node, sourceCode);

  if (asserted)
    return asserted;

  const current = unwrap(node);

  if (!current)
    return null;

  switch (current.type) {
    case 'Literal':
      if (current.regex)
        return null;

      if (current.bigint != null)
        return 'bigint';

      if (current.value === null)
        return 'null';

      switch (typeof current.value) {
        case 'string':
          return 'string';
        case 'number':
          return 'number';
        case 'boolean':
          return 'boolean';
        default:
          return null;
      }
    case 'TemplateLiteral':
      return current.expressions.length === 0 ? 'string' : null;
    case 'Identifier':
      return current.name === 'undefined' ? 'undefined' : null;
    case 'UnaryExpression':
      if (current.operator === '!')
        return 'boolean';

      if (current.operator === 'void')
        return 'undefined';

      if (current.operator === 'typeof')
        return 'string';

      if (current.operator === 'delete')
        return 'boolean';

      if (current.operator === '+' || current.operator === '-' || current.operator === '~')
        return 'number';

      return null;
    case 'BinaryExpression':
      if (BOOLEAN_OPS.has(current.operator))
        return 'boolean';

      if (NUMBER_OPS.has(current.operator))
        return 'number';

      if (current.operator === '+') {
        const left = simpleTypeOf(current.left, sourceCode);
        const right = simpleTypeOf(current.right, sourceCode);

        if (left === 'string' || right === 'string')
          return 'string';

        if (left === 'number' && right === 'number')
          return 'number';
      }

      return null;
    default:
      return null;
  }
}

function wrapAsync(typeText, isAsync) {
  if (!typeText)
    return null;

  return isAsync ? `Promise<${typeText}>` : typeText;
}

function inferredReturnType(node, returns, sourceCode) {
  if (node.generator || !node.body)
    return null;

  if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement')
    return wrapAsync(simpleTypeOf(node.body, sourceCode), node.async);

  const valueReturns = returns.filter((item) => item.argument);
  const emptyReturns = returns.filter((item) => !item.argument);

  if (valueReturns.length === 0) {
    if (statementAlwaysThrows(node.body))
      return wrapAsync('never', node.async);

    return wrapAsync('void', node.async);
  }

  if (emptyReturns.length > 0 || !statementAlwaysExits(node.body))
    return null;

  const types = valueReturns.map((item) => simpleTypeOf(item.argument, sourceCode));

  if (types.some((typeText) => typeText == null))
    return null;

  const unique = new Set(types);

  if (unique.size !== 1)
    return null;

  return wrapAsync(unique.values().next().value, node.async);
}

function needsArrowParens(node, sourceCode) {
  if (node.params.length !== 1)
    return false;

  const param = node.params[0];

  if (param.type !== 'Identifier' || param.typeAnnotation || param.optional)
    return false;

  const tokenBefore = sourceCode.getTokenBefore(param);

  return !tokenBefore || tokenBefore.value !== '(';
}

function createReturnTypeFix(node, sourceCode, typeText) {
  const annotation = `: ${typeText}`;

  return (fixer) => {
    if (node.type === 'ArrowFunctionExpression') {
      const arrow = sourceCode.getTokenBefore(node.body, (token) => token.value === '=>');

      if (!arrow)
        return null;

      if (needsArrowParens(node, sourceCode)) {
        const param = node.params[0];

        return fixer.replaceTextRange(
          [param.range[0], arrow.range[0]],
          `(${sourceCode.getText(param)})${annotation} `
        );
      }

      const beforeArrow = sourceCode.getTokenBefore(arrow);

      if (!beforeArrow)
        return null;

      return fixer.insertTextAfter(beforeArrow, annotation);
    }

    if (node.body) {
      const beforeBody = sourceCode.getTokenBefore(node.body);

      if (!beforeBody)
        return null;

      return fixer.insertTextAfter(beforeBody, annotation);
    }

    return null;
  };
}

function subjectOf(node) {
  const name = functionName(node);

  if (name)
    return `Function "${name}"`;

  return 'This function';
}

function shouldSkip(node, options) {
  if (node.returnType)
    return true;

  if (isConstructorOrSetter(node))
    return true;

  if (node.kind === 'constructor' || node.kind === 'set')
    return true;

  const name = functionName(node);

  if (name && options.allowedNames.has(name))
    return true;

  if (hasBindingType(node))
    return true;

  if (isConstAssertionArrow(node))
    return true;

  if (returnedFromTypedFunction(node))
    return true;

  if (!options.checkCallbacks && isCallbackLike(node))
    return true;

  return false;
}

function reportMissing(context, node, sourceCode, returns, options) {
  if (shouldSkip(node, options))
    return;

  const typeText = inferredReturnType(node, returns, sourceCode);

  context.report({
    node,
    messageId: 'missingReturnType',
    data: { subject: subjectOf(node) },
    fix: typeText ? createReturnTypeFix(node, sourceCode, typeText) : null
  });
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require explicit return types on functions and methods'
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          allowedNames: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true
          },
          checkCallbacks: { type: 'boolean' }
        }
      }
    ],
    messages: {
      missingReturnType: '{{subject}} must specify a return type.'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const options = context.options[0] ?? {};
    const optionsBag = {
      allowedNames: new Set(options.allowedNames ?? []),
      checkCallbacks: options.checkCallbacks === true
    };

    const stack = [];

    function enter(node) {
      stack.push({ node, returns: [] });
    }

    function exit(node) {
      const info = stack.pop();

      reportMissing(context, node, sourceCode, info ? info.returns : [], optionsBag);
    }

    function checkSignature(node) {
      if (node.returnType)
        return;

      if (node.kind === 'constructor' || node.kind === 'set')
        return;

      const name = keyName(node.key, node.computed);

      if (name && optionsBag.allowedNames.has(name))
        return;

      context.report({
        node,
        messageId: 'missingReturnType',
        data: {
          subject: name ? `Function "${name}"` : 'This function'
        }
      });
    }

    return {
      FunctionDeclaration: enter,
      FunctionExpression: enter,
      ArrowFunctionExpression: enter,
      TSEmptyBodyFunctionExpression: enter,
      TSDeclareFunction: enter,
      ReturnStatement(node) {
        if (stack.length > 0)
          stack[stack.length - 1].returns.push(node);
      },
      'FunctionDeclaration:exit': exit,
      'FunctionExpression:exit': exit,
      'ArrowFunctionExpression:exit': exit,
      'TSEmptyBodyFunctionExpression:exit': exit,
      'TSDeclareFunction:exit': exit,
      TSMethodSignature: checkSignature,
      TSCallSignatureDeclaration(node) {
        if (node.returnType)
          return;

        context.report({
          node,
          messageId: 'missingReturnType',
          data: { subject: 'This function' }
        });
      }
    };
  }
};
