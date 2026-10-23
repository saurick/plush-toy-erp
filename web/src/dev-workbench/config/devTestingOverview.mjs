import {
  buildDevTestingCoverageSectionSummaries,
  buildDevTestingViewSearch,
  parseDevTestingStrategyGuide,
} from './devTesting.mjs'
import {
  DEV_BUSINESS_CHAIN_AUDIT_ROUTE,
  DEV_INTEGRATION_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_TESTING_ROUTE,
} from './devRoutes.mjs'

const testing = (label, view, query = {}) => ({ label, view, query })
const commands = (keyword) => testing('查看专项命令', 'commands', { q: keyword, role: 'all', commandsPage: '' })
const report = (label, section) => testing(label, 'coverage', { coverage: section, reportSource: '', coverageDomain: '' })

// 文案与范围读取正式策略；这里只关联已有工作台入口，不注册新的执行动作。
export const DEV_TESTING_METHOD_ENTRIES = Object.freeze({
  '领域逻辑与 fuzz': {
    execute: [testing('选择逻辑检查', 'tiers'), commands('go test')],
    reports: [report('代码覆盖', 'code'), report('业务场景', 'business')],
  },
  接口与权限: {
    execute: [testing('岗位权限检查', 'tiers'), { label: '接口样例执行', to: `${DEV_INTEGRATION_ROUTE}?view=changes` }],
    reports: [report('门禁结果', 'gates')],
  },
  真实数据库: {
    execute: [commands('postgres')],
    reports: [report('关键规则', 'rules'), report('运行与验收', 'acceptance')],
  },
  浏览器与模拟接口: {
    execute: [commands('style:l1')],
    reports: [report('浏览器证据', 'acceptance')],
  },
  浏览器与真实后端: {
    execute: [commands('浏览器')],
    reports: [{ label: '链路实测报告', to: DEV_BUSINESS_CHAIN_AUDIT_ROUTE }, report('运行与验收', 'acceptance')],
  },
  '布局、打印与导出': {
    execute: [commands('打印')],
    reports: [report('业务场景', 'business'), report('浏览器证据', 'acceptance')],
  },
  '压力、故障与恢复': {
    execute: [testing('选择压力档位', 'pressure')],
    reports: [testing('压力报告', 'pressure'), report('关键规则', 'rules')],
  },
  安全与可访问性: {
    execute: [{ label: '选择质量门禁', to: DEV_QUALITY_GATES_ROUTE }, commands('style:l1')],
    reports: [report('门禁结果', 'gates')],
  },
  手机真机: {
    execute: [testing('查看真机场景', 'guide', { guide: 'devices' })],
    executionNote: '人工执行，未接入固定 runner',
    reportNote: '按设备和场景单独留证',
  },
  'Codex 探索': {
    execute: [testing('查看探索方式', 'guide', { guide: 'methods' })],
    executionNote: '按任务探索并记录操作',
    reportNote: '探索记录与脚本回归分别留存',
  },
})

export function buildDevTestingOverviewMethods(source) {
  return parseDevTestingStrategyGuide(source).methods.rows.map(([label, scope, entry, boundary]) => ({
    label,
scope,
entry,
boundary,
    ...DEV_TESTING_METHOD_ENTRIES[label],
  }))
}

export function buildDevTestingOverviewLink(item, search) {
  if (item.to) return item.to
  const params = buildDevTestingViewSearch(search, item.view)
  for (const [key, value] of Object.entries(item.query || {})) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  return `${DEV_TESTING_ROUTE}?${params}`
}

export function buildDevTestingOverviewReports(state) {
  return buildDevTestingCoverageSectionSummaries(state?.report).map((section) => ({
    ...section,
    // 历史读数不能在总览上变成当前源码的绿色结果。
    status: section.value === 'rules' || state?.status === 'current'
      ? section.status
      : state?.status || 'not_collected',
  }))
}
