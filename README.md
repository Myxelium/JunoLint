<p align="center">
  <img src="https://raw.githubusercontent.com/Myxelium/JunoLint/main/assets/junolint-logo.png" alt="JunoLint logo" width="180">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/Myxelium/JunoLint/main/assets/junoLintText.png" alt="JunoLint" width="360">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/junolint"><img src="https://img.shields.io/npm/v/junolint.svg?logo=npm&label=npm" alt="npm"></a>
  <a href="https://github.com/Myxelium/JunoLint"><img src="https://img.shields.io/badge/GitHub-Myxelium%2FJunoLint-181717?logo=github" alt="GitHub"></a>
</p>

# JunoLint

Shareable [ESLint 9](https://eslint.org/) flat config for Angular. It lints TypeScript and HTML templates. Most layout rules fix themselves with `eslint --fix`.

Node 20.19+, ESLint 9, and TypeScript 5 are required. `junolint` brings typescript-eslint, angular-eslint, and the stylistic plugins with it.

```js
// eslint.config.js
module.exports = require('junolint');
```

## Install

```bash
npm install -D eslint junolint
```

Install `typescript` as well if the project does not already have it.

## Setup

CommonJS (`eslint.config.js`):

```js
module.exports = require('junolint');
```

ESM (`eslint.config.mjs`):

```js
import junolint from 'junolint';

export default junolint;
```

Add ignores or change file globs:

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

Or spread the recommended config and add your own blocks:

```js
module.exports = [
  ...require('junolint'),
  { ignores: ['e2e/**'] }
];
```

Default ignores already include `.angular`, `android`, `generated`, `dist`, `migrations`, and `release`.

## Override a rule

Spread the config, then set `rules`. Values are `'off'`, `'warn'`, `'error'`, or `[severity, options]`.

```js
module.exports = [
  ...require('junolint'),
  {
    files: ['**/*.html'],
    rules: {
      'junolint/template-sibling-spacing': 'off',
      'junolint/template-max-nesting': ['error', { max: 5 }]
    }
  },
  {
    files: ['**/*.ts'],
    rules: {
      'junolint/no-magic-numbers': ['error', { allowed: [404, 500] }],
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];
```

Every rule the config enables can be changed this way. The full catalog is in [RULES.md](https://github.com/Myxelium/JunoLint/blob/main/RULES.md).

## Custom rules

These ship on the `junolint` plugin.

| Rule | Default | `--fix` |
| --- | --- | --- |
| `junolint/template-attribute-wrapping` | error | yes |
| `@angular-eslint/template/attributes-order` | error | yes |
| `junolint/template-sibling-spacing` | error | yes |
| `junolint/template-max-nesting` | warn | no |
| `junolint/member-ordering` | error | yes (not fields) |
| `junolint/grouped-class-fields` | error | yes |
| `junolint/sort-imports` | error | yes |
| `junolint/explicit-function-return-type` | error | yes (void / never / literals / `as`) |
| `junolint/component-own-folder` | error | yes (CLI) |
| `junolint/component-max-external-types` | warn | no |
| `junolint/no-unicode-symbols` | error | yes |
| `junolint/no-maybe-in-naming` | error | no |
| `junolint/no-leading-the` | error | no |
| `junolint/no-magic-numbers` | error | no |
| `junolint/no-deprecated` | error | no |
| `junolint/prefer-sentence-names` | off | no |
| `junolint/prefer-sentence-function-names` | off | no |
| `junolint/decompose-complex-expressions` | off | no |

### `junolint/template-attribute-wrapping`

One or two attributes stay on one line. Three or more wrap: one per line, `>` on its own line.

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

Per element: structural, outputs, two-way, `#ref`, inputs, then attributes.

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

Blank line between multiline siblings. Single-line siblings stay packed.

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

### `junolint/template-max-nesting`

Warns past 7 real elements from the template root. `@if`, `@for`, `@switch`, `@defer`, `ng-container`, and `ng-template` do not count.

```js
'junolint/template-max-nesting': ['warn', { max: 5 }]
```

### `junolint/member-ordering`

Fields and `inject()` keep the order you wrote them. Then constructor, `ngOnInit`, other lifecycle hooks, public methods, private methods, and `ngOnDestroy` last. `--fix` does not move fields.

```ts
// before
export class Example {
  save() {}
  private readonly http = inject(HttpClient);
  ngOnDestroy() {}
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

  ngOnDestroy() {}
}
```

### `junolint/grouped-class-fields`

Consecutive single-line fields that share a top-level initializer call stay packed. Different calls get one blank line between groups. `input.required` counts as `input`. Fields are not reordered.

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

### `junolint/sort-imports`

Packages first (A–Z), then a blank line, then relative paths (`../` before `./`). Named specifiers inside `{ }` are sorted too. Side-effect imports stay put.

```ts
// before
import { Router } from '@angular/router';
import { Input, Component } from '@angular/core';
import { UserService } from './user.service';
import { CommonModule } from '@angular/common';

// after eslint --fix
import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';

import { UserService } from './user.service';
```

### `junolint/explicit-function-return-type`

Functions and methods must write a return type. Constructors, setters, and callbacks passed into a call are skipped unless you set `checkCallbacks`. `--fix` fills in `void`, `never`, a primitive literal, or an `as` type when every path is obvious.

```ts
// before
function save() {}
const count = () => 1;
async function load() {
  return getUser() as User;
}

// after eslint --fix
function save(): void {}
const count = (): number => 1;
async function load(): Promise<User> {
  return getUser() as User;
}

// still reported, no --fix
function read() {
  return getUser();
}
```

```js
'junolint/explicit-function-return-type': ['error', { checkCallbacks: true, allowedNames: ['legacyAdapter'] }]
```

### `junolint/component-own-folder`

One `@Component` as a direct child of any folder is fine. A second differently named component must move into its own subfolder, unless the name before the first `.` matches the folder (`login/` keeps `login.component.ts` and `login-page.component.ts`). CLI `eslint --fix` moves the files and rewrites relative imports.

```
login/login-page.component.ts
login/Logout.component.ts

# after eslint --fix
login/login-page.component.ts
login/Logout/Logout.component.ts
```

```js
'junolint/component-own-folder': ['error', { suffixes: ['component', 'page'] }]
```

### `junolint/component-max-external-types`

A `@Component` file may keep two interfaces, type aliases, or enums next to the class. A third one belongs in a types file.

```ts
interface UserRow {
  name: string;
}

type Mode = 'edit' | 'view';

@Component({ selector: 'app-user-card', template: '<p>Hi</p>' })
export class UserCardComponent {}

// fails: a third type outside the component
enum Status {
  Active,
  Idle
}
```

```js
'junolint/component-max-external-types': ['warn', { max: 2 }]
```

### `junolint/no-unicode-symbols`

Replaces en/em dashes, ellipsis, and arrows with ASCII (`-`, `...`, `->`, `<-`, `=>`).

### `junolint/no-maybe-in-naming`

Names that contain `maybe` fail. Use a name that states what the value is.

### `junolint/no-leading-the`

Names must not start with the word `the`. `theHttpClient` fails; `themeStudio` and `loadTheRecord` pass.

### `junolint/no-magic-numbers`

Bare numbers in expressions must be common values (`-2` to `2`, plus powers of ten such as `10`, `100`, `1000`) or extracted to a name.

```ts
// fails
setTimeout(handler, 2000);
if (status === 404) {}

// passes
setTimeout(handler, 2 * 1000);
const notFoundStatus = 404;
if (status === notFoundStatus) {}
const percent = ratio * 100;
```

```js
'junolint/no-magic-numbers': ['error', { allowed: [404, 500] }]
```

### `junolint/no-deprecated`

Uses of a name marked `@deprecated` in JSDoc fail. Declaring something deprecated is fine. `allow` skips exact names. With type-aware linting (`parserOptions.projectService: true`), imported and library APIs are checked too.

```ts
/** @deprecated Use saveDocument instead */
function saveLegacy() {}

saveLegacy(); // fails
```

```js
'junolint/no-deprecated': ['error', { allow: ['legacyAdapter'] }]
```

### Off by default

`junolint/prefer-sentence-names` and `junolint/prefer-sentence-function-names` require two or more camelCase or snake_case words (`currentlyLoggedInUser`, `saveTheDocument`). A single word (`user`, `save`) fails.

`junolint/decompose-complex-expressions` asks you to extract independent or nested computations. Fluent pipelines and RxJS `pipe` are left alone. Raise `threshold` (default `5`) to complain less.

```js
'junolint/prefer-sentence-names': ['warn', { minLength: 0, exceptions: ['timestamp'] }],
'junolint/prefer-sentence-function-names': ['warn', { minLength: 0 }],
'junolint/decompose-complex-expressions': ['warn', { threshold: 5 }]
```
