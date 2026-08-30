import { DEV_VERSION_CENTER_ROUTE } from './devRoutes.mjs'

export const DEV_DRILL_RECOVERY_SOURCE_PATH =
  'docs/engineering/研发效能工作台与CI-CD设计.md'

export const DEV_DRILL_PRIORITIES = Object.freeze({
  p0: 'P0',
  p1: 'P1',
  p2: 'P2',
})

export const DEV_DRILL_RECOVERY_CATALOG = Object.freeze([
  Object.freeze({
    key: 'target-readiness',
    priority: DEV_DRILL_PRIORITIES.p0,
    title: '目标身份、容量与健康核验',
    objective: '先证明登记目标、运行版本、公网入口和基础工具仍然一致。',
    cadence: '每次发布前自动执行；每月再人工抽查一次',
    trigger: '服务器迁移、网络、证书、Compose 或 Provider 变化后立即执行',
    risk: 'read_only',
    surface: 'refresh',
    evidence: Object.freeze([
      '目标身份与可用空间',
      'Server / Web exact SHA',
      'health / ready 与公网入口',
      '备份、归档与 migration 锁工具状态',
    ]),
    boundary: '只读；不创建备份、不切换版本、不修改目标。',
  }),
  Object.freeze({
    key: 'same-sha-idempotency',
    priority: DEV_DRILL_PRIORITIES.p0,
    title: '相同 SHA 幂等与缓存核验',
    objective: '证明重复请求不会重建、重传或产生第二次目标写入。',
    cadence: '发布链路或缓存合同变化后；稳定期每月一次',
    trigger:
      '制品缓存、传输、Docker load 或显式版本提升（Explicit Promotion）脚本变化',
    risk: 'controlled_target',
    surface: 'version_center',
    evidence: Object.freeze([
      'exact SHA 已是当前版本',
      'no-target-write 幂等回执',
      '缓存命中依据与避免传输字节',
      '仍执行的 health / ready / 公网读回',
    ]),
    boundary:
      '只选择当前已运行的 exact SHA；身份不一致时不得把普通部署冒充幂等演练。',
  }),
  Object.freeze({
    key: 'rollback-forward',
    priority: DEV_DRILL_PRIORITIES.p0,
    title: '兼容回滚与再前滚',
    objective: '证明规定回滚版本可恢复，并能回到最终最新版本。',
    cadence: '正式生产启用前、migration 合同变化后；稳定期每季度一次',
    trigger: '回滚资格、缓存、Compose、公网切换或 migration 规则变化',
    risk: 'controlled_target',
    surface: 'version_center',
    evidence: Object.freeze([
      '回滚 manifest 与 digest',
      'migration sequence 兼容资格',
      '缓存命中与未重复传输',
      '回滚后及再前滚后的 health / ready / 公网 SHA',
    ]),
    boundary:
      '只允许已登记且兼容的不可变版本；不自动 down migration，不覆盖新数据。',
  }),
  Object.freeze({
    key: 'backup-restore-isolated',
    priority: DEV_DRILL_PRIORITIES.p1,
    title: '备份恢复到隔离数据库',
    objective: '证明备份可读取、可恢复，且不会触碰当前、共享或生产数据库。',
    cadence: '数据库或备份工具升级后；稳定期每月一次',
    trigger: 'PostgreSQL、备份格式、存储路径或恢复脚本变化',
    risk: 'isolated_write',
    surface: 'runbook_only',
    evidence: Object.freeze([
      '备份 SHA-256 与大小',
      '带 operation 标识和 TTL 的隔离库',
      'migration / schema 读回',
      '演练后 inventory 为零',
    ]),
    boundary:
      '必须使用 disposable database lifecycle；不得以共享库或正式库代替演练库。',
  }),
  Object.freeze({
    key: 'target-cutover',
    priority: DEV_DRILL_PRIORITIES.p1,
    title: '新服务器或正式环境切换',
    objective: '在迁移服务器或新增正式环境前，证明新目标合同和切换路径。',
    cadence: '仅在目标、域名、证书、网络或正式环境发生变化时',
    trigger: '服务器迁移、新增生产环境、域名或公网入口调整',
    risk: 'controlled_target',
    surface: 'not_available',
    evidence: Object.freeze([
      '新目标已进入受控 registry',
      '独立 preflight 与不可变制品读回',
      '旧目标保留及回切计划',
      'DNS / Provider / 浏览器资源一致性',
    ]),
    boundary:
      'demo 与 test 已登记为独立目标；不得共享凭据、数据库、持久目录，也不能在页面临时输入主机、路径和命令。',
  }),
  Object.freeze({
    key: 'fault-injection',
    priority: DEV_DRILL_PRIORITIES.p2,
    title: '故障注入与恢复',
    objective: '验证服务、网络或依赖故障发生时的告警、降级和恢复证据。',
    cadence: '具备独立隔离环境和故障注入执行器后，每季度一次',
    trigger: '新增关键依赖、超时重试、告警或恢复策略变化',
    risk: 'interrupting',
    surface: 'not_available',
    evidence: Object.freeze([
      '故障类型与影响范围',
      '触发、发现、恢复时间',
      '告警与用户可见行为',
      '恢复后数据、health / ready 与残留读回',
    ]),
    boundary:
      '尚未开放；只允许未来在隔离目标使用固定故障目录，禁止对当前试用或正式环境临时执行命令。',
  }),
])

const RISK_PRESENTATION = Object.freeze({
  read_only: Object.freeze({ label: '只读核验', color: 'blue' }),
  isolated_write: Object.freeze({ label: '隔离写入', color: 'gold' }),
  controlled_target: Object.freeze({ label: '受控目标操作', color: 'orange' }),
  interrupting: Object.freeze({ label: '中断性演练', color: 'red' }),
})

const STATUS_PRESENTATION = Object.freeze({
  current: Object.freeze({ label: '最近证据可用', color: 'success' }),
  available: Object.freeze({ label: '前置条件已具备', color: 'processing' }),
  guarded: Object.freeze({ label: '需按门禁准备', color: 'warning' }),
  blocked: Object.freeze({ label: '当前条件不足', color: 'error' }),
  planned: Object.freeze({ label: '尚未开放执行', color: 'default' }),
  unknown: Object.freeze({ label: '证据未取得', color: 'default' }),
})

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const TIMESTAMP_WITH_TIME_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
const BACKUP_RESTORE_CURRENT_WINDOW_MS = 35 * 24 * 60 * 60 * 1000
const BACKUP_RESTORE_CLOCK_SKEW_MS = 5 * 60 * 1000

function isExactSha(value) {
  return SHA_PATTERN.test(String(value || ''))
}

function targetRuntimeSha(summary) {
  const serverSha = summary?.target?.remote?.runtime?.serverSha
  const webSha = summary?.target?.remote?.runtime?.webSha
  return isExactSha(serverSha) && serverSha === webSha ? serverSha : ''
}

function targetOperations(summary) {
  const target = summary?.target?.target || summary?.boundaries?.target || ''
  const operations = Array.isArray(summary?.operations)
    ? summary.operations
    : []
  return operations.filter(
    (operation) =>
      ['promote', 'rollback'].includes(operation?.action) &&
      target !== '' &&
      operation.target === target
  )
}

function passedOperation(operation) {
  return operation?.status === 'passed' && operation?.terminal === true
}

function operationHasMessage(operation, expected) {
  return (operation?.events || []).some((event) => event?.message === expected)
}

function newestOperation(operations = [], predicate = () => true) {
  return [...operations]
    .filter(predicate)
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    )[0]
}

function backupRestoreEvidenceState(summary, nowMs) {
  const receipt = summary?.recovery?.backupRestore
  if (!receipt) {
    return {
      status: 'guarded',
      at: '',
      operationId: '',
      note: '尚无通过校验的隔离恢复回执',
    }
  }
  const verifiedAt = String(receipt.verifiedAt || '')
  const verifiedAtMs = Date.parse(verifiedAt)
  const validContract =
    receipt.schemaVersion === 'plush.backup-restore-evidence/v1' &&
    receipt.status === 'passed' &&
    isExactSha(receipt.releaseVersion) &&
    typeof receipt.target === 'string' &&
    typeof receipt.customer === 'string' &&
    typeof receipt.environment === 'string' &&
    typeof receipt.backupId === 'string' &&
    receipt.backupId !== '' &&
    TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(verifiedAt) &&
    Number.isFinite(verifiedAtMs) &&
    /^[0-9a-f]{64}$/u.test(String(receipt.reportSha256 || '')) &&
    /^[0-9a-f]{64}$/u.test(String(receipt.backupSha256 || '')) &&
    Number.isSafeInteger(receipt.backupSizeBytes) &&
    receipt.backupSizeBytes > 0 &&
    receipt.pendingFiles === 0 &&
    receipt.disposableCleanup === 'passed'
  if (!validContract) {
    return {
      status: 'guarded',
      at: '',
      operationId: '',
      note: '隔离恢复回执未通过页面合同校验',
    }
  }
  const target = resolveDevRecoveryTarget(summary)
  if (
    receipt.target !== target.key ||
    receipt.customer !== target.customer ||
    receipt.environment !== target.trialTarget
  ) {
    return {
      status: 'guarded',
      at: verifiedAt,
      operationId: receipt.backupId,
      note: '隔离恢复回执属于其他目标、甲方或环境',
    }
  }
  const currentSha = targetRuntimeSha(summary)
  if (!currentSha || receipt.releaseVersion !== currentSha) {
    return {
      status: 'guarded',
      at: verifiedAt,
      operationId: receipt.backupId,
      note: '隔离恢复回执属于其他运行版本',
    }
  }
  if (verifiedAtMs > nowMs + BACKUP_RESTORE_CLOCK_SKEW_MS) {
    return {
      status: 'guarded',
      at: verifiedAt,
      operationId: receipt.backupId,
      note: '隔离恢复回执时间晚于当前核对时间',
    }
  }
  if (nowMs - verifiedAtMs > BACKUP_RESTORE_CURRENT_WINDOW_MS) {
    return {
      status: 'guarded',
      at: verifiedAt,
      operationId: receipt.backupId,
      note: '隔离恢复回执已超过每月复核窗口',
    }
  }
  if (summary?.target?.status !== 'passed') {
    return {
      status: 'guarded',
      at: verifiedAt,
      operationId: receipt.backupId,
      note: '演练回执有效，但当前目标预检未通过',
    }
  }
  return {
    status: 'current',
    at: verifiedAt,
    operationId: receipt.backupId,
    note: `隔离恢复回执已通过 · 版本 ${currentSha.slice(0, 12)}`,
  }
}

export function devDrillRiskPresentation(risk) {
  return RISK_PRESENTATION[risk] || RISK_PRESENTATION.interrupting
}

export function devDrillStatusPresentation(status) {
  return STATUS_PRESENTATION[status] || STATUS_PRESENTATION.unknown
}

export function resolveDevRecoveryTarget(summary = {}) {
  const target = summary.target || {}
  const key = target.target || summary.boundaries?.target || '未登记目标'
  const purpose = target.purpose || 'unknown'
  const label =
    purpose === 'project-demo-simulated'
      ? '项目方演练造数环境'
      : purpose === 'customer-clean-acceptance'
        ? '甲方测试验收环境'
      : purpose === 'production'
        ? '正式生产环境'
        : '受控交付环境'
  return Object.freeze({
    key,
    label,
    purpose,
    customer: target.customer || '',
    trialTarget: target.trialTarget || '',
  })
}

function drillStatus(drill, summary, nowMs) {
  const currentSha = targetRuntimeSha(summary)
  const targetPassed = summary?.target?.status === 'passed'
  const versions = Array.isArray(summary?.versions) ? summary.versions : []
  const operations = targetOperations(summary)
  const currentVersion = versions.find(
    (version) =>
      version.gitSha === currentSha &&
      version.status === 'published' &&
      version.completeAssets === true
  )

  if (drill.key === 'target-readiness') {
    if (!summary?.target) return 'unknown'
    return targetPassed ? 'current' : 'blocked'
  }
  if (drill.key === 'same-sha-idempotency') {
    const operation = newestOperation(
      operations,
      (item) =>
        passedOperation(item) &&
        item.action === 'promote' &&
        item.gitSha === currentSha &&
        operationHasMessage(
          item,
          'requested exact SHA is already current and healthy'
        )
    )
    if (operation) return 'current'
    return targetPassed && currentVersion ? 'available' : 'blocked'
  }
  if (drill.key === 'rollback-forward') {
    const rollback = newestOperation(
      operations,
      (item) => passedOperation(item) && item.action === 'rollback'
    )
    const rollbackCompletedAt = rollback
      ? Date.parse(rollback.updatedAt)
      : Number.POSITIVE_INFINITY
    const forward = newestOperation(
      operations,
      (item) =>
        passedOperation(item) &&
        item.action === 'promote' &&
        item.gitSha === currentSha &&
        Date.parse(item.updatedAt) > rollbackCompletedAt
    )
    if (rollback && forward) return 'current'
    return targetPassed &&
      versions.filter((version) => version.completeAssets).length > 1
      ? 'guarded'
      : 'blocked'
  }
  if (drill.key === 'backup-restore-isolated') {
    return backupRestoreEvidenceState(summary, nowMs).status
  }
  return 'planned'
}

function drillEvidence(drill, summary, status, nowMs) {
  const operations = targetOperations(summary)
  const currentSha = targetRuntimeSha(summary)
  if (drill.key === 'target-readiness') {
    return {
      at: summary?.target?.generatedAt || summary?.generatedAt || '',
      operationId: '',
      note:
        status === 'current'
          ? '固定目标只读预检通过'
          : '先刷新并处理目标预检 blocker',
    }
  }
  if (drill.key === 'same-sha-idempotency') {
    const operation = newestOperation(
      operations,
      (item) =>
        passedOperation(item) &&
        item.action === 'promote' &&
        item.gitSha === currentSha &&
        operationHasMessage(
          item,
          'requested exact SHA is already current and healthy'
        )
    )
    return {
      at: operation?.updatedAt || '',
      operationId: operation?.id || '',
      note: operation
        ? '相同 SHA no-target-write 回执'
        : '尚无相同 SHA 幂等回执',
    }
  }
  if (drill.key === 'rollback-forward') {
    const operation = newestOperation(
      operations,
      (item) => passedOperation(item) && item.action === 'rollback'
    )
    return {
      at: operation?.updatedAt || '',
      operationId: operation?.id || '',
      note:
        status === 'current'
          ? '回滚后已再前滚到当前 exact SHA'
          : operation
            ? '已有回滚证据，但尚未证明已再前滚到当前版本'
            : '尚无完整回滚与再前滚证据',
    }
  }
  if (drill.key === 'backup-restore-isolated') {
    const evidence = backupRestoreEvidenceState(summary, nowMs)
    return {
      at: evidence.at,
      operationId: evidence.operationId,
      note: evidence.note,
    }
  }
  return { at: '', operationId: '', note: '当前没有可冒充演练结果的正式回执' }
}

export function buildDevRecoveryOverview(
  summary = {},
  { nowMs = Date.now() } = {}
) {
  const drills = DEV_DRILL_RECOVERY_CATALOG.map((drill) => {
    const status = drillStatus(drill, summary, nowMs)
    return Object.freeze({
      ...drill,
      status,
      statusPresentation: devDrillStatusPresentation(status),
      riskPresentation: devDrillRiskPresentation(drill.risk),
      evidenceState: Object.freeze(
        drillEvidence(drill, summary, status, nowMs)
      ),
      action:
        drill.surface === 'refresh'
          ? Object.freeze({ type: 'refresh', label: '刷新只读核验' })
          : drill.surface === 'version_center'
            ? Object.freeze({
                type: 'route',
                label: '到版本中心按门禁操作',
                route: DEV_VERSION_CENTER_ROUTE,
              })
            : Object.freeze({ type: 'disabled', label: '暂不在页面执行' }),
    })
  })
  const next =
    drills.find(
      (drill) => drill.priority === 'P0' && drill.status !== 'current'
    ) ||
    drills.find(
      (drill) => drill.priority === 'P1' && drill.status !== 'current'
    ) ||
    drills.at(-1)
  const operations = targetOperations(summary)
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    )
    .slice(0, 6)
  return Object.freeze({
    target: resolveDevRecoveryTarget(summary),
    targetStatus: summary?.target?.status || 'unknown',
    currentSha: targetRuntimeSha(summary),
    publicSha: isExactSha(summary?.target?.remote?.publicEntry?.gitSha)
      ? summary.target.remote.publicEntry.gitSha
      : '',
    publicEntry: summary?.target?.remote?.publicEntry || null,
    next,
    drills: Object.freeze(drills),
    operations: Object.freeze(operations),
  })
}

export function validateDevDrillRecoveryCatalog(
  catalog = DEV_DRILL_RECOVERY_CATALOG
) {
  if (!Array.isArray(catalog) || catalog.length !== 6) {
    throw new Error('演练目录必须保持六项受控能力')
  }
  const keys = new Set()
  const priorityOrder = ['P0', 'P1', 'P2']
  let previousPriority = -1
  for (const drill of catalog) {
    const priority = priorityOrder.indexOf(drill?.priority)
    if (
      !drill ||
      typeof drill.key !== 'string' ||
      keys.has(drill.key) ||
      priority === -1 ||
      priority < previousPriority ||
      !RISK_PRESENTATION[drill.risk] ||
      !['refresh', 'version_center', 'runbook_only', 'not_available'].includes(
        drill.surface
      ) ||
      !Array.isArray(drill.evidence) ||
      drill.evidence.length < 3
    ) {
      throw new Error('演练目录合同无效')
    }
    keys.add(drill.key)
    previousPriority = priority
  }
  return catalog
}
