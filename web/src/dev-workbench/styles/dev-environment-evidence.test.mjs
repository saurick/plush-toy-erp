import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const panel = readFileSync(
  new URL('../components/DevEnvironmentEvidencePanel.jsx', import.meta.url),
  'utf8'
)

test('environment evidence distinguishes target facts from workbench history', () => {
  assert.match(panel, /环境与验收事实/u)
  assert.match(panel, /最近工作台操作/u)
  assert.match(panel, /最严重阻断/u)
  assert.match(panel, /最后核对/u)
  assert.match(panel, /查看工作台操作记录/u)
  assert.match(panel, /远端流水线耗时/u)
  assert.match(panel, /Release \/ SHA/u)
  assert.match(panel, /客户配置 revision/u)
  assert.match(panel, /数据版本 \/ run/u)
  assert.match(panel, /权威读回于/u)
  assert.match(panel, /当前下一步/u)
  assert.match(panel, /Semantic digest/u)
  assert.match(panel, /card\.health/u)
  assert.match(panel, /card\.rollbackBoundary/u)
})
