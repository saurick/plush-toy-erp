import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const scriptPath = path.resolve(
  repoRoot,
  'web/scripts/trialDemoAccountBrowserSmoke.mjs'
)

test('trial demo account browser smoke CLI input template is no-write', () => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--print-input-template'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TRIAL_ACCOUNT_PASSWORD: '',
        ERP_ROLE_DEMO_PASSWORD: '',
        TRIAL_BROWSER_SMOKE_BASE_URL: '',
        TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL: '',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
  const template = JSON.parse(result.stdout)

  assert.equal(
    template.scope,
    'trial-demo-account-browser-smoke-input-template'
  )
  assert.equal(template.writesDatabase, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.startsBrowser, false)
  assert.equal(template.startsDevServer, false)
  assert.equal(template.readsCustomerConfigScript, false)
  assert.equal(template.downstreamCallsBackend, true)
  assert.equal(template.downstreamStartsBrowser, true)
  assert.equal(template.downstreamStartsDevServer, true)
  assert.equal(template.downstreamReadsCustomerConfigScript, true)
  assert.equal(template.desktopAccounts.length, 10)
  assert.equal(template.mobileAccounts.length, 9)
  assert.equal(template.menuProjectionCoverage.ok, true)
  assert.equal(template.menuProjectionCoverage.desktopAccountCount, 10)
  assert.equal(template.menuProjectionCoverage.mobileAccountCount, 9)
  assert.equal(
    template.menuProjectionCoverage.coversAdminDesktopPermissionCenter,
    true
  )
  assert.equal(
    template.menuProjectionCoverage.coversAdminBusinessMenuDenial,
    true
  )
  assert.equal(template.menuProjectionCoverage.coversMobileDeniedAdmin, true)
  assert.equal(template.menuProjectionCoverage.coversCustomerHiddenMenus, true)
  assert.equal(template.menuProjectionCoverage.coversLegacyMenuCleanup, true)
  const adminPlan = template.menuProjectionPlan.desktopAccounts.find(
    (account) => account.username === 'demo_admin'
  )
  assert.deepEqual(adminPlan.visibleExpectedMenus, ['权限管理'])
  assert.match(adminPlan.forbiddenMenus.join('\n'), /工作台/u)
  assert.match(
    template.commands.join('\n'),
    /--preflight-report output\/trial-demo-account-browser-smoke\/preflight\.json/u
  )
  assert.match(template.commands.join('\n'), /smoke:trial-demo-browser/u)
  assert.match(template.boundary, /does not prove browser login/u)
})

test('trial demo account browser smoke CLI preflight writes sanitized report', () => {
  const reportPath = path.join(
    repoRoot,
    'output/trial-demo-account-browser-smoke/preflight-test.json'
  )
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--preflight-report',
      'output/trial-demo-account-browser-smoke/preflight-test.json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TRIAL_ACCOUNT_PASSWORD: '',
        ERP_ROLE_DEMO_PASSWORD: '',
        TRIAL_BROWSER_SMOKE_BASE_URL: '',
        TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL: 'http://127.0.0.1:1/healthz',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /preflight report written/u)
  const reportText = readFileSync(reportPath, 'utf8')
  const report = JSON.parse(reportText)

  assert.equal(
    report.scope,
    'trial-demo-account-browser-smoke-preflight-report'
  )
  assert.equal(report.writesDatabase, false)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.readsCustomerConfigScript, false)
  assert.equal(report.readsPasswordValue, false)
  assert.equal(report.storesPasswordValue, false)
  assert.equal(report.storesAccessToken, false)
  assert.equal(report.storesAuthorizationHeader, false)
  assert.equal(report.passwordEnvPresent, false)
  assert.deepEqual(report.presentPasswordEnvNames, [])
  assert.equal(report.menuProjectionCoverage.ok, true)
  assert.equal(report.menuProjectionCoverage.desktopAccountCount, 10)
  assert.equal(report.menuProjectionCoverage.mobileAccountCount, 9)
  assert.equal(report.menuProjectionCoverage.coversMobileDeniedAdmin, true)
  assert.deepEqual(report.menuProjectionCoverage.blockers, [])
  assert.equal(report.readyForRealSmoke, false)
  assert.match(report.blockers.join('\n'), /missing-demo-password-env/u)
  assert.match(report.blockers.join('\n'), /backend-health-unreachable/u)
  assert.doesNotMatch(
    report.blockers.join('\n'),
    /menu-projection-plan-incomplete/u
  )
  assert.doesNotMatch(reportText, /Bearer|access_token|replace-with-password/u)
})

test('trial demo account browser smoke source keeps no-write template before runtime', () => {
  const source = readFileSync(scriptPath, 'utf8')

  assert.match(source, /--print-input-template/u)
  assert.match(source, /--preflight-report/u)
  assert.match(source, /startsBrowser: false/u)
  assert.match(source, /startsDevServer: false/u)
  assert.match(source, /callsJSONRPC: false/u)
  assert.match(source, /readsCustomerConfigScript: false/u)
  assert.match(source, /storesAuthorizationHeader: false/u)
  assert.match(source, /TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD/u)
  assert.match(source, /menuProjectionCoverage/u)
  assert.match(source, /menu-projection-plan-incomplete/u)
  assert.match(source, /coversAdminBusinessMenuDenial/u)
  assert.match(source, /coversLegacyMenuCleanup/u)
  assert.match(source, /demo_admin/u)
  assert.match(source, /expectSuccess: false/u)
  assert.match(source, /URL must not contain username or password/u)
  assert.match(source, /该账号暂无当前入口权限，请联系管理员。/u)
})
