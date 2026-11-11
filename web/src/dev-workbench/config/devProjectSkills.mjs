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

const DECISION_GUIDE_HEADING = '选用决策图 / Decision Guide'
const DECISION_NOTE = /^`([A-Za-z][A-Za-z0-9_]*)` \[([^\]]+)\]\(#([a-z][a-z0-9-]*)\)：(.+)$/u

export function readProjectSkillDecisionGuide(source) {
  if (!source?.includes(DECISION_GUIDE_HEADING)) return undefined
  const tokens = new Remarkable().parse(source, {})
  const isSectionHeading = (token) =>
    token.type === 'heading_open' && token.level === 0 && token.hLevel <= 2
  const start = tokens.findIndex(
    (token, index) =>
      isSectionHeading(token) && token.hLevel === 2 &&
      tokens[index + 1]?.content === DECISION_GUIDE_HEADING
  )
  if (start < 0) return undefined
  const end = tokens.findIndex((token, index) => index > start && isSectionHeading(token))
  const section = tokens.slice(start + 3, end < 0 ? tokens.length : end)
  const diagrams = section.filter((token) => token.type === 'fence' && token.params.trim() === 'mermaid')
  const chart = diagrams[0]?.content.trim()
  if (diagrams.length !== 1 || !/^flowchart (?:LR|RL|TB|TD|BT)\b/u.test(chart)) return undefined

  const anchors = extractMarkdownAnchorIds(source)
  const nodes = []
  for (const [index, token] of section.entries()) {
    if (token.type !== 'inline' || section[index - 2]?.type !== 'list_item_open') continue
    const note = DECISION_NOTE.exec(token.content)
    if (!note) return undefined
    const [, id, label, headingId, description] = note
    if (!anchors.has(headingId) || nodes.some((node) => node.id === id)) return undefined
    nodes.push({ id, label, headingId, description })
  }
  return nodes.length ? { chart, nodes } : undefined
}
