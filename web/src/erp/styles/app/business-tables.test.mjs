import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const stylesheet = readFileSync(
  new URL('./business-tables.css', import.meta.url),
  'utf8'
)

test('business header stat labels can use the full tile width', () => {
  const rule = stylesheet.match(
    /\.erp-business-page-header-card__stats \.ant-typography\s*\{([^}]*)\}/
  )

  assert.ok(rule, 'expected the business header stat label rule')
  assert.match(rule[1], /max-width:\s*100%\s*;/)
  assert.doesNotMatch(rule[1], /calc\(100%\s*-\s*46px\)/)
  assert.match(rule[1], /word-break:\s*keep-all\s*;/)
})

test('copyable table cells reveal a real button on hover and keyboard focus', () => {
  assert.match(
    stylesheet,
    /\.erp-business-table-copyable-cell:hover[\s\S]*?\.erp-business-table-copyable-cell__button\.ant-btn[\s\S]*?opacity:\s*1\s*;/u
  )
  assert.match(
    stylesheet,
    /\.erp-business-table-copyable-cell:focus-within[\s\S]*?\.erp-business-table-copyable-cell__button\.ant-btn/u
  )
  assert.match(stylesheet, /@media\s*\(hover:\s*none\)\s*\{/u)
  assert.doesNotMatch(
    stylesheet,
    /@media\s*\(hover:\s*none\)\s+and\s+\(pointer:\s*coarse\)\s*\{/u
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
