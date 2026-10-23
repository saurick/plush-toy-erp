import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DESIGN_TASKS, DESIGN_TASK_NOW, DESIGN_PROGRESS, WORK_CENTER_DESIGN_TOPICS, designTaskPresentation, getWorkCenterDesignHref } from './devWorkCenterDesign.mjs'
import { getWorkflowTaskTiming } from '../../erp/utils/workflowTaskTiming.mjs'
import { getWorkflowTaskIdentityPresentation } from '../../erp/utils/workflowTaskIdentity.mjs'

const root = path.resolve(import.meta.dirname, '../../../..')
const taskByID = (id) => DESIGN_TASKS.find((item) => item.id === id)
test('设计样例没有可读取的业务产品或附件标识', () => {
  for (const task of DESIGN_TASKS) {
    assert.equal(Number(task.source_id || 0), 0, task.id)
    for (const item of task.display_context.items) {
      // Also check unavailable source contents, which presentation intentionally hides.
      const identity = getWorkflowTaskIdentityPresentation({ display_context: { available: true, items: [item] } })
      assert.equal(Number(identity.first.productID || 0), 0, task.id)
      assert.equal(Number(identity.first.imageAttachmentID || 0), 0, task.id)
    }
  }
  for (const row of DESIGN_PROGRESS) assert.equal(row.product_id, 0, row.key)
})
test('设计样例覆盖有截止、未设置截止与结束时间缺失，使用同一时间语义', () => {
  const time = (id) => getWorkflowTaskTiming(taskByID(id), { nowMs: DESIGN_TASK_NOW }).filter((row) => ['due', 'ended'].includes(row.key))
  assert.equal(time('product')[0].state, 'recorded')
  assert.equal(time('task')[0].value, '未设置截止')
  assert.equal(time('ended-undated')[0].value, '结束时间未记录')
  assert.equal(time('ended-undated')[0].tone, 'neutral')
  assert.equal(time('invalid-date')[0].value, '时间待核对')
  assert.equal(time('invalid-date')[0].tone, 'neutral')
})
test('任务标题固定表达办理事项，五类常规关联各有明确计数', () => {
  const values = DESIGN_TASKS.filter((item) => item.group === 'common').map(designTaskPresentation)
  assert.equal(values.length, 5)
  assert.deepEqual(values.map((item) => item.title), ['准备并办理发货', '核对多款产品发货资料', '核对辅料到货差异', '核对包装齐套资料', '核对收款说明'])
  assert.deepEqual(values.map((item) => item.count), ['', '共 3 款产品', '', '共 2 项关联内容', ''])
  assert.equal(values[0].productName, '示例毛绒狐狸')
  assert.equal(values[0].source, '出货单 · DEMO-CK-001')
  const task = designTaskPresentation(taskByID('task'))
  assert.equal(task.productName, '')
  assert.equal(task.reference, '')
  assert.equal(task.hasProduct, false)
  assert.equal(task.source, '收付款与核销 · DEMO-SK-002')
  const missing = designTaskPresentation(taskByID('blocked'))
  assert.equal(missing.title, '确认颜色')
  assert.equal(missing.reference, '产品编号未填写')
  assert.equal(missing.source, '未关联业务单据')
  assert.equal(Object.hasOwn(missing, 'simulated'), false)
  for (const display_context of [{ available: true, items: [] }, { available: false, items: taskByID('product').display_context.items }]) {
    const value = designTaskPresentation({ ...taskByID('task'), payload: { product_name: '旧产品', product_code: 'OLD' }, display_context })
    assert.equal(value.hasProduct, false)
    assert.equal(value.title, '核对收款说明')
    assert.equal(value.productName, '')
    assert.equal(value.reference, '')
    assert.equal(value.order, '')
    assert.equal(value.count, '')
  }
})
test('办理责任区分未指定与已指定人员，姓名缺失不改变指派事实', () => {
  assert.equal(designTaskPresentation(taskByID('product')).responsibility, '业务 · 示例业务员')
  assert.equal(designTaskPresentation(taskByID('task')).responsibility, '财务 · 未指定办理人')
  assert.equal(designTaskPresentation(taskByID('customer')).responsibility, '业务 · 已指定办理人')
})
test('进度示意区分交付、生产与多单位，不制造统一比例', () => {
  assert.deepEqual(DESIGN_PROGRESS.map((item) => [item.delivery.label, item.delivery.text, item.delivery.percent]), [
    ['已出货 / 订购', '720 / 1000 只', 72],
    ['有效完工 / 计划', '800 / 1000 只', 80],
    ['出货进度', '多单位 · 查看明细', undefined],
    ['出货进度', '关联待核对', undefined],
  ])
})
test('界面说明覆盖工作中心，按疑点组织少量编号与理由并链接正式来源', () => {
  assert.deepEqual(WORK_CENTER_DESIGN_TOPICS.map((item) => item.key), ['task-cards', 'task-handling', 'work-progress', 'work-tracking', 'work-exceptions', 'work-results', 'work-overview', 'mobile-entry'])
  for (const topic of WORK_CENTER_DESIGN_TOPICS) {
    assert(topic.points.length >= 2 && topic.points.length <= 4)
    assert.equal(new Set(topic.points.map((point) => point.key)).size, topic.points.length)
    for (const point of topic.points) assert(point.title && point.shows && point.when && point.why)
    for (const file of topic.sources) assert(existsSync(path.join(root, file)), file)
    for (const device of topic.devices) {
      const url = new URL(getWorkCenterDesignHref(topic.key, device), 'http://localhost')
      assert.equal(url.searchParams.get('view'), 'specification')
      assert.equal(url.searchParams.get('topic'), topic.key)
      assert.equal(url.searchParams.get('page'), device === 'mobile' ? 'mobile-tasks' : null)
    }
  }
})
