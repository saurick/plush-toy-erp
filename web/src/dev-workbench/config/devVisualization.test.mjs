import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readVisualizationChoices, resolveVisualizationChoice } from './devVisualization.mjs'

const source = readFileSync(new URL('../../../../docs/engineering/可视化表达规范.md', import.meta.url), 'utf8')

test('visualization choices come from the documented reader questions and limits', () => {
  const choices = readVisualizationChoices(source)
  assert.deepEqual(choices.map(({ value, label }) => [value, label]), [
    ['flow', '流程规则'],
    ['relations', '结构关系'],
    ['progress', '办理进度'],
    ['planning', '计划安排'],
    ['steps', '操作步骤'],
    ['annotations', '区域标注'],
    ['interaction', '交互演示'],
    ['charts', '统计图表'],
    ['tables', '表格对照'],
  ])
  assert.match(resolveVisualizationChoice(choices, 'planning').rule, /计划起止时间/u)
  assert.match(resolveVisualizationChoice(choices, 'progress').rule, /并行时长不能相加/u)
  assert.equal(resolveVisualizationChoice(choices, 'unknown').value, 'planning')
})

test('a missing choice chapter or a duplicate category is rejected instead of inventing rules', () => {
  assert.deepEqual(readVisualizationChoices(source.replace('选择表达 / Choosing A View', '其他说明')), [])
  assert.deepEqual(readVisualizationChoices(source.replace('visual-form-relations', 'visual-form-flow')), [])
})
