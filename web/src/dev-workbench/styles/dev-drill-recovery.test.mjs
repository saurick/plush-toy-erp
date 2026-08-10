import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(
  new URL('./dev-drill-recovery.css', import.meta.url),
  'utf8'
)
const styleIndex = readFileSync(new URL('./index.css', import.meta.url), 'utf8')
const page = readFileSync(
  new URL('../pages/DevDrillRecoveryPage.jsx', import.meta.url),
  'utf8'
)

test('drill recovery styles: stay page-scoped and use one imported surface', () => {
  assert.match(styleIndex, /@import '.\/dev-drill-recovery\.css';/u)
  assert.match(css, /\.erp-dev-recovery-page/u)
  assert.doesNotMatch(css, /^\.ant-(?:card|list|alert|btn)\s*\{/mu)
})

test('drill recovery layout: leads with one conclusion and avoids a drill card wall', () => {
  assert.match(
    css,
    /\.erp-dev-recovery-overview \.ant-card-body \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 0\.38fr\);/u
  )
  assert.match(page, /当前恢复准备度/u)
  assert.match(page, /下一步建议/u)
  assert.match(page, /<details[\s\S]*<summary>/u)
  assert.match(page, /overview\.drills\.map/u)
  assert.match(page, /open=\{open\}/u)
  assert.match(page, /globalThis\.matchMedia\?\.\('\(min-width: 721px\)'\)/u)
  assert.match(
    page,
    /onToggle=\{\(event\) => setOpen\(event\.currentTarget\.open\)\}/u
  )
  assert.doesNotMatch(page, /function DrillCard|erp-dev-recovery-drills/u)
})

test('drill recovery layout: keeps scan fields visible and evidence on demand', () => {
  assert.match(
    css,
    /\.erp-dev-recovery-list-head,[\s\S]*\.erp-dev-recovery-row > summary \{[\s\S]*grid-template-columns:/u
  )
  assert.match(page, /优先级[\s\S]*演练[\s\S]*状态[\s\S]*建议频率/u)
  assert.match(page, /变化时触发/u)
  assert.match(page, /完成证据/u)
  assert.match(page, /erp-dev-recovery-row__purpose/u)
  assert.match(
    page,
    /const recentOperations = overview\.operations\.slice\(0, 3\)/u
  )
  assert.match(css, /overflow-wrap: anywhere/u)
})

test('drill recovery styles: mobile becomes one readable column with full-width actions', () => {
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*\.erp-dev-recovery-page \.erp-dev-workspace-nav \{[\s\S]*position: static;/u
  )
  assert.match(
    css,
    /@media \(max-width: 720px\)[\s\S]*\.erp-dev-recovery-overview__facts,[\s\S]*grid-template-columns: minmax\(0, 1fr\);/u
  )
  assert.match(
    css,
    /\.erp-dev-recovery-row__footer \{[\s\S]*flex-direction: column;/u
  )
  assert.match(
    css,
    /\.erp-dev-recovery-row__footer > \.ant-btn,[\s\S]*width: 100%;/u
  )
  assert.match(
    css,
    /\.erp-dev-recovery-row__objective,[\s\S]*\.erp-dev-recovery-row__risk \{[\s\S]*display: none;/u
  )
})

test('drill recovery page exposes business labels and keeps high-risk actions disabled', () => {
  assert.match(page, /演练与恢复中心/u)
  assert.match(page, /先看当前结论和下一步/u)
  assert.match(page, /return <Button disabled>\{action\.label\}<\/Button>/u)
  assert.match(page, /普通成功部署不自动算作演练/u)
  assert.match(page, /禁止对当前试用或正式环境临时注入故障/u)
})
