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

test('quality gates styles: environment readiness stays page-owned and compact', () => {
  assert.match(css, /\.erp-dev-quality-actions__environment/u)
  assert.match(
    css,
    /\.erp-dev-quality-actions__environment[\s\S]*?border-top:/u
  )
  assert.doesNotMatch(css, /^\.ant-alert\s*\{/mu)
})

test('quality gates styles: use project theme tokens instead of missing Ant CSS variables', () => {
  assert.doesNotMatch(css, /--ant-color-/u)
  for (const token of [
    '--erp-surface-bg',
    '--erp-surface-bg-soft',
    '--erp-border',
    '--erp-text-muted',
    '--erp-primary',
  ]) {
    assert.match(css, new RegExp(token, 'u'))
  }
})

test('quality gates styles: execution track is stateful and becomes vertical on mobile', () => {
  assert.match(css, /\.erp-dev-quality-flow__track/u)
  assert.match(
    css,
    /grid-template-columns:\s*repeat\([\s\S]*?--quality-flow-columns/u
  )
  assert.match(css, /\[data-status='running'\]/u)
  assert.match(css, /\[data-status='failed'\]/u)
  assert.match(css, /\[data-emphasis='current'\]/u)
  assert.match(css, /\[data-emphasis='failed'\]/u)
  assert.match(css, /\[data-emphasis='longest'\]/u)
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.erp-dev-quality-flow__track,[\s\S]*?grid-template-columns:\s*1fr/u
  )
})

test('quality gates styles: visual evidence stays semantic, scoped and responsive', () => {
  for (const selector of [
    '.erp-dev-quality-duration__bar',
    '.erp-dev-quality-history-trend__list',
    '.erp-dev-quality-coverage__table-wrap',
    '.erp-dev-quality-managed-database__body',
  ]) {
    assert.match(css, new RegExp(selector.replaceAll('.', '\\.'), 'u'))
  }
  assert.match(css, /--quality-duration-share/u)
  assert.match(css, /--quality-history-width/u)
  assert.match(
    css,
    /\.erp-dev-quality-coverage__table-wrap[\s\S]*?overflow-x:\s*auto/u
  )
  assert.match(
    css,
    /@media \(max-width: 600px\)[\s\S]*?\.erp-dev-quality-history-trend__list > li/u
  )
  assert.doesNotMatch(css, /^\.erp-markdown-mermaid\s*\{/mu)
})
