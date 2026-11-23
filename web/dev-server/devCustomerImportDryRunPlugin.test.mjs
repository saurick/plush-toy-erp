import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { buildRuntimePreviewManifest } from '../../scripts/qa/customer-config-runtime-manifest.mjs'

import {
  buildReleaseReadinessPaths,
  compileReleaseRuntimeManifestTo,
  createDevCustomerConfigMiddleware,
  createDevCustomerConfigService,
  createDevCustomerImportDryRunPlugin,
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
    localAddress = '127.0.0.1',
    localPort = 5175,
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
    req.socket = { remoteAddress, localAddress, localPort }
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

async function draftWorkspace(t) {
  const root = await temporaryRoot(t)
  const customers = path.join(root, 'config/customers')
  const reference = path.join(customers, 'reference-customer')
  await mkdir(reference, { recursive: true })
  const index = path.join(customers, 'index.mjs')
  const source = await readFile(new URL('../../config/customers/index.mjs', import.meta.url), 'utf8')
  await writeFile(index, source)
  const template = path.join(reference, 'customer-draft.template.json')
  await writeFile(template, await readFile(new URL('../../config/customers/reference-customer/customer-draft.template.json', import.meta.url)))
  return { root, customers, index, source, template }
}

const createDraftRequest = {
  method: 'POST',
  url: '/__dev/api/customer-config/drafts',
  body: { customerKey: 'draft-toys', customerName: '测试玩具厂' },
}

test('creates an independent JSON draft with product defaults and replays the same request', async (t) => {
  const { root, customers, index } = await draftWorkspace(t)
  const middleware = createDevCustomerConfigMiddleware({ projectRoot: root, allowDraftCreation: true, csrfToken: CSRF_TOKEN })
  const result = await invoke(middleware, createDraftRequest)
  assert.equal(result.statusCode, 201)
  assert.deepEqual(result.body, { status: 'success', customerKey: 'draft-toys', created: true })
  const draft = path.join(customers, 'draft-toys')
  assert.deepEqual((await readdir(draft)).sort(), ['README.md', 'customerPackage.json'])
  const customerPackage = JSON.parse(await readFile(path.join(draft, 'customerPackage.json'), 'utf8'))
  assert.equal(customerPackage.label, '测试玩具厂')
  assert.equal(customerPackage.status, 'draft')
  assert.equal(customerPackage.sourcePolicy.localTestApplyEnabled, false)
  assert.equal(customerPackage.sourcePolicy.trackedConfigFormat, 'json-declarative-object')
  assert.deepEqual(customerPackage.desktopMenu.hiddenItemKeys, [])
  const manifest = buildRuntimePreviewManifest(customerPackage)
  assert.equal(manifest.publishable, false)
  assert(manifest.module_states.every(({ state }) => state === 'enabled'))
  assert.equal(manifest.compiled_snapshot.fieldPolicies['suppliers.default'].supplier_type.visible, true)
  assert.deepEqual(manifest.compiled_snapshot.runtimeProcessSelections, [])
  assert.deepEqual(manifest.compiled_snapshot.printTemplateDefaults.templates, [])
  const indexWithDraft = await readFile(index, 'utf8')
  assert.match(indexWithDraft, /import customerDraft_draft_toys from "\.\/draft-toys\/customerPackage\.json" with \{ type: "json" \};/u)
  assert.match(indexWithDraft, /Object\.freeze\(\["draft-toys", customerDraft_draft_toys, "customerPackage\.json"\]\)/u)

  const replay = await invoke(middleware, createDraftRequest)
  assert.equal(replay.statusCode, 200)
  assert.equal(replay.body.created, false)
  const conflict = await invoke(middleware, {
    ...createDraftRequest, body: { ...createDraftRequest.body, customerName: '另一名称' },
  })
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.body.code, 'customer_key_taken')
  assert.equal(await readFile(index, 'utf8'), indexWithDraft)
})

test('draft creation reads defaults from the current JSON template', async (t) => {
  const { root, customers, index, source, template } = await draftWorkspace(t)
  const middleware = createDevCustomerConfigMiddleware({ projectRoot: root, allowDraftCreation: true, csrfToken: CSRF_TOKEN })
  const templateValues = JSON.parse(await readFile(template, 'utf8'))
  await writeFile(template, JSON.stringify({
    ...templateValues,
    customerPackage: { ...templateValues.customerPackage, runtimeEnabled: true },
  }))
  const invalid = await invoke(middleware, createDraftRequest)
  assert.equal(invalid.statusCode, 422)
  assert.equal(invalid.body.code, 'draft_template_invalid')
  assert.equal(await readFile(index, 'utf8'), source)
  await assert.rejects(readFile(path.join(customers, 'draft-toys/customerPackage.json')), { code: 'ENOENT' })

  templateValues.customerPackage.fieldPolicyOverrides = [{
    surfaceKey: 'suppliers.default', fieldKey: 'supplier_type', visible: false, reason: '模板验证',
  }]
  templateValues.desktopMenu.hiddenItemKeys = ['suppliers']
  await writeFile(template, JSON.stringify(templateValues))
  assert.equal((await invoke(middleware, createDraftRequest)).statusCode, 201)
  const draft = path.join(customers, 'draft-toys')
  const customerPackage = JSON.parse(await readFile(path.join(draft, 'customerPackage.json'), 'utf8'))
  assert.equal(buildRuntimePreviewManifest(customerPackage).compiled_snapshot.fieldPolicies['suppliers.default'].supplier_type.visible, false)
  assert.deepEqual(customerPackage.desktopMenu.hiddenItemKeys, ['suppliers'])
})

test('draft creation rejects remote writers, unsupported input and existing directories', async (t) => {
  const { root, customers, index, source } = await draftWorkspace(t)
  const middleware = createDevCustomerConfigMiddleware({ projectRoot: root, allowDraftCreation: true, csrfToken: CSRF_TOKEN })
  const disabled = createDevCustomerConfigMiddleware({ projectRoot: root, csrfToken: CSRF_TOKEN })
  assert.equal((await invoke(disabled, createDraftRequest)).statusCode, 599)
  const lan = await invoke(middleware, {
    ...createDraftRequest,
    remoteAddress: '192.168.0.40',
    localAddress: '192.168.0.30',
    headers: { host: '192.168.0.30:5175', origin: 'http://192.168.0.30:5175' },
  })
  assert.equal(lan.statusCode, 403)
  const missingToken = await invoke(middleware, { ...createDraftRequest, headers: { 'x-csrf-token': '' } })
  assert.equal(missingToken.statusCode, 403)
  for (const body of [
    { ...createDraftRequest.body, customerKey: 'Bad Key' },
    { ...createDraftRequest.body, customerKey: 'tenant' },
    { ...createDraftRequest.body, customerName: '   ' },
    { ...createDraftRequest.body, customerName: '前\n后' },
    { ...createDraftRequest.body, runtimeEnabled: true },
  ]) {
    assert.equal((await invoke(middleware, { ...createDraftRequest, body })).statusCode, 400)
  }
  const existingPath = path.join(customers, 'draft-toys')
  await mkdir(existingPath)
  await writeFile(path.join(existingPath, 'README.md'), '已有草稿')
  const conflict = await invoke(middleware, createDraftRequest)
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.body.code, 'customer_key_taken')
  assert.equal(await readFile(index, 'utf8'), source)
  assert.deepEqual(await readdir(existingPath), ['README.md'])
  assert.equal(await readFile(path.join(existingPath, 'README.md'), 'utf8'), '已有草稿')
})

test('only the Vite development entry may register the draft route', async (t) => {
  const projectRoot = await temporaryRoot(t)
  const methodProbe = { url: createDraftRequest.url }
  for (const [enabled, statusCode] of [[false, 599], [true, 405]]) {
    const plugin = createDevCustomerImportDryRunPlugin({ projectRoot, allowDraftCreation: enabled })
    let handler
    plugin.configureServer({ middlewares: { use: (middleware) => { handler = middleware } } })
    assert.equal((await invoke(handler, methodProbe)).statusCode, statusCode)
  }
})

test('resumes a fully saved draft after preserving a concurrent registry edit', async (t) => {
  const { root, customers, index, source } = await draftWorkspace(t)
  const concurrentSource = `// 独立的仓库修改\n${source}`
  let interfere = true
  const middleware = createDevCustomerConfigMiddleware({
    projectRoot: root,
    allowDraftCreation: true,
    csrfToken: CSRF_TOKEN,
    onDraftRegistered() {
      if (interfere) writeFileSync(index, concurrentSource)
      interfere = false
    },
  })
  const interrupted = await invoke(middleware, createDraftRequest)
  assert.equal(interrupted.statusCode, 409)
  assert.equal(interrupted.body.code, 'draft_registry_changed')
  assert.equal(await readFile(index, 'utf8'), concurrentSource)
  const packagePath = path.join(customers, 'draft-toys/customerPackage.json')
  const saved = await readFile(packagePath, 'utf8')
  const retry = await invoke(middleware, createDraftRequest)
  assert.equal(retry.statusCode, 201)
  assert.equal(await readFile(packagePath, 'utf8'), saved)
  assert.match(await readFile(index, 'utf8'), /\/\/ 独立的仓库修改/u)
})

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

test('middleware limits sessions and every POST bridge to loopback with same-origin CSRF', async () => {
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

test('LAN history and fixed actions share the protected workbench session', async () => {
  let actions = 0
  const customers = []
  const middleware = createDevCustomerConfigMiddleware({
    csrfToken: CSRF_TOKEN,
    service: {
      async releaseBatches(customerKey) {
        customers.push(customerKey)
        return ['2026-07-11']
      },
      operations(customerKey) {
        customers.push(customerKey)
        return [{ id: 'safe-operation', status: 'passed' }]
      },
      async act() {
        actions += 1
        return { statusCode: 200, payload: { status: 'success' } }
      },
    },
  })
  const lan = {
    remoteAddress: '192.168.0.20',
    localAddress: '::ffff:192.168.0.133',
    localPort: 15200,
    headers: {
      host: '192.168.0.133:15200',
      referer:
        'http://192.168.0.133:15200/__dev/customer-config?customer=yoyoosun',
    },
  }
  for (const endpoint of ['operations', 'release-batches']) {
    const result = await invoke(middleware, {
      ...lan,
      url: `/__dev/api/customer-config/${endpoint}?customerKey=yoyoosun`,
    })
    assert.equal(result.statusCode, 200, endpoint)
    assert.equal(result.headers['cache-control'], 'no-store')
    assert.equal(result.body.status, 'success')
  }
  assert.deepEqual(customers, ['yoyoosun', 'yoyoosun'])
  const session = await invoke(middleware, {
    ...lan,
    url: '/__dev/api/customer-config/session',
  })
  assert.equal(session.statusCode, 200)
  assert.equal(session.body.csrfToken, CSRF_TOKEN)
  for (const endpoint of [
    '/__dev/api/customer-import/dry-run',
    '/__dev/api/customer-config/runtime-manifest',
    '/__dev/api/customer-config/release-readiness',
    '/__dev/api/customer-config/operations',
  ]) {
    const result = await invoke(middleware, {
      ...lan,
      method: 'POST',
      url: endpoint,
      headers: {
        ...lan.headers,
        origin: 'http://192.168.0.133:15200',
        'sec-fetch-site': 'same-origin',
        'x-csrf-token': CSRF_TOKEN,
        'content-type': 'application/json',
      },
      body: { customerKey: 'yoyoosun', idempotencyKey: IDEMPOTENCY.dryRun },
    })
    assert.equal(
      result.statusCode,
      endpoint.endsWith('/operations') ? 405 : 200,
      endpoint
    )
  }
  assert.equal(actions, 3)
  const crossOrigin = await invoke(middleware, {
    ...lan,
    url: '/__dev/api/customer-config/operations?customerKey=yoyoosun',
    headers: { ...lan.headers, origin: 'http://evil.example' },
  })
  assert.equal(crossOrigin.statusCode, 403)
  const invalidQuery = await invoke(middleware, {
    ...lan,
    url: '/__dev/api/customer-config/operations?customerKey=yoyoosun&customerKey=other',
  })
  assert.equal(invalidQuery.statusCode, 400)
  assert.deepEqual(customers, ['yoyoosun', 'yoyoosun'])
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
  let revision = 'runtime-v1'
  const service = createDevCustomerConfigService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    devCustomerKey: 'yoyoosun',
    runtimeManifestCompiler: async (projectRoot, customerKey) => {
      calls.push({ projectRoot, customerKey })
      return {
        status: 'success',
        customerKey,
        manifest: { customer_key: customerKey, revision },
        manifestPath: 'output/runtime.json',
        generatedAt: '2026-09-25T01:00:00.000Z',
        summary: { revision },
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
  revision = 'runtime-v2'
  const newer = await service.act('runtime-manifest', {
    customerKey: 'yoyoosun',
    idempotencyKey: 'customer-config:runtime-manifest:yoyoosun:33333333-3333-4333-8333-333333333333',
  })
  assert.notEqual(newer.payload.manifestPath, result.payload.manifestPath)
  const replay = await service.act('runtime-manifest', {
    customerKey: 'yoyoosun',
    idempotencyKey: IDEMPOTENCY.runtimeManifest,
  })
  assert.equal(replay.payload.reused, true)
  assert.equal(replay.payload.manifest.revision, 'runtime-v1')
  assert.equal(replay.payload.summary.revision, 'runtime-v1')

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
