import { useCallback, useEffect, useState } from 'react'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { isRpcAbortError } from '../../../common/utils/jsonRpc'
import { listAllInventoryLots } from '../../api/inventoryApi.mjs'
import {
  listAllMaterials,
  listAllProducts,
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
import { listAllPurchaseReceipts } from '../../api/purchaseApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'

function emptyReferences(referenceDataState) {
  return {
    referenceDataState,
    purchaseReceipts: [],
    inventoryLots: [],
    materials: [],
    products: [],
    warehouses: [],
  }
}

export default function useQualityInspectionReferences({ adminProfile }) {
  const [references, setReferences] = useState(() => emptyReferences('loading'))
  const beginLatestRequest = useLatestRequestCoordinator()
  const loadReferenceOptions = useCallback(async () => {
    const request = beginLatestRequest('quality-inspection-references')
    setReferences((current) => ({ ...current, referenceDataState: 'loading' }))
    const canRead = (permission) =>
      hasActionPermission(adminProfile, permission)
    try {
      const [receipts, lots, materials, products, warehouses] =
        await Promise.all([
          canRead(PermissionCode.PURCHASE_RECEIPT_READ)
            ? listAllPurchaseReceipts({}, { signal: request.signal })
            : {},
          canRead(PermissionCode.WAREHOUSE_INVENTORY_READ)
            ? listAllInventoryLots({}, { signal: request.signal })
            : {},
          canRead(PermissionCode.MATERIAL_READ)
            ? listAllMaterials(
                { active_only: true },
                { signal: request.signal }
              )
            : {},
          canRead(PermissionCode.PRODUCT_READ)
            ? listAllProducts({ active_only: true }, { signal: request.signal })
            : {},
          canRead(PermissionCode.WAREHOUSE_INVENTORY_READ)
            ? listAllWarehouses(
                { active_only: true },
                { signal: request.signal }
              )
            : {},
        ])
      if (!request.isCurrent()) return false
      setReferences({
        referenceDataState: 'ready',
        purchaseReceipts: Array.isArray(receipts.purchase_receipts)
          ? receipts.purchase_receipts
          : [],
        inventoryLots: Array.isArray(lots.inventory_lots)
          ? lots.inventory_lots
          : [],
        materials: Array.isArray(materials.materials)
          ? materials.materials
          : [],
        products: Array.isArray(products.products) ? products.products : [],
        warehouses: Array.isArray(warehouses.warehouses)
          ? warehouses.warehouses
          : [],
      })
      return true
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) return false
      showPageLoadError(error, '加载质检相关资料')
      setReferences(emptyReferences('error'))
      return false
    } finally {
      if (request.isCurrent()) request.finish()
    }
  }, [adminProfile, beginLatestRequest])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  return { ...references, loadReferenceOptions }
}
