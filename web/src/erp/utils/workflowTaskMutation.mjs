const WORKFLOW_TASK_INTENT_IGNORED_TOP_LEVEL_KEYS = new Set([
  'blocked_reason',
  'desktop_task_board_action',
  'entry',
  'entry_path',
  'mobile_action_key',
  'mobile_action_recorded_at',
  'mobile_action_role_key',
  'mobile_role_key',
  'outsourcing_order_page_action',
  'purchase_order_page_action',
  'rejected_reason',
  'workflow_page_action',
  'workflow_page_scope',
])

const WORKFLOW_TASK_MOBILE_DUPLICATE_KEYS = new Set([
  'action_key',
  'action_label',
  'reason',
  'recorded_at',
  'reported_at',
  'role_key',
])

const WORKFLOW_TASK_MUTATION_OPERATIONS = new Set([
  'complete',
  'block',
  'reject',
  'urge',
])

const WORKFLOW_TASK_URGE_ACTIONS = new Set([
  'urge_task',
  'urge_role',
  'urge_assignee',
  'escalate_to_pmc',
  'escalate_to_boss',
])

const WORKFLOW_TASK_STATUS_MUTATION_KEYS = new Set([
  'action_key',
  'break_glass',
  'break_glass_expires_at',
  'break_glass_reason',
  'expected_version',
  'idempotency_key',
  'payload',
  'reason',
  'task_id',
])

const WORKFLOW_TASK_URGE_MUTATION_KEYS = new Set([
  'action',
  'expected_version',
  'idempotency_key',
  'payload',
  'reason',
  'task_id',
])

const WORKFLOW_TASK_ACTION_PAYLOAD_SYSTEM_KEYS = new Set([
  'business_status_key',
  'command_key',
  'domain_command',
  'domain_command_key',
  'expected_version',
  'idempotency_key',
  'intent_hash',
  'owner_role_key',
  'source_id',
  'source_line_id',
  'source_no',
  'source_type',
  'task_status_key',
  'task_version',
  'version',
])

const WORKFLOW_TASK_MUTATION_INVALID_MESSAGE = '页面已更新，请刷新后重新操作'
const WORKFLOW_TASK_IDEMPOTENCY_KEY_MAX_LENGTH = 128

function workflowTaskMutationInvalid() {
  return new Error(WORKFLOW_TASK_MUTATION_INVALID_MESSAGE)
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function requireWorkflowTaskActionPayload(value) {
  if (value === undefined || value === null) return {}
  if (!plainObject(value)) throw workflowTaskMutationInvalid()
  for (const key of Object.keys(value)) {
    if (WORKFLOW_TASK_ACTION_PAYLOAD_SYSTEM_KEYS.has(key.trim())) {
      throw workflowTaskMutationInvalid()
    }
  }
  return value
}

export function requireWorkflowTaskIdempotencyKey(value) {
  if (typeof value !== 'string') throw workflowTaskMutationInvalid()
  const key = value.trim()
  if (!key || [...key].length > WORKFLOW_TASK_IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw workflowTaskMutationInvalid()
  }
  return key
}

export function requireWorkflowTaskMutationParams(
  operation,
  params = {},
  { requireIdempotencyKey = false } = {}
) {
  const normalizedOperation = String(operation || '').trim()
  if (
    !WORKFLOW_TASK_MUTATION_OPERATIONS.has(normalizedOperation) ||
    !plainObject(params) ||
    !positiveSafeInteger(params.task_id) ||
    !positiveSafeInteger(params.expected_version)
  ) {
    throw workflowTaskMutationInvalid()
  }
  const allowedKeys =
    normalizedOperation === 'urge'
      ? WORKFLOW_TASK_URGE_MUTATION_KEYS
      : WORKFLOW_TASK_STATUS_MUTATION_KEYS
  for (const key of Object.keys(params)) {
    if (!allowedKeys.has(key)) throw workflowTaskMutationInvalid()
  }

  const normalized = {
    ...params,
    task_id: params.task_id,
    expected_version: params.expected_version,
    payload: requireWorkflowTaskActionPayload(params.payload),
  }
  if (normalizedOperation === 'urge') {
    if (Object.hasOwn(params, 'action_key')) {
      throw workflowTaskMutationInvalid()
    }
    const action = typeof params.action === 'string' ? params.action : ''
    if (!WORKFLOW_TASK_URGE_ACTIONS.has(action)) {
      throw workflowTaskMutationInvalid()
    }
    normalized.action = action
  } else {
    if (Object.hasOwn(params, 'action')) throw workflowTaskMutationInvalid()
    const actionKey =
      typeof params.action_key === 'string' ? params.action_key : ''
    if (actionKey !== normalizedOperation) {
      throw workflowTaskMutationInvalid()
    }
    normalized.action_key = actionKey
  }

  if (Object.hasOwn(params, 'reason') && typeof params.reason !== 'string') {
    throw workflowTaskMutationInvalid()
  }
  normalized.reason = String(params.reason || '').trim()
  if (
    ['block', 'reject', 'urge'].includes(normalizedOperation) &&
    !normalized.reason
  ) {
    throw workflowTaskMutationInvalid()
  }

  if (normalizedOperation !== 'urge') {
    if (
      Object.hasOwn(params, 'break_glass') &&
      typeof params.break_glass !== 'boolean'
    ) {
      throw workflowTaskMutationInvalid()
    }
    const hasBreakGlassDetails =
      Object.hasOwn(params, 'break_glass_reason') ||
      Object.hasOwn(params, 'break_glass_expires_at')
    if (params.break_glass !== true && hasBreakGlassDetails) {
      throw workflowTaskMutationInvalid()
    }
    if (params.break_glass === true) {
      if (
        typeof params.break_glass_reason !== 'string' ||
        !params.break_glass_reason.trim() ||
        !positiveSafeInteger(params.break_glass_expires_at)
      ) {
        throw workflowTaskMutationInvalid()
      }
      normalized.break_glass_reason = params.break_glass_reason.trim()
    }
  }

  if (requireIdempotencyKey || Object.hasOwn(params, 'idempotency_key')) {
    normalized.idempotency_key = requireWorkflowTaskIdempotencyKey(
      params.idempotency_key
    )
  }
  return normalized
}

export function workflowTaskMutationUUID(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID === 'function') {
    return cryptoProvider.randomUUID()
  }
  if (typeof cryptoProvider?.getRandomValues === 'function') {
    const bytes = cryptoProvider.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] % 16) + 64
    bytes[8] = (bytes[8] % 64) + 128
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex
      .slice(4, 6)
      .join('')}-${hex.slice(6, 8).join('')}-${hex
      .slice(8, 10)
      .join('')}-${hex.slice(10).join('')}`
  }
  throw new Error('当前浏览器无法生成安全请求标识，请刷新或升级浏览器后重试')
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  )
}

function semanticPayload(value, parentKey = '') {
  if (Array.isArray(value)) {
    const items = value.map((item) => semanticPayload(item, parentKey))
    if (
      ['evidence_refs', 'mobile_action_evidence_refs'].includes(parentKey) &&
      value.every((item) => typeof item === 'string')
    ) {
      return [
        ...new Set(value.map((item) => item.trim()).filter(Boolean)),
      ].sort()
    }
    return items
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => {
        if (!parentKey) {
          return !WORKFLOW_TASK_INTENT_IGNORED_TOP_LEVEL_KEYS.has(key)
        }
        if (['mobile_action', 'mobile_exception_report'].includes(parentKey)) {
          return !WORKFLOW_TASK_MOBILE_DUPLICATE_KEYS.has(key)
        }
        return true
      })
      .map(([key, item]) => [key, semanticPayload(item, key)])
  )
}

export function workflowTaskMutationSignature(operation, params) {
  const normalizedParams = requireWorkflowTaskMutationParams(operation, params)
  return JSON.stringify(
    stableValue({
      operation: String(operation || '').trim(),
      task_id: normalizedParams.task_id,
      action:
        String(operation || '').trim() === 'urge'
          ? normalizedParams.action
          : String(operation || '').trim(),
      reason: String(normalizedParams.reason || '').trim(),
      payload: semanticPayload(normalizedParams.payload || {}),
      break_glass: Boolean(normalizedParams.break_glass),
      break_glass_reason: String(
        normalizedParams.break_glass_reason || ''
      ).trim(),
      break_glass_expires_at: normalizedParams.break_glass_expires_at || null,
    })
  )
}

function frozenWorkflowTaskMutationParams(params, idempotencyKey) {
  return deepFreeze(
    JSON.parse(JSON.stringify({ ...params, idempotency_key: idempotencyKey }))
  )
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}

export function isWorkflowTaskMutationResultUnknown(error) {
  const httpStatus = Number(error?.httpStatus || 0)
  return Boolean(
    error?.isNetworkError ||
      error?.isAbortError ||
      error?.isInvalidResponse ||
      httpStatus === 408 ||
      httpStatus >= 500 ||
      Number(error?.code || 0) >= 50000
  )
}

export function createTaskMutationInFlightGuard() {
  const leases = new Map()
  return {
    acquire(scope) {
      const normalizedScope = String(scope || '').trim()
      if (!normalizedScope || leases.has(normalizedScope)) return null
      const lease = Object.freeze({ scope: normalizedScope })
      leases.set(normalizedScope, lease)
      return lease
    },
    release(lease) {
      const scope = String(lease?.scope || '').trim()
      if (!scope || leases.get(scope) !== lease) return false
      leases.delete(scope)
      return true
    },
    isInFlight(scope) {
      return leases.has(String(scope || '').trim())
    },
  }
}

export function createTaskMutationAttemptStore({
  createUUID = workflowTaskMutationUUID,
} = {}) {
  const attempts = new Map()
  return {
    hasRetainedAttempt({ scope, operation, params }) {
      if (!scope) return false
      const attempt = attempts.get(scope)
      return Boolean(
        attempt &&
          attempt.signature === workflowTaskMutationSignature(operation, params)
      )
    },
    async run({ scope, operation, params, mutate }) {
      if (!scope || typeof mutate !== 'function') {
        throw new Error('Workflow 任务动作参数不完整')
      }
      const normalizedParams = requireWorkflowTaskMutationParams(
        operation,
        params
      )
      const signature = workflowTaskMutationSignature(
        operation,
        normalizedParams
      )
      let attempt = attempts.get(scope)
      if (!attempt || attempt.signature !== signature) {
        const idempotencyKey = requireWorkflowTaskIdempotencyKey(
          `wf:${normalizedParams.task_id}:${String(operation || '').trim()}:${createUUID()}`
        )
        attempt = {
          signature,
          params: frozenWorkflowTaskMutationParams(
            normalizedParams,
            idempotencyKey
          ),
        }
        attempts.set(scope, attempt)
      }
      for (
        let transportAttempt = 0;
        transportAttempt < 2;
        transportAttempt += 1
      ) {
        try {
          const result = await mutate(attempt.params)
          if (attempts.get(scope) === attempt) attempts.delete(scope)
          return result
        } catch (error) {
          if (!isWorkflowTaskMutationResultUnknown(error)) {
            if (attempts.get(scope) === attempt) attempts.delete(scope)
            throw error
          }
          if (transportAttempt === 1) throw error
        }
      }
    },
    clear(scope) {
      attempts.delete(scope)
    },
  }
}

export async function verifyNewWorkflowTaskMutationAttempt({
  attemptStore,
  scope,
  operation,
  params,
  verify,
}) {
  if (!attemptStore || typeof verify !== 'function') {
    throw new Error('Workflow 任务动作预检参数不完整')
  }
  if (attemptStore.hasRetainedAttempt({ scope, operation, params })) {
    return true
  }
  return (await verify()) === true
}

export async function runWorkflowTaskMutationWithFailureRefresh(
  mutate,
  refresh
) {
  try {
    return await mutate()
  } catch (error) {
    if (isWorkflowTaskMutationResultUnknown(error)) {
      throw error
    }
    try {
      await refresh()
    } catch {
      // Preserve the action error; refresh is best-effort recovery only.
    }
    throw error
  }
}
