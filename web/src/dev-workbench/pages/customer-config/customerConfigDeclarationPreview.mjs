import { customerPackageFieldGuide } from '../../../../../config/schemas/customerPackageFieldGuide.mjs'
import { buildRuntimeProcessSelection } from '../../config/devFlowStateCatalog.mjs'
import { buildCustomerConfigFieldRows } from './customerConfigFieldRows.mjs'

const packageHeaderFields = customerPackageFieldGuide.find(({ key }) => key === 'identity').fields
const packageFieldGuide = new Map(customerPackageFieldGuide
  .filter(({ source }) => !source)
  .flatMap(({ fields }) => fields.map((field) => [field.path, field])))
const frontendFieldGuide = new Map(customerPackageFieldGuide
  .filter(({ source }) => source === 'frontend')
  .flatMap(({ fields }) => fields.map((field) => [field.path, field])))

const recordIdentifiers = Object.freeze({
  moduleStates: ['moduleKey'],
  fieldPolicyOverrides: ['surfaceKey', 'fieldKey'],
  runtimeProcessSelections: ['processKey'],
  roleProfiles: ['roleKey'],
  printTemplateDefaults: ['templateKey'],
  workflows: ['key'],
  nodes: ['key'],
  businessFlows: ['key'],
  stateMachines: ['key'],
  processPolicies: ['key'],
  rules: ['key', 'when'],
  extensionPoints: ['key'],
  sections: ['title'],
  fieldDisplayReview: ['module'],
  candidates: ['key'],
  numberingRuleReview: ['domain', 'key'],
})

function findDeclaredField(source, path, conditions = []) {
  let value = source
  const location = []
  for (const segment of path.split('.')) {
    const isList = segment.endsWith('[]')
    const key = isList ? segment.slice(0, -2) : segment
    if (value == null || !Object.hasOwn(value, key)) return null
    value = value[key]
    location.push(key)
    if (isList) {
      const index = Array.isArray(value)
        ? value.findIndex((record) => conditions.every(([name, expected]) => record?.[name] === expected))
        : -1
      if (index < 0) return null
      value = value[index]
      location.push(index)
    }
  }
  return { location, value }
}

function annotateSettings(overview, declarations, annotate) {
  for (const row of buildCustomerConfigFieldRows(overview)) {
    const sourcePath = row.key === 'display-label' || /^(brand|desktopMenu)\./u.test(row.path)
      ? overview.menuSummary.sourcePath
      : overview.customerPackageSummary.sourcePath
    const field = findDeclaredField(declarations[sourcePath], row.path, row.conditions)
    if (!field) continue
    const valueLabel = row.value === field.value ? row.valueLabel : ''
    annotate([sourcePath, ...field.location], row.label, valueLabel, row.description)
  }
}

function annotatePackage(summary, source, annotate) {
  const { customerKey, sourcePath, processPolicies, extensionRegistryChecks } = summary
  for (const { path, label, description } of packageHeaderFields) {
    if (Object.hasOwn(source, path)) annotate([sourcePath, path], label, description)
  }
  source.runtimeProcessSelections?.forEach((selection, index) => {
    const { canonicalProcessDefinition } = buildRuntimeProcessSelection(selection, customerKey, sourcePath)
    const description = canonicalProcessDefinition
      ? `选用「${canonicalProcessDefinition.label}」作为发布候选。`
      : '这个流程选项需要与产品已登记的流程核对。'
    annotate([sourcePath, 'runtimeProcessSelections', index, 'variantKey'], '流程方案', description)
  })
  processPolicies.forEach((policy, policyIndex) => {
    policy.ruleItems.forEach(({ declaration, triggerLabel, resultLabel }, ruleIndex) => {
      const resultField = declaration.action ? 'action' : 'decision'
      for (const field of ['decision', 'action']) {
        if (!Object.hasOwn(declaration, field)) continue
        const description = field === resultField
          ? `${triggerLabel.replace(/^条件：/u, '')}，${resultLabel.replace(/^结果：/u, '')}。这条策略仅供评审。`
          : '记录条件满足时的评审判断。'
        annotate([sourcePath, 'processPolicies', policyIndex, 'rules', ruleIndex, field], policy.label, description)
      }
    })
  })
  if (!Array.isArray(source.extensionPoints)) return
  if (source.extensionPoints.length === 0) {
    annotate([sourcePath, 'extensionPoints'], '', '这个客户包目前没有登记扩展。')
  } else {
    source.extensionPoints.forEach((_, index) => {
      const { label, note } = extensionRegistryChecks[index]
      annotate([sourcePath, 'extensionPoints', index], label, note)
    })
  }
}

function annotateFieldNumbering(summary, source, annotate) {
  const { sourcePath, fieldCandidates, numberingRules } = summary
  source.fieldDisplayReview?.forEach((section, sectionIndex) => {
    section.candidates?.forEach(({ key }, index) => {
      const candidate = fieldCandidates.find((item) => item.module === section.module && item.key === key)
      if (candidate) {
        annotate(
          [sourcePath, 'fieldDisplayReview', sectionIndex, 'candidates', index, 'decision'],
          candidate.label,
          candidate.decisionLabel,
          candidate.note,
        )
      }
    })
  })
  numberingRules.forEach((rule, index) => {
    annotate(
      [sourcePath, 'numberingRuleReview', index, 'currentDecision'],
      rule.label,
      rule.decisionLabel,
      rule.unresolvedQuestion,
    )
  })
}

function declarationPath(location, schema = false) {
  return location.reduce((path, key) => {
    if (typeof key === 'number') return `${path}[${schema ? '' : key}]`
    if (/^[a-z_$][\w$]*$/iu.test(key)) return path ? `${path}.${key}` : key
    return `${path}[${JSON.stringify(key)}]`
  }, '')
}

function recordConditions(collection, record) {
  if (!record || typeof record !== 'object' || !Object.hasOwn(recordIdentifiers, collection)) return []
  return recordIdentifiers[collection].flatMap((name) => {
    if (!Object.hasOwn(record, name)) return []
    const key = name === 'key' ? `${collection}[].key` : name
    const value = typeof record[name] === 'string' ? record[name] : JSON.stringify(record[name])
    return [`${key} = ${value}`]
  })
}

function declarationFieldGuide(overview, sourcePath, fieldPath) {
  if (sourcePath === overview.menuSummary.sourcePath && frontendFieldGuide.has(fieldPath)) {
    return frontendFieldGuide.get(fieldPath)
  }
  return sourcePath === overview.customerPackageSummary.sourcePath ? packageFieldGuide.get(fieldPath) : undefined
}

export function buildCustomerConfigDeclarationPreview(overview, json) {
  const declarations = JSON.parse(json)
  const annotations = new Map()
  const annotate = (location, label, ...phrases) => {
    const description = phrases.filter(Boolean).join('。').replace(/\s+/gu, ' ')
    const comment = [label, description].filter(Boolean).join('。').replace(/\s+/gu, ' ')
    annotations.set(JSON.stringify(location.map(String)), { label, description, comment })
  }
  const { customerPackageSummary, fieldNumberingSummary } = overview
  annotateSettings(overview, declarations, annotate)
  annotatePackage(customerPackageSummary, declarations[customerPackageSummary.sourcePath], annotate)
  const fieldNumbering = declarations[fieldNumberingSummary.sourcePath]
  if (fieldNumbering) annotateFieldNumbering(fieldNumberingSummary, fieldNumbering, annotate)

  const lines = json.split('\n')
  const commentsByLine = new Map()
  const rows = []
  let lineIndex = 0
  function visit(value, location, conditions, includeRow) {
    const annotation = annotations.get(JSON.stringify(location.map(String)))
    if (annotation?.comment) commentsByLine.set(lineIndex, annotation.comment)
    const entries = value !== null && typeof value === 'object' ? Object.entries(value) : []
    const array = Array.isArray(value)
    const singleValue = !entries.length || (array && value.every((item) => item === null || typeof item !== 'object'))
    const [sourcePath, ...field] = location
    if (includeRow && field.length && singleValue) {
      const path = declarationPath(field)
      const guide = declarationFieldGuide(overview, sourcePath, declarationPath(field, true))
      rows.push({
        sourcePath,
        path,
        label: annotation?.label || guide?.label,
        conditions,
        value: JSON.stringify(value),
        description: annotation?.description || guide?.description,
        lineIndex,
      })
    }
    if (!entries.length) return

    // 两空格缩进的 JSON 中，子项从下一行开始，闭合括号也单独占一行。
    for (const [key, child] of entries) {
      lineIndex += 1
      const nestedConditions = array ? [...conditions, ...recordConditions(location.at(-1), child)] : conditions
      visit(child, [...location, array ? Number(key) : key], nestedConditions, includeRow && !singleValue)
    }
    lineIndex += 1
  }
  visit(declarations, [], [], true)
  return {
    sources: Object.keys(declarations),
    rows,
    lines: lines.map((line, index) => ({ line, comment: commentsByLine.get(index) })),
  }
}
