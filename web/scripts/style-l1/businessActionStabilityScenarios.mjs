import { yoyoosunRoleFlowMatrix } from '../../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { installAdminRpcMocks } from './adminRpcMocks.mjs'
import { assertButtonSpacing } from './buttonSpacingAssertions.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'

const SALES_ORDER_PATH = '/erp/sales/project-orders/sales-orders'
const PURCHASE_ORDER_PATH = '/erp/purchase/accessories'
const PURCHASE_RECEIPT_PATH = '/erp/warehouse/inbound'
const QUALITY_INSPECTION_PATH = '/erp/production/quality-inspections'
const SHIPMENT_PATH = '/erp/warehouse/shipments'
const FINANCE_PAYMENT_PATH = '/erp/finance/payments'
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
    finance_release_version: financeReleaseStatus === 'PENDING' ? 1 : 2,
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
    includeProductionExceptions = false,
    delaySalesSubmit = false,
  } = {}
) {
  const salesOrders = createSalesOrderRows()
  const purchaseOrders = createPurchaseOrderRows()
  const qualityInspections = createQualityInspectionRows()
  const shipments = createShipmentRows()
  const financePayments = createFinancePaymentRows()
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
      if (body.method === 'get_sales_order_acceptance_process') {
        const salesOrderID = Number(body.params?.sales_order_id)
        const salesOrder = salesOrders.find(
          (order) => Number(order.id) === salesOrderID
        )
        await fulfillRpc(route, body.id || 'action-stability-sales-get', {
          process_context: null,
          source_readback: {
            type: 'sales_order',
            id: salesOrderID,
            no: salesOrder?.order_no,
          },
        })
        return
      }
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

  if (includeShipments || includeFinance || includeProductionExceptions) {
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
      if (
        includeProductionExceptions &&
        method === 'list_production_exceptions'
      ) {
        await fulfillRpc(
          route,
          id,
          rpcPage(productionExceptions, 'production_exceptions', params)
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
  const radio = row.getByRole('radio')
  if (await radio.count()) {
    await radio.check()
  } else {
    const checkedRows = page.locator(
      '.ant-table-tbody .ant-table-row.ant-table-row-selected'
    )
    for (let index = (await checkedRows.count()) - 1; index >= 0; index -= 1) {
      await checkedRows.nth(index).getByRole('checkbox').uncheck()
    }
    await row.getByRole('checkbox').check()
  }
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

async function captureActionLayout(page) {
  const actionBar = page.locator('.erp-business-module-current-action').first()
  if (await actionBar.locator('button').count()) {
    await assertButtonSpacing(actionBar, '当前操作区', {
      contentSized: await page.evaluate(() =>
        window.matchMedia('(min-width: 992px)').matches
      ),
    })
  }
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
  const scope =
    '.erp-business-module-current-action, .erp-business-selection-action-menu:visible'
  const selector = `[data-business-action-key="${key}"]:visible`
  let action = page.locator(scope).locator(selector)
  const more = page.locator(
    '.erp-business-module-current-action .erp-business-selection-action-bar__compact-more:visible'
  )
  const opened = (await action.count()) === 0 && (await more.count()) > 0
  if (opened) await openActionMenu(page)
  action = page.locator(scope).locator(selector)
  assert.equal(
    (await action.count()) > 0,
    visible,
    `${key} 可见性应为 ${visible ? '显示' : '隐藏'}`
  )
  if (visible && typeof disabled === 'boolean')
    assert.equal(
      await action.isDisabled(),
      disabled,
      `${key} 禁用态应为 ${disabled}`
    )
  if (opened) await closeActionMenu(page)
}

async function assertUnselectedActions(page, assert) {
  const layout = await captureActionLayout(page)
  const recordButtons = layout.buttons.filter(
    (button) => button.key !== '更多操作'
  )
  assert(recordButtons.length > 0, '未选择时应保留岗位操作入口')
  assert(
    recordButtons.every((button) => button.disabled),
    '未选择时不能办理本单操作'
  )
  assert.equal(
    await page.locator('[data-business-action-key="clear-selection"]').count(),
    0,
    '未选择时无需清空已选'
  )
  return layout
}

function assertStableDesktopLayout(
  assert,
  baseline,
  current,
  scenarioName,
  { contextualKeys = [] } = {}
) {
  const contextualKeySet = new Set(contextualKeys)
  const baselineCoreButtons = baseline.buttons.filter(
    (button) => !contextualKeySet.has(button.key)
  )
  const currentCoreButtons = current.buttons.filter(
    (button) => !contextualKeySet.has(button.key)
  )
  assert.deepEqual(
    currentCoreButtons.map((button) => button.key),
    baselineCoreButtons.map((button) => button.key),
    `${scenarioName} 临时加载和恢复不得改变动作顺序`
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
  if (contextualKeys.length > 0) return
  for (let index = 0; index < baselineCoreButtons.length; index += 1) {
    const before = baselineCoreButtons[index]
    const after = currentCoreButtons[index]
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

async function captureActionMenuKeys(page) {
  return page
    .locator('.erp-business-selection-action-menu')
    .evaluate((list) => {
      let statusIndex = 0
      return Array.from(
        list.querySelectorAll('.erp-business-selection-action-menu__item')
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

async function openActionMenu(page) {
  const button = page
    .locator('.erp-business-module-current-action')
    .first()
    .locator('.erp-business-selection-action-bar__compact-more')
  await button.click()
  await page
    .locator('.erp-business-selection-action-menu')
    .waitFor({ state: 'visible', timeout: 10_000 })
}

async function closeActionMenu(page) {
  await page.keyboard.press('Escape')
  await page
    .locator('.erp-business-selection-action-menu')
    .waitFor({ state: 'hidden', timeout: 10_000 })
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
      name: 'purchase-order-batch-print-selection-desktop',
      path: PURCHASE_ORDER_PATH,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includePurchase: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '采购订单')
        const selectableRows = page.locator(
          '.ant-table-tbody .ant-table-row input[type="checkbox"]:not(:disabled)'
        )
        const selectedCount = await selectableRows.count()
        assert.ok(selectedCount > 1)
        assert.equal(
          await page
            .locator('[data-business-action-key="select-page-for-print"]')
            .count(),
          0
        )
        for (let index = 0; index < selectedCount; index += 1) {
          await selectableRows.nth(index).check()
        }
        await page
          .getByText(`已选择 ${selectedCount} 张采购订单`, { exact: true })
          .waitFor({ state: 'visible' })
        assert.equal(
          await page
            .locator(
              '.ant-table-tbody .ant-table-row input[type="checkbox"]:checked'
            )
            .count(),
          selectedCount
        )
        let printButton = page.locator(
          '.erp-business-module-current-action [data-business-action-key="print-contract"]:visible'
        )
        const printActionInMenu = (await printButton.count()) === 0
        if (printActionInMenu) await openActionMenu(page)
        printButton = page.locator(
          '.erp-business-module-current-action [data-business-action-key="print-contract"]:visible, .erp-business-selection-action-menu [data-business-action-key="print-contract"]:visible'
        )
        assert.equal(await printButton.count(), 1)
        assert.equal(await printButton.isEnabled(), true)
        assert.match(
          await printButton.textContent(),
          /批量打印合同/u
        )
        if (printActionInMenu) await closeActionMenu(page)
        await assertDesktopActionState(page, assert, 'purchase-details', {
          visible: true,
          disabled: true,
        })
        await page.screenshot({
          path: path.join(
            outputDir,
            'purchase-order-batch-print-selection-desktop.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'purchase-order-batch-print-selection-desktop'
        )
      },
    },
    {
      name: 'engineering-summary-purchase-batch-print',
      path: `${SALES_ORDER_PATH}?sales_order_id=1103&material_request_id=5`,
      auth: 'admin',
      ...financeIdentity,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, { includePurchase: true })
        const orders = Array.from({ length: 21 }, (_, index) => ({
          ...createPurchaseOrderRows().find((order) => order.id === 1202),
          id: 1400 + index,
          supplier_id: 1400 + index,
          purchase_order_no: `PO-SUMMARY-${index + 1}`,
          currency: 'CNY',
          item_count: 1,
        }))
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'get_engineering_material_request')
            return route.fallback()
          return fulfillRpc(route, id, {
            id: 5,
            sales_order_id: 1103,
            order_no: 'SO-ACTION-ACTIVE',
            order_status: 'active',
            status: 'APPROVED',
            version: 3,
            issues: [],
            sources: [],
            items: [],
            purchase_orders: orders.map((order) => ({
              id: order.id,
              purchase_order_no: order.purchase_order_no,
              supplier_id: order.supplier_id,
            })),
          })
        })
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'get_purchase_order') {
            return fulfillRpc(route, id, {
              purchase_order: orders.find(
                (order) => order.id === Number(params.id)
              ),
            })
          }
          if (method === 'list_purchase_order_items') {
            return fulfillRpc(
              route,
              id,
              rpcPage(
                [
                  {
                    id: Number(params.purchase_order_id),
                    purchase_order_id: Number(params.purchase_order_id),
                    line_no: 1,
                    display_order: 1,
                    material_id: 1,
                    unit_id: 1,
                    material_name_snapshot: '模拟缺价材料',
                    purchased_quantity: '20',
                    unit_price: null,
                    amount: null,
                    line_status: 'open',
                  },
                ],
                'purchase_order_items',
                params
              )
            )
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const button = page.getByRole('button', {
          name: '打印本次采购合同',
          exact: true,
        })
        await button.waitFor({ state: 'visible' })
        await installAdminRpcMocks(page.context(), {
          baseURL: new URL(page.url()).origin,
          adminProfileOverride: financeIdentity.adminProfile,
          effectiveSessionOverride: financeIdentity.effectiveSession,
        })
        const popupPromise = page.waitForEvent('popup')
        await button.click()
        const popup = await popupPromise
        try {
          await popup
            .getByText('共 21 份，已选 21 份', { exact: true })
            .waitFor({ state: 'visible', timeout: 15_000 })
          assert.equal(
            await popup
              .getByRole('checkbox', { name: /^选择合同 PO-SUMMARY-/u })
              .count(),
            21
          )
          assert.equal(
            await popup
              .locator('.erp-material-contract-batch__document')
              .count(),
            20
          )
          assert.ok((await popup.getByText(/待补：.*单价/u).count()) >= 21)
          await popup
            .getByRole('combobox', { name: '输出批次', exact: true })
            .selectOption('1')
          await popup
            .locator('[data-purchase-order-no="PO-SUMMARY-21"]')
            .waitFor({ state: 'visible' })
          await assertNoHorizontalOverflow(
            popup,
            'engineering-summary-purchase-batch-print'
          )
          await popup.screenshot({
            path: path.join(
              outputDir,
              'engineering-summary-purchase-batch-print.png'
            ),
            fullPage: true,
          })
          assert.match(page.url(), /material_request_id=5/u)
        } finally {
          await popup.close()
        }
      },
    },
    {
      name: 'finance-purchase-order-read-and-print-desktop',
      path: `${SALES_ORDER_PATH}?sales_order_id=1103&material_request_id=5`,
      auth: 'admin',
      ...financeIdentity,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, { includePurchase: true })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'get_engineering_material_request')
            return route.fallback()
          return fulfillRpc(route, id, {
            id: 5,
            sales_order_id: 1103,
            order_no: 'SO-ACTION-ACTIVE',
            order_status: 'active',
            status: 'APPROVED',
            version: 3,
            issues: [],
            sources: [],
            items: [],
            purchase_orders: [
              {
                id: 1202,
                purchase_order_no: 'PO-ACTION-APPROVED',
                supplier_id: 1,
              },
            ],
          })
        })
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          const approvedOrder = {
            ...createPurchaseOrderRows().find((order) => order.id === 1202),
            currency: 'CNY',
            item_count: 1,
          }
          if (method === 'list_purchase_orders') {
            return fulfillRpc(
              route,
              id,
              rpcPage([approvedOrder], 'purchase_orders', params)
            )
          }
          if (method === 'get_purchase_order' && Number(params.id) === 1202) {
            return fulfillRpc(route, id, { purchase_order: approvedOrder })
          }
          if (
            method !== 'list_purchase_order_items' ||
            Number(params.purchase_order_id) !== 1202
          )
            return route.fallback()
          return fulfillRpc(route, id, {
            purchase_order_items: [
              {
                id: 1,
                purchase_order_id: 1202,
                line_no: 1,
                display_order: 1,
                material_id: 1,
                material_code_snapshot: 'MAT-FINANCE-READ',
                material_name_snapshot: '核价短绒',
                unit_id: 1,
                purchased_quantity: '20',
                unit_price: '3.50',
                amount: '70.00',
                line_status: 'open',
              },
            ],
            total: 1,
            limit: Number(params.limit || 100),
            offset: 0,
          })
        })
      },
      verify: async (page) => {
        const requestDialog = page.getByRole('dialog')
        await requestDialog
          .getByRole('link', { name: 'PO-ACTION-APPROVED', exact: true })
          .click()
        await waitForBusinessPage(page, '采购订单')
        assert.equal(
          new URL(page.url()).searchParams.get('purchase_order_id'),
          '1202'
        )
        await page.getByText('1条', { exact: true }).click()
        await page
          .getByText('核价短绒', { exact: true })
          .first()
          .waitFor({ state: 'visible' })
        const printButton = page.locator(
          '[data-business-action-key="print-contract"]'
        )
        await printButton.waitFor({ state: 'visible' })
        assert.equal(await printButton.isEnabled(), true)
        assert.equal(
          await page
            .getByRole('button', { name: '新建采购订单', exact: true })
            .count(),
          0
        )
        for (const key of [
          'purchase-edit',
          'lifecycle-primary',
          'lifecycle-normal_close',
          'lifecycle-short_close',
          'lifecycle-cancel',
          'generate-inbound',
        ]) {
          await assertDesktopActionState(page, assert, key, { visible: false })
        }
        await installAdminRpcMocks(page.context(), {
          baseURL: new URL(page.url()).origin,
          adminProfileOverride: financeIdentity.adminProfile,
          effectiveSessionOverride: financeIdentity.effectiveSession,
        })
        const popupPromise = page.waitForEvent('popup')
        await printButton.click()
        const popup = await popupPromise
        try {
          await popup
            .getByText('模板内容', { exact: true })
            .waitFor({ state: 'visible', timeout: 15_000 })
          await popup
            .getByText('核价短绒', { exact: true })
            .waitFor({ state: 'visible' })
          assert.match(
            popup.url(),
            /print-workspace\/material-purchase-contract/u
          )
          await popup
            .getByRole('button', { name: '打印', exact: true })
            .waitFor({ state: 'visible' })
          await popup.screenshot({
            path: path.join(outputDir, 'finance-purchase-print-workspace.png'),
            fullPage: true,
          })
        } catch (error) {
          await popup.screenshot({
            path: path.join(outputDir, 'finance-purchase-print-failed.png'),
          })
          throw new Error(
            `${error.message}\n${await popup.locator('body').innerText()}`
          )
        } finally {
          await popup.close()
        }
        await screenshot(
          page,
          path,
          outputDir,
          'finance-purchase-order-read-and-print-desktop.png'
        )
        await assertNoHorizontalOverflow(
          page,
          'finance-purchase-order-read-and-print-desktop'
        )
      },
    },
    ...['light', 'dark'].map((themeMode) => ({
      name: `business-button-spacing-${themeMode}`,
      path: FINANCE_PAYMENT_PATH,
      auth: 'admin',
      themeMode,
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
        await assertERPThemeMode(page, {
          scenarioName: `button-spacing-${themeMode}`,
          expectedMode: themeMode,
          expectedEffectiveTheme: themeMode,
        })
        await selectBusinessRow(page, 'PAY-ACTION-DRAFT')
        for (const width of [1440, 1280, 1024, 992, 991, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 900 })
          const compact = width < 992
          const actions = page
            .locator('.erp-business-selection-action-bar__record-actions')
            .first()
          await actions
            .locator('.erp-business-selection-action-bar__compact-more')
            .waitFor({ state: 'visible' })
          if (compact) {
            const visibleCount = width >= 768 ? 2 : 1
            const primaryButtons = actions.locator(
              '.erp-business-selection-action-bar__compact-visible .ant-btn'
            )
            await primaryButtons
              .nth(visibleCount - 1)
              .waitFor({ state: 'visible' })
            await primaryButtons.nth(visibleCount).waitFor({ state: 'hidden' })
          }
          await actions.evaluate(async (element) => {
            await Promise.allSettled(
              element
                .getAnimations({ subtree: true })
                .map((animation) => animation.finished)
            )
          })
          const name = `button-spacing-${themeMode}-${width}`
          const metrics = await assertButtonSpacing(actions, name, {
            contentSized: !compact,
          })
          if (!compact) {
            assert(
              Math.max(...metrics.map((button) => button.height)) -
                Math.min(...metrics.map((button) => button.height)) <=
                1,
              `${name} 同一操作区的按钮高度应一致: ${JSON.stringify(metrics)}`
            )
          }
          if (compact) {
            assert(
              metrics.every((button) => button.height >= 44),
              `${name} 窄屏按钮应保留 44px 触控高度: ${JSON.stringify(metrics)}`
            )
            assert(
              Math.max(...metrics.map((button) => button.top)) -
                Math.min(...metrics.map((button) => button.top)) <=
                1,
              `${name} 主按钮和更多操作应对齐，桌面宽度不能变成窄屏高度: ${JSON.stringify(metrics)}`
            )
            const more = actions.locator(
              '.erp-business-selection-action-bar__compact-more'
            )
            await more.click()
            const actionMenu = page.locator('.erp-business-selection-action-menu')
            await actionMenu.waitFor({ state: 'visible' })
            await assertButtonSpacing(actionMenu, `${name}-more`)
            await closeActionMenu(page)
            await actionMenu.waitFor({ state: 'hidden' })
            const restored = await assertButtonSpacing(
              actions,
              `${name}-restored`
            )
            assert.deepEqual(
              restored.map((button) => button.text),
              metrics.map((button) => button.text),
              `${name} 关闭更多操作后应保留原按钮`
            )
          }
          await assertNoHorizontalOverflow(page, name)
          if (width === 1440 || width === 320) {
            await screenshot(page, path, outputDir, `${name}.png`)
          }
        }

        await page.setViewportSize({ width: 1440, height: 900 })
        await page
          .getByRole('button', { name: /列顺序/u })
          .click()
        const modal = page.getByRole('dialog', {
          name: /^调整列表列顺序/u,
        })
        await modal.waitFor({ state: 'visible' })
        await modal.evaluate(async (element) => {
          await Promise.all(
            element.getAnimations().map((animation) => animation.finished)
          )
        })
        await assertButtonSpacing(
          modal.locator('.ant-modal-footer'),
          `button-spacing-${themeMode}-modal`,
          { contentSized: true }
        )
        await modal.locator('.ant-modal-close').click()
        await modal.waitFor({ state: 'hidden' })

        await gotoScenarioPath(page, '/erp/finance/receivables', {
          waitUntil: 'domcontentloaded',
        })
        await waitForBusinessPage(page, '应收管理')
        const shortActions = page
          .locator('.erp-business-module-current-action')
          .first()
        const confirm = shortActions.locator(
          '[data-business-action-key="finance-fact-confirm"]'
        )
        await confirm.waitFor({ state: 'visible' })
        assert.equal(await confirm.isDisabled(), true, '未选择时确认应禁用')
        await assertButtonSpacing(
          shortActions,
          `button-spacing-${themeMode}-short`,
          {
            contentSized: true,
          }
        )
        await assertNoHorizontalOverflow(
          page,
          `button-spacing-${themeMode}-short`
        )
        await screenshot(
          page,
          path,
          outputDir,
          `button-spacing-${themeMode}-short.png`
        )
      },
    })),
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
        const emptyLayout = await assertUnselectedActions(page, assert)
        let draftLayout = null
        for (const [status] of SALES_ORDER_STATUSES) {
          await selectBusinessRow(page, `SO-ACTION-${status.toUpperCase()}`)
          await assertDesktopActionState(page, assert, 'edit', {
            visible: status === 'draft',
            disabled: false,
          })
          await assertDesktopActionState(page, assert, 'reserve-stock', {
            visible: ['draft', 'submitted', 'active'].includes(status),
            disabled: status !== 'active',
          })
          await assertDesktopActionState(page, assert, 'lifecycle-primary', {
            visible: ['draft', 'active'].includes(status),
            disabled: false,
          })
          await assertDesktopActionState(page, assert, 'lifecycle-cancel', {
            visible: ['draft', 'submitted', 'active'].includes(status),
            disabled: false,
          })
          await assertDesktopActionState(page, assert, 'lifecycle-short_close', {
            visible: status === 'active',
            disabled: false,
          })
          if (status === 'draft')
            draftLayout = await captureActionLayout(page)
          await assertNoHorizontalOverflow(page, `销售订单 ${status}`)
          await screenshot(
            page,
            path,
            outputDir,
            `business-action-stability-sales-${status}-desktop.png`
          )
        }

        await selectBusinessRow(page, 'SO-ACTION-ACTIVE')
        await openActionMenu(page)
        await page
          .locator('.erp-business-selection-action-menu')
          .getByRole('button', { name: '提前关闭', exact: true })
          .click()
        await page.locator('.erp-business-selection-action-menu').waitFor({
          state: 'hidden',
        })
        const closeDialog = page.getByRole('dialog', {
          name: '确认提前关闭销售订单',
        })
        await closeDialog.waitFor({ state: 'visible', timeout: 5_000 })
        const closeReason = closeDialog.getByRole('textbox', {
          name: '业务原因',
        })
        assert.equal(await closeReason.getAttribute('maxlength'), '255')
        assert.equal(
          await closeReason.getAttribute('placeholder'),
          '请填写未履完即关闭的业务原因'
        )
        await closeDialog.getByRole('button', { name: '确认提前关闭' }).click()
        await page
          .getByText('请填写业务原因', { exact: true })
          .last()
          .waitFor({ state: 'visible', timeout: 5_000 })
        await closeDialog.waitFor({ state: 'visible', timeout: 5_000 })
        await closeReason.fill('客户缩减本批需求，未交数量不再继续履行')
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-short-close-reason-desktop.png'
        )
        await page.setViewportSize({ width: 390, height: 844 })
        const closeDialogElement = await closeDialog.elementHandle()
        assert(closeDialogElement, '销售订单提前关闭弹窗节点应存在')
        await page.waitForFunction(
          (element) =>
            element
              .getAnimations({ subtree: true })
              .every(
                (animation) =>
                  !['pending', 'running'].includes(animation.playState)
              ),
          closeDialogElement,
          { timeout: 5_000 }
        )
        const narrowDialogMetrics = await closeDialog.evaluate(
          async (element) => {
            await new Promise((resolve) =>
              window.requestAnimationFrame(() =>
                window.requestAnimationFrame(resolve)
              )
            )
            const rect = element.getBoundingClientRect()
            const style = window.getComputedStyle(element)
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight,
              pageOverflow:
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
              computedWidth: style.width,
              computedMaxWidth: style.maxWidth,
              transform: style.transform,
              transition: style.transition,
            }
          }
        )
        assert(
          narrowDialogMetrics.left >= 0 &&
            narrowDialogMetrics.right <= narrowDialogMetrics.viewportWidth &&
            narrowDialogMetrics.top >= 0 &&
            narrowDialogMetrics.bottom <= narrowDialogMetrics.viewportHeight &&
            narrowDialogMetrics.pageOverflow <= 1,
          `销售订单提前关闭弹窗应完整留在窄屏视口内: ${JSON.stringify(
            narrowDialogMetrics
          )}`
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-short-close-reason-mobile.png'
        )
        await page
          .locator('.ant-modal-confirm-btns .ant-btn-default')
          .last()
          .click()
        await closeDialog.waitFor({ state: 'hidden', timeout: 5_000 })
        if (
          await page
            .locator('.erp-business-selection-action-menu:visible')
            .count()
        )
          await closeActionMenu(page)
        await page.setViewportSize({ width: 1440, height: 900 })

        await page
          .locator('.erp-business-module-current-action')
          .first()
          .locator('[data-business-action-key="clear-selection"]')
          .click()
        assertStableDesktopLayout(
          assert,
          emptyLayout,
          await captureActionLayout(page),
          '销售订单清空选择恢复'
        )
        await selectBusinessRow(page, 'SO-ACTION-DRAFT')
        const submitButton = page
          .locator('.erp-business-module-current-action')
          .first()
          .locator('[data-business-action-key="lifecycle-primary"]')
        await submitButton.click()
        await submitButton
          .locator('.ant-btn-loading-icon')
          .waitFor({ state: 'visible', timeout: 5_000 })
        const savingLayout = await captureActionLayout(page)
        assertStableDesktopLayout(
          assert,
          draftLayout,
          savingLayout,
          '销售订单保存中'
        )
        for (const key of ['lifecycle-primary', 'edit']) {
          await assertDesktopActionState(page, assert, key, {
            visible: true,
            disabled: true,
          })
        }
        assert(
          savingLayout.keys.includes('更多操作'),
          '保存中仍可查看辅助动作与原因'
        )
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-saving-desktop.png'
        )
        await page
          .getByText('销售订单已提交，已进入审批流程')
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
          'lifecycle-normal_close',
          'lifecycle-short_close',
          'lifecycle-cancel',
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
        assert.equal(await viewDisposition.count(), 0)
        assert.equal(
          await actionBar
            .locator('[data-business-action-key="quality-disposition"]')
            .count(),
          0,
          '委外只读权限不能显示不合格处置写入口'
        )

        await selectBusinessRow(page, 'QI-ACTION-DRAFT')
        assert.equal(
          await viewDisposition.count(),
          0,
          '来料质检不应占用委外处置查看入口'
        )

        await selectBusinessRow(page, 'QI-ACTION-OUTSOURCING-REJECTED')
        assert.equal(await viewDisposition.count(), 1)
        assert.equal(await viewDisposition.isEnabled(), true)
        assert.equal(
          await actionBar
            .getByRole('button', {
              name: '委外返厂 / 返工',
            })
            .count(),
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
        await assertUnselectedActions(page, assert)
        for (const status of ['DRAFT', 'APPROVED', 'CLOSED']) {
          await selectBusinessRow(page, 'PO-ACTION-' + status)
          await assertDesktopActionState(page, assert, 'purchase-details', {
            visible: true,
            disabled: false,
          })
          await assertDesktopActionState(page, assert, 'purchase-edit', {
            visible: status === 'DRAFT',
            disabled: false,
          })
          await assertDesktopActionState(page, assert, 'generate-inbound', {
            visible: status !== 'CLOSED',
            disabled: status !== 'APPROVED',
          })
          await assertDesktopActionState(page, assert, 'lifecycle-primary', {
            visible: status !== 'CLOSED',
            disabled: false,
          })
          await assertDesktopActionState(page, assert, 'lifecycle-cancel', {
            visible: status !== 'CLOSED',
            disabled: false,
          })
          await assertDesktopActionState(page, assert, 'lifecycle-short_close', {
            visible: status === 'APPROVED',
            disabled: false,
          })
          await assertNoHorizontalOverflow(page, '采购订单 ' + status)
        }
        await gotoScenarioPath(page, PURCHASE_RECEIPT_PATH)
        await waitForBusinessPage(page, '入库管理')
        await assertUnselectedActions(page, assert)
        await selectBusinessRow(page, 'PR-STYLE-L1-DRAFT')
        await assertDesktopActionState(page, assert, 'post', {
          visible: true,
          disabled: false,
        })
        for (const key of ['create-return', 'create-adjustment'])
          await assertDesktopActionState(page, assert, key, { visible: false })
        await selectBusinessRow(page, 'PR-STYLE-L1-CANCELLED')
        for (const key of [
          'create-return',
          'create-adjustment',
          'create-payable',
          'post',
          'cancel',
        ])
          await assertDesktopActionState(page, assert, key, { visible: false })
        await gotoScenarioPath(page, QUALITY_INSPECTION_PATH)
        await waitForBusinessPage(page, '质量检验')
        await assertUnselectedActions(page, assert)
        for (const status of ['DRAFT', 'SUBMITTED', 'CANCELLED']) {
          await selectBusinessRow(page, 'QI-ACTION-' + status)
          await assertDesktopActionState(page, assert, 'submit', {
            visible: status === 'DRAFT',
            disabled: false,
          })
          for (const key of ['pass', 'reject'])
            await assertDesktopActionState(page, assert, key, {
              visible: status !== 'CANCELLED',
              disabled: status !== 'SUBMITTED',
            })
          await assertDesktopActionState(page, assert, 'quality-disposition', {
            visible: status !== 'CANCELLED',
            disabled: true,
          })
          await assertDesktopActionState(page, assert, 'cancel', {
            visible: status !== 'CANCELLED',
            disabled: false,
          })
          await assertNoHorizontalOverflow(page, '质检 ' + status)
        }
        await selectBusinessRow(page, 'QI-ACTION-PRODUCTION-WIP')
        await assertDesktopActionState(page, assert, 'related-records', {
          visible: false,
        })
        await gotoScenarioPath(page, SHIPMENT_PATH)
        await waitForBusinessPage(page, '出货单')
        await assertUnselectedActions(page, assert)
        await selectBusinessRow(page, 'SHIP-ACTION-CANCELLED')
        for (const key of [
          'shipment-edit',
          'shipment-quality',
          'shipment-release',
          'shipment-ship',
          'shipment-cancel',
          'shipment-receivable',
          'shipment-invoice',
        ])
          await assertDesktopActionState(page, assert, key, { visible: false })
        await assertNoHorizontalOverflow(page, '取消出货')
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-representative-pages-desktop.png'
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
        await page.route('**/rpc/customer_config', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON() || {}
          if (method !== 'get_finance_payment_approval_process') {
            await route.fallback()
            return
          }
          await fulfillRpc(route, id, {
            source_readback: createFinancePaymentRows().find(
              (row) => row.id === Number(params.finance_payment_id)
            ),
            process_context: null,
          })
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '收付款与核销')
        await assertUnselectedActions(page, assert)
        const states = {
          DRAFT: {
            allocation: true,
            approval: false,
            cancel: false,
            reverse: true,
          },
          APPROVED: { allocation: false, cancel: false, reverse: true },
          POSTED: { reverse: false },
          REVERSED: {},
          CANCELLED: {},
        }
        for (const [status, actions] of Object.entries(states)) {
          await selectBusinessRow(page, 'PAY-ACTION-' + status)
          for (const action of [
            'allocation',
            'approval',
            'cancel',
            'reverse',
          ]) {
            await assertDesktopActionState(page, assert, 'payment-' + action, {
              visible: Object.hasOwn(actions, action),
              disabled: actions[action],
            })
          }
          await assertDesktopActionState(page, assert, 'payment-details', {
            visible: true,
            disabled: false,
          })
          await assertNoHorizontalOverflow(page, '收付款 ' + status)
        }
        await selectBusinessRow(page, 'PAY-ACTION-DRAFT')
        if ((await page.locator('[data-business-action-key="payment-cancel"]').count()) === 0) {
          await openActionMenu(page)
        }
        await page.locator('[data-business-action-key="payment-cancel"]').click()
        const cancelDialog = page.getByRole('dialog').filter({ hasText: '取消收付款' }).last()
        await assertBusinessModalViewport(page, cancelDialog, { label: 'finance-cancel-compact', maxWidth: 480 })
        await page.screenshot({ path: path.join(outputDir, 'finance-cancel-compact.png'), fullPage: true })
        const reason = cancelDialog.getByRole('textbox')
        await reason.fill('模拟取消原因'.repeat(30))
        assert.ok((await reason.boundingBox()).width > 350, '简短确认中的原因应占满可用正文宽度')
        await page.setViewportSize({ width: 390, height: 600 })
        await assertBusinessModalViewport(page, cancelDialog, { label: 'finance-cancel-narrow', maxWidth: 480 })
        await page.screenshot({ path: path.join(outputDir, 'finance-cancel-narrow.png'), fullPage: true })
        await cancelDialog.getByRole('button', { name: /^返\s*回$/u }).click()
        await cancelDialog.waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.locator('[data-business-action-key="clear-selection"]').click()
        await assertUnselectedActions(page, assert)
        await screenshot(page, path, outputDir, 'business-action-stability-finance-none-desktop.png')
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
      name: 'business-action-stability-warehouse-shipments-desktop',
      path: SHIPMENT_PATH,
      auth: 'admin',
      ...warehouseIdentity,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installActionStabilityRpcRows(page, {
          includeSales: false,
          includeShipments: true,
        })
      },
      verify: async (page) => {
        await waitForBusinessPage(page, '出货单')
        await assertUnselectedActions(page, assert)
        for (const [suffix, visible, disabled] of [
          ['DRAFT', true, true],
          ['DRAFT-APPROVED', true, false],
          ['DRAFT-REJECTED', false],
          ['SHIPPED', false],
          ['CANCELLED', false],
        ]) {
          await selectBusinessRow(page, 'SHIP-ACTION-' + suffix)
          await assertDesktopActionState(page, assert, 'shipment-ship', {
            visible,
            disabled,
          })
          await assertDesktopActionState(page, assert, 'shipment-cancel', {
            visible: suffix !== 'CANCELLED',
            disabled: false,
          })
          for (const key of [
            'shipment-release',
            'shipment-receivable',
            'shipment-invoice',
            'shipment-quality',
          ]) {
            await assertDesktopActionState(page, assert, key, {
              visible: false,
            })
          }
          await assertNoHorizontalOverflow(page, '仓库出货 ' + suffix)
        }
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-warehouse-shipments-desktop.png'
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
        await assertUnselectedActions(page, assert)
        const cases = {
          'SUBMITTED-SCRAP': {
            approval: false,
            withdraw: false,
            execute: true,
            reverse: true,
          },
          'APPROVED-SCRAP': { execute: false, reverse: true },
          'APPLIED-SCRAP': { reverse: false },
          'APPROVED-OVER-ISSUE': { 'revoke-quota': false },
          'CANCELLED-SCRAP': {},
        }
        for (const [suffix, actions] of Object.entries(cases)) {
          await selectBusinessRow(page, 'PEX-ACTION-' + suffix)
          for (const action of [
            'approval',
            'withdraw',
            'execute',
            'reverse',
            'revoke-quota',
            'decide',
          ]) {
            await assertDesktopActionState(
              page,
              assert,
              'production-exception-' + action,
              {
                visible: Object.hasOwn(actions, action),
                disabled: actions[action],
              }
            )
          }
          await assertNoHorizontalOverflow(page, '生产异常 ' + suffix)
        }
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-production-exceptions-desktop.png'
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
        await assertUnselectedActions(page, assert)
        await selectBusinessRow(page, 'SO-ACTION-DRAFT')
        assert.deepEqual((await captureMobileActionLayout(page)).visible, [
          'lifecycle-primary',
        ])
        await openActionMenu(page)
        const draftKeys = await captureActionMenuKeys(page)
        assert(draftKeys.includes('edit'))
        assert(draftKeys.includes('reserve-stock'))
        assert(draftKeys.includes('lifecycle-cancel'))
        assert.equal(
          await page.getByRole('button', { name: /其他状态操作/u }).count(),
          0
        )
        const reserve = page.locator(
          '.erp-business-selection-action-menu [data-business-action-key="reserve-stock"]'
        )
        assert.equal(await reserve.isDisabled(), true)
        await reserve.evaluate((button) => button.parentElement.focus())
        await page
          .getByRole('tooltip')
          .filter({ hasText: '销售订单生效后可预留库存' })
          .waitFor({ state: 'visible' })
        await closeActionMenu(page)
        await selectBusinessRow(page, 'SO-ACTION-ACTIVE')
        assert.deepEqual((await captureMobileActionLayout(page)).visible, [
          'lifecycle-primary',
        ])
        await assertDesktopActionState(page, assert, 'edit', { visible: false })
        await assertDesktopActionState(page, assert, 'reserve-stock', {
          visible: true,
          disabled: false,
        })
        await selectBusinessRow(page, 'SO-ACTION-CLOSED')
        for (const key of [
          'edit',
          'reserve-stock',
          'lifecycle-primary',
          'lifecycle-normal_close',
          'lifecycle-short_close',
          'lifecycle-cancel',
        ])
          await assertDesktopActionState(page, assert, key, { visible: false })
        await assertDesktopActionState(page, assert, 'view-details', {
          visible: true,
          disabled: false,
        })
        await assertNoHorizontalOverflow(page, '终态销售订单手机暗色')
        await screenshot(
          page,
          path,
          outputDir,
          'business-action-stability-sales-mobile-dark.png'
        )
      },
    },
  ]
}
