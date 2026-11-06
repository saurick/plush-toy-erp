import { act, createElement as h } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { MessageChannel as NativeMessageChannel } from 'node:worker_threads'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'
import { findTableScrollToolbar } from '../../../common/components/table/tableScrollToolbar.mjs'

const dom = installTestDOM()
function SearchField({ primarySearch: _primarySearch, ...props }) { return h('input', props) }
const channels = []
globalThis.MessageChannel = class TestMessageChannel extends NativeMessageChannel {
  constructor() { super(); channels.push(this) }
}
registerJSXTestLoader()
after(() => {
  dom.restore()
  for (const channel of channels) { channel.port1.close(); channel.port2.close() }
  globalThis.MessageChannel = NativeMessageChannel
})

async function mount(t, element) {
  const { MemoryRouter } = await import('react-router-dom')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = async (content) => act(async () => root.render(h(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, content)))
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  await render(element)
  return { container, render }
}

test('切换整块业务内容时，分类节点与工具栏保留，旧查询和动作完整卸载', async (t) => {
  const { BusinessPageLayout, BusinessToolbarWorkspace, BusinessOperationPanel } = await import('./BusinessListLayout.jsx')
  function Content({ name }) {
    return h(BusinessPageLayout, { inWorkspace: true }, h(BusinessOperationPanel, {
        inWorkspace: true,
        filters: h(SearchField, { primarySearch: true, 'aria-label': `${name}查询` }),
        actions: h('button', { type: 'button' }, `${name}工具`),
        primaryAction: h('button', { type: 'button' }, `${name}新建`),
      }), h('div', { 'data-testid': `${name}表格` }))
  }
  const page = (name) => h(BusinessPageLayout, null, h(BusinessToolbarWorkspace, { contentSwitch: h('button', { type: 'button', 'data-testid': '分类' }, '业务分类') }, h(Content, { name, key: name })))
  const { container, render } = await mount(t, page('采购'))
  const navigation = container.querySelector('[data-testid="分类"]')
  const command = container.querySelector('.erp-business-operation-panel__command')
  const toolbarHost = container.querySelector('[data-table-scroll-toolbar]')
  const firstTable = container.querySelector('[data-testid="采购表格"]')
  assert.equal(findTableScrollToolbar(firstTable) === toolbarHost, true, '表格横向入口由所属共享工具栏承接')
  assert.equal(command.querySelectorAll('input').length, 1)
  await render(page('成品'))
  assert.equal(container.querySelector('[data-testid="分类"]') === navigation, true)
  assert.equal(container.querySelector('.erp-business-operation-panel__command') === command, true)
  assert.equal(container.querySelectorAll('.erp-business-operation-panel').length, 1)
  assert.equal(command.querySelectorAll('input').length, 1)
  assert.equal(command.querySelector('input').getAttribute('aria-label'), '成品查询')
  assert.doesNotMatch(container.textContent, /采购工具|采购新建/u)
  assert.match(container.textContent, /成品工具|成品新建/u)
})

test('左右工作区和未声明接入的局部操作栏各自隔离', async (t) => {
  const { BusinessPageLayout, BusinessToolbarWorkspace, BusinessOperationPanel } = await import('./BusinessListLayout.jsx')
  const workspace = (name) => h(BusinessToolbarWorkspace, { contentSwitch: h('span', null, `${name}分类`) }, h(BusinessOperationPanel, { inWorkspace: true, filters: h(SearchField, { primarySearch: true, 'aria-label': `${name}查询` }) }), h('section', { 'data-local': name }, h(BusinessPageLayout, null, h(BusinessOperationPanel, { filters: h(SearchField, { primarySearch: true, 'aria-label': `${name}局部查询` }) }), h('div', { 'data-local-table': name }))))
  const { container } = await mount(t, h('div', null, workspace('左'), workspace('右')))
  const workspaces = container.querySelectorAll('.erp-business-toolbar-workspace')
  assert.equal(workspaces.length, 2)
  assert.equal(workspaces[0].querySelector('.erp-business-operation-panel__command').querySelector('input').getAttribute('aria-label'), '左查询')
  assert.equal(workspaces[1].querySelector('.erp-business-operation-panel__command').querySelector('input').getAttribute('aria-label'), '右查询')
  assert.equal(container.querySelector('[data-local="左"] input').getAttribute('aria-label'), '左局部查询')
  assert.equal(container.querySelector('[data-local="右"] input').getAttribute('aria-label'), '右局部查询')
  for (const name of ['左', '右']) {
    const local = container.querySelector(`[data-local="${name}"]`)
    assert.equal(findTableScrollToolbar(local.querySelector('[data-local-table]')) === local.querySelector('[data-table-scroll-toolbar]'), true, '局部子表不能借用主工作区或另一栏的滚动入口')
  }
})

test('任务办理不因共享工具栏出现电脑分类或列表查询入口', async (t) => {
  const { BusinessToolbarWorkspace, BusinessOperationPanel } = await import('./BusinessListLayout.jsx')
  const { BusinessPageContext } = await import('../../hooks/useBusinessPageContext.js')
  const { container } = await mount(t, h(BusinessPageContext.Provider, { value: { taskBusiness: { readOnly: true } } }, h(BusinessToolbarWorkspace, { contentSwitch: h('button', null, '电脑分类') }, h(BusinessOperationPanel, { inWorkspace: true, filters: h(SearchField, { primarySearch: true, 'aria-label': '电脑查询' }) }))))
  assert.equal(container.querySelector('.erp-business-toolbar-workspace') === null, true)
  assert.equal(container.querySelector('input') === null, true)
  assert.doesNotMatch(container.textContent, /电脑分类/u)
})
