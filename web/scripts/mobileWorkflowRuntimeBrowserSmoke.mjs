import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'
import {
  loadDevPorts,
  resolveDevAuxPort,
} from '../../scripts/dev-ports.mjs'
import {
  buildYoyoosunLocalEntryAudit,
  defaultYoyoosunEntryAuditPorts,
} from './yoyoosunLocalEntryAudit.mjs'
import { getRoleDisplayName } from '../src/erp/utils/roleKeys.mjs'
import { getWorkflowTaskGroupLabel } from '../src/erp/utils/workflowTaskLabels.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const repoRoot = path.resolve(webDir, '..')
const devPorts = loadDevPorts(repoRoot)
const outputDir = path.resolve(
  webDir,
  'output',
  'playwright',
  'mobile-workflow-runtime-browser-smoke'
)
const trialCustomerConfigScriptPath = path.resolve(
  repoRoot,
  'config',
  'customers',
  'yoyoosun',
  'customer-config.example.js'
)
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8300'
const DEFAULT_BACKEND_HEALTH_URL = `${DEFAULT_BACKEND_URL}/healthz`
const DEFAULT_PORT = resolveDevAuxPort(
  devPorts,
  40,
  'mobile workflow browser smoke port'
)
const SIM_PREFIX = 'SIM-YOYOOSUN-MOBILE-BROWSER'
const REAL_SMOKE_REQUIREMENTS = Object.freeze([
  'local backend health is reachable',
  'demo password env is present',
  'frontend runtime is available or the script can start managed Vite',
  'external base URL is audited as yoyoosun config and asset when provided',
  'trial customer-config script exists',
  'simulated task plan coverage is complete',
])
const PREFLIGHT_NOT_PROVEN = Object.freeze([
  'real admin login',
  'backend RBAC / effective session for demo accounts',
  'browser rendering or mobile layout',
  'workflow task creation',
  'done / blocked / rejected / urge action submission',
  'completion feedback or internal notification display',
  'target environment release evidence',
])
const MOBILE_WORKFLOW_REPORT_STATUS_LABELS = Object.freeze({
  ready: '待处理',
  blocked: '已阻塞',
  done: '已完成',
  rejected: '已退回',
})
const MOBILE_WORKFLOW_REPORT_ACTION_LABELS = Object.freeze({
  block: '标记阻塞',
  blocked: '标记阻塞',
  complete: '完成任务',
  done: '完成任务',
  reject: '退回任务',
  rejected: '退回任务',
  'quality-complete': '完成成品质检任务',
  'warehouse-inbound-complete': '完成采购入库任务',
  urge: '催办协同',
  'urge-only': '催办协同',
})
const MOBILE_WORKFLOW_REPORT_NOTIFICATION_LABELS = Object.freeze({
  approval_required: '审批待处理提醒',
  finished_goods_qc_pending: '成品质检待处理提醒',
  inbound_pending: '入库待处理提醒',
  shipment_release_pending: '出货放行待处理提醒',
})

const usage = `用法:
  MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='replace-with-password' pnpm --dir web smoke:mobile-workflow-runtime-browser
  node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --print-input-template

环境变量:
  MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD   试用 / 演示账号密码；优先级高于 TRIAL_ACCOUNT_PASSWORD / ERP_ROLE_DEMO_PASSWORD
  TRIAL_ACCOUNT_PASSWORD                   兼容 trial demo smoke 的密码来源
  ERP_ROLE_DEMO_PASSWORD                   兼容 scripts/seed-role-demo-admins.sh 的密码来源
  MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL   已启动前端地址；不设置时脚本自动启动 Vite
  MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL 后端 JSON-RPC 地址，默认 ${DEFAULT_BACKEND_URL}
  MOBILE_WORKFLOW_BROWSER_SMOKE_HEADED=1   使用 headed 浏览器
  MOBILE_WORKFLOW_BROWSER_SMOKE_RUN_ID     可选唯一 runId，默认当前时间

只读前置:
  --print-input-template 只打印本地运行所需输入、模拟任务和命令模板，不登录、不调用后端、不启动浏览器、不写数据库。
  --preflight-report <path> 只写本地前置检查报告，不登录、不调用 JSON-RPC、不启动 Vite / 浏览器、不写数据库。
真实回归:
  --report <path> 真实浏览器回归通过后写本地脱敏报告；不保存密码、token、Authorization header、raw customer package 或 action 列表，不进入 release evidence。
`

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

function optionalText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

function getWorkflowReportRoleLabel(roleKey) {
  return getRoleDisplayName(roleKey, '岗位')
}

function getWorkflowReportTaskGroupLabel(taskGroup) {
  return getWorkflowTaskGroupLabel(taskGroup, '业务协同')
}

function getWorkflowReportStatusLabel(statusKey) {
  return MOBILE_WORKFLOW_REPORT_STATUS_LABELS[statusKey] || '任务状态'
}

function getWorkflowReportActionLabel(actionKey) {
  return MOBILE_WORKFLOW_REPORT_ACTION_LABELS[actionKey] || '任务动作'
}

function getWorkflowReportNotificationLabel(notificationType) {
  return (
    MOBILE_WORKFLOW_REPORT_NOTIFICATION_LABELS[notificationType] ||
    '内部通知提醒'
  )
}

function sanitizeRunId(value) {
  const text = optionalText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
  if (!text || text.length > 20) {
    throw new CliError('runId must be 1-20 safe characters')
  }
  return text
}

function buildTimestampRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}Z$/u, 'Z')
}

function normalizeBaseURL(raw, fallback) {
  const url = new URL(optionalText(raw) || fallback)
  assertNoURLCredentials(url)
  url.pathname = url.pathname.replace(/\/+$/u, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/+$/u, '')
}

function assertNoURLCredentials(url) {
  if (url.username || url.password) {
    throw new CliError('URL must not contain username or password', 2)
  }
}

function parseCliArgs(argv = []) {
  const options = {
    help: false,
    printInputTemplate: false,
    preflightReport: '',
    report: '',
    port: Number(
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PORT || DEFAULT_PORT
    ),
    baseURL: optionalText(process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL),
    externalBaseURLProvided: Boolean(
      optionalText(process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL)
    ),
    backendURL: normalizeBaseURL(
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL,
      DEFAULT_BACKEND_URL
    ),
    runId: sanitizeRunId(
      process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_RUN_ID || buildTimestampRunId()
    ),
    headed: process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_HEADED === '1',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '-h' || token === '--help') {
      options.help = true
      continue
    }
    if (token === '--print-input-template') {
      options.printInputTemplate = true
      continue
    }
    const equalIndex = token.indexOf('=')
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex)
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1)
    const value = inlineValue ?? argv[index + 1]
    if (!token.startsWith('--')) {
      throw new CliError(`unsupported argument: ${token}`, 2)
    }
    if (inlineValue === undefined) {
      index += 1
    }
    if (value === undefined || String(value).startsWith('--')) {
      throw new CliError(`missing value for --${key}`, 2)
    }
    switch (key) {
      case 'base-url':
        options.baseURL = value
        options.externalBaseURLProvided = true
        break
      case 'backend-url':
        options.backendURL = normalizeBaseURL(value, DEFAULT_BACKEND_URL)
        break
      case 'preflight-report':
        options.preflightReport = resolveRepoOutputPath(value)
        break
      case 'report':
        options.report = resolveLocalReportPath(value)
        break
      case 'run-id':
        options.runId = sanitizeRunId(value)
        break
      default:
        throw new CliError(`unknown option --${key}`, 2)
    }
  }

  options.baseURL = options.baseURL
    ? normalizeBaseURL(options.baseURL, `http://127.0.0.1:${options.port}`)
    : `http://127.0.0.1:${options.port}`
  return options
}

function resolveRepoOutputPath(raw) {
  const value = optionalText(raw)
  if (!value) {
    throw new CliError('missing value for --preflight-report', 2)
  }
  const resolved = path.resolve(repoRoot, value)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError('--preflight-report must stay inside the repository', 2)
  }
  return resolved
}

function resolveLocalReportPath(raw) {
  const value = optionalText(raw)
  if (!value) {
    throw new CliError('missing value for --report', 2)
  }
  const resolved = resolveRepoOutputPath(value)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith(`deployments${path.sep}`)) {
    throw new CliError(
      '--report must not be written under deployments evidence',
      2
    )
  }
  return resolved
}

function buildSimulatedTaskPlan() {
  return [
    {
      ownerRoleKey: 'boss',
      taskGroup: 'order_approval',
      browserAction: 'block',
      expectedTaskStatusAfterAction: 'blocked',
      requiresReason: true,
      expectsExceptionReport: true,
      expectsEvidenceRefs: true,
      notificationType: 'approval_required',
      simulatedOnly: true,
    },
    {
      ownerRoleKey: 'boss',
      taskGroup: 'order_approval',
      browserAction: 'complete',
      expectedTaskStatusAfterAction: 'done',
      expectedBusinessStatusAfterAction: 'project_approved',
      requiresReason: false,
      expectsCompletionFeedback: true,
      expectsDoneListFeedback: true,
      expectsEvidenceRefs: true,
      notificationType: 'approval_required',
      simulatedOnly: true,
    },
    {
      ownerRoleKey: 'boss',
      taskGroup: 'order_approval',
      browserAction: 'reject',
      expectedTaskStatusAfterAction: 'rejected',
      expectedBusinessStatusAfterAction: 'project_pending',
      requiresReason: true,
      expectsExceptionReport: true,
      expectsEvidenceRefs: true,
      notificationType: 'approval_required',
      simulatedOnly: true,
    },
    {
      ownerRoleKey: 'quality',
      taskGroup: 'finished_goods_qc',
      browserAction: 'quality-complete',
      expectedTaskStatusAfterAction: 'done',
      requiresReason: false,
      expectsCompletionFeedback: true,
      expectsDoneListFeedback: true,
      expectsEvidenceRefs: true,
      notificationType: 'finished_goods_qc_pending',
      simulatedOnly: true,
    },
    {
      ownerRoleKey: 'warehouse',
      taskGroup: 'warehouse_inbound',
      browserAction: 'warehouse-inbound-complete',
      expectedTaskStatusAfterAction: 'done',
      requiresReason: false,
      expectsCompletionFeedback: true,
      expectsDoneListFeedback: true,
      expectsEvidenceRefs: true,
      notificationType: 'inbound_pending',
      simulatedOnly: true,
    },
    {
      ownerRoleKey: 'warehouse',
      assigneeRoleHint: 'boss',
      taskGroup: 'shipment_release',
      browserAction: 'urge-only',
      expectedTaskStatusAfterAction: 'ready',
      forbiddenBrowserActions: ['block', 'complete'],
      requiresReason: true,
      expectsUrgeFeedback: true,
      expectsEvidenceRefs: true,
      notificationType: 'shipment_release_pending',
      simulatedOnly: true,
    },
  ]
}

function buildSimulatedTaskPlanCoverage(plan = buildSimulatedTaskPlan()) {
  const actionSet = new Set(plan.map((item) => item.browserAction))
  const roleSet = new Set(plan.map((item) => item.ownerRoleKey))
  const allSimulatedOnly = plan.every((item) => item.simulatedOnly === true)
  const allKeepEvidenceRefs = plan.every(
    (item) => item.expectsEvidenceRefs === true
  )
  const coversReasonRequiredActions = plan
    .filter((item) =>
      ['block', 'reject', 'urge-only'].includes(item.browserAction)
    )
    .every((item) => item.requiresReason === true)
  const coversNotificationTypes = [
    ...new Set(plan.map((item) => item.notificationType).filter(Boolean)),
  ].sort()
  const coverage = {
    taskCount: plan.length,
    actionLabels: [...actionSet]
      .map((action) => getWorkflowReportActionLabel(action))
      .sort(),
    ownerRoles: [...roleSet]
      .map((role) => getWorkflowReportRoleLabel(role))
      .sort(),
    allSimulatedOnly,
    allKeepEvidenceRefs,
    coversBossBlock: actionSet.has('block'),
    coversBossComplete: actionSet.has('complete'),
    coversBossReject: actionSet.has('reject'),
    coversQualityComplete: actionSet.has('quality-complete'),
    coversWarehouseInboundComplete: actionSet.has('warehouse-inbound-complete'),
    coversCrossRoleUrge: actionSet.has('urge-only'),
    coversReasonRequiredActions,
    coversCompletionFeedback: plan.some(
      (item) =>
        ['complete', 'quality-complete', 'warehouse-inbound-complete'].includes(
          item.browserAction
        ) &&
        item.expectsCompletionFeedback === true &&
        item.expectsDoneListFeedback === true
    ),
    coversExceptionReport: plan.some(
      (item) =>
        ['block', 'reject'].includes(item.browserAction) &&
        item.expectsExceptionReport === true
    ),
    coversInternalNotificationHints: coversNotificationTypes.length >= 2,
    notificationHints: coversNotificationTypes.map((notificationType) =>
      getWorkflowReportNotificationLabel(notificationType)
    ),
  }
  const blockers = []
  if (coverage.taskCount !== 6) blockers.push('expected-six-simulated-tasks')
  if (!coverage.allSimulatedOnly) blockers.push('task-plan-not-simulated-only')
  if (!coverage.allKeepEvidenceRefs) {
    blockers.push('missing-evidence-ref-coverage')
  }
  if (!coverage.coversBossBlock) blockers.push('missing-boss-block-action')
  if (!coverage.coversBossComplete) {
    blockers.push('missing-boss-complete-action')
  }
  if (!coverage.coversBossReject) blockers.push('missing-boss-reject-action')
  if (!coverage.coversQualityComplete) {
    blockers.push('missing-quality-complete-action')
  }
  if (!coverage.coversWarehouseInboundComplete) {
    blockers.push('missing-warehouse-inbound-complete-action')
  }
  if (!coverage.coversCrossRoleUrge) {
    blockers.push('missing-cross-role-urge-action')
  }
  if (!coverage.coversReasonRequiredActions) {
    blockers.push('missing-reason-required-coverage')
  }
  if (!coverage.coversCompletionFeedback) {
    blockers.push('missing-completion-feedback-coverage')
  }
  if (!coverage.coversExceptionReport) {
    blockers.push('missing-exception-report-coverage')
  }
  if (!coverage.coversInternalNotificationHints) {
    blockers.push('missing-internal-notification-hints')
  }
  return {
    ...coverage,
    ok: blockers.length === 0,
    blockers,
  }
}

function buildSimulatedTaskPlanSummary(plan = buildSimulatedTaskPlan()) {
  return plan.map((item) => ({
    ownerRole: getWorkflowReportRoleLabel(item.ownerRoleKey),
    taskGroupLabel: getWorkflowReportTaskGroupLabel(item.taskGroup),
    actionLabel: getWorkflowReportActionLabel(item.browserAction),
    expectedStatusLabel: getWorkflowReportStatusLabel(
      item.expectedTaskStatusAfterAction
    ),
    reasonRequired: item.requiresReason === true,
    completionFeedbackExpected: item.expectsCompletionFeedback === true,
    exceptionReportExpected: item.expectsExceptionReport === true,
    evidenceRefExpected: item.expectsEvidenceRefs === true,
    notificationHint: getWorkflowReportNotificationLabel(item.notificationType),
    simulatedOnly: item.simulatedOnly === true,
  }))
}

function buildInputTemplate(options = parseCliArgs(['--run-id', 'TEMPLATE'])) {
  const simulatedTaskPlan = buildSimulatedTaskPlan()
  const simulatedTaskPlanSummary =
    buildSimulatedTaskPlanSummary(simulatedTaskPlan)
  return {
    scope: 'mobile-workflow-runtime-browser-smoke-input-template',
    runId: options.runId,
    writesDatabase: false,
    callsBackend: false,
    startsBrowser: false,
    startsDevServer: false,
    readsLocalConfig: false,
    createsWorkflowTasks: false,
    downstreamCreatesWorkflowTasks: true,
    downstreamStartsBrowser: true,
    downstreamCallsBackend: true,
    secretInputs: [
      'MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD or TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD',
    ],
    optionalInputs: [
      'MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL',
      'MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_URL',
      'MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL',
      'MOBILE_WORKFLOW_BROWSER_SMOKE_HEADED',
      'MOBILE_WORKFLOW_BROWSER_SMOKE_PORT',
      'MOBILE_WORKFLOW_BROWSER_SMOKE_RUN_ID',
      '--report output/mobile-workflow-runtime-browser-smoke/report.json',
    ],
    defaultBaseURL: `http://127.0.0.1:${DEFAULT_PORT}`,
    defaultBackendURL: DEFAULT_BACKEND_URL,
    defaultBackendHealthURL: DEFAULT_BACKEND_HEALTH_URL,
    yoyoosunEntryAuditPlan: buildYoyoosunEntryAuditPlan(options),
    simulatedTaskPlanSummary,
    simulatedTaskPlanCoverage:
      buildSimulatedTaskPlanCoverage(simulatedTaskPlan),
    realSmokeRequires: [...REAL_SMOKE_REQUIREMENTS],
    notProvenByThisTemplate: [...PREFLIGHT_NOT_PROVEN],
    commands: [
      'PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web --silent audit:yoyoosun-entry -- --json',
      'PATH=/usr/local/bin:$PATH node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --preflight-report output/mobile-workflow-runtime-browser-smoke/preflight.json',
      "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH pnpm --dir web smoke:mobile-workflow-runtime-browser",
      "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --report output/mobile-workflow-runtime-browser-smoke/report.json",
      "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>' MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL='<audited-yoyoosun-url>' PATH=/usr/local/bin:$PATH node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs --report output/mobile-workflow-runtime-browser-smoke/report.json",
    ],
    boundary:
      'This template does not prove mobile workflow browser behavior, backend health, login, task creation, action submission, notification hints, yoyoosun entry ownership, or customer config active revision until a local backend, audited frontend runtime or managed Vite, and demo password are provided. The real smoke writes simulated_only workflow task evidence only.',
  }
}

function buildYoyoosunEntryAuditPlan(options) {
  return {
    command:
      'PATH=/usr/local/bin:$PATH /usr/local/bin/pnpm --dir web --silent audit:yoyoosun-entry -- --json',
    scope: 'mobile-workflow-frontend-entry-preflight',
    requiredForExternalBaseURL: true,
    externalBaseURLProvided: Boolean(options.externalBaseURLProvided),
    externalBaseURL: options.externalBaseURLProvided ? options.baseURL : '',
    expectedCustomerConfigStatus: 'yoyoosun_config',
    expectedCustomerAssetStatus: 'yoyoosun_asset',
    boundary:
      'Managed Vite injects yoyoosun config inside the Playwright browser route; an explicitly supplied external base URL must already serve yoyoosun customer-config.js and assets.',
  }
}

async function probeURL(url, { timeoutMs = 3000 } = {}) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    })
    return {
      ok: response.ok || response.status === 302 || response.status === 304,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      error: '',
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      elapsedMs: Date.now() - startedAt,
      error:
        error?.name === 'AbortError'
          ? 'timeout'
          : String(error?.message || error),
    }
  } finally {
    clearTimeout(timer)
  }
}

async function buildPreflightReport(options, runtime = {}) {
  const backendHealthURL = new URL(
    process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL ||
      DEFAULT_BACKEND_HEALTH_URL
  )
  assertNoURLCredentials(backendHealthURL)
  const passwordEnvNames = [
    'MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD',
    'TRIAL_ACCOUNT_PASSWORD',
    'ERP_ROLE_DEMO_PASSWORD',
  ]
  const presentPasswordEnvNames = passwordEnvNames.filter((name) =>
    Boolean(optionalText(process.env[name]))
  )
  const backendHealth = await probeURL(backendHealthURL.toString())
  const yoyoosunEntryAudit = await buildMobileYoyoosunEntryAudit(
    options,
    backendHealthURL.toString(),
    runtime.yoyoosunEntryAudit || runtime
  )
  const suggestedRealSmokeCommand = [
    "MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD='<local-demo-password>'",
    yoyoosunEntryAudit.suggestedExternalBaseURL
      ? `MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL='${yoyoosunEntryAudit.suggestedExternalBaseURL}'`
      : '',
    'PATH=/usr/local/bin:$PATH',
    'node web/scripts/mobileWorkflowRuntimeBrowserSmoke.mjs',
    '--report output/mobile-workflow-runtime-browser-smoke/report.json',
  ]
    .filter(Boolean)
    .join(' ')
  const simulatedTaskPlan = buildSimulatedTaskPlan()
  const simulatedTaskPlanSummary =
    buildSimulatedTaskPlanSummary(simulatedTaskPlan)
  const simulatedTaskPlanCoverage =
    buildSimulatedTaskPlanCoverage(simulatedTaskPlan)
  const needsManagedDevServer = !optionalText(
    process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL
  )
  const customerConfigScript = await fs
    .stat(trialCustomerConfigScriptPath)
    .then((stat) => ({
      path: path.relative(repoRoot, trialCustomerConfigScriptPath),
      exists: stat.isFile(),
      size: stat.size,
    }))
    .catch((error) => ({
      path: path.relative(repoRoot, trialCustomerConfigScriptPath),
      exists: false,
      size: 0,
      error: String(error?.message || error),
    }))
  const blockers = []
  if (presentPasswordEnvNames.length === 0) {
    blockers.push('missing-demo-password-env')
  }
  if (!backendHealth.ok) {
    blockers.push('backend-health-unreachable')
  }
  if (!customerConfigScript.exists) {
    blockers.push('missing-trial-customer-config-script')
  }
  if (!simulatedTaskPlanCoverage.ok) {
    blockers.push('simulated-task-plan-incomplete')
  }
  if (!yoyoosunEntryAudit.externalBaseURLMatchesYoyoosun) {
    blockers.push('external-base-url-not-yoyoosun-entry')
  }

  return {
    scope: 'mobile-workflow-runtime-browser-smoke-preflight-report',
    generatedAt: new Date().toISOString(),
    writesDatabase: false,
    preflightOnly: true,
    callsJSONRPC: false,
    startsBrowser: false,
    startsDevServer: false,
    createsWorkflowTasks: false,
    readsPasswordValue: false,
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    backendEndpointAlias: new URL(options.backendURL).origin,
    backendHealthURL: backendHealthURL.toString(),
    backendHealth,
    baseURL: options.baseURL,
    needsManagedDevServer,
    yoyoosunEntryAuditPlan: buildYoyoosunEntryAuditPlan(options),
    yoyoosunEntryAudit,
    passwordEnvPresent: presentPasswordEnvNames.length > 0,
    presentPasswordEnvNames,
    customerConfigScript,
    simulatedTaskPlanSummary,
    simulatedTaskPlanCoverage,
    realSmokeRequires: [...REAL_SMOKE_REQUIREMENTS],
    notProvenByThisPreflight: [...PREFLIGHT_NOT_PROVEN],
    suggestedRealSmokeCommand,
    readyForRealSmoke: blockers.length === 0,
    blockers,
    nextCommand: blockers.length
      ? 'Resolve blockers, then rerun this preflight before real browser smoke.'
      : suggestedRealSmokeCommand,
  }
}

async function buildMobileYoyoosunEntryAudit(
  options,
  backendHealthURL,
  runtime = {}
) {
  const auditedPorts = options.externalBaseURLProvided
    ? [getPortFromURL(options.baseURL)]
    : [...defaultYoyoosunEntryAuditPorts]
  const report = await buildYoyoosunLocalEntryAudit(
    {
      customer: 'yoyoosun',
      ports: auditedPorts,
      backendHealthURL,
    },
    runtime
  )
  const externalPort = options.externalBaseURLProvided
    ? getPortFromURL(options.baseURL)
    : ''
  const externalPortReport = externalPort
    ? report.ports.find((item) => item.port === externalPort) || null
    : null
  const auditedYoyoosunURLs = report.summary.yoyoosunPorts.map(
    (port) => `http://localhost:${port}/erp`
  )

  return {
    scope: 'mobile-workflow-yoyoosun-entry-preflight',
    readOnly: true,
    callsJSONRPC: false,
    writesDatabase: false,
    startsBrowser: false,
    startsDevServer: false,
    readsSecrets: false,
    externalBaseURL: options.externalBaseURLProvided ? options.baseURL : '',
    externalPort,
    checkedPorts: report.summary.checkedPorts,
    yoyoosunPorts: report.summary.yoyoosunPorts,
    auditedYoyoosunURLs,
    suggestedExternalBaseURL: options.externalBaseURLProvided
      ? options.baseURL
      : auditedYoyoosunURLs[0] || '',
    productCorePlaceholderPorts: report.summary.productCorePlaceholderPorts,
    htmlFallbackPorts: report.summary.htmlFallbackPorts,
    readyForStaticYoyoosunPreview: report.summary.readyForStaticYoyoosunPreview,
    externalBaseURLMatchesYoyoosun:
      !options.externalBaseURLProvided ||
      Boolean(
        externalPortReport?.customerConfig?.matchedCustomer &&
          externalPortReport?.customerAsset?.matchedCustomerAsset
      ),
    externalPortStatus: externalPortReport
      ? {
          config: externalPortReport.customerConfig.status,
          asset: externalPortReport.customerAsset.status,
          cwd: externalPortReport.process.cwd || '',
          command: externalPortReport.process.command || '',
        }
      : null,
    notProvenByThisAudit: report.notProvenByThisAudit,
  }
}

function getPortFromURL(rawURL) {
  const url = new URL(rawURL)
  if (url.port) return url.port
  return url.protocol === 'https:' ? '443' : '80'
}

async function writeJSONReport(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`)
  await fs.rename(`${filePath}.tmp`, filePath)
}

function buildSmokeReport({
  options,
  browserResult,
  createdBossTask,
  createdBossDoneTask,
  createdBossRejectTask,
  createdQualityTask,
  createdWarehouseInboundTask,
  createdWarehouseTask,
  updatedBossTask,
  updatedBossDoneTask,
  updatedBossRejectTask,
  updatedQualityTask,
  updatedWarehouseInboundTask,
  updatedWarehouseTask,
}) {
  const detailNoOverflow =
    Number.isFinite(browserResult.metrics?.scrollWidth) &&
    Number.isFinite(browserResult.metrics?.clientWidth) &&
    browserResult.metrics.scrollWidth <= browserResult.metrics.clientWidth + 1
  const urgeNoOverflow =
    Number.isFinite(browserResult.urgeMetrics?.scrollWidth) &&
    Number.isFinite(browserResult.urgeMetrics?.clientWidth) &&
    browserResult.urgeMetrics.scrollWidth <=
      browserResult.urgeMetrics.clientWidth + 1
  const qualityNoOverflow =
    Number.isFinite(browserResult.qualityMetrics?.scrollWidth) &&
    Number.isFinite(browserResult.qualityMetrics?.clientWidth) &&
    browserResult.qualityMetrics.scrollWidth <=
      browserResult.qualityMetrics.clientWidth + 1
  const warehouseInboundNoOverflow =
    Number.isFinite(browserResult.warehouseInboundMetrics?.scrollWidth) &&
    Number.isFinite(browserResult.warehouseInboundMetrics?.clientWidth) &&
    browserResult.warehouseInboundMetrics.scrollWidth <=
      browserResult.warehouseInboundMetrics.clientWidth + 1
  const simulatedTaskPlanCoverage = buildSimulatedTaskPlanCoverage()

  return {
    scope: 'mobile-workflow-runtime-browser-smoke-report',
    generatedAt: new Date().toISOString(),
    runId: options.runId,
    baseURL: options.baseURL,
    backendEndpointAlias: new URL(options.backendURL).origin,
    simulatedOnly: true,
    realCustomerImport: false,
    releaseEvidence: false,
    writesDatabase: true,
    writesWorkflowTasks: true,
    writesBusinessFacts: false,
    factPosted: false,
    workflowFactBoundary:
      '真实浏览器回归只创建 simulated_only workflow tasks 并验证任务动作，不写库存、出货、财务或其它 Fact。',
    storesPasswordValue: false,
    storesAccessToken: false,
    storesAuthorizationHeader: false,
    storesRawCustomerPackage: false,
    storesRawActionRequest: false,
    storesRawWorkflowPayload: false,
    storesRedactedActionSummary: true,
    simulatedTaskPlanCoverage,
    screenshotDir: path.relative(repoRoot, outputDir),
    tasks: [
      {
        key: 'boss-block',
        taskCode: createdBossTask.task_code,
        ownerRole: getWorkflowReportRoleLabel(updatedBossTask.owner_role_key),
        taskGroupLabel: getWorkflowReportTaskGroupLabel(
          updatedBossTask.task_group
        ),
        statusLabel: getWorkflowReportStatusLabel(
          updatedBossTask.task_status_key
        ),
        actionLabel: getWorkflowReportActionLabel('blocked'),
        reasonRecorded:
          updatedBossTask.blocked_reason === browserResult.blockReason,
        evidenceRefRecorded:
          updatedBossTask.payload?.mobile_action_evidence_refs?.includes(
            browserResult.blockEvidence
          ) === true,
        exceptionReportRecorded:
          updatedBossTask.payload?.mobile_exception_report?.reason ===
          browserResult.blockReason,
      },
      {
        key: 'boss-complete',
        taskCode: createdBossDoneTask.task_code,
        ownerRole: getWorkflowReportRoleLabel(
          updatedBossDoneTask.owner_role_key
        ),
        taskGroupLabel: getWorkflowReportTaskGroupLabel(
          updatedBossDoneTask.task_group
        ),
        statusLabel: getWorkflowReportStatusLabel(
          updatedBossDoneTask.task_status_key
        ),
        actionLabel: getWorkflowReportActionLabel('done'),
        evidenceRefRecorded:
          updatedBossDoneTask.payload?.mobile_action_evidence_refs?.includes(
            browserResult.doneEvidence
          ) === true,
      },
      {
        key: 'boss-reject',
        taskCode: createdBossRejectTask.task_code,
        ownerRole: getWorkflowReportRoleLabel(
          updatedBossRejectTask.owner_role_key
        ),
        taskGroupLabel: getWorkflowReportTaskGroupLabel(
          updatedBossRejectTask.task_group
        ),
        statusLabel: getWorkflowReportStatusLabel(
          updatedBossRejectTask.task_status_key
        ),
        actionLabel: getWorkflowReportActionLabel('rejected'),
        reasonRecorded:
          updatedBossRejectTask.payload?.mobile_exception_report?.reason ===
          browserResult.rejectReason,
        evidenceRefRecorded:
          updatedBossRejectTask.payload?.mobile_action_evidence_refs?.includes(
            browserResult.rejectEvidence
          ) === true,
        exceptionReportRecorded:
          updatedBossRejectTask.payload?.mobile_exception_report?.reason ===
          browserResult.rejectReason,
      },
      {
        key: 'quality-complete',
        taskCode: createdQualityTask.task_code,
        ownerRole: getWorkflowReportRoleLabel(
          updatedQualityTask.owner_role_key
        ),
        taskGroupLabel: getWorkflowReportTaskGroupLabel(
          updatedQualityTask.task_group
        ),
        statusLabel: getWorkflowReportStatusLabel(
          updatedQualityTask.task_status_key
        ),
        actionLabel: getWorkflowReportActionLabel('done'),
        evidenceRefRecorded:
          updatedQualityTask.payload?.mobile_action_evidence_refs?.includes(
            browserResult.qualityEvidence
          ) === true,
      },
      {
        key: 'warehouse-inbound-complete',
        taskCode: createdWarehouseInboundTask.task_code,
        ownerRole: getWorkflowReportRoleLabel(
          updatedWarehouseInboundTask.owner_role_key
        ),
        taskGroupLabel: getWorkflowReportTaskGroupLabel(
          updatedWarehouseInboundTask.task_group
        ),
        statusLabel: getWorkflowReportStatusLabel(
          updatedWarehouseInboundTask.task_status_key
        ),
        actionLabel: getWorkflowReportActionLabel('done'),
        evidenceRefRecorded:
          updatedWarehouseInboundTask.payload?.mobile_action_evidence_refs?.includes(
            browserResult.warehouseInboundEvidence
          ) === true,
      },
      {
        key: 'warehouse-urge',
        taskCode: createdWarehouseTask.task_code,
        ownerRole: getWorkflowReportRoleLabel(
          updatedWarehouseTask.owner_role_key
        ),
        taskGroupLabel: getWorkflowReportTaskGroupLabel(
          updatedWarehouseTask.task_group
        ),
        statusLabel: getWorkflowReportStatusLabel(
          updatedWarehouseTask.task_status_key
        ),
        actionLabel: getWorkflowReportActionLabel('urge'),
        assigneeRole: getWorkflowReportRoleLabel('boss'),
        crossRoleActionOnly: true,
        urgeReasonRecorded:
          updatedWarehouseTask.payload?.last_urge_reason ===
          browserResult.urgeReason,
        evidenceRefRecorded:
          updatedWarehouseTask.payload?.mobile_action_evidence_refs?.includes(
            browserResult.urgeEvidence
          ) === true,
      },
    ],
    summary: {
      totalTasks: 6,
      blocked: 1,
      done: 3,
      rejected: 1,
      urged: 1,
      browserLayoutChecked: true,
      noHorizontalOverflow:
        detailNoOverflow &&
        urgeNoOverflow &&
        qualityNoOverflow &&
        warehouseInboundNoOverflow,
      simulatedTaskPlanCoverageOK: simulatedTaskPlanCoverage.ok,
      simulatedTaskPlanCoverageBlockers: simulatedTaskPlanCoverage.blockers,
    },
    notProvenByThisReport: [
      'target environment release evidence',
      'real customer data import',
      'customer sign-off',
      'backup restore rehearsal',
      'rollback or forward-fix rehearsal',
      'inventory, shipment, finance, purchase, or quality facts posted by workflow task completion',
    ],
    boundary:
      '该报告只证明本地后端、前端运行时、演示密码和真实浏览器链路在当前机器通过；不证明目标环境发布、真实客户导入、客户签收、备份恢复、回滚演练或 release evidence 完成。',
  }
}

function buildSimulatedBossTask(options) {
  const nowSec = Math.floor(Date.now() / 1000)
  const sourceID = 920000 + Math.floor(nowSec % 100000)
  const prefix = `${SIM_PREFIX}-${options.runId}`
  return {
    task_code: `${prefix}-BOSS`,
    task_group: 'order_approval',
    task_name: `移动端浏览器模拟老板审批 ${options.runId}`,
    source_type: 'project-orders',
    source_id: sourceID,
    source_no: `${prefix}-SO`,
    business_status_key: 'project_pending',
    task_status_key: 'ready',
    owner_role_key: 'boss',
    priority: 3,
    due_at: nowSec + 86400,
    payload: {
      simulated_only: true,
      simulation_prefix: SIM_PREFIX,
      mobile_workflow_browser_smoke: true,
      customer_name: 'Mobile workflow 浏览器模拟客户',
      style_no: 'MOBILE-BROWSER',
      product_name: 'Mobile workflow 浏览器模拟产品',
      quantity: '12',
      unit: 'pcs',
      critical_path: true,
      complete_condition: '老板在岗位任务端填写原因并提交阻塞。',
      related_documents: [`${prefix}-SO`],
      alert_type: 'approval_pending',
      notification_type: 'approval_required',
    },
  }
}

function buildSimulatedBossDoneTask(options) {
  const nowSec = Math.floor(Date.now() / 1000)
  const sourceID = 925000 + Math.floor(nowSec % 100000)
  const prefix = `${SIM_PREFIX}-${options.runId}`
  return {
    task_code: `${prefix}-BOSS-DONE`,
    task_group: 'order_approval',
    task_name: `移动端浏览器模拟老板完成 ${options.runId}`,
    source_type: 'project-orders',
    source_id: sourceID,
    source_no: `${prefix}-SO-DONE`,
    business_status_key: 'project_pending',
    task_status_key: 'ready',
    owner_role_key: 'boss',
    priority: 2,
    due_at: nowSec + 90000,
    payload: {
      simulated_only: true,
      simulation_prefix: SIM_PREFIX,
      mobile_workflow_browser_smoke: true,
      customer_name: 'Mobile workflow 完成模拟客户',
      style_no: 'MOBILE-BROWSER-DONE',
      product_name: 'Mobile workflow 完成模拟产品',
      quantity: '6',
      unit: 'pcs',
      complete_condition: '老板在岗位任务端点击完成并看到完成反馈。',
      related_documents: [`${prefix}-SO-DONE`],
      alert_type: 'approval_pending',
      notification_type: 'approval_required',
    },
  }
}

function buildSimulatedBossRejectTask(options) {
  const nowSec = Math.floor(Date.now() / 1000)
  const sourceID = 927000 + Math.floor(nowSec % 100000)
  const prefix = `${SIM_PREFIX}-${options.runId}`
  return {
    task_code: `${prefix}-BOSS-REJECT`,
    task_group: 'order_approval',
    task_name: `移动端浏览器模拟老板退回 ${options.runId}`,
    source_type: 'project-orders',
    source_id: sourceID,
    source_no: `${prefix}-SO-REJECT`,
    business_status_key: 'project_pending',
    task_status_key: 'ready',
    owner_role_key: 'boss',
    priority: 2,
    due_at: nowSec + 91000,
    payload: {
      simulated_only: true,
      simulation_prefix: SIM_PREFIX,
      mobile_workflow_browser_smoke: true,
      customer_name: 'Mobile workflow 退回模拟客户',
      style_no: 'MOBILE-BROWSER-REJECT',
      product_name: 'Mobile workflow 退回模拟产品',
      quantity: '9',
      unit: 'pcs',
      complete_condition: '老板在岗位任务端填写退回原因并提交退回。',
      related_documents: [`${prefix}-SO-REJECT`],
      alert_type: 'approval_pending',
      notification_type: 'approval_required',
    },
  }
}

function buildSimulatedQualityTask(options) {
  const nowSec = Math.floor(Date.now() / 1000)
  const sourceID = 928000 + Math.floor(nowSec % 100000)
  const prefix = `${SIM_PREFIX}-${options.runId}`
  return {
    task_code: `${prefix}-QUALITY-DONE`,
    task_group: 'finished_goods_qc',
    task_name: `移动端浏览器模拟品质完成 ${options.runId}`,
    source_type: 'production-progress',
    source_id: sourceID,
    source_no: `${prefix}-QC`,
    business_status_key: 'qc_pending',
    task_status_key: 'ready',
    owner_role_key: 'quality',
    priority: 2,
    due_at: nowSec + 92000,
    payload: {
      simulated_only: true,
      simulation_prefix: SIM_PREFIX,
      mobile_workflow_browser_smoke: true,
      customer_name: 'Mobile workflow 品质模拟客户',
      style_no: 'MOBILE-BROWSER-QC',
      product_name: 'Mobile workflow 品质模拟产品',
      quantity: '15',
      unit: 'pcs',
      complete_condition: '品质在岗位任务端确认成品抽检结果并填写反馈。',
      related_documents: [`${prefix}-QC`],
      alert_type: 'finished_goods_qc_pending',
      notification_type: 'finished_goods_qc_pending',
    },
  }
}

function buildSimulatedWarehouseInboundTask(options) {
  const nowSec = Math.floor(Date.now() / 1000)
  const sourceID = 929000 + Math.floor(nowSec % 100000)
  const prefix = `${SIM_PREFIX}-${options.runId}`
  return {
    task_code: `${prefix}-WAREHOUSE-INBOUND-DONE`,
    task_group: 'warehouse_inbound',
    task_name: `移动端浏览器模拟仓库入库完成 ${options.runId}`,
    source_type: 'accessories-purchase',
    source_id: sourceID,
    source_no: `${prefix}-INBOUND`,
    business_status_key: 'warehouse_inbound_pending',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    priority: 2,
    due_at: nowSec + 93000,
    payload: {
      simulated_only: true,
      simulation_prefix: SIM_PREFIX,
      mobile_workflow_browser_smoke: true,
      customer_name: 'Mobile workflow 入库模拟客户',
      style_no: 'MOBILE-BROWSER-INBOUND',
      product_name: 'Mobile workflow 入库模拟辅料',
      quantity: '24',
      unit: 'pcs',
      complete_condition: '仓库在岗位任务端确认入库数量、库位和经手人。',
      related_documents: [`${prefix}-INBOUND`],
      alert_type: 'inbound_pending',
      notification_type: 'inbound_pending',
    },
  }
}

function buildSimulatedWarehouseTask(options, assigneeID) {
  const nowSec = Math.floor(Date.now() / 1000)
  const sourceID = 930000 + Math.floor(nowSec % 100000)
  const prefix = `${SIM_PREFIX}-${options.runId}`
  return {
    task_code: `${prefix}-WAREHOUSE`,
    task_group: 'shipment_release',
    task_name: `移动端浏览器模拟仓库放行 ${options.runId}`,
    source_type: 'shipping-release',
    source_id: sourceID,
    source_no: `${prefix}-SHIP`,
    business_status_key: 'shipping_released',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    assignee_id: assigneeID,
    priority: 3,
    due_at: nowSec + 43200,
    payload: {
      simulated_only: true,
      simulation_prefix: SIM_PREFIX,
      mobile_workflow_browser_smoke: true,
      customer_name: 'Mobile workflow 浏览器模拟客户',
      style_no: 'MOBILE-BROWSER-SHIP',
      product_name: 'Mobile workflow 浏览器模拟出货产品',
      quantity: '18',
      unit: 'pcs',
      critical_path: true,
      complete_condition: '仓库岗位完成出货放行；老板只能催办不能代办。',
      related_documents: [`${prefix}-SHIP`],
      alert_type: 'shipment_release_pending',
      notification_type: 'shipment_release_pending',
    },
  }
}

function rpcURLFor(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString()
}

async function rpcCall({ backendURL, domain, method, params = {}, token }) {
  const response = await fetch(rpcURLFor(backendURL, domain), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `mobile-workflow-browser-${method}-${Date.now()}`,
      method,
      params,
    }),
  })
  if (!response.ok) {
    throw new CliError(`${domain}.${method} HTTP ${response.status}`)
  }
  const json = await response.json()
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`
    )
  }
  return json.result.data || {}
}

async function loginRole({ backendURL, username, password }) {
  const data = await rpcCall({
    backendURL,
    domain: 'auth',
    method: 'admin_login',
    params: { username, password },
  })
  const token = data.access_token || data.token
  if (!token) {
    throw new CliError(`${username}: admin_login response missing token`)
  }
  return { ...data, token }
}

async function createSimulatedTask({ backendURL, password, task }) {
  const session = await loginRole({
    backendURL,
    username: 'demo_pmc',
    password,
  })
  const data = await rpcCall({
    backendURL,
    domain: 'workflow',
    method: 'create_task',
    params: task,
    token: session.token,
  })
  assert(data.task?.id, 'workflow.create_task should return task id')
  return data.task
}

async function readTaskByCode({ backendURL, token, taskCode }) {
  const data = await rpcCall({
    backendURL,
    domain: 'workflow',
    method: 'list_tasks',
    params: { limit: 200 },
    token,
  })
  const task = (data.tasks || []).find((item) => item.task_code === taskCode)
  assert(task, `list_tasks should include ${taskCode}`)
  return task
}

let devServerProcess = null
let devServerLogs = ''

function startDevServer(options) {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      'vite.config.mjs',
      '--host',
      '127.0.0.1',
      '--port',
      String(options.port),
      '--strictPort',
    ],
    {
      cwd: webDir,
      env: {
        ...process.env,
        BROWSER: 'none',
        ERP_VITE_PORT: String(options.port),
        ERP_VITE_HMR_CLIENT_PORT: String(options.port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  child.stdout.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      devServerLogs += `\n[vite exited with code ${code}]`
    }
  })
  return child
}

async function stopDevServer() {
  if (!devServerProcess) return
  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => devServerProcess.once('exit', resolve)),
      delay(3000),
    ])
  }
  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGKILL')
  }
  devServerProcess = null
}

async function ensureURLReady(url, label) {
  const deadline = Date.now() + 30_000
  let lastError = 'server did not become ready'
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.ok || response.status === 302 || response.status === 304) {
        return
      }
      lastError = `unexpected status ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await delay(300)
  }
  throw new CliError(
    `${label} not ready: ${lastError}\n最近 Vite 输出:\n${tailLogs(devServerLogs)}`
  )
}

async function newMobilePage(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  await context.addInitScript(() => {
    window.localStorage?.setItem('erp:last_entry_target', 'mobileTasks')
  })
  const trialCustomerConfigScript = await fs.readFile(
    trialCustomerConfigScriptPath,
    'utf8'
  )
  await context.route('**/customer-config.js', (route) =>
    route.fulfill({
      contentType: 'application/javascript; charset=utf-8',
      body: trialCustomerConfigScript,
    })
  )
  const page = await context.newPage()
  const runtimeErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push(`console error: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    runtimeErrors.push(`page error: ${error.message}`)
  })
  page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText || ''
    if (errorText && errorText !== 'net::ERR_ABORTED') {
      runtimeErrors.push(`request failed: ${request.url()} ${errorText}`)
    }
  })
  return { context, page, runtimeErrors }
}

async function loginMobileRole(page, { baseURL, password, roleKey, username }) {
  await page.goto(new URL('/admin-login', `${baseURL}/`).toString(), {
    waitUntil: 'domcontentloaded',
  })
  await page.getByText('账号', { exact: true }).waitFor({
    state: 'visible',
    timeout: 15_000,
  })
  const entryButton = page
    .locator('.ant-segmented-item')
    .filter({ hasText: '岗位任务端' })
    .first()
  if (await entryButton.isVisible().catch(() => false)) {
    await entryButton.click()
  }
  await page.getByLabel('账号').fill(username)
  await page.locator('input[type="password"]').fill(password)
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/admin-login', {
      timeout: 15_000,
    }),
    page.locator('button[type="submit"]').first().click(),
  ])
  const expectedPath = `/m/${roleKey}/tasks`
  if (new URL(page.url()).pathname !== expectedPath) {
    await page.goto(new URL(expectedPath, `${baseURL}/`).toString(), {
      waitUntil: 'domcontentloaded',
    })
  }
  await page.waitForURL(`**${expectedPath}`, { timeout: 15_000 })
}

async function loginMobileBoss(page, { baseURL, password }) {
  await loginMobileRole(page, {
    baseURL,
    password,
    roleKey: 'boss',
    username: 'demo_boss',
  })
}

async function runBrowserScenario(
  browser,
  { options, bossDoneTask, bossRejectTask, bossTask, warehouseTask, password }
) {
  const { context, page, runtimeErrors } = await newMobilePage(browser)
  const blockReason = `移动端浏览器模拟阻塞 ${options.runId}`
  const blockEvidence = `${bossTask.task_code}-PHOTO`
  const doneEvidence = `${bossDoneTask.task_code}-PHOTO`
  const rejectReason = `移动端浏览器模拟退回 ${options.runId}`
  const rejectEvidence = `${bossRejectTask.task_code}-PHOTO`
  const urgeReason = `移动端浏览器模拟催办 ${options.runId}`
  const urgeEvidence = `${warehouseTask.task_code}-PHOTO`

  try {
    await loginMobileBoss(page, { baseURL: options.baseURL, password })
    await page.getByTestId('mobile-role-bottom-nav').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(bossTask.task_name, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(bossTask.task_name, { exact: true }).click()
    await page
      .locator('.mobile-role-tasks-page--detail')
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('heading', { name: bossTask.task_name }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByTestId('mobile-role-evidence-input').fill(blockEvidence)
    await assertNoVisibleText(page, '处理')
    await page.getByRole('button', { name: /阻塞/u }).click()
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('请先填写阻塞或退回原因').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByTestId('mobile-role-detail-reason-input').fill(blockReason)
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('任务状态已更新').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText('异常上报').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(blockReason, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(blockEvidence, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-role-tasks-page--detail')
      const actionBar = document.querySelector('.mobile-role-action-bar')
      const main = document.querySelector(
        '.mobile-role-tasks-page__detail-main'
      )
      const shellRect = shell?.getBoundingClientRect()
      const actionRect = actionBar?.getBoundingClientRect()
      const mainRect = main?.getBoundingClientRect()
      return {
        path: window.location.pathname,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        shell: shellRect
          ? {
              top: shellRect.top,
              bottom: shellRect.bottom,
              height: shellRect.height,
            }
          : null,
        main: mainRect
          ? {
              bottom: mainRect.bottom,
              height: mainRect.height,
            }
          : null,
        actionBar: actionRect
          ? {
              top: actionRect.top,
              bottom: actionRect.bottom,
              height: actionRect.height,
            }
          : null,
        actionButtons: actionBar?.querySelectorAll('button').length || 0,
      }
    })
    assert.equal(metrics.path, '/m/boss/tasks')
    assert(metrics.shell, `detail shell missing: ${JSON.stringify(metrics)}`)
    assert(metrics.main, `detail main missing: ${JSON.stringify(metrics)}`)
    assert(metrics.actionBar, `action bar missing: ${JSON.stringify(metrics)}`)
    assert.equal(
      metrics.actionButtons,
      4,
      `boss order approval detail should expose block/done/urge/reject buttons: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scrollWidth <= metrics.clientWidth + 1,
      `mobile detail should not overflow horizontally: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.main.bottom <= metrics.actionBar.top + 1.5,
      `detail content should not overlap action bar: ${JSON.stringify(metrics)}`
    )

    await page.screenshot({
      path: path.resolve(outputDir, `${bossTask.task_code}-blocked.png`),
      fullPage: true,
    })

    await page.getByRole('button', { name: /任务列表/u }).click()
    await page.getByText(bossRejectTask.task_name, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(bossRejectTask.task_name, { exact: true }).click()
    await page
      .getByRole('heading', { name: bossRejectTask.task_name })
      .waitFor({
        state: 'visible',
        timeout: 15_000,
      })
    await page.getByTestId('mobile-role-evidence-input').fill(rejectEvidence)
    await page.getByRole('button', { name: /退回当前任务/u }).click()
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('请先填写阻塞或退回原因').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByTestId('mobile-role-detail-reason-input').fill(rejectReason)
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('任务状态已更新').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText('异常上报').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(rejectReason, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(rejectEvidence, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.screenshot({
      path: path.resolve(outputDir, `${bossRejectTask.task_code}-rejected.png`),
      fullPage: true,
    })

    await page.getByRole('button', { name: /任务列表/u }).click()
    await page.getByText(bossDoneTask.task_name, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(bossDoneTask.task_name, { exact: true }).click()
    await page.getByRole('heading', { name: bossDoneTask.task_name }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByTestId('mobile-role-evidence-input').fill(doneEvidence)
    await page.getByRole('button', { name: /完成/u }).click()
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('任务状态已更新').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page
      .getByTestId('mobile-role-bottom-nav')
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByTestId('mobile-role-nav-done').click()
    await page.getByText('已办任务').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(bossDoneTask.task_name, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.screenshot({
      path: path.resolve(outputDir, `${bossDoneTask.task_code}-done.png`),
      fullPage: true,
    })

    await page.getByTestId('mobile-role-nav-todo').click()
    await page.getByText(warehouseTask.task_name, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(warehouseTask.task_name, { exact: true }).click()
    await page.getByRole('heading', { name: warehouseTask.task_name }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page
      .getByText('您暂时不能处理这条任务，可以查看并催办', {
        exact: false,
      })
      .waitFor({ state: 'visible', timeout: 15_000 })
    const blockButton = page.locator('.mobile-role-action-bar__button--blocked')
    const doneButton = page.locator('.mobile-role-action-bar__button--done')
    const urgeButton = page.locator('.mobile-role-action-bar__button--urge')
    assert.equal(
      await blockButton.isDisabled(),
      true,
      'boss should not be able to block warehouse-owned task'
    )
    assert.equal(
      await doneButton.isDisabled(),
      true,
      'boss should not be able to complete warehouse-owned task'
    )
    assert.equal(
      await urgeButton.isDisabled(),
      false,
      'boss should be able to urge high priority warehouse-owned task'
    )
    await page.getByTestId('mobile-role-evidence-input').fill(urgeEvidence)
    await urgeButton.click()
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('请先填写催办原因').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByTestId('mobile-role-detail-reason-input').fill(urgeReason)
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('催办已记录').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(urgeReason, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(urgeEvidence, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    const urgeMetrics = await page.evaluate(() => {
      const actionBar = document.querySelector('.mobile-role-action-bar')
      const buttons = [...(actionBar?.querySelectorAll('button') || [])].map(
        (button) => ({
          text: button.textContent?.trim() || '',
          disabled: button.disabled,
        })
      )
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        buttons,
      }
    })
    assert(
      urgeMetrics.scrollWidth <= urgeMetrics.clientWidth + 1,
      `cross-role urge detail should not overflow horizontally: ${JSON.stringify(urgeMetrics)}`
    )
    assert.deepEqual(
      runtimeErrors,
      [],
      `browser runtime errors:\n${runtimeErrors.join('\n')}`
    )

    await page.screenshot({
      path: path.resolve(outputDir, `${warehouseTask.task_code}-urged.png`),
      fullPage: true,
    })
    return {
      blockReason,
      blockEvidence,
      doneEvidence,
      rejectReason,
      rejectEvidence,
      urgeReason,
      urgeEvidence,
      metrics,
      urgeMetrics,
    }
  } catch (error) {
    const debug = await capturePageDebug(page)
    if (debug) {
      error.message = `${error.message}\n${debug}`
    }
    await screenshotOnFailure(page, `${bossTask.task_code}-failed.png`)
    throw error
  } finally {
    await context.close()
  }
}

async function runOwnedCompleteScenario(
  browser,
  { options, password, roleKey, task, username }
) {
  const { context, page, runtimeErrors } = await newMobilePage(browser)
  const evidence = `${task.task_code}-PHOTO`

  try {
    await loginMobileRole(page, {
      baseURL: options.baseURL,
      password,
      roleKey,
      username,
    })
    await page.getByTestId('mobile-role-bottom-nav').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(task.task_name, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(task.task_name, { exact: true }).click()
    await page
      .locator('.mobile-role-tasks-page--detail')
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('heading', { name: task.task_name }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByTestId('mobile-role-evidence-input').fill(evidence)
    await page.getByRole('button', { name: /完成/u }).click()
    await page.getByRole('button', { name: '提交' }).click()
    await page.getByText('任务状态已更新').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page
      .getByTestId('mobile-role-bottom-nav')
      .waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByTestId('mobile-role-nav-done').click()
    await page.getByText('已办任务').waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await page.getByText(task.task_name, { exact: true }).waitFor({
      state: 'visible',
      timeout: 15_000,
    })

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-role-tasks-page')
      const bottomNav = document.querySelector('.mobile-role-bottom-nav')
      const shellRect = shell?.getBoundingClientRect()
      const bottomNavRect = bottomNav?.getBoundingClientRect()
      return {
        path: window.location.pathname,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        shell: shellRect
          ? {
              top: shellRect.top,
              bottom: shellRect.bottom,
              height: shellRect.height,
            }
          : null,
        bottomNav: bottomNavRect
          ? {
              top: bottomNavRect.top,
              bottom: bottomNavRect.bottom,
              height: bottomNavRect.height,
            }
          : null,
      }
    })
    assert.equal(metrics.path, `/m/${roleKey}/tasks`)
    assert(
      metrics.shell,
      `mobile task shell missing: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.bottomNav,
      `mobile bottom nav missing: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scrollWidth <= metrics.clientWidth + 1,
      `mobile done list should not overflow horizontally: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      runtimeErrors,
      [],
      `browser runtime errors:\n${runtimeErrors.join('\n')}`
    )

    await page.screenshot({
      path: path.resolve(outputDir, `${task.task_code}-done.png`),
      fullPage: true,
    })
    return { evidence, metrics }
  } catch (error) {
    const debug = await capturePageDebug(page)
    if (debug) {
      error.message = `${error.message}\n${debug}`
    }
    await screenshotOnFailure(page, `${task.task_code}-failed.png`)
    throw error
  } finally {
    await context.close()
  }
}

async function capturePageDebug(page) {
  try {
    const bodyText = await page
      .locator('body')
      .innerText({ timeout: 1000 })
      .catch(() => '')
    return [
      `[debug] url=${page.url()}`,
      `[debug] body=${bodyText.slice(0, 1000)}`,
    ].join('\n')
  } catch {
    return ''
  }
}

async function assertNoVisibleText(page, text) {
  const matches = await page.getByText(text, { exact: true }).all()
  let visibleCount = 0
  for (const match of matches) {
    if (await match.isVisible().catch(() => false)) {
      visibleCount += 1
    }
  }
  assert.equal(visibleCount, 0, `页面不应显示文案: ${text}`)
}

async function screenshotOnFailure(page, fileName) {
  try {
    await page.screenshot({
      path: path.resolve(outputDir, fileName),
      fullPage: true,
    })
  } catch {
    // 截图失败不覆盖主错误。
  }
}

function tailLogs(logs, maxLength = 4000) {
  const normalized = String(logs || '').trim()
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(-maxLength)
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(`${usage}\n`)
    return
  }
  if (options.printInputTemplate) {
    process.stdout.write(
      `${JSON.stringify(buildInputTemplate(options), null, 2)}\n`
    )
    return
  }
  if (options.preflightReport) {
    const report = await buildPreflightReport(options)
    await writeJSONReport(options.preflightReport, report)
    process.stdout.write(
      `[mobile-workflow-runtime-browser-smoke] preflight report written: ${path.relative(repoRoot, options.preflightReport)} ready=${report.readyForRealSmoke}\n`
    )
    return
  }
  const password = optionalText(
    process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD
  )
  if (!password) {
    throw new CliError(
      '缺少账号密码：请设置 MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD、TRIAL_ACCOUNT_PASSWORD 或 ERP_ROLE_DEMO_PASSWORD',
      2
    )
  }

  await fs.mkdir(outputDir, { recursive: true })
  const backendHealthURL = new URL(
    process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BACKEND_HEALTH_URL ||
      DEFAULT_BACKEND_HEALTH_URL
  )
  assertNoURLCredentials(backendHealthURL)
  await ensureURLReady(backendHealthURL.toString(), 'backend health')
  if (!process.env.MOBILE_WORKFLOW_BROWSER_SMOKE_BASE_URL) {
    devServerProcess = startDevServer(options)
    await ensureURLReady(options.baseURL, 'vite preview')
  }

  const bossSession = await loginRole({
    backendURL: options.backendURL,
    username: 'demo_boss',
    password,
  })
  const qualitySession = await loginRole({
    backendURL: options.backendURL,
    username: 'demo_quality',
    password,
  })
  const warehouseSession = await loginRole({
    backendURL: options.backendURL,
    username: 'demo_warehouse',
    password,
  })
  const bossAdminID = Number(bossSession.id || bossSession.admin_id || 0)
  assert(bossAdminID > 0, 'demo_boss login should return admin id')

  const bossTaskPlan = buildSimulatedBossTask(options)
  const bossDoneTaskPlan = buildSimulatedBossDoneTask(options)
  const bossRejectTaskPlan = buildSimulatedBossRejectTask(options)
  const qualityTaskPlan = buildSimulatedQualityTask(options)
  const warehouseInboundTaskPlan = buildSimulatedWarehouseInboundTask(options)
  const warehouseTaskPlan = buildSimulatedWarehouseTask(options, bossAdminID)
  const createdBossTask = await createSimulatedTask({
    backendURL: options.backendURL,
    password,
    task: bossTaskPlan,
  })
  const createdBossDoneTask = await createSimulatedTask({
    backendURL: options.backendURL,
    password,
    task: bossDoneTaskPlan,
  })
  const createdBossRejectTask = await createSimulatedTask({
    backendURL: options.backendURL,
    password,
    task: bossRejectTaskPlan,
  })
  const createdQualityTask = await createSimulatedTask({
    backendURL: options.backendURL,
    password,
    task: qualityTaskPlan,
  })
  const createdWarehouseInboundTask = await createSimulatedTask({
    backendURL: options.backendURL,
    password,
    task: warehouseInboundTaskPlan,
  })
  const createdWarehouseTask = await createSimulatedTask({
    backendURL: options.backendURL,
    password,
    task: warehouseTaskPlan,
  })
  const browser = await chromium.launch({ headless: !options.headed })
  try {
    const browserResult = await runBrowserScenario(browser, {
      options,
      bossDoneTask: createdBossDoneTask,
      bossRejectTask: createdBossRejectTask,
      bossTask: createdBossTask,
      warehouseTask: createdWarehouseTask,
      password,
    })
    const qualityResult = await runOwnedCompleteScenario(browser, {
      options,
      password,
      roleKey: 'quality',
      task: createdQualityTask,
      username: 'demo_quality',
    })
    const warehouseInboundResult = await runOwnedCompleteScenario(browser, {
      options,
      password,
      roleKey: 'warehouse',
      task: createdWarehouseInboundTask,
      username: 'demo_warehouse',
    })
    browserResult.qualityEvidence = qualityResult.evidence
    browserResult.qualityMetrics = qualityResult.metrics
    browserResult.warehouseInboundEvidence = warehouseInboundResult.evidence
    browserResult.warehouseInboundMetrics = warehouseInboundResult.metrics
    const updatedBossTask = await readTaskByCode({
      backendURL: options.backendURL,
      token: bossSession.token,
      taskCode: createdBossTask.task_code,
    })
    assert.equal(updatedBossTask.task_status_key, 'blocked')
    assert.equal(updatedBossTask.blocked_reason, browserResult.blockReason)
    assert.equal(updatedBossTask.payload?.mobile_action?.action_key, 'blocked')
    assert.equal(updatedBossTask.payload?.mobile_action?.role_key, 'boss')
    assert(
      updatedBossTask.payload?.mobile_action_evidence_refs?.includes(
        browserResult.blockEvidence
      ),
      'blocked task should retain mobile action evidence ref'
    )
    assert.equal(
      updatedBossTask.payload?.mobile_exception_report?.reason,
      browserResult.blockReason
    )
    const updatedBossDoneTask = await readTaskByCode({
      backendURL: options.backendURL,
      token: bossSession.token,
      taskCode: createdBossDoneTask.task_code,
    })
    assert.equal(updatedBossDoneTask.task_status_key, 'done')
    assert.equal(updatedBossDoneTask.payload?.mobile_action?.action_key, 'done')
    assert.equal(updatedBossDoneTask.payload?.mobile_action?.role_key, 'boss')
    assert(
      updatedBossDoneTask.payload?.mobile_action_evidence_refs?.includes(
        browserResult.doneEvidence
      ),
      'done task should retain mobile action evidence ref'
    )
    const updatedBossRejectTask = await readTaskByCode({
      backendURL: options.backendURL,
      token: bossSession.token,
      taskCode: createdBossRejectTask.task_code,
    })
    assert.equal(updatedBossRejectTask.task_status_key, 'rejected')
    assert.equal(
      updatedBossRejectTask.payload?.mobile_action?.action_key,
      'rejected'
    )
    assert.equal(updatedBossRejectTask.payload?.mobile_action?.role_key, 'boss')
    assert(
      updatedBossRejectTask.payload?.mobile_action_evidence_refs?.includes(
        browserResult.rejectEvidence
      ),
      'rejected task should retain mobile action evidence ref'
    )
    assert.equal(
      updatedBossRejectTask.payload?.mobile_exception_report?.reason,
      browserResult.rejectReason
    )
    const updatedQualityTask = await readTaskByCode({
      backendURL: options.backendURL,
      token: qualitySession.token,
      taskCode: createdQualityTask.task_code,
    })
    assert.equal(updatedQualityTask.task_status_key, 'done')
    assert.equal(updatedQualityTask.owner_role_key, 'quality')
    assert.equal(updatedQualityTask.payload?.mobile_action?.action_key, 'done')
    assert.equal(updatedQualityTask.payload?.mobile_action?.role_key, 'quality')
    assert(
      updatedQualityTask.payload?.mobile_action_evidence_refs?.includes(
        browserResult.qualityEvidence
      ),
      'quality done task should retain mobile action evidence ref'
    )
    const updatedWarehouseInboundTask = await readTaskByCode({
      backendURL: options.backendURL,
      token: warehouseSession.token,
      taskCode: createdWarehouseInboundTask.task_code,
    })
    assert.equal(updatedWarehouseInboundTask.task_status_key, 'done')
    assert.equal(updatedWarehouseInboundTask.owner_role_key, 'warehouse')
    assert.equal(
      updatedWarehouseInboundTask.payload?.mobile_action?.action_key,
      'done'
    )
    assert.equal(
      updatedWarehouseInboundTask.payload?.mobile_action?.role_key,
      'warehouse'
    )
    assert(
      updatedWarehouseInboundTask.payload?.mobile_action_evidence_refs?.includes(
        browserResult.warehouseInboundEvidence
      ),
      'warehouse inbound done task should retain mobile action evidence ref'
    )
    const updatedWarehouseTask = await readTaskByCode({
      backendURL: options.backendURL,
      token: bossSession.token,
      taskCode: createdWarehouseTask.task_code,
    })
    assert.equal(updatedWarehouseTask.task_status_key, 'ready')
    assert.equal(updatedWarehouseTask.owner_role_key, 'warehouse')
    assert.equal(
      updatedWarehouseTask.payload?.last_urge_reason,
      browserResult.urgeReason
    )
    assert.equal(updatedWarehouseTask.payload?.last_urge_actor_role_key, 'boss')
    assert.equal(
      updatedWarehouseTask.payload?.last_urge_action,
      'escalate_to_boss'
    )
    assert.equal(
      updatedWarehouseTask.payload?.mobile_action?.action_key,
      'urge'
    )
    assert.equal(updatedWarehouseTask.payload?.mobile_action?.role_key, 'boss')
    assert(
      updatedWarehouseTask.payload?.mobile_action_evidence_refs?.includes(
        browserResult.urgeEvidence
      ),
      'urged task should retain mobile action evidence ref'
    )
    if (options.report) {
      const report = buildSmokeReport({
        options,
        browserResult,
        createdBossTask,
        createdBossDoneTask,
        createdBossRejectTask,
        createdQualityTask,
        createdWarehouseInboundTask,
        createdWarehouseTask,
        updatedBossTask,
        updatedBossDoneTask,
        updatedBossRejectTask,
        updatedQualityTask,
        updatedWarehouseInboundTask,
        updatedWarehouseTask,
      })
      await writeJSONReport(options.report, report)
    }
    process.stdout.write(
      `[mobile-workflow-runtime-browser-smoke] 通过，blocked=${createdBossTask.task_code} rejected=${createdBossRejectTask.task_code} done=${createdBossDoneTask.task_code} qualityDone=${createdQualityTask.task_code} warehouseInboundDone=${createdWarehouseInboundTask.task_code} urged=${createdWarehouseTask.task_code} base=${options.baseURL}${options.report ? ` report=${path.relative(repoRoot, options.report)}` : ''}\n`
    )
  } finally {
    await browser.close()
    await stopDevServer()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[mobile-workflow-runtime-browser-smoke][fatal] ${
        error?.stack || error?.message || error
      }\n`
    )
    process.exitCode = error instanceof CliError ? error.exitCode : 1
  })
}

export {
  buildSimulatedBossDoneTask,
  buildSimulatedBossRejectTask,
  buildSimulatedBossTask,
  buildSimulatedQualityTask,
  buildSimulatedWarehouseInboundTask,
  buildSimulatedWarehouseTask,
  buildTimestampRunId,
  buildInputTemplate,
  buildPreflightReport,
  buildSmokeReport,
  buildSimulatedTaskPlan,
  buildSimulatedTaskPlanSummary,
  buildSimulatedTaskPlanCoverage,
  parseCliArgs,
  sanitizeRunId,
}
