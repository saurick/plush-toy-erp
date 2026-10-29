import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'
import {
  buildEngineeringMaterialStageModel,
  buildCurrentTaskStageModel,
} from '../../utils/workflowTaskHandlingChain.mjs'

const taskFor = (stage = 'finance', requestID = 3) => ({
  id: 7,
  version: 4,
  task_name: '用料审批',
  source_type: 'engineering_material_request',
  source_id: requestID,
  task_status_key: 'ready',
  task_group:
    stage === 'revision'
      ? 'engineering_material_revision'
      : `engineering_material_${stage}_review`,
  task_code: `source-material-${stage}${stage === 'revision' ? '' : '-review'}-${requestID}`,
  owner_role_key: stage === 'revision' ? 'engineering' : stage,
  required_capability_key: `engineering.material.${stage === 'revision' ? 'submit' : `${stage}_approve`}`,
  payload: {
    sales_order_id: 8,
    engineering_material_request_id: requestID,
    source_task_contract: 'workflow.source-task/v1',
    source_task_producer: 'engineering_material_request.approval',
    source_task_intent_hash: 'a'.repeat(64),
  },
})
const request = {
  id: 3,
  sales_order_id: 8,
  order_status: 'active',
  status: 'BOSS_APPROVED',
  submitted_at: '2026-09-14T01:00:00Z',
  boss_reviewed_at: '2026-09-14T02:00:00Z',
  boss_review_note: '用量已核对',
}
const profile = {
  id: 12,
  permissions: ['sales_order.read', 'engineering.material.read'],
  effective_session: {
    actions: ['sales_order.read', 'engineering.material.read'],
  },
}

test('material chain uses recorded approvals and identifies the selected task without inventing future stages', () => {
  const model = buildEngineeringMaterialStageModel(taskFor(), request)
  assert.deepEqual(
    model.items.map(({ label }) => label),
    ['自动生成用料汇总', '老板审核', '财务审核']
  )
  assert.deepEqual(
    model.items.map(({ tone }) => tone),
    ['completed', 'completed', 'active']
  )
  assert.equal(model.items[2].linked, true)
  assert.equal(model.items[0].completedAt, Date.parse(request.submitted_at) / 1000)
  assert.equal(model.items[1].completedAt, Date.parse(request.boss_reviewed_at) / 1000)
  assert.equal(model.items[2].completedAt, null)
  assert.match(model.items[1].detail, /2026.*09.*14/)
  assert.match(model.items[1].detail, /用量已核对/)
  const boss = buildEngineeringMaterialStageModel(taskFor('boss'), {
    ...request,
    status: 'SUBMITTED',
    boss_reviewed_at: null,
    boss_review_note: null,
  })
  assert.deepEqual(
    boss.items.map(({ key }) => key),
    ['submit', 'boss_review']
  )
  assert.equal(boss.items[1].current, true)
})

test('approval, both rejection stages, resubmission and order closure preserve the source history boundary', () => {
  const approved = buildEngineeringMaterialStageModel(taskFor(), {
    ...request,
    status: 'APPROVED',
    finance_reviewed_at: '2026-09-14T03:00:00Z',
  })
  assert.ok(approved.items.every(({ current }) => !current))
  assert.equal(approved.items.at(-1).statusLabel, '已批准采购')
  for (const stage of ['boss', 'finance']) {
    const rejected = {
      ...request,
      status: 'REJECTED',
      rejected_at: '2026-09-14T03:00:00Z',
      review_note: '请修正用量',
      ...(stage === 'boss' ? { boss_reviewed_at: null } : {}),
    }
    const model = buildEngineeringMaterialStageModel(taskFor(stage), rejected)
    assert.equal(model.items.at(-1).key, `${stage}_review`)
    assert.equal(model.items.at(-1).tone, 'rejected')
    assert.match(model.items.at(-1).detail, /请修正用量/)
    const resubmitted = buildEngineeringMaterialStageModel(
      {
        ...taskFor('revision'),
        task_status_key: 'done',
        completed_at: 1789354800,
      },
      rejected
    )
    assert.match(resubmitted.handoffLabel, /自动重新送审.*新的用料汇总/u)
    assert.equal(resubmitted.items.at(-1).current, false)
    assert.equal(resubmitted.items.at(-1).tone, 'completed')
  }
  const closed = buildEngineeringMaterialStageModel(
    { ...taskFor(), task_status_key: 'withdrawn' },
    { ...request, order_status: 'closed' }
  )
  assert.ok(closed.items.every(({ current }) => !current))
  assert.match(closed.handoffLabel, /订单已结束/)
})

test('mismatched source, untrusted task and missing approval evidence cannot fabricate a chain', () => {
  for (const patch of [
    { id: 9 },
    { sales_order_id: 99 },
    { submitted_at: null },
    { boss_reviewed_at: null },
    { status: 'UNKNOWN' },
    { status: 'APPROVED' },
    { status: 'REJECTED' },
  ]) {
    assert.equal(
      buildEngineeringMaterialStageModel(taskFor(), { ...request, ...patch }),
      null
    )
  }
  assert.equal(
    buildEngineeringMaterialStageModel(
      { ...taskFor(), task_code: 'fake' },
      request
    ),
    null
  )
  const standalone = buildCurrentTaskStageModel({
    id: 1,
    task_name: '核对账单',
    task_status_key: 'blocked',
    owner_role_key: 'finance',
  })
  assert.equal(standalone.items.length, 1)
  assert.equal(standalone.items[0].tone, 'blocked')
  assert.match(standalone.handoffLabel, /尚无可核对的跨岗处理链/)
})

test('shared chain handles read errors, retry, source switching and permission withdrawal without stale records', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { MemoryRouter }, { default: Chain }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'),
    import('react-router-dom'),
    import('./WorkflowTaskHandlingChain.jsx'),
    import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const calls = []
  let fail = true
  let pending
  JsonRpc.prototype.call = async function call(method, params, options) {
    calls.push({ method, params, options })
    assert.equal(method, 'get_engineering_material_request')
    if (pending) return pending
    if (fail) throw new Error('read failed')
    return { data: { ...request, id: params.request_id } }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (task = taskFor(), user = profile) =>
    act(async () => root.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Chain, { task, profile: user }))))
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })
  await render()
  assert.match(container.textContent, /暂时无法读取任务处理链/)
  assert.doesNotMatch(container.textContent, /老板审核/)
  fail = false
  await act(async () => container.querySelector('button').click())
  assert.match(container.textContent, /老板审核/)
  assert.deepEqual(calls[0].params, { sales_order_id: 8, request_id: 3 })
  let resolve
  pending = new Promise((next) => {
    resolve = next
  })
  await render(taskFor('finance', 4))
  assert.doesNotMatch(container.textContent, /用量已核对/)
  assert.match(container.textContent, /正在读取/)
  const pendingRead = calls.at(-1)
  await render(taskFor('finance', 4), {
    id: 12,
    permissions: [],
    effective_session: { actions: [] },
  })
  assert.equal(pendingRead.options.signal.aborted, true)
  const count = calls.length
  await act(async () => resolve({ data: { ...request, id: 4 } }))
  assert.equal(calls.length, count)
  assert.match(container.textContent, /未开放用料审批记录查看/)
  assert.doesNotMatch(container.textContent, /用量已核对/)
  await render({ id: 30, task_name: '核对账单', task_status_key: 'ready' })
  assert.match(container.textContent, /尚无可核对的跨岗处理链/)
  assert.equal(container.querySelector('.erp-task-handling-note')?.tagName, 'P')
  assert.equal(container.querySelector('.workflow-process-stage-track'), null)
  assert.doesNotMatch(container.textContent, /本任务处理进度|核对账单/u)
  assert.equal(calls.length, count)
})

test('approved material task exposes supplier-specific purchase links only with purchase access', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { MemoryRouter }, { default: Chain }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./WorkflowTaskHandlingChain.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async () => ({ data: {
    ...request,
status: 'APPROVED',
finance_reviewed_at: '2026-09-16T02:38:04Z',
    purchase_orders: [{ id: 91, purchase_order_no: 'PO-91', supplier_name: '面料厂' }, { id: 92, purchase_order_no: 'PO-92', supplier_name: '辅料厂' }],
  } })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })
  const render = (canOpen, mobile = false) => act(async () => root.render(createElement(MemoryRouter, { key: mobile ? 'mobile' : 'desktop', initialEntries: [mobile ? '/m/engineering/tasks' : '/erp/task-board'], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Chain, {
    task: taskFor(), variant: mobile ? 'mobile' : 'desktop', profile: { ...profile, permissions: [...profile.permissions, ...(canOpen ? ['purchase.order.read'] : [])], effective_session: { actions: [...profile.effective_session.actions, ...(canOpen ? ['purchase.order.read'] : [])] } },
  }))))
  await render(true)
  assert.match(container.textContent, /已生成 2 张采购订单/)
  assert.match(container.textContent, /面料厂.*辅料厂/)
  assert.deepEqual([...container.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['/erp/purchase/accessories?purchase_order_id=91', '/erp/purchase/accessories?purchase_order_id=92'])
  await render(false)
  assert.equal(container.querySelectorAll('a').length, 0)
  assert.match(container.textContent, /PO-91/)
  await render(true, true)
  assert.equal(container.querySelectorAll('a, button[data-purchase-order-id]').length, 0, '手机保留采购摘要，不提供完整单据跳转')
  assert.match(container.textContent, /PO-91.*PO-92/u)
  assert.doesNotMatch(container.textContent, /打印本次采购合同/u)
})

test('task detail requests only its own progress and opens the order overview explicitly', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { MemoryRouter }, { default: Chain }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./WorkflowTaskHandlingChain.jsx'), import('../../../common/utils/jsonRpc.js'),
  ])
  const original = JsonRpc.prototype.call
  const views = []
  const task = { id: 801, version: 1, task_name: '处理本次返工', source_type: 'production_fact', source_id: 41, task_status_key: 'ready', owner_role_key: 'production' }
  const user = { id: 12, permissions: ['workflow.task.read'], effective_session: { actions: ['workflow.task.read'] } }
  JsonRpc.prototype.call = async (method, params) => {
    assert.equal(method, 'get_task_handling_chain')
    views.push(params.view)
    return { data: { truncated: false,
items: [
      { ...task, id: params.task_id },
      { ...task, id: 802, task_name: '本次返工复检', source_type: 'quality_inspection', task_status_key: 'blocked' },
      ...(params.view === 'order' ? [{ ...task, id: 803, task_name: '另一张采购单收货', source_type: 'purchase_order', task_status_key: 'blocked' }] : []),
    ] } }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); JsonRpc.prototype.call = original; dom.restore() })
  const render = (id = 801) => act(async () => root.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Chain, { task: { ...task, id }, profile: user }))))
  await render()
  assert.deepEqual(views, ['task'])
  assert.match(container.textContent, /本次返工复检/u)
  assert.doesNotMatch(container.textContent, /另一张采购单收货|其他关联任务|接单与用料/u)
  assert.equal(container.querySelectorAll('details').length, 0)
  assert.equal(container.querySelectorAll('li').length, 2)
  assert.match(container.querySelector('li[aria-current="step"]').textContent, /生产经理 · 未指定办理人 · 待办理/u)
  const pending = container.querySelector('[aria-label="关联待办"]')
  assert.equal(pending.querySelectorAll('li').length, 1)
  assert.match(pending.textContent, /本次返工复检.*生产经理 · 阻塞/u)
  assert.doesNotMatch(container.textContent, /岗位待领取|可执行/u)
  await act(async () => container.querySelector('button').click())
  assert.deepEqual(views, ['task', 'order'])
  assert.match(container.textContent, /订单全流程|另一张采购单收货/u)
  await act(async () => container.querySelector('button').click())
  assert.match(container.textContent, /本任务处理进度/u)
  assert.doesNotMatch(container.textContent, /另一张采购单收货/u)
  await act(async () => container.querySelector('button').click())
  await render(804)
  assert.equal(views.at(-1), 'task')
  assert.doesNotMatch(container.textContent, /另一张采购单收货/u)
})
