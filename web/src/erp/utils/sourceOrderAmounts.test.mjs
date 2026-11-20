import assert from 'node:assert/strict'
import test from 'node:test'
import { formatUnitQuantitySummary } from './sourceOrderAmounts.mjs'

test('quantity summaries keep different units separate and preserve small decimal values', () => {
  const options = [
    { value: 1, label: '个' },
    { value: 2, label: '码' },
  ]
  assert.equal(
    formatUnitQuantitySummary(
      [
        { unit_id: 1, quantity: '12' },
        { unit_id: 2, quantity: '0.000001' },
        { unit_id: 1, quantity: '3' },
        { unit_id: 2, quantity: '1.000002' },
      ],
      'quantity',
      options
    ),
    '15 个 / 1.000003 码'
  )
  assert.equal(formatUnitQuantitySummary([{ quantity: '10' }]), '待选择单位')
  assert.equal(
    formatUnitQuantitySummary(
      [{ unit_id: 1, quantity: '' }],
      'quantity',
      options
    ),
    '—'
  )
})

test('business data consistency: clearing prices clears submitted and displayed amounts', async () => {
  const { buildSalesOrderItemParams, buildPurchaseOrderItemParams } =
    await import('./sourceOrderParams.mjs')
  const { deriveSalesOrderItemAmount, derivePurchaseOrderItemAmount } =
    await import('./sourceOrderAmounts.mjs')
  for (const [quantity, build, derive] of [
    ['ordered_quantity', buildSalesOrderItemParams, deriveSalesOrderItemAmount],
    [
      'purchased_quantity',
      buildPurchaseOrderItemParams,
      derivePurchaseOrderItemAmount,
    ],
  ]) {
    const line = { [quantity]: '10', unit_price: '', amount: '20' }
    assert.equal(derive(line), undefined)
    assert.equal(build(line).amount, undefined)
    assert.equal(derive({ ...line, unit_price: '0' }), '0.00')
    assert.equal(derive({ ...line, unit_price: '2.675' }), '26.75')
    assert.equal(derive(line, { allowSnapshotFallback: true }), '20')
    assert.equal(derive({ ...line, unit_price: '-1' }, { allowSnapshotFallback: true }), undefined)
    assert.equal(derive({ ...line, unit_price: '99999999999999.999999' }, { allowSnapshotFallback: true }), undefined)
    assert.equal(derive({ ...line, amount: '100000000000000' }, { allowSnapshotFallback: true }), undefined)
  }
})

test('business data consistency: amount preview rejects derived and aggregate overflow', async () => {
  const { calculateSalesOrderAmounts, deriveSalesOrderItemAmount } =
    await import('./sourceOrderAmounts.mjs')
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '2',
      unit_price: '60000000000000',
    }),
    undefined
  )
  const commercial = { taxMode: 'NONE', freightTerms: 'INCLUDED' }
  assert.equal(
    calculateSalesOrderAmounts({
      ...commercial,
      items: Array(2).fill({
        ordered_quantity: '1',
        unit_price: '60000000000000',
      }),
    }).complete,
    false
  )
  assert.equal(
    calculateSalesOrderAmounts({
      ...commercial,
      items: [{ ordered_quantity: '1', unit_price: '99999999999999.999999' }],
    }).complete,
    true
  )
  assert.equal(
    calculateSalesOrderAmounts({
      ...commercial,
      items: [{ ordered_quantity: '1', unit_price: '99999999999999.999999' }],
      freightTerms: 'EXCLUDED',
      quotedFreightAmount: '0.000001',
    }).complete,
    false
  )
})
