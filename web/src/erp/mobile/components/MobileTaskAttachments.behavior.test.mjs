import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader, installTestDOM } from '../../../../scripts/test/reactRuntime.mjs'

test('all task kinds keep task-owned attachments independently from BOM attachments', async (t) => {
  const dom = installTestDOM(); registerJSXTestLoader()
  const [{ default: Attachments }, { JsonRpc }] = await Promise.all([import('./MobileTaskAttachments.jsx'), import('../../../common/utils/jsonRpc.js')])
  const original = JsonRpc.prototype.call
  const reads = []
  JsonRpc.prototype.call = async (method, params) => {
    assert.equal(method, 'list_attachments')
    reads.push(params)
    return { data: { attachments: [] } }
  }
  const node = document.createElement('div'); document.body.appendChild(node)
  const root = createRoot(node)
  t.after(async () => { await act(async () => root.unmount()); node.remove(); JsonRpc.prototype.call = original; dom.restore() })
  for (const [index, task_group] of ['engineering_data', 'handoff_receipt_quality', 'handoff_purchase_arrival', 'finance_payment_execution'].entries()) {
    await act(async () => root.render(createElement(Attachments, { task: { id: index + 10, version: 2, task_group }, canManage: true })))
    assert.equal(node.querySelector('button').textContent.trim(), '添加任务附件')
    assert.deepEqual(reads.at(-1), { owner_type: 'workflow_task', owner_id: index + 10 })
  }
  await act(async () => root.render(createElement(Attachments, { task: { id: 13, version: 2 }, canManage: false })))
  assert.equal(node.querySelector('button').textContent.trim(), '查看任务附件')
  await act(async () => node.querySelector('button').click())
  assert.match(document.body.textContent, /任务附件/u)
  assert.equal(document.querySelector('input[type="file"]'), null, 'read-only task attachments cannot queue an upload')
  assert.ok(reads.every((read) => read.owner_type === 'workflow_task'))
})
