import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMobileTaskListForRole,
  buildMobileTaskSummary,
  buildMobileTaskView,
  normalizeRelatedDocuments,
} from './mobileTaskView.mjs'

const NOW_SEC = 1_800_000_000
const NOW_MS = NOW_SEC * 1000

function task(overrides = {}) {
  return {
    id: 1,
    task_name: '移动端测试任务',
    task_group: 'production',
    task_status_key: 'ready',
    business_status_key: 'qc_pending',
    owner_role_key: 'quality',
    source_type: 'quality-inspections',
    source_id: 8,
    source_no: 'QC000008',
    priority: 0,
    due_at: NOW_SEC + 60 * 60,
    payload: {},
    ...overrides,
  }
}

test('mobileTaskView: due_at 与状态中文 label 计算正确', () => {
  const view = buildMobileTaskView(task(), { nowMs: NOW_MS })

  assert.equal(view.due_status, 'due_soon')
  assert.equal(view.due_status_label, '即将到期')
  assert.equal(view.task_status_label, '可执行')
  assert.equal(view.business_status_label, '待检验')
  assert.equal(view.source_no, 'QC000008')
  assert.equal(view.source_type, 'quality-inspections')
  assert.equal(view.source_id, 8)
})

test('mobileTaskView: alert_level / alert_label 和 payload 字段读取正确', () => {
  const view = buildMobileTaskView(
    task({
      payload: {
        qc_result: 'failed',
        complete_condition: '返工复检通过后放行',
        related_documents: ['IN000001', 'PO000001'],
        urge_count: 1,
      },
    }),
    { nowMs: NOW_MS }
  )

  assert.equal(view.alert_level, 'critical')
  assert.equal(view.alert_label, '质检不合格')
  assert.equal(view.complete_condition, '返工复检通过后放行')
  assert.deepEqual(view.related_documents, ['IN000001', 'PO000001'])
  assert.equal(view.is_urged, true)
})

test('mobileTaskView: 空 payload 不报错并提供安全默认值', () => {
  const view = buildMobileTaskView(task({ payload: null }), { nowMs: NOW_MS })

  assert.deepEqual(view.payload, {})
  assert.equal(view.complete_condition, '')
  assert.deepEqual(view.related_documents, [])
})

test('mobileTaskView: 角色任务列表按扩展规则过滤', () => {
  const tasks = [
    task({ id: 1, owner_role_key: 'quality' }),
    task({
      id: 2,
      owner_role_key: 'warehouse',
      source_type: 'shipping-release',
      due_at: NOW_SEC + 60 * 60,
    }),
    task({
      id: 3,
      owner_role_key: 'finance',
      source_type: 'receivables',
      due_at: NOW_SEC - 60,
    }),
    task({
      id: 4,
      owner_role_key: 'purchasing',
      source_type: 'accessories-purchase',
      task_status_key: 'blocked',
    }),
  ]

  assert.deepEqual(
    buildMobileTaskListForRole(tasks, 'quality', { nowMs: NOW_MS }).map(
      (item) => item.id
    ),
    [1]
  )
  assert(
    buildMobileTaskListForRole(tasks, 'pmc', { nowMs: NOW_MS })
      .map((item) => item.id)
      .includes(4)
  )
  assert(
    buildMobileTaskListForRole(tasks, 'boss', { nowMs: NOW_MS })
      .map((item) => item.id)
      .includes(3)
  )
  assert.deepEqual(
    buildMobileTaskListForRole(tasks, 'finance', { nowMs: NOW_MS }).map(
      (item) => item.id
    ),
    [3]
  )
})

test('mobileTaskView: 老板能看到订单审批任务并读取审批提醒', () => {
  const views = buildMobileTaskListForRole(
    [
      task({
        id: 9,
        owner_role_key: 'boss',
        source_type: 'project-orders',
        task_group: 'order_approval',
        business_status_key: 'project_pending',
        due_at: NOW_SEC + 3 * 24 * 60 * 60,
        payload: {
          notification_type: 'approval_required',
          alert_type: 'approval_pending',
          complete_condition: '老板审批通过或驳回',
          related_documents: ['客户/款式立项记录：PO-001'],
        },
      }),
    ],
    'boss',
    { nowMs: NOW_MS }
  )

  assert.equal(views.length, 1)
  assert.equal(views[0].alert_label, '待审批')
  assert.equal(views[0].complete_condition, '老板审批通过或驳回')
  assert.deepEqual(views[0].related_documents, ['客户/款式立项记录：PO-001'])
})

test('mobileTaskView: 品质和仓库能看到采购到货闭环任务字段', () => {
  const qualityViews = buildMobileTaskListForRole(
    [
      task({
        id: 10,
        owner_role_key: 'quality',
        source_type: 'inbound',
        task_group: 'purchase_iqc',
        business_status_key: 'iqc_pending',
        due_at: NOW_SEC + 3 * 24 * 60 * 60,
        payload: {
          complete_condition: '品质完成来料检验',
          related_documents: ['到货记录：IN-001'],
          supplier_name: '联调供应商',
          material_name: 'PP 棉',
          quantity: 120,
          unit: 'kg',
        },
      }),
    ],
    'quality',
    { nowMs: NOW_MS }
  )
  const warehouseViews = buildMobileTaskListForRole(
    [
      task({
        id: 11,
        owner_role_key: 'warehouse',
        source_type: 'inbound',
        task_group: 'warehouse_inbound',
        business_status_key: 'warehouse_inbound_pending',
        due_at: NOW_SEC + 3 * 24 * 60 * 60,
        payload: {
          qc_result: 'pass',
          complete_condition: '仓库确认入库数量',
          related_documents: ['IQC 结果：pass'],
        },
      }),
    ],
    'warehouse',
    { nowMs: NOW_MS }
  )

  assert.equal(qualityViews[0].business_status_label, 'IQC 待检')
  assert.equal(qualityViews[0].complete_condition, '品质完成来料检验')
  assert.equal(qualityViews[0].payload.supplier_name, '联调供应商')
  assert.equal(warehouseViews[0].business_status_label, '待确认入库')
  assert.equal(warehouseViews[0].payload.qc_result, 'pass')
})

test('mobileTaskView: 委外回货任务按生产 品质 仓库 PMC 视角展示', () => {
  const tasks = [
    task({
      id: 21,
      owner_role_key: 'production',
      source_type: 'processing-contracts',
      task_group: 'outsource_return_tracking',
      business_status_key: 'production_processing',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'outsource_return_pending',
        complete_condition: '加工商完成回货登记',
        related_documents: ['加工合同：PC-001'],
        supplier_name: '联调加工厂',
        product_name: '兔子挂件',
        quantity: 300,
        unit: 'pcs',
        outsource_processing: true,
      },
    }),
    task({
      id: 22,
      owner_role_key: 'quality',
      source_type: 'processing-contracts',
      task_group: 'outsource_return_qc',
      business_status_key: 'qc_pending',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'outsource_return_qc_pending',
        complete_condition: '品质完成委外回货检验',
        related_documents: ['回货记录：IN-001'],
        outsource_processing: true,
        critical_path: true,
      },
    }),
    task({
      id: 23,
      owner_role_key: 'warehouse',
      source_type: 'processing-contracts',
      task_group: 'outsource_warehouse_inbound',
      business_status_key: 'warehouse_inbound_pending',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'inbound_pending',
        complete_condition: '仓库确认委外回货入库数量、库位和经手人',
        related_documents: ['委外回货检验结果：pass'],
        outsource_processing: true,
        critical_path: true,
      },
    }),
    task({
      id: 24,
      owner_role_key: 'production',
      source_type: 'processing-contracts',
      task_group: 'outsource_rework',
      business_status_key: 'qc_failed',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'qc_failed',
        notification_type: 'qc_failed',
        complete_condition: '生产/委外负责人确认返工或补做',
        related_documents: ['不良记录：QC-001'],
        outsource_processing: true,
        critical_path: true,
      },
    }),
  ]

  assert.deepEqual(
    buildMobileTaskListForRole(tasks, 'production', { nowMs: NOW_MS }).map(
      (item) => item.id
    ),
    [24, 21]
  )

  const qualityViews = buildMobileTaskListForRole(tasks, 'quality', {
    nowMs: NOW_MS,
  })
  const warehouseViews = buildMobileTaskListForRole(tasks, 'warehouse', {
    nowMs: NOW_MS,
  })
  const pmcViews = buildMobileTaskListForRole(tasks, 'pmc', { nowMs: NOW_MS })

  assert.equal(
    qualityViews.some((item) => item.id === 22),
    true
  )
  assert.equal(
    qualityViews.find((item) => item.id === 22).alert_label,
    '委外回货待检验'
  )
  assert.equal(
    warehouseViews.some((item) => item.id === 23),
    true
  )
  assert.match(
    warehouseViews.find((item) => item.id === 23).complete_condition,
    /委外回货入库数量/
  )
  assert.equal(
    pmcViews.some((item) => item.id === 24),
    true
  )
  assert.equal(pmcViews.find((item) => item.id === 24).alert_level, 'critical')
})

test('mobileTaskView: 成品抽检 入库 出货任务按角色视角展示', () => {
  const tasks = [
    task({
      id: 31,
      owner_role_key: 'quality',
      source_type: 'production-progress',
      task_group: 'finished_goods_qc',
      business_status_key: 'qc_pending',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'finished_goods_qc_pending',
        complete_condition: '品质完成成品抽检',
        related_documents: ['生产进度：PP-001'],
        finished_goods: true,
        critical_path: true,
      },
    }),
    task({
      id: 32,
      owner_role_key: 'warehouse',
      source_type: 'production-progress',
      task_group: 'finished_goods_inbound',
      business_status_key: 'warehouse_inbound_pending',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'finished_goods_inbound_pending',
        complete_condition: '仓库确认成品入库数量、库位和经手人',
        related_documents: ['成品抽检结果：pass'],
        finished_goods: true,
        critical_path: true,
      },
    }),
    task({
      id: 33,
      owner_role_key: 'warehouse',
      source_type: 'production-progress',
      task_group: 'shipment_release',
      business_status_key: 'shipment_pending',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'shipment_pending',
        complete_condition: '确认出货数量、装箱、唛头、客户要求和出货状态',
        related_documents: ['成品入库记录：IN-001'],
        finished_goods: true,
        critical_path: true,
        confirm_role_key: 'merchandiser',
      },
    }),
    task({
      id: 34,
      owner_role_key: 'production',
      source_type: 'production-progress',
      task_group: 'finished_goods_rework',
      business_status_key: 'qc_failed',
      due_at: NOW_SEC + 3 * 24 * 60 * 60,
      payload: {
        alert_type: 'qc_failed',
        notification_type: 'qc_failed',
        complete_condition: '生产确认返工完成',
        related_documents: ['成品抽检不良记录：QC-001'],
        finished_goods: true,
        critical_path: true,
      },
    }),
  ]

  const qualityViews = buildMobileTaskListForRole(tasks, 'quality', {
    nowMs: NOW_MS,
  })
  const warehouseViews = buildMobileTaskListForRole(tasks, 'warehouse', {
    nowMs: NOW_MS,
  })
  const productionViews = buildMobileTaskListForRole(tasks, 'production', {
    nowMs: NOW_MS,
  })
  const pmcViews = buildMobileTaskListForRole(tasks, 'pmc', { nowMs: NOW_MS })
  const merchandiserViews = buildMobileTaskListForRole(tasks, 'merchandiser', {
    nowMs: NOW_MS,
  })

  assert.equal(
    qualityViews.some((item) => item.id === 31),
    true
  )
  assert.equal(
    qualityViews.find((item) => item.id === 31).alert_label,
    '成品抽检待处理'
  )
  assert.deepEqual(
    warehouseViews.map((item) => item.id),
    [32, 33]
  )
  assert.equal(
    productionViews.some((item) => item.id === 34),
    true
  )
  assert.equal(
    pmcViews.some((item) => item.id === 34),
    true
  )
  assert.equal(pmcViews.find((item) => item.id === 34).alert_level, 'critical')
  assert.equal(
    merchandiserViews.some((item) => item.id === 33),
    true
  )
  assert.match(
    merchandiserViews.find((item) => item.id === 33).complete_condition,
    /出货数量/
  )
})

test('mobileTaskView: 预警摘要统计可用于移动端顶部卡片', () => {
  const views = buildMobileTaskListForRole(
    [
      task({
        id: 1,
        owner_role_key: 'quality',
        payload: { qc_result: 'failed' },
      }),
      task({ id: 2, owner_role_key: 'quality', due_at: NOW_SEC - 60 }),
      task({ id: 3, owner_role_key: 'quality', priority: 3 }),
      task({ id: 4, owner_role_key: 'quality', task_status_key: 'blocked' }),
    ],
    'quality',
    { nowMs: NOW_MS }
  )
  const summary = buildMobileTaskSummary(views)

  assert.equal(summary.alerts, 4)
  assert.equal(summary.overdue, 1)
  assert.equal(summary.blocked, 1)
  assert.equal(summary.highPriority, 1)
  assert.deepEqual(normalizeRelatedDocuments('INV000001'), ['INV000001'])
})
