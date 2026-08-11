import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function sliceBetween(value, start, end) {
  const startIndex = value.indexOf(start)
  const endIndex = value.indexOf(end, startIndex + start.length)
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`)
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`)
  return value.slice(startIndex, endIndex)
}

function assertOrdered(value, labels) {
  let cursor = -1
  for (const label of labels) {
    const nextIndex = value.indexOf(label, cursor + 1)
    assert.notEqual(nextIndex, -1, `missing section: ${label}`)
    assert(nextIndex > cursor, `section is out of order: ${label}`)
    cursor = nextIndex
  }
}

function assertUsesSharedSectionTitle(relativePath) {
  const value = source(relativePath)
  assert(value.includes('BusinessFormSectionTitle'))
  assert(value.includes('<BusinessFormSectionTitle>'))
  assert(!value.includes('className="erp-business-action-form__section-title"'))
}

test('shared section title exposes heading semantics and a responsive divider', () => {
  const componentSource = source(
    '../components/business-list/BusinessFormSectionTitle.jsx'
  )
  const modalStyles = source('../styles/app/business-modals.css')
  const responsiveStyles = source('../styles/app/business-responsive.css')

  assert.match(componentSource, /role="heading"/u)
  assert.match(componentSource, /aria-level=\{3\}/u)
  assert.match(componentSource, /section-title-text/u)
  assert.match(modalStyles, /\.erp-business-action-form__section-title::after/u)
  assert.match(modalStyles, /--erp-business-action-modal-divider/u)
  assert.match(responsiveStyles, /section-title[\s\S]*gap: 10px/u)
})

test('all governed long forms use the shared section-title component', () => {
  const paths = [
    '../components/sales-orders/SalesOrderForm.jsx',
    '../components/master-data/MasterDataForm.jsx',
    '../components/production-orders/ProductionCompletionModal.jsx',
    '../components/purchase-receipts/PurchaseReceiptExceptionModal.jsx',
    '../pages/FinancePaymentsPage.jsx',
    '../components/outsourcing-orders/OutsourcingOrderSourceFactModal.jsx',
    '../components/outsourcing-orders/OutsourcingOrderForm.jsx',
    '../components/purchase-orders/PurchaseOrderForm.jsx',
    '../components/shipments/ShipmentBusinessModal.jsx',
    '../components/bom/BOMVersionForms.jsx',
  ]

  for (const relativePath of paths) {
    assertUsesSharedSectionTitle(relativePath)
  }
})

test('sales order header follows the three audited business sections', () => {
  assertOrdered(source('../components/sales-orders/SalesOrderForm.jsx'), [
    '订单与客户',
    '联系人与负责人',
    '结算与交付',
  ])
})

test('long master-data variants are sectioned while the short product form stays flat', () => {
  const masterDataSource = source(
    '../components/master-data/MasterDataForm.jsx'
  )
  const productBlock = sliceBetween(
    masterDataSource,
    "if (type === 'products')",
    "if (type === 'product_skus')"
  )
  const skuBlock = sliceBetween(
    masterDataSource,
    "if (type === 'product_skus')",
    "if (type === 'processes')"
  )
  const processBlock = sliceBetween(
    masterDataSource,
    "if (type === 'processes')",
    '  return (\n    <>'
  )

  assert(!productBlock.includes('<BusinessFormSectionTitle>'))
  assertOrdered(skuBlock, ['归属与编号', '规格属性', '计量与附件'])
  assertOrdered(processBlock, ['基本资料', '路线与加工能力'])
  assert(
    masterDataSource.includes(
      "type === 'customers' || type === 'suppliers' ? ("
    )
  )
  assertOrdered(
    masterDataSource.slice(masterDataSource.indexOf('  return (\n    <>')),
    ['基本资料', '加工能力', '结算方式']
  )
})

test('operational long forms expose the audited semantic sections', () => {
  const contracts = [
    [
      '../components/production-orders/ProductionCompletionModal.jsx',
      ['完工来源与数量', '入库仓库与批次'],
    ],
    [
      '../components/purchase-receipts/PurchaseReceiptExceptionModal.jsx',
      ['整单信息', '退货明细', '整单备注'],
    ],
    ['../pages/FinancePaymentsPage.jsx', ['往来与金额', '账户与凭据']],
    [
      '../components/outsourcing-orders/OutsourcingOrderSourceFactModal.jsx',
      ['仓库与批次', '数量与时间'],
    ],
  ]

  for (const [relativePath, labels] of contracts) {
    assertOrdered(source(relativePath), labels)
  }
})

test('document-style long forms follow stable business section order', () => {
  const contracts = [
    [
      '../components/purchase-orders/PurchaseOrderForm.jsx',
      ['订单与供应商', '合同订购方信息', '备注与附件'],
    ],
    [
      '../components/outsourcing-orders/OutsourcingOrderForm.jsx',
      ['合同与加工厂', '合同委托方信息', '合同乙方信息', '备注与附件'],
    ],
    [
      '../components/shipments/ShipmentBusinessModal.jsx',
      ['单据与客户', '计划与附件'],
    ],
    [
      '../components/bom/BOMVersionForms.jsx',
      ['版本信息', '订单与数量', '制表与说明'],
    ],
  ]

  for (const [relativePath, labels] of contracts) {
    assertOrdered(source(relativePath), labels)
  }
})

test('short action and inspection forms intentionally remain flat', () => {
  const shortFormPaths = [
    '../components/purchase-orders/PurchaseOrderInboundDraftModal.jsx',
    '../components/quality-inspections/QualityInspectionForms.jsx',
  ]

  for (const relativePath of shortFormPaths) {
    assert(!source(relativePath).includes('<BusinessFormSectionTitle>'))
  }
})
