import { createWorkflowSourceTaskFixture } from './workflowSourceTaskFixtures.mjs'

export function createWorkflowSourceTaskScenarios({
  assert,
  expectHeading,
  expectText,
  gotoScenarioPath,
  outputDir,
  path,
  waitForPath,
}) {
  const submittedReleaseTask = createWorkflowSourceTaskFixture({
    taskGroup: 'shipment_release',
    sourceID: 1,
    taskID: 96_001,
    sourceNo: 'SHIP-STYLE-L1',
    taskName: '确认出货放行 SHIP-STYLE-L1',
    intentHash: '1'.repeat(64),
    payload: {
      shipment_no: 'SHIP-STYLE-L1',
      alert_type: 'shipment_pending',
      shipment_execution_required: true,
      inventory_out_deferred: true,
    },
  })
  const forgedReleaseTask = createWorkflowSourceTaskFixture({
    taskGroup: 'shipment_release',
    sourceID: 2,
    taskID: 96_002,
    sourceNo: 'SHIP-FORGED-L1',
    taskName: '坏合同出货放行任务',
    intentHash: '2'.repeat(64),
  })
  forgedReleaseTask.payload.source_task_contract = 'workflow.source-task/v0'

  return [
    {
      name: 'shipment-release-source-handoff-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-shipment-release-source-handoff',
        configHash: 'style-l1-shipment-release-source-handoff-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['shipments', 'global-dashboard', 'task-board'],
        actions: [
          'shipment.read',
          'shipment.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      workflowTaskFixtures: [forgedReleaseTask],
      workflowSourceTaskProducerFixtures: [submittedReleaseTask],
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        const shipmentRow = page
          .locator('.erp-business-data-table-card .ant-table-row')
          .filter({ hasText: 'SHIP-STYLE-L1' })
          .first()
        await shipmentRow.click()

        const submitButton = page.getByRole('button', {
          name: '提交出货放行',
          exact: true,
        })
        await submitButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await submitButton.isDisabled(),
          false,
          '草稿出货单且有权限时应允许提交出货放行'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'shipment-release-source-handoff-selected.png'
          ),
          fullPage: true,
        })

        await submitButton.click()
        const confirmButton = page.getByRole('button', {
          name: '提交放行',
          exact: true,
        })
        await confirmButton.waitFor({ state: 'visible', timeout: 10_000 })
        await confirmButton.click()
        await expectText(page, '出货放行已提交，仓库待办已生成')

        const sourceTaskReadback = await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'shipment-release-source-handoff-readback',
              method: 'list_tasks',
              params: {
                task_group: 'shipment_release',
                source_type: 'shipments',
                source_id: 1,
                limit: 10,
                offset: 0,
              },
            }),
          })
          return response.json()
        })
        const sourceTask = sourceTaskReadback?.result?.data?.tasks?.[0]
        assert.deepEqual(
          {
            taskCode: sourceTask?.task_code,
            taskGroup: sourceTask?.task_group,
            sourceType: sourceTask?.source_type,
            sourceID: sourceTask?.source_id,
            ownerRoleKey: sourceTask?.owner_role_key,
            contract: sourceTask?.payload?.source_task_contract,
            producer: sourceTask?.payload?.source_task_producer,
            shipmentID: sourceTask?.payload?.shipment_id,
            intentHash: sourceTask?.payload?.source_task_intent_hash,
          },
          {
            taskCode: 'source-shipment-release-1',
            taskGroup: 'shipment_release',
            sourceType: 'shipments',
            sourceID: 1,
            ownerRoleKey: 'warehouse',
            contract: 'workflow.source-task/v1',
            producer: 'shipment.submit_release',
            shipmentID: 1,
            intentHash: '1'.repeat(64),
          },
          '提交后读回应保留完整且精确的来源任务合同'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'shipment-release-source-handoff-submitted.png'
          ),
          fullPage: true,
        })

        await gotoScenarioPath(page, '/erp/dashboard', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '工作台')
        await page.getByRole('button', { name: '刷新当前页' }).click()
        const riskQueue = page.getByRole('button', {
          name: /阻塞\/逾期，\d+ 项，先补原因/u,
        })
        if ((await riskQueue.count()) > 0) {
          await riskQueue.click()
        }
        await expectText(page, '确认出货放行 SHIP-STYLE-L1')
        await expectText(page, '坏合同出货放行任务')

        const workbench = page.locator('.erp-workbench-command-card')
        const validRow = workbench
          .locator('.erp-workbench-queue-panel .ant-table-row')
          .filter({ hasText: '确认出货放行 SHIP-STYLE-L1' })
          .first()
        await validRow.click()
        const detailPanel = workbench.locator('.erp-workbench-task-detail')
        await detailPanel
          .getByText('确认出货放行 SHIP-STYLE-L1', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const validSourceEntry = detailPanel.getByRole('button', {
          name: '查看相关单据',
          exact: true,
        })
        await validSourceEntry.waitFor({ state: 'visible', timeout: 10_000 })
        await validSourceEntry.click()
        await waitForPath(page, '/erp/warehouse/shipments')
        assert.match(
          page.url(),
          /[?&]shipment_id=1(?:&|$)/u,
          `可信来源任务应精确返回出货单：${page.url()}`
        )
        assert.match(
          page.url(),
          /[?&]link_source=task-dashboard(?:&|$)/u,
          `可信来源任务应保留任务看板来源：${page.url()}`
        )

        await gotoScenarioPath(page, '/erp/dashboard', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '工作台')
        await page.getByRole('button', { name: '刷新当前页' }).click()
        const riskQueueAfterReturn = page.getByRole('button', {
          name: /阻塞\/逾期，\d+ 项，先补原因/u,
        })
        if ((await riskQueueAfterReturn.count()) > 0) {
          await riskQueueAfterReturn.click()
        }
        const forgedRow = page
          .locator('.erp-workbench-queue-panel .ant-table-row')
          .filter({ hasText: '坏合同出货放行任务' })
          .first()
        await forgedRow.click()
        const forgedDetail = page.locator('.erp-workbench-task-detail')
        await forgedDetail
          .getByText('坏合同出货放行任务', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await forgedDetail
            .getByRole('button', {
              name: '查看相关单据',
              exact: true,
            })
            .count(),
          0,
          '坏合同来源任务不得显示精确返回业务单据入口'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'shipment-release-source-handoff-bad-contract.png'
          ),
          fullPage: true,
        })
      },
    },
  ]
}
