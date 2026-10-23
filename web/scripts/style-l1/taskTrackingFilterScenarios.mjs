import assert from 'node:assert/strict'
import path from 'node:path'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createTaskTrackingFilterScenarios({ outputDir, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }) {
  const scenarios = ['light', 'dark'].map((themeMode) => ({
    name: `task-tracking-filters-${themeMode}`,
    path: '/erp/task-board?tracking=started',
    auth: 'admin',
    themeMode,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    effectiveSession: customerRuntimeEffectiveSession,
    beforeNavigate: async (page) => {
      const now = 1791367200
      const base = { kind: 'process', process_key: 'sales_order_acceptance', title: '', source_type: 'sales_order', source_id: 1, status: 'active', resolution_kind: null, started_at: now, updated_at: now, completed_at: null, initiator_name: '业务小李', initiator_role_key: 'sales', display_context: null, current_tasks: [] }
      const rows = [
        { ...base, id: 801, source_no: 'SO-FILTER-801', display_context: { available: true, source_no: 'SO-FILTER-801', source_line_count: null, items: [{ kind: 'product', name: '长耳小熊', code: 'BEAR-801', style_no: 'STYLE-801', supplier_item_no: '', order_no: '', product_id: 1, image_attachment_id: 0 }] }, current_tasks: [{ task_id: 31, task_name: '工程资料', node_instance_id: 21, owner_role_key: 'engineering', assignee_name: '', status: 'ready', created_at: now, completed_at: null, due_at: now - 60 }] },
        { ...base, id: 802, process_key: 'material_supply', source_type: 'purchase_order', source_no: 'PO-FILTER-802', status: 'completed', completed_at: now, resolution_kind: 'succeeded' },
      ]
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON()
        if (body.method !== 'list_tracking') return route.fallback()
        const p = body.params || {}
        const facets = rows.filter((row) => {
          const day = new Date(row.started_at * 1000 + 8 * 3600000).toISOString().slice(0, 10)
          return (!p.source_type || row.source_type === p.source_type) && (!p.owner_role_key || row.current_tasks.some((task) => task.owner_role_key === p.owner_role_key)) && (!p.attention || p.attention === 'overdue' && row.id === 801) && (!p.keyword || `${row.source_no} ${row.id === 801 ? '长耳小熊 STYLE-801' : ''}`.includes(p.keyword)) && (!p.date_from || day >= p.date_from) && (!p.date_to || day <= p.date_to)
        })
        const status_counts = { active: facets.filter((row) => row.status === 'active').length, completed: facets.filter((row) => row.status === 'completed').length }
        const items = facets.filter((row) => !p.status || row.status === p.status)
        const limit = p.limit ?? 20
        const offset = p.offset ?? 0
        await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data: { items: items.slice(offset, offset + limit), total: items.length, status_counts, limit, offset } } } })
      })
    },
    verify: async (page) => {
      const panel = page.locator('.erp-workflow-tracking-panel')
      await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
      const navigation = page.locator('.erp-task-management-scope')
      assert.deepEqual((await navigation.locator('[role="tab"]').allTextContents()).map((text) => text.trim()), ['待我处理', '待我审批', '全部任务', '流程跟踪'])
      const trackingNavigation = page.locator('.erp-task-tracking-views')
      assert.deepEqual((await trackingNavigation.locator('[role="tab"]').allTextContents()).map((text) => text.trim()), ['流程进度', '异常跟踪'])
      assert.equal(await page.getByRole('combobox', { name: '跟踪范围', exact: true }).count(), 0)
      const scopeBox = await trackingNavigation.boundingBox()
      const controlsBox = await panel.locator('.erp-workflow-tracking-controls').boundingBox()
      assert.ok(scopeBox.y + scopeBox.height <= controlsBox.y, 'tracking tabs sit above the search toolbar')
      await page.screenshot({ path: path.join(outputDir, `task-tracking-tabs-${themeMode}-4k.png`) })
      const filterTrigger = panel.getByRole('button', { name: /^筛选/ })
      const filterDialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const openFilters = async () => {
        await waitForFiniteAnimations(page)
        if (!await filterDialog.isVisible()) await filterTrigger.click()
        await filterDialog.waitFor()
        await waitForFiniteAnimations(page)
      }
      const closeFilters = async () => {
        if (await filterDialog.isVisible()) {
          await filterDialog.getByRole('button', { name: '完成', exact: true }).click()
          await filterDialog.waitFor({ state: 'hidden' })
        }
      }
      const states = panel.getByRole('group', { name: '流转状态', exact: true })
      await states.getByRole('button', { name: '全部状态，共 2 条', exact: true }).waitFor()
      assert.deepEqual(await states.locator('.erp-filter-chip__count').allTextContents(), ['2', '1', '1'])
      const list = panel.locator('.ant-table-wrapper')
      const before = await list.boundingBox()
      await openFilters()
      await waitForFiniteAnimations(page)
      assert.deepEqual(await filterDialog.getByRole('group', { name: '跟踪范围', exact: true }).getByRole('button').allTextContents(), ['相关流程', '我发起的', '我参与的'], '跟踪范围保留具名选项，不将相关流程改写为不限')
      const after = await list.boundingBox()
      assert.ok(Math.abs(before.y - after.y) < 1, 'opening filters must not push the tracking list down')
      await page.keyboard.press('Escape')
      await filterDialog.waitFor({ state: 'hidden' })
      assert.equal(await filterTrigger.evaluate((node) => node === document.activeElement), true)
      const change = async (action, predicate) => {
        const request = page.waitForRequest((r) => {
          if (!r.url().endsWith('/rpc/workflow') || r.method() !== 'POST') return false
          const body = r.postDataJSON()
          return body.method === 'list_tracking' && predicate(body.params)
        })
        const [captured] = await Promise.all([request, action()])
        return captured.postDataJSON().params
      }
      const choose = async (label, option) => {
        if (label === '流转状态') {
          await closeFilters()
          await panel.getByRole('group', { name: label }).getByRole('button', { name: new RegExp(`^${option}，`) }).click()
          return
        }
        await openFilters()
        await waitForFiniteAnimations(page)
        const choices = filterDialog.getByRole('group', { name: label, exact: true })
        if (await choices.count()) {
          await choices.getByRole('button', { name: option, exact: true }).click()
          return
        }
        await page.locator(`.ant-select[aria-label="${label}"]`).click()
        await waitForFiniteAnimations(page)
        await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click()
      }
      await change(() => choose('跟踪范围', '我参与的'), (p) => p.scope === 'participated')
      await change(() => choose('跟踪范围', '我发起的'), (p) => p.scope === 'started')
      const restoredScopeBox = await trackingNavigation.boundingBox()
      assert.ok(Math.abs(restoredScopeBox.y - scopeBox.y) < 1, '切换范围保持追踪视图导航位置')
      await change(() => choose('流转状态', '进行中'), (p) => p.status === 'active')
      await change(() => choose('当前岗位', '工程'), (p) => p.owner_role_key === 'engineering' && p.status === 'active')
      const search = panel.getByPlaceholder('单号 / 任务 / 产品 / 款号')
      await closeFilters()
      await change(() => search.fill('小熊'), (p) => p.keyword === '小熊')
      await change(() => choose('跟踪范围', '我参与的'), (p) => p.scope === 'participated' && !p.status && !p.owner_role_key && !p.keyword)
      await change(() => choose('流转状态', '已结束'), (p) => p.scope === 'participated' && p.status === 'completed')
      await states.getByRole('button', { name: '全部状态，共 2 条', exact: true }).waitFor()
      assert.deepEqual(await states.locator('.erp-filter-chip__count').allTextContents(), ['2', '1', '1'])
      await change(() => choose('单据类型', '采购订单'), (p) => p.source_type === 'purchase_order')
      await panel.getByText('PO-FILTER-802', { exact: true }).waitFor()
      await change(() => choose('跟踪范围', '我发起的'), (p) => p.scope === 'started' && p.status === 'active' && p.owner_role_key === 'engineering' && p.keyword === '小熊' && !p.source_type)
      assert.equal(await search.inputValue(), '小熊')
      await closeFilters()
      const directClear = panel.getByRole('button', { name: '清空筛选', exact: true })
      assert.equal(await directClear.count(), 1, '已有筛选时提供直接清空入口')
      await change(() => directClear.click(), (p) => !p.status && !p.owner_role_key && !p.keyword)
      await waitForFiniteAnimations(page)
      assert.equal(await filterDialog.isVisible(), false, '直接清空不打开筛选面板')
      assert.equal(await directClear.count(), 0, '恢复默认后隐藏清空入口')
      assert.equal(await filterTrigger.innerText(), '筛选')
      assert.equal(await filterTrigger.evaluate((node) => node === document.activeElement), true)
      await page.screenshot({ path: path.join(outputDir, `task-tracking-filter-cleared-${themeMode}-4k.png`) })
      await change(() => choose('关注事项', '只看受阻'), (p) => p.attention === 'blocked')
      assert.equal(await directClear.count(), 1, '重新筛选后恢复清空入口')
      await panel.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
      await change(() => choose('关注事项', '只看逾期'), (p) => p.attention === 'overdue')
      await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
      await waitForFiniteAnimations(page)
      await page.screenshot({ path: path.join(outputDir, `task-tracking-filters-${themeMode}-4k.png`) })
      const dateInput = filterDialog.getByRole('textbox', { name: '开始日期', exact: true })
      await dateInput.click()
      const popup = page.locator('.ant-picker-dropdown:visible')
      assert.equal(await popup.locator('.ant-picker-ok').count(), 0)
      const cell = popup.locator('.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)[title]').nth(10)
      const selected = await cell.getAttribute('title')
      await change(() => cell.click(), (p) => p.date_from === selected)
      await popup.waitFor({ state: 'hidden' })
      await filterDialog.getByRole('textbox', { name: '结束日期', exact: true }).click()
      await change(() => popup.locator(`[title="${selected}"]`).click(), (p) => p.date_from === selected && p.date_to === selected)
      await popup.waitFor({ state: 'hidden' })
      await waitForFiniteAnimations(page)
      await assertNoHorizontalOverflow(page)
      await closeFilters()
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        await waitForFiniteAnimations(page)
        const geometry = await panel.locator('.erp-workflow-tracking-controls').evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth, boxes: [...element.querySelectorAll('input, .ant-btn, .ant-select')].filter((node) => node.getBoundingClientRect().width).map((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })) }))
        assert.ok(geometry.scroll <= geometry.client + 1 && geometry.boxes.every((box) => box.left >= 0 && box.right <= width + 1), JSON.stringify(geometry))
        const filterButtons = await panel.getByRole('group', { name: '筛选操作', exact: true }).getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
          const box = button.getBoundingClientRect()
          return { left: box.left, right: box.right, top: box.top, height: box.height, width: box.width }
        }))
        assert.equal(filterButtons.length, 2)
        assert.ok(filterButtons.every((box) => box.height >= 44 && box.left >= 0 && box.right <= width + 1), JSON.stringify(filterButtons))
        assert.ok(filterButtons[1].width >= 44 && filterButtons[0].right <= filterButtons[1].left + 1 && Math.abs(filterButtons[0].top - filterButtons[1].top) <= 1, JSON.stringify(filterButtons))
        const tabBoxes = await trackingNavigation.locator('[role="tab"]').evaluateAll((nodes) => nodes.map((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, height: node.getBoundingClientRect().height })))
        assert.ok(tabBoxes.every((box) => box.left >= 0 && box.right <= width + 1 && box.height >= 44), JSON.stringify(tabBoxes))
        await openFilters()
        await waitForFiniteAnimations(page)
        const popupBox = await filterDialog.boundingBox()
        assert.ok(popupBox.x >= 0 && popupBox.x + popupBox.width <= width + 1 && popupBox.y >= 0 && popupBox.y + popupBox.height <= 845, JSON.stringify(popupBox))
        await page.screenshot({ path: path.join(outputDir, `task-tracking-filters-${themeMode}-${width}.png`) })
        await closeFilters()
        await assertNoHorizontalOverflow(page)
      }
      await page.setViewportSize({ width: 1920, height: 1080 })
      await openFilters()
      await change(() => filterDialog.getByRole('button', { name: /清空筛选/ }).click(), (p) => !p.date_from && !p.date_to && !p.attention)
      await change(() => choose('跟踪范围', '我参与的'), (p) => p.status === 'completed' && p.source_type === 'purchase_order' && !p.date_from)
      await navigation.getByText('待我处理', { exact: true }).click()
      await change(() => navigation.getByText('流程跟踪', { exact: true }).click(), (p) => p.scope === 'participated' && p.status === 'completed')
      await change(() => choose('跟踪范围', '我发起的'), (p) => p.scope === 'started' && !p.keyword)
      await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
      await search.fill('尚未提交的搜索')
      await change(() => choose('跟踪范围', '我参与的'), (p) => p.scope === 'participated' && p.status === 'completed')
      await page.waitForTimeout(400)
      assert.equal(await search.inputValue(), '', 'a pending search must not move into another tab')
      assert.equal(new URL(page.url()).searchParams.get('track_search_participated'), null)
      await navigation.getByText('待我处理', { exact: true }).click()
      const taskSearch = page.getByPlaceholder('订单 / 产品 / 物料 / 款号')
      await taskSearch.fill('订单甲')
      await taskSearch.press('Enter')
      await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === '订单甲')
      await navigation.getByText('全部任务', { exact: true }).click()
      await page.waitForFunction(() => document.querySelector('input[placeholder="订单 / 产品 / 物料 / 款号"]')?.value === '')
      assert.equal(await taskSearch.inputValue(), '')
      await taskSearch.fill('业务乙')
      await taskSearch.press('Enter')
      await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === '业务乙')
      await navigation.getByText('待我审批', { exact: true }).click()
      await page.waitForFunction(() => document.querySelector('input[placeholder="订单 / 产品 / 物料 / 款号"]')?.value === '')
      assert.equal(await taskSearch.inputValue(), '')
      await verifyMobileNavigationMotion(page, assert, '.erp-task-management-scope .erp-sliding-tab-list', 0, true)
      assert.equal(await taskSearch.inputValue(), '订单甲')
      await taskSearch.fill('尚未提交的任务搜索')
      await navigation.getByText('全部任务', { exact: true }).evaluate((node) => node.click())
      await page.waitForTimeout(400)
      assert.equal(await taskSearch.inputValue(), '业务乙')
      assert.equal(new URL(page.url()).searchParams.get('q'), '业务乙', 'an earlier view cannot submit search into the active view')
      const taskFilters = page.locator('.erp-task-board-filters').getByRole('button', { name: /^筛选/ })
      const taskList = page.locator('.erp-task-board-lanes')
      await page.locator('.erp-task-board-lanes[aria-busy="false"]').waitFor()
      const taskBefore = await taskList.boundingBox()
      await taskFilters.click()
      await filterDialog.waitFor()
      await waitForFiniteAnimations(page)
      const taskAfter = await taskList.boundingBox()
      assert.ok(Math.abs(taskBefore.y - taskAfter.y) < 1, 'opening filters must not push task lanes down')
      await page.screenshot({ path: path.join(outputDir, `task-board-filters-${themeMode}-4k.png`) })
      assert.equal(await filterDialog.getByRole('button', { name: '保存筛选', exact: true }).count(), 0)
      assert.equal(await filterDialog.getByText('本机常用筛选', { exact: true }).count(), 0)
      for (const label of ['业务模块', '业务流程', '业务环节']) assert.equal(await filterDialog.getByText(label, { exact: true }).count(), 0)
      await filterDialog.getByRole('combobox', { name: '办理人', exact: true }).waitFor()
      await filterDialog.getByRole('combobox', { name: '办理人', exact: true }).press('ArrowDown')
      await page.locator('.ant-select-dropdown:visible').getByText('未指定办理人', { exact: true }).click()
      await page.waitForFunction(() => new URLSearchParams(location.search).get('assignee') === 'unassigned')
      await filterDialog.getByRole('button', { name: /清空筛选/ }).click()
      await waitForFiniteAnimations(page)
      assert.equal(await filterDialog.evaluate((node) => node.contains(document.activeElement)), true, '清空筛选后焦点保留在弹层内')
      await page.keyboard.press('Escape')
      await filterDialog.waitFor({ state: 'hidden' })
      assert.equal(await taskFilters.evaluate((node) => node === document.activeElement), true)
      const taskKeyword = await taskSearch.inputValue()
      await taskFilters.click()
      await filterDialog.getByRole('combobox', { name: '办理人', exact: true }).press('ArrowDown')
      await page.locator('.ant-select-dropdown:visible').getByText('未指定办理人', { exact: true }).click()
      await page.waitForFunction(() => new URLSearchParams(location.search).get('assignee') === 'unassigned')
      await page.locator('.erp-task-board-filters').getByRole('button', { name: '清空筛选', exact: true }).click()
      await page.waitForFunction(() => !new URLSearchParams(location.search).has('assignee'))
      await filterDialog.waitFor({ state: 'hidden' })
      assert.equal(await taskSearch.inputValue(), taskKeyword, '直接清空沿用任务页只清条件、保留搜索的合同')
      assert.equal(await taskFilters.evaluate((node) => node === document.activeElement), true)
      await page.goto(new URL('/erp/task-board?mode=all&stage_key=cutting_quality&module_key=quality&chain_key=order_fulfillment', page.url()).href)
      await page.locator('.erp-task-board-lanes[aria-busy="false"]').waitFor()
      await taskFilters.click()
      await filterDialog.getByRole('note', { name: '来源环节范围', exact: true }).waitFor()
      assert.match(await filterDialog.innerText(), /裁片.*颜色与尺寸检验/u)
      assert.equal(new URL(page.url()).searchParams.has('module_key'), false)
      assert.equal(new URL(page.url()).searchParams.has('chain_key'), false)
      await waitForFiniteAnimations(page)
      await page.screenshot({ path: path.join(outputDir, `task-source-stage-${themeMode}-4k.png`) })
      await filterDialog.getByRole('button', { name: '清除环节范围', exact: true }).click()
      await page.waitForFunction(() => !new URLSearchParams(location.search).has('stage_key'))
      await filterDialog.getByRole('note', { name: '来源环节范围', exact: true }).waitFor({ state: 'detached' })
      await change(() => page.goto(new URL('/erp/task-board?tracking=visible&track_source_type=sales_order&track_source_id=1', page.url()).href), (p) => p.scope === 'visible' && p.source_type === 'sales_order' && p.source_id === 1)
      await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
      assert.deepEqual((await trackingNavigation.locator('[role="tab"]').allTextContents()).map((text) => text.trim()), ['流程进度', '异常跟踪'])
      assert.equal(new URL(page.url()).searchParams.get('tracking'), 'visible')
      await page.setViewportSize({ width: 320, height: 844 })
      await waitForFiniteAnimations(page)
      const sourceScopeBox = await trackingNavigation.boundingBox()
      assert.ok(sourceScopeBox.x >= 0 && sourceScopeBox.x + sourceScopeBox.width <= 320, JSON.stringify(sourceScopeBox))
      await change(() => choose('跟踪范围', '我发起的'), (p) => p.scope === 'started' && p.source_id === 1)
      await change(() => choose('跟踪范围', '相关流程'), (p) => p.scope === 'visible' && p.source_id === 1)
      await change(() => panel.getByRole('button', { name: '清除单据范围', exact: true }).click(), (p) => p.scope === 'visible' && !p.source_id && !p.source_type)
      await change(() => choose('跟踪范围', '我参与的'), (p) => p.scope === 'participated' && !p.source_id)
      assert.equal(await trackingNavigation.getByText('相关流程', { exact: true }).count(), 0)
      await assertNoHorizontalOverflow(page)
    },
  }))

  return scenarios.flatMap((scenario) => [scenario, {
    ...scenario,
    name: `task-tracking-source-clear-${scenario.themeMode}`,
    path: '/erp/task-board?tracking=visible&track_source_type=sales_order&track_source_id=1',
    verify: async (page) => {
      const panel = page.locator('.erp-workflow-tracking-panel')
      const controls = page.locator('.erp-workflow-tracking-controls')
      const dialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const change = async (action, predicate) => {
        const request = page.waitForRequest((candidate) => {
          if (!candidate.url().endsWith('/rpc/workflow') || candidate.method() !== 'POST') return false
          const body = candidate.postDataJSON()
          return body.method === 'list_tracking' && predicate(body.params)
        })
        const [captured] = await Promise.all([request, action()])
        return captured.postDataJSON().params
      }
      const chooseScope = async (label) => {
        await waitForFiniteAnimations(page)
        await controls.getByRole('button', { name: /^筛选/ }).click()
        await dialog.waitFor()
        await waitForFiniteAnimations(page)
        const choices = dialog.getByRole('group', { name: '跟踪范围', exact: true })
        assert.deepEqual(await choices.getByRole('button').allTextContents(), ['相关流程', '我发起的', '我参与的'])
        await choices.getByRole('button', { name: label, exact: true }).click()
      }
      await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
      await change(() => chooseScope('我发起的'), (params) => params.scope === 'started' && params.source_type === 'sales_order' && params.source_id === 1)
      await change(() => chooseScope('相关流程'), (params) => params.scope === 'visible' && params.source_type === 'sales_order' && params.source_id === 1)
      await page.setViewportSize({ width: 320, height: 844 })
      await waitForFiniteAnimations(page)
      const clear = controls.getByRole('button', { name: '清除单据范围', exact: true })
      const request = await change(() => clear.click(), (params) => params.scope === 'visible' && !params.source_id && !params.source_type)
      assert.equal(request.offset, 0, '清除单据范围后从第一页查询')
      const params = new URL(page.url()).searchParams
      assert.equal(params.get('tracking'), 'visible')
      assert.equal(params.has('track_source_type'), false)
      assert.equal(params.has('track_source_id'), false)
      await clear.waitFor({ state: 'detached' })
      await panel.getByText('PO-FILTER-802', { exact: true }).waitFor()
      await assertNoHorizontalOverflow(page)
    },
  }])
}
