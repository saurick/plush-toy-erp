import { createMobileProgressScenarios } from './mobileProgressScenarios.mjs'
import { createBusinessProgressScenarios } from './businessProgressScenarios.mjs'
import { createBusinessStatusCountsScenarios } from './businessStatusCountsScenarios.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { createTaskTrackingScenarios } from './taskTrackingScenarios.mjs'
import { createMobileWorkflowTrackingScenarios } from './mobileWorkflowTrackingScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { assertMobileFilterDensity } from './mobileFilterPopoverAssertions.mjs'

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
  const choices = root.getByRole('group', { name: label, exact: true })
  if (await choices.count()) {
    const search = root.getByRole('textbox', { name: `搜索${label}`, exact: true })
    if (await search.count()) await search.fill(value)
    await choices.getByRole('button', { name: value, exact: true }).click()
    return
  }
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
  const verifyProgress = (phone, name) => async (page) => {
    if (phone) await page.getByTestId('mobile-role-nav-progress').click()
    const panel = page.getByRole('region', { name: phone ? '手机进度看板' : '进度看板', exact: true })
    const quick = panel.getByRole('group', { name: '进度快捷筛选', exact: true })
    const filters = page.getByRole('dialog', { name: '筛选进度', exact: true })
    const trigger = panel.getByRole('button', { name: /^筛选进度/ })
    const search = panel.getByLabel(phone ? '搜索进度' : '搜索订单、客户或产品', { exact: true })
    const waitQuery = async (expected) => {
      await page.waitForFunction(({ phone, expected }) => {
        const query = phone ? window.history.state?.mobileProgress?.query : Object.fromEntries(new URLSearchParams(location.search))
        if (!query || !Object.entries(expected).every(([key, value]) => String(query[key] ?? '') === String(value))) return false
        const quick = document.querySelector('[aria-label="进度快捷筛选"]')
        if (!quick) return false
        const buttons = [...quick.querySelectorAll('button')]
        if ('blocked_only' in expected && query.scope !== 'ended') {
          const blocked = buttons.find((node) => node.getAttribute('aria-label')?.startsWith('仅看任务受阻'))
          if (blocked?.getAttribute('aria-pressed') !== String(expected.blocked_only === true)) return false
        }
        if (expected.due_status) {
          const label = { all: '不限交期', overdue: '已逾期', due_soon: '7天内到期', undated: '未定交期' }[expected.due_status]
          if (expected.due_status === 'undated') {
            const applied = document.querySelector(phone ? '.mobile-progress-panel .mobile-filter-trigger' : '.erp-progress-active-filters')
            if (!applied?.textContent.includes(label) || (phone && !applied.getAttribute('title')?.includes(label))) return false
          } else if (buttons.find((node) => node.getAttribute('aria-label')?.startsWith(label))?.getAttribute('aria-pressed') !== 'true') return false
        }
        return true
      }, { phone, expected })
      await page.waitForFunction(() => {
        const quick = document.querySelector('[aria-label="进度快捷筛选"]')
        return quick && !quick.textContent.includes('—')
      })
    }
    const due = (root, label) => root.getByRole('group', { name: '交期情况', exact: true }).getByRole('button', { name: new RegExp(`^${label}`) })
    await due(quick, '不限交期').waitFor()
    await trigger.click()
    await waitForFilters(page, filters)
    if (phone) await assertMobileFilterDensity({ assert, dialog: filters })
    if (phone) assert.equal(await filters.getByRole('textbox').count(), 0, '手机进度不要求输入姓名')
    else {
      const owner = filters.getByRole('textbox', { name: '处理人或业务负责人', exact: true })
      assert.equal(await filters.getByRole('button', { name: '应用', exact: true }).count(), 0)
      await owner.fill('业务')
      await waitQuery({ owner: '业务' })
      await owner.fill('')
      await waitQuery({ owner: '' })
      await owner.fill('待重置姓名')
      await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
      await page.waitForTimeout(400)
      await waitQuery({ owner: '' })
      assert.equal(await owner.inputValue(), '', 'reset cancels pending owner search')
    }
    await due(filters, '已逾期').click()
    await filters.getByRole('button', { name: /^仅看任务受阻/ }).click()
    await waitQuery({ due_status: 'overdue', blocked_only: true })
    assert.equal(await due(quick, '已逾期').getAttribute('aria-pressed'), 'true')
    assert.equal(await quick.getByRole('button', { name: /^仅看任务受阻/ }).getAttribute('aria-pressed'), 'true')
    assert.equal(await trigger.getAttribute('aria-label'), '筛选进度，已应用 2 项')
    assert.match(await due(filters, '已逾期').innerText(), /1/u)
    assert.match(await due(filters, '7天内到期').innerText(), /0/u)
    await due(filters, '7天内到期').click()
    await waitQuery({ due_status: 'due_soon', blocked_only: true })
    assert.equal(await panel.locator(phone ? '.mobile-progress-card' : '.erp-progress-row').count(), 0)
    assert.match(await filters.getByRole('button', { name: /^仅看任务受阻/ }).innerText(), /0/u)
    await filters.getByLabel('记录范围', { exact: true }).getByText('已结束', { exact: true }).click()
    await waitQuery({ scope: 'ended', due_status: 'all', blocked_only: phone ? false : '' })
    for (const root of [quick, filters]) {
      for (const label of ['已逾期', '7天内到期', '仅看任务受阻']) {
        assert.equal(await root.getByRole('button', { name: new RegExp(`^${label}`) }).count(), 0)
      }
    }
    assert.equal(await trigger.getAttribute('aria-label'), '筛选进度，已应用 1 项')
    await filters.getByLabel('记录范围', { exact: true }).getByText('全部记录', { exact: true }).click()
    await waitQuery({ scope: 'all' })
    assert.equal(await due(quick, '不限交期').getAttribute('aria-pressed'), 'true')
    await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
    await waitQuery({ scope: 'active' })
    await page.keyboard.press('Escape')
    await filters.waitFor({ state: 'hidden' })
    await search.fill('云朵')
    await search.press('Enter')
    await trigger.click()
    await waitForFilters(page, filters)
    await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
    assert.equal(await search.inputValue(), '云朵')
    assert.equal(await trigger.getAttribute('aria-label'), '筛选进度')
    if (phone) {
      assert.equal(await filters.getByRole('button', { name: '自定义交期日期', exact: true }).count(), 0)
      await due(filters, '未定交期').click()
      await waitQuery({ due_status: 'undated' })
    } else {
      await filters.getByRole('button', { name: '自定义交期日期', exact: true }).click()
      const dates = page.getByRole('dialog', { name: '选择交期日期范围', exact: true })
      const day = dates.getByRole('group', { name: '选择日期范围' }).getByRole('button').nth(15)
      await day.click(); await day.click()
      await dates.getByRole('button', { name: '应用日期', exact: true }).click()
      await trigger.click()
      await waitForFilters(page, filters)
      await page.waitForFunction(() => !document.querySelector('[aria-label="进度快捷筛选"]').textContent.includes('—'))
      assert.match(await due(filters, '未定交期').innerText(), /1/u, '未定交期数量按清除日期后的结果计算')
      await due(filters, '未定交期').click()
      await waitQuery({ due_status: 'undated', from: '', to: '' })
    }
    await page.keyboard.press('Escape')
    await page.reload()
    await panel.locator(phone ? '.mobile-filter-trigger__label' : '.erp-progress-active-filters').getByText('未定交期', { exact: true }).waitFor()
    await waitQuery({ due_status: 'undated' })
    assert.equal(await due(quick, '未定交期').count(), 0, '少用条件留在更多筛选，当前条件持续可见')
    await trigger.click()
    await waitForFilters(page, filters)
    await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
    if (!phone) assert.equal(new URL(page.url()).searchParams.get('due_status'), 'all', '重置后立即清除交期条件')
    await page.keyboard.press('Escape')
    await search.fill(''); await search.press('Enter')
    if (!phone) assert.equal(new URL(page.url()).searchParams.get('due_status'), 'all', '清空搜索不能恢复重置前的交期条件')
    await waitQuery({ due_status: 'all', q: '' })
    const views = panel.getByLabel(phone ? '进度视图' : '进度查看方式', { exact: true })
    await views.getByText('生产执行', { exact: true }).click()
    await trigger.click()
    await waitForFilters(page, filters)
    await filters.getByRole('button', { name: /^仅看未关联销售/ }).click()
    await waitQuery({ unlinked_only: true })
    await page.keyboard.press('Escape')
    await views.getByText('订单交付', { exact: true }).click()
    await waitQuery({ unlinked_only: phone ? false : '', due_status: 'all' })
    await page.reload()
    await due(quick, '不限交期').waitFor()
    await trigger.click()
    await waitForFilters(page, filters)
    await page.screenshot({ path: path.join(outputDir, `${name}-filter.png`) })
    if (phone) {
      await page.setViewportSize({ width: 320, height: 568 })
      await waitForFiniteAnimations(page)
    }
    await assertNoHorizontalOverflow(page, `${name} 筛选`)
    const geometry = await filters.evaluate((node) => {
      const box = node.getBoundingClientRect()
      return { left: box.left, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight }
    })
    assert(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry))
  }
  const mobile = createMobileProgressScenarios(deps).slice(0, 2).map((base) => ({
    ...base,
    name: `${base.name}-filter-conflicts`,
    viewport: { width: 422, height: 844 },
    deviceScaleFactor: 3840 / 844,
    verify: verifyProgress(true, base.name),
  }))
  const desktop = createBusinessProgressScenarios(deps)[0]
  const progress = {
    ...desktop,
    name: 'erp-progress-filter-conflicts',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: verifyProgress(false, 'erp-progress'),
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
      else await panel.getByRole('button', { name: /^筛选/ }).click()
      await waitForFilters(page, filters)
      await choose(page, filters, '当前岗位', '工程')
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_tracking' && request.postDataJSON()?.params.status === 'completed'),
        (async () => {
          if (phone) {
            await filters.getByText('只看逾期', { exact: true }).click()
            await choose(page, filters, '当前岗位', '全部当前岗位')
            assert.equal(await filters.getByRole('button', { name: '工程', exact: true }).getAttribute('aria-pressed'), 'false')
            assert.equal(await filters.getByRole('button', { name: '只看逾期', exact: true }).getAttribute('aria-pressed'), 'true')
            await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
            assert.equal(await panel.getByRole('button', { name: /筛选流程/ }).getAttribute('title'), '关注事项：只看逾期')
            await panel.getByRole('button', { name: /^已结束，/ }).click()
            await panel.getByRole('button', { name: /筛选流程/ }).click()
          } else {
            await choose(page, filters, '关注事项', '只看逾期')
            await filters.getByRole('button', { name: '完成', exact: true }).click()
            await panel.getByRole('button', { name: /^已结束，/ }).click()
            await panel.getByRole('button', { name: /^筛选/ }).click()
          }
        })(),
      ])
      await waitForFilters(page, filters)
      assert.equal(await filters.getByRole('combobox', { name: '当前岗位', exact: true }).count(), 0)
      assert.equal(await filters.getByRole('textbox', { name: '搜索当前岗位', exact: true }).count(), 0)
      assert.equal(await filters.getByRole('group', { name: '当前岗位', exact: true }).getByRole('button').evaluateAll((buttons) => buttons.length > 0 && buttons.every((button) => button.disabled)), true)
      if (phone) {
        assert.equal(await filters.getByRole('group', { name: '关注事项', exact: true }).getByRole('button').evaluateAll((buttons) => buttons.length > 0 && buttons.every((button) => button.disabled)), true)
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      } else {
        assert.equal(await filters.getByRole('group', { name: '关注事项', exact: true }).getByRole('button').evaluateAll((buttons) => buttons.length > 0 && buttons.every((button) => button.disabled)), true)
        await filters.getByRole('button', { name: '完成', exact: true }).click()
      }
      assert(requests.some((query) => query.status === 'completed' && !query.attention && !query.owner_role_key))
      await page.reload()
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_tracking' && request.postDataJSON()?.params.status === 'active'),
        panel.getByRole('button', { name: /^进行中，/ }).click(),
      ])
      assert(requests.filter((query) => query.status === 'active').every((query) => !query.attention && !query.owner_role_key))
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
      assert.equal(await root.getByRole('button', { name: /^未结束/ }).getAttribute('aria-pressed'), 'true')
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
      await panel.getByRole('button', { name: '查看 MO-0001 完整进度', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.has('view'), false)
      await panel.getByRole('button', { name: /^筛选进度/ }).click()
      await page.getByRole('button', { name: /^仅看未关联销售/ }).click()
      await page.waitForURL((url) => url.searchParams.get('view') === 'production' && url.searchParams.get('unlinked_only') === 'true')
      await panel.getByRole('button', { name: '查看 MO-0003 完整进度', exact: true }).waitFor()
      await page.reload()
      await panel.getByRole('button', { name: '查看 MO-0003 完整进度', exact: true }).waitFor()
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
        const selectedStatus = group.locator('.ant-select-selection-item')
        const selectStatus = async (label) => {
          await page.waitForFunction((name) => [...document.querySelectorAll('[role="group"]')].some((element) => element.getAttribute('aria-label') === name && element.getAttribute('aria-busy') === 'false'), config.group)
          const control = group.getByRole('combobox', { name: config.group, exact: true })
          await control.press('ArrowDown')
          const listbox = await control.getAttribute('aria-controls')
          assert(listbox, '状态选择框须关联自己的选项列表')
          const dropdown = page.locator(`[id=${JSON.stringify(listbox)}]`).locator('xpath=ancestor::div[contains(@class,"ant-select-dropdown")][1]')
          await dropdown.locator('.ant-select-item-option-content').filter({ hasText: new RegExp(`^${label}\\s+\\d+$`, 'u') }).click()
        }
        await Promise.all([response(), selectStatus('已关闭')])
        assert.equal(page.filterQueries.at(-1)[config.field], 'closed')
        const start = page.filterQueries.length
        await reopen()
        await selectedStatus.filter({ hasText: /^不限状态\s+\d+$/u }).waitFor()
        assert.match(await selectedStatus.textContent(), /^不限状态\s+\d+$/u)
        assert(page.filterQueries.slice(start).every((query) => !query[config.field]), '恢复当前范围时不能发送残留已关闭状态')
        await Promise.all([response(), selectStatus('草稿')])
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
      const directClear = operation.getByRole('button', { name: '清空筛选', exact: true })
      assert.equal(await directClear.count(), 1, `${config.key} 非默认筛选显示直接清空入口`)
      await Promise.all([response(), directClear.click()])
      await waitForFiniteAnimations(page)
      assert.equal(await filters.isVisible(), false)
      assert.equal(await directClear.count(), 0, `${config.key} 清空后恢复默认筛选状态`)
      assert.equal(page.filterQueries.at(-1)[config.field] || '', '')
      assert.equal(await operation.locator('button[aria-haspopup="dialog"]').evaluate((node) => node === document.activeElement), true)
      await assertNoHorizontalOverflow(page, `${config.key} 记录范围恢复`)
    },
  }))
  const taskDates = {
    ...createDashboardTaskScenarios(deps).find((scenario) => scenario.name === 'erp-task-board-desktop'),
    name: 'erp-task-filter-date-parity',
    path: '/erp/task-board?lane=finished',
    verify: async (page) => {
      const panel = page.getByRole('region', { name: '任务管理', exact: true })
      const trigger = panel.locator('.erp-task-board-filters').getByRole('button', { name: /^筛选/ })
      const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const dates = page.getByRole('dialog', { name: '选择处理日期范围', exact: true })
      await trigger.click()
      await waitForFilters(page, filters)
      await choose(page, filters, '处理时间', '自定义日期')
      await dates.waitFor()
      await filters.waitFor({ state: 'hidden' })
      const day = dates.getByRole('group', { name: '选择日期范围' }).getByRole('button').nth(15)
      const selectedDate = await day.getAttribute('aria-label')
      await day.click()
      assert.equal(await dates.getByRole('button', { name: '应用日期', exact: true }).isEnabled(), false)
      await dates.getByRole('button', { name: '取消', exact: true }).click()
      await filters.waitFor()
      assert.equal(new URL(page.url()).searchParams.has('period'), false)
      await choose(page, filters, '处理时间', '自定义日期')
      await day.click()
      await day.click()
      await dates.getByRole('button', { name: '应用日期', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('period') === 'custom' && url.searchParams.get('date_from') === selectedDate && url.searchParams.get('date_to') === selectedDate)
      await trigger.click()
      await filters.getByRole('button', { name: `${selectedDate} 至 ${selectedDate}`, exact: true }).click()
      await dates.waitFor()
      await dates.getByRole('button', { name: '下个月', exact: true }).click()
      await dates.getByRole('group', { name: '选择日期范围' }).getByRole('button').nth(18).click()
      await dates.getByRole('button', { name: '取消', exact: true }).click()
      assert.equal(new URL(page.url()).searchParams.get('date_from'), selectedDate, '取消草稿保留已应用日期')
      await filters.getByRole('button', { name: '完成', exact: true }).click()
      const search = panel.getByPlaceholder('订单 / 产品 / 物料 / 款号')
      await search.fill('保留搜索条件')
      await search.press('Enter')
      await page.waitForURL((url) => url.searchParams.get('q') === '保留搜索条件')
      await trigger.click()
      await waitForFilters(page, filters)
      await filters.getByRole('button', { name: /清空筛选/ }).click()
      await page.waitForURL((url) => !url.searchParams.has('period') && !url.searchParams.has('date_from') && url.searchParams.get('q') === '保留搜索条件')
      await filters.getByRole('button', { name: '完成', exact: true }).click()
      const finished = panel.getByRole('button', { name: /已结束/, pressed: true })
      assert.equal(await finished.locator('.erp-filter-chip__clear').count(), 1)
      await finished.click()
      await page.waitForURL((url) => !url.searchParams.has('lane') || url.searchParams.get('lane') === 'all')
      await assertNoHorizontalOverflow(page, '桌面任务日期筛选')
    },
  }
  return [...mobile, progress, taskDates, productionOnly, ...tracking, controls, ...lifecycle]
}
