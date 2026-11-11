import { createDevOperationUUID } from './devOperationIdentity.mjs'
import { DEV_DATA_PREPARATION_ROUTE } from './devRoutes.mjs'
import manualAcceptanceContract from '../../../../server/internal/manualacceptance/contract.json' with { type: 'json' }

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

export const DEV_DATA_PREPARATION_TARGET_KEYS = Object.freeze({
  localDevelopment: 'local-development',
  customerTrial133: 'customer-trial-133',
  isolatedLocal: 'isolated-local',
})

export const DEV_DATA_PREPARATION_TARGET_QUERY_KEY = 'dataTarget'

export function resolveDataPreparationAvailability(
  summary,
  profileKey,
  targetKey
) {
  const profile = summary?.profiles?.find((item) => item.key === profileKey)
  const targetName =
    profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
      ? 'fullAcceptance'
      : targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
        ? 'scenarioDemo133'
        : 'scenarioDemo'
  const target = summary?.target?.[targetName]
  const blockers = []
  if (!profile || !summary.repository) {
    blockers.push({
      code: 'repository_identity_unavailable',
      title: '代码身份未确认',
      message: '尚未读到当前代码身份，请重新检查。',
    })
  } else if (profile.exactCleanCommitRequired && summary.repository.dirty) {
    blockers.push({
      code: 'full_acceptance_requires_clean_repository',
      title: '有未提交改动',
      message:
        '完整回归需要固定的干净提交。日常手测数据仍可在“测试数据”补齐。',
    })
  }
  const requiresTargetReadback =
    targetName === 'scenarioDemo133' && target?.status === 'not_proven'
  if (target?.status !== 'available' && !requiresTargetReadback) {
    const code = `${profileKey.replaceAll('-', '_')}_target_unavailable`
    blockers.push({
      code,
      title: targetName === 'fullAcceptance' ? '隔离库未就绪' : '目标预检未通过',
      message:
        summary?.issues?.find((issue) => issue.code === code)?.message ||
        '目标预检尚未通过，请重新检查。',
      nextAction:
        targetName === 'fullAcceptance'
          ? '检查开发服务的隔离验收库配置，然后重新检查。'
          : '先在数据库迁移页核对开发库、迁移和运行状态，处理后重新检查。',
      migration: targetName !== 'fullAcceptance',
    })
  }
  return {
    target,
    blockers,
    status: blockers.length
      ? 'blocked'
      : requiresTargetReadback
        ? 'not_proven'
        : 'available',
    label: blockers.length
      ? '待处理'
      : requiresTargetReadback
        ? '准备时核对目标'
        : '可准备',
  }
}

const PROFILE_TARGET_KEYS = Object.freeze({
  [DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo]: Object.freeze([
    DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment,
  ]),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo]: Object.freeze([
    DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment,
    DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133,
  ]),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance]: Object.freeze([
    DEV_DATA_PREPARATION_TARGET_KEYS.isolatedLocal,
  ]),
})

export const ACTIVE_DATA_PREPARATION_PROFILES = Object.freeze([
  DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
  DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance,
])

export function supportsDataPreparationTarget(profileKey, targetKey) {
  return ACTIVE_DATA_PREPARATION_PROFILES.includes(profileKey) &&
    PROFILE_TARGET_KEYS[profileKey].includes(targetKey)
}

export const DEV_DATA_PREPARATION_PROFILE_COPY = Object.freeze({
  [DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo]: Object.freeze({
    title: '本地长期基础数据',
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo]: Object.freeze({
    title: '手测数据',
    purpose: '本地和 Demo 使用同一套手测数据，只补齐缺项，保留已有记录。',
    scope: '基础资料、各岗位任务、产品多角度图片、业务附件，以及各菜单的正常、异常和纠正流程。',
    prepareButtonLabel: '补齐手测数据',
    confirmationDescription: '按当前项目的样本补齐所选环境，已有业务记录会保留。',
    successDescription: '手测数据已补齐并核对，可以登录各岗位开始手测。',
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance]: Object.freeze({
    title: '完整回归',
    prepareButtonLabel: '准备完整回归',
    confirmationDescription: '运行全部已登记的业务场景，结束后自动清理临时数据库。',
    successDescription: '业务回归结果、各阶段耗时和临时数据库清理结果已记录。',
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
const SUMMARY_TARGET_KEYS = Object.freeze([
  'scenarioDemo',
  'scenarioDemo133',
  'fullAcceptance',
])
const SUMMARY_STATUSES = new Set(['success', 'partial', 'blocked'])
const TARGET_STATUSES = new Set(['available', 'blocked', 'not_proven'])
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
const OPERATION_CONTRACT_CLASSIFICATIONS = new Set([
  'current',
  'historical',
  'unresolved',
])
const ISSUE_SEVERITIES = new Set(['warning', 'blocked'])
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u
const IDEMPOTENCY_KEY_PATTERN =
  /^data-preparation:prepare:(scenario-demo|full-acceptance):(local-development|customer-trial-133|isolated-local):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9_]{2,39}$/u
const DATASET_KEY_PATTERN = /^[a-z][a-z0-9_-]{2,63}$/u
const SCENARIO_DEMO_DATASET_KEY = 'yoyoosun-manual-acceptance'
const SCENARIO_DEMO_DATA_VERSION = manualAcceptanceContract.dataVersion
const SCENARIO_DEMO_RUN_ID = manualAcceptanceContract.runId
const SCENARIO_DEMO_CATALOG_TARGET_COUNT = 50
const SCENARIO_DEMO_CATALOG_READY_COUNT = 40
const SCENARIO_DEMO_BROWSER_CHECKS_PENDING = 10
const ACCEPTANCE_EXECUTION_SCOPE = 'all_registered_chains'

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

function validateOperationContract(contract, expectedClassification = '') {
  assertExactKeys(
    contract,
    [
      'classification',
      'dataVersion',
      'datasetRunId',
      'kind',
      'semanticDigest',
    ],
    'data preparation operation contract'
  )
  if (
    contract.kind !==
      'plush.dev-data-preparation-operation-contract' ||
    !OPERATION_CONTRACT_CLASSIFICATIONS.has(contract.classification) ||
    (expectedClassification &&
      contract.classification !== expectedClassification) ||
    (contract.dataVersion !== null &&
      !/^20\d{2}\.\d{2}\.\d{2}-v\d+$/u.test(contract.dataVersion)) ||
    (contract.datasetRunId !== null &&
      !/^20\d{6}-V\d+$/u.test(contract.datasetRunId)) ||
    (contract.semanticDigest !== null &&
      !HASH_PATTERN.test(contract.semanticDigest))
  ) {
    throw new Error('data preparation operation contract is invalid')
  }
  if (
    contract.classification === 'current' &&
    (contract.dataVersion !== SCENARIO_DEMO_DATA_VERSION ||
      contract.datasetRunId !== SCENARIO_DEMO_RUN_ID ||
      !HASH_PATTERN.test(String(contract.semanticDigest || '')))
  ) {
    throw new Error('current data preparation operation contract is invalid')
  }
  return contract
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

function validateTiming(timing, { terminal }) {
  assertExactKeys(
    timing,
    ['completedAt', 'durationMs', 'startedAt'],
    'data preparation operation timing'
  )
  const started = timing.startedAt !== null
  const completed = timing.completedAt !== null
  if (
    (started && !validTimestamp(timing.startedAt)) ||
    (completed && !validTimestamp(timing.completedAt)) ||
    (timing.durationMs !== null &&
      (!Number.isFinite(timing.durationMs) || timing.durationMs < 0)) ||
    (completed && !started) ||
    (terminal && started && !completed) ||
    (!started && timing.durationMs !== null) ||
    (started && completed && timing.durationMs === null)
  ) {
    throw new Error('data preparation operation timing is invalid')
  }
  return timing
}

function validTimestamp(value) {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

function validateStringList(values, field) {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    !values.every((value) => isSafeText(value, 300))
  ) {
    throw new Error(`${field} is invalid`)
  }
  return values
}

const ACCEPTANCE_PLAN_FIELDS = Object.freeze([
  'catalogTargetCount',
  'chainCount',
  'chainDataDigest',
  'chainVerificationDigest',
  'chains',
  'contract',
  'dataStageCount',
  'dataStages',
  'executionScope',
  'freshBatchPerRun',
  'reuseRules',
  'scenarioCount',
  'scenarioKinds',
  'selectorAffectsExecution',
  'sourceContract',
  'stepCount',
])

// The data workspace consumes the review projection, not the runner's frozen definition snapshot.
export function projectDataPreparationAcceptancePlan(plan) {
  return validateAcceptancePlan(
    Object.fromEntries(
      ACCEPTANCE_PLAN_FIELDS.map((field) => [field, plan[field]])
    )
  )
}

function validateAcceptancePlan(plan) {
  assertExactKeys(plan, ACCEPTANCE_PLAN_FIELDS, 'data preparation acceptance plan')
  if (
    !isSafeText(plan.contract, 120) ||
    !isSafeText(plan.sourceContract, 120) ||
    !HASH_PATTERN.test(String(plan.chainDataDigest || '')) ||
    !HASH_PATTERN.test(String(plan.chainVerificationDigest || '')) ||
    ![plan.chainCount, plan.stepCount, plan.scenarioCount, plan.dataStageCount]
      .concat(plan.catalogTargetCount)
      .every((value) => Number.isSafeInteger(value) && value > 0) ||
    plan.selectorAffectsExecution !== false ||
    plan.executionScope !== ACCEPTANCE_EXECUTION_SCOPE ||
    plan.freshBatchPerRun !== true ||
    !Array.isArray(plan.scenarioKinds) ||
    !Array.isArray(plan.dataStages) ||
    !Array.isArray(plan.reuseRules) ||
    !Array.isArray(plan.chains)
  ) {
    throw new Error('data preparation acceptance plan is invalid')
  }
  for (const [field, entries] of [
    ['scenario kind', plan.scenarioKinds],
    ['data stage', plan.dataStages],
  ]) {
    entries.forEach((entry) => {
      assertExactKeys(entry, ['key', 'label'], `acceptance ${field}`)
      assertSafeText(entry.key, `acceptance ${field} key`, 120)
      assertSafeText(entry.label, `acceptance ${field} label`, 120)
    })
  }
  plan.reuseRules.forEach((rule) => {
    assertExactKeys(
      rule,
      ['condition', 'label', 'nextAction', 'status'],
      'acceptance reuse rule'
    )
    ;['condition', 'label', 'nextAction', 'status'].forEach((field) =>
      assertSafeText(rule[field], `acceptance reuse rule ${field}`, 300)
    )
  })
  let stepCount = 0
  let scenarioCount = 0
  plan.chains.forEach((chain) => {
    assertExactKeys(
      chain,
      [
        'key',
        'label',
        'scenarioCount',
        'scenarioKinds',
        'stepCount',
        'steps',
        'summary',
      ],
      'acceptance business chain'
    )
    assertSafeText(chain.key, 'acceptance business chain key', 120)
    assertSafeText(chain.label, 'acceptance business chain label', 240)
    assertSafeText(chain.summary, 'acceptance business chain summary', 500)
    if (
      !Number.isSafeInteger(chain.stepCount) ||
      !Number.isSafeInteger(chain.scenarioCount) ||
      !Array.isArray(chain.steps) ||
      chain.steps.length !== chain.stepCount
    ) {
      throw new Error('acceptance business chain counts are invalid')
    }
    validateStringList(chain.scenarioKinds, 'acceptance scenario kinds')
    stepCount += chain.stepCount
    scenarioCount += chain.scenarioCount
    chain.steps.forEach((step) => {
      assertExactKeys(
        step,
        [
          'actions',
          'facts',
          'fromLabel',
          'key',
          'label',
          'preconditions',
          'responsibleRole',
          'results',
          'scenarioKinds',
          'toLabel',
        ],
        'acceptance business chain step'
      )
      ;['key', 'label', 'fromLabel', 'toLabel', 'responsibleRole'].forEach(
        (field) => assertSafeText(step[field], `acceptance step ${field}`, 300)
      )
      ;[
        'preconditions',
        'actions',
        'results',
        'facts',
        'scenarioKinds',
      ].forEach((field) =>
        validateStringList(step[field], `acceptance step ${field}`)
      )
    })
  })
  if (
    plan.chains.length !== plan.chainCount ||
    stepCount !== plan.stepCount ||
    scenarioCount !== plan.scenarioCount ||
    plan.dataStages.length !== plan.dataStageCount
  ) {
    throw new Error('data preparation acceptance plan totals are invalid')
  }
  return plan
}

function validateTargetIdentity(target, field) {
  assertExactKeys(
    target,
    [
      'customerConfigProductVersion',
      'customerConfigRevision',
      'databaseName',
      'migrationVersion',
      'safeTarget',
      'status',
      'targetFingerprint',
    ],
    field
  )
  if (
    !TARGET_STATUSES.has(target.status) ||
    typeof target.safeTarget !== 'string' ||
    !HASH_PATTERN.test(String(target.targetFingerprint || ''))
  ) {
    throw new Error(`${field} is invalid`)
  }
  assertSafeText(target.safeTarget, `${field} safe target`, 300)
  ;[
    'databaseName',
    'migrationVersion',
    'customerConfigRevision',
    'customerConfigProductVersion',
  ].forEach((key) => assertSafeText(target[key], `${field} ${key}`, 180))
  return target
}

function validateDatasetEnvironmentContract(contract) {
  assertExactKeys(
    contract,
    [
      'customerTrial133',
      'datasetKey',
      'dataVersion',
      'realCustomerImport',
      'runId',
      'kind',
      'profileSemanticDigests',
      'semanticDigest',
      'simulatedOnly',
      'unitCount',
      'warehouseCount',
    ],
    'data environment contract'
  )
  assertExactKeys(
    contract.profileSemanticDigests,
    [...PROFILE_KEYS],
    'data environment profile semantic digests'
  )
  assertExactKeys(
    contract.customerTrial133,
    [
      'configProductVersion',
      'configRevision',
      'databaseLifecycle',
      'databaseName',
      'deploymentTarget',
      'minimumMigration',
      'target',
    ],
    'customer-trial data environment contract'
  )
  if (
    contract.kind !== 'plush.dev-data-environment-contract' ||
    contract.datasetKey !== SCENARIO_DEMO_DATASET_KEY ||
    contract.dataVersion !== SCENARIO_DEMO_DATA_VERSION ||
    contract.runId !== SCENARIO_DEMO_RUN_ID ||
    !HASH_PATTERN.test(String(contract.semanticDigest || '')) ||
    [...PROFILE_KEYS].some((profileKey) =>
      !HASH_PATTERN.test(String(contract.profileSemanticDigests[profileKey] || ''))
    ) ||
    contract.profileSemanticDigests[DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo] !== contract.semanticDigest ||
    contract.profileSemanticDigests[DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance] !== contract.semanticDigest ||
    contract.simulatedOnly !== true ||
    contract.realCustomerImport !== false ||
    contract.unitCount !== manualAcceptanceContract.units.length ||
    contract.warehouseCount !== manualAcceptanceContract.warehouses.length ||
    contract.customerTrial133.target !== 'customer-trial-133' ||
    contract.customerTrial133.deploymentTarget !== 'demo-133' ||
    contract.customerTrial133.databaseName !== 'plush_erp_demo_v1' ||
    contract.customerTrial133.databaseLifecycle !==
      'long-lived-registered-target' ||
    !/^20[0-9]{12}$/u.test(
      String(contract.customerTrial133.minimumMigration || '')
    )
  ) {
    throw new Error('data environment contract is invalid')
  }
  const requiredConfigFields = ['configRevision', 'configProductVersion']
  requiredConfigFields.forEach((key) =>
    assertSafeText(
      contract.customerTrial133[key],
      `customer-trial data environment ${key}`,
      180
    )
  )
  return contract
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

function validateReadback(
  readback,
  { profileKey, status, targetFingerprint, targetKey, targetSummary }
) {
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
    const remoteTarget =
      targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
    assertExactKeys(
      readback,
      [
        ...(remoteTarget ? ['backupReceipt'] : []),
        'browserChecksPending',
        'catalogReadyCount',
        'catalogTargetCount',
        'cleanupSupported',
        'customerConfigRevision',
        'databaseName',
        'dataVersion',
        'datasetKey',
        'factCount',
        'manualAcceptanceCompleted',
        'migrationVersion',
        'processRuntimeCount',
        'profileKey',
        'release',
        'replayMode',
        'runId',
        'schemaVersion',
        'semanticDigest',
        'sourceDocumentCount',
        'stageCount',
        'targetEnvironment',
        'targetFingerprint',
        'targetKey',
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
      !PROFILE_TARGET_KEYS[
        DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
      ].includes(readback.targetKey) ||
      readback.targetKey !== targetKey ||
      readback.targetEnvironment !== readback.targetKey ||
      !COMMIT_PATTERN.test(String(readback.release || '')) ||
      !/^20[0-9]{12}$/u.test(String(readback.migrationVersion || '')) ||
      !HASH_PATTERN.test(String(readback.semanticDigest || '')) ||
      readback.stageCount !== 9 ||
      !isSafeText(readback.databaseName, 180) ||
      !isSafeText(readback.customerConfigRevision, 180) ||
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
    if (remoteTarget) {
      assertExactKeys(
        readback.backupReceipt,
        [
          'backupAlias',
          'containsCredentials',
          'containsPaths',
          'containsSecrets',
          'createdAt',
          'databaseName',
          'migrationVersion',
          'releaseSha',
          'schemaVersion',
          'sha256',
          'sizeBytes',
          'status',
        ],
        'scenario demo backup receipt'
      )
      if (
        readback.backupReceipt.schemaVersion !==
          'plush.customer-trial-133-data-backup/v1' ||
        readback.backupReceipt.status !== 'passed' ||
        readback.backupReceipt.backupAlias !== targetSummary.rollbackPoint ||
        readback.backupReceipt.releaseSha !== readback.release ||
        readback.backupReceipt.databaseName !== readback.databaseName ||
        readback.backupReceipt.migrationVersion !== readback.migrationVersion ||
        !HASH_PATTERN.test(String(readback.backupReceipt.sha256 || '')) ||
        !Number.isSafeInteger(readback.backupReceipt.sizeBytes) ||
        readback.backupReceipt.sizeBytes < 1 ||
        !validTimestamp(readback.backupReceipt.createdAt) ||
        readback.backupReceipt.containsSecrets !== false ||
        readback.backupReceipt.containsCredentials !== false ||
        readback.backupReceipt.containsPaths !== false
      ) {
        throw new Error('scenario demo backup receipt is invalid')
      }
    }
    return readback
  }

  assertExactKeys(
    readback,
    [
      'catalogTargetCount',
      'chainCount',
      'chainDataDigest',
      'chainVerificationDigest',
      'cleanupComplete',
      'dataStageCount',
      'dataVersion',
      'datasetCompletedAt',
      'datasetDurationMs',
      'datasetStartedAt',
      'profileKey',
      'reportStatus',
      'residualDatabaseCount',
      'scenarioCount',
      'schemaVersion',
      'stageTimings',
      'stepCount',
      'targetFingerprint',
    ],
    'full acceptance readback'
  )
  if (
    !['passed', 'failed'].includes(readback.reportStatus) ||
    typeof readback.cleanupComplete !== 'boolean' ||
    !Number.isSafeInteger(readback.residualDatabaseCount) ||
    readback.residualDatabaseCount < 0 ||
    !HASH_PATTERN.test(String(readback.chainDataDigest || '')) ||
    !HASH_PATTERN.test(String(readback.chainVerificationDigest || '')) ||
    ![
      readback.chainCount,
      readback.stepCount,
      readback.scenarioCount,
      readback.dataStageCount,
      readback.catalogTargetCount,
    ].every((value) => Number.isSafeInteger(value) && value > 0) ||
    !Array.isArray(readback.stageTimings)
  ) {
    throw new Error('full acceptance readback is invalid')
  }
  const hasDatasetTiming = readback.datasetStartedAt !== null
  if (
    (hasDatasetTiming &&
      (!validTimestamp(readback.datasetStartedAt) ||
        !validTimestamp(readback.datasetCompletedAt) ||
        !Number.isFinite(readback.datasetDurationMs) ||
        readback.datasetDurationMs < 0 ||
        !isSafeText(readback.dataVersion, 120) ||
        readback.stageTimings.length !== readback.dataStageCount)) ||
    (!hasDatasetTiming &&
      (readback.datasetCompletedAt !== null ||
        readback.datasetDurationMs !== null ||
        readback.dataVersion !== null ||
        readback.stageTimings.length !== 0)) ||
    (readback.reportStatus === 'passed' && !hasDatasetTiming)
  ) {
    throw new Error('full acceptance dataset timing is invalid')
  }
  readback.stageTimings.forEach((stage) => {
    assertExactKeys(
      stage,
      ['completedAt', 'durationMs', 'key', 'startedAt', 'status'],
      'full acceptance stage timing'
    )
    const stageHasTiming = stage.status !== 'not_started'
    if (
      !isSafeText(stage.key, 120) ||
      !['completed', 'failed', 'not_started'].includes(stage.status) ||
      (stageHasTiming &&
        (!validTimestamp(stage.startedAt) ||
          !validTimestamp(stage.completedAt) ||
          !Number.isFinite(stage.durationMs) ||
          stage.durationMs < 0)) ||
      (!stageHasTiming &&
        (stage.startedAt !== null ||
          stage.completedAt !== null ||
          stage.durationMs !== null))
    ) {
      throw new Error('full acceptance stage timing is invalid')
    }
  })
  return readback
}

export function validateDevDataPreparationOperation(operation) {
  assertExactKeys(
    operation,
    [
      'confirmationRequired',
      'contract',
      'createdAt',
      'events',
      'id',
      'issues',
      'planHash',
      'profileKey',
      'readback',
      'repository',
      'runId',
      'status',
      'targetSummary',
      'terminal',
      'timing',
      'updatedAt',
    ],
    'data preparation operation'
  )
  validateOperationContract(operation.contract, 'current')
  const targetSummaryKeys = [
    'automaticCleanup',
    'disposable',
    'preflightFingerprint',
    'safeTarget',
    'targetFingerprint',
    'targetKey',
  ]
  const evidenceRichTarget = Object.hasOwn(
    operation.targetSummary || {},
    'releaseSha'
  )
  assertExactKeys(
    operation.targetSummary,
    evidenceRichTarget
      ? [
          ...targetSummaryKeys,
          'customerConfigRevision',
          'databaseName',
          'datasetRunId',
          'datasetVersion',
          'migrationVersion',
          'releaseSha',
          'rollbackPoint',
          'semanticDigest',
        ]
      : targetSummaryKeys,
    'data preparation target summary'
  )
  assertExactKeys(
    operation.repository,
    ['commit', 'dirty', 'fingerprint'],
    'data preparation operation repository identity'
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
    !PROFILE_TARGET_KEYS[operation.profileKey]?.includes(
      operation.targetSummary.targetKey
    ) ||
    !COMMIT_PATTERN.test(String(operation.repository.commit || '')) ||
    typeof operation.repository.dirty !== 'boolean' ||
    !HASH_PATTERN.test(String(operation.repository.fingerprint || '')) ||
    typeof operation.targetSummary.disposable !== 'boolean' ||
    typeof operation.targetSummary.automaticCleanup !== 'boolean' ||
    (evidenceRichTarget &&
      (!COMMIT_PATTERN.test(String(operation.targetSummary.releaseSha || '')) ||
        !/^[a-z][a-z0-9_-]{0,62}$/u.test(
          String(operation.targetSummary.databaseName || '')
        ) ||
        !/^20(?:[0-9]{6}|[0-9]{12})$|^verified-during-lifecycle$/u.test(
          String(operation.targetSummary.migrationVersion || '')
        ) ||
        operation.targetSummary.datasetVersion !== SCENARIO_DEMO_DATA_VERSION ||
        operation.targetSummary.datasetRunId !== SCENARIO_DEMO_RUN_ID ||
        !HASH_PATTERN.test(
          String(operation.targetSummary.semanticDigest || '')
        ))) ||
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
  if (evidenceRichTarget) {
    assertSafeText(
      operation.targetSummary.customerConfigRevision,
      'data preparation customer config revision',
      240
    )
    assertSafeText(
      operation.targetSummary.rollbackPoint,
      'data preparation rollback point',
      240
    )
  }
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
  validateTiming(operation.timing, { terminal: operation.terminal })
  validateReadback(operation.readback, {
    profileKey: operation.profileKey,
    status: operation.status,
    targetFingerprint: operation.targetSummary.targetFingerprint,
    targetKey: operation.targetSummary.targetKey,
    targetSummary: operation.targetSummary,
  })

  const expectedConfirmation = `DATA_PREPARATION:${operation.profileKey}:${operation.targetSummary.targetKey}:${operation.runId}:${operation.planHash}:${operation.id}`
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

function validateOperationReference(operation) {
  assertExactKeys(
    operation,
    ['contract', 'id', 'profileKey', 'status', 'targetKey', 'terminal', 'updatedAt'],
    'data preparation operation reference'
  )
  if (
    !OPERATION_ID_PATTERN.test(String(operation.id || '')) ||
    !PROFILE_KEYS.has(operation.profileKey) ||
    !OPERATION_STATUSES.has(operation.status) ||
    operation.terminal !== TERMINAL_OPERATION_STATUSES.has(operation.status)
  ) {
    throw new Error('data preparation operation reference is invalid')
  }
  if (operation.targetKey !== null && !Object.values(DEV_DATA_PREPARATION_TARGET_KEYS).includes(operation.targetKey)) {
    throw new Error('data preparation operation reference target is invalid')
  }
  assertIsoTimestamp(
    operation.updatedAt,
    'data preparation operation reference timestamp'
  )
  validateOperationContract(operation.contract)
  return operation
}

export function validateDevDataPreparationSummary(summary) {
  assertExactKeys(
    summary,
    [
      'boundaries',
      'acceptancePlan',
      'datasetContract',
      'generatedAt',
      'historicalOperations',
      'issues',
      'currentOperations',
      'profiles',
      'repository',
      'kind',
      'status',
      'target',
      'unresolvedOperations',
    ],
    'data preparation summary'
  )
  assertExactKeys(
    summary.target,
    SUMMARY_TARGET_KEYS,
    'data preparation target'
  )
  validateAcceptancePlan(summary.acceptancePlan)
  validateDatasetEnvironmentContract(summary.datasetContract)
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
    summary.kind !== 'plush.dev-data-preparation-summary' ||
    !SUMMARY_STATUSES.has(summary.status) ||
    !Array.isArray(summary.profiles) ||
    !Array.isArray(summary.currentOperations) ||
    !Array.isArray(summary.historicalOperations) ||
    !Array.isArray(summary.unresolvedOperations) ||
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

  SUMMARY_TARGET_KEYS.forEach((key) => {
    validateTargetIdentity(summary.target[key], `${key} target identity`)
  })
  summary.profiles.forEach(validateProfile)
  const profileKeys = summary.profiles.map((profile) => profile.key)
  if (
    profileKeys.length !== ACTIVE_DATA_PREPARATION_PROFILES.length ||
    new Set(profileKeys).size !== ACTIVE_DATA_PREPARATION_PROFILES.length ||
    !profileKeys.every((key) => ACTIVE_DATA_PREPARATION_PROFILES.includes(key))
  ) {
    throw new Error('data preparation profile set is invalid')
  }
  summary.currentOperations.forEach(validateDevDataPreparationOperation)
  summary.historicalOperations.forEach(validateOperationReference)
  summary.unresolvedOperations.forEach(validateOperationReference)
  if (
    summary.historicalOperations.some(
      (operation) => operation.contract.classification !== 'historical'
    ) ||
    summary.unresolvedOperations.some(
      (operation) => operation.contract.classification !== 'unresolved'
    ) ||
    summary.currentOperations.some(
      (operation) =>
        operation.contract.semanticDigest !==
        summary.datasetContract.profileSemanticDigests[operation.profileKey]
    )
  ) {
    throw new Error('data preparation operation buckets are invalid')
  }
  summary.currentOperations.forEach((operation) => {
    if (
      operation.profileKey !== DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
    ) {
      return
    }
    const { readback } = operation
    if (
      readback &&
      (readback.chainDataDigest !== summary.acceptancePlan.chainDataDigest ||
        readback.chainVerificationDigest !==
          summary.acceptancePlan.chainVerificationDigest ||
        readback.chainCount !== summary.acceptancePlan.chainCount ||
        readback.stepCount !== summary.acceptancePlan.stepCount ||
        readback.scenarioCount !== summary.acceptancePlan.scenarioCount ||
        readback.dataStageCount !== summary.acceptancePlan.dataStageCount ||
        readback.catalogTargetCount !==
          summary.acceptancePlan.catalogTargetCount)
    ) {
      throw new Error('full acceptance readback does not match current plan')
    }
  })
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
      ? ['action', 'operation', 'kind']
      : ['action', 'operation', 'reused', 'kind'],
    'data preparation action result'
  )
  if (
    payload.kind !== 'plush.dev-data-preparation-action-result' ||
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
      ['apiPrefix', 'csrfToken', 'kind'],
      'data preparation session'
    )
    if (
      payload?.kind !== 'plush.dev-data-preparation-session' ||
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
    async summary({ force = false } = {}) {
      return validateDevDataPreparationSummary(
        await readJson(
          await fetchImpl(
            force
              ? `${DEV_DATA_PREPARATION_SUMMARY_API_PATH}?refresh=authoritative`
              : DEV_DATA_PREPARATION_SUMMARY_API_PATH,
            {
              method: 'GET',
              cache: 'no-store',
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            }
          ),
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
        ['operation', 'kind'],
        'data preparation operation result'
      )
      if (
        payload?.kind !==
        'plush.dev-data-preparation-operation-result'
      ) {
        throw new Error('数据准备 operation 响应校验失败')
      }
      return validateDevDataPreparationOperation(payload.operation)
    },
    prepare(profileKey, targetKey, idempotencyKey) {
      const idempotencyMatch = IDEMPOTENCY_KEY_PATTERN.exec(
        String(idempotencyKey || '')
      )
      if (
        !supportsDataPreparationTarget(profileKey, targetKey) ||
        idempotencyMatch?.[1] !== profileKey ||
        idempotencyMatch?.[2] !== targetKey
      ) {
        throw new Error('数据准备计划参数无效')
      }
      return postAction('prepare', { profileKey, targetKey, idempotencyKey })
    },
    execute(operationId, confirmation) {
      const confirmationMatch =
        /^DATA_PREPARATION:(scenario-demo|full-acceptance):(local-development|customer-trial-133|isolated-local):([a-z0-9][a-z0-9_]{2,39}):([0-9a-f]{64}):([0-9a-f-]{36})$/u.exec(
          String(confirmation || '')
        )
      if (
        !OPERATION_ID_PATTERN.test(String(operationId || '')) ||
        !confirmationMatch ||
        !supportsDataPreparationTarget(confirmationMatch[1], confirmationMatch[2]) ||
        confirmationMatch[5] !== operationId
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
  targetKey,
  randomUuid = () => createDevOperationUUID()
) {
  if (!supportsDataPreparationTarget(profileKey, targetKey)) {
    throw new Error('data preparation profile target is invalid')
  }
  const uuid = String(randomUuid())
  if (!UUID_PATTERN.test(uuid)) {
    throw new Error('data preparation idempotency UUID is invalid')
  }
  return `data-preparation:prepare:${profileKey}:${targetKey}:${uuid}`
}

export function resolveDataPreparationPrepareIntent(
  currentIntent,
  profileKey,
  targetKey,
  randomUuid
) {
  if (
    currentIntent?.profileKey === profileKey &&
    currentIntent?.targetKey === targetKey &&
    typeof currentIntent.idempotencyKey === 'string' &&
    IDEMPOTENCY_KEY_PATTERN.exec(currentIntent.idempotencyKey)?.[1] ===
      profileKey &&
    IDEMPOTENCY_KEY_PATTERN.exec(currentIntent.idempotencyKey)?.[2] ===
      targetKey
  ) {
    return currentIntent
  }
  return Object.freeze({
    profileKey,
    targetKey,
    idempotencyKey: createDataPreparationIdempotencyKey(
      profileKey,
      targetKey,
      randomUuid
    ),
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
  operations,
  currentOperationId,
  preferredProfileKey,
  preferredTargetKey
) {
  const matching = operations.filter((operation) =>
    operation.profileKey === preferredProfileKey &&
    operation.targetSummary?.targetKey === preferredTargetKey
  ).toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
  const writing = matching.find(({ status }) => status === 'launching' || status === 'running')
  if (writing) return writing
  const currentOperation = matching.find(
    (operation) => operation.id === currentOperationId
  )
  if (currentOperation) return currentOperation

  const latest = matching[0]
  return latest?.terminal === false ? latest : null
}

export function dataPreparationStatusPresentation(status) {
  const presentations = {
    ready: ['计划待确认', 'blue'],
    launching: ['正在启动', 'processing'],
    running: ['执行中', 'processing'],
    passed: ['已完成', 'success'],
    failed: ['执行失败', 'error'],
    blocked: ['已阻断', 'warning'],
    not_proven: ['结果未证明', 'default'],
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
