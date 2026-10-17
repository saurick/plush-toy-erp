import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalizeDevFlowStateSearchParams } from './devFlowStateQuery.mjs'

function canonicalize(query) {
  const result = canonicalizeDevFlowStateSearchParams(
    new URLSearchParams(query)
  )
  return {
    changed: result.changed,
    query: result.searchParams.toString(),
  }
}

test('dev flow state query removes a stale process selection from the chain overview', () => {
  assert.deepEqual(
    canonicalize(
      'view=chain&chain=all&process=production_exception_approval%2Fexception_decision_approval'
    ),
    {
      changed: true,
      query: 'view=chain&chain=all',
    }
  )
})

test('dev flow state query keeps the active selection and task while removing inactive selections', () => {
  assert.deepEqual(
    canonicalize(
      'view=states&flow=source.production_exception_decision&state=APPROVED&chain=production_exception&fact=fact.production&task_id=42'
    ),
    {
      changed: true,
      query:
        'view=states&flow=source.production_exception_decision&state=APPROVED&chain=production_exception&task_id=42',
    }
  )
})

test('dev flow state query preserves chain and node context in specialist views', () => {
  assert.deepEqual(
    canonicalize(
      'view=facts&chain=delivery_to_settlement&node=shipped&fact=fact.shipment'
    ),
    {
      changed: false,
      query:
        'view=facts&chain=delivery_to_settlement&node=shipped&fact=fact.shipment',
    }
  )
  assert.deepEqual(
    canonicalize('view=runtime&chain=all&node=retired&process=missing'),
    {
      changed: true,
      query: 'view=runtime&chain=all&process=missing',
    }
  )
})

test('dev flow state query removes a stale single-chain node from the overview', () => {
  assert.deepEqual(canonicalize('view=chain&chain=all&node=retired-node'), {
    changed: true,
    query: 'view=chain&chain=all',
  })
})

test('dev flow state query preserves unknown values for fail-closed validation', () => {
  assert.deepEqual(
    canonicalize('view=facts&fact=fact.retired&task_id=abc&extra=1'),
    {
      changed: false,
      query: 'view=facts&fact=fact.retired&task_id=abc&extra=1',
    }
  )
})

test('dev flow state query does not hide duplicate parameters', () => {
  assert.deepEqual(
    canonicalize('view=chain&view=facts&chain=all&process=retired'),
    {
      changed: false,
      query: 'view=chain&view=facts&chain=all&process=retired',
    }
  )
})

test('instance tracking retains task and chain context without specialist selections', () => {
  assert.deepEqual(canonicalize('view=tracking&chain=production_to_inventory&node=wip_batch&task_id=42&fact=fact.production&process=old&flow=workflow.task'), {
    changed: true,
    query: 'view=tracking&chain=production_to_inventory&node=wip_batch&task_id=42',
  })
})

test('role and selected handoff survive view changes without restoring stale technical selections', () => {
  assert.deepEqual(canonicalize('view=chain&chain=purchase_to_inventory&flow_role=warehouse&flow_stage=incoming_quality&flow_substep=inbound&fact=fact.inventory_lot'), {
    changed: true,
    query: 'view=chain&chain=purchase_to_inventory&flow_role=warehouse&flow_stage=incoming_quality&flow_substep=inbound',
  })
})

test('exception source, decision and selected step survive refresh and view canonicalization', () => {
  const query = 'view=chain&chain=all&flow_role=purchase&flow_stage=cutting_quality&flow_exception=production_quality&flow_decision=scrap&flow_exception_step=execute'
  assert.deepEqual(canonicalize(`${query}&node=purchase_order&process=old`), { changed: true, query })
  assert.deepEqual(canonicalize(query), { changed: false, query })
})

test('exception origin stays separate from the page return position and survives refresh', () => {
  const query = 'view=chain&chain=all&flow_role=warehouse&flow_stage=cutting_quality&flow_exception=production_quality&flow_exception_origin=shell_quality&flow_decision=remake&flow_exception_step=count'
  assert.deepEqual(canonicalize(`${query}&node=old&process=stale`), { changed: true, query })
  assert.deepEqual(canonicalize(query), { changed: false, query })
})
