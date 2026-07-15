import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./BusinessDashboardPage.jsx', import.meta.url)),
  'utf8'
)

test('business dashboard loads business totals and account-visible collaboration independently', () => {
  assert.match(source, /Promise\.allSettled/u)
  assert.match(source, /getBusinessDashboardStats\(\)/u)
  assert.match(source, /getWorkflowTaskBoard\(\{ limit: 1, offset: 0 \}\)/u)
  assert.match(source, /dashboardResult\.status === 'fulfilled'/u)
  assert.match(source, /workflowResult\.status === 'fulfilled'/u)
  assert.match(
    source,
    /dashboardResult\.status === 'fulfilled'\s*&&\s*workflowResult\.status === 'fulfilled'/u
  )
  assert.match(
    source,
    /taskBoard\?\.counts\?\.exception[\s\S]*taskBoard\?\.counts\?\.due/u
  )
  assert.doesNotMatch(source, /listWorkflowTasks/u)
  assert.doesNotMatch(source, /buildWorkflowDashboardStats/u)
})

test('business dashboard separates three data totals from collaboration risk', () => {
  for (const title of ['基础资料', '业务单据', '办理结果', '需要关注']) {
    assert.match(source, new RegExp(`title: '${title}'`, 'u'))
  }
  assert.match(source, /四类数字分别统计，请不要直接相加/u)
  assert.match(source, /只统计当前账号可见的阻塞和到期任务/u)
  assert.match(source, /TASK_BOARD_LANE_DEFINITIONS\.map/u)
  assert.match(source, /每类最多展示一项/u)
})

test('business dashboard renders unavailable counts distinctly from true zero', () => {
  assert.match(source, /item\.available\s*\?\s*formatCount\(item\.total\)/u)
  assert.match(source, /source\.available\s*\?\s*formatCount\(source\.total\)/u)
  assert.match(source, /暂不可用/u)
  assert.match(source, /业务统计暂不可用/u)
  assert.match(source, /待办概览暂不可用/u)
})

test('business dashboard avoids cross-boundary family totals and gives every source its own entry', () => {
  assert.match(source, /每一项单独统计/u)
  assert.match(source, /record\.sources\.map/u)
  assert.match(source, /onClick=\{\(\) => navigate\(source\.path\)\}/u)
  assert.match(source, /aria-label=\{`查看\$\{source\.label\}`\}/u)
  assert.doesNotMatch(source, /title: '记录合计'/u)
  assert.doesNotMatch(source, /erp-business-board-family-total/u)
  assert.doesNotMatch(source, /buildBusinessModuleQuery/u)
  assert.doesNotMatch(source, /dashboardStatusGroups/u)
})

test('business dashboard explains the four business-facing data boundaries', () => {
  assert.match(source, />\s*数字说明\s*</u)
  assert.match(source, /用于记录业务发起或约定，后续仍需按流程办理/u)
  assert.match(source, /完成任务不会自动产生库存、出货或财务记录/u)
  assert.doesNotMatch(
    source,
    /业务源单|事实记录|对象族|数据口径|协同概览/u
  )
  assert.doesNotMatch(source, />\s*状态分布\s*</u)
  assert.doesNotMatch(source, />\s*当前风险\s*</u)
})
