import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDevFlowSurfaceLocation,
  canonicalizeDevFlowStateSearchParams,
  DEV_BUSINESS_RULE_VIEWS,
  resolveDevFlowViewRoute,
} from './devFlowStateQuery.mjs'

test('规则定义统一在独立菜单查看，专题和实例仍回各自入口', () => {
  for (const view of DEV_BUSINESS_RULE_VIEWS) {
    assert.equal(resolveDevFlowViewRoute(view), '/__dev/business-rules')
    assert.equal(resolveDevFlowViewRoute(view, { topics: true }), '/__dev/business-rules')
  }
  assert.equal(resolveDevFlowViewRoute('chain', { topics: true }), '/__dev/business-topics')
  for (const view of ['chain', 'tracking', 'workflow', 'runtime', 'finance_records']) {
    assert.equal(resolveDevFlowViewRoute(view), '/__dev/status-flows')
  }
})

test('独立规则菜单首次读取保留状态对象、状态和关联范围，清除其他分类残值', () => {
  const result = canonicalizeDevFlowStateSearchParams(
    new URLSearchParams('flow=source.sales_order&state=active&flow_role=sales&flow_stage=sales_order&fact=fact.shipment'),
    { defaultView: 'states' }
  )
  assert.equal(result.searchParams.get('flow'), 'source.sales_order')
  assert.equal(result.searchParams.get('state'), 'active')
  assert.equal(result.searchParams.get('flow_role'), 'sales')
  assert.equal(result.searchParams.get('flow_stage'), 'sales_order')
  assert.equal(result.searchParams.has('fact'), false)
})

test('动作选择及显式清空只属于状态规则，其他分类不能残留该选择', () => {
  for (const action of ['cancel', '']) {
    const source = new URLSearchParams({ view: 'states', flow: 'fact.shipment', rule_action: action })
    assert.equal(canonicalizeDevFlowStateSearchParams(source).searchParams.get('rule_action'), action)
    source.set('view', 'facts')
    assert.equal(canonicalizeDevFlowStateSearchParams(source).searchParams.has('rule_action'), false)
  }
})

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
  assert.deepEqual(
    canonicalize(
      'view=tracking&chain=production_to_inventory&node=wip_batch&task_id=42&fact=fact.production&process=old&flow=workflow.task'
    ),
    {
      changed: true,
      query:
        'view=tracking&chain=production_to_inventory&node=wip_batch&task_id=42',
    }
  )
})

test('role and selected handoff survive view changes without restoring stale technical selections', () => {
  assert.deepEqual(
    canonicalize(
      'view=chain&chain=purchase_to_inventory&flow_role=warehouse&flow_stage=incoming_quality&flow_substep=inbound&fact=fact.inventory_lot'
    ),
    {
      changed: true,
      query:
        'view=chain&chain=purchase_to_inventory&flow_role=warehouse&flow_stage=incoming_quality&flow_substep=inbound',
    }
  )
})

test('exception source, decision and selected step survive refresh and view canonicalization', () => {
  const query =
    'view=chain&chain=all&flow_role=purchase&flow_stage=cutting_quality&flow_exception=production_quality&flow_decision=scrap&flow_exception_step=execute'
  assert.deepEqual(canonicalize(`${query}&node=purchase_order&process=old`), {
    changed: true,
    query,
  })
  assert.deepEqual(canonicalize(query), { changed: false, query })
})

test('exception origin stays separate from the page return position and survives refresh', () => {
  const query =
    'view=chain&chain=all&flow_role=warehouse&flow_stage=cutting_quality&flow_exception=production_quality&flow_exception_origin=shell_quality&flow_decision=remake&flow_exception_step=count'
  assert.deepEqual(canonicalize(`${query}&node=old&process=stale`), {
    changed: true,
    query,
  })
  assert.deepEqual(canonicalize(query), { changed: false, query })
})

test('reading and instance filters survive specialist views without stale object selections', () => {
  const query =
    'view=runtime&chain=all&flow_topic=delivery_to_settlement&flow_topic_node=shipped&flow_map=delivery_to_settlement&flow_map_node=finance_payment_and_reversal&task_id=42&task_filter=pending&task_stage=shell_quality'
  assert.deepEqual(canonicalize(`${query}&fact=old`), { changed: true, query })
  assert.deepEqual(canonicalize(query), { changed: false, query })
})

test('independent topic navigation carries relation filters without stale reading or instance selections', () => {
  const from = new URLSearchParams('view=tracking&chain=purchase_to_inventory&node=receipt&flow_stage=incoming_quality&flow_role=warehouse&flow_object=fact.purchase_receipt&flow_permission=warehouse.inbound.confirm&task_id=42&flow_topic=finance_relations&finance_topic=adjustments')
  const target = buildDevFlowSurfaceLocation(from, { topics: true, topicKey: 'purchase_to_inventory' })
  assert.equal(target.pathname, '/__dev/business-topics')
  assert.deepEqual(Object.fromEntries(new URLSearchParams(target.search)), {
    flow_role: 'warehouse', flow_object: 'fact.purchase_receipt', flow_permission: 'warehouse.inbound.confirm', flow_topic: 'purchase_to_inventory',
  })
  const main = buildDevFlowSurfaceLocation(new URLSearchParams(target.search))
  assert.equal(main.pathname, '/__dev/status-flows')
  assert.equal(new URLSearchParams(main.search).has('flow_topic'), false)
  assert.equal(new URLSearchParams(main.search).get('flow_role'), 'warehouse')
  assert.equal(buildDevFlowSurfaceLocation(new URLSearchParams(), { topics: true }).search, '')
})
