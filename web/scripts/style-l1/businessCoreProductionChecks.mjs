import { createBusinessAttachmentAssertions } from './businessAttachmentAssertions.mjs'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreProduction(page, deps) {
  const {
    assert,
    assertAntdModalCentered,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectNoButton,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
  } = deps
  const {
    findSelectionActionButton,
    assertBusinessCollaborationPanelAbsent,
    assertUnifiedListToolbarShell,
    assertWorkflowDueDateRangeFilterLayout,
  } = createBusinessFormalAssertions(deps)
  const { assertPageAttachmentModalEntrypoint } =
    createBusinessAttachmentAssertions({
      assert,
      assertAntdModalCentered,
    })
  const verifyWorkflowPage = async ({
    path,
    heading,
    absentTexts,
    scenarioName,
    refreshMessage,
    afterPageReady,
  }) => {
    await gotoScenarioPath(page, path, {
      waitUntil: 'domcontentloaded',
    })
    await expectHeading(page, heading)
    await assertTextAbsent(page, '业务处理分开完成')
    await assertBusinessCollaborationPanelAbsent(page, scenarioName)
    for (const text of absentTexts) {
      await assertTextAbsent(page, text)
    }
    await assertTextAbsent(page, '导出预览字段')
    await assertTextAbsent(page, '打印单据')
    await assertTextAbsent(page, '加工合同打印')
    if (afterPageReady) {
      await afterPageReady()
    }
    await assertUnifiedListToolbarShell(page, {
      scenarioName,
      exportVisible: false,
    })
    await page.getByRole('button', { name: '刷新当前页' }).click()
    const expectedRefreshMessage = refreshMessage || `${heading}任务已刷新`
    await expectText(page, expectedRefreshMessage)
    await expectNoButton(page, '删除')
    await assertNoHorizontalOverflow(page, scenarioName)
  }

  await gotoScenarioPath(page, '/erp/production/orders', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '生产订单')

  await expectText(page, 'MO-STYLE-L1-20260713')

  await expectButton(page, '新建生产订单')

  await page.getByText('MO-STYLE-L1-20260713', { exact: true }).click()

  await expectButton(page, '编辑')

  await expectButton(page, /^发\s*布$/u)

  await page.getByText('MO-STYLE-L1-20260713', { exact: true }).dblclick()

  const productionOrderModal = page
    .locator('.erp-business-form-page:not([hidden])')
    .filter({ hasText: '编辑生产订单' })

  await expectText(page, '编辑生产订单')

  await expectText(page, '销售订单行（可选）')

  await expectText(page, 'BOM 版本（可选）')

  assert.equal(
    await productionOrderModal.locator('.erp-production-order-line').count(),
    22,
    '生产订单编辑页应完整加载 22 条生产明细'
  )

  await productionOrderModal
    .locator('.erp-production-order-line[aria-label="生产明细 22"]')
    .waitFor({ state: 'visible' })

  await assertNoHorizontalOverflow(page, 'business-production-orders')

  await closeBusinessFormModal(page, productionOrderModal)

  await verifyWorkflowPage({
    path: '/erp/production/scheduling',
    heading: '生产订单',
    refreshMessage: '排产确认任务已刷新',
    absentTexts: ['发起排程协同', '新建排程单', '生成生产任务'],
    scenarioName: 'business-workflow-production-scheduling',
    afterPageReady: async () => {
      await expectText(page, '暂无排产确认任务。')
    },
  })

  await gotoScenarioPath(page, '/erp/production/exceptions', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '生产记录')

  const productionExceptionDecisionTab = page.getByRole('tab', {
    name: '异常处理',
  })

  const productionExceptionTaskTab = page.getByRole('tab', {
    name: '待审批',
  })

  await productionExceptionDecisionTab.waitFor({ state: 'visible' })

  assert.equal(
    await productionExceptionDecisionTab.getAttribute('aria-selected'),
    'true',
    '生产异常处置页默认应进入处置申请，不再同时纵向铺开待审批任务'
  )

  assert.equal(
    await productionExceptionTaskTab.getAttribute('aria-selected'),
    'false',
    '待审批应作为独立未选中页签'
  )

  await expectText(page, '暂无生产异常处置申请')

  await expectText(page, '异常处理')

  await assertTextAbsent(page, '异常记录')
  await assertTextAbsent(page, '当前显示')

  assert.equal(
    await page.getByLabel('搜索待办任务').count(),
    0,
    '处置申请页签不应挂载待审批任务筛选区'
  )

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-production-exceptions-decisions-tab'
  )

  await expectButton(page, '列设置')

  await expectNoButton(page, '导出筛选结果')

  for (const text of [
    '登记异常协同',
    '新建异常单',
    '关闭异常单',
    '生成异常处理',
    '打印单据',
  ]) {
    await assertTextAbsent(page, text)
  }

  await page.getByRole('button', { name: '刷新当前页' }).click()

  await expectText(page, '异常处理申请已刷新')

  await assertNoHorizontalOverflow(
    page,
    'business-production-exceptions-decisions-tab'
  )

  await page.screenshot({
    path: path.join(
      outputDir,
      'business-production-exceptions-decisions-tab.png'
    ),
    fullPage: true,
  })

  await page
    .getByText('异常处理申请已刷新', { exact: true })
    .waitFor({ state: 'hidden', timeout: 6_000 })

  await productionExceptionTaskTab.click()

  await expectText(page, '暂无待审批的生产异常处置申请。')

  assert.equal(
    await productionExceptionTaskTab.getAttribute('aria-selected'),
    'true',
    '待审批页签点击后应成为唯一活动工作区'
  )

  await assertTextAbsent(page, '暂无生产异常处置申请')

  await expectButton(page, '列设置')

  await expectNoButton(page, '导出筛选结果')

  await page.getByRole('button', { name: '刷新当前页' }).click()

  await expectText(page, '异常处理任务已刷新')

  await expectNoButton(page, '删除')

  await assertNoHorizontalOverflow(
    page,
    'business-production-exceptions-tasks-tab'
  )

  await page.screenshot({
    path: path.join(outputDir, 'business-production-exceptions-tasks-tab.png'),
    fullPage: true,
  })

  await page.evaluate(async () => {
    const response = await fetch('/rpc/workflow', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'formal-shipping-release-other-source-task',
        method: 'create_task',
        params: {
          task_code: 'style-l1-formal-shipping-release-other',
          task_group: 'customer_followup',
          task_name: '同来源非放行任务',
          source_type: 'shipping-release',
          source_id: 9102,
          source_no: 'SHIP-REL-OTHER',
          business_status_key: 'shipment_pending',
          task_status_key: 'ready',
          owner_role_key: 'sales',
          payload: {
            shipment_release_page_scope: 'not_for_release_page',
          },
        },
      }),
    })
    return response.json()
  })

  await verifyWorkflowPage({
    path: '/erp/warehouse/shipping-release',
    heading: '放行审批',
    absentTexts: ['发起放行协同', '新建放行单', '生成出货放行', '确认放行'],
    scenarioName: 'business-workflow-shipping-release',
    refreshMessage: '出货放行任务已刷新',
    afterPageReady: async () => {
      await assertWorkflowDueDateRangeFilterLayout(page, {
        scenarioName: 'business-workflow-shipping-release',
      })
      const shippingReleaseTaskRow = page
        .locator(
          '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
        )
        .filter({ hasText: 'SHIP-REL-L1' })
        .first()
      await shippingReleaseTaskRow.waitFor({ state: 'visible' })
      await shippingReleaseTaskRow
        .getByText('可执行', { exact: true })
        .waitFor({ state: 'visible' })
      await expectText(page, '出货财务审批确认')
      await expectText(page, 'SHIP-REL-L1')
      await assertTextAbsent(page, '同来源非放行任务')
      await assertTextAbsent(page, 'SHIP-REL-OTHER')
      await shippingReleaseTaskRow.click()
      await assertPageAttachmentModalEntrypoint(page, {
        scenarioName: 'business-workflow-shipping-release-attachment-modal',
        modalTitle: '任务附件',
        panelTitle: '任务附件',
      })

      let failedListTasksOnce = false
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON() || {}
        if (!failedListTasksOnce && body.method === 'list_tasks') {
          failedListTasksOnce = true
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id || 'formal-shipping-release-list-failed',
              result: {
                code: 500123,
                message: 'shipping release list failed',
                data: null,
              },
            }),
          })
          return
        }
        await route.fallback()
      })
      await page.getByRole('button', { name: '刷新当前页' }).click()
      await expectText(page, '加载出货放行任务失败')
      await expectText(page, '暂无出货财务审批任务。')
      await assertTextAbsent(page, '出货财务审批确认')

      await page.getByRole('button', { name: '刷新当前页' }).click()
      await expectText(page, '出货财务审批刷新后确认')
      await expectText(page, 'SHIP-REL-STALE')

      const refreshedTaskRow = page
        .locator(
          '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
        )
        .filter({ hasText: '出货财务审批刷新后确认' })
        .first()
      await refreshedTaskRow.click()
      const viewTaskButton = await findSelectionActionButton(page, '查看任务')
      assert.equal(
        await viewTaskButton.isDisabled(),
        false,
        '选中主任务表记录后应允许查看当前任务'
      )
      const actionMenu = page.locator(
        '.erp-business-selection-action-menu:visible'
      )
      if (await actionMenu.count()) {
        await page.keyboard.press('Escape')
        await actionMenu.waitFor({ state: 'hidden' })
      }
      await expectNoButton(page, '处理')

      let emptiedListTasksOnce = false
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON() || {}
        if (!emptiedListTasksOnce && body.method === 'list_tasks') {
          emptiedListTasksOnce = true
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id || 'formal-shipping-release-list-empty',
              result: {
                code: 0,
                message: 'OK',
                data: {
                  tasks: [],
                  total: 0,
                  limit: 100,
                  offset: 0,
                },
              },
            }),
          })
          return
        }
        await route.fallback()
      })
      await page.getByRole('button', { name: '刷新当前页' }).click()
      await expectText(page, '出货放行任务已刷新')
      await page.waitForFunction(() => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          )
        }
        return Array.from(
          document.querySelectorAll(
            '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
          )
        )
          .filter(isVisible)
          .every(
            (node) =>
              !String(node.textContent || '').includes('出货财务审批刷新后确认')
          )
      })
      const staleTaskMetrics = await page.evaluate(() => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          )
        }
        const visibleTaskTexts = Array.from(
          document.querySelectorAll(
            '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
          )
        )
          .filter(isVisible)
          .map((node) =>
            String(node.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim()
          )
        return {
          visibleTaskTexts,
          staleTaskVisible: visibleTaskTexts.some((text) =>
            text.includes('出货财务审批刷新后确认')
          ),
        }
      })
      assert.equal(
        staleTaskMetrics.staleTaskVisible,
        false,
        `刷新后不应继续显示已消失的协同任务: ${JSON.stringify(staleTaskMetrics)}`
      )
    },
  })

  await gotoScenarioPath(page, '/erp/production/progress', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '生产记录')

  await expectText(page, 'PROD-FACT-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-production-progress',
  })

  await assertTextAbsent(page, '生成生产进度')

  await assertTextAbsent(page, '登记生产事实')

  await assertTextAbsent(page, '幂等键')

  await assertTextAbsent(page, '内部引用')

  const productionDraftRow = page
    .locator('.erp-business-data-table-card .ant-table-tbody .ant-table-row')
    .filter({ hasText: 'PROD-FACT-L1' })
    .first()

  await productionDraftRow.click()

  await productionDraftRow
    .and(page.locator('.ant-table-row-selected'))
    .waitFor({ state: 'visible' })

  const cancelProductionDraftButton = await findSelectionActionButton(
    page,
    '作废完工报告'
  )

  assert.equal(await cancelProductionDraftButton.isDisabled(), false)

  await cancelProductionDraftButton.click()

  const cancelProductionDraftModal = page
    .locator('.ant-modal:visible')
    .filter({ hasText: '作废生产完工报告' })

  await cancelProductionDraftModal.waitFor({ state: 'visible' })

  await cancelProductionDraftModal
    .locator('textarea')
    .fill('L1 回归：确认未过账生产草稿可追溯作废')

  await cancelProductionDraftModal
    .getByRole('button', { name: '作废完工报告' })
    .click()

  await expectText(page, '作废生产完工报告已完成')

  await assertNoHorizontalOverflow(page, 'business-formal-production-progress')

  await page.getByRole('menuitem', { name: /财务管理/u }).click()

  await page
    .locator('.erp-business-module-tabs')
    .getByRole('tab', { name: '对账', exact: true })
    .click()

  await expectHeading(page, '对账')

  await expectText(page, 'REC-STYLE-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-production-to-reconciliation-navigation',
  })

  await assertTextAbsent(page, '登记对账事实')

  await assertTextAbsent(page, '生成对账')

  await assertNoHorizontalOverflow(
    page,
    'business-formal-production-to-reconciliation-navigation'
  )

  await gotoScenarioPath(page, '/erp/warehouse/outbound', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '库存预留')

  await expectText(page, 'RSV-STYLE-L1')

  await expectText(page, 'SO-RESERVATION-STYLE-L1')

  await expectText(page, '第 3 行')

  await expectText(page, '库存预留毛绒兔')

  await expectText(page, 'SKU-RESERVATION-STYLE-L1')

  await expectText(page, '成品仓')

  await expectText(page, 'LOT-RESERVATION-STYLE-L1')

  await expectText(page, '件')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-outbound-reservations',
  })

  await assertTextAbsent(page, '登记库存预留')

  await assertTextAbsent(page, '新建出货单')

  await assertTextAbsent(page, '生成出库')

  for (const technicalField of [
    'sales_order_id',
    'sales_order_item_id',
    'product_id',
    'product_sku_id',
    'warehouse_id',
    'unit_id',
    'lot_id',
  ]) {
    await assertTextAbsent(page, technicalField)
  }

  await expectNoButton(page, '消耗')

  await assertNoHorizontalOverflow(page, 'business-formal-outbound')
}
