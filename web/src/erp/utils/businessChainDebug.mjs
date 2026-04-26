export const BUSINESS_CHAIN_DEBUG_PATH = '/erp/qa/business-chain-debug'
export const BUSINESS_CHAIN_DEBUG_DOC_PATH = '/erp/docs/business-chain-debug'

const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'cancelled', 'closed'])

export const BUSINESS_CHAIN_DEBUG_MAINLINE_SCENARIOS = Object.freeze([
  {
    key: 'order_approval_engineering',
    title: '订单提交 -> 老板审批 -> 工程资料任务',
    status: '已接入 v1',
    carrier: 'business_records + workflow_tasks',
    validation: '单元测试 + style:l1 + 移动端 smoke',
    blindSpot: '已接入后端最小派生规则，但没有真实 E2E 造数 runner',
    chain: '订单提交 -> 老板审批 -> 工程资料任务',
    queryKeywords: ['debug_order_approval_engineering'],
    expectation:
      '订单审批通过后应能查到工程资料任务、业务状态快照和相关协同任务。',
  },
  {
    key: 'purchase_iqc_inbound',
    title: '采购到货 -> IQC -> 入库',
    status: '已接入 v1',
    carrier: 'business_records + workflow_tasks',
    validation: '单元测试 + style:l1 + 移动端 smoke',
    blindSpot: '已有库存流水 / 库存余额专表，但当前 seed 仍不写真实库存事实',
    chain: '采购到货 -> IQC -> 入库',
    queryKeywords: ['debug_purchase_iqc_inbound'],
    expectation: '采购到货后应能查到 IQC、品质放行和仓库入库任务。',
  },
  {
    key: 'outsource_return_inbound',
    title: '委外发料 -> 回货 -> 检验 -> 入库',
    status: '已接入 v1',
    carrier: 'business_records + workflow_tasks',
    validation: '单元测试 + style:l1 + 移动端 smoke',
    blindSpot: '没有 outsource_order 专表，没有真实委外成本结算专表',
    chain: '委外发料 -> 回货 -> 检验 -> 入库',
    queryKeywords: ['debug_outsource_return_inbound'],
    expectation: '委外回货后应能查到回货检验、合格入库或不合格返工任务。',
  },
  {
    key: 'finished_goods_shipment',
    title: '成品完工 -> 成品抽检 -> 成品入库 -> 出货',
    status: '已接入 v1',
    carrier: 'business_records + workflow_tasks',
    validation: '单元测试 + style:l1 + 移动端 smoke',
    blindSpot:
      '没有 production_order / shipment_order 专表，当前 seed 不写真实库存流水',
    chain: '成品完工 -> 成品抽检 -> 成品入库 -> 出货',
    queryKeywords: ['debug_finished_goods_shipment'],
    expectation:
      '成品完工后应能查到成品抽检、成品入库、出货放行和出库相关任务。',
  },
  {
    key: 'shipment_receivable_invoice',
    title: '出货 -> 应收登记 -> 开票登记',
    status: '已接入 v1',
    carrier: 'business_records + workflow_tasks',
    validation: '单元测试 + style:l1 + 移动端 smoke',
    blindSpot: '没有 ar_receivable / ar_invoice 专表，没有总账、凭证、纳税申报',
    chain: '出货 -> 应收登记 -> 开票登记',
    queryKeywords: ['debug_shipment_receivable_invoice'],
    expectation: '出货后应能查到应收登记、开票登记和财务待处理任务。',
  },
  {
    key: 'payable_reconciliation',
    title: '采购/委外 -> 应付登记 -> 对账',
    status: '已接入 v1',
    carrier: 'business_records + workflow_tasks',
    validation: '单元测试 + style:l1 + 移动端 smoke',
    blindSpot: '没有 ap_payable / ap_settlement 专表，没有付款流水',
    chain: '采购/委外 -> 应付登记 -> 对账',
    queryKeywords: ['debug_payable_reconciliation'],
    expectation: '采购或委外入库后应能查到应付登记、对账和结算状态。',
  },
])

export const BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS =
  BUSINESS_CHAIN_DEBUG_MAINLINE_SCENARIOS.map((scenario) => {
    const key = toText(scenario.key)
    const queryKeywords = Array.isArray(scenario.queryKeywords)
      ? scenario.queryKeywords.map(toText).filter(Boolean)
      : []
    return {
      ...scenario,
      key,
      queryKeywords: queryKeywords.length > 0 ? queryKeywords : [key],
    }
  })

export const BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS = Object.freeze([
  {
    key: 'engineering_bom_material_requirement',
    title: '工程资料 -> BOM -> 材料需求 -> 采购需求',
    status: 'deferred',
    reason:
      '当前已有工程资料任务和 BOM 模块，但尚未形成从 BOM 自动生成材料需求和采购需求的闭环。',
    nextStep: '在拆 BOM / material_requirement 或稳定业务字段后补。',
  },
  {
    key: 'order_change_management',
    title: '订单变更 / 客户变更 / 交期变更',
    status: 'deferred',
    reason: '当前主链路覆盖订单审批，不覆盖变更审批和影响传播。',
    nextStep: '建立变更单、影响范围、重新触发任务规则。',
  },
  {
    key: 'production_scheduling_assignment',
    title: '生产排产 -> 分派 -> 生产进度',
    status: 'partial',
    reason:
      '当前已有 production-scheduling / production-progress 模块，但主闭环从成品完工后开始，不覆盖排产和分派前置链路。',
    nextStep: '补排产任务、产能资源、工序分派。',
  },
  {
    key: 'material_shortage_replenishment',
    title: '欠料预警 -> 采购补料',
    status: 'deferred',
    reason: '当前已有库存余额真源，但没有材料需求和缺料计算闭环。',
    nextStep: 'material_requirement 和缺料计算口径稳定后再做。',
  },
  {
    key: 'warehouse_issue_material',
    title: '仓库发料 / 委外发料 / 生产领料',
    status: 'deferred',
    reason: '当前覆盖入库和出货，不覆盖领料/发料流水。',
    nextStep: '发料 / 领料单据和库存出库口径稳定后补。',
  },
  {
    key: 'inventory_check_adjustment',
    title: '库存盘点 / 库存调整 / 异常件',
    status: 'deferred',
    reason: '当前已有库存流水和余额真源，但没有盘点单、调整单和异常件流程。',
    nextStep: 'adjustment_order 和异常件处理口径评审后补。',
  },
  {
    key: 'rework_resubmit_qc',
    title: '返工完成 -> 重新送检',
    status: 'partial',
    reason: '当前不合格会生成返工任务，但返工完成后自动重新送检规则还不完整。',
    nextStep: '补 rework_done -> qc_pending 的重提链路。',
  },
  {
    key: 'shipment_return_after_sales',
    title: '出货退回 / 客诉 / 售后',
    status: 'deferred',
    reason: '当前只覆盖正常出货，不覆盖退货和客诉。',
    nextStep: '售后/退货模块稳定后补。',
  },
  {
    key: 'receipt_payment_tracking',
    title: '收款登记 / 付款登记',
    status: 'deferred',
    reason: '当前覆盖应收、开票、应付、对账，不覆盖实际收付款流水。',
    nextStep: 'receipt / payment 专表或业务记录稳定后补。',
  },
  {
    key: 'invoice_exception',
    title: '发票异常 / 红冲 / 作废',
    status: 'deferred',
    reason: '当前只覆盖开票登记，不覆盖税务异常处理。',
    nextStep: '发票专表和状态机稳定后补。',
  },
  {
    key: 'cost_margin_analysis',
    title: '成本核算 / 毛利分析',
    status: 'deferred',
    reason: '当前没有完整库存成本、采购成本、委外成本和财务专表。',
    nextStep: '成本快照和专表评审后补。',
  },
  {
    key: 'supplier_vendor_score',
    title: '供应商 / 加工商绩效',
    status: 'deferred',
    reason: '当前任务流记录了延期、不良、对账，但没有绩效模型。',
    nextStep: '供应商评分指标稳定后补。',
  },
  {
    key: 'permission_change_audit',
    title: '权限审批 / 菜单权限变更审计',
    status: 'deferred',
    reason: '当前有权限配置和日志文档，但没有权限变更审批流。',
    nextStep: '审计日志和权限变更记录稳定后补。',
  },
  {
    key: 'notification_center_full',
    title: '完整通知中心 / 未读 / 外部推送',
    status: 'deferred',
    reason: '当前只有任务事件、预警和催办评审，尚未落 notifications 独立表。',
    nextStep: '评审 notification 表、recipient 表、read 状态和外部推送。',
  },
])

export const BUSINESS_CHAIN_DEBUG_OUT_OF_SCOPE_LINKS = Object.freeze([
  {
    key: 'fixed_assets_consumables',
    title: '固定资产 / 低值易耗品',
    status: 'out_of_scope',
  },
  {
    key: 'general_ledger_tax',
    title: '总账 / 凭证 / 纳税申报',
    status: 'out_of_scope',
  },
  {
    key: 'pda_barcode_vision',
    title: 'PDA / 条码枪 / 图片识别',
    status: 'out_of_scope',
  },
  {
    key: 'low_code_form_designer',
    title: '复杂低代码表单设计器',
    status: 'future',
  },
  {
    key: 'arbitrary_sql_console',
    title: '任意 SQL 控制台',
    status: 'out_of_scope',
  },
])

export const BUSINESS_CHAIN_DEBUG_MUTATION_GUARD = Object.freeze({
  enabled: false,
  reason: '需要后端 debug API、管理员权限和业务链路调试菜单权限',
  rebuildMethod: 'debug.rebuild_business_chain_scenario',
  cleanupMethod: 'debug.clear_business_chain_scenario',
  clearBusinessDataMethod: 'debug.clear_business_data',
})

export const BUSINESS_CHAIN_DEBUG_CAPABILITY_DEFAULT = Object.freeze({
  environment: 'unknown',
  seedEnabled: false,
  seedAllowed: false,
  seedDisabledReason: '尚未读取后端 debug 能力状态',
  cleanupEnabled: false,
  cleanupAllowed: false,
  cleanupDisabledReason: '尚未读取后端 debug 能力状态',
  businessDataClearEnabled: false,
  businessDataClearAllowed: false,
  businessDataClearDisabledReason: '尚未读取后端 debug 能力状态',
  cleanupScope: 'debug_run',
  cleanupOnlyDebugData: true,
  requiresDebugRunId: true,
  destructiveRemoteDenied: false,
  supportedScenarios: [],
})

export function normalizeBusinessChainDebugCapabilities(raw = {}) {
  const environment = toText(raw.environment) || 'unknown'
  const seedEnabled = Boolean(raw.seedEnabled)
  const seedAllowed = Boolean(raw.seedAllowed)
  const cleanupEnabled = Boolean(raw.cleanupEnabled)
  const cleanupAllowed = Boolean(raw.cleanupAllowed)
  const businessDataClearEnabled = Boolean(raw.businessDataClearEnabled)
  const businessDataClearAllowed = Boolean(raw.businessDataClearAllowed)
  return {
    environment,
    seedEnabled,
    seedAllowed,
    seedDisabledReason:
      toText(raw.seedDisabledReason) ||
      (seedAllowed
        ? ''
        : BUSINESS_CHAIN_DEBUG_CAPABILITY_DEFAULT.seedDisabledReason),
    cleanupEnabled,
    cleanupAllowed,
    cleanupDisabledReason:
      toText(raw.cleanupDisabledReason) ||
      (cleanupAllowed
        ? ''
        : BUSINESS_CHAIN_DEBUG_CAPABILITY_DEFAULT.cleanupDisabledReason),
    businessDataClearEnabled,
    businessDataClearAllowed,
    businessDataClearDisabledReason:
      toText(raw.businessDataClearDisabledReason) ||
      (businessDataClearAllowed
        ? ''
        : BUSINESS_CHAIN_DEBUG_CAPABILITY_DEFAULT.businessDataClearDisabledReason),
    cleanupScope:
      toText(raw.cleanupScope) ||
      BUSINESS_CHAIN_DEBUG_CAPABILITY_DEFAULT.cleanupScope,
    cleanupOnlyDebugData: raw.cleanupOnlyDebugData !== false,
    requiresDebugRunId: raw.requiresDebugRunId !== false,
    destructiveRemoteDenied: Boolean(raw.destructiveRemoteDenied),
    supportedScenarios: Array.isArray(raw.supportedScenarios)
      ? raw.supportedScenarios
      : [],
  }
}

export function getBusinessChainDebugActionDisabledReason(
  capabilities,
  action
) {
  const normalized = normalizeBusinessChainDebugCapabilities(capabilities)
  if (action === 'seed') {
    return normalized.seedAllowed ? '' : normalized.seedDisabledReason
  }
  if (action === 'cleanup') {
    return normalized.cleanupAllowed ? '' : normalized.cleanupDisabledReason
  }
  if (action === 'businessDataClear') {
    return normalized.businessDataClearAllowed
      ? ''
      : normalized.businessDataClearDisabledReason
  }
  return '未知调试操作'
}

export function normalizeBusinessChainDebugQuery(query = '') {
  return toText(query)
}

export function moduleMatchesBusinessChainDebugQuery(moduleItem, query = '') {
  const normalizedQuery = normalizeForSearch(query)
  if (!normalizedQuery) return false
  return matchesSearchTexts(buildModuleSearchTexts(moduleItem), normalizedQuery)
}

export function createEmptyBusinessChainDebugView(query = '') {
  const normalizedQuery = normalizeBusinessChainDebugQuery(query)
  return {
    query: normalizedQuery,
    hasQuery: Boolean(normalizedQuery),
    records: [],
    tasks: [],
    taskEvents: [],
    businessStates: [],
    summary: createEmptySummary(),
  }
}

export function buildBusinessChainDebugView({
  query = '',
  records = [],
  tasks = [],
  taskEvents = [],
  businessStates = [],
  modules = [],
} = {}) {
  const normalizedQuery = normalizeBusinessChainDebugQuery(query)
  const searchQuery = normalizeForSearch(normalizedQuery)
  if (!searchQuery) {
    return createEmptyBusinessChainDebugView(normalizedQuery)
  }

  const moduleMap = new Map(
    (Array.isArray(modules) ? modules : []).map((moduleItem) => [
      moduleItem.key,
      moduleItem,
    ])
  )
  const activeRecords = Array.isArray(records)
    ? records.filter((record) => !record?.deleted_at)
    : []
  const activeTasks = Array.isArray(tasks) ? tasks : []
  const activeTaskEvents = Array.isArray(taskEvents) ? taskEvents : []
  const activeBusinessStates = Array.isArray(businessStates)
    ? businessStates
    : []
  const tasksByRecordKey = groupTasksByRecordKey(activeTasks)
  const statesByRecordKey = groupStatesByRecordKey(activeBusinessStates)

  const matchedRecordKeys = new Set()
  const recordRows = activeRecords
    .filter((record) => {
      const moduleItem = moduleMap.get(record.module_key)
      const recordKey = buildRecordKey(record)
      const relatedTasks = tasksByRecordKey.get(recordKey) || []
      const relatedState = statesByRecordKey.get(recordKey) || null
      const recordMatched = matchesSearchTexts(
        buildRecordSearchTexts(record, moduleItem),
        searchQuery
      )
      const stateMatched =
        relatedState &&
        matchesSearchTexts(
          buildStateSearchTexts(relatedState, moduleItem),
          searchQuery
        )
      const relatedTaskMatched = relatedTasks.some((task) =>
        matchesSearchTexts(buildTaskSearchTexts(task, moduleItem), searchQuery)
      )
      if (recordMatched || stateMatched || relatedTaskMatched) {
        matchedRecordKeys.add(recordKey)
        return true
      }
      return false
    })
    .map((record) =>
      normalizeRecordRow(record, moduleMap.get(record.module_key), {
        relatedTasks: tasksByRecordKey.get(buildRecordKey(record)) || [],
        relatedState: statesByRecordKey.get(buildRecordKey(record)) || null,
      })
    )

  const taskRows = activeTasks
    .filter((task) => {
      const moduleItem = moduleMap.get(task.source_type)
      const taskMatched = matchesSearchTexts(
        buildTaskSearchTexts(task, moduleItem),
        searchQuery
      )
      return taskMatched || matchedRecordKeys.has(buildTaskRecordKey(task))
    })
    .map((task) => normalizeTaskRow(task, moduleMap.get(task.source_type)))

  const matchedTaskIds = new Set(
    taskRows.map((task) => task.id).filter(Boolean)
  )
  const stateRows = activeBusinessStates
    .filter((state) => {
      const moduleItem = moduleMap.get(state.source_type)
      const stateMatched = matchesSearchTexts(
        buildStateSearchTexts(state, moduleItem),
        searchQuery
      )
      return stateMatched || matchedRecordKeys.has(buildStateRecordKey(state))
    })
    .map((state) =>
      normalizeBusinessStateRow(state, moduleMap.get(state.source_type))
    )

  const taskEventRows = activeTaskEvents
    .filter((event) => {
      const taskId = Number(event?.task_id || 0)
      const eventMatched = matchesSearchTexts(
        buildTaskEventSearchTexts(event),
        searchQuery
      )
      return eventMatched || matchedTaskIds.has(taskId)
    })
    .map(normalizeTaskEventRow)

  return {
    query: normalizedQuery,
    hasQuery: true,
    records: recordRows,
    tasks: taskRows,
    taskEvents: taskEventRows,
    businessStates: stateRows,
    summary: summarizeDebugRows(recordRows, taskRows, stateRows, taskEventRows),
  }
}

export function formatBusinessDebugNumber(value, maxFractionDigits = 2) {
  const number = toNumber(value)
  if (number === undefined) return '-'
  return number.toLocaleString('zh-Hans-CN', {
    maximumFractionDigits: maxFractionDigits,
  })
}

export function formatBusinessDebugTime(value) {
  const unix = Number(value)
  if (!Number.isFinite(unix) || unix <= 0) return '-'
  return new Date(unix * 1000).toLocaleString('zh-Hans-CN', {
    hour12: false,
  })
}

function normalizeRecordRow(
  record,
  moduleItem,
  { relatedTasks = [], relatedState = null } = {}
) {
  const blockedReasons = uniqueTexts([
    record?.payload?.status_reason,
    record?.payload?.business_status_reason,
    relatedState?.blocked_reason,
    relatedState?.payload?.status_reason,
    ...relatedTasks.map((task) => task.blocked_reason),
  ])
  const activeTaskCount = relatedTasks.filter(
    (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
  ).length

  return {
    key: buildRecordKey(record),
    id: Number(record.id || 0),
    module_key: toText(record.module_key),
    module_title: moduleItem?.title || toText(record.module_key),
    module_path: moduleItem?.path || '',
    document_no: toText(record.document_no),
    title: toText(record.title),
    source_no: toText(record.source_no),
    customer_name: toText(record.customer_name),
    supplier_name: toText(record.supplier_name),
    product_name: toText(record.product_name),
    material_name: toText(record.material_name),
    warehouse_location: toText(record.warehouse_location),
    quantity: toNumber(record.quantity),
    amount: toNumber(record.amount),
    business_status_key: toText(
      relatedState?.business_status_key || record.business_status_key
    ),
    owner_role_key: toText(
      relatedState?.owner_role_key || record.owner_role_key
    ),
    items_count: Array.isArray(record.items) ? record.items.length : 0,
    has_state_snapshot: Boolean(relatedState),
    task_count: relatedTasks.length,
    active_task_count: activeTaskCount,
    blocked_reason: blockedReasons.join('；'),
    updated_at: Number(record.updated_at || 0),
  }
}

function normalizeTaskRow(task, moduleItem) {
  return {
    key: `task:${task.id || task.task_code}`,
    id: Number(task.id || 0),
    task_code: toText(task.task_code),
    task_name: toText(task.task_name),
    task_group: toText(task.task_group),
    source_type: toText(task.source_type),
    source_id: Number(task.source_id || 0),
    source_no: toText(task.source_no),
    module_title: moduleItem?.title || toText(task.source_type),
    module_path: moduleItem?.path || '',
    business_status_key: toText(task.business_status_key),
    task_status_key: toText(task.task_status_key),
    owner_role_key: toText(task.owner_role_key),
    due_at: Number(task.due_at || 0),
    priority: toNumber(task.priority) ?? 0,
    blocked_reason: toText(task.blocked_reason),
    updated_at: Number(task.updated_at || 0),
  }
}

function normalizeBusinessStateRow(state, moduleItem) {
  return {
    key: `state:${state.id || buildStateRecordKey(state)}`,
    id: Number(state.id || 0),
    source_type: toText(state.source_type),
    source_id: Number(state.source_id || 0),
    source_no: toText(state.source_no),
    module_title: moduleItem?.title || toText(state.source_type),
    module_path: moduleItem?.path || '',
    business_status_key: toText(state.business_status_key),
    owner_role_key: toText(state.owner_role_key),
    blocked_reason: toText(state.blocked_reason),
    updated_at: Number(state.updated_at || state.status_changed_at || 0),
  }
}

function normalizeTaskEventRow(event) {
  return {
    key: `task-event:${event.id || `${event.task_id}:${event.created_at}`}`,
    id: Number(event.id || 0),
    task_id: Number(event.task_id || 0),
    event_type: toText(event.event_type),
    from_status_key: toText(event.from_status_key),
    to_status_key: toText(event.to_status_key),
    reason: toText(event.reason),
    actor_role_key: toText(event.actor_role_key),
    created_at: Number(event.created_at || 0),
  }
}

function summarizeDebugRows(records, tasks, states, taskEvents) {
  return {
    recordCount: records.length,
    stateCount: states.length,
    taskCount: tasks.length,
    eventCount: taskEvents.length,
    activeTaskCount: tasks.filter(
      (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
    ).length,
    blockedCount:
      records.filter((record) => record.business_status_key === 'blocked')
        .length +
      tasks.filter((task) => task.task_status_key === 'blocked').length,
    quantity: sumNumbers(records.map((record) => record.quantity)),
    amount: sumNumbers(records.map((record) => record.amount)),
  }
}

function createEmptySummary() {
  return {
    recordCount: 0,
    stateCount: 0,
    taskCount: 0,
    eventCount: 0,
    activeTaskCount: 0,
    blockedCount: 0,
    quantity: 0,
    amount: 0,
  }
}

function buildRecordSearchTexts(record, moduleItem) {
  return [
    ...buildModuleSearchTexts(moduleItem),
    record?.module_key,
    record?.document_no,
    record?.title,
    record?.source_no,
    record?.customer_name,
    record?.supplier_name,
    record?.style_no,
    record?.product_no,
    record?.product_name,
    record?.material_name,
    record?.warehouse_location,
    record?.business_status_key,
    record?.owner_role_key,
    ...collectPayloadTexts(record?.payload),
    ...(Array.isArray(record?.items)
      ? record.items.flatMap((item) => [
          item?.item_name,
          item?.material_name,
          item?.spec,
          item?.supplier_name,
          item?.warehouse_location,
          ...collectPayloadTexts(item?.payload),
        ])
      : []),
  ]
}

function buildTaskSearchTexts(task, moduleItem) {
  return [
    ...buildModuleSearchTexts(moduleItem),
    task?.task_code,
    task?.task_group,
    task?.task_name,
    task?.source_type,
    task?.source_no,
    task?.business_status_key,
    task?.task_status_key,
    task?.owner_role_key,
    task?.blocked_reason,
    ...collectPayloadTexts(task?.payload),
  ]
}

function buildTaskEventSearchTexts(event) {
  return [
    event?.task_id,
    event?.event_type,
    event?.from_status_key,
    event?.to_status_key,
    event?.actor_role_key,
    event?.reason,
    ...collectPayloadTexts(event?.payload),
  ]
}

function buildStateSearchTexts(state, moduleItem) {
  return [
    ...buildModuleSearchTexts(moduleItem),
    state?.source_type,
    state?.source_no,
    state?.business_status_key,
    state?.owner_role_key,
    state?.blocked_reason,
    ...collectPayloadTexts(state?.payload),
  ]
}

function buildModuleSearchTexts(moduleItem) {
  if (!moduleItem) return []
  return [
    moduleItem.key,
    moduleItem.title,
    moduleItem.route,
    moduleItem.sectionKey,
    moduleItem.sectionTitle,
    moduleItem.owner,
  ]
}

function groupTasksByRecordKey(tasks) {
  const out = new Map()
  tasks.forEach((task) => {
    const key = buildTaskRecordKey(task)
    if (!key) return
    const items = out.get(key) || []
    items.push(task)
    out.set(key, items)
  })
  return out
}

function groupStatesByRecordKey(states) {
  const out = new Map()
  states.forEach((state) => {
    const key = buildStateRecordKey(state)
    if (!key) return
    out.set(key, state)
  })
  return out
}

function buildRecordKey(record) {
  if (!record?.module_key || !record?.id) return ''
  return `${record.module_key}:${record.id}`
}

function buildTaskRecordKey(task) {
  if (!task?.source_type || !task?.source_id) return ''
  return `${task.source_type}:${task.source_id}`
}

function buildStateRecordKey(state) {
  if (!state?.source_type || !state?.source_id) return ''
  return `${state.source_type}:${state.source_id}`
}

function matchesSearchTexts(texts, normalizedQuery) {
  const tokens = normalizedQuery.split(/\s+/u).filter(Boolean)
  if (tokens.length === 0) return false
  const normalizedTexts = texts.map(normalizeForSearch).filter(Boolean)
  return tokens.every((token) =>
    normalizedTexts.some((text) => text.includes(token))
  )
}

function collectPayloadTexts(payload, depth = 0) {
  if (!payload || depth > 2) return []
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => collectPayloadTexts(item, depth + 1))
  }
  if (typeof payload === 'object') {
    return Object.values(payload).flatMap((value) =>
      collectPayloadTexts(value, depth + 1)
    )
  }
  return [payload]
}

function uniqueTexts(values) {
  return [...new Set(values.map(toText).filter(Boolean))]
}

function sumNumbers(values) {
  return values.reduce((sum, value) => {
    const number = toNumber(value)
    return number === undefined ? sum : sum + number
  }, 0)
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toText(value) {
  return String(value ?? '').trim()
}

function normalizeForSearch(value) {
  return toText(value).toLowerCase()
}
