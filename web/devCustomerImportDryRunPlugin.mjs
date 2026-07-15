import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { getCustomerPackage } from '../config/customers/index.mjs'
import { isLoopbackAPIOrigin } from '../scripts/local-runtime-preflight-core.mjs'

const execFileAsync = promisify(execFile)

const API_PATH = '/__dev/api/customer-import/dry-run'
const RUNTIME_MANIFEST_API_PATH = '/__dev/api/customer-config/runtime-manifest'
const RELEASE_BATCHES_API_PATH = '/__dev/api/customer-config/release-batches'
const RELEASE_READINESS_API_PATH =
  '/__dev/api/customer-config/release-readiness'
const SUPPORTED_CUSTOMERS = new Set(['yoyoosun'])
const RELEASE_BATCH_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readRequestJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function normalizeCustomerKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function normalizeReleaseBatch(value) {
  return String(value || '').trim()
}

function buildDryRunPaths(projectRoot, customerKey) {
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
    'ui-import-dry-run'
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

async function runDryRun(projectRoot, customerKey) {
  const paths = buildDryRunPaths(projectRoot, customerKey)
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
  const command = `node ${args.join(' ')}`

  const result = await execFileAsync(process.execPath, args, {
    cwd: projectRoot,
    timeout: 30_000,
    maxBuffer: 1024 * 1024 * 10,
  })
  const validationSummary = JSON.parse(
    await readFile(path.join(projectRoot, paths.validationSummaryPath), 'utf8')
  )
  const reportMarkdown = await readFile(
    path.join(projectRoot, paths.reportPath),
    'utf8'
  )

  return {
    customerKey,
    status: 'success',
    command,
    outputPath: paths.outputPath,
    reportPath: paths.reportPath,
    generatedAt: new Date().toISOString(),
    summary: summarizeValidation(validationSummary),
    reportPreview: reportMarkdown.slice(0, 1800).trim(),
    stdout: result.stdout.trim(),
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
  const { buildLocalTestApplyRuntimeManifest } = await import(
    compilerModuleURL
  )
  const manifest = buildLocalTestApplyRuntimeManifest(config)
  await mkdir(path.dirname(absoluteOutPath), { recursive: true })
  await writeFile(absoluteOutPath, `${JSON.stringify(manifest, null, 2)}\n`)
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

async function compileRuntimeManifestTo(projectRoot, customerKey, outPath) {
  const absoluteOutPath = path.join(projectRoot, outPath)
  await mkdir(path.dirname(absoluteOutPath), { recursive: true })
  await execFileAsync(
    process.execPath,
    [
      path.join('scripts', 'qa', 'customer-config-runtime-manifest.mjs'),
      '--customer',
      customerKey,
      '--mode',
      'preview',
      '--out',
      outPath,
    ],
    {
      cwd: projectRoot,
      timeout: 30_000,
      maxBuffer: 1024 * 1024 * 10,
    }
  )
  const manifest = JSON.parse(await readFile(absoluteOutPath, 'utf8'))
  await writeFile(absoluteOutPath, `${JSON.stringify(manifest, null, 2)}\n`)
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
    .slice(0, 12)
  return details
}

async function runReleaseReadiness(projectRoot, customerKey, releaseBatch) {
  const paths = buildReleaseReadinessPaths(customerKey, releaseBatch)
  const manifestPayload = await compileRuntimeManifestTo(
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
    const result = await execFileAsync(process.execPath, args, {
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
      stdout: result.stdout.trim(),
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

export function createDevCustomerImportDryRunPlugin({
  projectRoot = path.resolve(process.cwd(), '..'),
  apiOrigin = process.env.API_ORIGIN || 'http://127.0.0.1:8300',
  devCustomerKey = process.env.ERP_DEV_CUSTOMER_KEY || '',
  runtimeManifestCompiler = compileRuntimeManifest,
  releaseBatchLister = listReleaseBatches,
  releaseReadinessRunner = runReleaseReadiness,
} = {}) {
  return {
    name: 'plush-dev-customer-import-dry-run-api',
    configureServer(server) {
      server.middlewares.use(API_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, {
            status: 'error',
            message: 'Only POST is allowed for customer import dry-run.',
          })
          return
        }

        try {
          const body = await readRequestJson(req)
          const customerKey = normalizeCustomerKey(body.customerKey)
          if (!SUPPORTED_CUSTOMERS.has(customerKey)) {
            sendJson(res, 400, {
              status: 'error',
              message: `Unsupported customer package: ${customerKey || '(empty)'}`,
            })
            return
          }

          const payload = await runDryRun(projectRoot, customerKey)
          sendJson(res, 200, payload)
        } catch (error) {
          sendJson(res, 500, {
            status: 'error',
            message:
              error?.message || 'Customer import dry-run failed unexpectedly.',
            stdout: error?.stdout || '',
            stderr: error?.stderr || '',
          })
        }
      })

      server.middlewares.use(RUNTIME_MANIFEST_API_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, {
            status: 'error',
            message: 'Only POST is allowed for customer config manifest.',
          })
          return
        }

        try {
          const body = await readRequestJson(req)
          const customerKey = normalizeCustomerKey(body.customerKey)
          if (!SUPPORTED_CUSTOMERS.has(customerKey)) {
            sendJson(res, 400, {
              status: 'error',
              message: `Unsupported customer package: ${customerKey || '(empty)'}`,
            })
            return
          }

          if (!isLoopbackAPIOrigin(apiOrigin)) {
            sendJson(res, 403, {
              status: 'error',
              message:
                '本地测试配置只允许写入 loopback 后端；当前 API_ORIGIN 不是本机地址。',
            })
            return
          }
          if (
            !normalizeCustomerKey(devCustomerKey) ||
            normalizeCustomerKey(devCustomerKey) !== customerKey
          ) {
            sendJson(res, 403, {
              status: 'error',
              message:
                '本地测试配置只允许从 start:yoyoosun 对应的客户开发入口生成。',
            })
            return
          }

          const payload = await runtimeManifestCompiler(
            projectRoot,
            customerKey
          )
          sendJson(res, 200, payload)
        } catch (error) {
          sendJson(res, 500, {
            status: 'error',
            message:
              error?.message ||
              'Customer config runtime manifest compile failed unexpectedly.',
          })
        }
      })

      server.middlewares.use(RELEASE_BATCHES_API_PATH, async (req, res) => {
        if (req.method !== 'GET') {
          sendJson(res, 405, {
            status: 'error',
            message: 'Only GET is allowed for customer config release batches.',
          })
          return
        }

        try {
          const requestUrl = new URL(req.url || '/', 'http://127.0.0.1')
          const customerKey = normalizeCustomerKey(
            requestUrl.searchParams.get('customerKey')
          )
          if (!SUPPORTED_CUSTOMERS.has(customerKey)) {
            sendJson(res, 400, {
              status: 'error',
              message: `Unsupported customer package: ${customerKey || '(empty)'}`,
            })
            return
          }
          const batches = await releaseBatchLister(projectRoot, customerKey)
          sendJson(res, 200, {
            status: 'success',
            customerKey,
            batches,
          })
        } catch (error) {
          sendJson(res, 500, {
            status: 'error',
            message:
              error?.message ||
              'Customer config release batches failed unexpectedly.',
          })
        }
      })

      server.middlewares.use(RELEASE_READINESS_API_PATH, async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, {
            status: 'error',
            message:
              'Only POST is allowed for customer config release readiness.',
          })
          return
        }

        try {
          const body = await readRequestJson(req)
          const customerKey = normalizeCustomerKey(body.customerKey)
          if (!SUPPORTED_CUSTOMERS.has(customerKey)) {
            sendJson(res, 400, {
              status: 'error',
              message: `Unsupported customer package: ${customerKey || '(empty)'}`,
            })
            return
          }

          const releaseBatch = normalizeReleaseBatch(body.releaseBatch)
          const registeredBatches = await releaseBatchLister(
            projectRoot,
            customerKey
          )
          if (!registeredBatches.includes(releaseBatch)) {
            sendJson(res, 400, {
              status: 'error',
              message: `Unregistered release batch: ${releaseBatch || '(empty)'}`,
            })
            return
          }

          const payload = await releaseReadinessRunner(
            projectRoot,
            customerKey,
            releaseBatch
          )
          sendJson(res, 200, payload)
        } catch (error) {
          sendJson(res, 500, {
            status: 'error',
            message:
              error?.message ||
              'Customer config release readiness failed unexpectedly.',
          })
        }
      })
    },
  }
}
