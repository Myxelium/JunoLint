'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const angular = require('angular-eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');
const {
  analyzeFileName,
  isAllowedFileName,
  pathHasFolder,
  DEFAULT_SUFFIXES
} = require('../rules/angular-file-naming');

const TYPED_RULE = 'junolint/angular-file-naming';
const BARE_RULE = 'junolint/bare-src-file-naming';

const filenameOnlyParser = {
  parse() {
    return {
      type: 'Program',
      body: [],
      sourceType: 'module',
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      range: [0, 0],
      tokens: [],
      comments: []
    };
  }
};

const EMPTY_TS = 'export const value = 1;\n';
const EMPTY_JS = 'export const value = 1;\n';
const EMPTY_HTML = '<p>Hi</p>\n';
const EMPTY_STYLE = ':host { display: block; }\n';

function parserFor(filePath) {
  if (filePath.endsWith('.html'))
    return angular.templateParser;

  if (/\.(?:css|scss|sass|less)$/i.test(filePath))
    return filenameOnlyParser;

  return tseslint.parser;
}

function codeFor(filePath) {
  if (filePath.endsWith('.html'))
    return EMPTY_HTML;

  if (/\.(?:css|scss|sass|less)$/i.test(filePath))
    return EMPTY_STYLE;

  if (filePath.endsWith('.js'))
    return EMPTY_JS;

  return EMPTY_TS;
}

async function lintFile(filePath, rules, code) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{ts,js,html,css,scss,sass,less}'],
        languageOptions: {
          parser: parserFor(filePath),
          parserOptions: {
            ecmaVersion: 2022,
            sourceType: 'module'
          }
        },
        plugins: { junolint: plugin },
        rules
      }
    ]
  });

  const [result] = await eslint.lintText(code ?? codeFor(filePath), { filePath });
  return result.messages;
}

async function lintTyped(filePath, ruleOptions, code) {
  const messages = await lintFile(filePath, {
    [TYPED_RULE]: ruleOptions ?? 'error'
  }, code);
  return messages.filter((message) => message.ruleId === TYPED_RULE);
}

async function lintBare(filePath, ruleOptions, code) {
  const messages = await lintFile(filePath, {
    [BARE_RULE]: ruleOptions ?? 'error'
  }, code);
  return messages.filter((message) => message.ruleId === BARE_RULE);
}

function findRuleBlock(ruleId) {
  return recommended.find((block) => block.rules && ruleId in block.rules);
}

async function main() {
  const tsBlock = findRuleBlock(TYPED_RULE);
  assert.ok(tsBlock, 'recommended config should include angular-file-naming');
  assert.equal(tsBlock.rules[TYPED_RULE], 'warn', 'angular-file-naming should be warn by default');
  assert.equal(tsBlock.rules[BARE_RULE], 'off', 'bare-src-file-naming should be off by default');
  assert.ok(plugin.rules['angular-file-naming'], 'plugin should export angular-file-naming');
  assert.ok(plugin.rules['bare-src-file-naming'], 'plugin should export bare-src-file-naming');

  const htmlBlock = recommended.find((block) => {
    return Array.isArray(block.files) && block.files.includes('**/*.html') && block.rules && TYPED_RULE in block.rules;
  });
  assert.ok(htmlBlock, 'HTML block should include angular-file-naming');
  assert.equal(htmlBlock.rules[TYPED_RULE], 'warn');
  assert.equal(htmlBlock.rules[BARE_RULE], 'off');

  const jsBlock = recommended.find((block) => {
    return Array.isArray(block.files) && block.files.some((glob) => glob.includes('js'));
  });
  assert.ok(jsBlock, 'recommended config should lint src JS filenames');
  assert.equal(jsBlock.rules[TYPED_RULE], 'warn');
  assert.equal(jsBlock.rules[BARE_RULE], 'off');

  const known = {
    'user-profile.component.ts': 'component',
    'user-profile.component.html': 'component',
    'user-profile.component.scss': 'component',
    'home.page.ts': 'page',
    'user.service.ts': 'service',
    'app.module.ts': 'module',
    'auto-focus.directive.ts': 'directive',
    'relative-time.pipe.ts': 'pipe',
    'auth.guard.ts': 'guard',
    'auth.interceptor.ts': 'interceptor',
    'user.resolver.ts': 'resolver',
    'admin.routes.ts': 'routes',
    'app.config.ts': 'config'
  };

  for (const [filePath, suffix] of Object.entries(known)) {
    const analysis = analyzeFileName(filePath);
    assert.equal(analysis.skip, false, `${filePath} should be a code file`);
    assert.equal(analysis.isTyped, true, `${filePath} should be typed`);
    assert.equal(analysis.typeSuffix, suffix, `${filePath} should use ${suffix}`);
    assert.ok(DEFAULT_SUFFIXES.includes(suffix), `${suffix} should be a default suffix`);
  }

  const model = analyzeFileName('user.ts');
  assert.equal(model.isBare, true, 'user.ts is a model-style *.* name');
  assert.equal(model.isTyped, false);

  const specService = analyzeFileName('user.service.spec.ts');
  assert.equal(specService.isTyped, true);
  assert.equal(specService.typeSuffix, 'service');
  assert.equal(specService.testSuffix, 'spec');

  const specModel = analyzeFileName('user.spec.ts');
  assert.equal(specModel.isBare, true);
  assert.equal(specModel.testSuffix, 'spec');

  const helper = analyzeFileName('user.helper.ts');
  assert.equal(helper.isTyped, true);
  assert.equal(helper.typeSuffix, 'helper');

  const declaration = analyzeFileName('user.d.ts');
  assert.equal(declaration.skip, true);

  assert.equal(pathHasFolder('src/app/user.ts', 'src'), true);
  assert.equal(pathHasFolder('/home/me/proj/src/app/user.ts', 'src'), true);
  assert.equal(pathHasFolder('lib/user.ts', 'src'), false);

  const helperAnalysis = analyzeFileName('src/app/user.helper.ts');
  assert.equal(isAllowedFileName(helperAnalysis, 'src/app/user.helper.ts', ['helper']), true);
  assert.equal(isAllowedFileName(helperAnalysis, 'src/app/user.helper.ts', ['user.helper.ts']), true);
  assert.equal(isAllowedFileName(helperAnalysis, 'src/app/user.helper.ts', ['user.helper']), true);
  assert.equal(isAllowedFileName(helperAnalysis, 'src/app/user.helper.ts', ['src/app/user.helper.ts']), true);
  assert.equal(isAllowedFileName(helperAnalysis, 'src/app/user.helper.ts', ['ts']), false);

  const knownTyped = [
    'user-profile.component.ts',
    'src/app/home.page.ts',
    'src/app/app.module.ts',
    'src/app/user.service.ts',
    'src/app/auto-focus.directive.ts',
    'src/app/relative-time.pipe.ts',
    'src/app/auth.guard.ts',
    'src/app/auth.interceptor.ts',
    'src/app/user.resolver.ts',
    'src/app/admin.routes.ts',
    'src/app/app.config.ts',
    'src/app/user.service.spec.ts',
    'src/app/user-profile.component.html',
    'src/app/user-profile.component.scss',
    'src/app/user.service.js'
  ];

  for (const filePath of knownTyped) {
    const messages = await lintTyped(filePath);
    assert.equal(messages.length, 0, `${filePath} should match a known Angular type`);
  }

  const modelFile = await lintTyped('src/app/user.ts');
  assert.equal(modelFile.length, 0, 'model-style user.ts should not warn');

  const unknown = await lintTyped('src/app/user.helper.ts');
  assert.equal(unknown.length, 1, 'unknown *.*.* suffix should warn');
  assert.equal(unknown[0].messageId, 'unknownTypedName');
  assert.match(unknown[0].message, /helper/);

  const unknownSpec = await lintTyped('src/app/user.helper.spec.ts');
  assert.equal(unknownSpec.length, 1, 'spec of an unknown type should warn');
  assert.match(unknownSpec[0].message, /helper/);

  const unknownHtml = await lintTyped('src/app/user.helper.html');
  assert.equal(unknownHtml.length, 1, 'unknown HTML type suffix should warn');

  const unknownStyle = await lintTyped('src/app/user.helper.scss');
  assert.equal(unknownStyle.length, 1, 'unknown style type suffix should warn');

  const allowedSuffix = await lintTyped('src/app/user.helper.ts', ['error', { allowedNames: ['helper'] }]);
  assert.equal(allowedSuffix.length, 0, 'allowedNames should treat helper as a suffix');

  const allowedFile = await lintTyped('src/app/user.helper.ts', ['error', { allowedNames: ['user.helper.ts'] }]);
  assert.equal(allowedFile.length, 0, 'allowedNames should accept an exact filename');

  const extraSuffix = await lintTyped('src/app/user.model.ts', ['error', { suffixes: [...DEFAULT_SUFFIXES, 'model'] }]);
  assert.equal(extraSuffix.length, 0, 'suffixes should be configurable');

  const testSuffix = await lintTyped('src/app/user.service.test.ts', ['error', { testSuffixes: ['spec', 'test'] }]);
  assert.equal(testSuffix.length, 0, 'testSuffixes should treat .test.ts like .spec.ts');

  const replaced = await lintTyped('src/app/user.service.ts', ['error', { suffixes: ['model'] }]);
  assert.equal(replaced.length, 1, 'replacing suffixes should drop the defaults');

  const declarationMessages = await lintTyped('src/app/user.d.ts', 'error', 'export interface User {}\n');
  assert.equal(declarationMessages.length, 0, '.d.ts files should be skipped');

  const bareOutside = await lintBare('lib/user.ts');
  assert.equal(bareOutside.length, 0, 'bare names outside src should not error');

  const bareInside = await lintBare('src/app/user.ts');
  assert.equal(bareInside.length, 1, 'bare *.* names inside src should error when enabled');
  assert.equal(bareInside[0].messageId, 'bareNameInSrc');
  assert.match(bareInside[0].message, /src\//);

  const typedInside = await lintBare('src/app/user.service.ts');
  assert.equal(typedInside.length, 0, 'typed Angular names are not bare');

  const specBare = await lintBare('src/app/user.spec.ts');
  assert.equal(specBare.length, 1, 'user.spec.ts is a bare model test inside src');

  const specTyped = await lintBare('src/app/user.service.spec.ts');
  assert.equal(specTyped.length, 0, 'typed specs are not bare');

  const allowedBare = await lintBare('src/main.ts', ['error', { allowedNames: ['main.ts'] }]);
  assert.equal(allowedBare.length, 0, 'allowedNames should bypass the src *.* error');

  const allowedIndex = await lintBare('src/app/feature/index.ts', ['error', { allowedNames: ['index'] }]);
  assert.equal(allowedIndex.length, 0, 'allowedNames without a dot should match the file stem');

  const customSrc = await lintBare('source/app/user.ts', ['error', { srcFolder: 'source' }]);
  assert.equal(customSrc.length, 1, 'srcFolder should be configurable');

  const htmlBare = await lintBare('src/app/about.html');
  assert.equal(htmlBare.length, 1, 'bare HTML inside src should error when enabled');

  const htmlTyped = await lintBare('src/app/user-profile.component.html');
  assert.equal(htmlTyped.length, 0, 'component templates are not bare');

  const offBare = await lintBare('src/app/user.ts', 'off');
  assert.equal(offBare.length, 0, 'bare-src-file-naming stays silent when off');

  console.log('angular-file-naming: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
