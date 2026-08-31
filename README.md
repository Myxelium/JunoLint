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

JunoLint is an opinionated linter for **Angular**. Drop it into a project and it checks TypeScript and HTML templates the same way every time: how components are structured, how template attributes are ordered and wrapped, how deep markup may nest, and how class members are arranged so `inject()` field init stays valid. Most layout rules auto-fix with `eslint --fix`.

```js
// eslint.config.js
module.exports = require('junolint');
```

That is the whole config. Templates, components, and TypeScript all lint with one setup.

## What it does

Out of the box it:

- Lints `*.ts` with TypeScript ESLint (recommended + stylistic + strict) and Angular component/directive conventions
- Lints `*.html` with `angular-eslint` template + accessibility rules
- Formats Angular templates: attribute order, wrapping, sibling spacing, and a nesting-depth warning
- Enforces a class member order that keeps `inject()` field init valid
- Blocks AI-style Unicode punctuation (`→`, `…`, en/em dashes) in favor of ASCII
- Rejects identifiers that contain `maybe` (for example `maybeUser`)

TypeScript-only projects can skip the Angular template layer (see [TypeScript only](#typescript-only-no-angular)).

## Install

```bash
npm install -D eslint junolint
```

`eslint` is a peer dependency so your `lint` script can run it. JunoLint pulls in the rest (`typescript-eslint`, `angular-eslint`, `@stylistic/*`, and so on), so other repos only need ESLint itself.

From a sibling clone (unpublished / local):

```bash
npm install -D eslint junolint@file:../JunoLint
```

## Use

CommonJS:

```js
module.exports = require('junolint');
```

ESM:

```js
import junolint from 'junolint';

export default junolint;
```

### Extra ignores or different globs

```js
const { config } = require('junolint');

module.exports = config({
  ignores: ['coverage/**'],
  htmlFiles: ['src/**/*.html'],
  tsFiles: ['src/**/*.ts']
});
```

### TypeScript only (no Angular)

```js
module.exports = require('junolint').configs.typescript;
```

### Layer project-specific bits on top

```js
module.exports = [
  ...require('junolint'),
  { ignores: ['e2e/**'] }
];
```

## Custom rules (before / after)

The config already registers the plugin as `junolint`. Most of these are `error` and auto-fix with `eslint --fix`.

### Attribute wrapping — `junolint/template-attribute-wrapping`

**error.** 1–2 attributes stay on one line. 3+ attributes: one per line, `>` on its own line, indented with the file (tabs or spaces).

**Before**

```html
<input class="field" [(ngModel)]="name" (blur)="onBlur()" />
```

**After** (`eslint --fix`)

```html
<input
  class="field"
  [(ngModel)]="name"
  (blur)="onBlur()"
/>
```

### Attribute order — `@angular-eslint/template/attributes-order`

**error.** Per element: outputs → two-way → `#ref` → inputs → attributes. `eslint --fix` reorders **that element only**.

**Before**

```html
<button
  class="save"
  (click)="save()"
  [disabled]="busy"
  type="button"
>
```

**After** (`eslint --fix`)

```html
<button
  (click)="save()"
  [disabled]="busy"
  class="save"
  type="button"
>
```

### Sibling spacing — `junolint/template-sibling-spacing`

**error.** Blank line between **multiline** siblings; single-line siblings stay packed. No extra blank line after `<parent>` or before `</parent>`. Indentation matches the file.

**Before**

```html
<section>
  <header>
    <h1>Title</h1>
  </header>
  <article>
    <p>Body</p>
  </article>
</section>
```

**After** (`eslint --fix`)

```html
<section>
  <header>
    <h1>Title</h1>
  </header>

  <article>
    <p>Body</p>
  </article>
</section>
```

Packed (left as-is):

```html
<nav>
  <a>Home</a>
  <a>About</a>
</nav>
```

### Max nesting — `junolint/template-max-nesting`

**warn.** Max 7 real elements from the template root. `@if` / `@for` / `@switch` / `@defer` / `ng-container` / `ng-template` do not count. Suggests extracting a component.

### Member order — `junolint/member-ordering`

**error.** Fields / `inject()` keep source order; then constructor, lifecycle, methods (public → private). `eslint --fix` does not reorder fields, so Angular field init stays valid.

**Before**

```ts
export class Example {
  save() {}
  private readonly http = inject(HttpClient);
  ngOnInit() {}
  constructor() {}
  private helper() {}
}
```

**After** (`eslint --fix`)

```ts
export class Example {
  private readonly http = inject(HttpClient);

  constructor() {}

  ngOnInit() {}

  save() {}

  private helper() {}
}
```

### Unicode symbols — `junolint/no-unicode-symbols`

**error.** Replaces `–` `—` `…` `→` `←` and similar with ASCII (`-`, `...`, `->`, `<-`).

### `maybe` in names — `junolint/no-maybe-in-naming`

**error.** Identifiers like `maybeUser` are rejected. Use a name that states intent.

| Rule | Default | `--fix` |
| --- | --- | --- |
| `junolint/template-attribute-wrapping` | error | yes |
| `@angular-eslint/template/attributes-order` | error | yes |
| `junolint/template-sibling-spacing` | error | yes |
| `junolint/template-max-nesting` | warn | no |
| `junolint/member-ordering` | error | yes (not fields) |
| `junolint/no-unicode-symbols` | error | yes |
| `junolint/no-maybe-in-naming` | error | no |

## Turn rules on, off, or change them

JunoLint is a flat config array. Spread it, then add a block whose `rules` override the defaults. Use `'off'`, `'warn'`, `'error'`, or `[severity, options]`.

```js
module.exports = [
  ...require('junolint'),
  {
    files: ['**/*.html'],
    rules: {
      // turn off
      'junolint/template-sibling-spacing': 'off',
      // downgrade
      'junolint/template-attribute-wrapping': 'warn',
      // change options
      'junolint/template-max-nesting': ['error', { max: 5 }],
      // override a bundled angular-eslint rule
      '@angular-eslint/template/prefer-ngsrc': 'error'
    }
  },
  {
    files: ['**/*.ts'],
    rules: {
      // turn off
      'junolint/no-maybe-in-naming': 'off',
      // relax a bundled TypeScript rule
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];
```

The same pattern works for any rule this package turns on (`@typescript-eslint/*`, `@angular-eslint/*`, `@stylistic/*`, and so on). Defaults live in [`index.js`](index.js).

## Publish (GitHub → npm)

Pushing `main` runs [`.github/workflows/release.yml`](.github/workflows/release.yml): tests, then `npm publish` via [trusted publishing](https://docs.npmjs.com/trusted-publishers/) if `package.json` has a version that is not on npm yet, then a GitHub Release. Gitea can mirror the git repo; it is not used to publish.

### Cut a release

Bump the version in `package.json` and push `main`:

```bash
npm version patch   # or minor / major — bumps package.json and commits
git push origin main
```
