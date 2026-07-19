import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  calculateShipmentLineNetWeightG,
  hasFinalShipmentWeight,
  listAllShipmentWeightReferenceRecords,
  normalizeNetWeightG,
  normalizeShipmentQuantity,
  resolveShipmentSubmittedTotalNetWeight,
  resolveShipmentWeightPreview,
  shipmentWeightItemsSignature,
  shipmentWeightReferenceOption,
} from './shipmentWeight.mjs'

const products = [
  {
    id: 1,
    default_unit_id: 10,
    unit_net_weight_g: '0.5',
  },
]

function readERPSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

test('shipmentWeight: SKU weight wins and uses its explicit default unit', () => {
  const preview = resolveShipmentWeightPreview({
    items: [
      {
        product_id: 1,
        product_sku_id: 11,
        unit_id: 20,
        quantity: '3',
      },
    ],
    products,
    productSKUs: [
      {
        id: 11,
        product_id: 1,
        default_unit_id: 20,
        unit_net_weight_g: '0.625',
      },
    ],
  })

  assert.equal(preview.complete, true)
  assert.equal(preview.totalNetWeightG, '1.875')
  assert.equal(preview.linePreviews[0].source, 'sku')
})

test('shipmentWeight: product fallback is only used when SKU has no weight and line uses product default unit', () => {
  const productSKUs = [
    {
      id: 11,
      product_id: 1,
      default_unit_id: 20,
      unit_net_weight_g: null,
    },
  ]
  const preview = resolveShipmentWeightPreview({
    items: [
      {
        product_id: 1,
        product_sku_id: 11,
        unit_id: 10,
        quantity: '3',
      },
    ],
    products,
    productSKUs,
  })

  assert.equal(preview.complete, true)
  assert.equal(preview.totalNetWeightG, '1.5')
  assert.equal(preview.linePreviews[0].source, 'product')

  const mismatched = resolveShipmentWeightPreview({
    items: [{ product_id: 1, product_sku_id: 11, unit_id: 20, quantity: '3' }],
    products,
    productSKUs,
  })
  assert.equal(mismatched.complete, false)
  assert.equal(mismatched.totalNetWeightG, null)
  assert.equal(mismatched.issues[0].code, 'unit_mismatch')
})

test('shipmentWeight: SKU weight without an explicit unit never falls back to product', () => {
  const preview = resolveShipmentWeightPreview({
    items: [{ product_id: 1, product_sku_id: 11, unit_id: 10, quantity: '3' }],
    products,
    productSKUs: [
      {
        id: 11,
        product_id: 1,
        default_unit_id: null,
        unit_net_weight_g: '0.625',
      },
    ],
  })

  assert.equal(preview.complete, false)
  assert.equal(preview.totalNetWeightG, null)
  assert.equal(preview.issues[0].code, 'sku_weight_unit_missing')
})

test('shipmentWeight: one unresolved line suppresses the whole total instead of returning a partial sum', () => {
  const preview = resolveShipmentWeightPreview({
    items: [
      { product_id: 1, unit_id: 10, quantity: '2' },
      { product_id: 1, unit_id: 99, quantity: '3' },
    ],
    products,
  })

  assert.equal(preview.complete, false)
  assert.equal(preview.totalNetWeightG, null)
  assert.equal(preview.linePreviews[0].lineNetWeightG, '1')
  assert.equal(preview.issues[0].lineNumber, 2)
})

test('shipmentWeight: product and SKU weight references load every page including inactive records', async () => {
  const allRecords = Array.from({ length: 251 }, (_, index) => ({
    id: index + 1,
    default_unit_id: 10,
    is_active: index !== 250,
    unit_net_weight_g: index === 250 ? '0.625' : '0.5',
  }))
  const requests = []
  const records = await listAllShipmentWeightReferenceRecords(
    async (params) => {
      requests.push(params)
      const page = allRecords.slice(params.offset, params.offset + params.limit)
      return {
        products: page,
        total: allRecords.length,
        limit: params.limit,
        offset: params.offset,
      }
    },
    'products',
    { active_only: true, limit: 500 }
  )

  assert.equal(records.length, 251)
  assert.equal(records.at(-1).is_active, false)
  assert.deepEqual(requests, [
    { limit: 200, offset: 0 },
    { limit: 200, offset: 200 },
  ])
  assert.equal(
    resolveShipmentWeightPreview({
      items: [{ product_id: 251, unit_id: 10, quantity: '2' }],
      products: records,
    }).totalNetWeightG,
    '1.25'
  )
  assert.deepEqual(
    shipmentWeightReferenceOption(records.at(-1), (record) => ({
      value: record.id,
      label: `产品 ${record.id}`,
    })),
    {
      value: 251,
      label: '产品 251（已停用）',
      disabled: true,
    }
  )
})

test('shipmentWeight: incomplete reference pagination fails closed instead of returning a partial cache', async () => {
  await assert.rejects(
    listAllShipmentWeightReferenceRecords(
      async () => ({
        product_skus: [{ id: 1 }],
        total: 75,
        limit: 200,
        offset: 0,
      }),
      'product_skus'
    ),
    /产品净重资料不完整/u
  )
})

test('shipmentWeight: decimal string calculation preserves values beyond JavaScript safe integer range', () => {
  const preview = resolveShipmentWeightPreview({
    items: [
      {
        product_id: 1,
        unit_id: 10,
        quantity: '90071992547409.123456',
      },
    ],
    products: [{ id: 1, default_unit_id: 10, unit_net_weight_g: '0.000001' }],
  })

  assert.equal(preview.complete, true)
  assert.equal(preview.totalNetWeightG, '90071992.547409')
  assert.equal(
    calculateShipmentLineNetWeightG('90071992547409.123456', '0.000001'),
    '90071992.547409'
  )
})

test('shipmentWeight: decimal parser accepts backend-equivalent plain and exponent forms exactly', () => {
  for (const [value, expected] of [
    ['.5', '0.5'],
    ['01', '1'],
    ['1e2', '100'],
    ['+5e-1', '0.5'],
    ['0.5000000', '0.5'],
    ['10e-7', '0.000001'],
    ['1000000000000000000000000e-24', '1'],
  ]) {
    assert.equal(normalizeNetWeightG(value), expected)
    assert.equal(normalizeShipmentQuantity(value), expected)
  }

  for (const value of ['1e-7', '0.00000010', '0.5000001', '1e14']) {
    assert.equal(normalizeNetWeightG(value), null)
    assert.equal(normalizeShipmentQuantity(value), null)
  }

  const preview = resolveShipmentWeightPreview({
    items: [{ product_id: 1, unit_id: 10, quantity: '1e2' }],
    products: [
      {
        id: 1,
        default_unit_id: 10,
        unit_net_weight_g: '.5',
      },
    ],
  })
  assert.equal(preview.complete, true)
  assert.equal(preview.totalNetWeightG, '50')
  assert.deepEqual(
    ['.5', '01', '1e2'].map((quantity) => normalizeShipmentQuantity(quantity)),
    ['0.5', '1', '100']
  )
  assert.equal(calculateShipmentLineNetWeightG('.5', '0.000001'), '0.000001')
  assert.equal(
    resolveShipmentWeightPreview({
      items: [
        { product_id: 1, unit_id: 10, quantity: '0.4' },
        { product_id: 1, unit_id: 10, quantity: '0.4' },
      ],
      products: [
        {
          id: 1,
          default_unit_id: 10,
          unit_net_weight_g: '0.000001',
        },
      ],
    }).totalNetWeightG,
    '0.000001'
  )
})

test('shipmentWeight: stored decimal inputs outside numeric(20,6) fail closed', () => {
  const preview = resolveShipmentWeightPreview({
    items: [{ product_id: 1, unit_id: 10, quantity: '100000000000000' }],
    products,
  })

  assert.equal(preview.complete, false)
  assert.equal(preview.totalNetWeightG, null)
  assert.equal(preview.issues[0].code, 'quantity_invalid')
})

test('shipmentWeight: manual total is bound to the full line signature and cleared when auto calculation becomes complete', () => {
  const originalItems = [
    {
      sales_order_item_id: 101,
      product_id: 1,
      product_sku_id: 11,
      unit_id: 10,
      quantity: '3',
    },
  ]
  const changedItems = [{ ...originalItems[0], quantity: '4' }]
  const signature = shipmentWeightItemsSignature(originalItems)
  const incompletePreview = { complete: false }

  assert.equal(
    resolveShipmentSubmittedTotalNetWeight({
      preview: incompletePreview,
      manualValue: ' 1.500000 ',
      manualItemsSignature: signature,
      items: originalItems,
    }),
    '1.5'
  )
  assert.equal(
    resolveShipmentSubmittedTotalNetWeight({
      preview: incompletePreview,
      manualValue: '1.5',
      manualItemsSignature: signature,
      items: changedItems,
    }),
    null
  )
  assert.equal(
    resolveShipmentSubmittedTotalNetWeight({
      preview: { complete: true },
      manualValue: '1.5',
      manualItemsSignature: signature,
      items: originalItems,
    }),
    null
  )

  for (const changed of [
    [{ ...originalItems[0], product_id: 2 }],
    [{ ...originalItems[0], product_sku_id: 12 }],
    [{ ...originalItems[0], unit_id: 20 }],
    [...originalItems, { product_id: 1, unit_id: 10, quantity: '1' }],
    [],
  ]) {
    assert.notEqual(shipmentWeightItemsSignature(changed), signature)
  }
})

test('shipmentWeight: frozen line snapshot can produce the displayed line net weight', () => {
  assert.equal(calculateShipmentLineNetWeightG('3', '0.425'), '1.275')
  assert.equal(
    normalizeNetWeightG('99999999999999.999999'),
    '99999999999999.999999'
  )
  assert.equal(normalizeNetWeightG('100000000000000'), null)
  assert.equal(hasFinalShipmentWeight('SHIPPED'), true)
  assert.equal(hasFinalShipmentWeight('CANCELLED'), true)
  assert.equal(hasFinalShipmentWeight('DRAFT'), false)
})

test('shipmentWeight: SKU, shipment modal, list column, export and stale-clear UI contracts are wired', () => {
  const shipmentWeightSource = readERPSource('./shipmentWeight.mjs')
  const masterFormSource = readERPSource(
    '../components/master-data/MasterDataForm.jsx'
  )
  const masterColumnsSource = readERPSource(
    '../components/master-data/masterDataColumns.jsx'
  )
  const masterPageSource = readERPSource('../pages/V1MasterDataPage.jsx')
  const shipmentModalSource = readERPSource(
    '../components/shipments/ShipmentBusinessModal.jsx'
  )
  const shipmentColumnsSource = readERPSource(
    '../components/shipments/shipmentColumns.jsx'
  )
  const shipmentsPageSource = readERPSource('../pages/ShipmentsPage.jsx')

  assert.doesNotMatch(shipmentWeightSource, /\bBigInt\b|\b\d+n\b/u)

  assert.match(masterFormSource, /label="SKU 单重（净重）"/u)
  assert.match(
    masterFormSource,
    /requiredWhenWeightField="unit_net_weight_g"/u
  )
  assert.match(
    masterPageSource,
    /所属产品或 SKU 默认单位已变更，SKU 单重已清空/u
  )
  assert.match(masterColumnsSource, /title: 'SKU 单重（净重）'/u)
  assert.match(masterColumnsSource, /compareNumeric20Scale6Values\(/u)
  assert.doesNotMatch(
    masterColumnsSource,
    /Number\(a\?\.unit_net_weight_g/u
  )
  assert.match(
    masterColumnsSource,
    /exportTitle: 'SKU 单重（克）'/u
  )

  assert.match(shipmentModalSource, /message=\{`预计总净重：/u)
  assert.match(shipmentModalSource, /label="实际总净重（克）"/u)
  assert.match(shipmentModalSource, /normalizeShipmentQuantity\(value\)/u)
  assert.match(shipmentModalSource, /数量必须大于 0，且最多保留 6 位小数/u)
  assert.match(shipmentModalSource, /系统不会显示或提交部分合计/u)
  assert.match(shipmentModalSource, /确认出货单重（克）/u)
  assert.match(shipmentModalSource, /行净重（克）/u)
  assert.match(shipmentModalSource, /hasFinalShipmentWeight\(status\)/u)
  assert.match(
    shipmentModalSource,
    /出货明细已变更，旧人工总净重已清空，请重新填写/u
  )
  assert.match(
    shipmentModalSource,
    /onImport=\{\(sourceItems\) => \{[\s\S]*clearStaleManualWeight\(\)/u
  )

  assert.match(shipmentColumnsSource, /dataIndex: 'total_net_weight_g'/u)
  assert.match(shipmentColumnsSource, /exportTitle: '总净重（克）'/u)
  assert.match(shipmentColumnsSource, /return '待确认'/u)
  assert.match(shipmentColumnsSource, /return '未记录'/u)
  assert.match(
    shipmentColumnsSource,
    /hasFinalShipmentWeight\(record\?\.status\)/u
  )
  assert.match(
    shipmentsPageSource,
    /resolveShipmentSubmittedTotalNetWeight\(\{[\s\S]*manualItemsSignature/u
  )
  assert.match(
    shipmentsPageSource,
    /buildShipmentWithItemsParams\(values, \{ products, productSKUs \}\)/u
  )
  assert.match(
    shipmentsPageSource,
    /quantity:\s*normalizeShipmentQuantity\(item\?\.quantity\)/u
  )
  assert.match(
    shipmentsPageSource,
    /listAllShipmentWeightReferenceRecords\(listProducts, 'products'\)/u
  )
  assert.match(shipmentsPageSource, /shipmentWeightReferenceOption/u)
  assert.doesNotMatch(
    shipmentsPageSource,
    /listProducts\(\{\s*limit:\s*500,\s*active_only:\s*true\s*\}\)/u
  )
})
