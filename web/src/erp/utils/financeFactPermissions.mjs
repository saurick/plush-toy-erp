import { hasActionPermission } from './masterDataOrderView.mjs'

const RECEIVABLE_CONFIRM = 'finance.receivable.confirm'
const PAYABLE_CONFIRM = 'finance.payable.confirm'
const INVOICE_CONFIRM = 'finance.invoice.confirm'
const RECONCILIATION_CONFIRM = 'finance.reconciliation.confirm'

export function financeFactConfirmPermissions(factType) {
  switch (
    String(factType || '')
      .trim()
      .toUpperCase()
  ) {
    case 'RECEIVABLE':
      return [RECEIVABLE_CONFIRM]
    case 'PAYABLE':
      return [PAYABLE_CONFIRM]
    case 'INVOICE':
      return [INVOICE_CONFIRM]
    case 'RECONCILIATION':
      return [RECONCILIATION_CONFIRM]
    case 'PAYMENT':
    default:
      return []
  }
}

export function canConfirmFinanceFact(adminProfile, factType) {
  const requiredPermissions = financeFactConfirmPermissions(factType)
  return (
    requiredPermissions.length > 0 &&
    requiredPermissions.every((permission) =>
      hasActionPermission(adminProfile, permission)
    )
  )
}
