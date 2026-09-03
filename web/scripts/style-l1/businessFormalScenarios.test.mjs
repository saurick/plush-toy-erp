import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./businessFormalScenarios.mjs', import.meta.url),
  'utf8'
)

test('shipment source L1 keeps selection across the 20-row server page boundary', () => {
  assert.match(source, /PROD-STYLE-L1-01/u)
  assert.match(source, /ant-pagination-item-2/u)
  assert.match(source, /PROD-STYLE-L1-21/u)
  assert.match(source, /已选 2 条/u)
  assert.match(source, /Number\(params\.offset\) === 20/u)
  assert.match(source, /unscopedSalesOrderItemRequests\.length/u)
  const pickerContract = source.slice(
    source.indexOf('const verifyShipmentSourceCandidateContract'),
    source.indexOf('return [')
  )
  assert.match(pickerContract, /failedPicker[\s\S]*ant-table-thead th/u)
  assert.match(
    pickerContract,
    /failedPicker\.locator\('\.ant-table-container'\)/u
  )
  assert.match(pickerContract, /sourceTable[\s\S]*SO-STYLE-L1/u)
  assert.match(pickerContract, /sourceTable[\s\S]*PROD-STYLE-L1-01/u)
  assert.match(pickerContract, /币种（跟随销售订单）/u)
  assert.match(pickerContract, /实际运费币种（自动）/u)
  assert.match(pickerContract, /币种：USD/u)
  assert.match(pickerContract, /shipment-source-one-currency-modal\.png/u)
  assert.doesNotMatch(pickerContract, /expectText\(page, expectedText\)/u)
})

test('formal empty-state overrides keep requested paging metadata', () => {
  for (const [start, method, recordKey] of [
    [
      'let forceEmptyInventoryBalances',
      'list_inventory_balances',
      'inventory_balances',
    ],
    [
      'let forceEmptyQualityInspections',
      'list_quality_inspections',
      'quality_inspections',
    ],
    ['let emptiedShipmentsOnce', 'list_shipments', 'shipments'],
  ]) {
    const startIndex = source.indexOf(start)
    const override = source.slice(startIndex, startIndex + 1_800)
    assert.ok(startIndex >= 0, start)
    assert.match(override, new RegExp(`body\\.method === '${method}'`, 'u'))
    assert.match(override, /stylePaginatedRpcData/u)
    assert.match(override, new RegExp(`'${recordKey}'`, 'u'))
    assert.match(override, /body\.params \|\| \{\}/u)
    assert.doesNotMatch(override, /limit:\s*\d+|offset:\s*0/u)
  }
})

test('inventory SKU filter selects through its searchable control', () => {
  const startIndex = source.indexOf('const inventorySKUFilter')
  const interaction = source.slice(startIndex, startIndex + 700)

  assert.ok(startIndex >= 0)
  assert.match(interaction, /locator\('input'\)\.fill\('SKU-STYLE-L1'\)/u)
  assert.match(interaction, /keyboard\.press\('Enter'\)/u)
  assert.match(interaction, /ant-select-selection-item/u)
  assert.doesNotMatch(interaction, /ant-select-dropdown/u)
})

test('inventory transaction lineage assertions use the visible business labels', () => {
  assert.match(source, /expectText\(page, '已关联来源明细'\)/u)
  assert.match(source, /expectText\(page, '已关联原库存变动记录'\)/u)
  assert.doesNotMatch(source, /expectText\(page, '已关联来源行'\)/u)
  assert.doesNotMatch(source, /expectText\(page, '已关联原流水'\)/u)
})

test('inventory header summary keeps view text in tabs and numeric values in cards', () => {
  const startIndex = source.indexOf("name: 'inventory-visible-copy-desktop'")
  const interaction = source.slice(startIndex, startIndex + 2_600)

  assert.ok(startIndex >= 0)
  assert.match(interaction, /expectedLabels:\s*\['筛选结果', '本页显示'\]/u)
  assert.match(interaction, /name: '库存批次'/u)
  assert.match(interaction, /name: '库存变动记录'/u)
  assert.match(interaction, /assertTextAbsent\(page, '查看内容'\)/u)
  assert.doesNotMatch(interaction, /expectText\(page, '查看内容'\)/u)
  assert.match(source, /name: 'inventory-numeric-summary-dark-mobile'/u)
  assert.match(source, /inventory-numeric-summary-dark-mobile\.png/u)
  assert.match(source, /inventory-numeric-summary-dark-mobile-header\.png/u)
})

test('quality page assertion preserves the visible incoming-inspection boundary', () => {
  assert.match(source, /首次到货检验不合格可按来源行和部分数量办理退厂或补换/u)
  assert.match(source, /已入库后的不合格仍生成采购退货/u)
  assert.doesNotMatch(source, /不合格退供应商仍走采购退货/u)
})

test('workflow list failure assertion follows the current module title', () => {
  assert.match(source, /expectText\(page, '加载出货放行任务失败'\)/u)
  assert.doesNotMatch(source, /加载出货放行协同任务失败/u)
})

test('production exception workflow scenario follows the current approval empty state', () => {
  assert.match(source, /expectText\(page, '暂无待审批的生产异常处置申请。'\)/u)
  assert.doesNotMatch(source, /expectText\(page, '暂无生产异常任务。'\)/u)
  assert.match(source, /getByRole\('tab', \{\s*name: '处置申请'/u)
  assert.match(source, /getByRole\('tab', \{\s*name: '待审批'/u)
  assert.match(source, /暂无生产异常处置申请/u)
  assert.match(source, /生产异常处置申请已刷新/u)
  assert.match(source, /生产异常处置任务已刷新/u)
  assert.match(source, /business-production-exceptions-decisions-tab\.png/u)
  assert.match(source, /business-production-exceptions-tasks-tab\.png/u)
  assert.match(source, /business-production-exception-tabs-desktop/u)
  assert.match(source, /tabInsideCurrentTableCard/u)
  assert.match(source, /tabBeforeCurrentTable/u)
  assert.match(source, /currentOperationPanelExists/u)
  assert.match(source, /currentWorkspaceRenderedGap/u)
  assert.match(source, /decisionFilterLabels/u)
  assert.match(source, /\['异常类型', '审批状态', '业务状态'\]/u)
  assert.match(source, /currentActionVisible/u)
  assert.match(source, /clearSelectionDisabled/u)
  assert.match(source, /expectText\(page, '全部异常类型'\)/u)
  assert.match(source, /expectText\(page, '全部审批状态'\)/u)
  assert.match(source, /expectText\(page, '全部业务状态'\)/u)
  assert.match(source, /expectText\(page, '当前操作'\)/u)
  assert.match(source, /expectText\(page, '请选择一条记录'\)/u)
  assert.match(
    source,
    /business-production-exceptions-decisions-tab-dark\.png/u
  )
  assert.match(
    source,
    /business-production-exceptions-decisions-tab-mobile\.png/u
  )
  assert.match(source, /business-production-exceptions-tasks-tab-mobile\.png/u)
  assert.match(source, /taskWorkspaceRowGap/u)
  assert.match(source, /taskWorkspaceRenderedGap/u)
})

test('read-only shipment release mock preserves requested paging metadata', () => {
  const startIndex = source.indexOf('const readonlyShipmentReleaseTask')
  const routeCase = source.slice(startIndex, startIndex + 6_000)

  assert.ok(startIndex >= 0)
  assert.match(routeCase, /stylePaginatedRpcData/u)
  assert.match(routeCase, /'tasks'/u)
  assert.match(routeCase, /body\.params \|\| \{\}/u)
  assert.doesNotMatch(routeCase, /limit:\s*100|offset:\s*0/u)
})

test('shipping release L1 scenarios use the formal finance approval process task', () => {
  const fixture = source.slice(
    source.indexOf('const createShipmentFinanceApprovalTaskFixture'),
    source.indexOf(
      'const {',
      source.indexOf('const createShipmentFinanceApprovalTaskFixture')
    )
  )
  const currentScenarios = source.slice(
    source.indexOf("name: 'business-core-pages-desktop'"),
    source.indexOf(
      "name: 'business-formal-shipping-release-readonly-actions-desktop'"
    ) + 7_000
  )
  const readonlyScenario = source.slice(
    source.indexOf(
      "name: 'business-formal-shipping-release-readonly-actions-desktop'"
    ),
    source.indexOf(
      "name: 'business-formal-shipping-release-readonly-actions-desktop'"
    ) + 7_000
  )

  assert.match(fixture, /task_group: 'shipment_finance_approval'/u)
  assert.match(fixture, /source_type: 'shipment'/u)
  assert.match(fixture, /owner_role_key: 'finance'/u)
  assert.match(fixture, /required_capability_key: 'workflow\.task\.approve'/u)
  assert.match(
    fixture,
    /task_code: `PROC-\$\{processInstanceID\}-NODE-\$\{processNodeInstanceID\}-A1`/u
  )
  assert.match(
    currentScenarios,
    /createShipmentFinanceApprovalTaskFixture\(\{/u
  )
  assert.match(readonlyScenario, /role_key: 'finance', name: '财务'/u)
  assert.doesNotMatch(currentScenarios, /taskGroup: 'shipment_release'/u)
  assert.doesNotMatch(currentScenarios, /出货放行(?:协同确认|刷新后协同确认)/u)
  assert.doesNotMatch(readonlyScenario, /role_key: 'warehouse', name: '仓库'/u)
})

test('business-core detail and lineage checks are scoped to their surfaces', () => {
  assert.match(source, /afterModalOpen: async \(modal\)/u)
  assert.match(source, /modal[\s\S]{0,120}getByText\('PR-STYLE-L1'/u)
  assert.match(
    source,
    /shippingReleaseTaskRow[\s\S]{0,220}getByText\('可执行'/u
  )
  assert.match(
    source,
    /readonlyShippingReleaseRow[\s\S]{0,220}getByText\('可执行'/u
  )
  assert.match(
    source,
    /business-workflow-shipping-release-attachment-modal[\s\S]{0,180}modalTitle: '任务附件',[\s\S]{0,80}panelTitle: '任务附件'/u
  )
  assert.match(
    source,
    /const viewTaskButton = await findSelectionActionButton\([\s\S]{0,80}'查看任务'[\s\S]{0,180}viewTaskButton\.isDisabled\(\)/u
  )
  assert.match(
    source,
    /erp-business-selection-action-drawer:visible[\s\S]{0,180}keyboard\.press\('Escape'\)/u
  )
  assert.doesNotMatch(source, /协同任务附件/u)
})

test('shipment table assertions lock the combined visible headers', () => {
  assert.match(source, /实际 \/ 最终总净重（克）/u)
  assert.match(source, /计划出货日期 \/ 实际出货日期/u)
  assert.match(source, /ant-table-thead th/u)
  assert.match(source, /getByText\(headerText, \{ exact: true \}\)/u)
  assert.match(
    source,
    /unsortableHeaders:\s*\[\s*'实际 \/ 最终总净重（克）',\s*'包装 \/ 毛重 \/ 体积',\s*'实际运费',\s*'唛头',\s*'备注',?\s*\]/u
  )
  assert.match(source, /unsortableHeaders: \['SKU 单重（净重）'\]/u)
  assert.doesNotMatch(source, /expectText\(page, '总净重（克）'\)/u)
  assert.doesNotMatch(source, /unsortableHeaders: \['总净重（克）'/u)
})

test('shipment cancellation selects the business row before invoking the action', () => {
  const startIndex = source.indexOf('const shipmentDraftRow')
  const interaction = source.slice(startIndex, startIndex + 1_100)

  assert.ok(startIndex >= 0)
  assert.match(interaction, /ant-table-row-selected/u)
  assert.match(interaction, /findSelectionActionButton/u)
  assert.match(interaction, /cancelShipmentDraftButton\.isDisabled\(\)/u)
  assert.match(interaction, /cancelShipmentDraftButton\.click\(\)/u)
  assert.doesNotMatch(
    interaction,
    /getByText\('SHIP-STYLE-L1', \{ exact: true \}\)\.click/u
  )
})

test('business-core selection actions remain reachable through responsive overflow', () => {
  assert.match(source, /const findSelectionActionButton/u)
  assert.match(
    source,
    /locator\('button'\)\.filter\(\{ hasText: actionName \}\)/u
  )
  assert.match(source, /candidate\.innerText\(\)/u)
  assert.match(source, /getByRole\('button', \{ name: \/更多操作\/u \}\)/u)
  assert.match(source, /erp-business-selection-action-drawer:visible/u)
})

test('business-core destructive draft actions confirm through visible popconfirm content', () => {
  assert.match(source, /actions: \[[\s\S]{0,120}'production\.fact\.cancel'/u)
  assert.match(source, /const confirmVisiblePopconfirm/u)
  assert.match(source, /getByRole\('button', \{ name: \/\^确\\s\*认\$\/u \}\)/u)
  assert.match(source, /confirmButton\.waitFor\(\{ state: 'visible' \}\)/u)
  assert.match(source, /confirmButton\.click\(\)/u)
  assert.match(source, /ant-popconfirm:visible/u)
  assert.match(source, /confirmVisiblePopconfirm\(page\)/u)
  assert.doesNotMatch(
    source,
    /\.locator\('\.ant-popover:visible'\)[\s\S]{0,160}getByRole\('button', \{ name: '确认'/u
  )
})

test('production completion report cancellation uses the current reason-required modal', () => {
  const startIndex = source.indexOf('const cancelProductionDraftButton')
  const interaction = source.slice(startIndex, startIndex + 1_300)

  assert.ok(startIndex >= 0)
  assert.match(interaction, /'作废完工报告'/u)
  assert.match(interaction, /hasText: '作废生产完工报告'/u)
  assert.match(interaction, /\.locator\('textarea'\)/u)
  assert.match(interaction, /L1 回归：确认未过账生产草稿可追溯作废/u)
  assert.match(
    interaction,
    /getByRole\('button', \{ name: '作废完工报告' \}\)/u
  )
  assert.match(interaction, /expectText\(page, '作废生产完工报告已完成'\)/u)
  assert.doesNotMatch(interaction, /confirmVisiblePopconfirm/u)
})

test('quality table assertion includes defect-rate and WIP lineage columns', () => {
  assert.match(source, /'估算不良比例'/u)
  assert.match(source, /'产品 \/ 材料 \/ 在制品'/u)
  assert.match(source, /unsortableHeaders: \['估算不良比例', '判定备注'\]/u)
  assert.doesNotMatch(source, /'检验对象 \/ 批次'/u)
})

test('production material issue scenario follows release and reference paging contracts', () => {
  const scenario = source.slice(
    source.indexOf("name: 'production-order-source-material-issue-desktop'"),
    source.indexOf(
      "name: 'business-formal-shipping-release-readonly-actions-desktop'"
    )
  )
  assert.match(scenario, /生产订单已发布，排程任务已进入 PMC 待办/u)
  assert.doesNotMatch(scenario, /生产订单发布成功/u)
  assert.match(
    scenario,
    /status: 'ACTIVE',[\s\S]{0,80}limit: 200,[\s\S]{0,40}offset: 0/u
  )
  assert.match(scenario, /const materialRequirementCells = detailModal/u)
  assert.match(scenario, /\.locator\('\.ant-table-cell:visible'\)/u)
  assert.match(scenario, /\.filter\(\{ hasText: \/\^8\\\.000000\$\/u \}\)/u)
  assert.doesNotMatch(
    scenario,
    /getByText\('MAT-STYLE-L1', \{ exact: false \}\)/u
  )
  assert.doesNotMatch(scenario, /limit: 500/u)
})
