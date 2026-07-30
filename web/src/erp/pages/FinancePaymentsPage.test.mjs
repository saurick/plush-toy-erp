import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./FinancePaymentsPage.jsx', import.meta.url),
  'utf8'
)

test('finance payments: explains reversal terms through one accessible help entry', () => {
  assert.equal(source.match(/aria-label="查看冲销和红冲说明"/gu)?.length, 1)
  assert.match(source, /matchMedia\('\(hover: none\), \(pointer: coarse\)'\)/u)
  assert.match(
    source,
    /trigger=\{usesTouchInteraction \? \['click'\] : \['hover', 'focus', 'click'\]\}/u
  )
  assert.match(source, /min\(260px, calc\(100vw - 64px\)\)/u)
  assert.match(source, /min\(340px, calc\(100vw - 56px\)\)/u)
  assert.match(source, /冲销与红冲有什么区别/u)
  assert.match(source, /撤销一笔已经核销的收款或付款/u)
  assert.match(source, /相应金额会恢复为未核销/u)
  assert.match(source, /对某笔应收或应付登记反向金额调整/u)
  assert.match(source, /减少该笔账款的未核销金额/u)
  assert.match(source, /不代表税控红字发票、总账凭证或银行对账已经完成/u)
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
