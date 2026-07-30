import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_DATA_PREPARATION_ACTION_API_PATH,
  DEV_DATA_PREPARATION_API_PREFIX,
  DEV_DATA_PREPARATION_OPERATION_API_PREFIX,
  DEV_DATA_PREPARATION_PROFILE_COPY,
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DATA_PREPARATION_SESSION_API_PATH,
  DEV_DATA_PREPARATION_SOURCE_PATH,
  DEV_DATA_PREPARATION_SUMMARY_API_PATH,
  createDataPreparationIdempotencyKey,
  createDevDataPreparationClient,
  resolveDataPreparationExecutionConfirmation,
  resolveDataPreparationPrepareIntent,
  selectRecoverableDataPreparationOperation,
  validateDevDataPreparationOperation,
  validateDevDataPreparationSummary,
} from './devDataPreparation.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_HASH = 'a'.repeat(64)
const TARGET_FINGERPRINT = 'b'.repeat(64)
const REPOSITORY_FINGERPRINT = 'c'.repeat(64)
const RUN_ID = 'core_demo_20260729'
const SCENARIO_OPERATION_RUN_ID = 'scenario_demo_20260729'
const SCENARIO_DATASET_RUN_ID = '20260716-V5'
const CREATED_AT = '2026-07-29T02:00:00.000Z'
const UPDATED_AT = '2026-07-29T02:01:00.000Z'

function response(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload
    },
  }
}

function operationFixture(overrides = {}) {
  const operation = {
    id: OPERATION_ID,
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo,
    status: 'ready',
    planHash: PLAN_HASH,
    runId: RUN_ID,
    targetSummary: {
      safeTarget: '共享开发库（固定身份）',
      targetFingerprint: TARGET_FINGERPRINT,
      preflightFingerprint: 'f'.repeat(64),
      disposable: false,
      automaticCleanup: false,
    },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    events: [
      {
        at: CREATED_AT,
        status: 'ready',
        message: '固定计划已准备',
      },
    ],
    issues: [],
    readback: null,
    confirmationRequired: `DATA_PREPARATION:core-demo:${RUN_ID}:${PLAN_HASH}:${OPERATION_ID}`,
    terminal: false,
    ...overrides,
  }
  return operation
}

function scenarioReadbackFixture(overrides = {}) {
  return {
    schemaVersion: 'plush.dev-data-preparation-readback/v1',
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    targetFingerprint: '9'.repeat(64),
    datasetKey: 'yoyoosun-manual-acceptance',
    dataVersion: '2026.07.16-v5',
    runId: SCENARIO_DATASET_RUN_ID,
    sourceDocumentCount: 16,
    processRuntimeCount: 20,
    factCount: 14,
    catalogReadyCount: 40,
    catalogTargetCount: 50,
    browserChecksPending: 10,
    manualAcceptanceCompleted: false,
    cleanupSupported: false,
    replayMode: 'exact-create-or-readback',
    ...overrides,
  }
}

function scenarioOperationFixture(overrides = {}) {
  return operationFixture({
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    status: 'passed',
    runId: SCENARIO_OPERATION_RUN_ID,
    targetSummary: {
      safeTarget: '共享开发库业务场景（固定身份）',
      targetFingerprint: '9'.repeat(64),
      preflightFingerprint: '8'.repeat(64),
      disposable: false,
      automaticCleanup: false,
    },
    confirmationRequired: '',
    terminal: true,
    readback: scenarioReadbackFixture(),
    ...overrides,
  })
}

function summaryFixture() {
  return {
    schemaVersion: 'plush.dev-data-preparation-summary/v1',
    status: 'success',
    generatedAt: CREATED_AT,
    repository: {
      commit: 'd'.repeat(40),
      dirty: false,
      fingerprint: REPOSITORY_FINGERPRINT,
    },
    target: {
      coreDemo: {
        status: 'available',
        safeTarget: '共享开发库（固定身份）',
        targetFingerprint: TARGET_FINGERPRINT,
      },
      scenarioDemo: {
        status: 'available',
        safeTarget: '共享开发库业务场景（固定身份）',
        targetFingerprint: '9'.repeat(64),
      },
      fullAcceptance: {
        status: 'available',
        safeTarget: '专用隔离验收库',
        targetFingerprint: 'e'.repeat(64),
      },
    },
    profiles: [
      {
        key: 'core-demo',
        title: '共享开发基础数据',
        purpose: '稳定准备共享账号与基础主数据',
        writesDatabase: true,
        dataRetention: 'long-lived',
        cleanupMode: 'not-supported',
        exactCleanCommitRequired: false,
        requiredEnvironment: ['共享开发库'],
      },
      {
        key: 'scenario-demo',
        title: '业务场景演示数据',
        purpose: '补齐固定批次业务场景，不是完整验收',
        writesDatabase: true,
        dataRetention: 'long-lived',
        cleanupMode: 'forward-only',
        exactCleanCommitRequired: false,
        requiredEnvironment: ['共享开发库', '固定场景目录'],
      },
      {
        key: 'full-acceptance',
        title: '完整验收数据',
        purpose: '在隔离库执行 50 项验收',
        writesDatabase: true,
        dataRetention: 'ephemeral',
        cleanupMode: 'automatic',
        exactCleanCommitRequired: true,
        requiredEnvironment: ['clean exact commit', '专用隔离库'],
      },
    ],
    operations: [operationFixture()],
    issues: [],
    boundaries: {
      developmentOnly: true,
      browserTargetInputAllowed: false,
      browserShellAccess: false,
      arbitraryPathInputAllowed: false,
      fullAcceptanceAutomaticCleanup: true,
      customerUAT: false,
    },
  }
}

test('data preparation uses one fixed DEV-only API surface', () => {
  assert.equal(DEV_DATA_PREPARATION_ROUTE, '/__dev/data-preparation')
  assert.equal(DEV_DATA_PREPARATION_API_PREFIX, '/__dev/api/data-preparation')
  assert.equal(
    DEV_DATA_PREPARATION_SESSION_API_PATH,
    '/__dev/api/data-preparation/session'
  )
  assert.equal(
    DEV_DATA_PREPARATION_SUMMARY_API_PATH,
    '/__dev/api/data-preparation/summary'
  )
  assert.equal(
    DEV_DATA_PREPARATION_ACTION_API_PATH,
    '/__dev/api/data-preparation/actions'
  )
  assert.equal(
    DEV_DATA_PREPARATION_OPERATION_API_PREFIX,
    '/__dev/api/data-preparation/operations'
  )
  assert.equal(
    DEV_DATA_PREPARATION_SOURCE_PATH,
    'docs/engineering/研发效能工作台与CI-CD设计.md'
  )
})

test('scenario demo copy keeps one-click review, forward-only and acceptance boundaries visible', () => {
  const copy =
    DEV_DATA_PREPARATION_PROFILE_COPY[
      DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
    ]

  assert.equal(copy.targetKey, 'scenarioDemo')
  assert.equal(copy.badgeLabel, '长期保留')
  assert.equal(copy.prepareButtonLabel, '生成业务场景测试数据')
  assert.match(copy.prepareDescription, /自动准备固定计划/u)
  assert.match(copy.prepareDescription, /可读确认/u)
  assert.match(copy.prepareDescription, /对齐当前跟踪的本地客户配置/u)
  assert.match(copy.prepareDescription, /无需重启/u)
  assert.match(copy.confirmationDescription, /正式配置 API/u)
  assert.match(copy.retention, /不清空已有数据/u)
  assert.match(copy.cleanup, /forward-only/u)
  assert.match(copy.purpose, /不是完整验收/u)
})

test('scenario demo uses the prepared confirmation without exposing a typed secret or long token', () => {
  const scenarioOperation = operationFixture({
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    confirmationRequired: `DATA_PREPARATION:scenario-demo:${SCENARIO_OPERATION_RUN_ID}:${PLAN_HASH}:${OPERATION_ID}`,
  })
  assert.equal(
    resolveDataPreparationExecutionConfirmation(
      scenarioOperation,
      'ignored-browser-text'
    ),
    scenarioOperation.confirmationRequired
  )
  assert.equal(
    resolveDataPreparationExecutionConfirmation(
      operationFixture(),
      'typed-exact-confirmation'
    ),
    'typed-exact-confirmation'
  )
  assert.throws(
    () => resolveDataPreparationExecutionConfirmation(null),
    /operation 无效/u
  )
})

test('summary contract requires three fixed profiles and fail-closed boundaries', () => {
  assert.equal(
    validateDevDataPreparationSummary(summaryFixture()).status,
    'success'
  )

  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        profiles: summaryFixture().profiles.slice(0, 1),
      }),
    /profile set/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        arbitraryInput: true,
      }),
    /unsupported fields/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        profiles: [
          ...summaryFixture().profiles,
          {
            ...summaryFixture().profiles[0],
            key: 'custom-profile',
          },
        ],
      }),
    /profile/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        boundaries: {
          ...summaryFixture().boundaries,
          browserTargetInputAllowed: true,
        },
      }),
    /boundary/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        repository: {
          ...summaryFixture().repository,
          commit: 'd'.repeat(64),
        },
      }),
    /repository identity/u
  )
})

test('operation contract binds lowercase run identity and exact confirmation to the immutable plan', () => {
  assert.equal(
    validateDevDataPreparationOperation(operationFixture()).status,
    'ready'
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({ runId: 'Core-Demo-20260729' })
      ),
    /operation/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          issues: [
            {
              code: 'UPPER_CODE',
              severity: 'blocked',
              message: '不接受扩张后的 issue code',
            },
          ],
        })
      ),
    /issue/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({ confirmationRequired: 'DATA_PREPARATION:any' })
      ),
    /state/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          status: 'passed',
          confirmationRequired: '',
          terminal: false,
        })
      ),
    /state/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          events: [
            {
              at: CREATED_AT,
              status: 'custom_status',
              message: '不得扩张 event status',
            },
          ],
        })
      ),
    /event status/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          status: 'passed',
          confirmationRequired: '',
          terminal: true,
          readback: {
            schemaVersion: 'plush.dev-data-preparation-readback/v1',
            profileKey: 'core-demo',
            targetFingerprint: TARGET_FINGERPRINT,
            preflight: 'passed',
            roleAccounts: 0,
            core: {
              units: 1,
              materials: 1,
              products: 1,
              warehouses: 1,
              processes: 1,
              bomHeaders: 1,
            },
            stableUpsert: true,
            cleanupSupported: false,
          },
        })
      ),
    /core demo readback/u
  )
})

test('scenario demo readback binds the fixed batch and rejects half batches or drift', () => {
  const operation = validateDevDataPreparationOperation(
    scenarioOperationFixture()
  )
  assert.equal(operation.profileKey, 'scenario-demo')
  assert.equal(operation.readback.catalogReadyCount, 40)
  assert.equal(operation.readback.browserChecksPending, 10)
  assert.equal(operation.readback.cleanupSupported, false)
  assert.equal(operation.readback.manualAcceptanceCompleted, false)
  assert.equal(operation.readback.replayMode, 'exact-create-or-readback')

  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({ catalogReadyCount: 50 }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({
            runId: '20260717-V6',
          }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({ browserChecksPending: 9 }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({
            targetFingerprint: '7'.repeat(64),
          }),
        })
      ),
    /readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({ cleanupSupported: true }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: {
            ...scenarioReadbackFixture(),
            arbitraryCount: 1,
          },
        })
      ),
    /unsupported fields/u
  )
})

test('prepare intent keeps one idempotency key until the intent is proven or reset', () => {
  const firstIntent = resolveDataPreparationPrepareIntent(
    null,
    'core-demo',
    () => '22222222-2222-4222-8222-222222222222'
  )
  const retriedIntent = resolveDataPreparationPrepareIntent(
    firstIntent,
    'core-demo',
    () => {
      throw new Error('retry must not allocate a second key')
    }
  )
  assert.equal(retriedIntent, firstIntent)

  const resetIntent = resolveDataPreparationPrepareIntent(
    firstIntent,
    'full-acceptance',
    () => '33333333-3333-4333-8333-333333333333'
  )
  assert.equal(resetIntent.profileKey, 'full-acceptance')
  assert.notEqual(resetIntent.idempotencyKey, firstIntent.idempotencyKey)

  const scenarioIntent = resolveDataPreparationPrepareIntent(
    resetIntent,
    'scenario-demo',
    () => '77777777-7777-4777-8777-777777777777'
  )
  assert.equal(scenarioIntent.profileKey, 'scenario-demo')
  assert.match(
    scenarioIntent.idempotencyKey,
    /^data-preparation:prepare:scenario-demo:/u
  )
})

test('refresh recovery resumes the newest nonterminal operation and preserves an explicit current receipt', () => {
  const olderReady = operationFixture({
    id: '44444444-4444-4444-8444-444444444444',
    updatedAt: '2026-07-29T02:02:00.000Z',
  })
  const newerRunning = operationFixture({
    id: '55555555-5555-4555-8555-555555555555',
    status: 'running',
    confirmationRequired: '',
    updatedAt: '2026-07-29T02:03:00.000Z',
  })
  const newestScenarioRunning = scenarioOperationFixture({
    id: '77777777-7777-4777-8777-777777777777',
    status: 'running',
    confirmationRequired: '',
    terminal: false,
    readback: null,
    updatedAt: '2026-07-29T02:05:00.000Z',
  })
  const terminal = operationFixture({
    id: '66666666-6666-4666-8666-666666666666',
    status: 'passed',
    confirmationRequired: '',
    terminal: true,
    updatedAt: '2026-07-29T02:04:00.000Z',
  })
  const operations = [olderReady, terminal, newerRunning, newestScenarioRunning]

  assert.equal(
    selectRecoverableDataPreparationOperation(operations)?.id,
    newestScenarioRunning.id
  )
  assert.equal(
    selectRecoverableDataPreparationOperation(operations)?.profileKey,
    'scenario-demo'
  )
  assert.equal(
    selectRecoverableDataPreparationOperation(operations, terminal.id)?.id,
    terminal.id
  )
  assert.equal(selectRecoverableDataPreparationOperation([terminal]), null)
})

test('client reuses one CSRF session and only posts prepare or execute envelopes', async () => {
  const requests = []
  const readyOperation = operationFixture()
  const runningOperation = operationFixture({
    status: 'running',
    confirmationRequired: '',
    terminal: false,
    updatedAt: '2026-07-29T02:02:00.000Z',
  })
  const client = createDevDataPreparationClient({
    async fetchImpl(url, options) {
      requests.push({ url, options })
      if (url === DEV_DATA_PREPARATION_SESSION_API_PATH) {
        return response({
          schemaVersion: 'plush.dev-data-preparation-session/v1',
          csrfToken: 's'.repeat(43),
          apiPrefix: DEV_DATA_PREPARATION_API_PREFIX,
        })
      }
      if (url === DEV_DATA_PREPARATION_SUMMARY_API_PATH) {
        return response(summaryFixture())
      }
      if (url.startsWith(DEV_DATA_PREPARATION_OPERATION_API_PREFIX)) {
        return response({
          schemaVersion: 'plush.dev-data-preparation-operation-result/v1',
          operation: runningOperation,
        })
      }
      const body = JSON.parse(options.body)
      return response({
        schemaVersion: 'plush.dev-data-preparation-action-result/v1',
        action: body.action,
        operation:
          body.action === 'prepare' ? readyOperation : runningOperation,
        reused: false,
      })
    },
  })

  assert.equal((await client.summary()).profiles.length, 3)
  assert.equal((await client.operation(OPERATION_ID)).status, 'running')
  const idempotencyKey = createDataPreparationIdempotencyKey(
    'core-demo',
    () => '22222222-2222-4222-8222-222222222222'
  )
  await client.prepare('core-demo', idempotencyKey)
  await client.execute(OPERATION_ID, readyOperation.confirmationRequired)

  assert.equal(
    requests.filter(
      (request) => request.url === DEV_DATA_PREPARATION_SESSION_API_PATH
    ).length,
    1
  )
  const posts = requests.filter(
    (request) => request.url === DEV_DATA_PREPARATION_ACTION_API_PATH
  )
  assert.equal(posts.length, 2)
  assert.deepEqual(JSON.parse(posts[0].options.body), {
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      idempotencyKey,
    },
  })
  assert.deepEqual(JSON.parse(posts[1].options.body), {
    action: 'execute',
    payload: {
      operationId: OPERATION_ID,
      confirmation: readyOperation.confirmationRequired,
    },
  })
  assert(
    posts.every(
      (request) => request.options.headers['x-csrf-token'] === 's'.repeat(43)
    )
  )
  assert.throws(
    () =>
      client.prepare(
        'core-demo',
        'data-preparation:prepare:core-demo:arbitrary'
      ),
    /参数无效/u
  )
  assert.throws(
    () =>
      client.execute(
        OPERATION_ID,
        readyOperation.confirmationRequired.replace(
          OPERATION_ID,
          '77777777-7777-4777-8777-777777777777'
        )
      ),
    /参数无效/u
  )
})

test('client surfaces only a bounded backend message on rejected requests', async () => {
  const client = createDevDataPreparationClient({
    async fetchImpl() {
      return response(
        {
          message: '固定目标预检未通过',
        },
        false
      )
    },
  })
  await assert.rejects(
    () => client.summary(),
    /数据准备预检读取失败：固定目标预检未通过/u
  )
})

test('page exposes one-click scenario preparation while retaining exact confirmation for other profiles', () => {
  const pageSource = readFileSync(
    new URL('../pages/DevDataPreparationPage.jsx', import.meta.url),
    'utf8'
  )
  assert.match(pageSource, /共享开发基础数据/u)
  assert.match(pageSource, /业务场景演示数据/u)
  assert.match(pageSource, /专用隔离库完整验收/u)
  assert.match(pageSource, /生成业务场景测试数据/u)
  assert.match(pageSource, /确认生成业务场景测试数据/u)
  assert.match(pageSource, /READBACK_PRESENTATIONS/u)
  assert.match(pageSource, /selectedProfileCopy\.prepareDescription/u)
  assert.match(pageSource, /successDescription/u)
  assert.match(pageSource, /confirmationDescription/u)
  assert.match(pageSource, /resolveDataPreparationExecutionConfirmation/u)
  assert.match(pageSource, /exact confirmation/u)
  assert.match(
    pageSource,
    /<DevPageNav sourcePath=\{DEV_DATA_PREPARATION_SOURCE_PATH\}/u
  )
  assert.match(pageSource, /selectRecoverableDataPreparationOperation/u)
  assert.equal(pageSource.match(/<Input\b/gu)?.length, 1)
  assert.match(pageSource, /aria-label="不可变计划确认文本"/u)
  assert.doesNotMatch(
    pageSource,
    /name=["'](?:host|target|path|command|sql|dsn|url|password)["']/iu
  )
  assert.doesNotMatch(
    pageSource,
    /(?:spawn|child_process|execFile|\/Users\/|192[.]168)/u
  )

  const buttonLabels = Array.from(
    pageSource.matchAll(/<Button\b[^>]*>([\s\S]*?)<\/Button>/gu),
    (match) => match[1].replace(/<[^>]+>/gu, '').trim()
  )
  assert(
    buttonLabels.every((label) => !/(?:清理|删除)/u.test(label)),
    'the page must not expose cleanup or delete buttons'
  )
})

test('data preparation route stays outside formal menu, seedData and RBAC projection', () => {
  const routerSource = readFileSync(
    new URL('../../erp/router.jsx', import.meta.url),
    'utf8'
  )
  const formalSources = [
    '../../erp/config/seedData.mjs',
    '../../erp/config/menuPermissions.mjs',
  ].map((relativePath) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  )

  assert.match(
    routerSource,
    /const DevWorkbenchRoutes\s*=\s*import\.meta\.env\.DEV/u
  )
  assert.match(
    routerSource,
    /<Route path="\/__dev\/\*" element=\{<DevWorkbenchRoutes \/>\}/u
  )
  formalSources.forEach((source) => {
    assert.doesNotMatch(source, /data-preparation|测试数据准备中心/u)
  })
})
