import { useCallback, useEffect, useState } from 'react'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { isRpcAbortError } from '../../../common/utils/jsonRpc'
import { listAllInventoryLots } from '../../api/inventoryApi.mjs'
import {
  listAllMaterials,
  listAllProducts,
  listAllProductSKUs,
  listAllUnits,
  listAllWarehouses,
} from '../../api/masterDataOrderApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { showPageLoadError } from '../PageLoadFeedback.jsx'

export default function useInventoryReferences({ adminProfile }) {
  const beginLatestRequest = useLatestRequestCoordinator()
  const [materials, setMaterials] = useState([])
  const [products, setProducts] = useState([])
  const [productSKUs, setProductSKUs] = useState([])
  const [units, setUnits] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [inventoryLots, setInventoryLots] = useState([])
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
    const canReadProductSKUs = hasActionPermission(
      adminProfile,
      PermissionCode.PRODUCT_SKU_READ
    )
    try {
      const [
        materialResult,
        productResult,
        productSKUResult,
        unitResult,
        warehouseResult,
        lotResult,
      ] = await Promise.all([
        canReadMaterials
          ? listAllMaterials({ active_only: true }, { signal: request.signal })
          : Promise.resolve({ materials: [] }),
        canReadProducts
          ? listAllProducts({ active_only: true }, { signal: request.signal })
          : Promise.resolve({ products: [] }),
        canReadProductSKUs
          ? listAllProductSKUs({}, { signal: request.signal })
          : Promise.resolve({ product_skus: [] }),
        canReadMaterials || canReadProducts || canReadInventory
          ? listAllUnits({}, { signal: request.signal })
          : Promise.resolve({ units: [] }),
        canReadInventory
          ? listAllWarehouses({ active_only: true }, { signal: request.signal })
          : Promise.resolve({ warehouses: [] }),
        canReadInventory
          ? listAllInventoryLots({}, { signal: request.signal })
          : Promise.resolve({ inventory_lots: [] }),
      ])
      if (!request.isCurrent()) {
        return
      }
      setMaterials(
        Array.isArray(materialResult?.materials) ? materialResult.materials : []
      )
      setProducts(
        Array.isArray(productResult?.products) ? productResult.products : []
      )
      setProductSKUs(
        Array.isArray(productSKUResult?.product_skus)
          ? productSKUResult.product_skus
          : []
      )
      setUnits(Array.isArray(unitResult?.units) ? unitResult.units : [])
      setWarehouses(
        Array.isArray(warehouseResult?.warehouses)
          ? warehouseResult.warehouses
          : []
      )
      setInventoryLots(
        Array.isArray(lotResult?.inventory_lots) ? lotResult.inventory_lots : []
      )
    } catch (error) {
      if (isRpcAbortError(error) || !request.isCurrent()) {
        return
      }
      showPageLoadError(error, '加载库存筛选资料')
      setMaterials([])
      setProducts([])
      setProductSKUs([])
      setUnits([])
      setWarehouses([])
      setInventoryLots([])
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
  }
}
