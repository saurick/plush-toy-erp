import assert from 'node:assert/strict'
import test from 'node:test'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../config/devFlowStateCatalog.mjs'
import {
  resolveDevFlowViewContext,
  getDevTaskReadingSelection,
} from './devFlowViewContext.mjs'

const resolve = (query, task, taskScoped = false) =>
  resolveDevFlowViewContext({
    catalog,
    searchParams: new URLSearchParams(query),
    task,
    taskScoped,
  })
test('reading context follows the selected topic, stage, or exception instead of old global selections', () => {
  assert.equal(
    resolve(
      'chain=all&flow_tab=topics&flow_topic=delivery_to_settlement&flow_stage=shell_quality'
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
  assert.equal(resolve('chain=all&flow_tab=topics&flow_topic='), null)
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
    resolve('chain=all&flow_tab=topics').chainKey,
    'sales_to_production'
  )
  assert.equal(
    resolve(
      'chain=all&flow_tab=topics&flow_topic=delivery_to_settlement&flow_map=purchase_to_inventory'
    ).chainKey,
    'purchase_to_inventory'
  )
  assert.equal(
    resolve(
      'chain=all&flow_tab=topics&flow_topic=delivery_to_settlement&flow_map=purchase_to_inventory&flow_map_node=finance_payment_and_reversal'
    ).chainKey,
    'finance_payment_and_reversal'
  )
  assert.equal(
    resolve(
      'chain=all&flow_tab=topics&flow_topic=delivery_to_settlement&flow_topic_node=shipped'
    ).nodeKey,
    'shipped'
  )
  assert.equal(
    resolve(
      'chain=all&flow_tab=topics&flow_topic=delivery_to_settlement&flow_topic_node=missing'
    ),
    null
  )
})
