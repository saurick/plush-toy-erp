import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import {
  buildReleaseReadinessPaths,
  compileReleaseRuntimeManifestTo,
  createDevCustomerConfigMiddleware,
  createDevCustomerConfigService,
  listReleaseBatches,
} from './devCustomerImportDryRunPlugin.mjs'
import {
  createOrReuseDevCustomerConfigOperation,
  readDevCustomerConfigOperation,
  recoverInterruptedDevCustomerConfigOperations,
  resolveDevCustomerConfigOperationStore,
  transitionDevCustomerConfigOperation,
} from '../../scripts/qa/dev-customer-config-operation-store.mjs'

const CSRF_TOKEN = 'customer-config-csrf-token'
const IDEMPOTENCY = Object.freeze({
  dryRun:
    'customer-config:dry-run:yoyoosun:11111111-1111-4111-8111-111111111111',
  runtimeManifest:
    'customer-config:runtime-manifest:yoyoosun:22222222-2222-4222-8222-222222222222',
  releaseReadiness:
    'customer-config:release-readiness:yoyoosun:33333333-3333-4333-8333-333333333333',
  concurrentDryRun:
    'customer-config:dry-run:yoyoosun:44444444-4444-4444-8444-444444444444',
})

function invoke(
  handler,
  {
    method = 'GET',
    url = '/',
    body,
    headers = {},
    remoteAddress = '127.0.0.1',
  } = {}
) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(
      body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
    )
    req.method = method
    req.url = url
    req.headers = {
      host: '127.0.0.1:5175',
      ...(method === 'POST'
        ? {
            origin: 'http://127.0.0.1:5175',
            'sec-fetch-site': 'same-origin',
            'content-type': 'application/json',
            'x-csrf-token': CSRF_TOKEN,
          }
        : {}),
      ...headers,
    }
    req.socket = { remoteAddress }
    req.on('error', reject)
    const responseHeaders = {}
    const res = {
      statusCode: 200,
      setHeader(name, value) {
        responseHeaders[name.toLowerCase()] = value
      },
      end(raw = '') {
        resolve({
          statusCode: res.statusCode,
          headers: responseHeaders,
          body: raw ? JSON.parse(raw) : null,
        })
      },
    }
    Promise.resolve(
      handler(req, res, () => {
        res.statusCode = 599
        res.end('')
      })
    ).catch(reject)
  })
}

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plush-customer-config-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test('release readiness paths bind one explicit registered batch', () => {
  assert.deepEqual(buildReleaseReadinessPaths('yoyoosun', '2026-07-11'), {
    releaseBatch: '2026-07-11',
    evidenceDir: path.join(
      'deployments',
      'yoyoosun',
      'evidence',
      'releases',
      '2026-07-11'
    ),
    manifestPath: path.join(
      'output',
      'customers',
      'yoyoosun',
      'customer-config-runtime-manifest.ui-release.2026-07-11.json'
    ),
  })
  assert.throws(
    () => buildReleaseReadinessPaths('yoyoosun', '../2026-07-11'),
    /Invalid release batch/u
  )
  assert.throws(
    () => buildReleaseReadinessPaths('yoyoosun', ''),
    /Invalid release batch/u
  )
})

test('release batch listing returns only direct date directories, newest first', async (t) => {
  const projectRoot = await temporaryRoot(t)
  const releaseRoot = path.join(
    projectRoot,
    'deployments',
    'yoyoosun',
    'evidence',
    'releases'
  )
  await mkdir(path.join(releaseRoot, '2026-07-03'), { recursive: true })
  await mkdir(path.join(releaseRoot, '2026-07-11'))
  await mkdir(path.join(releaseRoot, 'latest'))
  await writeFile(path.join(releaseRoot, '2026-07-12'), 'not a directory')
  assert.deepEqual(await listReleaseBatches(projectRoot, 'yoyoosun'), [
    '2026-07-11',
    '2026-07-03',
  ])
})

test('release readiness compiles the formal release manifest before checking evidence', async (t) => {
  const projectRoot = await temporaryRoot(t)
  const outPath = path.join(
    'output',
    'customers',
    'yoyoosun',
    'customer-config-runtime-manifest.ui-release.2026-07-11.json'
  )
  let temporaryOutPath = ''
  const result = await compileReleaseRuntimeManifestTo(
    projectRoot,
    'yoyoosun',
    outPath,
    {
      commandRunner: async (command, args, options) => {
        assert.equal(command, process.execPath)
        assert.equal(options.cwd, projectRoot)
        assert.equal(args[args.indexOf('--mode') + 1], 'compile')
        temporaryOutPath = args[args.indexOf('--out') + 1]
        assert.notEqual(temporaryOutPath, outPath)
        const absoluteTemporaryOutPath = path.join(
          projectRoot,
          temporaryOutPath
        )
        await mkdir(path.dirname(absoluteTemporaryOutPath), {
          recursive: true,
        })
        await writeFile(
          absoluteTemporaryOutPath,
          JSON.stringify({
            revision: 'yoyoosun-customer-package-v9.runtime-manifest-v1',
            product_version: 'customer-test-v1',
            module_states: [],
            role_profiles: [],
            access_entitlements: [],
            work_pools: [],
            work_pool_memberships: [],
            compiled_snapshot: { pages: [] },
          })
        )
        return { stdout: '', stderr: '' }
      },
    }
  )

  assert.equal(result.manifestPath, outPath)
  assert.equal(result.summary.revision, result.manifest.revision)
  assert.equal(
    JSON.parse(await readFile(path.join(projectRoot, outPath), 'utf8'))
      .revision,
    result.manifest.revision
  )
  await assert.rejects(readFile(path.join(projectRoot, temporaryOutPath)), {
    code: 'ENOENT',
  })
})

test('operation recovery scans the complete store and oversized results cannot replace the last valid state', async (t) => {
  const root = await temporaryRoot(t)
  const store = resolveDevCustomerConfigOperationStore(root)
  const created = []
  for (let index = 0; index < 101; index += 1) {
    const uuid = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    created.push(
      createOrReuseDevCustomerConfigOperation(store, {
        action: 'dry-run',
        customerKey: 'yoyoosun',
        idempotencyKey: `customer-config:dry-run:yoyoosun:${uuid}`,
        now: new Date(Date.UTC(2026, 8, 25, 1, 0, index)).toISOString(),
      }).operation
    )
  }

  assert.equal(
    recoverInterruptedDevCustomerConfigOperations(
      store,
      '2026-09-25T03:00:00.000Z'
    ).length,
    101
  )
  assert.equal(
    readDevCustomerConfigOperation(store, created[0].id).status,
    'not_proven'
  )
  assert.equal(
    readDevCustomerConfigOperation(store, created.at(-1).id).status,
    'not_proven'
  )

  const oversized = createOrReuseDevCustomerConfigOperation(store, {
    action: 'dry-run',
    customerKey: 'yoyoosun',
    idempotencyKey:
      'customer-config:dry-run:yoyoosun:55555555-5555-4555-8555-555555555555',
    now: '2026-09-25T03:00:01.000Z',
  }).operation
  assert.throws(
    () =>
      transitionDevCustomerConfigOperation(store, oversized.id, {
        status: 'passed',
        message: 'oversized result',
        result: { details: 'x'.repeat(300 * 1024) },
        now: '2026-09-25T03:00:02.000Z',
      }),
    /too large/u
  )
  assert.equal(
    readDevCustomerConfigOperation(store, oversized.id).status,
    'running'
  )
})

test('middleware rejects LAN callers and requires same-origin CSRF for every POST bridge', async () => {
  let actions = 0
  const middleware = createDevCustomerConfigMiddleware({
    csrfToken: CSRF_TOKEN,
    service: {
      async releaseBatches() {
        return []
      },
      operations() {
        return []
      },
      async act() {
        actions += 1
        return { statusCode: 200, payload: { status: 'success' } }
      },
    },
  })

  const remote = await invoke(middleware, {
    url: '/__dev/api/customer-config/session',
    remoteAddress: '192.168.0.20',
  })
  assert.equal(remote.statusCode, 403)

  const session = await invoke(middleware, {
    url: '/__dev/api/customer-config/session',
  })
  assert.equal(session.statusCode, 200)
  assert.equal(session.body.csrfToken, CSRF_TOKEN)
  assert.equal(session.headers['cache-control'], 'no-store')
  assert.equal(session.headers['x-content-type-options'], 'nosniff')

  const missingCsrf = await invoke(middleware, {
    method: 'POST',
    url: '/__dev/api/customer-import/dry-run',
    headers: { 'x-csrf-token': '' },
    body: {
      customerKey: 'yoyoosun',
      idempotencyKey: IDEMPOTENCY.dryRun,
    },
  })
  assert.equal(missingCsrf.statusCode, 403)
  assert.equal(actions, 0)
})

test('release readiness requires a registered batch and persists a terminal operation', async (t) => {
  const root = await temporaryRoot(t)
  const calls = []
  const service = createDevCustomerConfigService({
    projectRoot: root,
    releaseBatchLister: async () => ['2026-07-11'],
    releaseReadinessRunner: async (projectRoot, customerKey, releaseBatch) => {
      calls.push({ projectRoot, customerKey, releaseBatch })
      return {
        status: 'ready',
        customerKey,
        releaseBatch,
        generatedAt: '2026-09-25T01:00:00.000Z',
        manifestPath: 'output/runtime.json',
        evidenceDir: `deployments/${customerKey}/evidence/releases/${releaseBatch}`,
        summary: { revision: 'v1' },
        missing: [],
      }
    },
    now: (() => {
      let tick = 0
      return () => `2026-09-25T01:00:0${tick++}.000Z`
    })(),
  })
  await assert.rejects(
    service.act('release-readiness', {
      customerKey: 'yoyoosun',
      idempotencyKey: IDEMPOTENCY.releaseReadiness,
      releaseBatch: '2026-07-10',
    }),
    /registered/u
  )
  const result = await service.act('release-readiness', {
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.releaseReadiness,
    releaseBatch: '2026-07-11',
  })
  assert.equal(result.statusCode, 200)
  assert.equal(result.payload.operation.status, 'passed')
  assert.equal(result.payload.operation.terminal, true)
  assert.deepEqual(calls, [
    { projectRoot: root, customerKey: 'yoyoosun', releaseBatch: '2026-07-11' },
  ])
  const reused = await service.act('release-readiness', {
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.releaseReadiness,
    releaseBatch: '2026-07-11',
  })
  assert.equal(reused.payload.reused, true)
  assert.equal(calls.length, 1)
  assert.equal(service.operations('yoyoosun').length, 1)
})

test('a live same-process operation survives service reload and keeps the global executor lock', async (t) => {
  const root = await temporaryRoot(t)
  let releaseRunner
  let announceStart
  const started = new Promise((resolve) => {
    announceStart = resolve
  })
  const pending = new Promise((resolve) => {
    releaseRunner = resolve
  })
  const firstService = createDevCustomerConfigService({
    projectRoot: root,
    dryRunRunner: async (_projectRoot, customerKey, operationId) => {
      announceStart()
      await pending
      return {
        status: 'success',
        customerKey,
        outputPath: `output/${operationId}`,
        reportPath: `output/${operationId}/report.md`,
        generatedAt: '2026-09-25T01:00:02.000Z',
        summary: {},
      }
    },
  })
  const firstResult = firstService.act('dry-run', {
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.dryRun,
  })
  await started

  const reloadedService = createDevCustomerConfigService({ projectRoot: root })
  assert.equal(reloadedService.operations('yoyoosun')[0].status, 'running')
  const concurrent = await reloadedService.act('dry-run', {
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.concurrentDryRun,
  })
  assert.equal(concurrent.statusCode, 409)
  assert.equal(concurrent.payload.operation.status, 'blocked')

  releaseRunner()
  assert.equal((await firstResult).payload.operation.status, 'passed')
})

test('service reload freezes an unowned running operation without replaying it', async (t) => {
  const root = await temporaryRoot(t)
  const store = resolveDevCustomerConfigOperationStore(root)
  createOrReuseDevCustomerConfigOperation(store, {
    action: 'dry-run',
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.dryRun,
    now: '2026-09-25T01:00:00.000Z',
  })
  let runs = 0
  const service = createDevCustomerConfigService({
    projectRoot: root,
    operationStore: store,
    dryRunRunner: async () => {
      runs += 1
      return { status: 'success' }
    },
    now: () => '2026-09-25T01:00:01.000Z',
  })
  assert.equal(service.operations('yoyoosun')[0].status, 'not_proven')
  const reused = await service.act('dry-run', {
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.dryRun,
  })
  assert.equal(reused.payload.operation.status, 'not_proven')
  assert.equal(reused.payload.reused, true)
  assert.equal(runs, 0)
})

test('runtime manifest only compiles for the matching loopback customer context', async (t) => {
  const root = await temporaryRoot(t)
  const calls = []
  const service = createDevCustomerConfigService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    devCustomerKey: 'yoyoosun',
    runtimeManifestCompiler: async (projectRoot, customerKey) => {
      calls.push({ projectRoot, customerKey })
      return {
        status: 'success',
        customerKey,
        manifest: { customer_key: customerKey, revision: 'runtime-v1' },
        manifestPath: 'output/runtime.json',
        generatedAt: '2026-09-25T01:00:00.000Z',
        summary: { revision: 'runtime-v1' },
      }
    },
  })
  const result = await service.act('runtime-manifest', {
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.runtimeManifest,
  })
  assert.equal(result.payload.manifest.customer_key, 'yoyoosun')
  assert.equal(result.payload.operation.status, 'passed')
  assert.deepEqual(calls, [{ projectRoot: root, customerKey: 'yoyoosun' }])

  const blocked = createDevCustomerConfigService({
    projectRoot: await temporaryRoot(t),
    apiOrigin: 'https://erp.example.com',
    devCustomerKey: 'yoyoosun',
  })
  await assert.rejects(
    blocked.act('runtime-manifest', {
      customerKey: 'yoyoosun',
      idempotencyKey: IDEMPOTENCY.runtimeManifest,
    }),
    /context/u
  )
})

test('middleware returns registered batches and operation history without raw process output', async () => {
  const middleware = createDevCustomerConfigMiddleware({
    csrfToken: CSRF_TOKEN,
    service: {
      async releaseBatches(customerKey) {
        assert.equal(customerKey, 'yoyoosun')
        return ['2026-07-11']
      },
      operations(customerKey) {
        assert.equal(customerKey, 'yoyoosun')
        return [{ id: 'safe-operation' }]
      },
      async act() {
        throw new Error('unused')
      },
    },
  })
  const batches = await invoke(middleware, {
    url: '/__dev/api/customer-config/release-batches?customerKey=yoyoosun',
  })
  assert.equal(batches.statusCode, 200)
  assert.deepEqual(batches.body.batches, ['2026-07-11'])

  const operations = await invoke(middleware, {
    url: '/__dev/api/customer-config/operations?customerKey=yoyoosun',
  })
  assert.equal(operations.statusCode, 200)
  assert.deepEqual(operations.body.operations, [{ id: 'safe-operation' }])
  assert.equal(JSON.stringify(operations.body).includes('stderr'), false)
  assert.equal(JSON.stringify(operations.body).includes('stdout'), false)
})
