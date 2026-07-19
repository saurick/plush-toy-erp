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
