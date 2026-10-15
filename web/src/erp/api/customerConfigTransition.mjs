export const CUSTOMER_CONFIG_HASH_VERSION = 1

const TRANSITION_ACTIONS = new Set(['activate', 'rollback'])

function requiredString(value, label) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    throw new Error(`缺少${label}，无法切换客户配置`)
  }
  return normalized
}

function customerConfigIdentity(manifest, validation) {
  const customerKey = requiredString(manifest?.customer_key, '客户标识')
  const revision = requiredString(manifest?.revision, '配置版本')
  const productVersion = requiredString(manifest?.product_version, '产品版本')
  const configHash = requiredString(
    validation?.config_hash,
    '配置校验摘要'
  ).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(configHash)) {
    throw new Error('配置校验摘要格式无效，无法切换客户配置')
  }
  if (
    Number(validation?.config_hash_version) !== CUSTOMER_CONFIG_HASH_VERSION
  ) {
    throw new Error('配置校验摘要版本不受支持，无法切换客户配置')
  }
  if (
    validation?.customer_key !== customerKey ||
    validation?.revision !== revision ||
    validation?.compiled_snapshot_ok !== true
  ) {
    throw new Error('客户业务设置校验结果不一致，请刷新后重试')
  }
  return { customerKey, revision, productVersion, configHash }
}

function assertExactKeys(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}参数无效`)
  }
  const unexpected = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key)
  )
  if (unexpected.length > 0) {
    throw new Error(`${label}包含未支持参数`)
  }
}

export function buildCustomerConfigMutationPayload(action, params) {
  if (!TRANSITION_ACTIONS.has(action)) {
    throw new Error('当前客户业务设置无法切换，请刷新后重试')
  }
  const revisionKey = action === 'rollback' ? 'target_revision' : 'revision'
  const allowedKeys = [
    'customer_key',
    revisionKey,
    'expected_config_hash',
    'expected_product_version',
    'expected_active_revision',
  ]
  assertExactKeys(params, allowedKeys, '客户配置切换')
  if (!Object.hasOwn(params, 'expected_active_revision')) {
    throw new Error('缺少当前有效配置版本，无法切换客户配置')
  }
  if (typeof params.expected_active_revision !== 'string') {
    throw new Error('当前有效配置版本格式无效')
  }
  return {
    customer_key: requiredString(params.customer_key, '客户标识'),
    [revisionKey]: requiredString(params[revisionKey], '目标配置版本'),
    expected_config_hash: requiredString(
      params.expected_config_hash,
      '配置校验摘要'
    ),
    expected_product_version: requiredString(
      params.expected_product_version,
      '产品版本'
    ),
    expected_active_revision: params.expected_active_revision.trim(),
  }
}

export function assertPublishedCustomerConfigIdentity(
  published,
  manifest,
  validation
) {
  const identity = customerConfigIdentity(manifest, validation)
  if (
    published?.customer_key !== identity.customerKey ||
    published?.revision !== identity.revision ||
    published?.product_version !== identity.productVersion ||
    String(published?.config_hash || '')
      .trim()
      .toLowerCase() !== identity.configHash ||
    Number(published?.config_hash_version) !== CUSTOMER_CONFIG_HASH_VERSION ||
    !['published', 'active', 'superseded'].includes(published?.status)
  ) {
    throw new Error('发布结果与已校验的客户配置不一致')
  }
  return identity
}

export function resolveCustomerConfigApplyTransitionAction(published) {
  const status = String(published?.status || '').trim()
  if (status === 'superseded') {
    return 'rollback'
  }
  if (status === 'published' || status === 'active') {
    return 'activate'
  }
  throw new Error('客户配置版本状态不支持本地应用')
}

function transitionOf(response, expected) {
  if (
    response?.action !== expected.action ||
    response?.customer_key !== expected.customerKey ||
    response?.target_revision !== expected.revision ||
    String(response?.target_config_hash || '')
      .trim()
      .toLowerCase() !== expected.configHash ||
    response?.target_product_version !== expected.productVersion ||
    typeof response?.expected_active_revision !== 'string' ||
    typeof response?.observed_active_revision !== 'string' ||
    typeof response?.allowed !== 'boolean' ||
    !Array.isArray(response?.blockers)
  ) {
    throw new Error('客户配置切换检查结果与当前清单不一致')
  }
  return response
}

export async function confirmCustomerConfigTransition({
  action,
  manifest,
  validation,
  check,
}) {
  if (!TRANSITION_ACTIONS.has(action) || typeof check !== 'function') {
    throw new Error('客户配置切换检查参数无效')
  }
  const identity = customerConfigIdentity(manifest, validation)
  const base = {
    action,
    customer_key: identity.customerKey,
    target_revision: identity.revision,
    expected_config_hash: identity.configHash,
    expected_product_version: identity.productVersion,
  }
  let attempts = 1
  let transition = transitionOf(
    await check({ ...base, expected_active_revision: '' }),
    { ...identity, action }
  )
  if (transition.expected_active_revision !== '') {
    throw new Error('客户配置切换检查未确认请求的有效版本')
  }
  const observedActiveRevision = transition.observed_active_revision.trim()
  if (observedActiveRevision) {
    attempts += 1
    transition = transitionOf(
      await check({
        ...base,
        expected_active_revision: observedActiveRevision,
      }),
      { ...identity, action }
    )
    if (
      transition.expected_active_revision !== observedActiveRevision ||
      transition.observed_active_revision !== observedActiveRevision
    ) {
      throw new Error('有效配置版本在切换检查期间发生变化，请重新操作')
    }
  }
  if (!transition.allowed || transition.blockers.length > 0) {
    const error = new Error('客户配置当前不满足切换条件')
    error.blockerCodes = transition.blockers
      .map((blocker) => String(blocker?.code || '').trim())
      .filter(Boolean)
      .sort()
    throw error
  }
  const revisionKey = action === 'rollback' ? 'target_revision' : 'revision'
  return {
    transition,
    attempts,
    mutationPayload: buildCustomerConfigMutationPayload(action, {
      customer_key: identity.customerKey,
      [revisionKey]: identity.revision,
      expected_config_hash: identity.configHash,
      expected_product_version: identity.productVersion,
      expected_active_revision: transition.observed_active_revision,
    }),
  }
}

export function assertEffectiveCustomerConfigIdentity(
  session,
  manifest,
  validation
) {
  const identity = customerConfigIdentity(manifest, validation)
  if (
    session?.customer?.key !== identity.customerKey ||
    session?.configRevision !== identity.revision ||
    String(session?.configHash || '')
      .trim()
      .toLowerCase() !== identity.configHash ||
    Number(session?.configHashVersion) !== CUSTOMER_CONFIG_HASH_VERSION ||
    session?.source !== 'active_customer_config_revision'
  ) {
    throw new Error('有效配置读回与已校验的客户配置不一致')
  }
  return session
}
