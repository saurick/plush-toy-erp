import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(
  new URL('./dev-quality-gates.css', import.meta.url),
  'utf8'
)
const styleIndex = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

test('quality gates styles: stay page-scoped and imported after shared navigation', () => {
  assert.match(styleIndex, /@import '.\/dev-quality-gates\.css';/u)
  assert.match(css, /\.erp-dev-quality-tabs\.erp-dev-task-nav/u)
  assert.doesNotMatch(css, /^\.erp-dev-task-nav\s*\{/mu)
})

test('quality gates styles: keep three compact tabs and table-local overflow on mobile', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/u)
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.erp-dev-quality-tabs/u
  )
  assert.match(
    css,
    /\.erp-dev-quality-governance-view \.ant-table-wrapper[\s\S]*?overflow-x:\s*auto/u
  )
  assert.match(css, /@media \(max-width: 340px\)/u)
})

test('quality gates styles: reduced motion and long-content recovery remain explicit', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u)
  assert.match(css, /overflow-wrap:\s*anywhere/u)
  assert.match(css, /max-width:\s*100%/u)
})
