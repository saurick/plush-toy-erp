import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import {
  acquireDataPreparationExecutionLock,
  createOrReuseDataPreparationOperation,
  hashDataPreparationPlan,
  readDataPreparationOperation,
  transitionDataPreparationOperation,
} from '../../scripts/qa/dev-data-preparation-operation-store.mjs'
import {
  buildManualAcceptanceSemanticPlan,
  digestManualAcceptanceSemanticPlan,
} from '../../scripts/qa/manual-acceptance-dataset.mjs'
import {
  coreDemoExecutionCommands,
  coreDemoPreflightCommand,
  coreDemoTargetCommand,
  createDevDataPreparationMiddleware,
  createDevDataPreparationPlugin,
  createDevDataPreparationService,
  DEV_DATA_PREPARATION_ACTION_API_PATH,
  DEV_DATA_PREPARATION_PROFILES,
  DEV_DATA_PREPARATION_SESSION_API_PATH,
  fullAcceptanceExecutionCommand,
  fullAcceptancePlanCommand,
  MAX_DEV_DATA_PREPARATION_REQUEST_BYTES,
  scenarioDemoExecutionCommand,
  scenarioDemoPlanCommand,
  unresolvedDataPreparationOutcomeBlocksExecution,
  validateAcceptanceReceipt,
  validateDevDataPreparationAction,
} from './devDataPreparationPlugin.mjs'

const REPOSITORY = Object.freeze({
  commit: 'a'.repeat(40),
  dirty: false,
  fingerprint: 'b'.repeat(64),
})
const CORE_DSN =
  'postgres://dev_user:do-not-return@192.168.0.106:5432/plush_erp?sslmode=disable'
const FULL_DSN =
  'postgres://dev_user:do-not-return@192.168.0.106:5432/postgres?sslmode=disable'
const SCENARIO_TARGET_FINGERPRINT = createHash('sha256')
  .update('postgres://192.168.0.106:5432/plush_erp')
  .digest('hex')
const SCENARIO_SEMANTIC_DIGEST = digestManualAcceptanceSemanticPlan(
  buildManualAcceptanceSemanticPlan()
)
const IDEMPOTENCY_KEY =
  'data-preparation:prepare:core-demo:local-development:123e4567-e89b-42d3-a456-426614174000'
const SCENARIO_IDEMPOTENCY_KEY =
  'data-preparation:prepare:scenario-demo:local-development:223e4567-e89b-42d3-a456-426614174000'
const SCENARIO_REMOTE_IDEMPOTENCY_KEY =
  'data-preparation:prepare:scenario-demo:customer-trial-133:423e4567-e89b-42d3-a456-426614174000'
const FULL_IDEMPOTENCY_KEY =
  'data-preparation:prepare:full-acceptance:isolated-local:323e4567-e89b-42d3-a456-426614174000'

function createFixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'dev-data-preparation-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return {
    root,
    store: path.join(root, 'operation-store'),
  }
}

function fixedRandom() {
  return Buffer.from('01020304', 'hex')
}

async function waitForOperation(service, operationId, expected) {
  let latest
  for (let attempt = 0; attempt < 30; attempt += 1) {
    latest = service.readOperation(operationId)
    if (latest.status === expected) return latest
    await new Promise((resolve) => setImmediate(resolve))
  }
  throw new Error(
    `operation did not reach ${expected}: ${latest?.status || 'missing'} ${JSON.stringify(latest?.issues || [])}`
  )
}

function successfulRunner(calls) {
  return async (command, args, options) => {
    calls.push({ command, args: [...args], options })
    if (
      command === 'go' &&
      args.join(' ') === 'run ./cmd/dburl -conf ./configs/dev/config.yaml'
    ) {
      return { stdout: `${CORE_DSN}\n`, stderr: '' }
    }
    if (args[0]?.endsWith('local-acceptance-lifecycle.mjs')) {
      const commit = args[args.indexOf('--commit') + 1]
      const runID = args[args.indexOf('--run-id') + 1]
      const acceptanceDatabase = `plush_erp_acceptance_${runID}_dev`
      const browserActionsDatabase = `plush_erp_acceptance_${runID}_browser_actions_dev`
      return {
        stdout: JSON.stringify({
          mode: 'plan',
          writesDatabase: false,
          startsServices: false,
          commit,
          runID,
          acceptanceDatabase,
          browserActionsDatabase,
          confirmation: `RUN_LOCAL_ACCEPTANCE_LIFECYCLE:${acceptanceDatabase}:${browserActionsDatabase}:${commit}`,
          boundary: {
            registeredDevelopmentPostgresOnly: true,
            isolatedPorts: true,
            automaticCleanup: true,
            customerUAT: false,
          },
        }),
        stderr: '',
      }
    }
    if (args.at(-1)?.endsWith('seed-role-demo-admins.sh')) {
      return {
        stdout:
          'role demo admin seed completed accounts=10 password_source=default password_reset=false include_debug=false include_manual_acceptance_scenarios=false reset_local_super_admin=false\n',
        stderr: '',
      }
    }
    if (args.some((arg) => arg.endsWith('seed-core-demo-data.sh'))) {
      return {
        stdout:
          'core demo seed completed prefix=YS6 units=11 materials=0 products=0 warehouses=4 processes=0 bom_headers=0\n' +
          'simulated_only=true real_customer_import=false no_direct_fact_posting=true\n' +
          'references_only=false scenario_references=true exact_allowlist=true materials=0 products=0 processes=0 bom_headers=0\n',
        stderr: '',
      }
    }
    return {
      stdout:
        '[local-preflight] 工作区 schema/migration 守卫通过\n' +
        '[local-preflight] 开发数据库 migration 已是最新版本（20260729，10/10）\n' +
        '[local-preflight] non-system-schema function=0 procedure=0 non-internal-trigger=0\n',
      stderr: '',
    }
  }
}

test('data preparation plugin is a Vite serve-only plugin', () => {
  const plugin = createDevDataPreparationPlugin({
    service: { summary() {}, act() {}, readOperation() {} },
  })
  assert.equal(plugin.name, 'plush-dev-data-preparation')
  assert.equal(plugin.apply, 'serve')
  assert.equal(typeof plugin.configureServer, 'function')
})

test('action contract rejects unknown profiles, shell/path/DSN fields, and loose execute payloads', () => {
  assert.deepEqual(
    validateDevDataPreparationAction({
      action: 'prepare',
      payload: {
        profileKey: 'core-demo',
        targetKey: 'local-development',
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    }).payload.profileKey,
    'core-demo'
  )
  assert.deepEqual(
    validateDevDataPreparationAction({
      action: 'prepare',
      payload: {
        profileKey: 'scenario-demo',
        targetKey: 'local-development',
        idempotencyKey: SCENARIO_IDEMPOTENCY_KEY,
      },
    }).payload.profileKey,
    'scenario-demo'
  )
  for (const payload of [
    {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
      command: 'rm',
    },
    {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
      path: '/tmp/output',
    },
    {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
      databaseURL: FULL_DSN,
    },
    {
      profileKey: 'other',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  ]) {
    assert.throws(
      () =>
        validateDevDataPreparationAction({
          action: 'prepare',
          payload,
        }),
      /fields|invalid/u
    )
  }
  assert.throws(
    () =>
      validateDevDataPreparationAction({
        action: 'execute',
        payload: {
          operationId: '123e4567-e89b-42d3-a456-426614174000',
          confirmation: 'short',
        },
      }),
    /invalid/u
  )
})

test('fixed profile commands cannot receive browser shell, path, DSN, or API origin input', async () => {
  const root = '/repo'
  assert.deepEqual(coreDemoTargetCommand(root), {
    command: 'go',
    args: ['run', './cmd/dburl', '-conf', './configs/dev/config.yaml'],
    options: { cwd: '/repo/server' },
  })
  const core = coreDemoExecutionCommands(root, 'plush_erp')
  assert.deepEqual(
    core.map(({ key, command, args }) => ({ key, command, args })),
    [
      {
        key: 'role-seed',
        command: 'bash',
        args: ['/repo/scripts/seed-role-demo-admins.sh'],
      },
      {
        key: 'core-seed',
        command: 'bash',
        args: [
          '/repo/scripts/seed-core-demo-data.sh',
          '--scenario-references',
          '--expected-database',
          'plush_erp',
          '--confirm',
          'SEED_SCENARIO_DEMO_CORE_REFERENCES:scenario-demo:plush_erp:2026.08.15-v6:20260815-V6',
        ],
      },
    ]
  )
  assert.throws(
    () => coreDemoExecutionCommands(root, 'plush_erp_prod'),
    /registered development target/u
  )
  assert.deepEqual(coreDemoPreflightCommand(root), {
    command: process.execPath,
    args: ['/repo/scripts/local-runtime-preflight.mjs', '--mode', 'database'],
    options: { cwd: '/repo' },
  })
  assert.deepEqual(scenarioDemoPlanCommand(root), {
    command: process.execPath,
    args: ['/repo/scripts/qa/scenario-demo-data.mjs'],
    options: { cwd: '/repo' },
  })
  assert.deepEqual(
    scenarioDemoExecutionCommand(root, {
      targetSummary: {
        targetKey: 'local-development',
        preflightFingerprint: 'c'.repeat(64),
      },
    }),
    {
      command: process.execPath,
      args: [
        '/repo/scripts/qa/scenario-demo-data.mjs',
        '--apply',
        '--expected-plan-digest',
        'c'.repeat(64),
      ],
      options: { cwd: '/repo' },
    }
  )
  const operation = {
    repository: REPOSITORY,
    runId: '20260729z_01020304',
  }
  const full = await fullAcceptanceExecutionCommand(root, operation)
  assert.deepEqual(
    fullAcceptancePlanCommand(root, REPOSITORY, operation.runId),
    {
      command: process.execPath,
      args: [
        '/repo/scripts/qa/local-acceptance-lifecycle.mjs',
        '--commit',
        REPOSITORY.commit,
        '--run-id',
        operation.runId,
      ],
      options: { cwd: '/repo' },
    }
  )
  assert.deepEqual(full.args, [
    '/repo/scripts/qa/local-acceptance-lifecycle.mjs',
    '--execute',
    '--commit',
    REPOSITORY.commit,
    '--run-id',
    operation.runId,
    '--confirm',
    `RUN_LOCAL_ACCEPTANCE_LIFECYCLE:plush_erp_acceptance_${operation.runId}_dev:plush_erp_acceptance_${operation.runId}_browser_actions_dev:${REPOSITORY.commit}`,
  ])
  assert.equal(
    full.args.some((value) => String(value).includes('postgres://')),
    false
  )
})

test('core demo prepares an immutable plan, reuses idempotency, executes asynchronously, and records readback', async (t) => {
  const fixture = createFixture(t)
  const calls = []
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner(calls),
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  const request = {
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  }
  const prepared = await service.act(request)
  const reused = await service.act(request)
  assert.equal(prepared.reused, false)
  assert.equal(reused.reused, true)
  assert.equal(reused.operation.id, prepared.operation.id)
  assert.match(prepared.operation.planHash, /^[0-9a-f]{64}$/u)
  assert.match(
    prepared.operation.confirmationRequired,
    /^DATA_PREPARATION:core-demo:/u
  )
  await assert.rejects(
    service.act({
      action: 'execute',
      payload: {
        operationId: prepared.operation.id,
        confirmation: `${prepared.operation.confirmationRequired}-wrong`,
      },
    }),
    /confirmation/u
  )
  const accepted = await service.act({
    action: 'execute',
    payload: {
      operationId: prepared.operation.id,
      confirmation: prepared.operation.confirmationRequired,
    },
  })
  assert.equal(accepted.operation.status, 'launching')
  const passed = await waitForOperation(
    service,
    prepared.operation.id,
    'passed'
  )
  assert.deepEqual(passed.readback, {
    schemaVersion: 'plush.dev-data-preparation-readback/v1',
    profileKey: 'core-demo',
    targetFingerprint: prepared.operation.targetSummary.targetFingerprint,
    preflight: 'passed',
    roleAccounts: 10,
    core: {
      units: 11,
      materials: 0,
      products: 0,
      warehouses: 4,
      processes: 0,
      bomHeaders: 0,
    },
    stableUpsert: true,
    cleanupSupported: false,
  })
  assert.deepEqual(passed.timing, {
    startedAt: '2026-07-29T02:03:04.000Z',
    completedAt: '2026-07-29T02:03:04.000Z',
    durationMs: 0,
  })
  assert.deepEqual(
    calls
      .filter(({ command }) => command !== 'go')
      .map(({ args }) => path.basename(args[0])),
    [
      'local-runtime-preflight.mjs',
      'local-runtime-preflight.mjs',
      'seed-role-demo-admins.sh',
      'seed-core-demo-data.sh',
    ]
  )
})

test('scenario demo binds the fixed V6 plan, needs no browser credential input, and stores exact readback', async (t) => {
  const fixture = createFixture(t)
  const calls = []
  const planDigest = 'd'.repeat(64)
  const commandRunner = async (command, args, options) => {
    calls.push({ command, args: [...args], options })
    if (command === 'go' && args.includes('./cmd/dburl')) {
      return { stdout: `${CORE_DSN}\n`, stderr: '' }
    }
    if (
      command === process.execPath &&
      args[0]?.endsWith('scenario-demo-data.mjs') &&
      !args.includes('--apply')
    ) {
      return {
        stdout: JSON.stringify({
          schemaVersion: 'plush.scenario-demo-plan/v2',
          profileKey: 'scenario-demo',
          targetAlias: 'scenario-demo',
          datasetKey: 'yoyoosun-manual-acceptance',
          dataVersion: '2026.08.15-v6',
          runId: '20260815-V6',
          semanticDigest: SCENARIO_SEMANTIC_DIGEST,
          backendURL: 'http://127.0.0.1:8300',
          databaseName: 'plush_erp',
          migrationVersion: '20260728100514',
          repository: REPOSITORY,
          target: {
            targetFingerprint: SCENARIO_TARGET_FINGERPRINT,
            disposable: false,
            registeredTargetOnly: true,
            loopbackBackendOnly: true,
          },
          canonicalRunner: {
            stageCount: 9,
            semanticDigest: SCENARIO_SEMANTIC_DIGEST,
            persistentBaseline: true,
          },
          execution: {
            replayMode: 'exact-create-or-readback',
            dataRetention: 'long-lived',
            cleanupSupported: false,
            cleanupMode: 'forward-only',
            directBusinessSQL: false,
            manualAcceptanceCompleted: false,
          },
          runtime: {
            configRevision:
              'yoyoosun-customer-package-v7.local-d05ec61cc4ea9cee.runtime-v1',
            configProductVersion: 'local-customer-package-test-apply',
          },
          planDigest,
        }),
        stderr: '',
      }
    }
    if (
      command === process.execPath &&
      args[0]?.endsWith('scenario-demo-data.mjs') &&
      args.includes('--apply')
    ) {
      assert.deepEqual(args, [
        path.join(fixture.root, 'scripts', 'qa', 'scenario-demo-data.mjs'),
        '--apply',
        '--expected-plan-digest',
        planDigest,
      ])
      assert.equal(
        args.some((value) =>
          /role-pass|admin-pass|postgres:|password|token/iu.test(String(value))
        ),
        false
      )
      assert.equal(options.env.MANUAL_ACCEPTANCE_PASSWORD, undefined)
      assert.equal(options.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD, undefined)
      assert.equal(
        options.env.SCENARIO_DEMO_CONFIRM,
        `APPLY_SCENARIO_DEMO:scenario-demo:plush_erp:2026.08.15-v6:20260815-V6:${planDigest}`
      )
      return {
        stdout: JSON.stringify({
          schemaVersion: 'plush.dev-data-preparation-readback/v1',
          profileKey: 'scenario-demo',
          targetKey: 'local-development',
          targetEnvironment: 'local-development',
          targetFingerprint: SCENARIO_TARGET_FINGERPRINT,
          databaseName: 'plush_erp',
          release: REPOSITORY.commit,
          migrationVersion: '20260728100514',
          customerConfigRevision:
            'yoyoosun-customer-package-v7.local-d05ec61cc4ea9cee.runtime-v1',
          datasetKey: 'yoyoosun-manual-acceptance',
          dataVersion: '2026.08.15-v6',
          runId: '20260815-V6',
          semanticDigest: SCENARIO_SEMANTIC_DIGEST,
          stageCount: 9,
          sourceDocumentCount: 135,
          processRuntimeCount: 5,
          factCount: 500,
          catalogReadyCount: 41,
          catalogTargetCount: 51,
          browserChecksPending: 10,
          manualAcceptanceCompleted: false,
          cleanupSupported: false,
          replayMode: 'exact-create-or-readback',
        }),
        stderr: '',
      }
    }
    throw new Error(`unexpected command ${command} ${args.join(' ')}`)
  }
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner,
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  const prepared = await service.act({
    action: 'prepare',
    payload: {
      profileKey: 'scenario-demo',
      targetKey: 'local-development',
      idempotencyKey: SCENARIO_IDEMPOTENCY_KEY,
    },
  })
  assert.equal(
    prepared.operation.targetSummary.preflightFingerprint,
    planDigest
  )
  const accepted = await service.act({
    action: 'execute',
    payload: {
      operationId: prepared.operation.id,
      confirmation: prepared.operation.confirmationRequired,
    },
  })
  assert.equal(accepted.operation.status, 'launching')
  const passed = await waitForOperation(
    service,
    prepared.operation.id,
    'passed'
  )
  assert.equal(passed.readback.runId, '20260815-V6')
  assert.equal(passed.readback.catalogReadyCount, 41)
  assert.equal(passed.readback.browserChecksPending, 10)
  assert.equal(passed.readback.cleanupSupported, false)
  assert.equal(passed.readback.manualAcceptanceCompleted, false)
  assert.equal(
    calls.filter(
      ({ args }) =>
        args[0]?.endsWith('scenario-demo-data.mjs') && args.includes('--apply')
    ).length,
    1
  )
})

test('133 scenario creates and verifies a fresh target-bound backup before canonical apply', async (t) => {
  const fixture = createFixture(t)
  const order = []
  const planDigest = '8'.repeat(64)
  const migrationVersion = '20260728100514'
  const databaseName = 'plush_erp_uat_20260716_v5'
  const configRevision =
    'yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1'
  const configProductVersion = 'customer-trial-133-test-2026.08.15-v6'
  const targetFingerprint = hashDataPreparationPlan({
    targetAlias: 'customer-trial-133',
    databaseName,
    release: REPOSITORY.commit,
    migration: migrationVersion,
  })
  const preflight = {
    status: 'passed',
    target: 'test-133',
    trialTarget: 'customer-trial-133',
    customer: 'yoyoosun',
    remote: {
      runtime: {
        serverSha: REPOSITORY.commit,
        webSha: REPOSITORY.commit,
        databaseName,
        migrationVersion,
        activeCustomerConfig: {
          revision: configRevision,
          productVersion: configProductVersion,
          datasetVersion: '2026.08.15-v6',
        },
        debug: {
          environment: 'prod',
          seedEnabled: false,
          seedAllowed: false,
          cleanupEnabled: false,
          cleanupAllowed: false,
          businessDataClearEnabled: false,
          businessDataClearAllowed: false,
        },
        serverHealth: 'passed',
        serverReady: 'passed',
        webHealth: 'passed',
      },
      publicEntry: { status: 'passed', gitSha: REPOSITORY.commit },
      backup: { tooling: 'passed' },
    },
  }
  const commandRunner = async (command, args, options) => {
    assert.equal(command, process.execPath)
    assert.match(args[0], /scenario-demo-data[.]mjs$/u)
    const apply = args.includes('--apply')
    order.push(apply ? 'apply' : 'plan')
    assert.equal(args.includes('--target'), true)
    assert.equal(args[args.indexOf('--target') + 1], 'customer-trial-133')
    assert.equal(
      args.some((value) => /trial-role|trial-admin/iu.test(String(value))),
      false
    )
    if (!apply) {
      return {
        stdout: JSON.stringify({
          schemaVersion: 'plush.scenario-demo-plan/v2',
          profileKey: 'scenario-demo',
          targetAlias: 'customer-trial-133',
          datasetKey: 'yoyoosun-manual-acceptance',
          dataVersion: '2026.08.15-v6',
          runId: '20260815-V6',
          semanticDigest: SCENARIO_SEMANTIC_DIGEST,
          backendURL: 'http://127.0.0.1:18375',
          databaseName,
          migrationVersion,
          repository: REPOSITORY,
          target: {
            targetFingerprint,
            disposable: false,
            registeredTargetOnly: true,
            loopbackBackendOnly: true,
          },
          canonicalRunner: {
            stageCount: 9,
            semanticDigest: SCENARIO_SEMANTIC_DIGEST,
            persistentBaseline: true,
          },
          execution: {
            replayMode: 'exact-create-or-readback',
            dataRetention: 'long-lived',
            cleanupSupported: false,
            cleanupMode: 'forward-only',
            directBusinessSQL: false,
            manualAcceptanceCompleted: false,
          },
          runtime: {
            configRevision,
            configProductVersion,
          },
          planDigest,
        }),
        stderr: '',
      }
    }
    assert.equal(options.env.MANUAL_ACCEPTANCE_PASSWORD, 'trial-role')
    assert.equal(options.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD, 'trial-admin')
    return {
      stdout: JSON.stringify({
        schemaVersion: 'plush.dev-data-preparation-readback/v1',
        profileKey: 'scenario-demo',
        targetKey: 'customer-trial-133',
        targetEnvironment: 'customer-trial-133',
        targetFingerprint,
        databaseName,
        release: REPOSITORY.commit,
        migrationVersion,
        customerConfigRevision: configRevision,
        datasetKey: 'yoyoosun-manual-acceptance',
        dataVersion: '2026.08.15-v6',
        runId: '20260815-V6',
        semanticDigest: SCENARIO_SEMANTIC_DIGEST,
        stageCount: 9,
        sourceDocumentCount: 135,
        processRuntimeCount: 5,
        factCount: 500,
        catalogReadyCount: 41,
        catalogTargetCount: 51,
        browserChecksPending: 10,
        manualAcceptanceCompleted: false,
        cleanupSupported: false,
        replayMode: 'exact-create-or-readback',
      }),
      stderr: '',
    }
  }
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner,
    readRepositoryState: async () => REPOSITORY,
    readCustomerTrialPreflight: async () => preflight,
    createCustomerTrialBackup: async (identity) => {
      order.push('backup')
      return {
        schemaVersion: 'plush.customer-trial-133-data-backup/v1',
        status: 'passed',
        backupAlias: identity.backupAlias,
        releaseSha: identity.releaseSha,
        databaseName,
        migrationVersion: identity.migrationVersion,
        sha256: '7'.repeat(64),
        sizeBytes: 4096,
        createdAt: '2026-07-29T02:03:04.000Z',
        containsSecrets: false,
        containsCredentials: false,
        containsPaths: false,
      }
    },
    environment: {
      CUSTOMER_TRIAL_133_ADMIN_PASSWORD: 'trial-admin',
      CUSTOMER_TRIAL_133_ROLE_PASSWORD: 'trial-role',
    },
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  const prepared = await service.act({
    action: 'prepare',
    payload: {
      profileKey: 'scenario-demo',
      targetKey: 'customer-trial-133',
      idempotencyKey: SCENARIO_REMOTE_IDEMPOTENCY_KEY,
    },
  })
  assert.equal(prepared.operation.targetSummary.releaseSha, REPOSITORY.commit)
  assert.equal(prepared.operation.targetSummary.databaseName, databaseName)
  assert.match(prepared.operation.targetSummary.rollbackPoint, /^pre-data-/u)

  await service.act({
    action: 'execute',
    payload: {
      operationId: prepared.operation.id,
      confirmation: prepared.operation.confirmationRequired,
    },
  })
  const passed = await waitForOperation(
    service,
    prepared.operation.id,
    'passed'
  )
  assert.deepEqual(order.slice(-2), ['backup', 'apply'])
  assert.equal(
    passed.readback.backupReceipt.backupAlias,
    prepared.operation.targetSummary.rollbackPoint
  )
  assert.equal(passed.readback.backupReceipt.sizeBytes, 4096)
})

test('concurrent services atomically claim one idempotency key and return one operation', async (t) => {
  const fixture = createFixture(t)
  const calls = []
  const baseRunner = successfulRunner(calls)
  const commandRunner = async (command, args, options) => {
    if (args.includes('--mode')) {
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return baseRunner(command, args, options)
  }
  const options = {
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner,
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  }
  const left = createDevDataPreparationService(options)
  const right = createDevDataPreparationService(options)
  const request = {
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  }
  const [first, second] = await Promise.all([
    left.act(request),
    right.act(request),
  ])
  assert.equal(first.operation.id, second.operation.id)
  assert.deepEqual([first.reused, second.reused].sort(), [false, true])
  assert.equal(readdirSync(path.join(fixture.store, 'operations')).length, 1)
  assert.equal(readdirSync(path.join(fixture.store, 'idempotency')).length, 1)
  assert.equal(readdirSync(path.join(fixture.store, 'prepare-locks')).length, 0)
  assert.equal(calls.filter(({ args }) => args.includes('--mode')).length, 1)
})

test('core demo target is fixed to registered 106 development databases and never accepts 133', async (t) => {
  const fixture = createFixture(t)
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: async () => ({
      stdout:
        'postgres://dev:credential@192.168.0.133:5435/plush_erp?sslmode=disable',
    }),
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  await assert.rejects(
    service.act({
      action: 'prepare',
      payload: {
        profileKey: 'core-demo',
        targetKey: 'local-development',
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    }),
    /registered development/u
  )
  const summary = await service.summary()
  assert.equal(summary.target.coreDemo.status, 'blocked')
  assert.equal(JSON.stringify(summary).includes('credential@'), false)
})

test('summary fails core demo closed when the migration preflight is not ready', async (t) => {
  const fixture = createFixture(t)
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: async (command) => {
      if (command === 'go') return { stdout: `${CORE_DSN}\n` }
      throw new Error('schema and migration are not aligned')
    },
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })

  const summary = await service.summary()
  assert.equal(summary.target.coreDemo.status, 'blocked')
  assert.equal(
    summary.issues.some(
      (issue) =>
        issue.code === 'core_demo_target_unavailable' &&
        issue.message.includes('migration')
    ),
    true
  )
  assert.deepEqual(summary.operations, [])
})

test('core demo rejects malformed registered-family aliases', async (t) => {
  const fixture = createFixture(t)
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: async () => ({
      stdout:
        'postgres://dev:credential@192.168.0.106:5432/plush_erp__dev?sslmode=disable',
    }),
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  await assert.rejects(
    service.act({
      action: 'prepare',
      payload: {
        profileKey: 'core-demo',
        targetKey: 'local-development',
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    }),
    /registered development/u
  )
})

test('full acceptance requires server-only database environment and exact clean commit', async (t) => {
  const fixture = createFixture(t)
  const missingEnvironment = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner([]),
    readRepositoryState: async () => REPOSITORY,
    environment: {},
  })
  await assert.rejects(
    missingEnvironment.act({
      action: 'prepare',
      payload: {
        profileKey: 'full-acceptance',
        targetKey: 'isolated-local',
        idempotencyKey: FULL_IDEMPOTENCY_KEY,
      },
    }),
    /environment/u
  )
  const summary = await missingEnvironment.summary()
  assert.equal(summary.target.coreDemo.status, 'available')
  assert.equal(summary.target.fullAcceptance.status, 'blocked')
  const corePrepared = await missingEnvironment.act({
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  })
  assert.equal(corePrepared.operation.status, 'ready')
  const dirty = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner([]),
    readRepositoryState: async () => ({ ...REPOSITORY, dirty: true }),
    environment: { LOCAL_ACCEPTANCE_DATABASE_BASE_URL: FULL_DSN },
  })
  await assert.rejects(
    dirty.act({
      action: 'prepare',
      payload: {
        profileKey: 'full-acceptance',
        targetKey: 'isolated-local',
        idempotencyKey: FULL_IDEMPOTENCY_KEY,
      },
    }),
    /exact clean/u
  )
})

test('full acceptance prepare freezes the fixed lifecycle plan without executing it', async (t) => {
  const fixture = createFixture(t)
  const calls = []
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner(calls),
    readRepositoryState: async () => REPOSITORY,
    environment: { LOCAL_ACCEPTANCE_DATABASE_BASE_URL: FULL_DSN },
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  const prepared = await service.act({
    action: 'prepare',
    payload: {
      profileKey: 'full-acceptance',
      targetKey: 'isolated-local',
      idempotencyKey: FULL_IDEMPOTENCY_KEY,
    },
  })
  assert.equal(prepared.operation.status, 'ready')
  assert.notEqual(
    prepared.operation.targetSummary.preflightFingerprint,
    '0'.repeat(64)
  )
  const lifecycleCalls = calls.filter(({ args }) =>
    args[0]?.endsWith('local-acceptance-lifecycle.mjs')
  )
  assert.equal(lifecycleCalls.length, 1)
  assert.equal(lifecycleCalls[0].args.includes('--execute'), false)
  const summary = await service.summary()
  assert.deepEqual(
    {
      chains: summary.acceptancePlan.chainCount,
      steps: summary.acceptancePlan.stepCount,
      scenarios: summary.acceptancePlan.scenarioCount,
      stages: summary.acceptancePlan.dataStageCount,
      targets: summary.acceptancePlan.catalogTargetCount,
    },
    { chains: 11, steps: 67, scenarios: 66, stages: 9, targets: 51 }
  )
  assert.equal(summary.acceptancePlan.selectorAffectsExecution, false)
  assert.equal(summary.acceptancePlan.freshBatchPerRun, true)
  assert.deepEqual(
    {
      dataVersion: summary.datasetContract.dataVersion,
      runId: summary.datasetContract.runId,
      unitCount: summary.datasetContract.unitCount,
      warehouseCount: summary.datasetContract.warehouseCount,
      simulatedOnly: summary.datasetContract.simulatedOnly,
      realCustomerImport: summary.datasetContract.realCustomerImport,
      trialDatabase: summary.datasetContract.customerTrial133.databaseName,
      trialDatabaseLifecycle:
        summary.datasetContract.customerTrial133.databaseLifecycle,
    },
    {
      dataVersion: '2026.08.15-v6',
      runId: '20260815-V6',
      unitCount: 11,
      warehouseCount: 4,
      simulatedOnly: true,
      realCustomerImport: false,
      trialDatabase: 'plush_erp_uat_20260716_v5',
      trialDatabaseLifecycle: 'long-lived-registered-target',
    }
  )
  assert.equal(summary.target.coreDemo.databaseName, 'plush_erp')
  assert.equal(summary.target.coreDemo.migrationVersion, '20260729')
})

test('full acceptance receipt binds the latest chain contract and nine stage timings', async (t) => {
  const fixture = createFixture(t)
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner([]),
    readRepositoryState: async () => REPOSITORY,
    environment: { LOCAL_ACCEPTANCE_DATABASE_BASE_URL: FULL_DSN },
  })
  const { acceptancePlan } = await service.summary()
  const operation = {
    repository: REPOSITORY,
    runId: 'd260729020304_01020304',
    targetSummary: { targetFingerprint: 'e'.repeat(64) },
  }
  const stageTimings = acceptancePlan.dataStages.map(({ key }, index) => ({
    key,
    status: 'completed',
    startedAt: `2026-07-29T02:03:${String(index).padStart(2, '0')}.000Z`,
    completedAt: `2026-07-29T02:03:${String(index + 1).padStart(2, '0')}.000Z`,
    durationMs: 1000,
  }))
  const readback = validateAcceptanceReceipt(
    {
      schemaVersion: 'plush-local-acceptance-lifecycle/v1',
      commit: REPOSITORY.commit,
      runID: operation.runId,
      status: 'passed',
      cleanup: { complete: true, residualDatabases: [] },
      evidence: {
        dataset: {
          ok: true,
          dataVersion: '2026.08.15-v6',
          chainDataDigest: acceptancePlan.chainDataDigest,
          chainVerificationDigest: acceptancePlan.chainVerificationDigest,
          startedAt: '2026-07-29T02:03:00.000Z',
          completedAt: '2026-07-29T02:04:00.000Z',
          durationMs: 60_000,
          stageTimings,
        },
      },
    },
    operation
  )
  assert.equal(readback.datasetDurationMs, 60_000)
  assert.equal(readback.stageTimings.length, 9)
  assert.equal(readback.catalogTargetCount, 51)
  assert.throws(
    () =>
      validateAcceptanceReceipt(
        {
          schemaVersion: 'plush-local-acceptance-lifecycle/v1',
          commit: REPOSITORY.commit,
          runID: operation.runId,
          status: 'passed',
          cleanup: { complete: true, residualDatabases: [] },
          evidence: {
            dataset: {
              ...readback,
              ok: true,
              dataVersion: '2026.08.15-v6',
              chainDataDigest: '0'.repeat(64),
              chainVerificationDigest: acceptancePlan.chainVerificationDigest,
              startedAt: '2026-07-29T02:03:00.000Z',
              completedAt: '2026-07-29T02:04:00.000Z',
              durationMs: 60_000,
              stageTimings,
            },
          },
        },
        operation
      ),
    /timing evidence/u
  )
})

test('execution lock is atomic across dev server processes', (t) => {
  const fixture = createFixture(t)
  acquireDataPreparationExecutionLock(
    fixture.store,
    '123e4567-e89b-42d3-a456-426614174000',
    {
      pid: 101,
      now: '2026-07-29T02:03:04.000Z',
    }
  )
  assert.throws(
    () =>
      acquireDataPreparationExecutionLock(
        fixture.store,
        '223e4567-e89b-42d3-a456-426614174000',
        {
          pid: 202,
          now: '2026-07-29T02:03:05.000Z',
        }
      ),
    /execution lock/u
  )
})

test('operation persistence recovers interrupted execution as not_proven and blocks replay', async (t) => {
  const fixture = createFixture(t)
  const targetSummary = {
    safeTarget: 'host=192.168.0.106 port=5432 database=plush_erp',
    targetFingerprint: 'c'.repeat(64),
    preflightFingerprint: 'd'.repeat(64),
    disposable: false,
    automaticCleanup: false,
  }
  const runId = '20260729z_01020304'
  const planHash = hashDataPreparationPlan({
    profileKey: 'core-demo',
    repository: REPOSITORY,
    runId,
    targetSummary,
  })
  const created = createOrReuseDataPreparationOperation(fixture.store, {
    idempotencyKey: IDEMPOTENCY_KEY,
    profileKey: 'core-demo',
    repository: REPOSITORY,
    runId,
    targetSummary,
    planHash,
    operationId: '123e4567-e89b-42d3-a456-426614174000',
    now: '2026-07-29T02:03:04.000Z',
  })
  transitionDataPreparationOperation(fixture.store, created.operation.id, {
    status: 'launching',
    message: 'fixed profile executor is launching',
    now: '2026-07-29T02:04:04.000Z',
  })
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner([]),
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:05:04.000Z'),
  })
  assert.equal(
    readDataPreparationOperation(fixture.store, created.operation.id).status,
    'not_proven'
  )
  await assert.rejects(
    service.act({
      action: 'execute',
      payload: {
        operationId: created.operation.id,
        confirmation:
          'DATA_PREPARATION:core-demo:placeholder:placeholder:placeholder',
      },
    }),
    /blocks execution/u
  )
})

test('fresh Vite config reload keeps an in-flight operation inside the recovery grace window', (t) => {
  const fixture = createFixture(t)
  const targetSummary = {
    safeTarget: 'host=192.168.0.106 port=5432 database=plush_erp',
    targetFingerprint: 'c'.repeat(64),
    preflightFingerprint: 'd'.repeat(64),
    disposable: false,
    automaticCleanup: false,
  }
  const runId = '20260729z_01020304'
  const created = createOrReuseDataPreparationOperation(fixture.store, {
    idempotencyKey: IDEMPOTENCY_KEY,
    profileKey: 'scenario-demo',
    repository: REPOSITORY,
    runId,
    targetSummary,
    planHash: hashDataPreparationPlan({
      profileKey: 'scenario-demo',
      repository: REPOSITORY,
      runId,
      targetSummary,
    }),
    operationId: '123e4567-e89b-42d3-a456-426614174000',
    now: '2026-07-29T02:03:04.000Z',
  })
  transitionDataPreparationOperation(fixture.store, created.operation.id, {
    status: 'launching',
    message: 'fixed profile executor is launching',
    now: '2026-07-29T02:04:04.000Z',
  })
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner([]),
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:04:20.000Z'),
  })
  assert.equal(service.readOperation(created.operation.id).status, 'launching')
})

test('scenario-demo allows only a newer explicit same-target replay after an unknown outcome', () => {
  const targetSummary = {
    safeTarget: 'host=192.168.0.106 port=5432 database=plush_erp',
    targetFingerprint: 'c'.repeat(64),
    preflightFingerprint: 'd'.repeat(64),
    disposable: false,
    automaticCleanup: false,
  }
  const candidate = {
    id: '223e4567-e89b-42d3-a456-426614174000',
    profileKey: 'scenario-demo',
    status: 'ready',
    createdAt: '2026-07-29T02:06:04.000Z',
    targetSummary,
  }
  const unknown = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    profileKey: 'scenario-demo',
    status: 'not_proven',
    createdAt: '2026-07-29T02:03:04.000Z',
    updatedAt: '2026-07-29T02:05:04.000Z',
    targetSummary,
  }
  assert.equal(
    unresolvedDataPreparationOutcomeBlocksExecution(candidate, [unknown]),
    false
  )
  assert.equal(
    unresolvedDataPreparationOutcomeBlocksExecution(candidate, [
      {
        ...unknown,
        profileKey: 'core-demo',
      },
    ]),
    true
  )
  assert.equal(
    unresolvedDataPreparationOutcomeBlocksExecution(candidate, [
      {
        ...unknown,
        targetSummary: {
          ...targetSummary,
          targetKey: 'customer-trial-133',
          targetFingerprint: 'e'.repeat(64),
        },
      },
    ]),
    false
  )
  assert.equal(
    unresolvedDataPreparationOutcomeBlocksExecution(candidate, [
      {
        ...unknown,
        targetSummary: {
          ...targetSummary,
          targetFingerprint: 'e'.repeat(64),
        },
      },
    ]),
    true
  )
  assert.equal(
    unresolvedDataPreparationOutcomeBlocksExecution(candidate, [
      {
        ...unknown,
        status: 'running',
      },
    ]),
    true
  )
})

test('failed command receipts redact credentials and full DSNs', async (t) => {
  const fixture = createFixture(t)
  let preflightCount = 0
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: async (command, args) => {
      if (command === 'go') return { stdout: `${CORE_DSN}\n` }
      if (args.includes('--mode')) {
        preflightCount += 1
        if (preflightCount > 1) {
          throw new Error(
            'Command failed:\npassword=hunter2\tdsn=postgres://admin:secret@192.168.0.106:5432/plush_erp\n/tmp/seed.log /home/dev/config /private/tmp/a /var/run/service'
          )
        }
        return {
          stdout:
            '[local-preflight] 工作区 schema/migration 守卫通过\n' +
            '[local-preflight] 开发数据库 migration 已是最新版本（20260729，10/10）\n' +
            '[local-preflight] non-system-schema function=0 procedure=0 non-internal-trigger=0\n',
        }
      }
      return { stdout: '' }
    },
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  const prepared = await service.act({
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  })
  await service.act({
    action: 'execute',
    payload: {
      operationId: prepared.operation.id,
      confirmation: prepared.operation.confirmationRequired,
    },
  })
  const failed = await waitForOperation(
    service,
    prepared.operation.id,
    'failed'
  )
  const serialized = JSON.stringify(failed)
  assert.doesNotMatch(
    serialized,
    /hunter2|admin:secret|password|postgres:\/\/admin|dsn=|\/(?:home|private|tmp|var)\//iu
  )
  assert.doesNotMatch(failed.issues[0].message, /\p{Cc}/u)
  const persisted = readFileSync(
    path.join(fixture.store, 'operations', `${prepared.operation.id}.json`),
    'utf8'
  )
  assert.doesNotMatch(
    persisted,
    /hunter2|admin:secret|password|postgres:\/\/admin|dsn=|\/(?:home|private|tmp|var)\//iu
  )
})

test('core demo records partial completion when a later fixed seed step fails', async (t) => {
  const fixture = createFixture(t)
  const baseRunner = successfulRunner([])
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: async (command, args, options) => {
      if (args.some((arg) => arg.endsWith('seed-core-demo-data.sh'))) {
        throw new Error('core reference write failed')
      }
      return baseRunner(command, args, options)
    },
    readRepositoryState: async () => REPOSITORY,
    environment: {},
    now: () => new Date('2026-07-29T02:03:04.000Z'),
    random: fixedRandom,
  })
  const prepared = await service.act({
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  })
  await service.act({
    action: 'execute',
    payload: {
      operationId: prepared.operation.id,
      confirmation: prepared.operation.confirmationRequired,
    },
  })

  const failed = await waitForOperation(
    service,
    prepared.operation.id,
    'failed'
  )
  assert.equal(failed.readback, null)
  assert.match(failed.issues[0].message, /目标可能已部分更新/u)
  assert.match(failed.issues[0].message, /role-seed/u)
})

test('repository identity requires an exact 40-character commit', async (t) => {
  const fixture = createFixture(t)
  const service = createDevDataPreparationService({
    projectRoot: fixture.root,
    operationStore: fixture.store,
    commandRunner: successfulRunner([]),
    readRepositoryState: async () => ({
      ...REPOSITORY,
      commit: 'a'.repeat(64),
    }),
    environment: {},
  })
  const summary = await service.summary()
  assert.equal(summary.repository, null)
  await assert.rejects(
    service.act({
      action: 'prepare',
      payload: {
        profileKey: 'core-demo',
        targetKey: 'local-development',
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    }),
    /repository identity/u
  )
})

async function invokeMiddleware(
  middleware,
  {
    url,
    method = 'GET',
    headers = {},
    remoteAddress = '127.0.0.1',
    body = '',
  } = {}
) {
  const request = Readable.from(body ? [body] : [])
  request.url = url
  request.method = method
  request.headers = headers
  request.socket = { remoteAddress }
  const response = new EventEmitter()
  response.headers = {}
  response.setHeader = (name, value) => {
    response.headers[String(name).toLowerCase()] = value
  }
  const result = new Promise((resolve) => {
    response.end = (payload = '') => {
      resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: String(payload),
      })
    }
  })
  let nextCalled = false
  await middleware(request, response, () => {
    nextCalled = true
    response.statusCode = 599
    response.end('')
  })
  return { ...(await result), nextCalled }
}

test('middleware enforces loopback, same-origin CSRF, strict JSON, and request size', async () => {
  let actions = 0
  const service = {
    async summary() {
      return { schemaVersion: 'plush.dev-data-preparation-summary/v1' }
    },
    readOperation() {
      return {}
    },
    async act() {
      actions += 1
      return {
        schemaVersion: 'plush.dev-data-preparation-action-result/v1',
        action: 'prepare',
        operation: {},
      }
    },
  }
  const csrfToken = 'c'.repeat(43)
  const middleware = createDevDataPreparationMiddleware({
    service,
    csrfToken,
  })
  const remote = await invokeMiddleware(middleware, {
    url: DEV_DATA_PREPARATION_SESSION_API_PATH,
    headers: { host: '127.0.0.1:5175' },
    remoteAddress: '192.168.0.20',
  })
  assert.equal(remote.statusCode, 403)

  const session = await invokeMiddleware(middleware, {
    url: DEV_DATA_PREPARATION_SESSION_API_PATH,
    headers: { host: '127.0.0.1:5175' },
  })
  assert.equal(session.statusCode, 200)
  assert.equal(JSON.parse(session.body).csrfToken, csrfToken)

  const request = JSON.stringify({
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  })
  const missingOrigin = await invokeMiddleware(middleware, {
    url: DEV_DATA_PREPARATION_ACTION_API_PATH,
    method: 'POST',
    headers: {
      host: '127.0.0.1:5175',
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
    },
    body: request,
  })
  assert.equal(missingOrigin.statusCode, 403)

  const commonHeaders = {
    host: '127.0.0.1:5175',
    origin: 'http://127.0.0.1:5175',
    'sec-fetch-site': 'same-origin',
    'content-type': 'application/json; charset=utf-8',
    'x-csrf-token': csrfToken,
  }
  const extraField = await invokeMiddleware(middleware, {
    url: DEV_DATA_PREPARATION_ACTION_API_PATH,
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      action: 'prepare',
      payload: {
        profileKey: 'core-demo',
        targetKey: 'local-development',
        idempotencyKey: IDEMPOTENCY_KEY,
        shell: 'bash',
      },
    }),
  })
  assert.equal(extraField.statusCode, 400)
  const oversized = await invokeMiddleware(middleware, {
    url: DEV_DATA_PREPARATION_ACTION_API_PATH,
    method: 'POST',
    headers: commonHeaders,
    body: JSON.stringify({
      padding: 'x'.repeat(MAX_DEV_DATA_PREPARATION_REQUEST_BYTES),
    }),
  })
  assert.equal(oversized.statusCode, 400)
  const accepted = await invokeMiddleware(middleware, {
    url: DEV_DATA_PREPARATION_ACTION_API_PATH,
    method: 'POST',
    headers: commonHeaders,
    body: request,
  })
  assert.equal(accepted.statusCode, 200)
  assert.equal(actions, 1)
})

test('profile metadata states retention, cleanup, and browser-safe requirements without claiming customer UAT', () => {
  assert.deepEqual(
    DEV_DATA_PREPARATION_PROFILES.map(
      ({ key, dataRetention, cleanupMode, exactCleanCommitRequired }) => ({
        key,
        dataRetention,
        cleanupMode,
        exactCleanCommitRequired,
      })
    ),
    [
      {
        key: 'full-acceptance',
        dataRetention: 'ephemeral',
        cleanupMode: 'automatic',
        exactCleanCommitRequired: true,
      },
      {
        key: 'core-demo',
        dataRetention: 'long-lived',
        cleanupMode: 'not-supported',
        exactCleanCommitRequired: false,
      },
      {
        key: 'scenario-demo',
        dataRetention: 'long-lived',
        cleanupMode: 'forward-only',
        exactCleanCommitRequired: false,
      },
    ]
  )
  const scenario = DEV_DATA_PREPARATION_PROFILES.find(
    ({ key }) => key === 'scenario-demo'
  )
  assert.deepEqual(scenario.requiredEnvironment, [
    '登记本地开发库与本机 8300 后端',
    '登记 133 试用库、固定隧道与带外证明',
  ])
  assert.equal(
    scenario.requiredEnvironment.some((value) =>
      /password|secret|token|authorization|cookie|dsn/iu.test(value)
    ),
    false
  )
})
