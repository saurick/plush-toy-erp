import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h, useEffect } from 'react'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('已访问视图保留节点和草稿，返回时使用最新数据与动作权限', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ BusinessViewPanels }, { useOverlayScope }] = await Promise.all([
    import('./BusinessVisualizationFrame.jsx'),
    import('../../../common/components/overlay/OverlayScopeContext.mjs'),
  ])
  const mounts = {}
  function View({ name, revision, editable }) {
    const scope = useOverlayScope()
    useEffect(() => { mounts[name] = (mounts[name] || 0) + 1 }, [name])
    return h('section', { 'data-view': name, 'data-visible': scope?.visible }, h('span', null, `${name}:${revision}`), h('input', { 'aria-label': `${name}草稿`, defaultValue: '' }), h('button', { disabled: !editable }, '办理'))
  }
  const render = (active, revision = 1, editable = true, views = ['list', 'process']) => ui.render(
    h(BusinessViewPanels, { activeView: active, views }, h(View, { name: active, revision, editable })))
  await render('list')
  const input = ui.container.querySelector('input')
  input.value = '尚未提交的输入'
  assert.equal(ui.container.querySelectorAll('[data-business-view-panel]').length, 1, '未访问视图不挂载')
  await render('process')
  const hidden = ui.container.querySelector('[data-business-view-panel="list"]')
  assert.equal(hidden.hidden, true)
  assert.equal(hidden.hasAttribute('inert'), true)
  assert.equal(hidden.querySelector('[data-visible]').getAttribute('data-visible'), 'false')
  await render('list', 2, false)
  const current = ui.container.querySelector('[data-business-view-panel="list"]')
  assert.equal(current.querySelector('input') === input, true)
  assert.equal(input.value, '尚未提交的输入')
  assert.equal(current.querySelector('span').textContent, 'list:2')
  assert.equal(current.querySelector('button').disabled, true)
  assert.deepEqual(mounts, { list: 1, process: 1 })
  await render('other')
  assert.equal(ui.container.querySelectorAll('[data-business-view-panel]').length, 0, '不保留白名单以外的视图')
  await render('list', 3)
  assert.equal(mounts.list, 2, '离开保留范围后释放旧视图')
})

test('隐藏视图同时隐藏其弹窗并释放背景，返回保留弹窗输入', async (t) => {
  const ui = await createReactTestHarness(t)
  ui.container.id = 'root'
  const [{ BusinessViewPanels }, { default: Modal }] = await Promise.all([
    import('./BusinessVisualizationFrame.jsx'),
    import('../../../common/components/modal/AppModal.jsx'),
  ])
  function View({ name }) {
    return h('section', null, name, h(Modal, { open: name === 'list', title: '视图内弹窗', footer: null }, h('input', { 'aria-label': '弹窗草稿', defaultValue: '' })))
  }
  const render = (name) => ui.render(h(BusinessViewPanels, { activeView: name, views: ['list', 'process'] }, h(View, { name })))
  await render('list')
  await ui.flush()
  const input = document.querySelector('input[aria-label="弹窗草稿"]')
  assert.equal(Boolean(input), true)
  input.value = '保留这份草稿'
  const host = input.closest('.app-overlay-scope')
  assert.equal(Boolean(host), true)
  assert.equal(host.hidden, false)
  await render('process')
  await ui.flush()
  assert.equal(host.hidden, true)
  assert.equal(ui.container.hasAttribute('inert'), false, '隐藏弹窗不能继续阻塞当前视图')
  assert.notEqual(document.body.style.overflow, 'hidden')
  await render('list')
  await ui.flush()
  assert.equal(document.querySelector('input[aria-label="弹窗草稿"]') === input, true)
  assert.equal(input.value, '保留这份草稿')
  assert.equal(host.hidden, false)
})

test('保留视图中的提交保护继续交给外层离开保护，释放后不残留', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ BusinessViewPanels }, { default: OverlayScopeProvider }, { useOverlayScope }] = await Promise.all([
    import('./BusinessVisualizationFrame.jsx'),
    import('../../../common/components/overlay/OverlayScopeProvider.jsx'),
    import('../../../common/components/overlay/OverlayScopeContext.mjs'),
  ])
  const rootRef = { current: ui.container }
  let guard
  let saving = true
  function View({ name }) {
    const scope = useOverlayScope()
    useEffect(() => name === 'list' ? scope.registerGuard('saving', () => !saving) : undefined, [scope, name])
    return h('span', null, name)
  }
  const render = (name, views = ['list', 'process']) => ui.render(
    h(OverlayScopeProvider, { enabled: false, visible: true, containerRef: rootRef, onGuardChange: (next) => { guard = next } }, h(BusinessViewPanels, { activeView: name, views }, h(View, { name }))))
  await render('list')
  assert.equal(await guard(), false)
  await render('process')
  assert.equal(await guard(), false, '后台提交仍阻止离开页面')
  saving = false
  assert.equal(await guard(), true)
  await render('other', [])
  assert.equal(guard, null)
})
