'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const tseslint = require('typescript-eslint');
const plugin = require('../plugin');
const recommended = require('../index');

const RULE = 'junolint/grouped-class-fields';

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

  const [result] = await eslint.lintText(source, { filePath: 'fields.ts' });
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
  assert.equal(messagesOf(result).length, 0, title);
}

async function assertFixed(title, input, expected) {
  const reported = await lintTs(input, false);
  assert.ok(messagesOf(reported).length > 0, `${title}: should report`);

  const fixed = await lintTs(input, true);
  assert.equal(fixed.output ?? input, expected, title);
  await assertValid(`${title}: after fix`, expected);
}

async function main() {
  const tsBlock = recommended.find((block) => block.rules && RULE in block.rules);
  assert.ok(tsBlock, 'recommended config should include grouped-class-fields');
  assert.equal(tsBlock.rules[RULE], 'error', 'grouped-class-fields should be error by default');
  assert.ok(plugin.rules['grouped-class-fields'], 'plugin should export grouped-class-fields');

  const preferred = source([
    'export class Example {',
    '  private readonly trackLinkApi = inject(TrackLinkApi);',
    '  private readonly memberSession = inject(SessionService);',
    '  private readonly router = inject(Router);',
    '  private readonly route = inject(ActivatedRoute);',
    '',
    '  readonly session = signal<GoogleStatus | null>(null);',
    '  readonly loadError = signal<string | null>(null);',
    '  readonly sessionPending = signal(true);',
    '}'
  ]);

  await assertValid('preferred inject/signal grouping', preferred);

  await assertFixed(
    'blank lines inside inject and signal groups',
    source([
      'export class Example {',
      '  private readonly trackLinkApi = inject(TrackLinkApi);',
      '',
      '  private readonly memberSession = inject(SessionService);',
      '',
      '  private readonly router = inject(Router);',
      '',
      '  private readonly route = inject(ActivatedRoute);',
      '',
      '  readonly session = signal<GoogleStatus | null>(null);',
      '',
      '  readonly loadError = signal<string | null>(null);',
      '',
      '  readonly sessionPending = signal(true);',
      '}'
    ]),
    preferred
  );

  await assertFixed(
    'missing blank line between inject and signal',
    source([
      'export class Example {',
      '  private readonly router = inject(Router);',
      '  readonly session = signal<GoogleStatus | null>(null);',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly router = inject(Router);',
      '',
      '  readonly session = signal<GoogleStatus | null>(null);',
      '}'
    ])
  );

  await assertFixed(
    'extra blank lines between groups',
    source([
      'export class Example {',
      '  private readonly router = inject(Router);',
      '',
      '',
      '  readonly session = signal<GoogleStatus | null>(null);',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly router = inject(Router);',
      '',
      '  readonly session = signal<GoogleStatus | null>(null);',
      '}'
    ])
  );

  await assertFixed(
    'input.required groups with input',
    source([
      'export class Example {',
      '  readonly name = input.required<string>();',
      '',
      '  readonly title = input<string>();',
      '  readonly session = signal(null);',
      '}'
    ]),
    source([
      'export class Example {',
      '  readonly name = input.required<string>();',
      '  readonly title = input<string>();',
      '',
      '  readonly session = signal(null);',
      '}'
    ])
  );

  await assertValid(
    'signal and computed stay separate',
    source([
      'export class Example {',
      '  readonly session = signal(null);',
      '  readonly loadError = signal(null);',
      '',
      '  readonly label = computed(() => this.session());',
      '}'
    ])
  );

  await assertFixed(
    'viewChild.required groups with viewChild',
    source([
      'export class Example {',
      '  readonly host = viewChild(ElementRef);',
      '',
      '  readonly button = viewChild.required(HTMLButtonElement);',
      '}'
    ]),
    source([
      'export class Example {',
      '  readonly host = viewChild(ElementRef);',
      '  readonly button = viewChild.required(HTMLButtonElement);',
      '}'
    ])
  );

  await assertValid(
    'plain class is linted',
    source([
      'class SessionStore {',
      '  private readonly api = inject(TrackLinkApi);',
      '  private readonly router = inject(Router);',
      '',
      '  readonly session = signal(null);',
      '}'
    ])
  );

  await assertFixed(
    'injectable service is linted',
    source([
      '@Injectable({ providedIn: \'root\' })',
      'class TrackLinkApi {',
      '  private readonly http = inject(HttpClient);',
      '',
      '  private readonly router = inject(Router);',
      '}'
    ]),
    source([
      '@Injectable({ providedIn: \'root\' })',
      'class TrackLinkApi {',
      '  private readonly http = inject(HttpClient);',
      '  private readonly router = inject(Router);',
      '}'
    ])
  );

  await assertFixed(
    'comment stays with the following field',
    source([
      'export class Example {',
      '  private readonly router = inject(Router);',
      '  // session state',
      '  readonly session = signal(null);',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly router = inject(Router);',
      '',
      '  // session state',
      '  readonly session = signal(null);',
      '}'
    ])
  );

  await assertFixed(
    'blank line before a same-group comment is removed',
    source([
      'export class Example {',
      '  private readonly api = inject(TrackLinkApi);',
      '',
      '  // router',
      '  private readonly router = inject(Router);',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly api = inject(TrackLinkApi);',
      '  // router',
      '  private readonly router = inject(Router);',
      '}'
    ])
  );

  await assertValid(
    'methods do not join field groups',
    source([
      'export class Example {',
      '  private readonly api = inject(TrackLinkApi);',
      '',
      '  save() {}',
      '',
      '  private readonly router = inject(Router);',
      '}'
    ])
  );

  await assertValid(
    'single field is ignored',
    source([
      'export class Example {',
      '  private readonly api = inject(TrackLinkApi);',
      '}'
    ])
  );

  await assertValid(
    'asReadonly still groups as signal',
    source([
      'export class Example {',
      '  readonly session = signal<GoogleStatus | null>(null);',
      '  readonly snapshot = signal(0).asReadonly();',
      '}'
    ])
  );

  await assertValid(
    'multiline same-group fields may keep a blank line',
    source([
      'export class Example {',
      '  private readonly api = inject(TrackLinkApi);',
      '',
      '  private readonly memberSession = inject(',
      '    SessionService',
      '  );',
      '',
      '  private readonly router = inject(Router);',
      '}'
    ])
  );

  await assertValid(
    'multiline same-group fields may stay packed',
    source([
      'export class Example {',
      '  private readonly api = inject(TrackLinkApi);',
      '  private readonly memberSession = inject(',
      '    SessionService',
      '  );',
      '  private readonly router = inject(Router);',
      '}'
    ])
  );

  await assertFixed(
    'multiline field still needs a blank line before a different group',
    source([
      'export class Example {',
      '  private readonly api = inject(',
      '    TrackLinkApi',
      '  );',
      '  readonly session = signal(null);',
      '}'
    ]),
    source([
      'export class Example {',
      '  private readonly api = inject(',
      '    TrackLinkApi',
      '  );',
      '',
      '  readonly session = signal(null);',
      '}'
    ])
  );

  console.log('grouped-class-fields: ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
