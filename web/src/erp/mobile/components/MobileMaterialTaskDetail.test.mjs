import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'

test('mobile material task separates on-demand reading from versioned task processing', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [
    { default: Detail },
    { MemoryRouter, Routes, Route, Outlet },
    { JsonRpc },
  ] = await Promise.all([
    import('./MobileTaskDetailScreen.jsx'),
    import('react-router-dom'),
    import('../../../common/utils/jsonRpc.js'),
  ])
  const task = {
    id: 7,
    version: 4,
    task_name: '审核工程用料',
    source_id: 3,
    source_type: 'engineering_material_request',
    task_group: 'engineering_material_boss_review',
    task_code: 'source-material-boss-review-3',
    owner_role_key: 'boss',
    required_capability_key: 'engineering.material.boss_approve',
    task_status_key: 'ready',
    payload: {
      sales_order_id: 8,
      engineering_material_request_id: 3,
      source_task_contract: 'workflow.source-task/v1',
      source_task_producer: 'engineering_material_request.approval',
      source_task_intent_hash: 'a'.repeat(64),
    },
  }
  const reads = ['engineering.material.read', 'sales_order.read']
  const profile = {
    id: 12,
    permissions: [...reads, task.required_capability_key],
    effective_session: { actions: [...reads, task.required_capability_key] },
  }
  const request = {
    id: 3,
    version: 2,
    sales_order_id: 8,
    submitted_at: '2026-09-14T01:00:00Z',
    order_no: 'ORDER-8',
    order_status: 'active',
    status: 'SUBMITTED',
    items: [],
    sources: [],
    issues: [],
    purchase_orders: [],
  }
  const calls = []
  const original = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method, params) {
    calls.push({ method, params })
    if (method === 'list_task_events') {
      return { data: { items: [], truncated: false } }
    }
    if (method === 'list_attachments') return { data: { items: [] } }
    if (method === 'get_engineering_material_request') return { data: request }
    if (method === 'boss_review_engineering_material_request') {
      return { data: { ...request, version: 3, status: 'BOSS_APPROVED' } }
    }
    throw new Error(`Unexpected RPC: ${method}`)
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let openedActions = 0
  let props = {
    selectedTask: task,
    selectedSeverity: { badgeClass: '' },
    savedEvidenceRefs: [],
    onOpenAction: () => openedActions++,
  }
  const render = async (patch = {}) => {
    props = { ...props, ...patch }
    await act(async () =>
      root.render(
        createElement(
          MemoryRouter,
          { future: { v7_startTransition: true, v7_relativeSplatPath: true } },
          createElement(
            Routes,
            null,
            createElement(
              Route,
              {
                element: createElement(Outlet, {
                  context: { adminProfile: profile },
                }),
              },
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
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (node) =>
        node.textContent.replace(/\s/gu, '') === label.replace(/\s/gu, '')
    )
  const click = async (node) => {
    assert.ok(node, 'expected button to exist')
    await act(async () => node.click())
  }
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = original
    dom.restore()
  })

  await render()
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.equal(
    calls.filter(({ method }) => method === 'get_engineering_material_request').length,
    1
  )
  assert.match(document.querySelector('[aria-label="任务处理链"]').textContent, /工程提交用料/)
  assert.match(document.querySelector('[aria-label="任务处理链"]').textContent, /老板审核/)
  await click(button('查看材料汇总'))
  assert.equal(document.querySelector('.ant-modal-footer'), null)
  assert.equal(button('审核通过，交财务'), undefined)
  assert.equal(button('退回工程'), undefined)
  await click(document.querySelector('.ant-modal-close'))
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.equal(openedActions, 0)

  await click(document.querySelector('.mobile-role-action-bar button'))
  assert.equal(openedActions, 1)
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.equal(button('审核通过，交财务'), undefined)
  assert.equal(
    calls.filter(({ method }) => method === 'get_engineering_material_request')
      .length,
    2
  )
  const processTab = document.querySelector('[data-step-key="process"]')
  await click(processTab)
  assert.equal(openedActions, 2)
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.ok(calls.every(({ method }) => !method.includes('review_engineering')))

  await render({ selectedTask: { ...task, id: 9, assignee_id: 99 } })
  assert.equal(document.querySelector('[role="dialog"]'), null)
  assert.ok(button('查看材料汇总'))
  assert.equal(document.querySelector('.mobile-role-action-bar button'), null)
  await render({ selectedTask: { ...task, id: 10, task_status_key: 'done' } })
  assert.ok(button('查看材料汇总'))
  assert.equal(document.querySelector('.mobile-role-action-bar button'), null)
})
