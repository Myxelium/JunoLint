'use strict';

const { name, version } = require('./package.json');

const FORBIDDEN_UNICODE_SYMBOLS = Object.freeze([
  { char: '\u2013', name: 'Unicode en dash (–)', replacement: '-' },
  { char: '\u2014', name: 'Unicode em dash (—)', replacement: '-' },
  { char: '\u2026', name: 'Unicode ellipsis (…)', replacement: '...' },
  { char: '\u2192', name: 'Unicode right arrow (→)', replacement: '->' },
  { char: '\u2190', name: 'Unicode left arrow (←)', replacement: '<-' },
  { char: '\u2194', name: 'Unicode left-right arrow (↔)', replacement: '<->' },
  { char: '\u21d2', name: 'Unicode right double arrow (⇒)', replacement: '=>' },
  { char: '\u21d0', name: 'Unicode left double arrow (⇐)', replacement: '<=' },
  { char: '\u21d4', name: 'Unicode left-right double arrow (⇔)', replacement: '<=>' }
]);

function createReplaceFix(range, replacement) {
  return (fixer) => fixer.replaceTextRange(range, replacement);
}

const MAYBE_PATTERN = /maybe/i;

function identifierContainsMaybe(idName) {
  return typeof idName === 'string' && MAYBE_PATTERN.test(idName);
}

function checkIdentifier(context, node, idName) {
  if (!identifierContainsMaybe(idName))
    return;

  context.report({
    node,
    messageId: 'noMaybeInNaming',
    data: { name: idName }
  });
}

module.exports = {
  meta: {
    name,
    version
  },
  rules: {
    'angular-template-spacing': {
      meta: {
        type: 'layout',
        docs: {
          description: 'Enforce spacing between elements and property grouping in Angular templates',
          category: 'Stylistic Issues',
          recommended: true
        },
        fixable: 'whitespace',
        schema: []
      },
      create() {
        return {};
      }
    },
    'no-maybe-in-naming': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Disallow the word "maybe" in identifiers (variables, functions, classes, parameters)'
        },
        schema: [],
        messages: {
          noMaybeInNaming: 'Identifier "{{name}}" must not contain "maybe". Use an explicit name that states intent.'
        }
      },
      create(context) {
        const reportDefinition = (node, idName) => checkIdentifier(context, node, idName);

        return {
          VariableDeclarator(node) {
            if (node.id.type === 'Identifier')
              reportDefinition(node.id, node.id.name);
          },
          FunctionDeclaration(node) {
            if (node.id)
              reportDefinition(node.id, node.id.name);
          },
          ClassDeclaration(node) {
            if (node.id)
              reportDefinition(node.id, node.id.name);
          },
          MethodDefinition(node) {
            if (node.key.type === 'Identifier')
              reportDefinition(node.key, node.key.name);
          },
          PropertyDefinition(node) {
            if (node.key.type === 'Identifier')
              reportDefinition(node.key, node.key.name);
          },
          TSInterfaceDeclaration(node) {
            reportDefinition(node.id, node.id.name);
          },
          TSTypeAliasDeclaration(node) {
            reportDefinition(node.id, node.id.name);
          },
          TSMethodSignature(node) {
            if (node.key.type === 'Identifier')
              reportDefinition(node.key, node.key.name);
          },
          TSPropertySignature(node) {
            if (node.key.type === 'Identifier')
              reportDefinition(node.key, node.key.name);
          },
          TSParameterProperty(node) {
            if (node.parameter.type === 'Identifier')
              reportDefinition(node.parameter, node.parameter.name);
          },
          'FunctionDeclaration > Identifier[id]': function onParam(node) {
            reportDefinition(node, node.name);
          },
          'FunctionExpression > Identifier[id]': function onParam(node) {
            reportDefinition(node, node.name);
          },
          'ArrowFunctionExpression > Identifier[id]': function onParam(node) {
            reportDefinition(node, node.name);
          }
        };
      }
    },
    'no-unicode-symbols': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Disallow AI/LLM-style Unicode symbols in source files'
        },
        fixable: 'code',
        hasSuggestions: true,
        schema: [],
        messages: {
          forbiddenSymbol: '{{name}} is not allowed. Use ASCII "{{replacement}}" instead.',
          replaceSymbol: 'Replace with "{{replacement}}"'
        }
      },
      create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();

        return {
          Program() {
            const sourceText = sourceCode.getText();

            for (const symbol of FORBIDDEN_UNICODE_SYMBOLS) {
              let index = sourceText.indexOf(symbol.char);

              while (index !== -1) {
                const range = [index, index + symbol.char.length];
                const loc = {
                  start: sourceCode.getLocFromIndex(range[0]),
                  end: sourceCode.getLocFromIndex(range[1])
                };

                context.report({
                  loc,
                  messageId: 'forbiddenSymbol',
                  data: {
                    name: symbol.name,
                    replacement: symbol.replacement
                  },
                  fix: createReplaceFix(range, symbol.replacement),
                  suggest: [
                    {
                      messageId: 'replaceSymbol',
                      data: {
                        replacement: symbol.replacement
                      },
                      fix: createReplaceFix(range, symbol.replacement)
                    }
                  ]
                });

                index = sourceText.indexOf(symbol.char, index + symbol.char.length);
              }
            }
          }
        };
      }
    }
  },
  FORBIDDEN_UNICODE_SYMBOLS
};
