import { AUTH_SCOPE } from '@/common/auth/auth'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { JsonRpc } from '@/common/utils/jsonRpc'

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

export async function listCustomers(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_customers', params, options)
  return dataOf(result)
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

export async function listUnits(params = {}, options = {}) {
  const result = await masterDataRpc.call('list_units', params, options)
  return dataOf(result)
}

export async function listWarehouses(params = {}) {
  const result = await masterDataRpc.call('list_warehouses', params)
  return dataOf(result)
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

export async function listSalesOrders(params = {}) {
  const result = await salesOrderRpc.call('list_sales_orders', params)
  return dataOf(result)
}

export async function createSalesOrder(params = {}) {
  const result = await salesOrderRpc.call('create_sales_order', params)
  return dataOf(result)?.sales_order || null
}

export async function updateSalesOrder(params = {}) {
  const result = await salesOrderRpc.call('update_sales_order', params)
  return dataOf(result)?.sales_order || null
}

export async function saveSalesOrderWithItems(params = {}) {
  const result = await salesOrderRpc.call('save_sales_order_with_items', params)
  return dataOf(result)
}

export async function getSalesOrder(params = {}) {
  const result = await salesOrderRpc.call('get_sales_order', params)
  return dataOf(result)?.sales_order || null
}

export async function submitSalesOrder(params = {}) {
  const result = await salesOrderRpc.call('submit_sales_order', params)
  return dataOf(result)?.sales_order || null
}

export async function activateSalesOrder(params = {}) {
  const result = await salesOrderRpc.call('activate_sales_order', params)
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

export async function listSalesOrderItems(params = {}) {
  const result = await salesOrderRpc.call('list_sales_order_items', params)
  return dataOf(result)
}

export async function addSalesOrderItem(params = {}) {
  const result = await salesOrderRpc.call('add_sales_order_item', params)
  return dataOf(result)?.sales_order_item || null
}

export async function updateSalesOrderItem(params = {}) {
  const result = await salesOrderRpc.call('update_sales_order_item', params)
  return dataOf(result)?.sales_order_item || null
}

export async function removeSalesOrderItem(params = {}) {
  const result = await salesOrderRpc.call('remove_sales_order_item', params)
  return dataOf(result)?.sales_order_item || null
}

export async function listPurchaseOrders(params = {}) {
  const result = await purchaseOrderRpc.call('list_purchase_orders', params)
  return dataOf(result)
}

export async function savePurchaseOrderWithItems(params = {}) {
  const result = await purchaseOrderRpc.call(
    'save_purchase_order_with_items',
    params
  )
  return dataOf(result)
}

export async function getPurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call('get_purchase_order', params)
  return dataOf(result)?.purchase_order || null
}

export async function submitPurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call('submit_purchase_order', params)
  return dataOf(result)?.purchase_order || null
}

export async function approvePurchaseOrder(params = {}) {
  const result = await purchaseOrderRpc.call('approve_purchase_order', params)
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

export async function listPurchaseOrderItems(params = {}) {
  const result = await purchaseOrderRpc.call(
    'list_purchase_order_items',
    params
  )
  return dataOf(result)
}

export async function listOutsourcingOrders(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'list_outsourcing_orders',
    params
  )
  return dataOf(result)
}

export async function getOutsourcingOrder(params = {}) {
  const result = await outsourcingOrderRpc.call('get_outsourcing_order', params)
  return dataOf(result)?.outsourcing_order || null
}

export async function saveOutsourcingOrderWithItems(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'save_outsourcing_order_with_items',
    params
  )
  return dataOf(result)
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

export async function listOutsourcingOrderItems(params = {}) {
  const result = await outsourcingOrderRpc.call(
    'list_outsourcing_order_items',
    params
  )
  return dataOf(result)
}
