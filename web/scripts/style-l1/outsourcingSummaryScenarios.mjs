import fs from 'node:fs/promises'
import path from 'node:path'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createOutsourcingSummaryScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const rows = Array.from({ length: 205 }, (_, index) => ({
    id: index + 1,
    outsourcing_order_id: 1,
    outsourcing_order_no: 'SIM-OUTSOURCE-CONTRACT-L1',
    product_order_no_snapshot: `SO-SUM-${index + 1}`,
    subject_type: index === 204 ? 'MATERIAL' : 'PRODUCT',
    product_no_snapshot: index === 204 ? null : `22040-${index + 1}`,
    product_name_snapshot: index === 204 ? null : `模拟产品 ${index + 1}`,
    material_code_snapshot: index === 204 ? 'MAT-SUM-205' : null,
    material_name_snapshot: index === 204 ? '模拟筛选布料' : null,
    processing_item: index === 204 ? '耳*2' : '脸*1',
    process_id: 1,
    process_name_snapshot: '电绣',
    supplier_id: 1,
    supplier_name: '模拟加工厂',
    unit_name_snapshot: '件',
    unit_price: index === 204 ? null : '2',
    outsourcing_quantity: '12',
    amount: index === 204 ? null : '24',
    currency: 'CNY',
    order_date: 1788883200,
    expected_return_date: 1789747200,
    buyer_contact: '模拟委托人',
    buyer_phone: '020-00000000',
    lifecycle_status: index === 204 ? 'canceled' : 'draft',
    line_status: 'open',
    note:
      index === 204
        ? '需要核对的较长加工说明，分批包装并保留清楚的原产品订单编号。'
        : '',
  }))
  return [false, true].map((readOnly) => {
    let calls = []
    let failNext = false
    const name = readOnly
      ? 'outsourcing-summary-readonly-tablet'
      : 'outsourcing-summary-desktop'
    const permissions = [
      'outsourcing.order.read',
      'supplier.read',
      'product.read',
      'product_sku.read',
      'material.read',
      'process.read',
      'unit.read',
      ...(readOnly
        ? []
        : [
            'field.procurement_commercial.read',
            'field.finance_settlement.read',
            'field.party_private.read',
          ]),
    ]
    return {
      name,
      auth: 'admin',
      path: '/erp/purchase/processing-contracts',
      viewport: { width: readOnly ? 768 : 1440, height: 900 },
      themeMode: readOnly ? 'dark' : 'light',
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'purchase', name: '采购' }],
        permissions,
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: permissions,
      },
      beforeNavigate: async (page) => {
        calls = []
        failNext = false
        await page.route('**/rpc/outsourcing_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_outsourcing_order_summary')
            return route.fallback()
          calls.push(params)
          if (failNext) {
            failNext = false
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code: 50000, message: '暂时无法读取加工明细' },
              }),
            })
          }
          const filtered = rows
            .filter(
              (row) =>
                (!params.keyword ||
                  [
                    row.product_order_no_snapshot,
                    row.processing_item,
                    row.product_name_snapshot,
                    row.material_name_snapshot,
                  ].some((value) => value?.includes(params.keyword))) &&
                (!params.lifecycle_status ||
                  row.lifecycle_status === params.lifecycle_status)
            )
            .map((row) => {
              const copy = { ...row }
              if (readOnly) {
                delete copy.unit_price
                delete copy.amount
                delete copy.currency
                delete copy.buyer_phone
              }
              return copy
            })
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(
                stylePaginatedRpcData(filtered, 'items', params)
              ),
            }),
          })
        })
      },
      verify: async (page) => {
        await page.getByRole('tab', { name: '加工明细', exact: true }).click()
        const region = page.getByRole('region', { name: '委外加工明细汇总' })
        await region.getByText('模拟产品 1', { exact: true }).waitFor()
        const countBeforeRefresh = calls.length
        const refreshed = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/outsourcing_order') &&
            response.request().postDataJSON()?.method ===
              'list_outsourcing_order_summary'
        )
        await page
          .getByRole('button', { name: /刷新当前页/u })
          .click()
        await refreshed
        await region.getByText('模拟产品 1', { exact: true }).waitFor()
        assert.equal(calls.length, countBeforeRefresh + 1)
        assert.equal(
          await region
            .getByRole('columnheader', { name: '单价', exact: true })
            .count(),
          readOnly ? 0 : 1
        )
        assert.equal(
          await region
            .getByRole('columnheader', { name: '委托方电话', exact: true })
            .count(),
          readOnly ? 0 : 1
        )
        await region.locator('.ant-pagination-item-2').click()
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        assert.equal(calls.at(-1).offset, 20)
        const [fullDownload] = await Promise.all([
          page.waitForEvent('download'),
          region
            .getByRole('button', { name: '导出加工明细', exact: true })
            .click(),
        ])
        const fullCSV = await fs.readFile(await fullDownload.path(), 'utf8')
        assert.ok(
          fullCSV.includes('SO-SUM-1') && fullCSV.includes('SO-SUM-205')
        )
        assert.equal(
          calls.some((call) => call.limit === 200 && call.offset === 200),
          true
        )
        assert.equal(fullCSV.includes('委托方电话'), !readOnly)
        assert.equal(fullCSV.includes('单价'), !readOnly)
        assert.equal(fullCSV.includes('020-00000000'), !readOnly)
        const search = region.getByRole('textbox', { name: '搜索加工明细' })
        await search.fill('耳*2')
        await search.press('Enter')
        await region.getByText('模拟筛选布料', { exact: true }).waitFor()
        assert.equal(calls.at(-1).offset, 0)
        await region.getByText('共 1 条加工明细', { exact: true }).waitFor()
        await region.getByText('已取消', { exact: true }).waitFor()
        const [filteredDownload] = await Promise.all([
          page.waitForEvent('download'),
          region
            .getByRole('button', { name: '导出加工明细', exact: true })
            .click(),
        ])
        const filteredCSV = await fs.readFile(
          await filteredDownload.path(),
          'utf8'
        )
        assert.ok(
          filteredCSV.includes('MAT-SUM-205') &&
            !filteredCSV.includes('模拟产品 1')
        )
        await region
          .getByRole('button', {
            name: 'SIM-OUTSOURCE-CONTRACT-L1',
            exact: true,
          })
          .click()
        await page.getByRole('tab', { name: '加工合同', exact: true }).waitFor()
        assert.equal(
          new URL(page.url()).searchParams.get('outsourcing_order_id'),
          '1'
        )
        await page.getByRole('tab', { name: '加工明细', exact: true }).click()
        await region.getByText('模拟筛选布料', { exact: true }).waitFor()
        assert.equal(await search.inputValue(), '耳*2')
        failNext = true
        await region
          .getByRole('button', { name: '刷新明细', exact: true })
          .click()
        try {
          await region
            .getByRole('button', { name: '重新加载', exact: true })
            .waitFor({ timeout: 5000 })
        } catch (error) {
          await page.screenshot({
            path: path.join(outputDir, `${name}-retry-failure.png`),
            fullPage: true,
          })
          throw new Error(
            `${error.message}; url=${page.url()}; calls=${JSON.stringify(calls.slice(-4))}; text=${(await page.locator('body').innerText()).slice(-1800)}`
          )
        }
        assert.equal(
          await region
            .getByRole('button', { name: '导出加工明细', exact: true })
            .isDisabled(),
          true
        )
        await region
          .getByRole('button', { name: '重新加载', exact: true })
          .click()
        await region.getByText('模拟筛选布料', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({
          path: path.join(outputDir, `${name}.png`),
          fullPage: true,
        })
      },
    }
  })
}
