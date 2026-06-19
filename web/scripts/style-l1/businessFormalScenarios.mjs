export function createBusinessFormalScenarios(deps) {
  const {
    assert,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessHeaderHasNoSectionTitle,
    assertBusinessHeaderStatsSingleLine,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessMainTableInitialSelectionEmpty,
    assertBusinessMainTableSortableColumns,
    assertBusinessPageRefreshEntrypoint,
    assertBusinessToolbarDisabledButtons,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertOperationalFactModalViewport,
    assertOrderLifecycleActionsConsolidated,
    assertOutsourcingProcessSelectOptions,
    assertProcessSuggestionOptions,
    assertTextAbsent,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectNoButton,
    expectText,
    gotoScenarioPath,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickEditModal,
    verifyFormalShellRowDoubleClickEditModal,
    verifySourceImportPicker,
  } = deps

  return [
    {
      name: 'business-formal-module-shells-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        await expectButton(page, '新建供应商')
        await expectText(page, '当前操作')
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-suppliers',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-suppliers',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建供应商',
          titleText: '新建供应商档案',
          scenarioName: 'business-v1-suppliers',
        })
        await assertNoHorizontalOverflow(page, 'business-standard-suppliers')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建供应商',
          titleText: '新建供应商档案',
          minFieldCount: 5,
          screenshotName: 'business-v1-suppliers-form-modal',
          expectedTexts: ['供应商类型', '联系人', '添加条目'],
        })
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: '样式供应商',
          titleText: '编辑供应商',
          scenarioName: 'business-v1-suppliers',
          afterModalOpen: async () => {
            await expectText(page, '联系人')
            await expectButton(page, '添加条目')
          },
        })

        await gotoScenarioPath(page, '/erp/master/partners/customers', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '客户档案')
        await expectButton(page, '新建客户')
        await expectText(page, '当前操作')
        await expectText(page, '暗色客户')
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-customers',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-v1-customers',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-customers',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建客户',
          titleText: '新建客户档案',
          scenarioName: 'business-v1-customers',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建客户',
          titleText: '新建客户档案',
          minFieldCount: 5,
          screenshotName: 'business-v1-customers-form-modal',
          expectedTexts: ['联系人', '添加条目'],
        })
        await assertNoHorizontalOverflow(page, 'business-standard-customers')
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: '暗色客户',
          titleText: '编辑客户',
          scenarioName: 'business-v1-customers',
          afterModalOpen: async () => {
            await expectText(page, '联系人')
            await expectButton(page, '添加条目')
          },
        })

        await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '销售订单')
        await expectButton(page, '新建订单')
        await expectText(page, '当前操作')
        await expectText(page, '订单行')
        await expectText(page, '本页协同')
        await assertBusinessToolbarDisabledButtons(page, {
          scenarioName: 'business-v1-sales-orders',
          labels: ['批量删除', '回收站'],
        })
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
        await assertOrderLifecycleActionsConsolidated(page, {
          scenarioName: 'business-v1-sales-orders',
          primaryActionLabel: '提交',
          menuActionLabels: ['取消'],
          absentButtonLabels: ['生效', '关闭', '取消'],
        })
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建订单',
          titleText: '新建销售订单',
          scenarioName: 'business-v1-sales-orders',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建订单',
          titleText: '新建销售订单',
          minFieldCount: 6,
          screenshotName: 'business-v1-sales-order-form-modal',
          expectedTexts: ['SKU / 产品来源', '带出产品 / 单位'],
          absentTexts: ['产品引用 ID', '单位引用 ID'],
          afterOpen: async (modal) => {
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从 SKU 库导入',
              titleText: '从 SKU 库导入订单行',
              expectedTexts: ['SKU 编码', '产品名称', 'SKU-STYLE-L1'],
              emptyDescriptionText: '暂无可导入 SKU',
              selectText: 'SKU-STYLE-L1',
              scenarioName: 'sales-order-source-import-picker',
            })
          },
        })
        await assertNoHorizontalOverflow(page, 'business-standard-sales-orders')
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: 'SO-STYLE-L1',
          titleText: '编辑销售订单',
          scenarioName: 'business-v1-sales-orders',
          afterModalOpen: async () => {
            await expectText(page, '订单行')
            await expectText(page, 'SKU / 产品来源')
            await expectText(page, '带出产品 / 单位')
            await assertTextAbsent(page, '产品引用 ID')
            await assertTextAbsent(page, '单位引用 ID')
          },
        })

        await gotoScenarioPath(page, '/erp/master/products', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '产品档案')
        await expectText(page, '产品基础信息')
        await expectText(page, '产品规格')
        await expectButton(page, '新建产品')
        await expectText(page, '批量删除')
        await expectText(page, '回收站')
        await expectText(page, 'PROD-STYLE-L1')
        await expectText(page, 'BEAR-STYLE')
        await expectText(page, '当前操作')
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-standard-products',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-standard-products',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'business-standard-products',
          expectedLabels: ['总产品', '当前结果', '启用产品', '已选产品'],
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-standard-products',
        })
        await assertBusinessToolbarDisabledButtons(page, {
          scenarioName: 'business-standard-products',
          labels: ['批量删除', '回收站'],
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'products',
          heading: '产品档案',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建产品',
          titleText: '新建产品',
          scenarioName: 'business-standard-products',
        })
        await page.getByRole('button', { name: '新建产品' }).click()
        await expectText(page, '新建产品')
        await expectText(page, '产品编号')
        await expectText(page, '默认单位')
        await assertTextAbsent(page, '默认单位 ID')
        await closeBusinessFormModal(
          page,
          page
            .locator('.erp-business-action-modal--form.ant-modal:visible')
            .last()
        )
        await page.getByText('产品规格', { exact: true }).click()
        await expectButton(page, '新建产品规格')
        await expectText(page, 'SKU-STYLE-L1')
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-standard-product-skus',
        })
        await page.getByRole('button', { name: '新建产品规格' }).click()
        await expectText(page, '新建产品规格')
        await expectText(page, 'SKU 编号')
        await expectText(page, '产品')
        await closeBusinessFormModal(
          page,
          page
            .locator('.erp-business-action-modal--form.ant-modal:visible')
            .last()
        )
        await assertNoHorizontalOverflow(page, 'business-standard-products')

        await gotoScenarioPath(page, '/erp/purchase/material-bom', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, 'BOM 管理')
        await expectButton(page, '新建草稿')
        await expectText(page, '工程资料版本')
        await expectText(page, 'BOM-STYLE-L1')
        await expectText(page, '已激活')
        await expectText(page, '当前操作')
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-standard-bom',
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-bom',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-standard-bom',
          unsortableHeaders: ['备注'],
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-standard-bom',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'business-standard-bom',
          expectedLabels: ['总BOM', '当前结果', '已激活', '已选BOM'],
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建草稿',
          titleText: '新建 BOM 草稿',
          scenarioName: 'business-standard-bom',
        })
        await page.getByRole('button', { name: '新建草稿' }).click()
        await expectText(page, '新建 BOM 草稿')
        await expectText(page, 'BOM 版本')
        await expectText(page, '产品')
        await page.keyboard.press('Escape')
        await assertNoHorizontalOverflow(page, 'business-standard-bom')

        await gotoScenarioPath(page, '/erp/warehouse/inventory', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '库存台账')
        await expectText(page, 'inventory_balances')
        await expectText(page, '12.5')
        await expectText(page, '已预留')
        await expectText(page, '4')
        await expectText(page, '可用量')
        await expectText(page, '8.5')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-standard-inventory',
        })
        await expectNoButton(page, '新建库存')
        await expectNoButton(page, '新建库存调整')
        await expectNoButton(page, '生成库存调整')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-inventory',
        })

        await page.getByRole('tab', { name: '库存批次' }).click()
        await expectText(page, 'INV-LOT-001')
        await expectText(page, 'SUP-LOT-001')
        await expectText(page, '冻结')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-inventory-lots',
        })

        await page.getByRole('tab', { name: '库存流水' }).click()
        await expectText(page, '冲正')
        await expectText(page, 'MANUAL_SEED')
        await expectText(page, 'ledger seed')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-inventory-txns',
        })
        await assertNoHorizontalOverflow(page, 'business-standard-inventory')

        await gotoScenarioPath(page, '/erp/production/quality-inspections', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '来料质检')
        await expectButton(page, '新建质检单')
        await expectButton(page, '导出当前结果')
        await expectButton(page, '列顺序')
        await expectButton(page, '批量删除')
        await expectButton(page, '回收站')
        await expectText(page, 'quality_inspections')
        await expectText(page, '不合格退供应商仍走采购退货')
        await expectText(page, 'QI-STYLE-L1')
        await expectText(page, 'PR-STYLE-L1')
        await expectText(page, 'INV-LOT-001')
        const qualityInspectionHeaderMetrics = await page.evaluate(() => {
          const headers = Array.from(
            document.querySelectorAll(
              '.erp-business-data-table-card .ant-table-thead th .erp-module-column-header-text'
            )
          ).map((node) => ({
            text: String(node.textContent || '').trim(),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
          }))
          return {
            headers,
            clippedHeaders: headers.filter(
              (header) => header.scrollWidth > header.clientWidth + 1
            ),
          }
        })
        assert.deepEqual(
          qualityInspectionHeaderMetrics.headers.map((header) => header.text),
          [
            '质检单号',
            '状态',
            '判定',
            '采购来源',
            '物料批次',
            '检验信息',
            '更新时间',
            '判定备注',
          ],
          `来料质检默认表头应合并为可扫读列: ${JSON.stringify(
            qualityInspectionHeaderMetrics
          )}`
        )
        assert.deepEqual(
          qualityInspectionHeaderMetrics.clippedHeaders,
          [],
          `来料质检默认表头不应出现省略号: ${JSON.stringify(
            qualityInspectionHeaderMetrics
          )}`
        )
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-quality-inspections',
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-v1-quality-inspections',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-quality-inspections',
          unsortableHeaders: ['判定备注'],
        })
        await assertBusinessToolbarDisabledButtons(page, {
          scenarioName: 'business-v1-quality-inspections',
          labels: ['批量删除', '回收站'],
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'quality-inspections',
          heading: '来料质检',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建质检单',
          titleText: '新建来料质检单',
          scenarioName: 'business-v1-quality-inspections',
        })
        await page.getByRole('row').filter({ hasText: 'QI-STYLE-L1' }).click()
        await expectText(page, 'QI-STYLE-L1 / INV-LOT-001')
        await expectButton(page, '判定合格')
        await expectButton(page, '判定不合格')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建质检单',
          titleText: '新建来料质检单',
          minFieldCount: 7,
          screenshotName: 'business-v1-quality-inspection-create-form-modal',
          expectedTexts: ['采购入库单', '采购入库行', '批次', '材料', '仓库'],
          absentTexts: ['采购入库单 ID', '批次 ID', '材料 ID', '仓库 ID'],
        })
        await assertNoHorizontalOverflow(
          page,
          'business-v1-quality-inspections'
        )

        await gotoScenarioPath(page, '/erp/warehouse/shipments', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '出货单')
        await expectButton(page, '新建草稿')
        await expectText(page, '计划出货')
        await expectText(page, '实际出货')
        await expectText(page, 'SHIP-STYLE-L1')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-shipments',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建草稿',
          titleText: '新建出货单',
          scenarioName: 'business-v1-shipments',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建草稿',
          titleText: '新建出货单',
          minFieldCount: 12,
          screenshotName: 'business-v1-shipment-create-form-modal',
          expectedTexts: ['出货明细', '从销售订单导入', '产品', '仓库'],
          afterOpen: async (modal) => {
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从销售订单导入',
              titleText: '从销售订单导入出货明细',
              expectedTexts: ['销售订单号', '客户', 'SO-STYLE-L1'],
              scenarioName: 'shipment-source-import-picker',
            })
          },
        })
        await page.getByText('SHIP-STYLE-L1', { exact: true }).click()
        await page.getByRole('button', { name: '维护明细' }).click()
        await expectText(page, '维护出货明细')
        await expectText(page, '已保存出货明细')
        await expectText(page, '新增出货明细')
        await page.keyboard.press('Escape')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-v1-shipments',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-shipments',
          unsortableHeaders: ['备注'],
        })
        await assertNoHorizontalOverflow(page, 'business-v1-shipments')

        await gotoScenarioPath(page, '/erp/engineering/processes', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '加工环节')
        await expectText(page, '查货')
        await expectText(page, '手工')
        await expectText(page, '车缝')
        await expectText(page, '包装')
        await expectText(page, '可委外')
        await expectText(page, '可内制')
        await expectText(page, '需质检')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建加工环节',
          titleText: '新建加工环节',
          minFieldCount: 8,
          screenshotName: 'business-v1-process-create-form-modal',
          expectedTexts: [
            '环节编号',
            '环节名称',
            '环节类别',
            '可委外',
            '可内制',
            '需质检',
            '只标记该工序后续可能需要质检',
          ],
          afterOpen: async (modal) => {
            await assertProcessSuggestionOptions(page, modal, {
              scenarioName: 'business-v1-processes',
            })
          },
        })
        await assertNoHorizontalOverflow(page, 'business-v1-processes')

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '委外订单')
        await expectButton(page, '新建加工合同')
        await expectButton(page, '导出当前结果')
        await expectButton(page, '列顺序')
        await expectButton(page, '批量删除')
        await expectButton(page, '回收站')
        await expectText(page, 'Source Document：加工合同')
        await expectText(page, '加工合同只表达委外承诺和打印快照')
        await expectText(page, '查货只是工序候选')
        await expectText(page, '判定结果回质检模块')
        await expectText(page, '本页协同')
        await assertBusinessToolbarDisabledButtons(page, {
          scenarioName: 'business-v1-processing-contracts',
          labels: ['批量删除', '回收站'],
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'processing-contracts',
          heading: '委外订单',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-processing-contracts',
          unsortableHeaders: ['备注'],
        })
        await assertTextAbsent(page, '生成委外合同')
        await expectButton(page, '加工合同打印')
        const processingContractPrintButton = page.getByRole('button', {
          name: '加工合同打印',
        })
        assert(
          await processingContractPrintButton.isDisabled(),
          '未选中加工合同前，加工合同打印按钮应保持禁用'
        )
        await page
          .getByRole('row')
          .filter({ hasText: 'SIM-OUTSOURCE-CONTRACT-L1' })
          .click()
        assert.equal(
          await page.getByRole('button', { name: /^关联/ }).count(),
          0,
          '加工合同页当前操作区不应保留跨模块关联下拉，避免加工页承接质检、库存或应付事实'
        )
        assert.equal(
          await processingContractPrintButton.isDisabled(),
          false,
          '选中加工合同后，加工合同打印按钮应启用'
        )
        await assertOrderLifecycleActionsConsolidated(page, {
          scenarioName: 'business-v1-processing-contracts',
          primaryActionLabel: '提交',
          menuActionLabels: ['取消'],
          absentButtonLabels: ['确认下单', '关闭', '取消'],
        })
        await page.keyboard.press('Escape')
        await assertTextAbsent(page, '打印单据')
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建加工合同',
          titleText: '新建加工合同',
          scenarioName: 'business-v1-processing-contracts',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建加工合同',
          titleText: '新建加工合同',
          minFieldCount: 6,
          screenshotName: 'business-v1-outsourcing-order-create-form-modal',
          expectedTexts: [
            '加工合同号',
            '加工厂',
            '加工明细',
            '工序',
            '单位',
            '查货只表示加工环节',
          ],
          afterOpen: async (modal) => {
            await assertOutsourcingProcessSelectOptions(page, modal, {
              scenarioName: 'business-v1-processing-contracts',
            })
          },
        })
        await assertTextAbsent(page, '销售订单ID')
        await assertTextAbsent(page, '单位ID')
        await assertTextAbsent(page, '产品编号快照')
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: 'SIM-OUTSOURCE-CONTRACT-L1',
          titleText: '编辑加工合同',
          scenarioName: 'business-v1-processing-contracts',
          afterModalOpen: async () => {
            await expectText(page, '加工明细')
            await expectButton(page, '添加条目')
          },
        })
        await assertNoHorizontalOverflow(
          page,
          'business-v1-processing-contracts'
        )

        const verifyFormalShellPreviewPage = async ({
          path,
          heading,
          previewButton,
          boundaryAction,
          absentTexts,
          rowText,
          scenarioName,
          expectedModalTexts,
          refreshMessage,
          afterPageReady,
        }) => {
          await gotoScenarioPath(page, path, {
            waitUntil: 'domcontentloaded',
          })
          await expectHeading(page, heading)
          await expectButton(page, previewButton)
          await expectText(page, boundaryAction)
          await expectButton(page, '预览导出待接入')
          assert(
            await page
              .getByRole('button', { name: '预览导出待接入' })
              .isDisabled(),
            `${scenarioName} 待接入预览页不应允许导出业务数据`
          )
          for (const text of absentTexts) {
            await assertTextAbsent(page, text)
          }
          await assertTextAbsent(page, '导出当前结果')
          await assertTextAbsent(page, '导出预览字段')
          await assertTextAbsent(page, '打印单据')
          await assertTextAbsent(page, '加工合同打印')
          if (afterPageReady) {
            await afterPageReady()
          }
          await page.getByRole('button', { name: '刷新当前页' }).click()
          const expectedRefreshMessage =
            refreshMessage || `${heading}当前为待接入预览页，暂无远端数据刷新`
          await expectText(page, expectedRefreshMessage)
          if (expectedRefreshMessage.includes('暂无远端数据刷新')) {
            await assertTextAbsent(page, '当前页面数据已刷新')
          }
          await assertTextAbsent(page, '批量删除')
          await assertTextAbsent(page, '回收站')
          await expectNoButton(page, '删除')
          await verifyFormalShellRowDoubleClickEditModal(page, {
            rowText,
            scenarioName,
            expectedTexts: expectedModalTexts,
          })
          await assertNoHorizontalOverflow(page, scenarioName)
        }

        await verifyFormalShellPreviewPage({
          path: '/erp/production/scheduling',
          heading: '生产排程',
          previewButton: '预览排程字段',
          boundaryAction: '查看排程接入边界',
          absentTexts: ['新建排程', '生成生产任务'],
          rowText: '生产排程字段预览',
          scenarioName: 'business-formal-production-scheduling',
          expectedModalTexts: ['销售订单', '产品 / BOM', '排程日期'],
        })

        await verifyFormalShellPreviewPage({
          path: '/erp/production/exceptions',
          heading: '生产异常',
          previewButton: '预览异常字段',
          boundaryAction: '查看异常接入边界',
          absentTexts: ['新建异常', '关闭异常', '生成异常处理'],
          rowText: '生产异常字段预览',
          scenarioName: 'business-formal-production-exceptions',
          expectedModalTexts: ['异常类型', '来源任务', '责任角色'],
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
              id: 'formal-shipping-release-task',
              method: 'create_task',
              params: {
                task_code: 'style-l1-formal-shipping-release',
                task_group: 'shipment_release',
                task_name: '出货放行协同确认',
                source_type: 'shipping-release',
                source_id: 9101,
                source_no: 'SHIP-REL-L1',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'warehouse',
                payload: {
                  critical_path: true,
                  shipment_release_page_scope: 'workflow_only',
                },
              },
            }),
          })
          return response.json()
        })

        await verifyFormalShellPreviewPage({
          path: '/erp/warehouse/shipping-release',
          heading: '出货放行',
          previewButton: '预览放行字段',
          boundaryAction: '查看放行接入边界',
          absentTexts: ['新建放行单', '生成出货放行', '确认放行'],
          rowText: '出货放行字段预览',
          scenarioName: 'business-formal-shipping-release',
          expectedModalTexts: ['销售订单', '出货批次', '放行结论'],
          refreshMessage: '出货放行协同任务已刷新',
          afterPageReady: async () => {
            await expectText(page, '待办')
            await page.getByRole('button', { name: '展开' }).first().click()
            await expectText(page, '出货放行协同确认')
            await expectText(page, 'SHIP-REL-L1')
          },
        })

        await gotoScenarioPath(page, '/erp/production/progress', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '生产进度')
        await expectButton(page, '新建生产事实')
        await expectText(page, 'PROD-FACT-L1')
        await expectText(page, '生产发料、成品入库和返工事实')
        await assertTextAbsent(page, '生成生产进度')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建生产事实',
          titleText: '新建生产事实',
          minFieldCount: 9,
          screenshotName: 'business-v1-production-fact-create-form-modal',
          expectedTexts: ['事实单号', '对象类型', '数量', '来源类型'],
        })
        await assertNoHorizontalOverflow(
          page,
          'business-v1-production-progress'
        )

        await gotoScenarioPath(page, '/erp/warehouse/outbound', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '出库管理')
        await expectButton(page, '新建出货单')
        await expectText(page, 'SHIP-STYLE-L1')
        await expectText(page, '出货出库')
        await assertTextAbsent(page, '生成出库')
        await page.getByRole('tab', { name: '库存预留' }).click()
        await expectButton(page, '新建库存预留')
        await expectText(page, 'RSV-STYLE-L1')
        await assertNoHorizontalOverflow(page, 'business-v1-outbound')

        await gotoScenarioPath(page, '/erp/finance/receivables', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '应收管理')
        await expectButton(page, '新建应收')
        await expectText(page, 'AR-STYLE-L1')
        await expectText(page, 'finance_facts')
        await expectText(page, 'RECEIVABLE')
        await assertTextAbsent(page, '批量删除')
        await assertTextAbsent(page, '回收站')
        await assertTextAbsent(page, '生成应收')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-receivables',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建应收',
          titleText: '新建应收',
          minFieldCount: 10,
          screenshotName: 'business-v1-receivables-create-form-modal',
          expectedTexts: ['事实类型', '金额', '来源类型'],
        })
        await assertNoHorizontalOverflow(page, 'business-v1-receivables')

        await gotoScenarioPath(page, '/erp/finance/payables', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '应付管理')
        await expectButton(page, '新建应付')
        await expectText(page, 'AP-STYLE-L1')
        await assertNoHorizontalOverflow(page, 'business-v1-payables')

        await gotoScenarioPath(page, '/erp/finance/invoices', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '发票管理')
        await expectButton(page, '新建发票')
        await expectText(page, 'INV-STYLE-L1')
        await assertNoHorizontalOverflow(page, 'business-v1-invoices')

        await gotoScenarioPath(page, '/erp/finance/reconciliation', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '对账管理')
        await expectButton(page, '新建对账')
        await expectText(page, 'REC-STYLE-L1')
        await assertNoHorizontalOverflow(page, 'business-v1-reconciliation')

        await page.evaluate(() => {
          window.localStorage.setItem('plush_erp_theme_mode', 'dark')
        })
        await gotoScenarioPath(page, '/erp/finance/receivables', {
          waitUntil: 'domcontentloaded',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'business-v1-receivables-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await expectHeading(page, '应收管理')
        await page.getByRole('button', { name: '新建应收' }).click()
        await assertOperationalFactModalViewport(
          page,
          'business-v1-receivables-dark-modal'
        )

        await verifyFormalShellPreviewPage({
          path: '/erp/production/exceptions',
          heading: '生产异常',
          previewButton: '预览异常字段',
          boundaryAction: '查看异常接入边界',
          absentTexts: ['新建异常', '关闭异常', '生成异常处理'],
          rowText: '生产异常字段预览',
          scenarioName: 'business-formal-production-exceptions-dark',
          expectedModalTexts: ['异常类型', '来源任务', '责任角色'],
        })
        await assertERPThemeMode(page, {
          scenarioName: 'business-formal-production-exceptions-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })

        await page.setViewportSize({ width: 390, height: 844 })
        await page.evaluate(() => {
          window.localStorage.setItem('plush_erp_theme_mode', 'light')
        })
        await gotoScenarioPath(page, '/erp/warehouse/shipping-release', {
          waitUntil: 'domcontentloaded',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'business-formal-shipping-release-mobile',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await expectHeading(page, '出货放行')
        await expectButton(page, '预览放行字段')
        await expectButton(page, '预览导出待接入')
        assert(
          await page
            .getByRole('button', { name: '预览导出待接入' })
            .isDisabled(),
          'business-formal-shipping-release-mobile 待接入预览页不应允许导出业务数据'
        )
        await expectText(page, '查看放行接入边界')
        await assertTextAbsent(page, '新建放行单')
        await assertTextAbsent(page, '生成出货放行')
        await assertTextAbsent(page, '导出当前结果')
        await assertTextAbsent(page, '导出预览字段')
        await assertNoHorizontalOverflow(
          page,
          'business-formal-shipping-release-mobile'
        )

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'business-v1-outsourcing-mobile',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await expectHeading(page, '委外订单')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建加工合同',
          titleText: '新建加工合同',
          minFieldCount: 6,
          screenshotName: 'business-v1-outsourcing-mobile-modal',
          expectedTexts: [
            '加工合同号',
            '加工厂',
            '加工明细',
            '工序',
            '单位',
            '查货只表示加工环节',
          ],
          requireMultiColumn: false,
        })
        await assertTextAbsent(page, '销售订单ID')
        await assertTextAbsent(page, '单位ID')
        await assertNoHorizontalOverflow(page, 'business-v1-outsourcing-mobile')
      },
    },
  ]
}
