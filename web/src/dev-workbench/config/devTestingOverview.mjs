import {
  buildDevTestingCoverageSectionSummaries,
} from './devTesting.mjs'

export function buildDevTestingOverviewReports(state) {
  return buildDevTestingCoverageSectionSummaries(state?.report).map((section) => ({
    ...section,
    // 历史读数不能在总览上变成当前源码的绿色结果。
    status: section.value === 'rules' || state?.status === 'current'
      ? section.status
      : state?.status || 'not_collected',
  }))
}
