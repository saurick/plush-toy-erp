import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS,
  buildBusinessChainDebugView,
  moduleMatchesBusinessChainDebugQuery,
} from './businessChainDebug.mjs'

const modules = [
  {
    key: 'project-orders',
    title: '客户/款式立项',
    sectionKey: 'sales',
    sectionTitle: '销售链路',
    path: '/erp/sales/project-orders',
  },
  {
    key: 'production-exceptions',
    title: '生产异常/返工',
    sectionKey: 'production',
    sectionTitle: '生产环节',
    path: '/erp/production/exceptions',
  },
]

test('businessChainDebug: 预设场景默认用 key 作为查询词', () => {
  const projectScenario = BUSINESS_CHAIN_DEBUG_PRESET_SCENARIOS.find(
    (scenario) => scenario.key === 'project-orders'
  )

  assert.deepEqual(projectScenario.queryKeywords, ['project-orders'])
})

test('businessChainDebug: 模块 key 和标题都可以命中模块查询', () => {
  assert.equal(
    moduleMatchesBusinessChainDebugQuery(modules[0], 'project-orders'),
    true
  )
  assert.equal(
    moduleMatchesBusinessChainDebugQuery(modules[1], '生产异常'),
    true
  )
})

test('businessChainDebug: 按单据号聚合业务记录和关联任务', () => {
  const view = buildBusinessChainDebugView({
    query: 'STYLE-L1-001',
    modules,
    records: [
      {
        id: 21,
        module_key: 'project-orders',
        document_no: 'STYLE-L1-001',
        title: '毛绒熊立项',
        source_no: '',
        customer_name: '联调客户',
        quantity: 2,
        amount: 39.8,
        business_status_key: 'blocked',
        owner_role_key: 'merchandiser',
        payload: { status_reason: '资料未齐，等待客户确认' },
        items: [{ item_name: '浅棕色毛绒熊' }],
        updated_at: 1777046400,
      },
    ],
    businessStates: [
      {
        id: 3,
        source_type: 'project-orders',
        source_id: 21,
        source_no: 'STYLE-L1-001',
        business_status_key: 'blocked',
        owner_role_key: 'merchandiser',
        blocked_reason: '资料未齐，等待客户确认',
        payload: {},
      },
    ],
    tasks: [
      {
        id: 9,
        task_code: 'project-orders-21',
        task_name: '客户/款式立项：毛绒熊立项',
        source_type: 'project-orders',
        source_id: 21,
        source_no: 'STYLE-L1-001',
        business_status_key: 'blocked',
        task_status_key: 'blocked',
        owner_role_key: 'merchandiser',
        blocked_reason: '资料未齐，等待客户确认',
      },
    ],
  })

  assert.equal(view.summary.recordCount, 1)
  assert.equal(view.summary.stateCount, 1)
  assert.equal(view.summary.taskCount, 1)
  assert.equal(view.summary.activeTaskCount, 1)
  assert.equal(view.summary.blockedCount, 2)
  assert.equal(view.summary.quantity, 2)
  assert.equal(view.summary.amount, 39.8)
  assert.equal(view.records[0].module_title, '客户/款式立项')
  assert.equal(view.records[0].task_count, 1)
  assert.equal(view.records[0].blocked_reason, '资料未齐，等待客户确认')
  assert.equal(view.tasks[0].module_title, '客户/款式立项')
})

test('businessChainDebug: 任务名称命中时会带出关联业务记录', () => {
  const view = buildBusinessChainDebugView({
    query: '返工确认',
    modules,
    records: [
      {
        id: 31,
        module_key: 'production-exceptions',
        document_no: 'PX-001',
        title: '车缝返工',
        business_status_key: 'production_processing',
        owner_role_key: 'production',
        payload: {},
        items: [],
      },
    ],
    tasks: [
      {
        id: 10,
        task_code: 'PX-001-TASK',
        task_name: '返工确认',
        source_type: 'production-exceptions',
        source_id: 31,
        task_status_key: 'processing',
        owner_role_key: 'quality',
        payload: {},
      },
    ],
  })

  assert.equal(view.records.length, 1)
  assert.equal(view.records[0].document_no, 'PX-001')
  assert.equal(view.tasks.length, 1)
  assert.equal(view.tasks[0].task_name, '返工确认')
})
