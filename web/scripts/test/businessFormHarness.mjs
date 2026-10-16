import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import { installTestDOM, registerJSXTestLoader } from './reactRuntime.mjs'

let loaderRegistered = false

export async function businessFormHarness(t, { rpc } = {}) {
  const dom = installTestDOM()
  window.HTMLElement.prototype.scrollIntoView = () => {}
  if (!loaderRegistered) {
    registerJSXTestLoader()
    loaderRegistered = true
  }
  const [{ createRoot }, { ConfigProvider }, { JsonRpc }] = await Promise.all([
    import('react-dom/client'),
    import('antd'),
    import('../../src/common/utils/jsonRpc.js'),
  ])
  const originalCall = JsonRpc.prototype.call
  JsonRpc.prototype.call = async function call(method, params, options) {
    assert.ok(rpc, `unexpected RPC: ${method}`)
    return rpc(method, params, options)
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const flush = async () => act(async () => new Promise(setImmediate))
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    JsonRpc.prototype.call = originalCall
    dom.restore()
  })
  const field = (label) => {
    const node = [...document.querySelectorAll('label')].find(
      (item) => item.textContent.trim() === label
    )
    assert.ok(node, `field label: ${label}`)
    const control = document.getElementById(node.htmlFor)
    assert.ok(control, `field control: ${label}`)
    return control
  }
  const options = async (label) => {
    const input = field(label)
    if (input.getAttribute('aria-expanded') !== 'true') {
      await act(async () => {
        input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
      })
      await flush()
    }
    return [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')]
  }
  return {
    async render(element) {
      await act(async () => {
        root.render(
          createElement(ConfigProvider, { theme: { token: { motion: false } } }, element)
        )
      })
      await flush()
    },
    field,
    button(label) {
      return [...document.querySelectorAll('button')].find(
        (item) => item.textContent.replace(/\s/gu, '') === label.replace(/\s/gu, '')
      )
    },
    async click(node) {
      assert.ok(node, 'expected clickable control')
      await act(async () => node.click())
      await flush()
    },
    async fill(label, value) {
      const input = typeof label === 'string' ? field(label) : label
      await act(async () => {
        const prototype = input.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value)
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
      })
      await flush()
    },
    async select(label, optionLabel) {
      const option = (await options(label)).find(
        (item) => item.textContent.trim() === optionLabel
      )
      assert.ok(option, `option ${optionLabel} for ${label}`)
      await act(async () => option.click())
      await flush()
    },
    options,
    flush,
  }
}

export function deferredFormRequest() {
  let resolve
  let reject
  const promise = new Promise((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}
