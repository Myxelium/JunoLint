'use strict';

const assert = require('node:assert/strict');
const { ESLint } = require('eslint');
const angular = require('angular-eslint');
const plugin = require('../plugin');

async function lintHtml(source, fix, ruleIds) {
  const rules = {};
  for (const id of ruleIds)
    rules[`junolint/${id}`] = 'error';

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.html'],
        plugins: { junolint: plugin },
        languageOptions: { parser: angular.templateParser },
        rules
      }
    ],
    fix
  });

  const [result] = await eslint.lintText(source, { filePath: 'cmp.html' });
  return result;
}

function messagesFor(result, ruleId) {
  return result.messages.filter((message) => message.ruleId === `junolint/${ruleId}`);
}

async function main() {
  const packedSiblings = [
    '<page>',
    '  <div class="main">',
    '    <child1></child1>',
    '    <child1></child1>',
    '  </div>',
    '  <div class="main2">',
    '    <child1></child1>',
    '  </div>',
    '</page>',
    ''
  ].join('\n');

  const packed = await lintHtml(packedSiblings, true, ['template-sibling-spacing']);
  const spaced = packed.output ?? packedSiblings;
  const expectedSpaced = [
    '<page>',
    '  <div class="main">',
    '    <child1></child1>',
    '    <child1></child1>',
    '  </div>',
    '',
    '  <div class="main2">',
    '    <child1></child1>',
    '  </div>',
    '</page>',
    ''
  ].join('\n');

  assert.equal(spaced, expectedSpaced);

  const extraBlanks = [
    '<page>',
    '',
    '  <div>',
    '',
    '    <child1></child1>',
    '',
    '    <child1></child1>',
    '',
    '  </div>',
    '',
    '</page>',
    ''
  ].join('\n');

  const trimmed = await lintHtml(extraBlanks, true, ['template-sibling-spacing']);
  assert.equal(
    trimmed.output ?? extraBlanks,
    [
      '<page>',
      '  <div>',
      '    <child1></child1>',
      '    <child1></child1>',
      '  </div>',
      '</page>',
      ''
    ].join('\n')
  );

  const nestedOnlyChild = [
    '<page>',
    '  <wrapper>',
    '    <a></a>',
    '    <b></b>',
    '  </wrapper>',
    '</page>',
    ''
  ].join('\n');

  const nestedFixed = await lintHtml(nestedOnlyChild, true, ['template-sibling-spacing']);
  assert.equal(nestedFixed.output ?? nestedOnlyChild, nestedOnlyChild);

  const alreadyGood = await lintHtml(expectedSpaced, false, ['template-sibling-spacing']);
  assert.equal(messagesFor(alreadyGood, 'template-sibling-spacing').length, 0);

  const controlFlow = [
    '<page>',
    '  @if (ok) {',
    '    <span></span>',
    '    <em></em>',
    '  }',
    '</page>',
    ''
  ].join('\n');

  const controlFixed = await lintHtml(controlFlow, true, ['template-sibling-spacing']);
  assert.equal(controlFixed.output ?? controlFlow, controlFlow);

  const stops = [
    '<linearGradient>',
    '  <stop stop-color="#F0060B" />',
    '',
    '  <stop offset="0" stop-color="#F0070C" />',
    '',
    '  <stop offset=".526" stop-color="#CC26D5" />',
    '',
    '  <stop offset="1" stop-color="#7702FF" />',
    '</linearGradient>',
    ''
  ].join('\n');

  const packedStops = await lintHtml(stops, true, ['template-sibling-spacing']);
  assert.equal(
    packedStops.output ?? stops,
    [
      '<linearGradient>',
      '  <stop stop-color="#F0060B" />',
      '  <stop offset="0" stop-color="#F0070C" />',
      '  <stop offset=".526" stop-color="#CC26D5" />',
      '  <stop offset="1" stop-color="#7702FF" />',
      '</linearGradient>',
      ''
    ].join('\n')
  );

  const nestedGroups = [
    '<page>',
    '  <section>',
    '    <x></x>',
    '  </section>',
    '  <section>',
    '    <y></y>',
    '  </section>',
    '</page>',
    ''
  ].join('\n');

  const grouped = await lintHtml(nestedGroups, true, ['template-sibling-spacing']);
  assert.equal(
    grouped.output ?? nestedGroups,
    [
      '<page>',
      '  <section>',
      '    <x></x>',
      '  </section>',
      '',
      '  <section>',
      '    <y></y>',
      '  </section>',
      '</page>',
      ''
    ].join('\n')
  );

  const atLimit = [
    '<l1>',
    '  <l2>',
    '    <l3>',
    '      <l4>',
    '        <l5>',
    '          <l6>',
    '            <l7></l7>',
    '          </l6>',
    '        </l5>',
    '      </l4>',
    '    </l3>',
    '  </l2>',
    '</l1>',
    ''
  ].join('\n');

  const withinLimit = await lintHtml(atLimit, false, ['template-max-nesting']);
  assert.equal(messagesFor(withinLimit, 'template-max-nesting').length, 0);

  const deep = [
    '<page>',
    '  @if (ok) {',
    '    <ng-container>',
    '      <l1>',
    '        <l2>',
    '          <l3>',
    '            <l4>',
    '              <l5>',
    '                <l6>',
    '                  <kid></kid>',
    '                </l6>',
    '              </l5>',
    '            </l4>',
    '          </l3>',
    '        </l2>',
    '      </l1>',
    '    </ng-container>',
    '  }',
    '</page>',
    ''
  ].join('\n');

  const nesting = await lintHtml(deep, false, ['template-max-nesting']);
  const tooDeep = messagesFor(nesting, 'template-max-nesting');
  assert.equal(tooDeep.length, 1);
  assert.match(tooDeep[0].message, /8 levels deep/);

  const skippedWrappers = [
    '<page>',
    '  @for (item of items; track item) {',
    '    <ng-template>',
    '      @switch (item) {',
    '        @case (1) {',
    '          @defer {',
    '            <main>',
    '              <child></child>',
    '            </main>',
    '          }',
    '        }',
    '      }',
    '    </ng-template>',
    '  }',
    '</page>',
    ''
  ].join('\n');

  const skipped = await lintHtml(skippedWrappers, false, ['template-max-nesting']);
  assert.equal(messagesFor(skipped, 'template-max-nesting').length, 0);

  const threeAttrs = '<svg viewBox="0 0 1 1" class="a" id="b"></svg>\n';
  const wrapped = await lintHtml(threeAttrs, true, ['template-attribute-wrapping']);
  assert.equal(
    wrapped.output ?? threeAttrs,
    [
      '<svg',
      '  viewBox="0 0 1 1"',
      '  class="a"',
      '  id="b"',
      '>',
      '</svg>',
      ''
    ].join('\n')
  );

  const twoAttrs = '<img src="x" alt="y" />\n';
  const two = await lintHtml(twoAttrs, false, ['template-attribute-wrapping']);
  assert.equal(messagesFor(two, 'template-attribute-wrapping').length, 0);

  const twoMultiline = [
    '<img',
    '  src="x"',
    '  alt="y"',
    '/>',
    ''
  ].join('\n');
  const collapsed = await lintHtml(twoMultiline, true, ['template-attribute-wrapping']);
  assert.equal(collapsed.output ?? twoMultiline, twoAttrs);

  const banana = '<input class="a" [(ngModel)]="v" (blur)="onBlur()" />\n';
  const bananaFixed = await lintHtml(banana, true, ['template-attribute-wrapping']);
  assert.equal(
    bananaFixed.output ?? banana,
    [
      '<input',
      '  class="a"',
      '  [(ngModel)]="v"',
      '  (blur)="onBlur()"',
      '/>',
      ''
    ].join('\n')
  );

  const overIndented = [
    '<page>',
    '      <child></child>',
    '</page>',
    ''
  ].join('\n');
  const indentFixed = await lintHtml(overIndented, true, ['template-sibling-spacing']);
  assert.equal(
    indentFixed.output ?? overIndented,
    [
      '<page>',
      '  <child></child>',
      '</page>',
      ''
    ].join('\n')
  );

  const fourSpace = [
    '<page>',
    '    <main>',
    '        <child></child>',
    '    </main>',
    '    <aside>',
    '        <note></note>',
    '    </aside>',
    '</page>',
    ''
  ].join('\n');
  const fourFixed = await lintHtml(fourSpace, true, ['template-sibling-spacing']);
  assert.equal(
    fourFixed.output ?? fourSpace,
    [
      '<page>',
      '    <main>',
      '        <child></child>',
      '    </main>',
      '',
      '    <aside>',
      '        <note></note>',
      '    </aside>',
      '</page>',
      ''
    ].join('\n')
  );

  const tabbed = [
    '<page>',
    '\t<main>',
    '\t\t\t<child></child>',
    '\t</main>',
    '</page>',
    ''
  ].join('\n');
  const tabFixed = await lintHtml(tabbed, true, ['template-sibling-spacing']);
  assert.equal(
    tabFixed.output ?? tabbed,
    [
      '<page>',
      '\t<main>',
      '\t\t<child></child>',
      '\t</main>',
      '</page>',
      ''
    ].join('\n')
  );

  const fourWrap = [
    '<page>',
    '    <svg viewBox="0 0 1 1" class="a" id="b"></svg>',
    '</page>',
    ''
  ].join('\n');
  const fourWrapped = await lintHtml(fourWrap, true, ['template-attribute-wrapping']);
  assert.equal(
    fourWrapped.output ?? fourWrap,
    [
      '<page>',
      '    <svg',
      '        viewBox="0 0 1 1"',
      '        class="a"',
      '        id="b"',
      '    >',
      '    </svg>',
      '</page>',
      ''
    ].join('\n')
  );

  console.log('template-layout: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
