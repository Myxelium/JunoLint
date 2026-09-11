'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/no-magic-numbers';

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

  const [result] = await eslint.lintText(source, { filePath: 'numbers.ts' });
  return result.messages.filter((message) => message.ruleId === RULE);
}

function source(lines) {
  return `${lines.join('\n')}\n`;
}

function reportedRaw(messages) {
  return messages.map((message) => message.message.match(/^(\S+)/)[1]);
}

async function assertValid(title, code, ruleOptions) {
  const messages = await lintTs(code, ruleOptions);
  assert.equal(
    messages.length,
    0,
    `${title} should be valid, got: ${messages.map((message) => message.message).join('; ')}`
  );
}

async function assertInvalid(title, code, expectedRaw, ruleOptions) {
  const messages = await lintTs(code, ruleOptions);
  const actual = reportedRaw(messages);
  const expected = Array.isArray(expectedRaw) ? expectedRaw : [expectedRaw];

  assert.deepEqual(actual, expected, title);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include no-magic-numbers');
  assert.equal(tsBlock.rules[RULE], 'error', 'no-magic-numbers should be error by default');
  assert.ok(plugin.rules['no-magic-numbers'], 'plugin should export no-magic-numbers');

  await assertValid('zero', 'const total = count + 0;\n');
  await assertValid('one', 'const next = index + 1;\n');
  await assertValid('minus one', 'const last = items[items.length - 1];\n');
  await assertValid('two', 'const pair = value * 2;\n');
  await assertValid('ten', 'const tenths = parseInt(text, 10);\n');
  await assertValid('one hundred', 'const percent = ratio * 100;\n');
  await assertValid('one thousand', 'const seconds = milliseconds / 1000;\n');
  await assertValid('ten thousand', 'const scaled = value * 10000;\n');
  await assertValid('negative thousand', 'const total = value + -1000;\n');
  await assertValid('scientific thousand', 'const seconds = milliseconds / 1e3;\n');
  await assertValid('underscored thousand', 'const seconds = milliseconds / 1_000;\n');
  await assertValid('composed timeout', 'setTimeout(handler, 2 * 1000);\n');
  await assertValid('bigint thousand', 'const seconds = milliseconds / 1000n;\n');

  await assertInvalid('three', 'const next = index + 3;\n', '3');
  await assertInvalid('seven', 'for (let index = 0; index < 7; index += 1) {}\n', '7');
  await assertInvalid('timeout', 'setTimeout(handler, 2000);\n', '2000');
  await assertInvalid('http status', 'if (status === 404) {}\n', '404');
  await assertInvalid('negative status', 'const total = value + -404;\n', '-404');
  await assertInvalid('array values', 'const codes = [200, 404];\n', ['200', '404']);

  await assertValid('named const', 'const retryLimit = 5;\n');
  await assertValid('named let', 'let retryLimit = 5;\n');
  await assertValid('named const as const', 'const retryLimit = 5 as const;\n');
  await assertValid('object property', 'const options = { timeout: 300 };\n');
  await assertValid('class field', 'class Example { retryLimit = 5; }\n');
  await assertValid('default param', 'function wait(timeout = 300) {}\n');
  await assertValid('destructure default', 'const { timeout = 300 } = options;\n');
  await assertValid('enum member', 'enum Status { NotFound = 404 }\n');
  await assertValid('type literal', 'type NotFound = 404;\n');
  await assertValid('union type', 'type Status = 200 | 404;\n');
  await assertValid('array index', 'const first = items[3];\n');
  await assertValid('property assignment', 'response.status = 404;\n');

  await assertInvalid('bare assignment', 'status = 404;\n', '404');
  await assertInvalid('return status', 'function fail() { return 500; }\n', '500');
  await assertInvalid('switch case', source([
    'switch (status) {',
    '  case 404:',
    '    break;',
    '}'
  ]), '404');

  await assertValid('extra allowed', 'if (status === 404) {}\n', ['error', { allowed: [404] }]);
  await assertInvalid(
    'extra allowed does not drop defaults',
    'setTimeout(handler, 250);\n',
    '250',
    ['error', { allowed: [404] }]
  );

  const commonStillAllowed = await lintTs('const percent = ratio * 100;\n', ['error', { allowed: [404] }]);
  assert.equal(commonStillAllowed.length, 0, 'allowed extras should keep 100');

  console.log('no-magic-numbers: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
