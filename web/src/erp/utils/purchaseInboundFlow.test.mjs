import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import test from 'node:test'

import * as flow from './purchaseInboundFlow.mjs'

const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

const mobileRoleTaskActionsSource = readFileSync(
  new URL('../mobile/hooks/useMobileRoleTaskActions.js', import.meta.url),
  'utf8'
)

const mobileRoleTaskModelSource = readFileSync(
  new URL('../mobile/utils/mobileRoleTaskModel.mjs', import.meta.url),
  'utf8'
)

test('MobileRoleTasksPage: 岗位任务完成不在页面本地改写来源状态', () => {
  assert.doesNotMatch(mobileRoleTaskActionsSource, /updateSourceStatusForTask/)
  assert.doesNotMatch(
    mobileRoleTaskActionsSource,
    /upsertWorkflowBusinessState/
  )
})

test('purchaseInboundFlow: 移动端 IQC 状态动作不再本地创建下游任务', () => {
  assert.equal(
    mobileRoleTasksPageSource.includes('buildWarehouseInboundTaskFromIqcPass'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildPurchaseQualityExceptionTask'),
    false
  )
  assert.equal(mobileRoleTasksPageSource.includes('passIqcTask'), false)
  assert.equal(mobileRoleTasksPageSource.includes('failIqcTask'), false)
  assert.equal(
    mobileRoleTasksPageSource.includes('runPurchaseInboundFollowUp'),
    false
  )
  assert.match(
    mobileRoleTaskActionsSource,
    /loadTasks\(\{\s*canonicalTask: confirmedTask\s*\}\)\.catch/
  )
})

test('purchaseInboundFlow: 移动端采购 warehouse_inbound 状态动作交给后端', () => {
  assert.equal(
    mobileRoleTasksPageSource.includes('completeWarehouseInboundTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildPurchasePayableRegistrationTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes(
      'PURCHASE_PAYABLE_REGISTRATION_TASK_GROUP'
    ),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('runPurchaseInboundFollowUp'),
    false
  )
  assert.match(
    mobileRoleTaskModelSource,
    /if \(isWarehouseInboundTask\(task\)\) {[\s\S]{0,220}if \(taskStatusKey === 'done'\) return INBOUND_DONE_STATUS_KEY[\s\S]{0,220}if \(\['blocked', 'rejected'\]\.includes\(taskStatusKey\)\) return 'blocked'/
  )
  assert.match(
    mobileRoleTaskModelSource,
    /roleKey === 'warehouse' &&[\s\S]{0,120}isWarehouseInboundTask\(task\)/
  )
})

test('purchaseInboundFlow: recognizes server tasks without exposing client task builders', () => {
  assert.equal(
    Object.keys(flow).some((name) => name.startsWith('build')),
    false
  )
  for (const [matcher, sourceType, taskGroup] of [
    ['isPurchaseIqcTask', 'accessories-purchase', 'purchase_iqc'],
    ['isWarehouseInboundTask', 'accessories-purchase', 'warehouse_inbound'],
  ]) {
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: taskGroup }),
      true
    )
    assert.equal(
      flow[matcher]({ source_type: 'unrelated', task_group: taskGroup }),
      false
    )
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: 'unrelated' }),
      false
    )
    assert.equal(flow[matcher]({}), false)
  }
})
