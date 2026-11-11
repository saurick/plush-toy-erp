import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { filterProjectSkills, readProjectSkillDecisionGuide } from './devProjectSkills.mjs'
import { buildDevDocsItems } from './devDocs.mjs'
import { resolveDevDocsMarkdownHref } from '../pages/devDocsNavigation.mjs'

const skills = [
  {
    name: 'plush-page',
    title: '页面治理',
    scope: '表单 DOM',
    summary: '页面布局',
    relatedSkills: ['plush-test', 'missing'],
  },
  {
    name: 'plush-test',
    title: '测试治理',
    scope: '浏览器测试',
    summary: '验证范围',
    relatedSkills: [],
  },
]

test('search supports task text, names and multiple terms without a second routing registry', () => {
  assert.deepEqual(filterProjectSkills(skills, 'DOM 页面'), [skills[0]])
  assert.deepEqual(filterProjectSkills(skills, 'PLUSH-TEST'), [skills[1]])
  assert.deepEqual(filterProjectSkills(skills, '不存在'), [])
  assert.deepEqual(filterProjectSkills(skills, '  '), skills)
})

test('reads the operations guide from the Skill and rejects notes with missing source sections', () => {
  const source = readFileSync(new URL(
    '../../../../.agents/skills/plush-operations-governance/SKILL.md',
    import.meta.url
  ), 'utf8')
  const guide = readProjectSkillDecisionGuide(source)
  assert.match(guide.chart, /gate -->\|缺失或失败\| stop/u)
  assert.deepEqual(guide.nodes.map((node) => node.id), ['choose', 'audit', 'inspect', 'gate', 'execute', 'stop'])
  assert.equal(guide.nodes.find((node) => node.id === 'stop').headingId, 'operations-stop')
  assert.equal(readProjectSkillDecisionGuide(source.replace('#operations-stop)', '#missing-section)')), undefined)
  assert.equal(readProjectSkillDecisionGuide('```md\n## 选用决策图 / Decision Guide\n```'), undefined)
  assert.equal(readProjectSkillDecisionGuide(), undefined)
})

test('existing document catalog and relative-link navigation support Skill sources and reference headings', () => {
  const loadSource = async () => '# 页面治理'
  const docs = buildDevDocsItems({
    '../../../../.agents/skills/plush-page/SKILL.md': loadSource,
    '../../../../.agents/skills/plush-page/references/layout.md': '# 布局',
  })
  assert.equal(
    docs.find((doc) => doc.path.endsWith('SKILL.md')).loadSource,
    loadSource
  )
  assert.deepEqual(
    resolveDevDocsMarkdownHref(
      'references/layout.md#layout',
      '.agents/skills/plush-page/SKILL.md'
    ),
    {
      path: '.agents/skills/plush-page/references/layout.md',
      headingId: 'layout',
    }
  )
  assert.deepEqual(
    resolveDevDocsMarkdownHref(
      '../../../docs/guide.md',
      '.agents/skills/plush-page/SKILL.md'
    ),
    {
      path: 'docs/guide.md',
      headingId: '',
    }
  )
})
