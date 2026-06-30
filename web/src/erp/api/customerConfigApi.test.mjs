import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const customerConfigApiSource = readFileSync(
  fileURLToPath(new URL('./customerConfigApi.mjs', import.meta.url)),
  'utf8'
)
const salesOrderPageConfigSource = readFileSync(
  fileURLToPath(
    new URL(
      '../components/sales-orders/salesOrderPageConfig.mjs',
      import.meta.url
    )
  ),
  'utf8'
)
const salesOrderPageSource = readFileSync(
  fileURLToPath(new URL('../pages/V1SalesOrdersPage.jsx', import.meta.url)),
  'utf8'
)

test('customerConfigApi: sales order acceptance submit uses explicit start and domain command APIs', () => {
  assert.match(
    customerConfigApiSource,
    /call\(\s*'start_sales_order_acceptance_process'/
  )
  assert.match(
    customerConfigApiSource,
    /call\(\s*'execute_sales_order_acceptance_submit'/
  )
  assert.match(customerConfigApiSource, /submitSalesOrderAcceptanceProcess/)
  assert.match(customerConfigApiSource, /process_instance_id/)
  assert.match(customerConfigApiSource, /process_node_instance_id/)
  assert.match(customerConfigApiSource, /expected_version/)
  assert.match(
    customerConfigApiSource,
    /sales-order-acceptance\/\$\{salesOrderID\}/
  )
})

test('V1SalesOrdersPage: sales order submit action enters acceptance workflow', () => {
  assert.match(salesOrderPageConfigSource, /submitSalesOrderAcceptanceProcess/)
  assert.match(
    salesOrderPageConfigSource,
    /successMessage:\s*'销售订单已提交，已进入老板审批'/
  )
  assert.match(salesOrderPageConfigSource, /returnsRecord:\s*false/)
  assert.doesNotMatch(salesOrderPageConfigSource, /submitSalesOrder,/)
  assert.match(salesOrderPageSource, /activeCustomerKey/)
  assert.match(salesOrderPageSource, /customer_key:\s*activeCustomerKey/)
  assert.match(salesOrderPageSource, /business_ref_no:\s*order\.order_no/)
})

test('V1SalesOrdersPage: process submit payload does not replace selected sales order', () => {
  assert.match(
    salesOrderPageSource,
    /action\.returnsRecord === false \? order : updated \|\| order/
  )
  assert.match(salesOrderPageSource, /setSelectedOrder\(nextSelectedOrder\)/)
})
