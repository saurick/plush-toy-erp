import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { ShipmentFinanceReleaseStatus, ShipmentStatus } from '../../src/common/consts/statuses.generated.mjs'
import fs from 'node:fs/promises'
import { assertTaskCopy } from './taskCopyAssertions.mjs'
import { createTaskFusedFlowScenarios } from './taskFusedFlowScenarios.mjs'
import { createTaskDetailVariantScenarios } from './taskDetailVariantScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createMobileTaskConsistencyScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  const save = async (page, name) => {
    await waitForFiniteAnimations(page)
    await page.waitForFunction(() => ![...document.querySelectorAll('.ant-message-notice')].some((node) => node.getBoundingClientRect().height > 0))
    await page.screenshot({ path: path.join(outputDir, `${name}.png`) })
  }
  const check = async (page, name) => {
    await assertNoHorizontalOverflow(page, name)
    const metrics = await page.evaluate(() => {
      const screen = document.querySelector('[data-testid="mobile-task-detail-screen"], [data-testid="mobile-task-action-screen"], [data-testid="mobile-task-receipt-screen"]')
      const footer = screen.querySelector('.mobile-role-action-bar').getBoundingClientRect()
      const buttons = [...screen.querySelectorAll('.mobile-role-action-bar button, .mobile-task-flow-step, .mobile-detail-header button')].filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[hidden], [aria-hidden="true"], .erp-business-selection-action-bar__measure'))
      return { footerButtons: [...screen.querySelectorAll('.mobile-role-action-bar button')].filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.closest('[hidden], [aria-hidden="true"], .erp-business-selection-action-bar__measure')).map((node) => ({ top: node.getBoundingClientRect().top, height: node.getBoundingClientRect().height })), width: innerWidth, overflow: screen.scrollWidth - screen.clientWidth, footerBottom: footer.bottom, viewportHeight: innerHeight, buttons: buttons.map((node) => ({ label: node.getAttribute('aria-label') || node.textContent, height: node.getBoundingClientRect().height, width: node.getBoundingClientRect().width })) }
    })
    assert.ok(metrics.overflow <= 1 && Math.abs(metrics.footerBottom - metrics.viewportHeight) <= 1, JSON.stringify(metrics))
    assert.ok(metrics.buttons.every((button) => button.height >= 44 && button.width >= 43), JSON.stringify(metrics))
    assert.ok(Math.max(...metrics.footerButtons.map((item) => item.top)) - Math.min(...metrics.footerButtons.map((item) => item.top)) <= 1 && Math.max(...metrics.footerButtons.map((item) => item.height)) - Math.min(...metrics.footerButtons.map((item) => item.height)) <= 1, `底部按钮同高同基线：${JSON.stringify(metrics.footerButtons)}`)
    assert.equal(await page.getByTestId('mobile-task-flow-steps').locator('[data-step-key]').count(), 3)
    assert.match(new URL(page.url()).pathname, /^\/m\/[a-z_]+\/tasks$/u)
    await fs.writeFile(path.join(outputDir, `${name}-metrics.json`), JSON.stringify(metrics, null, 2))
  }
  const scenarios = [390, 320].flatMap((width) => {
    const base = createTaskFusedFlowScenarios(deps).find((item) => item.name === 'task-fused-flow-mobile-light')
    const shipment = createTaskDetailVariantScenarios(deps).find((item) => item.name === 'task-detail-shipment-mobile-light')
    shipment.workflowTaskFixtures[0].source_no = 'SHIP-STYLE-L1'
    shipment.workflowTaskFixtures[0].display_context.source_no = 'SHIP-STYLE-L1'
    const task = base.workflowTaskFixtures[0]
    return [
      {
        ...base,
        name: `mobile-task-consistency-${width}`,
        viewport: { width, height: 844 },
        deviceScaleFactor: 2,
        beforeNavigate: async (page) => {
          await base.beforeNavigate(page)
          await page.route('**/rpc/workflow', async (route) => {
            const { id, method } = route.request().postDataJSON()
            if (method !== 'list_task_events') return route.fallback()
            const items = [
              { id: 3, event_type: 'status_changed', actor_display_name: '演示业务', actor_role_key: 'engineering', created_at: 1790085800, task_version: 3, from_status_key: 'ready', to_status_key: 'blocked', reason: '客户仍在确认颜色与包装，已联系业务岗位跟进。' },
              { id: 2, event_type: 'status_changed', actor_display_name: '工程核对员', actor_role_key: 'engineering', created_at: 1790085700, task_version: 2, from_status_key: 'blocked', to_status_key: 'ready', reason: '补齐规格资料。' },
              { id: 1, event_type: 'created', actor_display_name: '演示业务', actor_role_key: 'sales', created_at: task.created_at, task_version: 1, to_status_key: 'ready' },
            ]
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { items, truncated: false } } } })
          })
        },
        verify: async (page) => {
          await page.getByTestId('mobile-role-nav-tasks').click()
          await page.getByTestId('mobile-role-filter-risk').click()
          await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).waitFor()
          const filter = page.getByTestId('mobile-task-list-filter-trigger')
          assert.equal(await filter.innerText(), '筛选', '风险快捷条件只在原胶囊表达')
          assert.equal(await filter.getAttribute('data-active'), 'false')
          await save(page, `filters-${width}`)
          await filter.click()
          const panel = page.getByRole('dialog', { name: '筛选任务', exact: true })
          await panel.waitFor()
          await panel.getByRole('group', { name: '任务状态筛选', exact: true }).getByRole('button', { name: /^阻塞/u }).click()
          assert.match(await filter.innerText(), /阻塞/u)
          await save(page, `filter-options-${width}`)
          await panel.getByRole('button', { name: '关闭筛选', exact: true }).click()
          await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
          const detail = page.getByTestId('mobile-task-detail-screen')
          await detail.locator('.workflow-task-info-card[aria-label="任务信息"]').waitFor()
          await check(page, `detail-${width}`)
          await save(page, `detail-${width}`)
          await assertTaskCopy(page, detail.getByRole('button', { name: '复制单据编号', exact: true }), 'SO-FUSED-001')
          await assertTaskCopy(page, detail.getByRole('button', { name: '复制产品编号', exact: true }), '27007#')
          const copyMenu = detail.getByRole('button', { name: '更多操作', exact: true })
          await copyMenu.click()
          await page.getByRole('menuitem', { name: '复制任务信息', exact: true }).waitFor()
          await page.getByRole('menuitem', { name: '复制任务信息', exact: true }).press('Escape')
          assert.equal(await copyMenu.getAttribute('aria-expanded'), 'false')
          const records = detail.getByTestId('workflow-task-event-trail')
          await records.getByText('客户仍在确认颜色与包装，已联系业务岗位跟进。', { exact: false }).waitFor()
          await records.getByText('演示业务', { exact: true }).first().waitFor()
          await records.scrollIntoViewIfNeeded()
          await save(page, `records-${width}`)
          const audit = records.getByRole('button', { name: /查看.*记录详情/u }).first()
          await audit.click()
          await page.getByText('任务版本', { exact: true }).waitFor()
          await save(page, `record-audit-${width}`)
          await audit.press('Escape')
          await records.locator('summary').click()
          assert.equal(await records.locator('details').getAttribute('open'), null)
          await records.locator('summary').click()
          await detail.locator('.mobile-role-action-bar').getByRole('button', { name: '选择处理方式', exact: true }).click()
          const action = page.getByTestId('mobile-task-action-screen')
          const resume = action.locator('[data-action-key="resume"]')
          if (await resume.count()) await resume.click()
          await action.locator('textarea').fill('规格已经核对，恢复办理。')
          await check(page, `action-${width}`)
          await save(page, `action-${width}`)
          await action.getByTestId('mobile-task-attachment-action').click()
          const attachments = page.getByRole('dialog', { name: '任务附件', exact: true })
          await attachments.waitFor()
          await attachments.getByRole('button', { name: /关闭/u }).first().press('Escape')
          await attachments.waitFor({ state: 'hidden' })
          assert.equal(await action.isVisible(), true, '关闭附件保留当前办理步骤和意见')
          assert.equal(await action.locator('textarea').inputValue(), '规格已经核对，恢复办理。')
          await action.locator('button[type="submit"]').click()
          const receipt = page.getByTestId('mobile-task-receipt-screen')
          await receipt.waitFor()
          assert.equal(await receipt.locator('[data-outcome="unknown"]').count(), 1)
          await check(page, `receipt-${width}`)
          await save(page, `receipt-${width}`)
          await receipt.locator('[data-step-key="process"]').click()
          assert.equal(await action.locator('textarea').inputValue(), '规格已经核对，恢复办理。')
          await assertNoHorizontalOverflow(page, `mobile-task-consistency-${width}`)
        },
      },
      {
        ...shipment,
        name: `mobile-task-source-consistency-${width}`,
        viewport: { width, height: 844 },
        deviceScaleFactor: 2,
        verify: async (page) => {
          await page.getByTestId('mobile-role-nav-tasks').click()
          await page.getByRole('button', { name: '查看准备并办理发货详情', exact: true }).click()
          const detail = page.getByTestId('mobile-task-detail-screen')
          await detail.getByRole('button', { name: '填写办理表单', exact: true }).click()
          await page.getByTestId('mobile-task-business-source').waitFor()
          const action = page.getByTestId('mobile-task-action-screen')
          const footer = action.locator('.mobile-role-action-bar')
          await footer.getByRole('group', { name: '本次业务操作', exact: true }).waitFor()
          assert.equal(await action.locator('.ant-descriptions, .erp-business-module-current-action').count(), 0)
          assert.equal(await footer.locator('.erp-business-selection-action-bar__compact-visible button').count(), 1)
          assert.equal(await footer.locator('.erp-business-selection-action-bar__compact-visible button').isEnabled(), true)
          await page.getByTestId('mobile-task-business-source').getByText('待确认', { exact: true }).waitFor()
          await footer.getByTestId('mobile-task-attachment-action').click()
          const attachments = page.getByRole('dialog', { name: '任务附件', exact: true })
          await attachments.waitFor()
          await attachments.getByRole('button', { name: /关闭/u }).first().press('Escape')
          await attachments.waitFor({ state: 'hidden' })
          assert.equal(await action.isVisible(), true, '关闭附件只恢复办理页')
          await check(page, `source-action-${width}`)
          await save(page, `source-action-${width}`)
          const missing = page.getByTestId('mobile-task-business-source').locator('details')
          await missing.locator('summary').click()
          await missing.getByText('实际运费', { exact: true }).waitFor()
          await save(page, `source-missing-${width}`)
          await missing.locator('summary').click()
          await footer.getByRole('button', { name: /^更多操作，共/u }).click()
          const more = page.getByRole('toolbar', { name: '更多操作', exact: true })
          await more.waitFor()
          await save(page, `source-menu-${width}`)
          assert.equal(await more.getByRole('button', { name: /编辑草稿/u }).count(), 0, '缺少可编辑的正式状态时不开放编辑')
          await more.press('Escape')
          await assertNoHorizontalOverflow(page, `mobile-task-source-consistency-${width}`)
        },
      },
    ]
  })
  return [...scenarios, ...[390, 320].map((width) => {
    const base = createTaskFusedFlowScenarios(deps).find((item) => item.name === 'task-fused-flow-mobile-light')
    const sourceNo = 'SO-20261019-CUSTOMER-ORDER-0000000000000001'
    const productNo = 'PRODUCT-20261019-COLOUR-LONG-00000000000001'
    const task = { ...base.workflowTaskFixtures[0], assignee_id: 1, due_at: 1790085600, discovery: { assignee_name: '工程资料核对负责人', path: '协同跟进 / 样品资料确认 / 长分类路径按需查看' }, source_no: sourceNo, display_context: { available: true, source_no: sourceNo, items: [{ kind: 'product', name: '星星挂兔 · 长名称颜色包装规格逐项核对', code: productNo }] } }
    return {
      ...base,
      name: `mobile-task-consistency-boundaries-${width}`,
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'list_task_events') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { items: [], truncated: false } } } })
        })
      },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByTestId('mobile-role-filter-risk').click()
        await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.getByText('工程资料核对负责人', { exact: false }).waitFor()
        await detail.getByText('暂无本任务处理记录', { exact: true }).waitFor()
        await assertTaskCopy(page, detail.getByRole('button', { name: '复制单据编号', exact: true }), sourceNo)
        await assertTaskCopy(page, detail.getByRole('button', { name: '复制产品编号', exact: true }), productNo)
        await check(page, `long-detail-${width}`)
        await save(page, `long-detail-${width}`)
        const info = detail.locator('.workflow-task-info-card__details')
        await info.locator('summary').click()
        await info.getByRole('button', { name: '查看分类详情', exact: true }).click()
        await page.locator('.workflow-task-classification__path').getByText(task.discovery.path, { exact: true }).waitFor()
        await save(page, `classification-${width}`)
        await info.getByRole('button', { name: '查看分类详情', exact: true }).press('Escape')
        await info.locator('summary').click()
        await detail.getByRole('button', { name: '返回任务列表', exact: true }).click()
        assert.equal(await page.getByTestId('mobile-role-filter-risk').getAttribute('aria-pressed'), 'true')
        await assertNoHorizontalOverflow(page, `long-list-${width}`)
      },
    }
  }), ...[390, 320].map((width) => {
    const base = createTaskDetailVariantScenarios(deps).find((item) => item.name === 'task-detail-shipment-mobile-light')
    const record = { id: 1, shipment_no: 'SHIP-EDIT-20261019-000000001', status: ShipmentStatus.DRAFT, finance_release_status: ShipmentFinanceReleaseStatus.PENDING, finance_release_version: 1, sales_order_id: 1, customer_id: 1, customer_snapshot: '演示客户', note: '核对包装', planned_ship_at: 1792512000, items: [{ id: 1, line_no: 1, product_id: 1, product_name_snapshot: '演示产品', unit: '只', warehouse_id: 1, lot_id: 1, quantity: '10' }] }
    base.workflowTaskFixtures[0].source_no = record.shipment_no
    base.workflowTaskFixtures[0].display_context.source_no = record.shipment_no
    return {
      ...base,
      name: `mobile-task-editor-consistency-${width}`,
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (!['get_shipment', 'list_shipments'].includes(method)) return route.fallback()
          const data = method === 'get_shipment' ? { shipment: record } : stylePaginatedRpcData([record], 'shipments', params)
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
        })
      },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByRole('button', { name: '查看准备并办理发货详情', exact: true }).click()
        await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '填写办理表单', exact: true }).click()
        const action = page.getByTestId('mobile-task-action-screen')
        const footer = action.locator('.mobile-role-action-bar')
        await page.getByTestId('mobile-task-business-source').getByText(record.shipment_no, { exact: true }).waitFor()
          await footer.getByRole('button', { name: /^更多操作，共/u }).click()
          await page.getByRole('button', { name: /编辑草稿/u }).click()
          const editor = action.locator('[data-business-form-page="true"]:visible')
          await editor.waitFor()
          await footer.getByRole('button', { name: '保存', exact: true }).waitFor()
          assert.equal(await footer.locator('.mobile-task-business-primary').isVisible(), false)
          await editor.getByRole('textbox', { name: /^备注/u }).fill('核对包装和运费口径，尚未保存。')
          await footer.getByText('有未保存修改', { exact: true }).waitFor()
          await check(page, `source-editor-${width}`)
          await save(page, `source-editor-${width}`)
          await action.locator('[data-step-key="detail"]').click()
          await page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' }).getByRole('button', { name: '继续编辑', exact: true }).click()
          assert.equal(await editor.getByRole('textbox', { name: /^备注/u }).inputValue(), '核对包装和运费口径，尚未保存。')
          await footer.getByRole('button', { name: '返回办理', exact: true }).click()
          await page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' }).getByRole('button', { name: '放弃修改', exact: true }).click()
          await editor.waitFor({ state: 'hidden' })
          await footer.locator('.erp-business-selection-action-bar__compact-visible button').waitFor()
          assert.equal(new URL(page.url()).pathname, '/m/sales/tasks')
      },
    }
  })]

}
