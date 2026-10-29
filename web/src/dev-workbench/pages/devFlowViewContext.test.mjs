import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../config/devFlowStateCatalog.mjs'
import {
  resolveDevFlowViewContext,
  getDevTaskReadingSelection,
  restoreDevFlowPrimaryContext,
} from './devFlowViewContext.mjs'

test('规则分类保留各自对象与动作，财务口径选择不改变另一分类的业务范围', () => {
  const previous = 'view=states&flow=fact.shipment&rule_action=cancel&flow_role=warehouse'
  const current = new URLSearchParams('view=finance_rules&finance_rule=terms&flow_role=warehouse')
  const result = restoreDevFlowPrimaryContext(previous, current, { independentKeys: ['finance_rule'] })
  assert.equal(result.changed, false)
  assert.equal(result.searchParams.get('flow'), 'fact.shipment')
  assert.equal(result.searchParams.get('rule_action'), 'cancel')
  assert.equal(result.searchParams.has('finance_rule'), false)
})

test('未指定业务链与总图是同一范围，不丢失任务视图的阅读恢复', () => {
  const result = restoreDevFlowPrimaryContext('view=workflow&task_id=21', new URLSearchParams('view=chain&chain=all'))
  assert.equal(result.changed, false)
  assert.equal(result.searchParams.get('task_id'), '21')
})

test('规则的岗位或关联范围改变后清除旧对象、状态及动作', () => {
  const previous = 'view=states&flow=fact.shipment&state=SHIPPED&rule_action=cancel&flow_role=warehouse'
  const result = restoreDevFlowPrimaryContext(previous, new URLSearchParams('view=facts&flow_role=finance'))
  assert.equal(result.changed, true)
  for (const key of ['flow', 'state', 'rule_action']) assert.equal(result.searchParams.has(key), false)
})

test('main-tab restoration shares current stage and facets but keeps the instance query independent', () => {
  const previous = 'view=tracking&task_id=21&task_filter=pending&task_stage=shell_quality&flow_stage=sales_order&flow=source.sales_order'
  const current = new URLSearchParams('view=states&flow_stage=incoming_quality&flow_substep=inbound&flow_role=warehouse&flow_object=fact.purchase_receipt&flow_permission=warehouse.inbound.confirm')
  const { searchParams: restored, changed } = restoreDevFlowPrimaryContext(previous, current)
  assert.equal(changed, true)
  assert.equal(restored.get('view'), 'tracking')
  assert.equal(restored.get('flow_stage'), 'incoming_quality')
  assert.equal(restored.get('flow_permission'), 'warehouse.inbound.confirm')
  assert.equal(restored.get('task_filter'), 'pending')
  assert.equal(restored.get('task_id'), '21')
  assert.equal(restored.has('flow'), false)
})

const resolve = (query, task, taskScoped = false, topics = false) =>
  resolveDevFlowViewContext({
    catalog,
    searchParams: new URLSearchParams(query),
    task,
    taskScoped,
    topics,
  })
test('reading context follows the selected topic, stage, or exception instead of old global selections', () => {
  assert.equal(
    resolve(
      'chain=all&flow_topic=delivery_to_settlement&flow_stage=shell_quality', null, false, true
    ).chainKey,
    'delivery_to_settlement'
  )
  assert.equal(
    resolve('chain=all&flow_stage=supplier_advance').chainKey,
    'finance_payment_and_reversal'
  )
  assert.equal(
    resolve(
      'chain=all&flow_exception=production_quality&flow_stage=supplier_advance'
    ).chainKey,
    'production_exception'
  )
  assert.equal(resolve('chain=all&flow_topic=', null, false, true), null)
})
test('task tools reject stale task records and use only registered unambiguous discovery', () => {
  const task = { id: 23, discovery: { stage_key: 'shipping' } }
  assert.equal(
    resolve(
      'chain=production_to_inventory&task_id=23',
      { ...task, id: 22 },
      true
    ),
    null
  )
  assert.equal(
    resolve(
      'task_id=23',
      { id: 23, discovery: { stage_key: 'unregistered' } },
      true
    ),
    null
  )
  assert.equal(
    getDevTaskReadingSelection({
      id: 5,
      discovery: { stage_key: 'shell_quality' },
    }).flow_stage,
    'shell_quality'
  )
  assert.equal(
    getDevTaskReadingSelection({
      id: 6,
      exception_id: 2,
      discovery: { stage_key: 'sewing_exception' },
    }).flow_exception,
    'production_quality'
  )
})

test('default topic, map focus and selected neighbor use the same visible business definition', () => {
  assert.equal(
    resolve('chain=all', null, false, true).chainKey,
    'sales_to_production'
  )
  assert.equal(
    resolve(
      'chain=all&flow_topic=delivery_to_settlement&flow_map=purchase_to_inventory', null, false, true
    ).chainKey,
    'purchase_to_inventory'
  )
  assert.equal(
    resolve(
      'chain=all&flow_topic=delivery_to_settlement&flow_map=purchase_to_inventory&flow_map_node=finance_payment_and_reversal', null, false, true
    ).chainKey,
    'finance_payment_and_reversal'
  )
  assert.equal(
    resolve(
      'chain=all&flow_topic=delivery_to_settlement&flow_topic_node=shipped', null, false, true
    ).nodeKey,
    'shipped'
  )
  assert.equal(
    resolve(
      'chain=all&flow_topic=delivery_to_settlement&flow_topic_node=missing', null, false, true
    ),
    null
  )
})
