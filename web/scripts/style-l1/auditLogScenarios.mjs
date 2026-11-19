import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { dateFilterButton, manualDateInputs, openDateFilter } from './dateFilterActions.mjs'
import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const events = Array.from({ length: 201 }, (_, index) => ({
  id: index + 1,
  source: index % 2 ? 'server_bootstrap' : 'admin_manage',
  event_key: index % 2 ? 'admin_bootstrap.blocked' : 'admin_user.roles.set',
  ...(index === 197 || index === 199
    ? {
        source: 'workflow',
        event_type: 'process_instance_created',
        event_key: `process_instance.created/${index + 1}`,
        action_label: '发起流程',
      }
    : {}),
  created_at: Date.parse('2026-09-26T12:00:00+08:00') / 1000 - index,
  payload: {
    actor: { display_name: '系统管理员', username: 'audit-admin' },
    target: {
      type: 'admin_user',
      display_name: `历史员工${index + 1}`,
      username: `employee-${index + 1}`,
    },
    before: {
      display_name: '原姓名',
      phone: '13812345678',
      disabled: false,
      is_super_admin: false,
      role_keys: ['sales'],
      version: 1,
    },
    after: {
      display_name: '新姓名',
      phone: '13912345678',
      disabled: true,
      is_super_admin: true,
      role_keys: ['sales', 'warehouse'],
      version: 2,
    },
    reason: '不可暴露的内部诊断',
  },
}))

export async function installAuditRoute(page) {
  page.auditRequests = []
  let failureConsumed = false
  await page.route('**/rpc/admin', async (route) => {
    const { id, method, params = {} } = route.request().postDataJSON()
    if (method !== 'audit_logs') return route.fallback()
    page.auditRequests.push(params)
    if (params.keyword === '慢查询') await delay(500)
    if (params.keyword === '读取失败' && !failureConsumed) {
      failureConsumed = true
      return route.fulfill({
        json: {
          jsonrpc: '2.0',
          id,
          result: { code: 50000, message: '读取失败' },
        },
      })
    }
    const filtered = events.filter(
      (event) =>
        (!params.source || params.source === event.source) &&
        (!params.event_key || params.event_key === event.event_key) &&
        (!params.event_type || params.event_type === event.event_type) &&
        (!params.keyword ||
          params.keyword === '读取失败' ||
          JSON.stringify(event.payload).includes(params.keyword))
    )
    await route.fulfill({
      json: {
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(
          stylePaginatedRpcData(filtered, 'events', params)
        ),
      },
    })
  })
}

export function createAuditLogScenarios({
  expectHeading,
  assertTextAbsent,
  assertNoHorizontalOverflow,
  assert,
}) {
  const verifyDrawer = async (page, width) => {
    const firstRow = page.locator('.ant-table-tbody tr[data-row-key]').first()
    const trigger = firstRow.getByRole('button', { name: '查看变化' })
    await trigger.click()
    const drawer = page.locator('.erp-audit-detail-drawer')
    await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
    await drawer.getByRole('rowheader', { name: '岗位信息' }).waitFor()
    assert.equal(await drawer.locator('tbody tr').count(), 6)
    await assertTextAbsent(page, '13812345678')
    await assertTextAbsent(page, '不可暴露的内部诊断')
    const metrics = await drawer.evaluate((node) => {
      const panel = node.querySelector('.ant-drawer-content-wrapper')
      const body = node.querySelector('.ant-drawer-body')
      return {
        width: panel.getBoundingClientRect().width,
        scroll: body.scrollWidth,
        client: body.clientWidth,
      }
    })
    assert(Math.abs(metrics.width - width) < 2, JSON.stringify(metrics))
    assert(metrics.scroll <= metrics.client + 1, JSON.stringify(metrics))
    await assertNoHorizontalOverflow(page, 'audit-detail')
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden' })
    await page.waitForFunction(() =>
      document.activeElement?.textContent?.includes('查看变化')
    )
  }
  const desktop = {
    name: 'system-audit-logs-desktop',
    path: '/erp/system/audit-logs',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    beforeNavigate: installAuditRoute,
    verify: async (page) => {
      await expectHeading(page, '系统操作记录')
      await page.locator('.ant-table-tbody tr[data-row-key]').first().waitFor()
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        50
      )
      const filters = page.locator('.erp-business-filter-popover__content')
      const sources = page.getByRole('group', { name: '操作来源', exact: true })
      const types = page.getByRole('group', { name: '操作类型', exact: true })
      const sourceButton = (label) => sources.getByRole('button', { name: label, exact: true })
      const typeButton = (label) => types.getByRole('button', { name: label, exact: true })
      const rows = page.locator('.ant-table-tbody tr[data-row-key]')
      assert.equal(await types.count(), 0)
      await sourceButton('系统管理').click()
      const originalViewport = page.viewportSize()
      for (const width of [1024, 1920, 3840]) {
        await page.setViewportSize({ ...originalViewport, width })
        await typeButton('员工岗位变更').waitFor()
        const sourceBounds = await sources.boundingBox()
        const typeBounds = await types.boundingBox()
        assert(typeBounds.y >= sourceBounds.y + sourceBounds.height, '操作类型在来源按钮下方')
        await assertNoHorizontalOverflow(page, `操作类型按钮 ${width}px`)
      }
      await page.setViewportSize(originalViewport)
      await page.locator('.ant-pagination-next button').click()
      await rows.getByText('历史员工101', { exact: false }).first().waitFor()
      await typeButton('员工岗位变更').press('Enter')
      await page.locator('tr[data-row-key="1"]').waitFor()
      assert.equal(page.auditRequests.at(-1).offset, 0)
      assert.equal(page.auditRequests.at(-1).event_key, 'admin_user.roles.set')
      await typeButton('创建员工账号').click()
      await page.getByText('当前条件下没有操作记录', { exact: true }).waitFor()
      await sourceButton('流程与任务').click()
      await types.getByRole('button', { name: '全部操作', pressed: true }).waitFor()
      assert.equal(await typeButton('创建员工账号').count(), 0)
      await rows.nth(1).getByText('发起流程', { exact: true }).waitFor()
      assert.equal(page.auditRequests.at(-1).event_key, undefined)
      const initiatedRead = page.waitForResponse((response) => {
        if (!response.url().endsWith('/rpc/admin')) return false
        return response.request().postDataJSON()?.params?.event_type === 'process_instance_created'
      })
      await typeButton('发起流程').click()
      await initiatedRead
      await rows.nth(1).getByText('发起流程', { exact: true }).waitFor()
      assert.equal(await rows.count(), 2)
      assert.equal(page.auditRequests.at(-1).source, 'workflow')
      assert.equal(page.auditRequests.at(-1).event_key, undefined)
      const filteredDownload = page.waitForEvent('download')
      await openBusinessTableTool(page, '导出筛选结果')
      const initiatedCsv = await readFile(await (await filteredDownload).path(), 'utf8')
      assert.equal(initiatedCsv.trim().split('\n').length, 3)
      assert(initiatedCsv.includes('历史员工198') && initiatedCsv.includes('历史员工200'))
      await page.getByRole('button', { name: '筛选', exact: true }).click()
      assert.equal(await filters.getByRole('combobox', { name: '操作类型' }).count(), 0)
      await filters.getByRole('button', { name: '高风险', exact: true }).click()
      await filters.getByRole('button', { name: '清空筛选', exact: true }).click()
      await filters.getByRole('button', { name: '收起', exact: true }).click()
      assert.equal(await typeButton('发起流程').getAttribute('aria-pressed'), 'true')
      await typeButton('全部操作').click()
      await types.getByRole('button', { name: '全部操作', pressed: true }).waitFor()
      await sourceButton('全部来源').click()
      await types.waitFor({ state: 'hidden' })
      await page.waitForFunction(() => document.querySelector('.ant-pagination-total-text')?.textContent?.includes('201'))
      const pager = page.locator('.ant-pagination')
      const readAuditPage = (limit, offset) => page.waitForResponse((response) => {
        if (!response.url().endsWith('/rpc/admin')) return false
        const body = response.request().postDataJSON()
        return body?.method === 'audit_logs' && body.params?.limit === limit && body.params?.offset === offset
      })
      let read = readAuditPage(50, 50)
      await pager.locator('.ant-pagination-next button').click()
      await read
      for (const size of [100, 50]) {
        if (size === 50) {
          read = readAuditPage(100, 100)
          await pager.locator('.ant-pagination-next button').click()
          await read
        }
        await pager.locator('.ant-select-selector').click()
        read = readAuditPage(size, 0)
        await page.locator('.ant-select-dropdown:visible').getByText(`${size} 条/页`, { exact: true }).click()
        await read
        await page.waitForFunction((expected) => document.querySelectorAll('.ant-table-tbody tr[data-row-key]').length === expected, size)
        assert.equal(await pager.locator('.ant-pagination-prev button').isDisabled(), true)
      }
      await verifyDrawer(page, 640)
      // Full filtered export must read beyond the first server page.
      const downloadPromise = page.waitForEvent('download')
      await openBusinessTableTool(page, '导出筛选结果')
      const csv = await readFile(await (await downloadPromise).path(), 'utf8')
      assert.equal(csv.trim().split('\n').length, 202)
      assert(csv.includes('历史员工201'))
      assert(csv.includes('岗位信息'))
      assert(!csv.includes('13812345678'))
      assert(
        page.auditRequests.some(
          (params) => params.offset === 200 && params.limit === 200
        )
      )
      await openBusinessTableTool(page, '列设置')
      const columnDialog = page.getByRole('dialog')
      await columnDialog.getByText('发生时间', { exact: true }).waitFor()
      await page.waitForFunction(() =>
        document.querySelector('.ant-modal')?.contains(document.activeElement)
      )
      await page.keyboard.press('Escape')
      await columnDialog.waitFor({ state: 'hidden' })
      const group = await sources.elementHandle()
      const before = await sources.boundingBox()
      const system = sources.getByRole('button', { name: '系统管理', exact: true })
      await system.click()
      await sources.getByRole('button', { name: '系统管理', pressed: true }).waitFor()
      await page.waitForFunction(() =>
        document.querySelector('.ant-pagination-total-text')?.textContent?.includes('101')
      )
      assert.equal(await sources.evaluate((node, original) => node === original, group), true)
      const after = await sources.boundingBox()
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(before[key] - after[key]) <= 1, `操作来源切换时保持筛选位置：${key}`)
      }
      assert.equal(await system.evaluate((node) => getComputedStyle(node).borderRadius), '8px')
      await sources.getByRole('button', { name: '全部来源', exact: true }).click()
      await sources.getByRole('button', { name: '全部来源', pressed: true }).waitFor()
      const search = page.getByPlaceholder('搜索操作记录', { exact: true })
      await search.fill('读取失败')
      await search.press('Enter')
      await page.getByText('操作记录加载失败', { exact: true }).waitFor()
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        0
      )
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.ant-table-tbody tr[data-row-key]')
            .length === 50
      )
      await search.fill('慢查询')
      await search.press('Enter')
      await search.fill('历史员工201')
      await search.press('Enter')
      await page
        .locator('.ant-table-tbody')
        .getByText(/历史员工201/u)
        .waitFor()
      await delay(550)
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        1
      )
      await search.fill('')
      await search.press('Enter')
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.ant-table-tbody tr[data-row-key]')
            .length === 50
      )
      const headers = await page
        .locator('.ant-table-thead:not([aria-hidden="true"]) th')
        .allTextContents()
      assert.deepEqual(
        headers.map((text) => text.trim()),
        ['发生时间', '操作人', '动作', '业务对象', '风险', '操作来源', '详情']
      )
      await page.getByRole('button', { name: '筛选', exact: true }).click()
      const dates = await openDateFilter(page, filters)
      const periods = dates.getByRole('group', { name: '快捷期间', exact: true })
      const today = currentBusinessDate()
      assert.equal(await periods.getByRole('button', { name: '不限', pressed: true }).count(), 1)
      assert.equal(await dates.getByRole('textbox').count(), 0)
      const [dateRead] = await Promise.all([
        page.waitForResponse((response) => response.url().endsWith('/rpc/admin') &&
          response.request().postDataJSON()?.params?.created_from),
        periods.getByRole('button', { name: '今天', exact: true }).press('Enter'),
      ])
      const dateParams = dateRead.request().postDataJSON().params
      assert.equal(dateParams.created_from, `${today}T00:00:00+08:00`)
      assert.equal(dateParams.created_to, `${today}T23:59:59.999999999+08:00`)
      await openDateFilter(page, filters)
      const { from, to } = await manualDateInputs(dates)
      assert.deepEqual(await Promise.all([from.inputValue(), to.inputValue()]), [today, today])
      await dateFilterButton(dates, '取消').click()
      await filters.getByRole('button', { name: '清空筛选', exact: true }).click()
      await filters.getByRole('button', { name: '操作时间：不限', exact: true }).waitFor()
      await filters.getByRole('button', { name: '收起', exact: true }).click()
      await assertNoHorizontalOverflow(page, 'system-audit-logs-desktop')
    },
  }
  return [
    desktop,
    ...[
      ['phone-390', 390, 844, 'light'],
      ['tablet-820', 820, 1180, 'light'],
      ['desktop-dark', 1440, 900, 'dark'],
    ].map(([name, width, height, themeMode]) => ({
      ...desktop,
      name: `system-audit-logs-${name}`,
      viewport: { width, height },
      themeMode,
      verify: async (page) => {
        await expectHeading(page, '系统操作记录')
        await page
          .locator('.ant-table-tbody tr[data-row-key]')
          .first()
          .waitFor()
        await verifyDrawer(page, width >= 768 ? 640 : width)
        const sources = page.getByRole('group', { name: '操作来源' })
        await sources.getByRole('button', { name: '系统管理' }).click()
        const types = page.getByRole('group', { name: '操作类型' })
        const buttons = types.getByRole('button')
        const bounds = await buttons.evaluateAll((nodes) => nodes.map((node) => {
          const { left, right, height } = node.getBoundingClientRect()
          return { left, right, height }
        }))
        assert(bounds.length > 1)
        assert(bounds.every(({ left, right, height }) => left >= 0 && right <= width + 1 && height >= (width < 768 ? 44 : 32)), '操作类型按钮应在视口内换行并可点选')
        await types.getByRole('button', { name: '员工岗位变更' }).click()
        await types.getByRole('button', { name: '员工岗位变更', pressed: true }).waitFor()
        await assertNoHorizontalOverflow(page, `audit-${name}`)
      },
    })),
  ]
}
