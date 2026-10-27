import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { ROLE_DISPLAY_NAMES } from '../../erp/utils/roleKeys.mjs'
import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'
import { TASK_HANDLING_DUTIES } from './devTaskHandlingResponsibilities.mjs'
import { TASK_HANDLING_ROWS, taskHandlingActions } from './devTaskHandling.mjs'

test('所有正式环节均有本项责任、办理内容和交接说明，不继承整段流程岗位', () => {
  assert.deepEqual(
    Object.keys(TASK_HANDLING_DUTIES).sort(),
    WorkflowTaskDiscoveryCatalog.stages.map(({ key }) => key).sort()
  )
  for (const duty of Object.values(TASK_HANDLING_DUTIES)) {
    assert(duty.input && duty.handoff)
    assert(duty.roleKeys.every((key) => ROLE_DISPLAY_NAMES[key]))
  }
  assert.deepEqual(
    TASK_HANDLING_ROWS.filter((row) =>
      row.roleKeys.includes('engineering')
    ).map(({ key }) => key),
    ['engineering_data', 'engineering']
  )
  const material = TASK_HANDLING_ROWS.find(({ key }) => key === 'engineering')
  assert.match(material.input, /提交用料.*退回.*重提/)
  assert.match(material.handoff, /老板.*财务/)
})

test('办理岗位与正式来源任务生产者一致，不能将采购、仓库、品质和业务互换', () => {
  const source = readFileSync(
    new URL(
      '../../../../server/internal/biz/fulfillment_tasks.go',
      import.meta.url
    ),
    'utf8'
  )
  const specs = new Map(
    [
      ...source.matchAll(
        /"([^"\n]+)":\s*\{"[^"\n]*",\s*"[^"\n]*",\s*(\w+)RoleKey,/gu
      ),
    ].map(([, key, role]) => [`handoff_${key}`, role.toLowerCase()])
  )
  let checked = 0
  for (const stage of WorkflowTaskDiscoveryCatalog.stages) {
    for (const group of stage.groups || []) {
      if (!specs.has(group)) continue
      checked += 1
      assert.deepEqual(
        TASK_HANDLING_DUTIES[stage.key].roleKeys,
        [specs.get(group)],
        `${stage.key}/${group}`
      )
    }
  }
  assert(checked >= 20, '须实际核对正式来源任务，而非空映射通过')
})

test('九岗位均有明确职责，审批、发起、执行和检验分别归属', () => {
  const expected = {
    sales: [
      'sales_order',
      'packaging_version',
      'production_exception',
      'shipment',
    ],
    engineering: ['engineering_data', 'engineering'],
    purchase: ['purchasing', 'incoming_exception'],
    warehouse: [
      'purchase_count',
      'material_inbound',
      'cutting_issue',
      'sewing_return',
      'packaging',
    ],
    quality: [
      'incoming_quality',
      'shell_quality',
      'finished_quality',
      'outsourcing_quality_prepare',
    ],
    production: [
      'cutting_execute',
      'sewing_execute',
      'handwork_execute',
      'finished_goods_rework',
    ],
    finance: [
      'outsourcing_contract',
      'receivable_registration',
      'payable_registration',
      'reconciliation',
      'payment',
    ],
    pmc: ['production_schedule', 'process/sales_order_acceptance/order_review'],
    boss: [
      'source/sales_order/boss_review',
      'process/finance_payment_approval/finance_payment_approval',
    ],
  }
  assert.deepEqual(
    Object.keys(expected).sort(),
    Object.keys(ROLE_DISPLAY_NAMES).sort()
  )
  for (const [role, keys] of Object.entries(expected)) {
    for (const key of keys) {
      assert.deepEqual(
        TASK_HANDLING_ROWS.find((row) => row.key === key)?.roleKeys,
        [role],
        key
      )
    }
  }
})

test('固定流程的审批后执行节点完整列出，不归入老板审批或凭空赋予手机办理', () => {
  let executions = 0
  for (const definition of DEV_FLOW_STATE_CATALOG.processDefinitions) {
    for (const node of definition.nodes.filter(
      (item) => item.type === 'human_task'
    )) {
      if (node.key === 'engineering_data') {
        assert(TASK_HANDLING_ROWS.some((row) => row.groups?.includes(node.key)))
        continue
      }
      const row = TASK_HANDLING_ROWS.find((item) =>
        item.processRefs?.some(
          (ref) =>
            ref.definition.key === definition.key && ref.node.key === node.key
        )
      )
      assert(row, `${definition.key}/${node.key}`)
      if (node.key === 'order_review') continue
      executions += 1
      assert.deepEqual(row.roleKeys, [node.ownerPool])
      assert.equal(row.kind, 'authoring')
      assert.equal(row.mobile, 'desktop')
      assert(!row.roleKeys.includes('boss'))
    }
  }
  assert.equal(executions, 4)
})

test('普通事项的关联规则只解释本项人工动作，不混入审批、系统动作和其他岗位', () => {
  for (const row of TASK_HANDLING_ROWS.filter(
    (item) => !item.processRefs && !item.relationRef
  )) {
    for (const action of taskHandlingActions(DEV_FLOW_STATE_CATALOG, row.key)) {
      assert.equal(action.responsibilityMode, 'human')
      assert(action.roleKeys.length > 0)
      assert(
        action.roleKeys.every((role) => row.roleKeys.includes(role)),
        `${row.key}/${action.key}`
      )
    }
  }
  const engineering = taskHandlingActions(
    DEV_FLOW_STATE_CATALOG,
    'engineering_data'
  )
  assert(engineering.length > 0)
  assert(engineering.every((action) => action.substepKey === 'engineering'))
})

test('未定位工序和自由跟进仍以具体任务分派为准，不伪造默认岗位', () => {
  const assigned = TASK_HANDLING_ROWS.filter(({ roleKeys }) => !roleKeys.length)
  assert.deepEqual(assigned.map(({ key }) => key).sort(), [
    'followup',
    'production_batch',
    'unclassified',
  ])
  assert(assigned.every(({ handoff }) => /任务分派/u.test(handoff)))
})
