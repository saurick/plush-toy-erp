import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import test from 'node:test'

const mobileRoleTasksPageSource = readFileSync(
  new URL('../mobile/pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

const mobileRoleTaskActionsSource = readFileSync(
  new URL('../mobile/hooks/useMobileRoleTaskActions.js', import.meta.url),
  'utf8'
)

test('outsourceReturnFlow: 移动端回货检验状态动作不再本地创建下游任务', () => {
  assert.equal(
    mobileRoleTasksPageSource.includes('buildOutsourceWarehouseInboundTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('buildOutsourceReworkTask'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes('completeOutsourceReturnTrackingTask'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes('buildOutsourceReturnQcTask'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes('OUTSOURCE_QC_PENDING_STATUS_KEY'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes('completeOutsourceReworkTask'),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes(
      'OUTSOURCE_PRODUCTION_PROCESSING_STATUS_KEY'
    ),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes(
      'completeOutsourceWarehouseInboundTask'
    ),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes(
      'buildOutsourcePayableRegistrationTask'
    ),
    false
  )
  assert.equal(
    mobileRoleTaskActionsSource.includes('OUTSOURCE_INBOUND_DONE_STATUS_KEY'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('passOutsourceReturnQcTask'),
    false
  )
  assert.equal(
    mobileRoleTasksPageSource.includes('failOutsourceReturnQcTask'),
    false
  )
  assert.match(
    mobileRoleTaskActionsSource,
    /loadTasks\(\{\s*canonicalTask: confirmedTask\s*\}\)\.catch/
  )
})

import * as flow from './outsourceReturnFlow.mjs'

test('outsourceReturnFlow: recognizes server tasks without exposing client task builders', () => {
  assert.equal(
    Object.keys(flow).some((name) => name.startsWith('build')),
    false
  )
  for (const [matcher, sourceType, taskGroup] of [
    [
      'isOutsourceReturnTrackingTask',
      'processing-contracts',
      'outsource_return_tracking',
    ],
    ['isOutsourceReturnQcTask', 'processing-contracts', 'outsource_return_qc'],
    [
      'isOutsourceWarehouseInboundTask',
      'processing-contracts',
      'outsource_warehouse_inbound',
    ],
    ['isOutsourceReworkTask', 'processing-contracts', 'outsource_rework'],
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
