import test from 'node:test'
import assert from 'node:assert/strict'
import { businessDocumentTypeOptions, getBusinessDocumentTitle } from '../config/businessModules.mjs'
import { buildWorkflowTaskBoardRequest, readWorkflowTaskBoardFiltersFromSearch, writeWorkflowTaskBoardFiltersToSearch } from './workflowTaskBoard.mjs'
import { buildMobileRoleTaskQuery, normalizeMobileTaskQueryOptions } from './mobileTaskQueries.mjs'
import { buildWorkflowTaskBoardMock } from '../../mocks/workflowTaskBoardMock.mjs'

test('单据候选按真实对象合并，拒收处置有正式名称', () => {
  const options = businessDocumentTypeOptions(['production_fact', 'production-progress', 'production_fact', 'purchase_rejection_disposition'])
  assert.equal(options.length, 2)
  assert.deepEqual(options.find(({ value }) => value === 'production_fact'), { value: 'production_fact', label: '生产记录' })
  assert.deepEqual(options.find(({ value }) => value === 'purchase_rejection_disposition'), { value: 'purchase_rejection_disposition', label: '采购拒收处置单' })
  assert.equal(getBusinessDocumentTitle('finance_payment'), '收付款单')
  assert.equal(getBusinessDocumentTitle('production_packaging_confirmation'), '包装确认记录')
  assert.equal(getBusinessDocumentTitle('unregistered-source'), '来源待核对')
})

test('已选来源恢复为同一分类，电脑手机请求一致且可清空', () => {
  const filters = readWorkflowTaskBoardFiltersFromSearch('?source=production-progress')
  assert.equal(filters.sourceType, 'production_fact')
  assert.equal(writeWorkflowTaskBoardFiltersToSearch('', filters).get('source'), 'production_fact')
  const desktop = buildWorkflowTaskBoardRequest(filters)
  const mobile = buildMobileRoleTaskQuery({ roleKey: 'production', viewKey: 'todo', sourceType: 'production-progress' })
  assert.equal(mobile.source_type, desktop.source_type)
  assert.equal(normalizeMobileTaskQueryOptions({ sourceType: 'production-progress' }).sourceType, 'production_fact')
  assert.equal(buildWorkflowTaskBoardRequest({ sourceType: 'all' }).source_type, undefined)
  assert.equal(buildMobileRoleTaskQuery({ roleKey: 'production', viewKey: 'todo', sourceType: '' }).source_type, undefined)
})

test('模拟查询也先合并来源再计数分页，不把同名选项合并成单一来源', () => {
  const tasks = Array.from({ length: 25 }, (_, index) => ({
    id: index + 1,
version: 1,
task_status_key: 'ready',
owner_role_key: 'production',
    source_type: index < 12 ? 'production_fact' : 'production-progress',
    task_group: 'production_exception',
task_name: '处理生产返工',
  }))
  const first = buildWorkflowTaskBoardMock({ tasks, snapshotAt: 1760000000, params: { source_type: 'production_fact', lane_key: 'all', limit: 20 } })
  const second = buildWorkflowTaskBoardMock({ tasks, snapshotAt: 1760000000, params: { source_type: 'production_fact', lane_key: 'all', limit: 20, offset: 20 } })
  assert.deepEqual(first.source_types, ['production_fact'])
  assert.equal(first.total, 25)
  assert.equal(first.lanes[0].tasks.length, 20)
  assert.equal(second.lanes[0].tasks.length, 5)
})
