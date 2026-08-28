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
| `junolint/no-maybe-in-naming` | off |
| `junolint/angular-template-spacing` | off (placeholder) |

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

Releases are cut from [github.com/Myxelium/JunoLint](https://github.com/Myxelium/JunoLint) only. Pushing a version tag `vX.Y.Z` runs [`.github/workflows/release.yml`](.github/workflows/release.yml): tests, `npm publish` via [trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC, no npm token), then a GitHub Release. Gitea can mirror the git repo; it is not used to publish.

### Cut a release

```bash
npm version patch   # or minor / major — bumps package.json, commits, tags vX.Y.Z
git push origin main --follow-tags
```

The tag must match `package.json` (`v1.0.0` ↔ `"version": "1.0.0"`). The workflow will fail if they differ.
