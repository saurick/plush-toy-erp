import { hasActionPermission } from './masterDataOrderView.mjs'

const RECEIVABLE_CONFIRM = 'finance.receivable.confirm'
const PAYABLE_CONFIRM = 'finance.payable.confirm'

export function financeFactConfirmPermissions(factType) {
  switch (
    String(factType || '')
      .trim()
      .toUpperCase()
  ) {
    case 'RECEIVABLE':
    case 'INVOICE':
      return [RECEIVABLE_CONFIRM]
    case 'PAYABLE':
      return [PAYABLE_CONFIRM]
    case 'PAYMENT':
    case 'RECONCILIATION':
      return [RECEIVABLE_CONFIRM, PAYABLE_CONFIRM]
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
