import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { installTestDOM, registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

test('桌面与手机共享身份，切换账号或移除姓名岗位后不保留旧值', async () => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const { default: AccountIdentity } = await import('./AccountIdentity.jsx')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = async (profile, compact = false) => {
    await act(async () => root.render(createElement(AccountIdentity, { profile, compact })))
  }
  try {
    const profile = {
      id: 41,
      display_name: '王小明',
      username: 'warehouse01',
      roles: [{ role_key: 'warehouse', name: '仓库' }, { role_key: 'purchase', name: '采购' }, { role_key: 'quality', name: '品质' }],
    }
    await render(profile)
    assert.match(container.textContent, /王小明账号：warehouse01所属岗位：仓库、采购、品质/u)
    const { tone } = container.querySelector('.erp-account-avatar').dataset
    await render(profile, true)
    assert.equal(container.querySelector('.erp-account-avatar').dataset.tone, tone)
    assert.match(container.textContent, /所属岗位：仓库、采购、品质/u)

    await render({ ...profile, display_name: '', roles: [] })
    assert.doesNotMatch(container.textContent, /王小明|采购|品质/u)
    assert.match(container.textContent, /姓名待补录账号：warehouse01所属岗位：未分配岗位/u)
    assert.equal(container.querySelector('.erp-account-avatar').textContent, '用户')

    await render({ id: 42, username: 'admin', is_super_admin: false, roles: [] })
    assert.match(container.textContent, /姓名待补录账号：admin所属岗位：未分配岗位/u)
    assert.doesNotMatch(container.textContent, /超级管理员/u)

    await render({ id: 42, username: 'admin', is_super_admin: true, roles: [] })
    assert.match(container.textContent, /超级管理员账号：admin所属岗位：未分配岗位/u)
    assert.equal(container.querySelector('.erp-account-avatar').textContent, '管理')
    assert.equal(container.querySelector('.erp-account-identity__authority'), null)
    assert.doesNotMatch(container.textContent, /warehouse01|仓库|全部岗位/u)
    assert.notEqual(container.querySelector('.erp-account-avatar').dataset.tone, tone)
    assert.equal(container.querySelector('button,input,img'), null)
    assert.equal(container.querySelector('.erp-account-avatar').getAttribute('aria-hidden'), 'true')

    await render({ id: 42, display_name: '王宁', username: 'admin', is_super_admin: true, roles: [] }, true)
    assert.match(container.textContent, /王宁超级管理员 · 所属岗位：未分配岗位/u)
    await render({ id: 42, display_name: '王宁', username: 'admin', is_super_admin: true, roles: [] })
    assert.match(container.textContent, /王宁账号：admin超级管理员所属岗位：未分配岗位/u)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  }
})
