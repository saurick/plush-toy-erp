import { Remarkable } from 'remarkable'
import { extractMarkdownAnchorIds } from '../../common/components/markdown/anchors.mjs'

export const DEV_PROJECT_SKILLS_API = '/__dev/api/project-skills'

export function filterProjectSkills(skills, keyword = '') {
  const tokens = keyword
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean)
  return skills.filter((skill) => {
    const text = [skill.name, skill.title, skill.scope, skill.summary]
      .join(' ')
      .toLocaleLowerCase()
    return tokens.every((token) => text.includes(token))
  })
}

const EXECUTION_HEADING = '执行流程 / Execution Guide'
const TOPIC_HEADING = /^(.+?) \/ ([a-z][a-z0-9-]*)$/u
const STEP_HEADING = /^`([A-Za-z][A-Za-z0-9_]*)` \[([^\]]+)\]\(#([a-z][a-z0-9-]*)\)$/u

export const PROJECT_SKILL_STEP_FIELDS = [
  { key: 'preconditions', label: '前置条件' },
  { key: 'operation', label: '具体操作' },
  { key: 'completion', label: '完成标准' },
  { key: 'failure', label: '失败处理' },
]

function invalidGuide(message) {
  throw new Error(`Invalid Skill execution guide: ${message}`)
}

function readExecutionTopic(tokens, anchors) {
  const heading = TOPIC_HEADING.exec(tokens[1]?.content || '')
  if (!heading) return invalidGuide('topic heading must include a stable key')
  const [, title, id] = heading
  const diagrams = tokens.filter((token) => token.type === 'fence' && token.params.trim() === 'mermaid')
  const chart = diagrams[0]?.content.trim()
  if (diagrams.length !== 1 || !/^flowchart (?:LR|RL|TB|TD|BT)\b/u.test(chart)) {
    return invalidGuide(`${id}: expected one directed flowchart`)
  }
  const summary = tokens.find((token, index) => token.type === 'inline' &&
    token.level === 1 && tokens[index - 1]?.type === 'paragraph_open')?.content || ''
  if (!summary) return invalidGuide(`${id}: missing topic scope`)

  const nodes = []
  let node
  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'inline') continue
    if (token.level === 3 && tokens[index - 2]?.type === 'list_item_open') {
      const step = STEP_HEADING.exec(token.content)
      if (!step) return invalidGuide(`${id}: invalid step heading`)
      const [, nodeId, label, headingId] = step
      if (!anchors.has(headingId) || nodes.some((item) => item.id === nodeId)) {
        return invalidGuide(`${id}/${nodeId}: duplicate step or missing source section`)
      }
      node = { id: nodeId, label, headingId }
      nodes.push(node)
    } else if (token.level === 5 && tokens[index - 2]?.type === 'list_item_open') {
      const field = PROJECT_SKILL_STEP_FIELDS.find((item) => token.content.startsWith(`${item.label}：`))
      const value = field && token.content.slice(field.label.length + 1).trim()
      if (!node || !field || !value || node[field.key]) return invalidGuide(`${id}: invalid step field`)
      node[field.key] = value
    }
  }
  if (!nodes.length || nodes.some((item) => PROJECT_SKILL_STEP_FIELDS.some((field) => !item[field.key]))) {
    return invalidGuide(`${id}: each step needs all four instruction fields`)
  }
  const declaredIds = [...chart.matchAll(/^\s+([A-Za-z][A-Za-z0-9_]*)(?:\[|\{)/gmu)].map((match) => match[1])
  const knownIds = new Set(declaredIds)
  if (knownIds.size !== declaredIds.length || declaredIds.length !== nodes.length ||
    nodes.some((item) => !knownIds.has(item.id))) return invalidGuide(`${id}: graph and steps do not match`)
  const edges = [...chart.matchAll(/^\s+([A-Za-z][A-Za-z0-9_]*) -->\s*(?:\|[^|]+\|\s*)?([A-Za-z][A-Za-z0-9_]*)\s*$/gmu)]
  if (nodes.length > 12 || edges.length > 18 || edges.some((edge) => !knownIds.has(edge[1]) || !knownIds.has(edge[2]))) {
    return invalidGuide(`${id}: split the topic or fix its edge references`)
  }
  return { id, title, summary, chart, nodes }
}

export function readProjectSkillExecutionGuides(source) {
  if (!source?.includes(EXECUTION_HEADING)) return []
  const tokens = new Remarkable().parse(source, {})
  const isSectionHeading = (token) =>
    token.type === 'heading_open' && token.level === 0 && token.hLevel <= 2
  const start = tokens.findIndex(
    (token, index) =>
      isSectionHeading(token) && token.hLevel === 2 &&
      tokens[index + 1]?.content === EXECUTION_HEADING
  )
  if (start < 0) return []
  const end = tokens.findIndex((token, index) => index > start && isSectionHeading(token))
  const section = tokens.slice(start + 3, end < 0 ? tokens.length : end)
  const anchors = extractMarkdownAnchorIds(source)
  const starts = []
  for (const [index, token] of section.entries()) {
    if (token.type === 'heading_open' && token.level === 0 && token.hLevel === 3) starts.push(index)
  }
  if (!starts.length) return invalidGuide('missing execution topics')
  const topics = starts.map((index, offset) => readExecutionTopic(section.slice(index, starts[offset + 1]), anchors))
  if (new Set(topics.map((topic) => topic.id)).size !== topics.length) return invalidGuide('duplicate topic key')
  return topics
}
