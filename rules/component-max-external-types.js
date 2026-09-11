'use strict';

const path = require('node:path');

const DEFAULT_MAX = 2;

const TYPE_KINDS = new Set([
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration'
]);

function isIgnoredSourceFile(filePath) {
  const name = path.basename(String(filePath));

  if (name.endsWith('.d.ts'))
    return true;

  return /\.(?:spec|test)\.[^.]+$/i.test(name);
}

function decoratorName(decorator) {
  const expression = decorator.expression;

  if (expression.type === 'CallExpression') {
    if (expression.callee.type === 'Identifier')
      return expression.callee.name;

    if (expression.callee.type === 'MemberExpression' && expression.callee.property.type === 'Identifier')
      return expression.callee.property.name;
  }

  if (expression.type === 'Identifier')
    return expression.name;

  return '';
}

function isComponentClass(node) {
  const decorators = node.decorators || [];
  return decorators.some((decorator) => decoratorName(decorator) === 'Component');
}

function declaredStatement(statement) {
  if (
    (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') &&
    statement.declaration
  )
    return statement.declaration;

  return statement;
}

function exportedClass(statement) {
  const declared = declaredStatement(statement);
  return declared && declared.type === 'ClassDeclaration' ? declared : null;
}

function hasComponentClass(program) {
  return program.body.some((statement) => {
    const classNode = exportedClass(statement);
    return classNode && isComponentClass(classNode);
  });
}

function typeName(node) {
  if (!node.id)
    return 'this type';

  if (node.id.type === 'Identifier')
    return node.id.name;

  if (node.id.type === 'Literal')
    return String(node.id.value);

  return 'this type';
}

function collectExternalTypes(program) {
  const types = [];

  for (const statement of program.body) {
    const declared = declaredStatement(statement);

    if (declared && TYPE_KINDS.has(declared.type))
      types.push(declared);
  }

  return types;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Limit interfaces, type aliases, and enums declared outside a component class in a component file'
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'integer', minimum: 0 }
        },
        additionalProperties: false
      }
    ],
    messages: {
      tooMany:
        'Component file has {{count}} types outside the component (max {{max}}). Move "{{name}}" to a dedicated file.'
    }
  },
  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX;

    return {
      Program(node) {
        const filename = context.physicalFilename || context.filename || context.getFilename();
        if (isIgnoredSourceFile(filename))
          return;

        if (!hasComponentClass(node))
          return;

        const types = collectExternalTypes(node);
        if (types.length <= max)
          return;

        for (const extra of types.slice(max)) {
          context.report({
            node: extra.id || extra,
            messageId: 'tooMany',
            data: {
              count: String(types.length),
              max: String(max),
              name: typeName(extra)
            }
          });
        }
      }
    };
  }
};
