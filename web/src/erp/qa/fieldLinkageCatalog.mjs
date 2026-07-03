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
    key: 'partner_contacts_synced',
    label: '客户/供应商联系人明细同步摘要',
  },
  {
    key: 'partner_contacts_cleared',
    label: '客户/供应商联系人摘要随明细清空',
  },
  {
    key: 'product_description_mirrored',
    label: '产品描述同步销售订单明细快照字段',
  },
  {
    key: 'master_record_selection_synced',
    label: '基础资料选择同步业务快照',
  },
  {
    key: 'master_record_selection_cleared',
    label: '基础资料选择清空同步清值',
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
    key: 'default_sample_uses_generic_party_values',
    label: '默认样例使用中性交易方展示值',
  },
  {
    key: 'contract_terms_excluded_from_business_scope',
    label: '合同条款字段本轮排除在业务表单外',
  },
  {
    key: 'business_draft_does_not_use_template_sample',
    label: '业务草稿缺值不从打印模板样例伪造',
  },
  {
    key: 'print_business_draft_blocks_raw_id_fallback',
    label: '打印业务草稿缺值不展示内部 ID fallback',
  },
  {
    key: 'supplier_contact_snapshot_prefilled',
    label: '供应商联系人快照按主数据真源带出',
  },
  {
    key: 'print_party_defaults_do_not_override_supplier_snapshot',
    label: '打印甲方默认值不覆盖供应商业务快照',
  },
  {
    key: 'print_unit_chinese_normalized',
    label: '打印合同单位按映射规范为中文单位',
  },
  {
    key: 'print_template_contract_declared',
    label: '打印模板声明字段合同和模块门禁',
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
      'print_business_draft_blocks_raw_id_fallback',
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
      'print_business_draft_blocks_raw_id_fallback',
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
      'print_business_draft_blocks_raw_id_fallback',
    ],
  },
  {
    fieldKey: 'partnerContacts',
    fieldLabel: '客户/供应商联系人',
    category: '主数据摘要字段',
    risk: 'P0',
    docLabels: ['联系人', '办公室电话', '手机', '邮箱'],
    requiredScenarioKeys: [
      'partner_contacts_synced',
      'partner_contacts_cleared',
    ],
  },
  {
    fieldKey: 'productDescription',
    fieldLabel: '产品描述 / SKU 名称',
    category: '主数据快照字段',
    risk: 'P1',
    docLabels: ['产品描述', 'SKU 名称', '客户款号', '条码'],
    requiredScenarioKeys: ['product_description_mirrored'],
  },
  {
    fieldKey: 'customerMasterSelection',
    fieldLabel: '客户主档选择',
    category: '主档引用 / 业务快照',
    risk: 'P0',
    docLabels: ['客户', '客户/供应商'],
    requiredScenarioKeys: [
      'master_record_selection_synced',
      'master_record_selection_cleared',
    ],
  },
  {
    fieldKey: 'supplierMasterSelection',
    fieldLabel: '供应商主档选择',
    category: '主档引用 / 业务快照',
    risk: 'P0',
    docLabels: ['供应商 / 加工厂', '客户/供应商'],
    requiredScenarioKeys: ['master_record_selection_synced'],
  },
  {
    fieldKey: 'productMasterSelection',
    fieldLabel: '产品主档选择',
    category: '主档引用 / 业务快照',
    risk: 'P0',
    docLabels: ['产品名称 / 颜色', '产品'],
    requiredScenarioKeys: [
      'master_record_selection_synced',
      'master_record_selection_cleared',
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
      'print_business_draft_blocks_raw_id_fallback',
    ],
  },
  {
    fieldKey: 'processorContactAddress',
    fieldLabel: '加工方联系人 / 地址',
    category: '合同头快照',
    risk: 'P0',
    docLabels: ['加工方联系人 / 地址'],
    requiredScenarioKeys: ['default_sample_uses_generic_party_values'],
  },
  {
    fieldKey: 'supplierContactSnapshot',
    fieldLabel: '供应商联系人快照',
    category: '供应商主数据摘要字段',
    risk: 'P0',
    docLabels: ['供应商联系人', '供应商电话', '供应商地址'],
    requiredScenarioKeys: ['supplier_contact_snapshot_prefilled'],
  },
  {
    fieldKey: 'businessDraftFields',
    fieldLabel: '业务草稿带值字段',
    category: '打印业务草稿防缺值伪造',
    risk: 'P0',
    docLabels: ['业务草稿带值字段'],
    requiredScenarioKeys: [
      'business_draft_does_not_use_template_sample',
      'print_business_draft_blocks_raw_id_fallback',
    ],
  },
  {
    fieldKey: 'printPartyDefaults',
    fieldLabel: '打印甲方默认值',
    category: '客户配置打印草案字段',
    risk: 'P1',
    docLabels: ['打印甲方默认值', '客户包 party defaults'],
    requiredScenarioKeys: [
      'print_party_defaults_do_not_override_supplier_snapshot',
    ],
  },
  {
    fieldKey: 'printUnit',
    fieldLabel: '打印合同单位',
    category: '打印业务草稿单位快照',
    risk: 'P1',
    docLabels: ['单位', '打印合同单位'],
    requiredScenarioKeys: ['print_unit_chinese_normalized'],
  },
  {
    fieldKey: 'printTemplateContract',
    fieldLabel: '打印模板字段合同',
    category: '打印模板门禁',
    risk: 'P1',
    docLabels: ['打印模板字段合同', 'PDF 模块门禁'],
    requiredScenarioKeys: ['print_template_contract_declared'],
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
    fieldLabel: '签约日期',
    category: '日期快照字段',
    risk: 'P1',
    docLabels: ['签约日期'],
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
    caseId: 'FL_contract_terms__excluded_from_non_contract_business_scope',
    title: '合同正文、条款和打印专用字段本轮不作为业务表单字段',
    fieldKeys: ['settlementTerms'],
    scenarioKey: 'contract_terms_excluded_from_business_scope',
    layer: 'qa',
    testFile: 'web/src/erp/qa/fieldLinkageCatalog.test.mjs',
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
    caseId: 'FL_sales_order_item_amount__derives_from_quantity_and_unit_price',
    title: '销售订单明细金额按数量和单价派生',
    fieldKeys: ['itemAmount', 'itemQuantity', 'itemUnitPrice'],
    scenarioKey: 'derived_amount_recomputed',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_item_amount__keeps_manual_snapshot_without_inputs',
    title: '销售订单明细数量或单价缺失时保留手工金额快照',
    fieldKeys: ['itemAmount'],
    scenarioKey: 'manual_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_customer_snapshot__retains_customer_snapshot',
    title: '销售订单保存参数保留客户来源快照',
    fieldKeys: ['customerName'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_customer_snapshot__prefills_customer_from_blank',
    title: '销售订单从空白来源选择客户时重建客户快照',
    fieldKeys: ['customerName'],
    scenarioKey: 'source_prefill_rebuilds_from_blank',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_customer_snapshot__clears_customer_on_source_clear',
    title: '销售订单切换或清空客户来源时清空旧客户快照',
    fieldKeys: ['customerName'],
    scenarioKey: 'source_change_clears_prefill',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_customer_master_selection__syncs_customer_snapshot',
    title: '销售订单客户主档选择同步业务快照',
    fieldKeys: ['customerMasterSelection'],
    scenarioKey: 'master_record_selection_synced',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_customer_master_selection__clears_customer_snapshot',
    title: '销售订单客户主档选择清空同步业务快照清值',
    fieldKeys: ['customerMasterSelection'],
    scenarioKey: 'master_record_selection_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_partner_contacts__syncs_contact_snapshot',
    title: '销售订单联系人字段同步联系人快照',
    fieldKeys: ['partnerContacts'],
    scenarioKey: 'partner_contacts_synced',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_partner_contacts__clears_contact_snapshot',
    title: '销售订单联系人字段清空时同步清空联系人快照',
    fieldKeys: ['partnerContacts'],
    scenarioKey: 'partner_contacts_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_purchase_supplier_master_selection__syncs_supplier_snapshot',
    title: '采购单和委外单供应商 / 加工厂主档选择同步业务快照',
    fieldKeys: ['supplierMasterSelection'],
    scenarioKey: 'master_record_selection_synced',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_print_supplier_contact_snapshot__prefills_from_primary_supplier_contact',
    title: '打印草稿供应商联系人快照从主供应商联系人带出',
    fieldKeys: ['supplierContactSnapshot'],
    scenarioKey: 'supplier_contact_snapshot_prefilled',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_print_supplier_contact_snapshot__purchase_and_outsourcing_pages_fetch_supplier_contacts_before_save',
    title: '采购和委外保存前读取供应商联系人以补齐打印快照',
    fieldKeys: ['supplierContactSnapshot', 'supplierMasterSelection'],
    scenarioKey: 'supplier_contact_snapshot_prefilled',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_product_master_style_no__retains_style_no_snapshot',
    title: '产品主档保存参数保留内部款号与客户款号',
    fieldKeys: ['styleNo'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_product_master_style_no__prefills_from_blank_source',
    title: '产品主档款号从空白来源重新生成保存参数',
    fieldKeys: ['styleNo'],
    scenarioKey: 'source_prefill_rebuilds_from_blank',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_purchase_order_accessory_material__retains_material_snapshot',
    title: '采购订单行保存参数保留材料来源快照',
    fieldKeys: ['accessoryMaterial'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_purchase_order_accessory_material__clears_material_snapshot',
    title: '采购订单行清空材料来源时清空材料快照',
    fieldKeys: ['accessoryMaterial'],
    scenarioKey: 'stale_value_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_purchase_order_accessory_material__switches_material_source',
    title: '采购订单行切换材料来源时替换旧材料快照',
    fieldKeys: ['accessoryMaterial'],
    scenarioKey: 'source_change_clears_prefill',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_bom_main_material__retains_material_source',
    title: 'BOM 明细材料来源保留材料真源与默认单位',
    fieldKeys: ['mainMaterial'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_bom_main_material__clears_material_source',
    title: 'BOM 明细清空材料来源时清空旧单位残值',
    fieldKeys: ['mainMaterial'],
    scenarioKey: 'stale_value_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_outsourcing_return_date__retains_expected_return_date_snapshot',
    title: '委外订单头和明细保留预计回货日期',
    fieldKeys: ['returnDate'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_shipment_ship_date__retains_planned_and_actual_ship_dates',
    title: '出货单保留计划出货日期并在列表 / 导出读取实际出货日期',
    fieldKeys: ['shipDate'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_workflow_business_status__retains_business_status_snapshot',
    title: 'Workflow 业务状态使用统一字典展示且不暴露内部状态 key',
    fieldKeys: ['businessStatus'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/workflowTaskBoard.test.mjs',
  },
  {
    caseId: 'FL_sales_order_order_no__retains_order_no_snapshot',
    title: '销售订单保存参数保留内部订单号',
    fieldKeys: ['orderNo'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_order_no__prefills_order_no_from_blank',
    title: '销售订单新建空白单号使用共享内部编号生成',
    fieldKeys: ['orderNo'],
    scenarioKey: 'source_prefill_rebuilds_from_blank',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_source_no__retains_customer_order_no_snapshot',
    title: '销售订单保存参数保留客户来源单号快照',
    fieldKeys: ['sourceNo'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_source_no__prefills_customer_order_no_from_blank',
    title: '销售订单空白来源单号可在保存前重建',
    fieldKeys: ['sourceNo'],
    scenarioKey: 'source_prefill_rebuilds_from_blank',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_source_no__clears_customer_order_no_on_source_clear',
    title: '销售订单清空来源单号时不保留旧保存参数',
    fieldKeys: ['sourceNo'],
    scenarioKey: 'source_change_clears_prefill',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_order_date__retains_signing_date_snapshot',
    title: '销售订单签约日期在表单、列表、导出和保存参数中保持同一真源',
    fieldKeys: ['orderDate'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_item_source_snapshot__retains_product_sku_snapshots',
    title: '销售订单明细保存参数保留 SKU 产品编号名称颜色快照',
    fieldKeys: ['productNo', 'productNameColor'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_item_source_snapshot__prefills_product_sku_from_blank',
    title: '销售订单明细从空白来源选择 SKU 时重建产品编号名称颜色快照',
    fieldKeys: ['productNo', 'productNameColor'],
    scenarioKey: 'source_prefill_rebuilds_from_blank',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_product_description__mirrors_sku_description_snapshot',
    title: '销售订单明细产品描述优先读取 SKU 名称并回退客户款号 / 条码',
    fieldKeys: ['productDescription'],
    scenarioKey: 'product_description_mirrored',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_item_source_snapshot__clears_product_sku_on_source_clear',
    title: '销售订单明细切换或清空 SKU 来源时清空旧产品快照',
    fieldKeys: ['productNo', 'productNameColor'],
    scenarioKey: 'source_change_clears_prefill',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_product_master_selection__syncs_product_sku_selection',
    title: '销售订单明细 SKU 主档选择同步产品与单位',
    fieldKeys: ['productMasterSelection'],
    scenarioKey: 'master_record_selection_synced',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_product_master_selection__clears_product_sku_selection',
    title: '销售订单明细 SKU 主档选择清空同步产品与单位清值',
    fieldKeys: ['productMasterSelection'],
    scenarioKey: 'master_record_selection_cleared',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId: 'FL_sales_order_line_summary__derives_header_totals_from_items',
    title: '销售订单表头数量金额按当前明细派生',
    fieldKeys: ['itemQuantity', 'headerQuantity', 'headerAmount'],
    scenarioKey: 'header_totals_derived_from_items',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_sales_order_line_summary__keeps_header_snapshot_without_current_items',
    title: '销售订单无当前明细时保留表头数量金额快照',
    fieldKeys: ['headerQuantity', 'headerAmount'],
    scenarioKey: 'manual_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
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
    caseId: 'FL_material_purchase_totals__skip_merged_hidden_amount_cells',
    title: '采购合同合计不统计被合并覆盖的隐藏采购金额单元格',
    fieldKeys: ['purchaseAmount', 'mergedCellContent'],
    scenarioKey: 'merge_clears_covered_cells',
    layer: 'web',
    testFile: 'web/src/erp/utils/materialPurchaseContractEditor.test.mjs',
  },
  {
    caseId:
      'FL_material_purchase_business_draft__does_not_fill_missing_business_fields_from_template_sample',
    title: '采购合同业务带值草稿不从模板样例兜底真实缺值',
    fieldKeys: ['businessDraftFields'],
    scenarioKey: 'business_draft_does_not_use_template_sample',
    layer: 'web',
    testFile: 'web/src/erp/utils/materialPurchaseContractEditor.test.mjs',
  },
  {
    caseId: 'FL_material_purchase_unit__normalizes_unit_to_chinese_for_print',
    title: '采购合同单位按映射规范为中文单位',
    fieldKeys: ['printUnit'],
    scenarioKey: 'print_unit_chinese_normalized',
    layer: 'web',
    testFile: 'web/src/erp/utils/materialPurchaseContractEditor.test.mjs',
  },
  {
    caseId: 'FL_material_purchase_print_snapshot__does_not_fallback_to_raw_ids',
    title: '采购合同打印草稿缺字段时不展示内部 ID fallback',
    fieldKeys: [
      'businessDraftFields',
      'productOrderNo',
      'productNo',
      'productNameColor',
      'accessoryMaterial',
    ],
    scenarioKey: 'print_business_draft_blocks_raw_id_fallback',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_material_purchase_print_party_defaults__uses_customer_config_party_defaults_only',
    title: '采购合同打印草稿只使用客户配置甲方默认值且不覆盖供应商快照',
    fieldKeys: ['printPartyDefaults', 'supplierContactSnapshot'],
    scenarioKey: 'print_party_defaults_do_not_override_supplier_snapshot',
    layer: 'web',
    testFile: 'web/src/erp/utils/masterDataOrderView.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_product_order_no__retains_source_order_no_snapshot',
    title: '加工合同明细保留委外来源销售订单号快照',
    fieldKeys: ['productOrderNo'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_business_draft__does_not_fill_missing_business_fields_from_template_sample',
    title: '加工合同业务带值草稿不从模板样例兜底真实缺值',
    fieldKeys: ['businessDraftFields'],
    scenarioKey: 'business_draft_does_not_use_template_sample',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_business_draft__does_not_create_blank_line_without_items',
    title: '加工合同业务带值打印无明细时不补造空白加工行',
    fieldKeys: ['businessDraftFields', 'productOrderNo'],
    scenarioKey: 'business_draft_does_not_use_template_sample',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_fact_trace__uses_business_numbers_without_internal_ids',
    title: '加工合同委外事实追溯使用业务来源号且不展示内部 ID',
    fieldKeys: ['sourceNo', 'businessDraftFields'],
    scenarioKey: 'print_business_draft_blocks_raw_id_fallback',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_print_lines__filters_canceled_outsourcing_items',
    title: '加工合同业务打印草稿过滤已取消委外明细',
    fieldKeys: ['businessDraftFields', 'productNo', 'productNameColor'],
    scenarioKey: 'source_snapshot_retained',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId:
      'FL_processing_contract_print_party_defaults__uses_customer_config_party_defaults_only',
    title: '加工合同打印草稿只使用客户配置委托方默认值且不覆盖加工方快照',
    fieldKeys: ['printPartyDefaults', 'supplierContactSnapshot'],
    scenarioKey: 'print_party_defaults_do_not_override_supplier_snapshot',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
  },
  {
    caseId: 'FL_processing_contract_totals__skip_merged_hidden_amount_cells',
    title: '加工合同合计不统计被合并覆盖的隐藏金额单元格',
    fieldKeys: ['processingAmount', 'mergedCellContent'],
    scenarioKey: 'merge_clears_covered_cells',
    layer: 'web',
    testFile: 'web/src/erp/data/processingContractTemplate.test.mjs',
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
    title: '加工合同移除到只剩一行时会重置为空白行',
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
    caseId: 'FL_processing_contract_editor__clears_covered_amount_stale_value',
    title: '加工合同合并金额列后不保留被覆盖行的旧手工金额',
    fieldKeys: ['processingAmount', 'mergedCellContent'],
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
      'FL_print_templates_sample__uses_generic_sample_values_without_customer_identity',
    title: '打印模板默认样例使用中性展示值且不带客户身份',
    fieldKeys: ['processorContactAddress'],
    scenarioKey: 'default_sample_uses_generic_party_values',
    layer: 'web',
    testFile: 'web/src/erp/config/printTemplates.test.mjs',
  },
  {
    caseId:
      'FL_print_templates_contract__declares_field_requirements_and_pdf_module_guard',
    title: '正式打印模板声明字段合同和 PDF 模块门禁',
    fieldKeys: ['printTemplateContract'],
    scenarioKey: 'print_template_contract_declared',
    layer: 'web',
    testFile: 'web/src/erp/config/printTemplates.test.mjs',
  },
  {
    caseId:
      'FL_print_templates_processing_preview__uses_processing_signature_and_totals',
    title: '加工合同静态预览读取加工合同签字和合计字段',
    fieldKeys: ['printTemplateContract', 'processingAmount', 'itemQuantity'],
    scenarioKey: 'print_template_contract_declared',
    layer: 'web',
    testFile: 'web/src/erp/config/printTemplates.test.mjs',
  },
  {
    caseId:
      'FL_print_templates_output_zero__does_not_use_falsy_fallback_for_paper_values',
    title: '打印纸面输出不使用 falsy fallback 吞掉显式 0 值',
    fieldKeys: ['printTemplateContract', 'itemQuantity', 'itemAmount'],
    scenarioKey: 'print_template_contract_declared',
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
