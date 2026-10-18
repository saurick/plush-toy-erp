import React, { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

async function mount(t, { entries, target, options = {} }) {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, router, { default: useBusinessNavigate }, { default: BusinessLink }] = await Promise.all([
    import('react-dom/client'), import('react-router-dom'), import('./useBusinessNavigate.js'), import('../components/business-list/BusinessLink.jsx'),
  ])
  let observed
  function BusinessPage() {
    const navigate = useBusinessNavigate()
    observed = router.useLocation()
    return createElement(React.Fragment, {}, typeof target === 'number' ? null : createElement(BusinessLink, { to: target, state: options.state }, '关联单据'), createElement('button', { onClick: () => navigate(target, options) }, '切换'),
    )
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  await act(async () => root.render(createElement(router.MemoryRouter, { initialEntries: entries, initialIndex: entries.length - 1, future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(BusinessPage))))
  return { container, observed: () => observed, click: () => act(async () => container.querySelector('button').click()), followLink: () => act(async () => container.querySelector('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))) }
}

test('mobile reference links carry the task return context along with a phone href', async (t) => {
  const navigation = { taskID: 9, adminID: 1, entryPath: '/m/sales/handle/warehouse/shipments', returnPath: '/m/sales/tasks' }
  const page = await mount(t, { entries: [{ pathname: navigation.entryPath, state: { workflowTaskNavigation: navigation } }], target: '/erp/help-center?view=reference&page=shipments#status', options: { state: { fromHelp: true } } })
  await page.followLink()
  assert.equal(page.observed().pathname, '/m/sales/handle/help-center')
  assert.equal(page.observed().state.workflowTaskNavigation.entryPath, '/m/sales/handle/help-center?view=reference&page=shipments#status')
  assert.equal(page.observed().state.workflowTaskNavigation.returnPath, '/m/sales/tasks')
  assert.equal(page.observed().state.fromHelp, true)
})

test('mobile business tabs, object routes and reference links keep the phone shell and task context', async (t) => {
  const taskNavigation = { taskID: 8, adminID: 1, entryPath: '/m/sales/handle/warehouse/shipments?shipment_id=7', returnPath: '/m/sales/tasks' }
  const target = { pathname: '/erp/production/progress', search: '?view=exceptions', hash: '#records' }
  const page = await mount(t, { entries: [{ pathname: '/m/sales/handle/warehouse/shipments', search: '?shipment_id=7', state: { workflowTaskNavigation: taskNavigation } }], target, options: { state: { fromTab: 'shipment' } } })
  assert.equal(page.container.querySelector('a').getAttribute('href'), '/m/sales/handle/production/progress?view=exceptions#records')
  await page.click()
  assert.equal(page.observed().pathname, '/m/sales/handle/production/progress')
  assert.equal(page.observed().state.workflowTaskNavigation.entryPath, '/m/sales/handle/production/progress?view=exceptions#records')
  assert.equal(page.observed().state.workflowTaskNavigation.returnPath, '/m/sales/tasks')
  assert.equal(page.observed().state.fromTab, 'shipment')
})

test('desktop business navigation remains desktop and search-only changes stay on the current route', async (t) => {
  const page = await mount(t, { entries: ['/erp/production/progress'], target: { search: '?view=exceptions' } })
  await page.click()
  assert.equal(page.observed().pathname, '/erp/production/progress')
  assert.equal(page.observed().search, '?view=exceptions')
})

test('mobile browser back preserves ordinary phone history', async (t) => {
  const page = await mount(t, { entries: ['/m/warehouse/tasks', '/m/warehouse/handle/warehouse/inbound'], target: -1 })
  await page.click()
  assert.equal(page.observed().pathname, '/m/warehouse/tasks')
})
