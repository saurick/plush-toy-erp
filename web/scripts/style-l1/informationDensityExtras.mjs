import { openUIDesignMobileTasks } from './devUIDesignNavigation.mjs'
import { captureInformationDensityHelp, createInformationDensityScenarios } from './informationDensityScenarios.mjs'

export function createInformationDensityExtras(deps) {
  const { assert, outputDir, path, assertNoHorizontalOverflow } = deps
  const base = createInformationDensityScenarios(deps).find(s => s.name === 'information-density-mobile-390')
  const end = { ...base.workflowTaskFixtures[0], id: 99023, task_name: '包装交期已核对', task_status_key: 'done', completed_at: 1792200000 }
  return [
    {
      ...base, name: 'information-density-mobile-list-states',
      workflowTaskFixtures: [...base.workflowTaskFixtures, end],
      verify: async (page) => {
        page.setDefaultTimeout(15000)
        const nav = page.getByTestId('mobile-role-bottom-nav')
        await nav.getByRole('tab', { name: /^任务管理/u }).click()
        await page.getByRole('tab', { name: /^已办/u }).click()
        await page.getByRole('button', { name: '查看包装交期已核对处理结果', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'tasks-done-mobile-390.png'), animations: 'disabled' })
        await nav.getByRole('tab', { name: /^风险/u }).click()
        await page.getByRole('button', { name: '查看核对订单资料详情', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'tasks-risk-mobile-390.png'), animations: 'disabled' })
        await page.getByTestId('mobile-role-risk-filter-notice').click()
        await page.getByRole('button', { name: '查看核对包装交期详情', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'tasks-overdue-mobile-390.png'), animations: 'disabled' })
        await assertNoHorizontalOverflow(page, 'information-density-mobile-list-states')
      },
    },
    ...[
      ['sales', '/erp/sales/project-orders/sales-orders'],
      ['outsourcing', '/erp/purchase/processing-contracts'],
      ['inventory', '/erp/warehouse/inventory'],
      ['quality', '/erp/production/quality-inspections'],
    ].map(([key, route]) => ({
      name: `information-density-details-${key}`, path: route, auth: 'admin', themeMode: 'light',
      effectiveSession: { ...deps.customerRuntimeEffectiveSession, actions: base.effectiveSession.actions },
      viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
      verify: async (page) => {
        page.setDefaultTimeout(15000)
        const row = page.locator('.ant-table-tbody tr[data-row-key]').first()
        await row.waitFor()
        await row.click()
        if (key === 'inventory') await row.locator('td').last().dblclick()
        else {
          const view = page.getByRole('button', { name: /查看详情/u })
          if (!await view.isVisible()) await page.getByRole('button', { name: /^更多操作/u }).click()
          await page.getByRole('button', { name: /查看详情/u }).last().click()
        }
        const dialog = page.locator('.erp-business-details-modal:visible')
        await dialog.waitFor()
        await page.screenshot({ path: path.join(outputDir, `business-details-${key}-desktop.png`), animations: 'disabled' })
        await dialog.screenshot({ path: path.join(outputDir, `business-details-${key}-desktop-region.png`), animations: 'disabled' })
        assert.equal(await dialog.getByRole('button', { name: /^保存$/u }).count(), 0)
        await captureInformationDensityHelp({ page, trigger: dialog.locator('.ant-modal-title .erp-business-inline-help-trigger'), key: `business-details-${key}-help-desktop`, expected: key === 'inventory' ? '当前弹窗只用于库存查询和追溯' : key === 'quality' ? '当前质检单的来源、批次、检验状态和判定结果' : '草稿且具备编辑权限时', assert, outputDir, path })
        await dialog.getByRole('button', { name: /^关\s*闭$/u }).click()
      },
    })),
    ...[390, 320].map(width => ({
      name: `information-density-design-mobile-${width}`, path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
      verify: async (page) => {
        page.setDefaultTimeout(15000)
        await page.getByRole('heading', { name: 'UI 交互设计', exact: true }).waitFor()
        await page.getByRole('button', { name: /全屏预览/u }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await openUIDesignMobileTasks(frame)
        await page.setViewportSize({ width, height: 844 })
        await frame.locator('[data-action="mobile-open-task"][data-id="M02"]').waitFor()
        await page.screenshot({ path: path.join(outputDir, `formal-design-list-mobile-${width}.png`), animations: 'disabled' })
        await frame.locator('[data-action="mobile-open-task"][data-id="M02"]').click()
        assert.equal(await frame.locator('.rm-steps button').count(), 3)
        await page.screenshot({ path: path.join(outputDir, `formal-design-detail-mobile-${width}.png`), animations: 'disabled' })
        const information = frame.locator('.rm-section .task-information').first()
        if (await information.count()) {
          await information.locator('summary').click()
          assert.match(await information.innerText(), /订单履约/u)
          await page.screenshot({ path: path.join(outputDir, `formal-design-info-expanded-mobile-${width}.png`), animations: 'disabled' })
          await information.locator('summary').click()
        }
        await frame.locator('[data-action="mobile-open-process"]').click()
        assert.deepEqual(await frame.locator('.rm-choice-list').first().locator('strong').allTextContents(), ['解除阻塞', '催办'])
        await page.screenshot({ path: path.join(outputDir, `formal-design-action-mobile-${width}.png`), animations: 'disabled' })
        const help = frame.locator('.rm-mobile-field .task-information')
        if (await help.count()) {
          await help.locator('summary').click()
          assert.ok((await help.locator('p').innerText()).length > 0)
          await page.screenshot({ path: path.join(outputDir, `formal-design-action-help-mobile-${width}.png`), animations: 'disabled' })
        }
        await assertNoHorizontalOverflow(page, `information-density-design-mobile-${width}`)
      },
    })),
    {
      name: 'information-density-design', path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
      verify: async (page) => {
        page.setDefaultTimeout(15000)
        await page.getByRole('heading', { name: 'UI 交互设计', exact: true }).waitFor()
        await page.getByRole('button', { name: /全屏预览/u }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('button[data-action="open-task"][data-id="T06"]').waitFor()
        await frame.locator('button[data-action="open-task"][data-id="T06"]').click()
        const detail = frame.locator('.drawer:visible')
        await detail.waitFor()
        assert.equal(await detail.locator('.task-steps button').count(), 3)
        await page.screenshot({ path: path.join(outputDir, 'formal-design-task-detail-desktop.png'), animations: 'disabled' })
        const info = detail.locator('.task-information')
        await info.locator('summary').click()
        assert.match(await info.innerText(), /进入岗位/u)
        await detail.locator('.task-step[data-value="2"]').click()
        assert.ok(await detail.locator('.action-choice').count() > 0)
        await page.screenshot({ path: path.join(outputDir, 'formal-design-task-action-desktop.png'), animations: 'disabled' })
      },
    },
  ]
}
