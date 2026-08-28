# JunoLint

Shareable ESLint 9 flat config plus custom rules. Installing this package also installs the plugins it needs (`typescript-eslint`, `angular-eslint`, `@stylistic/*`, and so on). Other repos only need ESLint itself.

## Install

```bash
npm install -D eslint junolint
```

`eslint` is a peer dependency so your `lint` script can run it. Everything else comes in with `junolint`.

From a sibling clone (unpublished / local):

```bash
npm install -D eslint junolint@file:../JunoLint
```

## Use

Replace a long `eslint.config.js` with:

```js
module.exports = require('junolint');
```

Or ESM:

```js
import junolint from 'junolint';

export default junolint;
```

That enables TypeScript + Angular template rules, stylistic rules, and `junolint/no-unicode-symbols`.

### TypeScript only (no Angular)

```js
module.exports = require('junolint').configs.typescript;
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

### Layer project-specific bits on top

```js
module.exports = [
  ...require('junolint'),
  { ignores: ['e2e/**'] }
];
```

## Custom plugin

The config already registers the plugin as `junolint`. Available rules:

| Rule | Default |
| --- | --- |
| `junolint/no-unicode-symbols` | error |
| `junolint/member-ordering` | error. Fields/`inject()` keep source order; then constructor, lifecycle, methods (public → private). `eslint --fix` does not reorder fields |
| `@angular-eslint/template/attributes-order` | error (outputs → two-way → `#ref` → inputs → attributes). `eslint --fix` reorders **that element only** |
| `junolint/template-sibling-spacing` | error. Blank line between **multiline** siblings; single-line siblings stay packed. Indentation matches the file (tabs vs spaces, and the step size). No extra blank line after `<parent>` or before `</parent>`. `eslint --fix` |
| `junolint/template-max-nesting` | warn. Max 7 real elements from the template root. `@if` / `@for` / `@switch` / `@defer` / `ng-container` / `ng-template` do not count. Suggests extracting a component |
| `junolint/template-attribute-wrapping` | error. 3+ attributes: one per line, `>` on its own line, indented with the file's indent. 1–2 stay on one line. `eslint --fix` |
| `junolint/no-maybe-in-naming` | off |

```js
module.exports = [
  ...require('junolint'),
  {
    rules: {
      'junolint/no-maybe-in-naming': 'error'
    }
  }
];
```

## Publish (GitHub → npm)

Pushing `main` runs [`.github/workflows/release.yml`](.github/workflows/release.yml): tests, then `npm publish` via [trusted publishing](https://docs.npmjs.com/trusted-publishers/) if `package.json` has a version that is not on npm yet, then a GitHub Release. Gitea can mirror the git repo; it is not used to publish.

### Cut a release

Bump the version in `package.json` and push `main`:

```bash
npm version patch   # or minor / major — bumps package.json and commits
git push origin main
```
