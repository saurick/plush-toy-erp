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

function diagramLabel(value) {
  return JSON.stringify(String(value).replace(/[<>&"\\\r\n]/gu, ' '))
}

export function buildProjectSkillDiagram(skill, skills) {
  if (!skill) return ''
  const lines = [
    'flowchart TB',
    `task[${diagramLabel(skill.title)}] -->|适用任务| entry[${diagramLabel(`$${skill.name}`)}]`,
    `entry -->|引用依据| source[${diagramLabel(`入口原文 · ${skill.references.length} 项 Markdown 引用`)}]`,
  ]
  skill.relatedSkills.forEach((name, index) => {
    const related = skills.find((item) => item.name === name)
    if (related) {
      lines.push(
        `entry -.->|正文提及| related${index}[${diagramLabel(related.title)}]`
      )
    }
  })
  return lines.join('\n')
}
