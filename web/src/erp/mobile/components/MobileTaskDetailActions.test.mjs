import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'

test('mobile source navigation preserves authorized task handling and urge actions', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [
    { createRoot },
    { default: Detail },
    { MemoryRouter, Routes, Route, Outlet, useLocation },
    { JsonRpc },
  ] = await Promise.all([
    import('react-dom/client'),
    import('./MobileTaskDetailScreen.jsx'),
    import('react-router-dom'),
    import('../../../common/utils/jsonRpc.js'),
  ])
  const calls = []
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method) {
    calls.push(method)
    if (method === 'list_task_events') {
      return { data: { items: [], truncated: false } }
    }
    if (method === 'list_attachments') return { data: { items: [] } }
    if (method === 'get_task_process_context') {
      return {
        data: {
          process_context: {
            source: { type: 'finance_payment', id: 3, no: 'SIM-PAYMENT-3' },
            process_instance: {
              id: 10,
              process_key: 'finance_payment_approval',
              process_version: 'v1',
              status: 'active',
              started_at: 1_800_000_000,
            },
            nodes: [],
            current_nodes: [],
            completed_nodes: [],
            current_responsibilities: [],
            approval_form: null,
          },
        },
      }
    }
    throw new Error(`Unexpected RPC: ${method}`)
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })
  const task = {
    id: 7,
    version: 1,
    task_name: '收付款审批',
    task_status_key: 'ready',
    source_type: 'finance_payment',
    source_id: 3,
    source_no: 'SIM-PAYMENT-3',
    process_instance_id: 10,
    owner_role_key: 'boss',
    required_capability_key: 'finance.payment.approve',
  }
  const sourceAccess = { applicable: true, resolved: true, allowed: true }
  const actions = []
  let props = {
    selectedTask: task,
    selectedSeverity: { badgeClass: '' },
    savedEvidenceRefs: [],
    actionAccess: { sourceAccess },
    selectedCanOperate: true,
    selectedCanUrge: false,
    onOpenAction: (mode) => actions.push(mode),
  }
  function Frame() {
    const location = useLocation()
    return createElement(
      'div',
      null,
      createElement(
        'output',
        { 'data-location': true },
        `${location.pathname}${location.search}`
      ),
      createElement(Outlet, {
        context: { adminProfile: { id: 12, menus: ['/erp/finance/payments'] } },
      })
    )
  }
  const render = async (patch = {}) => {
    props = { ...props, ...patch }
    await act(async () =>
      root.render(
        createElement(
          MemoryRouter,
          {
            initialEntries: ['/m/boss/tasks'],
            future: { v7_startTransition: true, v7_relativeSplatPath: true },
          },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              { element: createElement(Frame) },
              createElement(Route, {
                path: '*',
                element: createElement(Detail, props),
              })
            )
          )
        )
      )
    )
  }
  const buttons = () => [
    ...container.querySelectorAll('.mobile-role-action-bar button'),
  ]
  const button = (label) =>
    buttons().find((node) => node.textContent.trim() === label)

  for (const [owner, capability] of [
    ['boss', 'finance.payment.approve'],
    ['finance', 'workflow.task.complete'],
  ]) {
    await render({
      selectedTask: {
        ...task,
        owner_role_key: owner,
        required_capability_key: capability,
      },
    })
    assert.ok(button('进入单据办理'), 'the source document remains reachable')
    assert.ok(
      button('处理任务'),
      `${owner} must be able to open the authorized workflow action`
    )
    const before = actions.length
    await act(async () => button('处理任务').click())
    assert.equal(actions.length, before + 1)
    assert.equal(actions.at(-1), undefined)
    assert.equal(
      container.querySelector('[data-location]').textContent,
      '/m/boss/tasks'
    )
  }

  await render({ selectedCanOperate: false, selectedCanUrge: true })
  assert.ok(button('进入单据办理'))
  assert.equal(button('处理任务'), undefined)
  assert.ok(button('催办任务'))
  await act(async () => button('催办任务').click())
  assert.equal(actions.at(-1), 'urge')

  for (const access of [
    { sourceAccess },
    { loading: true },
    { failed: true },
  ]) {
    await render({ selectedCanUrge: false, actionAccess: access })
    assert.equal(button('处理任务'), undefined)
    assert.equal(button('催办任务'), undefined)
  }
  await render({
    actionAccess: { sourceAccess },
    selectedTask: { ...task, task_status_key: 'done' },
    processingComplete: true,
  })
  assert.equal(buttons().length, 1)
  assert.ok(button('进入单据办理'))
  await act(async () => button('进入单据办理').click())
  assert.equal(
    container.querySelector('[data-location]').textContent,
    '/m/boss/handle/finance/payments?finance_payment_id=3&link_source=task-dashboard'
  )
  assert.ok(calls.length > 0)
  assert.deepEqual([...new Set(calls)].sort(), [
    'get_task_process_context',
    'list_attachments',
    'list_task_events',
  ])
})
