'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/explicit-function-return-type';

async function lintTs(source, ruleOptions, fix) {
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
    ],
    fix
  });

  const [result] = await eslint.lintText(source, { filePath: 'fns.ts' });
  return result;
}

function source(lines) {
  return `${lines.join('\n')}\n`;
}

function messagesOf(result) {
  return result.messages.filter((message) => message.ruleId === RULE);
}

function namesOf(messages) {
  return messages.map((message) => {
    const named = message.message.match(/"([^"]+)"/);

    return named ? named[1] : '(anonymous)';
  });
}

async function assertValid(title, code, ruleOptions) {
  const result = await lintTs(code, ruleOptions, false);

  assert.equal(
    messagesOf(result).length,
    0,
    `${title} should be valid, got: ${messagesOf(result).map((message) => message.message).join('; ')}`
  );
}

async function assertInvalid(title, code, expectedNames, ruleOptions) {
  const result = await lintTs(code, ruleOptions, false);
  const messages = messagesOf(result);

  assert.ok(messages.length > 0, `${title} should be reported`);

  if (expectedNames) {
    assert.deepEqual(namesOf(messages), expectedNames, title);
  }

  return result;
}

async function assertFixed(title, input, expected) {
  const reported = await lintTs(input, 'error', false);
  assert.ok(messagesOf(reported).length > 0, `${title}: should report`);
  assert.ok(
    messagesOf(reported).some((message) => message.fix),
    `${title}: should offer a fix`
  );

  const fixed = await lintTs(input, 'error', true);
  assert.equal(fixed.output ?? input, expected, title);
  await assertValid(`${title}: after fix`, expected);
}

async function assertNoFix(title, input) {
  const reported = await lintTs(input, 'error', false);
  assert.ok(messagesOf(reported).length > 0, `${title}: should report`);
  assert.ok(
    messagesOf(reported).every((message) => !message.fix),
    `${title}: should not offer a fix`
  );

  const fixed = await lintTs(input, 'error', true);
  assert.equal(fixed.output, undefined, `${title}: --fix should leave the source alone`);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include explicit-function-return-type');
  assert.equal(
    tsBlock.rules[RULE],
    'error',
    'explicit-function-return-type should be error by default'
  );
  assert.ok(
    plugin.rules['explicit-function-return-type'],
    'plugin should export explicit-function-return-type'
  );
  assert.equal(
    plugin.rules['explicit-function-return-type'].meta.fixable,
    'code',
    'rule should be marked fixable'
  );

  await assertValid(
    'already annotated',
    source([
      'function save(): void {}',
      'const load = (): number => 1;',
      'export class Example {',
      '  read(): string {',
      '    return "";',
      '  }',
      '}'
    ])
  );

  await assertInvalid(
    'missing annotations',
    source([
      'function save() {}',
      'function load(): number { return 1; }',
      'const run = function fetch() { return 1; };',
      ''
    ]),
    ['save', 'fetch']
  );

  await assertFixed(
    'empty function becomes void',
    'function save() {}\n',
    'function save(): void {}\n'
  );

  await assertFixed(
    'async empty function becomes Promise<void>',
    'async function save() {}\n',
    'async function save(): Promise<void> {}\n'
  );

  await assertFixed(
    'throw-only function becomes never',
    source([
      'function fail() {',
      "  throw new Error('no');",
      '}'
    ]),
    source([
      'function fail(): never {',
      "  throw new Error('no');",
      '}'
    ])
  );

  await assertFixed(
    'async throw-only function becomes Promise<never>',
    source([
      'async function fail() {',
      "  throw new Error('no');",
      '}'
    ]),
    source([
      'async function fail(): Promise<never> {',
      "  throw new Error('no');",
      '}'
    ])
  );

  await assertFixed(
    'if/else literal returns of the same type',
    source([
      'function count(flag: boolean) {',
      '  if (flag)',
      '    return 1;',
      '  else',
      '    return 2;',
      '}'
    ]),
    source([
      'function count(flag: boolean): number {',
      '  if (flag)',
      '    return 1;',
      '  else',
      '    return 2;',
      '}'
    ])
  );

  await assertFixed(
    'literal number return',
    source([
      'function count() {',
      '  return 1;',
      '}'
    ]),
    source([
      'function count(): number {',
      '  return 1;',
      '}'
    ])
  );

  await assertFixed(
    'async literal return wraps Promise',
    source([
      'async function count() {',
      '  return 1;',
      '}'
    ]),
    source([
      'async function count(): Promise<number> {',
      '  return 1;',
      '}'
    ])
  );

  await assertFixed(
    'assertion return uses the asserted type',
    source([
      'function load() {',
      '  return getUser() as User;',
      '}'
    ]),
    source([
      'function load(): User {',
      '  return getUser() as User;',
      '}'
    ])
  );

  await assertFixed(
    'expression arrow gets a type and keeps parens',
    'const count = () => 1;\n',
    'const count = (): number => 1;\n'
  );

  await assertFixed(
    'single-param arrow gets parens and a type',
    'const double = value => 1;\n',
    'const double = (value): number => 1;\n'
  );

  await assertFixed(
    'async expression arrow wraps Promise',
    'const count = async () => 1;\n',
    'const count = async (): Promise<number> => 1;\n'
  );

  await assertFixed(
    'class method and lifecycle void',
    source([
      'export class Example {',
      '  ngOnInit() {}',
      '  save() {',
      '    return true;',
      '  }',
      '}'
    ]),
    source([
      'export class Example {',
      '  ngOnInit(): void {}',
      '  save(): boolean {',
      '    return true;',
      '  }',
      '}'
    ])
  );

  await assertValid(
    'constructors and setters are skipped',
    source([
      'export class Example {',
      '  constructor() {}',
      '  set name(value: string) {}',
      '  get name(): string {',
      '    return "";',
      '  }',
      '}'
    ])
  );

  await assertInvalid(
    'getters still need a return type',
    source([
      'export class Example {',
      '  get name() {',
      '    return "";',
      '  }',
      '}'
    ]),
    ['name']
  );

  await assertValid(
    'callbacks passed to calls are skipped',
    source([
      'items.map(item => item.id);',
      'setTimeout(() => {});',
      'new Promise(resolve => resolve(1));',
      'run({',
      '  save() {},',
      '  load: () => 1',
      '});'
    ])
  );

  await assertInvalid(
    'callbacks are checked when opted in',
    'items.map(item => item.id);\n',
    ['(anonymous)'],
    ['error', { checkCallbacks: true }]
  );

  await assertValid(
    'typed bindings are skipped',
    source([
      'const save: Handler = () => {};',
      'export class Example {',
      '  save: Handler = () => {};',
      '}'
    ])
  );

  await assertValid(
    'functions returned from a typed function are skipped',
    source([
      'function create(): Handler {',
      '  return () => {};',
      '}',
      'const make: Handler = () => () => {};'
    ])
  );

  await assertValid(
    'const-assertion arrows are skipped',
    'const flags = () => ({ debug: true } as const);\n'
  );

  await assertInvalid(
    'allowedNames skips the listed functions',
    'function save() {}\nfunction load() {}\n',
    ['load'],
    ['error', { allowedNames: ['save'] }]
  );

  await assertNoFix(
    'unknown expression returns cannot be inferred',
    source([
      'function load() {',
      '  return getUser();',
      '}'
    ])
  );

  await assertNoFix(
    'implicit undefined is not inferred',
    source([
      'function count(flag: boolean) {',
      '  if (flag)',
      '    return 1;',
      '}'
    ])
  );

  await assertNoFix(
    'mixed literal types are not inferred',
    source([
      'function value(flag: boolean) {',
      '  if (flag)',
      '    return 1;',
      '  return "x";',
      '}'
    ])
  );

  await assertNoFix(
    'generators are not inferred',
    'function* values() { yield 1; }\n'
  );

  await assertInvalid(
    'interface signatures need a return type',
    source([
      'interface Repository {',
      '  save();',
      '  load(): User;',
      '  (id: string);',
      '}'
    ]),
    ['save', '(anonymous)']
  );

  await assertValid(
    'object methods that already have types',
    source([
      'const api = {',
      '  save(): void {},',
      '  load: (): number => 1',
      '};'
    ])
  );

  await assertFixed(
    'object methods get types',
    source([
      'const api = {',
      '  save() {},',
      '  load: () => 1',
      '};'
    ]),
    source([
      'const api = {',
      '  save(): void {},',
      '  load: (): number => 1',
      '};'
    ])
  );

  console.log('explicit-function-return-type: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
