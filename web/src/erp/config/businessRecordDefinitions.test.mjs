import assert from 'node:assert/strict'
import test from 'node:test'

import { getBusinessRecordDefinition } from './businessRecordDefinitions.mjs'

test('businessRecordDefinitions: 业务页按模块暴露日期筛选字段', () => {
  const definition = getBusinessRecordDefinition({
    key: 'production-scheduling',
    sectionKey: 'production',
  })

  assert.deepEqual(definition.dateFilterOptions, [
    { key: 'document_date', label: '排产日期' },
    { key: 'due_date', label: '计划完成日期' },
  ])
})

test('businessRecordDefinitions: 没有业务日期字段时回退到创建日期筛选', () => {
  const definition = getBusinessRecordDefinition({
    key: 'material-bom',
    sectionKey: 'purchase',
  })

  assert.deepEqual(definition.dateFilterOptions, [
    { key: 'created_at', label: '创建日期' },
  ])
})
