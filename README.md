<p align="center">
  <img src="assets/junolint-logo.png" alt="JunoLint logo" width="180">
</p>

<p align="center">
  <img src="assets/junoLintText.png" alt="JunoLint" width="360">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/junolint"><img src="https://img.shields.io/npm/v/junolint.svg?logo=npm&label=npm" alt="npm"></a>
  <a href="https://github.com/Myxelium/JunoLint"><img src="https://img.shields.io/badge/GitHub-Myxelium%2FJunoLint-181717?logo=github" alt="GitHub"></a>
</p>

# JunoLint

ESLint 9 config for Angular. It lints TypeScript and HTML templates: attribute order and wrapping, sibling spacing, nesting depth, class member order, grouped class fields, and a few naming rules. Most layout rules fix themselves with `eslint --fix`.

```js
// eslint.config.js
module.exports = require('junolint');
```

ESLint is a peer dependency. `junolint` brings typescript-eslint, angular-eslint, and the stylistic plugins with it.

Full rule list and options: [RULES.md](RULES.md).

## Install

```bash
npm install -D eslint junolint
```

From a local clone:

```bash
npm install -D eslint junolint@file:../JunoLint
```

## Setup

CommonJS:

```js
module.exports = require('junolint');
```

ESM:

```js
import junolint from 'junolint';

export default junolint;
```

Extra ignores or different file globs:

```js
const { config } = require('junolint');

module.exports = config({
  ignores: ['coverage/**'],
  htmlFiles: ['src/**/*.html'],
  tsFiles: ['src/**/*.ts']
});
```

TypeScript only (no Angular templates):

```js
module.exports = require('junolint').configs.typescript;
```

Or spread the config and add your own bits:

```js
module.exports = [
  ...require('junolint'),
  { ignores: ['e2e/**'] }
];
```

## Changing a rule

Spread the config, then set `rules`. Values are `'off'`, `'warn'`, `'error'`, or `[severity, options]`.

```js
module.exports = [
  ...require('junolint'),
  {
    files: ['**/*.html'],
    rules: {
      'junolint/template-sibling-spacing': 'off',
      'junolint/template-attribute-wrapping': 'warn',
      'junolint/template-max-nesting': ['error', { max: 5 }],
      '@angular-eslint/template/prefer-ngsrc': 'error'
    }
  },
  {
    files: ['**/*.ts'],
    rules: {
      'junolint/no-maybe-in-naming': 'off',
      'junolint/no-leading-the': 'off',
      'junolint/prefer-sentence-names': ['warn', { minLength: 0 }],
      'junolint/prefer-sentence-function-names': ['warn', { minLength: 0 }],
      'junolint/decompose-complex-expressions': ['warn', { threshold: 5 }],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];
```

Works for any rule the config enables. See [RULES.md](RULES.md).

## Custom rules

These ship on the `junolint` plugin. Most are `error` and support `--fix`.

### `junolint/template-attribute-wrapping`

error. One or two attributes stay on one line. Three or more: one per line, `>` on its own line, same indent as the file.

```html
<!-- before -->
<input class="field" [(ngModel)]="name" (blur)="onBlur()" />

<!-- after eslint --fix -->
<input
  class="field"
  [(ngModel)]="name"
  (blur)="onBlur()"
/>
```

### `@angular-eslint/template/attributes-order`

error. Per element: outputs, two-way, `#ref`, inputs, then attributes. `--fix` only touches that element.

```html
<!-- before -->
<button
  class="save"
  (click)="save()"
  [disabled]="busy"
  type="button"
>

<!-- after eslint --fix -->
<button
  (click)="save()"
  [disabled]="busy"
  class="save"
  type="button"
>
```

### `junolint/template-sibling-spacing`

error. Blank line between multiline siblings. Single-line siblings stay packed. No extra blank line after `<parent>` or before `</parent>`. Indent follows the file.

```html
<!-- before -->
<section>
  <header>
    <h1>Title</h1>
  </header>
  <article>
    <p>Body</p>
  </article>
</section>

<!-- after eslint --fix -->
<section>
  <header>
    <h1>Title</h1>
  </header>

  <article>
    <p>Body</p>
  </article>
</section>
```

Single-line siblings are left alone:

```html
<nav>
  <a>Home</a>
  <a>About</a>
</nav>
```

### `junolint/template-max-nesting`

warn. Max 7 real elements from the template root. `@if`, `@for`, `@switch`, `@defer`, `ng-container`, and `ng-template` do not count.

### `junolint/member-ordering`

error. Fields and `inject()` keep the order you wrote them. Then constructor, lifecycle, public methods, private methods. `--fix` does not move fields.

```ts
// before
export class Example {
  save() {}
  private readonly http = inject(HttpClient);
  ngOnInit() {}
  constructor() {}
  private helper() {}
}

// after eslint --fix
export class Example {
  private readonly http = inject(HttpClient);

  constructor() {}

  ngOnInit() {}

  save() {}

  private helper() {}
}
```

### `junolint/grouped-class-fields`

error. Consecutive single-line class fields that share a top-level initializer call stay packed. Different calls get one blank line between groups. `input.required` counts as `input` (same for `viewChild.required` → `viewChild`). If a field already spans more than one line, blank lines around it are left alone. Fields are not reordered. Applies to every class. `--fix` adjusts blank lines.

```ts
// before
export class Example {
  private readonly trackLinkApi = inject(TrackLinkApi);

  private readonly memberSession = inject(SessionService);

  private readonly router = inject(Router);

  readonly session = signal<GoogleStatus | null>(null);

  readonly loadError = signal<string | null>(null);
}

// after eslint --fix
export class Example {
  private readonly trackLinkApi = inject(TrackLinkApi);
  private readonly memberSession = inject(SessionService);
  private readonly router = inject(Router);

  readonly session = signal<GoogleStatus | null>(null);
  readonly loadError = signal<string | null>(null);
}
```

### `junolint/no-unicode-symbols`

error. Replaces en/em dashes, `...` lookalikes, and arrows with ASCII (`-`, `...`, `->`, `<-`).

### `junolint/no-maybe-in-naming`

error. Names like `maybeUser` fail. Pick something that says what the value is.

### `junolint/no-leading-the`

error. Names must not start with the word `the`. `theHttpClient` fails; `themeStudio` passes because the first word is `theme`, not `the`. Applies to variables, parameters, class fields, functions, and methods.

```ts
// fails
const theHttpClient = createClient();
function theLoader() {}
class Example {
  theCache() {}
}

// passes: the is part of a longer word, or not the first word
const themeStudio = createStudio();
const theoreticalLimit = 1;
function loadTheRecord() {}
```

### `junolint/prefer-sentence-names`

off. Push self-explaining names so other developers can tell what a value is without hunting for context. A single word (`user`, `data`, `configuration`) fails. A sentence of two or more camelCase or snake_case words passes. Applies to variables, parameters, and class fields.

`minLength` is an allowance, not a target: names shorter than it skip the check (`id`, `i`). Default is `0`, so short names are flagged.

```ts
// fails when enabled: other people cannot tell what this is
const user = load();
const data = load();
const configuration = load();

// passes: the name is the explanation
const theCurrentlyLoggedInUser = load();
const payloadFromTheServer = load();
```

```js
'junolint/prefer-sentence-names': ['warn', { minLength: 0, exceptions: ['timestamp'] }]
```

### `junolint/prefer-sentence-function-names`

off. Same idea as `prefer-sentence-names`, for functions and methods. A single word (`save`, `load`, `configuration`) fails. A sentence of two or more camelCase or snake_case words passes. Applies to function declarations, class methods, object methods, and interface method signatures. Constructors are skipped. Variables and class fields stay with `prefer-sentence-names`.

```ts
// fails when enabled
function save() {}
class Example {
  load() {}
}

// passes
function saveTheDocument() {}
class Example {
  loadTheRecord() {}
}
```

```js
'junolint/prefer-sentence-function-names': ['warn', { minLength: 0, exceptions: ['timestamp'] }]
```

### `junolint/decompose-complex-expressions`

off. Suggests extracting independent or nested computations into named steps. It does not count function calls, chain length, or AST nodes. Fluent APIs, array pipelines, Promise chains, and RxJS `pipe` are one compositional unit; complexity inside a stage is what matters. Two nested calls (`formatDate(parseDate(input))`) and object literals with several simple properties stay intact.

Enable it yourself. It is not on in the default config.

```ts
// fails when enabled: several independent computations in one expression
const result = createReport(
  calculateRevenue(orders),
  calculateExpenses(expenses),
  formatDate(startDate),
  getUserName(user)
);

// fails when enabled: nested transformations with no names
const result = formatUser(normalizeUser(calculateUserScore(user)));

// passes: fluent / pipeline composition
const names = users.filter(isActive).map(user => user.name);
const users$ = source$.pipe(filter(isActive), map(toUser), shareReplay(1));

// passes: a natural two-step wrap, lookups, short conditions
const parsed = formatDate(parseDate(input));
const canProceed = user?.active && hasPermission(user);
```

```js
'junolint/decompose-complex-expressions': ['warn', { threshold: 5 }]
```

Raise `threshold` to complain less. There is no `--fix`; automatic extraction is unsafe around side effects and short-circuiting.

| Rule | Default | `--fix` |
| --- | --- | --- |
| `junolint/template-attribute-wrapping` | error | yes |
| `@angular-eslint/template/attributes-order` | error | yes |
| `junolint/template-sibling-spacing` | error | yes |
| `junolint/template-max-nesting` | warn | no |
| `junolint/member-ordering` | error | yes (not fields) |
| `junolint/grouped-class-fields` | error | yes |
| `junolint/no-unicode-symbols` | error | yes |
| `junolint/no-maybe-in-naming` | error | no |
| `junolint/no-leading-the` | error | no |
| `junolint/prefer-sentence-names` | off | no |
| `junolint/prefer-sentence-function-names` | off | no |
| `junolint/decompose-complex-expressions` | off | no |
