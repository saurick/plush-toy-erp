import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'

test('initiator role follows the creation snapshot and clears when switching to a historical record', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Initiator }] = await Promise.all([
    import('react-dom/client'), import('./WorkflowInitiator.jsx'),
  ])
  const node = document.createElement('div')
  document.body.appendChild(node)
  const root = createRoot(node)
  t.after(async () => {
    await act(async () => root.unmount())
    node.remove(); dom.restore()
  })
  const show = (role, name = '演示业务') => act(async () => root.render(createElement(Initiator, {
    summary: { initiator_name: name, initiator_role_key: role, owner_role_key: 'boss' },
  })))
  await show('sales')
  assert.match(node.textContent, /演示业务发起岗位：业务/)
  await show('admin', '系统管理员')
  assert.match(node.textContent, /系统管理员发起岗位：管理员/)
  await show('')
  assert.match(node.textContent, /演示业务发起岗位未记录/)
  assert.doesNotMatch(node.textContent, /发起岗位：业务|老板|管理员/)
  await show(undefined)
  assert.match(node.textContent, /发起岗位未记录/)
  assert.equal(node.querySelector('.erp-workflow-responsibilities__role'), null)
  assert.equal(node.querySelectorAll('a, button, [tabindex]').length, 0)
})
