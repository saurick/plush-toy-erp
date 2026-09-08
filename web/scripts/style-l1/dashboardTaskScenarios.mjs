import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { assertTaskCopy, clickTaskCardContent } from './taskCopyAssertions.mjs'

export function createDashboardTaskScenarios({
  expectText,
  expectHeading,
  assertTextAbsent,
  assertNoDuplicatedAdminPageTitle,
  assertDashboardMetricInteractionSemantics,
  assertDashboardTaskBoardLayout,
  assertShellRefreshButton,
  assertNoDashboardCenterLocalRefreshButton,
  assert,
  path,
  outputDir,
  expectButton,
  waitForPath,
  assertTaskActionDrawerLayout,
  expectNoButton,
  customerRuntimeEffectiveSession,
  assertNoHorizontalOverflow,
  assertERPThemeMode,
  assertDarkDashboardLinkButtonsUnboxed,
  assertThemeReadable,
  assertDarkThemeContrast,
  assertDarkThemeNeutralInteractions,
}) {
  const assertBusinessDashboardCountStates = async (page, scenarioName) => {
    await page
      .getByRole('button', { name: '查看客户', exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await page.evaluate(() => {
      const sourceItems = Array.from(
        document.querySelectorAll('.erp-business-board-source-item--openable')
      )
      const sourceCount = (label) => {
        const entry = document.querySelector(`[aria-label="查看${label}"]`)
        return String(
          entry
            ?.closest('.erp-business-board-source-item--openable')
            ?.querySelector('.erp-business-board-source-count')?.textContent ||
            ''
        ).trim()
      }
      const laneCounts = Object.fromEntries(
        Array.from(
          document.querySelectorAll('.erp-business-board-alert-item')
        ).map((node) => [
          String(
            node.querySelector('.ant-typography')?.textContent || ''
          ).trim(),
          String(
            node.querySelector('.erp-business-board-alert-count')
              ?.textContent || ''
          ).trim(),
        ])
      )
      return {
        sourceItemCount: sourceItems.length,
        sourceItemsWithEntry: sourceItems.filter((node) =>
          node.querySelector('.erp-business-board-source-entry')
        ).length,
        customer: sourceCount('客户'),
        productionException: sourceCount('生产异常处置'),
        invoice: sourceCount('发票记录'),
        laneCounts,
      }
    })

    assert.equal(
      metrics.sourceItemCount,
      20,
      `${scenarioName} 应展示 20 个独立对象统计: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.sourceItemsWithEntry,
      metrics.sourceItemCount,
      `${scenarioName} 每个对象统计都应有独立入口: ${JSON.stringify(metrics)}`
    )
    assert.equal(metrics.customer, '60')
    assert.equal(metrics.productionException, '20')
    assert.equal(metrics.invoice, '0')
    assert.deepEqual(metrics.laneCounts, {
      阻塞: '27',
      到期提醒: '66',
    })
  }
  return [
    {
      name: 'erp-task-board-desktop',
      path: '/erp/task-board',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-task-board-customer-runtime',
        configHash: 'style-l1-task-board-customer-runtime-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard', 'task-board', 'shipping-release'],
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.approve',
          'workflow.task.assign',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [
            'boss',
            'sales',
            'purchase',
            'engineering',
            'production',
            'warehouse',
            'finance',
            'pmc',
            'quality',
          ],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
          'workflow.task.approve': ['finance'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      workflowTaskFixtures: [
        {
          id: 9101,
          task_code: 'PROC-701-NODE-702-A1',
          task_group: 'shipment_finance_approval',
          task_name: '出货财务审批',
          source_type: 'shipment',
          source_id: 501,
          source_no: 'SHIP-L1-501',
          task_status_key: 'ready',
          owner_role_key: 'finance',
          required_capability_key: 'workflow.task.approve',
          process_instance_id: 701,
          process_node_instance_id: 702,
          process_definition_revision_id: 703,
          version: 1,
          payload: { approval_scope: 'shipment_finance_release' },
        },
      ],
      workflowProcessContextFixtures: [
        {
          taskID: 9101,
          processContext: {
            source: { type: 'shipment', id: 501, no: 'SHIP-L1-501' },
            process_instance: {
              id: 701,
              process_key: 'finished_goods_delivery',
              process_version: 'v1',
              status: 'active',
              started_at: 1_800_000_000,
              completed_at: null,
            },
            linked_node: {
              id: 702,
              process_instance_id: 701,
              node_key: 'shipment_finance_approval',
              node_type: 'approval',
              attempt: 1,
              version: 1,
              status: 'active',
              outcome: '',
            },
            approval_form: null,
            nodes: [
              {
                id: 700,
                process_instance_id: 701,
                node_key: 'finished_goods_quality',
                node_type: 'domain_command',
                attempt: 1,
                version: 1,
                status: 'completed',
                outcome: 'quality_passed',
              },
              {
                id: 702,
                process_instance_id: 701,
                node_key: 'shipment_finance_approval',
                node_type: 'approval',
                attempt: 1,
                version: 1,
                status: 'active',
                outcome: '',
              },
            ],
            current_nodes: [
              {
                id: 702,
                process_instance_id: 701,
                node_key: 'shipment_finance_approval',
                node_type: 'approval',
                attempt: 1,
                version: 1,
                status: 'active',
                outcome: '',
              },
            ],
            current_responsibilities: [
              {
                node_instance_id: 702,
                owner_role_key: 'finance',
              },
            ],
            completed_nodes: [
              {
                id: 700,
                process_instance_id: 701,
                node_key: 'finished_goods_quality',
                node_type: 'domain_command',
                attempt: 1,
                version: 1,
                status: 'completed',
                outcome: 'quality_passed',
              },
            ],
          },
        },
      ],
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, '超级管理员')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '看板中心')
        await expectHeading(page, '任务看板')
        await expectText(page, '常规待办')
        await expectText(page, '阻塞')
        await expectText(page, '到期提醒')
        await expectText(page, '已结束')
        await assertTextAbsent(page, '内部来源')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-task-board-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-task-board-desktop',
          expectTaskCategories: true,
        })
        await assertDashboardTaskBoardLayout(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        for (const width of [1920, 1440, 728, 390, 320]) {
          await page.setViewportSize({ width, height: 960 })
          await assertDashboardTaskBoardLayout(page, {
            scenarioName: `erp-task-board-overview-${width}`,
          })
          await page.screenshot({
            path: path.resolve(
              outputDir,
              `erp-task-board-overview-${width}.png`
            ),
          })
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.locator('.erp-task-board-lane-footer button').first().click()
        await page.getByRole('tab', { name: /已结束/ }).click()
        await page
          .getByRole('tab', { name: /已结束/, selected: true })
          .waitFor()
        await assertTextAbsent(
          page,
          '按产品、单据和任务状态查找需要处理的事项。'
        )
        assert.equal(
          await page
            .getByRole('combobox', { name: '任务分类', exact: true })
            .count(),
          0
        )
        const moreFilters = page
          .locator('.erp-task-board-filters')
          .getByRole('button', { name: /^筛选/ })
        await moreFilters.click()
        const extraFilters = page.getByRole('group', { name: '更多筛选条件' })
        await extraFilters.getByText('全部状态', { exact: true }).click()
        const visibleOptions = page.locator(
          '.ant-select-dropdown:visible .ant-select-item-option'
        )
        await visibleOptions
          .locator('.ant-select-item-option-content')
          .filter({ hasText: '已完成' })
          .waitFor()
        await page.waitForFunction(() => {
          const options = [
            ...document.querySelectorAll(
              '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content'
            ),
          ]
          return (
            options.map((option) => option.textContent).join('|') ===
            '全部状态|退回|撤回|已完成'
          )
        })
        await visibleOptions.filter({ hasText: '已完成' }).click()
        await page.waitForFunction(
          () => new URLSearchParams(location.search).get('status') === 'done'
        )
        await moreFilters.click()
        assert.equal(await extraFilters.count(), 0)
        await page
          .getByRole('button', { name: '清除状态：已完成', exact: true })
          .waitFor()
        await page.getByRole('tab', { name: /阻塞/ }).click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(location.search)
          return params.get('lane') === 'exception' && !params.has('status')
        })
        await moreFilters.click()
        assert.equal(
          await extraFilters
            .getByRole('combobox', { name: '任务状态' })
            .count(),
          0
        )
        await moreFilters.click()
        const layoutSearch = page.getByPlaceholder(
          '订单 / 产品 / 物料 / 款号'
        )
        await layoutSearch.fill('布局验证无匹配任务')
        await layoutSearch.press('Enter')
        await expectText(page, '当前分类暂无匹配任务')
        await page
          .locator('.erp-task-board-controls')
          .getByRole('button', { name: '清空筛选', exact: true })
          .click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(location.search)
          return params.get('lane') === 'exception' && !params.has('q')
        })
        await page
          .getByRole('button', { name: '返回任务概览', exact: true })
          .click()
        await page
          .locator(
            '.erp-task-board-lanes:not(.erp-task-board-lanes--focused)[aria-busy="false"]'
          )
          .waitFor()
        await assertShellRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
          expectVisible: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-task-board-desktop',
        })
        const taskScopeFilter = page.locator('.erp-task-board-scope-filter')
        await expectText(taskScopeFilter, '全部任务')
        await expectText(taskScopeFilter, '待我审批')
        await taskScopeFilter.getByText('待我审批', { exact: true }).click()
        await page.waitForFunction(
          () =>
            new URL(window.location.href).searchParams.get('mode') ===
            'approval'
        )
        await taskScopeFilter
          .locator('.ant-segmented-item-selected')
          .filter({ hasText: '待我审批' })
          .waitFor({ state: 'visible', timeout: 2_000 })
        await expectHeading(page, '任务看板')
        await expectText(page, '待我审批')
        await expectText(page, '出货财务审批')
        await expectText(page, 'SHIP-L1-501')
        const approvalInboxLayout = await page.evaluate(() => {
          const card = document.querySelector('.erp-dashboard-task-board-card')
          const filters = document.querySelector('.erp-task-board-heading')
          const scopeFilter = document.querySelector(
            '.erp-task-board-scope-filter'
          )
          const heading = [...document.querySelectorAll('h1, h2, h3')].find(
            (element) => element.textContent?.trim() === '任务看板'
          )
          const selectedScope = scopeFilter?.querySelector(
            '.ant-segmented-item-selected'
          )
          const cardRect = card?.getBoundingClientRect()
          const filtersRect = filters?.getBoundingClientRect()
          const scopeFilterRect = scopeFilter?.getBoundingClientRect()
          const headingRect = heading?.getBoundingClientRect()
          return {
            cardFits:
              Boolean(card) &&
              Number(card?.scrollWidth || 0) <= Number(card?.clientWidth || 0),
            headingVisible:
              Boolean(cardRect && headingRect) &&
              headingRect.left >= cardRect.left &&
              headingRect.right <= cardRect.right,
            scopeInsideFilters: Boolean(
              filters && scopeFilter && scopeFilter.parentElement === filters
            ),
            scopeFilterVisible:
              Boolean(filtersRect && scopeFilterRect) &&
              scopeFilterRect.left >= filtersRect.left &&
              scopeFilterRect.right <= filtersRect.right,
            selectedScope: selectedScope?.textContent?.trim() || '',
          }
        })
        assert(
          approvalInboxLayout.cardFits &&
            approvalInboxLayout.headingVisible &&
            approvalInboxLayout.scopeInsideFilters &&
            approvalInboxLayout.scopeFilterVisible &&
            approvalInboxLayout.selectedScope === '待我审批',
          `待我审批入口存在溢出或不可见控件: ${JSON.stringify(
            approvalInboxLayout
          )}`
        )
        await page.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-approval-inbox.png'),
        })
        let processContextRequestCount = 0
        const transientProcessContextFailure = async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'get_task_process_context') {
            await route.fallback()
            return
          }
          processContextRequestCount += 1
          if (processContextRequestCount > 1) {
            await route.fallback()
            return
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                code: RpcErrorCode.INTERNAL,
                message: '业务进度暂时不可用',
                data: {},
              },
            }),
          })
        }
        await page.route('**/rpc/workflow', transientProcessContextFailure)
        try {
          await page
            .getByRole('button', { name: '查看出货财务审批详情', exact: true })
            .click()
          await expectText(page, '审批详情')
          await expectText(page, '出货单 · SHIP-L1-501')
          const approvalResponsibility = page.locator(
            '.erp-task-action-drawer__responsibility'
          )
          await expectText(approvalResponsibility, '财务')
          await expectText(approvalResponsibility, '共同待办')
          await assertTextAbsent(page, 'PROC-701-NODE-702-A1')
          await assertTextAbsent(page, '核对审批事项')
          await assertTextAbsent(page, '当前状态')
          await expectText(page, '暂时无法读取业务进度')
          await expectButton(page, '重新读取')
          await assertTextAbsent(page, '系统不会根据任务文案猜测流程节点')
          await page.waitForFunction(() => {
            const wrapper = document.querySelector(
              '.ant-drawer-content-wrapper'
            )
            const rect = wrapper?.getBoundingClientRect()
            return Boolean(
              rect && rect.left >= 0 && rect.right <= window.innerWidth
            )
          })
          await page.screenshot({
            path: path.resolve(
              outputDir,
              'erp-task-board-approval-detail-retry.png'
            ),
          })
          await page.getByRole('button', { name: '重新读取' }).click()
          await expectText(page, '出货财务放行')
          assert(
            processContextRequestCount >= 2,
            `业务进度重新读取没有发起第二次请求: ${processContextRequestCount}`
          )
        } finally {
          await page.unroute('**/rpc/workflow', transientProcessContextFailure)
        }
        await expectText(page, '本任务处理记录')
        await expectText(page, '等待审批人核对来源单据与放行条件')
        await expectText(page, '业务进度')
        await expectText(page, '出货财务放行')
        await expectText(page, '流程状态')
        await expectText(page, '办理中')
        const taskEventTrail = page.getByTestId('workflow-task-event-trail')
        await taskEventTrail.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(taskEventTrail, '审批已发起')
        assert(
          (await taskEventTrail.getByText('完整审批链').count()) === 0,
          '本任务处理记录不应常驻显示完整审批链说明'
        )
        const taskEventTrailMetrics = await taskEventTrail.evaluate(
          (element) => ({
            itemCount: element.querySelectorAll(
              '.workflow-task-event-trail__item'
            ).length,
            responsibilityCount: element.querySelectorAll(
              '.workflow-task-event-trail__responsibility > div'
            ).length,
            overflowX: element.scrollWidth - element.clientWidth,
          })
        )
        assert(
          taskEventTrailMetrics.itemCount === 1 &&
            taskEventTrailMetrics.responsibilityCount === 0 &&
            taskEventTrailMetrics.overflowX <= 1,
          `任务抽屉处理记录状态或布局不完整: ${JSON.stringify(
            taskEventTrailMetrics
          )}`
        )
        await taskEventTrail.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-task-event-trail.png'),
        })
        const executionTrail = page.getByTestId('workflow-process-stage')
        await executionTrail.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(executionTrail, '执行轨迹')
        await expectText(executionTrail, '成品质检')
        await expectText(executionTrail, '出货财务审批')
        const executionTrailMetrics = await executionTrail.evaluate(
          (element) => {
            const items = [
              ...element.querySelectorAll('.workflow-process-stage__item'),
            ]
            const geometry = items.map((item, index) => {
              const marker = item.querySelector(
                '.workflow-process-stage__marker'
              )
              const content = item.querySelector(
                '.workflow-process-stage__content'
              )
              const itemRect = item.getBoundingClientRect()
              const markerRect = marker?.getBoundingClientRect()
              const contentRect = content?.getBoundingClientRect()
              const connectorStyle = window.getComputedStyle(item, '::after')
              const connectorTop =
                itemRect.top +
                Number.parseFloat(connectorStyle.top || '0') +
                Number.parseFloat(connectorStyle.height || '0') / 2
              const markerCenter = markerRect
                ? markerRect.top + markerRect.height / 2
                : Number.NaN

              return {
                connectorAligned:
                  index === items.length - 1 ||
                  Math.abs(connectorTop - markerCenter) <= 1,
                connectorClearsContent:
                  index === items.length - 1 ||
                  Boolean(contentRect && connectorTop < contentRect.top - 1),
                contentBelowMarker: Boolean(
                  markerRect &&
                    contentRect &&
                    contentRect.top >= markerRect.bottom + 4
                ),
              }
            })

            return {
              currentCount: element.querySelectorAll('[aria-current="step"]')
                .length,
              linkedCount: element.querySelectorAll('[data-linked-task="true"]')
                .length,
              completedCount: element.querySelectorAll(
                '.workflow-process-stage__item--completed'
              ).length,
              itemCount: items.length,
              connectorAlignedCount: geometry.filter(
                (item) => item.connectorAligned
              ).length,
              connectorClearCount: geometry.filter(
                (item) => item.connectorClearsContent
              ).length,
              contentBelowMarkerCount: geometry.filter(
                (item) => item.contentBelowMarker
              ).length,
            }
          }
        )
        assert(
          executionTrailMetrics.currentCount === 1 &&
            executionTrailMetrics.linkedCount === 1 &&
            executionTrailMetrics.completedCount === 1 &&
            executionTrailMetrics.connectorAlignedCount ===
              executionTrailMetrics.itemCount &&
            executionTrailMetrics.connectorClearCount ===
              executionTrailMetrics.itemCount &&
            executionTrailMetrics.contentBelowMarkerCount ===
              executionTrailMetrics.itemCount,
          `任务抽屉执行轨迹状态不完整: ${JSON.stringify(executionTrailMetrics)}`
        )
        await page.waitForFunction(() => {
          const wrapper = document.querySelector('.ant-drawer-content-wrapper')
          const rect = wrapper?.getBoundingClientRect()
          return Boolean(
            rect &&
              rect.width >= 480 &&
              rect.left >= 0 &&
              rect.right <= window.innerWidth
          )
        })
        await page.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-approval-detail.png'),
        })
        const approvalDrawer = page.locator('.erp-task-action-drawer')
        const taskAttachmentAction = approvalDrawer.getByTestId(
          'workflow-task-attachment-action'
        )
        await taskAttachmentAction.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await expectText(taskAttachmentAction, '附件（1）')
        const taskAttachmentActionMetrics = await taskAttachmentAction.evaluate(
          (button) => ({
            insideFooter: Boolean(
              button.closest('.erp-task-action-drawer__footer-nav')
            ),
            height: button.getBoundingClientRect().height,
          })
        )
        assert(
          taskAttachmentActionMetrics.insideFooter &&
            taskAttachmentActionMetrics.height >= 32,
          `电脑端任务附件应是抽屉底部的次要动作: ${JSON.stringify(
            taskAttachmentActionMetrics
          )}`
        )
        await taskAttachmentAction.click()
        const taskAttachmentDialog = page.getByRole('dialog', {
          name: '任务附件',
          exact: true,
        })
        await taskAttachmentDialog.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await taskAttachmentDialog.evaluate((dialog) => {
          return new Promise((resolve, reject) => {
            const deadline = performance.now() + 2_000
            const waitForVisibleFrame = () => {
              if (window.getComputedStyle(dialog).opacity === '1') {
                resolve()
                return
              }
              if (performance.now() >= deadline) {
                reject(new Error('任务附件弹窗动画未进入可见态'))
                return
              }
              window.requestAnimationFrame(waitForVisibleFrame)
            }
            waitForVisibleFrame()
          })
        })
        await expectText(taskAttachmentDialog, 'style-l1-evidence.txt')
        const taskAttachmentDialogMetrics = {
          uploadCopyCount: await taskAttachmentDialog
            .getByText('选择附件', { exact: true })
            .count(),
          fileInputCount: await taskAttachmentDialog
            .locator('input[type="file"]')
            .count(),
        }
        assert(
          taskAttachmentDialogMetrics.uploadCopyCount === 1 &&
            taskAttachmentDialogMetrics.fileInputCount === 1,
          `电脑端具备任务更新能力时应保留附件上传入口: ${JSON.stringify(
            taskAttachmentDialogMetrics
          )}`
        )
        await page.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-task-attachment.png'),
        })
        await taskAttachmentDialog.locator('.ant-modal-close').click()
        await taskAttachmentDialog.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        let showApprovalReceiptContext = false
        const completedApprovalNodes = [
          {
            id: 700,
            process_instance_id: 701,
            node_key: 'finished_goods_quality',
            node_type: 'domain_command',
            attempt: 1,
            version: 1,
            status: 'completed',
            outcome: 'quality_passed',
          },
          {
            id: 702,
            process_instance_id: 701,
            node_key: 'shipment_finance_approval',
            node_type: 'approval',
            attempt: 1,
            version: 2,
            status: 'completed',
            outcome: 'approved',
          },
        ]
        const approvalReceiptContextRoute = async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            !showApprovalReceiptContext ||
            body.method !== 'get_task_process_context' ||
            Number(body.params?.task_id || 0) !== 9101
          ) {
            await route.fallback()
            return
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                code: 0,
                message: 'OK',
                data: {
                  process_context: {
                    source: {
                      type: 'shipment',
                      id: 501,
                      no: 'SHIP-L1-501',
                    },
                    process_instance: {
                      id: 701,
                      process_key: 'finished_goods_delivery',
                      process_version: 'v1',
                      status: 'completed',
                      started_at: 1_800_000_000,
                      completed_at: 1_800_000_300,
                    },
                    linked_node: completedApprovalNodes[1],
                    approval_form: null,
                    nodes: completedApprovalNodes,
                    current_nodes: [],
                    current_responsibilities: [],
                    completed_nodes: completedApprovalNodes,
                  },
                },
              },
            }),
          })
        }
        await page.route('**/rpc/workflow', approvalReceiptContextRoute)
        try {
          await approvalDrawer
            .getByRole('button', { name: '选择处理方式', exact: true })
            .click()
          await approvalDrawer.getByRole('radio', { name: /审批通过/ }).click()
          await approvalDrawer
            .getByPlaceholder('填写审批意见和判断依据')
            .fill('已核对出货单与当前财务放行条件')
          await approvalDrawer.getByRole('tab', { name: /确认与结果/ }).click()
          showApprovalReceiptContext = true
          const approvalSubmitButton = page.locator(
            '.erp-task-action-drawer__footer-primary button'
          )
          assert.equal(
            await approvalSubmitButton.count(),
            1,
            '审批确认步骤应只有一个主提交按钮'
          )
          assert.equal(
            (await approvalSubmitButton.innerText()).trim(),
            '确认通过',
            '审批主提交按钮应使用明确的通过文案'
          )
          await approvalSubmitButton.click()
          const approvalReceipt = approvalDrawer.getByTestId(
            'workflow-task-action-receipt'
          )
          await approvalReceipt.waitFor({ state: 'visible', timeout: 10_000 })
          await expectText(approvalReceipt, '办理结果已确认')
          await expectText(approvalReceipt, '流程交接结果')
          await expectText(approvalReceipt, '流程已结束。')
          await expectText(approvalDrawer, '本次责任岗位')
          await expectText(approvalDrawer, '财务')
          const approvalReceiptMetrics = await approvalDrawer.evaluate(
            (drawer) => ({
              handoffKind:
                drawer.querySelector('[data-handoff-kind]')?.dataset
                  .handoffKind || '',
              personCount: drawer.querySelectorAll(
                '.erp-task-action-drawer__responsibility-person'
              ).length,
              overflowX: drawer.scrollWidth - drawer.clientWidth,
            })
          )
          assert(
            approvalReceiptMetrics.handoffKind === 'end' &&
              approvalReceiptMetrics.personCount === 0 &&
              approvalReceiptMetrics.overflowX <= 1,
            `审批成功回执应显示流程终点且不暴露具体人员: ${JSON.stringify(
              approvalReceiptMetrics
            )}`
          )
          await page.screenshot({
            path: path.resolve(
              outputDir,
              'erp-task-board-approval-result-end.png'
            ),
          })
          await approvalDrawer
            .getByRole('button', { name: '完成并关闭', exact: true })
            .click()
          await approvalDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        } finally {
          await page.unroute('**/rpc/workflow', approvalReceiptContextRoute)
        }
        await taskScopeFilter.getByText('全部任务', { exact: true }).click()
        await page.waitForFunction(
          () =>
            new URL(window.location.href).searchParams.get('mode') !==
            'approval'
        )
        await expectHeading(page, '任务看板')
        await assertTextAbsent(
          page,
          '按产品、单据和任务状态查找需要处理的事项。'
        )
        const navigationTask = await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-task-navigation',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-task-navigation',
                task_group: 'trial_warehouse_work',
                task_name: '看板跳转测试任务',
                source_type: 'shipping-release',
                source_id: 9010,
                source_no: 'OUT-DASH-NAV',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'warehouse',
                assignee_id: 1,
                payload: {
                  product_name: '长耳兔抱枕',
                  style_no: 'RB-018',
                  product_code: 'PLUSH-RABBIT',
                  notification_type: 'task_created',
                  alert_type: 'shipment_pending',
                },
              },
            }),
          })
          const body = await response.json()
          if (!response.ok || body?.result?.code !== 0) {
            throw new Error(
              `create_task failed: ${JSON.stringify(body?.result || body)}`
            )
          }
          return body?.result?.data?.task || null
        })
        assert(
          Number(navigationTask?.id) > 0 && Number(navigationTask?.version) > 0,
          `任务看板冲突回归缺少任务版本: ${JSON.stringify(navigationTask)}`
        )
        const paginationTasks = await page.evaluate(async () => {
          const tasks = await Promise.all(
            Array.from({ length: 17 }, async (_, index) => {
              const suffix = String(index + 1).padStart(2, '0')
              const response = await fetch('/rpc/workflow', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: `dashboard-task-pagination-${suffix}`,
                  method: 'create_task',
                  params: {
                    task_code: `style-l1-dashboard-pagination-${suffix}`,
                    task_group: 'trial_warehouse_work',
                    task_name: `看板分页测试任务 ${suffix}`,
                    source_type: 'shipping-release',
                    source_id: 9020 + index,
                    source_no: `OUT-DASH-PAGE-${suffix}`,
                    business_status_key: 'shipment_pending',
                    task_status_key: 'ready',
                    owner_role_key: 'warehouse',
                    payload: {
                      product_name: `毛绒玩具产品 ${suffix}`,
                      style_no: `RB-${suffix}`,
                      notification_type: 'task_created',
                      alert_type: 'shipment_pending',
                    },
                  },
                }),
              })
              const body = await response.json()
              if (!response.ok || body?.result?.code !== 0) {
                throw new Error(
                  `create pagination task failed: ${JSON.stringify(body?.result || body)}`
                )
              }
              return body?.result?.data?.task || null
            })
          )
          return tasks.filter((task) => Number(task?.id) > 0)
        })
        assert.equal(
          paginationTasks.length,
          17,
          '任务看板分页回归应成功准备十七条补充任务'
        )
        const expectedSecondPageFirstTask = [
          navigationTask,
          ...paginationTasks,
        ].sort((left, right) => Number(right.id) - Number(left.id))[8]
        assert(
          Number(expectedSecondPageFirstTask?.id) > 0,
          `任务看板分页回归缺少第二页首条任务: ${JSON.stringify({
            navigationTask,
            paginationTasks,
          })}`
        )
        await page.getByRole('button', { name: '刷新当前页' }).click()
        const actionableOverviewLane = page
          .locator('.erp-task-board-lane')
          .filter({ hasText: '常规待办' })
          .first()
        await actionableOverviewLane
          .getByText('18', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await actionableOverviewLane.locator('.erp-task-board-card').count(),
          2,
          '任务看板总览每栏最多显示两条任务'
        )
        await actionableOverviewLane
          .getByRole('button', { name: '查看全部常规待办，18 项', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.setViewportSize({ width: 1920, height: 1080 })
        await assertDashboardTaskBoardLayout(page, {
          scenarioName: 'erp-task-board-populated-four-columns',
        })
        const populatedLayout = await actionableOverviewLane.evaluate(
          (lane) => ({
            width: lane.getBoundingClientRect().width,
            overflow: lane.scrollWidth - lane.clientWidth,
            cards: [...lane.querySelectorAll('.erp-task-board-card')].map(
              (card) => ({
                overflow: card.scrollWidth - card.clientWidth,
                identity: Boolean(card.querySelector('.erp-task-identity')),
              })
            ),
          })
        )
        assert(
          populatedLayout.width >= 280 &&
            populatedLayout.overflow <= 1 &&
            populatedLayout.cards.every((card) => card.overflow <= 1),
          `四列任务卡应保留可读宽度且没有裁切: ${JSON.stringify(populatedLayout)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-populated-four-columns.png'
          ),
        })
        await page.setViewportSize({ width: 1440, height: 900 })
        const readTaskBoardRefreshMetrics = () =>
          page.evaluate(() => {
            const boardCard = document.querySelector(
              '.erp-dashboard-task-board-card'
            )
            const summary = document.querySelector('.erp-task-center-summary')
            const lanes = document.querySelector('.erp-task-board-lanes')
            const metricButtons = [
              ...document.querySelectorAll(
                '.erp-task-board-category-count, .erp-task-board-lane-count'
              ),
            ]
            const content = document.querySelector('.erp-admin-content')
            const summaryRect = summary?.getBoundingClientRect()
            const boardCardRect = boardCard?.getBoundingClientRect()
            const lanesRect = lanes?.getBoundingClientRect()
            return {
              outerLoading:
                boardCard?.classList.contains('ant-card-loading') === true,
              laneLoadingCount: [
                ...document.querySelectorAll('.erp-task-board-lane'),
              ].filter(
                (lane) =>
                  lane.getAttribute('aria-busy') === 'true' ||
                  lane.classList.contains('ant-card-loading')
              ).length,
              lanesBusy: lanes?.getAttribute('aria-busy') || '',
              metricValues: metricButtons.map((button) =>
                String(button.textContent || '').trim()
              ),
              activeLabels: [
                ...document.querySelectorAll(
                  '.erp-task-board-categories .ant-tabs-tab-active .erp-task-board-category > span:first-child'
                ),
              ].map((node) => node.textContent.trim()),
              summaryTop: summaryRect?.top || 0,
              summaryHeight: summaryRect?.height || 0,
              boardCardTop: boardCardRect?.top || 0,
              boardCardHeight: boardCardRect?.height || 0,
              boardCardMinHeight: boardCard
                ? window.getComputedStyle(boardCard).minHeight
                : '',
              lanesHeight: lanesRect?.height || 0,
              contentScrollTop: content?.scrollTop || 0,
              contentScrollHeight: content?.scrollHeight || 0,
              contentClientHeight: content?.clientHeight || 0,
            }
          })
        const partialRefreshBefore = await readTaskBoardRefreshMetrics()
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-partial-refresh-before.png'
          ),
          fullPage: false,
        })
        let delayNextTaskBoardRequest = true
        const delayedTaskBoardRoute = async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            delayNextTaskBoardRequest &&
            body.method === 'get_task_board' &&
            body.params?.lane_key === 'actionable'
          ) {
            delayNextTaskBoardRequest = false
            await new Promise((resolve) => setTimeout(resolve, 1200))
          }
          await route.fallback()
        }
        await page.route('**/rpc/workflow', delayedTaskBoardRoute)
        const focusedTaskBoardRequest = page.waitForRequest((request) => {
          try {
            const body = request.postDataJSON() || {}
            return (
              body.method === 'get_task_board' &&
              body.params?.lane_key === 'actionable'
            )
          } catch {
            return false
          }
        })
        await actionableOverviewLane
          .getByRole('button', { name: '查看全部常规待办，18 项', exact: true })
          .click()
        await focusedTaskBoardRequest
        await page
          .locator('.erp-task-board-lanes[aria-busy="true"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const partialRefreshDuring = await readTaskBoardRefreshMetrics()
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-partial-refresh-loading.png'
          ),
          fullPage: false,
        })
        assert(
          !partialRefreshDuring.outerLoading &&
            partialRefreshDuring.laneLoadingCount === 1 &&
            partialRefreshDuring.lanesBusy === 'true' &&
            partialRefreshDuring.activeLabels.join(',') === '常规待办' &&
            partialRefreshDuring.metricValues.join(',') ===
              partialRefreshBefore.metricValues.join(',') &&
            Math.abs(
              partialRefreshDuring.summaryTop - partialRefreshBefore.summaryTop
            ) <= 1 &&
            Math.abs(
              partialRefreshDuring.summaryHeight -
                partialRefreshBefore.summaryHeight
            ) <= 64,
          `任务分类切换应只刷新下方泳道并保持顶部指标稳定: ${JSON.stringify({
            before: partialRefreshBefore,
            during: partialRefreshDuring,
          })}`
        )
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('lane') === 'actionable' && params.get('page') === '1'
          )
        })
        await page
          .locator('.erp-task-board-lanes--focused')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-task-board-lanes--focused .erp-task-board-lane'
            ).length === 1 &&
            document.querySelectorAll(
              '.erp-task-board-lanes--focused .ant-table-tbody > tr[data-task-code]'
            ).length === 8,
          undefined,
          { timeout: 10_000 }
        )
        const focusedListRow = page
          .locator('.erp-task-board-lane--focused tr[data-task-code]')
          .first()
        await focusedListRow.locator('td').nth(1).click()
        const focusedListDrawer = page.locator('.erp-task-action-drawer')
        await focusedListDrawer.waitFor({ state: 'visible', timeout: 2_000 })
        await page.keyboard.press('Escape')
        await focusedListDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        const focusedListEntry = focusedListRow.locator('.erp-task-title-entry')
        assert.equal(
          await focusedListEntry.evaluate(
            (button) => document.activeElement === button
          ),
          true,
          '整行单击关闭后应将焦点返回原任务标题'
        )
        assert.deepEqual(
          await page
            .locator('.erp-task-board-lane--focused .ant-table-thead th')
            .allTextContents(),
          ['任务 / 产品与物料', '关联单据 / 时间', '状态与说明 / 负责'],
          '分类列表应将空间用于三组任务信息，无独立操作列'
        )
        for (const key of ['Enter', 'Space']) {
          await focusedListEntry.focus()
          await page.keyboard.press(key)
          await focusedListDrawer.waitFor({ state: 'visible', timeout: 10_000 })
          assert.equal(
            await page.locator('.erp-task-action-drawer:visible').count(),
            1
          )
          await page.keyboard.press('Escape')
          await focusedListDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
          assert.equal(
            await focusedListEntry.evaluate(
              (button) => document.activeElement === button
            ),
            true
          )
        }
        const sourceText = focusedListRow
          .locator('td')
          .nth(1)
          .locator('.erp-task-copy-field__value')
          .first()
        const sourceTextBox = await sourceText.boundingBox()
        await page.mouse.move(
          sourceTextBox.x + 3,
          sourceTextBox.y + sourceTextBox.height / 2
        )
        await page.mouse.down()
        await page.mouse.move(
          sourceTextBox.x + Math.min(sourceTextBox.width - 3, 90),
          sourceTextBox.y + sourceTextBox.height / 2,
          { steps: 8 }
        )
        await page.mouse.up()
        assert.ok(
          await page.evaluate(() => String(window.getSelection()).length > 0),
          '单据信息应可拖选复制'
        )
        assert.equal(
          await focusedListDrawer.isVisible(),
          false,
          '拖选文字不应误开任务'
        )
        await page.evaluate(() => window.getSelection().removeAllRanges())
        const partialRefreshAfter = await readTaskBoardRefreshMetrics()
        assert(
          !partialRefreshAfter.outerLoading &&
            partialRefreshAfter.laneLoadingCount === 0 &&
            partialRefreshAfter.lanesBusy === 'false' &&
            partialRefreshAfter.metricValues.join(',') ===
              partialRefreshBefore.metricValues.join(',') &&
            Math.abs(
              partialRefreshAfter.summaryTop - partialRefreshDuring.summaryTop
            ) <= 1 &&
            Math.abs(
              partialRefreshAfter.summaryHeight -
                partialRefreshDuring.summaryHeight
            ) <= 1,
          `任务分类切换完成后顶部指标与局部加载状态异常: ${JSON.stringify({
            before: partialRefreshBefore,
            after: partialRefreshAfter,
          })}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-partial-refresh-after.png'
          ),
          fullPage: false,
        })
        await page.unroute('**/rpc/workflow', delayedTaskBoardRoute)
        assert.equal(
          await page.locator('.erp-task-board-lane').count(),
          1,
          '聚焦任务泳道时只应显示当前泳道'
        )
        assert.equal(
          await page.locator('.ant-table-tbody > tr[data-task-code]').count(),
          8,
          '聚焦任务泳道每页应显示八条任务'
        )
        const secondPageButton = page.locator(
          '.erp-task-pagination .ant-pagination-item-2'
        )
        await page
          .locator('.erp-task-board-lane--focused tr[data-task-code]')
          .last()
          .scrollIntoViewIfNeeded()
        const paginationScrollBefore = await page.evaluate(() => {
          const content = document.querySelector('.erp-admin-content')
          const pagination = document.querySelector(
            '.erp-task-pagination .ant-pagination'
          )
          const contentRect = content?.getBoundingClientRect()
          const paginationRect = pagination?.getBoundingClientRect()
          return {
            scrollTop: content?.scrollTop || 0,
            paginationVisible: Boolean(
              contentRect &&
                paginationRect &&
                paginationRect.top >= contentRect.top &&
                paginationRect.bottom <= contentRect.bottom
            ),
          }
        })
        assert(
          paginationScrollBefore.scrollTop > 0 &&
            paginationScrollBefore.paginationVisible,
          `任务看板分页前必须真实滚到页面下方并看见分页器: ${JSON.stringify(
            paginationScrollBefore
          )}`
        )
        await page.evaluate(() => {
          const content = document.querySelector('.erp-admin-content')
          const trace = [content?.scrollTop || 0]
          const handleScroll = () => trace.push(content?.scrollTop || 0)
          content?.addEventListener('scroll', handleScroll)
          window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__ = trace
          window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_CLEANUP__ = () =>
            content?.removeEventListener('scroll', handleScroll)
        })
        await secondPageButton.click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('lane') === 'actionable' &&
            params.get('page') === '2' &&
            document.querySelectorAll('.ant-table-tbody > tr[data-task-code]')
              .length === 8
          )
        })
        await page
          .locator('.ant-table-tbody > tr[data-task-code]')
          .first()
          .getByText(expectedSecondPageFirstTask.task_name, { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const paginationScrollAfter = await page.evaluate(() => {
          window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_CLEANUP__?.()
          const content = document.querySelector('.erp-admin-content')
          const focusedLanes = document.querySelector(
            '.erp-task-board-lanes--focused'
          )
          const firstCard = focusedLanes?.querySelector(
            '.ant-table-tbody > tr[data-task-code]'
          )
          const contentRect = content?.getBoundingClientRect()
          const lanesRect = focusedLanes?.getBoundingClientRect()
          const firstCardRect = firstCard?.getBoundingClientRect()
          const paddingTop = content
            ? Number.parseFloat(window.getComputedStyle(content).paddingTop) ||
              0
            : 0
          const expectedTop = (contentRect?.top || 0) + paddingTop + 12
          const scrollTrace = Array.isArray(
            window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__
          )
            ? [...window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__]
            : []
          delete window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__
          delete window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_CLEANUP__
          return {
            scrollTop: content?.scrollTop || 0,
            scrollTrace,
            expectedTop,
            lanesTop: lanesRect?.top || 0,
            lanesTopError: Math.abs((lanesRect?.top || 0) - expectedTop),
            firstCardVisible: Boolean(
              contentRect &&
                firstCardRect &&
                firstCardRect.top >= contentRect.top &&
                firstCardRect.top < contentRect.bottom
            ),
          }
        })
        assert(
          paginationScrollAfter.scrollTop > 0 &&
            paginationScrollAfter.scrollTrace.length > 0 &&
            Math.min(...paginationScrollAfter.scrollTrace) > 0 &&
            paginationScrollAfter.lanesTopError <= 2 &&
            paginationScrollAfter.firstCardVisible,
          `任务看板翻页后应定位当前泳道起点，不能跳回整页顶部: ${JSON.stringify(
            paginationScrollAfter
          )}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-desktop-pagination-page-2.png'
          ),
        })
        const taskPager = page.getByRole('navigation', { name: '任务分页' })
        const pageSizeRead = page
          .waitForRequest((request) => {
            try {
              const body = request.postDataJSON()
              return (
                body?.method === 'get_task_board' &&
                body.params?.limit === 20 &&
                body.params?.offset === 0
              )
            } catch {
              return false
            }
          })
          .then(
            (request) => request,
            (error) => error
          )
        await taskPager.getByText('8 项 / 页', { exact: true }).click()
        await page.getByText('20 项 / 页', { exact: true }).click()
        const changedPageSizeRequest = await pageSizeRead
        if (changedPageSizeRequest instanceof Error) {
          throw changedPageSizeRequest
        }
        await taskPager
          .getByText('第 1–18 项，共 18 项', { exact: true })
          .waitFor()
        assert.equal(new URL(page.url()).searchParams.get('pageSize'), '20')
        assert.equal(new URL(page.url()).searchParams.get('page'), '1')
        assert.equal(
          await page.locator('.ant-table-tbody > tr[data-task-code]').count(),
          18
        )
        assert.equal(
          await taskPager.getByRole('button', { name: '上一页' }).isDisabled(),
          true
        )
        assert.equal(
          await taskPager.getByRole('button', { name: '下一页' }).isDisabled(),
          true
        )
        let failPageSizeRead = true
        const failedPageSizeRoute = async (route) => {
          const body = route.request().postDataJSON()
          if (
            failPageSizeRead &&
            body?.method === 'get_task_board' &&
            body.params?.limit === 8
          ) {
            failPageSizeRead = false
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: {
                  code: RpcErrorCode.INTERNAL,
                  message: '任务列表暂时无法读取',
                  data: {},
                },
              }),
            })
            return
          }
          await route.fallback()
        }
        await page.route('**/rpc/workflow', failedPageSizeRoute)
        await taskPager.getByText('20 项 / 页', { exact: true }).click()
        await page.getByText('8 项 / 页', { exact: true }).click()
        await page
          .locator('.ant-alert')
          .filter({ hasText: '任务看板加载失败' })
          .waitFor()
        await taskPager
          .getByRole('status')
          .getByText('任务加载失败', { exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '重新加载', exact: true })
          .click()
        await taskPager
          .getByText('第 1–8 项，共 18 项', { exact: true })
          .waitFor()
        await page.unroute('**/rpc/workflow', failedPageSizeRoute)
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 900 })
          await page.waitForFunction(
            (compact) =>
              Boolean(
                document.querySelector(
                  '.erp-task-pagination .ant-pagination-simple'
                )
              ) === compact,
            width < 768
          )
          const pagerLayout = await taskPager.evaluate((nav) => {
            const rect = nav.getBoundingClientRect()
            const content = document
              .querySelector('.erp-admin-content')
              .getBoundingClientRect()
            return {
              visible: rect.top >= content.top && rect.bottom <= content.bottom,
              overflow: nav.scrollWidth - nav.clientWidth,
              buttons: [
                ...nav.querySelectorAll(
                  '.ant-pagination-prev button, .ant-pagination-next button'
                ),
              ].map((node) => ({
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height,
              })),
            }
          })
          assert(
            pagerLayout.visible && pagerLayout.overflow <= 1,
            `${width}px 分页栏应在视口内且不溢出: ${JSON.stringify(pagerLayout)}`
          )
          const targetSize = width < 768 ? 44 : 36
          assert(
            pagerLayout.buttons.every(
              (button) =>
                button.width >= targetSize && button.height >= targetSize
            ),
            `${width}px 翻页按钮应有足够点击范围: ${JSON.stringify(pagerLayout)}`
          )
          await page.screenshot({
            path: path.resolve(outputDir, `erp-task-pagination-${width}.png`),
          })
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        await page
          .getByRole('button', { name: '返回任务概览', exact: true })
          .click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            !params.has('lane') &&
            !params.has('page') &&
            document.querySelectorAll('.erp-task-board-lane').length === 4
          )
        })
        const taskBoardSearch = page.getByPlaceholder(
          '订单 / 产品 / 物料 / 款号'
        )
        await taskBoardSearch.fill('RB-018')
        await taskBoardSearch.press('Enter')
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('q') === 'RB-018'
        )
        await expectText(page.locator('.erp-task-board-lanes'), '长耳兔抱枕')
        assert.equal(
          await page.locator('.erp-task-board-card').count(),
          1,
          '款号查询应筛出对应产品任务'
        )
        const copyCard = page.locator('.erp-task-board-card').first()
        const copyStyle = copyCard.getByRole('button', {
          name: '复制产品编号',
          exact: true,
        })
        await assertTaskCopy(page, copyStyle, 'PLUSH-RABBIT')
        await assertTaskCopy(page, copyStyle, 'PLUSH-RABBIT', {
          keyboard: true,
          fallback: true,
        })
        await assertTaskCopy(page, copyStyle, '', { failure: true })
        await assertTaskCopy(
          page,
          copyCard.getByRole('button', { name: '复制单据编号', exact: true }),
          'OUT-DASH-NAV'
        )
        await taskBoardSearch.fill('OUT-DASH-NAV')
        await taskBoardSearch.press('Enter')
        await page.waitForFunction(() =>
          new URLSearchParams(window.location.search).has('q')
        )
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-task-role-filter-sales',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-role-filter-sales',
                task_group: 'trial_sales_work',
                task_name: '业务岗位筛选边界任务',
                source_type: 'project-orders',
                source_id: 9011,
                source_no: 'SO-ROLE-FILTER',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'sales',
                payload: {},
              },
            }),
          })
          const body = await response.json()
          if (!response.ok || body?.result?.code !== 0) {
            throw new Error(
              `create sales role task failed: ${JSON.stringify(body?.result || body)}`
            )
          }
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '任务看板')
        await page.getByText('全部可见岗位').click()
        await page.getByTitle('仓库', { exact: true }).click()
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForPath(page, '/erp/task-board')
        assert.match(
          page.url(),
          /[?&]q=OUT-DASH-NAV(?:&|$)/,
          '任务看板关键词筛选应写入 URL'
        )
        assert.match(
          page.url(),
          /[?&]role=warehouse(?:&|$)/,
          '任务看板角色筛选应写入 URL'
        )
        await expectText(page, '看板跳转测试任务')
        await assertTextAbsent(page, '当前选中任务')
        const navigationTaskCard = page.getByRole('button', {
          name: '查看看板跳转测试任务详情',
          exact: true,
        })
        await navigationTaskCard.scrollIntoViewIfNeeded()
        const taskBoardURLBeforeOpen = page.url()
        const taskBoardScrollBeforeOpen = await page
          .locator('.erp-admin-content')
          .evaluate((node) => node.scrollTop)
        const navigationCard = page
          .locator('.erp-task-board-card')
          .filter({ has: navigationTaskCard })
        await clickTaskCardContent(
          navigationCard,
          navigationCard.locator('.erp-task-board-card-title')
        )
        const taskDrawer = page.locator('.erp-task-action-drawer')
        await taskDrawer.waitFor({ state: 'visible', timeout: 10_000 })
        await assertTaskCopy(
          page,
          taskDrawer.getByRole('button', { name: '复制产品信息', exact: true }),
          ['产品：长耳兔抱枕', '产品编号：PLUSH-RABBIT', '内部款号：RB-018']
        )
        await assertTaskCopy(
          page,
          taskDrawer.getByRole('button', { name: '复制任务信息', exact: true }),
          [
            '任务：看板跳转测试任务',
            '产品：长耳兔抱枕',
            'OUT-DASH-NAV',
            '负责：仓库',
          ]
        )
        assert.equal(
          await page.locator('.erp-task-action-drawer:visible').count(),
          1
        )
        await page.keyboard.press('Escape')
        await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await page
          .waitForFunction(
            () =>
              document.activeElement?.getAttribute('aria-label') ===
              '查看看板跳转测试任务详情',
            null,
            { timeout: 10_000 }
          )
          .catch(async (error) => {
            const focus = await page.evaluate(() => ({
              active: document.activeElement?.outerHTML?.slice(0, 500),
              card: document
                .querySelector('[aria-label="查看看板跳转测试任务详情"]')
                ?.outerHTML?.slice(0, 500),
              drawer: [
                ...document.querySelectorAll('.erp-task-action-drawer'),
              ].map((node) => ({
                className: node.className,
                visible: node.getBoundingClientRect().height,
              })),
            }))
            throw new Error(`${error.message}; focus=${JSON.stringify(focus)}`)
          })

        assert.equal(
          page.url(),
          taskBoardURLBeforeOpen,
          '关闭详情应保留当前筛选'
        )
        const restoredTaskBoardState = await page.evaluate(() => ({
          scrollTop: document.querySelector('.erp-admin-content')?.scrollTop,
          activeLabel: document.activeElement?.getAttribute('aria-label'),
        }))
        for (
          let quickCloseAttempt = 0;
          quickCloseAttempt < 2;
          quickCloseAttempt += 1
        ) {
          await navigationTaskCard.click()
          await taskDrawer.waitFor({ state: 'visible', timeout: 10_000 })
          await page.keyboard.press('Escape')
          await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute('aria-label') ===
              '查看看板跳转测试任务详情'
          )
        }
        assert(
          Math.abs(
            restoredTaskBoardState.scrollTop - taskBoardScrollBeforeOpen
          ) <= 2,
          `关闭详情应保留列表滚动位置: ${JSON.stringify(restoredTaskBoardState)}`
        )
        assert.equal(
          restoredTaskBoardState.activeLabel,
          '查看看板跳转测试任务详情',
          '关闭详情后焦点应返回打开它的任务卡'
        )
        await navigationTaskCard.press('Enter')
        await taskDrawer.waitFor({ state: 'visible', timeout: 10_000 })
        await page.keyboard.press('Escape')
        await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await navigationTaskCard.press('Space')
        await taskDrawer.waitFor({ state: 'visible', timeout: 10_000 })
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-context-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectReasonInput: false,
        })
        const actionStep = taskDrawer.getByRole('tab', {
          name: /选择处理/,
        })
        const confirmStep = taskDrawer.getByRole('tab', {
          name: /确认与结果/,
        })
        assert.equal(
          await confirmStep.getAttribute('aria-disabled'),
          'true',
          '未选择处理方式前确认步骤必须禁用'
        )
        await actionStep.click()
        await taskDrawer.getByRole('radio', { name: /处理完成/ }).click()
        assert.equal(
          await confirmStep.getAttribute('aria-disabled'),
          'false',
          '选择处理方式后确认步骤应可直接点击'
        )
        await confirmStep.click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-complete-confirmation',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '即将提交',
          expectReasonInput: false,
        })
        await expectText(taskDrawer, '提交后会发生什么')
        await expectText(
          taskDrawer,
          '确认后只完成当前任务；相关业务是否办结以对应业务页面为准。'
        )
        const conflictMutation = await page.evaluate(
          async ({ taskID, expectedVersion }) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'dashboard-task-version-conflict',
                method: 'urge_task',
                params: {
                  task_id: taskID,
                  expected_version: expectedVersion,
                  idempotency_key: `style-l1-dashboard-conflict:${taskID}`,
                  action: 'urge_task',
                  reason: '模拟另一位处理人先更新任务',
                },
              }),
            })
            return response.json()
          },
          {
            taskID: navigationTask.id,
            expectedVersion: navigationTask.version,
          }
        )
        assert.equal(
          conflictMutation?.result?.code,
          0,
          `准备任务版本冲突失败: ${JSON.stringify(conflictMutation)}`
        )
        const refreshedTaskBoardResponse = page.waitForResponse((response) => {
          try {
            return (
              response.request().postDataJSON()?.method === 'get_task_board'
            )
          } catch {
            return false
          }
        })
        await taskDrawer.getByRole('button', { name: '确认完成' }).click()
        await page
          .getByText('任务已被其他人更新，请刷新后重试', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await refreshedTaskBoardResponse
        await page
          .locator('.erp-task-board-lanes[aria-busy="false"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await navigationTaskCard.click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-refreshed-context-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectReasonInput: false,
        })
        await taskDrawer.getByRole('tab', { name: /选择处理/ }).click()
        await taskDrawer.getByRole('radio', { name: /标记阻塞/ }).click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-block-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '标记阻塞',
          expectReasonInput: true,
        })
        await taskDrawer
          .getByRole('radio', { name: /转交任务/ })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await taskDrawer.getByRole('radio', { name: /转交任务/ }).click()
        const assignmentSelect = taskDrawer.getByRole('combobox', {
          name: '转交去向',
        })
        await assignmentSelect.click()
        await page
          .getByText('暂不指定个人，退回共同待办（负责岗位：仓库）', {
            exact: true,
          })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: 'warehouse-backup · 仓库' })
          .click()
        await taskDrawer.locator('.erp-task-action-drawer__action-head').click()
        await taskDrawer
          .getByPlaceholder('填写请假、人员调整等转交原因')
          .fill('原处理人请假，由同岗位人员接手')
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-assignment-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '转交任务',
          expectReasonInput: true,
        })
        await page
          .getByText('任务已被其他人更新，请刷新后重试', { exact: true })
          .waitFor({ state: 'hidden', timeout: 10_000 })
        await taskDrawer
          .locator('.erp-task-action-drawer__action-panel')
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-desktop-assignment.png'
          ),
        })
        await taskDrawer.getByRole('tab', { name: /确认与结果/ }).click()
        await expectText(taskDrawer, '提交后会发生什么')
        await expectText(
          taskDrawer,
          '确认后只改变处理人，负责岗位和流程保持不变。'
        )
        await expectText(taskDrawer, 'warehouse-backup · 仓库')
        await taskDrawer.getByRole('button', { name: '确认转交' }).click()
        await page
          .getByText('任务已转交', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const assignmentReceipt = taskDrawer.getByTestId(
          'workflow-task-action-receipt'
        )
        await assignmentReceipt.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(assignmentReceipt, '办理结果已确认')
        await expectText(
          assignmentReceipt,
          '本次操作不触发流程流转，任务仍由当前负责岗位继续办理。'
        )
        assert.equal(
          await taskDrawer
            .locator('.erp-task-action-drawer__responsibility-person')
            .count(),
          0,
          '成功回执只显示岗位责任，不显示具体处理人'
        )
        await taskDrawer
          .getByRole('button', { name: '完成并关闭', exact: true })
          .click()
        await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        const restoredKeyword = await page
          .getByPlaceholder('订单 / 产品 / 物料 / 款号')
          .inputValue()
        assert.equal(restoredKeyword, 'OUT-DASH-NAV')
        const taskBoardFilters = page.locator('.erp-task-board-controls')
        const clearFiltersButton = taskBoardFilters
          .locator('button')
          .filter({ hasText: '清空筛选' })
        assert.equal(
          await clearFiltersButton.count(),
          1,
          '任务看板清空筛选按钮应只在筛选区作用域内命中一次'
        )
        assert.equal(
          await clearFiltersButton.isEnabled(),
          true,
          '任务看板存在 URL 筛选时清空按钮应可用'
        )
        await clearFiltersButton.click()
        assert.doesNotMatch(
          page.url(),
          /[?&](q|role)=/,
          '清空筛选后应移除任务看板 URL 筛选参数'
        )
        await page.waitForFunction(
          () =>
            document.querySelector(
              'input[placeholder="订单 / 产品 / 物料 / 款号"]'
            )?.value === ''
        )
        const clearedKeyword = await page
          .getByPlaceholder('订单 / 产品 / 物料 / 款号')
          .inputValue()
        assert.equal(clearedKeyword, '')
        assert.equal(
          await clearFiltersButton.count(),
          0,
          '任务看板回到默认筛选后不应显示清空按钮'
        )
        await taskBoardSearch.focus()
        const taskBoardSearchControl = page.locator(
          '.erp-task-board-filters > .erp-business-filter-control--search.ant-input-affix-wrapper'
        )
        const emptySearchFocusMetrics = await taskBoardSearch.evaluate(
          (input) => {
            const affix = input.closest('.ant-input-affix-wrapper')
            const filters = input.closest('.erp-task-board-filters')
            const prefix = affix?.querySelector(
              '.ant-input-prefix .anticon-search'
            )
            const filterButton = [
              ...(filters?.querySelectorAll(':scope > .ant-btn') || []),
            ].find((node) => node.textContent?.trim() === '筛选')
            const affixRect = affix?.getBoundingClientRect()
            const inputRect = input.getBoundingClientRect()
            const prefixRect = prefix?.getBoundingClientRect()
            const affixStyle = affix ? window.getComputedStyle(affix) : null
            const inputStyle = window.getComputedStyle(input)
            const afterStyle = affix
              ? window.getComputedStyle(affix, '::after')
              : null
            const controls = [
              affix,
              ...(filters?.querySelectorAll(':scope > .ant-select') || []),
              filterButton,
            ].filter(Boolean)
            const controlRects = controls.map((node) => {
              const rect = node.getBoundingClientRect()
              return {
                className: String(node.className || ''),
                height: rect.height,
                top: rect.top,
              }
            })
            return {
              activeElementIsInput: document.activeElement === input,
              value: input.value,
              selectionStart: input.selectionStart,
              focusWithin: Boolean(affix?.matches(':focus-within')),
              sharedWrapper: Boolean(
                affix?.classList.contains('erp-business-filter-control') &&
                  affix?.classList.contains(
                    'erp-business-filter-control--search'
                  )
              ),
              hasInputSearchAncestor: Boolean(
                input.closest('.ant-input-search')
              ),
              searchButtonCount:
                filters?.querySelectorAll('.ant-input-search-button').length ||
                0,
              prefixCount: prefix ? 1 : 0,
              placeholder: input.getAttribute('placeholder') || '',
              ariaLabel: input.getAttribute('aria-label') || '',
              title: input.getAttribute('title') || '',
              afterContent: afterStyle?.content || '',
              affixBorderColor: affixStyle?.borderColor || '',
              affixBoxShadow: affixStyle?.boxShadow || '',
              caretColor: inputStyle.caretColor,
              inputLineHeight:
                Number.parseFloat(inputStyle.lineHeight || '') || 0,
              inputPaddingBlockStart:
                Number.parseFloat(inputStyle.paddingBlockStart || '') || 0,
              inputPaddingBlockEnd:
                Number.parseFloat(inputStyle.paddingBlockEnd || '') || 0,
              affixRect: affixRect
                ? {
                    height: affixRect.height,
                    bottom: affixRect.bottom,
                    left: affixRect.left,
                    right: affixRect.right,
                    top: affixRect.top,
                  }
                : null,
              inputRect: {
                height: inputRect.height,
                bottom: inputRect.bottom,
                left: inputRect.left,
                right: inputRect.right,
                top: inputRect.top,
              },
              prefixRect: prefixRect
                ? {
                    height: prefixRect.height,
                    bottom: prefixRect.bottom,
                    left: prefixRect.left,
                    right: prefixRect.right,
                    top: prefixRect.top,
                  }
                : null,
              controlRects,
              controlRowCount: new Set(
                controlRects.map(({ top }) => Math.round(top))
              ).size,
            }
          }
        )
        await taskBoardSearchControl.screenshot({
          caret: 'initial',
          path: path.resolve(
            outputDir,
            'erp-task-board-search-shared-empty-focused.png'
          ),
        })
        assert(
          emptySearchFocusMetrics.activeElementIsInput &&
            emptySearchFocusMetrics.value === '' &&
            emptySearchFocusMetrics.selectionStart === 0 &&
            emptySearchFocusMetrics.focusWithin &&
            emptySearchFocusMetrics.sharedWrapper &&
            !emptySearchFocusMetrics.hasInputSearchAncestor &&
            emptySearchFocusMetrics.searchButtonCount === 0 &&
            emptySearchFocusMetrics.prefixCount === 1 &&
            emptySearchFocusMetrics.placeholder ===
              '订单 / 产品 / 物料 / 款号' &&
            emptySearchFocusMetrics.ariaLabel ===
              '可搜索：任务、单号、产品、款号、物料、处理原因' &&
            emptySearchFocusMetrics.title ===
              '可搜索：任务、单号、产品、款号、物料、处理原因' &&
            ['none', 'normal', ''].includes(
              emptySearchFocusMetrics.afterContent
            ) &&
            emptySearchFocusMetrics.affixBorderColor !== 'transparent' &&
            emptySearchFocusMetrics.affixBoxShadow
              .toLowerCase()
              .includes('inset') &&
            emptySearchFocusMetrics.caretColor !== 'transparent' &&
            emptySearchFocusMetrics.affixRect &&
            emptySearchFocusMetrics.inputRect &&
            emptySearchFocusMetrics.prefixRect &&
            emptySearchFocusMetrics.affixRect.height >= 35 &&
            emptySearchFocusMetrics.affixRect.height <= 37 &&
            emptySearchFocusMetrics.inputRect.height >= 33 &&
            emptySearchFocusMetrics.inputRect.height <= 35 &&
            emptySearchFocusMetrics.inputLineHeight >= 33 &&
            emptySearchFocusMetrics.inputLineHeight <= 35 &&
            emptySearchFocusMetrics.inputPaddingBlockStart === 0 &&
            emptySearchFocusMetrics.inputPaddingBlockEnd === 0 &&
            emptySearchFocusMetrics.prefixRect.right <=
              emptySearchFocusMetrics.inputRect.left &&
            emptySearchFocusMetrics.inputRect.left -
              emptySearchFocusMetrics.prefixRect.right >=
              2 &&
            emptySearchFocusMetrics.inputRect.left -
              emptySearchFocusMetrics.prefixRect.right <=
              12 &&
            Math.abs(
              (emptySearchFocusMetrics.prefixRect.top +
                emptySearchFocusMetrics.prefixRect.bottom) /
                2 -
                (emptySearchFocusMetrics.inputRect.top +
                  emptySearchFocusMetrics.inputRect.bottom) /
                  2
            ) <= 1 &&
            emptySearchFocusMetrics.controlRects.length === 3 &&
            emptySearchFocusMetrics.controlRects.every(
              ({ height }) => height >= 35 && height <= 37
            ) &&
            emptySearchFocusMetrics.controlRowCount >= 1 &&
            emptySearchFocusMetrics.controlRowCount <= 2,
          `空任务搜索框应复用单层业务筛选控件，前缀、光标、焦点边界和相邻控件节奏必须一致: ${JSON.stringify(
            emptySearchFocusMetrics
          )}`
        )
        await taskBoardSearch.fill('OUT-DASH-NAV')
        assert.equal(
          await taskBoardSearchControl.locator('.ant-input-clear-icon').count(),
          1,
          '任务搜索框输入内容后应保留清空入口'
        )
        await taskBoardFilters.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-search-shared-filled-focused-adjacent.png'
          ),
        })
        await taskBoardSearch.press('Enter')
        await page
          .locator('.erp-task-board-card')
          .filter({ hasText: '看板跳转测试任务' })
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        const navigationLaneTask = page
          .locator('.erp-task-board-card')
          .filter({ hasText: '看板跳转测试任务' })
          .first()
        await clickTaskCardContent(
          navigationLaneTask,
          navigationLaneTask.locator('.erp-task-board-card-meta').first()
        )
        await taskDrawer.waitFor({ state: 'visible', timeout: 10_000 })
        await taskDrawer
          .getByText('看板跳转测试任务', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-card-single-click.png'),
        })
        await taskDrawer.locator('.ant-drawer-close').click()
        await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await expectNoButton(page, '看板跳转测试任务')
      },
    },
    {
      name: 'erp-task-board-single-role-scope-desktop',
      path: '/erp/task-board?role=sales',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-task-board-warehouse-scope',
        configHash: 'style-l1-task-board-warehouse-scope-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        roles: ['warehouse'],
        pages: ['task-board'],
        actions: ['workflow.task.read'],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
        },
        fieldPolicies: {},
        workPools: ['warehouse'],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        id: 42,
        username: 'style-l1-warehouse-board',
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: ['workflow.task.read'],
        menus: [
          {
            key: 'task-board',
            label: '任务看板',
            path: '/erp/task-board',
            required_any: ['workflow.task.read'],
            required_all: [],
          },
        ],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '任务看板')
        await page.waitForFunction(
          () => !new URLSearchParams(window.location.search).has('role')
        )
        assert.equal(
          await page.getByLabel('负责岗位').count(),
          0,
          '普通单岗位账号不应显示可切换岗位的筛选控件'
        )
        assert.equal(
          await page.getByText('全部可见岗位', { exact: true }).count(),
          0,
          '普通单岗位账号不应出现全部岗位入口'
        )
        const filterMetrics = await page
          .locator('.erp-task-board-filters')
          .evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            roleSelectCount: element.querySelectorAll('[aria-label="负责岗位"]')
              .length,
            searchWidth:
              element
                .querySelector('.erp-business-filter-control--search')
                ?.getBoundingClientRect().width || 0,
            selectWidths: [
              ...element.querySelectorAll(':scope > .ant-select'),
            ].map((node) => node.getBoundingClientRect().width),
            filterButtonWidth:
              [...element.querySelectorAll(':scope > .ant-btn')]
                .find((node) => node.textContent?.trim() === '筛选')
                ?.getBoundingClientRect().width || 0,
          }))
        assert.equal(filterMetrics.roleSelectCount, 0)
        assert(
          filterMetrics.scrollWidth <= filterMetrics.clientWidth + 1,
          `单岗位筛选区不应溢出: ${JSON.stringify(filterMetrics)}`
        )
        assert(
          filterMetrics.searchWidth >= 240 &&
            filterMetrics.selectWidths.length === 0 &&
            filterMetrics.filterButtonWidth >= 64 &&
            filterMetrics.filterButtonWidth <= 120,
          `单岗位默认仅显示搜索和筛选入口，其他条件按需展开: ${JSON.stringify(
            filterMetrics
          )}`
        )
        assert.equal(
          await page
            .getByRole('radio', { name: '待我审批', exact: true })
            .count(),
          0
        )
        assert.equal(
          await page
            .getByRole('button', { name: '清空筛选', exact: true })
            .count(),
          0
        )
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        assert.equal(
          await page
            .getByRole('group', { name: '更多筛选条件' })
            .getByRole('combobox')
            .count(),
          3
        )
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-single-role-scope-desktop.png'
          ),
        })
      },
    },
    {
      name: 'erp-business-dashboard-desktop',
      path: '/erp/business-dashboard',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, '超级管理员')
        await expectText(page, '看板中心')
        await expectHeading(page, '业务看板')
        await expectText(page, '基础资料')
        await expectText(page, '业务单据')
        await expectText(page, '办理结果')
        await expectText(page, '需要关注')
        await expectText(page, '业务数据')
        await assertTextAbsent(page, '内部来源')
        await expectText(page, '业务环节')
        await expectText(page, '采购/入库')
        await expectText(page, '当前数量')
        await assertTextAbsent(page, '数字说明')
        await expectNoButton(page, '任务看板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-business-dashboard-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-business-dashboard-desktop',
          expectBusinessAttention: true,
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-desktop',
          expectVisible: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-desktop',
        })
        await assertNoHorizontalOverflow(page, 'erp-business-dashboard-desktop')
        await assertBusinessDashboardCountStates(
          page,
          'erp-business-dashboard-desktop'
        )
        const blockedAttention = page.getByRole('group', {
          name: '阻塞，27 项',
          exact: true,
        })
        assert(
          (await blockedAttention.textContent()).includes(
            '客户尚未确认耳长尺寸'
          ),
          '阻塞预览应直接展示实际原因'
        )
        assert(
          (await blockedAttention.textContent()).includes('工程'),
          '阻塞预览应展示负责岗位'
        )
        await page
          .locator('.erp-business-board-boundary-summary summary')
          .click()
        await expectText(page, '完成任务不会自动产生库存、出货或财务记录')
        await page
          .locator('.erp-business-board-boundary-summary summary')
          .click()
        const customerSourceRow = page
          .getByRole('button', { name: '查看客户', exact: true })
          .locator('xpath=ancestor::tr[1]')
        const customerSourceBeforeHover = await customerSourceRow.evaluate(
          (element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element.querySelector('td'))
            return {
              width: rect.width,
              height: rect.height,
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
            }
          }
        )
        await customerSourceRow.hover()
        await page.waitForFunction(
          ({ backgroundColor, borderColor }) => {
            const sourceItem = document
              .querySelector('[aria-label="查看客户"]')
              ?.closest('tr.erp-business-board-source-item--openable')
            const sourceCell = sourceItem?.querySelector('td')
            if (!sourceCell) return false
            const style = getComputedStyle(sourceCell)
            return (
              style.backgroundColor !== backgroundColor ||
              style.borderColor !== borderColor
            )
          },
          customerSourceBeforeHover,
          { timeout: 2_000 }
        )
        const customerSourceAfterHover = await customerSourceRow.evaluate(
          (element) => {
            const rect = element.getBoundingClientRect()
            const sourceCell = element.querySelector('td')
            const style = getComputedStyle(sourceCell)
            const cells = Array.from(element.querySelectorAll(':scope > td'))
            const recordCell = cells[1]
            const countCell = cells[2]
            const tableCard = element.closest('.erp-dashboard-table-card')
            const tableCardRect = tableCard?.getBoundingClientRect()
            const tableScrollContainer = tableCard?.querySelector(
              '.ant-table-content, .ant-table-body'
            )
            const tableScrollStyle = tableScrollContainer
              ? getComputedStyle(tableScrollContainer)
              : null
            const entryButton = element.querySelector(
              '.erp-business-board-source-entry'
            )
            const entryButtonRect = entryButton?.getBoundingClientRect()
            return {
              width: rect.width,
              height: rect.height,
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
              recordCellFits:
                Boolean(recordCell) &&
                recordCell.scrollWidth <= recordCell.clientWidth + 1,
              countCellFits:
                Boolean(countCell) &&
                countCell.scrollWidth <= countCell.clientWidth + 1,
              tableScroll: {
                clientWidth: tableScrollContainer?.clientWidth || 0,
                scrollWidth: tableScrollContainer?.scrollWidth || 0,
                overflowX: tableScrollStyle?.overflowX || '',
              },
              entryButtonWithinCard: Boolean(
                tableCardRect &&
                  entryButtonRect &&
                  entryButtonRect.left >= tableCardRect.left - 1 &&
                  entryButtonRect.right <= tableCardRect.right + 1
              ),
            }
          }
        )
        const tableScrollIsControlled =
          customerSourceAfterHover.tableScroll.clientWidth > 0 &&
          customerSourceAfterHover.tableScroll.scrollWidth >=
            customerSourceAfterHover.tableScroll.clientWidth &&
          (customerSourceAfterHover.tableScroll.scrollWidth <=
            customerSourceAfterHover.tableScroll.clientWidth + 1 ||
            ['auto', 'scroll'].includes(
              customerSourceAfterHover.tableScroll.overflowX
            ))
        assert(
          customerSourceAfterHover.width === customerSourceBeforeHover.width &&
            customerSourceAfterHover.height ===
              customerSourceBeforeHover.height &&
            customerSourceAfterHover.recordCellFits &&
            customerSourceAfterHover.countCellFits &&
            customerSourceAfterHover.entryButtonWithinCard &&
            tableScrollIsControlled &&
            (customerSourceAfterHover.backgroundColor !==
              customerSourceBeforeHover.backgroundColor ||
              customerSourceAfterHover.borderColor !==
                customerSourceBeforeHover.borderColor),
          `业务来源项 hover 应有反馈且不改变尺寸或产生溢出: ${JSON.stringify({
            before: customerSourceBeforeHover,
            after: customerSourceAfterHover,
          })}`
        )
        await customerSourceRow.screenshot({
          path: path.resolve(
            outputDir,
            'erp-business-dashboard-source-double-click-hover.png'
          ),
        })
        await customerSourceRow.dblclick()
        await waitForPath(page, '/erp/master/partners/customers')
        await page.goBack()
        await waitForPath(page, '/erp/business-dashboard')
        await expectHeading(page, '业务看板')
        await page
          .getByRole('button', { name: '查看客户', exact: true })
          .click()
        await waitForPath(page, '/erp/master/partners/customers')
        await page.goBack()
        await waitForPath(page, '/erp/business-dashboard')
        await expectHeading(page, '业务看板')
        await page.locator('.erp-admin-content').evaluate((node) => {
          node.scrollTop = 0
        })
      },
    },
    {
      name: 'erp-business-dashboard-dark-desktop',
      path: '/erp/business-dashboard',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectHeading(page, '业务看板')
        await expectText(page, '基础资料')
        await expectText(page, '业务数据')
        await expectText(page, '需要关注')
        await assertTextAbsent(page, '数字说明')
        await assertERPThemeMode(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          expectBusinessAttention: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
        })
        await assertDarkDashboardLinkButtonsUnboxed(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-business-board-attention-card',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-dashboard-table-card',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-business-board-alert-item',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-business-dashboard-page',
        })
      },
    },
    {
      name: 'erp-business-dashboard-stats-unavailable-desktop',
      path: '/erp/business-dashboard?__style_l1_business_dashboard_stats_unavailable=1',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '业务看板')
        await expectText(page, '业务统计暂不可用')
        await page
          .getByRole('group', { name: '阻塞，27 项', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const customerCount = await page
          .getByRole('button', { name: '查看客户', exact: true })
          .locator('xpath=ancestor::tr[1]')
          .locator('.erp-business-board-source-count')
          .textContent()
        assert.equal(String(customerCount || '').trim(), '—')
        await assertTextAbsent(page, '待办概览暂不可用')
        await assertTextAbsent(page, '当前页面数据已刷新')
        await page
          .locator('.erp-admin-header button')
          .filter({ hasText: '刷新当前页' })
          .click()
        await expectText(page, '当前页面数据已刷新')
        await page.waitForFunction(
          () =>
            String(
              document
                .querySelector('[aria-label="查看客户"]')
                ?.closest('.erp-business-board-source-item--openable')
                ?.querySelector('.erp-business-board-source-count')
                ?.textContent || ''
            ).trim() === '60',
          undefined,
          { timeout: 10_000 }
        )
        await page
          .locator('.erp-business-board-inline-alert')
          .filter({ hasText: '业务统计暂不可用' })
          .waitFor({ state: 'detached', timeout: 10_000 })
        await page
          .locator('.ant-message-notice')
          .last()
          .waitFor({ state: 'detached', timeout: 10_000 })
      },
    },
    {
      name: 'erp-business-dashboard-workflow-unavailable-desktop',
      path: '/erp/business-dashboard?__style_l1_business_dashboard_workflow_unavailable=1',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '业务看板')
        await expectText(page, '待办概览暂不可用')
        await expectText(page, '60')
        await page
          .getByRole('group', { name: '阻塞，暂不可用', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await assertTextAbsent(page, '业务统计暂不可用')
        await assertTextAbsent(page, '当前页面数据已刷新')
        await page
          .locator('.erp-admin-header button')
          .filter({ hasText: '刷新当前页' })
          .click()
        await expectText(page, '当前页面数据已刷新')
        await page
          .getByRole('group', { name: '阻塞，27 项', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page
          .locator('.erp-business-board-inline-alert')
          .filter({ hasText: '待办概览暂不可用' })
          .waitFor({ state: 'detached', timeout: 10_000 })
        await page
          .locator('.ant-message-notice')
          .last()
          .waitFor({ state: 'detached', timeout: 10_000 })
      },
    },
    {
      name: 'erp-business-dashboard-large-count-desktop',
      path: '/erp/business-dashboard?__style_l1_business_dashboard_large=1',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '业务看板')
        await expectText(page, '1,234,567')
        await page
          .getByRole('button', { name: '查看客户', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
      },
    },
    {
      name: 'erp-layout-scroll-isolated',
      path: '/erp/dashboard',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.locator('.erp-admin-menu').waitFor({ timeout: 10_000 })
        await page.locator('.erp-admin-content').waitFor({ timeout: 10_000 })
        const result = await page.evaluate(() => {
          const menu = document.querySelector('.erp-admin-menu')
          const content = document.querySelector('.erp-admin-content')
          if (!menu || !content) {
            return { ok: false, reason: 'missing menu or content container' }
          }

          const menuStyle = window.getComputedStyle(menu)
          const beforeMenuTop = menu.getBoundingClientRect().top
          const beforeMenuScroll = menu.scrollTop
          content.scrollTop = 480
          const afterMenuTop = menu.getBoundingClientRect().top
          const afterMenuScroll = menu.scrollTop

          return {
            ok:
              menuStyle.overflowY === 'auto' &&
              Math.abs(beforeMenuTop - afterMenuTop) < 1 &&
              beforeMenuScroll === afterMenuScroll,
            reason: {
              overflowY: menuStyle.overflowY,
              beforeMenuTop,
              afterMenuTop,
              beforeMenuScroll,
              afterMenuScroll,
            },
          }
        })

        assert(
          result.ok,
          `侧栏与内容滚动未隔离: ${JSON.stringify(result.reason)}`
        )
      },
    },
    {
      name: 'erp-dashboard-mobile',
      path: '/erp/dashboard',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '超级管理员')
        await expectText(page, '业务管理')
        await expectText(page, '系统功能总览')
        await expectText(page, '业务功能')
        await expectText(page, '系统设置')
        await assertTextAbsent(page, '内部来源')
        await assertTextAbsent(page, '优先处理队列')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-mobile',
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-dashboard-mobile',
        })
      },
    },
    {
      name: 'erp-task-board-mobile',
      path: '/erp/task-board',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.assign',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
        },
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-mobile-task',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-mobile-task',
                task_group: 'trial_warehouse_work',
                task_name: '移动端任务处理回归',
                source_type: 'shipping-release',
                source_id: 9050,
                source_no: 'OUT-DASH-MOBILE',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'warehouse',
                payload: { notification_type: 'task_created' },
              },
            }),
          })
          const body = await response.json()
          if (!response.ok || body?.result?.code !== 0) {
            throw new Error(
              `create mobile task failed: ${JSON.stringify(body)}`
            )
          }
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '移动端任务处理回归')
        await expectText(page, '超级管理员')
        await expectText(page, '业务管理')
        await expectText(page, '任务看板')
        await expectText(page, '常规待办')
        await expectText(page, '到期提醒')
        await assertTextAbsent(page, '当前选中任务')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-task-board-mobile',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-task-board-mobile',
          expectTaskCategories: true,
        })
        const mobileFilterMetrics = await page
          .locator('.erp-task-board-filters')
          .evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            controlWidths: [
              element.querySelector('.erp-business-filter-control--search'),
              ...element.querySelectorAll(':scope > .ant-select'),
              [...element.querySelectorAll(':scope > .ant-btn')].find((node) =>
                node.textContent?.includes('清空筛选')
              ),
            ]
              .filter(Boolean)
              .map((node) => node.getBoundingClientRect().width),
          }))
        assert(
          mobileFilterMetrics.scrollWidth <=
            mobileFilterMetrics.clientWidth + 1 &&
            mobileFilterMetrics.controlWidths.length === 5 &&
            mobileFilterMetrics.controlWidths.every(
              (width) =>
                width >= mobileFilterMetrics.clientWidth - 1 &&
                width <= mobileFilterMetrics.clientWidth + 1
            ),
          `移动端任务筛选控件应保持整行触控且不溢出: ${JSON.stringify(
            mobileFilterMetrics
          )}`
        )
        await page.locator('.erp-task-board-filters').screenshot({
          path: path.resolve(outputDir, 'erp-task-board-mobile-filters.png'),
        })
        await page
          .getByRole('button', {
            name: '查看移动端任务处理回归详情',
            exact: true,
          })
          .click()
        const mobileAssignmentDrawer = page.locator('.erp-task-action-drawer')
        await mobileAssignmentDrawer.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await mobileAssignmentDrawer
          .getByRole('tab', { name: /选择处理/ })
          .click()
        await mobileAssignmentDrawer
          .getByRole('radio', { name: /转交任务/ })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await mobileAssignmentDrawer
          .getByRole('radio', { name: /转交任务/ })
          .click()
        await mobileAssignmentDrawer
          .getByRole('combobox', { name: '转交去向' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await mobileAssignmentDrawer
          .locator('.erp-task-action-drawer__assignment')
          .scrollIntoViewIfNeeded()
        await assertNoHorizontalOverflow(
          page,
          'erp-task-board-mobile-assignment'
        )
        await page.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-mobile-assignment.png'),
        })
      },
    },
    {
      name: 'erp-dashboard-dark-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectText(page, '系统功能总览')
        await expectText(page, '业务功能')
        await expectText(page, '不显示客户业务数据')
        await assertTextAbsent(page, '优先处理队列')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          selector: '.erp-admin-header',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          selector: '.erp-dashboard-card',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          selector: '.erp-admin-shell',
        })
      },
    },
    {
      name: 'erp-task-board-dark-wide-desktop',
      path: '/erp/task-board',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-task-board-dark-wide',
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.reject',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
          'workflow.task.reject': ['warehouse'],
        },
      },
      themeMode: 'dark',
      viewport: { width: 2048, height: 1024 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectText(page, '任务看板')
        await expectText(page, '常规待办')
        await assertTextAbsent(page, '内部来源')
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-wide-layout-task',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-wide-layout',
                task_group: 'trial_warehouse_work',
                task_name: '宽屏重叠回归任务',
                source_type: 'shipping-release',
                source_id: 9020,
                source_no: 'OUT-DASH-WIDE-LAYOUT',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'warehouse',
                payload: {
                  notification_type: 'task_created',
                  alert_type: 'shipment_pending',
                },
              },
            }),
          })
          return response.json()
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '宽屏重叠回归任务')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
          expectTaskCategories: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await page
          .locator('.erp-dashboard-task-board-card')
          .scrollIntoViewIfNeeded()
        await assertDashboardTaskBoardLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
        })
        await page
          .getByPlaceholder('订单 / 产品 / 物料 / 款号')
          .fill('OUT-DASH-WIDE-LAYOUT')
        await page
          .getByPlaceholder('订单 / 产品 / 物料 / 款号')
          .press('Enter')
        await expectText(page, '宽屏重叠回归任务')
        await assertTextAbsent(page, '当前选中任务')
        await page
          .getByRole('button', {
            name: '查看宽屏重叠回归任务详情',
            exact: true,
          })
          .click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-context-drawer',
          expectedTaskText: '宽屏重叠回归任务',
          expectReasonInput: false,
        })
        await page
          .locator('.erp-task-action-drawer')
          .getByRole('tab', { name: /选择处理/ })
          .click()
        await page
          .locator('.erp-task-action-drawer')
          .getByRole('radio', { name: /处理完成/ })
          .click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-complete-action',
          expectedTaskText: '宽屏重叠回归任务',
          expectedActionText: '提交后任务会进入已完成',
          expectReasonInput: false,
        })
        const wideTaskDrawer = page.locator('.erp-task-action-drawer')
        const responsibilityEmphasis = await wideTaskDrawer
          .locator('.erp-task-action-drawer__responsibility')
          .evaluate((node) => {
            const role = node.querySelector(
              '.erp-task-action-drawer__responsibility-role'
            )
            const person = node.querySelector(
              '.erp-task-action-drawer__responsibility-person'
            )
            const roleStyle = role ? getComputedStyle(role) : null
            const personStyle = person ? getComputedStyle(person) : null
            return {
              roleWeight: Number(roleStyle?.fontWeight || 0),
              personWeight: Number(personStyle?.fontWeight || 0),
              roleSize: Number.parseFloat(roleStyle?.fontSize || '0'),
              personSize: Number.parseFloat(personStyle?.fontSize || '0'),
              roleColor: roleStyle?.color || '',
              personColor: personStyle?.color || '',
            }
          })
        assert(
          responsibilityEmphasis.roleWeight >= 700 &&
            responsibilityEmphasis.personWeight <= 400 &&
            responsibilityEmphasis.roleSize >
              responsibilityEmphasis.personSize &&
            responsibilityEmphasis.roleColor !==
              responsibilityEmphasis.personColor,
          `负责人岗位必须以可感知的字号、字重和中性色区别于处理人: ${JSON.stringify(
            responsibilityEmphasis
          )}`
        )
        await wideTaskDrawer.getByRole('tab', { name: /确认与结果/ }).click()
        await expectText(wideTaskDrawer, '提交后会发生什么')
        await expectText(
          wideTaskDrawer,
          '确认后只完成当前任务；相关业务是否办结以对应业务页面为准。'
        )
        assert.equal(
          await wideTaskDrawer
            .locator('.erp-task-action-drawer__outcome-note .ant-alert-icon')
            .count(),
          0,
          '普通提交结果说明不应重复显示圆形提示图标'
        )
        assert.equal(
          await wideTaskDrawer
            .locator('.erp-task-action-drawer__outcome-note.ant-alert')
            .count(),
          0,
          '普通提交结果说明不应使用 Alert 卡片'
        )
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-complete-confirmation',
          expectedTaskText: '宽屏重叠回归任务',
          expectedActionText: '即将提交',
          expectReasonInput: false,
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-dark-wide-action-drawer.png'
          ),
        })
        await page.locator('.erp-task-action-drawer .ant-drawer-close').click()
        await page
          .locator('.erp-task-action-drawer')
          .waitFor({ state: 'hidden', timeout: 10_000 })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
          selector: '.erp-admin-shell',
        })
      },
    },
    {
      name: 'business-module-dark-customers-desktop',
      path: '/erp/master/partners/customers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 2048, height: 1024 },
      verify: async (page) => {
        await expectHeading(page, '客户档案')
        await expectText(page, '启用客户')
        await expectText(page, '当前操作')
        await expectText(page, '新建客户')
        await assertERPThemeMode(page, {
          scenarioName: 'business-module-dark-customers-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await page
          .locator('.ant-table-row')
          .filter({ hasText: '暗色客户' })
          .first()
          .click()
        assert.equal(
          await page.locator('.erp-business-collaboration-task-panel').count(),
          0,
          'business-module-dark-customers-desktop 客户档案不应展示空的任务面板'
        )
        await assertDarkThemeContrast(page, {
          scenarioName: 'business-module-dark-customers-desktop',
          selector: '.erp-business-page-layout',
        })
        await assertDarkThemeNeutralInteractions(page, {
          scenarioName: 'business-module-dark-customers-desktop',
          checks: [
            {
              label: '主数据搜索输入 hover',
              selector:
                '.erp-business-page-layout .erp-business-filter-control',
              action: 'hover',
            },
            {
              label: '主数据搜索输入 focus',
              selector:
                '.erp-business-page-layout .erp-business-filter-control',
              action: 'click',
            },
            {
              label: '主数据普通按钮 hover',
              selector:
                '.erp-business-page-layout .ant-btn:not(.ant-btn-primary)',
              action: 'hover',
            },
            {
              label: '主数据表头 hover',
              selector: '.erp-business-page-layout .ant-table-thead > tr > th',
              action: 'hover',
              index: 1,
            },
          ],
        })
      },
    },
  ]
}
