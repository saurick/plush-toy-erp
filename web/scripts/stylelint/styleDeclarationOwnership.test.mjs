import assert from 'node:assert/strict'
import test from 'node:test'
import { findCrossFileStyleDeclarations } from './styleDeclarationOwnership.mjs'

test('same selector, condition and property have one file owner even with equal values', () => {
  for (const value of ['8px', '12px']) {
    const conflicts = findCrossFileStyleDeclarations([
      { file: 'component.css', css: '.page, .other { height: 8px; color: red; }' },
      { file: 'overrides.css', css: `.page { height: ${value}; }` },
    ])
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0].selector, '.page')
    assert.equal(conflicts[0].property, 'height')
    assert.deepEqual(conflicts[0].locations.map((item) => item.file), ['component.css', 'overrides.css'])
  }
})

test('shorthand and longhand declarations share constituent ownership in either source order', () => {
  for (const [shorthand, longhand, property] of [
    ['margin: 0 auto 12px', 'margin-bottom: 14px', 'margin-bottom'],
    ['padding: var(--space)', 'padding-left: 8px', 'padding-left'],
    ['overflow: auto', 'overflow-x: hidden', 'overflow-x'],
    ['gap: 12px', 'row-gap: 8px', 'row-gap'],
    ['flex: 0 0 28px', 'flex-basis: 26px', 'flex-basis'],
    ['font: inherit', 'line-height: 20px', 'line-height'],
    ['border: 1px solid black', 'border-top-color: red', 'border-top-color'],
    ['background: white', 'background-image: none', 'background-image'],
    ['padding-inline: 12px', 'padding-inline-start: 8px', 'padding-inline-start'],
  ]) {
    const sources = [{ file: 'a.css', css: `.page { ${shorthand}; }` }, { file: 'b.css', css: `.page { ${longhand}; }` }]
    for (const ordered of [sources, [...sources].reverse()]) {
      const conflicts = findCrossFileStyleDeclarations(ordered)
      assert.equal(conflicts.length, 1, `${shorthand} / ${longhand}`)
      assert.equal(conflicts[0].property, property)
    }
  }
})

test('different constituents, conditions, custom properties and local fallbacks remain independent', () => {
  assert.deepEqual(findCrossFileStyleDeclarations([
    { file: 'a.css', css: '.page { margin-top: 8px; padding: 8px; padding-top: 12px; --font: 1; }' },
    { file: 'b.css', css: '.page { margin-bottom: 12px; --Font: 2; } @media (max-width: 600px) { .page { padding-top: 4px; } } .page:hover { padding-left: 8px; }' },
  ]), [])
  const conflicts = findCrossFileStyleDeclarations([
    { file: 'a.css', css: '.page { border: 1px solid red; }' },
    { file: 'b.css', css: '.page { border-color: red; }' },
  ])
  assert.deepEqual(conflicts.map((entry) => entry.property).sort(), ['border-bottom-color', 'border-left-color', 'border-right-color', 'border-top-color'])
})

test('theme, breakpoint and component states remain independent', () => {
  assert.deepEqual(findCrossFileStyleDeclarations([
    { file: 'base.css', css: '.page { gap: 12px; min-height: 100vh; min-height: 100dvh; }' },
    { file: 'responsive.css', css: '@media (max-width: 600px) { .page { gap: 8px; } }' },
    { file: 'theme.css', css: '[data-theme="dark"] .page { gap: 10px; } .page:hover { gap: 4px; }' },
    { file: 'layout.css', css: '.page { display: grid; } .other { gap: 12px; }' },
  ]), [])
  const conflicts = findCrossFileStyleDeclarations([
    { file: 'a.css', css: '@media (max-width: 600px) { .page { gap: 8px; } }' },
    { file: 'b.css', css: '@media (max-width: 600px) { .page { gap: 10px; } }' },
  ])
  assert.equal(conflicts.length, 2)
  assert.deepEqual(conflicts.map((entry) => entry.property).sort(), ['column-gap', 'row-gap'])
  assert.deepEqual(conflicts[0].conditions, ['@media (max-width: 600px)'])
})

test('selector-list alternatives and whitespace cannot hide duplicate declarations', () => {
  const conflicts = findCrossFileStyleDeclarations([
    { file: 'a.css', css: '.page\n  :is(.left, .right) { COLOR: red; --Case: 1; }' },
    { file: 'b.css', css: '.page :is(.left,.right), .other { color: blue; --case: 2; }' },
  ])
  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].property, 'color')
  assert.deepEqual(findCrossFileStyleDeclarations([
    { file: 'a.css', css: '.page[data-label="two  spaces"] { color: red; }' },
    { file: 'b.css', css: '.page[data-label="two spaces"] { color: blue; }' },
  ]), [])
})

test('keyframe steps and font faces are not component selectors', () => {
  const css = '@keyframes fade { from { opacity: 0; } to { opacity: 1; } } @font-face { font-family: Sample; src: url(example.woff2); }'
  assert.deepEqual(findCrossFileStyleDeclarations([{ file: 'a.css', css }, { file: 'b.css', css }]), [])
})
