import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'
import { installTestDOM, registerJSXTestLoader } from '../../../../scripts/test/reactRuntime.mjs'
import { getRequestScopeCancellation, RequestScopeOwner, RequestScopeCancellationCause } from '../../../common/utils/requestScopeCancellation.mjs'

test('委外任务切换来源或读取失败时不保留旧明细，也不显示其他合同或完整商业信息', async (t) => {
  const dom = installTestDOM()
  registerJSXTestLoader()
  const [{ createRoot }, { default: Component }, { Button }] = await Promise.all([import('react-dom/client'), import('./MobileOutsourcingTaskActions.jsx'), import('antd')])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const pending = []
  const load = (record, { signal }) => new Promise((resolve, reject) => pending.push({ record, signal, resolve, reject }))
  const fields = (item) => [{ label: '材料', value: item.label, taskSummary: true }, { label: '单价', value: '不得显示的完整商业内容' }, { label: '办理', value: createElement(Button, null, '委外发料'), taskSummary: true }]
  const render = (record, refreshKey) => act(async () => root.render(createElement(Component, { record, load, getItemFields: fields, refreshKey })))
  t.after(async () => { await act(async () => root.unmount()); container.remove(); dom.restore() })
  await render({ id: 8, version: 1 })
  await render({ id: 8, version: 1, note: '同一版本的来源回读' })
  assert.equal(pending.length, 1, '同一合同版本的对象替换不能重启在途明细读取')
  assert.equal(pending[0].signal.aborted, false)
  const current = { id: 9, version: 2 }
  await render(current)
  assert.equal(pending[0].signal.aborted, true)
  assert.equal(pending[0].signal.reason.name, 'AbortError')
  assert.deepEqual(getRequestScopeCancellation(pending[0].signal.reason), {
    owner: RequestScopeOwner.OUTSOURCING_TASK_ITEMS,
    cause: RequestScopeCancellationCause.DISPOSED,
    generation: 1,
  })
  await act(async () => pending[1].resolve({ items: [{ id: 91, outsourcing_order_id: 9, label: '当前合同材料' }], total: 1 }))
  await act(async () => pending[0].resolve({ items: [{ id: 81, outsourcing_order_id: 8, label: '旧合同材料' }], total: 1 }))
  assert.match(container.textContent, /当前合同材料|委外发料/u)
  assert.doesNotMatch(container.textContent, /旧合同材料|不得显示的完整商业内容/u)
  await render({ ...current })
  assert.equal(pending.length, 2, '同一来源版本的重复回读保留已确认明细')
  assert.equal(pending[1].signal.aborted, false)
  await render({ ...current, version: 3 })
  await act(async () => pending[2].reject(new Error('SQL internal diagnostics must remain private')))
  assert.doesNotMatch(container.textContent, /当前合同材料|SQL internal/u)
  const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === '重新读取')
  assert.ok(retry)
  await act(async () => retry.click())
  assert.equal(pending[2].signal.aborted, true)
  assert.equal(getRequestScopeCancellation(pending[2].signal.reason).generation, 3)
  await act(async () => pending[3].resolve({ items: [{ id: 81, outsourcing_order_id: 8, label: '错误来源材料' }], total: 1 }))
  assert.doesNotMatch(container.textContent, /错误来源材料|委外发料/u)
  await render(null)
  assert.match(container.textContent, /暂无可办理明细/u)
  await render(current, 'return-posted:41')
  await act(async () => pending[4].resolve({ items: [{ id: 91, outsourcing_order_id: 9, label: '回货前明细' }], total: 1 }))
  await render({ ...current }, 'return-posted:42')
  assert.equal(pending.length, 6, '关联事实变化即使合同版本未变也必须重新读取')
  assert.doesNotMatch(container.textContent, /回货前明细/u)
  await act(async () => pending[5].resolve({ items: [{ id: 91, outsourcing_order_id: 9, label: '回货后明细' }], total: 1 }))
  assert.match(container.textContent, /回货后明细/u)
})
