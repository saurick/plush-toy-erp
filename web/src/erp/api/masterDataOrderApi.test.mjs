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
  assert.match(source, /authScope:\s*AUTH_SCOPE\.ADMIN/)
})

test('masterDataOrderApi: masterdata methods cover customers suppliers contacts', () => {
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
    'list_contacts_by_owner',
    'create_contact',
    'update_contact',
    'set_primary_contact',
    'disable_contact',
  ]) {
    assert.match(source, new RegExp(`call\\('${methodName}'`))
  }
})

test('masterDataOrderApi: sales order methods do not expose shipment or finance actions', () => {
  for (const methodName of [
    'list_sales_orders',
    'create_sales_order',
    'update_sales_order',
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
    assert.match(source, new RegExp(`call\\('${methodName}'`))
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
