import assert from 'node:assert/strict'
import test from 'node:test'
import { preparePrintWorkspaceSnapshot } from './printWorkspaceOutput.mjs'

test('preparePrintWorkspaceSnapshot: 先提交当前编辑，再等待两帧 React 视图稳定', async () => {
  const events = []
  const frameCallbacks = []
  const preparing = preparePrintWorkspaceSnapshot({
    windowLike: {
      requestAnimationFrame(callback) {
        frameCallbacks.push(callback)
      },
    },
    async beforeSnapshot() {
      events.push('flush')
      await Promise.resolve()
      events.push('committed')
    },
  }).then(() => events.push('ready'))

  await Promise.resolve()
  await Promise.resolve()
  assert.deepEqual(events, ['flush', 'committed'])
  assert.equal(frameCallbacks.length, 1)

  frameCallbacks.shift()()
  await Promise.resolve()
  assert.equal(frameCallbacks.length, 1)
  assert.deepEqual(events, ['flush', 'committed'])

  frameCallbacks.shift()()
  await preparing
  assert.deepEqual(events, ['flush', 'committed', 'ready'])
})
