import { applyDateFilter, dateFilterButton, manualDateInputs, openDateFilter, visibleCalendarDays } from './dateFilterActions.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'
import { createMobileProgressScenarios } from './mobileProgressScenarios.mjs'
import { createBusinessProgressScenarios } from './businessProgressScenarios.mjs'
import { createBusinessStatusCountsScenarios } from './businessStatusCountsScenarios.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { createTaskTrackingScenarios } from './taskTrackingScenarios.mjs'
import { createMobileWorkflowTrackingScenarios } from './mobileWorkflowTrackingScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { assertMobileFilterDensity } from './mobileFilterPopoverAssertions.mjs'
import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'

async function assertPickerPointer(page, trigger) {
  await waitForFiniteAnimations(page)
  await page.waitForFunction((button) => {
    const panel = document.getElementById(button.getAttribute('aria-controls'))
    const arrow = panel?.closest('.ant-popover')?.querySelector('.ant-popover-arrow')
    if (!arrow) return false
    const anchor = button.getBoundingClientRect()
    const tip = arrow.getBoundingClientRect()
    return tip.width > 0 && Math.abs(anchor.left + anchor.width / 2 - tip.left - tip.width / 2) <= 1
  }, await trigger.elementHandle())
}

async function assertPickerBesideTrigger(assert, trigger) {
  const metrics = await trigger.evaluate((button) => {
    const popup = document.getElementById(button.getAttribute('aria-controls')).closest('.ant-popover')
    const anchor = button.getBoundingClientRect()
    const panel = popup.querySelector('.ant-popover-inner').getBoundingClientRect()
    return {
      anchor: [anchor.top, anchor.bottom],
      panel: [panel.top, panel.bottom],
      width: panel.width,
      theme: popup.closest('[data-erp-theme-portal]')?.dataset.erpTheme,
    }
  })
  const [anchorTop, anchorBottom] = metrics.anchor
  const [panelTop, panelBottom] = metrics.panel
  const gap = Math.max(panelTop - anchorBottom, anchorTop - panelBottom)
  assert(gap >= -1 && gap <= 24, `分组选项浮层应贴着触发按钮上方或下方，保留触发按钮：${JSON.stringify(metrics)}`)
  return metrics
}

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

async function assertFilterFits(assert, dialog) {
  const geometry = await dialog.evaluate((node) => {
    const { left, right, top, bottom } = (node.closest('.erp-business-filter-popover') ?? node).getBoundingClientRect()
    return { left, right, top, bottom, width: innerWidth, height: innerHeight }
  })
  assert(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1,
    `筛选面板超出视口 ${JSON.stringify(geometry)}`)
}

async function assertDesktopFilterLayout(assert, dialog) {
  await assertFilterFits(assert, dialog)
  const geometry = await dialog.evaluate((node) => {
    const overview = node.querySelector('.erp-filter-popover-panel')
    const fields = overview.querySelector('.erp-business-operation-panel__filters').getBoundingClientRect()
    const title = overview.querySelector('header strong').getBoundingClientRect()
    const clear = overview.querySelector('header button').getBoundingClientRect()
    const close = overview.querySelector('footer button').getBoundingClientRect()
    return { titleLeft: title.left,
clearRight: clear.right,
closeRight: close.right,
closeWidth: close.width,
closeTop: close.top,
      fieldsLeft: fields.left,
fieldsRight: fields.right,
fieldsBottom: fields.bottom,
fieldsWidth: fields.width }
  })
  assert(Math.abs(geometry.titleLeft - geometry.fieldsLeft) <= 1 && Math.abs(geometry.clearRight - geometry.fieldsRight) <= 1,
    '标题左对齐，清空在右上')
  assert(Math.abs(geometry.closeRight - geometry.fieldsRight) <= 1 && geometry.closeTop >= geometry.fieldsBottom && geometry.closeWidth < geometry.fieldsWidth / 2,
    '收起在条件区右下，宽度随文字')
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
  if (await control.evaluate((node) => node.tagName === 'UI-SELECT')) {
    await chooseSelectOption(control, { label: value })
  } else {
    await control.press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible').getByText(value, { exact: true }).click()
    await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  }
}

export function createFilterConflictScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow, gotoScenarioPath } = deps
  const verifyProgress = (phone, name) => async (page) => {
    if (phone) await page.getByTestId('mobile-role-nav-progress').click()
    const panel = page.getByRole('region', { name: phone ? '手机进度看板' : '进度看板', exact: true })
    await panel.getByRole('tab', { name: '订单交付', exact: true }).click()
    const quick = panel.getByRole('group', { name: '进度快捷筛选', exact: true })
    const filters = page.getByRole('dialog', { name: '筛选进度', exact: true })
    const clear = filters.getByRole('button', { name: phone ? '重置筛选' : '清空筛选', exact: true })
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
      await assertDesktopFilterLayout(assert, filters)
      for (const label of ['记录范围', '交期情况']) {
        const group = filters.getByRole('group', { name: label, exact: true })
        const [first, second] = await Promise.all([group.getByRole('button').nth(0).boundingBox(), group.getByRole('button').nth(1).boundingBox()])
        assert(first && second && Math.abs(first.y - second.y) <= 1 && first.x + first.width < second.x,
          `${label}选项按文字宽度横排`)
      }
      await filters.getByRole('combobox', { name: '客户', exact: true }).waitFor()
      const owner = filters.getByRole('combobox', { name: '处理人或业务负责人', exact: true })
      assert.equal(await filters.getByRole('button', { name: '搜索', exact: true }).count(), 0)
      await owner.press('ArrowDown')
      await owner.fill('业务')
      assert.equal(new URL(page.url()).searchParams.has('owner_name'), false)
      await page.locator('.ant-select-dropdown:visible .ant-select-item-option').getByText('模拟业务员', { exact: true }).click()
      await waitQuery({ owner_name: '模拟业务员' })
      await filters.getByRole('button', { name: '收起', exact: true }).click()
      await trigger.click()
      await waitForFilters(page, filters)
      await clear.click()
      await waitQuery({ owner_name: '' })
    }
    await due(filters, '已逾期').click()
    await filters.getByRole('button', { name: /^仅看任务受阻/ }).click()
    await waitQuery({ due_status: 'overdue', blocked_only: true })
    assert.equal(await due(quick, '已逾期').getAttribute('aria-pressed'), 'true')
    assert.equal(await quick.getByRole('button', { name: /^仅看任务受阻/ }).getAttribute('aria-pressed'), 'true')
    assert.equal(await trigger.getAttribute('aria-label'), '筛选进度', '已显示的快捷条件不重复计入额外筛选')
    await filters.getByLabel('记录范围', { exact: true }).getByText('全部记录', { exact: true }).click()
    await waitQuery({ scope: 'all', due_status: 'overdue', blocked_only: true })
    await panel.getByRole('button', { name: '筛选进度，已应用 1 项', exact: true }).waitFor()
    assert.equal(await trigger.getAttribute('aria-label'), '筛选进度，已应用 1 项')
    await clear.click()
    await waitQuery({ scope: 'active', due_status: 'overdue', blocked_only: true })
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
    await clear.click()
    await waitQuery({ scope: 'active' })
    await page.keyboard.press('Escape')
    await filters.waitFor({ state: 'hidden' })
    await search.fill('云朵')
    await search.press('Enter')
    await trigger.click()
    await waitForFilters(page, filters)
    assert.equal(await clear.isDisabled(), true)
    assert.equal(await search.inputValue(), '云朵')
    assert.equal(await trigger.getAttribute('aria-label'), '筛选进度')
    if (phone) {
      assert.equal(await filters.locator('.erp-filter-date-trigger').count(), 0)
      await due(filters, '未定交期').click()
      await waitQuery({ due_status: 'undated' })
    } else {
      const dates = await openDateFilter(page, filters)
      await waitForFilters(page, dates)
      await assertFilterFits(assert, dates)
      const day = visibleCalendarDays(dates).nth(15)
      await day.click(); await day.click()
      await dateFilterButton(dates, '应用日期').click()
      await waitForFilters(page, filters)
      await page.waitForFunction(() => !document.querySelector('[aria-label="进度快捷筛选"]').textContent.includes('—'))
      assert.match(await due(filters, '未定交期').innerText(), /1/u, '未定交期数量按清除日期后的结果计算')
      await due(filters, '未定交期').click()
      await waitQuery({ due_status: 'undated', from: '', to: '' })
    }
    await page.keyboard.press('Escape')
    await page.reload()
    if (phone) await panel.locator('.mobile-filter-trigger[title*="未定交期"]').waitFor()
    else await panel.locator('.erp-progress-active-filters').getByText('未定交期', { exact: true }).waitFor()
    await waitQuery({ due_status: 'undated' })
    assert.equal(await due(quick, '未定交期').count(), 0, '少用条件留在更多筛选，当前条件持续可见')
    await trigger.click()
    await waitForFilters(page, filters)
    await clear.click()
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
    await page.setViewportSize(phone ? { width: 320, height: 568 } : { width: 1280, height: 550 })
    await waitForFilters(page, filters)
    await assertNoHorizontalOverflow(page, `${name} 筛选`)
    if (phone) {
      await assertFilterFits(assert, filters)
    } else {
      await assertDesktopFilterLayout(assert, filters)
      const conditions = filters.locator('.erp-business-operation-panel__filters')
      const dateTrigger = filters.locator('.erp-filter-date-trigger')
      await dateTrigger.scrollIntoViewIfNeeded()
      const scrollTop = await conditions.evaluate((node) => node.scrollTop)
      assert(scrollTop > 0, '矮窗口只滚动条件区')
      const dates = await openDateFilter(page, filters)
      await waitForFilters(page, dates)
      await assertFilterFits(assert, dates)
      await dateFilterButton(dates, '返回筛选').click()
      await waitForFilters(page, filters)
      await assertDesktopFilterLayout(assert, filters)
      assert.equal(await conditions.evaluate((node) => node.scrollTop), scrollTop)
      assert.equal(await dateTrigger.evaluate((node) => node === document.activeElement), true)
      await filters.getByRole('button', { name: '收起', exact: true }).click()
      await filters.waitFor({ state: 'hidden' })
      assert.equal(await trigger.evaluate((node) => node === document.activeElement), true)
    }
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
    path: '/erp/business-dashboard?view=orders',
    effectiveSession: { ...desktop.effectiveSession, actions: [...desktop.effectiveSession.actions, 'customer.read'] },
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
      const toolbar = phone ? panel : page.locator('.erp-workflow-tracking-controls')
      const attention = toolbar.getByRole('group', { name: '关注事项', exact: true })
      const overdue = attention.getByRole('button', { name: '只看逾期', exact: true })
      const filterTrigger = toolbar.getByRole('button', { name: phone ? /筛选流程/ : /^筛选/ })
      const closeLabel = phone ? '关闭筛选' : '收起'
      const records = phone ? panel : panel.getByRole('region', { name: '流程记录', exact: true })
      await records.getByRole('button', { name: '重新读取', exact: true }).click()
      await records.getByText('任务分页记录 1', { exact: true }).waitFor()
      const requests = []
      page.on('request', (request) => {
        if (!request.url().endsWith('/rpc/workflow')) return
        const body = request.postDataJSON()
        if (body?.method === 'list_tracking') requests.push(body.params)
      })
      const filters = page.getByRole('dialog', { name: phone ? '筛选流程' : '筛选条件', exact: true })
      await filterTrigger.click()
      await waitForFilters(page, filters)
      if (phone) {
        const titles = await filters.locator('.erp-filter-field > legend').allTextContents()
        assert.deepEqual(titles, ['当前岗位'], '手机筛选只展示额外条件')
        const option = await filters.getByRole('group', { name: '当前岗位', exact: true }).getByRole('button', { name: '工程', exact: true }).elementHandle()
        const original = await option.evaluate((node) => node.querySelector('.erp-filter-chip__label').textContent)
        await option.evaluate((node) => { node.querySelector('.erp-filter-chip__label').textContent = '订单与材料协同负责人'.repeat(8) })
        const geometry = await option.evaluate((node) => ({ width: node.clientWidth, content: node.scrollWidth, height: node.clientHeight }))
        assert(geometry.content <= geometry.width + 1 && geometry.height > 44, `长筛选文字在控件内换行: ${JSON.stringify(geometry)}`)
        await filters.screenshot({ path: path.join(outputDir, `${base.name}-long-filter-label.png`) })
        await option.evaluate((node, text) => { node.querySelector('.erp-filter-chip__label').textContent = text }, original)
      }
      await choose(page, filters, '当前岗位', '工程')
      await filters.getByRole('button', { name: closeLabel, exact: true }).click()
      await filters.waitFor({ state: 'hidden' })
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_tracking' && request.postDataJSON()?.params.attention === 'overdue'),
        overdue.click(),
      ])
      await attention.getByRole('button', { name: '只看逾期', exact: true, pressed: true }).waitFor()
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_tracking' && request.postDataJSON()?.params.status === 'completed'),
        toolbar.getByRole('button', { name: /^已结束，/ }).click(),
      ])
      await filterTrigger.click()
      await waitForFilters(page, filters)
      assert.equal(await filters.getByRole('combobox', { name: '当前岗位', exact: true }).count(), 0)
      assert.equal(await filters.getByRole('textbox', { name: '搜索当前岗位', exact: true }).count(), 0)
      assert.equal(await filters.getByRole('group', { name: '当前岗位', exact: true }).getByRole('button').evaluateAll((buttons) => buttons.length > 0 && buttons.every((button) => button.disabled)), true)
      assert.equal(await filters.getByRole('group', { name: '关注事项', exact: true }).count(), 0)
      await filters.getByRole('button', { name: closeLabel, exact: true }).click()
      assert.equal(await overdue.getAttribute('aria-pressed'), 'false')
      assert.equal(await attention.getByRole('button').evaluateAll((buttons) => buttons.length === 2 && buttons.every((button) => button.disabled)), true)
      assert(requests.some((query) => query.status === 'completed' && !query.attention && !query.owner_role_key))
      await page.reload()
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_tracking' && request.postDataJSON()?.params.status === 'active'),
        toolbar.getByRole('button', { name: /^进行中，/ }).click(),
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
      const root = page.getByRole('region', { name: '组件设计', exact: true })
      const directory = root.getByRole('navigation', { name: '组件设计目录' })
      await directory.getByRole('button', { name: '组合样例', exact: true }).click()
      const sample = root.getByRole('region', { name: '交互样例', exact: true })
      await directory.getByRole('button', { name: /^筛选与搜索/u }).click()
      const risks = root.getByRole('group', { name: '演示风险筛选', exact: true })
      await risks.getByRole('button', { name: /^已逾期/ }).click()
      assert.equal(await sample.getByRole('button', { name: /^(?:流程范围|岗位高亮)：/u }).count(), 0)
      const filterButton = sample.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
      const filterDialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
      await filterButton.click()
      await assertPickerPointer(page, filterButton)
      const range = page.getByLabel('演示记录范围', { exact: true })
      await range.getByText('已结束', { exact: true }).click()
      assert.equal(await range.getByRole('button', { name: '已结束', exact: true }).getAttribute('aria-pressed'), 'true')
      await assertPickerPointer(page, filterButton)
      assert.equal(await filterButton.locator('.anticon-filter + span').textContent(), '筛选')
      const owner = filterDialog.getByRole('combobox', { name: '演示负责人' })
      await owner.click()
      assert.equal(await filterDialog.locator('.ant-select-arrow .anticon-down').count(), 1)
      const options = page.locator('.ant-select-dropdown:visible')
      await options.locator('.ant-select-item-option-content').filter({ hasText: /^小陈$/u }).click()
      await options.waitFor({ state: 'hidden' })
      await assertPickerPointer(page, filterButton)
      const clear = await filterDialog.locator('.ant-select-clear').boundingBox()
      const arrow = await filterDialog.locator('.ant-select-arrow .anticon-down').boundingBox()
      assert(clear && arrow && clear.x + clear.width <= arrow.x, '清空与右侧下箭头并排，保持独立区域')
      assert.equal(await filterButton.locator('.erp-control-count').textContent(), '2')
      await filterDialog.getByRole('button', { name: '收起', exact: true }).click()
      await filterDialog.waitFor({ state: 'hidden' })
      assert.equal(await risks.getByRole('button', { name: /^已逾期/ }).isDisabled(), true)
      assert.equal(await risks.getByRole('button', { name: /^已结束/ }).getAttribute('aria-pressed'), 'true')
      await root.getByText('SO-DEMO-04', { exact: true }).waitFor()
      await filterButton.click()
      await filterDialog.getByRole('button', { name: '清空筛选', exact: true }).click()
      await filterDialog.getByRole('button', { name: '收起', exact: true }).click()
      await filterDialog.waitFor({ state: 'hidden' })
      assert.equal(await risks.getByRole('button', { name: /^未结束/ }).getAttribute('aria-pressed'), 'true')
      await assertNoHorizontalOverflow(page, '控件筛选示例')

      const search = root.getByRole('textbox', { name: '搜索组件设计' })
      await search.fill('BusinessChainDesignPicker')
      await search.press('Enter')
      await page.waitForURL((url) => url.searchParams.get('controlq') === 'BusinessChainDesignPicker')
      await directory.getByRole('button', { name: /^筛选与搜索/u }).waitFor({ state: 'detached' })
      const pickerTopic = directory.getByRole('button', { name: /^分组选择（单选／多选）/u })
      await pickerTopic.click()
      await page.waitForURL((url) => url.searchParams.get('control') === 'chain-view-picker')
      assert.equal(await root.locator('.erp-control-library-heading code').textContent(), 'BusinessChainDesignPicker')
      await page.reload()

      const scopeTrigger = sample.getByRole('button', { name: /^流程范围：/u })
      const scopeDialog = page.getByRole('dialog', { name: '选择流程范围', exact: true })
      await scopeTrigger.click()
      await assertPickerPointer(page, scopeTrigger)
      const scopeMetrics = await assertPickerBesideTrigger(assert, scopeTrigger)
      assert(scopeMetrics.width <= 390, `只有三条链路的样例浮层按选项收宽：${scopeMetrics.width}px`)
      assert.equal(scopeMetrics.theme, 'light')
      await scopeDialog.getByText('单选', { exact: true }).waitFor()
      await scopeDialog.getByRole('group', { name: '采购、委外与库存', exact: true })
        .getByRole('button', { name: '委外发料到回货应付', exact: true, pressed: true }).waitFor()
      await page.screenshot({ path: path.join(outputDir, 'grouped-picker-scope-4k.png') })
      await scopeDialog.getByRole('button', { name: '业务全流程地图', exact: true }).click()
      await scopeDialog.waitFor({ state: 'hidden' })
      assert.equal(await scopeTrigger.getAttribute('aria-label'), '流程范围：业务全流程地图')
      assert.equal(await scopeTrigger.locator('.anticon-down').count(), 1)
      assert(await scopeTrigger.evaluate((node) => node === document.activeElement), '点选流程后焦点回到入口')

      const roleTrigger = sample.getByRole('button', { name: /^岗位高亮：/u })
      const roleDialog = page.getByRole('dialog', { name: '选择高亮岗位', exact: true })
      await roleTrigger.press('ArrowDown')
      await assertPickerPointer(page, roleTrigger)
      await assertPickerBesideTrigger(assert, roleTrigger)
      await roleDialog.getByText('可多选', { exact: true }).waitFor()
      const present = roleDialog.getByRole('group', { name: '本图有节点', exact: true })
      const purchase = present.getByRole('checkbox', { name: '采购', exact: true })
      const warehouse = present.getByRole('checkbox', { name: '仓库', exact: true })
      await roleDialog.getByRole('group', { name: '本图暂无节点', exact: true })
        .getByRole('checkbox', { name: '财务', exact: true }).waitFor()
      const fullView = roleDialog.getByRole('button', { name: '全链路视角', exact: true })
      await page.waitForFunction((button) => document.activeElement === button, await fullView.elementHandle())
      await page.keyboard.press('Tab')
      assert(await purchase.evaluate((node) => node === document.activeElement), 'Tab 移动到第一个岗位')
      await page.keyboard.press('Space')
      assert.equal(await roleTrigger.getAttribute('aria-label'), '岗位高亮：采购 · 2 个节点')
      await warehouse.check()
      assert.equal(await roleTrigger.getAttribute('aria-label'), '岗位高亮：已选 2 个岗位')
      const steps = sample.getByRole('table', { name: '岗位高亮示例步骤' })
      await steps.getByRole('row', { name: /核对采购订单/u }).getByRole('cell', { name: '采购', exact: true }).waitFor()
      await steps.getByRole('row', { name: /交接到货/u }).getByRole('cell', { name: '共同 · 采购、仓库', exact: true }).waitFor()
      await steps.getByRole('row', { name: /登记入库/u }).getByRole('cell', { name: '仓库', exact: true }).waitFor()
      await page.mouse.move(0, 0)
      await waitForFiniteAnimations(page)
      const checkmarks = await roleDialog.locator('.ant-checkbox-checked .ant-checkbox-inner').evaluateAll((items) =>
        items.map((item) => getComputedStyle(item, '::after').opacity)
      )
      assert.deepEqual(checkmarks, ['1', '1'], '两个已选岗位均显示勾选标记')
      await page.screenshot({ path: path.join(outputDir, 'grouped-picker-role-4k.png') })

      const desktopViewport = page.viewportSize()
      await roleDialog.press('Escape')
      await roleDialog.waitFor({ state: 'hidden' })
      await root.getByLabel('组件样例主题', { exact: true }).getByText('深色', { exact: true }).click()
      await page.setViewportSize({ width: 620, height: 520 })
      await scopeTrigger.click()
      await assertPickerPointer(page, scopeTrigger)
      const shortScope = await assertPickerBesideTrigger(assert, scopeTrigger)
      assert.equal(shortScope.theme, 'dark')
      await assertFilterFits(assert, scopeDialog)
      await page.keyboard.press('Escape')
      await scopeDialog.waitFor({ state: 'hidden' })
      await roleTrigger.click()
      await assertPickerPointer(page, roleTrigger)
      await assertPickerBesideTrigger(assert, roleTrigger)
      await assertFilterFits(assert, roleDialog)
      assert.equal(await roleDialog.getByRole('checkbox', { checked: true }).count(), 2)
      await fullView.click()
      assert.equal(await roleDialog.getByRole('checkbox', { checked: true }).count(), 0)
      assert.equal(await steps.getByRole('cell', { name: '—', exact: true }).count(), 3)
      await page.keyboard.press('Escape')
      await roleDialog.waitFor({ state: 'hidden' })
      assert(await roleTrigger.evaluate((node) => node === document.activeElement), 'Esc 关闭后焦点回到岗位入口')
      await assertNoHorizontalOverflow(page, '分组选择窄窗')
      await page.setViewportSize(desktopViewport)
      await page.getByRole('button', { name: '重置演示', exact: true }).click()
      await sample.getByRole('button', { name: '流程范围：委外发料到回货应付', exact: true }).waitFor()
      await sample.getByRole('button', { name: '岗位高亮：全链路视角', exact: true }).waitFor()
    },
  }
  const productionOnly = {
    ...desktop,
    name: 'erp-progress-production-filter-conflicts',
    path: '/erp/business-dashboard',
    effectiveSession: {
      ...desktop.effectiveSession,
      actions: desktop.effectiveSession.actions.filter((action) => !action.startsWith('sales_order')),
    },
    beforeNavigate: async (page) => {
      await desktop.beforeNavigate(page)
      let failOwnerLookup = true
      await page.route('**/rpc/business', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method === 'list_progress_owner_options') {
          const result = failOwnerLookup
            ? { code: 50000, message: '暂时无法读取名单' }
            : { code: 0, message: 'OK', data: { names: ['模拟生产处理人'] } }
          failOwnerLookup = false
          return route.fulfill({ json: { jsonrpc: '2.0', id, result } })
        }
        if (!['list_progress', 'get_progress'].includes(method)) return route.fallback()
        const data = progressFixtureData({ ...params, view: params.view || 'production' }, { detail: method === 'get_progress' })
        data.access.sales = false
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data } } })
      })
    },
    verify: async (page) => {
      const panel = page.getByRole('region', { name: '进度看板', exact: true })
      await panel.getByRole('button', { name: '查看进度：MO-0001', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.has('view'), false)
      await panel.getByRole('button', { name: /^筛选进度/ }).click()
      const filters = page.getByRole('dialog', { name: '筛选进度' })
      await filters.getByRole('button', { name: '重试', exact: true }).click()
      const owners = filters.getByRole('combobox', { name: '处理人或业务负责人' })
      await owners.press('ArrowDown')
      const choices = page.locator('.ant-select-dropdown:visible .ant-select-item-option')
      await choices.getByText('模拟生产处理人', { exact: true }).waitFor()
      assert.equal(await choices.getByText('模拟业务员', { exact: true }).count(), 0)
      await owners.press('Escape')
      await page.getByRole('button', { name: /^仅看未关联销售/ }).click()
      await page.waitForURL((url) => url.searchParams.get('view') === 'production' && url.searchParams.get('unlinked_only') === 'true')
      await panel.getByRole('button', { name: '查看进度：MO-0003', exact: true }).waitFor()
      await page.reload()
      await panel.getByRole('button', { name: '查看进度：MO-0003', exact: true }).waitFor()
      await assertNoHorizontalOverflow(page, '生产进度默认视图筛选')
    },
  }
  const listFixture = createBusinessStatusCountsScenarios(deps).find((scenario) => scenario.name === 'business-status-counts-pages')
  const productionDate = {
    ...listFixture,
    name: 'production-order-date-type-filter',
    path: '/erp/production/orders?date_from=2026-09-21&date_to=2026-09-28&page=2',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const trigger = page.locator('.erp-business-operation-panel').getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
      const waitForQuery = (predicate) => page.waitForResponse((response) => {
        if (!response.url().endsWith('/rpc/production_order')) return false
        const { method, params } = response.request().postDataJSON() || {}
        return method === 'list_production_orders' && predicate(params)
      })
      const openFilters = async () => {
        await trigger.click()
        await waitForFilters(page, filters)
      }
      await openFilters()
      assert.equal(await trigger.getAttribute('aria-label'), '筛选，已应用 1 项')
      const dates = await openDateFilter(page, filters)
      const types = dates.getByRole('group', { name: '日期类型', exact: true })
      const start = dateFilterButton(types, '计划开始')
      const end = dateFilterButton(types, '计划结束')
      assert.equal(await start.getAttribute('aria-pressed'), 'true')
      await waitForFiniteAnimations(page)
      const before = await dates.boundingBox()
      await end.press('Space')
      assert.equal(await end.getAttribute('aria-pressed'), 'true')
      assert.notEqual(new URL(page.url()).searchParams.get('date_field'), 'planned_end_at')
      const after = await dates.boundingBox()
      assert(Object.keys(before).every((key) => Math.abs(before[key] - after[key]) <= 1), '切换时日期气泡维持位置')
      const { from, to } = await manualDateInputs(dates)
      assert.deepEqual(await Promise.all([from.inputValue(), to.inputValue()]), ['2026-09-21', '2026-09-28'])
      const [response] = await Promise.all([
        waitForQuery((params) => params.date_field === 'planned_end_at'),
        dateFilterButton(dates, '应用日期').click(),
      ])
      const { params } = response.request().postDataJSON()
      assert(params.date_from > 0 && params.date_to > params.date_from, '应用时一次提交日期类型和原范围')
      assert.equal(params.offset ?? 0, 0, '应用不同日期字段返回第一页')
      const entry = filters.locator('.erp-filter-date-trigger')
      await filters.getByRole('button', { name: '计划结束：2026-09-21 至 2026-09-28', exact: true }).waitFor()
      const hasSingleLine = () => entry.evaluate((node) =>
        Math.abs(node.getBoundingClientRect().height - parseFloat(getComputedStyle(node).minHeight)) <= 1
      )
      assert.equal(await hasSingleLine(), true, '常规列宽可单行显示完整起止日期')

      await openDateFilter(page, filters)
      await dateFilterButton(dates, '近 30 天').click()
      await filters.getByRole('button', { name: '计划结束：近 30 天', exact: true }).waitFor()
      await waitForFilters(page, filters)
      assert.equal(await hasSingleLine(), true, '短期间与普通筛选控件等高')
      assert.equal(await filters.locator('.erp-business-date-range-filter > legend').textContent(), '日期范围 · 计划结束')
      await filters.screenshot({ path: path.join(outputDir, 'production-order-compact-date-filter.png') })
      const overviewGeometry = () => Promise.all([filters, entry, entry.locator('.erp-filter-date-trigger__arrow')].map((locator) => locator.boundingBox()))
      const activeGeometry = await overviewGeometry()
      const clearDate = filters.getByRole('button', { name: '清除计划结束', exact: true })
      await Promise.all([
        waitForQuery((query) => query.date_field === 'planned_end_at' && !query.date_from && !query.date_to),
        clearDate.press('Enter'),
      ])
      await filters.getByRole('button', { name: '计划结束：不限', exact: true }).waitFor()
      await waitForFilters(page, filters)
      const clearedGeometry = await overviewGeometry()
      assert(
        clearedGeometry.every((box, index) => box && Object.keys(box).every((key) => Math.abs(box[key] - activeGeometry[index][key]) <= 1)),
        `移除最后一个日期条件时气泡、日期入口和箭头仍在原位 ${JSON.stringify({ activeGeometry, clearedGeometry })}`
      )
      assert.equal(await trigger.getAttribute('aria-label'), '筛选')
      assert.equal(await clearDate.count(), 0)
      assert.equal(await dates.isVisible(), false)
      assert.equal(await entry.evaluate((node) => node === document.activeElement), true)

      await page.setViewportSize({ width: 390, height: 844 })
      await openDateFilter(page, filters)
      assert.equal(await end.getAttribute('aria-pressed'), 'true')
      assert.equal(await dates.locator('.erp-filter-date-days:visible').count(), 1)
      assert.equal(await dates.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true)
      await assertNoHorizontalOverflow(page, '生产订单日期筛选窄屏')
      await page.screenshot({ path: path.join(outputDir, 'production-order-date-type-filter-narrow.png') })
      await dateFilterButton(dates, '近 30 天').click()
      await Promise.all([
        waitForQuery((params) => params.date_field === 'planned_start_at' && !params.date_from && !params.date_to),
        filters.getByRole('button', { name: '清空筛选', exact: true }).click(),
      ])
      await filters.getByRole('button', { name: '计划开始：不限', exact: true }).waitFor()
      assert.equal(await trigger.getAttribute('aria-label'), '筛选')

      await page.setViewportSize({ width: 1440, height: 900 })
      await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', { waitUntil: 'domcontentloaded' })
      await openFilters()
      await openDateFilter(page, filters)
      assert.equal(await dateFilterButton(types, '下单日期').getAttribute('aria-pressed'), 'true')
      await dateFilterButton(types, '计划交付日期').click()
      const selectedSalesDate = '2026-09-21'
      const [salesResponse] = await Promise.all([
        page.waitForResponse((result) => {
          if (!result.url().endsWith('/rpc/sales_order')) return false
          const { method, params } = result.request().postDataJSON() || {}
          return method === 'list_sales_orders' && params.date_field === 'planned_delivery_date'
        }),
        applyDateFilter(dates, { from: selectedSalesDate, to: '' }),
      ])
      const salesParams = salesResponse.request().postDataJSON().params
      assert.equal(salesParams.date_from, selectedSalesDate, '应用单边日期按原业务日期合同查询')
      assert.equal(salesParams.offset ?? 0, 0)
      await filters.getByRole('button', { name: `计划交付日期：${selectedSalesDate} 起`, exact: true }).waitFor()
      await openDateFilter(page, filters)
      await page.setViewportSize({ width: 3840, height: 2160 })
      await waitForFiniteAnimations(page)
      assert.equal(await dates.locator('.erp-filter-date-days:visible').count(), 2)
      await page.screenshot({ path: path.join(outputDir, 'sales-order-date-type-filter-desktop.png') })
      await dates.screenshot({ path: path.join(outputDir, 'sales-order-date-type-filter-panel.png') })
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(await dates.locator('.erp-filter-date-days:visible').count(), 1)
      await assertNoHorizontalOverflow(page, '销售订单日期筛选窄屏')
      await page.screenshot({ path: path.join(outputDir, 'sales-order-date-type-filter-narrow.png') })
      await dateFilterButton(dates, '返回筛选').click()
      await filters.getByRole('button', { name: '清空筛选', exact: true }).click()
      await filters.getByRole('button', { name: /：不限$/u }).waitFor()
      assert.equal(await trigger.getAttribute('aria-label'), '筛选')
    },
  }
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
        await operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u }).click()
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
        await choose(page, filters, '记录范围', '不限')
        await filters.getByRole('button', { name: '收起', exact: true }).click()
        const group = page.getByRole('group', { name: config.group, exact: true })
        const selectedStatus = group.getByRole('button', { pressed: true })
        const selectStatus = async (label) => {
          await page.waitForFunction((name) => [...document.querySelectorAll('[role="group"]')].some((element) => element.getAttribute('aria-label') === name && element.getAttribute('aria-busy') === 'false'), config.group)
          await group.getByRole('button', { name: new RegExp(`^${label}，共 [\\d,]+ 条$`, 'u') }).click()
        }
        await Promise.all([response(), selectStatus('已关闭')])
        assert.equal(page.filterQueries.at(-1)[config.field], 'closed')
        const start = page.filterQueries.length
        await reopen()
        await selectedStatus.filter({ hasText: /^不限状态/u }).waitFor()
        assert.match(await selectedStatus.getAttribute('aria-label'), /^不限状态，共 [\d,]+ 条$/u)
        assert(page.filterQueries.slice(start).every((query) => !query[config.field]), '恢复当前范围时不能发送残留已关闭状态')
        await Promise.all([response(), selectStatus('草稿')])
        await reopen()
        assert.equal(page.filterQueries.at(-1)[config.field], 'draft', '合法缓存状态仍需保留')
        assert.equal(await operation.getByRole('button', { name: '清空筛选', exact: true }).count(), 0, '仅快捷状态不显示额外条件清空入口')
        await openFilters()
        await Promise.all([response(), choose(page, filters, '记录范围', '不限')])
        await filters.getByRole('button', { name: '收起', exact: true }).click()
      } else {
        await openFilters()
        assert(page.filterQueries.length > 0)
        assert(page.filterQueries.every((query) => !query[config.field]), '冲突链接不能发送范围外状态')
        await Promise.all([response(), choose(page, filters, '记录范围', '不限')])
        assert.equal(page.filterQueries.at(-1)[config.field] || '', '')
        await page.reload()
        await openFilters()
        assert.equal(page.filterQueries.at(-1)[config.field] || '', '', '切换范围并刷新不能恢复已清理状态')
        await filters.getByRole('button', { name: '收起', exact: true }).click()
      }
      await waitForFiniteAnimations(page)
      const directClear = operation.getByRole('button', { name: '清空筛选', exact: true })
      assert.equal(await directClear.count(), 1, `${config.key} 非默认筛选显示直接清空入口`)
      await Promise.all([response(), directClear.click()])
      await waitForFiniteAnimations(page)
      assert.equal(await filters.isVisible(), false)
      assert.equal(await directClear.count(), 0, `${config.key} 清空后恢复默认筛选状态`)
      assert.equal(page.filterQueries.at(-1)[config.field] || '', config.group ? 'draft' : '', '清空额外条件保留有效的快捷状态')
      assert.equal(await operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u }).evaluate((node) => node === document.activeElement), true)
      await assertNoHorizontalOverflow(page, `${config.key} 记录范围恢复`)
    },
  }))
  const taskDates = {
    ...createDashboardTaskScenarios(deps).find((scenario) => scenario.name === 'erp-task-board-desktop'),
    name: 'erp-task-filter-date-parity',
    path: '/erp/task-board?lane=finished',
    viewport: { width: 1280, height: 640 },
    verify: async (page) => {
      const panel = page.getByRole('region', { name: '任务管理', exact: true })
      const trigger = panel.locator('.erp-task-board-filters').getByRole('button', { name: /^筛选/ })
      const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const dates = page.getByRole('dialog', { name: '选择日期范围', exact: true })
      await trigger.click()
      await waitForFilters(page, filters)
      await assertDesktopFilterLayout(assert, filters)
      const sortChoices = filters.getByRole('group', { name: '任务排序', exact: true })
      assert.deepEqual(await sortChoices.getByRole('button').allTextContents(), ['智能优先', '最早到期', '最近创建', '任务时间从早到晚', '任务时间从晚到早'])
      assert.equal(await sortChoices.getByRole('button', { name: '智能优先', exact: true }).getAttribute('aria-pressed'), 'true')
      assert.equal(await filters.getByRole('combobox', { name: '任务排序', exact: true }).count(), 0)
      const person = filters.getByRole('combobox', { name: '办理人', exact: true })
      assert.equal(await person.count(), 1, '动态办理人名单保留下拉搜索')
      await sortChoices.getByRole('button', { name: '最近创建', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('sort') === 'newest')
      assert.equal(await filters.isVisible(), true)
      await sortChoices.getByRole('button', { name: '智能优先', exact: true }).click()
      await page.waitForURL((url) => !url.searchParams.has('sort') || url.searchParams.get('sort') === 'smart')
      await openDateFilter(page, filters)
      const day = visibleCalendarDays(dates).nth(15)
      const selectedDate = await day.getAttribute('aria-label')
      await day.click()
      assert.equal(await dateFilterButton(dates, '应用日期').isEnabled(), false)
      await dateFilterButton(dates, '取消').click()
      await filters.waitFor()
      assert.equal(new URL(page.url()).searchParams.has('period'), false)
      await openDateFilter(page, filters)
      await day.click()
      await day.click()
      await dateFilterButton(dates, '应用日期').click()
      await page.waitForURL((url) => url.searchParams.get('period') === 'custom' && url.searchParams.get('date_from') === selectedDate && url.searchParams.get('date_to') === selectedDate)
      await filters.getByRole('button', { name: `处理时间：${selectedDate}`, exact: true }).waitFor()
      await openDateFilter(page, filters)
      await dateFilterButton(dates, '下个月').click()
      await visibleCalendarDays(dates).nth(18).click()
      await dateFilterButton(dates, '取消').click()
      assert.equal(new URL(page.url()).searchParams.get('date_from'), selectedDate, '取消草稿保留已应用日期')
      await filters.getByRole('button', { name: '收起', exact: true }).click()
      const search = panel.getByPlaceholder('搜单号、产品、物料')
      await search.fill('保留搜索条件')
      await search.press('Enter')
      await page.waitForURL((url) => url.searchParams.get('q') === '保留搜索条件')
      await trigger.click()
      await waitForFilters(page, filters)
      await filters.getByRole('button', { name: /清空筛选/ }).click()
      await page.waitForURL((url) => !url.searchParams.has('period') && !url.searchParams.has('date_from') && url.searchParams.get('q') === '保留搜索条件')
      await filters.getByRole('button', { name: '收起', exact: true }).click()
      const finished = panel.getByRole('button', { name: /已结束/, pressed: true })
      assert.equal(await finished.locator('.erp-filter-chip__clear').count(), 1)
      await finished.click()
      await page.waitForURL((url) => !url.searchParams.has('lane') || url.searchParams.get('lane') === 'all')
      await assertNoHorizontalOverflow(page, '桌面任务日期筛选')
    },
  }
  const month = currentBusinessDate().slice(0, 7)
  const firstDay = `${month}-10`
  const lastDay = `${month}-12`
  const dueDates = {
    ...taskDates,
    name: 'erp-task-board-custom-due-dates',
    path: '/erp/task-board?mode=todo',
    workflowTaskFixtures: [`${firstDay}T00:00:00`, `${lastDay}T23:59:59`, `${month}-13T00:00:00`, null].map((at, index) => ({
      id: 9650 + index,
task_code: `STYLE-DUE-DATE-${index}`,
task_name: `核对截止日期 ${index}`,
      task_group: 'trial_warehouse_work',
source_type: 'sales_order',
source_id: index + 1,
      owner_role_key: 'warehouse',
task_status_key: 'ready',
version: 1,
payload: {},
      due_at: at ? Date.parse(`${at}+08:00`) / 1000 : null,
    })),
    verify: async (page) => {
      const trigger = page.locator('.erp-task-board-filters').getByRole('button', { name: /^筛选/ })
      const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const results = (count) => page.getByText(`第 1-${count} 条 / 共 ${count} 条`, { exact: true }).waitFor()
      const emptyEntry = filters.getByRole('button', { name: '截止时间：不限', exact: true })
      const assertEmptyEntry = async () => {
        const geometry = await emptyEntry.evaluate((node) => {
          const box = node.getBoundingClientRect()
          const control = node.parentElement.getBoundingClientRect()
          const arrow = node.querySelector('.erp-filter-date-trigger__arrow').getBoundingClientRect()
          return { widthDifference: control.width - box.width, arrowGap: box.right - arrow.right, leftPadding: getComputedStyle(node).paddingInlineStart }
        })
        assert(Math.abs(geometry.widthDifference) <= 1 && Math.abs(geometry.arrowGap - 9) <= 1 && geometry.leftPadding === '8px',
          `日期不限时整框可点，箭头靠右：${JSON.stringify(geometry)}`)
      }
      await results(4)
      await trigger.click()
      await waitForFilters(page, filters)
      await assertEmptyEntry()
      const range = await openDateFilter(page, filters)
      for (const label of ['今天', '近 7 天', '近 30 天', '未来 7 天']) await dateFilterButton(range, label).waitFor()
      const { from, to } = await manualDateInputs(range)
      const fromBox = await from.boundingBox()
      const toBox = await to.boundingBox()
      assert(fromBox && toBox && Math.abs(fromBox.y - toBox.y) <= 1 && fromBox.x + fromBox.width < toBox.x, '起止日期在原气泡内并排显示')
      await range.screenshot({ path: path.join(outputDir, 'task-due-date-inline.png') })
      await from.fill(firstDay)
      await results(4)
      await dateFilterButton(range, '应用日期').click()
      await results(1)
      await page.reload()
      await results(1)
      await trigger.click()
      await waitForFilters(page, filters)
      await openDateFilter(page, filters)
      await manualDateInputs(range)
      assert.equal(await from.inputValue(), firstDay)
      assert.equal(await to.inputValue(), '')
      await to.fill(lastDay)
      await dateFilterButton(range, '应用日期').click()
      await results(2)
      const entry = filters.locator('.erp-filter-date-trigger')
      const clear = filters.getByRole('button', { name: '清除截止时间', exact: true })
      await clear.waitFor({ state: 'visible' })
      await waitForFiniteAnimations(page)
      const desktopClear = await clear.boundingBox()
      assert(desktopClear && desktopClear.width === 36 && desktopClear.height === 34, '桌面整块清除点击区为 36×34 px')
      const desktop = page.viewportSize()
      await page.setViewportSize({ width: 460, height: 700 })
      await clear.scrollIntoViewIfNeeded()
      await waitForFiniteAnimations(page)
      const [entryBox, clearBox] = await Promise.all([entry.boundingBox(), clear.boundingBox()])
      assert(entryBox && clearBox && Math.abs(entryBox.x + entryBox.width - clearBox.x) <= 1
        && Math.abs(entryBox.height - clearBox.height) <= 1, '清除和日历入口并排且同高')
      await entry.click({ position: { x: entryBox.width - 4, y: 4 } })
      await range.waitFor({ state: 'visible' })
      await dateFilterButton(range, '取消').click()
      await waitForFilters(page, filters)

      const frames = page.evaluate(() => new Promise((resolve) => {
        const samples = []
        const sample = () => {
          const panel = document.querySelector('[role="dialog"][aria-label="筛选条件"]')
          const geometry = [panel, panel?.querySelector('.erp-filter-date-control')].map((node) => {
            const box = node?.getBoundingClientRect()
            return box ? [box.x, box.y, box.width, box.height] : []
          })
          samples.push({ geometry, datePanel: Boolean(document.querySelector('[role="dialog"][aria-label="选择日期范围"]')) })
          if (samples.length < 24) requestAnimationFrame(sample)
          else resolve(samples)
        }
        requestAnimationFrame(sample)
      }))
      await clear.click({ position: { x: clearBox.width - 4, y: 4 } })
      await emptyEntry.waitFor()
      await results(4)
      const samples = await frames
      const initialGeometry = samples[0].geometry
      const moved = samples.find(({ geometry, datePanel }) => datePanel || geometry.some((box, i) => (
        box.length !== 4 || box.some((value, j) => Math.abs(value - initialGeometry[i][j]) > 1)
      )))
      assert(!moved, `清除期间筛选气泡和日期框保持原位：${JSON.stringify({ initialGeometry, moved })}`)
      assert.equal(await clear.count(), 0)
      assert.equal(await entry.evaluate((node) => node === document.activeElement), true)
      await assertEmptyEntry()
      const emptyBox = await emptyEntry.boundingBox()
      assert(emptyBox, '清空后日期入口可见')
      await emptyEntry.click({ position: { x: emptyBox.width - 4, y: emptyBox.height / 2 } })
      await range.waitFor({ state: 'visible' })
      await page.setViewportSize(desktop)
      await dateFilterButton(range, '未设置到期').click()
      await results(1)
      assert.equal(new URL(page.url()).searchParams.has('due_date_from'), false)
      await openDateFilter(page, filters)
      await applyDateFilter(range, { from: '', to: lastDay })
      await results(1)
      assert.equal(new URL(page.url()).searchParams.has('due'), false)
      await openDateFilter(page, filters)
      await dateFilterButton(range, '今天').click()
      await page.waitForURL((url) => url.searchParams.get('due_date_from') === currentBusinessDate() && url.searchParams.get('due_date_to') === currentBusinessDate())
      await filters.getByRole('button', { name: '清空筛选', exact: true }).click()
      await results(4)
    },
  }
  return [...mobile, progress, taskDates, dueDates, productionOnly, ...tracking, controls, productionDate, ...lifecycle]
}
