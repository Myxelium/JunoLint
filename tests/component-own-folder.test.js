'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');
const {
  applyOwnFolderFix,
  flushComponentFolderFixes,
  folderNameFromFilename
} = require('../rules/component-own-folder');

const RULE = 'junolint/component-own-folder';

const COMPONENT = [
  "import { Component } from '@angular/core';",
  "import { UserService } from './user.service';",
  '',
  '@Component({',
  "  selector: 'app-user-card',",
  "  templateUrl: './user-card.component.html',",
  "  styleUrl: './user-card.component.scss'",
  '})',
  'export class UserCardComponent {}',
  ''
].join('\n');

const PAGE = [
  "import { Component } from '@angular/core';",
  '',
  '@Component({',
  "  selector: 'app-home',",
  "  templateUrl: './home.page.html'",
  '})',
  'export class HomePage {}',
  ''
].join('\n');

const OTHER = [
  "import { Component } from '@angular/core';",
  '',
  '@Component({ selector: \'app-other\', template: \'<p>Other</p>\' })',
  'export class OtherComponent {}',
  ''
].join('\n');

function source(lines) {
  return `${lines.join('\n')}\n`;
}

const FIXTURE_ROOT = path.join(__dirname, '.tmp-component-own-folder');

function makeFixture(files) {
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  const root = fs.mkdtempSync(path.join(FIXTURE_ROOT, 'case-'));
  const entries = { 'package.json': '{}\n', ...files };
  for (const [rel, content] of Object.entries(entries)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

async function lintPath(filePath) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{ts,js}'],
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
    ]
  });

  const [result] = await eslint.lintFiles([filePath]);
  return result.messages.filter((message) => message.ruleId === RULE);
}

async function lintText(code) {
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
    ]
  });

  const [result] = await eslint.lintText(code, { filePath: 'user-card.component.ts' });
  return result.messages.filter((message) => message.ruleId === RULE);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include component-own-folder');
  assert.equal(tsBlock.rules[RULE], 'error', 'component-own-folder should be error by default');
  assert.ok(plugin.rules['component-own-folder'], 'plugin should export component-own-folder');

  assert.equal(folderNameFromFilename('user-card.component.ts'), 'user-card');
  assert.equal(folderNameFromFilename('home.page.ts'), 'home');
  assert.equal(folderNameFromFilename('login-page.component.ts'), 'login-page');
  assert.equal(folderNameFromFilename('ClubOogaBooga.component.ts'), 'ClubOogaBooga');
  assert.equal(folderNameFromFilename('user-card.ts'), 'user-card');
  assert.equal(folderNameFromFilename('component.ts'), 'component');

  const virtual = await lintText(COMPONENT);
  assert.equal(virtual.length, 0, 'lintText without a real file should not report');

  const singleRoot = makeFixture({
    'user-card.component.ts': source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
      'export class UserCardComponent {}'
    ])
  });
  try {
    const messages = await lintPath(path.join(singleRoot, 'user-card.component.ts'));
    assert.equal(messages.length, 0, 'single-file component may live next to other files');
  } finally {
    fs.rmSync(singleRoot, { recursive: true, force: true });
  }

  const specOnly = makeFixture({
    'user-card.component.ts': source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
      'export class UserCardComponent {}'
    ]),
    'user-card.component.spec.ts': 'describe(\'UserCardComponent\', () => {});\n'
  });
  try {
    const messages = await lintPath(path.join(specOnly, 'user-card.component.ts'));
    assert.equal(messages.length, 0, 'a spec file alone does not require its own folder');
  } finally {
    fs.rmSync(specOnly, { recursive: true, force: true });
  }

  const specHost = makeFixture({
    'user-card.component.ts': source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({ selector: \'app-user-card\', template: \'<p>Hi</p>\' })',
      'export class UserCardComponent {}'
    ]),
    'user-card.component.spec.ts': source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({ selector: \'app-host\', template: \'<app-user-card />\' })',
      'class TestHostComponent {}',
      "describe('UserCardComponent', () => {});"
    ]),
    'user.service.ts': source([
      "import { Injectable } from '@angular/core';",
      '',
      '@Injectable({ providedIn: \'root\' })',
      'export class UserService {}'
    ]),
    'user.pipe.ts': 'export class UserPipe {}\n',
    'user.guard.ts': 'export class UserGuard {}\n',
    'user.directive.ts': 'export class UserDirective {}\n',
    'user.module.ts': 'export class UserModule {}\n',
    'user.stories.ts': 'export default {};\n'
  });
  try {
    const component = await lintPath(path.join(specHost, 'user-card.component.ts'));
    const spec = await lintPath(path.join(specHost, 'user-card.component.spec.ts'));
    const service = await lintPath(path.join(specHost, 'user.service.ts'));
    const pipe = await lintPath(path.join(specHost, 'user.pipe.ts'));
    assert.equal(component.length, 0, 'typed siblings (spec, service, pipe, …) do not count as extra components');
    assert.equal(spec.length, 0, 'spec files are not linted as components');
    assert.equal(service.length, 0, 'service files are not linted as components');
    assert.equal(pipe.length, 0, 'other typed files are not linted as components');
  } finally {
    fs.rmSync(specHost, { recursive: true, force: true });
  }

  const noDecorator = makeFixture({
    'user-card.component.ts': 'export class UserCardComponent {}\n',
    'user-card.component.html': '<p>Hi</p>\n'
  });
  try {
    const messages = await lintPath(path.join(noDecorator, 'user-card.component.ts'));
    assert.equal(messages.length, 0, 'files without @Component are skipped');
  } finally {
    fs.rmSync(noDecorator, { recursive: true, force: true });
  }

  const alreadyOwned = makeFixture({
    'user-card/user-card.component.ts': COMPONENT,
    'user-card/user-card.component.html': '<p>Hi</p>\n',
    'user-card/user-card.component.scss': ':host { display: block; }\n'
  });
  try {
    const messages = await lintPath(path.join(alreadyOwned, 'user-card/user-card.component.ts'));
    assert.equal(messages.length, 0, 'multi-file component in a matching folder should pass');
  } finally {
    fs.rmSync(alreadyOwned, { recursive: true, force: true });
  }

  const loginPage = makeFixture({
    'login/login-page.component.ts': source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({',
      "  selector: 'app-login-page',",
      "  templateUrl: './login-page.component.html',",
      "  styleUrl: './login-page.component.scss'",
      '})',
      'export class LoginPageComponent {}'
    ]),
    'login/login-page.component.html': '<p>Login</p>\n',
    'login/login-page.component.scss': ':host {}\n',
    'login/login-page.component.spec.ts': "describe('LoginPageComponent', () => {});\n"
  });
  try {
    const messages = await lintPath(path.join(loginPage, 'login/login-page.component.ts'));
    assert.equal(
      messages.length,
      0,
      'login/login-page.component.ts is already in its feature folder'
    );
  } finally {
    fs.rmSync(loginPage, { recursive: true, force: true });
  }

  const ooga = makeFixture({
    'login/ClubOogaBooga.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-club-ooga-booga\', template: \'<p>Hi</p>\' })',
      'export class ClubOogaBoogaComponent {}'
    ])
  });
  try {
    const messages = await lintPath(path.join(ooga, 'login/ClubOogaBooga.component.ts'));
    assert.equal(messages.length, 0, 'one oddly named component may live in login/');
  } finally {
    fs.rmSync(ooga, { recursive: true, force: true });
  }

  const oogaAndLogout = makeFixture({
    'login/ClubOogaBooga.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-club-ooga-booga\', template: \'<p>Hi</p>\' })',
      'export class ClubOogaBoogaComponent {}'
    ]),
    'login/Logout.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-logout\', template: \'<p>Bye</p>\' })',
      'export class LogoutComponent {}'
    ])
  });
  try {
    const club = await lintPath(path.join(oogaAndLogout, 'login/ClubOogaBooga.component.ts'));
    const logout = await lintPath(path.join(oogaAndLogout, 'login/Logout.component.ts'));
    assert.equal(club.length, 1, 'two differently named components in login/ must split');
    assert.match(club[0].message, /ClubOogaBooga\//);
    assert.equal(logout.length, 1, 'both components should be reported');
    assert.match(logout[0].message, /Logout\//);
  } finally {
    fs.rmSync(oogaAndLogout, { recursive: true, force: true });
  }

  const loginWithLogout = makeFixture({
    'login/login-page.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-login-page\', template: \'<p>Login</p>\' })',
      'export class LoginPageComponent {}'
    ]),
    'login/login.service.ts': source([
      "import { Injectable } from '@angular/core';",
      '@Injectable({ providedIn: \'root\' })',
      'export class LoginService {}'
    ]),
    'login/login.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-login\', template: \'<p>Login</p>\' })',
      'export class LoginComponent {}'
    ]),
    'login/Logout.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-logout\', template: \'<p>Bye</p>\' })',
      'export class LogoutComponent {}'
    ])
  });
  try {
    const page = await lintPath(path.join(loginWithLogout, 'login/login-page.component.ts'));
    const login = await lintPath(path.join(loginWithLogout, 'login/login.component.ts'));
    const service = await lintPath(path.join(loginWithLogout, 'login/login.service.ts'));
    const logout = await lintPath(path.join(loginWithLogout, 'login/Logout.component.ts'));
    assert.equal(page.length, 0, 'login-page stays in login/ because the folder matches');
    assert.equal(login.length, 0, 'login.component.ts stays: name before the first dot is login');
    assert.equal(service.length, 0, 'login.service.ts stays: name before the first dot is login');
    assert.equal(logout.length, 1, 'Logout must move into a subfolder');
    assert.match(logout[0].message, /Logout\//);
    applyOwnFolderFix(path.join(loginWithLogout, 'login/Logout.component.ts'));
    assert.ok(exists(loginWithLogout, 'login/login.service.ts'), 'matching service must not move');
    assert.ok(exists(loginWithLogout, 'login/login.component.ts'), 'matching component must not move');
    assert.ok(exists(loginWithLogout, 'login/Logout/Logout.component.ts'));
  } finally {
    fs.rmSync(loginWithLogout, { recursive: true, force: true });
  }

  const stemFolder = makeFixture({
    'user-card.component/user-card.component.ts': COMPONENT,
    'user-card.component/user-card.component.html': '<p>Hi</p>\n'
  });
  try {
    const messages = await lintPath(path.join(stemFolder, 'user-card.component/user-card.component.ts'));
    assert.equal(messages.length, 0, 'folder named after the full file stem should pass');
  } finally {
    fs.rmSync(stemFolder, { recursive: true, force: true });
  }

  const loneMismatched = makeFixture({
    'user-card.component.ts': COMPONENT,
    'user-card.component.html': '<p>Hi</p>\n',
    'user-card.component.scss': ':host { display: block; }\n',
    'user.service.ts': 'export class UserService {}\n'
  });
  try {
    const messages = await lintPath(path.join(loneMismatched, 'user-card.component.ts'));
    assert.equal(messages.length, 0, 'a single component may live in a mismatched folder');
    assert.equal(
      applyOwnFolderFix(path.join(loneMismatched, 'user-card.component.ts')).moved,
      false,
      'autofix should not move a lone component'
    );
  } finally {
    fs.rmSync(loneMismatched, { recursive: true, force: true });
  }

  const wrongFolder = makeFixture({
    'widgets/user-card.component.ts': COMPONENT,
    'widgets/user-card.component.html': '<p>Hi</p>\n'
  });
  try {
    const messages = await lintPath(path.join(wrongFolder, 'widgets/user-card.component.ts'));
    assert.equal(messages.length, 0, 'one component in widgets/ is allowed even if the name does not match');
  } finally {
    fs.rmSync(wrongFolder, { recursive: true, force: true });
  }

  const pageRoot = makeFixture({
    'home.page.ts': PAGE,
    'home.page.html': '<p>Home</p>\n'
  });
  try {
    const messages = await lintPath(path.join(pageRoot, 'home.page.ts'));
    assert.equal(messages.length, 0, 'a single page may keep a mismatched folder name');
  } finally {
    fs.rmSync(pageRoot, { recursive: true, force: true });
  }

  const shared = makeFixture({
    'user-card.component.ts': COMPONENT,
    'user-card.component.html': '<p>Hi</p>\n',
    'user-card.component.scss': ':host { display: block; }\n',
    'user-card.component.spec.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-host\', template: \'<p></p>\' })',
      'class TestHostComponent {}'
    ]),
    'other.component.ts': OTHER,
    'other.component.spec.ts': "describe('OtherComponent', () => {});\n",
    'user.service.ts': source([
      "import { Injectable } from '@angular/core';",
      '@Injectable({ providedIn: \'root\' })',
      'export class UserService {}'
    ])
  });
  try {
    const card = await lintPath(path.join(shared, 'user-card.component.ts'));
    const other = await lintPath(path.join(shared, 'other.component.ts'));
    assert.equal(card.length, 1, 'a component that shares a folder must move');
    assert.equal(card[0].messageId, 'ownFolder');
    assert.match(card[0].message, /user-card\.component/);
    assert.match(card[0].message, /user-card\//);
    assert.equal(other.length, 1, 'the other component in the same folder must also move');
    assert.match(other[0].message, /other\//);
    assert.ok(
      exists(shared, 'user-card.component.ts'),
      'a normal lint must not move files'
    );
    assert.ok(!exists(shared, 'user-card/user-card.component.ts'));
  } finally {
    fs.rmSync(shared, { recursive: true, force: true });
  }

  const matchingWithGuest = makeFixture({
    'user-card/user-card.component.ts': COMPONENT,
    'user-card/user-card.component.html': '<p>Hi</p>\n',
    'user-card/other.component.ts': OTHER
  });
  try {
    const host = await lintPath(path.join(matchingWithGuest, 'user-card/user-card.component.ts'));
    const guest = await lintPath(path.join(matchingWithGuest, 'user-card/other.component.ts'));
    assert.equal(host.length, 0, 'user-card stays because the parent folder matches its name');
    assert.equal(guest.length, 1, 'the extra component must move into a subfolder');
    assert.match(guest[0].message, /other\//);
  } finally {
    fs.rmSync(matchingWithGuest, { recursive: true, force: true });
  }

  const twoInline = makeFixture({
    'alpha.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-alpha\', template: \'<p>A</p>\' })',
      'export class AlphaComponent {}'
    ]),
    'beta.component.ts': source([
      "import { Component } from '@angular/core';",
      '@Component({ selector: \'app-beta\', template: \'<p>B</p>\' })',
      'export class BetaComponent {}'
    ])
  });
  try {
    const alpha = await lintPath(path.join(twoInline, 'alpha.component.ts'));
    const beta = await lintPath(path.join(twoInline, 'beta.component.ts'));
    assert.equal(alpha.length, 1, 'two inline components in one folder must split');
    assert.equal(beta.length, 1, 'both inline components should be reported');
  } finally {
    fs.rmSync(twoInline, { recursive: true, force: true });
  }

  const fixRoot = makeFixture({
    'user-card.component.ts': COMPONENT,
    'user-card.component.html': '<p>Hi</p>\n',
    'user-card.component.scss': ':host { display: block; }\n',
    'user-card.component.spec.ts': "import { UserCardComponent } from './user-card.component';\n",
    'other.component.ts': OTHER,
    'user.service.ts': 'export class UserService {}\n',
    'app.ts': "import { UserCardComponent } from './user-card.component';\n"
  });
  try {
    const result = applyOwnFolderFix(path.join(fixRoot, 'user-card.component.ts'));
    assert.equal(result.moved, true);
    assert.equal(result.folder, 'user-card');
    assert.ok(exists(fixRoot, 'user-card/user-card.component.ts'));
    assert.ok(exists(fixRoot, 'user-card/user-card.component.html'));
    assert.ok(exists(fixRoot, 'user-card/user-card.component.scss'));
    assert.ok(exists(fixRoot, 'user-card/user-card.component.spec.ts'));
    assert.ok(!exists(fixRoot, 'user-card.component.ts'));
    assert.ok(!exists(fixRoot, 'user-card.component.html'));
    assert.ok(exists(fixRoot, 'user.service.ts'));

    const moved = read(fixRoot, 'user-card/user-card.component.ts');
    assert.match(moved, /from '\.\.\/user\.service'/);
    assert.match(moved, /templateUrl: '\.\/user-card\.component\.html'/);
    assert.match(moved, /styleUrl: '\.\/user-card\.component\.scss'/);

    assert.match(
      read(fixRoot, 'app.ts'),
      /from '\.\/user-card\/user-card\.component'/
    );
    assert.match(
      read(fixRoot, 'user-card/user-card.component.spec.ts'),
      /from '\.\/user-card\.component'/
    );

    const again = applyOwnFolderFix(path.join(fixRoot, 'user-card/user-card.component.ts'));
    assert.equal(again.moved, false, 'a second fix should be a no-op');

    const messages = await lintPath(path.join(fixRoot, 'user-card/user-card.component.ts'));
    assert.equal(messages.length, 0, 'moved component should pass the rule');
  } finally {
    fs.rmSync(fixRoot, { recursive: true, force: true });
  }

  const styleUrlsRoot = makeFixture({
    'user-card.component.ts': source([
      "import { Component } from '@angular/core';",
      '',
      '@Component({',
      "  selector: 'app-user-card',",
      "  templateUrl: './user-card.component.html',",
      '  styleUrls: [',
      "    './user-card.component.scss',",
      "    './shared.css'",
      '  ]',
      '})',
      'export class UserCardComponent {}'
    ]),
    'user-card.component.html': '<p>Hi</p>\n',
    'user-card.component.scss': ':host {}\n',
    'shared.css': '.shared {}\n',
    'other.component.ts': OTHER
  });
  try {
    applyOwnFolderFix(path.join(styleUrlsRoot, 'user-card.component.ts'));
    const moved = read(styleUrlsRoot, 'user-card/user-card.component.ts');
    assert.match(moved, /'\.\/user-card\.component\.scss'/);
    assert.match(moved, /'\.\.\/shared\.css'/);
  } finally {
    fs.rmSync(styleUrlsRoot, { recursive: true, force: true });
  }

  const previous = process.env.JUNOLINT_APPLY_COMPONENT_FOLDER_FIX;
  const cliRoot = makeFixture({
    'user-card.component.ts': COMPONENT,
    'user-card.component.html': '<p>Hi</p>\n',
    'other.component.ts': OTHER,
    'user.service.ts': 'export class UserService {}\n'
  });
  process.env.JUNOLINT_APPLY_COMPONENT_FOLDER_FIX = '1';
  try {
    const messages = await lintPath(path.join(cliRoot, 'user-card.component.ts'));
    assert.equal(messages.length, 0, 'CLI --fix path should not leave a leftover report');
    flushComponentFolderFixes();
    assert.ok(exists(cliRoot, 'user-card/user-card.component.ts'));
    assert.ok(!exists(cliRoot, 'user-card.component.ts'));
    assert.match(
      read(cliRoot, 'user-card/user-card.component.ts'),
      /from '\.\.\/user\.service'/
    );
  } finally {
    if (previous === undefined)
      delete process.env.JUNOLINT_APPLY_COMPONENT_FOLDER_FIX;
    else
      process.env.JUNOLINT_APPLY_COMPONENT_FOLDER_FIX = previous;
    fs.rmSync(cliRoot, { recursive: true, force: true });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  });
