import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const customers = Array.from({ length: 201 }, (_, index) => ({
  id: index + 1,
  code: `HISTORY-${String(index + 1).padStart(3, '0')}`,
  name: `历史客户${index + 1}`,
  is_active: false,
  note: index
    ? '历史查询浏览器样例'
    : '长文本用于验证历史摘要自动换行与详情完整展示。'.repeat(8),
  updated_at: 1790430000,
  created_at: 1780430000,
}))

export function createHistoryRecordScenarios(deps) {
  const {
    assert,
    expectHeading,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
  } = deps
  const effectiveSession = {
    ...customerRuntimeEffectiveSession,
    pages: [
      ...new Set([...customerRuntimeEffectiveSession.pages, 'history-records']),
    ],
  }
  const installRoute = async (page) => {
    page.historyRequests = []
    let failed = false
    await page.route('**/rpc/masterdata', async (route) => {
      const { id, method, params = {} } = route.request().postDataJSON()
      if (method !== 'list_customers') return route.fallback()
      page.historyRequests.push(params)
      if (params.keyword === '慢查询') await delay(500)
      if (params.keyword === '读取失败' && !failed) {
        failed = true
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id,
            result: { code: 50000, message: '读取失败' },
          },
        })
      }
      const rows = customers.filter(
        (row) =>
          !params.keyword ||
          params.keyword === '读取失败' ||
          JSON.stringify(row).includes(params.keyword)
      )
      await route.fulfill({
        json: {
          jsonrpc: '2.0',
          id,
          result: styleRpcResult(
            stylePaginatedRpcData(rows, 'customers', params)
          ),
        },
      })
    })
  }
  const desktop = {
    name: 'history-records-list-recovery',
    path: '/erp/history?source=customers',
    auth: 'admin',
    effectiveSession,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: installRoute,
    verify: async (page) => {
      await expectHeading(page, '历史记录中心')
      const table = page.locator('.ant-table-tbody')
      await table.getByText('HISTORY-001', { exact: true }).waitFor()
      assert.equal(
        await page
          .getByRole('button', { name: '查看详情', exact: true })
          .isEnabled(),
        false
      )
      assert(
        page.historyRequests.every(
          (params) => params.lifecycle_scope === 'history'
        )
      )
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出筛选结果' }).click()
      const csv = await readFile(await (await downloadPromise).path(), 'utf8')
      assert.equal(csv.trim().split('\n').length, 202)
      assert(csv.includes('HISTORY-201'))
      assert(csv.includes('已停用'))
      assert(
        page.historyRequests.some(
          (params) => params.offset === 200 && params.limit === 200
        )
      )
      await page.getByRole('button', { name: /列设置/u }).click()
      await page
        .getByRole('dialog')
        .getByText('编号 / 名称', { exact: true })
        .waitFor()
      await page.waitForFunction(() =>
        document.querySelector('.ant-modal')?.contains(document.activeElement)
      )
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.locator('.ant-pagination-item-2').click()
      await table.getByText('HISTORY-021', { exact: true }).waitFor()
      await table.getByText('HISTORY-021', { exact: true }).click()
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await page
        .getByRole('dialog')
        .getByText('HISTORY-021', { exact: true })
        .waitFor()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await page
        .getByRole('button', { name: '前往所属模块', exact: true })
        .click()
      await page.waitForURL(
        /\/erp\/master\/partners\/customers.*scope=history/u
      )
      await page.goBack()
      await expectHeading(page, '历史记录中心')
      await table.getByText('HISTORY-021', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('page'), '2')
      const search = page.getByPlaceholder('搜索历史记录', { exact: true })
      await search.fill('读取失败')
      await page.getByText('历史记录加载失败', { exact: true }).waitFor()
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        0
      )
      assert.equal(
        await page
          .getByRole('button', { name: '查看详情', exact: true })
          .isEnabled(),
        false
      )
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
      await table.getByText('HISTORY-001', { exact: true }).waitFor()
      await search.fill('慢查询')
      await search.fill('HISTORY-201')
      await table.getByText('HISTORY-201', { exact: true }).waitFor()
      await delay(550)
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        1
      )
      await search.fill('')
      await table.getByText('HISTORY-001', { exact: true }).waitFor()
      await assertNoHorizontalOverflow(page, 'history-records-list-recovery')
    },
  }
  return [
    desktop,
    {
      ...desktop,
      name: 'history-records-tablet-dark',
      themeMode: 'dark',
      viewport: { width: 820, height: 1180 },
      verify: async (page) => {
        await expectHeading(page, '历史记录中心')
        await page
          .locator('.ant-table-tbody')
          .getByText('HISTORY-001', { exact: true })
          .dblclick()
        const dialog = page.getByRole('dialog')
        await dialog.getByText('HISTORY-001', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(
          page,
          'history-records-tablet-dark-detail'
        )
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page, 'history-records-tablet-dark')
      },
    },
  ]
}
