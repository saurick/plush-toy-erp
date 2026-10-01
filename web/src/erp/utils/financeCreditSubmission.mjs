import {
  createFinanceCreditNote,
  getFinanceCreditNote,
  listFinanceCreditNotes,
  reverseFinanceCreditNote,
} from '../api/operationalFactApi.mjs'
import { trimOptional } from './sourceDocumentValues.mjs'
import { compareNumeric20Scale6Values } from './numeric20Scale6.mjs'
import { validateFinanceCreditDraft } from './financePaymentAllocation.mjs'

export function buildFinanceCreditCommand({
  reverse,
  values,
  source,
  currentCredit,
  customerKey,
}) {
  const common = {
    ...(customerKey ? { customer_key: customerKey } : {}),
    credit_note_no: trimOptional(values.credit_note_no),
    reason: trimOptional(values.reason),
  }
  if (reverse) {
    return {
      action: 'reverse',
      scope: `reverse-credit:${currentCredit.id}`,
      payload: { ...common, credit_note_id: currentCredit.id },
    }
  }
  const amount = String(values.amount).trim()
  const check = validateFinanceCreditDraft({
    amount,
    outstandingAmount: source?.outstanding_amount,
  })
  if (!source || check.reason === 'SOURCE_CHANGED') {
    throw new Error('来源应收或应付的未核销金额无法确认，请重新选择')
  }
  if (check.reason === 'EXCEEDS_OUTSTANDING') {
    throw Object.assign(new Error('红冲金额不能超过来源记录的当前未核销金额'), {
      isCreditAmountWarning: true,
    })
  }
  return {
    action: 'create',
    scope: `credit:${Number(values.finance_fact_id)}`,
    payload: {
      ...common,
      finance_fact_id: Number(values.finance_fact_id),
      amount,
    },
  }
}

function matchesFinanceCreditReceipt(credit, command) {
  if (!credit?.id) return false
  if (command.action === 'reverse') {
    return (
      Number(credit.reversal_of_credit_note_id) ===
        Number(command.payload.credit_note_id) && credit.status === 'REVERSED'
    )
  }
  return (
    Number(credit.finance_fact_id) ===
      Number(command.payload.finance_fact_id) &&
    credit.status === 'POSTED' &&
    compareNumeric20Scale6Values(credit.amount, command.payload.amount) === 0
  )
}

async function readFinanceCreditReversal(creditID) {
  try {
    const sourceCredit = await getFinanceCreditNote({ id: creditID })
    const history = await listFinanceCreditNotes({
      finance_fact_id: sourceCredit?.finance_fact_id,
      limit: 50,
      offset: 0,
    })
    return (
      (history?.credit_notes || []).find(
        (item) =>
          Number(item?.reversal_of_credit_note_id) === Number(creditID) &&
          item.status === 'REVERSED'
      ) || null
    )
  } catch {
    // A failed readback keeps the frozen intent available for an exact retry.
    return null
  }
}

export async function executeFinanceCreditCommand({ command, attemptStore }) {
  const attempt = attemptStore.prepare(command.scope, command.payload)
  const execute =
    command.action === 'reverse'
      ? reverseFinanceCreditNote
      : createFinanceCreditNote
  try {
    const credit = await execute(attempt.params)
    if (!matchesFinanceCreditReceipt(credit, command)) {
      throw Object.assign(new Error('红冲结果暂时无法确认'), {
        isInvalidResponse: true,
      })
    }
    attemptStore.settle(command.scope, attempt, null)
    return { outcome: 'confirmed', credit, recovered: false }
  } catch (error) {
    const retained = attemptStore.settle(command.scope, attempt, error)
    if (retained && command.action === 'reverse') {
      const credit = await readFinanceCreditReversal(
        command.payload.credit_note_id
      )
      if (credit) {
        attemptStore.settle(command.scope, attempt, null)
        return { outcome: 'confirmed', credit, recovered: true }
      }
    }
    return { outcome: 'unconfirmed', error, retained }
  }
}
