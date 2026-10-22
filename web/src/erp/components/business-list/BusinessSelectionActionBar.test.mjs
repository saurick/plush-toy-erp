import { act, createElement, Fragment, useState } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'
import { resolveBusinessActionAvailability } from '../../utils/businessActionAvailability.mjs'

const dom = installTestDOM()
function installActionSpace(t, initialWidth = 420) {
  let availableWidth = initialWidth
  const { prototype } = dom.runtimeWindow.HTMLElement
  const originalRect = prototype.getBoundingClientRect
  prototype.getBoundingClientRect = function getActionRect() {
    let width
    if (this.matches('.erp-business-selection-action-bar__actions--responsive')) width = availableWidth
    else if (this.matches('.erp-business-selection-action-bar__measure-item')) {
      const count = this.querySelectorAll('.ant-btn').length
      width = count * 80 + Math.max(0, count - 1) * 8
    } else if (this.matches('.erp-business-selection-action-bar__measure .ant-btn')) width = 96
    return width === undefined ? originalRect.call(this) : new dom.runtimeWindow.DOMRect(0, 0, width, 32)
  }
  t.after(() => { prototype.getBoundingClientRect = originalRect })
  return (width) => {
    availableWidth = width
    dom.runtimeWindow.dispatchEvent(new dom.runtimeWindow.Event('resize'))
  }
}
const NativeMessageChannel = globalThis.MessageChannel
const testChannels = []
globalThis.MessageChannel = class TestMessageChannel extends (
  NativeMessageChannel
) {
  constructor() {
    super()
    testChannels.push(this)
  }
}
registerJSXTestLoader()
after(() => {
  dom.restore()
  // rc-overflow 的浏览器调度通道在 Node 中需要显式释放句柄。
  for (const channel of testChannels) {
    channel.port1.close()
    channel.port2.close()
  }
  globalThis.MessageChannel = NativeMessageChannel
})

test('手机任务保留办理动作和来源摘要，完整单据详情仅在电脑提供', async (t) => {
  const [{ MemoryRouter, Routes, Route, Outlet }, { SelectionActionBar, BusinessActionTooltip, BusinessDataTable }, { Button }] = await Promise.all([
    import('react-router-dom'), import('./BusinessListLayout.jsx'), import('antd'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let mobile = true
  let posted = 0
  let details = 0
  const actionHost = document.createElement('div')
  document.body.appendChild(actionHost)
  function Frame() { return createElement(Outlet, { context: mobile ? { mobileTaskBusiness: { taskID: 31, actionHost } } : {} }) }
  function Page() {
    return createElement(Fragment, null, createElement(SelectionActionBar, { selectedCount: 1 }, createElement(BusinessActionTooltip, { disabled: false }, createElement(Button, { 'data-business-action-key': 'view-details', onClick: () => { details += 1 } }, '查看详情')), createElement(Button, { 'data-business-action-key': 'post', onClick: () => { posted += 1 } }, '确认入库')), createElement(BusinessDataTable, { rowKey: 'id', columns: [{ key: 'no', title: '单号', dataIndex: 'no' }], dataSource: [{ id: 91, no: 'PR-SIM-91' }], rowSelection: { type: 'radio', selectedRowKeys: [91] }, onOpenRecord: () => { details += 1 }, pagination: false }))
  }
  const render = () => act(async () => root.render(createElement(MemoryRouter, { future: { v7_startTransition: true, v7_relativeSplatPath: true } }, createElement(Routes, null, createElement(Route, { element: createElement(Frame) }, createElement(Route, { path: '*', element: createElement(Page) }))))))
  t.after(async () => { await act(async () => root.unmount()); container.remove(); actionHost.remove() })
  await render()
  assert.match(container.textContent, /PR-SIM-91/u)
  assert.doesNotMatch(container.textContent, /查看详情|查看完整单据/u)
  const post = [...actionHost.querySelectorAll('button')].find((button) => button.textContent === '确认入库')
  assert.equal(post.disabled, false)
  await act(async () => post.click())
  assert.equal(posted, 1)
  assert.equal(details, 0)
  mobile = false
  await render()
  const detail = [...container.querySelectorAll('button')].find((button) => button.textContent === '查看详情')
  assert.ok(detail)
  await act(async () => detail.click())
  assert.equal(details, 1)
})

test('未选和清空选择时收起记录操作，选中后按权限展示办理动作', async (t) => {
  const [
    { SelectionActionBar, SelectionClearAction, BusinessActionTooltip },
    { Button },
  ] = await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let selected = false
  let authorized = true
  let handled = 0
  const render = async () => {
    const state = resolveBusinessActionAvailability({ selected, authorized })
    await act(async () =>
      root.render(
        createElement(
          SelectionActionBar,
          { selectedCount: selected ? 1 : 0 },
          createElement(SelectionClearAction, {
            selectedCount: selected ? 1 : 0,
            onClear: () => {
              selected = false
            },
          }),
          createElement(
            BusinessActionTooltip,
            state,
            createElement(
              Button,
              {
                disabled: state.disabled,
                onClick: () => {
                  handled += 1
                },
              },
              '提交'
            )
          )
        )
      )
    )
  }
  const button = (label) =>
    [...container.querySelectorAll('button')].find(
      (node) => node.textContent.replace(/\s+/gu, '') === label
    )
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  await render()
  assert.equal(container.querySelector('.erp-business-selection-action-bar').hidden, true)
  assert.equal(button('提交')?.disabled, true)
  assert.equal(button('清空已选'), undefined)
  assert.equal(handled, 0)

  selected = true
  await render()
  assert.equal(button('提交')?.disabled, false)
  await act(async () => button('提交').click())
  assert.equal(handled, 1)
  await act(async () => button('清空已选').click())
  await render()
  assert.equal(button('提交')?.disabled, true)
  assert.equal(container.querySelector('.erp-business-selection-action-bar').hidden, true)
  assert.equal(button('清空已选'), undefined)

  authorized = false
  await render()
  assert.equal(button('提交'), undefined)
  assert.equal(container.querySelector('[aria-label="当前记录操作"]'), null)
  selected = true
  await render()
  assert.equal(button('提交'), undefined)
  assert.equal(handled, 1)
})

test('更多操作重新打开时使用最新选择状态', async (t) => {
  installActionSpace(t)
  const [{ SelectionActionBar, BusinessActionTooltip }, { Button }] =
    await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let selected = false
  let selectedID = 1
  let printedID = null
  const render = async () =>
    act(async () =>
      root.render(
        createElement(
          SelectionActionBar,
          { selectedCount: 1, selectedLabel: `订单 ${selectedID}` },
          [1, 2, 3, 4].map((index) =>
            createElement(Button, { key: index }, `主操作${index}`)
          ),
          createElement(
            BusinessActionTooltip,
            {
              disabled: !selected,
              disabledReason: '请先选择一条记录',
            },
            createElement(Button, { disabled: !selected, onClick: () => { printedID = selectedID } }, '加工合同打印')
          )
        )
      )
    )
  const more = () =>
    container.querySelector('.erp-business-selection-action-bar__compact-more')
  const menu = () =>
    document.querySelector('.erp-business-selection-action-menu')
  const printButton = () =>
    [...menu().querySelectorAll('button')].find(
      (node) => node.textContent.replace(/\s+/gu, '') === '加工合同打印'
    )
  const click = async (node) => {
    assert(node, '必须找到真实控件')
    await act(async () => node.click())
  }
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  await render()
  await click(more())
  assert.equal(printButton().disabled, true)
  await click(more())

  selected = true
  selectedID = 2
  await render()
  await click(more())
  assert.equal(printButton().disabled, false)
  await click(printButton())
  assert.equal(printedID, 2)
  selectedID = 3
  await render()
  await click(more())
  await click(printButton())
  assert.equal(printedID, 3)
})

test('空间变大展开少量动作，变窄收纳，确认中不迁移触发按钮且权限变化不残留', async (t) => {
  const resize = installActionSpace(t, 240)
  const [{ SelectionActionBar }, { Button, Popconfirm, ConfigProvider }] = await Promise.all([
    import('./BusinessListLayout.jsx'), import('antd'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  let related = true
  let writable = true
  let handled = 0
  const render = () => act(async () => root.render(createElement(ConfigProvider, { theme: { token: { motion: false } } }, createElement(SelectionActionBar, { selectedCount: 1 }, createElement(Button, { 'data-business-action-role': 'view' }, '查看明细'), related ? createElement(Button, { 'data-business-action-role': 'related' }, '相关单据') : null, writable ? createElement(Popconfirm, { title: '确认撤销测试出货？', okText: '确认撤销', cancelText: '保留出货', onConfirm: () => { handled += 1 } }, createElement(Button, { danger: true, 'data-business-action-role': 'danger' }, '撤销出货')) : null
    ))))
  const more = () => container.querySelector('.erp-business-selection-action-bar__compact-more')
  const button = (label) => [...document.querySelectorAll('button')].find((node) => node.textContent.replace(/\s+/gu, '') === label)
  const click = (node) => act(async () => { assert(node); node.click() })
  const settle = () => act(async () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await render()
  assert(more())
  await click(more())
  await click(button('撤销出货'))
  assert.equal(handled, 0)
  await act(async () => resize(600))
  await settle()
  assert(more(), '确认期间保持原操作位置')
  assert(button('保留出货'))
  await click(button('保留出货'))
  await settle()
  assert.equal(more(), null)
  assert.equal(handled, 0)
  assert.equal(container.querySelectorAll('.erp-business-selection-action-bar__compact-visible button').length, 3)
  await click(button('撤销出货'))
  await click(button('确认撤销'))
  assert.equal(handled, 1)
  related = false
  writable = false
  await render()
  assert.equal(more(), null)
  assert.equal(button('相关单据'), undefined)
  assert.equal(button('撤销出货'), undefined)
  await act(async () => resize(200))
  await settle()
  assert.equal(more(), null, '少量动作在窄容器仍能放下时不强制收纳')
})

test('放得下时完整展示动作，按钮颜色和临时忙碌不改变分组', async (t) => {
  installActionSpace(t, 600)
  const [{ SelectionActionBar }, { Button, Space }] = await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  let busy = false
  const render = () => act(async () => root.render(createElement(SelectionActionBar, { selectedCount: 1 }, createElement(Button, { 'data-business-action-role': 'secondary', type: 'primary' }, '打印'), createElement(Button, { 'data-business-action-role': 'recovery' }, '重新读取'), createElement(Button, { 'data-business-action-role': 'view' }, '查看'), createElement(Button, { 'data-business-action-role': 'edit', disabled: busy }, '编辑'), createElement(Space, { 'data-business-action-role': 'primary' }, createElement(Button, { disabled: busy }, '判定合格'), createElement(Button, { disabled: busy, danger: true }, '判定不合格'))
  )))
  const direct = () => [...container.querySelectorAll('.erp-business-selection-action-bar__record-actions button')].map((button) => button.textContent.replace(/\s+/gu, ''))
  await render()
  assert.deepEqual(direct(), ['打印', '重新读取', '查看', '编辑', '判定合格', '判定不合格'])
  busy = true
  await render()
  assert.deepEqual(direct(), ['打印', '重新读取', '查看', '编辑', '判定合格', '判定不合格'])
  assert.equal([...container.querySelectorAll('button')].find((button) => button.textContent.replace(/\s+/gu, '') === '编辑').disabled, true)
})

test('内部受权限控制的组件没有入口时，不生成空的更多操作', async (t) => {
  const [{ SelectionActionBar }, { Button }] = await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  function Related({ authorized }) { return authorized ? createElement(Button, null, '相关任务') : null }
  Related.selectionActionRole = 'related'
  Related.selectionActionVisible = ({ authorized }) => authorized
  const render = (authorized) => act(async () => root.render(createElement(SelectionActionBar, { selectedCount: 1 }, createElement(Button, { 'data-business-action-role': 'view' }, '查看详情'), createElement(Related, { authorized })
  )))
  await render(false)
  assert.equal(container.querySelector('.erp-business-selection-action-bar__compact-more'), null)
  await render(true)
  assert.equal(container.querySelector('.erp-business-selection-action-bar__compact-more'), null)
  assert([...container.querySelectorAll('button')].some((node) => node.textContent === '相关任务'))
})

test('选中记录时新建降低强调，清空后恢复且保留原入口', async (t) => {
  const [{ BusinessOperationPanel, SelectionActionBar, ToolbarButton, BusinessActionTooltip }, { Button }] = await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  let selected = false
  let created = 0
  const render = () => act(async () => root.render(createElement(BusinessOperationPanel, {
    primaryAction: createElement(BusinessActionTooltip, null, createElement(ToolbarButton, { type: 'primary', onClick: () => { created += 1 } }, '新建订单')),
  }, createElement(SelectionActionBar, { selectedCount: Number(selected) }, createElement(Button, { type: 'primary', 'data-business-action-role': 'primary' }, '提交订单')))))
  await render()
  const create = () => [...container.querySelectorAll('button')].find((button) => button.textContent === '新建订单')
  assert(create().classList.contains('ant-btn-primary'))
  assert.equal(container.querySelector('.erp-business-selection-action-bar').hidden, true)
  assert.equal(container.querySelector('[data-business-selection-placeholder]').childElementCount, 0)
  selected = true
  await render()
  assert.equal(create().classList.contains('ant-btn-primary'), false)
  await act(async () => create().click())
  assert.equal(created, 1)
  selected = false
  await render()
  assert(create().classList.contains('ant-btn-primary'))
})

test('收起记录操作区保留内部尚未确认的办理状态，并允许非记录内容独立显示', async (t) => {
  const [{ BusinessOperationPanel, SelectionActionBar }, { Button }] = await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  let selected = true
  function PendingAction() {
    const [pending, setPending] = useState(false)
    return createElement(Button, { onClick: () => setPending(true) }, pending ? '确认办理结果' : '办理')
  }
  const render = () => act(async () => root.render(createElement(BusinessOperationPanel, null, createElement('span', null, '来源资料尚未加载完成'), createElement(SelectionActionBar, { selectedCount: Number(selected) }, createElement(PendingAction))
  )))
  await render()
  await act(async () => container.querySelector('.erp-business-selection-action-bar button').click())
  selected = false
  await render()
  assert.equal(container.querySelector('.erp-business-selection-action-bar').hidden, true)
  assert.equal(container.querySelector('.erp-business-operation-panel__selection').hidden, false)
  selected = true
  await render()
  assert.match(container.querySelector('.erp-business-selection-action-bar').textContent, /确认办理结果/u)
})

test('表格工具保留导出和列设置各自回调，禁用导出不能执行', async (t) => {
  const [{ BusinessListToolbarActions }, { ConfigProvider }] = await Promise.all([import('./BusinessListToolbarActions.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  let exported = 0
  let configured = 0
  let disabled = false
  const render = () => act(async () => root.render(createElement(ConfigProvider, { theme: { token: { motion: false } } }, createElement(BusinessListToolbarActions, {
    onExport: () => { exported += 1 }, onOpenColumnOrder: () => { configured += 1 }, exportDisabled: disabled,
  }))))
  const open = () => act(async () => container.querySelector('button').click())
  const item = (label) => [...document.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === label)
  await render()
  assert.equal(container.querySelector('button').getAttribute('aria-label'), '表格工具')
  await open()
  await act(async () => item('导出筛选结果').click())
  assert.equal(exported, 1)
  assert.equal(configured, 0)
  await open()
  await act(async () => item('列设置').click())
  assert.equal(configured, 1)
  assert.equal(document.activeElement, container.querySelector('button'))
  disabled = true
  await render()
  await open()
  assert.equal(item('导出筛选结果').getAttribute('aria-disabled'), 'true')
  await act(async () => item('导出筛选结果').click())
  assert.equal(exported, 1)
})

test('长状态组保留快捷按钮、数量和单击筛选，加载与指定记录时不可切换', async (t) => {
  const { default: BusinessStatusFilter } = await import('./BusinessStatusFilter.jsx')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => { await act(async () => root.unmount()); container.remove() })
  let value = 'SUBMITTED'
  let inline = true
  let loading = false
  let exact = false
  const render = () => act(async () => root.render(createElement(BusinessStatusFilter, {
    inline,
    value,
    loading,
    exact,
    'aria-label': '质检状态',
    counts: { DRAFT: 2, SUBMITTED: 3 },
    options: [{ value: 'DRAFT', label: '草稿' }, { value: 'SUBMITTED', label: '已提交' }, { value: 'PASSED', label: '合格' }, { value: 'REJECTED', label: '不合格' }, { value: 'CANCELLED', label: '已取消' }],
    onChange: (next) => { value = next },
  })))
  const button = (label) => [...container.querySelectorAll('button')].find(
    (node) => node.getAttribute('aria-label').startsWith(`${label}，`)
  )
  await render()
  assert.equal(container.querySelectorAll('button').length, 6)
  assert.equal(container.querySelectorAll('[role="combobox"]').length, 0)
  assert.equal(button('不限状态').getAttribute('aria-label'), '不限状态，共 5 条')
  assert.equal(button('已提交').getAttribute('aria-pressed'), 'true')
  assert.equal(button('不合格').getAttribute('aria-label'), '不合格，共 0 条')
  await act(async () => button('草稿').click())
  assert.equal(value, 'DRAFT')
  await render()
  assert.equal(button('草稿').getAttribute('aria-pressed'), 'true')
  loading = true
  await render()
  assert.equal(button('草稿').getAttribute('aria-label'), '草稿，数量暂不可用')
  assert([...container.querySelectorAll('button')].every((node) => node.disabled))
  loading = false
  exact = true
  await render()
  assert([...container.querySelectorAll('button')].every((node) => node.disabled))
  exact = false
  inline = false
  await render()
  assert.equal(container.querySelectorAll('button').length, 6)
  await act(async () => button('不限状态').click())
  assert.equal(value, '')
})

test('更多操作中的单据菜单按 Escape 后同时关闭，焦点恢复且可再次执行', async (t) => {
  installActionSpace(t)
  const [{ SelectionActionBar }, { Button, ConfigProvider, Dropdown }] =
    await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let handled = 0
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  await act(async () =>
    root.render(
      createElement(
        ConfigProvider,
        // happy-dom does not finish CSS exit animations; the browser covers them.
        { theme: { token: { motion: false } } },
        createElement(
          SelectionActionBar,
          { selectedCount: 1 },
          [1, 2, 3, 4].map((index) =>
            createElement(
              Button,
              { key: index, type: 'primary' },
              `主操作${index}`
            )
          ),
          createElement(
            Dropdown,
            {
              trigger: ['click'],
              destroyOnHidden: true,
              menu: {
                items: [{ key: 'purchase-order', label: '采购订单' }],
                onClick: () => {
                  handled += 1
                },
              },
            },
            createElement(Button, null, '相关单据')
          )
        )
      )
    )
  )
  const more = container.querySelector(
    '.erp-business-selection-action-bar__compact-more'
  )
  const related = () =>
    [
      ...document.querySelectorAll(
        '.erp-business-selection-action-menu button'
      ),
    ].find((button) => button.textContent === '相关单据')
  const menuItem = () => document.querySelector('[role="menuitem"]')
  const click = async (button) =>
    act(async () => {
      assert(button, '必须找到真实控件')
      button.focus()
      button.click()
    })
  const waitFor = async (condition, message) => {
    const deadline = Date.now() + 1_000
    while (!condition()) {
      assert(Date.now() < deadline, message)
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    }
  }

  for (const focusMenuItem of [false, true]) {
    await click(more)
    await click(related())
    assert.equal(menuItem()?.textContent, '采购订单')
    await act(async () => {
      const target = focusMenuItem ? menuItem() : related()
      target.focus()
      const escape = new dom.runtimeWindow.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
      // rc-dropdown reads the legacy keyCode that happy-dom does not initialize.
      Object.defineProperty(escape, 'keyCode', { value: 27 })
      target.dispatchEvent(escape)
    })
    await waitFor(
      () => more.getAttribute('aria-expanded') === 'false',
      'Escape 应关闭外层操作栏'
    )
    await waitFor(() => !menuItem(), 'Escape 应关闭内层单据菜单')
    await waitFor(
      () => document.activeElement === more,
      'Escape 后应聚焦更多操作入口'
    )
    assert.equal(handled, 0)
  }

  await click(more)
  await click(related())
  await click(menuItem())
  await waitFor(
    () => more.getAttribute('aria-expanded') === 'false' && !menuItem(),
    '单据动作执行后应关闭菜单'
  )
  assert.equal(handled, 1)
})

test('更多下拉保留禁用原因、二级确认及弹窗状态，执行后收起且键盘可恢复', async (t) => {
  installActionSpace(t)
  const [
    {
      SelectionActionBar,
      BusinessActionTooltip,
      BusinessLifecycleSecondaryAction,
    },
    { Button, Modal, Popconfirm },
  ] = await Promise.all([import('./BusinessListLayout.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let handled = 0
  function DetailsAction() {
    const [open, setOpen] = useState(false)
    return createElement(
      Fragment,
      null,
      createElement(Button, { onClick: () => setOpen(true) }, '查看详情'),
      createElement(
        Modal,
        {
          open,
          title: '测试单据详情',
          footer: null,
          onCancel: () => setOpen(false),
        },
        '单据内容'
      )
    )
  }
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  await act(async () =>
    root.render(
      createElement(
        SelectionActionBar,
        { selectedCount: 1 },
        [1, 2, 3, 4].map((index) =>
          createElement(
            Button,
            { key: index, type: 'primary' },
            `主操作${index}`
          )
        ),
        createElement(DetailsAction),
        createElement(
          BusinessActionTooltip,
          { disabled: true, disabledReason: '资料尚未补齐' },
          createElement(
            Button,
            {
              disabled: true,
              onClick: () => {
                handled += 1
              },
            },
            '受限操作'
          )
        ),
        createElement(
          Popconfirm,
          {
            title: '确认执行测试操作？',
            okText: '确认执行',
            cancelText: '暂不执行',
            onConfirm: () => {
              handled += 1
            },
          },
          createElement(Button, { danger: true }, '危险操作')
        ),
        createElement(BusinessLifecycleSecondaryAction, {
          action: { key: 'normal_close', label: '关闭测试单据' },
          onAction: () => {
            handled += 1
          },
        }),
        createElement(BusinessLifecycleSecondaryAction, {
          action: { key: 'cancel', label: '取消测试单据', danger: true },
          disabled: true,
          disabledReason: '本单暂时不能取消',
          onAction: () => {
            handled += 1
          },
        })
      )
    )
  )
  const more = () =>
    container.querySelector('.erp-business-selection-action-bar__compact-more')
  const menu = () =>
    document.querySelector('.erp-business-selection-action-menu')
  const button = (label, scope = document) =>
    [...scope.querySelectorAll('button')].find(
      (node) => node.textContent.replace(/\s+/gu, '') === label
    )
  const click = async (node) => {
    assert(node, '必须找到真实控件')
    await act(async () => node.click())
  }
  const key = async (node, name, keyCode) =>
    act(async () => {
      const event = new dom.runtimeWindow.KeyboardEvent('keydown', {
        key: name,
        bubbles: true,
      })
      // happy-dom does not initialize the legacy keyCode used by rc-dropdown.
      Object.defineProperty(event, 'keyCode', { value: keyCode })
      node.dispatchEvent(event)
    })
  const focusAndKey = async (node, name, keyCode) =>
    act(async () => {
      node.focus()
      const event = new dom.runtimeWindow.KeyboardEvent('keydown', {
        key: name,
        bubbles: true,
      })
      Object.defineProperty(event, 'keyCode', { value: keyCode })
      node.dispatchEvent(event)
    })
  const waitFor = async (condition, message) => {
    const deadline = Date.now() + 1_000
    while (!condition()) {
      assert(Date.now() < deadline, message)
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)))
    }
  }

  assert.equal(more().getAttribute('aria-expanded'), 'false')
  await click(more())
  assert.equal(more().getAttribute('aria-expanded'), 'true')
  assert.equal(document.querySelector('.ant-drawer-mask'), null)
  assert(menu().querySelector('[aria-label="资料尚未补齐"]'))
  await click(button('受限操作', menu()))
  assert.equal(handled, 0)
  assert.equal(more().getAttribute('aria-expanded'), 'true')

  await focusAndKey(button('查看详情', menu()), 'ArrowDown', 40)
  await waitFor(
    () => document.activeElement.getAttribute('aria-label') === '资料尚未补齐',
    '向下移动后应聚焦下一项禁用原因'
  )
  await key(document.activeElement, 'Escape', 27)
  await waitFor(
    () =>
      more().getAttribute('aria-expanded') === 'false' &&
      document.activeElement === more(),
    '关闭更多操作后焦点应回到触发按钮'
  )

  await click(more())
  await click(button('危险操作', menu()))
  assert.equal(more().getAttribute('aria-expanded'), 'true')
  assert.equal(handled, 0)
  await click(button('确认执行'))
  assert.equal(handled, 1)
  assert.equal(more().getAttribute('aria-expanded'), 'false')

  await click(more())
  assert.equal(button('其他状态操作', menu()), undefined)
  assert.equal(menu().querySelector('[role="menu"]'), null)
  assert(menu().querySelector('[aria-label="本单暂时不能取消"]'))
  await click(button('取消测试单据', menu()))
  assert.equal(more().getAttribute('aria-expanded'), 'true')
  assert.equal(handled, 1)
  await click(button('关闭测试单据', menu()))
  assert.equal(handled, 2)
  assert.equal(more().getAttribute('aria-expanded'), 'false')

  await click(more())
  await click(button('查看详情', menu()))
  assert.equal(more().getAttribute('aria-expanded'), 'false')
  assert.match(
    document.querySelector('[role="dialog"]').textContent,
    /测试单据详情.*单据内容/u
  )
})
