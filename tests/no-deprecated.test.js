'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/no-deprecated';

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

  const [result] = await eslint.lintText(source, { filePath: 'deprecated.ts' });
  return result.messages.filter((message) => message.ruleId === RULE);
}

function source(lines) {
  return `${lines.join('\n')}\n`;
}

function namesOf(messages) {
  return messages.map((message) => {
    const named = message.message.match(/^(\S+)/);

    return named ? named[1] : '';
  });
}

async function assertValid(title, code, ruleOptions) {
  const messages = await lintTs(code, ruleOptions);

  assert.equal(
    messages.length,
    0,
    `${title} should be valid, got: ${messages.map((message) => message.message).join('; ')}`
  );
}

async function assertInvalid(title, code, expectedNames, ruleOptions) {
  const messages = await lintTs(code, ruleOptions);
  const expected = Array.isArray(expectedNames) ? expectedNames : [expectedNames];

  assert.ok(messages.length > 0, `${title} should be reported`);
  assert.deepEqual(namesOf(messages), expected, title);

  return messages;
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include no-deprecated');
  assert.equal(tsBlock.rules[RULE], 'error', 'no-deprecated should be error by default');
  assert.ok(plugin.rules['no-deprecated'], 'plugin should export no-deprecated');

  await assertValid(
    'unused deprecated function',
    source([
      '/** @deprecated */',
      'function saveLegacy() {}'
    ])
  );

  await assertInvalid(
    'call deprecated function',
    source([
      '/** @deprecated */',
      'function saveLegacy() {}',
      'saveLegacy();'
    ]),
    'saveLegacy'
  );

  await assertValid(
    'call current function',
    source([
      'function saveDocument() {}',
      'saveDocument();'
    ])
  );

  const withReason = await assertInvalid(
    'includes deprecation reason',
    source([
      '/** @deprecated Use saveDocument instead */',
      'function saveLegacy() {}',
      'saveLegacy();'
    ]),
    'saveLegacy'
  );

  assert.match(
    withReason[0].message,
    /Use saveDocument instead/,
    'message should include the JSDoc reason'
  );

  const withNextTag = await assertInvalid(
    'stops reason at the next tag',
    source([
      '/**',
      ' * @deprecated Use saveDocument instead',
      ' * @see saveDocument',
      ' */',
      'function saveLegacy() {}',
      'saveLegacy();'
    ]),
    'saveLegacy'
  );

  assert.doesNotMatch(
    withNextTag[0].message,
    /@see/,
    'reason should not include the next JSDoc tag'
  );

  await assertInvalid(
    'export comment on function',
    source([
      '/** @deprecated */',
      'export function saveLegacy() {}',
      'saveLegacy();'
    ]),
    'saveLegacy'
  );

  await assertInvalid(
    're-export of deprecated binding',
    source([
      '/** @deprecated */',
      'function saveLegacy() {}',
      'export { saveLegacy };'
    ]),
    'saveLegacy'
  );

  await assertInvalid(
    'deprecated const',
    source([
      '/** @deprecated */',
      'const legacyLimit = 1;',
      'const next = legacyLimit + 1;'
    ]),
    'legacyLimit'
  );

  await assertInvalid(
    'deprecated class construct',
    source([
      '/** @deprecated */',
      'class LegacyClient {}',
      'const client = new LegacyClient();'
    ]),
    'LegacyClient'
  );

  await assertValid(
    'unused deprecated class',
    source([
      '/** @deprecated */',
      'class LegacyClient {}'
    ])
  );

  await assertInvalid(
    'deprecated constructor',
    source([
      'class LegacyClient {',
      '  /** @deprecated */',
      '  constructor() {}',
      '}',
      'const client = new LegacyClient();'
    ]),
    'LegacyClient'
  );

  await assertInvalid(
    'this deprecated method',
    source([
      'class Example {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '  run() {',
      '    this.oldMethod();',
      '  }',
      '}'
    ]),
    'oldMethod'
  );

  await assertValid(
    'this current method',
    source([
      'class Example {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '  currentMethod() {}',
      '  run() {',
      '    this.currentMethod();',
      '  }',
      '}'
    ])
  );

  await assertInvalid(
    'inherited this method',
    source([
      'class Base {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '}',
      'class Child extends Base {',
      '  run() {',
      '    this.oldMethod();',
      '  }',
      '}'
    ]),
    'oldMethod'
  );

  await assertInvalid(
    'super deprecated method',
    source([
      'class Base {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '}',
      'class Child extends Base {',
      '  run() {',
      '    super.oldMethod();',
      '  }',
      '}'
    ]),
    'oldMethod'
  );

  await assertInvalid(
    'super deprecated constructor',
    source([
      'class Base {',
      '  /** @deprecated */',
      '  constructor() {}',
      '}',
      'class Child extends Base {',
      '  constructor() {',
      '    super();',
      '  }',
      '}'
    ]),
    'super'
  );

  await assertInvalid(
    'static deprecated method',
    source([
      'class Example {',
      '  /** @deprecated */',
      '  static oldMethod() {}',
      '}',
      'Example.oldMethod();'
    ]),
    'oldMethod'
  );

  await assertInvalid(
    'instance from new',
    source([
      'class Example {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '}',
      'const example = new Example();',
      'example.oldMethod();'
    ]),
    'oldMethod'
  );

  await assertInvalid(
    'deprecated field',
    source([
      'class Example {',
      '  /** @deprecated */',
      '  oldValue = 1;',
      '  read() {',
      '    return this.oldValue;',
      '  }',
      '}'
    ]),
    'oldValue'
  );

  await assertInvalid(
    'deprecated parameter property',
    source([
      'class Example {',
      '  constructor(',
      '    /** @deprecated */',
      '    private oldValue: string',
      '  ) {}',
      '  read() {',
      '    return this.oldValue;',
      '  }',
      '}'
    ]),
    'oldValue'
  );

  await assertInvalid(
    'computed this member',
    source([
      'class Example {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '  run() {',
      '    this[\'oldMethod\']();',
      '  }',
      '}'
    ]),
    'oldMethod'
  );

  await assertInvalid(
    'optional this member',
    source([
      'class Example {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '  run() {',
      '    this.oldMethod?.();',
      '  }',
      '}'
    ]),
    'oldMethod'
  );

  await assertInvalid(
    'deprecated type alias',
    source([
      '/** @deprecated */',
      'type LegacyId = string;',
      'const value: LegacyId = \'1\';'
    ]),
    'LegacyId'
  );

  await assertValid(
    'unused deprecated type',
    source([
      '/** @deprecated */',
      'type LegacyId = string;'
    ])
  );

  await assertInvalid(
    'deprecated interface',
    source([
      '/** @deprecated */',
      'interface LegacyUser {',
      '  name: string;',
      '}',
      'function take(user: LegacyUser) {',
      '  return user;',
      '}'
    ]),
    'LegacyUser'
  );

  await assertInvalid(
    'deprecated enum',
    source([
      '/** @deprecated */',
      'enum LegacyStatus {',
      '  Open',
      '}',
      'const status = LegacyStatus.Open;'
    ]),
    'LegacyStatus'
  );

  await assertInvalid(
    'deprecated enum member',
    source([
      'enum Status {',
      '  /** @deprecated */',
      '  Open,',
      '  Closed',
      '}',
      'const status = Status.Open;'
    ]),
    'Open'
  );

  await assertValid(
    'current enum member',
    source([
      'enum Status {',
      '  /** @deprecated */',
      '  Open,',
      '  Closed',
      '}',
      'const status = Status.Closed;'
    ])
  );

  await assertInvalid(
    'deprecated parameter',
    source([
      'function take(',
      '  /** @deprecated */',
      '  oldName: string',
      ') {',
      '  return oldName;',
      '}'
    ]),
    'oldName'
  );

  await assertValid(
    'line comment is not a deprecation tag',
    source([
      '// @deprecated',
      'function saveLegacy() {}',
      'saveLegacy();'
    ])
  );

  await assertValid(
    'allow listed name',
    source([
      '/** @deprecated */',
      'function legacyAdapter() {}',
      'legacyAdapter();'
    ]),
    ['error', { allow: ['legacyAdapter'] }]
  );

  await assertInvalid(
    'allow does not skip other names',
    source([
      '/** @deprecated */',
      'function saveLegacy() {}',
      'saveLegacy();'
    ]),
    'saveLegacy',
    ['error', { allow: ['legacyAdapter'] }]
  );

  await assertValid(
    'same name in another class',
    source([
      'class First {',
      '  /** @deprecated */',
      '  oldMethod() {}',
      '}',
      'class Second {',
      '  oldMethod() {}',
      '  run() {',
      '    this.oldMethod();',
      '  }',
      '}'
    ])
  );

  await assertInvalid(
    'jsdoc above decorator',
    source([
      '/** @deprecated */',
      '@Component({ selector: \'app-legacy\' })',
      'class LegacyCard {}',
      'const card = new LegacyCard();'
    ]),
    'LegacyCard'
  );

  console.log('no-deprecated: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
