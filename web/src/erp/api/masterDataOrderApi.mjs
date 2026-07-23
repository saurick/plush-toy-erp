import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

import {
  listAllSourceDocumentItems,
  listSourceDocumentItemsAtVersion,
  listSourceDocumentItemsPreview,
} from '../utils/sourceDocumentPagination.mjs'
import {
  listAllPaginatedRecords,
  listAllReferenceRecords,
} from '../utils/referencePagination.mjs'

const masterDataRpc = new JsonRpc({
  url: 'masterdata',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

const salesOrderRpc = new JsonRpc({
  url: 'sales_order',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

const purchaseOrderRpc = new JsonRpc({
  url: 'purchase_order',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

const outsourcingOrderRpc = new JsonRpc({
  url: 'outsourcing_order',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

function dataOf(result) {
  return result?.data || {}
}

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

export async function listCustomers(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_customers', params, options)
  return dataOf(result)
}

export async function listAllCustomers(params = {}, options = {}) {
  return listAllReferenceRecords(listCustomers, params, 'customers', options)
}

export async function createCustomer(params = {}) {
  const result = await masterDataRpc.call('create_customer', params)
  return dataOf(result)?.customer || null
}

export async function updateCustomer(params = {}) {
  const result = await masterDataRpc.call('update_customer', params)
  return dataOf(result)?.customer || null
}

export async function saveCustomerWithContacts(params = {}) {
  const result = await masterDataRpc.call('save_customer_with_contacts', params)
  return dataOf(result)
}

export async function getCustomer(params = {}) {
  const result = await masterDataRpc.call('get_customer', params)
  return dataOf(result)?.customer || null
}

export async function setCustomerActive(params = {}) {
  const result = await masterDataRpc.call('set_customer_active', params)
  return dataOf(result)?.customer || null
}

export async function listSuppliers(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_suppliers', params, options)
  return dataOf(result)
}

export async function listAllSuppliers(params = {}, options = {}) {
  return listAllReferenceRecords(listSuppliers, params, 'suppliers', options)
}

export async function createSupplier(params = {}) {
  const result = await masterDataRpc.call('create_supplier', params)
  return dataOf(result)?.supplier || null
}

export async function updateSupplier(params = {}) {
  const result = await masterDataRpc.call('update_supplier', params)
  return dataOf(result)?.supplier || null
}

export async function saveSupplierWithContacts(params = {}) {
  const result = await masterDataRpc.call('save_supplier_with_contacts', params)
  return dataOf(result)
}

export async function getSupplier(params = {}) {
  const result = await masterDataRpc.call('get_supplier', params)
  return dataOf(result)?.supplier || null
}

export async function setSupplierActive(params = {}) {
  const result = await masterDataRpc.call('set_supplier_active', params)
  return dataOf(result)?.supplier || null
}

export async function listMaterials(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_materials', params, options)
  return dataOf(result)
}

export async function listAllMaterials(params = {}, options = {}) {
  return listAllReferenceRecords(listMaterials, params, 'materials', options)
}

export async function listUnits(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_units', params, options)
  return dataOf(result)
}

export async function listAllUnits(params = {}, options = {}) {
  return listAllReferenceRecords(listUnits, params, 'units', options)
}

export async function listWarehouses(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_warehouses', params, options)
  return dataOf(result)
}

export async function listAllWarehouses(params = {}, options = {}) {
  return listAllReferenceRecords(listWarehouses, params, 'warehouses', options)
}

export async function createMaterial(params = {}) {
  const result = await masterDataRpc.call('create_material', params)
  return dataOf(result)?.material || null
}

export async function updateMaterial(params = {}) {
  const result = await masterDataRpc.call('update_material', params)
  return dataOf(result)?.material || null
}

export async function getMaterial(params = {}) {
  const result = await masterDataRpc.call('get_material', params)
  return dataOf(result)?.material || null
}

export async function setMaterialActive(params = {}) {
  const result = await masterDataRpc.call('set_material_active', params)
  return dataOf(result)?.material || null
}

export async function listProcesses(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_processes', params, options)
  return dataOf(result)
}

export async function listAllProcesses(params = {}, options = {}) {
  return listAllReferenceRecords(listProcesses, params, 'processes', options)
}

export async function createProcess(params = {}) {
  const result = await masterDataRpc.call('create_process', params)
  return dataOf(result)?.process || null
}

export async function updateProcess(params = {}) {
  const result = await masterDataRpc.call('update_process', params)
  return dataOf(result)?.process || null
}

export async function getProcess(params = {}) {
  const result = await masterDataRpc.call('get_process', params)
  return dataOf(result)?.process || null
}

export async function setProcessActive(params = {}) {
  const result = await masterDataRpc.call('set_process_active', params)
  return dataOf(result)?.process || null
}

export async function listProducts(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_products', params, options)
  return dataOf(result)
}

export async function listAllProducts(params = {}, options = {}) {
  return listAllReferenceRecords(listProducts, params, 'products', options)
}

export async function createProduct(params = {}) {
  const result = await masterDataRpc.call('create_product', params)
  return dataOf(result)?.product || null
}

export async function updateProduct(params = {}) {
  const result = await masterDataRpc.call('update_product', params)
  return dataOf(result)?.product || null
}

export async function getProduct(params = {}) {
  const result = await masterDataRpc.call('get_product', params)
  return dataOf(result)?.product || null
}

export async function setProductActive(params = {}) {
  const result = await masterDataRpc.call('set_product_active', params)
  return dataOf(result)?.product || null
}

export async function listProductSKUs(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_product_skus', params, options)
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
  const result = await masterDataRpc.call('create_product_sku', params)
  return dataOf(result)?.product_sku || null
}

export async function updateProductSKU(params = {}) {
  const result = await masterDataRpc.call('update_product_sku', params)
  return dataOf(result)?.product_sku || null
}

export async function getProductSKU(params = {}) {
  const result = await masterDataRpc.call('get_product_sku', params)
  return dataOf(result)?.product_sku || null
}

export async function setProductSKUActive(params = {}) {
  const result = await masterDataRpc.call('set_product_sku_active', params)
  return dataOf(result)?.product_sku || null
}

export async function listContactsByOwner(params = {}, options = {}) {
  const result = await masterDataRpc.call(
    'list_contacts_by_owner',
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
  const result = await masterDataRpc.call('create_contact', params)
  return dataOf(result)?.contact || null
}

export async function updateContact(params = {}) {
  const result = await masterDataRpc.call('update_contact', params)
  return dataOf(result)?.contact || null
}

export async function setPrimaryContact(params = {}) {
  const result = await masterDataRpc.call('set_primary_contact', params)
  return dataOf(result)?.contact || null
}

export async function disableContact(params = {}) {
  const result = await masterDataRpc.call('disable_contact', params)
  return dataOf(result)?.contact || null
}

export async function listSalesOrders(params = {}, options = {}) {
  const result = await salesOrderRpc.call('list_sales_orders', params, options)
  return dataOf(result)
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
  const result = await salesOrderRpc.call('save_sales_order_with_items', params)
  return validateSourceDocumentMutationResult(
    result,
    params,
    'sales_order',
    'sales_order_items'
  )
}

export async function getSalesOrder(params = {}, options = {}) {
  const result = await salesOrderRpc.call('get_sales_order', params, options)
  return dataOf(result)?.sales_order || null
}

export async function closeSalesOrder(params = {}) {
  const result = await salesOrderRpc.call('close_sales_order', params)
  return dataOf(result)?.sales_order || null
}

export async function cancelSalesOrder(params = {}) {
  const result = await salesOrderRpc.call('cancel_sales_order', params)
  return dataOf(result)?.sales_order || null
}

export async function listSalesOrderItems(params = {}, options = {}) {
  const result = await salesOrderRpc.call(
    'list_sales_order_items',
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

export async function listSalesOrderItemsPreview(params = {}, options = {}) {
  const itemParams = { ...params }
  delete itemParams.expected_version
  return listSourceDocumentItemsAtVersion({
    expectedDocument: {
      id: params.sales_order_id,
      version: params.expected_version,
    },
    getDocument: () => getSalesOrder({ id: params.sales_order_id }, options),
    listItems: () =>
      listSourceDocumentItemsPreview(
        listSalesOrderItems,
        itemParams,
        'sales_order_items',
        options
      ),
  })
}

export async function listPurchaseOrders(params = {}, options = {}) {
  const result = await purchaseOrderRpc.call(
    'list_purchase_orders',
    params,
    options
  )
  return dataOf(result)
}

export async function savePurchaseOrderWithItems(params = {}) {
  const result = await purchaseOrderRpc.call(
    'save_purchase_order_with_items',
    params
  )
  return validateSourceDocumentMutationResult(
    result,
    params,
    'purchase_order',
    'purchase_order_items'
  )
}

export async function getPurchaseOrder(params = {}, options = {}) {
  const result = await purchaseOrderRpc.call(
    'get_purchase_order',
    params,
    options
  )
  return dataOf(result)?.purchase_order || null
}

export async function submitPurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call('submit_purchase_order', params)
  return dataOf(result)?.purchase_order || null
}

export async function closePurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call('close_purchase_order', params)
  return dataOf(result)?.purchase_order || null
}

export async function cancelPurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call('cancel_purchase_order', params)
  return dataOf(result)?.purchase_order || null
}

export async function listPurchaseOrderItems(params = {}, options = {}) {
  const result = await purchaseOrderRpc.call(
    'list_purchase_order_items',
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

export async function listPurchaseOrderItemsPreview(params = {}, options = {}) {
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
      listSourceDocumentItemsPreview(
        listPurchaseOrderItems,
        itemParams,
        'purchase_order_items',
        options
      ),
  })
}

export async function listOutsourcingOrders(params = {}, options = {}) {
  const result = await outsourcingOrderRpc.call(
    'list_outsourcing_orders',
    params,
    options
  )
  return dataOf(result)
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
    'get_outsourcing_order',
    params,
    options
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function saveOutsourcingOrderWithItems(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'save_outsourcing_order_with_items',
    params
  )
  return validateSourceDocumentMutationResult(
    result,
    params,
    'outsourcing_order',
    'outsourcing_order_items'
  )
}

export async function submitOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'submit_outsourcing_order',
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function confirmOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'confirm_outsourcing_order',
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function closeOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'close_outsourcing_order',
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function cancelOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'cancel_outsourcing_order',
    params
  )
  return dataOf(result)?.outsourcing_order || null
}

export async function listOutsourcingOrderItems(params = {}, options = {}) {
  const result = await outsourcingOrderRpc.call(
    'list_outsourcing_order_items',
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

export async function listOutsourcingOrderItemsPreview(
  params = {},
  options = {}
) {
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
      listSourceDocumentItemsPreview(
        listOutsourcingOrderItems,
        itemParams,
        'outsourcing_order_items',
        options
      ),
  })
}
