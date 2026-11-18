import React, { act, createElement as h } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

async function mountRecord(t, device) {
  const ui = await createReactTestHarness(t)
  const [{ createMemoryRouter, RouterProvider }, { App, Button }, { default: RecordDrawer }, { BusinessPageContext }, { ERPThemeProvider }] = await Promise.all([
    import('react-router-dom'), import('antd'), import('./ProductionRecordDrawer.jsx'),
    import('../../hooks/useBusinessPageContext.js'), import('../../../common/theme/erpTheme.jsx'),
  ])
  const actionHost = document.createElement('div')
  document.body.appendChild(actionHost)
  t.after(() => actionHost.remove())
  let update
  let saves = 0
  let busy = false
  const onBusyChange = (value) => { busy = value }
  function Screen() {
    const [settings, setSettings] = React.useState({ open: true, readOnly: false, loading: false })
    update = setSettings
    const taskBusiness = device ? { device, taskID: 31, readOnly: settings.readOnly, actionHost, onBusyChange } : null
    return h(App, null, h(BusinessPageContext.Provider, { value: { taskBusiness } }, h(RecordDrawer, {
      ...settings,
      title: '核对本次生产记录',
      record: { id: 7, fact_no: 'SIM-FACT-7', quantity: 18 },
      columns: [{ dataIndex: 'quantity', title: '数量' }],
      summary: { title: '待仓库确认成品入库', next: '核对本次实收。' },
      onClose: () => setSettings((value) => ({ ...value, open: false })),
      actions: h(Button, { onClick: () => saves++ }, '确认成品入库'),
    })))
  }
  const router = createMemoryRouter([{ path: '/', element: h(Screen) }])
  t.after(() => router.dispose())
  await ui.render(h(ERPThemeProvider, null, h(RouterProvider, { router, future: { v7_startTransition: true } })))
  return { ui, actionHost, update: (settings) => act(async () => update(settings)), saves: () => saves, busy: () => busy }
}

for (const device of ['desktop', 'mobile']) {
  test(`${device} task record reuses the inline workspace, shared footer and readonly/busy boundaries`, async (t) => {
    const screen = await mountRecord(t, device)
    assert.equal(document.querySelectorAll('[role="dialog"]').length, 0)
    assert.equal(screen.ui.container.querySelectorAll('[data-business-form-page]').length, 1)
    assert.ok(screen.ui.container.textContent.includes('SIM-FACT-7'))
    assert.ok(screen.actionHost.textContent.includes('确认成品入库'))
    assert.equal(screen.actionHost.textContent.includes('返回列表'), false)
    assert.equal(screen.saves(), 0)
    await act(async () => screen.actionHost.querySelector('button').click())
    assert.equal(screen.saves(), 1)
    await screen.update({ open: true, readOnly: false, loading: true })
    assert.equal(screen.busy(), true)
    await screen.update({ open: true, readOnly: true, loading: false })
    assert.equal(screen.busy(), false)
    assert.equal(Boolean(screen.actionHost.querySelector('button')), false)
    assert.ok(screen.ui.container.textContent.includes('SIM-FACT-7'))
    await screen.update({ open: false, readOnly: true, loading: false })
    assert.equal(screen.actionHost.childElementCount, 0)
  })
}

test('standalone record keeps a closable drawer with its original return action', async (t) => {
  const screen = await mountRecord(t)
  assert.equal(document.querySelectorAll('[role="dialog"]').length, 1)
  assert.equal(document.querySelectorAll('[data-business-form-page]').length, 0)
  const returnButton = [...document.querySelectorAll('button')].find((button) => button.textContent === '返回列表')
  assert.ok(returnButton)
  await screen.update({ open: true, readOnly: false, loading: true })
  assert.equal(returnButton.disabled, true)
  await screen.update({ open: true, readOnly: false, loading: false })
  await act(async () => returnButton.click())
  assert.equal(document.querySelectorAll('.ant-drawer-open').length, 0)
})
