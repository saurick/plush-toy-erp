import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buildShipmentProductChangePatch,
  buildShipmentSKUChangePatch,
  buildShipmentSourceItemChangePatch,
  buildPurchaseReceiptItemParams,
  buildShipmentItemParams,
  createBlankPurchaseReceiptItem,
  createDuplicatedDraftLineItem,
  createShipmentItemFromSalesOrderItem,
  filterShipmentInventoryLotOptions,
  filterShipmentProductSKUOptions,
  formatQuantity,
  isBlankShipmentItem,
} from './businessLineItems.mjs'

const stylesRoot = fileURLToPath(new URL('../styles', import.meta.url))
const shipmentModalPath = fileURLToPath(
  new URL('../components/shipments/ShipmentBusinessModal.jsx', import.meta.url)
)

function listCSSFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = join(directory, entry)
    if (statSync(filePath).isDirectory()) return listCSSFiles(filePath)
    return filePath.endsWith('.css') ? [filePath] : []
  })
}

function declarationMap(block) {
  return new Map(
    block
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(':')
        return [
          declaration.slice(0, separator).trim(),
          declaration.slice(separator + 1).trim(),
        ]
      })
      .filter(([property]) => property)
  )
}

function cssRulesTargetingClass(cssSource, className) {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const rulePattern = new RegExp(
    `([^{}]*${escapedClassName}(?![\\w-])[^{}]*)\\{([^{}]*)\\}`,
    'gu'
  )
  const targetPattern = new RegExp(
    `${escapedClassName}(?![\\w-])\\)*(?:[:\\[].*)?$`,
    'u'
  )

  return Array.from(cssSource.matchAll(rulePattern)).flatMap((match) => {
    const declarations = declarationMap(match[2])
    return match[1]
      .split(',')
      .map((selector) => selector.replace(/\/\*[\s\S]*?\*\//gu, '').trim())
      .filter((selector) => targetPattern.test(selector))
      .map((selector) => ({ declarations, selector }))
  })
}

const horizontalLayoutContracts = [
  {
    className: '.erp-sales-order-lines-form__list',
    expected: {
      width: '100%',
      'min-width': '0',
      'max-width': '100%',
      overflow: 'auto',
    },
    forbiddenInBase: ['overflow-x'],
    protectedProperties: [
      'width',
      'min-width',
      'max-width',
      'overflow',
      'overflow-x',
    ],
  },
  {
    className: '.erp-sales-order-lines-form__row',
    expected: {
      width: 'max-content',
      'min-width': '100%',
    },
    forbiddenInBase: ['max-width', 'overflow', 'overflow-x'],
    protectedProperties: [
      'width',
      'min-width',
      'max-width',
      'overflow',
      'overflow-x',
    ],
  },
  {
    className: '.erp-sales-order-lines-form__grid',
    expected: {
      'min-width': '0',
      overflow: 'visible',
    },
    forbiddenInBase: ['width', 'max-width', 'overflow-x'],
    protectedProperties: [
      'width',
      'min-width',
      'max-width',
      'overflow',
      'overflow-x',
    ],
  },
]

function findPageLevelOverrides(rules, contract) {
  return rules.flatMap((rule) => {
    if (rule.selector === contract.className) return []
    return contract.protectedProperties
      .filter((property) => rule.declarations.has(property))
      .map((property) => ({
        filePath: rule.filePath,
        property,
        selector: rule.selector,
        value: rule.declarations.get(property),
      }))
  })
}

test('businessLineItems: CSS guard detects page-level row geometry overrides', () => {
  const rowContract = horizontalLayoutContracts.find(
    (contract) => contract.className === '.erp-sales-order-lines-form__row'
  )
  const rules = cssRulesTargetingClass(
    `
      .erp-bom-modal-items .erp-sales-order-lines-form__row {
        width: 100%;
        max-width: 100%;
      }
      .erp-sales-order-lines-form__row .ant-form-item {
        width: 180px;
      }
      .erp-bom-modal-items :where(.erp-sales-order-lines-form__row) {
        overflow: hidden;
      }
    `,
    rowContract.className
  ).map((rule) => ({ ...rule, filePath: 'synthetic.css' }))

  assert.deepEqual(findPageLevelOverrides(rules, rowContract), [
    {
      filePath: 'synthetic.css',
      property: 'width',
      selector: '.erp-bom-modal-items .erp-sales-order-lines-form__row',
      value: '100%',
    },
    {
      filePath: 'synthetic.css',
      property: 'max-width',
      selector: '.erp-bom-modal-items .erp-sales-order-lines-form__row',
      value: '100%',
    },
    {
      filePath: 'synthetic.css',
      property: 'overflow',
      selector: '.erp-bom-modal-items :where(.erp-sales-order-lines-form__row)',
      value: 'hidden',
    },
  ])
})

test('businessLineItems: shared CSS exclusively owns horizontal scroll geometry', () => {
  const cssFiles = listCSSFiles(stylesRoot)

  for (const contract of horizontalLayoutContracts) {
    const rules = cssFiles.flatMap((filePath) =>
      cssRulesTargetingClass(
        readFileSync(filePath, 'utf8'),
        contract.className
      ).map((rule) => ({ ...rule, filePath }))
    )
    const baseRules = rules.filter(
      (rule) => rule.selector === contract.className
    )

    assert.equal(
      baseRules.length,
      1,
      `${contract.className} 必须只有一条共享基线规则，当前为 ${JSON.stringify(
        baseRules.map((rule) => rule.filePath)
      )}`
    )

    const [baseRule] = baseRules
    for (const [property, expectedValue] of Object.entries(contract.expected)) {
      assert.equal(
        baseRule.declarations.get(property),
        expectedValue,
        `${contract.className} 的 ${property} 必须由共享基线保持为 ${expectedValue}`
      )
    }
    for (const property of contract.forbiddenInBase) {
      assert.equal(
        baseRule.declarations.has(property),
        false,
        `${contract.className} 的共享基线不应声明 ${property}`
      )
    }

    const pageLevelOverrides = findPageLevelOverrides(rules, contract)

    assert.deepEqual(
      pageLevelOverrides,
      [],
      `${contract.className} 的横向尺寸和 overflow 只能由共享基线定义，禁止页面私有覆盖: ${JSON.stringify(
        pageLevelOverrides
      )}`
    )
  }
})

test('businessLineItems: purchase receipt item keeps source line as display only', () => {
  assert.deepEqual(
    buildPurchaseReceiptItemParams('9', {
      material_id: '12',
      warehouse_id: '3',
      unit_id: '2',
      purchase_order_item_id: '15',
      source_line_no: ' old line ',
      quantity: ' 5.5 ',
      unit_price: '',
      amount: '12.30',
    }),
    {
      receipt_id: 9,
      material_id: 12,
      warehouse_id: 3,
      unit_id: 2,
      purchase_order_item_id: 15,
      source_line_no: 'old line',
      quantity: '5.5',
      amount: '12.30',
    }
  )
})

test('businessLineItems: blank purchase receipt item starts as unsaved draft detail', () => {
  assert.deepEqual(createBlankPurchaseReceiptItem(), {
    receipt_id: undefined,
    material_id: undefined,
    warehouse_id: undefined,
    unit_id: undefined,
    lot_id: undefined,
    purchase_order_item_id: undefined,
    lot_no: '',
    quantity: '',
    unit_price: '',
    amount: '',
    source_line_no: '',
    note: '',
  })
})

test('businessLineItems: duplicated draft line item clears identity and status fields', () => {
  const source = {
    id: 31,
    line_no: 4,
    line_status: 'closed',
    created_at: 100,
    updated_at: 200,
    material_id: 12,
    unit_id: 2,
    purchased_quantity: '10',
    unit_price: '3.5',
    note: ' 同批 ',
  }

  assert.deepEqual(createDuplicatedDraftLineItem(source), {
    material_id: 12,
    unit_id: 2,
    purchased_quantity: '10',
    unit_price: '3.5',
    note: ' 同批 ',
  })
  assert.equal(source.id, 31)
  assert.equal(source.line_no, 4)
})

test('businessLineItems: shipment item preserves SKU traceability from sales order line', () => {
  const item = createShipmentItemFromSalesOrderItem({
    id: 31,
    product_id: 7,
    product_sku_id: 11,
    unit_id: 2,
    ordered_quantity: '20',
    product_name_snapshot: '小熊',
  })

  assert.equal(item.product_sku_id, 11)
  assert.equal(isBlankShipmentItem(item), false)
  assert.deepEqual(buildShipmentItemParams(item), {
    sales_order_item_id: 31,
    product_id: 7,
    product_sku_id: 11,
    warehouse_id: 0,
    unit_id: 2,
    quantity: '20',
    note: '来源销售订单行：小熊',
  })
})

test('businessLineItems: shipment import defaults to remaining source quantity', () => {
  const item = createShipmentItemFromSalesOrderItem({
    id: 31,
    product_id: 7,
    product_sku_id: 11,
    unit_id: 2,
    ordered_quantity: '20',
    remainingQuantity: 11.5,
    product_name_snapshot: '小熊',
  })

  assert.equal(item.quantity, 11.5)
})

test('businessLineItems: quantity display preserves numeric(20,6) boundaries', () => {
  assert.equal(formatQuantity('0.000001'), '0.000001')
  assert.equal(
    formatQuantity('99999999999999.999999'),
    '99999999999999.999999'
  )
})

test('businessLineItems: shipment source switching replaces dependent SKU fields and clears stale values', () => {
  const sourceItems = [
    {
      id: 31,
      product_id: 7,
      product_sku_id: 11,
      unit_id: 2,
      ordered_quantity: '20',
      remainingQuantity: '11.5',
      selectable: true,
      disabledReason: '',
      product_name_snapshot: '小熊',
    },
  ]

  assert.deepEqual(buildShipmentSourceItemChangePatch(31, sourceItems), {
    sales_order_item_id: 31,
    product_id: 7,
    product_sku_id: 11,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: 2,
    quantity: '11.5',
    note: '来源销售订单行：小熊',
  })
  assert.deepEqual(buildShipmentSourceItemChangePatch('', sourceItems), {
    sales_order_item_id: undefined,
    product_id: undefined,
    product_sku_id: undefined,
    unit_id: undefined,
    lot_id: undefined,
    quantity: '',
    note: '',
  })
  assert.equal(
    buildShipmentSourceItemChangePatch(31, [
      {
        id: 31,
        product_id: 7,
        product_sku_id: 11,
        unit_id: 2,
        ordered_quantity: '20',
      },
    ]).sales_order_item_id,
    undefined
  )
  assert.deepEqual(
    buildShipmentSourceItemChangePatch(31, [
      {
        ...sourceItems[0],
        selectable: false,
        disabledReason: '已全部确认出货',
        remainingQuantity: '0',
      },
    ]),
    {
      sales_order_item_id: undefined,
      product_id: undefined,
      product_sku_id: undefined,
      unit_id: undefined,
      lot_id: undefined,
      quantity: '',
      note: '',
    }
  )
})

test('businessLineItems: manual product and SKU changes clear incompatible source and lot values', () => {
  assert.deepEqual(
    buildShipmentProductChangePatch(8, [{ id: 8, default_unit_id: 3 }]),
    {
      sales_order_item_id: undefined,
      product_id: 8,
      product_sku_id: undefined,
      unit_id: 3,
      lot_id: undefined,
    }
  )
  assert.deepEqual(
    buildShipmentSKUChangePatch(12, [
      { id: 12, product_id: 8, default_unit_id: 4 },
    ]),
    { product_sku_id: 12, unit_id: 4, lot_id: undefined }
  )
  assert.deepEqual(buildShipmentSKUChangePatch('', []), {
    product_sku_id: undefined,
    lot_id: undefined,
  })
})

test('businessLineItems: shipment SKU and lot options stay inside the selected product grain', () => {
  const skuOptions = [
    { value: 11, label: 'SKU-A' },
    { value: 12, label: 'SKU-B' },
  ]
  const skus = [
    { id: 11, product_id: 7 },
    { id: 12, product_id: 8 },
  ]
  assert.deepEqual(filterShipmentProductSKUOptions(skuOptions, skus, 7), [
    skuOptions[0],
  ])
  assert.deepEqual(filterShipmentProductSKUOptions(skuOptions, skus, ''), [])

  const lotOptions = [
    { value: 21, label: 'SKU-A lot' },
    { value: 22, label: 'SKU-B lot' },
    { value: 23, label: 'unclassified lot' },
    { value: 24, label: 'hold lot' },
  ]
  const lots = [
    {
      id: 21,
      subject_type: 'PRODUCT',
      subject_id: 7,
      product_sku_id: 11,
      status: 'ACTIVE',
    },
    {
      id: 22,
      subject_type: 'PRODUCT',
      subject_id: 7,
      product_sku_id: 12,
      status: 'ACTIVE',
    },
    {
      id: 23,
      subject_type: 'PRODUCT',
      subject_id: 7,
      product_sku_id: null,
      status: 'ACTIVE',
    },
    {
      id: 24,
      subject_type: 'PRODUCT',
      subject_id: 7,
      product_sku_id: 11,
      status: 'HOLD',
    },
  ]
  assert.deepEqual(
    filterShipmentInventoryLotOptions(lotOptions, lots, {
      productID: 7,
      productSkuID: 11,
    }),
    [lotOptions[0]]
  )
  assert.deepEqual(
    filterShipmentInventoryLotOptions(lotOptions, lots, {
      productID: 7,
      productSkuID: undefined,
    }),
    [lotOptions[2]]
  )
})

test('businessLineItems: shipment modal wires source clearing and no longer claims backend quantity validation is missing', () => {
  const source = readFileSync(shipmentModalPath, 'utf8')
  assert.match(source, /buildShipmentSourceItemChangePatch/u)
  assert.match(source, /filterShipmentProductSKUOptions/u)
  assert.match(source, /filterShipmentInventoryLotOptions/u)
  assert.match(source, /sourceLocked/u)
  assert.match(source, /label="销售订单行追溯"/u)
  assert.doesNotMatch(source, /剩余量强校验仍需后续后端规则补齐/u)
})
