import { PermissionCode } from './permissions.generated.mjs'
import { RpcDomain, RpcMethod } from './rpcMethods.generated.mjs'
import { SourceActionReadPermissions } from './sourceActionPermissions.generated.mjs'

// Page preparation requirements supplement the generated source reads.
// Every write still checks authorization in the backend.
function action(label, domain, method, permission, preparation = [], sensitive = []) {
  const sourceRules = SourceActionReadPermissions[`${domain}.${method}`]
  if (!sourceRules || sourceRules.some((rule) => rule.condition)) {
    throw new Error(`采购来源操作缺少明确的权限合同：${domain}.${method}`)
  }
  return Object.freeze({
    label,
    domain,
    method,
    permission,
    sourcePermissions: Object.freeze(sourceRules.map((rule) => rule.permission)),
    preparationPermissions: Object.freeze(preparation),
    sensitivePermissions: Object.freeze(sensitive),
  })
}

export const PurchaseSourceActions = Object.freeze({
  receipt: action('登记采购到货', RpcDomain.PURCHASE, RpcMethod.purchase.CREATE_PURCHASE_RECEIPT_FROM_PURCHASE_ORDER, PermissionCode.PURCHASE_RECEIPT_CREATE, [PermissionCode.PURCHASE_RECEIPT_READ, PermissionCode.WAREHOUSE_INBOUND_READ, PermissionCode.WAREHOUSE_INVENTORY_READ, PermissionCode.MATERIAL_READ]),
  quality: action('补建来料质检', RpcDomain.QUALITY, RpcMethod.quality.CREATE_QUALITY_INSPECTION_DRAFT, PermissionCode.QUALITY_INSPECTION_CREATE),
  payable: action('生成采购应付', RpcDomain.OPERATIONAL_FACT, RpcMethod.operational_fact.CREATE_PAYABLE_FROM_PURCHASE_RECEIPT, PermissionCode.FINANCE_PAYABLE_CONFIRM, [], [PermissionCode.FIELD_PROCUREMENT_COMMERCIAL_READ]),
  receiptReturn: action('生成采购退货', RpcDomain.PURCHASE, RpcMethod.purchase.CREATE_PURCHASE_RETURN_FROM_RECEIPT, PermissionCode.PURCHASE_RETURN_CREATE),
  receiptAdjustment: action('登记入库调整', RpcDomain.PURCHASE, RpcMethod.purchase.CREATE_PURCHASE_RECEIPT_ADJUSTMENT_FROM_RECEIPT, PermissionCode.PURCHASE_RECEIPT_ADJUSTMENT_CREATE),
  qualityReturn: action('来料不合格处置', RpcDomain.PURCHASE, RpcMethod.purchase.CREATE_PURCHASE_RETURN_FROM_QUALITY_INSPECTION, PermissionCode.PURCHASE_RETURN_CREATE, [PermissionCode.PURCHASE_RETURN_READ]),
  rejectionDisposition: action('来料不合格处置', RpcDomain.PURCHASE, RpcMethod.purchase.CREATE_PURCHASE_REJECTION_DISPOSITION, PermissionCode.PURCHASE_RETURN_CREATE, [PermissionCode.PURCHASE_RETURN_READ]),
})
