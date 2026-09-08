import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatWorkflowProductCopy,
  formatWorkflowTaskCopy,
} from './workflowTaskCopy.mjs'
import {
  getWorkflowTaskSourceNo,
  formatWorkflowTaskSource,
} from './dashboardTaskDisplay.mjs'

const task = {
  id: 42,
  task_code: 'TASK-INTERNAL-42',
  task_name: '确认样品尺寸',
  task_status_key: 'ready',
  owner_role_key: 'engineering',
  source_type: 'sales_order',
  source_id: 8,
  source_no: 'SO-OLD',
  display_context: {
    available: true,
    source_no: 'SO-NEW',
    items: [
      {
        kind: 'product',
        name: '长耳兔抱枕',
        style_no: 'RB-018',
        code: 'P-018',
        order_no: 'SO-NEW',
      },
      { kind: 'material', name: '短毛绒', code: 'ML-001' },
    ],
  },
  payload: { product_name: '旧产品', style_no: 'OLD' },
}

test('task copy uses the current product and document projection and includes every item', () => {
  const result = formatWorkflowTaskCopy(task, { assigneeLabel: '小陈' })
  for (const expected of [
    '任务：确认样品尺寸',
    '产品：长耳兔抱枕',
    '内部款号：RB-018',
    '产品编号：P-018',
    '物料：短毛绒',
    '系统物料编号：ML-001',
    '关联单据：销售订单 · SO-NEW',
    '负责：工程 · 小陈',
  ]) {
    assert.ok(result.includes(expected), expected)
  }
  assert.doesNotMatch(
    result,
    /SO-OLD|旧产品|TASK-INTERNAL|#42|未填写|未记录|undefined/
  )
})

test('unavailable and cleared source projections never copy stale source or product snapshots', () => {
  for (const display_context of [
    {
      available: false,
      source_no: 'SECRET',
      items: task.display_context.items,
    },
    { available: true, source_no: '', items: [] },
  ]) {
    const record = { ...task, display_context }
    assert.equal(getWorkflowTaskSourceNo(record), '')
    assert.doesNotMatch(
      formatWorkflowTaskCopy(record),
      /SO-|SECRET|长耳兔|短毛绒|旧产品|OLD/
    )
  }
  assert.equal(
    formatWorkflowTaskSource({
      ...task,
      display_context: { available: false },
    }),
    '关联单据已不可用'
  )
})

test('single-field source copy uses raw business references and excludes internal or simulated references', () => {
  assert.equal(getWorkflowTaskSourceNo(task), 'SO-NEW')
  for (const source_no of ['', '8', '#8', 'ID-8', 'TASK-8']) {
    assert.equal(getWorkflowTaskSourceNo({ source_id: 8, source_no }), '')
  }
  assert.equal(
    getWorkflowTaskSourceNo({ ...task, payload: { simulated_only: true } }),
    ''
  )
  assert.equal(
    getWorkflowTaskSourceNo({
      ...task,
      source_type: 'simulated-manual-acceptance-task-batch',
    }),
    ''
  )
})

test('product copy omits blank fields and redundant product identifiers', () => {
  assert.equal(
    formatWorkflowProductCopy([
      {
        kind: 'product',
        name: '  长耳兔  ',
        styleNo: 'RB-018',
        code: 'RB-018',
      },
    ]),
    '产品：长耳兔\n产品编号：RB-018'
  )
  assert.equal(
    formatWorkflowProductCopy([{ kind: 'material', name: '', code: '' }]),
    ''
  )
  assert.equal(formatWorkflowProductCopy([]), '')
})

test('supplier item copy preserves full text and separates the internal material number', () => {
  const material = {
    kind: 'material',
    name: '短毛绒',
    code: 'MAT-1',
    supplierItemNo: '示例织造AB-001#-02#米白',
  }
  assert.equal(
    formatWorkflowProductCopy([material]),
    '物料：短毛绒\n款号：示例织造AB-001#-02#米白\n系统物料编号：MAT-1'
  )
  assert.equal(
    formatWorkflowProductCopy([{ ...material, supplierItemNo: '' }]),
    '物料：短毛绒\n系统物料编号：MAT-1'
  )
  assert.equal(
    formatWorkflowProductCopy([{ ...material, supplierItemNo: '客供' }]),
    '物料：短毛绒\n款号：客供\n系统物料编号：MAT-1'
  )
})

test('copied dates are complete local dates and do not change meaning when forwarded', () => {
  const result = formatWorkflowTaskCopy({
    ...task,
    created_at: new Date(2026, 8, 8, 9, 0).getTime() / 1000,
    due_at: new Date(2026, 8, 9, 15, 30).getTime() / 1000,
    updated_at: new Date(2026, 8, 10, 18, 0).getTime() / 1000,
  })
  assert.match(result, /进入本岗：2026年9月8日 09:00/)
  assert.match(result, /处理截止：2026年9月9日 15:30/)
  assert.doesNotMatch(result, /今天|明天|昨天|18:00/)
})

test('completed tasks retain the recorded end time and missing dates do not become placeholders', () => {
  const result = formatWorkflowTaskCopy({
    ...task,
    task_status_key: 'done',
    completed_at: new Date(2026, 8, 8, 11, 0).getTime() / 1000,
  })
  assert.match(result, /结束时间：2026年9月8日 11:00/)
  assert.doesNotMatch(result, /进入本岗|处理截止|未设置|未记录/)
  assert.equal(formatWorkflowTaskCopy({}), '')
})

test('task summary follows the current reason and does not revive a previous blockage', () => {
  const blocked = {
    ...task,
    task_status_key: 'blocked',
    blocked_reason: '客户尚未确认耳长尺寸。',
  }
  assert.match(
    formatWorkflowTaskCopy(blocked),
    /阻塞原因：客户尚未确认耳长尺寸。/
  )
  const restored = {
    ...blocked,
    task_status_key: 'ready',
    blocked_reason: '',
    payload: { ...task.payload, blocked_reason: '过期原因' },
  }
  assert.doesNotMatch(
    formatWorkflowTaskCopy(restored),
    /阻塞原因|过期原因|尚未确认/
  )
})
