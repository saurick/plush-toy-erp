import {
  listCustomers,
  listSuppliers,
  listMaterials,
  listProducts,
  listProductSKUs,
  listUnits,
} from '../api/masterDataOrderApi.mjs'
import { listInventoryLots } from '../api/inventoryApi.mjs'
import { listPurchaseReceipts } from '../api/purchaseApi.mjs'
import {
  customerOption,
  supplierOption,
  materialOption,
  productOption,
  productSKUOption,
  unitOption,
  inventoryLotOption,
  purchaseReceiptOption,
} from './referenceSelectOptions.mjs'
import { listReferenceRecordsByIDs } from './referencePagination.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'

export const remoteReferences = {
  customers: { list: listCustomers, option: customerOption, active: true },
  suppliers: { list: listSuppliers, option: supplierOption, active: true },
  materials: { list: listMaterials, option: materialOption, active: true },
  products: { list: listProducts, option: productOption, active: true },
  product_skus: {
    list: listProductSKUs,
    option: (row) => ({ ...productSKUOption(row), sku: row }),
    active: true,
  },
  units: { list: listUnits, option: unitOption },
  inventory_lots: { list: listInventoryLots, option: inventoryLotOption },
  purchase_receipts: {
    list: listPurchaseReceipts,
    option: purchaseReceiptOption,
  },
}

export function mergeReferenceRecords(current, incoming) {
  return [
    ...new Map(
      [...current, ...incoming].map((record) => [record.id, record])
    ).values(),
  ]
}

export function loadReferenceIDs(type, ids, options = {}) {
  return listReferenceRecordsByIDs(
    remoteReferences[type].list,
    {},
    type,
    ids,
    options
  )
}

const referencePermissions = {
  customers: PermissionCode.CUSTOMER_READ,
  suppliers: PermissionCode.SUPPLIER_READ,
  materials: PermissionCode.MATERIAL_READ,
  products: PermissionCode.PRODUCT_READ,
  product_skus: PermissionCode.PRODUCT_SKU_READ,
  inventory_lots: PermissionCode.WAREHOUSE_INVENTORY_READ,
  purchase_receipts: PermissionCode.PURCHASE_RECEIPT_READ,
}
export function canReadReference(profile, type) {
  return (
    !profile ||
    !referencePermissions[type] ||
    hasActionPermission(profile, referencePermissions[type])
  )
}
