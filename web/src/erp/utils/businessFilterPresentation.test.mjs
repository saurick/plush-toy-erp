import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldUseDirectFilterChoices } from './businessFilterPresentation.mjs'

test('固定单选直接平铺，不因超过五项增加搜索，排序与固定选项直接点选，保留名单搜索、多选和分组', () => {
  const options = [{ value: '', label: '全部' }, { value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]
  assert.equal(shouldUseDirectFilterChoices({ options }), true)
  assert.equal(shouldUseDirectFilterChoices({ options, className: 'legacy-layout--sort' }), true, '布局类名不决定筛选语义')
  for (const override of [{ mode: 'multiple' }, { showSearch: true }, { onSearch() {} }, { labelInValue: true }]) assert.equal(shouldUseDirectFilterChoices({ options, ...override }), false)
  assert.equal(shouldUseDirectFilterChoices({ options, purpose: 'sort' }), true)
  assert.equal(shouldUseDirectFilterChoices({ options: [] }), false)
  assert.equal(shouldUseDirectFilterChoices({ options: [{ label: '分类', options }] }), false)
  const long = Array.from({ length: 6 }, (_, value) => ({ value, label: `选项${value}` }))
  assert.equal(shouldUseDirectFilterChoices({ options: long }), true)
  assert.equal(shouldUseDirectFilterChoices({ options: long.slice(0, 5), allowClear: true }), true)
  assert.equal(shouldUseDirectFilterChoices({ options: long, showSearch: true }), false)
})
