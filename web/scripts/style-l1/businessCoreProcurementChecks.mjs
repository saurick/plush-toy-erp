import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreProcurement(page, deps) {
  const {
    assert,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessHeaderCompact,
    assertBusinessMainTableSortableColumns,
    assertNoHorizontalOverflow,
    assertOrderLifecycleActionsConsolidated,
    assertOutsourcingProcessSelectOptions,
    assertProcessSuggestionOptions,
    assertTextAbsent,
    expectButton,
    expectHeading,
    expectNoButton,
    expectText,
    gotoScenarioPath,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickModal,
  } = deps
  const {
    assertLineItemAddActionScrollsToNewRow,
    findSelectionActionButton,
    assertLineItemSectionTitleBold,
    assertNonItemTextareaFullRow,
    assertBusinessCollaborationPanelAbsent,
    assertUnifiedListToolbarShell,
    assertNoListDeleteTrashToolbar,
    assertCurrentOperationBarCompact,
  } = createBusinessFormalAssertions(deps)
  await gotoScenarioPath(page, '/erp/engineering/processes', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '加工环节')

  const processOuterPageHeadCount = await page
    .locator('.erp-admin-page-head')
    .count()

  assert.equal(
    processOuterPageHeadCount,
    0,
    'business-formal-processes 不应同时显示外层页头和内容区页头'
  )

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-processes',
  })

  await expectText(page, '查货')

  await expectText(page, '手工')

  await expectText(page, '车缝')

  await expectText(page, '包装')

  await expectText(page, '可委外')

  await expectText(page, '可内制')

  await verifyBusinessActionFormModal(page, {
    buttonName: '新建加工环节',
    titleText: '新建加工环节',
    minFieldCount: 8,
    screenshotName: 'business-formal-process-create-form-modal',
    expectedTexts: [
      '环节编号',
      '环节名称',
      '环节类别',
      '可委外',
      '可内制',
      '质检参考',
      '可与“可内制”同时开启',
      '仅供查阅该工序通常是否需要检验',
    ],
    afterOpen: async (modal) => {
      await assertProcessSuggestionOptions(page, modal, {
        scenarioName: 'business-formal-processes',
      })
    },
  })

  await verifyBusinessModuleColumnOrderDialog(page, {
    moduleKey: 'processes',
    heading: '加工环节',
    headerMenuTargetLabel: '环节名称',
  })

  await assertNoHorizontalOverflow(page, 'business-formal-processes')

  await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '委外订单')

  await expectButton(page, '新建加工合同')

  await expectButton(page, '导出筛选结果')

  await expectButton(page, '列设置')

  await assertNoListDeleteTrashToolbar(page)

  await assertTextAbsent(page, '业务单据：加工合同')

  await assertTextAbsent(page, '加工合同只表达委外承诺和打印快照')

  await assertTextAbsent(page, '查货只是工序候选')

  await assertTextAbsent(page, '判定结果回质检模块')

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-formal-processing-contracts-unselected'
  )

  await assertCurrentOperationBarCompact(page, {
    scenarioName: 'business-formal-processing-contracts',
  })

  await assertBusinessHeaderCompact(page, {
    scenarioName: 'business-formal-processing-contracts',
  })

  await assertNoListDeleteTrashToolbar(page)

  await verifyBusinessModuleColumnOrderDialog(page, {
    moduleKey: 'processing-contracts',
    heading: '委外订单',
  })

  await assertBusinessMainTableSortableColumns(page, {
    scenarioName: 'business-formal-processing-contracts',
    unsortableHeaders: ['备注'],
  })

  await assertTextAbsent(page, '生成委外合同')

  await expectNoButton(page, '作业指导书打印')

  await expectNoButton(page, '打印作业指导书')

  let processingContractPrintButton = await findSelectionActionButton(
    page,
    '加工合同打印'
  )

  assert(
    await processingContractPrintButton.isDisabled(),
    '未选中加工合同前，加工合同打印按钮应保持禁用'
  )

  await page.keyboard.press('Escape')

  const processingContractRow = page
    .getByRole('row')
    .filter({ hasText: 'SIM-OUTSOURCE-CONTRACT-L1' })
    .first()

  await processingContractRow.click()

  await processingContractRow
    .and(page.locator('.ant-table-row-selected'))
    .waitFor({ state: 'visible' })

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-formal-processing-contracts-selected-without-tasks'
  )

  assert.equal(
    await page
      .getByRole('button', { name: /^(关联|相关单据|查看关联)/ })
      .count(),
    0,
    '加工合同页当前操作区不应保留跨模块相关单据下拉，避免加工页承接质检、库存或应付事实'
  )

  processingContractPrintButton = await findSelectionActionButton(
    page,
    '加工合同打印'
  )

  const processingContractActionMetrics = await page
    .locator('.erp-business-module-current-action')
    .first()
    .evaluate((node) => ({
      text: String(node.textContent || '')
        .replace(/\s+/gu, ' ')
        .trim(),
      selectedTag:
        node
          .querySelector('.erp-business-module-selection-tag')
          ?.textContent?.replace(/\s+/gu, ' ')
          .trim() || '',
      actions: Array.from(
        document.querySelectorAll('[data-business-action-key]')
      ).map((button) => ({
        key: button.getAttribute('data-business-action-key'),
        disabled: button.disabled,
        visible: Boolean(button.offsetWidth || button.offsetHeight),
      })),
    }))

  assert.equal(
    await processingContractPrintButton.isDisabled(),
    false,
    `选中加工合同后，加工合同打印按钮应启用: ${JSON.stringify(
      processingContractActionMetrics
    )}`
  )

  await page.keyboard.press('Escape')

  await assertOrderLifecycleActionsConsolidated(page, {
    scenarioName: 'business-formal-processing-contracts',
    primaryActionLabel: '提交合同',
    menuActionLabels: ['取消'],
    absentButtonLabels: ['确认下单', '关闭', '取消'],
  })

  await page.keyboard.press('Escape')

  await assertTextAbsent(page, '打印单据')

  await assertBusinessFormModalKeyboardRecovery(page, {
    triggerName: '新建加工合同',
    titleText: '新建加工合同',
    scenarioName: 'business-formal-processing-contracts',
  })

  await verifyBusinessActionFormModal(page, {
    buttonName: '新建加工合同',
    titleText: '新建加工合同',
    minFieldCount: 6,
    screenshotName: 'business-formal-outsourcing-order-create-form-modal',
    expectedTexts: [
      '加工合同号',
      '加工厂',
      '加工明细',
      '产品订单编号',
      '加工项目',
      '工序',
      '单位',
      '工序选择电绣、激光等加工方式',
    ],
    afterOpen: async (modal) => {
      await assertNonItemTextareaFullRow(modal, {
        labels: ['备注'],
        scenarioName: 'business-formal-processing-contracts-form-modal',
      })
      await assertOutsourcingProcessSelectOptions(page, modal, {
        scenarioName: 'business-formal-processing-contracts',
      })
      await assertLineItemSectionTitleBold(modal, {
        scenarioName: 'business-formal-processing-contracts-form-modal',
        titleText: '加工明细',
      })
      await assertLineItemAddActionScrollsToNewRow(modal, {
        scenarioName: 'business-formal-processing-contracts-form-modal',
        addButtonName: '添加加工明细',
      })
    },
  })

  await assertTextAbsent(page, '销售订单ID')

  await assertTextAbsent(page, '单位ID')

  await assertTextAbsent(page, '产品编号快照')

  await verifyBusinessRowDoubleClickModal(page, {
    rowText: 'SIM-OUTSOURCE-CONTRACT-L1',
    titleText: '编辑加工合同',
    scenarioName: 'business-formal-processing-contracts',
    afterModalOpen: async () => {
      await expectText(page, '加工明细')
      await page
        .getByRole('button', { name: '添加加工明细', exact: true })
        .waitFor({ state: 'visible', timeout: 10_000 })
    },
  })

  await assertNoHorizontalOverflow(page, 'business-formal-processing-contracts')
}
