import {
  addNumeric20Scale6Units,
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
} from './numeric20Scale6.mjs'

export function validateFinanceAllocationDraft({
  allocations = [],
  candidates = [],
  paymentAmount,
} = {}) {
  if (!Array.isArray(allocations) || allocations.length === 0) {
    return { ok: false, reason: 'EMPTY' }
  }

  let totalUnits = '0'
  for (const allocation of allocations) {
    const candidate = candidates.find(
      (item) => Number(item?.id) === Number(allocation?.finance_fact_id)
    )
    const amountUnits = numeric20Scale6Units(allocation?.amount)
    const outstandingUnits = numeric20Scale6Units(
      candidate?.outstanding_amount
    )
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
    compareNumeric20Scale6Units(totalUnits, paymentUnits) !== 0
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
