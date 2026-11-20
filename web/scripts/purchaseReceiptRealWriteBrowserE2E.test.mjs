import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { buildInputTemplate } from './purchaseReceiptRealWriteBrowserE2E.mjs'

const scriptPath = path.resolve(
  import.meta.dirname,
  'purchaseReceiptRealWriteBrowserE2E.mjs'
)
const repoDir = path.resolve(import.meta.dirname, '..', '..')

test('purchase receipt real-write browser e2e input template is no-write but keeps real-write boundary visible', () => {
  const template = buildInputTemplate()

  assert.equal(
    template.scope,
    'purchase-receipt-real-write-browser-e2e-input-template'
  )
  assert.equal(template.writesDatabase, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.startsBrowser, false)
  assert.equal(template.startsDevServer, false)
  assert.equal(template.readsLocalConfig, false)
  assert.equal(template.downstreamWritesDatabase, true)
  assert.equal(template.downstreamStartsBrowser, true)
  assert.equal(template.downstreamCallsBackend, true)
  assert.equal(template.requiresPersistentTestDataAcceptance, true)
  assert.equal(template.generatedRecordPrefix, 'PR-BROWSER-*')
  assert.match(
    template.commands.join('\n'),
    /purchaseReceiptRealWriteBrowserE2E\.mjs --print-input-template/
  )
  assert.match(template.commands.join('\n'), /--preflight-report/)
  assert.match(template.commands.join('\n'), /--accept-persistent-test-data/)
  assert.match(template.commands.join('\n'), /--seed-core-demo/)
  assert.match(template.boundary, /does not.*write database rows/)
  assert.match(template.boundary, /real smoke writes local\/development/)
})

test('purchase receipt real-write browser e2e CLI input template does not require acceptance or start runtime', () => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--print-input-template'],
    {
      cwd: repoDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        REAL_LOGIN_SMOKE_BASE_URL: '',
        REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL: '',
        PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA: '',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
  const template = JSON.parse(result.stdout)
  assert.equal(
    template.scope,
    'purchase-receipt-real-write-browser-e2e-input-template'
  )
  assert.equal(template.writesDatabase, false)
  assert.equal(template.startsBrowser, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.downstreamWritesDatabase, true)
})

test('purchase receipt real-write browser e2e CLI preflight writes sanitized no-write report', () => {
  const reportPath = path.join(
    repoDir,
    'output/purchase-receipt-real-write-browser-e2e/preflight-test.json'
  )
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--preflight-report',
      'output/purchase-receipt-real-write-browser-e2e/preflight-test.json',
    ],
    {
      cwd: repoDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        REAL_LOGIN_ADMIN_USERNAME: '',
        REAL_LOGIN_ADMIN_PASSWORD: 'should-not-be-stored',
        REAL_LOGIN_SMOKE_BASE_URL: 'http://127.0.0.1:15213',
        REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL: 'http://127.0.0.1:1/healthz',
        PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA: '',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /preflight report written/)
  const reportText = readFileSync(reportPath, 'utf8')
  const report = JSON.parse(reportText)

  assert.equal(
    report.scope,
    'purchase-receipt-real-write-browser-e2e-preflight-report'
  )
  assert.equal(report.writesDatabase, false)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.readsLocalConfig, false)
  assert.equal(report.readsPasswordValue, false)
  assert.equal(report.storesPasswordValue, false)
  assert.equal(report.storesAccessToken, false)
  assert.equal(report.storesAuthorizationHeader, false)
  assert.equal(report.persistentTestDataAccepted, false)
  assert.equal(report.credentialEnvComplete, false)
  assert.equal(report.readyForRealSmoke, false)
  assert(report.blockers.includes('missing-persistent-test-data-acceptance'))
  assert(report.blockers.includes('missing-admin-credential-env'))
  assert(report.blockers.includes('backend-health-unreachable'))
  assert.doesNotMatch(
    reportText,
    /should-not-be-stored|Bearer|access_token|Authorization:/
  )
})

test('purchase receipt real-write browser e2e refuses direct execution without persistent test data acceptance', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      REAL_LOGIN_SMOKE_BASE_URL: '',
      REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL: '',
      PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA: '',
    },
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /事实单据不可物理删除/)
  assert.match(result.stderr, /--accept-persistent-test-data/)
})

test('purchase receipt real-write browser e2e checks backend after accepted local target', () => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--accept-persistent-test-data'],
    {
      cwd: repoDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        REAL_LOGIN_SMOKE_BASE_URL: 'http://127.0.0.1:15213',
        REAL_LOGIN_SMOKE_BACKEND_HEALTH_URL: 'http://127.0.0.1:1/healthz',
        PURCHASE_RECEIPT_E2E_ACCEPT_PERSISTENT_TEST_DATA: '',
      },
    }
  )

  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stderr, /runtime is not defined/)
  assert.match(result.stderr, /无法访问后端健康检查/)
})

test('purchase receipt real-write browser e2e report writer does not use implicit runtime', () => {
  const source = readFileSync(scriptPath, 'utf8')

  assert.match(source, /writeReport\(report, runtime\.outputDir\)/)
  assert.match(source, /async function writeReport\(report, outputDir\)/)
  assert.doesNotMatch(
    source,
    /async function writeReport\(report\)[\s\S]*runtime\.outputDir/
  )
})
