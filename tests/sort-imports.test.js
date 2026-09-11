'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/sort-imports';

async function lintTs(code, fix) {
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

  const [result] = await eslint.lintText(code, { filePath: 'imports.ts' });
  return result;
}

function source(lines) {
  return `${lines.join('\n')}\n`;
}

function messagesOf(result) {
  return result.messages.filter((message) => message.ruleId === RULE);
}

async function assertValid(title, code) {
  const result = await lintTs(code, false);

  assert.equal(
    messagesOf(result).length,
    0,
    `${title} should be valid, got: ${messagesOf(result).map((message) => message.message).join('; ')}`
  );
}

async function assertFixed(title, input, expected) {
  const reported = await lintTs(input, false);
  assert.ok(messagesOf(reported).length > 0, `${title}: should report`);
  assert.ok(
    messagesOf(reported).some((message) => message.fix),
    `${title}: should offer a fix`
  );

  const fixed = await lintTs(input, true);
  assert.equal(fixed.output ?? input, expected, title);
  await assertValid(`${title}: after fix`, expected);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include sort-imports');
  assert.equal(tsBlock.rules[RULE], 'error', 'sort-imports should be error by default');
  assert.ok(plugin.rules['sort-imports'], 'plugin should export sort-imports');
  assert.equal(
    plugin.rules['sort-imports'].meta.fixable,
    'code',
    'rule should be marked fixable'
  );

  await assertValid(
    'already sorted packages then relative',
    source([
      "import { CommonModule } from '@angular/common';",
      "import { Component, Input } from '@angular/core';",
      "import { Router } from '@angular/router';",
      '',
      "import { UserService } from '../user.service';",
      "import { UserCardComponent } from './user-card.component';",
      '',
      'export class Example {}'
    ])
  );

  await assertFixed(
    'sorts package imports alphabetically',
    source([
      "import { Router } from '@angular/router';",
      "import { Component } from '@angular/core';",
      "import { CommonModule } from '@angular/common';"
    ]),
    source([
      "import { CommonModule } from '@angular/common';",
      "import { Component } from '@angular/core';",
      "import { Router } from '@angular/router';"
    ])
  );

  await assertFixed(
    'packages before relative even when relative would sort first',
    source([
      "import { UserService } from './user.service';",
      "import { Component } from '@angular/core';"
    ]),
    source([
      "import { Component } from '@angular/core';",
      '',
      "import { UserService } from './user.service';"
    ])
  );

  await assertFixed(
    'parent relative before sibling',
    source([
      "import { Child } from './child';",
      "import { Parent } from '../parent';"
    ]),
    source([
      "import { Parent } from '../parent';",
      "import { Child } from './child';"
    ])
  );

  await assertFixed(
    'sorts named specifiers alphabetically',
    source([
      "import { Input, Component } from '@angular/core';"
    ]),
    source([
      "import { Component, Input } from '@angular/core';"
    ])
  );

  await assertFixed(
    'sorts named specifiers after a default import',
    source([
      "import Router, { Routes, provideRouter } from '@angular/router';"
    ]),
    source([
      "import Router, { provideRouter, Routes } from '@angular/router';"
    ])
  );

  await assertFixed(
    'sorts multiline named specifiers in place',
    source([
      'import {',
      '  Input,',
      '  Component,',
      '  inject',
      "} from '@angular/core';"
    ]),
    source([
      'import {',
      '  Component,',
      '  inject,',
      '  Input',
      "} from '@angular/core';"
    ])
  );

  await assertFixed(
    'case-insensitive specifier sort with case as a tiebreaker',
    source([
      "import { zeta, Alpha, alpha } from './names';"
    ]),
    source([
      "import { Alpha, alpha, zeta } from './names';"
    ])
  );

  await assertFixed(
    'value import before import type from the same module',
    source([
      "import type { User } from './user';",
      "import { loadUser } from './user';"
    ]),
    source([
      "import { loadUser } from './user';",
      "import type { User } from './user';"
    ])
  );

  await assertFixed(
    'sorts type specifiers among value specifiers',
    source([
      "import { type User, loadUser, type Profile } from './user';"
    ]),
    source([
      "import { loadUser, type Profile, type User } from './user';"
    ])
  );

  await assertFixed(
    'drops extra blank lines inside a package group',
    source([
      "import { CommonModule } from '@angular/common';",
      '',
      "import { Component } from '@angular/core';"
    ]),
    source([
      "import { CommonModule } from '@angular/common';",
      "import { Component } from '@angular/core';"
    ])
  );

  await assertFixed(
    'side-effect imports stay put and split the sort groups',
    source([
      "import { Router } from '@angular/router';",
      "import { Component } from '@angular/core';",
      "import './polyfills';",
      "import { UserService } from './user.service';",
      "import { Theme } from '../theme';"
    ]),
    source([
      "import { Component } from '@angular/core';",
      "import { Router } from '@angular/router';",
      '',
      "import './polyfills';",
      '',
      "import { Theme } from '../theme';",
      "import { UserService } from './user.service';"
    ])
  );

  await assertFixed(
    'packed side-effect imports stay packed at the top',
    source([
      "import 'zone.js';",
      "import './polyfills';",
      "import { Component } from '@angular/core';"
    ]),
    source([
      "import 'zone.js';",
      "import './polyfills';",
      '',
      "import { Component } from '@angular/core';"
    ])
  );

  await assertFixed(
    'comments move with their import',
    source([
      "import { Router } from '@angular/router';",
      '// core runtime',
      "import { Component } from '@angular/core';"
    ]),
    source([
      '// core runtime',
      "import { Component } from '@angular/core';",
      "import { Router } from '@angular/router';"
    ])
  );

  await assertValid(
    'file header comment stays when a blank line separates it',
    source([
      '/** Copyright */',
      '',
      "import { CommonModule } from '@angular/common';",
      "import { Component } from '@angular/core';"
    ])
  );

  await assertFixed(
    'sorts only the import run above other code',
    source([
      "import { Router } from '@angular/router';",
      "import { Component } from '@angular/core';",
      '',
      'export class Example {}',
      '',
      "import { leftover } from './leftover';"
    ]),
    source([
      "import { Component } from '@angular/core';",
      "import { Router } from '@angular/router';",
      '',
      'export class Example {}',
      '',
      "import { leftover } from './leftover';"
    ])
  );

  await assertValid(
    'single import with one specifier',
    source([
      "import { Component } from '@angular/core';"
    ])
  );

  console.log('sort-imports: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
