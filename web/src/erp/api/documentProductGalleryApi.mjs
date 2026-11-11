import { getSalesOrder, listAllSalesOrderItems } from './masterDataOrderApi.mjs'
import { listDocumentProductPreviews } from './attachmentApi.mjs'
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
      const rows = await listDocumentProductPreviews({
        source_type: source,
        document_ids: [documentID],
        include_products: true,
        ...(expectedVersion == null ? {} : { expected_version: expectedVersion }),
      }, { signal })
      const [preview] = rows
      const products = normalizeGalleryProducts(preview?.products)
      if (rows.length !== 1 || preview?.document_id !== documentID || !Array.isArray(preview.products) || products.length !== preview.products.length || products.length !== preview.product_count) {
        throw new Error('单据产品数据不完整，请重新读取')
      }
      return products
    }
    default:
      throw new Error('单据产品参数无效')
  }
  return normalizeGalleryProducts(items)
}
