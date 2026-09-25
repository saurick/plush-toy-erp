import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import {
  getCustomerPackage,
  listCustomerPackageKeys,
} from '../../config/customers/index.mjs'
import { isLoopbackAPIOrigin } from '../../scripts/local-runtime-preflight-core.mjs'
import {
  acquireDevCustomerConfigExecutionLock,
  createOrReuseDevCustomerConfigOperation,
  DEV_CUSTOMER_CONFIG_OPERATION_TERMINAL_STATUSES,
  listDevCustomerConfigOperations,
  recoverInterruptedDevCustomerConfigOperations,
  releaseDevCustomerConfigExecutionLock,
  resolveDevCustomerConfigOperationStore,
  transitionDevCustomerConfigOperation,
} from '../../scripts/qa/dev-customer-config-operation-store.mjs'
import {
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
  isSameOriginRequest,
  readJsonBody,
} from './devServerSecurity.mjs'

const execFileAsync = promisify(execFile)

const API_PATH = '/__dev/api/customer-import/dry-run'
const CUSTOMER_CONFIG_API_PREFIX = '/__dev/api/customer-config'
const SESSION_API_PATH = `${CUSTOMER_CONFIG_API_PREFIX}/session`
const OPERATIONS_API_PATH = `${CUSTOMER_CONFIG_API_PREFIX}/operations`
const RUNTIME_MANIFEST_API_PATH = '/__dev/api/customer-config/runtime-manifest'
const RELEASE_BATCHES_API_PATH = '/__dev/api/customer-config/release-batches'
const RELEASE_READINESS_API_PATH =
  '/__dev/api/customer-config/release-readiness'
const RELEASE_BATCH_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MAX_REQUEST_BYTES = 16 * 1024

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('x-content-type-options', 'nosniff')
  res.setHeader('referrer-policy', 'no-referrer')
  res.end(JSON.stringify(payload))
}

function normalizeCustomerKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeReleaseBatch(value) {
  return String(value || '').trim()
}

function buildDryRunPaths(projectRoot, customerKey, operationId) {
  const fixtureBasePath = path.join(
    'scripts',
    'import',
    'fixtures',
    'customers',
    customerKey
  )
  const outputPath = path.join(
    'output',
    'customers',
    customerKey,
    'ui-import-dry-run',
    operationId
  )
  return {
    sourcePath: path.join(fixtureBasePath, 'source-snapshot.sample.json'),
    existingPath: path.join(fixtureBasePath, 'existing-v1.sample.json'),
    outputPath,
    validationSummaryPath: path.join(outputPath, 'validation-summary.json'),
    reportPath: path.join(outputPath, 'dry-run-report.md'),
    absoluteOutputPath: path.join(projectRoot, outputPath),
  }
}

export function buildReleaseReadinessPaths(customerKey, releaseBatch) {
  const normalizedBatch = normalizeReleaseBatch(releaseBatch)
  if (!RELEASE_BATCH_PATTERN.test(normalizedBatch)) {
    throw new Error(`Invalid release batch: ${normalizedBatch || '(empty)'}`)
  }
  const outputPath = path.join('output', 'customers', customerKey)
  return {
    releaseBatch: normalizedBatch,
    evidenceDir: path.join(
      'deployments',
      customerKey,
      'evidence',
      'releases',
      normalizedBatch
    ),
    manifestPath: path.join(
      outputPath,
      `customer-config-runtime-manifest.ui-release.${normalizedBatch}.json`
    ),
  }
}

export async function listReleaseBatches(projectRoot, customerKey) {
  const releaseRoot = path.join(
    projectRoot,
    'deployments',
    customerKey,
    'evidence',
    'releases'
  )
  let entries = []
  try {
    entries = await readdir(releaseRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  return entries
    .filter(
      (entry) => entry.isDirectory() && RELEASE_BATCH_PATTERN.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left))
}

function summarizeValidation(summary = {}) {
  return {
    totalSources: Number(summary.totalSources || 0),
    normalizedRows: Number(summary.normalizedRows || 0),
    candidateCountsByAction: summary.candidateCountsByAction || {},
    unresolvedCountsBySeverity: summary.unresolvedCountsBySeverity || {},
    forbiddenCount: Number(summary.forbiddenCount || 0),
    blockerCount: Number(summary.blockerCount || 0),
    canExecuteRealImport: summary.canExecuteRealImport === true,
  }
}

async function writeJsonAtomically(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
      flag: 'wx',
    })
    await rename(temporary, file)
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {})
    throw error
  }
}

async function runDryRun(projectRoot, customerKey, operationId) {
  const paths = buildDryRunPaths(projectRoot, customerKey, operationId)
  const args = [
    path.join('scripts', 'import', 'customerImportDryRun.mjs'),
    '--source',
    paths.sourcePath,
    '--existing',
    paths.existingPath,
    '--out',
    paths.outputPath,
    '--format',
    'json,md',
  ]
  await execFileAsync(process.execPath, args, {
    cwd: projectRoot,
    timeout: 30_000,
    maxBuffer: 1024 * 1024 * 10,
  })
  const validationSummary = JSON.parse(
    await readFile(path.join(projectRoot, paths.validationSummaryPath), 'utf8')
  )
  return {
    customerKey,
    status: 'success',
    outputPath: paths.outputPath,
    reportPath: paths.reportPath,
    generatedAt: new Date().toISOString(),
    summary: summarizeValidation(validationSummary),
  }
}

async function compileRuntimeManifest(projectRoot, customerKey) {
  const outPath = path.join(
    'output',
    'customers',
    customerKey,
    'customer-config-runtime-manifest.ui-local-test.json'
  )
  const absoluteOutPath = path.join(projectRoot, outPath)
  const config = getCustomerPackage(customerKey)
  if (!config) {
    throw new Error(`Unknown customer package: ${customerKey}`)
  }
  const compilerModuleURL = pathToFileURL(
    path.join(
      projectRoot,
      'scripts',
      'qa',
      'customer-config-runtime-manifest.mjs'
    )
  ).href
  const { buildLocalTestApplyRuntimeManifest } = await import(compilerModuleURL)
  const manifest = buildLocalTestApplyRuntimeManifest(config)
  await writeJsonAtomically(absoluteOutPath, manifest)
  return {
    customerKey,
    status: 'success',
    manifest,
    manifestPath: outPath,
    generatedAt: new Date().toISOString(),
    summary: {
      revision: manifest.revision,
      productVersion: manifest.product_version,
      applyPurpose: manifest.compiled_snapshot.applyPurpose,
      moduleStateCount: manifest.module_states.length,
      roleProfileCount: manifest.role_profiles.length,
      entitlementCount: manifest.access_entitlements.length,
      workPoolCount: manifest.work_pools.length,
      membershipCount: manifest.work_pool_memberships.length,
      pageCount: manifest.compiled_snapshot.pages.length,
    },
  }
}

export async function compileReleaseRuntimeManifestTo(
  projectRoot,
  customerKey,
  outPath,
  { commandRunner = execFileAsync } = {}
) {
  const absoluteOutPath = path.join(projectRoot, outPath)
  const temporaryOutPath = `${outPath}.${process.pid}.${randomUUID()}.tmp`
  const absoluteTemporaryOutPath = path.join(projectRoot, temporaryOutPath)
  await mkdir(path.dirname(absoluteOutPath), { recursive: true })
  let manifest
  try {
    await commandRunner(
      process.execPath,
      [
        path.join('scripts', 'qa', 'customer-config-runtime-manifest.mjs'),
        '--customer',
        customerKey,
        '--mode',
        'compile',
        '--out',
        temporaryOutPath,
      ],
      {
        cwd: projectRoot,
        timeout: 30_000,
        maxBuffer: 1024 * 1024 * 10,
      }
    )
    manifest = JSON.parse(await readFile(absoluteTemporaryOutPath, 'utf8'))
    await writeFile(
      absoluteTemporaryOutPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 }
    )
    await rename(absoluteTemporaryOutPath, absoluteOutPath)
  } catch (error) {
    await rm(absoluteTemporaryOutPath, { force: true }).catch(() => {})
    throw error
  }
  return {
    customerKey,
    status: 'success',
    manifest,
    manifestPath: outPath,
    generatedAt: new Date().toISOString(),
    summary: {
      revision: manifest.revision,
      productVersion: manifest.product_version,
      moduleStateCount: manifest.module_states.length,
      roleProfileCount: manifest.role_profiles.length,
      entitlementCount: manifest.access_entitlements.length,
      workPoolCount: manifest.work_pools.length,
      membershipCount: manifest.work_pool_memberships.length,
      pageCount: manifest.compiled_snapshot.pages.length,
    },
  }
}

function summarizeReleaseReadinessError(error) {
  const raw = `${error?.stderr || ''}\n${error?.stdout || ''}\n${error?.message || ''}`
  const details = raw
    .split('\n')
    .map((line) => line.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
    .filter((line) => !/^Command failed:/i.test(line))
    .filter(
      (line) =>
        line.length <= 300 &&
        !/(?:password|secret|token|authorization|cookie|dsn)/iu.test(line) &&
        !/(?:^|[\s"'=])\/(?:Users|home|private|var|tmp)\//u.test(line) &&
        !/[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(line)
    )
    .slice(0, 12)
  return details.length > 0
    ? details
    : ['发布证据未通过固定门禁；详细诊断仅保留在本机开发终端']
}

async function runReleaseReadiness(projectRoot, customerKey, releaseBatch) {
  const paths = buildReleaseReadinessPaths(customerKey, releaseBatch)
  const manifestPayload = await compileReleaseRuntimeManifestTo(
    projectRoot,
    customerKey,
    paths.manifestPath
  )
  const args = [
    path.join('scripts', 'deploy', 'customer-config-release-readiness.mjs'),
    '--customer',
    customerKey,
    '--manifest',
    paths.manifestPath,
    '--evidence-dir',
    paths.evidenceDir,
  ]

  try {
    await execFileAsync(process.execPath, args, {
      cwd: projectRoot,
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 10,
    })
    return {
      customerKey,
      releaseBatch: paths.releaseBatch,
      status: 'ready',
      generatedAt: new Date().toISOString(),
      manifestPath: manifestPayload.manifestPath,
      evidenceDir: paths.evidenceDir,
      summary: manifestPayload.summary,
      missing: [],
    }
  } catch (error) {
    return {
      customerKey,
      releaseBatch: paths.releaseBatch,
      status: 'blocked',
      generatedAt: new Date().toISOString(),
      manifestPath: manifestPayload.manifestPath,
      evidenceDir: paths.evidenceDir,
      summary: manifestPayload.summary,
      message: '发布门禁未通过',
      missing: summarizeReleaseReadinessError(error),
    }
  }
}

function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid`)
  }
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${label} contains unsupported fields`)
  }
}

function registeredCustomer(customerKey) {
  return (
    listCustomerPackageKeys().includes(customerKey) &&
    getCustomerPackage(customerKey) !== null
  )
}

function publicOperation(operation) {
  return {
    schemaVersion: operation.schemaVersion,
    id: operation.id,
    action: operation.action,
    customerKey: operation.customerKey,
    input: operation.input,
    status: operation.status,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    result: operation.result,
    events: operation.events,
    terminal: DEV_CUSTOMER_CONFIG_OPERATION_TERMINAL_STATUSES.includes(
      operation.status
    ),
  }
}

function publicStoredResult(action, payload) {
  if (action === 'runtime-manifest') {
    return {
      status: payload.status,
      customerKey: payload.customerKey,
      manifestPath: payload.manifestPath,
      generatedAt: payload.generatedAt,
      summary: payload.summary,
    }
  }
  return payload
}

async function restoredPayload(projectRoot, operation) {
  if (operation.action !== 'runtime-manifest' || !operation.result) {
    return operation.result
  }
  const manifest = JSON.parse(
    await readFile(
      path.join(projectRoot, operation.result.manifestPath),
      'utf8'
    )
  )
  return { ...operation.result, manifest }
}

export function createDevCustomerConfigService({
  projectRoot = path.resolve(process.cwd(), '..'),
  apiOrigin = process.env.API_ORIGIN || 'http://127.0.0.1:8300',
  devCustomerKey = process.env.ERP_DEV_CUSTOMER_KEY || '',
  operationStore,
  dryRunRunner = runDryRun,
  runtimeManifestCompiler = compileRuntimeManifest,
  releaseBatchLister = listReleaseBatches,
  releaseReadinessRunner = runReleaseReadiness,
  now = () => new Date().toISOString(),
} = {}) {
  const root = path.resolve(projectRoot)
  const store = operationStore || resolveDevCustomerConfigOperationStore(root)
  recoverInterruptedDevCustomerConfigOperations(store, now())

  function normalizeRequest(action, body) {
    const expectedKeys =
      action === 'release-readiness'
        ? ['customerKey', 'idempotencyKey', 'releaseBatch']
        : ['customerKey', 'idempotencyKey']
    assertExactKeys(body, expectedKeys, 'customer config request')
    const customerKey = normalizeCustomerKey(body.customerKey)
    if (!registeredCustomer(customerKey)) {
      throw new Error('customer package is not registered')
    }
    const idempotencyKey = String(body.idempotencyKey || '')
    const input =
      action === 'release-readiness'
        ? { releaseBatch: normalizeReleaseBatch(body.releaseBatch) }
        : {}
    return { customerKey, idempotencyKey, input }
  }

  async function act(action, body) {
    const { customerKey, idempotencyKey, input } = normalizeRequest(
      action,
      body
    )
    if (
      action === 'runtime-manifest' &&
      (!isLoopbackAPIOrigin(apiOrigin) ||
        normalizeCustomerKey(devCustomerKey) !== customerKey)
    ) {
      const error = new Error('local customer context is not available')
      error.statusCode = 403
      throw error
    }
    if (action === 'release-readiness') {
      if (!RELEASE_BATCH_PATTERN.test(input.releaseBatch)) {
        throw new Error('release batch is invalid')
      }
      const registeredBatches = await releaseBatchLister(root, customerKey)
      if (!registeredBatches.includes(input.releaseBatch)) {
        throw new Error('release batch is not registered')
      }
    }

    const created = createOrReuseDevCustomerConfigOperation(store, {
      action,
      customerKey,
      idempotencyKey,
      input,
      now: now(),
    })
    if (created.reused) {
      return {
        statusCode: created.operation.status === 'running' ? 202 : 200,
        payload: {
          ...(await restoredPayload(root, created.operation)),
          reused: true,
          operation: publicOperation(created.operation),
        },
      }
    }
    if (!acquireDevCustomerConfigExecutionLock(store, created.operation.id)) {
      const operation = transitionDevCustomerConfigOperation(
        store,
        created.operation.id,
        {
          status: 'blocked',
          message: '已有客户配置工具操作正在执行',
          result: null,
          now: now(),
        }
      )
      return {
        statusCode: 409,
        payload: {
          status: 'blocked',
          message: '已有客户配置工具操作正在执行，请刷新回执后重试。',
          operation: publicOperation(operation),
        },
      }
    }

    try {
      const payload =
        action === 'dry-run'
          ? await dryRunRunner(root, customerKey, created.operation.id)
          : action === 'runtime-manifest'
            ? await runtimeManifestCompiler(root, customerKey)
            : await releaseReadinessRunner(
                root,
                customerKey,
                input.releaseBatch
              )
      const terminalStatus = payload.status === 'blocked' ? 'blocked' : 'passed'
      const operation = transitionDevCustomerConfigOperation(
        store,
        created.operation.id,
        {
          status: terminalStatus,
          message:
            terminalStatus === 'passed'
              ? '受控本地操作已完成并读回'
              : '发布门禁未通过，未执行正式发布',
          result: publicStoredResult(action, payload),
          now: now(),
        }
      )
      return {
        statusCode: 200,
        payload: {
          ...payload,
          reused: false,
          operation: publicOperation(operation),
        },
      }
    } catch {
      const operation = transitionDevCustomerConfigOperation(
        store,
        created.operation.id,
        {
          status: 'failed',
          message: '受控本地操作失败；未自动重试',
          result: null,
          now: now(),
        }
      )
      const error = new Error('customer config operation failed')
      error.statusCode = 500
      error.operation = publicOperation(operation)
      throw error
    } finally {
      releaseDevCustomerConfigExecutionLock(store, created.operation.id)
    }
  }

  return {
    async releaseBatches(customerKey) {
      const normalized = normalizeCustomerKey(customerKey)
      if (!registeredCustomer(normalized)) {
        throw new Error('customer package is not registered')
      }
      return releaseBatchLister(root, normalized)
    },
    operations(customerKey) {
      const normalized = normalizeCustomerKey(customerKey)
      if (!registeredCustomer(normalized)) {
        throw new Error('customer package is not registered')
      }
      return listDevCustomerConfigOperations(store, {
        customerKey: normalized,
        limit: 50,
      }).map(publicOperation)
    },
    act,
  }
}

export function createDevCustomerConfigMiddleware({
  service,
  csrfToken = randomBytes(32).toString('base64url'),
  ...serviceOptions
} = {}) {
  const customerConfigService =
    service || createDevCustomerConfigService(serviceOptions)
  const handledPaths = new Set([
    API_PATH,
    SESSION_API_PATH,
    OPERATIONS_API_PATH,
    RUNTIME_MANIFEST_API_PATH,
    RELEASE_BATCHES_API_PATH,
    RELEASE_READINESS_API_PATH,
  ])
  return async (request, response, next) => {
    let requestURL
    try {
      requestURL = new URL(request.url || '/', 'http://localhost')
    } catch {
      next()
      return
    }
    if (!handledPaths.has(requestURL.pathname)) {
      next()
      return
    }
    if (
      !isLoopbackRemoteAddress(request.socket?.remoteAddress) ||
      !isLoopbackHostHeader(request.headers?.host)
    ) {
      sendJson(response, 403, {
        status: 'failed',
        message: '该客户配置工具接口仅允许本机访问',
      })
      return
    }
    try {
      if (
        request.method === 'GET' &&
        requestURL.pathname === SESSION_API_PATH
      ) {
        sendJson(response, 200, {
          schemaVersion: 'plush.dev-customer-config-session/v1',
          csrfToken,
          apiPrefix: CUSTOMER_CONFIG_API_PREFIX,
        })
        return
      }
      if (
        request.method === 'GET' &&
        [OPERATIONS_API_PATH, RELEASE_BATCHES_API_PATH].includes(
          requestURL.pathname
        )
      ) {
        if (
          [...requestURL.searchParams.keys()].some(
            (key) => key !== 'customerKey'
          ) ||
          requestURL.searchParams.getAll('customerKey').length !== 1
        ) {
          throw new Error('query is invalid')
        }
        const customerKey = requestURL.searchParams.get('customerKey')
        const payload =
          requestURL.pathname === OPERATIONS_API_PATH
            ? {
                status: 'success',
                customerKey,
                operations: customerConfigService.operations(customerKey),
              }
            : {
                status: 'success',
                customerKey,
                batches:
                  await customerConfigService.releaseBatches(customerKey),
              }
        sendJson(response, 200, payload)
        return
      }
      const action =
        requestURL.pathname === API_PATH
          ? 'dry-run'
          : requestURL.pathname === RUNTIME_MANIFEST_API_PATH
            ? 'runtime-manifest'
            : requestURL.pathname === RELEASE_READINESS_API_PATH
              ? 'release-readiness'
              : ''
      if (request.method === 'POST' && action) {
        if (
          !isSameOriginRequest(request) ||
          request.headers?.['x-csrf-token'] !== csrfToken ||
          !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(
            String(request.headers?.['content-type'] || '')
          )
        ) {
          sendJson(response, 403, {
            status: 'failed',
            message: '请求来源或会话校验失败',
          })
          return
        }
        const result = await customerConfigService.act(
          action,
          await readJsonBody(request, {
            maxBytes: MAX_REQUEST_BYTES,
            label: 'customer config request',
          })
        )
        sendJson(response, result.statusCode, result.payload)
        return
      }
      sendJson(response, 405, {
        status: 'failed',
        message: '该客户配置工具接口不支持此方法或路径',
      })
    } catch (error) {
      const statusCode =
        Number(error?.statusCode) ||
        (/invalid|unsupported|registered|query|body|JSON/iu.test(
          String(error?.message || '')
        )
          ? 400
          : 500)
      sendJson(response, statusCode, {
        status: 'failed',
        message:
          statusCode === 403
            ? '本地客户上下文不符合固定配置合同'
            : statusCode === 400
              ? '请求参数不符合固定客户配置工具合同'
              : '操作未完成；请刷新客户配置操作回执',
        ...(error?.operation ? { operation: error.operation } : {}),
      })
    }
  }
}

export function createDevCustomerImportDryRunPlugin(options = {}) {
  return {
    name: 'plush-dev-customer-import-dry-run-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createDevCustomerConfigMiddleware(options))
    },
  }
}
