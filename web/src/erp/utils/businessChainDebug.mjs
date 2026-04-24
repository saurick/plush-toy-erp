export const BUSINESS_CHAIN_DEBUG_PATH = '/erp/qa/business-chain-debug'
export const BUSINESS_CHAIN_DEBUG_DOC_PATH = '/erp/docs/business-chain-debug'

const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'cancelled', 'closed'])

const BUSINESS_CHAIN_DEBUG_PRESET_SCENARIO_DEFINITIONS = [
  {
    key: 'project-orders',
    title: '立项到资料准备',
    chain: '客户/款式立项 -> 材料 BOM -> 辅材/包材采购',
    expectation:
      '能用订单编号、客户或款式查到立项记录，并继续追到同来源单号的 BOM、采购记录和协同任务。',
  },
  {
    key: 'processing-contracts',
    title: '委外加工跟进',
    chain: '客户/款式立项 -> 加工合同/委外下单 -> 入库/检验',
    expectation:
      '加工合同保留加工厂、委外数量、加工金额和交付日期，关联任务能看到处理、阻塞或完成状态。',
  },
  {
    key: 'production-exceptions',
    title: '生产异常闭环',
    chain: '生产排单 -> 生产进度 -> 生产异常/返工',
    expectation:
      '状态流转到业务阻塞时必须能看到阻塞原因，未终止协同任务也同步到阻塞或后续处理状态。',
  },
  {
    key: 'inventory',
    title: '仓库收发追溯',
    chain: '入库通知/检验 -> 库存 -> 待出货 -> 出库记录',
    expectation:
      '仓库链路能按物料、成品、来源单号或仓位追到数量、位置、业务状态和仓库任务。',
  },
  {
    key: 'reconciliation',
    title: '对账付款跟进',
    chain: '加工合同/采购 -> 对账/结算 -> 待付款/应付提醒',
    expectation:
      '财务链路能看到供应商或加工厂、金额、对账状态、待付款任务和异常说明。',
  },
]

export const BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS =
  BUSINESS_CHAIN_DEBUG_PRESET_SCENARIO_DEFINITIONS.map((scenario) => {
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
    summary: createEmptySummary(),
  }
}

export function buildBusinessChainDebugView({
  query = '',
  records = [],
  tasks = [],
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

  return {
    query: normalizedQuery,
    hasQuery: true,
    records: recordRows,
    tasks: taskRows,
    summary: summarizeDebugRows(recordRows, taskRows),
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
    source_type: toText(task.source_type),
    source_id: Number(task.source_id || 0),
    source_no: toText(task.source_no),
    module_title: moduleItem?.title || toText(task.source_type),
    module_path: moduleItem?.path || '',
    business_status_key: toText(task.business_status_key),
    task_status_key: toText(task.task_status_key),
    owner_role_key: toText(task.owner_role_key),
    blocked_reason: toText(task.blocked_reason),
    updated_at: Number(task.updated_at || 0),
  }
}

function summarizeDebugRows(records, tasks) {
  return {
    recordCount: records.length,
    stateCount: records.filter((record) => record.has_state_snapshot).length,
    taskCount: tasks.length,
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
