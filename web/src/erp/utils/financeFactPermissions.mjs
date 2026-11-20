import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'

const RECEIVABLE_CONFIRM = PermissionCode.FINANCE_RECEIVABLE_CONFIRM
const PAYABLE_CONFIRM = PermissionCode.FINANCE_PAYABLE_CONFIRM
const INVOICE_CONFIRM = PermissionCode.FINANCE_INVOICE_CONFIRM
const RECONCILIATION_CONFIRM = PermissionCode.FINANCE_RECONCILIATION_CONFIRM

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
