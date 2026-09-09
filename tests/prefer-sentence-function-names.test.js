'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/prefer-sentence-function-names';

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
          [RULE]: ruleOptions ?? 'error'
        }
      }
    ]
  });

  const [result] = await eslint.lintText(source, { filePath: 'fns.ts' });
  return result.messages.filter((message) => message.ruleId === RULE);
}

function namesOf(messages) {
  return messages.map((message) => message.message.match(/"([^"]+)"/)[1]);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include prefer-sentence-function-names');
  assert.equal(
    tsBlock.rules[RULE],
    'off',
    'prefer-sentence-function-names should be off by default'
  );
  assert.ok(
    plugin.rules['prefer-sentence-function-names'],
    'plugin should export prefer-sentence-function-names'
  );

  const singleWord = await lintTs([
    'function save() {}',
    'function load() {}',
    'function configuration() {}',
    'function saveTheDocument() {}',
    'function loadUser() {}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(singleWord),
    ['save', 'load', 'configuration'],
    'short and long single-word functions should fail; sentences should pass'
  );

  const methods = await lintTs([
    'export class Example {',
    '  save() {}',
    '  loadTheRecord() {}',
    '  private helper() {}',
    '  private readTheCache() {}',
    '  constructor() {}',
    '  ngOnInit() {}',
    '}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(methods).sort(),
    ['helper', 'save'].sort(),
    'class methods should be checked; constructor and sentence names should pass'
  );

  const objectMethods = await lintTs([
    'const api = {',
    '  save() {},',
    '  load: () => {},',
    '  fetchTheUser: function fetchTheUser() {},',
    '  count: 1',
    '};',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(objectMethods).sort(),
    ['load', 'save'].sort(),
    'object methods and function properties should be checked; data properties should not'
  );

  const namedExpression = await lintTs('const run = function save() {};\n');
  assert.deepEqual(namesOf(namedExpression), ['save']);

  const variablesIgnored = await lintTs([
    'const save = 1;',
    'const configuration = 2;',
    'export class Example {',
    '  configuration = 3;',
    '  saveTheDocument = () => {};',
    '}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(variablesIgnored),
    [],
    'variables and class fields are not functions'
  );

  const allowedShort = await lintTs(
    [
      'function id() {}',
      'function save() {}',
      'function configuration() {}',
      'function saveTheDocument() {}',
      ''
    ].join('\n'),
    ['error', { minLength: 8 }]
  );

  assert.deepEqual(
    namesOf(allowedShort),
    ['configuration'],
    'minLength allows short names and still flags a long single word'
  );

  const exceptions = await lintTs(
    'function configuration() {}\nfunction timestamp() {}\n',
    ['error', { exceptions: ['timestamp'] }]
  );

  assert.deepEqual(namesOf(exceptions), ['configuration']);

  const snakeAndAcronyms = await lintTs([
    'function MAX_LENGTH() {}',
    'function CONFIGURATION() {}',
    'function XMLHttpRequestAlias() {}',
    ''
  ].join('\n'));

  assert.deepEqual(
    namesOf(snakeAndAcronyms),
    ['CONFIGURATION'],
    'snake_case and camelCase sentences should pass; a long single word should fail'
  );

  const signatures = await lintTs([
    'interface Repository {',
    '  save(): void;',
    '  loadTheRecord(): void;',
    '}',
    ''
  ].join('\n'));

  assert.deepEqual(namesOf(signatures), ['save']);

  console.log('prefer-sentence-function-names: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
