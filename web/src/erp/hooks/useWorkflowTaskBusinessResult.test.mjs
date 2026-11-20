import { createElement as h } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'

test('流程提交只展示对应单据的回读结果，读取失败与迟到的旧结果不会伪造业务状态', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ MemoryRouter }, { BusinessPageContext }, { default: useResult }] = await Promise.all([
    import('react-router-dom'), import('./useBusinessPageContext.js'), import('./useWorkflowTaskBusinessResult.js'),
  ])
  const receipts = []
  const onResult = (message, record) => receipts.push({ message, record })
  let report
  function Reporter() {
    report = useResult()
    return null
  }
  const mount = (scope) => ui.render(h(MemoryRouter, null, h(BusinessPageContext.Provider, {
    value: { taskFormScope: scope, taskBusiness: { onResult } },
  }, h(Reporter))))
  await mount('first')
  const identity = { id: 7, order_no: 'SIM-7' }
  const submitted = { ...identity, lifecycle_status: 'submitted', version: 2 }
  await report('已提交', identity, async ({ id }) => { assert.equal(id, 7); return submitted })
  assert.deepEqual(receipts.pop(), { message: '已提交', record: submitted })
  for (const read of [async () => ({ ...submitted, id: 8 }), async () => { throw new Error('读取失败') }]) {
    await report('已提交', identity, read)
    assert.deepEqual(receipts.pop(), { message: '已提交，单据状态暂未核对', record: identity })
  }
  const delayed = Promise.withResolvers()
  const pending = report('已提交', identity, () => delayed.promise)
  await mount('second')
  delayed.resolve(submitted)
  await pending
  assert.deepEqual(receipts, [])
})
