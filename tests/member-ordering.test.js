'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');

async function lintTs(source, fix) {
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
          'junolint/member-ordering': 'error'
        }
      }
    ],
    fix
  });

  const [result] = await eslint.lintText(source, { filePath: 'cmp.ts' });
  return result;
}

async function main() {
  const injectSafe = [
    'export class Example {',
    '  private readonly http = inject(HttpClient);',
    '  public readonly router = inject(Router);',
    '  private helper() {}',
    '  save() {}',
    '}',
    ''
  ].join('\n');

  const injectReported = await lintTs(injectSafe, false);
  const injectOrder = injectReported.messages.filter(
    (message) => message.ruleId === 'junolint/member-ordering'
  );

  assert.equal(
    injectOrder.length,
    1,
    'methods before public/private grouping should report'
  );

  const injectFixed = await lintTs(injectSafe, true);
  const injectOutput = injectFixed.output ?? injectSafe;

  assert.match(injectOutput, /private readonly http = inject\(HttpClient\);\s+public readonly router = inject\(Router\);/);
  assert.match(injectOutput, /save\(\) \{\}\s+private helper\(\) \{\}/);
  assert.ok(
    injectOutput.indexOf('http = inject') < injectOutput.indexOf('router = inject'),
    'inject() fields must keep source order'
  );

  const methodBeforeFields = [
    'export class Example {',
    '  save() {}',
    '  private readonly http = inject(HttpClient);',
    '  private readonly store = inject(Store);',
    '}',
    ''
  ].join('\n');

  const moved = await lintTs(methodBeforeFields, true);
  const movedOutput = moved.output ?? methodBeforeFields;

  assert.match(
    movedOutput,
    /private readonly http = inject\(HttpClient\);\s+private readonly store = inject\(Store\);\s+save\(\) \{\}/
  );

  const alreadyOk = [
    'export class Example {',
    '  private readonly http = inject(HttpClient);',
    '  constructor() {}',
    '  ngOnInit() {}',
    '  save() {}',
    '  private helper() {}',
    '}',
    ''
  ].join('\n');

  const ok = await lintTs(alreadyOk, false);
  assert.equal(
    ok.messages.filter((message) => message.ruleId === 'junolint/member-ordering').length,
    0
  );

  console.log('member-ordering: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
