import { createTaskBusinessReturnScenarios } from './taskBusinessReturnScenarios.mjs'
import { createProductionTaskHandlingScenarios } from './productionTaskHandlingScenarios.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'

export function createMobileTaskBusinessScenarios(deps) {
  const { assert, assertNoHorizontalOverflow, outputDir, path } = deps
  const base = createTaskBusinessReturnScenarios(deps).find((item) => item.name === 'task-business-return-mobile')
  const task = base.workflowTaskFixtures[0]
  const open = async (page, taskName = task.task_name) => {
    const card = page.locator('.erp-task-card').filter({ hasText: taskName })
    await clickTaskCardContent(card, card.getByText(taskName, { exact: true }))
    await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '办理业务', exact: true }).click()
    await page.getByTestId('mobile-task-business-screen').waitFor()
    assert.equal(new URL(page.url()).pathname.includes('/tasks/'), true)
    assert.equal(await page.locator('.erp-admin-layout').count(), 0)
    assert.equal(await page.getByTestId('mobile-task-flow-steps').locator('[data-step-key]').count(), 3)
  }
  return [
    {
      ...base,
      name: 'mobile-task-business-production-packaging',
      verify: async (page) => {
        await open(page)
        const dialog = page.getByRole('dialog').filter({ hasText: task.source_no })
        await dialog.waitFor()
        assert.equal(await dialog.count(), 1)
        await dialog.getByLabel('包装版本', { exact: true }).fill('彩盒与唛头已核对')
        await dialog.getByRole('button', { name: '确认办理', exact: true }).click()
        await dialog.getByText('包材要求已确认', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: '办完返回原任务', exact: true }).click()
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.getByText('已完成', { exact: true }).first().waitFor()
        assert.equal(new URL(page.url()).pathname, '/m/sales/tasks')
        await assertNoHorizontalOverflow(page, 'mobile-task-production-business-return')
        await page.screenshot({ path: path.join(outputDir, 'mobile-task-production-business-return.png') })
      },
    },
    {
      ...base,
      name: 'mobile-task-business-source-mismatch',
      verify: async (page) => {
        await open(page)
        const dialog = page.getByRole('dialog').filter({ hasText: task.source_no })
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await page.evaluate(() => {
          const url = new URL(window.location.href)
          url.searchParams.set('production_order_id', '72')
          const state = window.history.state
          window.history.replaceState({ ...state, usr: { ...state.usr, workflowTaskNavigation: { ...state.usr.workflowTaskNavigation, entryPath: `${url.pathname}${url.search}` } } }, '', url)
          window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
        })
        await page.getByText('此单据与当前任务不匹配，请返回原任务。', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-production-orders-page').count(), 0)
        assert.equal(await page.getByRole('dialog').count(), 0)
        await assertNoHorizontalOverflow(page, 'mobile-task-source-mismatch')
      },
    },
    {
      ...base,
      name: 'mobile-task-business-completed-source',
      workflowTaskFixtures: [{ ...task, task_status_key: 'done' }],
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByLabel('任务状态', { exact: true }).getByText('已办', { exact: true }).click()
        const card = page.locator('.erp-task-card').filter({ hasText: task.task_name })
        await clickTaskCardContent(card, card.getByText(task.task_name, { exact: true }))
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.getByText('已完成', { exact: true }).first().waitFor()
        assert.equal(await detail.getByRole('button', { name: '选择处理方式', exact: true }).count(), 0)
        await detail.getByRole('button', { name: '办理业务', exact: true }).click()
        await page.getByTestId('mobile-task-business-source').waitFor()
        assert.equal(await page.getByTestId('mobile-task-business-source').getAttribute('data-record-id'), '71')
        await assertNoHorizontalOverflow(page, 'mobile-completed-source-access')
      },
    },
    ...createMobileQualityScenario(deps, open),
  ]
}

function createMobileQualityScenario(deps, open) {
  const base = createProductionTaskHandlingScenarios(deps).find((item) => item.name === 'production-task-quality-direct-focus')
  const task = base.workflowTaskFixtures[0]
  const permission = 'mobile.quality.access'
  return [{
    ...base,
    name: 'mobile-task-business-quality-submit-reject',
    path: '/m/quality/tasks',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    adminProfile: { ...base.adminProfile, permissions: [...base.adminProfile.permissions, permission] },
    effectiveSession: { ...base.effectiveSession, actions: [...base.effectiveSession.actions, permission] },
    verify: async (page) => {
      await open(page, task.task_name)
      const focus = page.getByRole('dialog', { name: '办理本次质检', exact: true })
      await focus.waitFor()
      await focus.getByRole('button', { name: '提交质检', exact: true }).click()
      await focus.getByRole('button', { name: '判定不合格', exact: true }).click()
      const decision = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '确认不合格', exact: true }) })
      await decision.waitFor()
      await decision.getByRole('button', { name: '确认不合格', exact: true }).click()
      deps.assert.equal(await decision.locator('.ant-form-item-has-error').count() > 0, true)
      await deps.assertNoHorizontalOverflow(page, 'mobile-task-quality-invalid-decision')
      await page.screenshot({ path: deps.path.join(deps.outputDir, 'mobile-task-quality-decision-validation.png') })
    },
  }]
}
