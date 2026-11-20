import { act, createElement as h } from 'react'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'

test('生产回执使用已验证的写入结果，丢失响应后仅接受匹配本次操作的回读', async (t) => {
  const ui = await createReactTestHarness(t)
  const [{ MemoryRouter }, { BusinessPageContext }, { useOperationalFactMutations }] = await Promise.all([
    import('react-router-dom'), import('../../hooks/useBusinessPageContext.js'), import('./useOperationalFactMutations.mjs'),
  ])
  const draft = { id: 8, status: 'DRAFT', version: 1, quantity: '12' }
  const posted = { ...draft, status: 'POSTED', version: 2, posted_at: 1791648100, posted_by: 1 }
  const receipts = []
  let rows = null
  let actions
  function Screen() {
    actions = useOperationalFactMutations({ currentActiveKey: 'production', loadRows: async () => rows })
    return null
  }
  await ui.render(h(MemoryRouter, null, h(BusinessPageContext.Provider, { value: { taskBusiness: { onResult: (_message, record) => receipts.push(record) } } }, h(Screen))))
  const run = async (post) => {
    let result
    await act(async () => { result = await actions.runRowAction({ post }, draft, 'post', '确认生产记录') })
    return result
  }
  assert.equal(await run(async () => posted), true)
  assert.deepEqual(receipts.pop(), posted)
  const lost = async () => { throw Object.assign(new Error('响应丢失'), { isNetworkError: true }) }
  rows = [{ ...posted, id: 9 }, posted]
  assert.equal(await run(lost), true)
  assert.deepEqual(receipts.pop(), posted)
  rows = [draft, { ...posted, id: 9 }, { ...posted, version: 3 }]
  assert.equal(await run(lost), false)
  assert.deepEqual(receipts, [])
})
