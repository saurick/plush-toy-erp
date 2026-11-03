import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { setTimeout as delay } from 'node:timers/promises'
import { createRequire } from 'node:module'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('lazy splitter preview clamps physical pointer offsets in both directions without intermediate commits', async (t) => {
  const ui = await createReactTestHarness(t)
  const SplitBar = createRequire(import.meta.url)('antd/lib/splitter/SplitBar').default
  const mouse = (type, x = 500, y = 500) => {
    const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
    Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } })
    return event
  }
  for (const [reverse, size, offset, expected, vertical = false] of [[false, 40, -500, -80], [false, 40, 500, 280], [true, 40, -500, -280], [true, 40, 500, 80], [true, 32, -500, -360], [true, 68, 500, 360], [false, 40, -500, -80, true], [false, 40, 500, 280, true]]) {
    const updates = []
    await ui.render(h(SplitBar, { prefixCls: 'ant-splitter', vertical, reverse, index: 0, active: false, resizable: true, lazy: true, containerSize: 1000, ariaNow: size, ariaMin: 32, ariaMax: 68, onOffsetStart: () => {}, onOffsetUpdate: (...args) => updates.push(args), onOffsetEnd: () => {} }))
    const bar = document.querySelector('.ant-splitter-bar-dragger')
    await ui.act(async () => bar.dispatchEvent(mouse('mousedown')))
    await ui.act(async () => window.dispatchEvent(mouse('mousemove', 500 + (vertical ? 0 : offset), 500 + (vertical ? offset : 0))))
    assert.equal(updates.length, 0, 'pointer movement only changes the preview')
    await ui.act(async () => window.dispatchEvent(mouse('mouseup')))
    assert.equal(updates.length, 1)
    assert.ok(Math.abs(updates[0][vertical ? 2 : 1] - expected) < 0.001, `reverse=${reverse} vertical=${vertical} size=${size} offset=${offset}`)
    assert.equal(updates[0][3], true)
  }
})

async function setup(t) {
  const nativeAbortController = globalThis.AbortController
  const ui = await createReactTestHarness(t)
  globalThis.AbortController = nativeAbortController
  const { createMemoryRouter, RouterProvider, Routes, Route, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } = await import('react-router-dom')
  const { Form, Input } = await import('antd')
  const { default: Workspace } = await import('./BusinessSplitWorkspace.jsx')
  const { default: FormPage } = await import('./business-list/BusinessFormPage.jsx')
  const { default: BusinessModal } = await import('./business-list/BusinessModal.jsx')
  const { ERPThemeProvider } = await import('../../common/theme/erpTheme.jsx')
  const events = await import('../../common/utils/rpcChanges.mjs')
  const reads = { one: 0, two: 0, three: 0 }
  const forms = {}
  const editors = {}
  const modals = {}
  let workspace
  let allowRight
  let blockRight = false
  let failReads = false
  let readOverride
  let setOpen
  let setSide
  const sections = [{ title: '业务', items: ['one', 'two', 'three'].map((key) => ({ path: `/erp/${key}`, label: key, key })) }]
  function Page({ name }) {
    const context = useOutletContext()
    const [query, setQuery] = useSearchParams()
    const [open, changeOpen] = useState(false)
    const [modalOpen, setModalOpen] = useState(false)
    modals[name] = setModalOpen
    editors[name] = changeOpen
    const [form] = Form.useForm()
    forms[name] = form
    const refresh = useCallback(async () => {
      reads[name] += 1
      if (readOverride) { const value = readOverride(name); if (value !== undefined) return value }
      if (failReads) return false
      return true
    }, [name])
    useEffect(() => context.registerPageRefresh(refresh), [context, refresh])
    useEffect(() => name === 'two' ? context.registerPageLeaveGuard(() => !blockRight) : undefined, [context, name])
    return h('div', { 'data-page': name }, h(BusinessModal, { open: modalOpen, hasChanges: true, title: `快捷编辑 ${name}`, onCancel: () => setModalOpen(false) }, h('input', { 'aria-label': '浮层草稿', defaultValue: '尚未保存' })), h('output', { 'data-query': name }, query.get('q') || ''), h('button', { 'data-query-button': name, onClick: () => setQuery({ q: '保留搜索' }) }, '筛选'), h(FormPage, { open, form, title: `编辑 ${name}`, onCancel: () => changeOpen(false) }, h(Form, { form, initialValues: { note: `${name} 初始内容`, qty: '12.5' } }, h(Form.Item, { name: 'note' }, h(Input, { 'aria-label': `${name} 备注` })), h(Form.Item, { name: 'qty' }, h(Input))
        )
      )
    )
  }
  const pages = () => ['one', 'two', 'three'].map((name) => h(Route, { key: name, path: name, element: h(Page, { key: name, name }) }))
  function RenderRight({ location, context }) {
    return h(Routes, { location }, h(Route, { path: '/erp', element: h(Outlet, { context }) }, pages()))
  }
  function Shell() {
    const location = useLocation()
    const navigate = useNavigate()
    const [open, changeOpen] = useState(false)
    setOpen = changeOpen
    const [activeSide, setActiveSide] = useState('right')
    setSide = setActiveSide
    const [guard, setGuard] = useState(null)
    const [refresh, setRefresh] = useState(null)
    const [allowed, setAllowed] = useState(true)
    allowRight = setAllowed
    const workspaceRef = useRef(null)
    workspace = workspaceRef
    const registerGuard = useCallback((fn) => { setGuard(() => fn); return () => setGuard((old) => old === fn ? null : old) }, [])
    const registerRefresh = useCallback((fn) => { setRefresh(() => fn); return () => setRefresh((old) => old === fn ? null : old) }, [])
    const pageUIState = useMemo(() => ({ generation: 0, values: new Map() }), [])
    const context = useMemo(() => ({ pageUIState, registerPageRefresh: registerRefresh, registerPageLeaveGuard: registerGuard }), [pageUIState, registerRefresh, registerGuard])
    const resolvePage = useCallback((path) => ({ allowed: allowed && sections[0].items.some((item) => item.path === path), entry: { path, label: path, key: path } }), [allowed])
    return h(Workspace, { ref: workspaceRef, open, onOpenChange: changeOpen, activeSide, onActiveSideChange: setActiveSide, location, navigate, outletContext: context, leftGuard: guard, leftRefresh: refresh, sections, resolvePage, renderPage: (rightLocation, rightContext) => h(RenderRight, { location: rightLocation, context: rightContext }) }, h(Outlet, { context }))
  }
  const router = createMemoryRouter([{ path: '*', element: h(Routes, null, h(Route, { path: '/erp', element: h(Shell) }, pages())) }], { initialEntries: ['/erp/one'] })
  t.after(() => router.dispose())
  await ui.render(h(ERPThemeProvider, null, h(RouterProvider, { router, future: { v7_startTransition: true } })))
  return {
    ...ui,
router,
forms,
reads,
events,
    get workspace() { return workspace.current },
    open: () => ui.act(async () => setOpen(true)),
    openModal: (name) => ui.act(async () => modals[name](true)),
    collapse: () => ui.act(async () => setOpen(false)),
    side: (side) => ui.act(async () => setSide(side)),
    allow: (value) => ui.act(async () => allowRight(value)),
    block: (value) => { blockRight = value },
    fail: (value) => { failReads = value },
    read: (handler) => { readOverride = handler },
    navigate: (to, options) => ui.act(async () => workspace.current.navigate(to, options)),
    edit: (name, value = true) => ui.act(async () => editors[name](value)),
    settle: (ms = 120) => ui.act(async () => delay(ms)),
    changed: () => ui.act(async () => {
      document.querySelector('.erp-split-pane--right button').focus()
      events.notifyRpcRecordsChanged('masterdata', 'update_material', events.captureRpcChangeSource())
    }),
  }
}

test('two panes use the same pages with independent location, search and mounted drafts through collapse', async (t) => {
  const ui = await setup(t)
  await ui.open()
  await ui.navigate('/erp/two')
  assert.equal(ui.router.state.location.pathname, '/erp/one')
  assert.equal(document.querySelectorAll('[data-page="two"]').length, 1)
  await ui.act(async () => document.querySelector('[data-query-button="two"]').click())
  assert.equal(document.querySelector('[data-query="two"]').textContent, '保留搜索')
  assert.equal(ui.router.state.location.search, '')
  await ui.edit('one')
  await ui.edit('two')
  await ui.settle(35)
  await ui.act(async () => ui.forms.one.setFieldValue('note', '左栏未保存'))
  await ui.act(async () => ui.forms.two.setFieldValue('note', '右栏未保存'))
  const originalInput = document.querySelector('input[aria-label="two 备注"]')
  await ui.collapse()
  await ui.open()
  assert.equal(document.querySelector('input[aria-label="two 备注"]') === originalInput, true)
  assert.equal(ui.forms.one.getFieldValue('note'), '左栏未保存')
  assert.equal(ui.forms.two.getFieldValue('note'), '右栏未保存')
})

test('swapping visual sides preserves both drafts, search and page instances without replaying reads', async (t) => {
  const ui = await setup(t)
  await ui.open()
  await ui.navigate('/erp/two')
  await ui.act(async () => document.querySelector('[data-query-button="two"]').click())
  await ui.edit('one')
  await ui.edit('two')
  await ui.settle(35)
  await ui.act(async () => {
    ui.forms.one.setFieldValue('note', '原页面未保存')
    ui.forms.two.setFieldValue('note', '附加页面未保存')
  })
  const one = document.querySelector('input[aria-label="one 备注"]')
  const two = document.querySelector('input[aria-label="two 备注"]')
  const originalHeader = document.querySelector('.erp-split-pane--left .erp-split-pane__header')
  const attachedHeader = document.querySelector('.erp-split-pane--right .erp-split-pane__header')
  const layout = () => document.querySelector('button[aria-label="布局"]')
  const swap = () => [...document.querySelectorAll('.erp-split-layout-options button')].find((node) => node.textContent.includes('左右互换'))
  await ui.act(async () => layout().click())
  await ui.flush()
  assert.equal(document.querySelector('input[aria-label="左栏宽度百分比"]').value, '50')
  assert.equal(swap().disabled, false)
  await ui.act(async () => swap().click())
  await ui.settle(35)
  assert.equal(document.querySelector('.erp-split-panels').style.direction, 'rtl')
  assert.equal(document.querySelector('.erp-split-pane--left').getAttribute('aria-label'), '右栏页面')
  assert.equal(document.querySelector('.erp-split-pane--right').getAttribute('aria-label'), '左栏页面')
  assert.equal(document.querySelector('.erp-split-pane--left .erp-split-pane__header') === originalHeader, true)
  assert.equal(document.querySelector('.erp-split-pane--right .erp-split-pane__header') === attachedHeader, true)
  assert.equal(document.querySelector('input[aria-label="one 备注"]') === one, true)
  assert.equal(document.querySelector('input[aria-label="two 备注"]') === two, true)
  assert.equal(ui.forms.one.getFieldValue('note'), '原页面未保存')
  assert.equal(ui.forms.two.getFieldValue('note'), '附加页面未保存')
  assert.equal(document.querySelector('[data-query="two"]').textContent, '保留搜索')
  assert.equal(ui.router.state.location.pathname, '/erp/one')
  assert.deepEqual(ui.reads, { one: 0, two: 0, three: 0 })
  await ui.collapse()
  await ui.open()
  assert.equal(document.querySelector('input[aria-label="two 备注"]') === two, true)
  assert.equal(document.querySelector('.erp-split-panels').style.direction, 'rtl')
  await ui.act(async () => layout().click())
  await ui.flush()
  assert.equal(document.querySelector('input[aria-label="右栏宽度百分比"]').value, '50')
  await ui.act(async () => swap().click())
  await ui.flush()
  assert.equal(document.querySelector('.erp-split-panels').style.direction, 'ltr')
  assert.equal(document.querySelector('input[aria-label="one 备注"]') === one, true)
  assert.equal(document.querySelector('input[aria-label="two 备注"]') === two, true)
})

test('confirmed changes refresh the other pane once; reads do not loop, and drafts wait until editing ends', async (t) => {
  const ui = await setup(t)
  await ui.open()
  await ui.navigate('/erp/two')
  await ui.changed()
  await ui.changed()
  await ui.settle()
  assert.deepEqual(ui.reads, { one: 1, two: 0, three: 0 })
  await ui.act(async () => ui.events.notifyRpcRecordsChanged('masterdata', 'list_materials', ui.events.captureRpcChangeSource()))
  await ui.settle()
  assert.equal(ui.reads.one, 1)
  await ui.edit('one')
  await ui.settle(35)
  await ui.act(async () => ui.forms.one.setFieldValue('note', '保存后也不能覆盖这段草稿'))
  await ui.changed()
  await ui.settle()
  assert.equal(ui.reads.one, 1)
  assert.equal(ui.forms.one.getFieldValue('note'), '保存后也不能覆盖这段草稿')
  assert.match(document.querySelector('.erp-split-pane--left').textContent, /资料已更新/)
  await ui.edit('one', false)
  await ui.settle()
  assert.equal(ui.reads.one, 2)
})

test('right navigation respects the registered guard and permission revocation removes its page', async (t) => {
  const ui = await setup(t)
  await ui.open()
  await ui.navigate('/erp/two')
  ui.block(true)
  await ui.navigate('/erp/three')
  assert.equal(document.querySelectorAll('[data-page="two"]').length, 1)
  assert.equal(document.querySelectorAll('[data-page="three"]').length, 0)
  ui.block(false)
  await ui.navigate('/erp/three')
  assert.equal(document.querySelectorAll('[data-page="three"]').length, 1)
  await ui.allow(false)
  assert.equal(document.querySelectorAll('[data-page="three"]').length, 0)
  assert.match(document.querySelector('.erp-split-pane--right').textContent, /当前账号不能查看这个页面/)
})

test('failed synchronized reads expose a read-only retry without clearing selection or replaying writes', async (t) => {
  const ui = await setup(t)
  await ui.open()
  await ui.navigate('/erp/two')
  ui.fail(true)
  await ui.changed()
  await ui.settle()
  assert.equal(ui.reads.one, 1)
  assert.match(document.querySelector('.erp-split-pane--left').textContent, /关联页面更新失败/)
  ui.fail(false)
  await ui.act(async () => [...document.querySelectorAll('button')].find((node) => node.textContent === '重试读取').click())
  assert.equal(ui.reads.one, 2)
  assert.doesNotMatch(document.querySelector('.erp-split-pane--left').textContent, /关联页面更新失败/)
})

test('a later write queues one fresh read and changing a page ignores the earlier read failure', async (t) => {
  const ui = await setup(t)
  await ui.open()
  await ui.navigate('/erp/two')
  let finish
  ui.read((name) => name === 'one' && ui.reads.one === 1 ? new Promise((resolve) => { finish = resolve }) : undefined)
  await ui.changed()
  await ui.settle()
  await ui.changed()
  await ui.settle()
  await ui.act(async () => finish(true))
  await ui.settle()
  assert.equal(ui.reads.one, 2)
  ui.read((name) => name === 'one' ? new Promise((resolve) => { finish = resolve }) : undefined)
  await ui.changed()
  await ui.settle()
  await ui.side('left')
  await ui.navigate('/erp/three')
  await ui.act(async () => finish(false))
  await ui.settle()
  assert.equal(document.querySelectorAll('.erp-split-pane--left [data-page="three"]').length, 1)
  assert.doesNotMatch(document.querySelector('.erp-split-pane--left').textContent, /关联页面更新失败/)
})

test('browser back checks an open modal even before a second page is selected', async (t) => {
  const ui = await setup(t)
  await ui.act(async () => ui.router.navigate('/erp/two'))
  await ui.open()
  await ui.openModal('two')
  assert.equal(ui.workspace.ownsNavigation, true)
  const draft = document.querySelector('input[aria-label="浮层草稿"]')
  await ui.act(async () => ui.router.navigate(-1))
  await ui.act(async () => delay(350))
  const confirmation = [...document.querySelectorAll('.ant-modal-confirm')].find((node) => node.textContent.includes('放弃未保存的修改？'))
  assert.equal(Boolean(confirmation), true)
  await ui.act(async () => [...confirmation.querySelectorAll('button')].find((node) => node.textContent.replaceAll(' ', '') === '继续编辑').click())
  await ui.act(async () => delay(350))
  assert.equal(ui.router.state.location.pathname, '/erp/two')
  assert.equal(document.querySelector('input[aria-label="浮层草稿"]') === draft, true)
  assert.equal(draft.value, '尚未保存')
})
