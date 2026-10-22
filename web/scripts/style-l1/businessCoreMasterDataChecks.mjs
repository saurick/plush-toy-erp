import { findVisibleBusinessPage } from '../businessNavigation.mjs'
import { verifyBOMMaterialGroups } from './bomMaterialGroupsScenarios.mjs'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'
import { createSalesOrderDemandEntryVerifier } from './salesOrderDemandEntryScenarios.mjs'

export async function verifyBusinessCoreMasterData(page, deps) {
  const {
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessHeaderHasNoSectionTitle,
    assertBusinessHeaderCompact,
    assertBusinessMainTableSortableColumns,
    assertBusinessPageRefreshEntrypoint,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectText,
    gotoScenarioPath,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickModal,
  } = deps
  const {
    assertLineItemAddActionScrollsToNewRow,
    assertBusinessViewTabSelectedStyle,
    waitForMasterDataRequest,
    assertNoMasterDataRequest,
    assertBusinessCollaborationPanelAbsent,
    assertNoListDeleteTrashToolbar,
    assertCurrentOperationBarCompact,
  } = createBusinessFormalAssertions(deps)
  const verifySalesOrderDemandEntry = createSalesOrderDemandEntryVerifier(deps)
  await expectHeading(page, '供应商与加工厂')

  await expectButton(page, '新建供应商')

  await expectText(page, '当前操作')

  await assertCurrentOperationBarCompact(page, {
    scenarioName: 'business-formal-suppliers',
  })

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-formal-suppliers'
  )

  await assertBusinessPageRefreshEntrypoint(page, {
    scenarioName: 'business-formal-suppliers',
  })

  await assertBusinessMainTableSortableColumns(page, {
    scenarioName: 'business-formal-suppliers',
  })

  await assertBusinessFormModalKeyboardRecovery(page, {
    triggerName: '新建供应商',
    titleText: '新建供应商或加工厂',
    scenarioName: 'business-formal-suppliers',
  })

  await assertNoHorizontalOverflow(page, 'business-standard-suppliers')

  await verifyBusinessActionFormModal(page, {
    buttonName: '新建供应商',
    titleText: '新建供应商或加工厂',
    minFieldCount: 5,
    screenshotName: 'business-formal-suppliers-form-modal',
    expectedTexts: [
      '供应商类型',
      '经营 / 加工地址',
      '可加工工序',
      '联系人',
      '添加联系人',
    ],
    expectContactItemsLayout: true,
    afterOpen: async (modal) => {
      await assertLineItemAddActionScrollsToNewRow(modal, {
        scenarioName: 'business-formal-suppliers-contact-form-modal',
        targetRowCount: 5,
        addButtonName: '添加联系人',
        listSelector: '.erp-master-contact-list__items',
        rowSelector: '.erp-master-contact-list__row',
      })
    },
  })

  await verifyBusinessRowDoubleClickModal(page, {
    rowText: '样式供应商',
    titleText: '编辑供应商',
    scenarioName: 'business-formal-suppliers',
    afterModalOpen: async () => {
      await expectText(page, '联系人')
      await page
        .getByRole('button', { name: '添加联系人', exact: true })
        .waitFor({ state: 'visible', timeout: 10_000 })
    },
  })

  await gotoScenarioPath(page, '/erp/master/partners/customers', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '客户档案')

  await expectButton(page, '新建客户')

  await expectText(page, '当前操作')

  await assertCurrentOperationBarCompact(page, {
    scenarioName: 'business-formal-customers',
  })

  await expectText(page, '暗色客户')

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-formal-customers'
  )

  await assertBusinessPageRefreshEntrypoint(page, {
    scenarioName: 'business-formal-customers',
  })

  await assertBusinessHeaderHasNoSectionTitle(page, {
    scenarioName: 'business-formal-customers',
  })

  await assertBusinessMainTableSortableColumns(page, {
    scenarioName: 'business-formal-customers',
  })

  await assertBusinessFormModalKeyboardRecovery(page, {
    triggerName: '新建客户',
    titleText: '新建客户档案',
    scenarioName: 'business-formal-customers',
  })

  await verifyBusinessActionFormModal(page, {
    buttonName: '新建客户',
    titleText: '新建客户档案',
    minFieldCount: 5,
    screenshotName: 'business-formal-customers-form-modal',
    expectedTexts: ['联系人', '添加联系人'],
    expectContactItemsLayout: true,
    afterOpen: async (modal) => {
      await assertLineItemAddActionScrollsToNewRow(modal, {
        scenarioName: 'business-formal-customers-contact-form-modal',
        targetRowCount: 5,
        addButtonName: '添加联系人',
        listSelector: '.erp-master-contact-list__items',
        rowSelector: '.erp-master-contact-list__row',
      })
    },
  })

  await assertNoHorizontalOverflow(page, 'business-standard-customers')

  await verifyBusinessRowDoubleClickModal(page, {
    rowText: '暗色客户',
    titleText: '编辑客户',
    scenarioName: 'business-formal-customers',
    afterModalOpen: async () => {
      await expectText(page, '联系人')
      await page
        .getByRole('button', { name: '添加联系人', exact: true })
        .waitFor({ state: 'visible', timeout: 10_000 })
    },
  })

  await verifySalesOrderDemandEntry(page)

  const masterDataMethods = []

  page.on('request', (request) => {
    if (!request.url().includes('/rpc/masterdata')) return
    try {
      const method = request.postDataJSON()?.method
      if (method) masterDataMethods.push(method)
    } catch {
      // 非 JSON-RPC 请求不参与本断言。
    }
  })

  await gotoScenarioPath(page, '/erp/master/products', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '产品档案')

  await expectText(page, '产品基础信息')

  await expectText(page, '产品规格')

  await page.getByRole('tab', { name: '产品基础信息' }).waitFor()

  await page.getByRole('tab', { name: '产品规格' }).waitFor()

  await assertBusinessViewTabSelectedStyle(page, {
    scenarioName: 'business-standard-products',
    tabName: '产品基础信息',
  })

  await expectButton(page, '新建产品')

  await assertNoListDeleteTrashToolbar(page)

  await expectText(page, 'PROD-STYLE-L1')

  await expectText(page, 'BEAR-STYLE')

  await expectText(page, '425 克')

  await expectText(page, '当前操作')

  await assertCurrentOperationBarCompact(page, {
    scenarioName: 'business-standard-products',
  })

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-standard-products'
  )

  await assertBusinessPageRefreshEntrypoint(page, {
    scenarioName: 'business-standard-products',
  })

  await assertBusinessHeaderHasNoSectionTitle(page, {
    scenarioName: 'business-standard-products',
  })

  await assertBusinessHeaderCompact(page, {
    scenarioName: 'business-standard-products',
  })

  await assertBusinessMainTableSortableColumns(page, {
    scenarioName: 'business-standard-products',
  })

  await assertNoListDeleteTrashToolbar(page)

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

  await expectText(page, '产品单重（净重）')

  await assertTextAbsent(page, '默认单位 ID')

  await closeBusinessFormModal(
    page,
    page
      .locator(
        '.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible'
      )
      .last()
  )

  const beforeProductSKUTabRequests = masterDataMethods.length

  await page.getByRole('tab', { name: '产品规格' }).click()

  await waitForMasterDataRequest(page, masterDataMethods, {
    method: 'list_product_skus',
    fromIndex: beforeProductSKUTabRequests,
    scenarioName: 'business-standard-product-skus-tab-refresh',
  })

  await waitForMasterDataRequest(page, masterDataMethods, {
    method: 'list_products',
    fromIndex: beforeProductSKUTabRequests,
    scenarioName: 'business-standard-product-skus-reference-refresh',
  })

  await assertBusinessViewTabSelectedStyle(page, {
    scenarioName: 'business-standard-product-skus',
    tabName: '产品规格',
  })

  await expectButton(page, '新建产品规格')

  await expectText(page, 'SKU-STYLE-L1')

  await expectText(page, '375 克')

  await assertBusinessMainTableSortableColumns(page, {
    scenarioName: 'business-standard-product-skus',
    unsortableHeaders: ['SKU 单重（净重）'],
  })

  await page.getByRole('button', { name: '新建产品规格' }).click()

  await expectText(page, '新建产品规格')

  await expectText(page, 'SKU 编号')

  await expectText(page, '产品')

  await expectText(page, 'SKU 单重（净重）')

  await closeBusinessFormModal(
    page,
    page
      .locator(
        '.erp-business-form-page:not([hidden]), .erp-business-action-modal--form.ant-modal:visible'
      )
      .last()
  )

  await assertNoHorizontalOverflow(page, 'business-standard-products')

  const beforeProductSKURefreshRequests = masterDataMethods.length

  await page.getByRole('button', { name: '刷新当前页' }).click()

  await waitForMasterDataRequest(page, masterDataMethods, {
    method: 'list_product_skus',
    fromIndex: beforeProductSKURefreshRequests,
    scenarioName: 'business-standard-product-skus-header-refresh',
  })

  await waitForMasterDataRequest(page, masterDataMethods, {
    method: 'list_products',
    fromIndex: beforeProductSKURefreshRequests,
    scenarioName: 'business-standard-product-skus-header-reference-refresh',
  })

  const openModule = async (label) => (await findVisibleBusinessPage(page, label)).click()

  const beforeMaterialsMenuRequests = masterDataMethods.length

  await openModule('材料档案')

  await expectHeading(page, '材料档案')

  await waitForMasterDataRequest(page, masterDataMethods, {
    method: 'list_materials',
    fromIndex: beforeMaterialsMenuRequests,
    scenarioName: 'business-standard-materials-menu-refresh',
  })

  await waitForMasterDataRequest(page, masterDataMethods, {
    method: 'list_units',
    fromIndex: beforeMaterialsMenuRequests,
    scenarioName: 'business-standard-materials-menu-unit-refresh',
  })

  const beforeRepeatedMaterialsMenuRequests = masterDataMethods.length

  await openModule('材料档案')

  await assertNoMasterDataRequest(page, masterDataMethods, {
    methods: ['list_materials', 'list_units'],
    fromIndex: beforeRepeatedMaterialsMenuRequests,
    scenarioName: 'business-standard-materials-current-menu-no-refresh',
  })

  await gotoScenarioPath(page, '/erp/purchase/material-bom', {
    waitUntil: 'domcontentloaded',
  })

  const bomGroupsModal = await verifyBOMMaterialGroups(page, deps)

  await closeBusinessFormModal(page, bomGroupsModal)

  await assertNoHorizontalOverflow(page, 'business-standard-bom')
}
