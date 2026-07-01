import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  buildPreflightReport,
  buildInputTemplate,
  normalizeOptionalURL,
} from './mobileAuthLoginRouteSmoke.mjs'

const scriptPath = path.resolve(
  import.meta.dirname,
  'mobileAuthLoginRouteSmoke.mjs'
)

test('mobile auth login route smoke input template is no-write and covers all role paths', () => {
  const template = buildInputTemplate()

  assert.equal(template.scope, 'mobile-auth-login-route-smoke-input-template')
  assert.equal(template.writesDatabase, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.startsBrowser, false)
  assert.equal(template.startsDevServer, false)
  assert.equal(template.usesMockRpc, true)
  assert.equal(template.viewportProfiles.length, 2)
  assert.equal(template.roles.length, 9)
  assert(
    template.roles.some(
      (item) =>
        item.roleKey === 'engineering' &&
        item.taskPath === '/m/engineering/tasks'
    )
  )
  assert.match(
    template.commands.join('\n'),
    /mobileAuthLoginRouteSmoke\.mjs --print-input-template/
  )
  assert.match(
    template.commands.join('\n'),
    /mobileAuthLoginRouteSmoke\.mjs --preflight-report output\/mobile-auth-login-route-smoke\/preflight\.json/
  )
  assert.match(template.commands.join('\n'), /smoke:mobile-auth-login-route/)
  assert.match(template.boundary, /Neither mode starts Vite/)
  assert.match(template.boundary, /mocked auth\/workflow RPC/)
  assert.match(template.boundary, /proves real RBAC/)
})

test('mobile auth login route smoke rejects credentialed base URL', () => {
  assert.equal(
    normalizeOptionalURL('http://127.0.0.1:5175', 'MOBILE_AUTH_SMOKE_BASE_URL'),
    'http://127.0.0.1:5175'
  )
  assert.throws(
    () =>
      normalizeOptionalURL(
        'http://demo:secret@127.0.0.1:5175',
        'MOBILE_AUTH_SMOKE_BASE_URL'
      ),
    /MOBILE_AUTH_SMOKE_BASE_URL must not contain username or password/
  )
})

test('mobile auth login route smoke CLI input template does not start browser or dev server', () => {
  const stdout = execFileSync(
    process.execPath,
    [scriptPath, '--print-input-template'],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        MOBILE_AUTH_SMOKE_APP_ID: '',
        MOBILE_AUTH_SMOKE_BASE_URL: '',
      },
    }
  )
  const template = JSON.parse(stdout)

  assert.equal(template.scope, 'mobile-auth-login-route-smoke-input-template')
  assert.equal(template.startsBrowser, false)
  assert.equal(template.startsDevServer, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.writesDatabase, false)
})

test('mobile auth login route smoke preflight is no-write and covers route plan', async () => {
  const report = await buildPreflightReport()

  assert.equal(report.scope, 'mobile-auth-login-route-smoke-preflight-report')
  assert.equal(report.writesDatabase, false)
  assert.equal(report.callsBackend, false)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.readsPasswordValue, false)
  assert.equal(report.storesAccessToken, false)
  assert.equal(report.routePlan.length, 9)
  assert.equal(report.routeCoverage.totalMobileRoleCount, 9)
  assert.equal(report.routeCoverage.selectedRoleCount, 9)
  assert.equal(report.routeCoverage.coversAllRolesByDefault, true)
  assert.equal(report.routeCoverage.coversPhoneAndIpad, true)
  assert.equal(
    report.routeCoverage.validatesProductionSinglePortRolePaths,
    true
  )
  assert.equal(report.routeCoverage.usesMockRpcOnly, true)
  assert.equal(report.readyForMockSmoke, true)
  assert.deepEqual(report.blockers, [])
  assert(
    report.routePlan.some(
      (item) =>
        item.roleKey === 'engineering' &&
        item.taskPath === '/m/engineering/tasks'
    )
  )
  assert.match(report.nextCommand, /smoke:mobile-auth-login-route/)
  assert.match(report.boundary, /does not start Vite/)
  assert.match(report.boundary, /does not.*JSON-RPC/)
})

test('mobile auth login route smoke CLI writes preflight report without runtime side effects', () => {
  const reportPath = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    'output',
    'mobile-auth-login-route-smoke',
    'preflight-test.json'
  )
  fs.rmSync(reportPath, { force: true })

  const stdout = execFileSync(
    process.execPath,
    [
      scriptPath,
      '--preflight-report',
      'output/mobile-auth-login-route-smoke/preflight-test.json',
    ],
    {
      cwd: path.resolve(import.meta.dirname, '..', '..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        MOBILE_AUTH_SMOKE_APP_ID: '',
        MOBILE_AUTH_SMOKE_BASE_URL: '',
      },
    }
  )
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))

  assert.match(stdout, /preflight written/)
  assert.equal(report.scope, 'mobile-auth-login-route-smoke-preflight-report')
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.callsBackend, false)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.writesDatabase, false)
  assert.equal(report.readyForMockSmoke, true)
})
