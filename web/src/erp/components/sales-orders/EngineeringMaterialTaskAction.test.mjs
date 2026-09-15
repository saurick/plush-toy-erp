import { act, createElement, useState } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'

const taskFor = (stage) => ({
  id: 7,
  version: 4,
  task_name: '工程用料办理',
  source_id: 3,
  source_type: 'engineering_material_request',
  task_status_key: 'ready',
  task_group:
    stage === 'revision'
      ? 'engineering_material_revision'
      : `engineering_material_${stage}_review`,
  task_code: `source-material-${stage}${stage === 'revision' ? '' : '-review'}-3`,
  owner_role_key: stage === 'revision' ? 'engineering' : stage,
  required_capability_key: `engineering.material.${stage === 'revision' ? 'submit' : `${stage}_approve`}`,
  payload: {
    sales_order_id: 8,
    engineering_material_request_id: 3,
    source_task_contract: 'workflow.source-task/v1',
    source_task_producer: 'engineering_material_request.approval',
    source_task_intent_hash: 'a'.repeat(64),
  },
})

async function setup(t, { stage = 'boss', mobile = false } = {}) {
  const dom = installTestDOM()
  window.HTMLElement.prototype.scrollIntoView = () => {}
  const { createRoot } = await import('react-dom/client')
  registerJSXTestLoader()
  const [
    { default: TaskAction },
    { default: Drawer },
    { default: ActionScreen },
    { default: SummaryEntry },
    { MemoryRouter },
    { JsonRpc },
  ] = await Promise.all([
    import('./EngineeringMaterialTaskAction.jsx'),
    import('../workflow/WorkflowTaskActionDrawer.jsx'),
    import('../../mobile/components/MobileTaskActionScreen.jsx'),
    import('./EngineeringMaterialTaskSummaryEntry.jsx'),
    import('react-router-dom'),
    import('../../../common/utils/jsonRpc.js'),
  ])
  const task = taskFor(stage)
  const profile = {
    id: 12,
    effective_session: {
      actions: [
        'sales_order.read',
        'engineering.material.read',
        'field.procurement_commercial.read',
        task.required_capability_key,
      ],
    },
  }
  profile.permissions = [...profile.effective_session.actions]
  const request = {
    id: 3,
    version: 2,
    sales_order_id: 8,
    source_order_version: 11,
    source_hash: 'b'.repeat(64),
    order_no: 'ORDER-8',
    order_status: 'active',
    status:
      stage === 'boss'
        ? 'SUBMITTED'
        : stage === 'finance'
          ? 'BOSS_APPROVED'
          : 'REJECTED',
    items: [
      {
        id: 21,
        material_id: 1,
        unit_id: 1,
        unit_name: 'Y',
        material_name: '测试布料',
        required_quantity: '3.125',
        parts: [],
      },
    ],
    sources: [],
    issues: [],
    purchase_orders: [],
  }
  const calls = []
  let nextMutation
  let mutationResult
  let readFailure = false
  let receipt
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method, params, options) {
    calls.push({ method, params, options })
    if (method === 'list_task_events') {
      return { data: { items: [], truncated: false } }
    }
    if (method === 'get_engineering_material_request') {
      if (readFailure) throw new Error('read failed')
      return {
        data: {
          ...request,
          ...(params.preview ? { status: 'PREVIEW', id: 0 } : {}),
        },
      }
    }
    assert.match(
      method,
      /^(boss_review|finance_review|submit)_engineering_material_request$/
    )
    if (nextMutation) await nextMutation
    if (mutationResult) return { data: mutationResult }
    return {
      data: {
        ...request,
        version: 3,
        status:
          params.action === 'REJECT'
            ? 'REJECTED'
            : stage === 'boss'
              ? 'BOSS_APPROVED'
              : stage === 'finance'
                ? 'APPROVED'
                : 'SUBMITTED',
      },
    }
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const draftRef = { current: null }
  const leaveGuardRef = { current: null }
  function Harness() {
    const [busy, setBusy] = useState(false)
    const [result, setResult] = useState(null)
    const renderSourceAction = (render) =>
      createElement(TaskAction, {
        task,
        profile,
        mobile,
        render,
        draftRef,
        leaveGuardRef,
        onBusyChange: setBusy,
        onChanged: (value, details) => {
          receipt = { value, ...details }
          setResult({
            successMessage: details.successMessage,
            actionTitle: '审批通过',
            statusLabel: value.status,
          })
        },
      })
    return mobile
      ? createElement(ActionScreen, { task, renderSourceAction })
      : createElement(Drawer, {
          task,
          sourceSummary: createElement(SummaryEntry, { task, profile, draftRef }),
          actionSaving: busy,
          actionReceipt: result,
          renderSourceAction,
        })
  }
  const render = async () =>
    act(async () =>
      root.render(
        createElement(
          MemoryRouter,
          {
            future: { v7_startTransition: true, v7_relativeSplatPath: true },
          },
          createElement(Harness)
        )
      )
    )
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (node) =>
        node.textContent.replace(/\s/gu, '') === label.replace(/\s/gu, '')
    )
  const click = async (node) => {
    assert.ok(node, 'expected control')
    await act(async () => node.click())
  }
  const fill = async (selector, value) => {
    const input = document.querySelector(selector)
    assert.ok(input, selector)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype,
        'value'
      ).set
      setter.call(input, value)
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
  }
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })
  return {
    render,
    prepareFinance: async () => {
      if (mobile) {
        await act(async () => root.render(
          createElement(MemoryRouter,
            { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
            createElement(SummaryEntry, { task, profile, mobile, draftRef })
          )
        ))
      } else {
        await click(document.querySelector('#erp-task-action-step-context-tab'))
      }
      await click(button('填写核价'))
    },
    resumeFinance: async () => {
      await click(button('保留填写，返回核对'))
      if (mobile) await render()
      else await click(document.querySelector('#erp-task-action-step-action-tab'))
    },
    hide: async () => act(async () => root.render(null)),
    button,
    click,
    fill,
    calls,
    request,
    task,
    profile,
    draftRef,
    leaveGuardRef,
    get receipt() {
      return receipt
    },
    set mutation(value) {
      nextMutation = value
    },
    set mutationResult(value) {
      mutationResult = value
    },
    set readFailure(value) {
      readFailure = value
    },
  }
}

test('desktop material processing stays inside the task tab and confirms the versioned source action once', async (t) => {
  const ui = await setup(t)
  await ui.render()
  assert.equal(
    ui.calls.some(
      ({ method }) => method === 'get_engineering_material_request'
    ),
    false
  )
  await ui.click(ui.button('处理任务'))
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  assert.match(
    document.querySelector('[role="tab"][aria-selected="true"]').textContent,
    /处理任务/
  )
  assert.equal(
    document.querySelector('#erp-task-action-step-action .erp-material-sheet'),
    null
  )
  assert.equal(document.querySelector('[aria-label="采购金额合计"]'), null)
  assert.ok(
    document.querySelector(
      '.ant-drawer-footer .erp-material-task-action__footer'
    )
  )
  let resolveMutation
  ui.mutation = new Promise((resolve) => {
    resolveMutation = resolve
  })
  await ui.click(ui.button('确认通过，交财务'))
  await ui.click(ui.button('确认通过，交财务'))
  const writes = ui.calls.filter(
    ({ method }) => method === 'boss_review_engineering_material_request'
  )
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].params, {
    id: 3,
    expected_version: 2,
    action: 'BOSS_APPROVE',
    task_id: 7,
    expected_task_version: 4,
    note: null,
  })
  assert.equal(
    document.querySelector('[role="tab"][aria-selected="true"]').disabled,
    true
  )
  await act(async () => resolveMutation())
  assert.ok(
    document.querySelector('[data-testid="workflow-task-action-receipt"]')
  )
  assert.equal(ui.receipt.value.status, 'BOSS_APPROVED')
  assert.equal(ui.button('确认通过，交财务'), undefined)
})

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} review notes do not block leaving or reloading the task`, async (t) => {
    const ui = await setup(t, { mobile })
    await ui.render()
    if (!mobile) await ui.click(ui.button('处理任务'))
    await ui.fill('textarea', '材料已核对')

    const beforeUnload = new window.Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    assert.equal(beforeUnload.defaultPrevented, false)

    let left = false
    await act(async () => {
      ui.leaveGuardRef.current(() => {
        left = true
      })
    })
    assert.equal(left, true)
    assert.equal(ui.draftRef.current.values.note, '材料已核对')
    assert.equal(
      ui.calls.some(({ method }) =>
        method.endsWith('review_engineering_material_request')
      ),
      false
    )
  })
}

test('mobile processing uses the active process tab, requires a rejection reason, and preserves a failed submission draft', async (t) => {
  const ui = await setup(t, { mobile: true })
  await ui.render()
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.match(
    document.querySelector('[aria-current="step"]').textContent,
    /处理任务/
  )
  assert.equal(document.querySelector('.erp-material-sheet'), null)
  assert.equal(document.querySelector('[aria-label="采购金额合计"]'), null)
  await ui.click(document.querySelector('input[value="reject"]'))
  await ui.click(ui.button('确认退回工程'))
  assert.equal(
    ui.calls.some(
      ({ method }) => method === 'boss_review_engineering_material_request'
    ),
    false
  )
  await ui.fill('textarea', '用量需要复核')
  assert.equal(ui.draftRef.current.values.note, '用量需要复核')
  let rejectMutation
  ui.mutation = new Promise((_, reject) => {
    rejectMutation = reject
  })
  await ui.click(ui.button('确认退回工程'))
  await act(async () => rejectMutation(new Error('conflict')))
  assert.equal(ui.receipt, undefined)
  assert.equal(document.querySelector('textarea').value, '用量需要复核')
  ui.mutation = null
  await ui.click(ui.button('确认退回工程'))
  assert.equal(ui.receipt.value.status, 'REJECTED')
  assert.equal(ui.receipt.reason, '用量需要复核')
  assert.equal(ui.draftRef.current, null)
})

for (const mobile of [false, true]) {
test(`${mobile ? 'mobile' : 'desktop'} finance prepares pricing outside the approval step and submits it only with approval`, async (t) => {
  const ui = await setup(t, { stage: 'finance', mobile })
  await ui.render()
  if (!mobile) await ui.click(ui.button('处理任务'))
  assert.equal(document.querySelector('.erp-material-sheet'), null)
  assert.equal(document.querySelector('[aria-label="采购核价录入"]'), null)
  assert.equal(document.querySelector('.erp-material-product'), null)
  assert.equal(document.querySelector('[aria-label="采购金额合计"]'), null)
  assert.match(document.querySelector('input[value="approve"]').closest('label').textContent, /审批通过/)
  await ui.click(ui.button('批准并生成采购订单'))
  assert.equal(
    ui.calls.some(
      ({ method }) => method === 'finance_review_engineering_material_request'
    ),
    false
  )
  await ui.prepareFinance()
  assert.ok(document.querySelector('[aria-label="采购核价录入"]'))
  assert.equal(document.querySelector('.erp-material-sheet'), null)
  assert.match(document.querySelector('.erp-material-finance-fields__amount').textContent, /待核价/)
  assert.equal(document.querySelector('input[value="approve"]'), null)
  await ui.fill('input[aria-label="单价 1"]', '2.50')
  await ui.fill('input[aria-label="到货日期 1"]', '2026-10-01')
  await ui.resumeFinance()
  assert.ok(ui.calls.every(({ method }) => method !== 'finance_review_engineering_material_request'))
  assert.equal(document.querySelector('[aria-label="采购核价录入"]'), null)
  assert.equal(document.querySelector('[aria-label="采购金额合计"]'), null)
  await ui.click(ui.button('批准并生成采购订单'))
  const write = ui.calls.find(
    ({ method }) => method === 'finance_review_engineering_material_request'
  )
  assert.ok(write)
  assert.equal(write.params.task_id, 7)
  assert.equal(write.params.expected_task_version, 4)
  assert.equal(write.params.items[0].id, 21)
  assert.equal(write.params.items[0].purchase_quantity, '3.125')
  assert.equal(write.params.items[0].unit_price, '2.50')
  assert.equal(ui.receipt.value.status, 'APPROVED')
})
}

test('engineering revision reloads current saved sources before resubmitting in the processing tab', async (t) => {
  const ui = await setup(t, { stage: 'revision', mobile: true })
  await ui.render()
  assert.equal(ui.button('提交老板审核'), undefined)
  assert.equal(document.querySelector('.erp-material-sheet'), null)
  await ui.click(ui.button('按当前资料重新整理'))
  assert.equal(ui.calls.at(-1).params.preview, true)
  assert.equal(ui.calls.at(-1).params.request_id, undefined)
  assert.equal(document.querySelector('.erp-material-sheet'), null)
  await ui.click(ui.button('提交老板审核'))
  assert.deepEqual(ui.calls.at(-1).params, {
    sales_order_id: 8,
    expected_version: 11,
    expected_source_hash: 'b'.repeat(64),
    task_id: 7,
    expected_task_version: 4,
  })
  assert.equal(ui.receipt.value.status, 'SUBMITTED')
})

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} finance rejection skips pricing validation and switching decisions preserves pricing`, async (t) => {
    const ui = await setup(t, { stage: 'finance', mobile })
    await ui.render()
    if (!mobile) await ui.click(ui.button('处理任务'))
    await ui.prepareFinance()
    await ui.fill('input[aria-label="单价 1"]', '0')
    assert.equal(document.querySelector('.erp-material-finance-fields__amount strong').textContent, '0')
    await ui.fill('input[aria-label="实购数量 1"]', '4')
    await ui.resumeFinance()
    await ui.click(document.querySelector('input[value="reject"]'))
    assert.equal(document.querySelector('[aria-label="采购核价录入"]'), null)
    assert.equal(document.querySelector('[aria-label="采购金额合计"]'), null)
    await ui.click(document.querySelector('input[value="approve"]'))
    assert.equal(ui.draftRef.current.values.items[0].unit_price, '0')
    assert.equal(ui.draftRef.current.values.items[0].purchase_quantity, '4')
    await ui.click(ui.button('批准并生成采购订单'))
    assert.equal(ui.receipt, undefined)
    assert.ok(ui.calls.every(({ method }) => method !== 'finance_review_engineering_material_request'))
    await ui.click(document.querySelector('input[value="reject"]'))
    await ui.fill('textarea', '请工程重新核对用量')
    await ui.click(ui.button('确认退回工程'))
    const write = ui.calls.find(({ method }) => method === 'finance_review_engineering_material_request')
    assert.equal(write.params.action, 'REJECT')
    assert.equal(write.params.items, undefined)
    assert.equal(write.params.note, '请工程重新核对用量')
  })
}

test('desktop finance can return to task context and continue with its original pricing values', async (t) => {
  const ui = await setup(t, { stage: 'finance' })
  await ui.render()
  await ui.click(ui.button('处理任务'))
  await ui.fill('textarea', '按核价结果批准')
  await ui.prepareFinance()
  await ui.fill('input[aria-label="单价 1"]', '2.5')
  await ui.resumeFinance()
  assert.equal(document.querySelector('textarea').value, '按核价结果批准')
  await ui.click(document.querySelector('#erp-task-action-step-context-tab'))
  assert.equal(document.querySelector('#erp-task-action-step-action').hidden, true)
  assert.equal(document.querySelector('[aria-label="采购核价录入"]'), null)
  assert.ok(document.querySelector('[aria-label="任务处理链"]'))
  await ui.prepareFinance()
  assert.equal(document.querySelector('input[aria-label="单价 1"]').value, '2.5')
  await ui.resumeFinance()
  assert.equal(document.querySelector('input[aria-label="单价 1"]'), null)
  assert.equal(document.querySelector('[aria-label="任务处理链"]'), null)
  assert.equal(ui.receipt, undefined)
})

test('finance preparation discards stale source pricing before a later approval', async (t) => {
  const ui = await setup(t, { stage: 'finance' })
  await ui.render()
  await ui.prepareFinance()
  await ui.fill('input[aria-label="单价 1"]', '2.5')
  await ui.fill('input[aria-label="到货日期 1"]', '2026-10-01')
  await ui.resumeFinance()
  ui.request.version += 1
  await ui.prepareFinance()
  assert.equal(document.querySelector('input[aria-label="单价 1"]').value, '')
  assert.equal(document.querySelector('input[aria-label="到货日期 1"]').value, '')
  await ui.resumeFinance()
  await ui.click(ui.button('批准并生成采购订单'))
  assert.ok(ui.calls.every(({ method }) => method !== 'finance_review_engineering_material_request'))
})

test('finance preparation closes when the action permission is withdrawn', async (t) => {
  const ui = await setup(t, { stage: 'finance' })
  await ui.render()
  await ui.prepareFinance()
  assert.ok(document.querySelector('input[aria-label="单价 1"]'))
  assert.equal(document.querySelector('input[value="approve"]'), null)
  assert.equal(ui.button('批准并生成采购订单'), undefined)
  const actions = ui.profile.effective_session.actions
  ui.profile.effective_session.actions = ['engineering.material.read', 'sales_order.read']
  await ui.render()
  assert.equal(ui.button('填写核价'), undefined)
  assert.equal(document.querySelector('.erp-material-summary-modal'), null)
  ui.profile.effective_session.actions = actions
  await ui.render()
  assert.ok(ui.button('填写核价'))
  assert.equal(document.querySelector('input[aria-label="单价 1"]'), null)
})

test('source reads recover without exposing submit controls before the source is available', async (t) => {
  const ui = await setup(t, { mobile: true })
  ui.readFailure = true
  await ui.render()
  assert.equal(ui.button('确认通过，交财务'), undefined)
  assert.equal(ui.receipt, undefined)
  ui.readFailure = false
  await ui.click(ui.button('重试'))
  assert.ok(ui.button('确认通过，交财务'))
})

test('an incomplete or mismatched source response never becomes a confirmed task receipt', async (t) => {
  const ui = await setup(t, { mobile: true })
  ui.mutationResult = {
    ...ui.request,
    status: 'BOSS_APPROVED',
    version: 3,
    sales_order_id: 99,
  }
  await ui.render()
  await ui.click(ui.button('确认通过，交财务'))
  assert.equal(ui.receipt, undefined)
  assert.ok(ui.button('确认通过，交财务'))
})

test('a restored material draft belongs to the exact task and source version', async (t) => {
  const ui = await setup(t, { mobile: true })
  ui.draftRef.current = {
    key: '7:4:8:3',
    requestVersion: 2,
    decision: 'reject',
    values: { note: '请补齐用量说明' },
  }
  await ui.render()
  assert.equal(document.querySelector('textarea').value, '请补齐用量说明')
  assert.equal(document.querySelector('input[value="reject"]').checked, true)
  await ui.hide()
  ui.request.version = 3
  await ui.render()
  assert.equal(document.querySelector('textarea').value, '')
  assert.equal(document.querySelector('input[value="approve"]').checked, true)
  await ui.hide()
  ui.request.version = 2
  ui.task.version = 5
  await ui.render()
  assert.equal(document.querySelector('textarea').value, '')
})
