import { setTimeout as delay } from 'node:timers/promises'

export async function installFactRpcMocks(page, context) {
  const { nowUnix, resolveDelayFromReferer } = context

  await page.route('**/rpc/operational_fact', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const shipmentItem = {
      id: 1,
      shipment_id: 1,
      sales_order_item_id: 1,
      product_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '10',
      note: '样式出货明细',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const shipment = {
      id: 1,
      shipment_no: 'SHIP-STYLE-L1',
      status: 'DRAFT',
      sales_order_id: 1,
      customer_id: 1,
      customer_snapshot: '暗色客户',
      planned_ship_at: nowUnix() + 86_400,
      shipped_at: null,
      note: '样式回归出货单',
      items: [shipmentItem],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const productionFact = {
      id: 1,
      fact_no: 'PROD-FACT-L1',
      fact_type: 'FINISHED_GOODS_RECEIPT',
      status: 'DRAFT',
      subject_type: 'PRODUCT',
      subject_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '6',
      source_type: 'PRODUCTION_PROGRESS',
      source_id: 1,
      source_line_id: null,
      idempotency_key: 'PROD-FACT-L1',
      occurred_at: nowUnix(),
      note: '样式生产事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const outsourcingFact = {
      id: 1,
      fact_no: 'OUTSOURCE-FACT-L1',
      fact_type: 'RETURN_RECEIPT',
      status: 'DRAFT',
      subject_type: 'MATERIAL',
      subject_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '8',
      supplier_id: 1,
      supplier_name: '样式供应商',
      source_type: 'OUTSOURCING_ORDER',
      source_id: 1,
      source_line_id: null,
      idempotency_key: 'OUTSOURCE-FACT-L1',
      occurred_at: nowUnix(),
      note: '样式委外事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const stockReservation = {
      id: 1,
      reservation_no: 'RSV-STYLE-L1',
      status: 'ACTIVE',
      sales_order_id: 1,
      sales_order_item_id: 1,
      product_id: 1,
      warehouse_id: 1,
      unit_id: 1,
      lot_id: 1,
      quantity: '4',
      idempotency_key: 'RSV-STYLE-L1',
      reserved_at: nowUnix(),
      note: '样式库存预留',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const financeFactType = String(params.fact_type || 'RECEIVABLE')
      .trim()
      .toUpperCase()
    const financeFactNoByType = {
      RECEIVABLE: 'AR-STYLE-L1',
      PAYABLE: 'AP-STYLE-L1',
      INVOICE: 'INV-STYLE-L1',
      RECONCILIATION: 'REC-STYLE-L1',
      PAYMENT: 'PAY-STYLE-L1',
    }
    const financeFact = {
      id: 1,
      fact_no: financeFactNoByType[financeFactType] || 'FIN-STYLE-L1',
      fact_type: financeFactType,
      status: 'POSTED',
      counterparty_type:
        financeFactType === 'PAYABLE'
          ? 'SUPPLIER'
          : financeFactType === 'RECONCILIATION'
            ? 'OTHER'
            : 'CUSTOMER',
      counterparty_id: 1,
      amount: '1200',
      fee_amount: '0',
      currency: 'CNY',
      source_type: financeFactType === 'PAYABLE' ? 'PURCHASE' : 'SHIPMENT',
      source_id: 1,
      source_line_id: null,
      idempotency_key: financeFactNoByType[financeFactType] || 'FIN-STYLE-L1',
      occurred_at: nowUnix(),
      note: '样式财务事实',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_production_facts':
        data = {
          production_facts: [productionFact],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_production_fact':
        data = {
          production_fact: { ...productionFact, id: 2, ...params },
        }
        break
      case 'post_production_fact':
        data = {
          production_fact: { ...productionFact, status: 'POSTED' },
        }
        break
      case 'cancel_production_fact':
        data = {
          production_fact: { ...productionFact, status: 'CANCELLED' },
        }
        break
      case 'list_outsourcing_facts':
        data = {
          outsourcing_facts: [outsourcingFact],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_outsourcing_fact':
        data = {
          outsourcing_fact: { ...outsourcingFact, id: 2, ...params },
        }
        break
      case 'post_outsourcing_fact':
        data = {
          outsourcing_fact: { ...outsourcingFact, status: 'POSTED' },
        }
        break
      case 'cancel_outsourcing_fact':
        data = {
          outsourcing_fact: { ...outsourcingFact, status: 'CANCELLED' },
        }
        break
      case 'list_shipments':
        {
          const shipments =
            params.status && params.status !== shipment.status ? [] : [shipment]
          data = {
            shipments,
            total: shipments.length,
            limit: 100,
            offset: 0,
          }
        }
        break
      case 'create_shipment_with_items':
        data = {
          shipment: {
            ...shipment,
            id: 2,
            ...params,
            items: (params.items || []).map((item, index) => ({
              ...shipmentItem,
              ...item,
              id: index + 2,
              shipment_id: 2,
            })),
          },
        }
        break
      case 'ship_shipment':
        data = { shipment: { ...shipment, status: 'SHIPPED' } }
        break
      case 'cancel_shipment':
        data = { shipment: { ...shipment, status: 'CANCELLED' } }
        break
      case 'list_stock_reservations':
        data = {
          stock_reservations: [stockReservation],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_stock_reservation':
        data = {
          stock_reservation: { ...stockReservation, id: 2, ...params },
        }
        break
      case 'release_stock_reservation':
        data = {
          stock_reservation: { ...stockReservation, status: 'RELEASED' },
        }
        break
      case 'list_finance_facts':
        data = { finance_facts: [financeFact], total: 1, limit: 100, offset: 0 }
        break
      case 'create_finance_fact':
        data = { finance_fact: { ...financeFact, id: 2, ...params } }
        break
      case 'post_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'POSTED' } }
        break
      case 'settle_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'SETTLED' } }
        break
      case 'cancel_finance_fact':
        data = { finance_fact: { ...financeFact, status: 'CANCELLED' } }
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

  const purchaseReceiptItem = {
    id: 602,
    purchase_receipt_id: 601,
    source_line_no: '入库行 1',
    material_id: 1,
    material_name_snapshot: '样式材料',
    warehouse_id: 1,
    warehouse_name: '样式仓库',
    unit_id: 1,
    quantity: '20',
    lot_id: 401,
    lot_no: 'INV-LOT-001',
    unit_price: '3.50',
    amount: '70.00',
    note: '样式入库明细',
    created_at: nowUnix(),
    updated_at: nowUnix(),
  }
  let nextPurchaseReceiptId = 700
  let nextPurchaseReceiptItemId = 800
  const purchaseReceipts = [
    {
      id: 601,
      receipt_no: 'PR-STYLE-L1',
      supplier_name: '样式供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'POSTED',
      note: '样式采购入库',
      items: [purchaseReceiptItem],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 603,
      receipt_no: 'PR-STYLE-L1-DRAFT',
      supplier_name: '样式草稿供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'DRAFT',
      note: '样式草稿采购入库',
      items: [
        {
          ...purchaseReceiptItem,
          id: 604,
          purchase_receipt_id: 603,
          source_line_no: '草稿入库行 1',
          quantity: '12',
          amount: '42.00',
          note: '样式草稿入库明细',
        },
      ],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
    {
      id: 605,
      receipt_no: 'PR-STYLE-L1-CANCELLED',
      supplier_name: '样式取消供应商',
      warehouse_id: 1,
      received_at: nowUnix(),
      status: 'CANCELLED',
      note: '样式取消采购入库',
      items: [],
      created_at: nowUnix(),
      updated_at: nowUnix(),
    },
  ]

  await page.route('**/rpc/purchase', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    const filteredPurchaseReceipts = () => {
      const status = String(params.status || '').trim()
      const keyword = String(params.keyword || '')
        .trim()
        .toLowerCase()
      return purchaseReceipts.filter((receipt) => {
        if (status && receipt.status !== status) return false
        if (!keyword) return true
        return [receipt.receipt_no, receipt.supplier_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
    }

    let data = {}
    switch (method) {
      case 'list_purchase_receipts':
        {
          const rows = filteredPurchaseReceipts()
          const offset = Number(params.offset || 0)
          const limit = Number(params.limit || rows.length || 100)
          data = {
            purchase_receipts: rows.slice(offset, offset + limit),
            total: rows.length,
            limit,
            offset,
          }
        }
        break
      case 'create_purchase_receipt_with_items':
        {
          const receiptId = nextPurchaseReceiptId
          nextPurchaseReceiptId += 1
          const receipt = {
            ...purchaseReceipts[0],
            ...params,
            id: receiptId,
            status: 'DRAFT',
            items: Array.isArray(params.items)
              ? params.items.map((item) => {
                  const itemId = nextPurchaseReceiptItemId
                  nextPurchaseReceiptItemId += 1
                  return {
                    ...purchaseReceiptItem,
                    ...item,
                    id: itemId,
                    purchase_receipt_id: receiptId,
                  }
                })
              : [],
            created_at: nowUnix(),
            updated_at: nowUnix(),
          }
          purchaseReceipts.unshift(receipt)
          data = { purchase_receipt: receipt }
        }
        break
      case 'create_purchase_receipt_draft':
        data = {
          purchase_receipt: {
            ...purchaseReceipts[0],
            ...params,
            id: nextPurchaseReceiptId,
            status: 'DRAFT',
            items: [],
          },
        }
        nextPurchaseReceiptId += 1
        break
      case 'post_purchase_receipt':
        {
          const receipt = purchaseReceipts.find(
            (item) => Number(item.id) === Number(params.id)
          )
          if (receipt) receipt.status = 'POSTED'
          data = {
            purchase_receipt: receipt || { ...purchaseReceipts[0], ...params },
          }
        }
        break
      case 'cancel_purchase_receipt':
        {
          const receipt = purchaseReceipts.find(
            (item) => Number(item.id) === Number(params.id)
          )
          if (receipt) receipt.status = 'CANCELLED'
          data = {
            purchase_receipt: receipt || { ...purchaseReceipts[0], ...params },
          }
        }
        break
      case 'get_purchase_receipt':
        data = {
          purchase_receipt:
            purchaseReceipts.find(
              (item) => Number(item.id) === Number(params.id)
            ) || purchaseReceipts[0],
        }
        break
      case 'add_purchase_receipt_item':
        {
          const receipt = purchaseReceipts.find(
            (item) =>
              Number(item.id) ===
              Number(params.receipt_id || params.purchase_receipt_id)
          )
          const item = {
            ...purchaseReceiptItem,
            ...params,
            purchase_receipt_id: Number(
              params.receipt_id || params.purchase_receipt_id
            ),
            id: nextPurchaseReceiptItemId,
            created_at: nowUnix(),
            updated_at: nowUnix(),
          }
          nextPurchaseReceiptItemId += 1
          if (receipt) {
            receipt.items = [...(receipt.items || []), item]
            receipt.updated_at = nowUnix()
          }
          data = { purchase_receipt_item: item }
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

  await page.route('**/rpc/quality', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const qualityInspection = {
      id: 701,
      inspection_no: 'QI-STYLE-L1',
      purchase_receipt_id: 601,
      purchase_receipt_item_id: 602,
      inventory_lot_id: 401,
      material_id: 1,
      warehouse_id: 1,
      status: 'SUBMITTED',
      result: '',
      original_lot_status: 'HOLD',
      inspected_at: 0,
      inspector_id: null,
      decision_note: '等待品质判定',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_quality_inspections':
        {
          const keyword = String(params.keyword || '')
            .trim()
            .toLowerCase()
          const haystack = [
            qualityInspection.inspection_no,
            'PR-STYLE-L1',
            'INV-LOT-001',
          ]
            .join(' ')
            .toLowerCase()
          const qualityInspections =
            keyword && !haystack.includes(keyword) ? [] : [qualityInspection]
          data = {
            quality_inspections: qualityInspections,
            total: qualityInspections.length,
            limit: 100,
            offset: 0,
          }
        }
        break
      case 'create_quality_inspection_draft':
        data = {
          quality_inspection: {
            ...qualityInspection,
            ...params,
            id: 702,
            status: 'DRAFT',
            result: '',
          },
        }
        break
      case 'submit_quality_inspection':
      case 'pass_quality_inspection':
      case 'reject_quality_inspection':
      case 'cancel_quality_inspection':
      case 'get_quality_inspection':
        data = { quality_inspection: { ...qualityInspection, ...params } }
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

  await page.route('**/rpc/inventory', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const inventoryBalance = {
      id: 301,
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 1,
      warehouse_id: 1,
      lot_id: 402,
      unit_id: 1,
      quantity: '12.5',
      active_reserved_quantity: '4',
      available_quantity: '8.5',
      updated_at: nowUnix(),
    }
    const inventoryLot = {
      id: 401,
      subject_type: 'MATERIAL',
      subject_id: 1,
      lot_no: 'INV-LOT-001',
      supplier_lot_no: 'SUP-LOT-001',
      color_no: 'C01',
      dye_lot_no: 'DYE-01',
      production_lot_no: '',
      status: 'HOLD',
      received_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const skuInventoryLot = {
      id: 402,
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 1,
      lot_no: 'SKU-LOT-STYLE-L1',
      supplier_lot_no: '',
      color_no: 'C01',
      dye_lot_no: '',
      production_lot_no: 'PROD-LOT-STYLE-L1',
      status: 'ACTIVE',
      received_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const inventoryTxn = {
      id: 501,
      txn_type: 'REVERSAL',
      direction: -1,
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 1,
      warehouse_id: 1,
      lot_id: 402,
      quantity: '1.5',
      unit_id: 1,
      source_type: 'MANUAL_SEED',
      source_id: 9001,
      source_line_id: 9002,
      reversal_of_txn_id: 888500999,
      idempotency_key: 'INV-TXN-001',
      note: 'ledger seed',
      occurred_at: nowUnix(),
      created_at: nowUnix(),
    }

    let data = {}
    const keyword = String(params.keyword || '')
      .trim()
      .toLowerCase()
    const matchesKeyword = (...values) => {
      if (!keyword) return true
      return values
        .map((value) => String(value || '').toLowerCase())
        .some((value) => value.includes(keyword))
    }
    switch (method) {
      case 'list_inventory_balances':
      case 'listInventoryBalances':
        {
          const inventoryBalances =
            (!params.subject_type ||
              inventoryBalance.subject_type === params.subject_type) &&
            (!params.subject_id ||
              inventoryBalance.subject_id === Number(params.subject_id)) &&
            (!params.product_sku_id ||
              inventoryBalance.product_sku_id ===
                Number(params.product_sku_id)) &&
            matchesKeyword(
              inventoryBalance.id,
              inventoryBalance.subject_type,
              inventoryBalance.subject_id,
              inventoryBalance.warehouse_id,
              inventoryBalance.lot_id,
              inventoryBalance.quantity,
              inventoryBalance.available_quantity
            )
              ? [inventoryBalance]
              : []
          data = {
            inventory_balances: inventoryBalances,
            total: inventoryBalances.length,
            limit: 100,
            offset: 0,
          }
        }
        break
      case 'list_inventory_lots':
      case 'listInventoryLots':
        {
          const inventoryLots = [inventoryLot, skuInventoryLot].filter(
            (item) =>
              (!params.subject_type ||
                item.subject_type === params.subject_type) &&
              (!params.subject_id ||
                item.subject_id === Number(params.subject_id)) &&
              (!params.product_sku_id ||
                item.product_sku_id === Number(params.product_sku_id)) &&
              matchesKeyword(
                item.id,
                item.lot_no,
                item.supplier_lot_no,
                item.color_no,
                item.dye_lot_no,
                item.status
              )
          )
          data = {
            inventory_lots: inventoryLots,
            total: inventoryLots.length,
            limit: 100,
            offset: 0,
          }
        }
        break
      case 'list_inventory_txns':
      case 'listInventoryTxns':
        {
          const inventoryTxns =
            (!params.subject_type ||
              inventoryTxn.subject_type === params.subject_type) &&
            (!params.subject_id ||
              inventoryTxn.subject_id === Number(params.subject_id)) &&
            (!params.product_sku_id ||
              inventoryTxn.product_sku_id === Number(params.product_sku_id)) &&
            matchesKeyword(
              inventoryTxn.id,
              inventoryTxn.txn_type,
              inventoryTxn.source_type,
              inventoryTxn.idempotency_key,
              inventoryTxn.note
            )
              ? [inventoryTxn]
              : []
          data = {
            inventory_txns: inventoryTxns,
            total: inventoryTxns.length,
            limit: 100,
            offset: 0,
          }
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

  const workflowTasks = []
  const workflowBusinessStates = []
  let workflowTaskID = 1
  await page.route('**/rpc/business', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    let data = {}
    switch (method) {
      case 'dashboard_stats':
        data = { modules: [] }
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

  await page.route('**/rpc/workflow', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    let data = {}
    switch (method) {
      case 'list_business_states':
        data = {
          business_states: workflowBusinessStates.filter(
            (item) =>
              !params.source_type || item.source_type === params.source_type
          ),
          total: workflowBusinessStates.length,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'list_tasks': {
        const listDelayMs = resolveDelayFromReferer(
          route.request(),
          '__style_l1_workflow_list_delay'
        )
        if (listDelayMs > 0) {
          await delay(listDelayMs)
        }
        const tasks = workflowTasks.filter(
          (item) =>
            (!params.source_type || item.source_type === params.source_type) &&
            (!params.task_group || item.task_group === params.task_group) &&
            (!params.source_id ||
              Number(item.source_id) === Number(params.source_id))
        )
        data = {
          tasks,
          total: tasks.length,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      }
      case 'create_task': {
        const task = {
          id: workflowTaskID++,
          task_code: params.task_code || `style-l1-task-${Date.now()}`,
          task_group: params.task_group || 'project-orders',
          task_name: params.task_name || '订单/款式立项 跟进',
          source_type: params.source_type || 'project-orders',
          source_id: Number(params.source_id || Date.now()),
          source_no: params.source_no || '',
          business_status_key: params.business_status_key || 'project_pending',
          task_status_key: params.task_status_key || 'ready',
          owner_role_key: params.owner_role_key || 'business',
          assignee_id: params.assignee_id || '',
          priority: Number(params.priority || 0),
          due_at: params.due_at || null,
          blocked_reason: params.blocked_reason || '',
          payload: params.payload || {},
          created_at: nowUnix(),
          updated_at: nowUnix(),
        }
        workflowTasks.unshift(task)
        data = { task }
        break
      }
      case 'explain_action_access': {
        const taskID = Number(params.task_id || 0)
        const task = workflowTasks.find((item) => Number(item.id) === taskID)
        const ownerRoleKey = task?.owner_role_key || ''
        const statusKey = task?.task_status_key || ''
        const actions = ['complete', 'block', 'reject', 'urge'].map(
          (actionKey) => {
            const requiredPermission =
              actionKey === 'complete'
                ? 'workflow.task.complete'
                : 'workflow.task.update'
            return {
              action_key: actionKey,
              allowed: Boolean(task),
              reason: task ? 'style-l1 后端投影允许执行' : '任务不存在',
              reason_code: task ? '' : 'task_not_found',
              required_permission: requiredPermission,
              owner_role_key: ownerRoleKey,
              visible_owner_role_keys: ownerRoleKey ? [ownerRoleKey] : [],
              candidate_owner_role_keys: ownerRoleKey ? [ownerRoleKey] : [],
              owner_role_matched: Boolean(task),
              work_pool_role_matched: Boolean(task),
              work_pool_entitlement_matched: Boolean(task),
              work_pool_entitlement_scope_matched: Boolean(task),
              domain_command_entry: {
                enabled: false,
                will_write_fact: false,
                source: 'style_l1_no_domain_command_contract',
                command_key: '',
                blocked_reasons: ['domain_command_contract_not_configured'],
                required_contract: [],
              },
              actor_role_key: ownerRoleKey,
              status_key: statusKey,
            }
          }
        )
        data = { actions }
        break
      }
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
