const WORKFLOW_TASK_ACTION_PAYLOAD_KEYS = new Set([
  'entry_path',
  'evidence_refs',
  'feedback',
  'surface_key',
])

const WORKFLOW_TASK_INTENT_CONTEXT_KEYS = new Set(['entry_path', 'surface_key'])

const WORKFLOW_TASK_MUTATION_OPERATIONS = new Set([
  'complete',
  'block',
  'reject',
  'resume',
  'urge',
  'assign',
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

const WORKFLOW_TASK_ASSIGNMENT_MUTATION_KEYS = new Set([
  'assignee_id',
  'expected_version',
  'idempotency_key',
  'reason',
  'task_id',
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

function requireWorkflowTaskActionPayload(operation, value) {
  if (value === undefined || value === null) return {}
  if (!plainObject(value)) throw workflowTaskMutationInvalid()
  for (const key of Object.keys(value)) {
    if (!WORKFLOW_TASK_ACTION_PAYLOAD_KEYS.has(key)) {
      throw workflowTaskMutationInvalid()
    }
  }
  if (operation !== 'complete' && Object.hasOwn(value, 'feedback')) {
    throw workflowTaskMutationInvalid()
  }

  const normalized = {}
  for (const key of ['feedback', 'surface_key', 'entry_path']) {
    if (!Object.hasOwn(value, key)) continue
    if (typeof value[key] !== 'string') throw workflowTaskMutationInvalid()
    const text = value[key].trim()
    if (text) normalized[key] = text
  }
  if (Object.hasOwn(value, 'evidence_refs')) {
    if (
      !Array.isArray(value.evidence_refs) ||
      !value.evidence_refs.every((item) => typeof item === 'string')
    ) {
      throw workflowTaskMutationInvalid()
    }
    const evidenceRefs = [
      ...new Set(
        value.evidence_refs.map((item) => item.trim()).filter(Boolean)
      ),
    ].sort()
    if (evidenceRefs.length) normalized.evidence_refs = evidenceRefs
  }
  return normalized
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
      : normalizedOperation === 'assign'
        ? WORKFLOW_TASK_ASSIGNMENT_MUTATION_KEYS
        : WORKFLOW_TASK_STATUS_MUTATION_KEYS
  for (const key of Object.keys(params)) {
    if (!allowedKeys.has(key)) throw workflowTaskMutationInvalid()
  }

  const normalized = {
    ...params,
    task_id: params.task_id,
    expected_version: params.expected_version,
  }
  if (normalizedOperation === 'assign') {
    if (
      !Object.hasOwn(params, 'assignee_id') ||
      (params.assignee_id !== null && !positiveSafeInteger(params.assignee_id))
    ) {
      throw workflowTaskMutationInvalid()
    }
    normalized.assignee_id = params.assignee_id
  } else {
    normalized.payload = requireWorkflowTaskActionPayload(
      normalizedOperation,
      params.payload
    )
  }
  if (normalizedOperation === 'assign') {
    if (
      Object.hasOwn(params, 'action') ||
      Object.hasOwn(params, 'action_key')
    ) {
      throw workflowTaskMutationInvalid()
    }
  } else if (normalizedOperation === 'urge') {
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
  const normalizedReason = String(params.reason || '').trim()
  if (
    ['block', 'reject', 'resume', 'urge', 'assign'].includes(
      normalizedOperation
    ) &&
    !normalizedReason
  ) {
    throw workflowTaskMutationInvalid()
  }
  if (normalizedReason) {
    normalized.reason = normalizedReason
  } else {
    delete normalized.reason
  }

  if (normalizedOperation !== 'urge' && normalizedOperation !== 'assign') {
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
  throw new Error('当前浏览器暂时无法提交任务，请刷新或升级浏览器后重试')
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

function semanticPayload(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !WORKFLOW_TASK_INTENT_CONTEXT_KEYS.has(key)
    )
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
      assignee_id:
        String(operation || '').trim() === 'assign'
          ? normalizedParams.assignee_id
          : undefined,
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
        throw new Error('任务操作暂时无法提交，请刷新后重试')
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
    throw new Error('任务操作暂时无法确认，请刷新后重试')
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
