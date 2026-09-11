'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');

const RULE = 'junolint/member-ordering';

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
          [RULE]: 'error'
        }
      }
    ],
    fix
  });

  const [result] = await eslint.lintText(source, { filePath: 'cmp.ts' });
  return result;
}

function source(lines) {
  return `${lines.join('\n')}\n`;
}

function reports(result) {
  return result.messages.filter((message) => message.ruleId === RULE);
}

async function assertValid(title, code) {
  const result = await lintTs(code, false);

  assert.equal(
    reports(result).length,
    0,
    `${title} should be valid, got: ${reports(result).map((message) => message.message).join('; ')}`
  );
}

async function assertFixed(title, input, expected) {
  const reported = await lintTs(input, false);
  assert.ok(reports(reported).length > 0, `${title}: should report`);

  const fixed = await lintTs(input, true);
  const output = fixed.output ?? input;

  assert.equal(output, expected, title);
}

async function main() {
  const injectSafe = source([
    'export class Example {',
    '  private readonly http = inject(HttpClient);',
    '  public readonly router = inject(Router);',
    '  private helper() {}',
    '  save() {}',
    '}'
  ]);

  const injectReported = await lintTs(injectSafe, false);
  assert.equal(reports(injectReported).length, 1, 'methods before public/private grouping should report');

  const injectFixed = await lintTs(injectSafe, true);
  const injectOutput = injectFixed.output ?? injectSafe;

  assert.match(
    injectOutput,
    /private readonly http = inject\(HttpClient\);\n  public readonly router = inject\(Router\);/
  );
  assert.match(injectOutput, /save\(\) \{\}\n\n  private helper\(\) \{\}/);
  assert.ok(
    injectOutput.indexOf('http = inject') < injectOutput.indexOf('router = inject'),
    'inject() fields must keep source order'
  );

  await assertFixed(
    'methods before fields move after fields',
    source([
      'export class Example {',
      '  save() {}',
      '  private readonly http = inject(HttpClient);',
      '  private readonly store = inject(Store);',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly http = inject(HttpClient);',
      '  private readonly store = inject(Store);',
      '',
      '  save() {}',
      '}'
    ])
  );

  await assertValid(
    'constructor, ngOnInit, methods, ngOnDestroy',
    source([
      'export class Example {',
      '  private readonly http = inject(HttpClient);',
      '  constructor() {}',
      '  ngOnInit() {}',
      '  save() {}',
      '  private helper() {}',
      '  ngOnDestroy() {}',
      '}'
    ])
  );

  await assertFixed(
    'constructor first among methods, ngOnInit under it, ngOnDestroy last',
    source([
      'export class Example {',
      '  private readonly http = inject(HttpClient);',
      '  save() {}',
      '  ngOnDestroy() {}',
      '  ngOnInit() {}',
      '  constructor() {}',
      '  private helper() {}',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly http = inject(HttpClient);',
      '',
      '  constructor() {}',
      '',
      '  ngOnInit() {}',
      '',
      '  save() {}',
      '',
      '  private helper() {}',
      '',
      '  ngOnDestroy() {}',
      '}'
    ])
  );

  await assertFixed(
    'ngOnInit sits directly under constructor, ahead of other lifecycle hooks',
    source([
      'export class Example {',
      '  constructor() {}',
      '  ngOnChanges() {}',
      '  ngOnInit() {}',
      '  save() {}',
      '  ngOnDestroy() {}',
      '}'
    ]),
    source([
      'export class Example {',
      '  constructor() {}',
      '',
      '  ngOnInit() {}',
      '',
      '  ngOnChanges() {}',
      '',
      '  save() {}',
      '',
      '  ngOnDestroy() {}',
      '}'
    ])
  );

  await assertValid(
    'lifecycle-as-field stays with fields so later fields can keep using it',
    source([
      'export class Example {',
      '  ngOnInit = this.start;',
      '  start = () => {};',
      '  constructor() {}',
      '  save() {}',
      '  ngOnDestroy() {}',
      '}'
    ])
  );

  await assertValid(
    'dependent field order is left alone',
    source([
      'export class Example {',
      '  private readonly first = 1;',
      '  private readonly second = this.first;',
      '  constructor() {}',
      '  ngOnInit() {}',
      '}'
    ])
  );

  await assertFixed(
    'constructor between dependent fields is pulled out without reordering those fields',
    source([
      'export class Example {',
      '  private readonly first = 1;',
      '  constructor() {}',
      '  private readonly second = this.first;',
      '  ngOnInit() {}',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly first = 1;',
      '',
      '  private readonly second = this.first;',
      '',
      '  constructor() {}',
      '',
      '  ngOnInit() {}',
      '}'
    ])
  );

  await assertValid(
    'arrow ngOnDestroy field is not moved below a field that uses it',
    source([
      'export class Example {',
      '  ngOnDestroy = () => {};',
      '  private readonly cleanup = this.ngOnDestroy;',
      '  constructor() {}',
      '  ngOnInit() {}',
      '  save() {}',
      '}'
    ])
  );

  console.log('member-ordering: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
