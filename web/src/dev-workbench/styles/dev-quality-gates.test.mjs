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

test('quality gates styles: keep compact tabs and table-local overflow', () => {
  assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/u)
  assert.match(
    css,
    /\.erp-dev-quality-governance-view \.ant-table-wrapper[\s\S]*?overflow-x:\s*auto/u
  )
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

test('quality gates styles: GitLab CI evidence stays compact and source-backed', () => {
  const evidence = css.match(
    /\.erp-dev-quality-server-evidence\s*\{([^}]+)\}/u
  )
  assert.ok(evidence, 'CI evidence retains its own bounded container')
  assert.match(evidence[1], /display:\s*grid;/u)
  assert.match(evidence[1], /min-width:\s*0;/u)
  assert.match(evidence[1], /border:\s*1px solid var\(--erp-border\);/u)
  assert.match(evidence[1], /background:\s*var\(--erp-surface-bg-soft\);/u)
  assert.doesNotMatch(evidence[1], /border-(?:inline-start|left):/u)
  assert.match(css, /\.erp-dev-quality-server-evidence__facts/u)
  assert.match(css, /\.erp-dev-quality-server-evidence__job-list/u)
  assert.match(css, /--quality-server-job-width/u)
  assert.match(css, /\.erp-dev-quality-server-pipeline__track/u)
  assert.match(css, /\.erp-dev-quality-server-pipeline__relationship/u)
  assert.match(css, /\.erp-dev-quality-server-pipeline__dag/u)
  assert.match(css, /\.erp-dev-quality-server-evidence__view-switch/u)
  assert.match(css, /\.erp-dev-quality-server-view/u)
  assert.match(css, /\.erp-dev-quality-server-history__table/u)
  assert.match(
    css,
    /\.erp-dev-quality-server-history__table-wrap[\s\S]*?overflow-x:\s*auto/u
  )

  assert.match(
    css,
    /\.erp-dev-quality-server-pipeline__phase\[data-phase='shards'\]/u
  )
  assert.match(css, /\.erp-dev-quality-server-pipeline__status--passed/u)
  assert.match(css, /\.erp-dev-quality-server-pipeline__status-indicator/u)
  assert.match(css, /\.erp-dev-quality-server-pipeline__node-guide-button/u)
  assert.match(css, /\.erp-dev-quality-job-guide-drawer \.ant-drawer-body/u)
  assert.match(css, /\.erp-dev-quality-job-guide-drawer__group/u)
  assert.match(css, /\.erp-dev-quality-job-guide-drawer__checks/u)
  assert.match(
    css,
    /\.erp-dev-quality-server-history__table td::before[\s\S]*?content:\s*attr\(data-label\)/u
  )
  assert.doesNotMatch(css, /\.erp-dev-quality-server-pipeline__connector/u)
})

test('quality gates styles: identity and content surfaces use the shared workbench combination', () => {
  const shared = readFileSync(new URL('./dev-workbench-pattern.css', import.meta.url), 'utf8')
  const context = readFileSync(new URL('../components/quality-gates/QualityGateContextStrip.jsx', import.meta.url), 'utf8')
  assert.match(context, /<WorkbenchFacts/u)
  assert.match(context, /<WorkbenchSection/u)
  assert.match(shared, /\.erp-workbench-facts\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/u)
  assert.doesNotMatch(css, /\.erp-dev-quality-context dl\s*\{/u)
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

test('quality gates styles: execution table keeps state semantics', () => {
  assert.match(css, /\.erp-dev-quality-flow__table/u)
  assert.match(css, /border-collapse:\s*collapse/u)
  assert.match(css, /\[data-status='failed'\]/u)
  assert.match(css, /\[data-emphasis='current'\]/u)
  assert.doesNotMatch(css, /\.erp-dev-quality-flow__track\s*\{/u)
})

test('quality gates styles: visual evidence stays semantic and scoped', () => {
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
  assert.doesNotMatch(css, /^\.erp-markdown-mermaid\s*\{/mu)
})
