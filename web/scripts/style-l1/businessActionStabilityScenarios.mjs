import { yoyoosunRoleFlowMatrix } from '../../../config/customers/yoyoosun/roleFlowMatrix.mjs'

const SALES_ORDER_PATH = '/erp/sales/project-orders/sales-orders'
const PURCHASE_ORDER_PATH = '/erp/purchase/accessories'
const PURCHASE_RECEIPT_PATH = '/erp/warehouse/inbound'
const QUALITY_INSPECTION_PATH = '/erp/production/quality-inspections'
const SHIPMENT_PATH = '/erp/warehouse/shipments'
const FINANCE_PAYMENT_PATH = '/erp/finance/payments'
const SALES_RETURN_PATH = '/erp/sales/customer-returns'
const PRODUCTION_EXCEPTION_PATH = '/erp/production/exceptions'

const SALES_ORDER_STATUSES = [
  ['draft', '草稿'],
  ['submitted', '已提交'],
  ['active', '已生效'],
  ['closed', '已关闭'],
  ['canceled', '已取消'],
]

function rpcPage(rows, key, params = {}) {
  const status = String(params.lifecycle_status || params.status || '').trim()
  const keyword = String(params.keyword || '')
    .trim()
    .toLowerCase()
  const filtered = rows.filter((row) => {
    const rowStatus = String(row.lifecycle_status || row.status || '')
    if (status && rowStatus !== status) return false
    if (!keyword) return true
    return Object.values(row)
      .filter((value) => ['string', 'number'].includes(typeof value))
      .some((value) => String(value).toLowerCase().includes(keyword))
  })
  const offset = Math.max(0, Number(params.offset || 0))
  const limit = Math.max(1, Number(params.limit || filtered.length || 100))
  return {
    [key]: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  }
}

async function fulfillRpc(route, id, data) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: { code: 0, message: 'OK', data },
    }),
  })
}

function createSalesOrderRows() {
  return SALES_ORDER_STATUSES.map(([status, label], index) => ({
    id: 1_101 + index,
    order_no: `SO-ACTION-${status.toUpperCase()}`,
    customer_id: 1,
    customer_snapshot: {
      id: 1,
      code: 'CUS-ACTION-L1',
      name: '稳定动作客户',
    },
    customer_order_no: `PO-ACTION-${index + 1}`,
    title: `动作稳定性 ${label}`,
    order_date: 1_784_000_000 + index,
    planned_delivery_date: 1_784_086_400 + index,
    lifecycle_status: status,
    version: index + 1,
    item_count: 0,
    note: '',
    created_at: 1_784_000_000,
    updated_at: 1_784_000_000 + index,
  }))
}

function createPurchaseOrderRows() {
  return [
    ['draft', 'DRAFT'],
    ['approved', 'APPROVED'],
    ['closed', 'CLOSED'],
  ].map(([status, suffix], index) => ({
    id: 1_201 + index,
    purchase_order_no: `PO-ACTION-${suffix}`,
    supplier_id: 1,
    supplier_snapshot: {
      id: 1,
      code: 'SUP-ACTION-L1',
      name: '稳定动作供应商',
    },
    supplier_purchase_order_no: `SUP-ACTION-${index + 1}`,
    purchase_date: 1_784_000_000 + index,
    expected_arrival_date: 1_784_604_800 + index,
    lifecycle_status: status,
    version: index + 1,
    item_count: 0,
    note: '',
    created_at: 1_784_000_000,
    updated_at: 1_784_000_000 + index,
  }))
}

function createQualityInspectionRows() {
  const incomingRows = [
    ['DRAFT', 'DRAFT', ''],
    ['SUBMITTED', 'SUBMITTED', ''],
    ['PASSED', 'PASSED', 'PASS'],
    ['CANCELLED', 'CANCELLED', ''],
  ].map(([status, suffix, result], index) => ({
    id: 1_301 + index,
    inspection_no: `QI-ACTION-${suffix}`,
    purchase_receipt_id: 601,
    purchase_receipt_item_id: 602,
    inventory_lot_id: 401,
    material_id: 1,
    warehouse_id: 1,
    source_type: 'PURCHASE_RECEIPT',
    source_id: 601,
    inspection_type: 'INCOMING',
    subject_type: 'MATERIAL',
    subject_id: 1,
    status,
    result,
    original_lot_status: 'HOLD',
    inspected_at: status === 'PASSED' ? 1_784_000_000 : 0,
    inspector_id: status === 'PASSED' ? 1 : null,
    decision_note: `动作稳定性 ${suffix}`,
    created_at: 1_784_000_000,
    updated_at: 1_784_000_000 + index,
  }))
  return [
    ...incomingRows,
    {
      id: 1_305,
      inspection_no: 'QI-ACTION-OUTSOURCING-REJECTED',
      source_type: 'OUTSOURCING_FACT',
      source_id: 701,
      inspection_type: 'OUTSOURCING_RETURN',
      subject_type: 'PRODUCT',
      subject_id: 1,
      status: 'REJECTED',
      result: 'REJECT',
      original_lot_status: 'HOLD',
      inspected_at: 1_784_000_000,
      inspector_id: 1,
      decision_note: '委外回货不合格',
      created_at: 1_784_000_000,
      updated_at: 1_784_000_004,
    },
    {
      id: 1_306,
      inspection_no: 'QI-ACTION-PRODUCTION-WIP',
      source_type: 'PRODUCTION_WIP',
      source_id: 801,
      inspection_type: 'PRODUCTION_STAGE',
      subject_type: 'PRODUCT',
      subject_id: 1,
      status: 'SUBMITTED',
      result: '',
      original_lot_status: 'HOLD',
      inspected_at: 0,
      inspector_id: null,
      decision_note: '在制品质检无独立关联单据入口',
      created_at: 1_784_000_000,
      updated_at: 1_784_000_005,
    },
  ]
}

function createShipmentRows() {
  return [
    ['DRAFT', 'PENDING', 'DRAFT'],
    ['DRAFT', 'APPROVED', 'DRAFT-APPROVED'],
    ['DRAFT', 'REJECTED', 'DRAFT-REJECTED'],
    ['SHIPPED', 'APPROVED', 'SHIPPED'],
    ['CANCELLED', 'PENDING', 'CANCELLED'],
  ].map(([status, financeReleaseStatus, suffix], index) => ({
    id: 1_401 + index,
    shipment_no: `SHIP-ACTION-${suffix}`,
    status,
    finance_release_status: financeReleaseStatus,
    sales_order_id: 1,
    customer_id: 1,
    customer_snapshot: '稳定动作客户',
    planned_ship_at: 1_784_086_400 + index,
    shipped_at: status === 'SHIPPED' ? 1_784_000_000 : null,
    total_net_weight_g: null,
    note: `动作稳定性 ${status}`,
    items: [],
    created_at: 1_784_000_000,
    updated_at: 1_784_000_000 + index,
  }))
}

function createFinancePaymentRows() {
  return ['DRAFT', 'APPROVED', 'POSTED', 'REVERSED', 'CANCELLED'].map(
    (status, index) => ({
      id: 1_501 + index,
      payment_no: `PAY-ACTION-${status}`,
      direction: 'RECEIPT',
      status,
      counterparty_type: 'CUSTOMER',
      counterparty_id: 1,
      amount: '1200.00',
      currency: 'CNY',
      account_ref: '银行账户尾号 6688',
      evidence_ref: `回单 ACTION-${status}`,
      version: index + 1,
      occurred_at: 1_784_000_000 + index,
      allocations:
        status === 'POSTED' || status === 'REVERSED'
          ? [
              {
                id: 1_551 + index,
                finance_fact_no: 'AR-ACTION-001',
                finance_fact_type: 'RECEIVABLE',
                amount: '1200.00',
                currency: 'CNY',
                status: status === 'REVERSED' ? 'REVERSED' : 'POSTED',
              },
            ]
          : [],
    })
  )
}

function createSalesReturnRows() {
  return ['DRAFT', 'APPROVED', 'RECEIVED', 'REVERSED', 'CANCELLED'].map(
    (status, index) => ({
      id: 1_601 + index,
      return_no: `RMA-ACTION-${status}`,
      shipment_id: 1,
      shipment_no: 'SHIP-STYLE-L1',
      customer_name: '稳定动作客户',
      status,
      reason: `动作稳定性 ${status}`,
      version: index + 1,
      items: [],
      approved_at: ['APPROVED', 'RECEIVED', 'REVERSED'].includes(status)
        ? 1_784_000_000
        : null,
      received_at: ['RECEIVED', 'REVERSED'].includes(status)
        ? 1_784_000_100
        : null,
    })
  )
}

function createProductionExceptionRows() {
  return [
    ['SUBMITTED-SCRAP', 'SCRAP', 'SUBMITTED', 'PENDING'],
    ['APPROVED-SCRAP', 'SCRAP', 'APPROVED', 'PENDING'],
    ['APPLIED-SCRAP', 'SCRAP', 'APPROVED', 'APPLIED'],
    ['APPROVED-OVER-ISSUE', 'OVER_ISSUE', 'APPROVED', 'PENDING'],
    ['CANCELLED-SCRAP', 'SCRAP', 'CANCELLED', 'PENDING'],
  ].map(([suffix, decisionType, status, executionStatus], index) => ({
    id: 1_701 + index,
    decision_no: `PEX-ACTION-${suffix}`,
    decision_type: decisionType,
    requested_quantity: '2',
    status,
    execution_status: executionStatus,
    requested_by: 1,
    reason: `动作稳定性 ${suffix}`,
    version: index + 1,
  }))
}

async function installActionStabilityRpcRows(
  page,
  {
    includeSales = true,
    includePurchase = false,
    includeQuality = false,
    includeShipments = false,
    includeFinance = false,
    includeSalesReturns = false,
    includeProductionExceptions = false,
    delaySalesSubmit = false,
  } = {}
) {
  const salesOrders = createSalesOrderRows()
  const purchaseOrders = createPurchaseOrderRows()
  const qualityInspections = createQualityInspectionRows()
  const shipments = createShipmentRows()
  const financePayments = createFinancePaymentRows()
  const salesReturns = createSalesReturnRows()
  const productionExceptions = createProductionExceptionRows()

  if (includeSales) {
    await page.route('**/rpc/sales_order', async (route) => {
      const body = route.request().postDataJSON() || {}
      const { id = 'action-stability-sales', method, params = {} } = body
      if (method === 'list_sales_orders') {
        await fulfillRpc(
          route,
          id,
          rpcPage(salesOrders, 'sales_orders', params)
        )
        return
      }
      if (method === 'list_sales_order_items') {
        await fulfillRpc(route, id, {
          sales_order_items: [],
          total: 0,
          limit: Number(params.limit || 100),
          offset: Number(params.offset || 0),
        })
        return
      }
      if (method === 'get_sales_order') {
        await fulfillRpc(route, id, {
          sales_order:
            salesOrders.find(
              (order) => Number(order.id) === Number(params.id)
            ) || salesOrders[0],
        })
        return
      }
      await route.fallback()
    })
  }

  if (delaySalesSubmit) {
    await page.route('**/rpc/customer_config', async (route) => {
      const body = route.request().postDataJSON() || {}
      if (body.method === 'start_sales_order_acceptance_process') {
        await new Promise((resolve) => {
          setTimeout(resolve, 1_200)
        })
        await fulfillRpc(route, body.id || 'action-stability-sales-start', {
          process_instance: {
            id: 91_001,
            process_key: 'sales_order_acceptance',
            business_ref_type: 'sales_order',
            business_ref_id: Number(body.params?.sales_order_id),
            business_ref_no: body.params?.business_ref_no,
            status: 'active',
          },
          started_node: {
            id: 91_101,
            process_instance_id: 91_001,
            node_key: 'submit_sales_order',
            node_type: 'domain_command',
            version: 1,
            status: 'active',
          },
          nodes: [
            {
              id: 91_101,
              process_instance_id: 91_001,
              node_key: 'submit_sales_order',
              node_type: 'domain_command',
              version: 1,
              status: 'active',
            },
          ],
          runtime_boundary: { fact_boundary: 'no_fact_posting' },
        })
        return
      }
      if (body.method === 'execute_sales_order_acceptance_submit') {
        await fulfillRpc(route, body.id || 'action-stability-sales-execute', {
          completed_node: {
            id: 91_101,
            process_instance_id: 91_001,
            node_key: 'submit_sales_order',
            node_type: 'domain_command',
            status: 'completed',
            outcome: 'sales_order.submitted',
            version: 2,
          },
          next_node: {
            id: 91_102,
            process_instance_id: 91_001,
            node_key: 'order_approval',
            node_type: 'approval',
            status: 'active',
            version: 1,
          },
          linked_task: {
            id: 91_201,
            task_code: 'order_approval',
            owner_role_key: 'boss',
          },
          nodes: [
            {
              id: 91_101,
              process_instance_id: 91_001,
              node_key: 'submit_sales_order',
              node_type: 'domain_command',
              status: 'completed',
              outcome: 'sales_order.submitted',
              version: 2,
            },
            {
              id: 91_102,
              process_instance_id: 91_001,
              node_key: 'order_approval',
              node_type: 'approval',
              status: 'active',
              version: 1,
            },
          ],
        })
        return
      }
      await route.fallback()
    })
  }

  if (includePurchase) {
    await page.route('**/rpc/purchase_order', async (route) => {
      const body = route.request().postDataJSON() || {}
      const { id = 'action-stability-purchase', method, params = {} } = body
      if (method === 'list_purchase_orders') {
        await fulfillRpc(
          route,
          id,
          rpcPage(purchaseOrders, 'purchase_orders', params)
        )
        return
      }
      if (method === 'list_purchase_order_items') {
        await fulfillRpc(route, id, {
          purchase_order_items: [],
          total: 0,
          limit: Number(params.limit || 100),
          offset: Number(params.offset || 0),
        })
        return
      }
      if (method === 'get_purchase_order') {
        await fulfillRpc(route, id, {
          purchase_order:
            purchaseOrders.find(
              (order) => Number(order.id) === Number(params.id)
            ) || purchaseOrders[0],
        })
        return
      }
      await route.fallback()
    })
  }

  if (includeQuality) {
    await page.route('**/rpc/quality', async (route) => {
      const body = route.request().postDataJSON() || {}
      const { id = 'action-stability-quality', method, params = {} } = body
      if (method === 'list_quality_inspections') {
        await fulfillRpc(
          route,
          id,
          rpcPage(qualityInspections, 'quality_inspections', params)
        )
        return
      }
      await route.fallback()
    })
  }

  if (
    includeShipments ||
    includeFinance ||
    includeSalesReturns ||
    includeProductionExceptions
  ) {
    await page.route('**/rpc/operational_fact', async (route) => {
      const body = route.request().postDataJSON() || {}
      const { id = 'action-stability-shipment', method, params = {} } = body
      if (includeShipments && method === 'list_shipments') {
        await fulfillRpc(route, id, rpcPage(shipments, 'shipments', params))
        return
      }
      if (includeFinance && method === 'list_finance_payments') {
        await fulfillRpc(
          route,
          id,
          rpcPage(financePayments, 'payments', params)
        )
        return
      }
      if (includeFinance && method === 'list_finance_credit_notes') {
        await fulfillRpc(route, id, rpcPage([], 'credit_notes', params))
        return
      }
      if (includeSalesReturns && method === 'list_sales_returns') {
        await fulfillRpc(
          route,
          id,
          rpcPage(salesReturns, 'sales_returns', params)
        )
        return
      }
      if (
        includeProductionExceptions &&
        method === 'list_production_exceptions'
      ) {
        await fulfillRpc(
          route,
          id,
          rpcPage(
            productionExceptions,
            'production_exceptions',
            params
          )
        )
        return
      }
      await route.fallback()
    })
  }
}

async function waitForBusinessPage(page, heading) {
  await page.getByRole('heading', { name: heading }).waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await page
    .locator('.erp-business-module-current-action')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 })
}

async function selectBusinessRow(page, recordNo) {
  const row = page
    .locator('.ant-table-tbody .ant-table-row')
    .filter({ hasText: recordNo })
    .first()
  await row.waitFor({ state: 'visible', timeout: 10_000 })
  await row.click()
  await page.waitForFunction(
    (recordLabel) =>
      Array.from(
        document.querySelectorAll(
          '.ant-table-tbody .ant-table-row.ant-table-row-selected'
        )
      ).some((node) => node.textContent?.includes(recordLabel)),
    recordNo
  )
  await page.waitForTimeout(180)
}

async function captureDesktopActionLayout(page) {
  const actionBar = page.locator('.erp-business-module-current-action').first()
  return actionBar.evaluate((bar) => {
    const actions = bar.querySelector(
      '.erp-business-selection-action-bar__actions'
    )
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }
    const actionsRect = actions?.getBoundingClientRect()
    let statusIndex = 0
    const buttons = Array.from(actions?.querySelectorAll('button') || [])
      .filter(isVisible)
      .map((button) => {
        const rect = button.getBoundingClientRect()
        const text = String(button.textContent || '')
          .replace(/\s+/gu, '')
          .trim()
        const explicitKey = button.getAttribute('data-business-action-key')
        const key =
          explicitKey ||
          (button.classList.contains('erp-business-module-status-action')
            ? `status-${statusIndex++}`
            : text)
        return {
          key,
          disabled: button.disabled,
          left: rect.left - (actionsRect?.left || 0),
          top: rect.top - (actionsRect?.top || 0),
          width: rect.width,
          height: rect.height,
        }
      })
    return {
      buttons,
      keys: buttons.map((button) => button.key),
      actionLeft: actionsRect?.left || 0,
      actionTop: actionsRect ? actionsRect.top + window.scrollY : 0,
      actionWidth: actionsRect?.width || 0,
      actionHeight: actionsRect?.height || 0,
      actionOverflow: actions
        ? Math.max(0, actions.scrollWidth - actions.clientWidth)
        : 0,
      pageOverflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      ),
    }
  })
}

async function assertDesktopActionState(
  page,
  assert,
  key,
  { visible, disabled }
) {
  const action = page
    .locator('.erp-business-module-current-action')
    .first()
    .locator(`[data-business-action-key="${key}"]`)
  const count = await action.count()
  assert.equal(
    count > 0,
    visible,
    `${key} 可见性应为 ${visible ? '显示' : '隐藏'}`
  )
  if (visible && typeof disabled === 'boolean') {
    assert.equal(
      await action.isDisabled(),
      disabled,
      `${key} 禁用态应为 ${disabled}`
    )
  }
}

function assertStableDesktopLayout(assert, baseline, current, scenarioName) {
  assert.deepEqual(
    current.keys,
    baseline.keys,
    `${scenarioName} 状态切换不得改变动作槽顺序`
  )
  assert.equal(
    current.actionOverflow,
    0,
    `${scenarioName} 动作区不应横向溢出: ${JSON.stringify(current)}`
  )
  assert.equal(
    current.pageOverflow,
    0,
    `${scenarioName} 页面不应横向溢出: ${JSON.stringify(current)}`
  )
  for (let index = 0; index < baseline.buttons.length; index += 1) {
    const before = baseline.buttons[index]
    const after = current.buttons[index]
    assert(
      Math.abs(before.left - after.left) <= 2 &&
        Math.abs(before.top - after.top) <= 2 &&
        Math.abs(before.width - after.width) <= 2 &&
        Math.abs(before.height - after.height) <= 2,
      `${scenarioName} 动作 ${before.key} 不应因状态改变位置或尺寸: ${JSON.stringify(
        { before, after, baseline, current }
      )}`
    )
  }
}

async function captureMobileActionLayout(page) {
  const actionBar = page.locator('.erp-business-module-current-action').first()
  return actionBar.evaluate((bar) => {
    const visible = Array.from(
      bar.querySelectorAll(
        '.erp-business-selection-action-bar__compact-visible button'
      )
    ).map(
      (button) =>
        button.getAttribute('data-business-action-key') ||
        String(button.textContent || '')
          .replace(/\s+/gu, '')
          .trim()
    )
    const more = bar.querySelector(
      '.erp-business-selection-action-bar__compact-more'
    )
    const rect = bar.getBoundingClientRect()
    const visibleButton = bar.querySelector(
      '.erp-business-selection-action-bar__compact-visible button'
    )
    const visibleRect = visibleButton?.getBoundingClientRect()
    const moreRect = more?.getBoundingClientRect()
    return {
      visible,
      moreDisabled: more?.disabled === true,
      barWidth: rect.width,
      visibleLeft: visibleRect ? visibleRect.left - rect.left : 0,
      visibleTop: visibleRect ? visibleRect.top - rect.top : 0,
      moreLeft: moreRect ? moreRect.left - rect.left : 0,
      moreTop: moreRect ? moreRect.top - rect.top : 0,
      pageOverflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      ),
    }
  })
}

async function captureMobileDrawerKeys(page) {
  return page
    .locator('.erp-business-selection-action-drawer__list')
    .evaluate((list) => {
      let statusIndex = 0
      return Array.from(
        list.querySelectorAll('.erp-business-selection-action-drawer__item')
      ).map((item) => {
        const button = item.querySelector('button')
        const explicitKey = button?.getAttribute('data-business-action-key')
        const text = String(button?.textContent || '')
          .replace(/\s+/gu, '')
          .trim()
        return (
          explicitKey ||
          (button?.classList.contains('erp-business-module-status-action')
            ? `status-${statusIndex++}`
            : text)
        )
      })
    })
}

async function openMobileActionDrawer(page) {
  const button = page
    .locator('.erp-business-module-current-action')
    .first()
    .locator('.erp-business-selection-action-bar__compact-more')
  await button.click()
  await page
    .locator('.erp-business-selection-action-drawer')
    .waitFor({ state: 'visible', timeout: 10_000 })
}

async function closeMobileActionDrawer(page) {
  await page.keyboard.press('Escape')
  await page.waitForFunction(
    () =>
      !document
        .querySelector('.erp-business-selection-action-drawer')
        ?.classList.contains('ant-drawer-open'),
    undefined,
    { timeout: 10_000 }
  )
}

async function screenshot(page, path, outputDir, fileName) {
  await page.screenshot({
    path: path.join(outputDir, fileName),
    fullPage: true,
  })
}

export function createBusinessActionStabilityScenarios(deps) {
  const {
    assert,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    gotoScenarioPath,
    outputDir,
    path,
  } = deps
  const roleIdentity = (roleKey) => {
    const role = yoyoosunRoleFlowMatrix.roles.find(
      (item) => item.roleKey === roleKey
    )
    if (!role) {
      throw new Error(`未找到永绅角色：${roleKey}`)
    }
    return {
      adminProfile: {
        id: 1,
        username: `style-l1-${roleKey}`,
        is_super_admin: false,
        roles: [{ role_key: role.roleKey, name: role.displayName }],
        permissions: [...role.capabilityKeys],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [...role.capabilityKeys],
      },
    }
  }
  const financeIdentity = roleIdentity('finance')
  const warehouseIdentity = roleIdentity('warehouse')
  const productionIdentity = roleIdentity('production')

  return [
    {
      name: 'business-action-stability-sales-five-states-desktop',
      path: SALES_ORDER_PATH,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: true,
          delaySalesSubmit: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '销售订单')
        const emptyLayout = await captureDesktopActionLayout(page)
        assert.deepEqual(emptyLayout.keys, [
          'clear-selection',
          'related-records',
          'view-details',
          'edit',
          'reserve-stock',
          'lifecycle-primary',
        ])
        assert(
          emptyLayout.buttons.every((button) => button.disabled),
          `未选择销售订单时所有选择区动作应保留并置灰: ${JSON.stringify(
            emptyLayout
          )}`
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-none-desktop.png'
        )

        const editButton = page
          .locator('.erp-business-module-current-action')
          .first()
          .locator('[data-business-action-key="edit"]')
        await editButton.evaluate((button) => button.parentElement?.focus())
        await page
          .getByRole('tooltip')
          .filter({ hasText: '请先选择一条销售订单' })
          .waitFor({ state: 'visible', timeout: 5_000 })

        let draftLayout = null
        for (const [status] of SALES_ORDER_STATUSES) {
          const orderNo = `SO-ACTION-${status.toUpperCase()}`
          await selectBusinessRow(page, orderNo)
          const layout = await captureDesktopActionLayout(page)
          assert.equal(
            layout.actionOverflow,
            0,
            `销售订单 ${status} 动作区不应横向溢出`
          )
          assert.equal(
            layout.pageOverflow,
            0,
            `销售订单 ${status} 页面不应横向溢出`
          )
          if (status === 'draft') draftLayout = layout
          if (status !== 'draft') {
            assert.equal(
              layout.keys.includes('edit'),
              false,
              `销售订单 ${status} 已完成草稿编辑阶段，应隐藏编辑入口`
            )
          }
          if (status === 'active') {
            assert.equal(
              layout.buttons.find((button) => button.key === 'reserve-stock')
                ?.disabled,
              false,
              '已生效销售订单应启用预留库存'
            )
          }
          if (['closed', 'canceled'].includes(status)) {
            for (const key of [
              'reserve-stock',
              'lifecycle-primary',
              'lifecycle-more',
            ]) {
              assert.equal(
                layout.keys.includes(key),
                false,
                `销售订单 ${status} 已是终态，应隐藏 ${key}`
              )
            }
          } else {
            assert(
              layout.keys.includes('lifecycle-primary') ||
                layout.keys.includes('lifecycle-more'),
              `销售订单 ${status} 应展示至少一个当前合法状态动作`
            )
            assert.equal(
              layout.keys.includes('lifecycle-more'),
              true,
              `销售订单 ${status} 应展示含取消动作的更多菜单`
            )
          }
          await screenshot(
            page,
            path,
            outputDir,
            `business-action-stability-sales-${status}-desktop.png`
          )
        }

        await selectBusinessRow(page, 'SO-ACTION-DRAFT')
        const submitButton = page
          .locator('.erp-business-module-current-action')
          .first()
          .locator('[data-business-action-key="lifecycle-primary"]')
        await submitButton.click()
        await submitButton
          .locator('.ant-btn-loading-icon')
          .waitFor({ state: 'visible', timeout: 5_000 })
        const savingLayout = await captureDesktopActionLayout(page)
        assertStableDesktopLayout(
          assert,
          draftLayout,
          savingLayout,
          '销售订单保存中'
        )
        for (const key of [
          'edit',
          'reserve-stock',
          'lifecycle-primary',
          'lifecycle-more',
        ]) {
          assert.equal(
            savingLayout.buttons.find((button) => button.key === key)?.disabled,
            true,
            `销售订单保存中应保留并禁用 ${key}: ${JSON.stringify(savingLayout)}`
          )
        }
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-saving-desktop.png'
        )
        await page
          .getByText('销售订单已提交，已进入老板审批')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-sales-five-states-desktop'
        )
      },
    },
    {
      name: 'business-action-stability-sales-no-capability-desktop',
      path: SALES_ORDER_PATH,
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-sales-read-only',
        is_super_admin: false,
        roles: [{ role_key: 'sales', name: '业务' }],
        permissions: ['sales_order.read', 'sales_order_item.read'],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['sales_order.read', 'sales_order_item.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page)
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '销售订单')
        await selectBusinessRow(page, 'SO-ACTION-DRAFT')
        const actionBar = page
          .locator('.erp-business-module-current-action')
          .first()
        for (const key of [
          'edit',
          'reserve-stock',
          'lifecycle-primary',
          'lifecycle-more',
        ]) {
          assert.equal(
            await actionBar
              .locator(`[data-business-action-key="${key}"]`)
              .count(),
            0,
            `只读账号不应看到 ${key} 能力入口`
          )
        }
        assert.equal(
          await actionBar
            .locator('[data-business-action-key="view-details"]')
            .count(),
          1,
          '只读账号仍应看到已授权的查看入口'
        )
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-sales-no-capability-desktop'
        )
      },
    },
    {
      name: 'business-action-quality-outsourcing-read-only-desktop',
      path: QUALITY_INSPECTION_PATH,
      auth: 'admin',
      adminProfile: {
        username: 'demo_boss',
        is_super_admin: false,
        roles: [{ role_key: 'boss', name: '老板 / 管理层' }],
        permissions: ['quality.inspection.read', 'outsourcing.fact.read'],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['quality.inspection.read', 'outsourcing.fact.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includeQuality: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '质量检验')
        const actionBar = page
          .locator('.erp-business-module-current-action')
          .first()
        const viewDisposition = actionBar.locator(
          '[data-business-action-key="outsourcing-disposition-view"]'
        )
        assert.equal(await viewDisposition.count(), 1)
        assert.equal(await viewDisposition.isDisabled(), true)
        assert.equal(
          await actionBar
            .locator('[data-business-action-key="quality-disposition"]')
            .count(),
          0,
          '委外只读权限不能显示不合格处置写入口'
        )

        await selectBusinessRow(page, 'QI-ACTION-DRAFT')
        assert.equal(
          await actionBar
            .locator(
              '[data-business-action-key="outsourcing-disposition-view"]'
            )
            .count(),
          0,
          '来料质检不应显示委外处置查看入口'
        )

        await selectBusinessRow(page, 'QI-ACTION-OUTSOURCING-REJECTED')
        assert.equal(await viewDisposition.count(), 1)
        assert.equal(await viewDisposition.isEnabled(), true)
        assert.equal(
          await actionBar.getByRole('button', {
            name: '委外返厂 / 返工',
          }).count(),
          0,
          '只读账号不能借查看权限获得委外写操作文案'
        )
        await actionBar.scrollIntoViewIfNeeded()
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-quality-outsourcing-read-only-desktop.png'
        )
        await assertNoHorizontalOverflow(
          page,
          'business-action-quality-outsourcing-read-only-desktop'
        )
      },
    },
    {
      name: 'business-action-stability-representative-pages-desktop',
      path: PURCHASE_ORDER_PATH,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includePurchase: true,
          includeQuality: true,
          includeShipments: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '采购订单')
        const purchaseEmpty = await captureDesktopActionLayout(page)
        assert(
          purchaseEmpty.buttons.every((button) => button.disabled),
          '采购订单未选择记录时，已授权动作应置灰'
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-purchase-none-desktop.png'
        )
        for (const status of ['DRAFT', 'APPROVED', 'CLOSED']) {
          await selectBusinessRow(page, `PO-ACTION-${status}`)
          const layout = await captureDesktopActionLayout(page)
          assert.equal(layout.actionOverflow, 0)
          assert.equal(layout.pageOverflow, 0)
          if (status === 'CLOSED') {
            for (const key of [
              'lifecycle-primary',
              'lifecycle-more',
              '编辑',
              '生成入库',
            ]) {
              assert.equal(
                layout.keys.includes(key),
                false,
                `采购订单终态应隐藏 ${key}`
              )
            }
          } else {
            assert.equal(layout.keys.includes('lifecycle-primary'), true)
            assert.equal(layout.keys.includes('lifecycle-more'), true)
          }
          await screenshot(
            page,
            path,
            outputDir,
            `business-action-stability-purchase-${status.toLowerCase()}-desktop.png`
          )
        }

        await gotoScenarioPath(page, PURCHASE_RECEIPT_PATH)
        await waitForBusinessPage(page, '入库管理')
        const receiptEmpty = await captureDesktopActionLayout(page)
        await selectBusinessRow(page, 'PR-STYLE-L1-DRAFT')
        assertStableDesktopLayout(
          assert,
          receiptEmpty,
          await captureDesktopActionLayout(page),
          '采购入库 DRAFT'
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-receipt-draft-desktop.png'
        )
        await selectBusinessRow(page, 'PR-STYLE-L1-CANCELLED')
        const receiptCancelled = await captureDesktopActionLayout(page)
        assert.equal(receiptCancelled.actionOverflow, 0)
        for (const label of [
          '退货',
          '入库调整',
          '查看应付',
          '生成应付',
          '过账入库',
          '取消入库',
        ]) {
          assert.equal(
            receiptCancelled.keys.includes(label),
            false,
            `采购入库终态应隐藏 ${label}`
          )
        }
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-receipt-cancelled-desktop.png'
        )

        await gotoScenarioPath(page, QUALITY_INSPECTION_PATH)
        await waitForBusinessPage(page, '质量检验')
        const qualityEmpty = await captureDesktopActionLayout(page)
        assert(
          qualityEmpty.buttons.every((button) => button.disabled),
          '质量检验未选择记录时，已授权动作应置灰'
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-quality-none-desktop.png'
        )
        for (const status of ['DRAFT', 'SUBMITTED', 'CANCELLED']) {
          await selectBusinessRow(page, `QI-ACTION-${status}`)
          const layout = await captureDesktopActionLayout(page)
          assert.equal(layout.actionOverflow, 0)
          assert.equal(layout.pageOverflow, 0)
          if (status === 'DRAFT') {
            assert.equal(layout.keys.includes('status-0'), true)
            assert.equal(layout.keys.includes('status-1'), true)
          }
          if (status === 'SUBMITTED') {
            assert.equal(
              layout.buttons.some((button) => button.key === 'status-0'),
              true,
              '待判定质检应展示当前判定动作'
            )
          }
          if (status === 'CANCELLED') {
            assert.equal(
              layout.buttons.some((button) => button.key.startsWith('status-')),
              false,
              '已取消质检应隐藏提交、判定、处置和取消动作'
            )
          }
          await screenshot(
            page,
            path,
            outputDir,
            `business-action-stability-quality-${status.toLowerCase()}-desktop.png`
          )
        }
        await selectBusinessRow(page, 'QI-ACTION-PRODUCTION-WIP')
        await assertDesktopActionState(page, assert, 'related-records', {
          visible: false,
        })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-quality-unrelated-desktop.png'
        )

        await gotoScenarioPath(page, SHIPMENT_PATH)
        await waitForBusinessPage(page, '出货单')
        const shipmentEmpty = await captureDesktopActionLayout(page)
        assert(
          shipmentEmpty.buttons.every((button) => button.disabled),
          '出货单未选择记录时，已授权动作应置灰'
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-shipment-none-desktop.png'
        )
        for (const status of ['DRAFT', 'SHIPPED', 'CANCELLED']) {
          await selectBusinessRow(page, `SHIP-ACTION-${status}`)
          const layout = await captureDesktopActionLayout(page)
          assert.equal(layout.actionOverflow, 0)
          assert.equal(layout.pageOverflow, 0)
          if (status === 'CANCELLED') {
            assert.equal(
              layout.buttons.some((button) => button.key.startsWith('status-')),
              false,
              '已取消出货单应隐藏全部写操作'
            )
          }
          await screenshot(
            page,
            path,
            outputDir,
            `business-action-stability-shipment-${status.toLowerCase()}-desktop.png`
          )
        }
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-representative-pages-desktop'
        )
      },
    },
    {
      name: 'business-action-stability-finance-payments-desktop',
      path: FINANCE_PAYMENT_PATH,
      auth: 'admin',
      ...financeIdentity,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includeFinance: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '收付款与核销')
        for (const key of [
          'payment-details',
          'payment-allocation',
          'payment-approval',
          'payment-cancel',
          'payment-reverse',
          'payment-reload',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: true,
            disabled: true,
          })
        }
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-finance-none-desktop.png'
        )

        await selectBusinessRow(page, 'PAY-ACTION-DRAFT')
        await assertDesktopActionState(page, assert, 'payment-allocation', {
          visible: true,
          disabled: true,
        })
        await assertDesktopActionState(page, assert, 'payment-approval', {
          visible: true,
          disabled: false,
        })
        await assertDesktopActionState(page, assert, 'payment-cancel', {
          visible: true,
          disabled: false,
        })
        await assertDesktopActionState(page, assert, 'payment-reverse', {
          visible: true,
          disabled: true,
        })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-finance-draft-desktop.png'
        )

        await selectBusinessRow(page, 'PAY-ACTION-APPROVED')
        await assertDesktopActionState(page, assert, 'payment-allocation', {
          visible: true,
          disabled: false,
        })
        await assertDesktopActionState(page, assert, 'payment-approval', {
          visible: false,
        })
        await assertDesktopActionState(page, assert, 'payment-reverse', {
          visible: true,
          disabled: true,
        })

        await selectBusinessRow(page, 'PAY-ACTION-POSTED')
        for (const key of [
          'payment-allocation',
          'payment-approval',
          'payment-cancel',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }
        await assertDesktopActionState(page, assert, 'payment-reverse', {
          visible: true,
          disabled: false,
        })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-finance-posted-desktop.png'
        )

        await selectBusinessRow(page, 'PAY-ACTION-REVERSED')
        for (const key of [
          'payment-allocation',
          'payment-approval',
          'payment-cancel',
          'payment-reverse',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-finance-payments-desktop'
        )
      },
    },
    {
      name: 'business-action-stability-finance-superadmin-narrowed-desktop',
      path: FINANCE_PAYMENT_PATH,
      auth: 'admin',
      adminProfile: {
        id: 2,
        username: 'style-l1-superadmin-read-only',
        is_super_admin: true,
        roles: [],
        permissions: [],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['finance.payment.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includeFinance: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '收付款与核销')
        await selectBusinessRow(page, 'PAY-ACTION-DRAFT')
        for (const key of [
          'payment-allocation',
          'payment-approval',
          'payment-cancel',
          'payment-reverse',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }
        await assertDesktopActionState(page, assert, 'payment-details', {
          visible: true,
          disabled: false,
        })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-finance-superadmin-narrowed-desktop.png'
        )
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-finance-superadmin-narrowed-desktop'
        )
      },
    },
    {
      name: 'business-action-stability-warehouse-returns-shipments-desktop',
      path: SALES_RETURN_PATH,
      auth: 'admin',
      ...warehouseIdentity,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includeSalesReturns: true,
          includeShipments: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '客户退货 / RMA')
        for (const key of ['sales-return-receive', 'sales-return-reverse']) {
          await assertDesktopActionState(page, assert, key, {
            visible: true,
            disabled: true,
          })
        }
        for (const key of ['sales-return-approval', 'sales-return-cancel']) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }

        await selectBusinessRow(page, 'RMA-ACTION-DRAFT')
        for (const key of ['sales-return-receive', 'sales-return-reverse']) {
          await assertDesktopActionState(page, assert, key, {
            visible: true,
            disabled: true,
          })
        }
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-return-draft-desktop.png'
        )

        await selectBusinessRow(page, 'RMA-ACTION-APPROVED')
        await assertDesktopActionState(page, assert, 'sales-return-receive', {
          visible: true,
          disabled: false,
        })
        await assertDesktopActionState(page, assert, 'sales-return-reverse', {
          visible: true,
          disabled: true,
        })

        await selectBusinessRow(page, 'RMA-ACTION-RECEIVED')
        await assertDesktopActionState(page, assert, 'sales-return-receive', {
          visible: false,
        })
        await assertDesktopActionState(page, assert, 'sales-return-reverse', {
          visible: true,
          disabled: false,
        })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-return-received-desktop.png'
        )

        await selectBusinessRow(page, 'RMA-ACTION-REVERSED')
        for (const key of ['sales-return-receive', 'sales-return-reverse']) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }

        await gotoScenarioPath(page, SHIPMENT_PATH)
        await waitForBusinessPage(page, '出货单')
        await selectBusinessRow(page, 'SHIP-ACTION-DRAFT')
        await assertDesktopActionState(page, assert, 'shipment-release', {
          visible: true,
          disabled: false,
        })
        await assertDesktopActionState(page, assert, 'shipment-ship', {
          visible: true,
          disabled: true,
        })
        await assertDesktopActionState(page, assert, 'shipment-cancel', {
          visible: true,
          disabled: false,
        })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-shipment-pending-desktop.png'
        )

        await selectBusinessRow(page, 'SHIP-ACTION-DRAFT-APPROVED')
        await assertDesktopActionState(page, assert, 'shipment-release', {
          visible: false,
        })
        await assertDesktopActionState(page, assert, 'shipment-ship', {
          visible: true,
          disabled: false,
        })

        await selectBusinessRow(page, 'SHIP-ACTION-DRAFT-REJECTED')
        for (const key of ['shipment-release', 'shipment-ship']) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }
        await assertDesktopActionState(page, assert, 'shipment-cancel', {
          visible: true,
          disabled: false,
        })

        await selectBusinessRow(page, 'SHIP-ACTION-SHIPPED')
        await assertDesktopActionState(page, assert, 'shipment-ship', {
          visible: false,
        })
        await assertDesktopActionState(page, assert, 'shipment-cancel', {
          visible: true,
          disabled: false,
        })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-shipment-shipped-desktop.png'
        )
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-warehouse-returns-shipments-desktop'
        )
      },
    },
    {
      name: 'business-action-stability-production-exceptions-desktop',
      path: PRODUCTION_EXCEPTION_PATH,
      auth: 'admin',
      ...productionIdentity,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includeProductionExceptions: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '生产异常处置')
        for (const key of [
          'production-exception-approval',
          'production-exception-withdraw',
          'production-exception-execute',
          'production-exception-reverse',
          'production-exception-revoke-quota',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: true,
            disabled: true,
          })
        }
        await assertDesktopActionState(
          page,
          assert,
          'production-exception-decide',
          { visible: false }
        )

        await selectBusinessRow(page, 'PEX-ACTION-SUBMITTED-SCRAP')
        for (const key of [
          'production-exception-approval',
          'production-exception-withdraw',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: true,
            disabled: false,
          })
        }
        for (const key of [
          'production-exception-execute',
          'production-exception-reverse',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: true,
            disabled: true,
          })
        }
        await assertDesktopActionState(
          page,
          assert,
          'production-exception-revoke-quota',
          { visible: false }
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-production-submitted-desktop.png'
        )

        await selectBusinessRow(page, 'PEX-ACTION-APPROVED-SCRAP')
        for (const key of [
          'production-exception-approval',
          'production-exception-withdraw',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }
        await assertDesktopActionState(
          page,
          assert,
          'production-exception-execute',
          { visible: true, disabled: false }
        )
        await assertDesktopActionState(
          page,
          assert,
          'production-exception-reverse',
          { visible: true, disabled: true }
        )

        await selectBusinessRow(page, 'PEX-ACTION-APPLIED-SCRAP')
        await assertDesktopActionState(
          page,
          assert,
          'production-exception-execute',
          { visible: false }
        )
        await assertDesktopActionState(
          page,
          assert,
          'production-exception-reverse',
          { visible: true, disabled: false }
        )

        await selectBusinessRow(page, 'PEX-ACTION-APPROVED-OVER-ISSUE')
        for (const key of [
          'production-exception-execute',
          'production-exception-reverse',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }
        await assertDesktopActionState(
          page,
          assert,
          'production-exception-revoke-quota',
          { visible: true, disabled: false }
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-production-quota-desktop.png'
        )

        await selectBusinessRow(page, 'PEX-ACTION-CANCELLED-SCRAP')
        for (const key of [
          'production-exception-approval',
          'production-exception-withdraw',
          'production-exception-execute',
          'production-exception-reverse',
          'production-exception-revoke-quota',
        ]) {
          await assertDesktopActionState(page, assert, key, {
            visible: false,
          })
        }
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-production-exceptions-desktop'
        )
      },
    },
    {
      name: 'business-action-stability-sales-mobile-dark',
      path: SALES_ORDER_PATH,
      auth: 'admin',
      themeMode: 'dark',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page)
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '销售订单')
        await assertERPThemeMode(page, {
          scenarioName: 'business-action-stability-sales-mobile-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        const emptyLayout = await captureMobileActionLayout(page)
        assert.deepEqual(emptyLayout.visible, ['lifecycle-primary'])
        assert.equal(emptyLayout.moreDisabled, true)
        assert.equal(emptyLayout.pageOverflow, 0)
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-none-mobile-dark.png'
        )

        await selectBusinessRow(page, 'SO-ACTION-ACTIVE')
        const activeLayout = await captureMobileActionLayout(page)
        assert(activeLayout.visible.length > 0)
        assert.equal(activeLayout.moreDisabled, false)
        assert.equal(activeLayout.pageOverflow, 0)
        await openMobileActionDrawer(page)
        const activeDrawerKeys = await captureMobileDrawerKeys(page)
        const lifecycleMore = page
          .locator('.erp-business-selection-action-drawer')
          .locator('[data-business-action-key="lifecycle-more"]')
        await lifecycleMore.click()
        await page
          .locator('.ant-dropdown-menu')
          .filter({ hasText: '取消' })
          .waitFor({ state: 'visible', timeout: 5_000 })
        await page
          .locator('.erp-business-selection-action-drawer')
          .waitFor({ state: 'visible' })
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-active-drawer-mobile-dark.png'
        )
        await page.keyboard.press('Escape')
        await closeMobileActionDrawer(page)

        await selectBusinessRow(page, 'SO-ACTION-CLOSED')
        const closedLayout = await captureMobileActionLayout(page)
        assert.equal(
          closedLayout.visible.includes('lifecycle-primary'),
          false,
          '手机终态订单应隐藏生命周期主动作'
        )
        assert.equal(closedLayout.moreDisabled, false)
        await openMobileActionDrawer(page)
        const closedDrawerKeys = await captureMobileDrawerKeys(page)
        assert.equal(
          closedDrawerKeys.includes('lifecycle-primary'),
          false,
          '手机终态订单抽屉不应保留主状态占位'
        )
        assert.equal(
          closedDrawerKeys.includes('lifecycle-more'),
          false,
          '手机终态订单抽屉不应保留空更多操作'
        )
        assert(
          activeDrawerKeys.includes('lifecycle-more'),
          '手机非终态订单抽屉应保留有实际菜单项的更多操作'
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-closed-drawer-mobile-dark.png'
        )
        await assertNoHorizontalOverflow(
          page,
          'business-action-stability-sales-mobile-dark'
        )
      },
    },
  ]
}
