export const FIELD_LINKAGE_COVERAGE_PATH = '/erp/qa/field-linkage-coverage'
export const FIELD_LINKAGE_REPORT_PATH =
  '/qa/erp-field-linkage-coverage.latest.json'
export const FIELD_LINKAGE_RUN_COMMAND = 'node scripts/qa/erp-field-linkage.mjs'

const riskOrder = ['P0', 'P1', 'P2']
const statusOrder = ['fail', 'partial', 'missing', 'covered']

export const FIELD_LINKAGE_SCENARIO_CATALOG = [
  {
    key: 'source_snapshot_retained',
    label: '来源快照保留并随状态流转带出',
  },
  {
    key: 'source_prefill_rebuilds_from_blank',
    label: '新建来源带值从空白默认值重建',
  },
  {
    key: 'source_change_clears_prefill',
    label: '切换来源会清空旧来源带值',
  },
  {
    key: 'stale_value_cleared',
    label: '当前表单残值清理',
  },
  {
    key: 'derived_amount_recomputed',
    label: '数量与单价驱动金额重算',
  },
  {
    key: 'manual_snapshot_retained',
    label: '手工金额快照优先保留',
  },
  {
    key: 'header_totals_derived_from_items',
    label: '表头数量金额按当前明细派生',
  },
  {
    key: 'merge_clears_covered_cells',
    label: '合并覆盖格会清空旧值',
  },
  {
    key: 'print_window_snapshot_retained',
    label: '打印窗口快照持久化',
  },
  {
    key: 'default_sample_clears_unverified_party',
    label: '默认样例不伪造供应商 / 加工商资料',
  },
  {
    key: 'contract_terms_excluded_from_business_scope',
    label: '合同条款字段本轮排除在业务表单外',
  },
]

export const FIELD_LINKAGE_FIELD_CATALOG = [
  {
    fieldKey: 'customerName',
    fieldLabel: '客户',
    category: '业务快照字段',
    risk: 'P0',
    docLabels: ['客户'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'source_prefill_rebuilds_from_blank',
      'source_change_clears_prefill',
    ],
  },
  {
    fieldKey: 'orderNo',
    fieldLabel: '订单编号',
    category: '业务快照字段',
    risk: 'P0',
    docLabels: ['订单编号'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'source_prefill_rebuilds_from_blank',
    ],
  },
  {
    fieldKey: 'productOrderNo',
    fieldLabel: '产品订单编号',
    category: '业务快照字段',
    risk: 'P0',
    docLabels: ['产品订单编号'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'source_prefill_rebuilds_from_blank',
    ],
  },
  {
    fieldKey: 'styleNo',
    fieldLabel: '款式编号',
    category: '主档 / 主数据候选',
    risk: 'P0',
    docLabels: ['款式编号'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'source_prefill_rebuilds_from_blank',
    ],
  },
  {
    fieldKey: 'productNo',
    fieldLabel: '产品编号 / SKU',
    category: '业务快照字段',
    risk: 'P0',
    docLabels: ['产品编号 / SKU'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'source_prefill_rebuilds_from_blank',
      'source_change_clears_prefill',
    ],
  },
  {
    fieldKey: 'productNameColor',
    fieldLabel: '产品名称 / 颜色',
    category: '业务快照字段',
    risk: 'P0',
    docLabels: ['产品名称 / 颜色'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'source_prefill_rebuilds_from_blank',
      'source_change_clears_prefill',
    ],
  },
  {
    fieldKey: 'mainMaterial',
    fieldLabel: '主料物料字段',
    category: 'BOM 真源 / 派生影响',
    risk: 'P0',
    docLabels: ['主料物料字段'],
    requiredScenarioKeys: ['source_snapshot_retained', 'stale_value_cleared'],
  },
  {
    fieldKey: 'accessoryMaterial',
    fieldLabel: '辅材 / 包材字段',
    category: '采购快照字段',
    risk: 'P0',
    docLabels: ['辅材 / 包材字段'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'stale_value_cleared',
      'source_change_clears_prefill',
    ],
  },
  {
    fieldKey: 'processorContactAddress',
    fieldLabel: '加工方联系人 / 地址',
    category: '合同头快照',
    risk: 'P0',
    docLabels: ['加工方联系人 / 地址'],
    requiredScenarioKeys: ['default_sample_clears_unverified_party'],
  },
  {
    fieldKey: 'attachmentSnapshot',
    fieldLabel: '图片 / 附件',
    category: '附件 / 资料层字段',
    risk: 'P1',
    docLabels: ['图片 / 附件'],
    requiredScenarioKeys: ['print_window_snapshot_retained'],
  },
  {
    fieldKey: 'returnDate',
    fieldLabel: '回货日期',
    category: '日期快照字段',
    risk: 'P0',
    docLabels: ['回货日期'],
    requiredScenarioKeys: ['source_snapshot_retained'],
  },
  {
    fieldKey: 'shipDate',
    fieldLabel: '出货日期',
    category: '日期快照字段',
    risk: 'P0',
    docLabels: ['出货日期'],
    requiredScenarioKeys: ['source_snapshot_retained'],
  },
  {
    fieldKey: 'orderDate',
    fieldLabel: '下单日期',
    category: '日期快照字段',
    risk: 'P1',
    docLabels: ['下单日期'],
    requiredScenarioKeys: ['source_snapshot_retained'],
  },
  {
    fieldKey: 'settlementTerms',
    fieldLabel: '结算方式 / 条款',
    category: '合同条款快照（本轮排除）',
    risk: 'P2',
    docLabels: ['结算方式 / 条款'],
    requiredScenarioKeys: ['contract_terms_excluded_from_business_scope'],
  },
  {
    fieldKey: 'sourceNo',
    fieldLabel: '来源单号',
    category: '通用业务记录快照',
    risk: 'P0',
    docLabels: ['来源单号'],
    requiredScenarioKeys: [
      'source_snapshot_retained',
      'source_prefill_rebuilds_from_blank',
      'source_change_clears_prefill',
    ],
  },
  {
    fieldKey: 'businessStatus',
    fieldLabel: '业务状态',
    category: 'workflow 状态快照',
    risk: 'P0',
    docLabels: ['业务状态'],
    requiredScenarioKeys: ['source_snapshot_retained'],
  },
  {
    fieldKey: 'itemQuantity',
    fieldLabel: '明细数量',
    category: '当前记录派生',
    risk: 'P0',
    docLabels: ['数量', '明细数量'],
    requiredScenarioKeys: [
      'derived_amount_recomputed',
      'header_totals_derived_from_items',
    ],
  },
  {
    fieldKey: 'itemUnitPrice',
    fieldLabel: '明细单价',
    category: '当前记录派生',
    risk: 'P0',
    docLabels: ['单价', '明细单价'],
    requiredScenarioKeys: ['derived_amount_recomputed'],
  },
  {
    fieldKey: 'itemAmount',
    fieldLabel: '明细金额',
    category: '当前记录派生 / 快照',
    risk: 'P0',
    docLabels: ['金额', '明细金额'],
    requiredScenarioKeys: [
      'derived_amount_recomputed',
      'manual_snapshot_retained',
    ],
  },
  {
    fieldKey: 'headerQuantity',
    fieldLabel: '表头数量',
    category: '当前记录汇总',
    risk: 'P0',
    docLabels: ['表头数量'],
    requiredScenarioKeys: [
      'header_totals_derived_from_items',
      'manual_snapshot_retained',
    ],
  },
  {
    fieldKey: 'headerAmount',
    fieldLabel: '表头金额',
    category: '当前记录汇总',
    risk: 'P0',
    docLabels: ['表头金额'],
    requiredScenarioKeys: [
      'header_totals_derived_from_items',
      'manual_snapshot_retained',
    ],
  },
  {
    fieldKey: 'processingAmount',
    fieldLabel: '委托加工金额',
    category: '合同明细快照',
    risk: 'P0',
    docLabels: ['委托加工金额'],
    requiredScenarioKeys: [
      'derived_amount_recomputed',
      'manual_snapshot_retained',
    ],
  },
  {
    fieldKey: 'purchaseAmount',
    fieldLabel: '采购金额',
    category: '采购合同快照',
    risk: 'P0',
    docLabels: ['采购金额'],
    requiredScenarioKeys: [
      'derived_amount_recomputed',
      'manual_snapshot_retained',
    ],
  },
  {
    fieldKey: 'mergedCellContent',
    fieldLabel: '合并单元格覆盖内容',
    category: '打印编辑防残值',
    risk: 'P1',
    docLabels: ['合并单元格覆盖内容'],
    requiredScenarioKeys: ['merge_clears_covered_cells'],
  },
  {
    fieldKey: 'printWindowHtml',
    fieldLabel: '打印窗口 HTML 快照',
    category: '打印快照字段',
    risk: 'P0',
    docLabels: ['打印窗口 HTML 快照'],
    requiredScenarioKeys: ['print_window_snapshot_retained'],
  },
]

export const FIELD_LINKAGE_CASE_CATALOG = [
  {
    caseId:
      'FL_business_item_amount__derives_amount_from_quantity_and_unit_price',
    title: '业务记录明细金额为空时按数量与单价派生',
    fieldKeys: ['itemQuantity', 'itemUnitPrice', 'itemAmount'],
    scenarioKey: 'derived_amount_recomputed',
    layer: 'web',
    testFile: 'web/src/erp/utils/businessRecordForm.test.mjs',
  },
  {
    caseId: 'FL_business_item_amount__keeps_manual_amount_snapshot',
    title: '业务记录明细手工金额优先于派生金额',
    fieldKeys: ['itemAmount'],
    scenarioKey: 'manual_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/businessRecordForm.test.mjs',
  },
  {
    caseId: 'FL_business_header_totals__derives_quantity_and_amount_from_items',
    title: '业务记录表头数量和金额为空时按当前明细派生',
    fieldKeys: ['itemQuantity', 'headerQuantity', 'headerAmount'],
    scenarioKey: 'header_totals_derived_from_items',
    layer: 'web',
    testFile: 'web/src/erp/utils/businessRecordForm.test.mjs',
  },
  {
    caseId: 'FL_business_header_totals__keeps_manual_header_values',
    title: '业务记录表头手工数量和金额不被明细合计覆盖',
    fieldKeys: ['headerQuantity', 'headerAmount'],
    scenarioKey: 'manual_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/businessRecordForm.test.mjs',
  },
  {
    caseId: 'FL_business_status_update__preserves_record_fields_and_items',
    title: '状态流转保留原记录字段和明细，避免只传状态导致清空',
    fieldKeys: [
      'customerName',
      'orderNo',
      'productOrderNo',
      'styleNo',
      'productNo',
      'productNameColor',
      'mainMaterial',
      'accessoryMaterial',
      'returnDate',
      'shipDate',
      'orderDate',
      'processorContactAddress',
      'sourceNo',
      'businessStatus',
      'itemAmount',
    ],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/businessRecordForm.test.mjs',
  },
  {
    caseId: 'FL_contract_terms__excluded_from_non_contract_business_scope',
    title: '合同正文、条款和打印专用字段本轮不作为业务表单字段',
    fieldKeys: ['settlementTerms'],
    scenarioKey: 'contract_terms_excluded_from_business_scope',
    layer: 'docs',
    testFile: 'web/src/erp/qa/fieldLinkageCatalog.test.mjs',
  },
  {
    caseId: 'FL_business_item_payload__clears_stale_payload',
    title: '业务记录明细 payload 按当前字段定义重建，清空后不保留当前表单残值',
    fieldKeys: ['mainMaterial', 'accessoryMaterial'],
    scenarioKey: 'stale_value_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/businessRecordForm.test.mjs',
  },
  {
    caseId: 'FL_business_source_prefill__rebuilds_target_from_blank',
    title: '业务页新建来源带值从空白默认值重建目标记录',
    fieldKeys: [
      'customerName',
      'orderNo',
      'productOrderNo',
      'styleNo',
      'productNo',
      'productNameColor',
      'sourceNo',
    ],
    scenarioKey: 'source_prefill_rebuilds_from_blank',
    layer: 'web',
    testFile: 'web/src/erp/utils/linkedNavigation.test.mjs',
  },
  {
    caseId: 'FL_business_source_prefill__clears_when_source_changes',
    title: '业务页新建已带值后切换来源会清空旧来源残值',
    fieldKeys: [
      'customerName',
      'productNo',
      'productNameColor',
      'accessoryMaterial',
      'sourceNo',
    ],
    scenarioKey: 'source_change_clears_prefill',
    layer: 'web',
    testFile: 'web/src/erp/utils/linkedNavigation.test.mjs',
  },
  {
    caseId: 'FL_business_source_prefill__filters_bom_accessories',
    title: 'BOM 来源带到辅材采购时只保留辅材和包材明细',
    fieldKeys: ['mainMaterial', 'accessoryMaterial'],
    scenarioKey: 'stale_value_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/linkedNavigation.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_amount__derives_default_line_amount_snapshot',
    title: '加工合同默认金额按数量和单价写入合同快照',
    fieldKeys: ['processingAmount', 'itemQuantity', 'itemUnitPrice'],
    scenarioKey: 'derived_amount_recomputed',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId: 'FL_processing_contract_amount__keeps_manual_line_amount_snapshot',
    title: '加工合同已有委托加工金额时优先保留手工快照',
    fieldKeys: ['processingAmount'],
    scenarioKey: 'manual_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId:
      'FL_material_purchase_amount__recomputes_amount_and_total_from_current_line',
    title: '采购合同数量或单价变化会重算金额和总计',
    fieldKeys: ['purchaseAmount', 'itemQuantity', 'itemUnitPrice'],
    scenarioKey: 'derived_amount_recomputed',
    layer: 'web',
    testFile: 'web/src/erp/utils/materialPurchaseContractEditor.test.mjs',
  },
  {
    caseId: 'FL_material_purchase_amount__keeps_manual_amount_snapshot',
    title: '采购合同初始化时优先保留已有采购金额快照',
    fieldKeys: ['purchaseAmount'],
    scenarioKey: 'manual_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/materialPurchaseContractEditor.test.mjs',
  },
  {
    caseId: 'FL_material_purchase_merge__clears_covered_cell_stale_value',
    title: '采购合同合并选区后会清空被覆盖单元格',
    fieldKeys: ['productOrderNo', 'mergedCellContent'],
    scenarioKey: 'merge_clears_covered_cells',
    layer: 'web',
    testFile: 'web/src/erp/utils/materialPurchaseContractEditor.test.mjs',
  },
  {
    caseId: 'FL_processing_contract_editor__clears_blank_inserted_lines',
    title: '加工合同插入明细行会清空来源字段，避免复制当前行残值',
    fieldKeys: ['productOrderNo', 'productNo', 'productNameColor'],
    scenarioKey: 'stale_value_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/processingContractEditor.test.mjs',
  },
  {
    caseId: 'FL_processing_contract_editor__clears_deleted_last_line',
    title: '加工合同删除到只剩一行时会重置为空白行',
    fieldKeys: ['productOrderNo', 'productNo', 'productNameColor'],
    scenarioKey: 'stale_value_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/processingContractEditor.test.mjs',
  },
  {
    caseId: 'FL_processing_contract_editor__clears_covered_cell_stale_value',
    title: '加工合同合并选区后会清空被覆盖单元格',
    fieldKeys: ['productOrderNo', 'mergedCellContent'],
    scenarioKey: 'merge_clears_covered_cells',
    layer: 'web',
    testFile: 'web/src/erp/utils/processingContractEditor.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_editor__recomputes_default_amount_on_quantity_change',
    title: '加工合同调整数量时同步重算默认委托加工金额',
    fieldKeys: ['processingAmount', 'itemQuantity', 'itemUnitPrice'],
    scenarioKey: 'derived_amount_recomputed',
    layer: 'web',
    testFile: 'web/src/erp/utils/processingContractEditor.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_editor__keeps_manual_amount_on_quantity_change',
    title: '加工合同已手工改写金额时数量变化不覆盖手工值',
    fieldKeys: ['processingAmount'],
    scenarioKey: 'manual_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/processingContractEditor.test.mjs',
  },
  {
    caseId:
      'FL_print_workspace_window_snapshot__persists_current_html_snapshot',
    title: '打印工作台会把整窗 HTML 快照落到窗口状态',
    fieldKeys: ['attachmentSnapshot', 'printWindowHtml'],
    scenarioKey: 'print_window_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/printWorkspace.test.mjs',
  },
  {
    caseId:
      'FL_print_templates_sample__keeps_supplier_snapshot_fields_blank_by_default',
    title: '打印模板默认样例不伪造供应商 / 加工商资料',
    fieldKeys: ['processorContactAddress'],
    scenarioKey: 'default_sample_clears_unverified_party',
    layer: 'web',
    testFile: 'web/src/erp/config/printTemplates.test.mjs',
  },
]

const scenarioMetaMap = new Map(
  FIELD_LINKAGE_SCENARIO_CATALOG.map((item) => [item.key, item])
)

const normalizeCaseStatus = (status) => {
  const normalized = String(status || '')
    .trim()
    .toLowerCase()
  if (normalized === 'pass') return 'pass'
  if (normalized === 'fail') return 'fail'
  if (normalized === 'skip') return 'skip'
  return 'missing'
}

const mergeScenarioStatus = (currentStatus, nextStatus) => {
  const priority = { fail: 3, pass: 2, skip: 1, missing: 0 }
  if (!currentStatus) return nextStatus
  return priority[nextStatus] > priority[currentStatus]
    ? nextStatus
    : currentStatus
}

const resolveFieldStatus = (scenarios = []) => {
  const statuses = scenarios.map((item) => normalizeCaseStatus(item.status))
  if (statuses.includes('fail')) return 'fail'
  if (statuses.length > 0 && statuses.every((item) => item === 'pass')) {
    return 'covered'
  }
  if (statuses.every((item) => item === 'missing')) return 'missing'
  return 'partial'
}

const buildCaseStatusMap = (report = {}) => {
  const caseEntries = Array.isArray(report?.cases) ? report.cases : []
  return new Map(caseEntries.map((item) => [item.caseId, item]))
}

const buildFieldScenarioStatusList = (fieldItem, relatedCases) =>
  (Array.isArray(fieldItem.requiredScenarioKeys)
    ? fieldItem.requiredScenarioKeys
    : []
  ).map((scenarioKey) => {
    const matchingCases = relatedCases.filter(
      (item) => item.scenarioKey === scenarioKey
    )
    let status = 'missing'
    for (const item of matchingCases) {
      status = mergeScenarioStatus(status, normalizeCaseStatus(item.status))
    }
    return {
      scenarioKey,
      scenarioLabel: scenarioMetaMap.get(scenarioKey)?.label || scenarioKey,
      status,
      caseIds: matchingCases.map((item) => item.caseId),
    }
  })

export const buildFieldLinkageCoverageViewModel = (report = {}) => {
  const caseStatusMap = buildCaseStatusMap(report)
  const cases = FIELD_LINKAGE_CASE_CATALOG.map((catalogItem) => {
    const caseStatus = caseStatusMap.get(catalogItem.caseId)
    return {
      ...catalogItem,
      status: normalizeCaseStatus(caseStatus?.status),
      durationMs: caseStatus?.durationMs ?? null,
      failureMessages: Array.isArray(caseStatus?.failureMessages)
        ? caseStatus.failureMessages
        : [],
    }
  })

  const fields = FIELD_LINKAGE_FIELD_CATALOG.map((fieldItem) => {
    const relatedCases = cases.filter((item) =>
      item.fieldKeys.includes(fieldItem.fieldKey)
    )
    const scenarios = buildFieldScenarioStatusList(fieldItem, relatedCases)
    const status = resolveFieldStatus(scenarios)
    return {
      ...fieldItem,
      status,
      layers: Array.from(new Set(relatedCases.map((item) => item.layer))),
      passedCases: relatedCases.filter((item) => item.status === 'pass').length,
      totalCases: relatedCases.length,
      passedScenarios: scenarios.filter((item) => item.status === 'pass')
        .length,
      totalScenarios: scenarios.length,
      scenarios,
      cases: relatedCases,
    }
  }).sort((left, right) => {
    const riskGap = riskOrder.indexOf(left.risk) - riskOrder.indexOf(right.risk)
    if (riskGap !== 0) return riskGap

    const statusGap =
      statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status)
    if (statusGap !== 0) return statusGap

    return left.fieldLabel.localeCompare(right.fieldLabel, 'zh-CN')
  })

  const summary = {
    totalFields: fields.length,
    coveredFields: fields.filter((item) => item.status === 'covered').length,
    partialFields: fields.filter((item) => item.status === 'partial').length,
    missingFields: fields.filter((item) => item.status === 'missing').length,
    failingFields: fields.filter((item) => item.status === 'fail').length,
    totalCases: cases.length,
    passedCases: cases.filter((item) => item.status === 'pass').length,
    failedCases: cases.filter((item) => item.status === 'fail').length,
    skippedCases: cases.filter((item) => item.status === 'skip').length,
    missingCases: cases.filter((item) => item.status === 'missing').length,
    totalScenarios: fields.reduce(
      (sum, item) => sum + (item.totalScenarios || 0),
      0
    ),
    passedScenarios: fields.reduce(
      (sum, item) => sum + (item.passedScenarios || 0),
      0
    ),
  }

  return {
    generatedAt: report?.generatedAt || '',
    command: report?.command || '',
    runContext: report?.runContext || null,
    summary,
    fields,
    cases,
  }
}
