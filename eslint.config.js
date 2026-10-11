'use strict';

const plugin = require('./plugin');

module.exports = [
  {
    ignores: ['node_modules/**']
  },
  {
    files: ['**/*.js'],
    plugins: {
      junolint: plugin
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs'
    },
    rules: {
      'junolint/no-unicode-symbols': 'error',
      'junolint/no-maybe-in-naming': 'error',
      'junolint/no-leading-the': 'error',
      'junolint/no-magic-numbers': 'error',
      'junolint/no-deprecated': 'error',
      'junolint/sort-imports': 'error',
      'junolint/member-ordering': 'error',
      'junolint/grouped-class-fields': 'error'
    }
  }
];
