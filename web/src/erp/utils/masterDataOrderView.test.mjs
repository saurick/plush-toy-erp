import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  OUTSOURCING_ORDER_SUBJECT_TYPES,
  V1_ROUTE_PATHS,
  buildPaymentConditionOptions,
  buildBOMItemSourceValuesFromMaterial,
  buildCustomerSnapshot,
  buildMaterialPurchaseContractDraftFromPurchaseOrder,
  buildMasterDataParams,
  buildMaterialDraftCode,
  buildOrderContactSnapshot,
  buildOutsourcingOrderItemParams,
  buildOutsourcingOrderItemSourceValuesFromMaterial,
  buildOutsourcingOrderItemSourceValuesFromProduct,
  buildOutsourcingOrderItemSourceValuesFromProductSKU,
  buildOutsourcingOrderParams,
  buildOutsourcingOrderSubjectSwitchValues,
  buildPurchaseOrderItemSourceValuesFromMaterial,
  contractPartySnapshotFromPrintTemplateDefaults,
  buildProcessParams,
  buildProductParams,
  buildProductSKUParams,
  formatProductUnitNetWeight,
  buildSalesOrderCustomerSourceValues,
  buildSalesOrderItemSourceValuesFromSKU,
  buildPurchaseOrderItemParams,
  buildPurchaseOrderParams,
  buildSalesOrderItemParams,
  buildSalesOrderParams,
  buildSequentialDraftCode,
  buildSupplierSnapshot,
  buildSupplierSnapshotWithContacts,
  buildContractPartySnapshot,
  buildTextSelectOptions,
  buildUnitSelectOptions,
  canRunPurchaseOrderLifecycleAction,
  canRunSalesOrderLifecycleAction,
  canRunOutsourcingOrderLifecycleAction,
  createBlankOutsourcingLine,
  deriveOutsourcingOrderItemAmount,
  deriveSalesOrderItemAmount,
  formatUnitDisplayName,
  formatUnitShortDisplayName,
  formatUnixDate,
  formatPaymentCondition,
  formatUnixDateTime,
  hasActionPermission,
  inferDefaultUnitID,
  inferProductDefaultUnitID,
  normalizeOutsourcingLineFormValue,
  paymentConditionCompleteness,
  resolvePaymentTermDays,
  statusText,
  SUPPLIER_CONTACT_OWNER_TYPE,
  summarizeOutsourcingOrderLines,
  summarizePurchaseOrderLines,
  summarizeSalesOrderLines,
  unixToDateInputValue,
} from './masterDataOrderView.mjs'
import { completeMaterialPurchaseContractDraft } from './contractPrintDraftCompleteness.mjs'

function readERPSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

test('masterDataOrderView: action permissions fail closed without projected actions', () => {
  assert.equal(
    hasActionPermission({ is_super_admin: true }, 'sales_order.create'),
    false
  )
  assert.equal(
    hasActionPermission({ is_super_admin: true }, 'unknown.future.action'),
    false
  )
  assert.equal(
    hasActionPermission(
      { permissions: ['sales_order.read', 'sales_order.update'] },
      'sales_order.update'
    ),
    false
  )
  assert.equal(
    hasActionPermission(
      { permissions: ['sales_order.read'] },
      'contact.create'
    ),
    false
  )
})

test('masterDataOrderView: active session actions narrow every account', () => {
  assert.equal(
    hasActionPermission(
      {
        is_super_admin: true,
        effective_session: { actions: ['sales_order.update'] },
      },
      'sales_order.create'
    ),
    false
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

test('masterDataOrderView: diagnostic and narrowed projections fail closed for every account', () => {
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
    false
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
    false
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
  assert.equal(V1_ROUTE_PATHS.productionOrders, '/erp/production/orders')
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
      code: ' SUP-001 ',
      name: ' 加工厂 ',
      address: ' 测试工业园 1 号 ',
      process_ids: ['3', 5],
    }),
    {
      code: 'SUP-001',
      name: '加工厂',
      address: '测试工业园 1 号',
      process_ids: [3, 5],
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
      unit_net_weight_g: null,
    }
  )

  assert.deepEqual(
    buildProcessParams({
      code: ' PROC-SEW ',
      name: ' 车缝 ',
      category: ' 委外车缝 ',
      production_route_operation_code: ' SEWING ',
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
      production_route_operation_code: 'SEWING',
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
      unit_id: 1,
      ordered_quantity: '2',
    }
  )

  assert.deepEqual(
    buildContractPartySnapshot({
      buyerCompany: ' 永绅 ',
      buyerContact: ' 采购负责人 ',
      buyerPhone: '0769-00000001',
      buyerAddress: '',
      supplierName: '不应进入源单甲方快照',
    }),
    {
      buyerCompany: '永绅',
      buyerContact: '采购负责人',
      buyerPhone: '0769-00000001',
    }
  )

  assert.deepEqual(
    contractPartySnapshotFromPrintTemplateDefaults(
      {
        templates: [
          {
            template_key: 'material-purchase-contract',
            party_defaults: {
              buyerCompany: '永绅',
              buyerContact: '采购负责人',
              buyerPhone: '0769-00000001',
              buyerAddress: '东莞-茶山',
              buyerSigner: '试用采购负责人',
            },
          },
        ],
      },
      'material-purchase-contract'
    ),
    {
      buyerCompany: '永绅',
      buyerContact: '采购负责人',
      buyerPhone: '0769-00000001',
      buyerAddress: '东莞-茶山',
      buyerSigner: '试用采购负责人',
    }
  )

  assert.deepEqual(
    buildPurchaseOrderParams({
      purchase_order_no: ' PO001 ',
      supplier_id: '7',
      supplier_purchase_order_no: '',
      supplier_snapshot: { id: 7, name: '供应商 A' },
      contract_party_snapshot: {
        buyerCompany: ' 永绅 ',
        buyerContact: '采购负责人',
        buyerPhone: '',
      },
      purchase_date: '2026-06-16',
      expected_arrival_date: '',
    }),
    {
      purchase_order_no: 'PO001',
      supplier_id: 7,
      supplier_snapshot: { id: 7, name: '供应商 A' },
      contract_party_snapshot: {
        buyerCompany: '永绅',
        buyerContact: '采购负责人',
      },
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
      contract_party_snapshot: {
        buyerCompany: ' 永绅 ',
        buyerContact: '委外负责人',
      },
      source_order_no: ' SO-001 ',
      order_date: '2026-06-17',
      expected_return_date: '',
      note: ' ',
    }),
    {
      outsourcing_order_no: 'OUT-001',
      supplier_id: 7,
      supplier_snapshot: { id: 7, name: '加工厂 A' },
      contract_party_snapshot: {
        buyerCompany: '永绅',
        buyerContact: '委外负责人',
      },
      source_order_no: 'SO-001',
      order_date: '2026-06-17',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemParams({
      line_no: '1',
      subject_type: ' product ',
      product_id: '12',
      product_sku_id: '34',
      process_id: '8',
      unit_id: '2',
      sku_code_snapshot: ' SKU-RED-M ',
      product_order_no_snapshot: ' SO-26001 ',
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
      subject_type: 'PRODUCT',
      product_id: 12,
      product_sku_id: 34,
      process_id: 8,
      unit_id: 2,
      sku_code_snapshot: 'SKU-RED-M',
      product_order_no_snapshot: 'SO-26001',
      product_name_snapshot: '半成品',
      process_name_snapshot: '车缝',
      process_category_snapshot: '委外',
      outsourcing_quantity: '10',
      unit_price: '3.5',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemParams(
      {
        line_no: '7',
        subject_type: 'PRODUCT',
        product_id: '12',
        process_id: '8',
        unit_id: '2',
        outsourcing_quantity: '10',
      },
      { line_no: 2 }
    ),
    {
      line_no: 2,
      subject_type: 'PRODUCT',
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

test('FL_outsourcing_subject_switch__clears_other_subject_and_snapshots masterDataOrderView: 加工对象切换清理主体残值但保留独立来源订单号', () => {
  assert.deepEqual(createBlankOutsourcingLine(3), {
    line_no: 3,
    subject_type: OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT,
    product_id: undefined,
    product_sku_id: undefined,
    material_id: undefined,
    process_id: undefined,
    unit_id: undefined,
    product_no_snapshot: '',
    sku_code_snapshot: '',
    product_order_no_snapshot: '',
    product_name_snapshot: '',
    material_code_snapshot: '',
    material_name_snapshot: '',
    processing_item: '',
    process_name_snapshot: '',
    process_category_snapshot: '',
    unit_name_snapshot: '',
    outsourcing_quantity: '',
    unit_price: '',
    amount: '',
    expected_return_date: '',
    note: '',
  })

  assert.deepEqual(buildOutsourcingOrderSubjectSwitchValues(' material '), {
    subject_type: OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL,
    product_id: undefined,
    product_sku_id: undefined,
    material_id: undefined,
    product_no_snapshot: '',
    sku_code_snapshot: '',
    product_name_snapshot: '',
    material_code_snapshot: '',
    material_name_snapshot: '',
    unit_id: undefined,
    unit_name_snapshot: '',
  })

  assert.deepEqual(
    buildOutsourcingOrderItemSourceValuesFromProduct(
      {
        id: 12,
        code: ' PROD-012 ',
        name: ' 玩具熊半成品 ',
        default_unit_id: 2,
      },
      { id: 2, name: ' 只 ' }
    ),
    {
      subject_type: OUTSOURCING_ORDER_SUBJECT_TYPES.PRODUCT,
      product_id: 12,
      product_sku_id: undefined,
      material_id: undefined,
      product_no_snapshot: 'PROD-012',
      sku_code_snapshot: '',
      product_name_snapshot: '玩具熊半成品',
      material_code_snapshot: '',
      material_name_snapshot: '',
      unit_id: 2,
      unit_name_snapshot: '只',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemSourceValuesFromProductSKU(
      {
        id: 34,
        sku_code: ' SKU-RED-M ',
        default_unit_id: 5,
      },
      { id: 5, name: ' 箱 ' }
    ),
    {
      product_sku_id: 34,
      sku_code_snapshot: 'SKU-RED-M',
      unit_id: 5,
      unit_name_snapshot: '箱',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemSourceValuesFromProductSKU(undefined, {
      id: 2,
      name: ' 只 ',
    }),
    {
      product_sku_id: undefined,
      sku_code_snapshot: '',
      unit_id: 2,
      unit_name_snapshot: '只',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemSourceValuesFromMaterial(
      {
        id: 18,
        code: ' MAT-018 ',
        name: ' 短毛绒布 ',
        default_unit_id: 4,
      },
      { id: 4, name: ' 米 ' }
    ),
    {
      subject_type: OUTSOURCING_ORDER_SUBJECT_TYPES.MATERIAL,
      product_id: undefined,
      product_sku_id: undefined,
      material_id: 18,
      product_no_snapshot: '',
      sku_code_snapshot: '',
      product_name_snapshot: '',
      material_code_snapshot: 'MAT-018',
      material_name_snapshot: '短毛绒布',
      unit_id: 4,
      unit_name_snapshot: '米',
    }
  )
})

test('FL_outsourcing_subject_echo__uses_migrated_subject_type masterDataOrderView: 既有加工行按迁移后主体类型回显', () => {
  assert.deepEqual(
    normalizeOutsourcingLineFormValue({
      id: 9,
      line_no: 1,
      subject_type: 'PRODUCT',
      product_id: 12,
      material_id: 88,
      product_no_snapshot: 'PROD-012',
      product_order_no_snapshot: 'SO-001',
      product_name_snapshot: '玩具熊半成品',
      material_code_snapshot: 'STALE-MAT',
      material_name_snapshot: '残留材料',
      processing_item: '脸*1',
      process_id: 5,
      unit_id: 2,
      outsourcing_quantity: '10',
      unit_price: '1.5',
      amount: '15',
      expected_return_date: 1782259200,
      line_status: 'open',
    }),
    {
      id: 9,
      line_no: 1,
      subject_type: 'PRODUCT',
      product_id: 12,
      product_sku_id: undefined,
      material_id: undefined,
      process_id: 5,
      unit_id: 2,
      product_no_snapshot: 'PROD-012',
      sku_code_snapshot: '',
      product_order_no_snapshot: 'SO-001',
      product_name_snapshot: '玩具熊半成品',
      material_code_snapshot: '',
      material_name_snapshot: '',
      processing_item: '脸*1',
      process_name_snapshot: '',
      process_category_snapshot: '',
      unit_name_snapshot: '',
      outsourcing_quantity: '10',
      unit_price: '1.5',
      amount: '15',
      expected_return_date: '2026-06-24',
      note: '',
      line_status: 'open',
    }
  )

  const materialLine = normalizeOutsourcingLineFormValue({
    subject_type: 'MATERIAL',
    product_id: 12,
    material_id: 18,
    product_no_snapshot: 'STALE-PRODUCT',
    product_name_snapshot: '残留产品',
    product_order_no_snapshot: 'SO-MATERIAL-001',
    material_code_snapshot: 'MAT-018',
    material_name_snapshot: '短毛绒布',
    processing_item: '复合面料',
  })
  assert.equal(materialLine.product_id, undefined)
  assert.equal(materialLine.product_sku_id, undefined)
  assert.equal(materialLine.product_no_snapshot, '')
  assert.equal(materialLine.sku_code_snapshot, '')
  assert.equal(materialLine.product_name_snapshot, '')
  assert.equal(materialLine.product_order_no_snapshot, 'SO-MATERIAL-001')
  assert.equal(materialLine.material_id, 18)
  assert.equal(materialLine.material_code_snapshot, 'MAT-018')
  assert.equal(materialLine.material_name_snapshot, '短毛绒布')
  assert.equal(materialLine.processing_item, '复合面料')
})

test('FL_outsourcing_subject_payload__serializes_exactly_one_subject masterDataOrderView: 加工保存只提交当前主体且金额由后端核算', () => {
  assert.deepEqual(
    buildOutsourcingOrderItemParams({
      line_no: 2,
      subject_type: ' material ',
      product_id: 12,
      material_id: 18,
      product_no_snapshot: 'STALE-PRODUCT',
      product_order_no_snapshot: ' SO-MATERIAL-001 ',
      product_name_snapshot: '残留产品',
      material_code_snapshot: ' MAT-018 ',
      material_name_snapshot: ' 短毛绒布 ',
      processing_item: ' 复合面料 ',
      process_id: 6,
      unit_id: 4,
      outsourcing_quantity: '20',
      unit_price: '2.5',
      amount: '999',
    }),
    {
      line_no: 2,
      subject_type: 'MATERIAL',
      material_id: 18,
      process_id: 6,
      unit_id: 4,
      product_order_no_snapshot: 'SO-MATERIAL-001',
      material_code_snapshot: 'MAT-018',
      material_name_snapshot: '短毛绒布',
      processing_item: '复合面料',
      outsourcing_quantity: '20',
      unit_price: '2.5',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemParams({
      line_no: 3,
      subject_type: 'PRODUCT',
      product_id: 12,
      material_id: 18,
      product_no_snapshot: ' PROD-012 ',
      product_name_snapshot: ' 玩具熊半成品 ',
      processing_item: ' 脸*1 ',
      material_code_snapshot: 'STALE-MAT',
      material_name_snapshot: '残留材料',
      process_id: 5,
      unit_id: 2,
      outsourcing_quantity: '10',
    }),
    {
      line_no: 3,
      subject_type: 'PRODUCT',
      product_id: 12,
      process_id: 5,
      unit_id: 2,
      product_no_snapshot: 'PROD-012',
      product_name_snapshot: '玩具熊半成品',
      processing_item: '脸*1',
      outsourcing_quantity: '10',
    }
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

test('FL_product_master_style_no__retains_style_no_snapshot masterDataOrderView: product master params retain style no fields', () => {
  assert.deepEqual(
    buildProductParams({
      code: ' P-STYLE-001 ',
      name: ' 款式毛绒熊 ',
      style_no: ' BEAR-2026 ',
      customer_style_no: ' YOYOO-BEAR-01 ',
      default_unit_id: '2',
      unit_net_weight_g: ' 425.000000 ',
    }),
    {
      code: 'P-STYLE-001',
      name: '款式毛绒熊',
      style_no: 'BEAR-2026',
      customer_style_no: 'YOYOO-BEAR-01',
      default_unit_id: 2,
      unit_net_weight_g: '425.000000',
    }
  )
})

test('masterDataOrderView: blank product unit net weight is an explicit null', () => {
  assert.deepEqual(
    buildProductParams({
      code: 'P-WEIGHT-UNKNOWN',
      name: '未维护单重产品',
      default_unit_id: 2,
      unit_net_weight_g: ' ',
    }),
    {
      code: 'P-WEIGHT-UNKNOWN',
      name: '未维护单重产品',
      default_unit_id: 2,
      unit_net_weight_g: null,
    }
  )
})

test('masterDataOrderView: SKU unit net weight remains a decimal string and blank clears it explicitly', () => {
  assert.deepEqual(
    buildProductSKUParams({
      product_id: '7',
      sku_code: ' SKU-WEIGHT-001 ',
      default_unit_id: '2',
      unit_net_weight_g: ' 375.000000 ',
    }),
    {
      product_id: 7,
      sku_code: 'SKU-WEIGHT-001',
      default_unit_id: 2,
      unit_net_weight_g: '375.000000',
    }
  )
  assert.deepEqual(
    buildProductSKUParams({
      product_id: '7',
      sku_code: 'SKU-WEIGHT-001',
      unit_net_weight_g: ' ',
    }),
    {
      product_id: 7,
      sku_code: 'SKU-WEIGHT-001',
      unit_net_weight_g: null,
    }
  )
})

test('masterDataOrderView: product unit net weight uses the selected default unit label', () => {
  assert.equal(formatProductUnitNetWeight('425'), '425 克')
  assert.equal(formatProductUnitNetWeight(null), '-')
})

test('FL_product_master_style_no__prefills_from_blank_source masterDataOrderView: blank product style no can rebuild before save', () => {
  assert.deepEqual(
    buildProductParams({
      code: ' P-STYLE-002 ',
      name: ' 空白款式 ',
      style_no: ' ',
      customer_style_no: '',
    }),
    {
      code: 'P-STYLE-002',
      name: '空白款式',
      unit_net_weight_g: null,
    }
  )

  assert.deepEqual(
    buildProductParams({
      code: ' P-STYLE-002 ',
      name: ' 空白款式 ',
      style_no: ' RABBIT-2026 ',
      customer_style_no: ' YOYOO-RABBIT-01 ',
    }),
    {
      code: 'P-STYLE-002',
      name: '空白款式',
      style_no: 'RABBIT-2026',
      customer_style_no: 'YOYOO-RABBIT-01',
      unit_net_weight_g: null,
    }
  )
})

test('FL_purchase_order_accessory_material__retains_material_snapshot masterDataOrderView: purchase order item params retain material snapshots', () => {
  assert.deepEqual(
    buildPurchaseOrderItemParams({
      line_no: '1',
      material_id: '21',
      unit_id: '2',
      material_code_snapshot: ' MAT-A01 ',
      material_name_snapshot: ' OPP袋 ',
      color_snapshot: ' 透明 ',
      purchased_quantity: '10',
    }),
    {
      line_no: 1,
      material_id: 21,
      unit_id: 2,
      material_code_snapshot: 'MAT-A01',
      material_name_snapshot: 'OPP袋',
      color_snapshot: '透明',
      purchased_quantity: '10',
    }
  )
})

test('FL_purchase_order_product_snapshot__retains_optional_product_display_snapshot masterDataOrderView: purchase order item params retain product display snapshots', () => {
  assert.deepEqual(
    buildPurchaseOrderItemParams({
      line_no: '1',
      material_id: '21',
      unit_id: '2',
      product_order_no_snapshot: ' SO-26001 ',
      product_no_snapshot: ' P-001 ',
      product_name_snapshot: ' 坐姿小熊 ',
      purchased_quantity: '10',
    }),
    {
      line_no: 1,
      material_id: 21,
      unit_id: 2,
      product_order_no_snapshot: 'SO-26001',
      product_no_snapshot: 'P-001',
      product_name_snapshot: '坐姿小熊',
      purchased_quantity: '10',
    }
  )

  assert.deepEqual(
    buildPurchaseOrderItemParams({
      line_no: '2',
      material_id: '21',
      unit_id: '2',
      product_order_no_snapshot: ' ',
      product_no_snapshot: '',
      product_name_snapshot: '   ',
      purchased_quantity: '10',
    }),
    {
      line_no: 2,
      material_id: 21,
      unit_id: 2,
      purchased_quantity: '10',
    }
  )
})

test('FL_purchase_order_accessory_material__clears_material_snapshot masterDataOrderView: clearing material source clears purchase line snapshots', () => {
  const currentLine = {
    material_id: 21,
    unit_id: 2,
    material_code_snapshot: 'MAT-A01',
    material_name_snapshot: 'OPP袋',
    color_snapshot: '透明',
    purchased_quantity: '10',
  }

  assert.deepEqual(
    {
      ...currentLine,
      ...buildPurchaseOrderItemSourceValuesFromMaterial(null),
    },
    {
      material_id: undefined,
      unit_id: undefined,
      material_code_snapshot: '',
      material_name_snapshot: '',
      color_snapshot: '',
      purchased_quantity: '10',
    }
  )
})

test('FL_purchase_order_accessory_material__switches_material_source masterDataOrderView: switching material source replaces stale purchase line snapshots', () => {
  const currentLine = {
    material_id: 21,
    unit_id: 2,
    material_code_snapshot: 'MAT-A01',
    material_name_snapshot: 'OPP袋',
    color_snapshot: '透明',
    purchased_quantity: '10',
  }

  assert.deepEqual(
    {
      ...currentLine,
      ...buildPurchaseOrderItemSourceValuesFromMaterial({
        id: '22',
        default_unit_id: '3',
        code: ' MAT-B02 ',
        name: ' 纸箱 ',
        color: '',
        category: 'not-copied',
      }),
    },
    {
      material_id: 22,
      unit_id: 3,
      material_code_snapshot: 'MAT-B02',
      material_name_snapshot: '纸箱',
      color_snapshot: '',
      purchased_quantity: '10',
    }
  )
})

test('FL_bom_main_material__retains_material_source masterDataOrderView: BOM item material source keeps material and default unit ids', () => {
  assert.deepEqual(
    buildBOMItemSourceValuesFromMaterial({
      id: '31',
      default_unit_id: '4',
      code: 'MAT-MAIN-01',
      name: '主面料',
    }),
    {
      material_id: 31,
      unit_id: 4,
    }
  )
})

test('FL_bom_main_material__clears_material_source masterDataOrderView: clearing BOM item material source clears stale unit id', () => {
  const currentLine = {
    material_id: 31,
    unit_id: 4,
    quantity: '2.5',
    loss_rate: '0.03',
  }

  assert.deepEqual(
    {
      ...currentLine,
      ...buildBOMItemSourceValuesFromMaterial(null),
    },
    {
      material_id: undefined,
      unit_id: undefined,
      quantity: '2.5',
      loss_rate: '0.03',
    }
  )
})

test('FL_outsourcing_return_date__retains_expected_return_date_snapshot masterDataOrderView: outsourcing order keeps expected return dates on header and lines', () => {
  assert.deepEqual(
    buildOutsourcingOrderParams({
      outsourcing_order_no: ' OUT-RET-001 ',
      supplier_id: '7',
      supplier_snapshot: { id: 7, name: '加工厂 A' },
      source_order_no: ' SO-RET-001 ',
      order_date: '2026-06-17',
      expected_return_date: ' 2026-06-24 ',
    }),
    {
      outsourcing_order_no: 'OUT-RET-001',
      supplier_id: 7,
      supplier_snapshot: { id: 7, name: '加工厂 A' },
      source_order_no: 'SO-RET-001',
      order_date: '2026-06-17',
      expected_return_date: '2026-06-24',
    }
  )

  assert.deepEqual(
    buildOutsourcingOrderItemParams({
      line_no: '1',
      subject_type: 'PRODUCT',
      product_id: '12',
      process_id: '8',
      unit_id: '2',
      outsourcing_quantity: '10',
      expected_return_date: ' 2026-06-25 ',
    }),
    {
      line_no: 1,
      subject_type: 'PRODUCT',
      product_id: 12,
      process_id: 8,
      unit_id: 2,
      outsourcing_quantity: '10',
      expected_return_date: '2026-06-25',
    }
  )
})

test('FL_shipment_ship_date__retains_planned_and_actual_ship_dates masterDataOrderView: shipment date fields stay on shipment fact source paths', () => {
  const shipmentsPageSource = readERPSource('../pages/ShipmentsPage.jsx')
  const shipmentColumnsSource = readERPSource(
    '../components/shipments/shipmentColumns.jsx'
  )

  assert.match(
    shipmentsPageSource,
    /planned_ship_at:\s*trimOptional\(values\.planned_ship_at\)/u
  )
  assert.match(
    shipmentsPageSource,
    /function buildShipmentWithItemsParams\(values = \{\}, references = \{\}\)[\s\S]*\.\.\.buildShipmentParams\(values, references\)/u
  )
  assert.match(
    shipmentColumnsSource,
    /formatUnixDate\(record\.planned_ship_at\)/u
  )
  assert.match(
    shipmentColumnsSource,
    /formatUnixDate\(\s*record\.shipped_at\s*\)/u
  )
  assert.match(
    shipmentColumnsSource,
    /exportTitle:\s*'计划出货日期 \/ 实际出货日期'/u
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
  assert.equal(
    inferProductDefaultUnitID(records, [
      { value: 12, label: '千克（KG）' },
      { value: 13, label: '件（PCS）' },
    ]),
    13
  )
  assert.equal(inferProductDefaultUnitID(records, unitOptions), 13)
  assert.equal(
    inferProductDefaultUnitID(records, [
      { value: 12, label: '米（M）' },
      { value: 15, label: '千克（KG）' },
    ]),
    12
  )
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

test('FL_sales_order_order_no__retains_order_no_snapshot masterDataOrderView: sales order params retain confirmed order no', () => {
  assert.deepEqual(
    buildSalesOrderParams({
      order_no: ' SO-20260618-010 ',
      customer_id: 3,
      order_date: '2026-06-30',
    }),
    {
      order_no: 'SO-20260618-010',
      customer_id: 3,
      customer_snapshot: {},
      contact_snapshot: {},
      order_date: '2026-06-30',
    }
  )
})

test('FL_sales_order_order_no__prefills_order_no_from_blank masterDataOrderView: sales order create draft uses shared internal sequence', () => {
  const now = new Date('2026-06-18T10:00:00+08:00')

  assert.equal(
    buildSequentialDraftCode(
      [
        { order_no: 'SO-20260618-001' },
        { order_no: 'SO-20260618-009' },
        { order_no: 'SO-20260617-999' },
        { order_no: 'CUS-PO-EXTERNAL-001' },
      ],
      { prefix: 'SO', field: 'order_no', now }
    ),
    'SO-20260618-010'
  )
})

test('masterDataOrderView: purchase order print draft maps current purchase facts only', () => {
  const draft = buildMaterialPurchaseContractDraftFromPurchaseOrder(
    {
      purchase_order_no: ' PO-PRINT-001 ',
      supplier_snapshot: {
        name: ' 供应商 A ',
        contact_name: ' 王采购 ',
        contact_phone: ' 0769-123456 ',
        contact_mobile: ' 13800000000 ',
        address: ' 东莞市样例路 1 号 ',
      },
      purchase_date: 1781654400,
      expected_arrival_date: 1782259200,
    },
    [
      {
        material_id: 11,
        product_order_no_snapshot: ' SO-26001 ',
        product_no_snapshot: ' P-001 ',
        product_name_snapshot: ' 毛绒兔 ',
        material_code_snapshot: ' MAT-001 ',
        material_name_snapshot: ' 面料 ',
        unit_id: 13,
        unit_name_snapshot: ' 米 ',
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
        unit_id: 15,
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
      {
        material_id: 14,
        material_name_snapshot: ' 旧状态取消材料 ',
        purchased_quantity: '100',
        line_status: 'CANCELLED',
      },
    ],
    {
      materials: [
        { id: 12, code: 'MAT-002', name: '辅料', spec: '12mm' },
        { id: 13, code: 'MAT-013', name: '不应出现' },
      ],
      unitOptions: [
        { value: 13, label: '米（M）' },
        { value: 15, label: '码（YD）' },
      ],
    }
  )

  assert.equal(draft.contractNo, 'PO-PRINT-001')
  assert.equal(draft.supplierName, '供应商 A')
  assert.equal(draft.supplierContact, '王采购')
  assert.equal(draft.supplierPhone, '0769-123456')
  assert.equal(draft.supplierAddress, '东莞市样例路 1 号')
  assert.match(draft.orderDateText, /2026.*06.*17/)
  assert.match(draft.returnDateText, /2026.*06.*24/)
  assert.equal(draft.lines.length, 2)
  assert(!draft.lines.some((line) => line.materialName === '已取消材料'))
  assert(!draft.lines.some((line) => line.materialName === '旧状态取消材料'))
  assert.deepEqual(draft.lines[0], {
    contractNo: 'PO-PRINT-001',
    productOrderNo: 'SO-26001',
    productNo: 'P-001',
    productName: '毛绒兔',
    materialName: '面料',
    vendorCode: 'MAT-001',
    unit: '米',
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
    unit: '码',
    quantity: '2',
    remark: '红色',
  })

  assert.deepEqual(
    buildMaterialPurchaseContractDraftFromPurchaseOrder(
      { purchase_order_no: 'PO-MISSING-DATE', supplier_snapshot: {} },
      [
        {
          material_name_snapshot: '不应进入打印',
          purchased_quantity: '1',
          line_status: 'cancelled',
        },
      ]
    ),
    {
      contractNo: 'PO-MISSING-DATE',
      lines: [],
    }
  )
})

test('FL_material_purchase_print_dates__keeps_string_date_snapshots masterDataOrderView: purchase print draft retains string date snapshots', () => {
  const draft = completeMaterialPurchaseContractDraft(
    buildMaterialPurchaseContractDraftFromPurchaseOrder(
      {
        purchase_order_no: 'SIM-PO-DATE',
        supplier_snapshot: {
          name: '合成材料供应商',
          contact_name: '合成供应商联系人',
          contact_phone: '13800000000',
          address: '合成地址-材料区A',
        },
        purchase_date: '2026-06-13',
        expected_arrival_date: '2026-06-24',
      },
      [
        {
          material_name_snapshot: '辅材',
          product_order_no_snapshot: 'SIM-SO-DATE',
          product_no_snapshot: 'SIM-PROD-001',
          product_name_snapshot: '合成玩偶甲',
          unit_name_snapshot: '米',
          purchased_quantity: '1',
          unit_price: '2',
          amount: '2',
          line_status: 'open',
        },
      ]
    )
  )

  assert.equal(draft.orderDateText, '2026-06-13')
  assert.equal(draft.returnDateText, '2026-06-24')
  assert.equal(draft.signDateText, '2026-06-13')
})

test('FL_material_purchase_print_party_defaults__uses_customer_config_party_defaults_only masterDataOrderView: purchase print draft may use customer config buyer defaults without overriding supplier snapshots', () => {
  const draft = buildMaterialPurchaseContractDraftFromPurchaseOrder(
    {
      purchase_order_no: 'PO-PRINT-CONFIG',
      supplier_snapshot: {
        name: '真实供应商',
        contact_name: '供应商联系人',
      },
    },
    [
      {
        material_name_snapshot: '拉毛布',
        purchased_quantity: '3',
        unit_price: '2',
        line_status: 'open',
      },
    ],
    {
      printTemplateDefaults: {
        templates: [
          {
            template_key: 'material-purchase-contract',
            party_defaults: {
              buyerCompany: '客户配置买方公司',
              buyerContact: '采购负责人',
              buyerPhone: '0769-00000001',
              buyerAddress: '东莞-茶山',
              buyerSigner: '试用采购负责人',
              supplierName: '不应覆盖供应商',
            },
          },
          {
            template_key: 'processing-contract',
            party_defaults: {
              buyerCompany: '加工合同买方公司',
            },
          },
        ],
      },
    }
  )

  assert.equal(draft.contractNo, 'PO-PRINT-CONFIG')
  assert.equal(draft.buyerCompany, '客户配置买方公司')
  assert.equal(draft.buyerContact, '采购负责人')
  assert.equal(draft.buyerPhone, '0769-00000001')
  assert.equal(draft.buyerAddress, '东莞-茶山')
  assert.equal(draft.buyerSigner, '试用采购负责人')
  assert.equal(draft.supplierName, '真实供应商')
  assert.equal(draft.supplierContact, '供应商联系人')
  assert.equal(draft.supplierSigner, undefined)
  assert.equal(draft.lines[0].materialName, '拉毛布')
  assert.equal(draft.lines[0].amount, '6.00')
})

test('FL_material_purchase_print_party_snapshot__order_snapshot_overrides_customer_defaults masterDataOrderView: purchase print draft reads buyer fields from source order snapshot first', () => {
  const draft = buildMaterialPurchaseContractDraftFromPurchaseOrder(
    {
      purchase_order_no: 'PO-PRINT-SNAPSHOT',
      supplier_snapshot: {
        name: '真实供应商',
      },
      contract_party_snapshot: {
        buyerCompany: '本单订购单位',
        buyerContact: '本单订购人',
        buyerPhone: '本单电话',
        buyerAddress: '本单地址',
        buyerSigner: '本单签字人',
      },
    },
    [
      {
        material_name_snapshot: '拉毛布',
        purchased_quantity: '3',
        unit_price: '2',
        line_status: 'open',
      },
    ],
    {
      printTemplateDefaults: {
        templates: [
          {
            template_key: 'material-purchase-contract',
            party_defaults: {
              buyerCompany: '客户配置买方公司',
              buyerContact: '采购负责人',
              buyerPhone: '0769-00000001',
              buyerAddress: '东莞-茶山',
              buyerSigner: '试用采购负责人',
            },
          },
        ],
      },
    }
  )

  assert.equal(draft.buyerCompany, '本单订购单位')
  assert.equal(draft.buyerContact, '本单订购人')
  assert.equal(draft.buyerPhone, '本单电话')
  assert.equal(draft.buyerAddress, '本单地址')
  assert.equal(draft.buyerSigner, '本单签字人')
})

test('FL_material_purchase_print_snapshot__does_not_fallback_to_raw_ids masterDataOrderView: purchase print draft keeps missing line snapshots blank instead of raw ids', () => {
  const draft = buildMaterialPurchaseContractDraftFromPurchaseOrder(
    {
      id: 99,
      purchase_order_no: 'PO-PRINT-RAW-GUARD',
      supplier_snapshot: {
        id: 7,
        name: '供应商 A',
      },
    },
    [
      {
        id: 88,
        material_id: 77,
        unit_id: 66,
        purchased_quantity: '1',
        unit_price: '2',
        line_status: 'open',
      },
    ],
    {
      materials: [],
      unitOptions: [],
    }
  )

  assert.equal(draft.lines.length, 1)
  assert.deepEqual(draft.lines[0], {
    contractNo: 'PO-PRINT-RAW-GUARD',
    unitPrice: '2',
    quantity: '1',
    amount: '2.00',
  })
  assert.equal(draft.lines[0].productOrderNo, undefined)
  assert.equal(draft.lines[0].productNo, undefined)
  assert.equal(draft.lines[0].productName, undefined)
  assert.equal(draft.lines[0].materialName, undefined)
  assert.equal(draft.lines[0].vendorCode, undefined)
  assert.equal(draft.lines[0].unit, undefined)
})

test('FL_sales_order_item_amount__derives_from_quantity_and_unit_price masterDataOrderView: sales order item amount derives from quantity and unit price', () => {
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
      ordered_quantity: '0',
      unit_price: '3.2',
      amount: '',
    }),
    '0.00'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '3',
      unit_price: '0',
      amount: '',
    }),
    '0.00'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '-1',
      unit_price: '3.2',
      amount: '',
    }),
    undefined
  )
})

test('FL_sales_order_item_amount__keeps_manual_snapshot_without_inputs masterDataOrderView: sales order item amount keeps manual snapshot without complete inputs', () => {
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
      ordered_quantity: '3',
      unit_price: '',
      amount: ' 99.50 ',
    }),
    '99.50'
  )
  assert.equal(
    deriveSalesOrderItemAmount({
      ordered_quantity: '',
      unit_price: '',
      amount: ' 0 ',
    }),
    '0'
  )
})

test('FL_sales_order_customer_snapshot__retains_customer_snapshot masterDataOrderView: sales order params retain customer source snapshot', () => {
  assert.deepEqual(
    buildSalesOrderParams({
      order_no: ' SO-CUST-001 ',
      customer_id: '3',
      customer_snapshot: {
        id: 3,
        code: ' C003 ',
        name: ' 客户三 ',
        short_name: ' 三号客户 ',
      },
    }),
    {
      order_no: 'SO-CUST-001',
      customer_id: 3,
      customer_snapshot: {
        id: 3,
        code: ' C003 ',
        name: ' 客户三 ',
        short_name: ' 三号客户 ',
      },
      contact_snapshot: {},
    }
  )
})

test('FL_sales_order_customer_snapshot__prefills_customer_from_blank masterDataOrderView: customer source values rebuild customer snapshot from blank', () => {
  assert.deepEqual(
    buildSalesOrderCustomerSourceValues({
      id: '3',
      code: ' C003 ',
      name: ' 客户三 ',
      short_name: ' 三号客户 ',
      tax_no: 'not-copied',
    }),
    {
      customer_id: 3,
      customer_snapshot: {
        id: '3',
        code: 'C003',
        name: '客户三',
        short_name: '三号客户',
      },
    }
  )
})

test('FL_sales_order_customer_master_selection__syncs_customer_snapshot masterDataOrderView: customer master selection syncs business snapshot', () => {
  assert.deepEqual(
    buildSalesOrderParams({
      order_no: 'SO-CUST-002',
      ...buildSalesOrderCustomerSourceValues({
        id: 4,
        code: 'C004',
        name: '客户四',
      }),
    }),
    {
      order_no: 'SO-CUST-002',
      customer_id: 4,
      customer_snapshot: {
        id: 4,
        code: 'C004',
        name: '客户四',
      },
      contact_snapshot: {},
    }
  )
})

test('FL_sales_order_customer_snapshot__clears_customer_on_source_clear masterDataOrderView: clearing customer source clears stale customer snapshot', () => {
  const currentOrder = {
    customer_id: 3,
    customer_snapshot: {
      id: 3,
      code: 'C003',
      name: '客户三',
    },
    customer_order_no: 'CUS-PO-001',
  }

  assert.deepEqual(
    {
      ...currentOrder,
      ...buildSalesOrderCustomerSourceValues(null),
    },
    {
      customer_id: undefined,
      customer_snapshot: {},
      customer_order_no: 'CUS-PO-001',
    }
  )

  assert.deepEqual(
    {
      ...currentOrder,
      ...buildSalesOrderCustomerSourceValues({
        id: 5,
        code: 'C005',
        name: '客户五',
      }),
    },
    {
      customer_id: 5,
      customer_snapshot: {
        id: 5,
        code: 'C005',
        name: '客户五',
      },
      customer_order_no: 'CUS-PO-001',
    }
  )
})

test('FL_sales_order_customer_master_selection__clears_customer_snapshot masterDataOrderView: clearing customer master selection clears business snapshot', () => {
  assert.deepEqual(
    buildSalesOrderParams({
      order_no: 'SO-CUST-003',
      ...buildSalesOrderCustomerSourceValues(null),
    }),
    {
      order_no: 'SO-CUST-003',
      customer_snapshot: {},
      contact_snapshot: {},
    }
  )
})

test('FL_sales_order_partner_contacts__syncs_contact_snapshot masterDataOrderView: partner contact fields sync to order contact snapshot', () => {
  const contactSnapshot = buildOrderContactSnapshot({
    contact_name: ' 王五 ',
    contact_phone: ' 0574-888888 ',
    contact_mobile: ' 13800000000 ',
    contact_email: ' buyer@example.com ',
    contact_title: ' 采购 ',
    note: 'not-copied',
  })
  assert.deepEqual(contactSnapshot, {
    name: '王五',
    phone: '0574-888888',
    mobile: '13800000000',
    email: 'buyer@example.com',
    title: '采购',
  })
  assert.deepEqual(
    buildSalesOrderParams({
      order_no: 'SO-CONTACT-001',
      customer_id: '3',
      customer_snapshot: { id: 3, name: '客户 A' },
      contact_snapshot: contactSnapshot,
    }),
    {
      order_no: 'SO-CONTACT-001',
      customer_id: 3,
      customer_snapshot: { id: 3, name: '客户 A' },
      contact_snapshot: {
        name: '王五',
        phone: '0574-888888',
        mobile: '13800000000',
        email: 'buyer@example.com',
        title: '采购',
      },
    }
  )
})

test('FL_sales_order_partner_contacts__clears_contact_snapshot masterDataOrderView: clearing partner contact fields clears order contact snapshot', () => {
  const currentOrder = {
    order_no: 'SO-CONTACT-002',
    customer_id: 3,
    customer_snapshot: { id: 3, name: '客户 A' },
    contact_snapshot: {
      name: '王五',
      phone: '0574-888888',
      mobile: '13800000000',
      email: 'buyer@example.com',
      title: '采购',
    },
  }
  const clearedContactSnapshot = buildOrderContactSnapshot({
    contact_name: '',
    contact_phone: ' ',
    contact_mobile: '',
    contact_email: '',
    contact_title: '',
  })
  assert.deepEqual(clearedContactSnapshot, {})
  assert.deepEqual(
    buildSalesOrderParams({
      ...currentOrder,
      contact_snapshot: clearedContactSnapshot,
    }),
    {
      order_no: 'SO-CONTACT-002',
      customer_id: 3,
      customer_snapshot: { id: 3, name: '客户 A' },
      contact_snapshot: {},
    }
  )
})

test('FL_purchase_supplier_master_selection__syncs_supplier_snapshot masterDataOrderView: supplier and processor master selection syncs supplier snapshot', () => {
  const supplierSnapshot = buildSupplierSnapshot({
    id: '7',
    code: ' SUP-007 ',
    name: ' 供应商 A ',
    short_name: ' 东莞厂 ',
    contact_name: ' 王采购 ',
    contact_phone: ' 0769-123456 ',
    contact_mobile: ' 13800000000 ',
    address: ' 东莞市样例路 1 号 ',
    tax_no: 'not-copied',
  })
  assert.deepEqual(supplierSnapshot, {
    id: '7',
    code: 'SUP-007',
    name: '供应商 A',
    short_name: '东莞厂',
    contact_name: '王采购',
    contact_phone: '0769-123456',
    contact_mobile: '13800000000',
    address: '东莞市样例路 1 号',
  })
  assert.deepEqual(
    buildPurchaseOrderParams({
      purchase_order_no: 'PO-SUP-001',
      supplier_id: '7',
      supplier_snapshot: supplierSnapshot,
    }),
    {
      purchase_order_no: 'PO-SUP-001',
      supplier_id: 7,
      supplier_snapshot: {
        id: '7',
        code: 'SUP-007',
        name: '供应商 A',
        short_name: '东莞厂',
        contact_name: '王采购',
        contact_phone: '0769-123456',
        contact_mobile: '13800000000',
        address: '东莞市样例路 1 号',
      },
    }
  )

  const processorSnapshot = buildSupplierSnapshot({
    id: 8,
    code: ' PRC-008 ',
    name: ' 加工厂 A ',
    short_name: ' 外协车缝厂 ',
    primary_contact_name: ' 李厂长 ',
    primary_contact_mobile: ' 13900000000 ',
    address: ' 宁波加工园 ',
  })
  assert.deepEqual(
    buildOutsourcingOrderParams({
      outsourcing_order_no: 'OUT-SUP-001',
      supplier_id: '8',
      supplier_snapshot: processorSnapshot,
    }),
    {
      outsourcing_order_no: 'OUT-SUP-001',
      supplier_id: 8,
      supplier_snapshot: {
        id: 8,
        code: 'PRC-008',
        name: '加工厂 A',
        short_name: '外协车缝厂',
        contact_name: '李厂长',
        contact_mobile: '13900000000',
        address: '宁波加工园',
      },
    }
  )
})

test('FL_print_supplier_contact_snapshot__prefills_from_primary_supplier_contact masterDataOrderView: supplier snapshot uses primary contact truth for print drafts', () => {
  assert.equal(SUPPLIER_CONTACT_OWNER_TYPE, 'SUPPLIER')
  const snapshot = buildSupplierSnapshotWithContacts(
    {
      id: 7,
      code: 'SUP-007',
      name: '供应商 A',
      contact_name: '旧联系人',
      contact_phone: '旧电话',
    },
    [
      {
        name: '非主联系人',
        phone: '0574-111111',
        mobile: '13811111111',
        is_primary: false,
      },
      {
        name: '主联系人',
        phone: '0574-222222',
        mobile: '13822222222',
        is_primary: true,
      },
    ]
  )

  assert.deepEqual(snapshot, {
    id: 7,
    code: 'SUP-007',
    name: '供应商 A',
    contact_name: '主联系人',
    contact_phone: '0574-222222',
    contact_mobile: '13822222222',
  })
  assert.deepEqual(
    buildSupplierSnapshotWithContacts({ id: 7, name: '供应商 A' }, []),
    {
      id: 7,
      name: '供应商 A',
    }
  )
})

test('FL_print_supplier_contact_snapshot__purchase_and_outsourcing_pages_fetch_supplier_contacts_before_save masterDataOrderView: purchase and outsourcing save paths enrich supplier snapshot from contacts API', () => {
  const purchasePageSource = readERPSource('../pages/V1PurchaseOrdersPage.jsx')
  const outsourcingPageSource = readERPSource(
    '../pages/V1OutsourcingOrdersPage.jsx'
  )
  const outsourcingFormSource = readERPSource(
    '../components/outsourcing-orders/OutsourcingOrderForm.jsx'
  )

  for (const source of [purchasePageSource, outsourcingPageSource]) {
    assert.match(source, /\blistAllContactsByOwner\s*\(/u)
    assert.doesNotMatch(source, /\blistContactsByOwner\s*\(/u)
    assert.match(source, /SUPPLIER_CONTACT_OWNER_TYPE/u)
    assert.match(source, /buildSupplierSnapshotWithContacts/u)
    assert.match(
      source,
      /const supplierSnapshot = await resolveSupplierSnapshot\(supplier,\s*\{\s*notifyOnError:\s*true,\s*\}\)/u
    )
    assert.match(
      source,
      /message\.warning\(\s*`\$\{getActionErrorMessage\(error, '加载(?:供应商|加工厂)联系人'\)\}，将仅保存(?:供应商|加工厂)基本信息`\s*\)/u
    )
    assert.doesNotMatch(
      source,
      /catch\s*\{\s*return baseSnapshot\s*\}/u,
      'contact load failure must not be silently swallowed'
    )
  }

  assert.match(outsourcingFormSource, /onSupplierChange/u)
  assert.match(outsourcingFormSource, /onChange=\{onSupplierChange\}/u)
})

test('FL_outsourcing_subject_form__wires_product_and_material_sources masterDataOrderView: 加工表单显式选择产品或材料', () => {
  const pageSource = readERPSource('../pages/V1OutsourcingOrdersPage.jsx')
  const formSource = readERPSource(
    '../components/outsourcing-orders/OutsourcingOrderForm.jsx'
  )

  for (const sourceText of [
    'listAllMaterials',
    'buildOutsourcingOrderSubjectSwitchValues',
    'buildOutsourcingOrderItemSourceValuesFromProduct',
    'buildOutsourcingOrderItemSourceValuesFromMaterial',
    'materialOptions={materialOptions}',
    'onSubjectTypeChange={handleSubjectTypeChange}',
    'onMaterialChange={handleMaterialChange}',
  ]) {
    assert.match(
      pageSource,
      new RegExp(sourceText.replace(/[{}]/gu, '\\$&'), 'u')
    )
  }
  assert.doesNotMatch(pageSource, /\blistMaterials\s*\(/u)

  for (const visibleText of [
    '加工品类',
    '产品 / 半成品（车缝、手工等）',
    '材料（布料加工等）',
    '金额预览',
    '保存时由系统按数量和单价核算',
  ]) {
    assert.match(formSource, new RegExp(visibleText, 'u'))
  }
  for (const fieldName of [
    'subject_type',
    'product_id',
    'material_id',
    'product_no_snapshot',
    'product_name_snapshot',
    'material_code_snapshot',
    'material_name_snapshot',
    'processing_item',
  ]) {
    assert.match(formSource, new RegExp(`'${fieldName}'`, 'u'))
  }
  assert.match(formSource, /key="product-source"/u)
  assert.match(formSource, /key="material-source"/u)
  assert.match(formSource, /<Input\s+readOnly/u)
  assert.doesNotMatch(formSource, /name=\{\[field\.name, 'amount'\]\}/u)
  assert.match(
    pageSource,
    /label: '来源产品订单编号',\s*value: item\?\.product_order_no_snapshot,\s*\},\s*\.\.\.\(isMaterial/u
  )
})

test('FL_supplier_processing_profile__wires_address_and_process_capabilities masterDataOrderView: 供应商资料显式维护地址与可加工工序', () => {
  const pageSource = readERPSource('../pages/V1MasterDataPage.jsx')
  const formSource = readERPSource(
    '../components/master-data/MasterDataForm.jsx'
  )
  const columnsSource = readERPSource(
    '../components/master-data/masterDataColumns.jsx'
  )

  assert.match(pageSource, /加载可加工工序/u)
  assert.match(pageSource, /supplierProcessOptions/u)
  assert.match(formSource, /label="经营 \/ 加工地址"/u)
  assert.match(formSource, /name="address"/u)
  assert.match(formSource, /label="可加工工序"/u)
  assert.match(formSource, /name="process_ids"/u)
  assert.match(formSource, /具体订单仍需逐行选择工序/u)
  assert.match(columnsSource, /dataIndex: 'address'/u)
  assert.match(columnsSource, /dataIndex: 'process_ids'/u)
})

test('FL_sales_order_source_no__retains_customer_order_no_snapshot masterDataOrderView: sales order params retain customer source no', () => {
  assert.deepEqual(
    buildSalesOrderParams({
      order_no: 'SO-SRC-001',
      customer_id: 3,
      customer_order_no: ' CUS-PO-001 ',
      order_date: '2026-06-30',
    }),
    {
      order_no: 'SO-SRC-001',
      customer_id: 3,
      customer_order_no: 'CUS-PO-001',
      customer_snapshot: {},
      contact_snapshot: {},
      order_date: '2026-06-30',
    }
  )
})

test('FL_sales_order_source_no__prefills_customer_order_no_from_blank masterDataOrderView: blank source no can be rebuilt before save', () => {
  const blankParams = buildSalesOrderParams({
    order_no: 'SO-SRC-002',
    customer_id: 3,
    customer_order_no: '',
    order_date: '2026-06-30',
  })
  assert.equal(
    Object.hasOwn(blankParams, 'customer_order_no'),
    false,
    'blank source no must not create a stale source snapshot'
  )

  assert.deepEqual(
    buildSalesOrderParams({
      order_no: 'SO-SRC-002',
      customer_id: 3,
      customer_order_no: ' CUS-PO-002 ',
      order_date: '2026-06-30',
    }),
    {
      order_no: 'SO-SRC-002',
      customer_id: 3,
      customer_order_no: 'CUS-PO-002',
      customer_snapshot: {},
      contact_snapshot: {},
      order_date: '2026-06-30',
    }
  )
})

test('FL_sales_order_source_no__clears_customer_order_no_on_source_clear masterDataOrderView: clearing source no removes stale save param', () => {
  const params = buildSalesOrderParams({
    order_no: 'SO-SRC-003',
    customer_id: 3,
    customer_order_no: '   ',
    order_date: '2026-06-30',
  })

  assert.equal(
    Object.hasOwn(params, 'customer_order_no'),
    false,
    'cleared source no should rely on backend nil clear path'
  )
  assert.deepEqual(params, {
    order_no: 'SO-SRC-003',
    customer_id: 3,
    customer_snapshot: {},
    contact_snapshot: {},
    order_date: '2026-06-30',
  })
})

test('FL_sales_order_order_date__retains_signing_date_snapshot masterDataOrderView: sales order signing date stays on form list export and save params', () => {
  const params = buildSalesOrderParams({
    order_no: 'SO-DATE-001',
    customer_id: 3,
    order_date: ' 2026-06-30 ',
    planned_delivery_date: '2026-07-05',
  })
  assert.deepEqual(params, {
    order_no: 'SO-DATE-001',
    customer_id: 3,
    customer_snapshot: {},
    contact_snapshot: {},
    order_date: '2026-06-30',
    planned_delivery_date: '2026-07-05',
  })
  assert.match(formatUnixDate(1_782_777_600), /2026.*06.*30/)

  const formSource = readERPSource(
    '../components/sales-orders/SalesOrderForm.jsx'
  )
  const columnsSource = readERPSource(
    '../components/sales-orders/salesOrderColumns.jsx'
  )
  const pageConfigSource = readERPSource(
    '../components/sales-orders/salesOrderPageConfig.mjs'
  )

  assert.match(
    formSource,
    /label="签约日期"[\s\S]*name="order_date"[\s\S]*<DateInput/u
  )
  assert.match(
    columnsSource,
    /title: '签约日期'[\s\S]*exportTitle: '签约日期'[\s\S]*dataIndex: 'order_date'/u
  )
  assert.match(pageConfigSource, /label: '签约日期'[\s\S]*value: 'order_date'/u)
  assert.doesNotMatch(formSource, /label="下单日期"/u)
  assert.doesNotMatch(columnsSource, /title: '下单日期'/u)
})

test('FL_sales_order_item_source_snapshot__retains_product_sku_snapshots masterDataOrderView: sales order item params retain product SKU source snapshots', () => {
  assert.deepEqual(
    buildSalesOrderItemParams({
      line_no: '4',
      product_id: '12',
      product_sku_id: '34',
      unit_id: '2',
      product_code_snapshot: ' SKU-001 ',
      product_name_snapshot: ' 坐姿小熊 ',
      color_snapshot: ' 棕色 ',
      ordered_quantity: '6',
    }),
    {
      line_no: 4,
      product_id: 12,
      product_sku_id: 34,
      unit_id: 2,
      product_code_snapshot: 'SKU-001',
      product_name_snapshot: '坐姿小熊',
      color_snapshot: '棕色',
      ordered_quantity: '6',
    }
  )

  assert.deepEqual(
    buildSalesOrderItemParams({
      line_no: '5',
      product_id: '12',
      product_sku_id: '34',
      unit_id: '2',
      product_code_snapshot: '',
      product_name_snapshot: '   ',
      color_snapshot: '',
      ordered_quantity: '6',
    }),
    {
      line_no: 5,
      product_id: 12,
      product_sku_id: 34,
      unit_id: 2,
      ordered_quantity: '6',
    }
  )
})

test('masterDataOrderView: editing does not infer a SKU for a historical unallocated line', () => {
  const params = buildSalesOrderItemParams({
    line_no: 6,
    product_id: 12,
    product_sku_id: null,
    unit_id: 2,
    product_code_snapshot: '',
    product_name_snapshot: '历史未分规格产品',
    color_snapshot: '',
    ordered_quantity: '6',
  })

  assert.deepEqual(params, {
    line_no: 6,
    product_id: 12,
    unit_id: 2,
    product_name_snapshot: '历史未分规格产品',
    ordered_quantity: '6',
  })
  assert.equal(Object.hasOwn(params, 'product_sku_id'), false)

  const formSource = readERPSource(
    '../components/sales-orders/SalesOrderForm.jsx'
  )
  assert.doesNotMatch(formSource, /function findOrderLineSKU\b/u)
  assert.doesNotMatch(
    formSource,
    /const matchedSKU = findOrderLineSKU[\s\S]*product_sku_id: matchedSKU\.id/u
  )
  assert.match(
    formSource,
    /name=\{\[field\.name, 'product_sku_id'\]\}[\s\S]*onChange=\{\(value, option\) => \{[\s\S]*setOrderLineSourceFromSKU\(form, field\.name, sku\)/u
  )
})

test('FL_sales_order_item_source_snapshot__prefills_product_sku_from_blank masterDataOrderView: SKU source values rebuild product snapshots from blank', () => {
  assert.deepEqual(
    buildSalesOrderItemSourceValuesFromSKU({
      id: '34',
      product_id: '12',
      default_unit_id: '2',
      sku_code: ' SKU-001 ',
      sku_name: ' 坐姿小熊 ',
      customer_sku: 'CUS-001',
      barcode: 'BAR-001',
      color: ' 棕色 ',
    }),
    {
      product_sku_id: 34,
      product_id: 12,
      unit_id: 2,
      product_code_snapshot: 'SKU-001',
      product_name_snapshot: '坐姿小熊',
      color_snapshot: '棕色',
    }
  )

  assert.deepEqual(
    buildSalesOrderItemSourceValuesFromSKU({
      id: 35,
      product_id: 13,
      default_unit_id: 3,
      sku_code: '',
      sku_name: '',
      customer_sku: ' 客户款-35 ',
      barcode: 'BAR-035',
      color: '',
    }),
    {
      product_sku_id: 35,
      product_id: 13,
      unit_id: 3,
      product_code_snapshot: '',
      product_name_snapshot: '客户款-35',
      color_snapshot: '',
    }
  )
})

test('FL_sales_order_product_description__mirrors_sku_description_snapshot masterDataOrderView: product description mirrors SKU name with controlled fallbacks', () => {
  assert.deepEqual(
    buildSalesOrderItemSourceValuesFromSKU({
      id: '41',
      product_id: '14',
      default_unit_id: '2',
      sku_code: 'SKU-DESC-001',
      sku_name: ' 坐姿小熊中文描述 ',
      customer_sku: 'CUS-DESC-001',
      barcode: 'BAR-DESC-001',
      color: '浅棕',
    }),
    {
      product_sku_id: 41,
      product_id: 14,
      unit_id: 2,
      product_code_snapshot: 'SKU-DESC-001',
      product_name_snapshot: '坐姿小熊中文描述',
      color_snapshot: '浅棕',
    }
  )

  assert.equal(
    buildSalesOrderItemSourceValuesFromSKU({
      id: 42,
      product_id: 14,
      sku_name: '',
      customer_sku: ' 客户款描述-42 ',
      barcode: 'BAR-DESC-042',
    }).product_name_snapshot,
    '客户款描述-42'
  )
  assert.equal(
    buildSalesOrderItemSourceValuesFromSKU({
      id: 43,
      product_id: 14,
      sku_name: ' ',
      customer_sku: '',
      barcode: ' BAR-DESC-043 ',
    }).product_name_snapshot,
    'BAR-DESC-043'
  )

  const params = buildSalesOrderItemParams({
    line_no: 6,
    product_id: 14,
    product_sku_id: 41,
    unit_id: 2,
    product_code_snapshot: 'SKU-DESC-001',
    product_name_snapshot: '坐姿小熊中文描述',
    ordered_quantity: '12',
  })
  assert.equal(params.product_name_snapshot, '坐姿小熊中文描述')
  assert.equal(Object.hasOwn(params, 'product_description_snapshot'), false)
  assert.equal(Object.hasOwn(params, 'product_description'), false)
})

test('FL_sales_order_product_master_selection__syncs_product_sku_selection masterDataOrderView: SKU master selection syncs product ids and unit', () => {
  assert.deepEqual(
    buildSalesOrderItemSourceValuesFromSKU({
      id: '34',
      product_id: '12',
      default_unit_id: '2',
      sku_code: ' SKU-001 ',
      sku_name: ' 坐姿小熊 ',
      color: ' 棕色 ',
    }),
    {
      product_sku_id: 34,
      product_id: 12,
      unit_id: 2,
      product_code_snapshot: 'SKU-001',
      product_name_snapshot: '坐姿小熊',
      color_snapshot: '棕色',
    }
  )
})

test('FL_sales_order_product_master_selection__clears_product_sku_selection masterDataOrderView: clearing SKU master selection clears product ids and unit', () => {
  const currentLine = {
    product_sku_id: 34,
    product_id: 12,
    unit_id: 2,
    product_code_snapshot: 'SKU-001',
    product_name_snapshot: '坐姿小熊',
    color_snapshot: '棕色',
    ordered_quantity: '6',
  }

  assert.deepEqual(
    {
      ...currentLine,
      ...buildSalesOrderItemSourceValuesFromSKU(null),
    },
    {
      product_sku_id: undefined,
      product_id: undefined,
      unit_id: undefined,
      product_code_snapshot: '',
      product_name_snapshot: '',
      color_snapshot: '',
      ordered_quantity: '6',
    }
  )
})

test('FL_sales_order_item_source_snapshot__clears_product_sku_on_source_clear masterDataOrderView: clearing SKU source clears stale product snapshots', () => {
  const currentLine = {
    product_sku_id: 34,
    product_id: 12,
    unit_id: 2,
    product_code_snapshot: 'SKU-001',
    product_name_snapshot: '坐姿小熊',
    color_snapshot: '棕色',
    ordered_quantity: '6',
  }

  assert.deepEqual(
    {
      ...currentLine,
      ...buildSalesOrderItemSourceValuesFromSKU(null),
    },
    {
      product_sku_id: undefined,
      product_id: undefined,
      unit_id: undefined,
      product_code_snapshot: '',
      product_name_snapshot: '',
      color_snapshot: '',
      ordered_quantity: '6',
    }
  )
  const clearedParams = buildSalesOrderItemParams({
    line_no: 1,
    ordered_quantity: '6',
    ...buildSalesOrderItemSourceValuesFromSKU(null),
  })
  assert.equal(
    Object.hasOwn(clearedParams, 'product_sku_id'),
    false,
    'cleared SKU source must not serialize product_sku_id as 0'
  )
  assert.equal(
    Object.hasOwn(clearedParams, 'product_id'),
    false,
    'cleared SKU source must not serialize product_id as 0'
  )
  assert.equal(
    Object.hasOwn(clearedParams, 'unit_id'),
    false,
    'cleared SKU source must not serialize unit_id as 0'
  )
  assert.deepEqual(clearedParams, {
    line_no: 1,
    ordered_quantity: '6',
  })

  assert.deepEqual(
    {
      ...currentLine,
      ...buildSalesOrderItemSourceValuesFromSKU({
        id: 36,
        product_id: 15,
        default_unit_id: 4,
        sku_code: 'SKU-NEW',
        sku_name: '趴姿小熊',
        color: '米白',
      }),
    },
    {
      product_sku_id: 36,
      product_id: 15,
      unit_id: 4,
      product_code_snapshot: 'SKU-NEW',
      product_name_snapshot: '趴姿小熊',
      color_snapshot: '米白',
      ordered_quantity: '6',
    }
  )
})

test('FL_sales_order_line_summary__derives_header_totals_from_items masterDataOrderView: sales order line summary derives header totals from current items', () => {
  assert.deepEqual(
    summarizeSalesOrderLines([
      {
        ordered_quantity: ' 12.5 ',
        unit_price: '3.2',
        amount: '999',
      },
      {
        ordered_quantity: '2',
        unit_price: '',
        amount: ' 8.50 ',
      },
      {
        ordered_quantity: 'bad-value',
        unit_price: '10',
        amount: '',
      },
    ]),
    {
      count: 3,
      quantity: '14.5',
      amount: '48.5',
    }
  )
  assert.deepEqual(summarizeSalesOrderLines(null), {
    count: 0,
    quantity: '0',
    amount: '0',
  })
})

test('FL_sales_order_line_summary__keeps_header_snapshot_without_current_items masterDataOrderView: sales order line summary keeps header snapshot when current items are unavailable', () => {
  assert.deepEqual(
    summarizeSalesOrderLines([], {
      item_count: '2',
      quantity_total: ' 5.5 ',
      amount_total: '88.10',
    }),
    {
      count: 2,
      quantity: '5.5',
      amount: '88.1',
    }
  )
  assert.deepEqual(
    summarizeSalesOrderLines(
      [
        {
          ordered_quantity: '3',
          unit_price: '4',
          amount: '999',
        },
      ],
      {
        item_count: '2',
        quantity_total: '5.5',
        amount_total: '88.10',
      }
    ),
    {
      count: 1,
      quantity: '3',
      amount: '12',
    }
  )
})

test('source document line summaries preserve numeric(20,6) boundary values exactly', () => {
  const lines = [
    {
      purchased_quantity: '99999999999999.999999',
      outsourcing_quantity: '99999999999999.999999',
      unit_price: '',
      amount: '99999999999999.999999',
    },
    {
      purchased_quantity: '0.000001',
      outsourcing_quantity: '0.000001',
      unit_price: '',
      amount: '0.000001',
    },
  ]
  const expected = {
    count: 2,
    quantity: '100000000000000',
    amount: '100000000000000',
  }
  assert.deepEqual(summarizePurchaseOrderLines(lines), expected)
  assert.deepEqual(summarizeOutsourcingOrderLines(lines), expected)
})

test('masterDataOrderView: outsourcing order item amount derives from quantity and unit price', () => {
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
  assert.equal(
    statusText('unknown_status_key', { active: '已生效' }),
    '业务状态'
  )
  assert.equal(
    statusText('unknown_line_status_key', { open: '未关闭' }, '明细状态'),
    '明细状态'
  )
  assert.equal(statusText('', { active: '已生效' }), '-')
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
