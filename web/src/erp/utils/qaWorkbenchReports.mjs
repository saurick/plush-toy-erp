import { printTemplateCatalog } from '../config/printTemplates.mjs'
import { FIELD_LINKAGE_REPORT_PATH } from '../qa/fieldLinkageCatalog.mjs'

export const QA_WORKBENCH_PATHS = Object.freeze({
  acceptanceOverview: '/erp/qa/acceptance-overview',
  businessChainDebug: '/erp/qa/business-chain-debug',
  fieldLinkageCoverage: '/erp/qa/field-linkage-coverage',
  runRecords: '/erp/qa/run-records',
  reports: '/erp/qa/reports',
})

export const QA_RUNNER_COMMANDS = Object.freeze({
  fieldLinkage: 'root: node scripts/qa/erp-field-linkage.mjs',
  frontendBase: 'web: pnpm lint && pnpm css && pnpm test',
  styleL1: 'web: pnpm style:l1',
  purchaseContractRealLogin: 'web: pnpm smoke:purchase-contract-real-login',
  processingContractRealLogin: 'web: pnpm smoke:processing-contract-real-login',
  qaFast: 'root: bash scripts/qa/fast.sh',
})

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
