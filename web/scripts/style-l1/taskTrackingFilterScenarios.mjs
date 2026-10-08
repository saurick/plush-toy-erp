import assert from 'node:assert/strict'
import path from 'node:path'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createTaskTrackingFilterScenarios({ outputDir, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }) {
  return ['light', 'dark'].map((themeMode) => ({
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
        const items = rows.filter((row) => {
          const day = new Date(row.started_at * 1000 + 8 * 3600000).toISOString().slice(0, 10)
          return (!p.status || row.status === p.status) && (!p.source_type || row.source_type === p.source_type) && (!p.owner_role_key || row.current_tasks.some((task) => task.owner_role_key === p.owner_role_key)) && (!p.attention || p.attention === 'overdue' && row.id === 801) && (!p.keyword || `${row.source_no} ${row.id === 801 ? '长耳小熊 STYLE-801' : ''}`.includes(p.keyword)) && (!p.date_from || day >= p.date_from) && (!p.date_to || day <= p.date_to)
        })
        const limit = p.limit ?? 20
        const offset = p.offset ?? 0
        await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data: { items: items.slice(offset, offset + limit), total: items.length, limit, offset } } } })
      })
    },
    verify: async (page) => {
      const panel = page.locator('.erp-workflow-tracking-panel')
      await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
      const navigation = page.locator('.erp-task-management-scope')
      assert.deepEqual((await navigation.locator('.ant-segmented-item').allTextContents()).map((text) => text.trim()), ['待我处理', '待我审批', '全部任务', '流程跟踪'])
      const trackingNavigation = page.locator('.erp-task-tracking-scope')
      assert.deepEqual((await trackingNavigation.locator('.ant-segmented-item').allTextContents()).map((text) => text.trim()), ['我发起的', '我参与的'])
      assert.equal(await page.getByRole('combobox', { name: '跟踪范围', exact: true }).count(), 0)
      const scopeBox = await trackingNavigation.boundingBox()
      const controlsBox = await panel.locator('.erp-workflow-tracking-controls').boundingBox()
      assert.ok(scopeBox.y + scopeBox.height <= controlsBox.y, 'tracking tabs sit above the search toolbar')
      await page.screenshot({ path: path.join(outputDir, `task-tracking-tabs-${themeMode}-4k.png`) })
      const filterTrigger = panel.getByRole('button', { name: /筛选/ })
      const filterDialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
      const openFilters = async () => {
        if (!await filterDialog.isVisible()) await filterTrigger.click()
        await filterDialog.waitFor()
      }
      const closeFilters = async () => {
        if (await filterDialog.isVisible()) {
          await filterDialog.getByRole('button', { name: '完成', exact: true }).click()
          await filterDialog.waitFor({ state: 'hidden' })
        }
      }
      const list = panel.locator('.ant-table-wrapper')
      const before = await list.boundingBox()
      await openFilters()
      await waitForFiniteAnimations(page)
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
        if (label === '跟踪范围') {
          await closeFilters()
          await trackingNavigation.getByText(option, { exact: true }).click()
          return
        }
        await openFilters()
        await page.locator(`.ant-select[aria-label="${label}"]`).click()
        await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click()
      }
      await change(() => verifyMobileNavigationMotion(page, assert, '.erp-task-tracking-scope', 1), (p) => p.scope === 'participated')
      await change(() => verifyMobileNavigationMotion(page, assert, '.erp-task-tracking-scope', 0, true), (p) => p.scope === 'started')
      const restoredScopeBox = await trackingNavigation.boundingBox()
      assert.ok(Math.abs(restoredScopeBox.x - scopeBox.x) < 1 && Math.abs(restoredScopeBox.y - scopeBox.y) < 1, 'tracking tabs keep their position across scope changes')
      await trackingNavigation.locator('input:checked').focus()
      await change(() => page.keyboard.press('ArrowRight'), (p) => p.scope === 'participated')
      await change(() => page.keyboard.press('ArrowLeft'), (p) => p.scope === 'started')
      assert.equal(await trackingNavigation.locator('input:checked').evaluate((node) => node === document.activeElement), true)
      await change(() => choose('流转状态', '进行中'), (p) => p.status === 'active')
      await change(() => choose('当前岗位', '工程'), (p) => p.owner_role_key === 'engineering' && p.status === 'active')
      const search = panel.getByPlaceholder('单号 / 任务 / 产品 / 款号')
      await closeFilters()
      await change(() => search.fill('小熊'), (p) => p.keyword === '小熊')
      await change(() => choose('跟踪范围', '我参与的'), (p) => p.scope === 'participated' && !p.status && !p.owner_role_key && !p.keyword)
      await change(() => choose('流转状态', '已结束'), (p) => p.scope === 'participated' && p.status === 'completed')
      await change(() => choose('单据类型', '采购订单'), (p) => p.source_type === 'purchase_order')
      await panel.getByText('PO-FILTER-802', { exact: true }).waitFor()
      await change(() => choose('跟踪范围', '我发起的'), (p) => p.scope === 'started' && p.status === 'active' && p.owner_role_key === 'engineering' && p.keyword === '小熊' && !p.source_type)
      assert.equal(await search.inputValue(), '小熊')
      await openFilters()
      await change(() => filterDialog.getByRole('button', { name: /清空筛选/ }).click(), (p) => !p.status && !p.owner_role_key && !p.keyword)
      await change(() => choose('关注事项', '只看受阻'), (p) => p.attention === 'blocked')
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
        const tabBoxes = await trackingNavigation.locator('.ant-segmented-item').evaluateAll((nodes) => nodes.map((node) => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, height: node.getBoundingClientRect().height })))
        assert.ok(tabBoxes.every((box) => box.left >= 0 && box.right <= width + 1 && box.height >= 44), JSON.stringify(tabBoxes))
        await openFilters()
        await waitForFiniteAnimations(page)
        const popupBox = await filterDialog.boundingBox()
        assert.ok(popupBox.x >= 0 && popupBox.x + popupBox.width <= width + 1, JSON.stringify(popupBox))
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
      await change(() => trackingNavigation.getByText('我参与的', { exact: true }).evaluate((node) => node.click()), (p) => p.scope === 'participated' && p.status === 'completed')
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
      await verifyMobileNavigationMotion(page, assert, '.erp-task-management-scope .ant-segmented', 0, true)
      assert.equal(await taskSearch.inputValue(), '订单甲')
      await taskSearch.fill('尚未提交的任务搜索')
      await navigation.getByText('全部任务', { exact: true }).evaluate((node) => node.click())
      await page.waitForTimeout(400)
      assert.equal(await taskSearch.inputValue(), '业务乙')
      assert.equal(new URL(page.url()).searchParams.get('q'), '业务乙', 'an earlier view cannot submit search into the active view')
      const taskFilters = page.locator('.erp-task-board-filters').getByRole('button', { name: /筛选/ })
      const taskList = page.locator('.erp-task-board-lanes')
      await page.locator('.erp-task-board-lanes[aria-busy="false"]').waitFor()
      const taskBefore = await taskList.boundingBox()
      await taskFilters.click()
      await filterDialog.waitFor()
      await waitForFiniteAnimations(page)
      const taskAfter = await taskList.boundingBox()
      assert.ok(Math.abs(taskBefore.y - taskAfter.y) < 1, 'opening filters must not push task lanes down')
      await page.screenshot({ path: path.join(outputDir, `task-board-filters-${themeMode}-4k.png`) })
      await page.keyboard.press('Escape')
      await filterDialog.waitFor({ state: 'hidden' })
      assert.equal(await taskFilters.evaluate((node) => node === document.activeElement), true)
      await change(() => page.goto(new URL('/erp/task-board?tracking=visible&track_source_type=sales_order&track_source_id=1', page.url()).href), (p) => p.scope === 'visible' && p.source_type === 'sales_order' && p.source_id === 1)
      await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
      assert.deepEqual((await trackingNavigation.locator('.ant-segmented-item').allTextContents()).map((text) => text.trim()), ['我发起的', '我参与的', '相关流程'])
      assert.equal(await trackingNavigation.getByRole('radio', { name: '相关流程', exact: true }).isChecked(), true)
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
}
