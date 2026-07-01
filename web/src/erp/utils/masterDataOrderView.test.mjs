import assert from 'node:assert/strict'
import test from 'node:test'

import {
  V1_ROUTE_PATHS,
  buildPaymentConditionOptions,
  buildCustomerSnapshot,
  buildMaterialPurchaseContractDraftFromPurchaseOrder,
  buildMasterDataParams,
  buildMaterialDraftCode,
  buildOutsourcingOrderItemParams,
  buildOutsourcingOrderParams,
  buildProcessParams,
  buildProductParams,
  buildPurchaseOrderItemParams,
  buildPurchaseOrderParams,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  buildSequentialDraftCode,
  buildTextSelectOptions,
  buildUnitSelectOptions,
  canRunPurchaseOrderLifecycleAction,
  canRunSalesOrderLifecycleAction,
  canRunOutsourcingOrderLifecycleAction,
  deriveOutsourcingOrderItemAmount,
  deriveSalesOrderItemAmount,
  formatUnitDisplayName,
  formatUnitShortDisplayName,
  formatPaymentCondition,
  formatUnixDateTime,
  hasActionPermission,
  inferDefaultUnitID,
  paymentConditionCompleteness,
  resolvePaymentTermDays,
  statusText,
  unixToDateInputValue,
} from './masterDataOrderView.mjs'

test('masterDataOrderView: action permissions keep super admin shortcut before active session', () => {
  assert.equal(
    hasActionPermission({ is_super_admin: true }, 'sales_order.create'),
    true
  )
  assert.equal(
    hasActionPermission(
      { permissions: ['sales_order.read', 'sales_order.update'] },
      'sales_order.update'
    ),
    true
  )
  assert.equal(
    hasActionPermission(
      { permissions: ['sales_order.read'] },
      'contact.create'
    ),
    false
  )
})

test('masterDataOrderView: active session actions narrow normal accounts but not super admin', () => {
  assert.equal(
    hasActionPermission(
      {
        is_super_admin: true,
        effective_session: { actions: ['sales_order.update'] },
      },
      'sales_order.create'
    ),
    true
  )
  assert.equal(
    hasActionPermission(
      {
        permissions: ['sales_order.create', 'sales_order.update'],
        effective_session: { actions: ['sales_order.update'] },
      },
      'sales_order.update'
    ),
    true
  )
  assert.equal(
    hasActionPermission(
      {
        permissions: ['sales_order.create'],
        effective_session: { actions: ['sales_order.update'] },
      },
      'sales_order.update'
    ),
    false
  )
})

test('masterDataOrderView: super admin keeps all actions during diagnostic projection', () => {
  assert.equal(
    hasActionPermission(
      {
        is_super_admin: true,
        effective_session: {
          source: 'effective_session_sync_failed',
          pages: [],
          actions: [],
        },
      },
      'sales_order.create'
    ),
    true
  )
  assert.equal(
    hasActionPermission(
      {
        permissions: ['sales_order.create'],
        effective_session: {
          source: 'effective_session_sync_failed',
          pages: [],
          actions: [],
        },
      },
      'sales_order.create'
    ),
    false
  )
  assert.equal(
    hasActionPermission(
      {
        is_super_admin: true,
        permissions: ['workflow.task.complete'],
        effective_session: {
          source: 'active_customer_config_revision',
          pages: ['global-dashboard'],
          actions: ['workflow.task.read'],
        },
      },
      'workflow.task.complete'
    ),
    true
  )
})

test('masterDataOrderView: order lifecycle actions expose real transitions only', () => {
  assert.equal(canRunSalesOrderLifecycleAction('draft', 'submitted'), true)
  assert.equal(canRunSalesOrderLifecycleAction('draft', 'canceled'), true)
  assert.equal(canRunSalesOrderLifecycleAction('submitted', 'active'), true)
  assert.equal(canRunSalesOrderLifecycleAction('active', 'closed'), true)
  assert.equal(canRunSalesOrderLifecycleAction('closed', 'closed'), false)
  assert.equal(canRunSalesOrderLifecycleAction('closed', 'canceled'), false)
  assert.equal(canRunSalesOrderLifecycleAction('draft', 'active'), false)
  assert.equal(canRunSalesOrderLifecycleAction('active', 'shipped'), false)

  assert.equal(canRunPurchaseOrderLifecycleAction('draft', 'submitted'), true)
  assert.equal(canRunPurchaseOrderLifecycleAction('draft', 'canceled'), true)
  assert.equal(
    canRunPurchaseOrderLifecycleAction('submitted', 'approved'),
    true
  )
  assert.equal(canRunPurchaseOrderLifecycleAction('approved', 'closed'), true)
  assert.equal(canRunPurchaseOrderLifecycleAction('closed', 'closed'), false)
  assert.equal(canRunPurchaseOrderLifecycleAction('closed', 'canceled'), false)
  assert.equal(canRunPurchaseOrderLifecycleAction('draft', 'approved'), false)
  assert.equal(canRunPurchaseOrderLifecycleAction('approved', 'posted'), false)

  assert.equal(
    canRunOutsourcingOrderLifecycleAction('draft', 'submitted'),
    true
  )
  assert.equal(canRunOutsourcingOrderLifecycleAction('draft', 'canceled'), true)
  assert.equal(
    canRunOutsourcingOrderLifecycleAction('submitted', 'confirmed'),
    true
  )
  assert.equal(
    canRunOutsourcingOrderLifecycleAction('confirmed', 'closed'),
    true
  )
  assert.equal(canRunOutsourcingOrderLifecycleAction('closed', 'closed'), false)
  assert.equal(
    canRunOutsourcingOrderLifecycleAction('closed', 'canceled'),
    false
  )
  assert.equal(
    canRunOutsourcingOrderLifecycleAction('draft', 'confirmed'),
    false
  )
  assert.equal(
    canRunOutsourcingOrderLifecycleAction('confirmed', 'posted'),
    false
  )
})

test('masterDataOrderView: params trim optional values without adding facts', () => {
  assert.equal(V1_ROUTE_PATHS.materials, '/erp/master/materials')
  assert.equal(V1_ROUTE_PATHS.processes, '/erp/engineering/processes')
  assert.equal(V1_ROUTE_PATHS.purchaseReceipts, '/erp/warehouse/inbound')
  assert.equal(
    V1_ROUTE_PATHS.processingContracts,
    '/erp/purchase/processing-contracts'
  )

  assert.deepEqual(
    buildMasterDataParams({
      code: ' C001 ',
      name: ' 客户 A ',
      short_name: ' ',
      default_payment_method: ' 现结 ',
      default_payment_term_days: 0,
      tax_no: '',
      note: ' 备注 ',
    }),
    {
      code: 'C001',
      name: '客户 A',
      default_payment_method: '现结',
      default_payment_term_days: 0,
      note: '备注',
    }
  )

  assert.deepEqual(
    buildMasterDataParams({
      code: ' MAT001 ',
      name: ' 面料 ',
      category: ' fabric ',
      spec: ' 75D ',
      color: ' 米白 ',
      default_unit_id: '2',
      tax_no: ' ',
      note: '',
    }),
    {
      code: 'MAT001',
      name: '面料',
      category: 'fabric',
      spec: '75D',
      color: '米白',
      default_unit_id: 2,
    }
  )

  assert.deepEqual(
    buildProductParams({
      code: ' P001 ',
      name: ' 毛绒熊 ',
      style_no: ' BEAR-BASE ',
      customer_style_no: '',
      default_unit_id: '2',
    }),
    {
      code: 'P001',
      name: '毛绒熊',
      style_no: 'BEAR-BASE',
      default_unit_id: 2,
    }
  )

  assert.deepEqual(
    buildProcessParams({
      code: ' PROC-SEW ',
      name: ' 车缝 ',
      category: ' 委外车缝 ',
      outsourcing_enabled: true,
      inhouse_enabled: false,
      quality_required: true,
      sort_order: '20',
      note: ' ',
    }),
    {
      code: 'PROC-SEW',
      name: '车缝',
      category: '委外车缝',
      outsourcing_enabled: true,
      inhouse_enabled: false,
      quality_required: true,
      sort_order: 20,
    }
  )

  assert.deepEqual(
    buildSalesOrderParams({
      order_no: ' SO001 ',
      customer_id: '3',
      order_date: '2026-05-31',
      planned_delivery_date: '',
      customer_snapshot: { id: 3, name: '客户 A' },
      sales_owner: ' 张三 ',
      contact_name: ' 李四 ',
      contact_phone: ' 0574-123456 ',
      contact_email: ' buyer@example.com ',
      payment_method: ' 30天月结 ',
      payment_term_days: '30',
      price_condition_note: ' 账期改短，单价已核对 ',
    }),
    {
      order_no: 'SO001',
      customer_id: 3,
      customer_snapshot: { id: 3, name: '客户 A' },
      sales_owner: '张三',
      contact_snapshot: {
        name: '李四',
        phone: '0574-123456',
        email: 'buyer@example.com',
      },
      payment_method: '30天月结',
      payment_term_days: 30,
      price_condition_note: '账期改短，单价已核对',
      order_date: '2026-05-31',
    }
  )

  assert.deepEqual(
    buildSalesOrderItemParams({
      line_no: '2',
      product_id: '5',
      product_sku_id: '8',
      unit_id: '1',
      product_name_snapshot: ' 玩具 ',
      ordered_quantity: '12.50',
      unit_price: ' 3.20 ',
    }),
    {
      line_no: 2,
      product_id: 5,
      product_sku_id: 8,
      unit_id: 1,
      product_name_snapshot: '玩具',
      ordered_quantity: '12.50',
      unit_price: '3.20',
      amount: '40.00',
    }
  )

  assert.deepEqual(
    buildSalesOrderItemParams(
      {
        line_no: '9',
        product_id: '5',
        unit_id: '1',
        ordered_quantity: '2',
      },
      { line_no: 3 }
    ),
    {
      line_no: 3,
      product_id: 5,
      product_sku_id: 0,
      unit_id: 1,
      ordered_quantity: '2',
    }
  )

  assert.deepEqual(
    buildPurchaseOrderParams({
      purchase_order_no: ' PO001 ',
      supplier_id: '7',
      supplier_purchase_order_no: '',
      supplier_snapshot: { id: 7, name: '供应商 A' },
      purchase_date: '2026-06-16',
      expected_arrival_date: '',
    }),
    {
      purchase_order_no: 'PO001',
      supplier_id: 7,
      supplier_snapshot: { id: 7, name: '供应商 A' },
      purchase_date: '2026-06-16',
    }
  )

  assert.deepEqual(
    buildPurchaseOrderItemParams({
      line_no: '1',
      material_id: '12',
      unit_id: '2',
      material_name_snapshot: ' 面料 ',
      purchased_quantity: '10',
      unit_price: '',
      amount: '',
      expected_arrival_date: '',
    }),
    {
      line_no: 1,
      material_id: 12,
      unit_id: 2,
      material_name_snapshot: '面料',
      purchased_quantity: '10',
    }
  )

  assert.deepEqual(
    buildPurchaseOrderItemParams(
      {
        line_no: '8',
        material_id: '12',
        unit_id: '2',
        purchased_quantity: '10',
      },
      { line_no: 2 }
    ),
    {
      line_no: 2,
      material_id: 12,
      unit_id: 2,
      purchased_quantity: '10',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderParams({
      outsourcing_order_no: ' OUT-001 ',
      supplier_id: '7',
      supplier_snapshot: { id: 7, name: '加工厂 A' },
      source_order_no: ' SO-001 ',
      source_sales_order_id: '',
      order_date: '2026-06-17',
      expected_return_date: '',
      note: ' ',
    }),
    {
      outsourcing_order_no: 'OUT-001',
      supplier_id: 7,
      supplier_snapshot: { id: 7, name: '加工厂 A' },
      source_order_no: 'SO-001',
      order_date: '2026-06-17',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemParams({
      line_no: '1',
      product_id: '12',
      process_id: '8',
      unit_id: '2',
      product_name_snapshot: ' 半成品 ',
      process_name_snapshot: ' 车缝 ',
      process_category_snapshot: ' 委外 ',
      outsourcing_quantity: '10',
      unit_price: '3.5',
      amount: '',
      expected_return_date: '',
    }),
    {
      line_no: 1,
      product_id: 12,
      process_id: 8,
      unit_id: 2,
      product_name_snapshot: '半成品',
      process_name_snapshot: '车缝',
      process_category_snapshot: '委外',
      outsourcing_quantity: '10',
      unit_price: '3.5',
      amount: '35.00',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemParams(
      {
        line_no: '7',
        product_id: '12',
        process_id: '8',
        unit_id: '2',
        outsourcing_quantity: '10',
      },
      { line_no: 2 }
    ),
    {
      line_no: 2,
      product_id: 12,
      process_id: 8,
      unit_id: 2,
      outsourcing_quantity: '10',
    }
  )
})

test('masterDataOrderView: payment condition options keep zero-day defaults and saved values', () => {
  const options = buildPaymentConditionOptions([
    { default_payment_method: ' 45天月结 ', default_payment_term_days: '45' },
  ])

  assert.equal(resolvePaymentTermDays('现结', options), 0)
  assert.equal(resolvePaymentTermDays('45天月结', options), 45)
  assert.equal(formatPaymentCondition({ payment_term_days: 0 }), '0天')
  assert.equal(
    formatPaymentCondition({
      payment_method: '30天月结',
      payment_term_days: 30,
    }),
    '30天月结 / 30天'
  )
})

test('masterDataOrderView: payment condition completeness requires method and cycle as a pair', () => {
  assert.deepEqual(paymentConditionCompleteness({}), {
    hasMethod: false,
    hasTermDays: false,
    methodRequired: false,
    termDaysRequired: false,
  })
  assert.deepEqual(
    paymentConditionCompleteness({ method: '现结', termDays: 0 }),
    {
      hasMethod: true,
      hasTermDays: true,
      methodRequired: false,
      termDaysRequired: false,
    }
  )
  assert.equal(
    paymentConditionCompleteness({ method: '30天月结' }).termDaysRequired,
    true
  )
  assert.equal(
    paymentConditionCompleteness({ termDays: 30 }).methodRequired,
    true
  )
})

test('masterDataOrderView: unit display uses readable unit truth instead of raw ids', () => {
  const units = [
    { id: 12, code: 'M', name: '米', precision: 2, is_active: true },
    { id: 13, code: 'PCS', name: 'PCS', precision: 0, is_active: true },
    {
      id: 15,
      code: 'SIM-PLUSH-CORE-KG',
      name: '核心演示单位-千克',
      precision: 3,
      is_active: true,
    },
    { id: 14, code: 'BOX', name: '箱', is_active: false },
  ]
  const unitByID = new Map(units.map((unit) => [unit.id, unit]))

  assert.equal(formatUnitDisplayName(12, unitByID), '米（M）')
  assert.equal(formatUnitDisplayName(13, unitByID), 'PCS')
  assert.equal(
    formatUnitDisplayName(15, unitByID),
    '核心演示单位-千克（SIM-PLUSH-CORE-KG）'
  )
  assert.equal(formatUnitShortDisplayName(15, unitByID), '千克（KG）')
  assert.equal(formatUnitDisplayName(undefined, unitByID), '-')
  assert.equal(formatUnitDisplayName(99, unitByID), '单位已关联')
  assert.equal(formatUnitShortDisplayName(99, unitByID), '单位已关联')

  assert.deepEqual(buildUnitSelectOptions(units), [
    {
      value: 12,
      label: '米（M）',
      suffixLabel: '米（M）',
      searchText: '米（M） 米（M）',
      title: '米（M）',
      precision: 2,
    },
    {
      value: 13,
      label: 'PCS',
      suffixLabel: 'PCS',
      searchText: 'PCS PCS',
      title: 'PCS',
      precision: 0,
    },
    {
      value: 15,
      label: '千克（KG）',
      suffixLabel: '千克（KG）',
      searchText: '千克（KG） 核心演示单位-千克（SIM-PLUSH-CORE-KG）',
      title: '核心演示单位-千克（SIM-PLUSH-CORE-KG）',
      precision: 3,
    },
  ])
})

test('masterDataOrderView: material create helpers reduce repetitive manual entry', () => {
  const records = [
    {
      code: 'MAT-20260618-001',
      category: '面料',
      color: '米白',
      default_unit_id: 12,
    },
    {
      code: 'MAT-20260618-002',
      category: '填充',
      color: '米白',
      default_unit_id: 12,
    },
    {
      code: 'SIM-OLD-CODE',
      category: '面料',
      color: '浅灰',
      default_unit_id: 13,
    },
  ]
  const unitOptions = [
    { value: 12, label: '米（M）' },
    { value: 13, label: 'PCS' },
  ]

  assert.equal(
    buildMaterialDraftCode(records, new Date('2026-06-18T10:00:00+08:00')),
    'MAT-20260618-003'
  )
  assert.deepEqual(buildTextSelectOptions(records, 'category'), [
    { value: '面料', label: '面料' },
    { value: '填充', label: '填充' },
  ])
  assert.deepEqual(buildTextSelectOptions(records, 'color'), [
    { value: '米白', label: '米白' },
    { value: '浅灰', label: '浅灰' },
  ])
  assert.equal(inferDefaultUnitID(records, unitOptions), 12)
  assert.equal(inferDefaultUnitID([], unitOptions), 12)
})

test('masterDataOrderView: draft numbers use one shared date sequence rule', () => {
  const now = new Date('2026-06-18T10:00:00+08:00')

  assert.equal(
    buildSequentialDraftCode(
      [
        { order_no: 'SO-20260618-001' },
        { order_no: 'SO-20260618-009' },
        { order_no: 'SO-20260617-999' },
        { order_no: 'SIM-YOYOOSUN-TRIAL-SO001' },
      ],
      { prefix: 'SO', field: 'order_no', now }
    ),
    'SO-20260618-010'
  )

  assert.equal(
    buildSequentialDraftCode(
      [
        { purchase_order_no: 'PO-20260618-002' },
        { order_no: 'PO-20260618-099' },
      ],
      { prefix: 'PO', field: 'purchase_order_no', now }
    ),
    'PO-20260618-003'
  )

  assert.equal(
    buildSequentialDraftCode([], { prefix: 'SUP', field: 'code', now }),
    'SUP-20260618-001'
  )
  assert.equal(buildSequentialDraftCode([], { prefix: '', now }), '')
})

test('masterDataOrderView: purchase order print draft maps current purchase facts only', () => {
  const draft = buildMaterialPurchaseContractDraftFromPurchaseOrder(
    {
      purchase_order_no: ' PO-PRINT-001 ',
      supplier_snapshot: { name: ' 供应商 A ' },
      purchase_date: 1781654400,
      expected_arrival_date: 1782259200,
    },
    [
      {
        material_id: 11,
        material_code_snapshot: ' MAT-001 ',
        material_name_snapshot: ' 面料 ',
        purchased_quantity: '10',
        unit_price: '3.50',
        amount: '',
        note: ' 头批 ',
        line_status: 'open',
      },
      {
        material_id: 12,
        material_code_snapshot: '',
        material_name_snapshot: '',
        color_snapshot: '红色',
        purchased_quantity: '2',
        unit_price: '',
        amount: '',
        line_status: 'open',
      },
      {
        material_id: 13,
        material_name_snapshot: ' 已取消材料 ',
        purchased_quantity: '99',
        line_status: 'canceled',
      },
    ],
    {
      materials: [
        { id: 12, code: 'MAT-002', name: '辅料', spec: '12mm' },
        { id: 13, code: 'MAT-013', name: '不应出现' },
      ],
    }
  )

  assert.equal(draft.contractNo, 'PO-PRINT-001')
  assert.equal(draft.supplierName, '供应商 A')
  assert.match(draft.orderDateText, /2026.*06.*17/)
  assert.match(draft.returnDateText, /2026.*06.*24/)
  assert.equal(draft.lines.length, 2)
  assert.deepEqual(draft.lines[0], {
    contractNo: 'PO-PRINT-001',
    materialName: '面料',
    vendorCode: 'MAT-001',
    unitPrice: '3.50',
    quantity: '10',
    amount: '35.00',
    remark: '头批',
  })
  assert.deepEqual(draft.lines[1], {
    contractNo: 'PO-PRINT-001',
    materialName: '辅料',
    vendorCode: 'MAT-002',
    spec: '12mm',
    quantity: '2',
    remark: '红色',
  })

  assert.deepEqual(
    buildMaterialPurchaseContractDraftFromPurchaseOrder(
      { purchase_order_no: 'PO-MISSING-DATE', supplier_snapshot: {} },
      []
    ),
    {
      contractNo: 'PO-MISSING-DATE',
      lines: [],
    }
  )
})

test('masterDataOrderView: sales order item amount derives from quantity and unit price', () => {
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '12.5',
      unit_price: '3.2',
      amount: '999',
    }),
    '40.00'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '123.11',
      unit_price: '12.11',
      amount: '',
    }),
    '1490.8621'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '0.1',
      unit_price: '0.2',
      amount: '',
    }),
    '0.02'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '1.005',
      unit_price: '1',
      amount: '',
    }),
    '1.005'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '',
      unit_price: '3.2',
      amount: ' 88 ',
    }),
    '88'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '-1',
      unit_price: '3.2',
      amount: '',
    }),
    undefined
  )
  assert.equal(
    deriveOutsourcingOrderItemAmount({
      outsourcing_quantity: '12.5',
      unit_price: '3.2',
      amount: '999',
    }),
    '40.00'
  )
})

test('masterDataOrderView: status display and snapshots are read models only', () => {
  assert.equal(statusText('active', { active: '已生效' }), '已生效')
  assert.deepEqual(
    buildCustomerSnapshot({
      id: 9,
      code: ' C009 ',
      name: ' 客户九 ',
      short_name: '',
      tax_no: 'not-copied',
    }),
    { id: 9, code: 'C009', name: '客户九' }
  )
  assert.equal(unixToDateInputValue(1780185600), '2026-05-31')
  assert.equal(formatUnixDateTime(0), '-')
  assert.match(formatUnixDateTime(1780185600), /2026.*05.*31/)
})
