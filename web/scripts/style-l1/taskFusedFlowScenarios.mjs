import { PermissionCode } from '../../src/common/consts/permissions.generated.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

export function createTaskFusedFlowScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession }) {
  return ['desktop', 'mobile'].flatMap((surface) => ['light', 'dark'].map((themeMode) => {
    const mobile = surface === 'mobile'
    const actions = Object.values(PermissionCode)
    const task = { id: 99001, version: 1, task_code: 'TASK-FUSED-001', task_name: '核对订单资料', task_group: 'material_check', owner_role_key: 'engineering', task_status_key: 'blocked', blocked_reason: '规格待核对', source_type: 'sales_order', source_id: 1, source_no: 'SO-FUSED-001', created_at: 1790085600, required_capability_key: 'workflow.task.complete', display_context: { available: true, source_no: 'SO-FUSED-001', items: [{ kind: 'product', name: '海盐企鹅', code: '27007#' }] } }
    let attempts = 0
    let failSubmit = true
    let applied = 0
    return {
      name: `task-fused-flow-${surface}-${themeMode}`,
path: mobile ? '/m/engineering/tasks' : '/erp/task-board?mode=todo',
auth: 'admin',
customerKey: 'yoyoosun',
themeMode,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
deviceScaleFactor: mobile ? 1 : 2,
      adminProfile: { id: 1, username: 'style-l1-fused', is_super_admin: true, permissions: actions, roles: [{ role_key: 'engineering' }], menus: [{ key: 'task-board', path: '/erp/task-board' }] },
      effectiveSession: { ...customerRuntimeEffectiveSession, actions, roles: ['engineering'], workPools: ['engineering'], workflow_visible_owner_role_keys_by_capability: Object.fromEntries(actions.filter((key) => key.startsWith('workflow.task.')).map((key) => [key, ['engineering']])) },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        attempts = 0; failSubmit = true; applied = 0
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'resume_task_action') {
            attempts++
            if (failSubmit) return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: RpcErrorCode.INTERNAL, msg: '模拟暂时失败' } } })
            applied++
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        if (mobile) await page.getByTestId('mobile-role-bottom-nav').getByRole('tab', { name: /^任务管理/u }).click()
        await page.getByRole('button', { name: '查看核对订单资料详情', exact: true }).click()
        const surfaceRoot = mobile ? page.getByTestId('mobile-task-detail-screen') : page.locator('.erp-task-action-drawer')
        const steps = surfaceRoot.locator(mobile ? '.mobile-task-flow-step' : '.erp-task-action-drawer__step')
        assert.equal(await steps.count(), 3)
        assert.equal(await steps.last().isEnabled(), false)
        await surfaceRoot.locator('.workflow-task-info-card[aria-label="任务信息"]').waitFor()
        assert.equal(await surfaceRoot.getByRole('button', { name: '复制任务信息', exact: true }).count(), 0)
        const enter = async () => surfaceRoot.locator(mobile ? '.mobile-role-action-bar' : '.ant-drawer-footer').getByRole('button', { name: '选择处理方式', exact: true }).click()
        await enter()
        const action = mobile ? page.getByTestId('mobile-task-action-screen') : surfaceRoot.locator('#erp-task-action-step-action')
        if (mobile) {
          const resume = action.locator('[data-action-key="resume"]')
          if (await resume.count()) await resume.click()
        } else await action.getByRole('radio', { name: /解除阻塞|恢复/u }).click()
        const reason = action.locator('textarea')
        await reason.fill('规格已经核对，恢复办理。')
        if (mobile) await action.locator('.mobile-task-flow-steps [data-step-key="detail"]').click()
        else await surfaceRoot.getByRole('tab', { name: /核对任务/u }).click()
        await enter()
        assert.equal(await reason.inputValue(), '规格已经核对，恢复办理。', '返回核对任务后保留未提交意见')
        if (!mobile) await surfaceRoot.getByRole('button', { name: '核对并确认', exact: true }).click()
        const submit = mobile ? action.locator('button[type="submit"]') : surfaceRoot.locator('.ant-drawer-footer').getByRole('button', { name: /提交解除阻塞|确认恢复|解除阻塞/u })
        await submit.click()
        await page.waitForFunction(() => !document.querySelector('[data-testid="mobile-task-action-screen"][aria-busy="true"], .erp-task-action-drawer__body[aria-busy="true"]'))
        assert.ok(attempts >= 1)
        assert.equal(applied, 0)
        failSubmit = false
        if (mobile) {
          const failedReceipt = page.getByTestId('mobile-task-receipt-screen')
          await failedReceipt.waitFor()
          assert.equal(await failedReceipt.locator('[data-outcome="unknown"]').count(), 1, '服务暂时失败时保留待确认回执')
          await failedReceipt.locator('[data-step-key="process"]').click()
        } else await surfaceRoot.getByRole('button', { name: '上一步', exact: true }).click()
        assert.equal(await reason.inputValue(), '规格已经核对，恢复办理。', '提交失败保留本次意见')
        if (!mobile) await surfaceRoot.getByRole('button', { name: '核对并确认', exact: true }).click()
        await submit.click()
        const receipt = mobile ? page.getByTestId('mobile-task-receipt-screen') : surfaceRoot.getByTestId('workflow-task-action-receipt')
        await receipt.waitFor()
        assert.equal(applied, 1, '只在显式重试后成功办理一次')
        assert.match(await receipt.innerText(), /恢复|解除|已/u)
        if (mobile) assert.ok(new URL(page.url()).pathname.startsWith('/m/engineering/'))
        await page.screenshot({ path: path.resolve(outputDir, `task-fused-flow-${surface}-${themeMode}-receipt.png`) })
        await page.mouse.move(8, mobile ? 832 : 1068)
        await page.waitForFunction(() => ![...document.querySelectorAll('.ant-message-notice')].some((node) => node.getBoundingClientRect().height > 0))
        if (mobile) await receipt.locator('[data-step-key="detail"]').click()
        else await surfaceRoot.getByRole('button', { name: '回看任务', exact: true }).click()
        await surfaceRoot.locator('.workflow-task-info-card[aria-label="任务信息"]').waitFor()
        if (mobile) await surfaceRoot.locator('[data-step-key="result"]').click()
        else await surfaceRoot.getByRole('button', { name: '查看结果回执', exact: true }).click()
        await receipt.waitFor()
        assert.equal(applied, 1, '回看任务和结果不会再次提交')
      },
    }
  }))
}
