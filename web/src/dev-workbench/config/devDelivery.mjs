import { DEV_VERSION_CENTER_ROUTE } from './devRoutes.mjs'

export { DEV_VERSION_CENTER_ROUTE }

export const DEV_DELIVERY_SESSION_API_PATH = '/__dev/api/delivery/session'
export const DEV_DELIVERY_SUMMARY_API_PATH = '/__dev/api/delivery/summary'
export const DEV_DELIVERY_ACTION_API_PATH = '/__dev/api/delivery/actions'
export const DEV_DELIVERY_OPERATION_API_PREFIX =
  '/__dev/api/delivery/operations'
export const DEV_DELIVERY_SOURCE_PATH =
  'docs/engineering/研发效能工作台与CI-CD设计.md'
export const DEV_VERSION_CENTER_VIEW_QUERY_KEY = 'view'
export const DEV_VERSION_CENTER_VIEW_VERSIONS = 'versions'
export const DEV_VERSION_CENTER_VIEW_PIPELINE = 'pipeline'
export const DEV_VERSION_CENTER_VIEW_HISTORY = 'history'
export const DEV_VERSION_CENTER_VERSION_PAGE_SIZE = 6
export const DEV_VERSION_CENTER_HISTORY_PAGE_SIZE = 10

const DEV_VERSION_CENTER_VIEW_VALUES = new Set([
  DEV_VERSION_CENTER_VIEW_VERSIONS,
  DEV_VERSION_CENTER_VIEW_PIPELINE,
  DEV_VERSION_CENTER_VIEW_HISTORY,
])

const SHA_PATTERN = /^[0-9a-f]{40}$/u
const VERSION_PATTERN = /^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u
const TIMESTAMP_WITH_TIME_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
const OPERATION_STATUSES = new Set([
  'queued',
  'running',
  'ready',
  'launching',
  'waiting',
  'passed',
  'failed',
  'blocked',
  'not_proven',
])
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const PIPELINE_STATUSES = new Set([
  'queued',
  'in_progress',
  'completed',
  'waiting',
  'requested',
  'pending',
])
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const PIPELINE_LABELS = Object.freeze({
  ci: '持续集成流水线',
  release: '正式发布流水线',
  'Trusted range and affected plan': '可信提交范围与影响计划',
  'Repository quality': '仓库质量检查',
  'CI Gate': '持续集成总门禁',
  'Release trust and strict terminal': '发布可信校验与严格回执',
  'Exact-SHA strict quality': 'Exact-SHA 严格质量检查',
  'Publish immutable artifact set': '发布不可变制品集',
  'Check out complete comparison history without credentials':
    '无凭据检出完整对比历史',
  'Restore the checksum-verified history scanner archive':
    '恢复已校验和的历史扫描器',
  'Resolve range and scan candidate history before repository scripts':
    '解析提交范围并先扫描候选历史',
  'Set up repository Node.js after the trusted scan':
    '可信扫描后准备仓库 Node.js',
  'Build the executable CI plan': '生成可执行 CI 计划',
  'Persist the CI plan': '保存 CI 计划',
  'Record superseded same-ref CI identity': '记录同分支被替代的 CI 身份',
  'Persist the CI supersession audit': '保存 CI 替代关系审计回执',
  'Check out the candidate without credentials': '无凭据检出候选提交',
  'Set up Node.js': '准备 Node.js 工具链',
  'Set up Go when selected': '按需准备 Go 工具链',
  'Set up pinned Atlas when selected': '按需准备固定版本 Atlas',
  'Restore pinned full-gate Go tools': '恢复固定版本的完整门禁 Go 工具',
  'Restore the checksum-verified full-gate scanner archive':
    '恢复已校验和的完整门禁扫描器',
  'Restore the locked pnpm store': '恢复锁文件对应的 pnpm 缓存',
  'Restore the pinned Playwright Chromium bundle':
    '恢复固定版本的 Playwright Chromium',
  'Start PostgreSQL only when selected': '按需启动 PostgreSQL',
  'Install full-gate system and Go tools': '安装完整门禁系统与 Go 工具',
  'Install locked Web dependencies when selected': '按需安装锁定的 Web 依赖',
  'Install and verify Chromium only for full':
    '仅在完整门禁安装并校验 Chromium',
  'Prove Ent and Atlas generation when selected':
    '按需确认 Ent 与 Atlas 生成结果',
  'Run the selected repository quality gate': '执行选定的仓库质量门禁',
  'Validate committed source archive for full': '完整门禁校验已提交源码包',
  'Persist full quality receipt': '保存完整质量回执',
  'Persist the default-branch exact-SHA strict receipt':
    '保存默认分支 Exact-SHA 严格回执',
  'Remove selected PostgreSQL runtime': '清理按需启动的 PostgreSQL',
  'Require planning and selected quality to complete':
    '确认计划与所选质量检查全部完成',
  'Check out the requested exact SHA without credentials':
    '无凭据检出指定 Exact-SHA',
  'Validate current-main identity and complete existing release':
    '校验当前主线身份与既有发布完整性',
  'Recover a provenance-bound strict terminal before heavy setup':
    '重型准备前恢复来源绑定的严格回执',
  'Set up Go only for an expired vulnerability database receipt':
    '仅在漏洞库回执过期时准备 Go 工具链',
  'Refresh only the expired vulnerability database check':
    '仅刷新已过期的漏洞数据库检查',
  'Pass the recovered terminal to publish': '传递已恢复的严格回执给发布任务',
  'Check out the exact SHA without credentials': '无凭据检出 Exact-SHA',
  'Set up Go': '准备 Go 工具链',
  'Set up pinned Atlas': '准备固定版本 Atlas',
  'Restore pinned strict-gate Go tools': '恢复固定版本的严格门禁 Go 工具',
  'Restore the checksum-verified strict scanner archive':
    '恢复已校验和的严格扫描器',
  'Install strict dependencies': '安装严格门禁依赖',
  'Install Web dependencies and Chromium': '安装 Web 依赖与 Chromium',
  'Reconfirm exact current-main identity': '再次确认当前主线 Exact-SHA 身份',
  'Prove Ent and Atlas generation has zero drift':
    '确认 Ent 与 Atlas 生成结果零漂移',
  'Run the exact-SHA strict terminal once': '执行一次 Exact-SHA 严格质量门禁',
  'Persist the canonical exact-SHA terminal': '保存 Exact-SHA 权威严格回执',
  'Set up pinned Buildx for the shared release graph':
    '为共享发布图准备固定版本 Buildx',
  'Install the source scanner and archive compressor':
    '安装源码扫描器与制品压缩工具',
  'Restore the checksum-verified source scanner archive':
    '恢复已校验和的源码扫描器',
  'Download the recovered strict terminal': '下载已恢复的严格回执',
  'Download the newly executed strict terminal': '下载本次执行的严格回执',
  'Reverify exact identity and terminal integrity':
    '复核 Exact-SHA 身份与严格回执完整性',
  'Install the pinned source-package scanner': '安装固定版本的源码包扫描器',
  'Build each runtime once and publish images by digest':
    '各运行镜像只构建一次并按摘要发布',
  'Create or resume a verified draft, then publish it':
    '创建或恢复已校验草稿并发布',
  'Publish immutable release': '发布不可变版本',
  'Build both images': '并行构建服务端与 Web 镜像',
  'Publish assets': '发布制品',
  'Initialize containers': '初始化测试容器',
  'Set up job': '准备任务运行环境',
  'Complete job': '完成任务并收尾',
})

export function resolveDevVersionCenterView(value) {
  const normalized = String(value || '').trim()
  return DEV_VERSION_CENTER_VIEW_VALUES.has(normalized)
    ? normalized
    : DEV_VERSION_CENTER_VIEW_VERSIONS
}

const OPERATION_MESSAGE_LABELS = Object.freeze({
  'operation accepted': '操作已受理',
  'read-only fixed-target preflight started': '已开始固定目标只读预检',
  'read-only rollback qualification started': '已开始只读回滚资格检查',
  'promotion plan is eligible and requires explicit confirmation':
    '部署资格已通过，等待明确确认',
  'promotion plan is eligible; explicit confirmation is required':
    '部署资格已通过，等待明确确认',
  'rollback plan is eligible and requires explicit confirmation':
    '回滚资格已通过，等待明确确认',
  'code-only rollback is eligible; explicit confirmation is required':
    '仅代码回滚资格已通过，等待明确确认',
  'target write started with the fixed promotion contract':
    '已按固定部署合同开始写入目标',
  'code-only target rollback started with the fixed contract':
    '已按固定合同开始仅代码回滚',
  'target promotion and basic runtime verification passed':
    '133 部署与基础运行核验已通过',
  'code-only rollback and basic runtime verification passed':
    '代码回滚与基础运行核验已通过',
  'immutable GitHub release and complete assets are published':
    'GitHub 不可变版本及完整制品已发布',
  'GitHub immutable release dispatch started': '已开始触发 GitHub 不可变发布',
  'GitHub immutable release workflow accepted': 'GitHub 不可变发布流水线已受理',
  'GitHub release workflow accepted; waiting for terminal assets':
    'GitHub 发布流水线已受理，正在等待完整制品',
  'immutable release already exists with complete assets':
    '该 SHA 已存在完整不可变制品，本次直接复用',
  'requested exact SHA is already current and healthy':
    '该 Exact-SHA 已在 133 健康运行',
  'requested rollback SHA is already current': '目标回滚 SHA 已是当前版本',
  'promotion is blocked by fixed-target preflight': '部署被固定目标预检阻断',
  'code-only rollback is blocked by fixed qualification':
    '仅代码回滚被固定资格检查阻断',
  'promotion preparation failed without starting a target write':
    '部署准备失败，未开始写入目标',
  'rollback qualification failed without starting a target write':
    '回滚资格检查失败，未开始写入目标',
  'promotion executor child is launching': '部署执行器正在启动',
  'rollback executor child is launching': '回滚执行器正在启动',
  'promotion executor did not start a target write': '部署执行器未开始写入目标',
  'promotion executor ended while target outcome was unknown':
    '部署执行器已结束，但目标结果尚未证明',
  'GitHub release workflow reached a failed terminal state':
    'GitHub 发布流水线已失败结束',
  'promotion was blocked by the immediate target preflight':
    '部署被目标即时预检阻断',
  'remote promotion result could not be proven; automatic retry is disabled':
    '远端部署结果无法证明，已禁止自动重试',
  'promotion package transfer failed before remote execution':
    '部署包在远端执行前传输失败',
  'rollback was blocked by the immediate target readback':
    '回滚被目标即时读回阻断',
  'rollback package preparation failed before target write':
    '回滚包准备失败，未开始写入目标',
  'target promotion failed before migration apply':
    '目标部署在数据库迁移前失败',
  'target promotion outcome requires readback': '目标部署结果需要重新读回确认',
  'process restarted while target outcome was unknown; read back before retry':
    '进程重启时目标结果未知，重试前必须先读回',
})

const PIPELINE_RUN_MODE_LABELS = Object.freeze({
  exact_sha_reuse: '相同 SHA 幂等复用',
  full_release: '完整不可变发布',
  continuous_integration: '持续集成',
})

export function deliveryPipelinePresentation(value) {
  const original = String(value || '').trim()
  if (!original) {
    return { label: '未命名环节', title: '未命名环节' }
  }
  let label = PIPELINE_LABELS[original]
  if (!label && original.startsWith('Post ')) {
    const base = original.slice('Post '.length)
    label = PIPELINE_LABELS[base]
      ? `清理：${PIPELINE_LABELS[base]}`
      : '清理任务运行环境'
  }
  if (!label && /\p{Script=Han}/u.test(original)) label = original
  if (!label) label = '其他流水线环节'
  return {
    label,
    title:
      label === original ? original : `${label}（GitHub 原名：${original}）`,
  }
}

export function deliveryOperationMessagePresentation(value) {
  const original = String(value || '').trim()
  if (!original) return { label: '等待状态更新', title: '等待状态更新' }
  const label = OPERATION_MESSAGE_LABELS[original]
  if (label) return { label, title: `${label}（原始回执：${original}）` }
  if (/\p{Script=Han}/u.test(original)) {
    return { label: original, title: original }
  }
  return {
    label: '操作状态已更新',
    title: `操作状态已更新（原始回执：${original}）`,
  }
}

export function deliveryPipelineRunMode(run) {
  if (!run) return null
  if (run.workflow === 'ci') return 'continuous_integration'
  const publishJob = (run.jobs || []).find(
    (job) => job.name === 'Publish immutable artifact set'
  )
  const strictJob = (run.jobs || []).find(
    (job) => job.name === 'Exact-SHA strict quality'
  )
  const jobWasSkipped = (job) =>
    Boolean(job && ['skipped', 'neutral'].includes(job.conclusion))
  return jobWasSkipped(publishJob) && jobWasSkipped(strictJob)
    ? 'exact_sha_reuse'
    : 'full_release'
}

export function deliveryPipelineRunModePresentation(mode) {
  return PIPELINE_RUN_MODE_LABELS[mode] || '运行类型未识别'
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} is invalid`)
  }
  return value
}

function validBuildPerformance(value) {
  return (
    value === null ||
    (value?.schemaVersion === 'plush.release-build-performance/v1' &&
      Number.isSafeInteger(value.durationMs) &&
      value.durationMs >= 0 &&
      ['builder', 'gha'].includes(value.cacheMode) &&
      Number.isSafeInteger(value.completedVertexCount) &&
      value.completedVertexCount >= 0 &&
      Number.isSafeInteger(value.cacheHitCount) &&
      value.cacheHitCount >= 0 &&
      Number.isSafeInteger(value.cacheMissCount) &&
      value.cacheMissCount >= 0 &&
      value.cacheHitCount + value.cacheMissCount ===
        value.completedVertexCount &&
      Number.isSafeInteger(value.cacheHitRateBasisPoints) &&
      value.cacheHitRateBasisPoints >= 0 &&
      value.cacheHitRateBasisPoints <= 10_000)
  )
}

function validTargetCacheMetrics(metrics) {
  const hit = metrics.targetCacheHit
  if (hit === undefined || hit === null) {
    return (
      [undefined, null].includes(metrics.targetImageCacheHit) &&
      [undefined, null].includes(metrics.targetCacheSource) &&
      [undefined, null].includes(metrics.avoidedTransferBytes) &&
      [undefined, null].includes(metrics.avoidedTransferDurationMs) &&
      [undefined, null].includes(metrics.avoidedTransferBaselineOperationId) &&
      [undefined, null].includes(metrics.dockerLoadSkipped) &&
      (metrics.cacheBasis === undefined ||
        (Array.isArray(metrics.cacheBasis) &&
          metrics.cacheBasis.length === 0)) &&
      (metrics.stillExecutedChecks === undefined ||
        (Array.isArray(metrics.stillExecutedChecks) &&
          metrics.stillExecutedChecks.length === 0))
    )
  }
  const basis = [
    'release_manifest_sha256',
    'archive_sha256',
    'registry_digest',
    'docker_content_id',
    'embedded_git_sha',
  ]
  const stillExecuted = [
    ['migration', 'health', 'ready', 'public_entry'],
    ['migration_status', 'health', 'ready', 'public_entry'],
  ]
  return (
    typeof hit === 'boolean' &&
    typeof metrics.targetImageCacheHit === 'boolean' &&
    ['none', 'formal', 'retained_operation'].includes(
      metrics.targetCacheSource
    ) &&
    Number.isSafeInteger(metrics.avoidedTransferBytes) &&
    metrics.avoidedTransferBytes >= 0 &&
    ((metrics.avoidedTransferDurationMs === null &&
      metrics.avoidedTransferBaselineOperationId === null) ||
      (Number.isSafeInteger(metrics.avoidedTransferDurationMs) &&
        metrics.avoidedTransferDurationMs > 0 &&
        OPERATION_ID_PATTERN.test(
          metrics.avoidedTransferBaselineOperationId
        ))) &&
    metrics.dockerLoadSkipped === metrics.targetImageCacheHit &&
    Array.isArray(metrics.cacheBasis) &&
    Array.isArray(metrics.stillExecutedChecks) &&
    stillExecuted.some(
      (expected) => metrics.stillExecutedChecks.join(',') === expected.join(',')
    ) &&
    (hit
      ? metrics.targetCacheSource !== 'none' &&
        metrics.avoidedTransferBytes > 0 &&
        metrics.cacheBasis.join(',') === basis.join(',')
      : metrics.targetImageCacheHit === false &&
        metrics.targetCacheSource === 'none' &&
        metrics.avoidedTransferBytes === 0 &&
        metrics.cacheBasis.length === 0)
  )
}

function validOperationTimeline(operation) {
  if (
    typeof operation.createdAt !== 'string' ||
    typeof operation.updatedAt !== 'string' ||
    !TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(operation.createdAt) ||
    !TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(operation.updatedAt) ||
    !Array.isArray(operation.events) ||
    operation.events.length < 1 ||
    operation.events.length > 100
  ) {
    return false
  }

  const createdAt = Date.parse(operation.createdAt)
  const updatedAt = Date.parse(operation.updatedAt)
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt) ||
    createdAt > updatedAt
  ) {
    return false
  }

  let previousEventAt = createdAt
  for (const event of operation.events) {
    const eventAt = Date.parse(String(event?.at || ''))
    if (
      !OPERATION_STATUSES.has(event?.status) ||
      typeof event?.at !== 'string' ||
      !TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(event.at) ||
      !Number.isFinite(eventAt) ||
      eventAt < previousEventAt ||
      eventAt > updatedAt ||
      typeof event?.message !== 'string' ||
      event.message.length < 1 ||
      event.message.length > 500
    ) {
      return false
    }
    previousEventAt = eventAt
  }

  const lastEvent = operation.events.at(-1)
  return (
    lastEvent.status === operation.status &&
    lastEvent.at === operation.updatedAt
  )
}

function validateOperation(operation) {
  assertObject(operation, 'delivery operation')
  if (
    typeof operation.id !== 'string' ||
    !['release', 'promote', 'rollback'].includes(operation.action) ||
    !SHA_PATTERN.test(String(operation.gitSha || '')) ||
    !VERSION_PATTERN.test(String(operation.version || '')) ||
    !OPERATION_STATUSES.has(operation.status) ||
    !validOperationTimeline(operation) ||
    !Number.isSafeInteger(operation.durationMs) ||
    operation.durationMs < 0 ||
    !Array.isArray(operation.stages) ||
    operation.stages.some(
      (stage) =>
        !stage ||
        typeof stage.id !== 'string' ||
        typeof stage.label !== 'string' ||
        !['passed', 'failed', ...OPERATION_STATUSES].includes(stage.status) ||
        !Number.isSafeInteger(stage.durationMs) ||
        stage.durationMs < 0
    ) ||
    !Array.isArray(operation.issues) ||
    !operation.metrics ||
    [
      'transferBytes',
      'transferDurationMs',
      'transferBytesPerSecond',
      'serverArchiveBytes',
      'webArchiveBytes',
      'backupSizeBytes',
    ].some(
      (key) =>
        operation.metrics[key] !== null &&
        (!Number.isSafeInteger(operation.metrics[key]) ||
          operation.metrics[key] < 0)
    ) ||
    (operation.metrics.serverDigest === null) !==
      (operation.metrics.webDigest === null) ||
    (operation.metrics.serverDigest !== null &&
      (!DIGEST_PATTERN.test(operation.metrics.serverDigest) ||
        !DIGEST_PATTERN.test(operation.metrics.webDigest))) ||
    (operation.metrics.transferDurationMs !== null &&
      operation.metrics.transferDurationMs > operation.durationMs) ||
    !validBuildPerformance(operation.metrics.buildPerformance) ||
    !validTargetCacheMetrics(operation.metrics)
  ) {
    throw new Error('delivery operation is invalid')
  }
  return operation
}

function validateDuration(value, field, { optional = false } = {}) {
  if (value === null && optional) return value
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} duration is invalid`)
  }
  return value
}

function validatePipelineTimestamp(value, field, { optional = false } = {}) {
  if (value === null && optional) return value
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} timestamp is invalid`)
  }
  return value
}

function validatePipelineStep(step) {
  assertObject(step, 'pipeline step')
  if (
    !Number.isSafeInteger(step.number) ||
    step.number < 1 ||
    typeof step.name !== 'string' ||
    !PIPELINE_STATUSES.has(step.status)
  ) {
    throw new Error('pipeline step is invalid')
  }
  validatePipelineTimestamp(step.startedAt, 'pipeline step start', {
    optional: true,
  })
  validatePipelineTimestamp(step.finishedAt, 'pipeline step finish', {
    optional: true,
  })
  validateDuration(step.durationMs, 'pipeline step', { optional: true })
  return step
}

function validatePipelineJob(job) {
  assertObject(job, 'pipeline job')
  if (
    !Number.isSafeInteger(job.id) ||
    job.id < 1 ||
    typeof job.name !== 'string' ||
    !PIPELINE_STATUSES.has(job.status) ||
    !Array.isArray(job.steps) ||
    job.steps.length > 100
  ) {
    throw new Error('pipeline job is invalid')
  }
  validatePipelineTimestamp(job.startedAt, 'pipeline job start', {
    optional: true,
  })
  validatePipelineTimestamp(job.finishedAt, 'pipeline job finish', {
    optional: true,
  })
  validateDuration(job.durationMs, 'pipeline job', { optional: true })
  job.steps.forEach(validatePipelineStep)
  return job
}

function validatePipelineRun(run) {
  assertObject(run, 'pipeline run')
  if (
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !Number.isSafeInteger(run.attempt) ||
    run.attempt < 1 ||
    !['ci', 'release'].includes(run.workflow) ||
    typeof run.event !== 'string' ||
    !PIPELINE_STATUSES.has(run.status) ||
    !SHA_PATTERN.test(String(run.gitSha || '')) ||
    !Array.isArray(run.jobs) ||
    run.jobs.length > 100 ||
    run.url !==
      `https://github.com/saurick/plush-toy-erp/actions/runs/${String(run.id)}`
  ) {
    throw new Error('pipeline run is invalid')
  }
  validatePipelineTimestamp(run.createdAt, 'pipeline run creation')
  validatePipelineTimestamp(run.startedAt, 'pipeline run start', {
    optional: true,
  })
  validatePipelineTimestamp(run.finishedAt, 'pipeline run finish', {
    optional: true,
  })
  validateDuration(run.queueMs, 'pipeline queue', { optional: true })
  validateDuration(run.durationMs, 'pipeline run', { optional: true })
  run.jobs.forEach(validatePipelineJob)
  return run
}

export function validatePipelineTimings(timings) {
  assertObject(timings, 'pipeline timings')
  if (
    timings.schemaVersion !== 'plush.delivery-pipeline-timings/v1' ||
    !Array.isArray(timings.runs) ||
    timings.runs.length > 20
  ) {
    throw new Error('pipeline timing contract is invalid')
  }
  validatePipelineTimestamp(timings.generatedAt, 'pipeline timing generation')
  timings.runs.forEach(validatePipelineRun)
  return timings
}

function validateVersion(version) {
  assertObject(version, 'delivery version')
  if (
    !SHA_PATTERN.test(String(version.gitSha || '')) ||
    !VERSION_PATTERN.test(String(version.version || '')) ||
    version.tag !== `artifact-${version.gitSha}` ||
    !['published', 'draft', 'prerelease'].includes(version.status) ||
    typeof version.publishedAt !== 'string' ||
    !TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(version.publishedAt) ||
    !Number.isFinite(Date.parse(version.publishedAt)) ||
    typeof version.completeAssets !== 'boolean' ||
    !Array.isArray(version.assets) ||
    !version.artifactSummary ||
    ['totalBytes', 'serverImageBytes', 'webImageBytes', 'sbomBytes'].some(
      (key) =>
        !Number.isSafeInteger(version.artifactSummary[key]) ||
        version.artifactSummary[key] < 0
    ) ||
    version.artifactSummary.serverImageBytes +
      version.artifactSummary.webImageBytes +
      version.artifactSummary.sbomBytes >
      version.artifactSummary.totalBytes ||
    (version.imageDigests !== null &&
      (!DIGEST_PATTERN.test(String(version.imageDigests?.server || '')) ||
        !DIGEST_PATTERN.test(String(version.imageDigests?.web || '')))) ||
    !validBuildPerformance(version.buildPerformance)
  ) {
    throw new Error('delivery version is invalid')
  }
  return version
}

export function validateDevDeliverySummary(summary) {
  assertObject(summary, 'delivery summary')
  if (
    summary.schemaVersion !== 'plush.dev-delivery-summary/v1' ||
    !['success', 'partial'].includes(summary.status) ||
    !Array.isArray(summary.versions) ||
    !Array.isArray(summary.operations) ||
    !Array.isArray(summary.issues) ||
    !Object.hasOwn(summary, 'timings') ||
    summary.boundaries?.provider !== 'github' ||
    summary.boundaries?.target !== 'test-133' ||
    summary.boundaries?.browserShellAccess !== false ||
    summary.boundaries?.targetBuildAllowed !== false ||
    summary.boundaries?.automaticRetryAllowed !== false
  ) {
    throw new Error('delivery summary contract is invalid')
  }
  if (
    summary.repository !== null &&
    (!SHA_PATTERN.test(String(summary.repository?.commit || '')) ||
      typeof summary.repository?.dirty !== 'boolean' ||
      !/^[0-9a-f]{64}$/u.test(String(summary.repository?.fingerprint || '')))
  ) {
    throw new Error('delivery repository identity is invalid')
  }
  if (summary.target !== null) {
    const runtime = summary.target?.remote?.runtime
    const publicEntry = summary.target?.remote?.publicEntry
    const validTargetSha = (value) =>
      value === 'unknown' || SHA_PATTERN.test(String(value || ''))
    if (
      !['passed', 'blocked'].includes(summary.target?.status) ||
      !validTargetSha(runtime?.serverSha) ||
      !validTargetSha(runtime?.webSha) ||
      !['passed', 'blocked'].includes(publicEntry?.status) ||
      !['passed', 'failed'].includes(publicEntry?.health) ||
      !['passed', 'failed'].includes(publicEntry?.provider) ||
      typeof publicEntry?.container !== 'string' ||
      (publicEntry.container !== 'unknown' &&
        !/^plush-toy-erp-web-public-[0-9a-f]{8}$/u.test(
          publicEntry.container
        )) ||
      (publicEntry.gitSha !== 'unknown' &&
        !SHA_PATTERN.test(String(publicEntry.gitSha || ''))) ||
      publicEntry?.endpoint !== 'https://admin.yoyoosun.net' ||
      (summary.target.status === 'passed' &&
        (!SHA_PATTERN.test(runtime.serverSha) ||
          runtime.serverSha !== runtime.webSha ||
          publicEntry.status !== 'passed' ||
          publicEntry.gitSha !== runtime.serverSha))
    ) {
      throw new Error('delivery target evidence is invalid')
    }
  }
  summary.versions.forEach(validateVersion)
  summary.operations.forEach(validateOperation)
  if (summary.timings !== null) validatePipelineTimings(summary.timings)
  return summary
}

async function readJson(response) {
  let payload
  try {
    payload = await response.json()
  } catch {
    throw new Error('版本中心返回了无效响应')
  }
  if (!response.ok) {
    throw new Error(
      typeof payload?.message === 'string'
        ? payload.message
        : '版本中心操作失败'
    )
  }
  return payload
}

export function createDevDeliveryClient({ fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is unavailable')
  }
  let csrfToken = ''

  async function session() {
    if (csrfToken) return csrfToken
    const payload = await readJson(
      await fetchImpl(DEV_DELIVERY_SESSION_API_PATH, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      })
    )
    if (
      payload?.schemaVersion !== 'plush.dev-delivery-session/v1' ||
      typeof payload.csrfToken !== 'string' ||
      payload.csrfToken.length < 32 ||
      payload.target !== 'test-133'
    ) {
      throw new Error('版本中心会话校验失败')
    }
    csrfToken = payload.csrfToken
    return csrfToken
  }

  return {
    async summary() {
      return validateDevDeliverySummary(
        await readJson(
          await fetchImpl(DEV_DELIVERY_SUMMARY_API_PATH, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
        )
      )
    },
    async operation(operationId) {
      if (!OPERATION_ID_PATTERN.test(String(operationId || ''))) {
        throw new Error('版本中心 operation ID 无效')
      }
      const payload = await readJson(
        await fetchImpl(`${DEV_DELIVERY_OPERATION_API_PREFIX}/${operationId}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        })
      )
      if (payload?.schemaVersion !== 'plush.dev-delivery-operation-result/v1') {
        throw new Error('版本中心 operation 响应无效')
      }
      return validateOperation(payload.operation)
    },
    async action(action, payload) {
      const token = await session()
      return readJson(
        await fetchImpl(DEV_DELIVERY_ACTION_API_PATH, {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': token,
          },
          body: JSON.stringify({ action, payload }),
        })
      )
    },
    clearSession() {
      csrfToken = ''
    },
  }
}

export function createDeliveryIdempotencyKey(
  action,
  randomUuid = () => globalThis.crypto.randomUUID()
) {
  if (!['release', 'promote', 'rollback'].includes(action)) {
    throw new Error('delivery idempotency action is invalid')
  }
  const uuid = String(randomUuid())
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(
      uuid
    )
  ) {
    throw new Error('delivery idempotency UUID is invalid')
  }
  return `version-center:${action}:${uuid}`
}

export function defaultReleaseVersion(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}.${month}.${day}-1`
}

export function shortGitSha(value) {
  return SHA_PATTERN.test(String(value || ''))
    ? String(value).slice(0, 12)
    : '未证明'
}

export function formatDeliveryTimestamp(value, missing = '时间未证明') {
  const timestamp = Date.parse(String(value || ''))
  if (!Number.isFinite(timestamp)) return missing
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(timestamp))
}

export function formatDeliveryBytes(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '未证明'
  if (value < 1024) return `${String(value)} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let amount = value / 1024
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }
  return `${amount.toFixed(amount >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

export function formatDeliveryRate(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '未证明'
  return `${formatDeliveryBytes(value)}/s`
}

export function formatDeliveryPercent(basisPoints) {
  if (
    !Number.isSafeInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10_000
  ) {
    return '未证明'
  }
  return `${(basisPoints / 100).toFixed(1)}%`
}

export function formatDeliveryDuration(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '未证明'
  if (value < 1000) return `${String(value)} ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)} 秒`
  const roundedSeconds = Math.round(value / 1000)
  const minutes = Math.floor(roundedSeconds / 60)
  const seconds = roundedSeconds % 60
  if (minutes < 60) return `${String(minutes)} 分 ${String(seconds)} 秒`
  const hours = Math.floor(minutes / 60)
  return `${String(hours)} 小时 ${String(minutes % 60)} 分`
}

const TARGET_CACHE_BASIS_LABELS = Object.freeze({
  release_manifest_sha256: '发布清单校验和',
  archive_sha256: '制品归档校验和',
  registry_digest: '镜像仓库摘要',
  docker_content_id: 'Docker 内容标识',
  embedded_git_sha: '镜像内完整 Git SHA',
})
const TARGET_STILL_EXECUTED_LABELS = Object.freeze({
  migration: '数据库迁移',
  migration_status: '迁移状态核对',
  health: '健康检查',
  ready: '就绪检查',
  public_entry: '公网入口读回',
})

export function deliveryTargetCachePresentation(metrics) {
  if (
    metrics?.targetCacheHit === null ||
    metrics?.targetCacheHit === undefined
  ) {
    return Object.freeze({
      status: '尚无缓存回执',
      source: '未证明',
      basis: [],
      stillExecuted: [],
    })
  }
  const source = {
    none: '目标无可用缓存',
    formal: '正式保留版本缓存',
    retained_operation: '历史演练保留制品',
  }[metrics.targetCacheSource]
  return Object.freeze({
    status: metrics.targetCacheHit ? '目标缓存命中' : '目标缓存未命中',
    source,
    basis: metrics.cacheBasis.map(
      (item) => TARGET_CACHE_BASIS_LABELS[item] || item
    ),
    stillExecuted: metrics.stillExecutedChecks.map(
      (item) => TARGET_STILL_EXECUTED_LABELS[item] || item
    ),
  })
}

function observedCriticalPath(run) {
  if (!run?.startedAt || !run?.finishedAt) return null
  const runStart = Date.parse(run.startedAt)
  const runFinish = Date.parse(run.finishedAt)
  const intervals = (run.jobs || [])
    .map((job) => ({
      id: String(job.id),
      name: job.name,
      startedAt: Date.parse(job.startedAt || ''),
      finishedAt: Date.parse(job.finishedAt || ''),
      durationMs: job.durationMs,
    }))
    .filter(
      (job) =>
        Number.isFinite(job.startedAt) &&
        Number.isFinite(job.finishedAt) &&
        job.finishedAt >= job.startedAt
    )
  if (!Number.isFinite(runStart) || !Number.isFinite(runFinish)) return null
  const jobs = []
  let coveredDurationMs = 0
  let cursor = runStart
  while (cursor < runFinish) {
    let candidate = null
    for (const job of intervals) {
      if (
        job.startedAt <= cursor &&
        job.finishedAt > cursor &&
        (!candidate || job.finishedAt > candidate.finishedAt)
      ) {
        candidate = job
      }
    }
    if (candidate) {
      const criticalDurationMs = candidate.finishedAt - cursor
      coveredDurationMs += criticalDurationMs
      if (jobs.at(-1)?.id !== candidate.id) {
        jobs.push({ ...candidate, criticalDurationMs })
      } else {
        jobs.at(-1).criticalDurationMs += criticalDurationMs
      }
      cursor = candidate.finishedAt
      continue
    }
    let next = null
    for (const job of intervals) {
      if (job.startedAt > cursor && (!next || job.startedAt < next.startedAt)) {
        next = job
      }
    }
    if (!next) break
    cursor = next.startedAt
  }
  return {
    durationMs: Math.max(0, runFinish - runStart),
    coveredDurationMs,
    schedulingGapMs: Math.max(0, runFinish - runStart - coveredDurationMs),
    jobs,
  }
}

function pipelineFailureReason(run) {
  const failedSteps = (run?.jobs || []).flatMap((job) =>
    job.steps
      .filter((step) => step.conclusion === 'failure')
      .map((step) => ({
        job: job.name,
        step: step.name,
        startedAt: step.startedAt,
      }))
  )
  const firstStep = failedSteps.sort(
    (left, right) =>
      Date.parse(left.startedAt || '') - Date.parse(right.startedAt || '')
  )[0]
  if (firstStep) return firstStep
  const failedJob = (run?.jobs || []).find(
    (job) => job.conclusion === 'failure'
  )
  return failedJob ? { job: failedJob.name, step: 'Job 未提供失败步骤' } : null
}

export function findLatestTransferredPromotion(operations) {
  if (!Array.isArray(operations)) return null
  return (
    operations.find(
      (operation) =>
        operation?.action === 'promote' &&
        operation.status === 'passed' &&
        Number.isSafeInteger(operation.metrics?.transferBytes) &&
        operation.metrics.transferBytes > 0 &&
        Number.isSafeInteger(operation.metrics?.transferDurationMs) &&
        operation.metrics.transferDurationMs > 0
    ) || null
  )
}

export function summarizePipelineTimings(timings) {
  const runs = timings?.runs || []
  const completed = runs.filter(
    (run) => run.status === 'completed' && Number.isSafeInteger(run.durationMs)
  )
  const latest = completed[0] || null
  const latestMode = deliveryPipelineRunMode(latest)
  const comparable = latest
    ? completed.filter((run) => deliveryPipelineRunMode(run) === latestMode)
    : []
  const median = (items) => {
    const sortedDurations = items
      .map((run) => run.durationMs)
      .sort((left, right) => left - right)
    const middle = Math.floor(sortedDurations.length / 2)
    return sortedDurations.length === 0
      ? null
      : sortedDurations.length % 2 === 1
        ? sortedDurations[middle]
        : Math.round(
            (sortedDurations[middle - 1] + sortedDurations[middle]) / 2
          )
  }
  const latestFullRelease = completed.find(
    (run) => deliveryPipelineRunMode(run) === 'full_release'
  )
  const latestReuse = completed.find(
    (run) => deliveryPipelineRunMode(run) === 'exact_sha_reuse'
  )
  const analysisRun =
    latestMode === 'exact_sha_reuse' && latestFullRelease
      ? latestFullRelease
      : latest
  const analysisMode = deliveryPipelineRunMode(analysisRun)
  const fullReleaseRuns = completed.filter(
    (run) => deliveryPipelineRunMode(run) === 'full_release'
  )
  const candidates = (analysisRun?.jobs || []).flatMap((job) => {
    const steps = job.steps.filter((step) =>
      Number.isSafeInteger(step.durationMs)
    )
    return steps.length > 0
      ? steps.map((step) => ({
          id: `${String(job.id)}:${String(step.number)}`,
          name: step.name,
          group: job.name,
          startedAt: step.startedAt,
          finishedAt: step.finishedAt,
          durationMs: step.durationMs,
          status: step.status,
          conclusion: step.conclusion,
        }))
      : Number.isSafeInteger(job.durationMs)
        ? [
            {
              id: String(job.id),
              name: job.name,
              group: analysisRun.workflow,
              startedAt: job.startedAt,
              finishedAt: job.finishedAt,
              durationMs: job.durationMs,
              status: job.status,
              conclusion: job.conclusion,
            },
          ]
        : []
  })
  const stages = candidates.sort(
    (left, right) => right.durationMs - left.durationMs
  )
  const bottleneck = stages[0] || null
  return {
    latest,
    latestMode,
    analysisRun,
    analysisMode,
    latestFullRelease,
    latestReuse,
    sampleCount: comparable.length,
    medianDurationMs: median(comparable),
    fullReleaseSampleCount: fullReleaseRuns.length,
    fullReleaseMedianDurationMs: median(fullReleaseRuns),
    bottleneck,
    stages,
    criticalPath: observedCriticalPath(analysisRun),
    failureReason: pipelineFailureReason(latest),
    optimizationHint: bottleneck
      ? `${latestMode === 'exact_sha_reuse' ? '最近一次是幂等复用，不参与完整构建瓶颈判断。' : ''}先复核“${deliveryPipelinePresentation(bottleneck.name).label}”：它是最近一次${deliveryPipelineRunModePresentation(analysisMode)}中耗时最长的可见环节。`
      : '等待至少一次完整流水线后再决定优化点，避免凭感觉增加并发或缓存。',
  }
}

export function deliveryStatusPresentation(status) {
  const presentations = {
    queued: ['已排队', 'default'],
    running: ['执行中', 'processing'],
    ready: ['待确认', 'blue'],
    launching: ['正在启动', 'processing'],
    waiting: ['等待 GitHub', 'processing'],
    requested: ['已请求', 'blue'],
    pending: ['等待执行', 'default'],
    in_progress: ['执行中', 'processing'],
    completed: ['已完成', 'success'],
    success: ['成功', 'success'],
    failure: ['失败', 'error'],
    cancelled: ['已取消', 'default'],
    skipped: ['已跳过', 'warning'],
    neutral: ['无状态', 'default'],
    passed: ['已通过', 'success'],
    failed: ['失败', 'error'],
    blocked: ['已阻断', 'warning'],
    not_proven: ['结果未证明', 'error'],
    published: ['已发布', 'success'],
    draft: ['草稿', 'default'],
    prerelease: ['预发布', 'warning'],
  }
  const [label, color] = presentations[status] || ['未知', 'default']
  return { label, color }
}

export function deliveryVersionActionKind(version, currentVersion) {
  if (!version || !SHA_PATTERN.test(String(version.gitSha || ''))) {
    return 'blocked'
  }
  if (!currentVersion) return 'promote'
  if (version.gitSha === currentVersion.gitSha) return 'current'
  const versionPublishedAt = Date.parse(String(version.publishedAt || ''))
  const currentPublishedAt = Date.parse(
    String(currentVersion.publishedAt || '')
  )
  if (
    !Number.isFinite(versionPublishedAt) ||
    !Number.isFinite(currentPublishedAt) ||
    versionPublishedAt === currentPublishedAt
  ) {
    return 'blocked'
  }
  return versionPublishedAt < currentPublishedAt ? 'rollback' : 'promote'
}
