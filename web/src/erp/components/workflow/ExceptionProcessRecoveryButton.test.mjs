import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../../scripts/test/rpcApiTestHarness.mjs'

const candidate = {
  id: 991,
  process_instance_id: 791,
  node_key: 'finance_payment_approval_command',
  node_type: 'domain_command',
  status: 'completed',
  version: 7,
  domain_command_effect_state: 'compensated',
  domain_command_result_hash: 'a'.repeat(64),
  domain_command_compensation_hash: 'b'.repeat(64),
  domain_command_compensated_at: 1_700_000_000,
  domain_command_compensated_by: 31,
}
const processData = {
  process_context: {
    process_instance: {
      id: 791,
      process_key: 'finance_payment_approval',
      business_ref_type: 'finance_payment',
      business_ref_id: 66,
      status: 'blocked',
    },
    nodes: [candidate],
    active_nodes: [],
    settled_nodes: [candidate],
  },
}

async function setup(t, loadProcess = async () => processData) {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const rpcCalls = []
  const setRpc = installRpcCallHarness((cleanup) => t.after(cleanup))
  setRpc(async (method) => {
    rpcCalls.push(method)
    return { data: processData }
  })
  const [{ createRoot }, { App, ConfigProvider }, { default: Bridge }, { default: Recovery }] = await Promise.all([
    import('react-dom/client'),
    import('antd'),
    import('@/common/components/AntdAppBridge.jsx'),
    import('./ExceptionProcessRecoveryButton.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = async (visible, canRecover = true) => {
    await act(async () => {
      root.render(createElement(
        ConfigProvider,
        { theme: { token: { motion: false } } },
        createElement(
          App,
          null,
          createElement(Bridge),
          visible ? createElement(Recovery, { canRecover, loadProcess }) : null
        )
      ))
    })
  }
  const flush = async () => act(async () => new Promise(setImmediate))
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  await render(true)
  return { render, flush, rpcCalls, click: async () => act(async () => container.querySelector('button').click()) }
}

test('leaving a source closes its recovery confirmation while the shared modal provider stays mounted', async (t) => {
  const view = await setup(t)
  await view.click()
  await view.flush()
  assert.deepEqual(view.rpcCalls, ['get_process_recovery_context'])
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 1)
  await act(async () => document.querySelector('.ant-modal-confirm-btns button').click())
  await view.flush()
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 0)
  await view.click()
  await view.flush()
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 1)
  await view.render(false)
  await view.flush()
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 0)
})

test('removing recovery permission closes the source confirmation without unmounting its owner', async (t) => {
  const view = await setup(t)
  await view.click()
  await view.flush()
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 1)
  await view.render(true, false)
  await view.flush()
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 0)
})

test('a late source read cannot open a recovery confirmation after leaving the source', async (t) => {
  let resolveRead
  const view = await setup(t, () => new Promise((resolve) => { resolveRead = resolve }))
  await view.click()
  await view.render(false)
  await act(async () => resolveRead(processData))
  await view.flush()
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 0)
  assert.deepEqual(view.rpcCalls, [])
})

test('restoring recovery permission permits a fresh read and ignores the revoked read', async (t) => {
  let resolveRead
  let reads = 0
  const view = await setup(t, () => {
    reads += 1
    return reads === 1 ? new Promise((resolve) => { resolveRead = resolve }) : processData
  })
  await view.click()
  await view.render(true, false)
  await view.render(true)
  assert.equal(document.querySelector('[data-business-action-key="exception-process-recovery"]').disabled, false)
  await act(async () => resolveRead(processData))
  await view.flush()
  assert.deepEqual(view.rpcCalls, [])
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 0)
  await view.click()
  await view.flush()
  assert.deepEqual(view.rpcCalls, ['get_process_recovery_context'])
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 1)
})
