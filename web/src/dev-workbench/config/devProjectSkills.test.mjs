import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { filterProjectSkills, PROJECT_SKILL_STEP_FIELDS, readProjectSkillExecutionGuides } from './devProjectSkills.mjs'
import { buildDevDocsItems } from './devDocs.mjs'
import { resolveDevDocsMarkdownHref } from '../pages/devDocsNavigation.mjs'

const skills = [
  {
    name: 'plush-page',
    title: '页面治理',
    scope: '表单 DOM',
    summary: '页面布局',
  },
  {
    name: 'plush-test',
    title: '测试治理',
    scope: '浏览器测试',
    summary: '验证范围',
  },
]

test('search supports task text, names and multiple terms without a second routing registry', () => {
  assert.deepEqual(filterProjectSkills(skills, 'DOM 页面'), [skills[0]])
  assert.deepEqual(filterProjectSkills(skills, 'PLUSH-TEST'), [skills[1]])
  assert.deepEqual(filterProjectSkills(skills, '不存在'), [])
  assert.deepEqual(filterProjectSkills(skills, '  '), skills)
})

const stepFixture = (id) => [
  `- \`${id}\` [核对结果](#source-rules)`,
  '  - 前置条件：已有明确目标。',
  '  - 具体操作：运行 `check` 并读取结果。',
  '  - 完成标准：身份与结果一致。',
  '  - 失败处理：保留现场并定位原因。',
].join('\n')

const topicFixture = (id, count = 1) => [
  `### 执行与核对 / ${id}`,
  '',
  '本专题只核对本次目标。',
  '',
  '```mermaid',
  'flowchart LR',
  ...Array.from({ length: count }, (_, index) => `  step${index}["核对结果"]`),
  '```',
  '',
  ...Array.from({ length: count }, (_, index) => stepFixture(`step${index}`)),
].join('\n')

const guideFixture = (topics = [topicFixture('inspect')]) => [
  '<a id="source-rules"></a>',
  '## 正式规则',
  '',
  '按当前目标核对。',
  '',
  '## 执行流程 / Execution Guide',
  '',
  ...topics,
].join('\n')

test('reads topic identity, scope and four step fields from the same Markdown', () => {
  const topics = readProjectSkillExecutionGuides(guideFixture([topicFixture('inspect'), topicFixture('recovery')]))
  assert.deepEqual(topics.map((topic) => topic.id), ['inspect', 'recovery'])
  assert.equal(topics[0].title, '执行与核对')
  assert.equal(topics[0].summary, '本专题只核对本次目标。')
  assert.deepEqual(topics[0].nodes[0], {
    id: 'step0',
    label: '核对结果',
    headingId: 'source-rules',
    preconditions: '已有明确目标。',
    operation: '运行 `check` 并读取结果。',
    completion: '身份与结果一致。',
    failure: '保留现场并定位原因。',
  })
  assert.deepEqual(readProjectSkillExecutionGuides('```md\n## 执行流程 / Execution Guide\n```'), [])
  assert.deepEqual(readProjectSkillExecutionGuides(), [])
  assert.equal(readProjectSkillExecutionGuides(`${guideFixture()}\n\n## 后续章节\n\n### 不属于执行专题`).length, 1)
})

test('malformed execution guides fail explicitly instead of hiding missing instructions', () => {
  const source = guideFixture()
  const invalid = [
    source.replace('### 执行与核对 / inspect', '### 没有专题标识'),
    source.replace('本专题只核对本次目标。', ''),
    source.replace('flowchart LR', 'flowchart'),
    source.replace('#source-rules)', '#missing-rule)'),
    source.replace('  - 失败处理：保留现场并定位原因。', ''),
    source.replace('  - 前置条件：已有明确目标。', '  - 备注：没有前置条件。'),
    source.replace('  - 具体操作：运行 `check` 并读取结果。', '  - 具体操作：'),
    `${source}\n  - 失败处理：重复字段。`,
    `${source}\n${stepFixture('step0')}`,
    source.replace('  step0["核对结果"]', '  other["无说明节点"]'),
    source.replace('  step0["核对结果"]', '  step0["核对结果"]\n  step0 --> missing'),
    source.replace('```mermaid\nflowchart LR', '```mermaid\nflowchart LR\n  step0["重复节点"]'),
    guideFixture([topicFixture('same'), topicFixture('same')]),
    guideFixture([]),
  ]
  for (const candidate of invalid) assert.throws(() => readProjectSkillExecutionGuides(candidate), /Invalid Skill execution guide/u)
})

test('execution topics enforce the static graph size boundary', () => {
  assert.equal(readProjectSkillExecutionGuides(guideFixture([topicFixture('boundary', 12)]))[0].nodes.length, 12)
  assert.throws(() => readProjectSkillExecutionGuides(guideFixture([topicFixture('oversized', 13)])), /split the topic/u)
})

test('every project Skill exposes complete execution topics with source-backed steps', () => {
  const names = readdirSync(new URL('../../../../.agents/skills/', import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  let checked = 0
  for (const name of names) {
    const source = readFileSync(new URL(`../../../../.agents/skills/${name}/SKILL.md`, import.meta.url), 'utf8')
    const topics = readProjectSkillExecutionGuides(source)
    assert(topics.length > 0, `${name} must expose execution topics`)
    for (const topic of topics) {
      for (const node of topic.nodes) {
        assert(PROJECT_SKILL_STEP_FIELDS.every((field) => node[field.key].trim().length > 0))
        assert.throws(
          () => readProjectSkillExecutionGuides(source.replace(`#${node.headingId})`, '#missing-section)')),
          /missing source section/u,
          `${name}/${topic.id}/${node.id} must resolve its source rule`
        )
      }
    }
    checked += 1
  }
  assert.equal(checked, names.length)
  assert(checked > 0, 'the source scan must validate actual execution topics')
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
