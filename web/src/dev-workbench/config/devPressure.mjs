import { PRESSURE_DATA_SCALES } from './devPressureData.mjs'
import { DEV_PRESSURE_REPORTS_API_PATH } from './devTestingOperation.mjs'

export const DEV_PRESSURE_PHASES = Object.freeze({
  build: '构建候选',
  containers: '隔离环境',
  migration: '迁移核验',
  backend: '服务就绪',
  seed: '岗位初始化',
  'read-dataset-config': '查询造数',
  'read-pressure': '查询基线',
  'engineering-data': '业务造数',
  'engineering-pressure': '业务负载与对账',
  cleanup: '资源清理',
})
export const DEV_PRESSURE_LEVELS = Object.freeze({
  ramp: '升压',
  capacity: '主段',
  recovery: '恢复',
})
export const DEV_PRESSURE_STATUS = Object.freeze({
  passed: { label: '该次通过', color: 'green' },
  failed: { label: '该次未通过', color: 'red' },
  incomplete: { label: '证据不完整', color: 'orange' },
})
export const DEV_PRESSURE_FRESHNESS = Object.freeze({
  matched: { label: '压测范围源码一致', color: 'blue' },
  changed: { label: '历史候选 · 源码已变化', color: 'orange' },
  unknown: { label: '历史候选 · 身份证据不足', color: 'default' },
})
export const DEV_PRESSURE_FINGERPRINTS = Object.freeze({
  commit: '提交版本',
  build: '后端构建',
  data: '业务数据合同',
  verification: '业务断言',
  load: '负载模型',
  lifecycle: '隔离生命周期',
})
export const DEV_PRESSURE_CHECKS = Object.freeze({
  competition: '同单竞争',
  staleVersionRejected: '过期版本被拒绝',
  unauthorizedRejected: '越权被拒绝',
  singleSupplierResult: '每供应商仅一份采购结果',
  replyReplay: '丢失回复后重放一致',
  databaseConsistency: '本轮数据库权威对账',
  backgroundUnchanged: '历史背景内容未变化',
  recovery: '降载恢复',
  cleanup: '隔离资源清理',
})
export const DEV_PRESSURE_LEDGER = Object.freeze({
  approvedRequests: '审批通过的用料需求',
  purchaseOrders: '来源采购单',
  purchaseItems: '来源采购明细',
  duplicateSupplierResults: '重复供应商结果',
  partialSupplierResults: '部分采购结果',
  invalidPurchaseLines: '非法采购明细',
  inventoryTxns: '库存事务',
  postedReceipts: '已过账收货',
  productionFacts: '生产草稿',
  financeFacts: '财务草稿',
})

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u
export function isDevPressureReportID(value) {
  return typeof value === 'string' && ID.test(value)
}
const HASH = /^[0-9a-f]{64}$/u
const isNumber = (value) =>
  value === null || (Number.isFinite(value) && value >= 0)
const isDate = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
function invalid() {
  throw new Error('压力测试报告暂时无法读取，请重新读取或检查开发服务。')
}
function summary(value) {
  if (
    !ID.test(value?.id) ||
    !['quick', 'capacity'].includes(value.profile) ||
    !isDate(value.startedAt) ||
    !isDate(value.completedAt) ||
    !Object.hasOwn(DEV_PRESSURE_STATUS, value.status) ||
    !Object.hasOwn(DEV_PRESSURE_FRESHNESS, value.freshness)
  ) {
    invalid()
  }
  if (value.dataScale !== undefined && value.dataScale !== null && !Object.hasOwn(PRESSURE_DATA_SCALES, value.dataScale)) invalid()
  if (value.comparisonKey !== undefined && value.comparisonKey !== null && !HASH.test(value.comparisonKey)) invalid()
  if (value.main) {
    metrics(value.main.operations)
    if (!Array.isArray(value.main.methods) || value.main.methods.length > 40) invalid()
    value.main.methods.forEach((method) => { if (!/^[a-z_]+\.[a-z_]+$/u.test(method.name)) invalid(); metrics(method) })
  }
  return value
}
function metrics(value) {
  if (
    !value ||
    ![
      'requests',
      'successes',
      'failures',
      'successfulRps',
      'p95Ms',
      'p99Ms',
    ].every((key) => isNumber(value[key]))
  ) {
    invalid()
  }
}
export function normalizeDevPressureReports(value) {
  if (
    value?.kind !== 'plush.dev-pressure-reports' ||
    Object.keys(value).some((key) => !['kind', 'reports', 'report', 'progress', 'invalidCount'].includes(key)) ||
    !Array.isArray(value.reports) ||
    value.reports.length > 61 ||
    !Number.isSafeInteger(value.invalidCount) ||
    value.invalidCount < 0
  ) {
    invalid()
  }
  value.reports.forEach(summary)
  if (value.report !== null) {
    const report = summary(value.report)
    if (report.dataset) {
      const data = report.dataset
      if (!Object.hasOwn(PRESSURE_DATA_SCALES, data.dataScale) || !data.history || !data.working || !data.reads || !data.complexity || !data.storage ||
          ![data.history.states, data.reads.target, data.reads.actual, data.complexity.ordinary, data.complexity.complex].every((record) => record && Object.values(record).every(isNumber))) invalid()
    }
    if (
      !report.candidate ||
      !report.checks ||
      !report.database ||
      !report.runtime ||
      !report.environment ||
      !Array.isArray(report.steps) ||
      report.steps.length > 12 ||
      !['changed', 'unknown'].every(
        (key) =>
          Array.isArray(report[key]) &&
          report[key].every((name) =>
            Object.hasOwn(DEV_PRESSURE_FINGERPRINTS, name)
          )
      )
    ) {
      invalid()
    }
    for (const [key, fingerprint] of Object.entries(
      report.candidate.fingerprints || {}
    )) {
      if (
        !Object.hasOwn(DEV_PRESSURE_FINGERPRINTS, key) ||
        (fingerprint !== null && !HASH.test(fingerprint))
      ) {
        invalid()
      }
    }
    for (const detail of [report.engineering, report.reads]) {
      if (!detail) continue
      if (
        !Array.isArray(detail.levels) ||
        detail.levels.length > 3 ||
        typeof detail.passed !== 'boolean'
      ) {
        invalid()
      }
      for (const level of detail.levels) {
        if (
          !Object.hasOwn(DEV_PRESSURE_LEVELS, level.key) ||
          !isNumber(level.elapsedMs) ||
          !Array.isArray(level.methods) ||
          level.methods.length > 40 ||
          !level.limits
        ) {
          invalid()
        }
        metrics(level.operations)
        metrics(level.rpc)
        metrics(level.flows)
        level.methods.forEach((method) => {
          if (!/^[a-z_]+\.[a-z_]+$/u.test(method.name)) invalid()
          metrics(method)
        })
      }
    }
  }
  if (
    value.progress !== null &&
    (!Object.hasOwn(DEV_PRESSURE_PHASES, value.progress?.phase) ||
      !['running', 'completed', 'failed'].includes(value.progress.status) ||
      !isDate(value.progress.updatedAt) ||
      !Array.isArray(value.progress.completedSteps) ||
      !value.progress.completedSteps.every((key) =>
        Object.hasOwn(DEV_PRESSURE_PHASES, key)
      ))
  ) {
    invalid()
  }
  return value
}

export async function readDevPressureReports({
  id = '',
  signal,
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  if (id && !ID.test(id)) invalid()
  const response = await fetchImpl(
    `${DEV_PRESSURE_REPORTS_API_PATH}${id ? `?id=${encodeURIComponent(id)}` : ''}`,
    {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    }
  )
  if (!response.ok) invalid()
  return normalizeDevPressureReports(await response.json())
}
export function formatPressureNumber(value, digits = 0) {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: digits }).format(
        value
      )
    : '—'
}
export function pressureMainLevel(report, kind = 'engineering') {
  return (
    report?.[kind]?.levels?.find((level) => level.key === 'capacity') || null
  )
}

export function comparePressureScale(report, baseline) {
  if (!report?.dataset || !baseline?.dataScale || !report.comparisonKey || !baseline.comparisonKey) {
    return { reason: '缺少数据规模或环境身份，无法计算变化。' }
  }
  if (report.status !== 'passed' || baseline.status !== 'passed') {
    return { reason: '两次运行均须完整通过，再比较性能变化。' }
  }
  if (report.comparisonKey !== baseline.comparisonKey) {
    return { reason: '源码、负载或运行环境不同，不能归因于数据规模。' }
  }
  if (report.id === baseline.id || report.dataset.dataScale === baseline.dataScale) {
    return { reason: '请选择另一数据规模的报告。' }
  }
  const main = pressureMainLevel(report)
  const previous = baseline.main
  if (!main || !previous) return { reason: '缺少主段读数，无法计算变化。' }
  const delta = (value, reference) =>
    Number.isFinite(value) && Number.isFinite(reference) && reference > 0
      ? (value / reference - 1) * 100 : null
  return {
    reason: null,
    throughput: delta(main.operations.successfulRps, previous.operations.successfulRps),
    methods: main.methods.map((method) => {
      const other = previous.methods.find(({ name }) => name === method.name)
      return {
        name: method.name,
        beforeP95: other?.p95Ms ?? null,
        afterP95: method.p95Ms,
        beforeP99: other?.p99Ms ?? null,
        afterP99: method.p99Ms,
        p95: delta(method.p95Ms, other?.p95Ms),
        p99: delta(method.p99Ms, other?.p99Ms),
      }
    }),
  }
}
export function pressureScaleLabel(key) {
  return PRESSURE_DATA_SCALES[key]?.label || '规模未记录'
}
