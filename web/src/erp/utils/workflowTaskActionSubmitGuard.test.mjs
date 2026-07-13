import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

import {
  normalizeWorkflowActionExplainData,
  normalizeWorkflowActionMode,
} from './workflowTaskActionAccess.mjs'

function getUserFacingErrorMessage(err, fallback = '请求失败，请稍后重试') {
  const message = typeof err === 'string' ? err : (err?.message ?? '')
  return /[\u3400-\u9fff]/u.test(String(message || '')) ? message : fallback
}

function getActionErrorMessage(err, action) {
  return getUserFacingErrorMessage(err, action)
}

function loadSubmitGuard({ explainWorkflowActionAccess }) {
  const source = readFileSync(
    new URL('./workflowTaskActionSubmitGuard.mjs', import.meta.url),
    'utf8'
  )
  const transformed = source
    .replace(
      `import {
  getActionErrorMessage,
  getUserFacingErrorMessage,
} from '@/common/utils/errorMessage'
`,
      `const { getActionErrorMessage, getUserFacingErrorMessage } = __errorMessage__
`
    )
    .replace(
      `import { explainWorkflowActionAccess } from '../api/workflowApi.mjs'
`,
      `const { explainWorkflowActionAccess } = __workflowApi__
`
    )
    .replace(
      `import {
  normalizeWorkflowActionExplainData,
  normalizeWorkflowActionMode,
} from './workflowTaskActionAccess.mjs'
`,
      `const { normalizeWorkflowActionExplainData, normalizeWorkflowActionMode } = __access__
`
    )
    .replace(
      'export async function verifyWorkflowTaskActionAccessBeforeSubmit',
      'async function verifyWorkflowTaskActionAccessBeforeSubmit'
    )

  assert(!/\bimport\s/u.test(transformed))
  assert(!/\bexport\s/u.test(transformed))

  const module = { exports: {} }
  vm.runInNewContext(
    `${transformed}
module.exports = { verifyWorkflowTaskActionAccessBeforeSubmit }`,
    {
      __errorMessage__: {
        getActionErrorMessage,
        getUserFacingErrorMessage,
      },
      __workflowApi__: { explainWorkflowActionAccess },
      __access__: {
        normalizeWorkflowActionExplainData,
        normalizeWorkflowActionMode,
      },
      module,
    }
  )
  return module.exports
}

test('workflowTaskActionSubmitGuard: missing task or action stops before backend explain', async () => {
  let explainCalls = 0
  const warnings = []
  const { verifyWorkflowTaskActionAccessBeforeSubmit } = loadSubmitGuard({
    explainWorkflowActionAccess: async () => {
      explainCalls += 1
      return { actions: [] }
    },
  })

  const allowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
    task: { task_id: 42 },
    actionKey: '',
    onWarning: (message) => warnings.push(message),
  })

  assert.equal(allowed, false)
  assert.equal(explainCalls, 0)
  assert.deepEqual(warnings, ['当前任务动作缺少必要参数，请刷新后重试'])
})

test('workflowTaskActionSubmitGuard: unknown action key stops before backend explain', async () => {
  let explainCalls = 0
  const warnings = []
  const { verifyWorkflowTaskActionAccessBeforeSubmit } = loadSubmitGuard({
    explainWorkflowActionAccess: async () => {
      explainCalls += 1
      return { actions: [] }
    },
  })

  const allowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
    task: { id: 42 },
    actionKey: 'custom_backend_action_key',
    onWarning: (message) => warnings.push(message),
  })

  assert.equal(allowed, false)
  assert.equal(explainCalls, 0)
  assert.deepEqual(warnings, ['当前任务动作缺少必要参数，请刷新后重试'])
})

test('workflowTaskActionSubmitGuard: allows only after backend explain allows the formal action', async () => {
  const requests = []
  const { verifyWorkflowTaskActionAccessBeforeSubmit } = loadSubmitGuard({
    explainWorkflowActionAccess: async (params) => {
      requests.push(params)
      return {
        actions: [{ action_key: 'complete', allowed: true, reason: '可完成' }],
      }
    },
  })

  const allowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
    task: { id: 42, task_id: 99 },
    actionKey: 'complete',
  })

  assert.equal(allowed, true)
  assert.deepEqual(
    requests.map((request) => ({ ...request })),
    [{ task_id: 42, action_key: 'complete' }]
  )
})

test('workflowTaskActionSubmitGuard: hides raw backend deny reason from user visible warning', async () => {
  const warnings = []
  const { verifyWorkflowTaskActionAccessBeforeSubmit } = loadSubmitGuard({
    explainWorkflowActionAccess: async () => ({
      actions: [
        {
          action_key: 'block',
          allowed: false,
          reason: 'owner_role_key mismatch: warehouse',
        },
      ],
    }),
  })

  const allowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
    task: { id: 42 },
    actionKey: 'block',
    reason: '等待仓库确认',
    onWarning: (message) => warnings.push(message),
  })

  assert.equal(allowed, false)
  assert.deepEqual(warnings, ['当前账号不能提交这个任务动作'])
})

test('workflowTaskActionSubmitGuard: required reason stops before backend explain', async () => {
  let explainCalls = 0
  const warnings = []
  const { verifyWorkflowTaskActionAccessBeforeSubmit } = loadSubmitGuard({
    explainWorkflowActionAccess: async () => {
      explainCalls += 1
      return { actions: [{ action_key: 'reject', allowed: true }] }
    },
  })

  const allowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
    task: { id: 42 },
    actionKey: 'reject',
    reason: '  ',
    onWarning: (message) => warnings.push(message),
  })

  assert.equal(allowed, false)
  assert.equal(explainCalls, 0)
  assert.deepEqual(warnings, ['请先填写退回原因'])
})

test('workflowTaskActionSubmitGuard: missing requested backend action denies before submit', async () => {
  const warnings = []
  const { verifyWorkflowTaskActionAccessBeforeSubmit } = loadSubmitGuard({
    explainWorkflowActionAccess: async () => ({
      actions: [{ action_key: 'complete', allowed: true }],
    }),
  })

  const allowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
    task: { id: 42 },
    actionKey: 'reject',
    reason: '资料不完整',
    onWarning: (message) => warnings.push(message),
  })

  assert.equal(allowed, false)
  assert.deepEqual(warnings, ['当前账号不能提交这个任务动作'])
})

test('workflowTaskActionSubmitGuard: backend explain failure reports sanitized action error', async () => {
  const errors = []
  const { verifyWorkflowTaskActionAccessBeforeSubmit } = loadSubmitGuard({
    explainWorkflowActionAccess: async () => {
      throw new Error('permission denied by owner_role_key')
    },
  })

  const allowed = await verifyWorkflowTaskActionAccessBeforeSubmit({
    task: { id: 42 },
    actionKey: 'urge',
    reason: '请尽快处理',
    onError: (message) => errors.push(message),
  })

  assert.equal(allowed, false)
  assert.deepEqual(errors, ['核对任务动作权限失败'])
})
