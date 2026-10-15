import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const events = Array.from({ length: 201 }, (_, index) => ({
  id: index + 1,
  source: index % 2 ? 'server_bootstrap' : 'admin_manage',
  event_key: index % 2 ? 'admin_bootstrap.blocked' : 'admin_user.roles.set',
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

async function installAuditRoute(page) {
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
        20
      )
      await verifyDrawer(page, 640)
      // Full filtered export must read beyond the first server page.
      const downloadPromise = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出筛选结果' }).click()
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
      await page.getByRole('button', { name: /列设置/u }).click()
      const columnDialog = page.getByRole('dialog')
      await columnDialog.getByText('发生时间', { exact: true }).waitFor()
      await page.waitForFunction(() =>
        document.querySelector('.ant-modal')?.contains(document.activeElement)
      )
      await page.keyboard.press('Escape')
      await columnDialog.waitFor({ state: 'hidden' })
      // The source strip remains mounted while its indicator actually moves.
      const motion = await page
        .locator('.erp-business-status-filter')
        .evaluate(async (root) => {
          const group = root.querySelector('.ant-segmented-group')
          const items = group.querySelectorAll('.ant-segmented-item')
          const read = () =>
            new DOMMatrixReadOnly(getComputedStyle(group, '::before').transform)
              .m41
          const start = read()
          const box = group.getBoundingClientRect()
          items[1].click()
          const samples = []
          const began = performance.now()
          await new Promise((resolve) => {
            const frame = () => {
              samples.push(read())
              if (performance.now() - began < 350) requestAnimationFrame(frame)
              else resolve()
            }
            requestAnimationFrame(frame)
          })
          return {
            start,
            end: read(),
            samples,
            stable:
              group.isConnected &&
              Math.abs(group.getBoundingClientRect().width - box.width) < 1,
          }
        })
      assert(motion.stable)
      assert(
        motion.samples.some((x) => x > motion.start + 2 && x < motion.end - 2),
        JSON.stringify(motion)
      )
      assert.equal(
        await page
          .getByRole('radio', { name: '系统管理', exact: true })
          .isChecked(),
        true
      )
      await page.waitForFunction(() =>
        document
          .querySelector('.ant-pagination-total-text')
          ?.textContent?.includes('101')
      )
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page
        .locator('.erp-business-status-filter label')
        .filter({ hasText: '全部来源' })
        .click()
      const reducedDurations = await page
        .locator('.ant-segmented-group')
        .first()
        .evaluate(
          (node) => getComputedStyle(node, '::before').transitionDuration
        )
      assert(
        reducedDurations
          .split(',')
          .every((duration) => Number.parseFloat(duration) === 0),
        reducedDurations
      )
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      const search = page.getByPlaceholder('搜索操作记录', { exact: true })
      await search.fill('读取失败')
      await page.getByText('操作记录加载失败', { exact: true }).waitFor()
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        0
      )
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.ant-table-tbody tr[data-row-key]')
            .length === 20
      )
      await search.fill('慢查询')
      await search.fill('历史员工201')
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
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.ant-table-tbody tr[data-row-key]')
            .length === 20
      )
      const headers = await page
        .locator('.ant-table-thead:not([aria-hidden="true"]) th')
        .allTextContents()
      assert.deepEqual(
        headers.map((text) => text.trim()),
        ['发生时间', '操作人', '动作', '业务对象', '风险', '操作来源', '详情']
      )
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
        await assertNoHorizontalOverflow(page, `audit-${name}`)
      },
    })),
  ]
}
