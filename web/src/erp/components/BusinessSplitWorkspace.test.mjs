import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { setTimeout as delay } from 'node:timers/promises'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

async function setup(t) {
  const nativeAbortController = globalThis.AbortController
  const ui = await createReactTestHarness(t)
  globalThis.AbortController = nativeAbortController
  const { createMemoryRouter, RouterProvider, Routes, Route, Outlet, useLocation, useNavigate, useOutletContext, useSearchParams } = await import('react-router-dom')
  const { Form, Input } = await import('antd')
  const { default: Workspace } = await import('./BusinessSplitWorkspace.jsx')
  const { default: FormPage } = await import('./business-list/BusinessFormPage.jsx')
  const { ERPThemeProvider } = await import('../../common/theme/erpTheme.jsx')
  const events = await import('../../common/utils/rpcChanges.mjs')
  const reads = { one: 0, two: 0, three: 0 }
  const forms = {}
  const editors = {}
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
    return h('div', { 'data-page': name }, h('output', { 'data-query': name }, query.get('q') || ''), h('button', { 'data-query-button': name, onClick: () => setQuery({ q: '保留搜索' }) }, '筛选'), h(FormPage, { open, form, title: `编辑 ${name}`, onCancel: () => changeOpen(false) }, h(Form, { form, initialValues: { note: `${name} 初始内容`, qty: '12.5' } }, h(Form.Item, { name: 'note' }, h(Input, { 'aria-label': `${name} 备注` })), h(Form.Item, { name: 'qty' }, h(Input))
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
