import assert from 'node:assert/strict'
import test from 'node:test'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../../scripts/test/reactRuntime.mjs'

async function setup(t) {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const {
    scheduleBusinessFormModalFocus,
    scheduleBusinessFormModalTriggerFocus,
  } = await import('./BusinessFormModal.jsx')
  const timers = new Map()
  let timerID = 0
  t.mock.method(window, 'setTimeout', (callback) => {
    timers.set(++timerID, callback)
    return timerID
  })
  t.mock.method(window, 'clearTimeout', (id) => timers.delete(id))
  t.after(() => dom.restore())
  const modal = ({ form = false, zIndex = 1000, before } = {}) => {
    const wrap = document.createElement('div')
    wrap.className = 'ant-modal-wrap'
    wrap.style.zIndex = String(zIndex)
    wrap.innerHTML = `<div class="ant-modal${form ? ' erp-business-action-modal erp-business-action-modal--form' : ' ant-modal-confirm'}"><input aria-label="first"><input aria-label="invalid"><button>继续编辑</button></div>`
    document.body.insertBefore(wrap, before || null)
    for (const node of [wrap.firstElementChild, ...wrap.querySelectorAll('input, button')]) {
      t.mock.method(node, 'getBoundingClientRect', () => ({ width: 100, height: 32 }))
    }
    return {
      wrap,
      dialog: wrap.firstElementChild,
      first: wrap.querySelector('[aria-label="first"]'),
      invalid: wrap.querySelector('[aria-label="invalid"]'),
      cancel: wrap.querySelector('button'),
    }
  }
  return {
    modal,
    schedule: scheduleBusinessFormModalFocus,
    restoreTrigger: scheduleBusinessFormModalTriggerFocus,
    flush() {
      const pending = [...timers.values()]
      timers.clear()
      pending.forEach((callback) => callback())
    },
    timers,
  }
}

test('late initial and transition focus leave the higher confirmation safe button focused', async (t) => {
  const view = await setup(t)
  const form = view.modal({ form: true })
  view.schedule(120)
  view.schedule(160)
  const confirmation = view.modal({ zIndex: 2000, before: form.wrap })
  confirmation.cancel.focus()
  view.flush()
  assert.equal(document.activeElement === confirmation.cancel, true)
  assert.equal(view.timers.size, 0, 'a higher dialog must not start another form focus retry')

  confirmation.wrap.remove()
  form.invalid.focus()
  view.schedule(160)
  view.flush()
  assert.equal(document.activeElement === form.invalid, true, 'returning to the form retains its field focus')
})

test('single-layer initial focus works and later focus preserves the invalid field', async (t) => {
  const view = await setup(t)
  const form = view.modal({ form: true })
  view.schedule(120)
  view.flush()
  assert.equal(document.activeElement === form.first, true)
  form.invalid.focus()
  view.schedule(160)
  view.flush()
  assert.equal(document.activeElement === form.invalid, true)
})

test('the higher business form owns focus independently of portal DOM order', async (t) => {
  const view = await setup(t)
  const lower = view.modal({ form: true })
  const higher = view.modal({ form: true, zIndex: 1100, before: lower.wrap })
  view.schedule(160)
  view.flush()
  assert.equal(document.activeElement === higher.first, true)
})

test('late close restoration leaves a newly opened confirmation safe button focused', async (t) => {
  const view = await setup(t)
  const trigger = document.createElement('button')
  document.body.append(trigger)
  view.restoreTrigger({ current: trigger }, { current: false })
  const confirmation = view.modal({ zIndex: 2000 })
  confirmation.cancel.focus()
  view.flush()
  assert.equal(document.activeElement === confirmation.cancel, true)
})

test('close restores its trigger normally but not after the same form has reopened', async (t) => {
  const view = await setup(t)
  const trigger = document.createElement('button')
  document.body.append(trigger)
  const open = { current: false }
  view.restoreTrigger({ current: trigger }, open)
  view.flush()
  assert.equal(document.activeElement === trigger, true)

  view.restoreTrigger({ current: trigger }, open)
  open.current = true
  const reopened = view.modal({ form: true })
  reopened.invalid.focus()
  view.flush()
  assert.equal(document.activeElement === reopened.invalid, true)
})

test('closing a nested form can restore its trigger inside the remaining parent dialog', async (t) => {
  const view = await setup(t)
  const parent = view.modal({ form: true })
  parent.first.focus()
  view.restoreTrigger({ current: parent.cancel }, { current: false })
  view.flush()
  assert.equal(document.activeElement === parent.cancel, true)
})
