const SHA_PATTERN = /^[0-9a-f]{40}$/u
const MIGRATION_PATTERN = /^20[0-9]{12}$/u
const HASH_PATTERN = /^[0-9a-f]{64}$/u
export const DEV_DELIVERY_OVERVIEW_TTL_MS = 120_000

export const DEV_ENVIRONMENT_EVIDENCE_STATUS = Object.freeze({
  success: Object.freeze({ label: '已读回', color: 'success' }),
  warning: Object.freeze({ label: '待对齐', color: 'warning' }),
  blocked: Object.freeze({ label: '已阻断', color: 'error' }),
  failed: Object.freeze({ label: '读取失败', color: 'error' }),
  not_proven: Object.freeze({ label: '未证明', color: 'default' }),
})

function safeText(value, fallback = '未证明') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function validTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function latestTimestamp(values) {
  const candidates = values.filter(validTimestamp)
  if (candidates.length === 0) return ''
  return candidates.sort(
    (left, right) => Date.parse(right) - Date.parse(left)
  )[0]
}

function currentOperation(summary, profileKey, predicate = () => true) {
  const repositoryCommit = summary?.repository?.commit
  if (!SHA_PATTERN.test(String(repositoryCommit || ''))) return null
  return (
    summary.operations?.find(
      (operation) =>
        operation.profileKey === profileKey &&
        operation.status === 'passed' &&
        operation.repository?.commit === repositoryCommit &&
        operation.repository?.dirty === false &&
        predicate(operation)
    ) || null
  )
}

function localEnvironmentCard(dataSummary, error) {
  const contract = dataSummary?.datasetContract
  const scenarioTarget = dataSummary?.target?.scenarioDemo
  const coreOperation = currentOperation(
    dataSummary,
    'core-demo',
    (operation) =>
      operation.readback?.core?.units === contract?.unitCount &&
      operation.readback?.core?.warehouses === contract?.warehouseCount
  )
  const scenarioOperation = currentOperation(
    dataSummary,
    'scenario-demo',
    (operation) =>
      operation.targetSummary?.targetKey === 'local-development' &&
      operation.readback?.dataVersion === contract?.dataVersion &&
      operation.readback?.runId === contract?.runId &&
      operation.readback?.targetFingerprint ===
        scenarioTarget?.targetFingerprint
  )
  const targetAvailable = scenarioTarget?.status === 'available'
  const datasetReadBack = Boolean(coreOperation && scenarioOperation)
  const status = error
    ? 'failed'
    : !dataSummary || !targetAvailable
      ? 'blocked'
      : datasetReadBack
        ? 'success'
        : 'not_proven'

  return {
    key: 'local-development',
    label: '本地开发',
    scope: '长期开发库',
    accent: 'local',
    status,
    releaseSha: safeText(dataSummary?.repository?.commit),
    databaseName: safeText(scenarioTarget?.databaseName),
    migrationVersion: safeText(scenarioTarget?.migrationVersion),
    customerConfigRevision: safeText(scenarioTarget?.customerConfigRevision),
    customerConfigProductVersion: safeText(
      scenarioTarget?.customerConfigProductVersion
    ),
    datasetVersion: safeText(contract?.dataVersion),
    datasetRunId: safeText(contract?.runId),
    semanticDigest: HASH_PATTERN.test(String(contract?.semanticDigest || ''))
      ? contract.semanticDigest
      : '未证明',
    datasetEvidence: datasetReadBack
      ? 'Core 与 Scenario 已按当前提交读回'
      : '当前提交的 Core / Scenario 持久读回未齐',
    health: targetAvailable ? '本地固定目标预检已读取' : '本地固定目标未通过',
    rollbackBoundary: '长期数据只向前补齐；通过正式生命周期退出',
    readbackAt: latestTimestamp([
      coreOperation?.updatedAt,
      scenarioOperation?.updatedAt,
      dataSummary?.generatedAt,
    ]),
    nextAction: error
      ? '重新读取本地数据证据'
      : datasetReadBack
        ? '保持固定编码；业务变化后生成新批次'
        : '先精确读回 Core，再补齐并读回 Scenario',
    error: safeText(error, ''),
  }
}

function deliveryTarget(summary, targetKey) {
  return (
    summary?.targets?.find((descriptor) => descriptor.key === targetKey)
      ?.preflight || (summary?.target?.target === targetKey ? summary.target : null)
  )
}

function latestOperation(summary, predicate) {
  return (
    [...(summary?.operations || [])]
      .filter(predicate)
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0)
      )[0] || null
  )
}

function customerTestCard(dataSummary, deliverySummary, error) {
  const target = deliveryTarget(deliverySummary, 'customer-test-133')
  const runtime = target?.remote?.runtime
  const rebuild = latestOperation(
    deliverySummary,
    (operation) =>
      operation.action === 'rebuild-database' &&
      operation.target === 'customer-test-133' &&
      operation.status === 'passed'
  )
  const latestGeneratedDataWrite = latestOperation(
    dataSummary,
    (operation) =>
      operation.profileKey === 'scenario-demo' &&
      operation.status === 'passed' &&
      operation.readback?.databaseName === runtime?.databaseName
  )
  const cleanBaseline = Boolean(
    rebuild &&
      (!latestGeneratedDataWrite ||
        Date.parse(rebuild.updatedAt) > Date.parse(latestGeneratedDataWrite.updatedAt))
  )
  const runtimeReady = Boolean(
    target?.status === 'passed' &&
      runtime?.serverHealth === 'passed' &&
      runtime?.serverReady === 'passed' &&
      runtime?.webHealth === 'passed' &&
      target?.remote?.publicEntry?.status === 'passed'
  )
  const status = error
    ? 'failed'
    : !target || target.status === 'blocked'
      ? 'blocked'
      : runtimeReady && cleanBaseline
        ? 'success'
        : runtimeReady
          ? 'not_proven'
          : 'warning'

  return {
    key: 'customer-test-133',
    label: 'test 甲方测试验收',
    scope: '每轮交付前恢复干净基线；由甲方录入真实测试数据',
    accent: 'test',
    status,
    releaseSha: safeText(runtime?.serverSha),
    databaseName: safeText(runtime?.databaseName),
    migrationVersion: safeText(runtime?.migrationVersion),
    customerConfigRevision: safeText(runtime?.activeCustomerConfig?.revision),
    customerConfigProductVersion: safeText(
      runtime?.activeCustomerConfig?.productVersion
    ),
    datasetVersion: cleanBaseline ? 'clean-baseline' : '未证明',
    datasetRunId: rebuild?.id ? rebuild.id.slice(0, 8) : '未证明',
    semanticDigest: '不适用',
    datasetEvidence: cleanBaseline
      ? '受控重建晚于该库最近一次模拟数据写入'
      : '干净业务数据基线与精确回滚点尚未共同证明',
    health: runtimeReady
      ? 'health / ready / 公网入口已读回'
      : 'health / ready / 公网入口未齐',
    rollbackBoundary: rebuild
      ? '数据库重建 operation 已通过；回滚只使用其绑定恢复点'
      : '清理前必须取得可恢复备份、恢复校验与精确回滚点',
    readbackAt: latestTimestamp([
      rebuild?.updatedAt,
      target?.generatedAt,
      deliverySummary?.generatedAt,
    ]),
    nextAction: error
      ? '重新读取 test 目标证据'
      : !runtimeReady
        ? '先完成 test 运行态与公网读回'
        : cleanBaseline
          ? '保留干净基线，等待甲方录入真实测试数据'
          : '先备份并恢复校验，再走受控数据库重建',
    error: safeText(error, ''),
  }
}

function demoProjectCard(dataSummary, deliverySummary, error) {
  const contract = dataSummary?.datasetContract
  const expected = contract?.customerTrial133
  const target = deliveryTarget(deliverySummary, 'demo-133')
  const runtime = target?.remote?.runtime
  const backup = target?.remote?.backup
  const releaseAligned =
    SHA_PATTERN.test(String(dataSummary?.repository?.commit || '')) &&
    runtime?.serverSha === dataSummary.repository.commit &&
    runtime?.webSha === dataSummary.repository.commit
  const migrationAligned =
    MIGRATION_PATTERN.test(String(runtime?.migrationVersion || '')) &&
    MIGRATION_PATTERN.test(String(expected?.minimumMigration || '')) &&
    runtime.migrationVersion >= expected.minimumMigration
  const configAligned =
    runtime?.activeCustomerConfig?.revision === expected?.configRevision &&
    runtime?.activeCustomerConfig?.productVersion ===
      expected?.configProductVersion &&
    runtime?.activeCustomerConfig?.datasetVersion === contract?.dataVersion
  const healthReady =
    target?.status === 'passed' &&
    runtime?.serverHealth === 'passed' &&
    runtime?.serverReady === 'passed' &&
    runtime?.webHealth === 'passed' &&
    target?.remote?.publicEntry?.status === 'passed'
  const trialOperation = currentOperation(
    dataSummary,
    'scenario-demo',
    (operation) =>
      operation.targetSummary?.targetKey === 'customer-trial-133' &&
      operation.readback?.targetKey === 'customer-trial-133' &&
      operation.readback?.databaseName === runtime?.databaseName &&
      operation.readback?.release === runtime?.serverSha &&
      operation.readback?.migrationVersion === runtime?.migrationVersion &&
      operation.readback?.customerConfigRevision ===
        runtime?.activeCustomerConfig?.revision &&
      operation.readback?.dataVersion === contract?.dataVersion &&
      operation.readback?.runId === contract?.runId &&
      operation.readback?.semanticDigest === contract?.semanticDigest
  )
  const datasetReadBack = Boolean(trialOperation)
  const dataBackup = trialOperation?.readback?.backupReceipt
  const runtimeAligned =
    releaseAligned &&
    migrationAligned &&
    configAligned &&
    healthReady
  const status = error
    ? 'failed'
    : !target || target.status === 'blocked'
      ? 'blocked'
      : runtimeAligned && datasetReadBack
        ? 'success'
        : runtimeAligned
          ? 'not_proven'
          : 'warning'

  let nextAction = '先权威读回 demo 固定目标'
  if (error) {
    nextAction = '重新读取 demo 目标证据，不自动创建操作'
  } else if (!releaseAligned) {
    nextAction = '先完成当前 Exact-SHA 的发布授权与目标读回'
  } else if (!migrationAligned) {
    nextAction = '先对齐登记数据库与 migration'
  } else if (!configAligned) {
    nextAction = '先激活当前 V8 客户配置并读回'
  } else if (!healthReady) {
    nextAction = '先修复 health / ready / 公网入口读回'
  } else if (!datasetReadBack) {
    nextAction = '在 demo 目标卡内二次确认写入，再完成独立读回'
  }

  return {
    key: 'demo-133',
    label: 'demo 项目演练造数',
    scope: '保留 seed / fixture / 模拟业务数据',
    accent: 'demo',
    status,
    releaseSha: safeText(runtime?.serverSha),
    databaseName: safeText(runtime?.databaseName),
    migrationVersion: safeText(runtime?.migrationVersion),
    customerConfigRevision: safeText(runtime?.activeCustomerConfig?.revision),
    customerConfigProductVersion: safeText(
      runtime?.activeCustomerConfig?.productVersion
    ),
    datasetVersion: safeText(contract?.dataVersion),
    datasetRunId: safeText(contract?.runId),
    semanticDigest: HASH_PATTERN.test(String(contract?.semanticDigest || ''))
      ? contract.semanticDigest
      : '未证明',
    datasetEvidence: datasetReadBack
      ? 'demo 项目演练造数已独立持久读回'
      : 'demo 项目演练造数与附件回执未证明',
    health: healthReady
      ? 'health / ready / 公网入口已读回'
      : 'health / ready / 公网入口未齐',
    rollbackBoundary:
      dataBackup?.status === 'passed' &&
      HASH_PATTERN.test(String(dataBackup?.sha256 || '')) &&
      Number.isSafeInteger(dataBackup?.sizeBytes) &&
      dataBackup.sizeBytes > 0
        ? `本次数据写入绑定新回滚点 ${dataBackup.backupAlias}`
        : backup?.tooling === 'passed'
          ? '备份工具已证明；新造数前仍须建立并读回新回滚点'
          : '新造数前必须建立并读回备份 / 回滚点',
    readbackAt: latestTimestamp([
      trialOperation?.updatedAt,
      target?.generatedAt,
      deliverySummary?.generatedAt,
    ]),
    nextAction,
    error: safeText(error, ''),
  }
}

function isolatedAcceptanceCard(dataSummary, error) {
  const contract = dataSummary?.datasetContract
  const repository = dataSummary?.repository
  const operation = currentOperation(
    dataSummary,
    'full-acceptance',
    (candidate) =>
      candidate.readback?.dataVersion === contract?.dataVersion &&
      candidate.readback?.reportStatus === 'passed' &&
      candidate.readback?.cleanupComplete === true &&
      candidate.readback?.residualDatabaseCount === 0 &&
      candidate.readback?.chainDataDigest ===
        dataSummary?.acceptancePlan?.chainDataDigest &&
      candidate.readback?.chainVerificationDigest ===
        dataSummary?.acceptancePlan?.chainVerificationDigest
  )
  const clean = repository?.dirty === false
  const status = error
    ? 'failed'
    : operation && clean
      ? 'success'
      : repository
        ? 'not_proven'
        : 'blocked'

  return {
    key: 'isolated-acceptance',
    label: '隔离完整验收',
    scope: '新批次可丢弃库',
    accent: 'isolated',
    status,
    releaseSha: safeText(operation?.repository?.commit || repository?.commit),
    databaseName: 'isolated-per-run',
    migrationVersion: safeText(
      dataSummary?.target?.fullAcceptance?.migrationVersion
    ),
    customerConfigRevision: '按新批次固定配置',
    customerConfigProductVersion: '按新批次固定产品版本',
    datasetVersion: safeText(contract?.dataVersion),
    datasetRunId: operation?.runId || '待生成新批次',
    semanticDigest: HASH_PATTERN.test(String(contract?.semanticDigest || ''))
      ? contract.semanticDigest
      : '未证明',
    datasetEvidence: operation
      ? '当前提交完整验收通过，已自动清理零残留'
      : '当前提交尚无完整验收与零残留回执',
    health: clean ? '当前仓库已干净' : '必须绑定 clean exact commit',
    rollbackBoundary: '成功或失败都自动清理，不作长期数据',
    readbackAt: operation?.updatedAt || '',
    nextAction:
      operation && clean
        ? '保留回执，不保留隔离库'
        : '从 clean exact commit 创建新批次完整执行',
    error: safeText(error, ''),
  }
}

export function buildDevEnvironmentEvidence({
  dataSummary = null,
  deliverySummary = null,
  dataError = '',
  deliveryError = '',
} = {}) {
  return Object.freeze({
    controller: '本地 DEV-only',
    generatedAt: latestTimestamp([
      dataSummary?.generatedAt,
      deliverySummary?.generatedAt,
    ]),
    cards: Object.freeze([
      Object.freeze(localEnvironmentCard(dataSummary, dataError)),
      Object.freeze(
        demoProjectCard(dataSummary, deliverySummary, deliveryError)
      ),
      Object.freeze(
        customerTestCard(dataSummary, deliverySummary, deliveryError)
      ),
      Object.freeze(isolatedAcceptanceCard(dataSummary, dataError)),
    ]),
  })
}

export function devEnvironmentEvidenceStatusPresentation(status) {
  return (
    DEV_ENVIRONMENT_EVIDENCE_STATUS[status] ||
    DEV_ENVIRONMENT_EVIDENCE_STATUS.not_proven
  )
}

const OPERATION_BLOCKER_PRIORITY = Object.freeze({
  not_proven: 5,
  failed: 4,
  blocked: 3,
  launching: 2,
  running: 2,
  waiting: 2,
  queued: 2,
  ready: 1,
})

function deliveryOperationLabel(operation) {
  const action = {
    release: '不可变版本发布',
    promote: '显式版本提升',
    rollback: '目标回滚',
    'rebuild-database': '受控数据库重建',
  }[operation?.action]
  return action ? `${action} · ${safeText(operation.target)}` : '未知工作台操作'
}

export function buildDevDeliveryOperationOverview({
  summary = null,
  error = '',
  loading = false,
  now = Date.now(),
} = {}) {
  if (!summary && loading) {
    return Object.freeze({ state: 'loading' })
  }
  if (!summary && error) {
    return Object.freeze({
      state: 'failure',
      recentOperation: '操作记录暂不可读',
      strongestBlocker: '工作台 operation store 读取失败',
      lastCheckedAt: '',
    })
  }
  const operations = [...(summary?.operations || [])].sort(
    (left, right) =>
      Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0)
  )
  const recent = operations[0] || null
  const blocking = [...operations]
    .filter((operation) => OPERATION_BLOCKER_PRIORITY[operation.status])
    .sort(
      (left, right) =>
        OPERATION_BLOCKER_PRIORITY[right.status] -
          OPERATION_BLOCKER_PRIORITY[left.status] ||
        Date.parse(right.updatedAt || 0) - Date.parse(left.updatedAt || 0)
    )[0]
  const blockingIssue = blocking?.issues?.find(
    (candidate) => candidate.level === 'error'
  )
  const summaryIssue = summary?.issues?.find(
    (candidate) => candidate.level === 'error'
  )
  const generatedAt = validTimestamp(summary?.generatedAt)
    ? summary.generatedAt
    : ''
  const stale = Boolean(
    generatedAt && now - Date.parse(generatedAt) > DEV_DELIVERY_OVERVIEW_TTL_MS
  )
  const state =
    error && summary
      ? 'stale'
      : stale
        ? 'stale'
        : operations.length > 0
          ? 'normal'
          : 'empty'
  return Object.freeze({
    state,
    recentOperation: recent
      ? `${deliveryOperationLabel(recent)} · ${safeText(recent.status)}`
      : '尚无工作台发起的 release / promotion / rebuild / rollback',
    recentOperationAt: recent?.updatedAt || '',
    strongestBlocker: error
      ? '最新读回失败，当前仅保留上次记录'
      : blockingIssue?.message ||
        summaryIssue?.message ||
        (blocking
          ? `${deliveryOperationLabel(blocking)} · ${safeText(blocking.status)}`
          : '当前无未结束或失败的工作台操作'),
    lastCheckedAt: generatedAt,
  })
}
