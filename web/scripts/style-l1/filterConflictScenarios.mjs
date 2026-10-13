import { createMobileProgressScenarios } from './mobileProgressScenarios.mjs'
import { createBusinessProgressScenarios } from './businessProgressScenarios.mjs'
import { createBusinessStatusCountsScenarios } from './businessStatusCountsScenarios.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { createTaskTrackingScenarios } from './taskTrackingScenarios.mjs'
import { createMobileWorkflowTrackingScenarios } from './mobileWorkflowTrackingScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function waitForFilters(page, filters) {
  await filters.waitFor({ state: 'visible' })
  await waitForFiniteAnimations(page)
  await page.waitForFunction((label) => {
    const panel = [...document.querySelectorAll('[role="dialog"]')].find(
      (node) => node.getAttribute('aria-label') === label && node.getClientRects().length
    )
    const popover = panel?.closest('.ant-popover')
    return popover && getComputedStyle(popover).opacity === '1'
      && !/-(appear|enter|leave)(-|\s|$)/u.test(popover.className)
  }, await filters.getAttribute('aria-label'))
}

async function choose(page, root, label, value) {
  const control = root.getByRole('combobox', { name: label, exact: true })
  if (await control.evaluate((node) => node.tagName === 'SELECT')) {
    await control.selectOption({ label: value })
  } else {
    await control.press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible').getByText(value, { exact: true }).click()
    await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  }
}

export function createFilterConflictScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  const mobile = createMobileProgressScenarios(deps).slice(0, 2).map((base) => ({
    ...base,
    name: `${base.name}-filter-conflicts`,
    viewport: { width: 422, height: 844 },
    deviceScaleFactor: 3840 / 844,
    verify: async (page) => {
      await page.getByTestId('mobile-role-nav-progress').click()
      const panel = page.getByRole('region', { name: '手机进度看板', exact: true })
      const quick = panel.getByRole('group', { name: '进度快捷筛选', exact: true })
      await quick.getByRole('button', { name: /^在执行/ }).waitFor()
      await panel.getByRole('button', { name: '筛选进度', exact: true }).click()
      const filters = page.getByRole('dialog', { name: '筛选进度', exact: true })
      await waitForFilters(page, filters)
      const attention = filters.getByRole('group', { name: '关注条件', exact: true })
      await attention.getByRole('button', { name: '已逾期', exact: true }).click()
      assert.equal(await quick.getByRole('button', { name: /已逾期/ }).getAttribute('aria-pressed'), 'true')
      assert.equal(await attention.locator('[aria-pressed="true"]').count(), 1)
      await attention.getByRole('button', { name: '未定交期', exact: true }).click()
      assert.equal(await quick.locator('[aria-pressed="true"]').count(), 0)
      await attention.getByRole('button', { name: '已逾期', exact: true }).click()
      await filters.getByText('已结束', { exact: true }).click()
      await page.waitForFunction(() => window.history.state.mobileProgress.query.scope === 'ended' && window.history.state.mobileProgress.query.risk === 'all')
      for (const label of ['已逾期', '7天内到期', '任务受阻']) {
        assert.equal(await attention.getByRole('button', { name: label, exact: true }).isDisabled(), true)
        assert.equal(await quick.getByRole('button', { name: new RegExp(label) }).isDisabled(), true)
      }
      assert.equal(await attention.getByRole('button', { name: '不限', exact: true }).getAttribute('aria-pressed'), 'true')
      await waitForFiniteAnimations(page)
      await page.screenshot({ path: path.join(outputDir, `${base.name}-ended-filter.png`) })
      await filters.getByText('全部记录', { exact: true }).click()
      await quick.getByRole('button', { name: /^全部记录/ }).waitFor()
      await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await panel.getByLabel('搜索进度').fill('云朵')
      await panel.getByLabel('搜索进度').press('Enter')
      await panel.getByRole('button', { name: /筛选进度/ }).click()
      await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
      assert.equal(await panel.getByLabel('搜索进度').inputValue(), '云朵')
      await page.keyboard.press('Escape')
      await filters.waitFor({ state: 'hidden' })
      await panel.getByRole('button', { name: '清除搜索', exact: true }).click()
      await panel.getByLabel('进度视图').getByText('生产执行', { exact: true }).click()
      await panel.getByRole('button', { name: /筛选进度/ }).click()
      await attention.getByRole('button', { name: '未关联销售', exact: true }).click()
      await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await panel.getByLabel('进度视图').getByText('订单交付', { exact: true }).click()
      await page.waitForFunction(() => window.history.state.mobileProgress.query.risk === 'all')
      await page.reload()
      await quick.getByRole('button', { name: /^在执行/ }).waitFor()
      await panel.getByRole('button', { name: /筛选进度/ }).click()
      await waitForFilters(page, filters)
      await page.screenshot({ path: path.join(outputDir, `${base.name}-filter.png`) })
      await page.setViewportSize({ width: 320, height: 568 })
      await assertNoHorizontalOverflow(page, `${base.name} 筛选`)
      const geometry = await filters.evaluate((node) => {
        const box = node.getBoundingClientRect()
        return { left: box.left, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight }
      })
      assert(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry))
    },
  }))
  const desktop = createBusinessProgressScenarios(deps)[0]
  const progress = {
    ...desktop,
    name: 'erp-progress-filter-conflicts',
    verify: async (page) => {
      const panel = page.getByRole('region', { name: '进度看板', exact: true })
      await panel.getByRole('button', { name: /已逾期/ }).click()
      await choose(page, panel, '记录范围', '已结束')
      await page.waitForURL((url) => url.searchParams.get('risk') === 'all' && url.searchParams.get('scope') === 'ended')
      await panel.getByRole('group', { name: '按风险筛选进度', exact: true }).getByRole('button', { name: /^已结束/ }).waitFor()
      for (const label of ['已逾期', '7天内到期', '任务受阻']) {
        assert.equal(await panel.getByRole('button', { name: new RegExp(label) }).isDisabled(), true)
      }
      await choose(page, panel, '记录范围', '在执行')
      await panel.getByRole('button', { name: '筛选', exact: true }).click()
      const from = page.getByRole('textbox', { name: '开始日期', exact: true })
      await from.click()
      await page.locator('.ant-picker-dropdown:visible .ant-picker-cell-today .ant-picker-cell-inner').click()
      await page.waitForURL((url) => Boolean(url.searchParams.get('from')))
      await page.keyboard.press('Escape')
      await panel.getByRole('button', { name: /未定交期/ }).click()
      await page.waitForURL((url) => url.searchParams.get('risk') === 'undated' && !url.searchParams.has('from'))
      await page.reload()
      await panel.getByRole('button', { name: /未定交期/ }).waitFor()
      await panel.getByRole('button', { name: '筛选', exact: true }).click()
      assert.equal(await from.inputValue(), '')
      await from.click()
      await page.locator('.ant-picker-dropdown:visible .ant-picker-cell-today .ant-picker-cell-inner').click()
      await page.waitForURL((url) => url.searchParams.get('risk') === 'all' && Boolean(url.searchParams.get('from')))
      await page.keyboard.press('Escape')
      await panel.getByRole('button', { name: '清空筛选', exact: true }).click()
      await panel.getByRole('button', { name: '下一页', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('page') === '2')
      await waitForFiniteAnimations(page)
      await assertNoHorizontalOverflow(page, '桌面进度筛选')
    },
  }
  const tracking = [
    ...createTaskTrackingScenarios(deps).slice(0, 2).map((base) => ({ base, phone: false })),
    ...createMobileWorkflowTrackingScenarios(deps).map((base) => ({ base, phone: true })),
  ].map(({ base, phone }) => ({
    ...base,
    name: `${base.name}-filter-conflicts`,
    verify: async (page) => {
      const scope = page.locator(phone ? '.mobile-workspace-task-views' : '.erp-task-management-scope')
      await scope.getByText('流程跟踪', { exact: true }).click()
      const panel = page.locator(phone ? '.mobile-workflow-tracking' : '.erp-workflow-tracking-panel')
      await panel.getByRole('button', { name: '重新读取', exact: true }).click()
      await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
      const requests = []
      page.on('request', (request) => {
        if (!request.url().endsWith('/rpc/workflow')) return
        const body = request.postDataJSON()
        if (body?.method === 'list_tracking') requests.push(body.params)
      })
      const filters = page.getByRole('dialog', { name: phone ? '筛选流程' : '筛选条件', exact: true })
      if (phone) await panel.getByRole('button', { name: /筛选流程/ }).click()
      else await panel.getByRole('button', { name: /筛选/ }).click()
      await waitForFilters(page, filters)
      await choose(page, filters, '当前岗位', '工程')
      const endedRequest = page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_tracking' && request.postDataJSON()?.params.status === 'completed')
      if (phone) {
        await filters.getByText('只看逾期', { exact: true }).click()
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await panel.getByRole('button', { name: '已结束', exact: true }).click()
        await panel.getByRole('button', { name: /筛选流程/ }).click()
      } else {
        await choose(page, filters, '关注事项', '只看逾期')
        await choose(page, filters, '流转状态', '已结束')
      }
      await endedRequest
      assert.equal(await filters.getByRole('combobox', { name: '当前岗位', exact: true }).isDisabled(), true)
      if (phone) {
        assert.equal(await filters.getByLabel('关注事项', { exact: true }).locator('input').evaluateAll((inputs) => inputs.length > 0 && inputs.every((input) => input.disabled)), true)
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      } else assert.equal(await filters.getByRole('combobox', { name: '关注事项', exact: true }).isDisabled(), true)
      assert(requests.some((query) => query.status === 'completed' && !query.attention && !query.owner_role_key))
      await page.reload()
      if (!phone) {
        await panel.getByRole('button', { name: /筛选/ }).click()
        await waitForFilters(page, filters)
      }
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_tracking' && request.postDataJSON()?.params.status === 'active'),
        phone
          ? panel.getByRole('button', { name: '进行中', exact: true }).click()
          : choose(page, filters, '流转状态', '进行中'),
      ])
      assert(requests.filter((query) => query.status === 'active').every((query) => !query.attention && !query.owner_role_key))
      if (!phone) await filters.getByRole('button', { name: '完成', exact: true }).click()
      await waitForFiniteAnimations(page)
      await assertNoHorizontalOverflow(page, `${base.name} 筛选`)
    },
  }))
  const controls = {
    name: 'dev-control-filter-conflicts',
    path: '/__dev/ui-design?page=controls',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const root = page.getByRole('region', { name: '控件设计', exact: true })
      await root.getByRole('navigation', { name: '控件设计目录' }).getByRole('button', { name: /筛选与搜索/ }).click()
      await root.getByRole('button', { name: /^已逾期/ }).click()
      await root.getByRole('button', { name: '筛选', exact: true }).click()
      const range = page.getByLabel('演示记录范围', { exact: true })
      await range.getByText('已结束', { exact: true }).click()
      assert.equal(await root.getByRole('button', { name: /^已逾期/ }).isDisabled(), true)
      assert.equal(await root.getByRole('button', { name: /^已结束/ }).getAttribute('aria-pressed'), 'true')
      await root.getByText('SO-DEMO-04', { exact: true }).waitFor()
      await page.getByRole('button', { name: '重置筛选', exact: true }).click()
      await root.getByRole('heading', { name: '筛选与搜索', exact: true }).click()
      assert.equal(await root.getByRole('button', { name: /^在执行/ }).getAttribute('aria-pressed'), 'true')
      await assertNoHorizontalOverflow(page, '控件筛选示例')
    },
  }
  const productionOnly = {
    ...desktop,
    name: 'erp-progress-production-filter-conflicts',
    effectiveSession: {
      ...desktop.effectiveSession,
      actions: desktop.effectiveSession.actions.filter((action) => !action.startsWith('sales_order')),
    },
    beforeNavigate: async (page) => {
      await desktop.beforeNavigate(page)
      await page.route('**/rpc/business', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (!['list_progress', 'get_progress'].includes(method)) return route.fallback()
        const data = progressFixtureData({ ...params, view: params.view || 'production' }, { detail: method === 'get_progress' })
        data.access.sales = false
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data } } })
      })
    },
    verify: async (page) => {
      const panel = page.getByRole('region', { name: '进度看板', exact: true })
      await panel.getByRole('button', { name: '查看 MO-0001 进度摘要', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.has('view'), false)
      await panel.getByRole('button', { name: '筛选', exact: true }).click()
      await page.getByRole('button', { name: '查看未关联销售的生产单', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('view') === 'production' && url.searchParams.get('risk') === 'unlinked')
      await panel.getByRole('button', { name: '查看 MO-0003 进度摘要', exact: true }).waitFor()
      await page.reload()
      await panel.getByRole('button', { name: '查看 MO-0003 进度摘要', exact: true }).waitFor()
      await assertNoHorizontalOverflow(page, '生产进度默认视图筛选')
    },
  }
  const listFixture = createBusinessStatusCountsScenarios(deps).find((scenario) => scenario.name === 'business-status-counts-pages')
  const lifecycle = [
    { key: 'sales', url: '/erp/sales/project-orders/sales-orders', method: 'list_sales_orders', field: 'lifecycle_status', group: '销售订单状态' },
    { key: 'purchase', url: '/erp/purchase/accessories', method: 'list_purchase_orders', field: 'lifecycle_status', group: '采购订单状态' },
    { key: 'production', url: '/erp/production/orders', method: 'list_production_orders', field: 'status', initial: 'CLOSED' },
    { key: 'bom', url: '/erp/purchase/material-bom', method: 'list_bom_versions', field: 'status', initial: 'ARCHIVED' },
  ].map((config) => ({
    ...listFixture,
    name: `${config.key}-lifecycle-filter-restore`,
    path: config.url + (config.initial ? `?scope=current&status=${config.initial}` : ''),
    beforeNavigate: async (page) => {
      await listFixture.beforeNavigate(page)
      page.filterQueries = []
      page.on('request', (request) => {
        if (!request.url().includes('/rpc/')) return
        const body = request.postDataJSON()
        if (body?.method === config.method) page.filterQueries.push(body.params)
      })
    },
    verify: async (page) => {
      const operation = page.locator('.erp-business-operation-panel')
      const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const openFilters = async () => {
        await operation.getByRole('button', { name: /^(filter )?筛选( · 已应用)?$/ }).click()
        await waitForFilters(page, filters)
      }
      const response = () => page.waitForResponse((res) => res.url().includes('/rpc/') && res.request().postDataJSON()?.method === config.method)
      const navigate = async (url) => {
        await page.evaluate((next) => {
          history.pushState(history.state, '', next)
          dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
        }, url)
      }
      const reopen = async () => {
        await navigate('/erp/business-dashboard')
        await page.getByRole('region', { name: '进度看板', exact: true }).waitFor()
        await Promise.all([response(), navigate(config.url)])
      }
      if (config.group) {
        await openFilters()
        await choose(page, filters, '记录范围', '全部记录')
        await filters.getByRole('button', { name: '完成', exact: true }).click()
        const group = page.getByRole('group', { name: config.group, exact: true })
        await Promise.all([response(), group.getByRole('button', { name: /^已关闭/ }).click()])
        assert.equal(page.filterQueries.at(-1)[config.field], 'closed')
        const start = page.filterQueries.length
        await reopen()
        await group.getByRole('button', { name: /^不限状态/ }).waitFor()
        assert.equal(await group.getByRole('button', { name: /^不限状态/ }).getAttribute('aria-pressed'), 'true')
        assert(page.filterQueries.slice(start).every((query) => !query[config.field]), '恢复当前范围时不能发送残留已关闭状态')
        await Promise.all([response(), group.getByRole('button', { name: /^草稿/ }).click()])
        await reopen()
        assert.equal(page.filterQueries.at(-1)[config.field], 'draft', '合法缓存状态仍需保留')
      } else {
        await openFilters()
        assert(page.filterQueries.length > 0)
        assert(page.filterQueries.every((query) => !query[config.field]), '冲突链接不能发送范围外状态')
        await Promise.all([response(), choose(page, filters, '记录范围', '全部记录')])
        assert.equal(page.filterQueries.at(-1)[config.field] || '', '')
        await page.reload()
        await openFilters()
        assert.equal(page.filterQueries.at(-1)[config.field] || '', '', '切换范围并刷新不能恢复已清理状态')
        await filters.getByRole('button', { name: '完成', exact: true }).click()
      }
      await waitForFiniteAnimations(page)
      await assertNoHorizontalOverflow(page, `${config.key} 记录范围恢复`)
    },
  }))
  return [...mobile, progress, productionOnly, ...tracking, controls, ...lifecycle]
}
