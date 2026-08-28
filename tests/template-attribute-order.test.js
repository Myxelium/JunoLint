'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const junolint = require('..');

async function lintHtml(source, fix) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [...junolint],
    fix
  });

  const [result] = await eslint.lintText(source, { filePath: 'cmp.html' });
  return result;
}

async function main() {
  const source = [
    '<div>',
    '  <button',
    '    class="save"',
    '    (click)="save()"',
    '    [disabled]="busy"',
    '    type="button"',
    '  >Save</button>',
    '  <button',
    '    (click)="cancel()"',
    '    [disabled]="false"',
    '    class="cancel"',
    '    type="button"',
    '  >Cancel</button>',
    '</div>',
    ''
  ].join('\n');

  const reported = await lintHtml(source, false);
  const orderMessages = reported.messages.filter(
    (message) => message.ruleId === '@angular-eslint/template/attributes-order'
  );

  assert.equal(orderMessages.length, 1, 'exactly one element should be reported');
  assert.ok(orderMessages[0].line < 8, 'report is on the first button, not the whole file');

  const fixed = await lintHtml(source, true);
  const output = fixed.output ?? source;
  const expected = [
    '<div>',
    '  <button',
    '    (click)="save()"',
    '    [disabled]="busy"',
    '    class="save"',
    '    type="button"',
    '  >Save</button>',
    '',
    '  <button',
    '    (click)="cancel()"',
    '    [disabled]="false"',
    '    class="cancel"',
    '    type="button"',
    '  >Cancel</button>',
    '</div>',
    ''
  ].join('\n');

  assert.equal(output, expected);
  console.log('template-attribute-order: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
