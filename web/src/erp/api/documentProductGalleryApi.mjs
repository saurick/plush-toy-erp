import { getSalesOrder, getOutsourcingOrder, listAllSalesOrderItems, listAllOutsourcingOrderItems } from './masterDataOrderApi.mjs'
import { getProductionOrder } from './productionOrderApi.mjs'
import { DOCUMENT_PRODUCT_SOURCES, normalizeGalleryProducts } from '../utils/businessProductGallery.mjs'
import { DEFAULT_RPC_ERROR_MESSAGES, RpcErrorCode } from '../../common/consts/errorCodes.js'

export async function loadDocumentGalleryProducts(source, documentID, { signal, expectedVersion } = {}) {
  let items
  switch (source) {
    case DOCUMENT_PRODUCT_SOURCES.SALES_ORDER: {
      const version = expectedVersion ?? (await getSalesOrder({ id: documentID }, { signal }))?.version
      const data = await listAllSalesOrderItems({ sales_order_id: documentID, expected_version: version }, { signal })
      items = data.sales_order_items
      break
    }
    case DOCUMENT_PRODUCT_SOURCES.PRODUCTION_ORDER: {
      const data = await getProductionOrder(documentID, { signal })
      if (expectedVersion !== undefined && data.order.version !== expectedVersion) {
        throw Object.assign(new Error(DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.RESOURCE_VERSION_CONFLICT]), { code: RpcErrorCode.RESOURCE_VERSION_CONFLICT })
      }
      items = data.items
      break
    }
    case DOCUMENT_PRODUCT_SOURCES.OUTSOURCING_ORDER: {
      const version = expectedVersion ?? (await getOutsourcingOrder({ id: documentID }, { signal }))?.version
      const data = await listAllOutsourcingOrderItems({ outsourcing_order_id: documentID, expected_version: version }, { signal })
      items = data.outsourcing_order_items
      break
    }
    default:
      throw new Error('单据产品参数无效')
  }
  return normalizeGalleryProducts(items)
}
