import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  listAllSourceDocumentItems,
  listSourceDocumentItemsAtVersion,
} from '../utils/sourceDocumentPagination.mjs'

const source = readFileSync(
  fileURLToPath(new URL('./masterDataOrderApi.mjs', import.meta.url)),
  'utf8'
)
const salesOrderPageSource = readFileSync(
  fileURLToPath(new URL('../pages/V1SalesOrdersPage.jsx', import.meta.url)),
  'utf8'
)
const masterDataPageSource = readFileSync(
  fileURLToPath(new URL('../pages/V1MasterDataPage.jsx', import.meta.url)),
  'utf8'
)
const masterDataPageConfigSource = readFileSync(
  fileURLToPath(
    new URL(
      '../components/master-data/masterDataPageConfig.mjs',
      import.meta.url
    )
  ),
  'utf8'
)

function sourceDocumentItems(start, count) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: start + index,
    line_status: 'open',
  }))
}

async function assertInvalidSourceDocumentPagination(run) {
  await assert.rejects(run, (error) => error?.isInvalidResponse === true)
}

async function assertSourceDocumentVersionConflict(run) {
  await assert.rejects(run, (error) => {
    assert.equal(error?.code, 40922)
    assert.equal(error?.message, '记录已被其他操作更新，请刷新后重试')
    assert.notEqual(error?.isInvalidResponse, true)
    return true
  })
}

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
    'save_customer_with_contacts',
    'get_customer',
    'set_customer_active',
    'list_suppliers',
    'create_supplier',
    'update_supplier',
    'save_supplier_with_contacts',
    'get_supplier',
    'set_supplier_active',
    'list_materials',
    'create_material',
    'update_material',
    'get_material',
    'set_material_active',
    'list_units',
    'list_warehouses',
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

test('V1MasterDataPage: owner and contacts save through backend aggregate API', () => {
  assert.match(masterDataPageConfigSource, /saveCustomerWithContacts/)
  assert.match(masterDataPageConfigSource, /saveSupplierWithContacts/)
  assert.match(masterDataPageSource, /saveWithContacts\(\{/)

  for (const functionName of [
    'createContact',
    'updateContact',
    'disableContact',
  ]) {
    assert.doesNotMatch(
      masterDataPageSource,
      new RegExp(`${functionName}\\s*\\(`)
    )
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

test('V1SalesOrdersPage: order form save uses single transaction API', () => {
  assert.match(salesOrderPageSource, /saveSalesOrderWithItems\(\{/)
  assert.match(
    salesOrderPageSource,
    /expected_version:\s*editingOrder\.version/
  )
  assert.match(salesOrderPageSource, /listAllSalesOrderItems/)

  for (const functionName of [
    'createSalesOrder',
    'updateSalesOrder',
    'addSalesOrderItem',
    'updateSalesOrderItem',
    'removeSalesOrderItem',
  ]) {
    assert.doesNotMatch(
      salesOrderPageSource,
      new RegExp(`${functionName}\\s*\\(`)
    )
  }
})

test('masterDataOrderApi: aggregate saves validate versioned responses and full-item pagination', () => {
  assert.match(source, /function validateSourceDocumentMutationResult\(/)
  assert.match(source, /Number\.isSafeInteger\(order\.version\)/)
  assert.match(source, /throw invalidSourceDocumentMutationResponse\(\)/)
  for (const [functionName, pageFunctionName] of [
    ['listAllSalesOrderItems', 'listSalesOrderItems'],
    ['listAllPurchaseOrderItems', 'listPurchaseOrderItems'],
    ['listAllOutsourcingOrderItems', 'listOutsourcingOrderItems'],
  ]) {
    assert.match(
      source,
      new RegExp(
        `export async function ${functionName}\\([\\s\\S]*?listSourceDocumentItemsAtVersion\\([\\s\\S]*?listAllSourceDocumentItems\\(\\s*${pageFunctionName}`
      )
    )
  }
})

test('all three source-document item wrappers share complete multi-page collection', async () => {
  for (const itemKey of [
    'sales_order_items',
    'purchase_order_items',
    'outsourcing_order_items',
  ]) {
    const requestedOffsets = []
    const options = { signal: new AbortController().signal }
    const result = await listAllSourceDocumentItems(
      async (params, receivedOptions) => {
        requestedOffsets.push(params.offset)
        assert.equal(receivedOptions, options)
        const page =
          params.offset === 0
            ? sourceDocumentItems(1, 200)
            : sourceDocumentItems(201, 1)
        return {
          [itemKey]: page,
          total: 201,
          limit: 200,
          offset: params.offset,
        }
      },
      { source_document_id: 7 },
      itemKey,
      options
    )

    assert.deepEqual(requestedOffsets, [0, 200], itemKey)
    assert.equal(result[itemKey].length, 201, itemKey)
    assert.equal(result.total, 201, itemKey)
    assert.equal(result.offset, 0, itemKey)
  }
})

test('source-document item pagination accepts total zero with an empty first page', async () => {
  for (const itemKey of [
    'sales_order_items',
    'purchase_order_items',
    'outsourcing_order_items',
  ]) {
    const result = await listAllSourceDocumentItems(
      async (params) => ({
        [itemKey]: [],
        total: 0,
        limit: 200,
        offset: params.offset,
      }),
      {},
      itemKey
    )
    assert.deepEqual(result[itemKey], [], itemKey)
    assert.equal(result.total, 0, itemKey)
  }
})

test('all three source-document item wrappers reject coerced pagination metadata', async () => {
  const invalidMetadataValues = [null, '', '0', true, false]
  for (const itemKey of [
    'sales_order_items',
    'purchase_order_items',
    'outsourcing_order_items',
  ]) {
    for (const field of ['total', 'limit', 'offset']) {
      for (const value of invalidMetadataValues) {
        await assertInvalidSourceDocumentPagination(() =>
          listAllSourceDocumentItems(
            async () => ({
              [itemKey]: [],
              total: field === 'total' ? value : 0,
              limit: field === 'limit' ? value : 200,
              offset: field === 'offset' ? value : 0,
            }),
            {},
            itemKey
          )
        )
      }
    }
  }
})

test('all three source-document item wrappers reject an oversized page', async () => {
  for (const itemKey of [
    'sales_order_items',
    'purchase_order_items',
    'outsourcing_order_items',
  ]) {
    await assertInvalidSourceDocumentPagination(() =>
      listAllSourceDocumentItems(
        async () => ({
          [itemKey]: sourceDocumentItems(1, 201),
          total: 201,
          limit: 200,
          offset: 0,
        }),
        {},
        itemKey
      )
    )
  }
})

test('all three source-document item wrappers reject non-numeric or invalid item identities', async () => {
  const invalidItemIDs = [
    '1',
    null,
    true,
    false,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0,
    -1,
    1.5,
  ]
  for (const itemKey of [
    'sales_order_items',
    'purchase_order_items',
    'outsourcing_order_items',
  ]) {
    for (const id of invalidItemIDs) {
      await assertInvalidSourceDocumentPagination(() =>
        listAllSourceDocumentItems(
          async () => ({
            [itemKey]: [{ id }],
            total: 1,
            limit: 200,
            offset: 0,
          }),
          {},
          itemKey
        )
      )
    }
  }
})

test('version-fenced source-document pagination accepts stable multi-page reads', async () => {
  let documentReads = 0
  const requestedOffsets = []
  const expectedDocument = { id: 7, version: 3 }
  const result = await listSourceDocumentItemsAtVersion({
    expectedDocument,
    getDocument: async () => {
      documentReads += 1
      return { ...expectedDocument }
    },
    listItems: () =>
      listAllSourceDocumentItems(
        async (params) => {
          requestedOffsets.push(params.offset)
          return {
            sales_order_items:
              params.offset === 0
                ? sourceDocumentItems(1, 200)
                : sourceDocumentItems(201, 1),
            total: 201,
            limit: 200,
            offset: params.offset,
          }
        },
        { sales_order_id: expectedDocument.id },
        'sales_order_items'
      ),
  })

  assert.equal(documentReads, 2)
  assert.deepEqual(requestedOffsets, [0, 200])
  assert.equal(result.sales_order_items.length, 201)
})

test('version-fenced source-document pagination classifies an after-read version change as a conflict', async () => {
  let documentReads = 0
  let itemReads = 0
  await assertSourceDocumentVersionConflict(() =>
    listSourceDocumentItemsAtVersion({
      expectedDocument: { id: 8, version: 4 },
      getDocument: async () => {
        documentReads += 1
        return { id: 8, version: documentReads === 1 ? 4 : 5 }
      },
      listItems: async () => {
        itemReads += 1
        return { purchase_order_items: [], total: 0 }
      },
    })
  )

  assert.equal(documentReads, 2)
  assert.equal(itemReads, 1)
})

test('version-fenced source-document pagination classifies before-read version drift as a conflict', async () => {
  let itemReads = 0
  await assertSourceDocumentVersionConflict(() =>
    listSourceDocumentItemsAtVersion({
      expectedDocument: { id: 9, version: 2 },
      getDocument: async () => ({ id: 9, version: 3 }),
      listItems: async () => {
        itemReads += 1
        return { outsourcing_order_items: [], total: 0 }
      },
    })
  )
  assert.equal(itemReads, 0)
})

test('version-fenced source-document pagination keeps malformed or wrong identities invalid', async () => {
  await assertInvalidSourceDocumentPagination(() =>
    listSourceDocumentItemsAtVersion({
      expectedDocument: { id: '9', version: 2 },
      getDocument: async () => ({ id: 9, version: 2 }),
      listItems: async () => [],
    })
  )

  for (const snapshot of [
    null,
    {},
    { id: '9', version: 2 },
    { id: 9, version: null },
    { id: 9, version: 0 },
    { id: 10, version: 2 },
  ]) {
    await assertInvalidSourceDocumentPagination(() =>
      listSourceDocumentItemsAtVersion({
        expectedDocument: { id: 9, version: 2 },
        getDocument: async () => snapshot,
        listItems: async () => [],
      })
    )
  }

  for (const snapshot of [
    { id: 9, version: null },
    { id: 10, version: 2 },
  ]) {
    let documentReads = 0
    await assertInvalidSourceDocumentPagination(() =>
      listSourceDocumentItemsAtVersion({
        expectedDocument: { id: 9, version: 2 },
        getDocument: async () => {
          documentReads += 1
          return documentReads === 1 ? { id: 9, version: 2 } : snapshot
        },
        listItems: async () => [],
      })
    )
  }
})

test('source-document item pagination rejects a short page before total is reached', async () => {
  await assertInvalidSourceDocumentPagination(() =>
    listAllSourceDocumentItems(
      async () => ({
        sales_order_items: sourceDocumentItems(1, 1),
        total: 2,
        limit: 200,
        offset: 0,
      }),
      {},
      'sales_order_items'
    )
  )
})

test('source-document item pagination rejects an empty page before total is reached', async () => {
  await assertInvalidSourceDocumentPagination(() =>
    listAllSourceDocumentItems(
      async () => ({
        purchase_order_items: [],
        total: 1,
        limit: 200,
        offset: 0,
      }),
      {},
      'purchase_order_items'
    )
  )
})

test('source-document item pagination rejects rows accumulated beyond total', async () => {
  await assertInvalidSourceDocumentPagination(() =>
    listAllSourceDocumentItems(
      async () => ({
        outsourcing_order_items: sourceDocumentItems(1, 2),
        total: 1,
        limit: 200,
        offset: 0,
      }),
      {},
      'outsourcing_order_items'
    )
  )
})

test('source-document item pagination rejects total drift between pages', async () => {
  await assertInvalidSourceDocumentPagination(() =>
    listAllSourceDocumentItems(
      async (params) => ({
        sales_order_items:
          params.offset === 0
            ? sourceDocumentItems(1, 200)
            : sourceDocumentItems(201, 1),
        total: params.offset === 0 ? 201 : 202,
        limit: 200,
        offset: params.offset,
      }),
      {},
      'sales_order_items'
    )
  )
})

test('source-document item pagination rejects a stalled response offset', async () => {
  await assertInvalidSourceDocumentPagination(() =>
    listAllSourceDocumentItems(
      async (params) => ({
        purchase_order_items:
          params.offset === 0
            ? sourceDocumentItems(1, 200)
            : sourceDocumentItems(201, 1),
        total: 201,
        limit: 200,
        offset: 0,
      }),
      {},
      'purchase_order_items'
    )
  )
})

test('source-document item pagination rejects duplicate item identities', async () => {
  await assertInvalidSourceDocumentPagination(() =>
    listAllSourceDocumentItems(
      async (params) => ({
        outsourcing_order_items:
          params.offset === 0
            ? sourceDocumentItems(1, 200)
            : sourceDocumentItems(200, 1),
        total: 201,
        limit: 200,
        offset: params.offset,
      }),
      {},
      'outsourcing_order_items'
    )
  )
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
