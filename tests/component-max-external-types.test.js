'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/component-max-external-types';

async function lintTs(source, ruleOptions, filePath = 'user-card.component.ts') {
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

  const [result] = await eslint.lintText(source, { filePath });
  return result.messages.filter((message) => message.ruleId === RULE);
}

function source(lines) {
  return `${lines.join('\n')}\n`;
}

function componentFile(...prelude) {
  return source([
    "import { Component } from '@angular/core';",
    '',
    ...prelude,
    prelude.length ? '' : null,
    '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
    'export class UserCardComponent {}'
  ].filter((line) => line !== null));
}

function namesOf(messages) {
  return messages.map((message) => {
    const named = message.message.match(/"([^"]+)"/);
    return named ? named[1] : '';
  });
}

async function assertValid(title, code, ruleOptions, filePath) {
  const messages = await lintTs(code, ruleOptions, filePath);
  assert.equal(
    messages.length,
    0,
    `${title} should be valid, got: ${messages.map((message) => message.message).join('; ')}`
  );
}

async function assertInvalid(title, code, expectedNames, ruleOptions, filePath) {
  const messages = await lintTs(code, ruleOptions, filePath);
  assert.ok(messages.length > 0, `${title} should be reported`);
  assert.ok(
    messages.every((message) => message.messageId === 'tooMany'),
    `${title} should use tooMany`
  );
  assert.deepEqual(namesOf(messages), expectedNames, title);
  return messages;
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include component-max-external-types');
  assert.equal(
    tsBlock.rules[RULE],
    'warn',
    'component-max-external-types should be warn by default'
  );
  assert.ok(
    plugin.rules['component-max-external-types'],
    'plugin should export component-max-external-types'
  );

  await assertValid('no extra types', componentFile());

  await assertValid(
    'one interface',
    componentFile(
      'interface UserRow {',
      '  name: string;',
      '}'
    )
  );

  await assertValid(
    'two types',
    componentFile(
      'interface UserRow {',
      '  name: string;',
      '}',
      '',
      "type Mode = 'edit' | 'view';"
    )
  );

  await assertValid(
    'exported pair',
    componentFile(
      'export interface UserRow {',
      '  name: string;',
      '}',
      '',
      'export type Mode = boolean;'
    )
  );

  await assertInvalid(
    'three interfaces',
    componentFile(
      'interface Alpha { x: number; }',
      'interface Beta { y: number; }',
      'interface Gamma { z: number; }'
    ),
    ['Gamma']
  );

  await assertInvalid(
    'interface, type, and enum',
    componentFile(
      'interface UserRow { name: string; }',
      "type Mode = 'edit' | 'view';",
      'enum Status { Active, Idle }'
    ),
    ['Status']
  );

  const extras = await assertInvalid(
    'five types report each extra',
    componentFile(
      'interface One { a: number; }',
      'interface Two { b: number; }',
      'interface Three { c: number; }',
      'type Four = string;',
      'enum Five { A }'
    ),
    ['Three', 'Four', 'Five']
  );
  assert.match(extras[0].message, /5 types/);
  assert.match(extras[0].message, /max 2/);

  await assertValid(
    'types after the class still allow two',
    source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
      'export class UserCardComponent {}',
      '',
      'interface UserRow { name: string; }',
      "type Mode = 'edit' | 'view';"
    ])
  );

  await assertInvalid(
    'types after the class still count',
    source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
      'export class UserCardComponent {}',
      '',
      'interface UserRow { name: string; }',
      "type Mode = 'edit' | 'view';",
      'enum Status { Active }'
    ]),
    ['Status']
  );

  await assertValid(
    'non-component file may keep many types',
    source([
      "import { Injectable } from '@angular/core';",
      '',
      'interface Alpha { x: number; }',
      'interface Beta { y: number; }',
      'interface Gamma { z: number; }',
      'type Mode = string;',
      'enum Status { Active }',
      '',
      '@Injectable({ providedIn: \'root\' })',
      'export class UserService {}'
    ]),
    'error',
    'user.service.ts'
  );

  await assertValid(
    'file without @Component is skipped',
    source([
      'interface Alpha { x: number; }',
      'interface Beta { y: number; }',
      'interface Gamma { z: number; }',
      'export class UserCardComponent {}'
    ])
  );

  await assertValid(
    'local types inside a helper do not count',
    componentFile(
      'interface UserRow { name: string; }',
      "type Mode = 'edit' | 'view';",
      '',
      'function helper(): void {',
      '  type Local = string;',
      '  interface Nested { value: Local; }',
      '}'
    )
  );

  await assertValid(
    'import type and type re-exports do not count',
    source([
      "import { Component } from '@angular/core';",
      "import type { User } from './user';",
      'export type { User };',
      '',
      'interface UserRow { name: string; }',
      "type Mode = 'edit' | 'view';",
      '',
      '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
      'export class UserCardComponent {}'
    ])
  );

  await assertValid(
    'helper class next to two types is fine',
    componentFile(
      'interface UserRow { name: string; }',
      "type Mode = 'edit' | 'view';",
      '',
      'class Helper {}'
    )
  );

  await assertValid(
    'spec files are skipped',
    componentFile(
      'interface Alpha { x: number; }',
      'interface Beta { y: number; }',
      'interface Gamma { z: number; }'
    ),
    'error',
    'user-card.component.spec.ts'
  );

  await assertValid(
    'max option allows more types',
    componentFile(
      'interface Alpha { x: number; }',
      'interface Beta { y: number; }',
      'interface Gamma { z: number; }'
    ),
    ['error', { max: 3 }]
  );

  await assertInvalid(
    'max option still flags extras',
    componentFile(
      'interface Alpha { x: number; }',
      'interface Beta { y: number; }',
      'interface Gamma { z: number; }'
    ),
    ['Alpha', 'Beta', 'Gamma'],
    ['error', { max: 0 }]
  );

  await assertInvalid(
    'default export interface still counts',
    source([
      "import { Component } from '@angular/core';",
      '',
      'export default interface UserRow { name: string; }',
      'interface Extra { value: number; }',
      'type Mode = boolean;',
      '',
      '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
      'export class UserCardComponent {}'
    ]),
    ['Mode']
  );

  console.log('component-max-external-types: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
