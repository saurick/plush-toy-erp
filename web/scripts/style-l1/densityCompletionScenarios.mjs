import fs from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { chooseMobileFilterOption } from './mobileTaskListOptionsScenario.mjs'

export function createDensityCompletionScenarios(scenarios, deps) {
  const { assert, outputDir, path, assertNoHorizontalOverflow } = deps
  const baseline = process.env.STYLE_L1_DENSITY_BASELINE === '1'
  const find = (name) => {
    const scenario = scenarios.find((item) => item.name === name)
    assert(scenario, `Missing density completion fixture: ${name}`)
    return scenario
  }
  const capture = async (page, key, region) => {
    await page.evaluate(() => document.fonts.ready)
    await waitForFiniteAnimations(page)
    await page.mouse.move(1, 1)
    await page.screenshot({ path: path.join(outputDir, `completion-${key}.png`), animations: 'disabled' })
    if (region) await region.screenshot({ path: path.join(outputDir, `completion-${key}-region.png`), animations: 'disabled' })
    const metrics = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight, dpr: devicePixelRatio,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      panel: [...document.querySelectorAll('.mobile-filter-panel')].filter((node) => node.getClientRects().length).map((node) => ({
        height: node.getBoundingClientRect().height,
        scrollHeight: node.querySelector('.mobile-filter-fields').scrollHeight,
        text: node.innerText,
        controls: [...node.querySelectorAll('button, .ant-select-selector')].filter((item) => item.getClientRects().length).map((item) => ({ text: item.textContent, height: item.getBoundingClientRect().height })),
      })),
    }))
    await fs.writeFile(path.join(outputDir, `completion-${key}.json`), JSON.stringify(metrics, null, 2))
    await assertNoHorizontalOverflow(page, key)
    if (!baseline) for (const panel of metrics.panel) {
      assert(panel.controls.every((control) => control.height >= 43.5), JSON.stringify(panel))
    }
  }
  const add = (base, key, verify, options = {}) => ({
    ...base, ...options, name: `density-completion-${key}`,
    verify: async (page) => { page.setDefaultTimeout(12000); await verify(page) },
  })
  const result = []
  for (const width of [390, 320]) {
    const phone = { viewport: { width, height: 844 }, deviceScaleFactor: 2, themeMode: width === 320 ? 'dark' : 'light' }
    const tasks = find('mobile-task-list-sort-and-status')
    const sources = ['sales_order', 'purchase_order', 'shipment', 'quality_inspection', 'production_order', 'inventory_operation']
    result.push(add(tasks, `filters-${width}`, async (page) => {
      const trigger = page.getByTestId('mobile-task-list-filter-trigger')
      await trigger.click()
      const panel = page.getByRole('dialog', { name: '筛选任务', exact: true })
      await panel.waitFor()
      await capture(page, `filters-${width}`, panel)
      if (!baseline) {
        const source = panel.getByRole('combobox', { name: '来源单据', exact: true })
        await chooseMobileFilterOption(source, '采购订单')
        await panel.getByRole('group', { name: '任务状态筛选', exact: true }).getByRole('button', { name: /^阻塞/u }).click()
        const sort = panel.getByRole('combobox', { name: '任务排序', exact: true })
        await chooseMobileFilterOption(sort, '截止最早')
        await capture(page, `filters-selected-${width}`, panel)
        await panel.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await page.locator('.erp-mobile-list-item').first().waitFor()
        const ids = await page.locator('.erp-mobile-list-item').evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.mobileTaskId)))
        assert(ids.length > 0 && ids.every((id) => {
          const task = fixtureTasks.find((item) => item.id === id)
          return task?.source_type === 'purchase_order' && task.task_status_key === 'blocked'
        }), `组合筛选结果不正确：${ids}`)
        await trigger.click()
        await panel.getByRole('button', { name: '重置筛选', exact: true }).click()
        assert.equal(await panel.isVisible(), true)
        await panel.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await panel.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement === document.querySelector('[data-testid="mobile-task-list-filter-trigger"]'))
        assert.equal(await trigger.innerText(), '筛选')
        assert.equal(await trigger.evaluate((node) => node === document.activeElement), true)
      }
    }, { ...phone, workflowTaskFixtures: null }))
    const fixtureTasks = tasks.workflowTaskFixtures.map((task, index) => ({ ...task, source_type: sources[index % sources.length], task_status_key: index % 2 ? 'blocked' : 'ready' }))
    result[result.length - 1].workflowTaskFixtures = fixtureTasks

    const history = find('mobile-task-history-filters')
    result.push(add(history, `history-${width}`, async (page) => {
      await page.getByRole('tab', { name: /^已办/u }).click()
      const trigger = page.getByTestId('mobile-history-filter-trigger')
      await trigger.click()
      const panel = page.getByRole('dialog', { name: '筛选已办', exact: true })
      await panel.waitFor()
      await capture(page, `history-${width}`, panel)
      if (!baseline) {
        assert.equal(await panel.getByRole('group', { name: '处理时间筛选', exact: true }).count(), 0)
        await panel.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await page.getByRole('group', { name: '已办快捷筛选', exact: true }).getByRole('button', { name: /^今天/u }).click()
        await trigger.click()
        await panel.getByRole('group', { name: '处理结果筛选', exact: true }).getByRole('button', { name: /^已驳回/u }).click()
        await capture(page, `history-selected-${width}`, panel)
        await panel.getByRole('button', { name: '重置筛选', exact: true }).click()
        await panel.getByRole('button', { name: '关闭筛选', exact: true }).click()
        assert.equal(await trigger.innerText(), '筛选')
        await page.getByRole('group', { name: '已办快捷筛选', exact: true }).getByRole('button', { name: '全部时间', exact: true }).waitFor()
      }
    }, phone))

    const progress = find('mobile-progress-boss')
    result.push(add(progress, `recent-${width}`, async (page) => {
      await page.getByTestId('mobile-role-nav-progress').click()
      await page.getByRole('button', { name: '查看 SO-0001 进度', exact: true }).click()
      const recent = page.getByRole('region', { name: '最近记录', exact: true })
      await recent.getByText('规格和包装已复核。', { exact: false }).waitFor()
      await recent.scrollIntoViewIfNeeded()
      await capture(page, `recent-${width}`, recent)
      if (!baseline) {
        await recent.getByRole('button', { name: /查看.*记录详情/u }).first().click()
        await page.getByText('任务版本', { exact: true }).waitFor()
        await capture(page, `recent-audit-${width}`)
        await recent.getByRole('button', { name: /查看.*记录详情/u }).first().press('Escape')
        await recent.getByText('已阻塞 → 待处理', { exact: false }).waitFor()
      }
    }, {
      ...phone,
      beforeNavigate: async (page) => {
        await progress.beforeNavigate?.(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_task_events') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { items: [{ id: 887, task_id: params.task_id, event_type: 'status_changed', from_status_key: 'blocked', to_status_key: 'ready', actor_display_name: '业务经办人', actor_role_key: 'sales', created_at: 1792501205, task_version: 3, reason: '规格和包装已复核。' }], truncated: false } } } })
        })
      },
    }))

    const flow = find(`mobile-task-consistency-${width}`)
    result.push(add(flow, `receipt-${width}`, async (page) => {
      await page.getByTestId('mobile-role-nav-tasks').click()
      const task = flow.workflowTaskFixtures[0]
      await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      await capture(page, `detail-${width}`)
      if (!baseline) assert.equal(await page.locator('.workflow-task-info-card--business').filter({ hasText: /^\s*$/u }).count(), 0, '无业务摘要时不渲染空卡片')
      await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '选择处理方式', exact: true }).click()
      const action = page.getByTestId('mobile-task-action-screen')
      const resume = action.locator('[data-action-key="resume"]')
      if (await resume.count()) await resume.click()
      await action.locator('textarea').fill('规格已经核对，恢复办理。')
      await action.locator('button[type="submit"]').click()
      const receipt = page.getByTestId('mobile-task-receipt-screen')
      await receipt.waitFor()
      await capture(page, `receipt-${width}`, receipt.getByRole('region', { name: '业务信息', exact: true }))
      assert.equal(await receipt.locator('[data-outcome="unknown"]').count(), 1)
      if (!baseline) {
        await receipt.getByText(/^已知状态：/u).waitFor()
        assert.equal(await receipt.getByText('已知任务状态', { exact: true }).count(), 0)
      }
      await receipt.locator('[data-step-key="process"]').click()
      assert.equal(await action.locator('textarea').inputValue(), '规格已经核对，恢复办理。')
    }, phone))

    const emptyTask = { ...flow.workflowTaskFixtures[0], task_group: 'business_followup', payload: {}, complete_condition: '' }
    result.push(add(flow, `empty-detail-${width}`, async (page) => {
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page.getByRole('button', { name: `查看${emptyTask.task_name}详情`, exact: true }).click()
      const detail = page.getByTestId('mobile-task-detail-screen')
      await detail.getByRole('region', { name: '任务信息', exact: true }).waitFor()
      assert.equal(await detail.locator('.workflow-task-info-card--business').count(), baseline ? 1 : 0)
      await capture(page, `empty-detail-${width}`)
      assert.equal(await detail.getByTestId('mobile-task-flow-steps').locator('[data-step-key]').count(), 3)
      await detail.getByTestId('mobile-task-attachment-action').click()
      const attachments = page.getByRole('dialog', { name: '任务附件', exact: true })
      await attachments.waitFor()
      await attachments.getByRole('button', { name: /关闭/u }).first().press('Escape')
      await attachments.waitFor({ state: 'hidden' })
      await detail.getByRole('button', { name: '选择处理方式', exact: true }).click()
      const action = page.getByTestId('mobile-task-action-screen')
      await action.waitFor()
      await action.locator('[data-step-key="detail"]').click()
      await detail.waitFor()
    }, { ...phone, workflowTaskFixtures: [emptyTask] }))
  }

  const inventory = find('exception-inventory-operation-dark-desktop')
  result.push(add(find('task-fused-flow-desktop-light'), 'desktop-task', async (page) => {
    await page.getByRole('button', { name: '查看核对订单资料详情', exact: true }).click()
    const drawer = page.locator('.erp-task-action-drawer')
    await drawer.getByRole('region', { name: '任务信息', exact: true }).waitFor()
    await capture(page, 'desktop-task', drawer)
    if (!baseline) {
      assert.equal(await drawer.locator('.workflow-task-info-card--business').count(), 0)
      assert.equal(await drawer.locator('.erp-task-action-drawer__step').count(), 3)
    }
  }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }))
  result.push(add(inventory, 'inventory', async (page) => {
    await page.locator('.ant-table-row').first().click()
    await page.locator('button[data-business-action-key="inventory-cycle_count"]:visible').click()
    const form = page.getByRole('dialog', { name: /登记库存盘点/u })
    await form.waitFor()
    await form.getByText(/保存和过账时都会重新核对账面数量/u).waitFor()
    await capture(page, 'inventory-form', form)
    if (!baseline) {
      assert.equal(await form.locator('.ant-alert-info').count(), 0)
      await form.getByRole('button', { name: '查看登记库存盘点说明', exact: true }).click()
      await page.getByText(/从当前选中的库存余额生成/u).waitFor()
      await capture(page, 'inventory-form-help')
      await form.getByRole('button', { name: '查看登记库存盘点说明', exact: true }).press('Escape')
    }
    await form.locator('.ant-modal-footer').getByRole('button', { name: /取消/u }).click()
    await form.waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '库存作业', exact: true }).click()
    const records = page.getByRole('dialog', { name: /库存作业记录/u })
    await records.waitFor()
    await capture(page, 'inventory-records', records)
    if (!baseline) {
      await records.getByText('仅草稿可继续编辑，已提交内容只读。', { exact: true }).waitFor()
      await records.getByRole('button', { name: '查看库存作业记录说明', exact: true }).click()
      await page.getByText(/草稿可由创建人继续编辑/u).waitFor()
      await capture(page, 'inventory-records-help')
    }
  }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }))

  const production = find('production-order-source-material-issue-desktop')
  result.push(add(production, 'production', async (page) => {
    const order = page.getByText('MO-STYLE-L1-20260713', { exact: true }).first()
    await order.click()
    const release = page.getByRole('button', { name: '发布', exact: true })
    await release.waitFor()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((node) => node.textContent === '发布' && !node.disabled))
    await release.click()
    await page.getByRole('button', { name: '确认发布', exact: true }).click()
    await page.getByText('生产订单已发布，排产确认已进入 PMC 待办', { exact: true }).waitFor()
    await order.dblclick()
    const form = page.locator('.erp-business-form-page:visible')
    await form.getByRole('navigation', { name: '表单分区', exact: true }).getByRole('button', { name: '物料需求与领料', exact: true }).click()
    const requirements = form.locator('[data-form-section="物料需求与领料"]')
    await requirements.getByText(/物料需求已按发布时的 BOM 冻结/u).waitFor()
    await capture(page, 'production-requirements', requirements)
    if (!baseline) assert.equal(await requirements.locator('.ant-alert-success').count(), 0)
  }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }))

  const route = find('production-wip-route-execution-desktop')
  result.push(add(route, 'production-route', async (page) => {
    await page.getByText('MO-STYLE-L1-20260713', { exact: true }).first().click()
    const release = page.getByRole('button', { name: '发布', exact: true })
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((node) => node.textContent === '发布' && !node.disabled))
    await release.click()
    await page.getByRole('button', { name: '确认发布', exact: true }).click()
    await page.getByText('生产订单已发布，排产确认已进入 PMC 待办', { exact: true }).waitFor()
    await page.getByRole('button', { name: '工序办理', exact: true }).click()
    const modal = page.getByRole('dialog', { name: /生产工序办理/u })
    await modal.waitFor()
    await modal.getByText('在制批次', { exact: true }).first().waitFor()
    await capture(page, 'production-route', modal)
    if (!baseline) {
      await modal.getByText(/检验与包装完成后才可发货/u).waitFor()
      await modal.getByRole('button', { name: '查看生产工序办理说明', exact: true }).click()
      await page.getByText(/按批次办理布料加工/u).waitFor()
      await capture(page, 'production-route-help')
    }
  }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }))
  return result
}
