import assert from 'node:assert/strict'
import test from 'node:test'

import { printTemplateCatalog } from '../config/printTemplates.mjs'
import {
  BUSINESS_CHAIN_COVERAGE_MATRIX_SUMMARY,
  BUSINESS_LOOP_COVERAGE_ROWS,
  KNOWN_QA_BLIND_SPOTS,
  QA_REPORT_OUTPUT_HINTS,
  QA_QUALITY_COMMAND_ROWS,
  QA_WORKBENCH_PATHS,
  getFieldLinkageStatusMeta,
  getQaReportStatusMeta,
  getQaWorkbenchArtifactSnapshot,
  loadQaWorkbenchReports,
} from './qaWorkbenchReports.mjs'

test('qaWorkbenchReports: 读取字段联动 latest 并保留缺失专项边界', async () => {
  const fieldReport = {
    generatedAt: '2026-04-24T10:00:00+08:00',
    summary: {
      totalFields: 24,
      coveredFields: 24,
      missingFields: 0,
      failingFields: 0,
      totalScenarios: 30,
      passedScenarios: 30,
      failedCases: 0,
      missingCases: 0,
    },
  }
  const requested = []
  const reports = await loadQaWorkbenchReports(async (url) => {
    requested.push(String(url))
    if (String(url) === QA_REPORT_OUTPUT_HINTS.fieldLinkage) {
      return {
        ok: true,
        json: async () => fieldReport,
      }
    }
    return { ok: false, json: async () => ({}) }
  })

  assert.deepEqual(requested, [
    QA_REPORT_OUTPUT_HINTS.fieldLinkage,
    QA_REPORT_OUTPUT_HINTS.print,
  ])
  assert.equal(reports.fieldLinkage, fieldReport)
  assert.equal(reports.print, null)

  const snapshot = getQaWorkbenchArtifactSnapshot(reports)
  assert.equal(snapshot.print.status, 'missing')
  assert.equal(snapshot.print.templateCount, printTemplateCatalog.length)
  assert.equal(
    snapshot.print.templates.every((item) => item.latestStatus === 'missing'),
    true
  )
})

test('qaWorkbenchReports: 状态文案区分通过、失败、部分覆盖和待生成', () => {
  assert.deepEqual(getQaReportStatusMeta('passed'), {
    label: '通过',
    color: 'green',
  })
  assert.deepEqual(getQaReportStatusMeta('failed'), {
    label: '失败',
    color: 'red',
  })
  assert.deepEqual(getQaReportStatusMeta('partial'), {
    label: '部分覆盖',
    color: 'gold',
  })
  assert.deepEqual(getQaReportStatusMeta('missing', 'gold'), {
    label: '待生成',
    color: 'gold',
  })
})

test('qaWorkbenchReports: 字段联动状态不会把缺失报告伪装成通过', () => {
  assert.deepEqual(getFieldLinkageStatusMeta(null), {
    color: 'default',
    label: '待生成',
  })
  assert.deepEqual(
    getFieldLinkageStatusMeta({
      failingFields: 1,
      failedCases: 0,
      missingFields: 0,
      missingCases: 0,
    }),
    { color: 'red', label: '存在失败' }
  )
  assert.deepEqual(
    getFieldLinkageStatusMeta({
      failingFields: 0,
      failedCases: 0,
      missingFields: 1,
      missingCases: 0,
    }),
    { color: 'gold', label: '存在未覆盖' }
  )
  assert.deepEqual(
    getFieldLinkageStatusMeta({
      failingFields: 0,
      failedCases: 0,
      missingFields: 0,
      missingCases: 0,
    }),
    { color: 'green', label: '已覆盖' }
  )
})

test('qaWorkbenchReports: 当前闭环 质量命令和盲区口径完整', () => {
  assert.equal(
    QA_WORKBENCH_PATHS.workflowTaskDebug,
    '/erp/qa/workflow-task-debug'
  )
  assert.equal(BUSINESS_LOOP_COVERAGE_ROWS.length, 6)
  assert.deepEqual(
    BUSINESS_LOOP_COVERAGE_ROWS.map((item) => item.key),
    [
      'order_approval_engineering',
      'purchase_iqc_inbound',
      'outsource_return_inbound',
      'finished_goods_shipment',
      'shipment_receivable_invoice',
      'payable_reconciliation',
    ]
  )
  assert(
    BUSINESS_LOOP_COVERAGE_ROWS.some((item) =>
      item.chain.includes('出货 -> 应收登记 -> 开票登记')
    )
  )
  assert(
    BUSINESS_LOOP_COVERAGE_ROWS.some((item) =>
      item.chain.includes('采购/委外 -> 应付登记 -> 对账')
    )
  )
  assert.deepEqual(
    QA_QUALITY_COMMAND_ROWS.map((item) => item.command),
    [
      'cd web && pnpm lint',
      'cd web && pnpm css',
      'cd web && pnpm test',
      'cd web && pnpm style:l1',
      'cd web && pnpm smoke:mobile-auth-login-route',
      'cd server && go test ./...',
      'cd server && make build',
      'git diff --check',
    ]
  )
  assert(
    KNOWN_QA_BLIND_SPOTS.some((item) =>
      item.includes(
        '后端 workflow usecase 只覆盖老板审批、IQC 和采购仓库入库三条最小规则'
      )
    )
  )
  assert(
    KNOWN_QA_BLIND_SPOTS.some((item) => item.includes('完整业务 E2E 造数'))
  )
})

test('qaWorkbenchReports: 链路覆盖矩阵区分主干 deferred 和不做范围', () => {
  assert.deepEqual(
    BUSINESS_CHAIN_COVERAGE_MATRIX_SUMMARY.map((item) => item.key),
    ['mainline-v1', 'deferred-extensions', 'out-of-scope']
  )
  assert.equal(
    BUSINESS_CHAIN_COVERAGE_MATRIX_SUMMARY.find(
      (item) => item.key === 'mainline-v1'
    )?.count,
    6
  )
  assert(
    BUSINESS_CHAIN_COVERAGE_MATRIX_SUMMARY.find(
      (item) => item.key === 'deferred-extensions'
    )?.reportRule.includes('不能纳入已完成统计')
  )
})
