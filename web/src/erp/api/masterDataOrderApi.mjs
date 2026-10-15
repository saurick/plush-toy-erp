import { RpcDomain, RpcMethod } from '../../common/consts/rpcMethods.generated.mjs'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc, requireRpcData as dataOf } from '@/common/utils/jsonRpc'

import {
  listAllSourceDocumentItems,
  listSourceDocumentItemsAtVersion,
} from '../utils/sourceDocumentPagination.mjs'
import {
  listAllPaginatedRecords,
  listAllReferenceRecords,
} from '../utils/referencePagination.mjs'
import { validatePurchaseOrderReceiptProgress } from '../utils/purchaseOrderInboundPreview.mjs'

const masterDataRpc = new JsonRpc({
  url: RpcDomain.MASTERDATA,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

const salesOrderRpc = new JsonRpc({
  url: RpcDomain.SALES_ORDER,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

export async function getEngineeringMaterialRequest(params, options = {}) {
  return dataOf(
    await salesOrderRpc.call(
      RpcMethod.sales_order.GET_ENGINEERING_MATERIAL_REQUEST,
      params,
      options
    )
  )
}
export async function listEngineeringMaterialRequests(params, options = {}) {
  return dataOf(
    await salesOrderRpc.call(
      RpcMethod.sales_order.LIST_ENGINEERING_MATERIAL_REQUESTS,
      params,
      options
    )
  )
}
export async function submitEngineeringMaterialRequest(params) {
  return dataOf(
    await salesOrderRpc.call(RpcMethod.sales_order.SUBMIT_ENGINEERING_MATERIAL_REQUEST, params)
  )
}
export async function reviewEngineeringMaterialRequest(params, stage) {
  const method =
    stage === 'boss'
      ? 'boss_review_engineering_material_request'
      : 'finance_review_engineering_material_request'
  return dataOf(await salesOrderRpc.call(method, params))
}

const purchaseOrderRpc = new JsonRpc({
  url: RpcDomain.PURCHASE_ORDER,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

const outsourcingOrderRpc = new JsonRpc({
  url: RpcDomain.OUTSOURCING_ORDER,
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function invalidSourceDocumentMutationResponse() {
  const error = new Error('服务器返回的单据信息不完整，请核对后重试')
  error.isInvalidResponse = true
  return error
}

function validateSourceDocumentMutationResult(
  result,
  params,
  orderKey,
  itemKey
) {
  const data = dataOf(result)
  const order = data?.[orderKey]
  const expectedID = Number(params?.id || 0)
  if (
    !data ||
    typeof data !== 'object' ||
    !order ||
    typeof order !== 'object' ||
    !Number.isSafeInteger(order.id) ||
    order.id <= 0 ||
    !Number.isSafeInteger(order.version) ||
    order.version <= 0 ||
    (expectedID > 0 && order.id !== expectedID) ||
    !Array.isArray(data[itemKey])
  ) {
    throw invalidSourceDocumentMutationResponse()
  }
  return data
}

function validateSourceDocumentReorderResult(
  result,
  params,
  orderKey,
  itemKey
) {
  const data = validateSourceDocumentMutationResult(
    result,
    params,
    orderKey,
    itemKey
  )
  const expectedVersion = Number(params?.expected_version || 0)
  const expectedItemIDs = Array.isArray(params?.item_ids)
    ? params.item_ids.map(Number)
    : []
  const order = data[orderKey]
  const openItemIDs = data[itemKey]
    .filter(
      (item) =>
        String(item?.line_status || '')
          .trim()
          .toLowerCase() === 'open'
    )
    .map((item) => Number(item?.id || 0))
  if (
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion <= 0 ||
    !Number.isSafeInteger(order.version) ||
    order.version !== expectedVersion + 1 ||
    expectedItemIDs.length === 0 ||
    expectedItemIDs.some(
      (itemID, index) =>
        !Number.isSafeInteger(itemID) ||
        itemID <= 0 ||
        expectedItemIDs.indexOf(itemID) !== index
    ) ||
    openItemIDs.length !== expectedItemIDs.length ||
    openItemIDs.some((itemID, index) => itemID !== expectedItemIDs[index])
  ) {
    throw invalidSourceDocumentMutationResponse()
  }
  return data
}

export async function listCustomers(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_CUSTOMERS, params, options)
  return dataOf(result)
}

export async function listAllCustomers(params = {}, options = {}) {
  return listAllReferenceRecords(listCustomers, params, 'customers', options)
}

export async function createCustomer(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.CREATE_CUSTOMER, params)
  return dataOf(result)?.customer || null
}

export async function updateCustomer(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.UPDATE_CUSTOMER, params)
  return dataOf(result)?.customer || null
}

export async function saveCustomerWithContacts(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SAVE_CUSTOMER_WITH_CONTACTS, params)
  return dataOf(result)
}

export async function getCustomer(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.GET_CUSTOMER, params)
  return dataOf(result)?.customer || null
}

export async function setCustomerActive(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SET_CUSTOMER_ACTIVE, params)
  return dataOf(result)?.customer || null
}

export async function listSuppliers(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_SUPPLIERS, params, options)
  return dataOf(result)
}

export async function listAllSuppliers(params = {}, options = {}) {
  return listAllReferenceRecords(listSuppliers, params, 'suppliers', options)
}

export async function createSupplier(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.CREATE_SUPPLIER, params)
  return dataOf(result)?.supplier || null
}

export async function updateSupplier(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.UPDATE_SUPPLIER, params)
  return dataOf(result)?.supplier || null
}

export async function saveSupplierWithContacts(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SAVE_SUPPLIER_WITH_CONTACTS, params)
  return dataOf(result)
}

export async function getSupplier(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.GET_SUPPLIER, params)
  return dataOf(result)?.supplier || null
}

export async function setSupplierActive(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SET_SUPPLIER_ACTIVE, params)
  return dataOf(result)?.supplier || null
}

export async function listMaterials(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_MATERIALS, params, options)
  return dataOf(result)
}

export async function listAllMaterials(params = {}, options = {}) {
  return listAllReferenceRecords(listMaterials, params, 'materials', options)
}

export async function listUnits(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_UNITS, params, options)
  return dataOf(result)
}

export async function listAllUnits(params = {}, options = {}) {
  return listAllReferenceRecords(listUnits, params, 'units', options)
}

export async function listWarehouses(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_WAREHOUSES, params, options)
  return dataOf(result)
}

export async function listAllWarehouses(params = {}, options = {}) {
  return listAllReferenceRecords(listWarehouses, params, 'warehouses', options)
}

export async function listAllMaterialWarehouses(params = {}, options = {}) {
  return listAllReferenceRecords(
    async (page, requestOptions) =>
      dataOf(
        await masterDataRpc.call(
          RpcMethod.masterdata.LIST_MATERIAL_WAREHOUSES,
          page,
          requestOptions
        )
      ),
    params,
    'warehouses',
    options
  )
}

export async function createWarehouse(params) {
  return dataOf(await masterDataRpc.call(RpcMethod.masterdata.CREATE_WAREHOUSE, params))?.warehouse
}

export async function updateWarehouse(params) {
  return dataOf(await masterDataRpc.call(RpcMethod.masterdata.UPDATE_WAREHOUSE, params))?.warehouse
}

export async function createMaterial(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.CREATE_MATERIAL, params)
  return dataOf(result)?.material || null
}

export async function updateMaterial(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.UPDATE_MATERIAL, params)
  return dataOf(result)?.material || null
}

export async function getMaterial(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.GET_MATERIAL, params)
  return dataOf(result)?.material || null
}

export async function setMaterialActive(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SET_MATERIAL_ACTIVE, params)
  return dataOf(result)?.material || null
}

export async function listProcesses(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_PROCESSES, params, options)
  return dataOf(result)
}

export async function listAllProcesses(params = {}, options = {}) {
  return listAllReferenceRecords(listProcesses, params, 'processes', options)
}

export async function createProcess(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.CREATE_PROCESS, params)
  return dataOf(result)?.process || null
}

export async function updateProcess(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.UPDATE_PROCESS, params)
  return dataOf(result)?.process || null
}

export async function getProcess(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.GET_PROCESS, params)
  return dataOf(result)?.process || null
}

export async function setProcessActive(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SET_PROCESS_ACTIVE, params)
  return dataOf(result)?.process || null
}

export async function listProducts(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_PRODUCTS, params, options)
  return dataOf(result)
}

export async function listAllProducts(params = {}, options = {}) {
  return listAllReferenceRecords(listProducts, params, 'products', options)
}

export async function createProduct(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.CREATE_PRODUCT, params)
  return dataOf(result)?.product || null
}

export async function updateProduct(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.UPDATE_PRODUCT, params)
  return dataOf(result)?.product || null
}

export async function getProduct(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.GET_PRODUCT, params)
  return dataOf(result)?.product || null
}

export async function setProductActive(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SET_PRODUCT_ACTIVE, params)
  return dataOf(result)?.product || null
}

export async function listProductSKUs(params = {}, options = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.LIST_PRODUCT_SKUS, params, options)
  return dataOf(result)
}

export async function listAllProductSKUs(params = {}, options = {}) {
  return listAllReferenceRecords(
    listProductSKUs,
    params,
    'product_skus',
    options
  )
}

export async function createProductSKU(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.CREATE_PRODUCT_SKU, params)
  return dataOf(result)?.product_sku || null
}

export async function updateProductSKU(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.UPDATE_PRODUCT_SKU, params)
  return dataOf(result)?.product_sku || null
}

export async function getProductSKU(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.GET_PRODUCT_SKU, params)
  return dataOf(result)?.product_sku || null
}

export async function setProductSKUActive(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SET_PRODUCT_SKU_ACTIVE, params)
  return dataOf(result)?.product_sku || null
}

export async function listContactsByOwner(params = {}, options = {}) {
  const result = await masterDataRpc.call(
    RpcMethod.masterdata.LIST_CONTACTS_BY_OWNER,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllContactsByOwner(params = {}, options = {}) {
  return listAllReferenceRecords(
    listContactsByOwner,
    params,
    'contacts',
    options
  )
}

export async function createContact(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.CREATE_CONTACT, params)
  return dataOf(result)?.contact || null
}

export async function updateContact(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.UPDATE_CONTACT, params)
  return dataOf(result)?.contact || null
}

export async function setPrimaryContact(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.SET_PRIMARY_CONTACT, params)
  return dataOf(result)?.contact || null
}

export async function disableContact(params = {}) {
  const result = await masterDataRpc.call(RpcMethod.masterdata.DISABLE_CONTACT, params)
  return dataOf(result)?.contact || null
}

export async function listSalesOrders(params = {}, options = {}) {
  const result = await salesOrderRpc.call(RpcMethod.sales_order.LIST_SALES_ORDERS, params, options)
  return dataOf(result)
}

export async function listSalesOrderSummary(params = {}, options = {}) {
  const result = await salesOrderRpc.call(RpcMethod.sales_order.LIST_SALES_ORDER_SUMMARY, params, options)
  return dataOf(result)
}

export async function listAllSalesOrderSummary(params = {}, options = {}) {
  return listAllPaginatedRecords(listSalesOrderSummary, params, 'items', options, {
    invalidResponseMessage: '服务器返回的销售汇总不完整，请刷新后重试',
  })
}

export async function listAllSalesOrders(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listSalesOrders,
    params,
    'sales_orders',
    options,
    {
      invalidResponseMessage: '服务器返回的销售订单列表不完整，请刷新后重试',
    }
  )
}

export async function saveSalesOrderWithItems(params = {}) {
  const result = await salesOrderRpc.call(RpcMethod.sales_order.SAVE_SALES_ORDER_WITH_ITEMS, params)
  return validateSourceDocumentMutationResult(
    result,
    params,
    'sales_order',
    'sales_order_items'
  )
}

export async function reorderSalesOrderItems(params = {}) {
  const result = await salesOrderRpc.call(RpcMethod.sales_order.REORDER_SALES_ORDER_ITEMS, params)
  return validateSourceDocumentReorderResult(
    result,
    params,
    'sales_order',
    'sales_order_items'
  )
}

export async function getSalesOrder(params = {}, options = {}) {
  const result = await salesOrderRpc.call(RpcMethod.sales_order.GET_SALES_ORDER, params, options)
  return dataOf(result)?.sales_order || null
}

export async function saveSalesOrderEngineering(params = {}) {
  const result = await salesOrderRpc.call(
    RpcMethod.sales_order.SAVE_SALES_ORDER_ENGINEERING,
    params
  )
  return dataOf(result)
}

export async function closeSalesOrder(params = {}) {
  const result = await salesOrderRpc.call(RpcMethod.sales_order.CLOSE_SALES_ORDER, params)
  return dataOf(result)?.sales_order || null
}

export async function cancelSalesOrder(params = {}) {
  const result = await salesOrderRpc.call(RpcMethod.sales_order.CANCEL_SALES_ORDER, params)
  return dataOf(result)?.sales_order || null
}

export async function listSalesOrderItems(params = {}, options = {}) {
  const result = await salesOrderRpc.call(
    RpcMethod.sales_order.LIST_SALES_ORDER_ITEMS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllSalesOrderItems(params = {}, options = {}) {
  const itemParams = { ...params }
  delete itemParams.expected_version
  return listSourceDocumentItemsAtVersion({
    expectedDocument: {
      id: params.sales_order_id,
      version: params.expected_version,
    },
    getDocument: () => getSalesOrder({ id: params.sales_order_id }, options),
    listItems: () =>
      listAllSourceDocumentItems(
        listSalesOrderItems,
        itemParams,
        'sales_order_items',
        options
      ),
  })
}

export async function listPurchaseOrders(params = {}, options = {}) {
  const result = await purchaseOrderRpc.call(
    RpcMethod.purchase_order.LIST_PURCHASE_ORDERS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllPurchaseOrders(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listPurchaseOrders,
    params,
    'purchase_orders',
    options,
    {
      invalidResponseMessage: '服务器返回的采购订单列表不完整，请刷新后重试',
    }
  )
}

export async function savePurchaseOrderWithItems(params = {}) {
  const result = await purchaseOrderRpc.call(
    RpcMethod.purchase_order.SAVE_PURCHASE_ORDER_WITH_ITEMS,
    params
  )
  return validateSourceDocumentMutationResult(
    result,
    params,
    'purchase_order',
    'purchase_order_items'
  )
}

export async function reorderPurchaseOrderItems(params = {}) {
  const result = await purchaseOrderRpc.call(
    RpcMethod.purchase_order.REORDER_PURCHASE_ORDER_ITEMS,
    params
  )
  return validateSourceDocumentReorderResult(
    result,
    params,
    'purchase_order',
    'purchase_order_items'
  )
}

export async function getPurchaseOrder(params = {}, options = {}) {
  const result = await purchaseOrderRpc.call(
    RpcMethod.purchase_order.GET_PURCHASE_ORDER,
    params,
    options
  )
  return dataOf(result)?.purchase_order || null
}

export async function getPurchaseOrderReceiptProgress(
  params = {},
  options = {}
) {
  const result = await purchaseOrderRpc.call(
    RpcMethod.purchase_order.GET_PURCHASE_ORDER_RECEIPT_PROGRESS,
    params,
    options
  )
  return validatePurchaseOrderReceiptProgress(
    dataOf(result)?.purchase_order_receipt_progress,
    Number(params?.id || 0)
  )
}

export async function closePurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call(RpcMethod.purchase_order.CLOSE_PURCHASE_ORDER, params)
  return dataOf(result)?.purchase_order || null
}

export async function cancelPurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call(RpcMethod.purchase_order.CANCEL_PURCHASE_ORDER, params)
  return dataOf(result)?.purchase_order || null
}

export async function listPurchaseOrderItems(params = {}, options = {}) {
  const result = await purchaseOrderRpc.call(
    RpcMethod.purchase_order.LIST_PURCHASE_ORDER_ITEMS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllPurchaseOrderItems(params = {}, options = {}) {
  const itemParams = { ...params }
  delete itemParams.expected_version
  return listSourceDocumentItemsAtVersion({
    expectedDocument: {
      id: params.purchase_order_id,
      version: params.expected_version,
    },
    getDocument: () =>
      getPurchaseOrder({ id: params.purchase_order_id }, options),
    listItems: () =>
      listAllSourceDocumentItems(
        listPurchaseOrderItems,
        itemParams,
        'purchase_order_items',
        options
      ),
  })
}

export async function listOutsourcingOrders(params = {}, options = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.LIST_OUTSOURCING_ORDERS,
    params,
    options
  )
  return dataOf(result)
}

export async function listOutsourcingOrderSummary(params = {}, options = {}) {
  const result = await outsourcingOrderRpc.call(RpcMethod.outsourcing_order.LIST_OUTSOURCING_ORDER_SUMMARY, params, options)
  return dataOf(result)
}

export async function listAllOutsourcingOrderSummary(params = {}, options = {}) {
  return listAllPaginatedRecords(listOutsourcingOrderSummary, params, 'items', options)
}

export async function listAllOutsourcingOrders(params = {}, options = {}) {
  return listAllPaginatedRecords(
    listOutsourcingOrders,
    params,
    'outsourcing_orders',
    options,
    {
      invalidResponseMessage: '服务器返回的加工合同列表不完整，请刷新后重试',
    }
  )
}

export async function getOutsourcingOrder(params = {}, options = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.GET_OUTSOURCING_ORDER,
    params,
    options
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function saveOutsourcingOrderWithItems(params = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.SAVE_OUTSOURCING_ORDER_WITH_ITEMS,
    params
  )
  return validateSourceDocumentMutationResult(
    result,
    params,
    'outsourcing_order',
    'outsourcing_order_items'
  )
}

export async function reorderOutsourcingOrderItems(params = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.REORDER_OUTSOURCING_ORDER_ITEMS,
    params
  )
  return validateSourceDocumentReorderResult(
    result,
    params,
    'outsourcing_order',
    'outsourcing_order_items'
  )
}

export async function submitOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.SUBMIT_OUTSOURCING_ORDER,
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function confirmOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.CONFIRM_OUTSOURCING_ORDER,
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function closeOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.CLOSE_OUTSOURCING_ORDER,
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function cancelOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.CANCEL_OUTSOURCING_ORDER,
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function listOutsourcingOrderItems(params = {}, options = {}) {
  const result = await outsourcingOrderRpc.call(
    RpcMethod.outsourcing_order.LIST_OUTSOURCING_ORDER_ITEMS,
    params,
    options
  )
  return dataOf(result)
}

export async function listAllOutsourcingOrderItems(params = {}, options = {}) {
  const itemParams = { ...params }
  delete itemParams.expected_version
  return listSourceDocumentItemsAtVersion({
    expectedDocument: {
      id: params.outsourcing_order_id,
      version: params.expected_version,
    },
    getDocument: () =>
      getOutsourcingOrder({ id: params.outsourcing_order_id }, options),
    listItems: () =>
      listAllSourceDocumentItems(
        listOutsourcingOrderItems,
        itemParams,
        'outsourcing_order_items',
        options
      ),
  })
}
