import { createDevDeliveryClient, DEV_DELIVERY_TARGETS } from './devDelivery.mjs'
import { createDevQualityGateClient } from './devQualityGates.mjs'

const SHA = /^[0-9a-f]{40}$/u
const HASH = /^[0-9a-f]{64}$/u

export function selectTargetVerificationOperation(summary, target) {
  const runtime = target?.preflight?.remote?.runtime
  if (!SHA.test(runtime?.serverSha || '') || runtime.serverSha !== runtime.webSha) return null
  return [...(summary?.operations || [])]
    .filter((item) => item.target === target.key && item.gitSha === runtime.serverSha && ['promote', 'rollback'].includes(item.action))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null
}

export function buildDevVerificationEvidence({ quality, delivery, operations = {}, errors = [] } = {}) {
  const repository = delivery?.repository || quality?.repository || null
  const sameRepository = SHA.test(repository?.commit || '') && repository.dirty === false &&
    quality?.repository?.commit === repository.commit && quality.repository.dirty === false &&
    quality.repository.fingerprint === repository.fingerprint
  const server = quality?.serverEvidence
  const ciPassed = sameRepository && server?.status === 'passed' && server.current === true &&
    server.coversWorkingTree === true && server.jobs?.length > 0 &&
    server.jobs.every((job) => job.status === 'completed' && job.conclusion === 'success')
  const targets = DEV_DELIVERY_TARGETS.map((definition) => {
    const target = delivery?.targets?.find((item) => item.key === definition.key)
    const runtime = target?.preflight?.remote?.runtime
    const selected = selectTargetVerificationOperation(delivery, target)
    const operation = selected && operations[selected.id]?.id === selected.id ? operations[selected.id] : null
    const evidence = operation?.evidence
    const current = SHA.test(repository?.commit || '') && repository.dirty === false &&
      runtime?.serverSha === repository.commit && runtime?.webSha === repository.commit
    const bound = current && operation?.target === definition.key && operation.gitSha === repository.commit &&
      evidence?.status === 'passed' && operation.status === 'passed' && HASH.test(evidence.receiptSha256 || '')
    const checks = evidence?.checks || {}
    const passedStage = (id) => operation?.stages?.some((stage) => stage.id === id && stage.status === 'passed')
    const verification = {
      tests: bound && ['releaseIdentity', 'health', 'ready', 'basicSmoke', 'publicEntry'].every((key) => checks[key] === true),
      migration: bound && /^\d{14}$/u.test(evidence.migration?.readback || '') &&
        evidence.migration.required === evidence.migration.readback && evidence.migration.readback === runtime?.migrationVersion &&
        evidence.migration.readbackStatus === 'passed',
      recovery: bound && checks.backupRestore !== false && evidence.backup?.restoreChecked === true &&
        HASH.test(evidence.backup.sha256 || '') && evidence.backup.sizeBytes > 0 && passedStage('fresh_backup_and_restore_check'),
      deployment: bound && target?.preflight?.status === 'passed' && passedStage('runtime_verified') &&
        operation?.gitlabRecord?.status === 'recorded',
    }
    return {
      ...definition,
      current,
      runtimeSha: runtime?.serverSha || '',
      readAt: delivery?.generatedAt,
      operation,
      selectedOperationId: selected?.id || '',
      verification,
      passed: Object.values(verification).every(Boolean),
      unavailable: !target || !operation,
      preflightStatus: target?.preflight?.status || 'unavailable',
    }
  })
  return {
    repository,
    readAt: delivery?.generatedAt || quality?.generatedAt,
    errors,
    ci: { passed: Boolean(ciPassed), evidence: server || null },
    targets,
    passed: Boolean(ciPassed) && targets.every((target) => target.passed),
  }
}

export async function readDevVerificationEvidence({ signal,
  deliveryClient = createDevDeliveryClient(), qualityClient = createDevQualityGateClient(),
} = {}) {
  const [deliveryResult, qualityResult] = await Promise.allSettled([
    deliveryClient.summary({ signal }), qualityClient.summary({ signal }),
  ])
  if (signal?.aborted) throw signal.reason
  const delivery = deliveryResult.status === 'fulfilled' ? deliveryResult.value : null
  const quality = qualityResult.status === 'fulfilled' ? qualityResult.value : null
  const errors = []
  if (!delivery) errors.push('目标服务器状态读取失败，请重新读取。')
  if (!quality) errors.push('GitLab CI 状态读取失败，请重新读取。')
  const histories = await Promise.allSettled((delivery?.targets || []).map(async (target) => {
    const sha = target.preflight?.remote?.runtime?.serverSha
    if (!SHA.test(sha || '')) return null
    return deliveryClient.history({ target: target.key, keyword: sha, pageSize: 10, signal })
  }))
  if (signal?.aborted) throw signal.reason
  // Query each target's indexed history instead of relying on the summary's
  // bounded recent window, which can omit an infrequently deployed environment.
  const candidates = histories.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value?.operations || []
    errors.push(`${delivery.targets[index].key} 的交付历史读取失败，不能选择当前版本回执。`)
    return []
  })
  const scopedDelivery = delivery ? { ...delivery, operations: candidates } : null
  const selected = (scopedDelivery?.targets || []).map((target) => selectTargetVerificationOperation(scopedDelivery, target)).filter(Boolean)
  const details = await Promise.allSettled(selected.map((item) => deliveryClient.operation(item.id, { target: item.target, signal })))
  if (signal?.aborted) throw signal.reason
  const operations = {}
  details.forEach((result, index) => {
    if (result.status === 'fulfilled') operations[selected[index].id] = result.value
    else errors.push(`${selected[index].target} 的执行回执读取失败，实时运行状态不能替代执行证据。`)
  })
  return buildDevVerificationEvidence({ quality, delivery: scopedDelivery, operations, errors })
}
