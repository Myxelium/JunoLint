'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

async function lintTs(source, ruleOptions) {
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
          'junolint/prefer-sentence-names': ruleOptions ?? 'error'
        }
      }
    ]
  });

  const [result] = await eslint.lintText(source, { filePath: 'names.ts' });
  return result.messages.filter((message) => message.ruleId === 'junolint/prefer-sentence-names');
}

function namesOf(messages) {
  return messages.map((message) => message.message.match(/"([^"]+)"/)[1]);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && 'junolint/prefer-sentence-names' in block.rules);
  assert.ok(tsBlock, 'recommended config should include prefer-sentence-names');
  assert.equal(
    tsBlock.rules['junolint/prefer-sentence-names'],
    'off',
    'prefer-sentence-names should be off by default'
  );
  assert.ok(
    plugin.rules['prefer-sentence-names'],
    'plugin should export prefer-sentence-names'
  );

  const singleWord = await lintTs([
    'const user = 1;',
    'const data = 2;',
    'const configuration = 3;',
    'const theLoadedConfiguration = 4;',
    'const userName = 5;',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(singleWord),
    ['user', 'data', 'configuration'],
    'short and long single words should fail; sentences should pass'
  );

  const allowedShort = await lintTs(
    [
      'const id = 1;',
      'const user = 2;',
      'const configuration = 3;',
      'const theUserResult = 4;',
      ''
    ].join('\n'),
    ['error', { minLength: 8 }]
  );

  assert.deepEqual(
    namesOf(allowedShort),
    ['configuration'],
    'minLength allows short names and still flags a long single word'
  );

  const customMin = await lintTs(
    [
      'const id = 1;',
      'const user = 2;',
      'const result = 3;',
      'const theUserResult = 4;',
      ''
    ].join('\n'),
    ['error', { minLength: 4 }]
  );

  assert.deepEqual(
    namesOf(customMin),
    ['user', 'result'],
    'minLength should control which short names are allowed'
  );

  const snakeAndAcronyms = await lintTs([
    'const MAX_LENGTH = 1;',
    'const CONFIGURATION = 2;',
    'const XMLHttpRequestAlias = 3;',
    'const _privateField = 4;',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(snakeAndAcronyms),
    ['CONFIGURATION'],
    'snake_case and camelCase sentences should pass; a long single word should fail'
  );

  const exceptions = await lintTs(
    'const configuration = 1;\nconst timestamp = 2;\n',
    ['error', { exceptions: ['timestamp'] }]
  );

  assert.deepEqual(namesOf(exceptions), ['configuration']);

  const paramsAndFields = await lintTs([
    'export class Example {',
    '  configuration = 1;',
    '  theCurrentUser = 2;',
    '  save(callback: string, theRequestBody: string) {}',
    '}',
    'const runTheHandler = (repository: () => void) => repository();',
    'try { throw 1; } catch (exception) {}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(paramsAndFields).sort(),
    ['callback', 'configuration', 'exception', 'repository'].sort(),
    'parameters, catch bindings, and class fields should be checked'
  );

  const destructure = await lintTs([
    'const { configuration, theUserName } = obj;',
    'const [firstItem, remainder] = list;',
    'function take({ configuration: renamedValue, leftoverName }: any, ...restArgs: any[]) {}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(destructure).sort(),
    ['configuration', 'remainder'].sort(),
    'destructured bindings should use the local name'
  );

  const unused = await lintTs('const _ = 1;\nconst configuration = 2;\n');
  assert.deepEqual(namesOf(unused), ['configuration']);

  const methodsIgnored = await lintTs([
    'function configuration() {}',
    'export class Example {',
    '  configuration() {}',
    '}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(methodsIgnored),
    [],
    'function and method names are not variables'
  );

  console.log('prefer-sentence-names: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
