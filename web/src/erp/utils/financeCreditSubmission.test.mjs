import assert from 'node:assert/strict'
import test, { after } from 'node:test'
import { registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'
import { installRpcCallHarness } from '../../../scripts/test/rpcApiTestHarness.mjs'
import { createSourceBusinessActionAttemptStore } from './sourceBusinessAction.mjs'

registerJSXTestLoader()
const { buildFinanceCreditCommand, executeFinanceCreditCommand } =
  await import('./financeCreditSubmission.mjs')
const setRpcResponse = installRpcCallHarness(after)
const values = {
  credit_note_no: 'CR-1',
  finance_fact_id: 7,
  amount: '10',
  reason: '金额调整',
}
const source = { id: 7, outstanding_amount: '20' }

test('finance credit preparation separates creation and reversal and rejects stale or excessive amounts', () => {
  const create = buildFinanceCreditCommand({
    reverse: false,
    values,
    source,
    customerKey: 'yoyoosun',
  })
  assert.equal(create.scope, 'credit:7')
  assert.equal(create.payload.amount, '10')
  assert.throws(
    () => buildFinanceCreditCommand({ reverse: false, values, source: null }),
    /无法确认/
  )
  assert.throws(
    () =>
      buildFinanceCreditCommand({
        reverse: false,
        values: { ...values, amount: '21' },
        source,
      }),
    /不能超过/
  )
  const reverse = buildFinanceCreditCommand({
    reverse: true,
    values,
    currentCredit: { id: 8 },
  })
  assert.equal(reverse.scope, 'reverse-credit:8')
  assert.equal(reverse.payload.credit_note_id, 8)
  assert.equal(reverse.payload.finance_fact_id, undefined)
  assert.equal(reverse.payload.amount, undefined)
})

test('finance credit retries retain the same intent until a matching amount receipt confirms success', async () => {
  const store = createSourceBusinessActionAttemptStore()
  const command = buildFinanceCreditCommand({ reverse: false, values, source })
  const keys = []
  let amount = '9'
  setRpcResponse(async (_method, params) => {
    keys.push(params.idempotency_key)
    return {
      data: {
        credit_note: { id: 8, finance_fact_id: 7, status: 'POSTED', amount },
      },
    }
  })
  const uncertain = await executeFinanceCreditCommand({
    command,
    attemptStore: store,
  })
  assert.equal(uncertain.outcome, 'unconfirmed')
  assert.equal(uncertain.retained, true)
  assert.ok(store.peek(command.scope))
  amount = '10.000000'
  assert.equal(
    (await executeFinanceCreditCommand({ command, attemptStore: store }))
      .outcome,
    'confirmed'
  )
  assert.equal(keys[0], keys[1])
  assert.equal(store.peek(command.scope), null)
})

test('finance credit reversal reads back its own reversal without repeating a write', async () => {
  const store = createSourceBusinessActionAttemptStore()
  const command = buildFinanceCreditCommand({
    reverse: true,
    values,
    currentCredit: { id: 8 },
  })
  const calls = []
  setRpcResponse(async (method) => {
    calls.push(method)
    if (method === 'get_finance_credit_note') {
      return { data: { credit_note: { id: 8, finance_fact_id: 7 } } }
    }
    if (method === 'list_finance_credit_notes') {
      return {
        data: {
          credit_notes: [
            { id: 9, reversal_of_credit_note_id: 99, status: 'REVERSED' },
            { id: 10, reversal_of_credit_note_id: 8, status: 'REVERSED' },
          ],
        },
      }
    }
    return { data: {} }
  })
  const result = await executeFinanceCreditCommand({
    command,
    attemptStore: store,
  })
  assert.equal(result.outcome, 'confirmed')
  assert.equal(result.recovered, true)
  assert.equal(result.credit.id, 10)
  assert.deepEqual(calls, [
    'reverse_finance_credit_note',
    'get_finance_credit_note',
    'list_finance_credit_notes',
  ])
  assert.equal(store.peek(command.scope), null)
})
