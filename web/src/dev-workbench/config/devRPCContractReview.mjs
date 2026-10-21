export const RPC_CONTRACT_REVIEW_API =
  '/__dev/api/qa/quality-gates/rpc-contract-review'
export const RPC_EXAMPLE_VERIFY_COMMAND =
  'node scripts/gen-public-contracts.mjs --verify-examples'
export const RPC_REVIEW_STATUS = Object.freeze({
  passed: ['通过', 'green'],
  failed: ['失败', 'red'],
  missing: ['未执行', 'default'],
  skipped: ['跳过', 'gold'],
})

export function parseRPCReviewSearch(search) {
  const params = new URLSearchParams(search)
  const value = (name) =>
    params.getAll(name).length === 1 ? params.get(name) : ''
  return {
    range: value('contractRange') === 'staged' ? 'staged' : 'worktree',
    method: /^[a-z_]+\.[a-z_]+$/u.test(value('change') || '')
      ? value('change')
      : '',
  }
}

export function getRPCExecutionPresentation(report) {
  const evidence = report.execution
  const error = typeof evidence.message === 'string' ? evidence.message : ''
  const current = Boolean(report.current && evidence.current && evidence.receipt && !error)
  const status = error ? 'failed' : current ? evidence.status : 'missing'
  return {
    current,
    status,
    label: error ? '回执读取失败' : current ? RPC_REVIEW_STATUS[status][0] : '本轮未验证',
    historical: Boolean(evidence.receipt && !current),
    message: error || (!evidence.receipt
      ? '尚无样例执行回执。'
      : !current
        ? '历史回执未覆盖当前比较对象。'
        : '本次回执覆盖当前比较对象，结果仅适用于已登记的样例。'),
  }
}

export function normalizeRPCContractReview(value) {
  const statuses = Object.keys(RPC_REVIEW_STATUS)
  if (
    value?.kind !== 'plush.rpc-contract-review' ||
    !['worktree', 'staged'].includes(value.range) ||
    typeof value.current !== 'boolean' ||
    !/^[a-f0-9]{40,64}$/u.test(value.base || '') ||
    !Array.isArray(value.changes) ||
    value.changes.length > 2000 ||
    !Array.isArray(value.checks) ||
    value.checks.length !== 3 ||
    !Array.isArray(value.files) ||
    value.files.length > 10000 ||
    !value.execution ||
    !statuses.includes(value.execution.status) ||
    typeof value.execution.current !== 'boolean' ||
    !Array.isArray(value.execution.methods) ||
    !Array.isArray(value.execution.registered)
  ) {
    throw new Error('接口合同检查结果不完整')
  }
  const identity = value.repository
  if (
    !identity ||
    !/^[a-f0-9]{40,64}$/u.test(identity.commit || '') ||
    !/^[a-f0-9]{64}$/u.test(identity.fingerprint || '') ||
    typeof identity.dirty !== 'boolean'
  ) {
    throw new Error('接口合同检查源码身份缺失')
  }
  if (
    !Number.isInteger(value.methodCount) ||
    value.methodCount < 0 ||
    value.methodCount > 2000 ||
    !Number.isFinite(Date.parse(value.readAt))
  ) {
    throw new Error('接口合同目录或时间无效')
  }
  const changes = new Set()
  for (const row of value.changes) {
    if (
      !/^[a-z_]+\.[a-z_]+$/u.test(row.key || '') ||
      changes.has(row.key) ||
      !['added', 'removed', 'changed', 'implementation'].includes(row.kind) ||
      typeof row.label !== 'string' ||
      !Array.isArray(row.fields) ||
      !Array.isArray(row.consumers) ||
      row.consumers.some(
        (consumer) =>
          consumer.key !== row.key ||
          !/^web\/src\/.+\.(?:js|jsx|mjs)$/u.test(consumer.path || '') ||
          !Number.isInteger(consumer.line) ||
          consumer.line < 1
      )
    ) {
      throw new Error('接口合同差异无效')
    }
    changes.add(row.key)
    if (
      row.fields.some(
        (field) =>
          typeof field.path !== 'string' ||
          !['added', 'removed', 'changed'].includes(field.kind) ||
          ![field.before, field.after].every(
            (item) => item === null || typeof item === 'string'
          )
      )
    ) {
      throw new Error('接口字段差异无效')
    }
  }
  for (const row of value.checks) {
    if (
      !['catalog', 'generated', 'staging'].includes(row.key) ||
      !statuses.includes(row.status) ||
      typeof row.message !== 'string'
    ) {
      throw new Error('接口合同检查状态无效')
    }
  }
  if (new Set(value.checks.map((row) => row.key)).size !== 3) {
    throw new Error('接口合同检查重复')
  }
  for (const row of value.files) {
    if (
      typeof row.path !== 'string' ||
      row.path.startsWith('/') ||
      row.path.includes('..') ||
      typeof row.staged !== 'boolean' ||
      typeof row.worktreeChanged !== 'boolean'
    ) {
      throw new Error('接口合同暂存文件无效')
    }
  }
  for (const row of value.execution.methods) {
    if (
      !/^[a-z_]+\.[a-z_]+$/u.test(row.key || '') ||
      !statuses.includes(row.status) ||
      !Array.isArray(row.cases) ||
      row.cases.some(
        (item) =>
          typeof item?.name !== 'string' ||
          item.name.length > 200 ||
          !statuses.includes(item.status)
      ) ||
      (row.failureFields &&
        (!Array.isArray(row.failureFields) ||
          row.failureFields.some(
            (field) => typeof field !== 'string' || field.length > 250
          )))
    ) {
      throw new Error('接口样例执行状态无效')
    }
  }
  if (
    value.execution.registered.some(
      (key) => !/^[a-z_]+\.[a-z_]+$/u.test(key)
    ) ||
    new Set(value.execution.registered).size !==
      value.execution.registered.length ||
    new Set(value.execution.methods.map((row) => row.key)).size !==
      value.execution.methods.length
  ) {
    throw new Error('接口样例执行登记重复或无效')
  }
  return value
}

export async function readRPCContractReview({
  range = 'worktree',
  signal,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!['worktree', 'staged'].includes(range)) {
    throw new Error('接口合同比较范围无效')
  }
  const response = await fetchImpl(
    `${RPC_CONTRACT_REVIEW_API}?range=${range}`,
    {
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    }
  )
  if (!response.ok) throw new Error('接口合同检查读取失败')
  const result = normalizeRPCContractReview(await response.json())
  if (result.range !== range) throw new Error('接口合同比较范围与请求不一致')
  return result
}
