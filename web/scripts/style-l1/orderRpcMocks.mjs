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
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const salesOrderItem = {
      id: 1,
      sales_order_id: 1,
      line_no: 1,
      product_id: 1,
      product_snapshot: { id: 1, code: 'PROD-STYLE-L1', name: '样式产品' },
      ordered_quantity: '10',
      unit_id: 1,
      unit_snapshot: { id: 1, code: 'PCS', name: '只' },
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
          limit: 100,
          offset: 0,
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
        data = {}
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
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
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const purchaseOrderItem = {
      id: 1,
      purchase_order_id: 1,
      line_no: 1,
      material_id: 1,
      material_code_snapshot: 'MAT-STYLE-L1',
      material_name_snapshot: '样式材料',
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
          limit: 100,
          offset: 0,
        }
        break
      case 'save_purchase_order_with_items':
        data = {
          purchase_order: { ...purchaseOrder, ...params },
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
        data = {}
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
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
      note: '样式加工合同',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const outsourcingOrderItem = {
      id: 1,
      outsourcing_order_id: 1,
      line_no: 1,
      product_id: 1,
      process_id: 1,
      unit_id: 1,
      product_no_snapshot: 'PROD-STYLE-L1',
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

    let data = {}
    switch (method) {
      case 'list_outsourcing_orders':
        data = {
          outsourcing_orders: [outsourcingOrder],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'list_outsourcing_order_items':
        data = {
          outsourcing_order_items: [outsourcingOrderItem],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'save_outsourcing_order_with_items':
        data = {
          outsourcing_order: { ...outsourcingOrder, ...params },
          outsourcing_order_items: [outsourcingOrderItem],
        }
        break
      case 'get_outsourcing_order':
        data = { outsourcing_order: { ...outsourcingOrder, ...params } }
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
        data = {}
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
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
      effective_from: nowUnix(),
      effective_to: null,
      note: '样式回归 BOM',
      created_at: nowUnix(),
      updated_at: nowUnix(),
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
        quantity: '0.8500',
        loss_rate: '0.0500',
        position: '填充',
        note: '辅料',
      },
      {
        ...bomItem,
        id: 3,
        material_id: 3,
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
      case 'create_bom_draft':
      case 'update_bom_draft':
      case 'copy_bom_version':
        data = {
          bom_version: { ...bomDraft, ...params, items: bomItems },
          bom_items: bomItems,
        }
        break
      case 'add_bom_item':
      case 'update_bom_item':
        data = { bom_item: { ...bomItem, ...params } }
        break
      case 'delete_bom_item':
        data = {}
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
        data = {}
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
      }),
    })
  })
}
