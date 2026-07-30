import { DEV_DATA_PREPARATION_ROUTE } from './devRoutes.mjs'

export { DEV_DATA_PREPARATION_ROUTE }

export const DEV_DATA_PREPARATION_API_PREFIX = '/__dev/api/data-preparation'
export const DEV_DATA_PREPARATION_SESSION_API_PATH = `${DEV_DATA_PREPARATION_API_PREFIX}/session`
export const DEV_DATA_PREPARATION_SUMMARY_API_PATH = `${DEV_DATA_PREPARATION_API_PREFIX}/summary`
export const DEV_DATA_PREPARATION_ACTION_API_PATH = `${DEV_DATA_PREPARATION_API_PREFIX}/actions`
export const DEV_DATA_PREPARATION_OPERATION_API_PREFIX = `${DEV_DATA_PREPARATION_API_PREFIX}/operations`
export const DEV_DATA_PREPARATION_SOURCE_PATH =
  'docs/engineering/研发效能工作台与CI-CD设计.md'

export const DEV_DATA_PREPARATION_PROFILE_KEYS = Object.freeze({
  coreDemo: 'core-demo',
  scenarioDemo: 'scenario-demo',
  fullAcceptance: 'full-acceptance',
})

export const DEV_DATA_PREPARATION_PROFILE_COPY = Object.freeze({
  [DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo]: Object.freeze({
    title: '共享开发基础数据',
    shortTitle: 'Core Demo',
    purpose: '准备共享开发库的基础账号与主数据',
    retention: '稳定 upsert，可持续保留',
    cleanup:
      '不承诺按批次删除；退出时按账号停用、单据取消或冲正等正常生命周期处理。',
    scope: '基础账号、单位、材料、产品、仓库、工艺与 BOM。',
    targetKey: 'coreDemo',
    targetTitle: '共享开发目标',
    badgeLabel: '长期保留',
    badgeColor: 'default',
    prepareButtonLabel: '准备不可变计划',
    prepareDescription: '预检通过后生成不可变计划，不会立即写入。',
    confirmationDescription:
      '共享基础数据使用稳定 upsert；不提供批次删除，后续按正常业务生命周期退出。',
    successDescription: '共享基础数据已稳定读回，可继续保留使用。',
    cleanupBoundary: '不支持批次删除，按正常生命周期退出',
    steps: Object.freeze([
      '确认共享开发库身份与基础前置',
      '稳定 upsert 基础账号、主数据、工艺与 BOM',
      '读回固定数据计数并保留长期使用',
    ]),
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo]: Object.freeze({
    title: '业务场景演示数据',
    shortTitle: 'Scenario Demo',
    purpose: '准备长期保留的业务场景演示数据，不是完整验收',
    retention:
      '固定批次同批精确复用 / 读回；只补齐缺项，不清空已有数据。岗位到期时间是固定快照，不会随当天滚动。',
    cleanup:
      '只向前补齐 / forward-only，不提供批次清理或重置；后续按正式业务生命周期退出。',
    scope:
      '正式 Source Document、可证明的 ProcessRuntime、模拟岗位任务，以及由领域 API 合法生成的 Fact。',
    targetKey: 'scenarioDemo',
    targetTitle: '业务场景目标',
    badgeLabel: '长期保留',
    badgeColor: 'default',
    prepareButtonLabel: '生成业务场景测试数据',
    prepareDescription:
      '点击后自动准备固定计划并打开可读确认；确认一次即对齐当前跟踪的本地客户配置并生成数据，无需重启或输入长确认文本。',
    confirmationDescription:
      '先通过正式配置 API 对齐当前跟踪的 yoyoosun 本地测试配置，再补齐固定业务场景；不清空已有数据，半批或漂移会阻断。',
    successDescription:
      '业务场景演示数据已精确读回并长期保留；人工验收仍未完成，本结果不是完整验收。',
    cleanupBoundary: '只向前补齐，不支持批次清理或重置',
    steps: Object.freeze([
      '确认共享开发库身份、migration 与固定场景目录',
      '稳定准备本地岗位账号与审计样例，并通过 validate / publish / transition check / activate or rollback / effective-session 对齐当前跟踪客户配置',
      '通过正式 Source / ProcessRuntime / Fact 路径执行；固定批次精确复用 / 读回，半批或漂移阻断',
    ]),
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance]: Object.freeze({
    title: '完整验收数据',
    shortTitle: 'Full Acceptance',
    purpose: '在专用隔离库完成正式 Source / Fact API 与 50 项验收',
    retention: '只接受 clean exact commit',
    cleanup: '无论验收成功或失败都自动清理隔离库，不提供手工清理按钮。',
    scope: '专用隔离库内的正式 Source / Fact API 与 50 项自动化验收。',
    targetKey: 'fullAcceptance',
    targetTitle: '完整验收目标',
    badgeLabel: '自动清理',
    badgeColor: 'blue',
    prepareButtonLabel: '准备不可变计划',
    prepareDescription:
      '预检通过后生成绑定 clean exact commit 的不可变计划，不会立即写入。',
    confirmationDescription:
      '完整验收将在专用隔离库执行；成功或失败后都必须完成自动清理读回。',
    successDescription: '验收报告与自动清理读回已记录。',
    cleanupBoundary: '成功或失败后自动清理',
    steps: Object.freeze([
      '确认 clean exact commit 与专用隔离库',
      '通过正式 Source / Fact API 执行 50 项验收',
      '记录报告并在成功或失败后自动清理隔离库',
    ]),
  }),
})

const PROFILE_KEYS = new Set(Object.values(DEV_DATA_PREPARATION_PROFILE_KEYS))
const PROFILE_BOUNDARIES = Object.freeze({
  [DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo]: Object.freeze({
    dataRetention: 'long-lived',
    cleanupMode: 'not-supported',
    exactCleanCommitRequired: false,
    disposable: false,
    automaticCleanup: false,
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo]: Object.freeze({
    dataRetention: 'long-lived',
    cleanupMode: 'forward-only',
    exactCleanCommitRequired: false,
    disposable: false,
    automaticCleanup: false,
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance]: Object.freeze({
    dataRetention: 'ephemeral',
    cleanupMode: 'automatic',
    exactCleanCommitRequired: true,
    disposable: true,
    automaticCleanup: true,
  }),
})
const SUMMARY_TARGET_KEYS = Object.freeze(
  Object.values(DEV_DATA_PREPARATION_PROFILE_COPY).map(
    (profileCopy) => profileCopy.targetKey
  )
)
const SUMMARY_STATUSES = new Set(['success', 'partial', 'blocked'])
const TARGET_STATUSES = new Set(['available', 'blocked'])
const OPERATION_STATUSES = new Set([
  'ready',
  'launching',
  'running',
  'passed',
  'failed',
  'blocked',
  'not_proven',
])
const TERMINAL_OPERATION_STATUSES = new Set([
  'passed',
  'failed',
  'blocked',
  'not_proven',
])
const ISSUE_SEVERITIES = new Set(['warning', 'blocked'])
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const IDEMPOTENCY_KEY_PATTERN =
  /^data-preparation:prepare:(core-demo|scenario-demo|full-acceptance):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_]{2,39}$/u
const DATASET_KEY_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/u
const SCENARIO_DEMO_DATASET_KEY = 'yoyoosun-manual-acceptance'
const SCENARIO_DEMO_DATA_VERSION = '2026.07.16-v5'
const SCENARIO_DEMO_RUN_ID = '20260716-V5'
const SCENARIO_DEMO_CATALOG_TARGET_COUNT = 50
const SCENARIO_DEMO_CATALOG_READY_COUNT = 40
const SCENARIO_DEMO_BROWSER_CHECKS_PENDING = 10

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function assertExactKeys(value, expectedKeys, field) {
  assertObject(value, field)
  const actualKeys = Object.keys(value).sort()
  const wantedKeys = [...expectedKeys].sort()
  if (
    actualKeys.length !== wantedKeys.length ||
    actualKeys.some((key, index) => key !== wantedKeys[index])
  ) {
    throw new Error(`${field} contains unsupported fields`)
  }
  return value
}

function isSafeText(value, maxLength = 500) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maxLength ||
    /(?:password|secret|token|authorization|cookie|dsn)/iu.test(value) ||
    /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/u.test(value) ||
    /(?:^|[\s"'=])\/(?:Users|home|private|var|tmp)\//u.test(value)
  ) {
    return false
  }
  return !Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint < 32 || codePoint === 127
  })
}

function assertSafeText(value, field, maxLength) {
  if (!isSafeText(value, maxLength)) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function assertIsoTimestamp(value, field) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function validateIssue(issue) {
  assertExactKeys(
    issue,
    ['code', 'message', 'severity'],
    'data preparation issue'
  )
  if (
    !/^[a-z][a-z0-9_]{2,63}$/u.test(String(issue.code || '')) ||
    !ISSUE_SEVERITIES.has(issue.severity)
  ) {
    throw new Error('data preparation issue is invalid')
  }
  assertSafeText(issue.message, 'data preparation issue message')
  return issue
}

function validateEvent(event) {
  assertExactKeys(event, ['at', 'message', 'status'], 'data preparation event')
  assertIsoTimestamp(event.at, 'data preparation event timestamp')
  if (!OPERATION_STATUSES.has(event.status)) {
    throw new Error('data preparation event status is invalid')
  }
  assertSafeText(event.message, 'data preparation event message')
  return event
}

function validateTargetIdentity(target, field) {
  assertExactKeys(target, ['safeTarget', 'status', 'targetFingerprint'], field)
  if (
    !TARGET_STATUSES.has(target.status) ||
    typeof target.safeTarget !== 'string' ||
    !HASH_PATTERN.test(String(target.targetFingerprint || ''))
  ) {
    throw new Error(`${field} is invalid`)
  }
  assertSafeText(target.safeTarget, `${field} safe target`, 300)
  return target
}

function validateProfile(profile) {
  assertExactKeys(
    profile,
    [
      'cleanupMode',
      'dataRetention',
      'exactCleanCommitRequired',
      'key',
      'purpose',
      'requiredEnvironment',
      'title',
      'writesDatabase',
    ],
    'data preparation profile'
  )
  if (
    !PROFILE_KEYS.has(profile.key) ||
    profile.writesDatabase !== true ||
    !['long-lived', 'ephemeral'].includes(profile.dataRetention) ||
    !['not-supported', 'forward-only', 'automatic'].includes(
      profile.cleanupMode
    ) ||
    typeof profile.exactCleanCommitRequired !== 'boolean' ||
    !Array.isArray(profile.requiredEnvironment) ||
    !profile.requiredEnvironment.every((entry) => isSafeText(entry, 240))
  ) {
    throw new Error('data preparation profile is invalid')
  }
  assertSafeText(profile.title, 'data preparation profile title', 240)
  assertSafeText(profile.purpose, 'data preparation profile purpose', 240)

  const expectedBoundary = PROFILE_BOUNDARIES[profile.key]
  if (
    profile.dataRetention !== expectedBoundary.dataRetention ||
    profile.cleanupMode !== expectedBoundary.cleanupMode ||
    profile.exactCleanCommitRequired !==
      expectedBoundary.exactCleanCommitRequired
  ) {
    throw new Error(`${profile.key} profile boundary is invalid`)
  }
  return profile
}

function validateReadback(readback, { profileKey, status, targetFingerprint }) {
  if (readback === null) return readback
  assertObject(readback, 'data preparation readback')
  if (
    readback.schemaVersion !== 'plush.dev-data-preparation-readback/v1' ||
    readback.profileKey !== profileKey ||
    readback.targetFingerprint !== targetFingerprint ||
    !HASH_PATTERN.test(String(readback.targetFingerprint || ''))
  ) {
    throw new Error('data preparation readback is invalid')
  }

  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo) {
    assertExactKeys(
      readback,
      [
        'cleanupSupported',
        'core',
        'preflight',
        'profileKey',
        'roleAccounts',
        'schemaVersion',
        'stableUpsert',
        'targetFingerprint',
      ],
      'core demo readback'
    )
    assertExactKeys(
      readback.core,
      [
        'bomHeaders',
        'materials',
        'processes',
        'products',
        'units',
        'warehouses',
      ],
      'core demo counts'
    )
    if (
      readback.preflight !== 'passed' ||
      !Number.isSafeInteger(readback.roleAccounts) ||
      readback.roleAccounts < 1 ||
      ![
        'units',
        'materials',
        'products',
        'warehouses',
        'processes',
        'bomHeaders',
      ].every(
        (key) =>
          Number.isSafeInteger(readback.core[key]) && readback.core[key] >= 0
      ) ||
      readback.stableUpsert !== true ||
      readback.cleanupSupported !== false
    ) {
      throw new Error('core demo readback is invalid')
    }
    return readback
  }

  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo) {
    assertExactKeys(
      readback,
      [
        'browserChecksPending',
        'catalogReadyCount',
        'catalogTargetCount',
        'cleanupSupported',
        'dataVersion',
        'datasetKey',
        'factCount',
        'manualAcceptanceCompleted',
        'processRuntimeCount',
        'profileKey',
        'replayMode',
        'runId',
        'schemaVersion',
        'sourceDocumentCount',
        'targetFingerprint',
      ],
      'scenario demo readback'
    )
    const domainCountFields = [
      'sourceDocumentCount',
      'processRuntimeCount',
      'factCount',
    ]
    if (
      readback.datasetKey !== SCENARIO_DEMO_DATASET_KEY ||
      !DATASET_KEY_PATTERN.test(readback.datasetKey) ||
      readback.dataVersion !== SCENARIO_DEMO_DATA_VERSION ||
      readback.runId !== SCENARIO_DEMO_RUN_ID ||
      !domainCountFields.every(
        (field) => Number.isSafeInteger(readback[field]) && readback[field] > 0
      ) ||
      readback.catalogTargetCount !== SCENARIO_DEMO_CATALOG_TARGET_COUNT ||
      readback.catalogReadyCount !== SCENARIO_DEMO_CATALOG_READY_COUNT ||
      readback.browserChecksPending !== SCENARIO_DEMO_BROWSER_CHECKS_PENDING ||
      readback.catalogReadyCount + readback.browserChecksPending !==
        readback.catalogTargetCount ||
      readback.manualAcceptanceCompleted !== false ||
      readback.cleanupSupported !== false ||
      readback.replayMode !== 'exact-create-or-readback' ||
      (status === 'passed' &&
        (readback.catalogReadyCount !== SCENARIO_DEMO_CATALOG_READY_COUNT ||
          readback.browserChecksPending !==
            SCENARIO_DEMO_BROWSER_CHECKS_PENDING))
    ) {
      throw new Error('scenario demo readback is invalid')
    }
    return readback
  }

  assertExactKeys(
    readback,
    [
      'cleanupComplete',
      'profileKey',
      'reportStatus',
      'residualDatabaseCount',
      'schemaVersion',
      'targetFingerprint',
    ],
    'full acceptance readback'
  )
  if (
    !['passed', 'failed'].includes(readback.reportStatus) ||
    typeof readback.cleanupComplete !== 'boolean' ||
    !Number.isSafeInteger(readback.residualDatabaseCount) ||
    readback.residualDatabaseCount < 0
  ) {
    throw new Error('full acceptance readback is invalid')
  }
  return readback
}

export function validateDevDataPreparationOperation(operation) {
  assertExactKeys(
    operation,
    [
      'confirmationRequired',
      'createdAt',
      'events',
      'id',
      'issues',
      'planHash',
      'profileKey',
      'readback',
      'runId',
      'status',
      'targetSummary',
      'terminal',
      'updatedAt',
    ],
    'data preparation operation'
  )
  assertExactKeys(
    operation.targetSummary,
    [
      'automaticCleanup',
      'disposable',
      'preflightFingerprint',
      'safeTarget',
      'targetFingerprint',
    ],
    'data preparation target summary'
  )
  if (
    !OPERATION_ID_PATTERN.test(String(operation.id || '')) ||
    !PROFILE_KEYS.has(operation.profileKey) ||
    !OPERATION_STATUSES.has(operation.status) ||
    !HASH_PATTERN.test(String(operation.planHash || '')) ||
    !RUN_ID_PATTERN.test(String(operation.runId || '')) ||
    !HASH_PATTERN.test(
      String(operation.targetSummary.targetFingerprint || '')
    ) ||
    !HASH_PATTERN.test(
      String(operation.targetSummary.preflightFingerprint || '')
    ) ||
    typeof operation.targetSummary.disposable !== 'boolean' ||
    typeof operation.targetSummary.automaticCleanup !== 'boolean' ||
    !Array.isArray(operation.events) ||
    !Array.isArray(operation.issues) ||
    typeof operation.confirmationRequired !== 'string' ||
    typeof operation.terminal !== 'boolean'
  ) {
    throw new Error('data preparation operation is invalid')
  }
  assertSafeText(
    operation.targetSummary.safeTarget,
    'data preparation operation safe target',
    300
  )
  assertIsoTimestamp(
    operation.createdAt,
    'data preparation operation created timestamp'
  )
  assertIsoTimestamp(
    operation.updatedAt,
    'data preparation operation updated timestamp'
  )
  operation.events.forEach(validateEvent)
  operation.issues.forEach(validateIssue)
  validateReadback(operation.readback, {
    profileKey: operation.profileKey,
    status: operation.status,
    targetFingerprint: operation.targetSummary.targetFingerprint,
  })

  const expectedConfirmation = `DATA_PREPARATION:${operation.profileKey}:${operation.runId}:${operation.planHash}:${operation.id}`
  if (
    (operation.status === 'ready' &&
      operation.confirmationRequired !== expectedConfirmation) ||
    (operation.status !== 'ready' && operation.confirmationRequired !== '') ||
    operation.terminal !== TERMINAL_OPERATION_STATUSES.has(operation.status)
  ) {
    throw new Error('data preparation operation state is invalid')
  }
  const expectedBoundary = PROFILE_BOUNDARIES[operation.profileKey]
  if (
    operation.targetSummary.disposable !== expectedBoundary.disposable ||
    operation.targetSummary.automaticCleanup !==
      expectedBoundary.automaticCleanup
  ) {
    throw new Error(`${operation.profileKey} operation target is invalid`)
  }
  return operation
}

export function validateDevDataPreparationSummary(summary) {
  assertExactKeys(
    summary,
    [
      'boundaries',
      'generatedAt',
      'issues',
      'operations',
      'profiles',
      'repository',
      'schemaVersion',
      'status',
      'target',
    ],
    'data preparation summary'
  )
  assertExactKeys(
    summary.target,
    SUMMARY_TARGET_KEYS,
    'data preparation target'
  )
  assertExactKeys(
    summary.boundaries,
    [
      'arbitraryPathInputAllowed',
      'browserShellAccess',
      'browserTargetInputAllowed',
      'customerUAT',
      'developmentOnly',
      'fullAcceptanceAutomaticCleanup',
    ],
    'data preparation boundaries'
  )
  if (
    summary.schemaVersion !== 'plush.dev-data-preparation-summary/v1' ||
    !SUMMARY_STATUSES.has(summary.status) ||
    !Array.isArray(summary.profiles) ||
    !Array.isArray(summary.operations) ||
    !Array.isArray(summary.issues)
  ) {
    throw new Error('data preparation summary contract is invalid')
  }
  assertIsoTimestamp(summary.generatedAt, 'data preparation summary timestamp')
  if (summary.repository !== null) {
    assertExactKeys(
      summary.repository,
      ['commit', 'dirty', 'fingerprint'],
      'data preparation repository identity'
    )
    if (
      !COMMIT_PATTERN.test(String(summary.repository?.commit || '')) ||
      typeof summary.repository?.dirty !== 'boolean' ||
      !HASH_PATTERN.test(String(summary.repository?.fingerprint || ''))
    ) {
      throw new Error('data preparation repository identity is invalid')
    }
  }

  Object.values(DEV_DATA_PREPARATION_PROFILE_COPY).forEach((profileCopy) => {
    validateTargetIdentity(
      summary.target[profileCopy.targetKey],
      `${profileCopy.targetKey} target identity`
    )
  })
  summary.profiles.forEach(validateProfile)
  const profileKeys = summary.profiles.map((profile) => profile.key)
  if (
    profileKeys.length !== PROFILE_KEYS.size ||
    new Set(profileKeys).size !== PROFILE_KEYS.size ||
    !profileKeys.every((key) => PROFILE_KEYS.has(key))
  ) {
    throw new Error('data preparation profile set is invalid')
  }
  summary.operations.forEach(validateDevDataPreparationOperation)
  summary.issues.forEach(validateIssue)

  if (
    summary.boundaries.developmentOnly !== true ||
    summary.boundaries.browserTargetInputAllowed !== false ||
    summary.boundaries.browserShellAccess !== false ||
    summary.boundaries.arbitraryPathInputAllowed !== false ||
    summary.boundaries.fullAcceptanceAutomaticCleanup !== true ||
    summary.boundaries.customerUAT !== false
  ) {
    throw new Error('data preparation boundary contract is invalid')
  }
  return summary
}

async function readJson(response, fallbackMessage) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error(`${fallbackMessage}：响应格式无效`)
  }
  if (!response.ok) {
    throw new Error(
      isSafeText(payload?.message)
        ? `${fallbackMessage}：${payload.message}`
        : fallbackMessage
    )
  }
  return payload
}

function validateActionResult(payload, expectedAction) {
  assertExactKeys(
    payload,
    payload?.reused === undefined
      ? ['action', 'operation', 'schemaVersion']
      : ['action', 'operation', 'reused', 'schemaVersion'],
    'data preparation action result'
  )
  if (
    payload.schemaVersion !== 'plush.dev-data-preparation-action-result/v1' ||
    payload.action !== expectedAction ||
    (payload.reused !== undefined && typeof payload.reused !== 'boolean')
  ) {
    throw new Error('数据准备操作响应校验失败')
  }
  return {
    ...payload,
    operation: validateDevDataPreparationOperation(payload.operation),
  }
}

export function createDevDataPreparationClient({
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is unavailable')
  }
  let csrfToken = ''

  async function session() {
    if (csrfToken) return csrfToken
    const payload = await readJson(
      await fetchImpl(DEV_DATA_PREPARATION_SESSION_API_PATH, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      }),
      '数据准备会话不可用'
    )
    assertExactKeys(
      payload,
      ['apiPrefix', 'csrfToken', 'schemaVersion'],
      'data preparation session'
    )
    if (
      payload?.schemaVersion !== 'plush.dev-data-preparation-session/v1' ||
      typeof payload.csrfToken !== 'string' ||
      payload.csrfToken.length < 32 ||
      payload.apiPrefix !== DEV_DATA_PREPARATION_API_PREFIX
    ) {
      throw new Error('数据准备会话校验失败')
    }
    csrfToken = payload.csrfToken
    return csrfToken
  }

  async function postAction(action, payload) {
    const token = await session()
    return validateActionResult(
      await readJson(
        await fetchImpl(DEV_DATA_PREPARATION_ACTION_API_PATH, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          body: JSON.stringify({ action, payload }),
        }),
        action === 'prepare' ? '计划准备失败' : '计划执行失败'
      ),
      action
    )
  }

  return {
    async summary() {
      return validateDevDataPreparationSummary(
        await readJson(
          await fetchImpl(DEV_DATA_PREPARATION_SUMMARY_API_PATH, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          }),
          '数据准备预检读取失败'
        )
      )
    },
    async operation(operationId) {
      if (!OPERATION_ID_PATTERN.test(String(operationId || ''))) {
        throw new Error('数据准备 operation ID 无效')
      }
      const payload = await readJson(
        await fetchImpl(
          `${DEV_DATA_PREPARATION_OPERATION_API_PREFIX}/${operationId}`,
          {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          }
        ),
        '数据准备回执读取失败'
      )
      assertExactKeys(
        payload,
        ['operation', 'schemaVersion'],
        'data preparation operation result'
      )
      if (
        payload?.schemaVersion !==
        'plush.dev-data-preparation-operation-result/v1'
      ) {
        throw new Error('数据准备 operation 响应校验失败')
      }
      return validateDevDataPreparationOperation(payload.operation)
    },
    prepare(profileKey, idempotencyKey) {
      const idempotencyMatch = IDEMPOTENCY_KEY_PATTERN.exec(
        String(idempotencyKey || '')
      )
      if (
        !PROFILE_KEYS.has(profileKey) ||
        idempotencyMatch?.[1] !== profileKey
      ) {
        throw new Error('数据准备计划参数无效')
      }
      return postAction('prepare', { profileKey, idempotencyKey })
    },
    execute(operationId, confirmation) {
      const confirmationMatch =
        /^DATA_PREPARATION:(core-demo|scenario-demo|full-acceptance):([a-z0-9][a-z0-9_]{2,39}):([0-9a-f]{64}):([0-9a-f-]{36})$/u.exec(
          String(confirmation || '')
        )
      if (
        !OPERATION_ID_PATTERN.test(String(operationId || '')) ||
        !confirmationMatch ||
        confirmationMatch[4] !== operationId
      ) {
        throw new Error('数据准备执行参数无效')
      }
      return postAction('execute', { operationId, confirmation })
    },
    clearSession() {
      csrfToken = ''
    },
  }
}

export function createDataPreparationIdempotencyKey(
  profileKey,
  randomUuid = () => globalThis.crypto.randomUUID()
) {
  if (!PROFILE_KEYS.has(profileKey)) {
    throw new Error('data preparation profile key is invalid')
  }
  const uuid = String(randomUuid())
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error('data preparation idempotency UUID is invalid')
  }
  return `data-preparation:prepare:${profileKey}:${uuid}`
}

export function resolveDataPreparationPrepareIntent(
  currentIntent,
  profileKey,
  randomUuid
) {
  if (
    currentIntent?.profileKey === profileKey &&
    typeof currentIntent.idempotencyKey === 'string' &&
    IDEMPOTENCY_KEY_PATTERN.exec(currentIntent.idempotencyKey)?.[1] ===
      profileKey
  ) {
    return currentIntent
  }
  return Object.freeze({
    profileKey,
    idempotencyKey: createDataPreparationIdempotencyKey(profileKey, randomUuid),
  })
}

export function resolveDataPreparationExecutionConfirmation(
  operation,
  typedConfirmation = ''
) {
  if (
    !operation ||
    !Object.values(DEV_DATA_PREPARATION_PROFILE_KEYS).includes(
      operation.profileKey
    )
  ) {
    throw new TypeError('数据准备 operation 无效')
  }
  return operation.profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
    ? operation.confirmationRequired
    : typedConfirmation
}

export function selectRecoverableDataPreparationOperation(
  operations = [],
  currentOperationId = ''
) {
  if (!Array.isArray(operations)) return null
  const currentOperation = operations.find(
    (operation) => operation.id === currentOperationId
  )
  if (currentOperation) return currentOperation

  return (
    operations
      .filter((operation) => operation?.terminal === false)
      .toSorted(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      )[0] || null
  )
}

export function dataPreparationStatusPresentation(status) {
  const presentations = {
    ready: ['计划待确认', 'blue'],
    launching: ['正在启动', 'processing'],
    running: ['执行中', 'processing'],
    passed: ['已完成', 'success'],
    failed: ['执行失败', 'error'],
    blocked: ['已阻断', 'warning'],
    not_proven: ['结果未证明', 'error'],
    available: ['可准备', 'success'],
  }
  const [label, color] = presentations[status] || ['未知', 'default']
  return { label, color }
}

export function formatDataPreparationTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return '未记录'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(value))
}
