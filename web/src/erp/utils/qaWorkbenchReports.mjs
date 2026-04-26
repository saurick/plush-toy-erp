import { printTemplateCatalog } from '../config/printTemplates.mjs'
import { FIELD_LINKAGE_REPORT_PATH } from '../qa/fieldLinkageCatalog.mjs'
import {
  BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS,
  BUSINESS_CHAIN_DEBUG_MAINLINE_SCENARIOS,
  BUSINESS_CHAIN_DEBUG_OUT_OF_SCOPE_LINKS,
} from './businessChainDebug.mjs'

export const QA_WORKBENCH_PATHS = Object.freeze({
  acceptanceOverview: '/erp/qa/acceptance-overview',
  businessChainDebug: '/erp/qa/business-chain-debug',
  workflowTaskDebug: '/erp/qa/workflow-task-debug',
  fieldLinkageCoverage: '/erp/qa/field-linkage-coverage',
  runRecords: '/erp/qa/run-records',
  reports: '/erp/qa/reports',
})

export const QA_RUNNER_COMMANDS = Object.freeze({
  fieldLinkage: 'root: node scripts/qa/erp-field-linkage.mjs',
  frontendLint: 'web: pnpm lint',
  frontendCss: 'web: pnpm css',
  frontendTest: 'web: pnpm test',
  frontendBase: 'web: pnpm lint && pnpm css && pnpm test',
  styleL1: 'web: pnpm style:l1',
  mobileAuthLoginRoute: 'web: pnpm smoke:mobile-auth-login-route',
  purchaseContractRealLogin: 'web: pnpm smoke:purchase-contract-real-login',
  processingContractRealLogin: 'web: pnpm smoke:processing-contract-real-login',
  serverGoTest: 'server: go test ./...',
  serverBuild: 'server: make build',
  gitDiffCheck: 'root: git diff --check',
  qaFast: 'root: bash scripts/qa/fast.sh',
})

export const BUSINESS_LOOP_COVERAGE_ROWS = Object.freeze(
  BUSINESS_CHAIN_DEBUG_MAINLINE_SCENARIOS.map((scenario) => ({
    key: scenario.key,
    chain: scenario.chain,
    status: scenario.status,
    carrier: scenario.carrier,
    validation: scenario.validation,
    blindSpot: scenario.blindSpot,
  }))
)

export const BUSINESS_CHAIN_COVERAGE_MATRIX_SUMMARY = Object.freeze([
  {
    key: 'mainline-v1',
    scope: 'v1 主干闭环',
    status: '已接入 v1',
    count: BUSINESS_CHAIN_DEBUG_MAINLINE_SCENARIOS.length,
    reportRule: '只代表 ERP v1 主干闭环，不代表全量业务覆盖。',
  },
  {
    key: 'deferred-extensions',
    scope: '扩展链路',
    status: 'deferred / partial',
    count: BUSINESS_CHAIN_DEBUG_DEFERRED_LINKS.length,
    reportRule: '必须继续显示为 deferred 或 partial，不能纳入已完成统计。',
  },
  {
    key: 'out-of-scope',
    scope: '当前不做',
    status: 'out_of_scope / future',
    count: BUSINESS_CHAIN_DEBUG_OUT_OF_SCOPE_LINKS.length,
    reportRule: '作为边界提醒，不进入本轮验收通过率。',
  },
])

export const QA_QUALITY_COMMAND_ROWS = Object.freeze([
  {
    key: 'pnpm-lint',
    command: 'cd web && pnpm lint',
    scope: '前端 ESLint 自动修复和基础语法',
    rule: '前端逻辑和页面改动必须执行',
  },
  {
    key: 'pnpm-css',
    command: 'cd web && pnpm css',
    scope: '样式规则检查',
    rule: '样式、页面或组件 class 改动必须执行',
  },
  {
    key: 'pnpm-test',
    command: 'cd web && pnpm test',
    scope: '前端单元测试、配置测试和文档注册守卫',
    rule: '前端逻辑、文档配置、权限配置改动必须执行',
  },
  {
    key: 'style-l1',
    command: 'cd web && pnpm style:l1',
    scope: '浏览器级页面、表单、菜单、打印和文档回归',
    rule: '页面、导航、布局、打印或帮助中心改动必须执行',
  },
  {
    key: 'mobile-auth',
    command: 'cd web && pnpm smoke:mobile-auth-login-route',
    scope: '8 个移动端角色登录路由和基础入口',
    rule: '移动端角色入口、权限或任务可见性改动必须执行',
  },
  {
    key: 'server-test',
    command: 'cd server && go test ./...',
    scope: 'Go 后端单元测试',
    rule: '改 Go 代码才必须执行；未改 Go 时最终说明跳过原因',
  },
  {
    key: 'server-build',
    command: 'cd server && make build',
    scope: 'Go 后端构建',
    rule: '改 Go 代码才必须执行；未改 Go 时最终说明跳过原因',
  },
  {
    key: 'diff-check',
    command: 'git diff --check',
    scope: '空白字符和补丁格式检查',
    rule: '每轮收口必须执行',
  },
])

export const KNOWN_QA_BLIND_SPOTS = Object.freeze([
  '当前后端 workflow usecase 只覆盖老板审批、IQC 和采购仓库入库三条最小规则，其他主干闭环仍主要依赖前端 v1 编排。',
  '当前 6 条链路只代表 ERP v1 主干闭环，不代表所有业务链路已经全量覆盖。',
  'BOM 材料需求、订单变更、排产分派、发料领料、库存盘点、售后退货、收付款、成本毛利等扩展链路仍是 deferred 或 partial。',
  '当前行业专表仍不完整，例如 production_order / shipment_order / ar_receivable / ar_invoice / ap_payable / ap_settlement / settlement 尚未落地。',
  '当前已有库存流水和库存余额真源，但 v1 调试 seed 和主干闭环仍不写真实库存事实。',
  '当前还没有财务专表、总账、凭证、纳税申报。',
  'v1 已有催办 / 升级事件留痕，仍没有 notification 独立表、收件箱、未读状态和外部推送。',
  '当前还没有完整业务 E2E 造数 runner。',
  '当前没有真实生产数据库上的人工 E2E 点按联调记录。',
  '当前很多结果依赖单元测试、style:l1、移动端 smoke 和 API 调用形态覆盖。',
])

export const QA_REPORT_OUTPUT_HINTS = Object.freeze({
  fieldLinkage: FIELD_LINKAGE_REPORT_PATH,
  print: '/qa/erp-print.latest.json',
})

const normalizeArtifactPath = (value) => String(value || '').replace(/\\/g, '/')

const pickFileName = (value) => {
  const normalized = normalizeArtifactPath(value)
  if (!normalized) return ''
  const segments = normalized.split('/')
  return segments[segments.length - 1] || ''
}

const loadJsonReport = async (reportPath, fetchImpl = globalThis.fetch) => {
  if (typeof fetchImpl !== 'function') {
    return null
  }

  try {
    const response = await fetchImpl(reportPath, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`load ${reportPath} failed`)
    }
    return await response.json()
  } catch (_error) {
    return null
  }
}

const normalizeSummaryPath = (report = null) =>
  report?.outputFile ||
  report?.sourceSummaryPath ||
  report?.report?.artifacts?.summaryPath ||
  ''

const buildSnapshotItem = (report = null, options = {}) => ({
  report: report?.report || null,
  status: String(report?.status || 'missing'),
  latestAt: report?.latestAt || report?.generatedAt || '',
  outputFile: pickFileName(normalizeSummaryPath(report)),
  isAvailable: Boolean(report?.report || report?.summary),
  ...options,
})

const normalizePrintTemplates = (printReport = null) => {
  if (
    Array.isArray(printReport?.templates) &&
    printReport.templates.length > 0
  ) {
    return printReport.templates
  }

  return printTemplateCatalog.map((template) => ({
    key: template.key,
    title: template.title,
    riskLevel: template.readiness,
    roleLabel: template.category,
    latestStatus: 'missing',
    latestCaseCount: 0,
    latestAt: '',
    cases: [],
    keyArtifacts: [],
    blindSpots: template.notes || [],
    failureSummary: '',
  }))
}

export const getQaReportStatusMeta = (status, missingColor = 'default') => {
  if (status === 'passed') {
    return { label: '通过', color: 'green' }
  }
  if (status === 'failed') {
    return { label: '失败', color: 'red' }
  }
  if (status === 'partial') {
    return { label: '部分覆盖', color: 'gold' }
  }
  if (status === 'missing') {
    return { label: '待生成', color: missingColor }
  }
  return { label: status || '待生成', color: missingColor }
}

export const getFieldLinkageStatusMeta = (summary = null) => {
  if (!summary) {
    return { color: 'default', label: '待生成' }
  }
  if (summary.failingFields > 0 || summary.failedCases > 0) {
    return { color: 'red', label: '存在失败' }
  }
  if (summary.missingFields > 0 || summary.missingCases > 0) {
    return { color: 'gold', label: '存在未覆盖' }
  }
  return { color: 'green', label: '已覆盖' }
}

export const loadQaWorkbenchReports = async (fetchImpl = globalThis.fetch) => {
  const [fieldLinkage, print] = await Promise.all([
    loadJsonReport(QA_REPORT_OUTPUT_HINTS.fieldLinkage, fetchImpl),
    loadJsonReport(QA_REPORT_OUTPUT_HINTS.print, fetchImpl),
  ])

  return { fieldLinkage, print }
}

export const getQaWorkbenchArtifactSnapshot = (reports = {}) => {
  const printTemplates = normalizePrintTemplates(reports.print)
  return {
    fieldLinkage: {
      reportPath: FIELD_LINKAGE_REPORT_PATH,
    },
    print: buildSnapshotItem(reports.print, {
      checkCount: Number(reports.print?.checkCount || 0),
      templateCount: Number(
        reports.print?.templateCount || printTemplates.length
      ),
      templateCaseCount: Number(reports.print?.templateCaseCount || 0),
      sharedCheckCount: Number(reports.print?.sharedCheckCount || 0),
      templates: printTemplates,
      failedTemplateCount: Number(reports.print?.failedTemplateCount || 0),
      partialTemplateCount: Number(reports.print?.partialTemplateCount || 0),
      missingTemplateCount: Number(
        reports.print?.missingTemplateCount ||
          printTemplates.filter((item) => item.latestStatus === 'missing')
            .length
      ),
      sharedChecks: Array.isArray(reports.print?.sharedChecks)
        ? reports.print.sharedChecks
        : [],
    }),
  }
}
