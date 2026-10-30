import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, StrictMode } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import { ERP_ACCENTS } from './erpAppearance.mjs'

test('isolated themes keep body portals stable and remove only their own container', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { Modal }, { default: ERPThemeScope }] = await Promise.all([
    import('react-dom/client'), import('antd'), import('./ERPThemeScope.jsx'),
  ])
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const scope = (key, mode) => createElement(ERPThemeScope,
    { key, mode, accent: ERP_ACCENTS.blue, density: 'compact' },
    createElement(Modal, { open: true, title: key, className: key, transitionName: '', maskTransitionName: '' }, key)
  )
  const render = async (firstMode, showFirst = true) => {
    const scopes = [scope('second-scope', 'dark')]
    if (showFirst) scopes.unshift(scope('first-scope', firstMode))
    await act(async () => root.render(createElement(StrictMode, null, ...scopes)))
    await act(async () => new Promise(setImmediate))
  }
  await render('light')
  const first = document.querySelector('.first-scope').closest('[data-erp-theme-portal]')
  const second = document.querySelector('.second-scope').closest('[data-erp-theme-portal]')
  assert(first)
  assert(second)
  assert.equal(container.contains(first), false, 'modal portal remains outside the inert application root')
  assert.equal(document.querySelectorAll('[data-erp-theme-portal]').length, 2, 'StrictMode leaves one container per mounted scope')
  await render('dark')
  assert.equal(document.querySelector('.first-scope').closest('[data-erp-theme-portal]') === first, true)
  assert.equal(first.dataset.erpTheme, 'dark')
  assert.equal(first.style.getPropertyValue('--erp-text'), '#f4f7fa')
  await render('light', false)
  assert.equal(first.isConnected, false)
  assert.equal(second.isConnected, true, 'unmount does not remove a different theme scope')
  assert.equal(document.querySelectorAll('[data-erp-theme-portal]').length, 1)
})
