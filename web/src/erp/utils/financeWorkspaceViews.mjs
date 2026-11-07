import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'

const RECEIVABLES = '/erp/finance/receivables'
const PAYABLES = '/erp/finance/payables'
const RECONCILIATION = '/erp/finance/reconciliation'

export function getFinanceWorkspaceViews(
  moduleKey,
  adminProfile,
  visibleMenuPaths
) {
  const can = (permission) => hasActionPermission(adminProfile, permission)
  const canReadPayment = can(PermissionCode.FINANCE_PAYMENT_READ)
  const canReadReceivables = can(PermissionCode.FINANCE_RECEIVABLE_READ)
  const canReadPayables = can(PermissionCode.FINANCE_PAYABLE_READ)
  const canReadStatement =
    canReadPayment && (canReadReceivables || canReadPayables)
  const canReadSourceAdjustments =
    canReadPayment &&
    canReadPayables &&
    [
      PermissionCode.PURCHASE_RECEIPT_READ,
      PermissionCode.PURCHASE_RETURN_READ,
      PermissionCode.PURCHASE_RECEIPT_ADJUSTMENT_READ,
    ].every(can)
  const credits = { value: 'credits', label: '账款调整' }
  const statement = { value: 'statement', label: '期间对账' }
  const sourceAdjustments = { value: 'source-adjustments', label: '采购待调整' }

  if (moduleKey === 'reconciliation') {
    return [
      { value: 'records', label: '单笔核对' },
      ...(canReadStatement ? [statement] : []),
    ]
  }
  if (moduleKey === 'receivables' || moduleKey === 'payables') {
    return [
      { value: 'list', label: '账款列表' },
      { value: 'due', label: '到期顺序' },
      ...(canReadPayment ? [credits] : []),
      ...(moduleKey === 'payables' && canReadSourceAdjustments
        ? [sourceAdjustments]
        : []),
    ]
  }

  // 仅获授权收付款入口的岗位仍须能够查询原有账款调整和期间对账。
  const hasPage = (path, permission) =>
    Array.isArray(visibleMenuPaths)
      ? visibleMenuPaths.includes(path)
      : can(permission)
  return [
    { value: 'payments', label: '收付款记录' },
    ...(canReadPayment &&
    !hasPage(RECEIVABLES, PermissionCode.FINANCE_RECEIVABLE_READ) &&
    !hasPage(PAYABLES, PermissionCode.FINANCE_PAYABLE_READ)
      ? [credits]
      : []),
    ...(canReadStatement &&
    !hasPage(RECONCILIATION, PermissionCode.FINANCE_RECONCILIATION_READ)
      ? [statement]
      : []),
    ...(canReadSourceAdjustments &&
    !hasPage(PAYABLES, PermissionCode.FINANCE_PAYABLE_READ)
      ? [sourceAdjustments]
      : []),
  ]
}

export function resolveFinanceWorkspaceView({
  views,
  requestedView,
  savedView,
  hasRecordContext,
}) {
  if (views.some((view) => view.value === requestedView)) return requestedView
  if (hasRecordContext) {
    const recordView = views.find((view) =>
      ['records', 'list', 'payments'].includes(view.value)
    )
    if (recordView) return recordView.value
  }
  return views.some((view) => view.value === savedView)
    ? savedView
    : views[0]?.value
}
