import assert from 'node:assert/strict'
import test from 'node:test'

import { printTemplateCatalog } from '../config/printTemplates.mjs'
import {
  QA_REPORT_OUTPUT_HINTS,
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
