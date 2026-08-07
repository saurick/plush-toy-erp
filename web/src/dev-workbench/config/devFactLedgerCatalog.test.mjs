import assert from 'node:assert/strict'
import test from 'node:test'

import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'
import {
  DEV_FACT_LEDGER_DISPLAY_GROUPS,
  DEV_FACT_LEDGER_RUNTIME_QUERY,
  buildDevFactLedgerCatalog,
} from './devFactLedgerCatalog.mjs'

test('fact ledger catalog is complete, read-only, and source-backed', () => {
  const catalog = buildDevFactLedgerCatalog({
    flows: DEV_FLOW_STATE_CATALOG.flows,
  })
  const factFlows = DEV_FLOW_STATE_CATALOG.flows.filter(
    (flow) => flow.scopeKey === 'fact_ledger'
  )

  assert.equal(catalog.readOnly, true)
  assert.equal(catalog.allowsActionExecution, false)
  assert.equal(catalog.coverage.complete, true)
  assert.equal(catalog.displayGroups, DEV_FACT_LEDGER_DISPLAY_GROUPS)
  assert.deepEqual(
    catalog.displayGroups.map((group) => group.label),
    ['采购与质量', '生产与库存', '委外与返工', '出货与财务']
  )
  assert.equal(catalog.definitions.length, factFlows.length)
  assert.deepEqual(
    new Set(catalog.definitions.map((definition) => definition.factKey)),
    new Set(factFlows.map((flow) => flow.key))
  )
  assert.equal(
    new Set(catalog.definitions.map((definition) => definition.factKey)).size,
    catalog.definitions.length
  )

  for (const definition of catalog.definitions) {
    assert.equal(definition.readOnly, true)
    assert.equal(definition.runtimeProofQuery, 'unavailable')
    assert.equal(definition.machineKey, definition.factKey)
    assert(
      catalog.displayGroups.some(
        (group) => group.key === definition.displayGroupKey
      )
    )
    for (const field of [
      'label',
      'occurrenceCondition',
      'sourceDocument',
      'authority',
      'businessImpact',
      'voucher',
      'idempotencyRule',
      'correction',
    ]) {
      assert.equal(typeof definition[field], 'string')
      assert.notEqual(definition[field].trim(), '')
    }
    assert(definition.sourceRefs.length > 0)
  }
  assert(Object.isFrozen(catalog))
  assert(Object.isFrozen(catalog.definitions))
  assert(Object.isFrozen(catalog.displayGroups))
  assert(catalog.displayGroups.every(Object.isFrozen))
  assert(catalog.definitions.every(Object.isFrozen))
  assert(
    catalog.displayGroups.every((group) =>
      catalog.definitions.some(
        (definition) => definition.displayGroupKey === group.key
      )
    )
  )
})

test('fact ledger catalog explicitly refuses unsupported runtime proof lookup', () => {
  assert.deepEqual(DEV_FACT_LEDGER_RUNTIME_QUERY, {
    availability: 'unavailable',
    label: '未提供运行凭证查询',
    reason:
      '当前后端没有跨领域、按事实凭证 ID 读取 Fact/Ledger 的统一只读接口；观察台只展示定义和代码证据。',
  })
})

test('fact ledger catalog fails closed for unknown or missing fact references', () => {
  assert.throws(
    () =>
      buildDevFactLedgerCatalog({
        flows: DEV_FLOW_STATE_CATALOG.flows.filter(
          (flow) => flow.key !== 'fact.purchase_receipt'
        ),
      }),
    /coverage mismatch/u
  )
  assert.throws(
    () =>
      buildDevFactLedgerCatalog({
        flows: [
          ...DEV_FLOW_STATE_CATALOG.flows,
          {
            key: 'fact.unknown_runtime_proof',
            scopeKey: 'fact_ledger',
          },
        ],
      }),
    /coverage mismatch/u
  )
})
