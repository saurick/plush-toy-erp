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

test('drill recovery page leads with the operational conclusion and evidence boundary', () => {
  assert.match(page, /当前恢复准备度/u)
  assert.match(page, /下一步建议/u)
  assert.match(page, /<details[\s\S]*<summary>/u)
  assert.match(page, /overview\.drills\.map/u)
  assert.doesNotMatch(page, /function DrillCard|erp-dev-recovery-drills/u)
  assert.match(page, /优先级[\s\S]*演练[\s\S]*状态[\s\S]*建议频率/u)
  assert.match(page, /变化时触发/u)
  assert.match(page, /完成证据/u)
  assert.match(page, /erp-dev-recovery-row__purpose/u)
  assert.match(
    page,
    /const recentOperations = overview\.operations\.slice\(0, 3\)/u
  )
})

test('drill recovery page exposes business labels and keeps high-risk actions disabled', () => {
  assert.match(page, /演练与恢复中心/u)
  assert.match(page, /先看当前结论和下一步/u)
  assert.match(page, /return <Button disabled>\{action\.label\}<\/Button>/u)
  assert.match(page, /普通成功部署不自动算作演练/u)
  assert.match(page, /禁止对当前试用或正式环境临时注入故障/u)
})
