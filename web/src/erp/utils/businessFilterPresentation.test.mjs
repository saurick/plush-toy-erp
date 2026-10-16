import assert from 'node:assert/strict'
import test from 'node:test'
import { countFilterOptions, shouldUseDirectFilterChoices } from './businessFilterPresentation.mjs'

test('筛选简化只应用于少量固定单选，保留搜索、多选、分组与排序', () => {
  const options = [{ value: '', label: '全部' }, { value: 'active', label: '启用' }, { value: 'inactive', label: '停用' }]
  assert.equal(shouldUseDirectFilterChoices({ options }), true)
  for (const override of [{ mode: 'multiple' }, { showSearch: true }, { onSearch() {} }, { labelInValue: true }, { className: 'erp-business-filter-control--sort' }]) assert.equal(shouldUseDirectFilterChoices({ options, ...override }), false)
  assert.equal(shouldUseDirectFilterChoices({ options: [] }), false)
  assert.equal(shouldUseDirectFilterChoices({ options: [{ label: '分类', options }] }), false)
  const long = Array.from({ length: 6 }, (_, value) => ({ value, label: `选项${value}` }))
  assert.equal(shouldUseDirectFilterChoices({ options: long }), false)
  assert.equal(shouldUseDirectFilterChoices({ options: long.slice(0, 5), allowClear: true }), false)
  assert.equal(countFilterOptions([{ label: '分类', options }, ...long]), 9)
})
