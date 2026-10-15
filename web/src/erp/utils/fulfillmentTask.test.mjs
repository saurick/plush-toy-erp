import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fulfillmentTaskEntryPath } from './fulfillmentTask.mjs'
import { getWorkflowTaskStatusActionModes } from './workflowTaskActionContract.mjs'

function task(kind, source, path) {
  return {
    task_group: `handoff_${kind}`,
    task_code: `source-handoff-${kind.replaceAll('_', '-')}-7`,
    source_type: source,
    source_id: 7,
    task_status_key: 'ready',
    payload: {
      source_task_contract: 'workflow.source-task/v1',
      source_task_producer: 'fulfillment.source',
      source_task_intent_hash: 'a'.repeat(64),
      source_record_id: 7,
      entry_path: path,
    },
  }
}

test('source handoffs open the exact receipt, inspection, contract or production batch', () => {
  for (const [kind, source, path] of [
    [
      'purchase_arrival',
      'purchase_order',
      '/erp/purchase/accessories?purchase_order_id=7',
    ],
    [
      'receipt_exception',
      'purchase_receipt',
      '/erp/production/quality-inspections?purchase_receipt_id=7',
    ],
    [
      'receipt_inbound',
      'purchase_receipt',
      '/erp/warehouse/inbound?receipt_id=7',
    ],
    [
      'production_quality',
      'quality_inspection',
      '/erp/production/quality-inspections?quality_inspection_id=7',
    ],
    [
      'outsourcing_contract',
      'outsourcing_order',
      '/erp/purchase/processing-contracts?outsourcing_order_id=7',
    ],
    [
      'production_return',
      'production_wip_batch',
      '/erp/production/orders?production_order_id=3&wip_batch_id=7',
    ],
    [
      'production_packaging',
      'production_packaging_confirmation',
      '/erp/production/orders?production_order_id=3&production_order_item_id=11',
    ],
    [
      'outsourcing_inbound',
      'outsourcing_fact',
      '/erp/purchase/processing-contracts?outsourcing_order_id=3&outsourcing_fact_id=7',
    ],
    [
      'production_inbound',
      'production_fact',
      '/erp/production/progress?fact_id=7',
    ],
  ]) {
    const row = task(kind, source, path)
    assert.equal(fulfillmentTaskEntryPath(row), path)
    assert.deepEqual(getWorkflowTaskStatusActionModes(row), ['urge'])
    for (const status of ['blocked', 'done', 'withdrawn']) {
      assert.deepEqual(
        getWorkflowTaskStatusActionModes({ ...row, task_status_key: status }),
        []
      )
    }
    assert.equal(fulfillmentTaskEntryPath({ ...row, source_id: 8 }), '')
    assert.equal(
      fulfillmentTaskEntryPath({
        ...row,
        payload: {
          ...row.payload,
          entry_path: `${path}&redirect=https://example.test`,
        },
      }),
      ''
    )
    assert.equal(
      fulfillmentTaskEntryPath({
        ...row,
        payload: { ...row.payload, source_task_producer: 'manual' },
      }),
      ''
    )
  }
})

test('unknown or unsigned handoffs fail closed and cannot use generic completion', () => {
  const row = task(
    'unknown',
    'purchase_receipt',
    '/erp/warehouse/inbound?receipt_id=7'
  )
  assert.equal(fulfillmentTaskEntryPath(row), '')
  assert.deepEqual(getWorkflowTaskStatusActionModes(row), ['urge'])
  assert.equal(fulfillmentTaskEntryPath({ ...row, payload: {} }), '')
})

test('handoff registry, navigation and living process document stay aligned', () => {
  const registry = readFileSync(
    new URL(
      '../../../../server/internal/biz/fulfillment_tasks.go',
      import.meta.url
    ),
    'utf8'
  )
  const navigation = readFileSync(
    new URL('./fulfillmentTask.mjs', import.meta.url),
    'utf8'
  )
  const document = readFileSync(
    new URL('../../../../docs/workflow/业务与协同流程地图.md', import.meta.url),
    'utf8'
  )
  const specs = [
    ...registry.matchAll(/"([a-z_]+)":\s*\{"([^"]+)", "([^"]+)"/gu),
  ]
  assert.ok(specs.length > 0)
  const actualKinds = [
    ...navigation.matchAll(/^ {2}([a-z_]+): '[^']+',/gmu),
  ].map((match) => match[1])
  assert.deepEqual(actualKinds.sort(), specs.map((match) => match[1]).sort())
  for (const [, kind, name, source] of specs) {
    assert.ok(
      document.includes(`| ${name} |`),
      `document must describe ${kind}`
    )
    assert.ok(
      navigation.includes(`${kind}: '${source}'`),
      `navigation source mismatch: ${kind}`
    )
  }
})
