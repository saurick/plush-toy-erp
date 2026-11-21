import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { createTaskTrackingScenarios } from './taskTrackingScenarios.mjs'
import { createBusinessProgressScenarios } from './businessProgressScenarios.mjs'
import { createBusinessListStickyScenarios } from './businessListStickyScenarios.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function verifyTaskViewKeyboardRecovery(page, assert) {
  const tabs = page.getByRole('tablist', { name: '待办显示方式', exact: true })
  const list = tabs.getByRole('tab', { name: '列表', exact: true })
  const calendarTab = tabs.getByRole('tab', { name: '日历', exact: true })
  const calendar = page.getByRole('region', { name: '待办日历', exact: true })
  const pager = page.locator('.erp-task-pagination')
  const rows = page.locator('.erp-work-center-table tr[data-row-key]')
  const waitForList = async () => {
    await pager.getByText('第 51-100 条 / 共 105 条', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelectorAll('.erp-work-center-table tr[data-row-key]').length === 50)
    await page.locator('.erp-task-board-lanes[aria-busy="false"]').waitFor()
  }
  const search = page.getByPlaceholder('搜单号、产品、物料', { exact: true })
  await search.fill('核对')
  await search.press('Enter')
  await page.waitForURL((url) => url.searchParams.get('q') === '核对')
  await page.locator('.erp-task-board-lanes[aria-busy="false"]').waitFor()
  await pager.locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible').getByText('50 条/页', { exact: true }).click()
  await pager.getByText('第 1-50 条 / 共 105 条', { exact: true }).waitFor()
  await pager.getByRole('button', { name: '下一页', exact: true }).click()
  await waitForList()
  const originalRows = await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.rowKey))
  const originalQuery = Object.fromEntries(new URL(page.url()).searchParams)
  const originalTabs = await tabs.elementHandle()
  const verifyQuery = () => {
    for (const [key, value] of Object.entries(originalQuery)) assert.equal(new URL(page.url()).searchParams.get(key), value, `切换视图保留查询条件 ${key}`)
  }
  await list.focus()
  for (const [key, layout] of [['ArrowRight', 'calendar'], ['ArrowLeft', 'list'], ['End', 'calendar'], ['Home', 'list']]) {
    await page.keyboard.press(key)
    if (layout === 'calendar') await calendar.waitFor()
    else await waitForList()
    const selected = layout === 'calendar' ? calendarTab : list
    const other = layout === 'calendar' ? list : calendarTab
    assert.equal(await selected.getAttribute('aria-selected'), 'true', `${key} 选中对应视图`)
    assert.equal(await selected.getAttribute('tabindex'), '0')
    assert.equal(await other.getAttribute('tabindex'), '-1')
    assert(await selected.evaluate((node) => node === document.activeElement), `${key} 将焦点移到选中页签`)
    assert(await originalTabs.evaluate((node) => node.isConnected), '键盘切换保留同一个页签条')
    assert.equal(new URL(page.url()).searchParams.get('layout'), layout === 'calendar' ? 'calendar' : null)
    verifyQuery()
  }
  await originalTabs.dispose()
  await page.keyboard.press('Tab')
  assert.equal(await tabs.evaluate((node) => node.contains(document.activeElement)), false, 'Tab 键离开页签组，不重复停在未选中项')
  await list.focus()
  const focus = await list.evaluate((node) => ({ visible: node.matches(':focus-visible'), style: getComputedStyle(node).outlineStyle, width: parseFloat(getComputedStyle(node).outlineWidth) }))
  assert(focus.visible && focus.style !== 'none' && focus.width > 0, `键盘焦点可见：${JSON.stringify(focus)}`)
  await calendarTab.click()
  await calendar.waitFor()
  const calendarURL = page.url()
  await page.reload()
  await calendar.waitFor()
  assert.equal(page.url(), calendarURL, '刷新保留日历视图与列表查询条件')
  assert.equal(await calendarTab.getAttribute('aria-selected'), 'true')
  assert.equal(await search.inputValue(), '核对')
  await list.click()
  await waitForList()
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.rowKey)), originalRows, '日历返回后恢复原页记录')
  const listURL = page.url()
  await page.reload()
  await waitForList()
  assert.equal(page.url(), listURL, '刷新保留列表页码、每页条数和搜索条件')
  assert.equal(await list.getAttribute('aria-selected'), 'true')
  assert.equal(new URL(page.url()).searchParams.get('layout'), null)
  assert.equal(await search.inputValue(), '核对')
  assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.rowKey)), originalRows, '列表刷新后恢复同一页记录')
}

async function verifySeparatedPanels(page, assert) {
  await page.locator('.erp-admin-content').evaluate((node) => { node.scrollTop = 0 })
  const metrics = await page.locator('.erp-work-center-results').evaluate((results) => {
    const region = results.closest('[data-page-table-region]')
    const toolbar = region.querySelector('[data-page-table-toolbar]')
    const toolbarPanel = toolbar.matches('.ant-card') ? toolbar : toolbar.querySelector('.ant-card')
    const toolbarRect = toolbarPanel.getBoundingClientRect()
    const resultsRect = results.getBoundingClientRect()
    const gap = resultsRect.top - toolbarRect.bottom
    const gapElement = document.elementFromPoint(resultsRect.left + resultsRect.width / 2, toolbarRect.bottom + gap / 2)
    return {
      gap,
      expectedGap: parseFloat(getComputedStyle(region).getPropertyValue('--erp-page-gap')),
      gapBackground: getComputedStyle(gapElement).backgroundColor,
      gapInsideCard: Boolean(gapElement.closest('.ant-card')),
      leftDifference: Math.abs(resultsRect.left - toolbarRect.left),
      rightDifference: Math.abs(resultsRect.right - toolbarRect.right),
      borders: [toolbarPanel, results].map((node) => ({
        width: parseFloat(getComputedStyle(node).borderTopWidth),
        radius: parseFloat(getComputedStyle(node).borderTopLeftRadius),
      })),
    }
  })
  assert(metrics.gap > 0 && Math.abs(metrics.gap - metrics.expectedGap) <= 1, `查询与结果沿用业务页间距：${JSON.stringify(metrics)}`)
  assert.equal(metrics.gapInsideCard, false, '分区间隙不应留在同一张卡片内')
  assert.equal(metrics.gapBackground, 'rgba(0, 0, 0, 0)', '分区间隙透出页面底色')
  assert(metrics.leftDifference <= 1 && metrics.rightDifference <= 1, `查询与结果边缘对齐：${JSON.stringify(metrics)}`)
  assert(metrics.borders.every((border) => border.width > 0 && border.radius > 0), '查询与结果分别保留面板边框与圆角')
}

async function verifyStickyTable(page, assert) {
  await page.locator('.erp-work-center-table .ant-table-sticky-holder').waitFor()
  await page.locator('.erp-admin-content').evaluate((node) => { node.scrollTop = 260 })
  await page.waitForFunction(() => {
    const table = document.querySelector('.erp-work-center-table')
    const region = table?.closest('[data-page-table-region]')
    const toolbar = region?.querySelector('[data-page-table-toolbar]')
    const header = table?.querySelector('.ant-table-sticky-holder')
    const cells = [...(table?.querySelector('.ant-table-body tr.ant-table-row')?.cells || [])]
    const headers = [...(header?.querySelectorAll('th') || [])]
    const aligned = cells.length > 0 && cells.length === headers.length && headers.every((node, index) => {
      const heading = node.getBoundingClientRect()
      const cell = cells[index].getBoundingClientRect()
      return Math.abs(heading.left - cell.left) <= 1 && Math.abs(heading.width - cell.width) <= 1
    })
    return header && aligned && Math.abs(header.getBoundingClientRect().top - toolbar.getBoundingClientRect().bottom) <= 1
  })
  const metrics = await page.locator('.erp-work-center-table').evaluate((table) => {
    const region = table.closest('[data-page-table-region]')
    const toolbar = region.querySelector('[data-page-table-toolbar]')
    const root = region.closest('.erp-admin-content')
    const card = table.closest('.erp-work-center-results')
    const body = table.querySelector('.ant-table-body')
    const cells = [...body.querySelector('tr.ant-table-row').cells].map((node) => node.getBoundingClientRect())
    const headers = [...table.querySelectorAll('.ant-table-sticky-holder th')].map((node) => node.getBoundingClientRect())
    return {
      scrollTop: root.scrollTop,
      toolbarTop: toolbar.getBoundingClientRect().top,
      rootTop: root.getBoundingClientRect().top,
      leftGap: table.getBoundingClientRect().left - card.getBoundingClientRect().left,
      rightGap: card.getBoundingClientRect().right - table.getBoundingClientRect().right,
      aligned: headers.length === cells.length && headers.every((header, index) =>
        Math.abs(header.left - cells[index].left) <= 1 && Math.abs(header.width - cells[index].width) <= 1),
      bodyHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      horizontalOverflow: body.scrollWidth - body.clientWidth,
      scrollButtonsInToolbar: Boolean(toolbar.querySelector('[data-table-scroll-toolbar] .app-table-scroll-buttons')),
      overflow: document.documentElement.scrollWidth - innerWidth,
    }
  })
  assert(metrics.scrollTop > 50, JSON.stringify(metrics))
  assert(Math.abs(metrics.toolbarTop - metrics.rootTop) <= 1, JSON.stringify(metrics))
  assert(metrics.leftGap <= 1 && metrics.rightGap <= 1, JSON.stringify(metrics))
  assert(metrics.aligned && metrics.overflow <= 1, JSON.stringify(metrics))
  assert(metrics.bodyScrollHeight <= metrics.bodyHeight + 1, '任务表应沿用页面纵向滚动')
  if (metrics.horizontalOverflow > 1) assert(metrics.scrollButtonsInToolbar, '横向查看按钮应保留在吸顶工具栏内')
}

export function createWorkCenterTableScenarios(deps) {
  const { assert, path, outputDir } = deps
  const base = createDashboardTaskScenarios(deps).find((item) => item.name === 'erp-task-board-desktop')
  const tasks = Array.from({ length: 105 }, (_, index) => ({
    ...base.workflowTaskFixtures[0],
    id: 94000 + index,
    task_code: `STYLE-TABLE-${index}`,
    task_name: `核对出货资料与数量 ${index + 1}`,
    source_no: `SHIP-TABLE-${index}`,
    due_at: null,
  }))
  const taskScenarios = ['tasks-light', 'tasks-dark', 'risk'].map((kind) => ({
    ...base,
    name: `work-center-table-${kind}`,
    path: kind === 'risk' ? '/erp/task-board?view=risk' : '/erp/task-board?mode=todo&lane=actionable',
    themeMode: kind === 'tasks-dark' ? 'dark' : 'light',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    effectiveSession: { ...base.effectiveSession, actions: [...base.effectiveSession.actions, 'erp.workbench.read'] },
    workflowTaskFixtures: kind === 'risk' ? tasks.map((task) => ({ ...task, urge_count: 1 })) : tasks,
    verify: async (page) => {
      const rows = page.locator('.erp-work-center-table tr[data-row-key]')
      await rows.first().waitFor()
      const pager = page.locator('.erp-task-pagination')
      await pager.getByText('第 1-20 条 / 共 105 条', { exact: true }).waitFor()
      assert.equal(await rows.count(), 20)
      await verifySeparatedPanels(page, assert)
      for (const size of [50, 100]) {
        let releaseRead
        const heldRead = new Promise((resolve) => { releaseRead = resolve })
        const delayWorkbenchRead = async (route) => {
          const body = route.request().postDataJSON()
          if (body?.method === 'get_workbench' && body.params?.limit === 50) await heldRead
          return route.fallback()
        }
        const holdRead = kind === 'risk' && size === 50
        if (holdRead) await page.route('**/rpc/workflow', delayWorkbenchRead)
        await pager.locator('.ant-select-selector').click()
        const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content')
        await options.first().waitFor({ state: 'visible' })
        await waitForFiniteAnimations(page, { selector: '.ant-select-dropdown' })
        assert.deepEqual(await options.allTextContents(), ['20 条/页', '50 条/页', '100 条/页'])
        const geometry = await options.evaluateAll((nodes) => nodes.map((node) => ({
          height: node.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
          overflow: node.scrollWidth - node.clientWidth,
        })))
        assert(geometry.every((item) => item.height <= item.lineHeight + 1 && item.overflow <= 1), '页数选项应保持单行')
        const read = page.waitForRequest((request) => {
          if (!request.url().endsWith('/rpc/workflow')) return false
          const body = request.postDataJSON()
          return body?.method === (kind === 'risk' ? 'get_workbench' : 'get_task_board') && body.params.limit === size && body.params.offset === 0
        })
        await page.locator('.ant-select-dropdown:visible').getByText(`${size} 条/页`, { exact: true }).click()
        await read
        if (holdRead) {
          try {
            await pager.getByRole('status').getByText('正在加载任务…', { exact: true }).waitFor()
            assert.equal(await rows.count(), 20, '读取新条数期间保留原页记录')
            assert.equal(await pager.locator('.ant-select-selection-item').innerText(), '20 条/页', '读取期间条数仍对应当前记录')
            assert(await pager.getByRole('button', { name: '下一页', exact: true }).isDisabled())
          } finally {
            releaseRead()
          }
        }
        await pager.getByText(`第 1-${size} 条 / 共 105 条`, { exact: true }).waitFor()
        if (holdRead) await page.unroute('**/rpc/workflow', delayWorkbenchRead)
        await page.waitForFunction((expected) => document.querySelectorAll('.erp-work-center-table tr[data-row-key]').length === expected, size)
        assert.equal(await rows.count(), size)
      }
      await page.screenshot({ path: path.join(outputDir, `work-center-${kind}-100-rows.png`) })
      await pager.getByRole('button', { name: '下一页', exact: true }).click()
      await pager.getByText('第 101-105 条 / 共 105 条', { exact: true }).waitFor()
      assert.equal(await rows.count(), 5)
      assert.equal(await pager.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true)
      await pager.locator('.ant-select-selector').click()
      await page.locator('.ant-select-dropdown:visible').getByText('20 条/页', { exact: true }).click()
      await pager.getByText('第 1-20 条 / 共 105 条', { exact: true }).waitFor()
      assert.equal(await pager.getByRole('button', { name: '上一页', exact: true }).isDisabled(), true)
      if (kind === 'tasks-light' || kind === 'risk') {
        let failNext = true
        const rejectReadOnce = async (route) => {
          const body = route.request().postDataJSON()
          if (failNext && body?.method === (kind === 'risk' ? 'get_workbench' : 'get_task_board') && body.params?.limit === 50) {
            failNext = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: RpcErrorCode.INTERNAL, message: '任务列表暂时无法读取', data: {} } } })
          }
          return route.fallback()
        }
        await page.route('**/rpc/workflow', rejectReadOnce)
        await pager.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('50 条/页', { exact: true }).click()
        await page.locator('.ant-alert').filter({ hasText: kind === 'risk' ? '风险任务加载失败' : '任务管理加载失败' }).waitFor()
        await pager.getByRole('status').getByText('任务加载失败', { exact: true }).waitFor()
        if (kind === 'risk') {
          assert.equal(await rows.count(), 20, '失败保留上次成功读取的记录')
          assert.equal(await pager.locator('.ant-select-selection-item').innerText(), '20 条/页')
        }
        await page.getByRole('button', { name: '重新加载', exact: true }).click()
        await pager.getByText('第 1-50 条 / 共 105 条', { exact: true }).waitFor()
        await page.waitForFunction(() => document.querySelectorAll('.erp-work-center-table tr[data-row-key]').length === 50)
        await page.unroute('**/rpc/workflow', rejectReadOnce)
        await pager.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('20 条/页', { exact: true }).click()
        await pager.getByText('第 1-20 条 / 共 105 条', { exact: true }).waitFor()
      }
      if (kind !== 'risk') {
        const sameRow = await page.locator('.erp-task-board-controls').evaluate((node) => {
          const toggle = node.querySelector('[aria-label="待办显示方式"]').getBoundingClientRect()
          const search = node.querySelector('.erp-business-operation-panel__search').getBoundingClientRect()
          return Math.abs(toggle.y + toggle.height / 2 - search.y - search.height / 2) <= 1
        })
        assert(sameRow, '列表与日历应和搜索同排')
      }
      await verifySeparatedPanels(page, assert)
      await waitForFiniteAnimations(page)
      await page.screenshot({ path: path.join(outputDir, `work-center-table-${kind}-top.png`) })
      await verifyStickyTable(page, assert)
      await page.screenshot({ path: path.join(outputDir, `work-center-table-${kind}-scrolled.png`) })
      await page.setViewportSize({ width: 900, height: 760 })
      await verifySeparatedPanels(page, assert)
      await verifyStickyTable(page, assert)
      await page.locator('.erp-work-center-table .ant-table-body').evaluate((node) => { node.scrollLeft = node.scrollWidth })
      await verifyStickyTable(page, assert)
      await page.setViewportSize({ width: 700, height: 800 })
      await page.locator('.erp-work-center-table .ant-table-sticky-holder').waitFor({ state: 'detached' })
      await verifySeparatedPanels(page, assert)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await page.setViewportSize({ width: 1920, height: 440 })
      await page.locator('.erp-work-center-table .ant-table-sticky-holder').waitFor({ state: 'detached' })
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.locator('.erp-admin-content').evaluate((node) => { node.scrollTop = 0 })
      if (kind !== 'risk') {
        const switchSelector = '[aria-label="待办显示方式"]'
        await verifyMobileNavigationMotion(page, assert, switchSelector, 1)
        await page.locator('.workflow-task-calendar').waitFor()
        await verifySeparatedPanels(page, assert)
        await verifyMobileNavigationMotion(page, assert, switchSelector, 0, true)
        await verifyStickyTable(page, assert)
        await verifyTaskViewKeyboardRecovery(page, assert)
      }
    },
  }))
  const tracking = createTaskTrackingScenarios(deps)[0]
  const progress = createBusinessProgressScenarios(deps)[0]
  const design = createBusinessListStickyScenarios(deps).find((item) => item.name === 'business-list-sticky-design')
  return [
    ...taskScenarios,
    {
      ...tracking,
      name: 'work-center-table-tracking',
      path: '/erp/task-board?tracking=visible',
      beforeNavigate: async (page) => {
        await tracking.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_tracking') return route.fallback()
          const items = Array.from({ length: 45 }, (_, index) => ({
            kind: 'task',
id: 95000 + index,
title: `核对流程资料 ${index + 1}`,
            source_type: 'sales_order',
source_no: `SO-TABLE-${index}`,
status: 'done',
            initiator_name: '业务经办',
initiator_role_key: 'sales',
current_tasks: [],
            process_key: '',
source_id: index + 1,
display_context: null,
            started_at: 1791367200 - index,
updated_at: 1791367300,
completed_at: 1791367300,
            resolution_kind: null,
          }))
          if (params.sort_direction === 'asc') items.reverse()
          return route.fulfill({ json: { jsonrpc: '2.0',
id,
result: { code: 0,
data: {
            items: items.slice(params.offset || 0, (params.offset || 0) + (params.limit || 20)),
            total: items.length,
status_counts: { active: 0, completed: items.length },
            limit: params.limit || 20,
offset: params.offset || 0,
          } } } })
        })
      },
      verify: async (page) => {
        await page.locator('.erp-work-center-table tr[data-row-key]').first().waitFor()
        const header = page.locator('.erp-work-center-table th.ant-table-column-has-sorters:visible').filter({ hasText: '发起时间' }).first()
        for (const [direction, id] of [['ascending', 95044], ['descending', 95000], [null, 95000]]) {
          const read = page.waitForResponse((response) => response.url().endsWith('/rpc/workflow') && response.request().postDataJSON()?.method === 'list_tracking')
          await header.press('Enter')
          const { params } = (await read).request().postDataJSON()
          assert.equal(params.sort_direction, direction ? (direction === 'ascending' ? 'asc' : 'desc') : undefined)
          await page.waitForFunction((key) => document.querySelector('.erp-work-center-table tr[data-row-key]')?.dataset.rowKey === key, `task:${id}`)
          assert.equal(await header.getAttribute('aria-sort'), direction)
        }
        await verifySeparatedPanels(page, assert)
        await page.screenshot({ path: path.join(outputDir, 'work-center-tracking-toolbar.png') })
        const toolbarGeometry = await page.locator('.erp-dashboard-task-board-card').evaluate((node) => {
          const views = node.querySelector('[aria-label="跟踪内容"]').getBoundingClientRect()
          const states = node.querySelector('[aria-label="流转状态"]').getBoundingClientRect()
          const search = node.querySelector('.erp-business-operation-panel__search').getBoundingClientRect()
          return { centers: [views, states, search].map((box) => box.top + box.height / 2), overflow: document.documentElement.scrollWidth - innerWidth }
        })
        assert(Math.max(...toolbarGeometry.centers) - Math.min(...toolbarGeometry.centers) <= 2, `跟踪视图、状态和搜索应在同一排：${JSON.stringify(toolbarGeometry)}`)
        assert(toolbarGeometry.overflow <= 1, JSON.stringify(toolbarGeometry))
        await page.locator('.erp-task-tracking-toolbar').screenshot({ path: path.join(outputDir, 'work-center-tracking-toolbar-detail.png') })
        const tabs = '.erp-task-tracking-views'
        await verifyMobileNavigationMotion(page, assert, tabs, 1)
        await page.locator('.workflow-exceptions__item').first().waitFor()
        await verifySeparatedPanels(page, assert)
        const exceptionGeometry = await page.locator('.erp-task-tracking-toolbar').evaluate((node) => {
          const controls = ['[aria-label="跟踪内容"]', '[aria-label="异常处理状态"]', '.workflow-exceptions__query']
          return controls.map((selector) => { const box = node.querySelector(selector).getBoundingClientRect(); return box.top + box.height / 2 })
        })
        assert(Math.max(...exceptionGeometry) - Math.min(...exceptionGeometry) <= 2, JSON.stringify(exceptionGeometry))
        await page.screenshot({ path: path.join(outputDir, 'work-center-exception-toolbar.png') })
        await verifyMobileNavigationMotion(page, assert, tabs, 0, true)
        await verifyStickyTable(page, assert)
        await page.setViewportSize({ width: 1000, height: 760 })
        await verifyStickyTable(page, assert)
        await page.locator('.erp-work-center-table .ant-table-body').evaluate((node) => { node.scrollLeft = 320 })
        await verifyStickyTable(page, assert)
        await page.locator('.erp-admin-content').evaluate((node) => { node.scrollTop = 0 })
        await verifyMobileNavigationMotion(page, assert, tabs, 1)
        await page.locator('.workflow-exceptions__item').first().waitFor()
        await verifyMobileNavigationMotion(page, assert, tabs, 0, true)
        await page.setViewportSize({ width: 700, height: 800 })
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      },
    },
    {
      ...progress,
      name: 'work-center-table-progress',
      verify: async (page) => {
        await page.locator('.erp-progress-table tbody tr').first().waitFor()
        const table = page.locator('.erp-progress-table')
        await page.locator('.erp-task-pagination').getByRole('button', { name: '下一页' }).click()
        await table.locator('tr[data-progress-order-id="25"]').waitFor()
        await table.getByRole('button', { name: '按订单号升序排列' }).press('Enter')
        await table.locator('tbody tr:first-child[data-progress-order-id="1"]').waitFor()
        const orderHead = table.locator('th').first()
        const headBox = await orderHead.boundingBox()
        await orderHead.click({ position: { x: headBox.width - 6, y: headBox.height / 2 } })
        await table.locator('tbody tr:first-child[data-progress-order-id="25"]').waitFor()
        assert.equal(await table.locator('th[aria-sort="descending"]').count(), 1)
        await table.getByRole('button', { name: '查看进度：SO-0025' }).click()
        const detail = page.getByRole('dialog')
        await detail.getByRole('button', { name: '返回进度', exact: true }).click()
        await table.locator('tbody tr:first-child[data-progress-order-id="25"]').waitFor()
        assert.equal(await table.locator('th[aria-sort="descending"]').count(), 1)
        await table.getByRole('button', { name: '恢复默认排序' }).press('Enter')
        await table.locator('tbody tr:first-child[data-progress-order-id="1"]').waitFor()
        assert.equal(await table.locator('th[aria-sort]').count(), 0)
        await page.setViewportSize({ width: 1440, height: 600 })
        await page.locator('.erp-progress-list').evaluate((node) => { node.scrollTop = node.scrollHeight })
        const metrics = await page.locator('.erp-progress-list').evaluate((node) => ({
          top: node.getBoundingClientRect().top,
          heading: node.querySelector('th').getBoundingClientRect().top,
          scrollTop: node.scrollTop,
        }))
        assert(metrics.scrollTop > 0 && Math.abs(metrics.top - metrics.heading) <= 1, JSON.stringify(metrics))
        await page.getByRole('tab', { name: '生产执行', exact: true }).click()
        await table.getByRole('button', { name: '按计划结束升序排列' }).press('Enter')
        await table.locator('tbody tr:first-child[data-progress-order-id="1"]').waitFor()
        await table.getByRole('button', { name: '按计划结束降序排列' }).press('Enter')
        await table.locator('tbody tr:first-child[data-progress-order-id="24"]').waitFor()
        await page.getByRole('tab', { name: '订单交付', exact: true }).click()
        await table.locator('tbody tr:first-child[data-progress-order-id="1"]').waitFor()
        assert.equal(await table.locator('th[aria-sort]').count(), 0)
        await page.getByRole('tab', { name: '生产执行', exact: true }).click()
        await table.locator('tbody tr:first-child[data-progress-order-id="24"]').waitFor()
        assert.equal(await table.locator('th[aria-sort="descending"]').innerText(), '计划结束')
      },
    },
    {
      ...design,
      name: 'work-center-table-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = page.frameLocator('iframe')
        await frame.getByRole('button', { name: '工作台', exact: true }).click()
        await frame.locator('#dashboard-summary-search').waitFor()
        const submitted = frame.getByRole('button', { name: '提交时间', exact: true })
        const firstRequest = frame.locator('.summary-table tbody tr').first().locator('td').first()
        const original = await firstRequest.textContent()
        await submitted.press('Enter')
        assert.notEqual(await firstRequest.textContent(), original)
        await submitted.press('Enter')
        await submitted.press('Enter')
        assert.equal(await firstRequest.textContent(), original)
        await frame.getByRole('button', { name: '任务管理', exact: true }).click()
        await frame.locator('[data-action="board-mode"][data-value="todo"]').click()
        const toggle = frame.locator('.task-calendar-switch')
        const geometry = await toggle.evaluate((node) => {
          node.dataset.stableControl = 'work-center'
          const row = node.closest('.command-row')
          const search = row?.querySelector('.search')
          return { inToolbar: Boolean(row && search), top: node.getBoundingClientRect().top, searchTop: search?.getBoundingClientRect().top }
        })
        assert(geometry.inToolbar && Math.abs(geometry.top - geometry.searchTop) <= 4, JSON.stringify(geometry))
        assert.equal(await frame.locator('.board-surface').evaluate((node) => getComputedStyle(node).padding), '0px')
        await toggle.getByRole('button', { name: '日历', exact: true }).click()
        await frame.locator('.task-calendar-demo').waitFor()
        assert.equal(await toggle.getAttribute('data-stable-control'), 'work-center')
        assert(await frame.locator('#board-search').isVisible())
        await toggle.getByRole('button', { name: '列表', exact: true }).click()
        await frame.locator('.task-board-table').waitFor()
        assert.equal(await toggle.getAttribute('data-stable-control'), 'work-center')
        const sortButton = frame.locator('[data-action="work-center-sort"][data-scope="tasks"]')
        const taskOrder = () => frame.locator('.task-board-table tbody tr[data-id]').evaluateAll((nodes) => nodes.map((row) => row.dataset.id))
        const originalOrder = await taskOrder()
        await sortButton.press('Enter')
        assert.equal(await sortButton.locator('..').getAttribute('aria-sort'), 'ascending')
        const earliest = await taskOrder()
        await sortButton.press('Enter')
        assert.equal(await sortButton.locator('..').getAttribute('aria-sort'), 'descending')
        assert.notDeepEqual(await taskOrder(), earliest)
        await sortButton.press('Enter')
        assert.deepEqual(await taskOrder(), originalOrder)
        await frame.locator('[data-action="board-mode"][data-value="tracking"]').click()
        const trackingViews = frame.locator('.task-tracking-tabs')
        await trackingViews.evaluate((node) => { node.dataset.stableControl = 'tracking-toolbar' })
        for (const kind of ['tracking', 'exceptions', 'tracking']) {
          await trackingViews.locator(`[data-value="${kind}"]`).click()
          const centers = await frame.locator('.tracking-command-row').evaluate((node) => (
            ['.task-tracking-tabs', '[role="group"]', '.search'].map((selector) => {
              const box = node.querySelector(selector).getBoundingClientRect()
              return box.top + box.height / 2
            })
          ))
          assert(Math.max(...centers) - Math.min(...centers) <= 2, JSON.stringify(centers))
          assert.equal(await trackingViews.getAttribute('data-stable-control'), 'tracking-toolbar')
        }
      },
    },
  ]
}
