import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, useState } from 'react'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../scripts/test/reactRuntime.mjs'

test('one load failure surface retries every failed read and follows remaining failures', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { PageLoadFeedbackBoundary, usePageLoadFeedback }] =
    await Promise.all([
      import('react-dom/client'),
      import('./PageLoadFeedback.jsx'),
    ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const calls = []
  let finishProfile
  let keepListFailure = true
  function Reader({ name, priority, enabled = true }) {
    const [error, setError] = useState(true)
    const feedback = usePageLoadFeedback({
      error,
      priority,
      enabled,
      retry: async () => {
        calls.push(name)
        if (name === 'profile') {
          await new Promise((resolve) => {
            finishProfile = resolve
          })
        }
        if (name === 'list' && keepListFailure) return false
        setError(false)
        return true
      },
    })
    return feedback.visible
      ? createElement(
          'button',
          { onClick: feedback.retry, 'aria-busy': feedback.retrying },
          name
        )
      : null
  }
  const render = (enabled = true) =>
    act(async () =>
      root.render(
        createElement(
          PageLoadFeedbackBoundary,
          null,
          createElement(Reader, { name: 'profile', priority: 30 }),
          createElement(Reader, { name: 'list', priority: 20, enabled }),
          createElement(Reader, { name: 'counts', priority: 10 })
        )
      )
    )
  await render()
  assert.equal(container.querySelectorAll('button').length, 1)
  assert.equal(container.textContent, 'profile')
  await act(async () => {
    container.querySelector('button').click()
    container.querySelector('button').click()
  })
  assert.deepEqual(
    calls.sort(),
    ['counts', 'list', 'profile'],
    '同一次重试只执行各读取一次'
  )
  assert.equal(
    container.querySelector('button').getAttribute('aria-busy'),
    'true'
  )
  await act(async () => finishProfile())
  assert.equal(
    container.textContent,
    'list',
    '部分恢复后保留尚未成功的列表错误'
  )
  await render(false)
  assert.equal(container.textContent, '', '隐藏页签的错误不占用当前页面提示')
  await render()
  assert.equal(container.textContent, 'list')
  keepListFailure = false
  await act(async () => container.querySelector('button').click())
  assert.equal(container.textContent, '')
  assert.equal(calls.filter((name) => name === 'list').length, 2)
})

test('an independently used panel retains its own feedback and retry', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { usePageLoadFeedback }] = await Promise.all([
    import('react-dom/client'),
    import('./PageLoadFeedback.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  let retries = 0
  function Panel() {
    const feedback = usePageLoadFeedback({
      error: '读取失败',
      retry: () => {
        retries += 1
      },
    })
    return feedback.visible
      ? createElement('button', { onClick: feedback.retry }, '重试')
      : null
  }
  await act(async () => root.render(createElement(Panel)))
  await act(async () => container.querySelector('button').click())
  assert.equal(retries, 1)
})

test('parallel page reads share a message key while business actions remain independent', async () => {
  registerJSXTestLoader()
  const [{ showPageLoadError }, { message, registerAntdAppApis }] =
    await Promise.all([
      import('./PageLoadFeedback.jsx'),
      import('../../common/utils/antdApp.js'),
    ])
  const notices = []
  registerAntdAppApis({ message: { error: (notice) => notices.push(notice) } })
  try {
    showPageLoadError({ isNetworkError: true }, '加载订单')
    showPageLoadError({ isNetworkError: true }, '加载基础资料')
    message.error('保存失败，请重试')
    assert.equal(notices[0].key, notices[1].key)
    assert.equal(notices[0].content.props.children, '网络错误，请稍后重试')
    assert.equal(notices[2].key, undefined)
    assert.equal(notices[2].content.props.children, '保存失败，请重试')
  } finally {
    registerAntdAppApis()
  }
})
