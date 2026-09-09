'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/decompose-complex-expressions';

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

  const [result] = await eslint.lintText(source, { filePath: 'expr.ts' });
  return result.messages.filter((message) => message.ruleId === RULE);
}

function source(lines) {
  return `${lines.join('\n')}\n`;
}

async function assertValid(title, code, ruleOptions) {
  const messages = await lintTs(code, ruleOptions);
  assert.equal(
    messages.length,
    0,
    `${title} should be valid, got: ${messages.map((message) => message.message).join('; ')}`
  );
}

async function assertInvalid(title, code, expectedMessageId, ruleOptions) {
  const messages = await lintTs(code, ruleOptions);
  assert.ok(messages.length >= 1, `${title} should be reported`);

  if (expectedMessageId) {
    assert.ok(
      messages.some((message) => message.messageId === expectedMessageId),
      `${title} should use message ${expectedMessageId}, got ${messages.map((message) => message.messageId).join(', ')}`
    );
  }
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include decompose-complex-expressions');
  assert.equal(tsBlock.rules[RULE], 'off', 'decompose-complex-expressions should be off by default');
  assert.ok(plugin.rules['decompose-complex-expressions'], 'plugin should export decompose-complex-expressions');

  // --- Simple expressions ---
  await assertValid('simple property', 'const name = user.name;\n');
  await assertValid('nested property', 'const name = user.profile.displayName;\n');
  await assertValid('optional chaining', 'const name = user?.profile?.displayName;\n');
  await assertValid('type assertion', 'const name = (user as User).profile.displayName;\n');
  await assertValid('simple call', 'const result = calculateTotal(items);\n');
  await assertValid('wrapper call', 'const result = foo(value);\n');
  await assertValid('math max', 'const value = Math.max(a, b);\n');
  await assertValid('two-deep wrap', 'const result = formatDate(parseDate(input));\n');
  await assertValid('identifier arguments', 'const result = createUser(id, name, email, role);\n');

  // --- Composition: fluent / pipelines stay intact ---
  await assertValid('simple map', 'const names = users.map(user => user.name);\n');
  await assertValid('simple filter', 'const activeUsers = users.filter(isActive);\n');
  await assertValid(
    'array pipeline identifiers',
    source([
      'const users = users',
      '  .filter(isActive)',
      '  .map(normalizeUser)',
      '  .sort(compareUsers);'
    ])
  );
  await assertValid(
    'array pipeline simple callbacks',
    source([
      'const result = users',
      '  .filter(user => user.active)',
      '  .map(user => normalize(user))',
      '  .sort(compareUsers);'
    ])
  );
  await assertValid(
    'rxjs operators',
    source([
      'const users$ = source$.pipe(',
      '  filter(isActive),',
      '  map(toUser),',
      '  distinctUntilChanged(),',
      '  shareReplay(1)',
      ');'
    ])
  );
  await assertValid(
    'rxjs simple callbacks',
    source([
      'const users$ = source$',
      '  .pipe(',
      '    filter(user => user.active),',
      '    map(user => normalizeUser(user)),',
      '    switchMap(user => fetchPermissions(user))',
      '  );'
    ])
  );
  await assertValid(
    'http then pipe',
    source([
      'const users$ = this.http.get(url).pipe(',
      '  map(toUser),',
      '  shareReplay(1)',
      ');'
    ])
  );
  await assertValid(
    'query builder',
    source([
      'const query = db',
      '  .select(\'*\')',
      '  .from(\'users\')',
      '  .where(\'active\', true);'
    ])
  );
  await assertValid(
    'fluent builder',
    source([
      'const request = requestBuilder',
      '  .withHeaders(headers)',
      '  .withTimeout(5000)',
      '  .withRetry(3)',
      '  .build();'
    ])
  );
  await assertValid(
    'promise chain',
    'const result = fetch(url).then(response => response.json()).then(normalize);\n'
  );
  await assertValid(
    'get then filter',
    'const allowed = getPermissions(user).filter(isAllowed);\n'
  );
  await assertValid(
    'reduce single operation',
    'const total = items.reduce((sum, item) => sum + item.amount, 0);\n'
  );
  await assertValid(
    'named steps already extracted',
    source([
      'const parsed = parse(input);',
      'const normalized = normalize(parsed);',
      'const result = transform(normalized);'
    ])
  );

  // --- Objects, conditionals, await, short logic ---
  await assertValid(
    'lookup object',
    source([
      'const user = {',
      '  id: user.id,',
      '  name: user.name,',
      '  email: user.email',
      '};'
    ])
  );
  await assertValid(
    'single computed object property',
    source([
      'const result = {',
      '  permissions: getUserPermissions(user).filter(isPermissionAllowed)',
      '};'
    ])
  );
  await assertValid(
    'several simple calls as object properties',
    source([
      'const result = {',
      '  name: formatName(user.firstName, user.lastName),',
      '  score: calculateScore(user.orders),',
      '  permissions: getPermissions(user).filter(isAllowed)',
      '};'
    ])
  );
  await assertValid('simple ternary', 'const label = isAdmin ? \'Admin\' : \'User\';\n');
  await assertValid('short logical', 'const canProceed = user?.active && hasPermission(user);\n');
  await assertValid(
    'named predicate chain',
    source([
      'const canProceed =',
      '  isValid(user) &&',
      '  hasPermission(user) &&',
      '  transform(user);'
    ])
  );
  await assertValid('await simple', 'const user = await fetchUser();\n');
  await assertValid('await then transform', 'const result = transform(await fetchUser(id));\n');
  await assertValid('two independent args', 'const result = combine(calculateA(a), calculateB(b));\n');
  await assertValid(
    'two-deep callback in pipeline',
    source([
      'const users$ = source$.pipe(',
      '  filter(user => user.active && hasPermission(user)),',
      '  map(user => normalizeUser(calculateScore(user)))',
      ');'
    ])
  );
  await assertValid(
    'class field simple chain',
    source([
      'export class Example {',
      '  users$ = source$.pipe(map(toUser), shareReplay(1));',
      '}'
    ])
  );

  // --- Nested computation ---
  await assertInvalid(
    'three nested calls',
    'const result = foo(bar(baz(value)));\n',
    'nestedComputations'
  );
  await assertInvalid(
    'nested transformations',
    source([
      'const result = formatUser(',
      '  normalizeUser(',
      '    calculateUserScore(user)',
      '  )',
      ');'
    ]),
    'nestedComputations'
  );
  await assertInvalid(
    'return nested',
    'return formatUser(normalizeUser(calculateUserScore(user)));\n',
    'nestedComputations'
  );
  await assertInvalid(
    'assignment nested',
    'result = foo(bar(baz(value)));\n',
    'nestedComputations'
  );
  await assertInvalid(
    'class field nested',
    source([
      'export class Example {',
      '  result = formatUser(normalizeUser(calculateUserScore(user)));',
      '}'
    ]),
    'nestedComputations'
  );
  await assertInvalid(
    'default parameter nested',
    'function load(result = foo(bar(baz(value)))) {}\n',
    'nestedComputations'
  );

  // --- Independent computation ---
  await assertInvalid(
    'multiple independent arguments',
    source([
      'const result = createReport(',
      '  calculateRevenue(orders),',
      '  calculateExpenses(expenses),',
      '  formatDate(startDate),',
      '  getUserName(user)',
      ');'
    ]),
    'independentComputations'
  );
  await assertInvalid(
    'three independent arguments',
    'const result = combine(calculateA(a), calculateB(b), calculateC(c));\n',
    'independentComputations'
  );

  // --- Branching ---
  await assertInvalid(
    'branching plus nested computation',
    source([
      'const result = condition',
      '  ? transform(calculateValue(input))',
      '  : fallback(getDefaultValue());'
    ]),
    'branchingComputations'
  );

  // --- Logical mixed with lookups + calls ---
  await assertInvalid(
    'mixed logical checks',
    source([
      'const canProceed =',
      '  user &&',
      '  user.active &&',
      '  hasPermissionForUser(user) &&',
      '  !isBlockedUser(user);'
    ]),
    'independentComputations'
  );

  // --- Complexity inside a pipeline stage, not the chain itself ---
  await assertInvalid(
    'nested computation in map callback',
    source([
      'const result = users.map(user =>',
      '  transform(',
      '    normalize(',
      '      calculateScore(',
      '        getPermissions(user)',
      '      )',
      '    )',
      '  )',
      ');'
    ]),
    'nestedComputations'
  );
  await assertInvalid(
    'nested computation in rxjs map',
    source([
      'const users$ = source$.pipe(',
      '  map(user =>',
      '    transform(',
      '      normalize(',
      '        calculateScore(user)',
      '      )',
      '    )',
      '  )',
      ');'
    ]),
    'nestedComputations'
  );

  const oneReport = await lintTs('const result = foo(bar(baz(value)));\n');
  assert.equal(oneReport.length, 1, 'nested expression should produce a single diagnostic');

  const warned = await lintTs('const result = foo(bar(baz(value)));\n', 'warn');
  assert.equal(warned.length, 1, 'the rule can be enabled as warn');
  assert.equal(warned[0].severity, 1, 'warn severity should be used when enabled as warn');

  const lowThreshold = await lintTs(
    'const result = formatDate(parseDate(input));\n',
    ['error', { threshold: 3 }]
  );
  assert.ok(lowThreshold.length >= 1, 'threshold 3 should report a two-deep wrap');

  const highThreshold = await lintTs(
    'const result = foo(bar(baz(value)));\n',
    ['error', { threshold: 20 }]
  );
  assert.equal(highThreshold.length, 0, 'high threshold should keep nested calls valid');

  const defaultOff = new ESLint({
    overrideConfigFile: true,
    overrideConfig: recommended
  });
  const [recommendedResult] = await defaultOff.lintText(
    'const result = foo(bar(baz(value)));\n',
    { filePath: 'expr.ts' }
  );
  assert.equal(
    recommendedResult.messages.filter((message) => message.ruleId === RULE).length,
    0,
    'recommended config should not enable the rule'
  );

  await assert.rejects(
    () => lintTs('const result = 1;\n', ['error', { threshold: 'nope' }]),
    'non-numeric threshold should be rejected'
  );
  await assert.rejects(
    () => lintTs('const result = 1;\n', ['error', { extra: true }]),
    'unknown options should be rejected'
  );

  console.log('decompose-complex-expressions: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
