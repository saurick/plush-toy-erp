import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  registerJSXTestLoader,
  installTestDOM,
} from '../../../../scripts/test/reactRuntime.mjs'

registerJSXTestLoader()
const dom = installTestDOM()
const { default: BusinessModal } =
  await import('../../../erp/components/business-list/BusinessModal.jsx')
const { default: AlertDialog } = await import('./AlertDialog.jsx')
after(() => dom.restore())

async function mount(Component, props) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => root.render(createElement(Component, props)))
  return async () => {
    await act(async () => root.unmount())
    container.remove()
  }
}
const button = (text) =>
  [...document.querySelectorAll('button')].find(
    (node) => node.textContent.replace(/\s+/gu, '') === text
  )

test('business confirmation locks immediately, waits for the result, then allows cancellation', async () => {
  let finish
  let saves = 0
  let closes = 0
  const unmount = await mount(BusinessModal, {
    open: true,
    title: '测试局部保存',
    okText: '保存说明',
    cancelText: '取消',
    onOk: () => {
      saves += 1
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    onCancel: () => {
      closes += 1
    },
  })
  try {
    await act(async () => {
      button('保存说明').click()
      button('保存说明').click()
    })
    assert.equal(saves, 1)
    assert.equal(button('取消').disabled, true)
    assert.equal(document.querySelector('.ant-modal-close'), null)
    await act(async () => button('取消').click())
    assert.equal(closes, 0)
    await act(async () => finish())
    assert.equal(button('取消').disabled, false)
    await act(async () => button('取消').click())
    assert.equal(closes, 1)
  } finally {
    await unmount()
  }
})

test('field validation keeps the modal available and locates the first error without another alert', async () => {
  const fields = []
  const unmount = await mount(BusinessModal, {
    open: true,
    title: '测试校验',
    okText: '保存说明',
    cancelText: '取消',
    form: { scrollToField: (...args) => fields.push(args) },
    onOk: async () => {
      throw Object.assign(new Error('表单校验未通过'), {
        errorFields: [
          { name: ['items', 2, 'quantity'], errors: ['请填写数量'] },
        ],
      })
    },
  })
  try {
    await act(async () => button('保存说明').click())
    assert.deepEqual(fields, [
      [['items', 2, 'quantity'], { focus: true, block: 'nearest' }],
    ])
    assert.equal(button('取消').disabled, false)
    assert.equal(document.querySelectorAll('[role="alert"]').length, 0)
  } finally {
    await unmount()
  }
})

test('AlertDialog waits for async confirmation, retains failure and supports retry', async () => {
  let reject
  let attempts = 0
  let closes = 0
  const unmount = await mount(AlertDialog, {
    open: true,
    title: '测试提示',
    confirmText: '处理提示',
    onConfirm: () => {
      attempts += 1
      return attempts === 1
        ? new Promise((_resolve, fail) => {
            reject = fail
          })
        : Promise.resolve()
    },
    onClose: () => {
      closes += 1
    },
  })
  try {
    await act(async () => {
      button('处理提示').click()
      button('处理提示')?.click()
    })
    assert.equal(attempts, 1)
    assert.equal(closes, 0)
    assert.equal(button('正在处理…').disabled, true)
    await act(async () => reject(new Error('请重新核对样例状态')))
    assert.equal(
      document.querySelector('[role="alert"]').textContent,
      '请重新核对样例状态'
    )
    assert.equal(closes, 0)
    await act(async () => button('处理提示').click())
    assert.equal(attempts, 2)
    assert.equal(closes, 1)
  } finally {
    await unmount()
  }
})

test('AlertDialog does not report a cancelled request as failure or success', async () => {
  let closes = 0
  const unmount = await mount(AlertDialog, {
    open: true,
    title: '测试取消',
    confirmText: '读取提示',
    onConfirm: async () => {
      throw new DOMException('Aborted', 'AbortError')
    },
    onClose: () => {
      closes += 1
    },
  })
  try {
    await act(async () => button('读取提示').click())
    assert.equal(closes, 0)
    assert.equal(document.querySelectorAll('[role="alert"]').length, 0)
    assert.equal(button('读取提示').disabled, false)
  } finally {
    await unmount()
  }
})
