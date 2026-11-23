import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stylesheet = readFileSync(
  new URL('./business-tables.css', import.meta.url),
  'utf8'
)
const copyStyles = readFileSync(
  new URL('../../components/business-list/businessCopy.css', import.meta.url),
  'utf8'
)

test('business page headers share compact layout without decorative count tiles', () => {
  assert.doesNotMatch(stylesheet, /erp-business-page-header-card__stat/u)
  const rule = stylesheet.match(/\.erp-business-page-header-card__grid\s*\{([^}]*)\}/u)
  assert.ok(rule)
  assert.match(rule[1], /display:\s*flex/u)
  assert.match(rule[1], /flex-wrap:\s*wrap/u)
})

test('copyable table cells reveal a real button on hover and keyboard focus', () => {
  assert.match(
    copyStyles,
    /\[data-copy-reveal='hover'\]:is\(:hover, :focus-within\)\s*>\s*\.erp-business-copy-button\.ant-btn\s*\{\s*opacity:\s*1\s*;/u
  )
  assert.match(
    copyStyles,
    /@media\s*\(hover:\s*hover\)\s+and\s+\(pointer:\s*fine\)\s*\{[^}]*opacity:\s*0\s*;/u
  )
})

test('copyable table content keeps the project full-text wrapping contract', () => {
  const rule = stylesheet.match(
    /\.erp-business-table-copyable-cell__content\s*\{([^}]*)\}/u
  )
  assert.ok(rule, 'expected copyable table cell content rule')
  assert.match(rule[1], /white-space:\s*normal\s*;/u)
  assert.match(rule[1], /overflow-wrap:\s*anywhere\s*;/u)
  assert.doesNotMatch(rule[1], /text-overflow:\s*ellipsis\s*;/u)
})
