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

function dataOf(result) {
  return result?.data || {}
}

export async function listCustomers(params = {}) {
  const result = await masterDataRpc.call('list_customers', params)
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

export async function getCustomer(params = {}) {
  const result = await masterDataRpc.call('get_customer', params)
  return dataOf(result)?.customer || null
}

export async function setCustomerActive(params = {}) {
  const result = await masterDataRpc.call('set_customer_active', params)
  return dataOf(result)?.customer || null
}

export async function listSuppliers(params = {}) {
  const result = await masterDataRpc.call('list_suppliers', params)
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

export async function getSupplier(params = {}) {
  const result = await masterDataRpc.call('get_supplier', params)
  return dataOf(result)?.supplier || null
}

export async function setSupplierActive(params = {}) {
  const result = await masterDataRpc.call('set_supplier_active', params)
  return dataOf(result)?.supplier || null
}

export async function listContactsByOwner(params = {}) {
  const result = await masterDataRpc.call('list_contacts_by_owner', params)
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
