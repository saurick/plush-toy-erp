import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../config/devFlowStateCatalog.mjs'

const topic = catalog.businessChains.find(
  (chain) => chain.key === 'purchase_to_inventory'
)
const step = topic.steps.find((step) => step.toNodeKey === 'purchase_accepted')
const render = (Component, props = {}) =>
  h(
    MemoryRouter,
    {
      future: { v7_startTransition: true, v7_relativeSplatPath: true },
    },
    h(Component, { catalog, topic, step, ...props })
  )

test('交接详情保留岗位、独立结果和验证摘要，读取失败可恢复', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Panel } = await import('./BusinessChainStepVerification.jsx')
  const calls = []
  let fail = true
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    if (fail) throw new Error('sensitive internal detail')
    return { status: 200, ok: true, json: async () => ({ status: 'missing' }) }
  })
  await harness.render(render(Panel))
  await harness.flush()
  assert.match(harness.container.textContent, /品质|质检/u)
  assert.match(harness.container.textContent, /检验.*通过/u)
  assert.match(harness.container.textContent, /普通测试报告读取失败/u)
  assert(!harness.container.textContent.includes('sensitive internal detail'))
  assert(!harness.container.textContent.includes('TestPurchaseReceiptPostgresIncomingAcceptance'))
  assert(harness.container.textContent.includes('检查项'))
  assert.equal(harness.container.querySelectorAll('a').length, 0)

  fail = false
  await harness.act(() =>
    [...harness.container.querySelectorAll('button')]
      .find((button) => button.textContent === '重新读取证据')
      .click()
  )
  await harness.flush()
  assert(!harness.container.textContent.includes('普通测试报告读取失败'))
  assert.match(harness.container.textContent, /未采集/u)
  assert(
    calls.every(({ options }) => !options.method || options.method === 'GET')
  )
})

test('展开交接规则保留触发按钮焦点，不自动移走当前阅读位置', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Panel } = await import('./BusinessChainStepVerification.jsx')
  t.mock.method(globalThis, 'fetch', async () => ({ status: 200, ok: true, json: async () => ({ status: 'missing' }) }))
  function Reading() {
    const [open, setOpen] = useState(false)
    return h(
      'div',
      null,
      h('button', { onClick: () => setOpen(!open) }, '规则与验证'),
      open ? render(Panel) : null
    )
  }
  await harness.render(h(Reading))
  const trigger = harness.container.querySelector('button')
  trigger.focus()
  await harness.act(() => trigger.click())
  await harness.flush()
  assert.equal(Boolean(harness.container.querySelector('[data-chain-step-verification]')), true)
  assert.equal(document.activeElement === trigger, true)
  await harness.act(() => trigger.click())
  assert.equal(Boolean(harness.container.querySelector('[data-chain-step-verification]')), false)
})

test('离开交接详情会中止证据读取，迟到结果不回写', async (t) => {
  const harness = await createReactTestHarness(t)
  const { default: Panel } = await import('./BusinessChainStepVerification.jsx')
  const signals = []
  const finish = []
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    signals.push(options.signal)
    return new Promise((resolve) =>
      finish.push(() =>
        resolve({
          status: 200,
          ok: true,
          json: async () => ({ status: 'missing' }),
        })
      )
    )
  })
  await harness.render(render(Panel))
  assert.equal(signals.length, 2)
  await harness.render(h('div', null, '已离开'))
  assert(signals.every((signal) => signal.aborted))
  await harness.act(async () => finish.forEach((resolve) => resolve()))
  assert.equal(harness.container.textContent, '已离开')
})
