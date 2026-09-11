'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SUFFIXES = ['component', 'page'];
const DEFAULT_EXTENSIONS = ['html', 'css', 'scss', 'sass', 'less', 'ts', 'js'];
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.angular',
  '.git',
  'android',
  'generated',
  'release'
]);
const REFERER_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs']);
const SPECIFIER_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.mts',
  '.cts',
  '.tsx',
  '.html',
  '.css',
  '.scss',
  '.sass',
  '.less'
]);

const pendingFixes = [];
let flushHookInstalled = false;

function normalizePath(filePath) {
  return path.normalize(path.resolve(filePath));
}

function toPosix(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

const SOURCE_FILE_EXT = /\.(?:ts|js|html|css|scss|sass|less)$/i;

function isSpecOrTest(filePath) {
  return /\.(?:spec|test)\.[^.]+$/i.test(path.basename(filePath));
}

function fileRole(filename) {
  const base = path.basename(filename);
  if (isSpecOrTest(base))
    return 'spec';

  const stripped = base.replace(SOURCE_FILE_EXT, '');
  const dot = stripped.lastIndexOf('.');
  if (dot === -1)
    return '';

  return stripped.slice(dot + 1).toLowerCase();
}

function isComponentRole(role, suffixes) {
  if (!role)
    return true;

  return suffixes.some((suffix) => suffix.toLowerCase() === role);
}

function isIgnoredSourceFile(filePath, suffixes = DEFAULT_SUFFIXES) {
  if (String(filePath).endsWith('.d.ts'))
    return true;

  const role = fileRole(filePath);
  if (role === 'spec')
    return true;

  return role !== '' && !isComponentRole(role, suffixes);
}

function fileLooksLikeComponent(source) {
  return /@Component\b/.test(source);
}

function decoratorName(decorator) {
  const expression = decorator.expression;

  if (expression.type === 'CallExpression') {
    if (expression.callee.type === 'Identifier')
      return expression.callee.name;

    if (expression.callee.type === 'MemberExpression' && expression.callee.property.type === 'Identifier')
      return expression.callee.property.name;
  }

  if (expression.type === 'Identifier')
    return expression.name;

  return '';
}

function isComponentClass(node) {
  const decorators = node.decorators || [];
  return decorators.some((decorator) => decoratorName(decorator) === 'Component');
}

function exportedClass(statement) {
  if (statement.type === 'ClassDeclaration')
    return statement;

  if (statement.type === 'ExportNamedDeclaration' && statement.declaration && statement.declaration.type === 'ClassDeclaration')
    return statement.declaration;

  if (statement.type === 'ExportDefaultDeclaration' && statement.declaration && statement.declaration.type === 'ClassDeclaration')
    return statement.declaration;

  return null;
}

function findComponentClass(program) {
  for (const statement of program.body) {
    const classNode = exportedClass(statement);
    if (classNode && isComponentClass(classNode))
      return classNode;
  }

  return null;
}

function reportNodeFor(classNode) {
  const decorator = (classNode.decorators || []).find((node) => decoratorName(node) === 'Component');
  return decorator || classNode;
}

function folderNameFromFilename(filename, suffixes = DEFAULT_SUFFIXES) {
  const base = path.basename(filename).replace(/\.(?:ts|js)$/i, '');

  for (const suffix of suffixes) {
    const tail = `.${suffix}`;
    if (base.length > tail.length && base.toLowerCase().endsWith(tail.toLowerCase()))
      return base.slice(0, -tail.length);
  }

  return base;
}

function stripTypeSuffixes(base, suffixes) {
  let next = base;
  let changed = true;

  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      const dotted = `.${suffix}`;
      const kebab = `-${suffix}`;
      if (next.length > dotted.length && next.toLowerCase().endsWith(dotted.toLowerCase())) {
        next = next.slice(0, -dotted.length);
        changed = true;
      } else if (next.length > kebab.length && next.toLowerCase().endsWith(kebab.toLowerCase())) {
        next = next.slice(0, -kebab.length);
        changed = true;
      }
    }
  }

  return next;
}

function nameBeforeFirstDot(filename) {
  const base = path.basename(filename);
  const dot = base.indexOf('.');
  return dot === -1 ? base : base.slice(0, dot);
}

function folderMatchesFile(dirName, filename, suffixes) {
  const head = nameBeforeFirstDot(filename);
  const folder = dirName.toLowerCase();

  if (head.toLowerCase() === folder)
    return true;

  return stripTypeSuffixes(head, suffixes).toLowerCase() === folder;
}

function extensionOfCompanion(name, stem) {
  if (!name.startsWith(`${stem}.`))
    return '';

  const rest = name.slice(stem.length + 1);
  const dot = rest.lastIndexOf('.');
  return (dot === -1 ? rest : rest.slice(dot + 1)).toLowerCase();
}

function isCompanionName(name, stem, extensions) {
  const extension = extensionOfCompanion(name, stem);
  return extension.length > 0 && extensions.includes(extension);
}

function isComponentSourceFile(name, suffixes) {
  if (isIgnoredSourceFile(name, suffixes))
    return false;

  const ext = path.extname(name).toLowerCase();
  return ext === '.ts' || ext === '.js';
}

function listComponentFiles(dir, suffixes) {
  const names = [];

  for (const name of fs.readdirSync(dir)) {
    if (!isComponentSourceFile(name, suffixes))
      continue;

    try {
      if (fileLooksLikeComponent(fs.readFileSync(path.join(dir, name), 'utf8')))
        names.push(name);
    } catch {
      // skip unreadable siblings
    }
  }

  return names;
}

function shouldApplyFilesystemFix() {
  if (process.env.JUNOLINT_APPLY_COMPONENT_FOLDER_FIX === '1')
    return true;

  const argv = process.argv;
  if (argv.includes('--fix-dry-run'))
    return false;

  return argv.includes('--fix');
}

function ensureFlushHook() {
  if (flushHookInstalled)
    return;

  flushHookInstalled = true;
  process.on('beforeExit', () => {
    flushComponentFolderFixes();
  });
}

function queueOwnFolderFix(filePath, options) {
  const filename = normalizePath(filePath);
  if (pendingFixes.some((job) => job.filePath === filename))
    return;

  pendingFixes.push({ filePath: filename, options });
  ensureFlushHook();
}

function flushComponentFolderFixes() {
  const jobs = pendingFixes.splice(0, pendingFixes.length);
  const results = [];

  for (const job of jobs) {
    try {
      results.push(applyOwnFolderFix(job.filePath, job.options));
    } catch (error) {
      console.error(`junolint/component-own-folder: failed to move ${job.filePath}: ${error.message}`);
    }
  }

  return results;
}

function analyzeComponentFolder(filename, options = {}) {
  if (!filename || filename.startsWith('<') || !fs.existsSync(filename))
    return null;

  const suffixes = options.suffixes ?? DEFAULT_SUFFIXES;

  if (isIgnoredSourceFile(filename, suffixes))
    return null;

  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.ts' && ext !== '.js')
    return null;

  const source = options.source ?? fs.readFileSync(filename, 'utf8');
  if (!fileLooksLikeComponent(source))
    return null;

  const companionExtensions = (options.companionExtensions ?? DEFAULT_EXTENSIONS).map((value) => {
    return String(value).replace(/^\./, '').toLowerCase();
  });

  const dir = path.dirname(filename);
  const base = path.basename(filename);
  const stem = base.replace(/\.(?:ts|js)$/i, '');
  const folderName = folderNameFromFilename(filename, suffixes);

  const companions = [];
  const extrasToMove = [];

  for (const name of fs.readdirSync(dir)) {
    if (name === base || !isCompanionName(name, stem, companionExtensions))
      continue;

    if (isSpecOrTest(name)) {
      extrasToMove.push(name);
      continue;
    }

    if (isIgnoredSourceFile(name, suffixes))
      continue;

    companions.push(name);
  }

  const siblingComponents = listComponentFiles(dir, suffixes);
  const sharedFolder = new Set(
    siblingComponents.map((name) => folderNameFromFilename(name, suffixes))
  ).size > 1;
  const inOwnFolder = folderMatchesFile(path.basename(dir), filename, suffixes);

  return {
    filename,
    dir,
    base,
    stem,
    folderName,
    destDir: path.join(dir, folderName),
    companions,
    extrasToMove,
    filesToMove: [base, ...companions, ...extrasToMove],
    siblingComponents,
    sharedFolder,
    inOwnFolder,
    multiFile: companions.length > 0,
    shouldReport: sharedFolder && !inOwnFolder,
    displayName: stem
  };
}

function specifierCandidates(fromDir, spec) {
  const raw = path.resolve(fromDir, spec);
  return [
    raw,
    `${raw}.ts`,
    `${raw}.js`,
    `${raw}.tsx`,
    `${raw}.mts`,
    `${raw}.cts`,
    path.join(raw, 'index.ts'),
    path.join(raw, 'index.js')
  ];
}

function matchMoved(fromDir, spec, movedMap) {
  for (const candidate of specifierCandidates(fromDir, spec)) {
    const dest = movedMap.get(normalizePath(candidate));
    if (dest)
      return dest;
  }

  return null;
}

function specifierExtension(spec) {
  const ext = path.extname(spec).toLowerCase();
  return SPECIFIER_EXTENSIONS.has(ext) ? ext : '';
}

function formatSpecifier(fromDir, targetAbs, originalSpec) {
  const originalExt = specifierExtension(originalSpec);
  let target = targetAbs;
  const targetExt = specifierExtension(target);

  if (!originalExt && targetExt)
    target = target.slice(0, -targetExt.length);
  else if (originalExt === '.js' && targetExt === '.ts')
    target = `${target.slice(0, -targetExt.length)}.js`;

  let relativePath = toPosix(path.relative(fromDir, target));
  if (!relativePath.startsWith('.'))
    relativePath = `./${relativePath}`;

  return relativePath;
}

function rewriteRel(spec, oldDir, newDir, movedMap) {
  if (!spec.startsWith('.'))
    return spec;

  const dest = matchMoved(oldDir, spec, movedMap);
  if (dest)
    return formatSpecifier(newDir, dest, spec);

  return formatSpecifier(newDir, path.resolve(oldDir, spec), spec);
}

function rewriteQuoted(source, pattern, rewrite) {
  return source.replace(pattern, (match, prefix, quote, spec) => {
    return `${prefix}${quote}${rewrite(spec)}${quote}`;
  });
}

function rewriteImportSpecifiers(source, rewrite) {
  return rewriteQuoted(
    rewriteQuoted(
      rewriteQuoted(
        rewriteQuoted(source, /\b(from\s+)(['"])(\.[^'"]+)\2/g, rewrite),
        /\b(import\s+)(['"])(\.[^'"]+)\2/g,
        rewrite
      ),
      /\b(import\s*\(\s*)(['"])(\.[^'"]+)\2/g,
      rewrite
    ),
    /\b(require\s*\(\s*)(['"])(\.[^'"]+)\2/g,
    rewrite
  );
}

function rewriteAngularUrls(source, rewrite) {
  const withSingles = source.replace(
    /((?:templateUrl|styleUrl)\s*:\s*)(['"])(\.[^'"]+)\2/g,
    (match, prefix, quote, spec) => `${prefix}${quote}${rewrite(spec)}${quote}`
  );

  return withSingles.replace(/styleUrls\s*:\s*\[([\s\S]*?)\]/g, (full, inner) => {
    const next = inner.replace(/(['"])(\.[^'"]+)\1/g, (match, quote, spec) => {
      return `${quote}${rewrite(spec)}${quote}`;
    });
    return full.replace(inner, next);
  });
}

function rewriteMovedModule(source, oldDir, newDir, movedMap) {
  const rewrite = (spec) => rewriteRel(spec, oldDir, newDir, movedMap);
  return rewriteAngularUrls(rewriteImportSpecifiers(source, rewrite), rewrite);
}

function findScanRoot(startDir) {
  let dir = startDir;

  for (;;) {
    if (fs.existsSync(path.join(dir, 'angular.json')) || fs.existsSync(path.join(dir, 'package.json')))
      return dir;

    const parent = path.dirname(dir);
    if (parent === dir)
      return startDir;

    dir = parent;
  }
}

function walkFiles(root, extensions, ignoreDirs) {
  const out = [];

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name) || entry.name.startsWith('.'))
          continue;
        walk(full);
        continue;
      }

      if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase()))
        out.push(full);
    }
  }

  walk(root);
  return out;
}

function updateReferencers(oldDir, movedMap) {
  const scanRoot = findScanRoot(oldDir);
  const files = walkFiles(scanRoot, REFERER_EXTENSIONS, IGNORE_DIRS);
  const skip = new Set([
    ...movedMap.keys(),
    ...[...movedMap.values()].map(normalizePath)
  ]);

  for (const file of files) {
    if (skip.has(normalizePath(file)))
      continue;

    const original = fs.readFileSync(file, 'utf8');
    const next = rewriteImportSpecifiers(original, (spec) => {
      if (!spec.startsWith('.'))
        return spec;

      const dest = matchMoved(path.dirname(file), spec, movedMap);
      if (!dest)
        return spec;

      return formatSpecifier(path.dirname(file), dest, spec);
    });

    if (next !== original)
      fs.writeFileSync(file, next);
  }
}

function applyOwnFolderFix(filename, options = {}) {
  const analysis = analyzeComponentFolder(filename, options);
  if (!analysis || !analysis.shouldReport)
    return { moved: false };

  const { dir, destDir, filesToMove, folderName } = analysis;

  if (fs.existsSync(destDir) && !fs.statSync(destDir).isDirectory()) {
    throw new Error(
      `junolint/component-own-folder: ${destDir} exists and is not a directory`
    );
  }

  const movedMap = new Map();
  for (const name of filesToMove) {
    const from = path.join(dir, name);
    const to = path.join(destDir, name);
    if (fs.existsSync(to)) {
      throw new Error(
        `junolint/component-own-folder: cannot move ${from} to ${to}: destination exists`
      );
    }
    movedMap.set(normalizePath(from), to);
  }

  fs.mkdirSync(destDir, { recursive: true });

  for (const name of filesToMove) {
    const from = path.join(dir, name);
    const to = path.join(destDir, name);
    let content = fs.readFileSync(from, 'utf8');
    if (/\.(?:ts|js)$/i.test(name))
      content = rewriteMovedModule(content, dir, destDir, movedMap);
    fs.writeFileSync(to, content);
    fs.unlinkSync(from);
  }

  updateReferencers(dir, movedMap);

  return {
    moved: true,
    folder: folderName,
    destDir,
    files: filesToMove
  };
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require a component that shares a folder with another differently named component to move into a subfolder, unless the parent folder already matches its name'
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          suffixes: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true
          },
          companionExtensions: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      ownFolder:
        'Component "{{name}}" shares a folder with other components. Move it into "{{folder}}/".'
    }
  },
  create(context) {
    const options = context.options[0] || {};
    const suffixes = options.suffixes || DEFAULT_SUFFIXES;
    const companionExtensions = options.companionExtensions || DEFAULT_EXTENSIONS;

    return {
      Program(node) {
        const filename = context.physicalFilename || context.filename || context.getFilename();
        if (isIgnoredSourceFile(filename, suffixes))
          return;

        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const componentClass = findComponentClass(node);

        if (!componentClass)
          return;

        const analysis = analyzeComponentFolder(filename, {
          suffixes,
          companionExtensions,
          source: sourceCode.getText()
        });

        if (!analysis || !analysis.shouldReport)
          return;

        if (shouldApplyFilesystemFix()) {
          queueOwnFolderFix(filename, { suffixes, companionExtensions });
          return;
        }

        context.report({
          node: reportNodeFor(componentClass),
          messageId: 'ownFolder',
          data: {
            name: analysis.displayName,
            folder: analysis.folderName
          }
        });
      }
    };
  },
  applyOwnFolderFix,
  analyzeComponentFolder,
  flushComponentFolderFixes,
  folderNameFromFilename
};
