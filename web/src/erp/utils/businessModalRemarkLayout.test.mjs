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

test('订单备注与附件使用共享宽窄布局，不挤入明细行', () => {
  for (const file of lineItemRemarkContracts) {
    const sections = sourceFor(file).match(/<BusinessFormSection\b[\s\S]*?<\/BusinessFormSection>/gu) || []
    const support = sections.find((block) => /title="备注与附件"/u.test(block))
    assert.ok(support, `${file}: missing remark and attachment section`)
    assert.match(support, /fieldLayout="support"/u)
    assert.match(support, /<Form\.Item\b[^>]*name="note"[^>]*label="备注"|<Form\.Item\b[^>]*label="备注"[^>]*name="note"/u)
    assert.doesNotMatch(support, /erp-line-item-field--note/u)
    assert.match(support, /\{attachmentPanel\}/u)
  }
  const styles = sourceFor('../components/business-list/businessFormSections.css')
  assert.match(styles, /\[data-field-layout='support'\]\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u)
  assert.match(styles, /@container business-form-fields \(max-width: 720px\)[\s\S]*?\[data-field-layout='support'\]\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/u)
})

test('line item remarks keep the item-row layout contract', () => {
  for (const file of lineItemRemarkContracts) {
    const source = sourceFor(file)
    const blocks = source.match(/<Form\.Item[\s\S]*?<\/Form\.Item>/gu) || []
    assert(
      blocks.some((block) =>
        block.includes('erp-line-item-field--note') &&
        block.includes("name={[field.name, 'note']}") &&
        !block.includes('erp-business-action-form__field--full')
      ),
      `${file} 的 item 备注应继续使用明细行 note 类，不应被升级为单据级整行备注`
    )
  }
})

test('purchase arrival keeps its optional note with receipt information', () => {
  const source = sourceFor('../components/purchase-orders/PurchaseOrderInboundDraftModal.jsx')
  const receipt = source.match(/<section[^>]*aria-label="收货信息"[\s\S]*?<\/section>/u)?.[0] || ''
  assert.match(receipt, /<Form\.Item name="note" label="到货备注">\s*<BusinessTextArea[\s\S]*?maxLength=\{BusinessTextPolicy\.noteMaxCharacters\}/u)
  assert.doesNotMatch(receipt, /<TextArea|rows=|maxRows/u)
})
