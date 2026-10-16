import { FinanceAllocationStatus, FinancePaymentStatus } from '../../common/consts/statuses.generated.mjs'
import {
  addNumeric20Scale6Units,
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
} from './numeric20Scale6.mjs'
import { sourceBusinessActionSignature } from './sourceBusinessAction.mjs'

export function pendingFinanceAllocationAttempt(store, scope, payload) {
  const pending = store.peek(scope)
  if (!pending) return null
  const intent = (params) => {
    const values = { ...params }
    delete values.expected_version
    return sourceBusinessActionSignature(values)
  }
  if (intent(pending.params) !== intent(payload)) {
    throw new Error(
      '上次抵扣结果尚未确认，请保留原抵扣内容并重新确认后再办理新的抵扣'
    )
  }
  return pending
}

export function validateFinanceAllocationDraft({
  allocations = [],
  candidates = [],
  paymentAmount,
  allowPartial = false,
} = {}) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { ok: false, reason: 'EMPTY' }
  }

  const seen = new Set()
  let totalUnits = '0'
  for (const allocation of allocations) {
    const factID = Number(allocation?.finance_fact_id)
    if (seen.has(factID)) return { ok: false, reason: 'SOURCE_CHANGED' }
    seen.add(factID)
    const candidate = candidates.find(
      (item) => Number(item?.id) === Number(allocation?.finance_fact_id)
    )
    const amountUnits = numeric20Scale6Units(allocation?.amount)
    const outstandingUnits = numeric20Scale6Units(candidate?.outstanding_amount)
    if (
      !candidate ||
      !isPositiveNumeric20Scale6Units(amountUnits) ||
      !isPositiveNumeric20Scale6Units(outstandingUnits)
    ) {
      return {
        ok: false,
        reason: 'SOURCE_CHANGED',
        financeFactNo: candidate?.fact_no || '',
      }
    }
    if (compareNumeric20Scale6Units(amountUnits, outstandingUnits) === 1) {
      return {
        ok: false,
        reason: 'EXCEEDS_OUTSTANDING',
        financeFactNo: candidate.fact_no || '',
      }
    }
    totalUnits = addNumeric20Scale6Units(totalUnits, amountUnits)
  }

  const paymentUnits = numeric20Scale6Units(paymentAmount)
  if (
    paymentUnits === null ||
    (allowPartial
      ? compareNumeric20Scale6Units(totalUnits, paymentUnits) === 1
      : compareNumeric20Scale6Units(totalUnits, paymentUnits) !== 0)
  ) {
    return {
      ok: false,
      reason: 'TOTAL_MISMATCH',
      total: numeric20Scale6TextFromUnits(totalUnits),
    }
  }
  return {
    ok: true,
    total: numeric20Scale6TextFromUnits(totalUnits),
  }
}

export function validateFinanceCreditDraft({ amount, outstandingAmount } = {}) {
  const amountUnits = numeric20Scale6Units(amount)
  const outstandingUnits = numeric20Scale6Units(outstandingAmount)
  if (
    !isPositiveNumeric20Scale6Units(amountUnits) ||
    !isPositiveNumeric20Scale6Units(outstandingUnits)
  ) {
    return { ok: false, reason: 'SOURCE_CHANGED' }
  }
  if (compareNumeric20Scale6Units(amountUnits, outstandingUnits) === 1) {
    return { ok: false, reason: 'EXCEEDS_OUTSTANDING' }
  }
  return { ok: true }
}

export function financePaymentPostMatchesIntent(
  payment,
  expected,
  allocations = []
) {
  if (
    payment?.status !== FinancePaymentStatus.POSTED ||
    Number(payment.id) !== Number(expected?.id) ||
    payment.currency !== expected.currency ||
    payment.direction !== expected.direction ||
    Number(payment.counterparty_id) !== Number(expected.counterparty_id) ||
    payment.counterparty_type !== expected.counterparty_type ||
    numeric20Scale6Units(payment.amount) === null ||
    numeric20Scale6Units(payment.amount) !==
      numeric20Scale6Units(expected.amount) ||
    !Array.isArray(payment.allocations)
  ) {
    return false
  }
  const actual = payment.allocations.filter((item) => item.status === FinanceAllocationStatus.POSTED)
  if (actual.length !== allocations.length) return false
  const seen = new Set()
  return allocations.every((wanted) => {
    const id = Number(wanted.finance_fact_id)
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) return false
    seen.add(id)
    const matches = actual.filter((item) => Number(item.finance_fact_id) === id)
    return (
      matches.length === 1 &&
      numeric20Scale6Units(wanted.amount) !== null &&
      numeric20Scale6Units(matches[0].amount) ===
        numeric20Scale6Units(wanted.amount)
    )
  })
}
