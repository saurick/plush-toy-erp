import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useContext, useRef, useState } from 'react'
import { setTimeout as delay } from 'node:timers/promises'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function setup(t, { dirty = false } = {}) {
  const ui = await createReactTestHarness(t)
  ui.container.id = 'root'
  const { default: Provider } = await import('./OverlayScopeProvider.jsx')
  const { useModal } = await import('../../utils/antdApp.js')
  const { useOverlayScope } = await import('./OverlayScopeContext.mjs')
  const { default: Modal } = await import('../modal/AppModal.jsx')
  const { default: BusinessModal } = await import('../../../erp/components/business-list/BusinessModal.jsx')
  const { default: Drawer } = await import('../drawer/AppDrawer.jsx')
  const { ConfigProvider } = await import('antd')
  const apis = {}
  const scopes = {}
  const guards = {}
  const popups = {}
  const controls = {}
  let enable
  let relayout
  function Page({ name }) {
    const [open, setOpen] = useState(false)
    apis[name] = useModal()
    scopes[name] = useOverlayScope()
    popups[name] = useContext(ConfigProvider.ConfigContext).getPopupContainer
    controls[name] = setOpen
    return h('div', null, h('button', { 'data-open': name, onClick: () => setOpen(true) }, `打开 ${name}`), h('input', { 'aria-label': `${name} 背景`, defaultValue: '' }), h(name === 'left' ? dirty ? BusinessModal : Modal : Drawer, { open, ...(dirty && name === 'left' ? { hasChanges: true } : {}), title: `${name} 办理`, onCancel: () => setOpen(false), onClose: () => setOpen(false), destroyOnHidden: true }, h('input', { 'aria-label': `${name} 草稿`, defaultValue: `${name} 原值` })
      )
    )
  }
  function Shell() {
    const [enabled, setEnabled] = useState(false)
    const [layoutKey, setLayoutKey] = useState(0)
    enable = setEnabled
    relayout = setLayoutKey
    const left = useRef(null)
    const right = useRef(null)
    return h('div', null, ...[['left', left], ['right', right]].map(([name, ref]) => h(Provider, { key: name, enabled, visible: name === 'left' || enabled, containerRef: ref, layoutKey: `${enabled}:${layoutKey}`, scopeKey: name, onGuardChange: (guard) => { guards[name] = guard } }, h('section', { ref, 'data-pane': name }, h(Page, { name }))
      ))
    )
  }
  await ui.render(h(ConfigProvider, { theme: { token: { motion: false } } }, h(Shell)))
  return {
    ...ui,
    apis,
    scopes,
    guards,
    popups,
    enable: (value) => ui.act(async () => enable(value)),
    relayout: (value) => ui.act(async () => relayout(value)),
    close: (name) => ui.act(async () => controls[name](false)),
    open: (name) => ui.act(async () => {
      const button = document.querySelector(`[data-open="${name}"]`)
      button.focus()
      button.click()
    }),
    settle: () => ui.act(async () => delay(550)),
  }
}

test('independent pane dialogs preserve drafts through collapse, restore inert and scroll state, and leave focus in the other pane', async (t) => {
  const ui = await setup(t)
  const capturedAPI = ui.apis.left
  const originalOverflow = document.body.style.overflow
  await ui.enable(true)
  assert.equal(capturedAPI === ui.apis.left, true, 'opening split must retain the API captured by existing callbacks')
  await ui.open('left')
  await ui.settle()
  const leftPane = document.querySelector('[data-pane="left"]')
  const rightPane = document.querySelector('[data-pane="right"]')
  const leftDraft = document.querySelector('input[aria-label="left 草稿"]')
  leftDraft.value = '尚未保存的内容'
  assert.equal(ui.scopes.left.host.contains(leftDraft), true)
  assert.equal(leftDraft.closest('[role="dialog"]').getAttribute('aria-modal'), 'false')
  assert.equal(leftPane.hasAttribute('inert'), true)
  assert.equal(rightPane.hasAttribute('inert'), false)
  assert.equal(document.body.style.overflow, originalOverflow)
  await ui.open('right')
  await ui.settle()
  const rightDraft = document.querySelector('input[aria-label="right 草稿"]')
  assert.equal(ui.scopes.right.host.contains(rightDraft), true)
  assert.equal(rightPane.hasAttribute('inert'), true)
  await ui.enable(false)
  assert.equal(ui.scopes.right.host.hidden, true)
  assert.equal(document.querySelector('input[aria-label="left 草稿"]') === leftDraft, true)
  assert.equal(leftDraft.value, '尚未保存的内容')
  assert.equal(ui.container.hasAttribute('inert'), true)
  await ui.enable(true)
  assert.equal(ui.container.hasAttribute('inert'), false)
  assert.equal(document.querySelector('input[aria-label="right 草稿"]') === rightDraft, true)
  await ui.act(async () => rightDraft.focus())
  await ui.close('left')
  await ui.settle()
  assert.equal(leftPane.hasAttribute('inert'), false)
  assert.equal(rightPane.hasAttribute('inert'), true)
  assert.equal(document.activeElement === rightDraft, true, 'closing another pane cannot steal current input focus')
  const backgroundInput = document.querySelector('input[aria-label="left 背景"]')
  await ui.act(async () => backgroundInput.focus())
  await ui.close('right')
  await ui.settle()
  assert.equal(document.activeElement === backgroundInput, true)
  assert.equal(rightPane.hasAttribute('inert'), false)
  assert.equal(document.body.style.overflow, originalOverflow)
})

test('confirmation APIs stay inside their owner, preserve the existing dialog stack and support a global exit confirmation', async (t) => {
  const ui = await setup(t)
  await ui.enable(true)
  await ui.open('left')
  await ui.settle()
  const draft = document.querySelector('input[aria-label="left 草稿"]')
  const originalDialog = draft.closest('.ant-modal-root')
  let confirmation
  await ui.act(async () => { confirmation = ui.apis.left.confirm({ title: '局部确认', content: '仅处理当前栏', okText: '确认办理', cancelText: '继续编辑' }) })
  await ui.settle()
  const local = [...document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes('局部确认'))
  assert.equal(ui.scopes.left.host.contains(local), true)
  assert.equal(originalDialog.hasAttribute('inert'), true)
  await ui.act(async () => confirmation.destroy())
  await ui.settle()
  assert.equal(originalDialog.hasAttribute('inert'), false, JSON.stringify({ confirmationCount: document.querySelectorAll('.ant-modal-confirm').length, hostChildren: [...ui.scopes.left.host.children].map((node) => ({ className: node.className, inert: node.hasAttribute('inert'), text: node.textContent.slice(0, 60) })) }))
  assert.equal(document.querySelector('[data-pane="left"]').hasAttribute('inert'), true)
  await ui.act(async () => { confirmation = ui.apis.left.confirm({ title: '退出整个工作区', getContainer: () => document.body }) })
  await ui.settle()
  const global = [...document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes('退出整个工作区'))
  assert.equal(global.closest('.app-overlay-scope') === null, true)
  assert.equal(global.getAttribute('aria-modal'), 'true')
  await ui.act(async () => confirmation.destroy())
  await ui.settle()
})

test('leaving a pane checks its open business draft once and only grants permission after confirmation', async (t) => {
  const ui = await setup(t, { dirty: true })
  await ui.enable(true)
  await ui.open('left')
  await ui.settle()
  const draft = document.querySelector('input[aria-label="left 草稿"]')
  draft.value = '尚未提交的物料'
  let decision
  await ui.act(async () => { decision = ui.guards.left() })
  await ui.settle()
  const confirmation = () => [...document.querySelectorAll('.ant-modal-confirm')].find((node) => node.textContent.includes('放弃未保存的修改？'))
  const click = async (text) => ui.act(async () => [...confirmation().querySelectorAll('button')].find((node) => node.textContent.replaceAll(' ', '') === text).click())
  assert.equal(ui.scopes.left.host.contains(confirmation()), true)
  assert.equal(await ui.guards.left(), false, 'concurrent navigation cannot bypass or duplicate a pending decision')
  assert.equal(document.querySelectorAll('.ant-modal-confirm').length, 1)
  await click('继续编辑')
  assert.equal(await decision, false)
  await ui.settle()
  assert.equal(draft.value, '尚未提交的物料')
  await ui.act(async () => { decision = ui.guards.left({ overlay: 'workspace' }) })
  await ui.settle()
  assert.equal(confirmation().closest('.app-overlay-scope') === null, true)
  await click('放弃修改')
  assert.equal(await decision, true)
  await ui.settle()
  assert.equal(document.querySelector('input[aria-label="left 草稿"]') === draft, true, 'permission must not discard content before the caller completes navigation')
})

test('a hidden pane keeps deferred confirmations and selector portals in its hidden host', async (t) => {
  const ui = await setup(t)
  let confirmation
  await ui.act(async () => { confirmation = ui.apis.right.info({ title: '后台读取结果' }) })
  await ui.settle()
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find((node) => node.textContent.includes('后台读取结果'))
  assert.equal(ui.scopes.right.host.contains(dialog), true)
  assert.equal(ui.scopes.right.host.hidden, true)
  assert.equal(ui.popups.right() === ui.scopes.right.host, true)
  assert.equal(ui.container.hasAttribute('inert'), false)
  await ui.enable(true)
  assert.equal(ui.scopes.right.host.hidden, false)
  assert.equal(dialog.getAttribute('aria-modal'), 'false')
  await ui.act(async () => confirmation.destroy())
  await ui.settle()
})

test('popup keyboard priority ignores another pane and nonvisible selector roots', async (t) => {
  const ui = await setup(t)
  await ui.enable(true)
  const { hasVisibleOverlayPopup } = await import('./OverlayScopeContext.mjs')
  const rightPopup = document.createElement('div')
  rightPopup.className = 'ant-select-dropdown'
  rightPopup.getClientRects = () => [{}]
  ui.scopes.right.host.append(rightPopup)
  assert.equal(hasVisibleOverlayPopup(ui.scopes.left), false)
  assert.equal(hasVisibleOverlayPopup(ui.scopes.right), true)
  assert.equal(hasVisibleOverlayPopup(), true)
  rightPopup.getClientRects = () => []
  assert.equal(hasVisibleOverlayPopup(), false)
})

test('repeated layout changes reuse geometry observers and release only the closed pane isolation', async (t) => {
  const ui = await setup(t)
  await ui.enable(true)
  await ui.open('left')
  await ui.open('right')
  await ui.settle()
  const original = globalThis.ResizeObserver
  let created = 0
  globalThis.ResizeObserver = class extends original {
    constructor(callback) { super(callback); created += 1 }
  }
  try {
    for (let index = 1; index <= 10; index += 1) await ui.relayout(index)
    assert.equal(created, 0, 'resizing must reuse the existing geometry observers')
    await ui.close('right')
    assert.equal(document.querySelector('[data-pane="right"]').hasAttribute('inert'), false)
    assert.equal(document.querySelector('[data-pane="left"]').hasAttribute('inert'), true)
    await ui.close('left')
    assert.equal(document.querySelector('[data-pane="left"]').hasAttribute('inert'), false)
  } finally {
    globalThis.ResizeObserver = original
  }
})

test('pane scrolling skips geometry reads while viewport scrolling still updates the overlay bounds', async (t) => {
  const ui = await setup(t)
  await ui.enable(true)
  await ui.settle()
  const pane = document.querySelector('[data-pane="left"]')
  const bounds = pane.getBoundingClientRect.bind(pane)
  let reads = 0
  pane.getBoundingClientRect = () => { reads += 1; return bounds() }
  await ui.act(async () => {
    pane.dispatchEvent(new window.Event('scroll'))
    await delay(40)
  })
  assert.equal(reads, 0)
  await ui.act(async () => {
    document.dispatchEvent(new window.Event('scroll'))
    await delay(40)
  })
  assert.ok(reads > 0)
})

test('workspace chrome stays outside pane isolation and reserves space without recreating its geometry observer', async (t) => {
  const ui = await setup(t)
  await ui.enable(true)
  const pane = document.querySelector('[data-pane="right"]')
  const anchor = pane.querySelector('button')
  const control = document.createElement('button')
  ui.scopes.right.chromeHost.append(control)
  pane.getBoundingClientRect = () => ({ x: 100, y: 80, width: 600, height: 700 })
  anchor.getClientRects = () => [{}]
  anchor.getBoundingClientRect = () => ({ top: 100, bottom: 132, right: 680, width: 32, height: 32 })
  const release = ui.scopes.right.registerChromeControl(anchor, control, anchor)
  assert.equal(control.style.right, '20px')
  assert.equal(control.style.top, '20px')
  assert.equal(ui.scopes.right.host.style.getPropertyValue('--app-overlay-chrome-height'), '60px')
  assert.equal(pane.style.getPropertyValue('--app-overlay-chrome-height'), '', 'header reservation must not trigger inherited business layout changes')
  assert.equal(ui.popups.right(control) === ui.scopes.right.chromeHost, true)
  await ui.open('right')
  await ui.settle()
  assert.equal(pane.hasAttribute('inert'), true)
  assert.equal(control.closest('[inert]') === null, true)
  assert.equal(ui.scopes.right.chromeHost.previousElementSibling === ui.scopes.right.host, true)
  await ui.enable(false)
  assert.equal(ui.scopes.right.chromeHost.hidden, true)
  await ui.enable(true)
  assert.equal(ui.scopes.right.chromeHost.hidden, false)
  release()
  assert.equal(ui.scopes.right.host.style.getPropertyValue('--app-overlay-chrome-height'), '0px')
})
