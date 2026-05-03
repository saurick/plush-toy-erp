import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS,
  BUSINESS_CHAIN_DEBUG_MUTATION_GUARD,
  BUSINESS_CHAIN_DEBUG_OUT_OF_SCOPE_LINKS,
  BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS,
  buildBusinessChainDebugView,
  getBusinessChainDebugActionDisabledReason,
  moduleMatchesBusinessChainDebugQuery,
  normalizeBusinessChainDebugCapabilities,
} from './businessChainDebug.mjs'

const pageSource = readFileSync(
  new URL('../pages/BusinessChainDebugPage.jsx', import.meta.url),
  'utf8'
)

const modules = [
  {
    key: 'project-orders',
    title: '订单/款式立项',
    sectionKey: 'sales',
    sectionTitle: '销售链路',
    path: '/erp/sales/project-orders',
  },
  {
    key: 'production-exceptions',
    title: '生产异常/返工',
    sectionKey: 'production',
    sectionTitle: '生产环节',
    path: '/erp/production/exceptions',
  },
]

test('businessChainDebug: 预设场景覆盖当前 6 条业务闭环', () => {
  assert.deepEqual(
    BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS.map((scenario) => scenario.key),
    [
      'order_approval_engineering',
      'purchase_iqc_inbound',
      'outsource_return_inbound',
      'finished_goods_shipment',
      'shipment_receivable_invoice',
      'payable_reconciliation',
    ]
  )
  assert.deepEqual(
    BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS.find(
      (scenario) => scenario.key === 'order_approval_engineering'
    )?.queryKeywords,
    ['debug_order_approval_engineering']
  )
  assert(
    BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS.every(
      (scenario) =>
        scenario.status === '已接入 v1' &&
        scenario.chain &&
        scenario.expectation &&
        scenario.queryKeywords.length === 1 &&
        scenario.queryKeywords[0].startsWith('debug_')
    )
  )
})

test('businessChainDebug: deferred 和 out_of_scope 链路边界完整', () => {
  const deferredKeys = new Set(
    BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS.map((item) => item.key)
  )
  for (const key of [
    'engineering_bom_material_requirement',
    'order_change_management',
    'production_scheduling_assignment',
    'warehouse_issue_material',
    'inventory_check_adjustment',
    'rework_resubmit_qc',
    'shipment_return_after_sales',
    'receipt_payment_tracking',
    'invoice_exception',
    'cost_margin_analysis',
    'supplier_vendor_score',
    'permission_change_audit',
    'notification_center_full',
  ]) {
    assert(deferredKeys.has(key), `${key} must stay visible as deferred`)
  }
  assert(
    BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS.every((item) =>
      ['deferred', 'partial'].includes(item.status)
    )
  )

  const outOfScopeTitles = BUSINESS_CHAIN_DEBUG_OUT_OF_SCOPE_LINKS.map(
    (item) => item.title
  ).join('\n')
  assert(outOfScopeTitles.includes('固定资产 / 低值易耗品'))
  assert(outOfScopeTitles.includes('总账 / 凭证 / 纳税申报'))
  assert(outOfScopeTitles.includes('PDA / 条码枪 / 图片识别'))
  assert(outOfScopeTitles.includes('任意 SQL 控制台'))
})

test('businessChainDebug: 写入类调试操作默认受保护', () => {
  assert.equal(BUSINESS_CHAIN_DEBUG_MUTATION_GUARD.enabled, false)
  assert.equal(
    BUSINESS_CHAIN_DEBUG_MUTATION_GUARD.rebuildMethod,
    'debug.rebuild_business_chain_scenario'
  )
  assert.equal(
    BUSINESS_CHAIN_DEBUG_MUTATION_GUARD.cleanupMethod,
    'debug.clear_business_chain_scenario'
  )
  assert.equal(
    BUSINESS_CHAIN_DEBUG_MUTATION_GUARD.clearBusinessDataMethod,
    'debug.clear_business_data'
  )
})

test('businessChainDebug: 禁用状态会保留后端禁用原因给页面展示', () => {
  const capabilities = normalizeBusinessChainDebugCapabilities({
    environment: 'sql',
    seedEnabled: false,
    seedAllowed: false,
    seedDisabledReason: '后端未开启生成调试数据开关 ERP_DEBUG_SEED_ENABLED',
    cleanupEnabled: false,
    cleanupAllowed: false,
    cleanupDisabledReason:
      '后端未开启清理调试数据开关 ERP_DEBUG_CLEANUP_ENABLED',
    businessDataClearEnabled: false,
    businessDataClearAllowed: false,
    businessDataClearDisabledReason:
      '后端未开启业务数据清空开关 ERP_DEBUG_CLEANUP_ENABLED',
  })

  assert.equal(capabilities.environment, 'sql')
  assert.equal(
    getBusinessChainDebugActionDisabledReason(capabilities, 'seed'),
    '后端未开启生成调试数据开关 ERP_DEBUG_SEED_ENABLED'
  )
  assert.equal(
    getBusinessChainDebugActionDisabledReason(capabilities, 'cleanup'),
    '后端未开启清理调试数据开关 ERP_DEBUG_CLEANUP_ENABLED'
  )
  assert.equal(
    getBusinessChainDebugActionDisabledReason(
      capabilities,
      'businessDataClear'
    ),
    '后端未开启业务数据清空开关 ERP_DEBUG_CLEANUP_ENABLED'
  )
  assert(pageSource.includes('seedDisabledReason'))
  assert(pageSource.includes('cleanupDisabledReason'))
  assert(pageSource.includes('businessDataClearDisabledReason'))
})

test('businessChainDebug: 业务数据清空入口只走 debug 域受控 API', () => {
  assert.equal(pageSource.includes('createBusinessRecord'), false)
  assert.equal(pageSource.includes('updateBusinessRecord'), false)
  assert.equal(pageSource.includes('deleteBusinessRecords'), false)
  assert.equal(pageSource.includes('upsertWorkflowBusinessState'), false)
  assert.equal(pageSource.includes('createWorkflowTask'), false)
  assert.equal(pageSource.includes('debugRpc.call'), false)
  assert.equal(pageSource.includes('clearBusinessChainDebugBusinessData'), true)
  assert.equal(pageSource.includes('清空业务数据'), true)
})

test('businessChainDebug: 模块 key 和标题都可以命中模块查询', () => {
  assert.equal(
    moduleMatchesBusinessChainDebugQuery(modules[0], 'project-orders'),
    true
  )
  assert.equal(
    moduleMatchesBusinessChainDebugQuery(modules[1], '生产异常'),
    true
  )
})

test('businessChainDebug: 按单据号聚合业务记录和关联任务', () => {
  const view = buildBusinessChainDebugView({
    query: 'STYLE-L1-001',
    modules,
    records: [
      {
        id: 21,
        module_key: 'project-orders',
        document_no: 'STYLE-L1-001',
        title: '毛绒熊立项',
        source_no: '',
        customer_name: '联调客户',
        quantity: 2,
        amount: 39.8,
        business_status_key: 'blocked',
        owner_role_key: 'sales',
        payload: { status_reason: '资料未齐，等待客户确认' },
        items: [{ item_name: '浅棕色毛绒熊' }],
        updated_at: 1777046400,
      },
    ],
    businessStates: [
      {
        id: 3,
        source_type: 'project-orders',
        source_id: 21,
        source_no: 'STYLE-L1-001',
        business_status_key: 'blocked',
        owner_role_key: 'sales',
        blocked_reason: '资料未齐，等待客户确认',
        payload: {},
      },
    ],
    tasks: [
      {
        id: 9,
        task_code: 'project-orders-21',
        task_name: '订单/款式立项：毛绒熊立项',
        task_group: 'order_approval',
        source_type: 'project-orders',
        source_id: 21,
        source_no: 'STYLE-L1-001',
        business_status_key: 'blocked',
        task_status_key: 'blocked',
        owner_role_key: 'sales',
        priority: 2,
        due_at: 1777132800,
        blocked_reason: '资料未齐，等待客户确认',
      },
    ],
    taskEvents: [
      {
        id: 17,
        task_id: 9,
        event_type: 'status_changed',
        from_status_key: 'pending',
        to_status_key: 'blocked',
        actor_role_key: 'sales',
        reason: '资料未齐，等待客户确认',
        created_at: 1777046500,
      },
    ],
  })

  assert.equal(view.summary.recordCount, 1)
  assert.equal(view.summary.stateCount, 1)
  assert.equal(view.summary.taskCount, 1)
  assert.equal(view.summary.eventCount, 1)
  assert.equal(view.summary.activeTaskCount, 1)
  assert.equal(view.summary.blockedCount, 2)
  assert.equal(view.summary.quantity, 2)
  assert.equal(view.summary.amount, 39.8)
  assert.equal(view.records[0].module_title, '订单/款式立项')
  assert.equal(view.records[0].task_count, 1)
  assert.equal(view.records[0].blocked_reason, '资料未齐，等待客户确认')
  assert.equal(view.tasks[0].module_title, '订单/款式立项')
  assert.equal(view.tasks[0].task_group, 'order_approval')
  assert.equal(view.tasks[0].priority, 2)
  assert.equal(view.businessStates[0].source_no, 'STYLE-L1-001')
  assert.equal(view.taskEvents[0].task_id, 9)
  assert.equal(view.taskEvents[0].to_status_key, 'blocked')
})

test('businessChainDebug: 任务名称命中时会带出关联业务记录', () => {
  const view = buildBusinessChainDebugView({
    query: '返工确认',
    modules,
    records: [
      {
        id: 31,
        module_key: 'production-exceptions',
        document_no: 'PX-001',
        title: '车缝返工',
        business_status_key: 'production_processing',
        owner_role_key: 'production',
        payload: {},
        items: [],
      },
    ],
    tasks: [
      {
        id: 10,
        task_code: 'PX-001-TASK',
        task_name: '返工确认',
        source_type: 'production-exceptions',
        source_id: 31,
        task_status_key: 'processing',
        owner_role_key: 'quality',
        payload: {},
      },
    ],
  })

  assert.equal(view.records.length, 1)
  assert.equal(view.records[0].document_no, 'PX-001')
  assert.equal(view.tasks.length, 1)
  assert.equal(view.tasks[0].task_name, '返工确认')
})
