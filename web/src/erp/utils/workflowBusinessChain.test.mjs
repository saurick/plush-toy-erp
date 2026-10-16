import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkflowBusinessChain } from './workflowBusinessChain.mjs'

test('orders the business chain with receipt before packaging and keeps exception descendants together', () => {
  const tasks = [
    { id: 4, task_group: 'handoff_production_packaging_execute', operation_code: 'PACKAGING', discovery: { stage_key: 'packaging' } },
    { id: 3, task_group: 'handoff_production_completion', operation_code: 'HANDWORK', discovery: { stage_key: 'finished_inbound' } },
    { id: 1, source_type: 'production_exception_decision', exception_id: 7, operation_code: 'FABRIC_PROCESSING' },
    { id: 2, source_type: 'production_wip_batch', exception_id: 7, operation_code: 'SEWING', task_status_key: 'blocked' },
  ].map((item) => ({ task_name: '办理任务', owner_role_key: 'warehouse', task_status_key: 'ready', ...item }))
  const result = buildWorkflowBusinessChain({ items: tasks, truncated: false }, 2)
  assert.deepEqual(result.main.filter((stage) => stage.tasks.length).map((stage) => stage.key), ['finished_inbound', 'packaging'])
  assert.equal(result.exceptions.length, 1)
  assert.equal(result.exceptions[0].current, true)
  assert.equal(result.exceptions[0].blocked, true)
  assert.equal(result.exceptions[0].tasks[0].id, 2)
  assert.equal(result.exceptions[0].open, 2)
  assert.equal(result.main.length, 17, 'exception-only stages must not appear as empty main-chain stages')
  assert.equal(result.overview.length, 8)
  assert.equal(result.overview.at(-1).current, true)
  assert.equal(result.overview.flatMap((stage) => stage.tasks).length, tasks.length)
})

test('closed and missing stages are never reported as posted facts or invented future tasks', () => {
  const result = buildWorkflowBusinessChain({ items: [{ id: 8, source_type: 'shipment', discovery: { stage_key: 'shipment' }, task_status_key: 'withdrawn', owner_role_key: 'sales' }], truncated: true }, 8)
  assert.deepEqual(result.main.filter((stage) => stage.tasks.length).map((stage) => stage.key), ['shipment'])
  assert.equal(result.main.find((stage) => stage.key === 'shipment').open, 0)
  assert.ok(result.main.some((stage) => stage.key === 'cutting_quality' && stage.tasks.length === 0))
  assert.equal(result.truncated, true)
  assert.equal(result.overview.find((stage) => stage.key === 'shipping').statusLabel, '可见任务已结束')
  assert.equal(result.overview.find((stage) => stage.key === 'shipping').tone, 'neutral')
  assert.equal(result.overview.find((stage) => stage.key === 'production').statusLabel, '暂无可见任务')
  assert.ok(result.overview.every((stage) => !/已完成|待开始/u.test(stage.statusLabel)))
})

test('overview preserves every catalog stage and keeps unknown stages discoverable', () => {
  const empty = buildWorkflowBusinessChain({ items: [], truncated: false }, 1)
  assert.equal(empty.overview.length, 7)
  assert.deepEqual(empty.overview.flatMap((stage) => stage.groups.map((group) => group.key)), empty.main.map((group) => group.key))
  const result = buildWorkflowBusinessChain({ items: [{ id: 1, task_name: '待核对记录', discovery: { stage_key: 'unknown_stage' }, task_status_key: 'ready' }], truncated: false }, 1)
  assert.equal(result.overview.at(-1).label, '环节待核对')
  assert.equal(result.overview.at(-1).current, true)
})

test('payment categories shared by advances and settlement never guess the actual payment stage', () => {
  const result = buildWorkflowBusinessChain({ items: [{ id: 3, task_name: '办理款项', task_status_key: 'ready', discovery: { stage_key: 'payment' } }], truncated: false }, 3)
  assert.deepEqual(result.overview.filter((group) => group.tasks.length).map((group) => group.key), ['unclassified'])
  assert.equal(result.overview.at(-1).current, true)
  assert.equal(result.overview.find((group) => group.key === 'order').groups.some((group) => group.key === 'customer_advance'), true)
  assert.equal(result.overview.find((group) => group.key === 'purchase').groups.some((group) => group.key === 'supplier_advance'), true)
  assert.equal(result.overview.find((group) => group.key === 'settlement').groups[0].key, 'financial_settlement')
})

test('chain responsibility distinguishes unclaimed, assigned, blocked and ended tasks', () => {
  const base = { owner_role_key: 'production', task_name: '安排返工' }
  const result = buildWorkflowBusinessChain({ items: [
    { ...base, id: 1, task_status_key: 'ready' },
    { ...base, id: 2, task_status_key: 'ready', assignee_id: 8, discovery: { assignee_name: '张三' } },
    { ...base, id: 3, task_status_key: 'ready', assignee_id: 8 },
    { ...base, id: 4, task_status_key: 'blocked' },
    { ...base, id: 5, task_status_key: 'done' },
    { ...base, id: 6, task_status_key: 'withdrawn' },
  ],
  truncated: false }, 1)
  assert.deepEqual(result.tasks.map((item) => item.responsibilityLabel), [
    '待生产经理领取', '生产经理 · 张三 · 待办理', '生产经理 · 已分配 · 待办理',
    '生产经理 · 阻塞', '生产经理 · 已完成', '生产经理 · 已撤回',
  ])
})

test('chain references remove exact duplicates without losing distinct source and batch identities', () => {
  const base = { owner_role_key: 'warehouse', task_status_key: 'ready' }
  const result = buildWorkflowBusinessChain({ items: [
    { ...base, id: 1, task_name: '登记成品收仓', batch_no: ' WIP-RW-884 ', source_no: 'WIP-RW-884', operation_code: 'HANDWORK' },
    { ...base, id: 2, task_name: '处理返工异常 RW-884', source_no: 'RW-884' },
    { ...base, id: 3, task_name: '安排返工 RW-884-R01', batch_no: 'RW-884-R01', source_no: 'RW-884' },
    { ...base, id: 4, task_name: '登记到货', source_no: 'RCV-84', operation_code: 'UNKNOWN' },
  ],
  truncated: false }, 1)
  assert.deepEqual(result.tasks.map((item) => item.references), [
    [{ label: '批次', value: 'WIP-RW-884' }], [], [{ label: '来源', value: 'RW-884' }], [{ label: '来源', value: 'RCV-84' }],
  ])
  assert.equal(result.tasks[0].operationLabel, '手工')
  assert.equal(result.tasks[3].operationLabel, '', 'unknown operation must not become an invented process name')
})
