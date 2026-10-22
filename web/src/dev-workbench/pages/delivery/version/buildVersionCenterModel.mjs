import {
  POLLING_OPERATION_STATUSES,
  OPEN_OPERATION_STATUSES,
} from './shared.jsx'
import {
  DEV_DELIVERY_TARGETS,
  DEV_VERSION_CENTER_HISTORY_FILTER_ALL,
  deliveryIdempotencyPresentation,
  deliveryOperationDetailPresentation,
  deliveryReadOnlyReleasePresentation,
  deliveryTargetCachePresentation,
  deliveryVersionForTarget,
  formatDeliveryBytes,
  formatDeliveryDuration,
  formatDeliveryPercent,
  formatDeliveryRate,
} from '../../../config/devDelivery.mjs'

export function buildVersionCenterModel({
  actionKey,
  customerReady,
  initialLoading,
  operationDetail,
  operationHistoryFilters,
  qualityGateError,
  qualityGateSummary,
  refreshing,
  selectedTargetKey,
  summary,
  summaryFresh,
} = {}) {
  const repository = summary?.repository
  const selectedTargetDefinition =
    DEV_DELIVERY_TARGETS.find((target) => target.key === selectedTargetKey) ||
    DEV_DELIVERY_TARGETS[0]
  const selectedTargetDescriptor = summary?.targets?.find(
    (target) => target.key === selectedTargetKey
  )
  const target = selectedTargetDescriptor?.preflight || null
  const initializationPreflight =
    selectedTargetDescriptor?.initializationPreflight || null
  const versions = (summary?.versions || []).map(
    (version) => deliveryVersionForTarget(version, selectedTargetKey) || version
  )
  const releaseVersion = summary?.releaseVersionPolicy?.nextVersion || ''
  const operations = summary?.operations || []
  const openOperations = operations.filter((operation) =>
    OPEN_OPERATION_STATUSES.has(operation.status)
  )
  const hasOperationHistoryFilters = Boolean(
    operationHistoryFilters.action !== DEV_VERSION_CENTER_HISTORY_FILTER_ALL ||
    operationHistoryFilters.result !== DEV_VERSION_CENTER_HISTORY_FILTER_ALL ||
    operationHistoryFilters.target !== DEV_VERSION_CENTER_HISTORY_FILTER_ALL ||
    operationHistoryFilters.keyword
  )
  const pollingOperation = operations.find((operation) =>
    POLLING_OPERATION_STATUSES.has(operation.status)
  )
  const pollingOperationId = pollingOperation?.id || ''
  const hasOpenOperation = operations.some((operation) =>
    OPEN_OPERATION_STATUSES.has(operation.status)
  )
  const isMutationRunning = Boolean(actionKey)
  const currentTargetSha = target?.remote?.runtime?.serverSha || ''
  const currentTargetRelease = versions.find(
    (version) => version.gitSha === currentTargetSha
  )
  const currentHeadRelease = versions.find(
    (version) => version.gitSha === repository?.commit
  )
  const publicEntry = target?.remote?.publicEntry
  const targetPassed = target?.status === 'passed'
  const customerTestRebuildEligible = Boolean(
    summaryFresh &&
    selectedTargetKey === 'customer-test-133' &&
    targetPassed &&
    currentTargetRelease?.status === 'published' &&
    currentTargetRelease.completeAssets === true &&
    !hasOpenOperation &&
    !isMutationRunning
  )
  const customerTestRebuildExplanation = isMutationRunning
    ? '已有写操作正在提交'
    : !summaryFresh
      ? '正在核对最新状态；上次结果只供查看'
      : hasOpenOperation
        ? '已有未结束的操作'
        : !targetPassed
          ? 'test 运行态只读预检未通过'
          : !currentTargetRelease
            ? '当前运行 SHA 没有可验证的不可变 Release'
            : currentTargetRelease.completeAssets !== true
              ? '当前运行 Release 制品不完整'
              : ''
  const initializationReady = Boolean(
    initializationPreflight?.status === 'eligible' &&
    initializationPreflight?.remote?.rootState === 'absent' &&
    initializationPreflight?.blockers?.length === 0
  )
  const headAlreadyPublished = Boolean(
    currentHeadRelease?.status === 'published' &&
    currentHeadRelease?.completeAssets === true
  )
  const releaseDispatchAllowed =
    summary?.boundaries?.releaseDispatchAllowed === true
  const canDispatch = Boolean(
    summaryFresh &&
    releaseDispatchAllowed &&
    repository &&
    !repository.dirty &&
    Boolean(releaseVersion) &&
    !headAlreadyPublished &&
    !hasOpenOperation &&
    !isMutationRunning
  )
  const dispatchExplanation = isMutationRunning
    ? '已有写操作正在提交'
    : !summaryFresh
      ? '正在核对最新状态；上次结果只供查看'
      : hasOpenOperation
        ? '已有未结束的操作'
        : !releaseDispatchAllowed
          ? summary?.boundaries?.provider === 'github'
            ? 'GitHub Provider 只读取历史 Release，不能创建新发布'
            : deliveryReadOnlyReleasePresentation(summary).description
          : repository?.dirty
            ? '当前工作树有改动，不能创建 exact-SHA 发布'
            : !releaseVersion
              ? '正式版本目录不可用，不能创建新发布'
              : headAlreadyPublished
                ? repository?.commit === currentTargetSha
                  ? '当前 SHA 已发布并部署，无需重复发布'
                  : '当前 SHA 已有完整不可变制品，请在版本列表准备部署'
                : '当前仓库身份不可用，不能创建 exact-SHA 发布'
  const strictProof = qualityGateSummary?.proofs?.strict
  const qualityGateIdentityCurrent = Boolean(
    repository &&
    qualityGateSummary?.repository?.commit === repository.commit &&
    qualityGateSummary.repository.dirty === repository.dirty
  )
  const strictSummaryLabel = qualityGateError
    ? '摘要读取失败'
    : strictProof?.releaseEligible && qualityGateIdentityCurrent
      ? '当前 SHA 已通过'
      : strictProof?.current &&
          strictProof.status === 'passed' &&
          qualityGateIdentityCurrent
        ? '当前工作区已通过，不能作为发布证明'
        : strictProof?.current && qualityGateIdentityCurrent
          ? '当前 SHA 未通过'
          : strictProof?.receipt
            ? '最近结果属于旧版本'
            : '尚未取得严格门禁结果'
  const currentHeadRunningOnTarget = Boolean(
    repository?.commit && repository.commit === currentTargetSha
  )
  const selectedTargetFullyProven = Boolean(
    targetPassed && publicEntry?.status === 'passed'
  )
  const releaseDecision = !customerReady
    ? {
        color: 'warning',
        label: '未选择甲方',
        title: '先选择已登记甲方',
        description:
          '未确认甲方范围前，不读取目标状态，也不启用发布与部署操作。',
      }
    : initialLoading && !summary
      ? {
          color: 'processing',
          label: '正在核对',
          title: '正在读取发布与目标状态',
          description: '核对完成前只显示页面结构，不启用任何写操作。',
        }
      : !summaryFresh
        ? {
            color: 'warning',
            label: '等待最新状态',
            title: '先完成最新状态核对',
            description:
              initialLoading || refreshing
                ? '正在读取最新证据，完成前不会启用发布与部署操作。'
                : '当前只保留上次核对结果，请刷新状态后再继续。',
          }
        : hasOpenOperation
          ? {
              color: 'processing',
              label: '操作进行中',
              title: '先完成当前发布或部署操作',
              description:
                '未结束操作会持续显示在下方；完成前不会再创建新的发布请求。',
            }
          : canDispatch
            ? {
                color: 'success',
                label: '可以发布',
                title: '当前提交可发布为不可变制品',
                description:
                  '本次只生成制品，不会直接部署；制品完成后再从版本列表准备并确认目标部署。',
              }
            : headAlreadyPublished && currentHeadRunningOnTarget
              ? {
                  color: selectedTargetFullyProven ? 'success' : 'warning',
                  label: selectedTargetFullyProven ? '目标已就绪' : '仍需补证',
                  title: selectedTargetFullyProven
                    ? `当前提交已在${selectedTargetDefinition.shortLabel}运行`
                    : `当前提交已在${selectedTargetDefinition.shortLabel}运行，仍需补齐目标证据`,
                  description: selectedTargetFullyProven
                    ? '运行版本、公网入口与基础健康已完成同一 SHA 核对。'
                    : '运行 SHA 已识别，但目标预检或公网入口尚未形成完整证明。',
                }
              : headAlreadyPublished
                ? {
                    color: 'blue',
                    label: '制品已就绪',
                    title: '当前提交已有不可变制品',
                    description: `无需重复发布，请在下方版本列表核对并准备部署到${selectedTargetDefinition.shortLabel}。`,
                  }
                : !releaseDispatchAllowed
                  ? deliveryReadOnlyReleasePresentation(summary)
                  : {
                      color: 'warning',
                      label: '暂不可发布',
                      title: '先解除当前发布阻断',
                      description: dispatchExplanation,
                    }
  const operationCachePresentation = deliveryTargetCachePresentation(
    operationDetail?.metrics
  )
  const operationDetailView =
    deliveryOperationDetailPresentation(operationDetail)
  const operationDetailIdempotency = operationDetail
    ? deliveryIdempotencyPresentation(operationDetail.idempotency)
    : null
  const operationDetailRelease =
    operationDetail?.action === 'release'
      ? versions.find(
          (version) =>
            version.gitSha === operationDetail.gitSha &&
            version.version === operationDetail.version
        ) || null
      : null
  const operationReleaseServerBytes =
    operationDetailRelease?.artifactSummary?.serverImageBytes ??
    operationDetail?.metrics?.serverArchiveBytes ??
    null
  const operationReleaseWebBytes =
    operationDetailRelease?.artifactSummary?.webImageBytes ??
    operationDetail?.metrics?.webArchiveBytes ??
    null
  const operationReleaseTotalBytes =
    operationDetailRelease?.artifactSummary?.totalBytes ??
    (Number.isSafeInteger(operationReleaseServerBytes) &&
    Number.isSafeInteger(operationReleaseWebBytes)
      ? operationReleaseServerBytes + operationReleaseWebBytes
      : null)
  const operationReleaseBuildPerformance =
    operationDetail?.metrics?.buildPerformance ??
    operationDetailRelease?.buildPerformance ??
    null
  const operationReleaseMetricItems = [
    {
      key: 'total',
      label: '制品总量',
      value: Number.isSafeInteger(operationReleaseTotalBytes)
        ? formatDeliveryBytes(operationReleaseTotalBytes)
        : null,
    },
    {
      key: 'server',
      label: 'Server 镜像',
      value: Number.isSafeInteger(operationReleaseServerBytes)
        ? formatDeliveryBytes(operationReleaseServerBytes)
        : null,
    },
    {
      key: 'web',
      label: 'Web 镜像',
      value: Number.isSafeInteger(operationReleaseWebBytes)
        ? formatDeliveryBytes(operationReleaseWebBytes)
        : null,
    },
    {
      key: 'cache',
      label: '构建缓存命中率',
      value: operationReleaseBuildPerformance
        ? formatDeliveryPercent(
            operationReleaseBuildPerformance.cacheHitRateBasisPoints
          )
        : null,
    },
    {
      key: 'integrity',
      label: '制品完整性',
      value: operationDetailRelease
        ? operationDetailRelease.completeAssets
          ? `${String(operationDetailRelease.assets.length)} 项制品齐全`
          : '完整性未证明'
        : null,
    },
  ].filter((item) => item.value !== null)
  const operationTargetMetricItems =
    operationDetailView.metricsKind === 'target' && operationDetail
      ? [
          {
            key: 'transferBytes',
            label: '实际传输量',
            value:
              operationDetail.metrics.transferBytes == null
                ? null
                : formatDeliveryBytes(operationDetail.metrics.transferBytes),
          },
          {
            key: 'transferDuration',
            label: '实际传输耗时',
            value:
              operationDetail.metrics.transferDurationMs == null
                ? null
                : formatDeliveryDuration(
                    operationDetail.metrics.transferDurationMs
                  ),
          },
          {
            key: 'transferRate',
            label: '有效传输速率',
            value:
              operationDetail.metrics.transferBytesPerSecond == null
                ? null
                : formatDeliveryRate(
                    operationDetail.metrics.transferBytesPerSecond
                  ),
          },
          {
            key: 'serverArchive',
            label: 'Server 制品',
            value:
              operationDetail.metrics.serverArchiveBytes == null
                ? null
                : formatDeliveryBytes(
                    operationDetail.metrics.serverArchiveBytes
                  ),
          },
          {
            key: 'webArchive',
            label: 'Web 制品',
            value:
              operationDetail.metrics.webArchiveBytes == null
                ? null
                : formatDeliveryBytes(operationDetail.metrics.webArchiveBytes),
          },
          {
            key: 'backup',
            label: '回滚备份',
            value:
              operationDetail.metrics.backupSizeBytes == null
                ? null
                : formatDeliveryBytes(operationDetail.metrics.backupSizeBytes),
          },
          {
            key: 'targetCache',
            label: '目标内容缓存',
            value:
              operationDetail.metrics.targetCacheHit == null
                ? null
                : operationCachePresentation.status,
          },
          {
            key: 'avoidedTransfer',
            label: '减少重复传输',
            value:
              operationDetail.metrics.avoidedTransferBytes == null
                ? null
                : formatDeliveryBytes(
                    operationDetail.metrics.avoidedTransferBytes
                  ),
          },
          {
            key: 'avoidedDuration',
            label: '预计减少传输时间',
            value:
              operationDetail.metrics.avoidedTransferDurationMs == null
                ? null
                : formatDeliveryDuration(
                    operationDetail.metrics.avoidedTransferDurationMs
                  ),
          },
          {
            key: 'dockerLoad',
            label: '目标镜像加载',
            value:
              operationDetail.metrics.dockerLoadSkipped == null
                ? null
                : operationDetail.metrics.dockerLoadSkipped
                  ? '复用已有镜像，未重复加载'
                  : '已加载目标镜像',
          },
        ].filter((item) => item.value !== null)
      : []
  const operationDetailNeedsRetryCard = Boolean(
    operationDetail &&
    (operationDetail.status !== 'passed' ||
      operationDetail.idempotency.attempt > 1 ||
      operationDetail.idempotency.reuseCount > 0 ||
      operationDetail.retry.allowed)
  )
  const operationServerDigest =
    operationDetail?.metrics?.serverDigest ??
    operationDetailRelease?.imageDigests?.server ??
    null
  const operationWebDigest =
    operationDetail?.metrics?.webDigest ??
    operationDetailRelease?.imageDigests?.web ??
    null
  return {
    canDispatch,
    currentTargetRelease,
    currentTargetSha,
    customerTestRebuildEligible,
    customerTestRebuildExplanation,
    dispatchExplanation,
    hasOpenOperation,
    hasOperationHistoryFilters,
    initializationPreflight,
    initializationReady,
    isMutationRunning,
    openOperations,
    operationCachePresentation,
    operationDetailIdempotency,
    operationDetailNeedsRetryCard,
    operationDetailView,
    operationReleaseMetricItems,
    operationServerDigest,
    operationTargetMetricItems,
    operationWebDigest,
    operations,
    pollingOperationId,
    publicEntry,
    qualityGateIdentityCurrent,
    releaseDecision,
    releaseVersion,
    repository,
    selectedTargetDefinition,
    strictProof,
    strictSummaryLabel,
    target,
    targetPassed,
    versions,
  }
}
