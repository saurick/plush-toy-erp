import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import {
  buildInputTemplate,
  buildPreflightReport,
  buildSimulatedBossDoneTask,
  buildSimulatedBossRejectTask,
  buildSimulatedBossTask,
  buildSimulatedWarehouseTask,
  buildSimulatedTaskPlan,
  buildSimulatedTaskPlanCoverage,
  parseCliArgs,
  sanitizeRunId,
} from '../../web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const scriptPath = path.resolve(
  repoRoot,
  'web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs'
)

test('mobile workflow runtime browser smoke creates simulated workflow task only', () => {
  const options = parseCliArgs(['--run-id', 'browser demo'])
  const bossTask = buildSimulatedBossTask(options)
  const bossDoneTask = buildSimulatedBossDoneTask(options)
  const bossRejectTask = buildSimulatedBossRejectTask(options)
  const warehouseTask = buildSimulatedWarehouseTask(options, 88)

  assert.equal(options.runId, 'BROWSER-DEMO')
  assert.equal(bossTask.customer_key, 'yoyoosun')
  assert.match(bossTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u)
  assert.equal(bossTask.task_group, 'order_approval')
  assert.equal(bossTask.owner_role_key, 'boss')
  assert.equal(bossTask.task_status_key, 'ready')
  assert.equal(bossTask.payload.simulated_only, true)
  assert.equal(bossTask.payload.mobile_workflow_browser_smoke, true)
  assert.equal(bossTask.payload.critical_path, true)
  assert.equal(bossTask.payload.notification_type, 'approval_required')
  assert.match(bossTask.payload.complete_condition, /岗位任务端/u)

  assert.equal(bossDoneTask.customer_key, 'yoyoosun')
  assert.match(bossDoneTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u)
  assert.equal(bossDoneTask.task_group, 'order_approval')
  assert.equal(bossDoneTask.owner_role_key, 'boss')
  assert.equal(bossDoneTask.task_status_key, 'ready')
  assert.equal(bossDoneTask.business_status_key, 'project_pending')
  assert.equal(bossDoneTask.payload.simulated_only, true)
  assert.equal(bossDoneTask.payload.mobile_workflow_browser_smoke, true)
  assert.equal(bossDoneTask.payload.notification_type, 'approval_required')
  assert.match(bossDoneTask.payload.complete_condition, /完成反馈/u)

  assert.equal(bossRejectTask.customer_key, 'yoyoosun')
  assert.match(bossRejectTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u)
  assert.equal(bossRejectTask.task_group, 'order_approval')
  assert.equal(bossRejectTask.owner_role_key, 'boss')
  assert.equal(bossRejectTask.task_status_key, 'ready')
  assert.equal(bossRejectTask.business_status_key, 'project_pending')
  assert.equal(bossRejectTask.payload.simulated_only, true)
  assert.equal(bossRejectTask.payload.mobile_workflow_browser_smoke, true)
  assert.equal(bossRejectTask.payload.notification_type, 'approval_required')
  assert.match(bossRejectTask.payload.complete_condition, /退回/u)

  assert.equal(warehouseTask.customer_key, 'yoyoosun')
  assert.match(warehouseTask.task_code, /^SIM-YOYOOSUN-MOBILE-BROWSER-/u)
  assert.equal(warehouseTask.task_group, 'shipment_release')
  assert.equal(warehouseTask.owner_role_key, 'warehouse')
  assert.equal(warehouseTask.assignee_id, 88)
  assert.equal(warehouseTask.task_status_key, 'ready')
  assert.equal(warehouseTask.payload.simulated_only, true)
  assert.equal(warehouseTask.payload.mobile_workflow_browser_smoke, true)
  assert.equal(warehouseTask.payload.critical_path, true)
  assert.equal(
    warehouseTask.payload.notification_type,
    'shipment_release_pending'
  )
  assert.match(warehouseTask.payload.complete_condition, /催办/u)
})

test('mobile workflow runtime browser smoke keeps safe run id boundary', () => {
  assert.equal(sanitizeRunId('  a/b c  '), 'A-B-C')
  assert.throws(() => sanitizeRunId(''), /runId/u)
  assert.throws(() => sanitizeRunId('123456789012345678901'), /runId/u)
})

test('mobile workflow runtime browser smoke rejects credentialed URLs', async () => {
  assert.throws(
    () => parseCliArgs(['--base-url', 'http://demo:secret@127.0.0.1:4195']),
    /URL must not contain username or password/u
  )
  assert.throws(
    () =>
      parseCliArgs(['--backend-url', 'http://demo:secret@127.0.0.1:8300']),
    /URL must not contain username or password/u
  )
  assert.throws(
    () => parseCliArgs(['--preflight-report', '/tmp/mobile-workflow.json']),
    /must stay inside the repository/u
  )

  const source = await readFile(scriptPath, 'utf8')
  assert.match(
    source,
    /MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL[\s\S]+assertNoURLCredentials\(backendHealthURL\)/u
  )
})

test('mobile workflow runtime browser smoke input template is no-write', () => {
  const template = buildInputTemplate(parseCliArgs(['--run-id', 'template']))

  assert.equal(
    template.scope,
    'mobile-workflow-runtime-browser-smoke-input-template'
  )
  assert.equal(template.writesDatabase, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.startsBrowser, false)
  assert.equal(template.startsDevServer, false)
  assert.equal(template.readsLocalConfig, false)
  assert.equal(template.createsWorkflowTasks, false)
  assert.equal(template.downstreamCreatesWorkflowTasks, true)
  assert.equal(template.downstreamStartsBrowser, true)
  assert.equal(template.downstreamCallsBackend, true)
  assert.deepEqual(template.secretInputs, [
    'MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD or TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD',
  ])
  assert.equal(template.simulatedTaskPlan.length, 4)
  assert.equal(template.simulatedTaskPlanCoverage.ok, true)
  assert.deepEqual(template.simulatedTaskPlanCoverage.actions, [
    'block',
    'complete',
    'reject',
    'urge-only',
  ])
  assert.equal(template.simulatedTaskPlanCoverage.coversCompletionFeedback, true)
  assert.equal(template.simulatedTaskPlanCoverage.coversExceptionReport, true)
  assert.equal(
    template.simulatedTaskPlanCoverage.coversInternalNotificationHints,
    true
  )
  assert(
    template.simulatedTaskPlan.some(
      (item) =>
        item.ownerRoleKey === 'boss' &&
        item.taskGroup === 'order_approval' &&
        item.browserAction === 'complete' &&
        item.simulatedOnly === true
    )
  )
  assert(
    template.simulatedTaskPlan.some(
      (item) =>
        item.ownerRoleKey === 'warehouse' &&
        item.browserAction === 'urge-only' &&
        item.simulatedOnly === true
    )
  )
  assert.match(
    template.commands.join('\n'),
    /smoke:mobile-workflow-runtime-browser/u
  )
  assert.match(template.commands.join('\n'), /--preflight-report/u)
  assert.match(template.boundary, /does not prove mobile workflow/u)
  assert.match(template.boundary, /simulated_only workflow task evidence/u)
})

test('mobile workflow runtime browser smoke simulated task plan covers required actions and notifications', () => {
  const plan = buildSimulatedTaskPlan()
  const coverage = buildSimulatedTaskPlanCoverage(plan)

  assert.equal(plan.length, 4)
  assert.equal(coverage.ok, true)
  assert.equal(coverage.taskCount, 4)
  assert.deepEqual(coverage.ownerRoleKeys, ['boss', 'warehouse'])
  assert.equal(coverage.allSimulatedOnly, true)
  assert.equal(coverage.allKeepEvidenceRefs, true)
  assert.equal(coverage.coversBossBlock, true)
  assert.equal(coverage.coversBossComplete, true)
  assert.equal(coverage.coversBossReject, true)
  assert.equal(coverage.coversCrossRoleUrge, true)
  assert.equal(coverage.coversReasonRequiredActions, true)
  assert.equal(coverage.coversCompletionFeedback, true)
  assert.equal(coverage.coversExceptionReport, true)
  assert.equal(coverage.coversInternalNotificationHints, true)
  assert.deepEqual(coverage.notificationTypes, [
    'approval_required',
    'shipment_release_pending',
  ])

  const incompleteCoverage = buildSimulatedTaskPlanCoverage(
    plan.filter((item) => item.browserAction !== 'reject')
  )
  assert.equal(incompleteCoverage.ok, false)
  assert(incompleteCoverage.blockers.includes('missing-boss-reject-action'))
  assert(incompleteCoverage.blockers.includes('expected-four-simulated-tasks'))
})

test('mobile workflow runtime browser smoke preflight report is no-write and redacted', async () => {
  const previousHealthURL =
    process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL
  const previousPassword = process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD
  const previousTrialPassword = process.env.TRIAL_ACCOUNT_PASSWORD
  const previousRolePassword = process.env.ERP_ROLE_DEMO_PASSWORD
  process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL =
    'http://127.0.0.1:1/healthz'
  process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD = ''
  process.env.TRIAL_ACCOUNT_PASSWORD = ''
  process.env.ERP_ROLE_DEMO_PASSWORD = ''
  try {
    const report = await buildPreflightReport(
      parseCliArgs(['--run-id', 'preflight'])
    )
    const serialized = JSON.stringify(report)

    assert.equal(
      report.scope,
      'mobile-workflow-runtime-browser-smoke-preflight-report'
    )
    assert.equal(report.writesDatabase, false)
    assert.equal(report.callsJSONRPC, false)
    assert.equal(report.startsBrowser, false)
    assert.equal(report.startsDevServer, false)
    assert.equal(report.createsWorkflowTasks, false)
    assert.equal(report.readsPasswordValue, false)
    assert.equal(report.storesPasswordValue, false)
    assert.equal(report.storesAccessToken, false)
    assert.equal(report.storesAuthorizationHeader, false)
    assert.equal(report.passwordEnvPresent, false)
    assert.equal(report.readyForRealSmoke, false)
    assert.equal(report.simulatedTaskPlan.length, 4)
    assert.equal(report.simulatedTaskPlanCoverage.ok, true)
    assert.equal(report.simulatedTaskPlanCoverage.coversBossBlock, true)
    assert.equal(report.simulatedTaskPlanCoverage.coversBossComplete, true)
    assert.equal(report.simulatedTaskPlanCoverage.coversBossReject, true)
    assert.equal(report.simulatedTaskPlanCoverage.coversCrossRoleUrge, true)
    assert.equal(
      report.simulatedTaskPlanCoverage.coversInternalNotificationHints,
      true
    )
    assert(report.blockers.includes('missing-demo-password-env'))
    assert(report.blockers.includes('backend-health-unreachable'))
    assert.doesNotMatch(serialized, /replace-with-local-demo-password/u)
    assert.doesNotMatch(serialized, /Bearer/u)
    assert.doesNotMatch(serialized, /access_token/u)
  } finally {
    if (previousHealthURL === undefined) {
      delete process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL
    } else {
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL =
        previousHealthURL
    }
    if (previousPassword === undefined) {
      delete process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD
    } else {
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD = previousPassword
    }
    if (previousTrialPassword === undefined) {
      delete process.env.TRIAL_ACCOUNT_PASSWORD
    } else {
      process.env.TRIAL_ACCOUNT_PASSWORD = previousTrialPassword
    }
    if (previousRolePassword === undefined) {
      delete process.env.ERP_ROLE_DEMO_PASSWORD
    } else {
      process.env.ERP_ROLE_DEMO_PASSWORD = previousRolePassword
    }
  }
})

test('mobile workflow runtime browser smoke CLI input template does not start runtime or require password', () => {
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--print-input-template'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD: '',
        TRIAL_ACCOUNT_PASSWORD: '',
        ERP_ROLE_DEMO_PASSWORD: '',
        MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL: '',
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL: '',
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL: '',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
  const template = JSON.parse(result.stdout)

  assert.equal(
    template.scope,
    'mobile-workflow-runtime-browser-smoke-input-template'
  )
  assert.equal(template.writesDatabase, false)
  assert.equal(template.callsBackend, false)
  assert.equal(template.startsBrowser, false)
  assert.equal(template.startsDevServer, false)
  assert.equal(template.readsLocalConfig, false)
  assert.equal(template.createsWorkflowTasks, false)
  assert.equal(template.downstreamCreatesWorkflowTasks, true)
  assert.match(template.commands.join('\n'), /smoke:mobile-workflow-runtime-browser/u)
})

test('mobile workflow runtime browser smoke CLI preflight writes sanitized report without password', async () => {
  const reportPath = path.join(
    'output',
    'mobile-workflow-runtime-browser-smoke',
    'preflight-test.json'
  )
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--preflight-report', reportPath, '--run-id', 'preflight'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD: '',
        TRIAL_ACCOUNT_PASSWORD: '',
        ERP_ROLE_DEMO_PASSWORD: '',
        MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL: '',
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL: '',
        MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL:
          'http://127.0.0.1:1/healthz',
      },
    }
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /preflight report written/u)
  const report = JSON.parse(
    await readFile(path.resolve(repoRoot, reportPath), 'utf8')
  )
  const serialized = JSON.stringify(report)

  assert.equal(
    report.scope,
    'mobile-workflow-runtime-browser-smoke-preflight-report'
  )
  assert.equal(report.writesDatabase, false)
  assert.equal(report.callsJSONRPC, false)
  assert.equal(report.startsBrowser, false)
  assert.equal(report.startsDevServer, false)
  assert.equal(report.createsWorkflowTasks, false)
  assert.equal(report.passwordEnvPresent, false)
  assert.equal(report.readyForRealSmoke, false)
  assert.equal(report.simulatedTaskPlanCoverage.ok, true)
  assert.deepEqual(report.simulatedTaskPlanCoverage.actions, [
    'block',
    'complete',
    'reject',
    'urge-only',
  ])
  assert(report.blockers.includes('missing-demo-password-env'))
  assert(report.blockers.includes('backend-health-unreachable'))
  assert.doesNotMatch(serialized, /replace-with-local-demo-password/u)
  assert.doesNotMatch(serialized, /Bearer/u)
  assert.doesNotMatch(serialized, /access_token/u)
})

test('mobile workflow runtime browser smoke does not contain real import or fact writes', async () => {
  const source = await readFile(scriptPath, 'utf8')

  assert.match(source, /method: 'create_task'/u)
  assert.match(source, /URL must not contain username or password/u)
  assert.match(source, /getByRole\('button', \{ name: \/阻塞\/u \}\)/u)
  assert.match(source, /mobile-role-detail-reason-input/u)
  assert.match(source, /请先填写阻塞或退回原因/u)
  assert.match(source, /getByRole\('button', \{ name: \/完成\/u \}\)/u)
  assert.match(source, /mobile-role-nav-done/u)
  assert.match(source, /business_status_key, 'project_approved'/u)
  assert.match(source, /done task should retain mobile action evidence ref/u)
  assert.match(source, /getByRole\('button', \{ name: \/退回当前任务\/u \}\)/u)
  assert.match(source, /assert\.equal\(updatedBossRejectTask\.task_status_key, 'rejected'\)/u)
  assert.match(source, /rejected task should retain mobile action evidence ref/u)
  assert.match(source, /mobile-role-action-bar__button--urge/u)
  assert.match(source, /请先填写催办原因/u)
  assert.match(source, /催办已记录/u)
  assert.match(source, /当前岗位可查看并催办/u)
  assert.match(source, /last_urge_action/u)
  assert.match(source, /rejected=\$\{createdBossRejectTask\.task_code\}/u)
  assert.match(source, /done=\$\{createdBossDoneTask\.task_code\}/u)
  assert.match(source, /--print-input-template/u)
  assert.match(source, /startsBrowser: false/u)
  assert.match(source, /startsDevServer: false/u)
  assert.match(source, /createsWorkflowTasks: false/u)
  assert.doesNotMatch(source, /至少 5 个字/u)
  assert.doesNotMatch(source, /real[-_ ]?import/iu)
  assert.doesNotMatch(source, /\binventory_txns\b/u)
  assert.doesNotMatch(source, /\bpurchase_receipts\b/u)
  assert.doesNotMatch(source, /\bquality_inspections\b/u)
  assert.doesNotMatch(source, /\bfinance_facts\b/u)
})
