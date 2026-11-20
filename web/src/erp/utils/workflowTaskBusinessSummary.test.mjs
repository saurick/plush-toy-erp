import assert from 'node:assert/strict'
import test from 'node:test'
import { workflowTaskBusinessSummary } from './workflowTaskBusinessSummary.mjs'

test('receipt copies confirmed business state, per-line units and server time without deriving task completion', () => {
  const record = { id: 3,
receipt_no: 'RC-3',
status: 'DRAFT',
updated_at: 1800000000,
    items: [{ material_name_snapshot: '面料', received_quantity: '2.50', unit_name: '米' }, { material_name: '填充棉', required_quantity: '0.125', unit_name: '公斤' }] }
  const summary = workflowTaskBusinessSummary(record, { actorLabel: '仓库 · 王芳' })
  assert.equal(summary.recordNo, 'RC-3')
  assert.equal(summary.actorLabel, '仓库 · 王芳')
  assert.ok(summary.timeLabel)
  assert.deepEqual(summary.fields, [{ label: '业务状态', value: '草稿' }])
  assert.deepEqual(summary.items, [{ label: '面料', quantity: '2.50', unit: '米' }, { label: '填充棉', quantity: '0.125', unit: '公斤' }])
  record.items[0].received_quantity = '900'
  assert.equal(summary.items[0].quantity, '2.50')
  assert.equal(Object.hasOwn(summary, 'task_status_key'), false)
})

test('material and BOM receipts retain their distinct states and missing values stay absent', () => {
  const material = workflowTaskBusinessSummary({ status: 'BOSS_APPROVED', boss_reviewed_at: '2026-10-27T10:00:00+08:00', items: [{ material_name: 'PP 棉', required_quantity: '1.25', unit_name: '公斤' }] })
  assert.equal(material.fields[0].value, '待财务审核')
  assert.ok(material.timeLabel)
  const bom = workflowTaskBusinessSummary({ product_id: 3, version: 'V2', status: 'DRAFT' })
  assert.equal(bom.recordType, 'BOM')
  assert.equal(bom.recordNo, 'V2')
  assert.equal(workflowTaskBusinessSummary({ packaging_version_snapshot: '彩盒 V3', status: 'CONFIRMED' }).fields.find((field) => field.label === '包装版本').value, '彩盒 V3')
  const empty = workflowTaskBusinessSummary({ access_token: 'must never copy', amount: 'NaN', updated_at: 'invalid', payload: { status: 'POSTED' } })
  assert.equal(empty.fields.length, 0)
  assert.equal(empty.timeLabel, '')
  assert.equal(empty.actorLabel, '')
  assert.equal(JSON.stringify(empty).includes('must never copy'), false)
})

test('long receipts bound their rendered rows without hiding the confirmed row count', () => {
  const summary = workflowTaskBusinessSummary({ items: Array.from({ length: 500 }, (_, i) => ({ line_no: i + 1, quantity: '1', unit_name: '个' })) })
  assert.equal(summary.items.length, 20)
  assert.equal(summary.itemCount, 500)
})

test('质检任务回执从正式判定区分不合格和让步接收', () => {
  for (const [status, result, label] of [['PASSED', 'PASS', '合格'], ['PASSED', 'CONCESSION', '让步接收'], ['REJECTED', 'REJECT', '不合格']]) {
    const summary = workflowTaskBusinessSummary({ inspection_no: 'QC-031', status, result, decision_note: '按本批检验记录判定' })
    const fields = Object.fromEntries(summary.fields.map((field) => [field.label, field.value]))
    assert.equal(fields['检验结论'], label)
    assert.equal(fields['判定意见'], '按本批检验记录判定')
    assert.equal(fields['业务状态'], status === 'REJECTED' ? '不合格' : '合格')
  }
  const pending = workflowTaskBusinessSummary({ inspection_no: 'QC-032', status: 'SUBMITTED' })
  assert.deepEqual(pending.fields, [{ label: '业务状态', value: '已提交' }])
})

test('异常处置回执分别读取审批结论、实际执行状态与原因', () => {
  const record = { decision_no: 'PE-7', status: 'APPROVED', approved_quantity: '12', decision_reason: '同意报废' }
  for (const [execution_status, expected] of [['PENDING', '待业务办理'], ['APPLIED', '业务已执行'], ['REVERSED', '业务已冲正']]) {
    const { fields } = workflowTaskBusinessSummary({ ...record, execution_status })
    assert.deepEqual(Object.fromEntries(fields.map(({ label, value }) => [label, value])), {
      审批状态: '已批准', 业务状态: expected, 批准数量: '12', 审批意见: '同意报废',
    })
  }
})
