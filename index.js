'use strict';

const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const stylisticTs = require('@stylistic/eslint-plugin-ts');
const stylisticJs = require('@stylistic/eslint-plugin-js');
const newlines = require('eslint-plugin-import-newlines');
const plugin = require('./plugin');

const DEFAULT_IGNORES = [
  '**/.angular/**',
  '**/android/**',
  '**/generated/*',
  '**/dist/**',
  '**/migrations/**',
  'release/**'
];

const typescriptRules = {
  'junolint/no-unicode-symbols': 'error',
  '@typescript-eslint/no-extraneous-class': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
  '@typescript-eslint/array-type': ['error', { default: 'array' }],
  '@typescript-eslint/consistent-type-definitions': 'error',
  '@typescript-eslint/dot-notation': 'off',
  '@stylistic/ts/indent': ['error', 2, {
    ignoredNodes: [
      'TSTypeParameterInstantiation',
      'FunctionExpression > .params[decorators.length > 0]',
      'FunctionExpression > .params > :matches(Decorator, :not(:first-child))',
      'ClassBody.body > PropertyDefinition[decorators.length > 0] > .key'
    ],
    SwitchCase: 1
  }],
  '@stylistic/ts/member-delimiter-style': ['error', {
    multiline: { delimiter: 'semi', requireLast: true },
    singleline: { delimiter: 'semi', requireLast: false }
  }],
  '@typescript-eslint/member-ordering': 'off',
  '@typescript-eslint/no-empty-function': 'off',
  '@typescript-eslint/no-empty-interface': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-invalid-this': 'error',
  '@typescript-eslint/no-namespace': 'error',
  '@typescript-eslint/prefer-namespace-keyword': 'error',
  '@typescript-eslint/no-unused-expressions': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
  '@typescript-eslint/no-var-requires': 'error',
  '@typescript-eslint/prefer-for-of': 'error',
  '@typescript-eslint/prefer-function-type': 'error',
  '@stylistic/ts/quotes': ['error', 'single', { avoidEscape: true }],
  '@stylistic/ts/semi': ['error', 'always'],
  '@stylistic/ts/type-annotation-spacing': 'error',
  '@typescript-eslint/unified-signatures': 'error',
  '@stylistic/js/array-bracket-spacing': 'error',
  '@stylistic/ts/comma-dangle': ['error', 'never'],
  '@stylistic/ts/comma-spacing': 'error',
  '@stylistic/js/comma-style': 'error',
  complexity: ['warn', { max: 20 }],
  curly: 'off',
  'eol-last': 'error',
  'id-denylist': ['warn', 'e', 'cb', 'i', 'c', 'any', 'string', 'String', 'Undefined', 'undefined', 'callback'],
  'max-len': ['error', { code: 150, ignoreComments: true }],
  'new-parens': 'error',
  'newline-per-chained-call': 'error',
  'no-bitwise': 'off',
  'no-cond-assign': 'error',
  'no-empty': 'off',
  'no-eval': 'error',
  '@stylistic/js/no-multi-spaces': 'error',
  '@stylistic/js/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 1 }],
  'no-new-wrappers': 'error',
  'no-restricted-imports': ['error', 'rxjs/Rx'],
  'no-throw-literal': 'error',
  'no-trailing-spaces': 'error',
  'no-undef-init': 'error',
  'no-unsafe-finally': 'error',
  'no-var': 'error',
  'one-var': ['error', 'never'],
  'prefer-const': 'error',
  '@stylistic/ts/space-before-blocks': 'error',
  '@stylistic/js/space-before-function-paren': ['error', {
    anonymous: 'never',
    asyncArrow: 'always',
    named: 'never'
  }],
  '@stylistic/ts/space-infix-ops': 'error',
  '@stylistic/js/space-in-parens': 'error',
  '@stylistic/js/space-unary-ops': 'error',
  '@stylistic/js/spaced-comment': ['error', 'always', { markers: ['/'] }],
  '@stylistic/js/array-element-newline': ['error', {
    multiline: true,
    minItems: 3
  }],
  '@stylistic/js/array-bracket-newline': ['error', {
    multiline: true,
    minItems: 3
  }],
  'import-newlines/enforce': ['error', 2],
  '@stylistic/js/block-spacing': ['error', 'always'],
  'nonblock-statement-body-position': ['error', 'below'],
  'max-statements-per-line': ['error', { max: 1 }],
  'id-length': ['error', { min: 2, properties: 'never', exceptions: ['_', 'x', 'y'] }],
  'padding-line-between-statements': [
    'error',
    { blankLine: 'always', prev: '*', next: 'if' },
    { blankLine: 'always', prev: 'if', next: '*' },
    { blankLine: 'always', prev: '*', next: 'block-like' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: ['function', 'multiline-expression'], next: '*' },
    { blankLine: 'always', prev: ['class', 'multiline-expression'], next: '*' },
    { blankLine: 'always', prev: 'const', next: '*' },
    { blankLine: 'always', prev: 'let', next: '*' },
    { blankLine: 'always', prev: 'var', next: '*' },
    { blankLine: 'never', prev: 'const', next: 'const' },
    { blankLine: 'never', prev: 'let', next: 'let' },
    { blankLine: 'never', prev: 'var', next: 'var' }
  ]
};

const angularTypescriptRules = {
  '@angular-eslint/component-max-inline-declarations': [
    'error',
    {
      template: 3,
      styles: 0
    }
  ],
  '@angular-eslint/component-class-suffix': ['error', { suffixes: ['Component', 'Page', 'Stub'] }],
  '@angular-eslint/directive-class-suffix': 'error'
};

// Matches metoyou/tools/sort-template-properties.js:
// outputs → two-way → #ref → inputs → attributes.
// STRUCTURAL_DIRECTIVE is required by the rule schema (*ngIf / @if extras).
const TEMPLATE_ATTRIBUTE_ORDER = [
  'STRUCTURAL_DIRECTIVE',
  'OUTPUT_BINDING',
  'TWO_WAY_BINDING',
  'TEMPLATE_REFERENCE',
  'INPUT_BINDING',
  'ATTRIBUTE_BINDING'
];

const angularTemplateRules = {
  'junolint/no-unicode-symbols': 'error',
  '@angular-eslint/template/attributes-order': ['error', {
    alphabetical: false,
    order: TEMPLATE_ATTRIBUTE_ORDER
  }],
  '@angular-eslint/template/button-has-type': 'warn',
  '@angular-eslint/template/cyclomatic-complexity': ['warn', { maxComplexity: 10 }],
  '@angular-eslint/template/eqeqeq': 'error',
  '@angular-eslint/template/prefer-control-flow': 'error',
  '@angular-eslint/template/prefer-ngsrc': 'warn',
  '@angular-eslint/template/prefer-self-closing-tags': 'warn',
  '@angular-eslint/template/use-track-by-function': 'warn',
  '@angular-eslint/template/no-negated-async': 'warn',
  '@angular-eslint/template/no-call-expression': 'off'
};

function createConfig(options = {}) {
  const includeAngular = options.angular !== false;
  const tsFiles = options.tsFiles ?? ['**/*.ts'];
  const htmlFiles = options.htmlFiles ?? ['**/*.html'];
  const ignores = [
    ...DEFAULT_IGNORES,
    ...(options.ignores ?? [])
  ];

  const blocks = [
    { ignores },
    {
      files: tsFiles,
      plugins: {
        '@stylistic/ts': stylisticTs,
        '@stylistic/js': stylisticJs,
        'import-newlines': newlines,
        junolint: plugin
      },
      extends: [
        eslint.configs.recommended,
        ...tseslint.configs.recommended,
        ...tseslint.configs.stylistic,
        ...(includeAngular ? angular.configs.tsRecommended : []),
        ...tseslint.configs.strict
      ],
      ...(includeAngular ? { processor: angular.processInlineTemplates } : {}),
      rules: {
        ...typescriptRules,
        ...(includeAngular ? angularTypescriptRules : {})
      }
    }
  ];

  if (includeAngular) {
    blocks.push({
      files: htmlFiles,
      plugins: { junolint: plugin },
      extends: [
        ...angular.configs.templateRecommended,
        ...angular.configs.templateAccessibility
      ],
      rules: angularTemplateRules
    });
  }

  return tseslint.config(...blocks);
}

const recommended = createConfig();

module.exports = recommended;
module.exports.config = createConfig;
module.exports.plugin = plugin;
module.exports.TEMPLATE_ATTRIBUTE_ORDER = TEMPLATE_ATTRIBUTE_ORDER;
module.exports.configs = {
  recommended,
  typescript: createConfig({ angular: false })
};
