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

test('岗位操作在默认和清空选择后仍可发现，未选择或无权限时不能办理', async (t) => {
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
  assert.match(container.textContent, /请选择一条记录/u)
  assert.equal(button('提交')?.disabled, true)
  assert.equal(button('清空已选'), undefined)
  assert(container.querySelector('[aria-label="请先选择一条记录"]'))
  await act(async () => button('提交').click())
  assert.equal(handled, 0)

  selected = true
  await render()
  assert.equal(button('提交')?.disabled, false)
  await act(async () => button('提交').click())
  assert.equal(handled, 1)
  await act(async () => button('清空已选').click())
  await render()
  assert.equal(button('提交')?.disabled, true)
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

test('更多下拉保留禁用原因、二级确认及弹窗状态，执行后收起且键盘可恢复', async (t) => {
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
