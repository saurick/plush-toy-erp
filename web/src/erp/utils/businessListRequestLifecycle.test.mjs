import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { createLatestRequestCoordinator } from '../hooks/useLatestRequestCoordinator.js'

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function readSource(relativePath) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

const pageCases = [
  {
    title: '销售订单',
    path: '../pages/V1SalesOrdersPage.jsx',
    loader: 'loadOrders',
    requestKey: 'orders',
    listFunction: 'listSalesOrders',
  },
  {
    title: '采购订单',
    path: '../pages/V1PurchaseOrdersPage.jsx',
    loader: 'loadOrders',
    requestKey: 'orders',
    listFunction: 'listPurchaseOrders',
  },
  {
    title: '委外订单',
    path: '../pages/V1OutsourcingOrdersPage.jsx',
    loader: 'loadOrders',
    requestKey: 'orders',
    listFunction: 'listOutsourcingOrders',
  },
  {
    title: '采购入库',
    path: '../pages/V1PurchaseReceiptsPage.jsx',
    loader: 'loadRows',
    requestKey: 'rows',
    listFunction: 'listPurchaseReceipts',
  },
  {
    title: '出货',
    path: '../pages/ShipmentsPage.jsx',
    loader: 'loadRows',
    requestKey: 'rows',
    listFunction: 'listShipments',
  },
  {
    title: '来料质检',
    path: '../pages/V1QualityInspectionsPage.jsx',
    loader: 'loadRows',
    requestKey: 'rows',
    listFunction: 'listQualityInspections',
  },
]

test('business list request lifecycle: shared hook delegates begin and unmount cleanup', () => {
  const source = readSource('../hooks/useLatestRequestCoordinator.js')

  assert.match(source, /createLatestRequestCoordinator\(\)/)
  assert.match(source, /coordinatorRef\.current\.begin\(key\)/)
  assert.match(source, /coordinatorRef\.current\.abortAll\(\)/)
  assert.match(source, /return beginLatestRequest/)
})

test('business list request lifecycle: delayed stale response cannot overwrite latest rows or loading', async () => {
  const coordinator = createLatestRequestCoordinator()
  const firstDeferred = createDeferred()
  const secondDeferred = createDeferred()
  const appliedRows = []
  const visibleErrors = []
  let loading = true
  let loadingFinishes = 0

  const runRequest = async (request, deferred) => {
    try {
      const rows = await deferred.promise
      if (!request.isCurrent()) return
      appliedRows.push(rows)
    } catch (error) {
      if (request.signal.aborted || !request.isCurrent()) return
      visibleErrors.push(error.message)
    } finally {
      if (request.isCurrent()) {
        loading = false
        loadingFinishes += 1
        request.finish()
      }
    }
  }

  const firstRequest = coordinator.begin('rows')
  const firstRun = runRequest(firstRequest, firstDeferred)
  const secondRequest = coordinator.begin('rows')
  const secondRun = runRequest(secondRequest, secondDeferred)

  assert.equal(firstRequest.signal.aborted, true)
  assert.equal(firstRequest.isCurrent(), false)
  assert.equal(secondRequest.isCurrent(), true)

  secondDeferred.resolve(['latest'])
  await secondRun
  firstDeferred.reject(new Error('stale request failed'))
  await firstRun

  assert.deepEqual(appliedRows, [['latest']])
  assert.deepEqual(visibleErrors, [])
  assert.equal(loading, false)
  assert.equal(loadingFinishes, 1)

  const refreshRequest = coordinator.begin('rows')
  const anotherKeyRequest = coordinator.begin('sources')
  coordinator.abortAll()
  assert.equal(refreshRequest.signal.aborted, true)
  assert.equal(anotherKeyRequest.signal.aborted, true)
  assert.equal(refreshRequest.isCurrent(), false)
})

for (const pageCase of pageCases) {
  test(`business list request lifecycle: ${pageCase.title} only applies the latest list response`, () => {
    const source = readSource(pageCase.path)
    const loaderStart = source.indexOf(
      `const ${pageCase.loader} = useCallback(async () =>`
    )

    assert.ok(loaderStart >= 0, `${pageCase.path} must keep its list loader`)
    const loaderSource = source.slice(loaderStart)

    assert.match(
      source,
      /import useLatestRequestCoordinator from ['"]\.\.\/hooks\/useLatestRequestCoordinator\.js['"]/
    )
    assert.match(
      source,
      /const beginLatestRequest = useLatestRequestCoordinator\(\)/
    )
    assert.doesNotMatch(source, /const requestControllersRef = useRef/)
    assert.match(
      loaderSource,
      new RegExp(
        `const request = beginLatestRequest\\('${pageCase.requestKey}'\\)`
      )
    )
    assert.match(
      loaderSource,
      new RegExp(
        `${pageCase.listFunction}\\([\\s\\S]*?\\{ signal: request\\.signal \\}`
      )
    )
    assert.match(loaderSource, /if \(!request\.isCurrent\(\)\) \{\s*return/u)
    assert.match(
      loaderSource,
      /if \(isRpcAbortError\(error\) \|\| !request\.isCurrent\(\)\) \{\s*return/u
    )
    assert.match(
      loaderSource,
      /finally \{\s*if \(request\.isCurrent\(\)\) \{\s*setLoading\(false\)\s*request\.finish\(\)/u
    )
  })
}

test('business list request lifecycle: list API wrappers forward abort options to JSON-RPC', () => {
  const apiCases = [
    {
      path: '../api/masterDataOrderApi.mjs',
      functions: [
        'listSalesOrders',
        'listPurchaseOrders',
        'listOutsourcingOrders',
      ],
    },
    {
      path: '../api/purchaseApi.mjs',
      functions: ['listPurchaseReceipts'],
    },
    {
      path: '../api/operationalFactApi.mjs',
      functions: ['listShipments'],
    },
    {
      path: '../api/qualityApi.mjs',
      functions: ['listQualityInspections'],
    },
  ]

  for (const apiCase of apiCases) {
    const source = readSource(apiCase.path)
    for (const functionName of apiCase.functions) {
      const functionStart = source.indexOf(
        `export async function ${functionName}`
      )
      assert.ok(
        functionStart >= 0,
        `${apiCase.path} must export ${functionName}`
      )
      const functionSource = source.slice(functionStart, functionStart + 360)
      assert.match(functionSource, /params = \{\}, options = \{\}/)
      assert.match(functionSource, /\.call\([\s\S]*?params,\s*options\s*\)/u)
    }
  }
})
