import { useCallback, useEffect, useState } from 'react'
import { useReferenceRecords } from '../../hooks/useReferenceRecords.js'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { isRpcAbortError } from '../../../common/utils/jsonRpc'
import {
  listAllUnits,
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'

export default function useInventoryReferences({ adminProfile }) {
  const beginLatestRequest = useLatestRequestCoordinator()
  const [materials, , mergeMaterials] = useReferenceRecords(adminProfile)
  const [products, , mergeProducts] = useReferenceRecords(adminProfile)
  const [productSKUs, , mergeProductSKUs] = useReferenceRecords(adminProfile)
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inventoryLots, , mergeInventoryLots] = useReferenceRecords(adminProfile)
  const loadReferenceOptions = useCallback(async () => {
    const request = beginLatestRequest('references')
    const canReadInventory = hasActionPermission(
      adminProfile,
      PermissionCode.WAREHOUSE_INVENTORY_READ
    )
    const canReadMaterials = hasActionPermission(
      adminProfile,
      PermissionCode.MATERIAL_READ
    )
    const canReadProducts = hasActionPermission(
      adminProfile,
      PermissionCode.PRODUCT_READ
    )
    try {
      const [unitResult, warehouseResult] = await Promise.all([
        canReadMaterials || canReadProducts || canReadInventory
          ? listAllUnits({}, { signal: request.signal }) : {},
        canReadInventory
          ? listAllWarehouses({ active_only: true }, { signal: request.signal }) : {},
      ])
      if (!request.isCurrent()) return
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
      setWarehouses(
        Array.isArray(warehouseResult?.warehouses)
          ? warehouseResult.warehouses
          : []
      )
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      showPageLoadError(error, '加载库存筛选资料')
      setUnits([])
      setWarehouses([])
    } finally {
      if (request.isCurrent()) {
        request.finish()
      }
    }
  }, [beginLatestRequest, adminProfile])

  useEffect(() => {
    loadReferenceOptions()
  }, [loadReferenceOptions])

  return {
    materials,
    products,
    productSKUs,
    units,
    warehouses,
    inventoryLots,
    loadReferenceOptions,
    referenceRecords: { materials: mergeMaterials, products: mergeProducts, product_skus: mergeProductSKUs, inventory_lots: mergeInventoryLots },
  }
}
