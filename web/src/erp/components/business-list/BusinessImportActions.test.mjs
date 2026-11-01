import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('import actions keep undo before import and disable stale undo without a notice row', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Actions }] = await Promise.all([
    import('react-dom/client'), import('./BusinessImportActions.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  let undos = 0
  const render = async (undoState, disabled = false) => {
    const actions = createElement(Actions, { undoState, disabled, onUndo: () => { undos += 1 } }, createElement('button', null, '从来源导入'))
    await act(async () => root.render(actions))
  }
  await render('')
  assert.deepEqual([...container.querySelectorAll('button')].map((button) => button.textContent.trim()), ['从来源导入'])
  await render('ready')
  assert.deepEqual([...container.querySelectorAll('button')].map((button) => button.textContent.trim()), ['撤销本次导入', '从来源导入'])
  await act(async () => container.querySelector('button').click())
  assert.equal(undos, 1)
  await render('changed')
  assert.equal(container.querySelector('button').disabled, true)
  assert.equal(Boolean(container.querySelector('[role="status"]')), false)
  await act(async () => container.querySelector('button').click())
  assert.equal(undos, 1)
  await render('ready', true)
  assert.equal(container.querySelector('button').disabled, true)
  assert.equal(Boolean(container.querySelector('[role="status"]')), false)
  await render('')
  assert.equal(container.querySelectorAll('button').length, 1)
})
