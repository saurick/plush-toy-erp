import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isDynamicImportLoadError,
  loadWithDynamicImportRetry,
} from './lazyImportRetry.mjs'

test('lazyImportRetry: 识别浏览器动态模块加载失败', () => {
  assert.equal(
    isDynamicImportLoadError(
      new TypeError('Failed to fetch dynamically imported module')
    ),
    true
  )
  assert.equal(
    isDynamicImportLoadError(
      'error loading dynamically imported module: /assets/page.js'
    ),
    true
  )
})

test('lazyImportRetry: 动态 import 失败会按配置重试', async () => {
  let calls = 0
  const result = await loadWithDynamicImportRetry(
    async () => {
      calls += 1
      if (calls === 1) {
        throw new TypeError('Failed to fetch dynamically imported module')
      }
      return { default: 'ok' }
    },
    { retryDelaysMs: [0] }
  )

  assert.deepEqual(result, { default: 'ok' })
  assert.equal(calls, 2)
})

test('lazyImportRetry: 普通运行时错误不重试', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      loadWithDynamicImportRetry(
        async () => {
          calls += 1
          throw new Error('业务页面渲染错误')
        },
        { retryDelaysMs: [0, 0] }
      ),
    /业务页面渲染错误/u
  )

  assert.equal(calls, 1)
})
