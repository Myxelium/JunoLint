'use strict';

const path = require('node:path');

const DEFAULT_SUFFIXES = [
  'component',
  'page',
  'service',
  'directive',
  'pipe',
  'guard',
  'interceptor',
  'resolver',
  'routes',
  'config',
  'module'
];

const DEFAULT_TEST_SUFFIXES = ['spec'];
const DEFAULT_SRC_FOLDER = 'src';

const CODE_EXTENSIONS = new Set([
  'ts',
  'js',
  'mjs',
  'cjs',
  'mts',
  'cts',
  'tsx',
  'jsx',
  'html',
  'css',
  'scss',
  'sass',
  'less'
]);

const SHARED_SCHEMA = [
  {
    type: 'object',
    properties: {
      suffixes: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true
      },
      testSuffixes: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true
      },
      allowedNames: {
        type: 'array',
        items: { type: 'string' },
        uniqueItems: true
      },
      srcFolder: {
        type: 'string',
        minLength: 1
      }
    },
    additionalProperties: false
  }
];

function toPosix(filePath) {
  return String(filePath).replace(/\\/g, '/');
}

function normalizeName(value) {
  return String(value).trim().toLowerCase();
}

function filenameOf(context) {
  return context.physicalFilename || context.filename || context.getFilename();
}

function pathHasFolder(filePath, folderName) {
  const target = normalizeName(folderName);
  return toPosix(path.normalize(filePath))
    .split('/')
    .some((part) => normalizeName(part) === target);
}

function analyzeFileName(filePath, options = {}) {
  if (!filePath || String(filePath).startsWith('<'))
    return { skip: true };

  const base = path.basename(filePath);

  if (base.toLowerCase().endsWith('.d.ts'))
    return { skip: true, base };

  const ext = path.extname(base).slice(1).toLowerCase();
  if (!CODE_EXTENSIONS.has(ext))
    return { skip: true, base, ext };

  const testSuffixes = new Set(
    (options.testSuffixes ?? DEFAULT_TEST_SUFFIXES).map(normalizeName)
  );

  const stem = base.slice(0, -(ext.length + 1));
  const parts = stem.split('.').filter((part) => part.length > 0);

  if (parts.length === 0)
    return { skip: true, base, ext };

  let testSuffix = '';
  if (parts.length >= 2 && testSuffixes.has(normalizeName(parts[parts.length - 1])))
    testSuffix = normalizeName(parts.pop());

  const isTyped = parts.length >= 2;
  const typeSuffix = isTyped ? normalizeName(parts[parts.length - 1]) : '';
  const name = (isTyped ? parts.slice(0, -1) : parts).join('.');

  return {
    skip: false,
    base,
    ext,
    stem,
    name,
    typeSuffix,
    testSuffix,
    isTyped,
    isBare: !isTyped
  };
}

function isAllowedFileName(analysis, filePath, allowedNames) {
  if (!analysis || analysis.skip)
    return false;

  const posix = toPosix(filePath).toLowerCase();
  const base = normalizeName(analysis.base);
  const stem = normalizeName(analysis.stem);
  const name = normalizeName(analysis.name);
  const typeSuffix = analysis.typeSuffix;

  for (const raw of allowedNames) {
    const entry = normalizeName(raw).replace(/\\/g, '/');
    if (!entry)
      continue;

    if (entry.includes('/')) {
      if (posix === entry || posix.endsWith(`/${entry}`))
        return true;

      continue;
    }

    if (entry.includes('.')) {
      if (entry === base || entry === stem || posix.endsWith(`/${entry}`))
        return true;

      continue;
    }

    if (entry === name || entry === stem || (typeSuffix && entry === typeSuffix))
      return true;
  }

  return false;
}

function resolveOptions(context) {
  const options = context.options[0] || {};

  return {
    suffixes: new Set((options.suffixes ?? DEFAULT_SUFFIXES).map(normalizeName)),
    testSuffixes: (options.testSuffixes ?? DEFAULT_TEST_SUFFIXES).map(normalizeName),
    allowedNames: options.allowedNames ?? [],
    srcFolder: options.srcFolder || DEFAULT_SRC_FOLDER
  };
}

function createFileNamingRule(kind) {
  const isTypedRule = kind === 'unknownTyped';

  return {
    meta: {
      type: 'suggestion',
      docs: {
        description: isTypedRule
          ? 'Warn when a *.*.* code file uses a type suffix that is not an Angular file type'
          : 'Disallow bare *.* code file names inside the src folder'
      },
      schema: SHARED_SCHEMA,
      messages: {
        unknownTypedName:
          'File "{{name}}" uses the type suffix "{{suffix}}", which is not an Angular file type. Use a known suffix (component, service, …) or add it to allowedNames.',
        bareNameInSrc:
          'File "{{name}}" is a bare *.* name inside {{srcFolder}}/. Use an Angular type suffix (user.service.ts, user.component.ts) or add the name to allowedNames.'
      }
    },
    create(context) {
      const options = resolveOptions(context);

      return {
        Program(node) {
          const filename = filenameOf(context);
          const analysis = analyzeFileName(filename, { testSuffixes: options.testSuffixes });

          if (analysis.skip)
            return;

          if (isAllowedFileName(analysis, filename, options.allowedNames))
            return;

          if (isTypedRule) {
            if (!analysis.isTyped || options.suffixes.has(analysis.typeSuffix))
              return;

            context.report({
              node,
              messageId: 'unknownTypedName',
              data: {
                name: analysis.base,
                suffix: analysis.typeSuffix
              }
            });
            return;
          }

          if (!analysis.isBare || !pathHasFolder(filename, options.srcFolder))
            return;

          context.report({
            node,
            messageId: 'bareNameInSrc',
            data: {
              name: analysis.base,
              srcFolder: options.srcFolder
            }
          });
        }
      };
    }
  };
}

module.exports = {
  rules: {
    'angular-file-naming': createFileNamingRule('unknownTyped'),
    'bare-src-file-naming': createFileNamingRule('bareInSrc')
  },
  analyzeFileName,
  isAllowedFileName,
  pathHasFolder,
  DEFAULT_SUFFIXES,
  DEFAULT_TEST_SUFFIXES,
  DEFAULT_SRC_FOLDER,
  CODE_EXTENSIONS
};
