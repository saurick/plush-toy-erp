import assert from 'node:assert/strict'
import test from 'node:test'

import { getWorkflowTaskGroupLabel } from './workflowTaskLabels.mjs'

test('workflow source task groups use岗位可读中文标签', () => {
  assert.equal(getWorkflowTaskGroupLabel('production_scheduling'), '生产排程')
  assert.equal(getWorkflowTaskGroupLabel('production_exception'), '生产异常')
  assert.equal(getWorkflowTaskGroupLabel('shipment_release'), '出货放行')
})
