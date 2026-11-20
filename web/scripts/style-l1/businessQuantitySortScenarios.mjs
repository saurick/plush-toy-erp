import { expect } from 'playwright/test'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const rowsFor = (makeRow) => Array.from({ length: 51 }, (_, index) => makeRow(index + 1))

async function mockList(page, methods) {
  await page.route('**/rpc/*', async (route) => {
    const { id, method, params = {} } = route.request().postDataJSON() || {}
    if (!Object.hasOwn(methods, method)) return route.fallback()
    const { rows, key, extra } = methods[method]
    const ordered = params.sort_by ? [...rows].sort((a, b) =>
      (params.sort_direction === 'asc' ? 1 : -1) * (Number(a[params.sort_by]) - Number(b[params.sort_by])) || b.id - a.id
    ) : rows
    await route.fulfill({ json: {
      jsonrpc: '2.0',
id,
      result: styleRpcResult({ ...stylePaginatedRpcData(ordered, key, params), ...extra }),
    } })
  })
}

const waitForList = (page, method, testParams) => page.waitForResponse((response) => {
  if (!response.url().includes('/rpc/')) return false
  const body = response.request().postDataJSON()
  return body?.method === method && testParams(body.params ?? {})
})

async function checkServerSort(page, { title, method, field, firstRow, ascendingRow }) {
  const header = page.getByRole('columnheader', { name: title, exact: true })
  const table = header.locator('xpath=ancestor::*[contains(@class, "ant-table-wrapper")][1]')
  const firstCell = table.locator('tbody tr[data-row-key]').first()
  const activePage = page.locator('.ant-pagination-item-active:visible')
  await expect(firstCell).toContainText(firstRow)
  await Promise.all([
    waitForList(page, method, (p) => p.offset === 50 && !p.sort_by),
    page.locator('.ant-pagination-item-2:visible').click(),
  ])
  await expect(activePage).toHaveAttribute('title', '2')
  for (const direction of ['asc', 'desc', '']) {
    await Promise.all([
      waitForList(page, method, (p) => p.offset === 0 && (p.sort_by || '') === (direction ? field : '') && (p.sort_direction || '') === direction),
      direction === 'asc' ? header.press('Enter') : header.click(),
    ])
    if (direction) {
      await expect(header).toHaveAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending')
    } else {
      await expect(header).not.toHaveAttribute('aria-sort', /.+/u)
    }
    await expect(activePage).toHaveAttribute('title', '1')
    await expect(firstCell).toContainText(direction === 'asc' ? ascendingRow : firstRow)
  }
}

export function createBusinessQuantitySortScenarios({ customerRuntimeEffectiveSession, assertNoHorizontalOverflow }) {
  const settings = { auth: 'admin', effectiveSession: customerRuntimeEffectiveSession, viewport: { width: 1440, height: 900 } }
  const cases = [
    {
      name: 'finance-payment-amount-server-sort',
path: '/erp/finance/payments',
      method: 'list_finance_payments',
key: 'payments',
title: '金额',
field: 'amount',
      firstRow: 'PAY-QSORT-1',
ascendingRow: 'PAY-QSORT-51',
      rows: rowsFor((id) => ({ id, payment_no: `PAY-QSORT-${id}`, status: 'DRAFT', direction: 'RECEIPT', amount: String(52 - id), currency: 'CNY' })),
    },
    {
      name: 'finance-credit-amount-server-sort',
path: '/erp/finance/receivables?workspace=credits',
      method: 'list_finance_credit_notes',
key: 'credit_notes',
title: '调整金额',
field: 'amount',
      firstRow: 'CN-QSORT-1',
ascendingRow: 'CN-QSORT-51',
      rows: rowsFor((id) => ({ id, credit_note_no: `CN-QSORT-${id}`, status: 'POSTED', amount: String(52 - id), currency: 'CNY', balance_direction: 'DECREASE' })),
    },
    {
      name: 'warehouse-work-quantity-server-sort',
path: '/erp/warehouse/inbound?warehouse_view=completion',
      method: 'list_warehouse_production_work',
key: 'items',
title: '本次数量',
field: 'quantity',
      firstRow: 'FG-QSORT-1',
ascendingRow: 'FG-QSORT-51',
      rows: rowsFor((id) => ({ id, fact_no: `FG-QSORT-${id}`, kind: 'RECEIPT', stage: 'AWAITING_INBOUND', quantity: String(52 - id), unit_name: '只', pending_inspection_quantity: '0', pending_packaging_quantity: '0' })),
      extra: { counts: { '': 51, AWAITING_INBOUND: 51 } },
    },
    {
      name: 'shipment-weight-server-sort',
path: '/erp/warehouse/shipments',
      method: 'list_shipments',
key: 'shipments',
title: '总净重（克）',
field: 'total_net_weight_g',
      firstRow: 'SHP-QSORT-1',
ascendingRow: 'SHP-QSORT-51',
      rows: rowsFor((id) => ({ id, shipment_no: `SHP-QSORT-${id}`, status: 'DRAFT', total_net_weight_g: String(52 - id), items: [] })),
      verifyLocalSort: async (page) => {
        const local = page.getByRole('columnheader', { name: '出货单号', exact: true })
        await local.hover()
        await expect(page.getByRole('tooltip').filter({ hasText: '仅排序当前页' })).toBeVisible()
        await local.click()
        await expect(local).toHaveAttribute('aria-sort', 'ascending')
      },
    },
  ]
  return cases.map((scenario) => ({
    ...settings,
    name: scenario.name,
    path: scenario.path,
    beforeNavigate: (page) => mockList(page, { [scenario.method]: scenario }),
    verify: async (page) => {
      await checkServerSort(page, scenario)
      await scenario.verifyLocalSort?.(page)
      await assertNoHorizontalOverflow(page, scenario.name)
    },
  }))
}
