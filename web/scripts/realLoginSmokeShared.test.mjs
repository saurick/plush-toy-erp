import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  buildRealLoginSmokePreflightReport,
  buildRealLoginSmokeInputTemplate,
  createRealLoginSmokeRuntime,
  waitForAdminDashboardReady,
} from './realLoginSmokeShared.mjs'

const scriptPath = path.resolve(import.meta.dirname, 'realLoginSmokeShared.mjs')

const withEnv = (env, fn) => {
  const previous = {}
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key]
    process.env[key] = env[key]
  }
  try {
    return fn()
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = previous[key]
      }
    }
  }
}

const withFetch = async (fetchImpl, fn) => {
  const previous = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    return await fn()
  } finally {
    globalThis.fetch = previous
  }
}

test('real login smoke runtime rejects credentialed base URL', () => {
  assert.throws(
    () =>
      withEnv(
        { REAL_LOGIN_SMOKE_BASE_URL: 'http://admin:secret@127.0.0.1:4174' },
        () =>
          createRealLoginSmokeRuntime({
            scriptDir: import.meta.dirname,
            outputSubdir: 'real-login-smoke-shared-test',
          })
      ),
    /REAL_LOGIN_SMOKE_BASE_URL must not contain username or password/
  )
})

test('real login smoke runtime rejects credentialed backend health URL', () => {
  assert.throws(
    () =>
      withEnv(
        {
          REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL:
            'http://admin:secret@127.0.0.1:8300/healthz',
        },
        () =>
          createRealLoginSmokeRuntime({
            scriptDir: import.meta.dirname,
            outputSubdir: 'real-login-smoke-shared-test',
          })
      ),
    /REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL must not contain username or password/
  )
})

test('real login smoke runtime accepts plain local URLs', () => {
  const runtime = withEnv(
    {
      REAL_LOGIN_SMOKE_BASE_URL: 'http://127.0.0.1:4174',
      REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL: 'http://127.0.0.1:8300/healthz',
    },
    () =>
      createRealLoginSmokeRuntime({
        scriptDir: import.meta.dirname,
        outputSubdir: 'real-login-smoke-shared-test',
      })
  )

  assert.equal(runtime.baseURL, 'http://127.0.0.1:4174')
})

test('real login smoke waits current dashboard heading after login', async () => {
  const calls = []
  const page = {
    getByRole(role, options) {
      calls.push({ role, options })
      return {
        async waitFor(waitOptions) {
          calls.push({ waitOptions })
        },
      }
    },
  }

  await waitForAdminDashboardReady(page)

  assert.deepEqual(calls, [
    {
      role: 'heading',
      options: { name: '工作台', exact: true },
    },
    {
      waitOptions: {
        state: 'visible',
        timeout: 15_000,
      },
    },
  ])
})

test('real login smoke input template is no-write and keeps downstream write boundary visible', () => {
  const template = buildRealLoginSmokeInputTemplate()

  assert.equal(template.scope, 'real-login-smoke-shared-input-template')
  assert.equal(template.writesDatabase, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.startsBrowser, false)
  assert.equal(template.readsLocalConfig, false)
  assert.deepEqual(template.secretInputs, [
    'REAL_LOGIN_ADMIN_USERNAME/REAL_LOGIN_ADMIN_PASSWORD or server/configs/dev/config.local.yaml admin credentials',
  ])
  assert.match(
    template.commands.join('\n'),
    /realLoginSmokeShared\.mjs --print-input-template/
  )
  assert.match(
    template.commands.join('\n'),
    /realLoginSmokeShared\.mjs --preflight-report output\/real-login-smoke-shared\/preflight\.json/
  )
  assert.match(
    template.commands.join('\n'),
    /purchaseReceiptRealWriteBrowserE2E\.mjs --print-input-template/
  )
  assert.match(
    template.commands.join('\n'),
    /smoke:purchase-contract-real-login/
  )
  assert.match(
    template.commands.join('\n'),
    /smoke:processing-contract-real-login/
  )
  assert.match(template.commands.join('\n'), /smoke:mobile-auth-login-route/)
  assert.match(
    template.commands.join('\n'),
    /PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA=1/
  )
  assert.match(template.boundary, /preflight report probes backend health/)
  assert.match(template.boundary, /Neither mode.*logs in/)
  assert.match(template.boundary, /purchase-receipt-real-write persists/)
})

test('contract real login smokes cover preview download and print entrypoints', () => {
  const contractSmokeScripts = [
    'purchaseContractRealLoginSmoke.mjs',
    'processingContractRealLoginSmoke.mjs',
  ]

  for (const scriptName of contractSmokeScripts) {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, scriptName),
      'utf8'
    )

    assert.match(source, /verify\w+ContractPreviewPopup/u)
    assert.match(source, /verifyPdfDownloadButton/u)
    assert.match(source, /verifyPrintButtonInvokesWindowPrint/u)
    assert.match(source, /acceptDownloads:\s*true/u)
    assert.match(source, /在线预览耗时/u)
    assert.match(source, /下载文件/u)
    assert.match(source, /打印按钮已调用浏览器打印入口/u)
  }
})

test('real login smoke preflight probes health without reading secrets or auth', async () => {
  const report = await withEnv(
    {
      REAL_LOGIN_ADMIN_USERNAME: 'local-admin',
      REAL_LOGIN_ADMIN_PASSWORD: 'local-password',
      REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL: 'http://127.0.0.1:8300/healthz',
      REAL_LOGIN_SMOKE_BASE_URL: 'http://127.0.0.1:4174',
    },
    () =>
      withFetch(
        async (url) => ({
          ok: String(url) === 'http://127.0.0.1:8300/healthz',
          status: 200,
          statusText: 'OK',
        }),
        () => buildRealLoginSmokePreflightReport()
      )
  )

  assert.equal(report.scope, 'real-login-smoke-shared-preflight-report')
  assert.equal(report.writesDatabase, false)
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.callsBackendHealth, true)
  assert.equal(report.callsAuthEndpoint, false)
  assert.equal(report.callsJSONRPCAuth, false)
  assert.equal(report.validatesCredentials, false)
  assert.equal(report.readsLocalConfig, false)
  assert.equal(report.readsPasswordValue, false)
  assert.equal(report.storesPasswordValue, false)
  assert.equal(report.storesAccessToken, false)
  assert.equal(report.credentialEnvPresent, true)
  assert.deepEqual(report.presentCredentialEnvNames, [
    'REAL_LOGIN_ADMIN_USERNAME',
    'REAL_LOGIN_ADMIN_PASSWORD',
  ])
  assert.equal(report.backendHealth.ok, true)
  assert.equal(report.readyForCredentialedSmokeCandidate, true)
  assert.deepEqual(report.blockers, [])
  assert.match(report.nextCommand, /smoke:purchase-contract-real-login/)
  assert(!JSON.stringify(report).includes('local-password'))
  assert.match(report.boundary, /does not read config contents/)
  assert.match(report.boundary, /does not.*auth JSON-RPC/)
})

test('real login smoke CLI preflight writes sanitized blocker report', () => {
  const reportPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    'output',
    'real-login-smoke-shared',
    'preflight-test.json'
  )
  fs.rmSync(reportPath, { force: true })

  const stdout = execFileSync(
    process.execPath,
    [
      scriptPath,
      '--preflight-report',
      'output/real-login-smoke-shared/preflight-test.json',
    ],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        REAL_LOGIN_ADMIN_USERNAME: '',
        REAL_LOGIN_ADMIN_PASSWORD: '',
        REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL: 'http://127.0.0.1:1/healthz',
        REAL_LOGIN_SMOKE_BASE_URL: '',
      },
    }
  )
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

  assert.match(stdout, /preflight written/)
  assert.equal(report.scope, 'real-login-smoke-shared-preflight-report')
  assert.equal(report.writesDatabase, false)
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.callsAuthEndpoint, false)
  assert.equal(report.callsJSONRPCAuth, false)
  assert.equal(report.readsLocalConfig, false)
  assert.equal(report.storesAccessToken, false)
  assert.equal(report.backendHealth.ok, false)
  assert(report.blockers.includes('backend-health-unreachable'))
  assert(!JSON.stringify(report).includes('local-password'))
  assert(!JSON.stringify(report).includes('Bearer '))
})
