import React, { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { Buffer } from 'node:buffer'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

let runtime
async function mount(t, entries, adminID = null) {
  const dom = installTestDOM()
  if (adminID) {
    const { persistAuth } = await import('../../common/auth/auth.js')
    const now = Math.floor(Date.now() / 1000)
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
    const claims = { uid: adminID, sid: 'sim-task-boundary', auth_version: 1, iss: 'plush-toy-erp', aud: ['plush-toy-erp-admin'], sub: 'admin_access_token', jti: 'sim-task-boundary', iat: now, exp: now + 3600 }
    persistAuth({ access_token: `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`, username: 'sim-task-boundary' })
  }
  if (!runtime) {
    registerJSXTestLoader()
    runtime = Promise.all([import('react-dom/client'), import('react-router-dom'), import('./MobileNavigationBoundary.jsx')])
  }
  const [{ createRoot }, router, { default: Boundary }] = await runtime
  let location
  const desktopMounts = []
  function Page() {
    const currentLocation = router.useLocation()
    location = currentLocation
    const navigate = router.useNavigate()
    React.useEffect(() => {
      if (currentLocation.pathname.startsWith('/erp')) desktopMounts.push(currentLocation.pathname)
    }, [currentLocation.pathname])
    if (location.pathname === '/task-link/42') return createElement(router.Navigate, { to: '/erp/task-board?mode=all&link_task=42', replace: true })
    return createElement('main', null, createElement(router.Link, { to: '/erp/warehouse/shipments?shipment_id=3' }, '关联单据'), createElement('button', { onClick: () => navigate({ pathname: '/erp/production/exceptions', search: '?view=mine', hash: '#records' }) }, '切换页签'), createElement('button', { onClick: () => navigate('/erp/help-center?view=reference&ref=products') }, '帮助'), createElement('button', { onClick: () => navigate('/task-link/42') }, '任务链接'), createElement('button', { onClick: () => navigate('/admin-login') }, '重新登录'), createElement('button', { onClick: () => navigate(-1) }, '返回'), createElement('button', { onClick: () => navigate('/entry') }, '切换工作入口'), createElement('button', { onClick: () => navigate('/erp/dashboard') }, '选择电脑版'),
    )
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  await act(async () => root.render(createElement(router.MemoryRouter, { initialEntries: entries, initialIndex: entries.length - 1, future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Boundary, null, createElement(router.Routes, null, createElement(router.Route, { path: '*', element: createElement(Page) }))))))
  return {
    location: () => location,
    desktopMounts,
    click: async (label) => {
      const button = [...container.querySelectorAll('button, a')].find((node) => node.textContent === label)
      assert.equal(Boolean(button), true)
      await act(async () => button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })))
    },
  }
}

test('phone links and page-tab navigation cannot open source documents or the desktop shell', async (t) => {
  const page = await mount(t, ['/m/sales/tasks'])
  await page.click('关联单据')
  assert.equal(page.location().pathname, '/m/sales/tasks')
  assert.equal(page.location().search, '')
  await page.click('切换页签')
  assert.equal(page.location().pathname, '/m/sales/tasks')
  assert.equal(page.location().hash, '')
  assert.deepEqual(page.desktopMounts, [])
})

test('help stays readable in the phone shell and preserves the original task context', async (t) => {
  const taskNavigation = { taskID: 7, adminID: 1, returnPath: '/m/sales/tasks', entryPath: '/m/sales/tasks' }
  const page = await mount(t, [{ pathname: taskNavigation.entryPath, state: { workflowTaskNavigation: taskNavigation } }])
  await page.click('帮助')
  assert.equal(page.location().pathname, '/m/sales/handle/help-center')
  assert.equal(page.location().search, '?view=reference&ref=products')
  assert.equal(page.location().state.workflowTaskNavigation.taskID, 7)
  assert.equal(page.location().state.workflowTaskNavigation.returnPath, '/m/sales/tasks')
  assert.deepEqual(page.desktopMounts, [])
})

test('a legacy phone document deep link returns to the same role tasks', async (t) => {
  const page = await mount(t, ['/m/warehouse/handle/warehouse/shipments?shipment_id=3'])
  assert.equal(page.location().pathname, '/m/warehouse/tasks')
  assert.equal(page.location().search, '')
  assert.deepEqual(page.desktopMounts, [])
})

test('a task-scoped document deep link cannot bypass the phone task boundary', async (t) => {
  const page = await mount(t, ['/m/warehouse/tasks/31/handle/warehouse/inbound?receipt_id=91'])
  assert.equal(page.location().pathname, '/m/warehouse/tasks')
  assert.equal(page.location().search, '')
  assert.deepEqual(page.desktopMounts, [])
})

test('a valid task handoff still cannot expose a phone source document', async (t) => {
  const pathname = '/m/warehouse/tasks/31/handle/warehouse/inbound'
  const navigation = { taskID: 31, adminID: 12, entryPath: `${pathname}?receipt_id=91`, returnPath: '/m/warehouse/tasks' }
  const page = await mount(t, [{ pathname, search: '?receipt_id=91', state: { workflowTaskNavigation: navigation } }], 12)
  assert.equal(page.location().pathname, '/m/warehouse/tasks')
  assert.equal(page.location().search, '')
  assert.deepEqual(page.desktopMounts, [])
})

for (const patch of [{ adminID: 13 }, { taskID: 32 }, { returnPath: '/m/boss/tasks' }]) {
  test(`a task business handoff rejects mismatched identity ${JSON.stringify(patch)}`, async (t) => {
    const pathname = '/m/warehouse/tasks/31/handle/warehouse/inbound'
    const navigation = { taskID: 31, adminID: 12, entryPath: `${pathname}?receipt_id=91`, returnPath: '/m/warehouse/tasks', ...patch }
    const page = await mount(t, [{ pathname, search: '?receipt_id=91', state: { workflowTaskNavigation: navigation } }], 12)
    assert.equal(page.location().pathname, '/m/warehouse/tasks')
    assert.equal(page.location().search, '')
    assert.deepEqual(page.desktopMounts, [])
  })
}

test('a shared task redirect keeps the current phone role and exact task identity', async (t) => {
  const page = await mount(t, ['/m/engineering/tasks'])
  await page.click('任务链接')
  assert.equal(page.location().pathname, '/m/engineering/tasks')
  assert.equal(page.location().search, '?link_task=42')
  assert.deepEqual(page.desktopMounts, [])
})

test('phone browser back cannot restore an earlier desktop page', async (t) => {
  const page = await mount(t, ['/erp/dashboard', '/m/warehouse/tasks'])
  await page.click('返回')
  assert.equal(page.location().pathname, '/m/warehouse/tasks')
  assert.deepEqual(page.desktopMounts, [])
})

test('only work-entry selection permits switching from the phone flow to desktop', async (t) => {
  const page = await mount(t, ['/m/sales/tasks'])
  await page.click('选择电脑版')
  assert.equal(page.location().pathname, '/m/sales/tasks')
  await page.click('切换工作入口')
  assert.equal(page.location().pathname, '/entry')
  await page.click('选择电脑版')
  assert.equal(page.location().pathname, '/erp/dashboard')
  assert.deepEqual(page.desktopMounts, ['/erp/dashboard'])
})

test('re-authentication cannot silently turn a phone flow into desktop', async (t) => {
  const page = await mount(t, ['/m/sales/tasks'])
  await page.click('重新登录')
  assert.equal(page.location().pathname, '/admin-login')
  await page.click('选择电脑版')
  assert.equal(page.location().pathname, '/m/sales/tasks')
  assert.deepEqual(page.desktopMounts, [])
})

test('an explicit desktop deep link remains available in a fresh flow', async (t) => {
  const page = await mount(t, ['/erp/warehouse/shipments?shipment_id=3'])
  assert.equal(page.location().pathname, '/erp/warehouse/shipments')
  assert.deepEqual(page.desktopMounts, ['/erp/warehouse/shipments'])
})
