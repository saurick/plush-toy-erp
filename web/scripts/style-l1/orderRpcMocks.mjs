import { styleRpcResult, unsupportedRpcMethod } from './rpcMockResult.mjs'

export async function installOrderRpcMocks(page, context) {
  const { nowUnix } = context

  await page.route('**/rpc/sales_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const salesOrder = {
      id: 1,
      order_no: 'SO-STYLE-L1',
      customer_id: 1,
      customer_snapshot: { id: 1, code: 'CUS-STYLE-L1', name: '暗色客户' },
      customer_order_no: 'PO-STYLE-L1',
      title: '样式销售订单',
      order_date: nowUnix(),
      expected_ship_date: nowUnix() + 86_400,
      lifecycle_status: 'draft',
      version: 1,
      item_count: 1,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const salesOrderItem = {
      id: 1,
      sales_order_id: 1,
      line_no: 1,
      product_id: 1,
      product_sku_id: 1,
      product_snapshot: { id: 1, code: 'PROD-STYLE-L1', name: '样式产品' },
      product_code_snapshot: 'PROD-STYLE-L1',
      product_name_snapshot: '样式产品',
      sku_code_snapshot: 'SKU-STYLE-L1',
      color_snapshot: '深棕',
      ordered_quantity: '10',
      unit_id: 1,
      unit_snapshot: { id: 1, code: 'PCS', name: '只' },
      unit_name_snapshot: '只',
      unit_price: '12.50',
      amount: '125.00',
      line_status: 'open',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_sales_orders':
        data = { sales_orders: [salesOrder], total: 1, limit: 100, offset: 0 }
        break
      case 'list_sales_order_items':
        data = {
          sales_order_items: [salesOrderItem],
          total: 1,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'save_sales_order_with_items':
        data = {
          sales_order: {
            ...salesOrder,
            ...params,
            version: Number(params.expected_version || 0) + 1,
          },
          sales_order_items: [salesOrderItem],
        }
        break
      case 'create_sales_order':
      case 'update_sales_order':
      case 'get_sales_order':
      case 'submit_sales_order':
      case 'activate_sales_order':
      case 'close_sales_order':
      case 'cancel_sales_order':
        data = { sales_order: { ...salesOrder, ...params } }
        break
      case 'add_sales_order_item':
      case 'update_sales_order_item':
      case 'remove_sales_order_item':
        data = { sales_order_item: { ...salesOrderItem, ...params } }
        break
      default:
        data = unsupportedRpcMethod('sales_order', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  await page.route('**/rpc/purchase_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const purchaseOrder = {
      id: 1,
      purchase_order_no: 'PO-STYLE-L1',
      supplier_id: 1,
      supplier_snapshot: { id: 1, code: 'SUP-STYLE-L1', name: '样式供应商' },
      supplier_purchase_order_no: 'SUP-PO-STYLE',
      purchase_date: nowUnix(),
      expected_arrival_date: nowUnix() + 86_400 * 7,
      lifecycle_status: 'draft',
      version: 1,
      item_count: 1,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const purchaseOrderItem = {
      id: 1,
      purchase_order_id: 1,
      line_no: 1,
      material_id: 1,
      production_operation_code: 'FABRIC_PROCESSING',
      material_code_snapshot: 'MAT-STYLE-L1',
      material_name_snapshot: '样式材料',
      color_snapshot: '米白',
      purchased_quantity: '20',
      unit_id: 1,
      unit_price: '3.50',
      amount: '70.00',
      expected_arrival_date: nowUnix() + 86_400 * 7,
      line_status: 'open',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_purchase_orders':
        data = {
          purchase_orders: [purchaseOrder],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_purchase_order_items':
        data = {
          purchase_order_items: [purchaseOrderItem],
          total: 1,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'save_purchase_order_with_items':
        data = {
          purchase_order: {
            ...purchaseOrder,
            ...params,
            version: Number(params.expected_version || 0) + 1,
          },
          purchase_order_items: [purchaseOrderItem],
        }
        break
      case 'create_purchase_order':
      case 'update_purchase_order':
      case 'get_purchase_order':
      case 'submit_purchase_order':
      case 'approve_purchase_order':
      case 'close_purchase_order':
      case 'cancel_purchase_order':
        data = { purchase_order: { ...purchaseOrder, ...params } }
        break
      case 'add_purchase_order_item':
      case 'update_purchase_order_item':
      case 'remove_purchase_order_item':
        data = { purchase_order_item: { ...purchaseOrderItem, ...params } }
        break
      default:
        data = unsupportedRpcMethod('purchase_order', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  await page.route('**/rpc/outsourcing_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const outsourcingOrder = {
      id: 1,
      outsourcing_order_no: 'SIM-OUTSOURCE-CONTRACT-L1',
      supplier_id: 1,
      supplier_snapshot: {
        id: 1,
        code: 'SUP-OUT-L1',
        short_name: '样式加工厂',
        name: '样式加工厂',
      },
      source_order_no: 'SO-STYLE-L1',
      source_sales_order_id: 1,
      order_date: nowUnix(),
      expected_return_date: nowUnix() + 86_400 * 7,
      lifecycle_status: 'draft',
      version: 1,
      item_count: 1,
      note: '样式加工合同',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const outsourcingOrderItem = {
      id: 12,
      outsourcing_order_id: 1,
      line_no: 1,
      subject_type: 'PRODUCT',
      product_id: 1,
      product_sku_id: 201,
      process_id: 1,
      unit_id: 1,
      product_no_snapshot: 'PROD-STYLE-L1',
      sku_code_snapshot: 'SKU-OUTSOURCE-SNAPSHOT-L1',
      product_name_snapshot: '样式产品',
      process_name_snapshot: '车缝',
      process_category_snapshot: '委外车缝',
      unit_name_snapshot: '只',
      outsourcing_quantity: '20',
      unit_price: '1.80',
      amount: '36.00',
      expected_return_date: nowUnix() + 86_400 * 7,
      line_status: 'open',
      note: '样式加工明细',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const confirmedOutsourcingOrder = {
      ...outsourcingOrder,
      id: 2,
      outsourcing_order_no: 'SIM-OUTSOURCE-SEWING-CONFIRMED',
      supplier_snapshot: {
        id: 2,
        code: 'SUP-SEW-L1',
        short_name: '永绅车缝加工厂',
        name: '永绅车缝加工厂',
      },
      lifecycle_status: 'confirmed',
      version: 3,
      item_count: 5,
      note: '已确认的车缝加工合同',
    }
    const confirmedOutsourcingOrderItems = [
      {
        ...outsourcingOrderItem,
        id: 22,
        outsourcing_order_id: 2,
        product_id: 301,
        product_sku_id: 401,
        process_id: 902,
        unit_id: 501,
        product_no_snapshot: 'PROD-STYLE-L1',
        sku_code_snapshot: 'SKU-STYLE-L1-LONG',
        product_name_snapshot: '超长产品名称用于验证生产订单明细可读换行',
        process_name_snapshot: '车缝',
        process_category_snapshot: '车缝',
        unit_name_snapshot: '只',
        outsourcing_quantity: '20.0000',
        line_status: 'open',
      },
      {
        ...outsourcingOrderItem,
        id: 23,
        outsourcing_order_id: 2,
        line_no: 2,
        product_id: 301,
        product_sku_id: 401,
        process_id: 903,
        unit_id: 501,
        product_no_snapshot: 'PROD-STYLE-L1',
        sku_code_snapshot: 'SKU-STYLE-L1-LONG',
        product_name_snapshot: '超长产品名称用于验证生产订单明细可读换行',
        process_name_snapshot: '手工',
        process_category_snapshot: '手工',
        unit_name_snapshot: '只',
        outsourcing_quantity: '20',
        line_status: 'open',
      },
      {
        ...outsourcingOrderItem,
        id: 24,
        outsourcing_order_id: 2,
        line_no: 3,
        product_id: 301,
        product_sku_id: 401,
        process_id: 902,
        unit_id: 501,
        product_no_snapshot: 'PROD-STYLE-L1',
        sku_code_snapshot: 'SKU-STYLE-L1-LONG',
        product_name_snapshot: '超长产品名称用于验证生产订单明细可读换行',
        process_name_snapshot: '车缝',
        process_category_snapshot: '车缝',
        unit_name_snapshot: '只',
        outsourcing_quantity: '20',
        line_status: 'closed',
      },
      {
        ...outsourcingOrderItem,
        id: 25,
        outsourcing_order_id: 2,
        line_no: 4,
        subject_type: 'MATERIAL',
        product_id: null,
        product_sku_id: null,
        material_id: 1,
        process_id: 901,
        unit_id: 1,
        product_no_snapshot: '',
        sku_code_snapshot: '',
        product_name_snapshot: '',
        material_code_snapshot: 'MAT-STYLE-L1',
        material_name_snapshot: '样式短毛绒布',
        process_name_snapshot: '布料加工',
        process_category_snapshot: '布料加工',
        unit_name_snapshot: '米',
        outsourcing_quantity: '10.2',
        line_status: 'open',
      },
      {
        ...outsourcingOrderItem,
        id: 26,
        outsourcing_order_id: 2,
        line_no: 5,
        subject_type: 'MATERIAL',
        product_id: null,
        product_sku_id: null,
        material_id: 2,
        process_id: 901,
        unit_id: 1,
        product_no_snapshot: '',
        sku_code_snapshot: '',
        product_name_snapshot: '',
        material_code_snapshot: 'MAT-LINING-L1',
        material_name_snapshot: '样式里布',
        process_name_snapshot: '布料加工',
        process_category_snapshot: '布料加工',
        unit_name_snapshot: '米',
        outsourcing_quantity: '5',
        line_status: 'open',
      },
    ]

    let data = {}
    switch (method) {
      case 'list_outsourcing_orders':
        {
          const rows =
            params.lifecycle_status === 'confirmed'
              ? [confirmedOutsourcingOrder]
              : [outsourcingOrder]
          const limit = Number(params.limit || 100)
          const offset = Number(params.offset || 0)
          data = {
            outsourcing_orders: rows.slice(offset, offset + limit),
            total: rows.length,
            limit,
            offset,
          }
        }
        break
      case 'list_outsourcing_order_items':
        {
          const sourceItems =
            Number(params.outsourcing_order_id) === confirmedOutsourcingOrder.id
              ? confirmedOutsourcingOrderItems
              : [outsourcingOrderItem]
          const rows = params.line_status
            ? sourceItems.filter(
                (item) => item.line_status === params.line_status
              )
            : sourceItems
          const limit = Number(params.limit || 50)
          const offset = Number(params.offset || 0)
          data = {
            outsourcing_order_items: rows.slice(offset, offset + limit),
            total: rows.length,
            limit,
            offset,
          }
        }
        break
      case 'save_outsourcing_order_with_items':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            version: Number(params.expected_version || 0) + 1,
          },
          outsourcing_order_items: [outsourcingOrderItem],
        }
        break
      case 'get_outsourcing_order':
        data = {
          outsourcing_order:
            Number(params.id) === confirmedOutsourcingOrder.id
              ? confirmedOutsourcingOrder
              : { ...outsourcingOrder, ...params },
        }
        break
      case 'submit_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'submitted',
          },
        }
        break
      case 'confirm_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'confirmed',
          },
        }
        break
      case 'close_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'closed',
          },
        }
        break
      case 'cancel_outsourcing_order':
        data = {
          outsourcing_order: {
            ...outsourcingOrder,
            ...params,
            lifecycle_status: 'canceled',
          },
        }
        break
      default:
        data = unsupportedRpcMethod('outsourcing_order', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  await page.route('**/rpc/bom', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const bomVersion = {
      id: 1,
      product_id: 1,
      version: 'BOM-STYLE-L1',
      status: 'ACTIVE',
      item_count: 3,
      effective_from: nowUnix(),
      effective_to: null,
      note: '样式回归 BOM',
      created_at: nowUnix(),
      updated_at: nowUnix(),
      edit_version: Date.now() * 1000,
    }
    const bomDraft = {
      ...bomVersion,
      id: 2,
      version: params.version || 'BOM-STYLE-DRAFT',
      status: 'DRAFT',
      note: params.note || '',
    }
    const bomItem = {
      id: 1,
      bom_header_id: 1,
      material_id: 1,
      quantity: '2.5000',
      unit_id: 1,
      loss_rate: '0.0300',
      position: '面料',
      note: '主料',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const bomItems = [
      bomItem,
      {
        ...bomItem,
        id: 2,
        material_id: 2,
        production_operation_code: null,
        quantity: '0.8500',
        loss_rate: '0.0500',
        position: '填充',
        note: '辅料',
      },
      {
        ...bomItem,
        id: 3,
        material_id: 3,
        production_operation_code: null,
        quantity: '1.0000',
        loss_rate: '0',
        position: '包装',
        note: '包装料',
      },
    ]

    let data = {}
    switch (method) {
      case 'list_bom_versions':
        data = {
          bom_versions: [bomVersion, bomDraft],
          total: 2,
          limit: 100,
          offset: 0,
        }
        break
      case 'get_bom_version':
        data = {
          bom_version:
            Number(params.id || 0) === 2
              ? { ...bomDraft, items: bomItems }
              : { ...bomVersion, items: bomItems },
          bom_items: bomItems,
        }
        break
      case 'save_bom_with_items':
      case 'copy_bom_version':
        data = {
          bom_version: {
            ...bomDraft,
            ...params,
            edit_version: bomDraft.edit_version + 1,
            items: Array.isArray(params.items) ? params.items : bomItems,
          },
          bom_items: bomItems,
        }
        break
      case 'activate_bom_version':
        data = {
          bom_version: { ...bomDraft, status: 'ACTIVE' },
          bom_items: [bomItem],
        }
        break
      case 'archive_bom_version':
        data = { bom_version: { ...bomVersion, status: 'ARCHIVED' } }
        break
      default:
        data = unsupportedRpcMethod('bom', method)
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  const productionOrder = {
    id: 71,
    order_no: 'MO-STYLE-L1-20260713',
    status: 'DRAFT',
    version: 1,
    item_count: 22,
    planned_start_at: nowUnix() + 86_400,
    planned_end_at: nowUnix() + 86_400 * 7,
    note: '长文本生产计划用于验证列表、详情、窄屏和动作区不会互相覆盖。',
    close_reason: null,
    cancel_reason: null,
    created_by: 1,
    released_by: null,
    closed_by: null,
    cancelled_by: null,
    released_at: null,
    closed_at: null,
    cancelled_at: null,
    created_at: nowUnix(),
    updated_at: nowUnix(),
  }
  const productionOrderItems = Array.from({ length: 22 }, (_, index) => ({
    id: 7100 + index,
    production_order_id: 71,
    line_no: index + 1,
    product_id: 301,
    product_sku_id: 401,
    unit_id: 501,
    planned_quantity: index === 0 ? '999999999999.9999' : '20.0000',
    sales_order_item_id: 601,
    bom_header_id: 701,
    route_code: 'PLUSH_SEW_HAND_V1',
    customer_inspection_required: false,
    product_code_snapshot: 'PROD-STYLE-L1',
    product_name_snapshot: '超长产品名称用于验证生产订单明细可读换行',
    sku_code_snapshot: 'SKU-STYLE-L1-LONG',
    unit_name_snapshot: '只',
    bom_version_snapshot: 'BOM-STYLE-L1-V20260713',
    note: index === 0 ? '连续长文本ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' : '',
    created_at: nowUnix(),
    updated_at: nowUnix(),
  }))
  const productionMaterialRequirements = [
    {
      id: 7200,
      production_order_id: 71,
      production_order_item_id: 7100,
      bom_header_id: 701,
      bom_item_id: 7300,
      material_id: 1,
      unit_id: 1,
      production_operation_code: 'FABRIC_PROCESSING',
      unit_quantity_snapshot: '0.500000',
      loss_rate_snapshot: '0',
      planned_quantity: '10.2',
      issued_quantity: '10.2',
      remaining_quantity: '0',
      material_code_snapshot: 'MAT-STYLE-L1',
      material_name_snapshot: '样式短毛绒布',
      unit_code_snapshot: 'M',
      unit_name_snapshot: '米',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 7201,
      production_order_id: 71,
      production_order_item_id: 7101,
      bom_header_id: 701,
      bom_item_id: 7301,
      material_id: 1,
      unit_id: 1,
      production_operation_code: 'FABRIC_PROCESSING',
      unit_quantity_snapshot: '0.500000',
      loss_rate_snapshot: '0.020000',
      planned_quantity: '10.200000',
      issued_quantity: '2.200000',
      remaining_quantity: '8.000000',
      material_code_snapshot: 'MAT-STYLE-L1',
      material_name_snapshot: '样式短毛绒布',
      unit_code_snapshot: 'M',
      unit_name_snapshot: '米',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 7202,
      production_order_id: 71,
      production_order_item_id: 7102,
      bom_header_id: 701,
      bom_item_id: 7302,
      material_id: 1,
      unit_id: 1,
      production_operation_code: 'FABRIC_PROCESSING',
      unit_quantity_snapshot: '0.500000',
      loss_rate_snapshot: '0.020000',
      planned_quantity: '10.2',
      issued_quantity: '10.2',
      remaining_quantity: '0',
      material_code_snapshot: 'MAT-STYLE-L1',
      material_name_snapshot: '样式短毛绒布',
      unit_code_snapshot: 'M',
      unit_name_snapshot: '米',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 7203,
      production_order_id: 71,
      production_order_item_id: 7102,
      bom_header_id: 701,
      bom_item_id: 7303,
      material_id: 2,
      unit_id: 1,
      production_operation_code: 'FABRIC_PROCESSING',
      unit_quantity_snapshot: '0.250000',
      loss_rate_snapshot: '0',
      planned_quantity: '5',
      issued_quantity: '5',
      remaining_quantity: '0',
      material_code_snapshot: 'MAT-LINING-L1',
      material_name_snapshot: '样式里布',
      unit_code_snapshot: 'M',
      unit_name_snapshot: '米',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
  ]
  let productionRequirementsFrozen = false
  const productionMaterialRequirementProjection = () => ({
    production_material_requirements: productionRequirementsFrozen
      ? productionMaterialRequirements
      : [],
    material_requirements_state: productionRequirementsFrozen
      ? 'READY'
      : 'NEEDS_REVIEW',
  })
  const referenceOptions = {
    product: {
      value: 301,
      label: 'PROD-STYLE-L1 · 超长产品名称用于验证生产订单明细可读换行',
      selectable: true,
      product_value: 301,
      unit_value: 501,
    },
    product_sku: {
      value: 401,
      label: 'SKU-STYLE-L1-LONG · 深棕 / 35cm',
      selectable: true,
      product_value: 301,
      sku_value: 401,
      unit_value: 501,
    },
    unit: {
      value: 501,
      label: 'PCS · 只',
      selectable: true,
      unit_value: 501,
    },
    sales_order_item: {
      value: 601,
      label: 'SO-STYLE-L1 / 第 1 行 · PROD-STYLE-L1',
      selectable: true,
      product_value: 301,
      sku_value: 401,
      unit_value: 501,
    },
    active_bom: {
      value: 701,
      label: 'BOM-STYLE-L1-V20260713 · 当前生效',
      selectable: true,
      product_value: 301,
    },
  }
  const productionAllowedParams = {
    list_production_orders: new Set([
      'keyword',
      'status',
      'date_field',
      'date_from',
      'date_to',
      'sort_by',
      'sort_direction',
      'limit',
      'offset',
    ]),
    get_production_order: new Set(['production_order_id']),
    create_production_order: new Set([
      'order_no',
      'planned_start_at',
      'planned_end_at',
      'note',
      'items',
      'idempotency_key',
    ]),
    save_production_order: new Set([
      'production_order_id',
      'expected_version',
      'order_no',
      'planned_start_at',
      'planned_end_at',
      'note',
      'items',
      'idempotency_key',
    ]),
    release_production_order: new Set([
      'production_order_id',
      'expected_version',
      'idempotency_key',
    ]),
    close_production_order: new Set([
      'production_order_id',
      'expected_version',
      'reason',
      'idempotency_key',
    ]),
    cancel_production_order: new Set([
      'production_order_id',
      'expected_version',
      'reason',
      'idempotency_key',
    ]),
    list_production_order_reference_options: new Set([
      'reference_type',
      'keyword',
      'product_id',
      'product_sku_id',
      'unit_id',
      'selected_ids',
      'limit',
      'offset',
    ]),
  }
  const productionParamsValid = (method, params) => {
    const allowed = productionAllowedParams[method]
    if (!allowed || !Object.keys(params).every((key) => allowed.has(key))) {
      return false
    }
    const positive = (value) => Number.isSafeInteger(value) && value > 0
    const keyValid =
      typeof params.idempotency_key === 'string' &&
      params.idempotency_key === params.idempotency_key.trim() &&
      params.idempotency_key.length > 0 &&
      params.idempotency_key.length <= 128
    if (method === 'get_production_order') {
      return positive(params.production_order_id)
    }
    if (method === 'create_production_order') {
      return (
        keyValid &&
        typeof params.order_no === 'string' &&
        params.order_no.trim().length > 0 &&
        Array.isArray(params.items) &&
        params.items.length > 0
      )
    }
    if (method === 'save_production_order') {
      return (
        keyValid &&
        positive(params.production_order_id) &&
        positive(params.expected_version) &&
        typeof params.order_no === 'string' &&
        params.order_no.trim().length > 0 &&
        Array.isArray(params.items) &&
        params.items.length > 0
      )
    }
    if (
      [
        'release_production_order',
        'close_production_order',
        'cancel_production_order',
      ].includes(method)
    ) {
      if (
        !keyValid ||
        !positive(params.production_order_id) ||
        !positive(params.expected_version)
      ) {
        return false
      }
      return (
        method !== 'cancel_production_order' ||
        (typeof params.reason === 'string' && params.reason.trim().length > 0)
      )
    }
    if (method === 'list_production_order_reference_options') {
      return [
        'product',
        'product_sku',
        'unit',
        'sales_order_item',
        'active_bom',
      ].includes(params.reference_type)
    }
    return method === 'list_production_orders'
  }

  await page.route('**/rpc/production_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const paramsValid = productionParamsValid(method, params)
    let data
    if (!paramsValid) {
      data = unsupportedRpcMethod('production_order', method)
    } else if (method === 'list_production_orders') {
      data = {
        production_orders: [productionOrder],
        total: 1,
        limit: Number(params.limit || 20),
        offset: Number(params.offset || 0),
      }
    } else if (method === 'get_production_order') {
      data = {
        production_order: productionOrder,
        production_order_items: productionOrderItems,
        ...productionMaterialRequirementProjection(),
      }
    } else if (method === 'list_production_order_reference_options') {
      const option = referenceOptions[params.reference_type]
      data = {
        reference_type: params.reference_type,
        options: option ? [option] : [],
        total: option ? 1 : 0,
        limit: Number(params.limit || 20),
        offset: Number(params.offset || 0),
      }
    } else {
      const nextStatus = {
        release_production_order: 'RELEASED',
        close_production_order: 'CLOSED',
        cancel_production_order: 'CANCELLED',
      }[method]
      Object.assign(productionOrder, {
        order_no: params.order_no || productionOrder.order_no,
        planned_start_at:
          params.planned_start_at ?? productionOrder.planned_start_at,
        planned_end_at: params.planned_end_at ?? productionOrder.planned_end_at,
        note: params.note ?? productionOrder.note,
        status: nextStatus || productionOrder.status,
        version: productionOrder.version + 1,
        close_reason:
          method === 'close_production_order'
            ? params.reason || null
            : productionOrder.close_reason,
        cancel_reason:
          method === 'cancel_production_order'
            ? params.reason
            : productionOrder.cancel_reason,
        updated_at: nowUnix(),
      })
      if (method === 'release_production_order') {
        productionRequirementsFrozen = true
      }
      data = {
        production_order: productionOrder,
        production_order_items: productionOrderItems,
        ...productionMaterialRequirementProjection(),
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })

  const productionWipSteps = [
    {
      step_no: 10,
      operation_code: 'FABRIC_PROCESSING',
      process_name_snapshot: '布料加工',
      output_code: 'CUT_PIECE',
      inhouse_allowed: false,
      outsourcing_allowed: true,
      required_quality_gates: ['CUT_PIECE'],
      business_confirmation_code: null,
    },
    {
      step_no: 20,
      operation_code: 'SEWING',
      process_name_snapshot: '车缝',
      output_code: 'SHELL',
      inhouse_allowed: true,
      outsourcing_allowed: true,
      required_quality_gates: ['SHELL'],
      business_confirmation_code: null,
    },
    {
      step_no: 30,
      operation_code: 'HANDWORK',
      process_name_snapshot: '手工',
      output_code: 'FINISHED_GOODS',
      inhouse_allowed: true,
      outsourcing_allowed: true,
      required_quality_gates: ['FINISHED_GOODS', 'NEEDLE', 'SAMPLING'],
      business_confirmation_code: null,
    },
    {
      step_no: 40,
      operation_code: 'PACKAGING',
      process_name_snapshot: '包装',
      output_code: 'PACKED_GOODS',
      inhouse_allowed: true,
      outsourcing_allowed: false,
      required_quality_gates: [],
      business_confirmation_code: 'PACKAGING_MATERIAL',
    },
  ]
  const productionWipOperations = productionOrderItems.flatMap(
    (item, itemIndex) =>
      productionWipSteps.map((step, stepIndex) => ({
        id: 80_000 + itemIndex * 10 + stepIndex + 1,
        production_order_id: productionOrder.id,
        production_order_item_id: item.id,
        route_code: 'PLUSH_SEW_HAND_V1',
        route_version: 1,
        step_no: step.step_no,
        operation_code: step.operation_code,
        process_id: 900 + stepIndex + 1,
        process_code_snapshot: `STYLE-${step.operation_code}`,
        process_name_snapshot: step.process_name_snapshot,
        output_code: step.output_code,
        inhouse_allowed: step.inhouse_allowed,
        outsourcing_allowed: step.outsourcing_allowed,
        planned_quantity: item.planned_quantity,
        required_quality_gates: [...step.required_quality_gates],
        business_confirmation_code: step.business_confirmation_code,
        created_at: nowUnix(),
      }))
  )
  const operationFor = (itemIndex, stepIndex) =>
    productionWipOperations.find(
      (operation) =>
        operation.production_order_item_id ===
          productionOrderItems[itemIndex].id &&
        operation.step_no === productionWipSteps[stepIndex].step_no
    )
  const makeProductionWipBatch = ({
    id,
    itemIndex,
    stepIndex,
    sourceBatchID = null,
    executionMode,
    status,
    quantity,
  }) => ({
    id,
    production_order_id: productionOrder.id,
    production_order_item_id: productionOrderItems[itemIndex].id,
    production_order_operation_id: operationFor(itemIndex, stepIndex).id,
    source_batch_id: sourceBatchID,
    batch_no: `WIP-STYLE-${id}`,
    flow_type: 'NORMAL',
    execution_mode: executionMode,
    status,
    version: 1,
    quantity: quantity || productionOrderItems[itemIndex].planned_quantity,
    rework_reason: null,
    created_at: nowUnix(),
    updated_at: nowUnix(),
  })
  const productionWipBatches = [
    makeProductionWipBatch({
      id: 91_001,
      itemIndex: 0,
      stepIndex: 0,
      executionMode: 'OUTSOURCED',
      status: 'ACCEPTED',
    }),
    makeProductionWipBatch({
      id: 91_002,
      itemIndex: 0,
      stepIndex: 1,
      sourceBatchID: 91_001,
      executionMode: 'IN_HOUSE',
      status: 'ACCEPTED',
    }),
    makeProductionWipBatch({
      id: 91_003,
      itemIndex: 0,
      stepIndex: 2,
      sourceBatchID: 91_002,
      executionMode: 'IN_HOUSE',
      status: 'ACCEPTED',
    }),
    makeProductionWipBatch({
      id: 91_004,
      itemIndex: 0,
      stepIndex: 3,
      sourceBatchID: 91_003,
      executionMode: 'IN_HOUSE',
      status: 'ACCEPTED',
    }),
    makeProductionWipBatch({
      id: 91_011,
      itemIndex: 1,
      stepIndex: 0,
      executionMode: 'OUTSOURCED',
      status: 'ACCEPTED',
    }),
    makeProductionWipBatch({
      id: 91_021,
      itemIndex: 2,
      stepIndex: 0,
      executionMode: null,
      status: 'PLANNED',
    }),
    makeProductionWipBatch({
      id: 91_012,
      itemIndex: 1,
      stepIndex: 1,
      sourceBatchID: 91_011,
      executionMode: null,
      status: 'PLANNED',
    }),
  ]
  const productionWipQualityInspections = [
    [91_001, 'CUT_PIECE'],
    [91_002, 'SHELL'],
    [91_003, 'FINISHED_GOODS'],
    [91_003, 'NEEDLE'],
    [91_003, 'SAMPLING'],
    [91_011, 'CUT_PIECE'],
  ].map(([batchID, gateCode], index) => ({
    id: 92_000 + index,
    inspection_no: `QI-STYLE-${index + 1}`,
    production_wip_batch_id: batchID,
    gate_code: gateCode,
    status: 'PASSED',
    result: 'PASS',
  }))
  const productionPackagingConfirmations = productionOrderItems.map(
    (item, index) => ({
      id: 93_000 + index,
      production_order_id: productionOrder.id,
      production_order_item_id: item.id,
      status: index === 0 ? 'CONFIRMED' : 'PENDING',
      version: 1,
      packaging_version_snapshot: index === 0 ? '彩盒 V3' : null,
      confirmed_by: index === 0 ? 1 : null,
      confirmed_at: index === 0 ? nowUnix() : null,
      note: index === 0 ? '版面与装箱方式已核对' : null,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    })
  )
  const productionWipOutsourcingAllocations = [
    {
      id: 95_001,
      production_wip_batch_id: 91_001,
      outsourcing_order_item_id: 25,
      production_order_material_requirement_id: 7200,
      subject_type: 'MATERIAL',
      allocated_quantity: '10.2',
      unit_id: 1,
      created_by: 1,
      created_at: nowUnix(),
    },
    {
      id: 95_002,
      production_wip_batch_id: 91_011,
      outsourcing_order_item_id: 25,
      production_order_material_requirement_id: 7201,
      subject_type: 'MATERIAL',
      allocated_quantity: '10.2',
      unit_id: 1,
      created_by: 1,
      created_at: nowUnix(),
    },
  ]
  const productionWipAggregate = () => ({
    production_order: productionOrder,
    production_order_items: productionOrderItems,
    material_requirements: productionRequirementsFrozen
      ? productionMaterialRequirements
      : [],
    production_order_operations: productionWipOperations,
    production_wip_batches: productionWipBatches,
    outsourcing_allocations: productionWipOutsourcingAllocations,
    packaging_confirmations: productionPackagingConfirmations,
    quality_inspections: productionWipQualityInspections,
  })

  await page.route('**/rpc/production_wip', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    let data
    if (
      !Number.isSafeInteger(params.production_order_id) ||
      params.production_order_id !== productionOrder.id
    ) {
      data = unsupportedRpcMethod('production_wip', method)
    } else if (
      method === 'get_production_wip' ||
      method === 'initialize_production_wip'
    ) {
      data = productionWipAggregate()
    } else if (method === 'execute_production_wip_action') {
      const batch = productionWipBatches.find(
        (candidate) => candidate.id === params.production_wip_batch_id
      )
      const confirmation = productionPackagingConfirmations.find(
        (candidate) =>
          candidate.production_order_item_id === params.production_order_item_id
      )
      if (params.action === 'SPLIT_BATCH' && batch) {
        const splitQuantities = Array.isArray(params.splits)
          ? params.splits.map((split) => String(split?.quantity || ''))
          : []
        batch.status = 'SPLIT'
        batch.version += 1
        productionWipBatches.push(
          ...splitQuantities.map((quantity, index) =>
            makeProductionWipBatch({
              id: 94_000 + productionWipBatches.length * 2 + index,
              itemIndex: productionOrderItems.findIndex(
                (item) => item.id === batch.production_order_item_id
              ),
              stepIndex: productionWipSteps.findIndex(
                (step) =>
                  step.step_no ===
                  productionWipOperations.find(
                    (operation) =>
                      operation.id === batch.production_order_operation_id
                  )?.step_no
              ),
              sourceBatchID: batch.id,
              executionMode: null,
              status: 'PLANNED',
              quantity,
            })
          )
        )
      } else if (params.action === 'ASSIGN_EXECUTION' && batch) {
        batch.execution_mode = params.execution_mode
        for (
          let index = productionWipOutsourcingAllocations.length - 1;
          index >= 0;
          index -= 1
        ) {
          if (
            productionWipOutsourcingAllocations[index]
              .production_wip_batch_id === batch.id
          ) {
            productionWipOutsourcingAllocations.splice(index, 1)
          }
        }
        if (params.execution_mode === 'OUTSOURCED') {
          for (const allocation of params.outsourcing_allocations || []) {
            const requirement = productionMaterialRequirements.find(
              (item) =>
                item.id === allocation.production_order_material_requirement_id
            )
            productionWipOutsourcingAllocations.push({
              id: 96_000 + productionWipOutsourcingAllocations.length,
              production_wip_batch_id: batch.id,
              outsourcing_order_item_id: allocation.outsourcing_order_item_id,
              production_order_material_requirement_id:
                allocation.production_order_material_requirement_id || null,
              subject_type: requirement ? 'MATERIAL' : 'PRODUCT',
              allocated_quantity: requirement
                ? requirement.planned_quantity
                : batch.quantity,
              unit_id: requirement
                ? requirement.unit_id
                : productionOrderItems.find(
                    (item) => item.id === batch.production_order_item_id
                  )?.unit_id,
              created_by: 1,
              created_at: nowUnix(),
            })
          }
        }
        batch.version += 1
      } else if (params.action === 'START_OPERATION' && batch) {
        batch.status =
          batch.execution_mode === 'OUTSOURCED' ? 'OUTSOURCED' : 'IN_PROGRESS'
        batch.version += 1
      } else if (
        ['COMPLETE_OPERATION', 'RECEIVE_OUTSOURCING_RETURN'].includes(
          params.action
        ) &&
        batch
      ) {
        batch.status = 'WAITING_QUALITY'
        batch.version += 1
      } else if (
        params.action === 'CONFIRM_PACKAGING_MATERIAL' &&
        confirmation
      ) {
        confirmation.status = 'CONFIRMED'
        confirmation.packaging_version_snapshot =
          params.packaging_version_snapshot
        confirmation.confirmed_by = 1
        confirmation.confirmed_at = nowUnix()
        confirmation.note = params.note || null
        confirmation.version += 1
        confirmation.updated_at = nowUnix()
      } else if (
        ['TRANSFER_TO_NEXT_OPERATION', 'REWORK'].includes(params.action) &&
        batch
      ) {
        const target = productionWipOperations.find(
          (operation) => operation.id === params.target_operation_id
        )
        productionWipBatches.push({
          ...makeProductionWipBatch({
            id: 95_000 + productionWipBatches.length,
            itemIndex: productionOrderItems.findIndex(
              (item) => item.id === batch.production_order_item_id
            ),
            stepIndex: productionWipSteps.findIndex(
              (step) => step.step_no === target?.step_no
            ),
            sourceBatchID: batch.id,
            executionMode: null,
            status: 'PLANNED',
            quantity: params.quantity,
          }),
          flow_type: params.action === 'REWORK' ? 'REWORK' : 'NORMAL',
          rework_reason: params.action === 'REWORK' ? params.reason : null,
        })
      }
      data = productionWipAggregate()
    } else {
      data = unsupportedRpcMethod('production_wip', method)
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(data),
      }),
    })
  })
}
