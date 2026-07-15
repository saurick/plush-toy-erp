import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { buildPreflightReport } from './trialDemoAccountBrowserSmoke.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const scriptPath = path.resolve(
  repoRoot,
  'web/scripts/trialDemoAccountBrowserSmoke.mjs'
)

function createMockYoyoosunEntryAuditRuntime() {
  return {
    async fetchText(url) {
      if (url.includes(':5177/customer-config.js')) {
        return {
          ok: true,
          status: 200,
          contentType: 'application/javascript',
          body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = Object.freeze({ customerKey: "yoyoosun" })',
        }
      }
      if (url.includes(':5175/customer-config.js')) {
        return {
          ok: true,
          status: 200,
          contentType: 'application/javascript',
          body: 'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = window.__PLUSH_ERP_CUSTOMER_CONFIG__ || null',
        }
      }
      if (url.includes(':5176/customer-config.js')) {
        return {
          ok: true,
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><html></html>',
        }
      }
      return {
        ok: false,
        status: 0,
        contentType: '',
        body: '',
      }
    },
    async fetchHead(url) {
      if (url.includes(':5177/customer-assets/yoyoosun/')) {
        return {
          ok: true,
          status: 200,
          contentType: 'image/svg+xml',
          body: '',
        }
      }
      if (url.includes(':5176/customer-assets/yoyoosun/')) {
        return {
          ok: true,
          status: 200,
          contentType: 'text/html',
          body: '',
        }
      }
      return {
        ok: false,
        status: 0,
        contentType: '',
        body: '',
      }
    },
    async getPortProcess(port) {
      if (port === '5177') {
        return {
          listening: true,
          pid: '5177',
          command: 'node web/scripts/startYoyoosunDev.mjs',
          cwd: repoRoot,
        }
      }
      return { listening: false, pid: '', command: '', cwd: '' }
    },
  }
}

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
  assert(
    template.mobileAccounts.some(
      (account) =>
        account.username === 'demo_sales' &&
        account.role === '业务' &&
        account.mobileTaskEntry === '业务岗位任务端'
    )
  )
  assert.equal(template.menuProjectionPlan.mobileAccounts.length, 9)
  assert(
    template.menuProjectionPlan.mobileDeniedAccounts.some(
      (account) =>
        account.username === 'demo_admin' &&
        account.role === '业务' &&
        account.mobileTaskEntry === '业务岗位任务端' &&
        account.expectedDenied === true
    )
  )
  assert.equal(template.menuProjectionCoverage.ok, true)
  assert.equal(template.menuProjectionCoverage.desktopAccountCount, 10)
  assert.equal(template.menuProjectionCoverage.mobileAccountCount, 9)
  assert.equal(
    template.menuProjectionCoverage.allMobileAccountsHaveEntries,
    true
  )
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
  assert.equal(
    template.effectiveSessionDiagnosticPlan.windowKey,
    '__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__'
  )
  assert.equal(template.yoyoosunEntryAuditPlan.requiredForExternalBaseURL, true)
  assert.match(template.yoyoosunEntryAuditPlan.command, /audit:yoyoosun-entry/u)
  assert.deepEqual(template.yoyoosunEntryAuditPlan.defaultPorts, [
    '5175',
    '5176',
    '5177',
    '5178',
    '5179',
    '15200',
    '15201',
    '15202',
    '15203',
    '15204',
  ])
  assert.equal(
    template.yoyoosunEntryAuditPlan.expectedCustomerConfigStatus,
    'yoyoosun_config'
  )
  assert.equal(
    template.yoyoosunEntryAuditPlan.expectedCustomerAssetStatus,
    'yoyoosun_asset'
  )
  assert(template.realSmokeRequires.includes('backend health is reachable'))
  assert(
    template.realSmokeRequires.includes(
      'audited yoyoosun frontend runtime is available'
    )
  )
  assert(template.notProvenByThisTemplate.includes('real browser login'))
  assert(
    template.notProvenByThisTemplate.includes(
      'ordinary account desktop menu projection'
    )
  )
  assert(
    template.notProvenByThisTemplate.includes(
      'customer config active revision source'
    )
  )
  assert.equal(
    template.effectiveSessionDiagnosticPlan.checkedDuringRealSmoke,
    true
  )
  assert.equal(template.effectiveSessionDiagnosticPlan.desktopOnly, true)
  assert.equal(template.effectiveSessionDiagnosticPlan.sanitizedOnly, true)
  assert.equal(
    template.effectiveSessionDiagnosticPlan.realSmokeReportPath,
    'output/trial-demo-account-browser-smoke/report.json'
  )
  assert.deepEqual(
    template.effectiveSessionDiagnosticPlan.acceptedProjectionModes,
    ['local_dev_customer_config_diagnostic']
  )
  assert.match(
    template.effectiveSessionDiagnosticPlan.boundary,
    /must not store tokens/
  )
  const adminPlan = template.menuProjectionPlan.desktopAccounts.find(
    (account) => account.username === 'demo_admin'
  )
  assert.deepEqual(adminPlan.visibleExpectedMenus, ['权限管理'])
  assert.match(adminPlan.forbiddenMenus.join('\n'), /工作台/u)
  for (const account of template.desktopAccounts) {
    if (account.username === 'demo_admin') {
      continue
    }
    assert(
      !account.expectedMenus.includes('业务看板'),
      `${account.username} must not expect yoyoosun hidden business dashboard`
    )
    assert(
      !account.expectedMenus.includes('异常处理'),
      `${account.username} must not expect yoyoosun hidden exception flow`
    )
  }
  const engineeringPlan = template.menuProjectionPlan.desktopAccounts.find(
    (account) => account.username === 'demo_engineering'
  )
  assert.deepEqual(engineeringPlan.visibleExpectedMenus, [
    '产品档案',
    '材料档案',
    '加工环节',
    '物料清单（BOM）',
    '任务看板',
    '模板打印中心',
  ])
  assert.match(
    template.commands.join('\n'),
    /--preflight-report output\/trial-demo-account-browser-smoke\/preflight\.json/u
  )
  assert.match(template.commands.join('\n'), /audit:yoyoosun-entry/u)
  assert.match(template.commands.join('\n'), /smoke:trial-demo-browser/u)
  assert.match(template.commands.join('\n'), /<audited-yoyoosun-url>/u)
  assert.doesNotMatch(template.commands.join('\n'), /127\.0\.0\.1:5175/u)
  assert.match(
    template.commands.join('\n'),
    /trialDemoAccountBrowserSmoke\.mjs --report output\/trial-demo-account-browser-smoke\/report\.json/u
  )
  assert.match(template.boundary, /does not prove browser login/u)
  assert.match(template.boundary, /audited yoyoosun frontend runtime/u)
  assert.match(template.boundary, /effective session diagnostic readback/u)
  assert.doesNotMatch(result.stdout, /"roleKey"/u)
  assert.doesNotMatch(result.stdout, /"path"\s*:\s*"\/m\//u)
  assert.doesNotMatch(result.stdout, /\/m\/[a-z]+\/tasks/u)
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
  assert.equal(report.preflightOnly, true)
  assert.equal(report.writesDatabase, false)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.readsCustomerConfigScript, false)
  assert.equal(report.readsPasswordValue, false)
  assert.equal(report.storesPasswordValue, false)
  assert.equal(report.storesAccessToken, false)
  assert.equal(report.storesAuthorizationHeader, false)
  assert.equal(report.storesRawCustomerPackage, false)
  assert.equal(report.storesActionList, false)
  assert.equal(report.passwordEnvPresent, false)
  assert.deepEqual(report.presentPasswordEnvNames, [])
  assert(report.realSmokeRequires.includes('backend health is reachable'))
  assert(
    report.realSmokeRequires.includes(
      'TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD is present'
    )
  )
  assert(report.notProvenByThisPreflight.includes('real browser login'))
  assert(report.notProvenByThisPreflight.includes('backend RBAC authorization'))
  assert(
    report.notProvenByThisPreflight.includes(
      'ordinary account desktop menu projection'
    )
  )
  assert(
    report.notProvenByThisPreflight.includes(
      'customer config active revision source'
    )
  )
  assert.equal(report.menuProjectionCoverage.ok, true)
  assert.equal(report.menuProjectionCoverage.desktopAccountCount, 10)
  assert.equal(report.menuProjectionCoverage.mobileAccountCount, 9)
  assert.equal(report.menuProjectionCoverage.coversMobileDeniedAdmin, true)
  assert.equal(report.menuProjectionCoverage.allMobileAccountsHaveEntries, true)
  assert.deepEqual(report.menuProjectionCoverage.blockers, [])
  for (const account of report.menuProjectionPlan.desktopAccounts) {
    if (account.username === 'demo_admin') {
      continue
    }
    assert(
      !account.configuredExpectedMenus.includes('业务看板'),
      `${account.username} must not configure yoyoosun hidden business dashboard as expected`
    )
    assert(
      !account.configuredExpectedMenus.includes('异常处理'),
      `${account.username} must not configure yoyoosun hidden exception flow as expected`
    )
  }
  assert(
    report.menuProjectionPlan.mobileAccounts.some(
      (account) =>
        account.username === 'demo_warehouse' &&
        account.role === '仓库' &&
        account.mobileTaskEntry === '仓库岗位任务端'
    )
  )
  assert(
    report.menuProjectionPlan.mobileDeniedAccounts.some(
      (account) =>
        account.username === 'demo_admin' &&
        account.role === '业务' &&
        account.mobileTaskEntry === '业务岗位任务端' &&
        account.expectedDenied === true
    )
  )
  assert.equal(
    report.yoyoosunEntryAudit.scope,
    'trial-demo-account-yoyoosun-entry-preflight'
  )
  assert.equal(report.yoyoosunEntryAudit.readOnly, true)
  assert.equal(report.yoyoosunEntryAudit.callsJSONRPC, false)
  assert.equal(report.yoyoosunEntryAudit.writesDatabase, false)
  assert.equal(report.yoyoosunEntryAudit.startsBrowser, false)
  assert.equal(report.yoyoosunEntryAudit.startsDevServer, false)
  assert.equal(report.yoyoosunEntryAudit.readsSecrets, false)
  assert.equal(report.yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun, true)
  assert.deepEqual(report.yoyoosunEntryAudit.checkedPorts, [
    '5175',
    '5176',
    '5177',
    '5178',
    '5179',
    '15200',
    '15201',
    '15202',
    '15203',
    '15204',
  ])
  assert(Array.isArray(report.yoyoosunEntryAudit.yoyoosunPorts))
  assert(Array.isArray(report.yoyoosunEntryAudit.auditedYoyoosunURLs))
  if (report.yoyoosunEntryAudit.yoyoosunPorts.length > 0) {
    const firstURL = report.yoyoosunEntryAudit.auditedYoyoosunURLs[0]
    assert.equal(report.yoyoosunEntryAudit.suggestedExternalBaseURL, firstURL)
    assert.match(
      report.suggestedRealSmokeCommand,
      new RegExp(
        `TRIAL_BROWSER_SMOKE_BASE_URL='${firstURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`,
        'u'
      )
    )
  } else {
    assert.equal(report.yoyoosunEntryAudit.suggestedExternalBaseURL, '')
    assert.doesNotMatch(
      report.suggestedRealSmokeCommand,
      /TRIAL_BROWSER_SMOKE_BASE_URL=/u
    )
  }
  assert.match(
    report.suggestedRealSmokeCommand,
    /--report output\/trial-demo-account-browser-smoke\/report\.json/u
  )
  assert(
    report.yoyoosunEntryAudit.notProvenByThisAudit.includes(
      'ordinary account menu projection'
    )
  )
  assert.equal(
    report.effectiveSessionDiagnosticPlan.windowKey,
    '__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__'
  )
  assert.equal(
    report.effectiveSessionDiagnosticPlan.checkedDuringRealSmoke,
    true
  )
  assert.equal(report.effectiveSessionDiagnosticPlan.desktopOnly, true)
  assert.equal(report.effectiveSessionDiagnosticPlan.sanitizedOnly, true)
  assert.equal(
    report.effectiveSessionDiagnosticPlan.realSmokeReportPath,
    'output/trial-demo-account-browser-smoke/report.json'
  )
  assert.match(
    report.effectiveSessionDiagnosticPlan.boundary,
    /customer package payloads/
  )
  assert.equal(report.readyForRealSmoke, false)
  assert.match(report.blockers.join('\n'), /missing-demo-password-env/u)
  assert.match(report.blockers.join('\n'), /backend-health-unreachable/u)
  assert.doesNotMatch(
    report.blockers.join('\n'),
    /menu-projection-plan-incomplete/u
  )
  assert.doesNotMatch(
    report.blockers.join('\n'),
    /external-base-url-not-yoyoosun-entry/u
  )
  assert.doesNotMatch(reportText, /Bearer|access_token|replace-with-password/u)
  assert.doesNotMatch(reportText, /"roleKey"/u)
  assert.doesNotMatch(reportText, /"path"\s*:\s*"\/m\//u)
  assert.doesNotMatch(reportText, /\/m\/[a-z]+\/tasks/u)
})

test('trial demo account browser smoke preflight supports deterministic yoyoosun entry audit', async () => {
  const report = await buildPreflightReport(
    createMockYoyoosunEntryAuditRuntime()
  )

  assert.equal(report.yoyoosunEntryAudit.readOnly, true)
  assert.equal(report.yoyoosunEntryAudit.callsJSONRPC, false)
  assert.equal(report.yoyoosunEntryAudit.writesDatabase, false)
  assert.equal(report.yoyoosunEntryAudit.startsBrowser, false)
  assert.equal(report.yoyoosunEntryAudit.startsDevServer, false)
  assert.deepEqual(report.yoyoosunEntryAudit.checkedPorts, [
    '5175',
    '5176',
    '5177',
    '5178',
    '5179',
    '15200',
    '15201',
    '15202',
    '15203',
    '15204',
  ])
  assert.deepEqual(report.yoyoosunEntryAudit.yoyoosunPorts, ['5177'])
  assert.deepEqual(report.yoyoosunEntryAudit.auditedYoyoosunURLs, [
    'http://localhost:5177/erp',
  ])
  assert.equal(
    report.yoyoosunEntryAudit.suggestedExternalBaseURL,
    'http://localhost:5177/erp'
  )
  assert.match(
    report.suggestedRealSmokeCommand,
    /TRIAL_BROWSER_SMOKE_BASE_URL='http:\/\/localhost:5177\/erp'/u
  )
  assert.equal(report.yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun, true)
})

test('trial demo account browser smoke preflight blocks external non-yoyoosun base URL', () => {
  const reportPath = path.join(
    repoRoot,
    'output/trial-demo-account-browser-smoke/preflight-external-port-test.json'
  )
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--preflight-report',
      'output/trial-demo-account-browser-smoke/preflight-external-port-test.json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TRIAL_ACCOUNT_PASSWORD: 'present-for-preflight-only',
        ERP_ROLE_DEMO_PASSWORD: '',
        TRIAL_BROWSER_SMOKE_BASE_URL: 'http://127.0.0.1:1',
        TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL: 'http://127.0.0.1:1/healthz',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))

  assert.equal(report.yoyoosunEntryAudit.externalBaseURL, 'http://127.0.0.1:1')
  assert.equal(report.yoyoosunEntryAudit.externalPort, '1')
  assert.equal(
    report.yoyoosunEntryAudit.suggestedExternalBaseURL,
    'http://127.0.0.1:1'
  )
  assert.match(
    report.suggestedRealSmokeCommand,
    /TRIAL_BROWSER_SMOKE_BASE_URL='http:\/\/127\.0\.0\.1:1'/u
  )
  assert.equal(report.yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun, false)
  assert.match(
    report.blockers.join('\n'),
    /external-base-url-not-yoyoosun-entry/u
  )
  assert.equal(report.readyForRealSmoke, false)
})

test('trial demo account browser smoke report requires credentials before writing', () => {
  const reportPath = path.join(
    repoRoot,
    'output/trial-demo-account-browser-smoke/report-no-password-test.json'
  )
  rmSync(reportPath, { force: true })
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--report',
      'output/trial-demo-account-browser-smoke/report-no-password-test.json',
    ],
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

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /缺少账号密码/u)
  assert.equal(existsSync(reportPath), false)
})

test('trial demo account browser smoke report path stays inside repository', () => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--report', '../trial-demo-account-browser-smoke.json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TRIAL_ACCOUNT_PASSWORD: '',
        ERP_ROLE_DEMO_PASSWORD: '',
      },
    }
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /--report must stay inside the repository/u)
})

test('trial demo account browser smoke source keeps no-write template before runtime', () => {
  const source = readFileSync(scriptPath, 'utf8')

  assert.match(source, /--print-input-template/u)
  assert.match(source, /--preflight-report/u)
  assert.match(source, /--report/u)
  assert.match(source, /buildRealSmokeReport/u)
  assert.match(source, /sanitizeEffectiveSessionDiagnostic/u)
  assert.match(source, /startsBrowser: false/u)
  assert.match(source, /startsDevServer: false/u)
  assert.match(source, /callsJSONRPC: false/u)
  assert.match(source, /readsCustomerConfigScript: false/u)
  assert.match(source, /storesAuthorizationHeader: false/u)
  assert.match(source, /storesActionList: false/u)
  assert.match(source, /storesRawCustomerPackage: false/u)
  assert.match(source, /releaseEvidence: false/u)
  assert.match(source, /productionDeploy: false/u)
  assert.match(source, /__PLUSH_ERP_EFFECTIVE_SESSION_DIAGNOSTIC__/u)
  assert.match(source, /verifyEffectiveSessionDiagnostic/u)
  assert.match(source, /local_dev_customer_config_diagnostic/u)
  assert.match(source, /configHash/u)
  assert.match(source, /authorizationHeader/u)
  assert.match(source, /rawId/u)
  assert.match(source, /entitlement/u)
  assert.match(source, /mobileDeniedPassed/u)
  assert.match(source, /diagnosticBlockerCount/u)
  assert.match(source, /desktopEffectiveSessionDiagnostics/u)
  assert.match(
    source,
    /TRIAL_BROWSER_SMOKE_EXPECT_EFFECTIVE_SESSION_DIAGNOSTIC/u
  )
  assert.match(source, /TRIAL_BROWSER_SMOKE_EFFECTIVE_SESSION_DIAGNOSTIC=off/u)
  assert.match(source, /TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD/u)
  assert.match(source, /menuProjectionCoverage/u)
  assert.match(source, /menu-projection-plan-incomplete/u)
  assert.match(source, /buildMobileAccountSummary/u)
  assert.match(source, /allMobileAccountsHaveEntries/u)
  assert.match(source, /buildYoyoosunLocalEntryAudit/u)
  assert.match(source, /defaultYoyoosunEntryAuditPorts/u)
  assert.match(source, /yoyoosunEntryAudit/u)
  assert.match(source, /external-base-url-not-yoyoosun-entry/u)
  assert.match(source, /coversAdminBusinessMenuDenial/u)
  assert.match(source, /coversLegacyMenuCleanup/u)
  assert.match(source, /demo_admin/u)
  assert.match(source, /expectSuccess: false/u)
  assert.match(source, /login-form-unavailable/u)
  assert.match(source, /describeLoginPageState/u)
  assert.match(
    source,
    /accountInput\s*\n\s*\.waitFor\(\{ state: 'visible', timeout: 8_000 \}\)/u
  )
  assert.doesNotMatch(
    source,
    /accountInput\.isVisible\(\{ timeout: 8_000 \}\)/u
  )
  assert.match(source, /URL must not contain username or password/u)
  assert.match(source, /当前账号不能使用所选工作方式，请联系系统管理员。/u)
})
