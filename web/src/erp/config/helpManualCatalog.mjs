import {
  BUSINESS_USABILITY_CATALOG,
  BUSINESS_HELP_TYPE_PRESENTATION,
} from './businessUsabilityCatalog.mjs'
import { ENGINEERING_MATERIAL_HELP } from './engineeringMaterialHelp.mjs'
import { HELP_VISUAL_EXAMPLES } from './helpScenarioPresentation.mjs'
import { getRoleHelpScenarios } from './helpScenarios.mjs'
import { ROLE_HELP_GUIDES } from './roleHelpContent.mjs'
import { supplementSearchText } from './helpContributions.mjs'
import {
  getBusinessHandbookIntroductions,
  getBusinessPageHandbookSections,
} from './businessHandbook.mjs'

export const HELP_REFERENCE_PAGES = Object.freeze([
  ...BUSINESS_USABILITY_CATALOG,
  ENGINEERING_MATERIAL_HELP,
])

export function getHelpReferencePages(guide, { allowedMenuPaths = [] } = {}) {
  if (!guide) return []
  return HELP_REFERENCE_PAGES.filter((page) =>
    allowedMenuPaths.includes(page.path) || page.roleHelpKeys.includes(guide.key)
  ).map((page) => ({
    ...page,
    available: allowedMenuPaths.includes(page.path),
  }))
}

export function resolveHelpGuide(guides, requestedRoleKey = '', pageKey = '') {
  if (requestedRoleKey) {
    return guides.find((guide) => guide.key === requestedRoleKey) || guides[0]
  }
  const page = HELP_REFERENCE_PAGES.find((entry) => entry.key === pageKey)
  return (
    guides.find((guide) => page?.roleHelpKeys.includes(guide.key)) || guides[0]
  )
}

export const helpScenarioTitle = (scenario) =>
  HELP_VISUAL_EXAMPLES[scenario.key]?.title || scenario.title
export const helpReferenceId = (pageKey, itemKey = '') =>
  itemKey ? `${pageKey}:${itemKey}` : pageKey

export function getHelpReferenceDocuments(pages) {
  return pages.flatMap((page) => [
    {
      id: page.key,
      kind: 'page',
      title: `${page.title}怎么用`,
      summary: page.task,
      page,
      item: null,
    },
    ...page.items.map((item) => ({
      id: helpReferenceId(page.key, item.key),
      kind: item.type,
      title: item.title,
      summary: item.explanation,
      page,
      item,
    })),
  ])
}

export function getHelpReadingCatalog(guides, options = {}) {
  const pages = new Map()
  const scenarios = new Map()
  for (const guide of guides) {
    for (const page of getHelpReferencePages(guide, options)) {
      pages.set(page.key, page)
    }
    for (const scenario of getRoleHelpScenarios(guide, options)) {
      const saved = scenarios.get(scenario.key)
      if (saved) saved.roleKeys.push(guide.key)
      else scenarios.set(scenario.key, { ...scenario, roleKeys: [guide.key] })
    }
  }
  const referencePages = HELP_REFERENCE_PAGES.filter((page) =>
    pages.has(page.key)
  ).map((page) => pages.get(page.key))
  // 岗位首页保留常用推荐；目录另补实际已开放页面，兼岗和自定义授权也能查到说明。
  const availablePages = new Set(
    referencePages.filter((page) => page.available).map((page) => page.key)
  )
  for (const guide of ROLE_HELP_GUIDES) {
    for (const scene of getRoleHelpScenarios(guide, options)) {
      if (availablePages.has(scene.pageKey) && !scenarios.has(scene.key)) {
        scenarios.set(scene.key, { ...scene, roleKeys: guides.map((entry) => entry.key) })
      }
    }
  }
  return {
    scenarios: [...scenarios.values()],
    referencePages,
    references: [
      ...getBusinessHandbookIntroductions(guides),
      ...getHelpReferenceDocuments(referencePages),
    ],
  }
}

export function getHelpGuideSections(catalog) {
  const sections = new Map()
  for (const scenario of catalog.scenarios) {
    const title =
      catalog.referencePages.find((page) => page.key === scenario.pageKey)
        ?.sectionTitle || '日常与系统'
    if (!sections.has(title)) sections.set(title, [])
    sections.get(title).push(scenario)
  }
  const order = [
    '日常与系统',
    ...new Set(catalog.referencePages.map((page) => page.sectionTitle)),
  ]
  return order
    .filter((title) => sections.has(title))
    .map((title) => ({ title, scenarios: sections.get(title) }))
}

const normalize = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')

const sectionText = (sections) =>
  sections
    .map((section) =>
      [
        section.title,
        ...(section.paragraphs || []),
        ...(section.steps || []),
        ...(section.rows || []).flat(),
      ].join(' ')
    )
    .join(' ')

export function searchHelpDocuments(
  { scenarios = [], references = [] },
  query
) {
  const words = String(query || '')
    .trim()
    .split(/\s+/u)
    .map(normalize)
    .filter(Boolean)
  if (!words.length) return []
  const documents = [
    ...scenarios.map((scenario) => ({
      id: scenario.key,
      kind: 'guide',
      title: helpScenarioTitle(scenario),
      summary: scenario.description,
      scenario,
      body: [
        scenario.steps
          .map((step) => `${step.title} ${step.description}`)
          .join(' '),
        scenario.completion,
        scenario.handoff,
        scenario.exception.trigger,
        scenario.exception.action,
      ].join(' '),
    })),
    ...references.map((reference) => ({
      ...reference,
      body:
        reference.kind === 'manual'
          ? reference.markdown
          : reference.kind === 'chapter'
            ? sectionText(reference.sections)
            : reference.item
              ? [
                  reference.page.title,
                  reference.item.source,
                  reference.item.updateRule,
                  reference.item.example,
                  reference.item.effect,
                  ...(reference.item.aliases || []),
                ].join(' ')
              : [
                  sectionText(getBusinessPageHandbookSections(reference.page)),
                ].join(' '),
    })),
  ]
  return documents
    .map((document, index) => {
      const title = normalize(document.title)
      const summary = normalize(document.summary)
      const body = normalize(`${document.body} ${supplementSearchText(document.supplement)}`)
      const text = title + summary + body
      if (!words.every((word) => text.includes(word))) return null
      const score = words.reduce(
        (sum, word) =>
          sum +
          (title === word
            ? 100
            : title.includes(word)
              ? 40
              : summary.includes(word)
                ? 15
                : 5),
        0
      )
      return { ...document, score, order: index }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.order - b.order)
}

export function getHelpDocumentKindLabel(kind) {
  return kind === 'chapter' || kind === 'manual'
    ? '手册章节'
    : kind === 'guide'
      ? '操作图解'
      : kind === 'page'
        ? '页面说明'
        : BUSINESS_HELP_TYPE_PRESENTATION[kind]?.label || '参考词条'
}

export function getHelpCenterHref({
  pageKey = '',
  itemKey = '',
  view = 'reference',
  roleKey = '',
} = {}) {
  const params = new URLSearchParams()
  if (roleKey) params.set('role', roleKey)
  params.set('view', view === 'guide' ? 'guide' : 'reference')
  if (view === 'guide') params.set('page', pageKey)
  else params.set('ref', helpReferenceId(pageKey, itemKey))
  return `/erp/help-center?${params}`
}

export function resolveHelpReference(references, requestedId, pageKey = '') {
  return (
    references.find((reference) => reference.id === requestedId) ||
    references.find((reference) => reference.id === pageKey) ||
    references[0] ||
    null
  )
}
