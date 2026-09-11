'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { ESLint } = require('eslint');
const recommended = require('../index');

function tsRules() {
  const block = recommended.find((entry) => entry.rules && '@stylistic/quotes' in entry.rules);
  assert.ok(block, 'recommended TypeScript block should enable @stylistic/quotes');
  return block;
}

async function main() {
  const loaded = spawnSync(process.execPath, ['-e', "require('./index.js')"], {
    cwd: require('node:path').join(__dirname, '..'),
    encoding: 'utf8'
  });

  assert.equal(loaded.status, 0, loaded.stderr);
  assert.doesNotMatch(
    loaded.stderr,
    /@stylistic\/eslint-plugin-(js|ts)/,
    'loading junolint should not warn about the split stylistic packages'
  );

  const block = tsRules();
  assert.ok(block.plugins['@stylistic'], 'unified @stylistic plugin should be registered');
  assert.equal(
    block.plugins['@stylistic/js'],
    block.plugins['@stylistic'],
    'legacy @stylistic/js plugin id should alias the unified plugin'
  );
  assert.equal(
    block.plugins['@stylistic/ts'],
    block.plugins['@stylistic'],
    'legacy @stylistic/ts plugin id should alias the unified plugin'
  );

  for (const id of ['@stylistic/ts/quotes', '@stylistic/js/semi'])
    assert.ok(!(id in block.rules), `${id} should not be the canonical rule id`);

  assert.equal(block.rules['eol-last'], 0, 'core eol-last should be off via disable-legacy');
  assert.equal(block.rules['max-len'], 0, 'core max-len should be off via disable-legacy');
  assert.ok(Array.isArray(block.rules['@stylistic/max-len']));

  assert.equal(block.rules['@typescript-eslint/no-empty-interface'], undefined);
  assert.equal(block.rules['@typescript-eslint/no-var-requires'], undefined);

  const typescript = require('../index').configs.typescript;
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [...typescript]
  });

  const [result] = await eslint.lintText("export const name = \"value\";\n", { filePath: 'style.ts' });
  const quotes = result.messages.filter((message) => message.ruleId === '@stylistic/quotes');
  assert.ok(quotes.length > 0, 'double quotes should be reported by @stylistic/quotes');

  console.log('stylistic-migration: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
