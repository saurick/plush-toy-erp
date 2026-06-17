import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./masterDataOrderApi.mjs', import.meta.url)),
  'utf8'
)

test('masterDataOrderApi: V1 API client uses 007 JSON-RPC urls', () => {
  assert.match(source, /url:\s*'masterdata'/)
  assert.match(source, /url:\s*'sales_order'/)
  assert.match(source, /url:\s*'purchase_order'/)
  assert.match(source, /url:\s*'outsourcing_order'/)
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('masterDataOrderApi: masterdata methods cover customers suppliers materials processes products sku contacts', () => {
  for (const methodName of [
    'list_customers',
    'create_customer',
    'update_customer',
    'get_customer',
    'set_customer_active',
    'list_suppliers',
    'create_supplier',
    'update_supplier',
    'get_supplier',
    'set_supplier_active',
    'list_materials',
    'create_material',
    'update_material',
    'get_material',
    'set_material_active',
    'list_processes',
    'create_process',
    'update_process',
    'get_process',
    'set_process_active',
    'list_products',
    'create_product',
    'update_product',
    'get_product',
    'set_product_active',
    'list_product_skus',
    'create_product_sku',
    'update_product_sku',
    'get_product_sku',
    'set_product_sku_active',
    'list_contacts_by_owner',
    'create_contact',
    'update_contact',
    'set_primary_contact',
    'disable_contact',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }
})

test('masterDataOrderApi: sales order methods do not expose shipment or finance actions', () => {
  for (const methodName of [
    'list_sales_orders',
    'create_sales_order',
    'update_sales_order',
    'save_sales_order_with_items',
    'get_sales_order',
    'submit_sales_order',
    'activate_sales_order',
    'close_sales_order',
    'cancel_sales_order',
    'list_sales_order_items',
    'add_sales_order_item',
    'update_sales_order_item',
    'remove_sales_order_item',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  const forbiddenActionNames = [
    ['ship', 'Sales', 'Order'],
    ['mark', 'As', 'Shipped'],
    ['generate', 'Invoice'],
    ['reserve', 'Stock'],
    ['deduct', 'Inventory'],
    ['receive', 'Payment'],
  ].map((parts) => parts.join(''))

  forbiddenActionNames.forEach((actionName) => {
    assert.doesNotMatch(source, new RegExp(actionName))
  })
})

test('masterDataOrderApi: purchase order methods do not expose receipt inventory or finance actions', () => {
  for (const methodName of [
    'list_purchase_orders',
    'save_purchase_order_with_items',
    'get_purchase_order',
    'submit_purchase_order',
    'approve_purchase_order',
    'close_purchase_order',
    'cancel_purchase_order',
    'list_purchase_order_items',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  const forbiddenActionNames = [
    ['post', 'Purchase', 'Receipt'],
    ['receive', 'Inventory'],
    ['deduct', 'Inventory'],
    ['generate', 'Payable'],
    ['generate', 'Invoice'],
    ['pay', 'Supplier'],
  ].map((parts) => parts.join(''))

  forbiddenActionNames.forEach((actionName) => {
    assert.doesNotMatch(source, new RegExp(actionName))
  })
})

test('masterDataOrderApi: outsourcing order methods keep contract lifecycle separate from facts', () => {
  for (const methodName of [
    'list_outsourcing_orders',
    'save_outsourcing_order_with_items',
    'get_outsourcing_order',
    'submit_outsourcing_order',
    'confirm_outsourcing_order',
    'close_outsourcing_order',
    'cancel_outsourcing_order',
    'list_outsourcing_order_items',
  ]) {
    assert.match(source, new RegExp(`call\\(\\s*'${methodName}'`))
  }

  const forbiddenActionNames = [
    ['post', 'Outsourcing', 'Fact'],
    ['issue', 'Material'],
    ['receive', 'Return'],
    ['generate', 'Payable'],
    ['pay', 'Supplier'],
    ['post', 'Inventory'],
  ].map((parts) => parts.join(''))

  forbiddenActionNames.forEach((actionName) => {
    assert.doesNotMatch(source, new RegExp(actionName))
  })
})
