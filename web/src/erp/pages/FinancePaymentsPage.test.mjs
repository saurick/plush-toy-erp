import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./FinancePaymentsPage.jsx', import.meta.url),
  'utf8'
)
const helpSource = readFileSync(
  new URL('../config/businessUsabilityCatalog.mjs', import.meta.url),
  'utf8'
)

test('finance payments: routes reversal terms through the shared page help', () => {
  assert.match(source, /helpKey="finance-payments"/u)
  assert.doesNotMatch(source, /aria-label="查看冲销和红冲说明"/u)
  assert.match(helpSource, /'allocation-reversal'/u)
  assert.match(helpSource, /核销、冲销和红冲分别是什么/u)
  assert.match(helpSource, /冲销是撤回已过账收付款的影响/u)
  assert.match(helpSource, /红冲是用独立反向记录调整应收或应付/u)
  assert.match(helpSource, /三种操作都会保留原记录和审计/u)
})

test('finance payments: both fact tabs expose independent column-order tools', () => {
  assert.equal(source.match(/<BusinessListToolbarActions/gu)?.length, 2)
  assert.equal(source.match(/useBusinessColumnOrder\(\{/gu)?.length, 2)

  for (const text of [
    "const FINANCE_PAYMENT_COLUMN_ORDER_KEY = 'finance-payments-records'",
    "const FINANCE_CREDIT_NOTE_COLUMN_ORDER_KEY = 'finance-credit-notes-records'",
    'columns={paymentTableColumns}',
    'columns={creditTableColumns}',
    '{paymentColumnOrderModal}',
    '{creditColumnOrderModal}',
    'onOpenColumnOrder={openPaymentColumnOrder}',
    'onOpenColumnOrder={openCreditColumnOrder}',
  ]) {
    assert.equal(
      source.includes(text),
      true,
      `finance payment table tools should preserve: ${text}`
    )
  }
})

test('finance payments: exports complete active-tab filters with readable values', () => {
  assert.match(
    source,
    /const exportPaymentRows = useCallback\([\s\S]*?listAllFinancePayments\([\s\S]*?status: paymentStatusFilter,[\s\S]*?direction: paymentDirectionFilter,[\s\S]*?downloadBusinessListCSV\(\{[\s\S]*?columns: paymentExportColumns,[\s\S]*?rows,/u
  )
  assert.match(
    source,
    /const exportCreditRows = useCallback\([\s\S]*?listAllFinanceCreditNotes\([\s\S]*?status: creditStatusFilter[\s\S]*?downloadBusinessListCSV\(\{[\s\S]*?columns: creditExportColumns,[\s\S]*?rows,/u
  )

  for (const text of [
    'exportValue: paymentAllocationExportValue',
    'paymentStatusLabel(record?.status)',
    'formatUnixDateTime(record?.occurred_at)',
    'financeFactTypeLabel(record?.finance_fact_type)',
    'creditStatusLabel(record?.status)',
    '当前筛选没有可导出的收付款记录',
    '当前筛选没有可导出的红冲记录',
  ]) {
    assert.equal(
      source.includes(text),
      true,
      `finance exports should preserve readable filtered output: ${text}`
    )
  }
})
