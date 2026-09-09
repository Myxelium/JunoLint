'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/no-leading-the';

async function lintTs(source) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: {
            ecmaVersion: 2022,
            sourceType: 'module'
          }
        },
        plugins: { junolint: plugin },
        rules: {
          [RULE]: 'error'
        }
      }
    ]
  });

  const [result] = await eslint.lintText(source, { filePath: 'the.ts' });
  return result.messages.filter((message) => message.ruleId === RULE);
}

function namesOf(messages) {
  return messages.map((message) => message.message.match(/"([^"]+)"/)[1]);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include no-leading-the');
  assert.equal(tsBlock.rules[RULE], 'error', 'no-leading-the should be error by default');
  assert.ok(plugin.rules['no-leading-the'], 'plugin should export no-leading-the');

  const variables = await lintTs([
    'const theHttpClient = 1;',
    'const themeStudio = 2;',
    'const theoreticalLimit = 3;',
    'const theaterMode = 4;',
    'const thenDoWork = 5;',
    'const httpClient = 6;',
    'const theValue = 7;',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(variables),
    ['theHttpClient', 'theValue'],
    'the-word prefix should fail; theme/theory/then and other names should pass'
  );

  const casing = await lintTs([
    'const TheHttpClient = 1;',
    'const THE_HTTP_CLIENT = 2;',
    'const THE = 3;',
    'const the = 4;',
    'const theme = 5;',
    'const ThemeStudio = 6;',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(casing),
    ['TheHttpClient', 'THE_HTTP_CLIENT', 'THE', 'the'],
    'PascalCase, SCREAMING_SNAKE, and a lone the should fail; theme names should pass'
  );

  const functions = await lintTs([
    'function theHttpClient() {}',
    'function themeStudio() {}',
    'function theoreticalLimit() {}',
    'function loadTheRecord() {}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(functions),
    ['theHttpClient'],
    'function names starting with the word the should fail'
  );

  const methods = await lintTs([
    'export class Example {',
    '  theHttpClient() {}',
    '  themeStudio() {}',
    '  private theCache() {}',
    '  private readTheCache() {}',
    '  constructor() {}',
    '}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(methods).sort(),
    ['theCache', 'theHttpClient'].sort(),
    'method names starting with the word the should fail'
  );

  const fieldsAndParams = await lintTs([
    'export class Example {',
    '  theHttpClient = 1;',
    '  themeStudio = 2;',
    '  save(theRequestBody: string, themeName: string) {}',
    '}',
    'const run = (theHandler: () => void, themeLoader: () => void) => theHandler();',
    'try { throw 1; } catch (theException) {}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(fieldsAndParams).sort(),
    ['theException', 'theHandler', 'theHttpClient', 'theRequestBody'].sort(),
    'fields, parameters, and catch bindings should be checked'
  );

  const objectMethods = await lintTs([
    'const api = {',
    '  theHttpClient() {},',
    '  themeStudio() {},',
    '  load: () => {},',
    '  theLoader: function theLoader() {},',
    '  count: 1',
    '};',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(objectMethods).sort(),
    ['theHttpClient', 'theLoader'].sort(),
    'object methods should be checked; data properties should not'
  );

  const destructure = await lintTs([
    'const { theHttpClient, themeStudio } = obj;',
    'const [theFirstItem, themeName] = list;',
    'function take({ theValue: theRenamedValue, leftoverName }: any, ...theRestArgs: any[]) {}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(destructure).sort(),
    ['theFirstItem', 'theHttpClient', 'theRenamedValue', 'theRestArgs'].sort(),
    'destructured bindings should use the local name'
  );

  const namedExpression = await lintTs('const run = function theHttpClient() {};\n');
  assert.deepEqual(namesOf(namedExpression), ['theHttpClient']);

  const signatures = await lintTs([
    'interface Repository {',
    '  theHttpClient(): void;',
    '  themeStudio(): void;',
    '  loadTheRecord(): void;',
    '}',
    ''
  ].join('\n'));

  assert.deepEqual(namesOf(signatures), ['theHttpClient']);

  const unused = await lintTs('const _ = 1;\nconst themeStudio = 2;\n');
  assert.deepEqual(namesOf(unused), []);

  console.log('no-leading-the: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
