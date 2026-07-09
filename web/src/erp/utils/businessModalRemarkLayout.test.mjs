import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fullRowRemarkContracts = [
  {
    file: '../components/sales-orders/SalesOrderForm.jsx',
    label: '报价备注',
    field: 'price_condition_note',
  },
  {
    file: '../components/sales-orders/SalesOrderForm.jsx',
    label: '备注',
    field: 'note',
  },
  {
    file: '../components/purchase-orders/PurchaseOrderForm.jsx',
    label: '备注',
    field: 'note',
  },
  {
    file: '../components/purchase-orders/PurchaseOrderInboundDraftModal.jsx',
    label: '备注',
    field: 'note',
  },
  {
    file: '../components/outsourcing-orders/OutsourcingOrderForm.jsx',
    label: '备注',
    field: 'note',
  },
  {
    file: '../components/quality-inspections/QualityInspectionForms.jsx',
    label: '备注',
    field: 'decision_note',
  },
  {
    file: '../components/quality-inspections/QualityInspectionForms.jsx',
    label: '判定备注',
    field: 'decision_note',
  },
]

const lineItemRemarkContracts = [
  '../components/sales-orders/SalesOrderForm.jsx',
  '../components/purchase-orders/PurchaseOrderForm.jsx',
  '../components/outsourcing-orders/OutsourcingOrderForm.jsx',
]

function sourceFor(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function assertFullRowRemark({ file, label, field }) {
  const source = sourceFor(file)
  const formItemBlocks =
    source.match(/<Form\.Item[\s\S]*?<\/Form\.Item>/gu) || []
  const hasFullRowRemark = formItemBlocks.some(
    (block) =>
      block.includes('erp-business-action-form__field--full') &&
      block.includes(`label="${label}"`) &&
      (block.includes(`name="${field}"`) || block.includes(`'${field}'`))
  )

  assert(
    hasFullRowRemark,
    `${file} 的非 item 备注字段 ${label}/${field} 必须使用 erp-business-action-form__field--full 独占整行`
  )
}

test('business modal non-item remarks stay on their own form row', () => {
  for (const contract of fullRowRemarkContracts) {
    assertFullRowRemark(contract)
  }
})

test('line item remarks keep the item-row layout contract', () => {
  for (const file of lineItemRemarkContracts) {
    const source = sourceFor(file)
    assert(
      source.includes(
        'erp-sales-order-lines-form__field--full erp-line-item-field erp-line-item-field--note'
      ),
      `${file} 的 item 备注应继续使用明细行 note 类，不应被升级为单据级整行备注`
    )
  }
})
