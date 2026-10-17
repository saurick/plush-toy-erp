import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildProjectSkillDiagram,
  filterProjectSkills,
} from './devProjectSkills.mjs'
import { buildDevDocsItems } from './devDocs.mjs'
import { resolveDevDocsMarkdownHref } from '../pages/devDocsNavigation.mjs'

const skills = [
  {
    name: 'plush-page',
    title: '页面治理',
    scope: '表单 DOM',
    summary: '页面布局',
    references: [],
    relatedSkills: ['plush-test', 'missing'],
  },
  {
    name: 'plush-test',
    title: '测试治理',
    scope: '浏览器测试',
    summary: '验证范围',
    references: [],
    relatedSkills: [],
  },
]

test('search supports task text, names and multiple terms without a second routing registry', () => {
  assert.deepEqual(filterProjectSkills(skills, 'DOM 页面'), [skills[0]])
  assert.deepEqual(filterProjectSkills(skills, 'PLUSH-TEST'), [skills[1]])
  assert.deepEqual(filterProjectSkills(skills, '不存在'), [])
  assert.deepEqual(filterProjectSkills(skills, '  '), skills)
})

test('focused graph distinguishes references and mentions, and omits unknown relations', () => {
  const chart = buildProjectSkillDiagram(skills[0], skills)
  assert.match(chart, /适用任务/u)
  assert.match(chart, /引用依据/u)
  assert.match(chart, /正文提及.*测试治理/u)
  assert.doesNotMatch(chart, /missing|执行顺序/u)
  assert.equal(buildProjectSkillDiagram(null, skills), '')
  assert(
    !buildProjectSkillDiagram(
      { ...skills[0], title: '<script>"\n' },
      skills
    ).includes('<script>')
  )
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
