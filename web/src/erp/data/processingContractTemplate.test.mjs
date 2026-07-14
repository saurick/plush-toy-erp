import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PROCESSING_CONTRACT_DRAFT_VERSION,
  PROCESSING_CONTRACT_TABLE_COLUMNS,
  buildProcessingContractDraftFromOutsourcingFact,
  buildProcessingContractDraftFromOutsourcingOrder,
  calculateProcessingContractTotals,
  createBlankProcessingContractDraft,
  createProcessingContractBusinessDraft,
  createProcessingContractDraft,
  normalizeProcessingLine,
  resolveProcessingLineAmount,
} from './processingContractTemplate.mjs'

test('processingContractTemplate: 默认加工合同样例使用中性展示字段', () => {
  const draft = createProcessingContractDraft()

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.buyerCompany, '本公司')
  assert.equal(draft.buyerContact, '委外负责人')
  assert.equal(draft.buyerPhone, '公司联系电话')
  assert.equal(draft.buyerAddress, '公司地址')
  assert.equal(draft.buyerSigner, '签字人')
  assert.equal(draft.supplierSigner, '受托方签字人')
  assert.equal(draft.supplierName, '示例加工厂')
  assert.equal(draft.supplierContact, '加工厂联系人')
  assert.equal(draft.supplierPhone, '加工厂联系电话')
  assert.equal(draft.supplierAddress, '加工厂地址')
  assert.equal(draft.supplierSignDateText, '2025-06-08')
  draft.lines.forEach((line) => {
    assert.equal(line.supplierAlias, '示例加工厂')
    assert.notEqual(line.remark, '')
  })
})

test('processingContractTemplate: 默认条款保留 B 类加工合同源表固定文本', () => {
  const draft = createProcessingContractDraft()

  assert.deepEqual(draft.clauses.delivery, [
    '按订单明细分别打包（1k/包，不足1K单独包装），并标明产品编号、工序名称。',
    '请严格按定单规定，准时足量送（发）货。',
    '必须保证产品的品质，按BOM表要求的生产艺生产。未达要求的产品，委托方有权要求返工，无法返工的，承担赔偿责任；因返工造成委托方延误工期的，加工方承担违约责任。（因委托方原因导致的，免除加工方的责任）。',
  ])
  assert.deepEqual(draft.clauses.contract, [
    '在订单约定日期前交货。如因货期延误，影响到我司正常生产计划的，委托方将对加工方收取违约金。实际交货日期比合同货期延误一天以上的，每延误一天，按100元/款来处罚，直接从货款扣除。',
    '在交货中，如因特殊原因不能按期交货务必提前与委托方采购沟通确认，经同意后方可延期， 否则加工厂承担违约金，赔偿损失；',
    '违约责任和解决合同纠纷的方式：按《经济合同法》和《购销合同条例》规定需承担的责任，进行友好协商或按《合同法》办理。',
  ])
  assert.deepEqual(draft.clauses.settlement, [
    '按委托方仓库确认收到货物日期，次月开始对账，每月15号之前完成对账。',
    '对完账后，次月支付货款，加工厂开具等额增值税专用发票。',
  ])
})

test('processingContractTemplate: 空白模板清空字段明细和附件但保留合同条款', () => {
  const blankDraft = createBlankProcessingContractDraft({
    ...createProcessingContractDraft(),
    clauses: {
      delivery: ['保留来货要求'],
      contract: ['保留合同约定'],
      settlement: ['保留结算方式'],
    },
    attachments: {
      'attachment-1': {
        name: 'sample.png',
        dataURL: 'data:image/png;base64,abc',
        mimeType: 'image/png',
      },
    },
  })

  assert.equal(blankDraft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(blankDraft.contractNo, '')
  assert.equal(blankDraft.supplierName, '')
  assert.equal(blankDraft.buyerCompany, '')
  assert.equal(blankDraft.buyerSigner, '')
  assert.equal(blankDraft.supplierSigner, '')
  assert.equal(blankDraft.lines.length, 1)
  assert.deepEqual(blankDraft.lines[0], {
    contractNo: '',
    productOrderNo: '',
    productNo: '',
    productName: '',
    processName: '',
    supplierAlias: '',
    processCategory: '',
    unit: '',
    unitPrice: '',
    quantity: '',
    amount: '',
    remark: '',
  })
  assert.deepEqual(blankDraft.clauses.delivery, ['保留来货要求'])
  assert.deepEqual(blankDraft.clauses.contract, ['保留合同约定'])
  assert.deepEqual(blankDraft.clauses.settlement, ['保留结算方式'])
  assert.equal(blankDraft.attachments['attachment-1'].dataURL, '')
  assert.equal(blankDraft.attachments['attachment-2'].dataURL, '')
  assert.deepEqual(blankDraft.merges, [])
})

test('FL_processing_contract_business_draft__does_not_fill_missing_business_fields_from_template_sample processingContractTemplate: 业务带值草稿不从加工合同样例兜底真实缺值', () => {
  const draft = createProcessingContractBusinessDraft({
    contractNo: 'OUT-1001',
    supplierName: '真实加工厂',
    lines: [
      {
        contractNo: 'OUT-1001',
        productNo: 'P-100',
        processName: '车缝',
        unitPrice: '1.5',
        quantity: '20',
      },
    ],
    clauses: {
      delivery: ['保留业务来货要求'],
      contract: ['保留业务合同约定'],
      settlement: ['保留业务结算方式'],
    },
  })

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.contractNo, 'OUT-1001')
  assert.equal(draft.supplierName, '真实加工厂')
  assert.equal(draft.supplierContact, '')
  assert.equal(draft.supplierPhone, '')
  assert.equal(draft.buyerCompany, '')
  assert.equal(draft.buyerContact, '')
  assert.equal(draft.buyerSigner, '')
  assert.equal(draft.supplierSigner, '')
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.lines[0].productNo, 'P-100')
  assert.equal(draft.lines[0].productOrderNo, '')
  assert.equal(draft.lines[0].productName, '')
  assert.equal(draft.lines[0].supplierAlias, '')
  assert.equal(draft.lines[0].amount, '30')
  assert.deepEqual(draft.clauses.delivery, ['保留业务来货要求'])
  assert.equal(draft.attachments['attachment-1'].dataURL, '')
  assert.deepEqual(draft.merges, [])
})

test('processingContractTemplate: 委外事实只带入合同打印可确认快照字段', () => {
  const draft = buildProcessingContractDraftFromOutsourcingFact({
    fact_no: ' OUT-F-001 ',
    fact_type: 'MATERIAL_ISSUE',
    subject_type: 'MATERIAL',
    subject_id: 8,
    supplier_name: ' 外协车缝厂 ',
    quantity: '1200',
    unit_id: 3,
    source_type: 'SALES_ORDER',
    source_id: 5,
    note: ' 需先核对工序和单价 ',
  })

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.contractNo, 'OUT-F-001')
  assert.equal(draft.supplierName, '外协车缝厂')
  assert.equal(draft.lines.length, 1)
  assert.equal(draft.lines[0].contractNo, 'OUT-F-001')
  assert.equal(draft.lines[0].supplierAlias, '外协车缝厂')
  assert.equal(draft.lines[0].productNo, '')
  assert.equal(draft.lines[0].productName, '')
  assert.equal(draft.lines[0].processName, '')
  assert.equal(draft.lines[0].processCategory, '')
  assert.equal(draft.lines[0].unit, '')
  assert.equal(draft.lines[0].quantity, '')
  assert.equal(draft.lines[0].unitPrice, '')
  assert.match(draft.lines[0].remark, /业务来源: 材料发料/u)
  assert.match(draft.lines[0].remark, /加工对象: 加工对象已关联/u)
  assert.match(draft.lines[0].remark, /来源单据: 来源单据已关联/u)
  assert.match(draft.lines[0].remark, /需先核对工序和单价/u)
  assert.doesNotMatch(
    draft.lines[0].remark,
    /事实类型|业务事实|MATERIAL|SALES_ORDER|#8|#5/u
  )
})

test('processingContractTemplate: 委外事实追溯优先显示业务单号且不暴露未知 key', () => {
  const draft = buildProcessingContractDraftFromOutsourcingFact({
    fact_no: ' OUT-F-002 ',
    fact_type: 'CUSTOM_FACT_KEY',
    subject_type: 'CUSTOM_SUBJECT',
    subject_id: 18,
    subject_no: 'MAT-26001',
    supplier_name: ' 外协车缝厂 ',
    source_type: 'CUSTOM_SOURCE',
    source_id: 25,
    source_no: 'SO-26001',
  })

  const [{ remark }] = draft.lines

  assert.match(remark, /业务来源: 业务来源已关联/u)
  assert.match(remark, /加工对象: MAT-26001/u)
  assert.match(remark, /来源单据: SO-26001/u)
  assert.doesNotMatch(
    remark,
    /事实类型|业务事实|CUSTOM_FACT_KEY|CUSTOM_SUBJECT|CUSTOM_SOURCE|#18|#25/u
  )
})

test('FL_processing_contract_fact_trace__uses_business_numbers_without_internal_ids processingContractTemplate: 委外事实追溯不因内部 ID 缺失丢失业务来源号', () => {
  const draft = buildProcessingContractDraftFromOutsourcingFact({
    fact_no: ' OUT-F-003 ',
    fact_type: 'RETURN_RECEIPT',
    subject_type: 'PRODUCT',
    subject_name: '半成品兔头',
    supplier_name: ' 外协车缝厂 ',
    source_type: 'OUTSOURCING_ORDER',
    source_no: 'OUT-26003',
    note: '按业务来源号核对',
  })

  const [{ remark }] = draft.lines

  assert.match(remark, /业务来源: 委外回货/u)
  assert.match(remark, /加工对象: 半成品兔头/u)
  assert.match(remark, /来源单据: OUT-26003/u)
  assert.match(remark, /按业务来源号核对/u)
  assert.doesNotMatch(
    remark,
    /事实类型|业务事实|PRODUCT|OUTSOURCING_ORDER|subject_id|source_id/u
  )
})

test('processingContractTemplate: 委外订单按加工合同源单带入工序明细', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-001 ',
      supplier_snapshot: {
        short_name: ' 外协车缝厂 ',
        name: '外协车缝厂全称',
        contact_name: ' 李厂长 ',
        contact_mobile: ' 13900000000 ',
        address: ' 宁波加工园 ',
      },
      source_order_no: ' SO-26017 ',
      order_date: 1781654400,
      expected_return_date: 1782259200,
    },
    [
      {
        subject_type: 'PRODUCT',
        line_status: 'open',
        product_order_no_snapshot: ' SO-LINE-26017 ',
        product_no_snapshot: ' P-001 ',
        sku_code_snapshot: ' SKU-RED-M ',
        product_name_snapshot: ' 毛绒兔半成品 ',
        process_name_snapshot: ' 车缝 ',
        process_category_snapshot: ' 委外车缝 ',
        unit_name_snapshot: ' 只 ',
        outsourcing_quantity: '1200',
        unit_price: '1.5',
        amount: '',
        note: ' 先做头批 ',
      },
    ]
  )

  assert.equal(draft.draftVersion, PROCESSING_CONTRACT_DRAFT_VERSION)
  assert.equal(draft.contractNo, 'OUT-ORDER-001')
  assert.equal(draft.supplierName, '外协车缝厂全称')
  assert.equal(draft.supplierContact, '李厂长')
  assert.equal(draft.supplierPhone, '13900000000')
  assert.equal(draft.supplierAddress, '宁波加工园')
  assert.equal(draft.orderDateText, '2026-06-17')
  assert.equal(draft.returnDateText, '2026-06-24')
  assert.equal(draft.buyerSignDateText, '2026-06-17')
  assert.deepEqual(draft.lines[0], {
    contractNo: 'OUT-ORDER-001',
    productOrderNo: 'SO-LINE-26017',
    productNo: 'P-001 / SKU-RED-M',
    productName: '毛绒兔半成品',
    processName: '车缝',
    supplierAlias: '外协车缝厂全称',
    processCategory: '委外车缝',
    unit: '只',
    unitPrice: '1.5',
    quantity: '1200',
    amount: '1800',
    remark: '先做头批',
  })
})

test('FL_processing_contract_material_subject__maps_material_snapshots processingContractTemplate: 布料加工合同显示材料编码和名称', () => {
  const columnLabels = Object.fromEntries(
    PROCESSING_CONTRACT_TABLE_COLUMNS.map((column) => [
      column.key,
      column.label,
    ])
  )
  assert.equal(columnLabels.productOrderNo, '来源订单编号')
  assert.equal(columnLabels.productNo, '加工对象编号')
  assert.equal(columnLabels.productName, '加工对象名称')

  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-FABRIC-001 ',
      source_order_no: ' ENG-26001 ',
      supplier_snapshot: { name: ' 布料复合加工厂 ' },
    },
    [
      {
        subject_type: 'MATERIAL',
        material_code_snapshot: ' MAT-FABRIC-018 ',
        material_name_snapshot: ' 短毛绒布 ',
        product_no_snapshot: 'STALE-PRODUCT',
        product_name_snapshot: '残留产品',
        product_order_no_snapshot: 'STALE-SO',
        process_name_snapshot: ' 布料复合 ',
        process_category_snapshot: ' 布料加工 ',
        unit_name_snapshot: ' 米 ',
        outsourcing_quantity: '20',
        unit_price: '2.5',
        note: ' 核对色号和克重 ',
      },
    ]
  )

  assert.deepEqual(draft.lines[0], {
    contractNo: 'OUT-FABRIC-001',
    productOrderNo: 'ENG-26001',
    productNo: 'MAT-FABRIC-018',
    productName: '短毛绒布',
    processName: '布料复合',
    supplierAlias: '布料复合加工厂',
    processCategory: '布料加工',
    unit: '米',
    unitPrice: '2.5',
    quantity: '20',
    amount: '50',
    remark: '核对色号和克重',
  })
  assert.notEqual(draft.lines[0].productNo, 'STALE-PRODUCT')
  assert.notEqual(draft.lines[0].productName, '残留产品')
  assert.notEqual(draft.lines[0].productOrderNo, 'STALE-SO')
})

test('FL_processing_contract_subject_type__does_not_guess_missing_subject processingContractTemplate: 加工合同不根据残留 ID 猜测主体类型', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    { source_order_no: 'SRC-001' },
    [
      {
        product_no_snapshot: 'STALE-PRODUCT',
        product_name_snapshot: '残留产品',
        material_code_snapshot: 'STALE-MATERIAL',
        material_name_snapshot: '残留材料',
      },
    ]
  )

  assert.equal(draft.lines[0].productOrderNo, 'SRC-001')
  assert.equal(draft.lines[0].productNo, '')
  assert.equal(draft.lines[0].productName, '')
})

test('FL_processing_contract_print_party_defaults__uses_customer_config_party_defaults_only processingContractTemplate: 加工合同打印草稿只从客户配置带入委托方默认值', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-CONFIG ',
      supplier_snapshot: {
        name: '真实加工厂全称',
        short_name: '真实加工厂',
        contact_name: '加工厂联系人',
      },
    },
    [
      {
        subject_type: 'PRODUCT',
        process_name_snapshot: '车缝',
        outsourcing_quantity: '5',
        unit_price: '3',
      },
    ],
    {
      printTemplateDefaults: {
        templates: [
          {
            template_key: 'material-purchase-contract',
            party_defaults: {
              buyerCompany: '采购合同买方',
            },
          },
          {
            template_key: 'processing-contract',
            party_defaults: {
              buyerCompany: '客户配置委托方',
              buyerContact: '委外负责人',
              buyerPhone: '0769-00000002',
              buyerAddress: '东莞茶山',
              buyerSigner: '试用委外负责人',
              supplierName: '不应覆盖加工厂',
            },
          },
        ],
      },
    }
  )

  assert.equal(draft.contractNo, 'OUT-ORDER-CONFIG')
  assert.equal(draft.buyerCompany, '客户配置委托方')
  assert.equal(draft.buyerContact, '委外负责人')
  assert.equal(draft.buyerPhone, '0769-00000002')
  assert.equal(draft.buyerAddress, '东莞茶山')
  assert.equal(draft.buyerSigner, '试用委外负责人')
  assert.equal(draft.supplierName, '真实加工厂全称')
  assert.equal(draft.supplierContact, '加工厂联系人')
  assert.equal(draft.supplierSigner, '')
  assert.equal(draft.lines[0].processName, '车缝')
  assert.equal(draft.lines[0].amount, '15')
})

test('FL_processing_contract_print_party_snapshot__order_snapshot_overrides_customer_defaults processingContractTemplate: 加工合同打印草稿优先读取委外源单委托方快照', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-SNAPSHOT ',
      supplier_snapshot: {
        name: '真实加工厂全称',
      },
      contract_party_snapshot: {
        buyerCompany: '本单委托单位',
        buyerContact: '本单委托人',
        buyerPhone: '本单电话',
        buyerAddress: '本单地址',
        buyerSigner: '本单签字人',
      },
    },
    [
      {
        subject_type: 'PRODUCT',
        process_name_snapshot: '车缝',
        outsourcing_quantity: '5',
        unit_price: '3',
      },
    ],
    {
      printTemplateDefaults: {
        templates: [
          {
            template_key: 'processing-contract',
            party_defaults: {
              buyerCompany: '客户配置委托方',
              buyerContact: '委外负责人',
              buyerPhone: '0769-00000002',
              buyerAddress: '东莞茶山',
              buyerSigner: '试用委外负责人',
            },
          },
        ],
      },
    }
  )

  assert.equal(draft.buyerCompany, '本单委托单位')
  assert.equal(draft.buyerContact, '本单委托人')
  assert.equal(draft.buyerPhone, '本单电话')
  assert.equal(draft.buyerAddress, '本单地址')
  assert.equal(draft.buyerSigner, '本单签字人')
})

test('FL_processing_contract_supplier_name__falls_back_to_short_name processingContractTemplate: supplier short name is only a fallback when full name is missing', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-SHORT-NAME ',
      supplier_snapshot: {
        short_name: '短名加工厂',
      },
    },
    [
      {
        subject_type: 'PRODUCT',
        process_name_snapshot: '车缝',
        outsourcing_quantity: '5',
        unit_price: '3',
      },
    ]
  )

  assert.equal(draft.supplierName, '短名加工厂')
  assert.equal(draft.lines[0].supplierAlias, '短名加工厂')
})

test('FL_processing_contract_product_order_no__retains_source_order_no_snapshot processingContractTemplate: product order no keeps outsourcing source order snapshot', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-002 ',
      source_order_no: ' SO-26018 ',
    },
    [
      {
        subject_type: 'PRODUCT',
        product_no_snapshot: ' P-001 ',
        product_name_snapshot: ' 毛绒兔半成品 ',
      },
      {
        subject_type: 'PRODUCT',
        product_no_snapshot: ' P-002 ',
        product_name_snapshot: ' 毛绒熊半成品 ',
      },
    ]
  )

  assert.equal(draft.lines.length, 2)
  assert.deepEqual(
    draft.lines.map((line) => line.productOrderNo),
    ['SO-26018', 'SO-26018']
  )
  assert.deepEqual(
    draft.lines.map((line) => line.contractNo),
    ['OUT-ORDER-002', 'OUT-ORDER-002']
  )
})

test('FL_processing_contract_business_draft__does_not_create_blank_line_without_items processingContractTemplate: 业务带值打印无明细时不补造空白加工行', () => {
  const blankDraft = createBlankProcessingContractDraft()
  assert.equal(blankDraft.lines.length, 1)
  assert.equal(blankDraft.lines[0].productOrderNo, '')

  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-003 ',
      source_order_no: ' SO-26019 ',
    },
    []
  )

  assert.deepEqual(draft.lines, [])
})

test('FL_processing_contract_print_lines__filters_canceled_outsourcing_items processingContractTemplate: canceled outsourcing lines do not remain in print draft', () => {
  const draft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-CANCEL ',
      supplier_snapshot: {
        short_name: '外协车缝厂',
      },
      source_order_no: ' SO-26020 ',
    },
    [
      {
        subject_type: 'PRODUCT',
        line_status: 'canceled',
        product_no_snapshot: ' P-CANCELED ',
        product_name_snapshot: ' 已取消产品 ',
        process_name_snapshot: ' 已取消工序 ',
        outsourcing_quantity: '999',
        unit_price: '8',
        note: '不应进入打印',
      },
      {
        subject_type: 'PRODUCT',
        line_status: 'CANCELLED',
        product_no_snapshot: ' P-LEGACY-CANCELED ',
        product_name_snapshot: ' 旧状态取消产品 ',
        process_name_snapshot: ' 旧状态取消工序 ',
        outsourcing_quantity: '1000',
        unit_price: '9',
        note: '旧状态不应进入打印',
      },
      {
        subject_type: 'PRODUCT',
        line_status: 'open',
        product_no_snapshot: ' P-OPEN ',
        product_name_snapshot: ' 有效半成品 ',
        process_name_snapshot: ' 车缝 ',
        outsourcing_quantity: '12',
        unit_price: '1.5',
        note: '有效明细',
      },
    ]
  )

  assert.equal(draft.lines.length, 1)
  assert.deepEqual(draft.lines[0], {
    contractNo: 'OUT-ORDER-CANCEL',
    productOrderNo: 'SO-26020',
    productNo: 'P-OPEN',
    productName: '有效半成品',
    processName: '车缝',
    supplierAlias: '外协车缝厂',
    processCategory: '',
    unit: '',
    unitPrice: '1.5',
    quantity: '12',
    amount: '18',
    remark: '有效明细',
  })
  assert(!draft.lines.some((line) => line.productNo === 'P-CANCELED'))
  assert(!draft.lines.some((line) => line.productNo === 'P-LEGACY-CANCELED'))
  assert(!draft.lines.some((line) => line.remark === '不应进入打印'))
  assert(!draft.lines.some((line) => line.remark === '旧状态不应进入打印'))

  const allCanceledDraft = buildProcessingContractDraftFromOutsourcingOrder(
    {
      outsourcing_order_no: ' OUT-ORDER-ALL-CANCEL ',
      source_order_no: ' SO-26021 ',
    },
    [
      {
        subject_type: 'PRODUCT',
        line_status: 'cancelled',
        product_no_snapshot: ' P-CANCELED ',
        process_name_snapshot: ' 已取消工序 ',
      },
    ]
  )

  assert.deepEqual(allCanceledDraft.lines, [])
})

test('FL_processing_contract_amount__derives_default_line_amount_snapshot processingContractTemplate: 默认金额会按数量和单价写入合同快照', () => {
  const draft = createProcessingContractDraft()

  assert.equal(draft.lines[0].amount, '20')
  assert.equal(draft.lines[1].amount, '10')
  assert.equal(draft.lines[2].amount, '15')
})

test('FL_processing_contract_amount__keeps_manual_line_amount_snapshot processingContractTemplate: 已有委托加工金额快照时优先保留手工值', () => {
  const line = normalizeProcessingLine({
    quantity: '10',
    unitPrice: '2',
    amount: '18.5',
  })

  assert.equal(line.amount, '18.5')
  assert.equal(resolveProcessingLineAmount(line), '18.5')
})

test('FL_processing_contract_totals__skip_merged_hidden_amount_cells processingContractTemplate: 合计不统计被合并覆盖的隐藏金额单元格', () => {
  const totals = calculateProcessingContractTotals(
    [
      normalizeProcessingLine({
        quantity: '10',
        unitPrice: '2',
        amount: '20',
      }),
      normalizeProcessingLine({
        quantity: '5',
        unitPrice: '3',
        amount: '99',
      }),
    ],
    {
      merges: [
        {
          rowStart: 0,
          rowEnd: 1,
          colStart: 10,
          colEnd: 10,
        },
      ],
    }
  )

  assert.equal(totals.totalQuantityText, '15')
  assert.equal(totals.totalAmountText, '20')
})
