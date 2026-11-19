import assert from 'node:assert/strict'
import test from 'node:test'
import { submitValidatedForm } from './submitValidatedForm.mjs'

test('a field validation error keeps the draft and suppresses the business action', async () => {
  let submits = 0
  await submitValidatedForm({ validateFields: async () => { throw Object.assign(new Error('字段无效'), { errorFields: [{ name: ['quantity'] }] }) } }, () => { submits += 1 })
  assert.equal(submits, 0)
})

test('a valid form submits once and propagates a business failure to its owner', async () => {
  const values = { quantity: '1' }
  const failure = new Error('提交失败')
  let submits = 0
  await assert.rejects(submitValidatedForm({ validateFields: async () => values }, (received) => {
    assert.deepEqual(received, values)
    submits += 1
    throw failure
  }), (error) => error === failure)
  assert.equal(submits, 1)
})
