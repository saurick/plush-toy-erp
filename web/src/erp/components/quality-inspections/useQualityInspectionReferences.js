import { useCallback, useEffect, useState } from 'react'
import { useReferenceRecords } from '../../hooks/useReferenceRecords.js'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { isRpcAbortError } from '../../../common/utils/jsonRpc'
import {
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
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
  const [purchaseReceipts, , mergePurchaseReceipts] = useReferenceRecords(adminProfile)
  const [inventoryLots, , mergeInventoryLots] = useReferenceRecords(adminProfile)
  const [materials, , mergeMaterials] = useReferenceRecords(adminProfile)
  const [products, , mergeProducts] = useReferenceRecords(adminProfile)
  const [references, setReferences] = useState(() => emptyReferences('loading'))
  const beginLatestRequest = useLatestRequestCoordinator()
  const loadReferenceOptions = useCallback(async () => {
    const request = beginLatestRequest('quality-inspection-references')
    setReferences((current) => ({ ...current, referenceDataState: 'loading' }))
    const canRead = (permission) =>
      hasActionPermission(adminProfile, permission)
    try {
      const warehouses = canRead(PermissionCode.WAREHOUSE_INVENTORY_READ)
        ? await listAllWarehouses({ active_only: true }, { signal: request.signal }) : {}
      if (!request.isCurrent()) return false
      setReferences({
        referenceDataState: 'ready',
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

  return {
    ...references,
    purchaseReceipts,
    inventoryLots,
    materials,
    products,
    loadReferenceOptions,
    referenceRecords: {
      purchase_receipts: mergePurchaseReceipts,
      inventory_lots: mergeInventoryLots,
      materials: mergeMaterials,
      products: mergeProducts,
    },
  }
}
