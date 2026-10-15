import { canonicalBusinessPath } from './businessTaskRoute.mjs'

const positiveID = (value) => Number.isSafeInteger(value) && value > 0
const salesPath = '/erp/sales/project-orders/sales-orders'

export function getEngineeringBOMAction({ productID, bomID, boms, canRead, canCreate, canUpdate }) {
  if (!canRead) return null
  const bom = boms.find((item) => item.id === bomID && item.product_id === productID)
  const mode = bom ? (bom.status === 'DRAFT' && canUpdate ? 'edit' : 'view') : 'create'
  const disabledReason = !productID
    ? '请先选择工程产品'
    : bomID && !bom
      ? '所选 BOM 已变化，请重新读取后选择'
      : mode === 'create' && !canCreate && !canUpdate
        ? '当前账号没有编制 BOM 的权限'
        : ''
  return { mode, label: mode === 'edit' ? '继续编制' : mode === 'view' ? '查看 BOM' : '编制 BOM', disabledReason }
}

export function readEngineeringBOMReturn(state, adminID) {
  const value = state?.engineeringBOMReturn
  if (!positiveID(adminID) || !value || value.adminID !== adminID ||
      ![value.orderID, value.itemID, value.productID].every(positiveID) ||
      (value.bomID != null && !positiveID(value.bomID))) return null
  return value
}

export function readBOMPreparation(state, adminID) {
  const value = state?.bomPreparation
  if (!value || !readEngineeringBOMReturn({ engineeringBOMReturn: value }, adminID) ||
      !['create', 'edit', 'view'].includes(value.mode) ||
      (value.mode === 'create' ? value.bomID != null : !positiveID(value.bomID)) ||
      typeof value.returnPath !== 'string' ||
      canonicalBusinessPath(value.returnPath).split('?')[0] !== salesPath ||
      !/^\/(?:erp|m)\/[A-Za-z0-9/_?=&.%:+-]+$/u.test(value.returnPath) ||
      typeof value.orderNo !== 'string' || typeof value.quantityText !== 'string') return null
  return value
}

export function engineeringBOMReturnState(preparation, bomID = preparation.bomID) {
  const { adminID, orderID, itemID, productID } = preparation
  return { engineeringBOMReturn: { adminID, orderID, itemID, productID, bomID } }
}
