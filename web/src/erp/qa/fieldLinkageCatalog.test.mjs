import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  FIELD_LINKAGE_CASE_CATALOG,
  FIELD_LINKAGE_FIELD_CATALOG,
  FIELD_LINKAGE_SCENARIO_CATALOG,
  buildFieldLinkageCoverageViewModel,
} from './fieldLinkageCatalog.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..')
const fieldLinkageGuidePath = path.join(
  projectRoot,
  'web',
  'src',
  'erp',
  'docs',
  'field-linkage-guide.md'
)

function normalizeLabel(value) {
  return String(value || '')
    .replaceAll('`', '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function extractTableFirstColumn(markdown, sectionHeading, nextHeading) {
  const startIndex = markdown.indexOf(sectionHeading)
  if (startIndex < 0) return []

  const nextIndex =
    nextHeading &&
    markdown.indexOf(nextHeading, startIndex + sectionHeading.length)
  const section = markdown.slice(
    startIndex,
    nextIndex > startIndex ? nextIndex : undefined
  )

  return section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .slice(2)
    .map((line) => line.split('|')[1]?.trim() || '')
    .filter(Boolean)
    .map(normalizeLabel)
}

function getRegisteredCaseIdsFromFiles() {
  const testFiles = Array.from(
    new Set(FIELD_LINKAGE_CASE_CATALOG.map((item) => item.testFile))
  )
  const caseIds = new Set()
  for (const relativePath of testFiles) {
    const absolutePath = path.join(projectRoot, relativePath)
    const content = readFileSync(absolutePath, 'utf8')
    const matches = content.match(/FL_[A-Za-z0-9_]+/gu) || []
    for (const caseId of matches) {
      caseIds.add(caseId)
    }
  }
  return caseIds
}

test('fieldLinkageCatalog: 帮助中心核心字段已进入覆盖目录', () => {
  const markdown = readFileSync(fieldLinkageGuidePath, 'utf8')
  const documentedLabels = new Set([
    ...extractTableFirstColumn(
      markdown,
      '### 5.1 核心业务字段',
      '### 5.2 日期与条款字段'
    ),
    ...extractTableFirstColumn(
      markdown,
      '### 5.2 日期与条款字段',
      '## 6. 改下游后，会不会反写上游'
    ),
  ])
  const catalogLabels = new Set(
    FIELD_LINKAGE_FIELD_CATALOG.flatMap((item) =>
      (Array.isArray(item.docLabels) ? item.docLabels : [item.fieldLabel]).map(
        normalizeLabel
      )
    )
  )

  for (const label of documentedLabels) {
    assert.equal(catalogLabels.has(label), true, `${label} 未进入覆盖目录`)
  }
})

test('fieldLinkageCatalog: 字段、场景和用例目录保持自洽', () => {
  const fieldKeys = new Set()
  for (const field of FIELD_LINKAGE_FIELD_CATALOG) {
    assert.equal(fieldKeys.has(field.fieldKey), false, field.fieldKey)
    fieldKeys.add(field.fieldKey)
    assert(field.requiredScenarioKeys.length > 0, field.fieldKey)
  }

  const scenarioKeys = new Set()
  for (const scenario of FIELD_LINKAGE_SCENARIO_CATALOG) {
    assert.equal(scenarioKeys.has(scenario.key), false, scenario.key)
    scenarioKeys.add(scenario.key)
  }

  const caseIds = new Set()
  for (const item of FIELD_LINKAGE_CASE_CATALOG) {
    assert.equal(caseIds.has(item.caseId), false, item.caseId)
    caseIds.add(item.caseId)
    assert.equal(scenarioKeys.has(item.scenarioKey), true, item.caseId)
    for (const fieldKey of item.fieldKeys) {
      assert.equal(fieldKeys.has(fieldKey), true, `${item.caseId}:${fieldKey}`)
    }
  }

  for (const field of FIELD_LINKAGE_FIELD_CATALOG) {
    for (const scenarioKey of field.requiredScenarioKeys) {
      assert.equal(scenarioKeys.has(scenarioKey), true, field.fieldKey)
    }
  }
})

test('fieldLinkageCatalog: 真实测试文件里的 FL case 与目录登记完全一致', () => {
  const catalogCaseIds = new Set(
    FIELD_LINKAGE_CASE_CATALOG.map((item) => item.caseId)
  )
  const fileCaseIds = getRegisteredCaseIdsFromFiles()

  assert.deepEqual(
    Array.from(fileCaseIds).sort(),
    Array.from(catalogCaseIds).sort()
  )
})

test('fieldLinkageCatalog: 覆盖报告视图能区分已覆盖、部分覆盖和未覆盖字段', () => {
  const report = buildFieldLinkageCoverageViewModel({
    generatedAt: '2026-04-24T10:00:00+08:00',
    cases: FIELD_LINKAGE_CASE_CATALOG.slice(0, 3).map((item) => ({
      caseId: item.caseId,
      status: 'pass',
      durationMs: 1,
      failureMessages: [],
    })),
  })

  assert.equal(report.summary.totalFields, FIELD_LINKAGE_FIELD_CATALOG.length)
  assert(report.summary.partialFields > 0)
  assert(report.summary.missingFields > 0)
  assert.equal(report.cases[0].status, 'pass')
})
