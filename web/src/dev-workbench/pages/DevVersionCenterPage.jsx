import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  RollbackOutlined,
  ToolOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  List,
  Modal,
  Popover,
  Segmented,
  Space,
  Table,
  Tag,
  Tabs,
  Tooltip,
  Typography,
} from 'antd'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevDeliveryTimestamp from '../components/DevDeliveryTimestamp.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevPipelineTimingPanel, {
  DevPipelineStatusStrip,
  DevTimingBars,
} from '../components/DevPipelineTimingPanel.jsx'
import DevStaticGuidance from '../components/DevStaticGuidance.jsx'
import { buildDevCustomerSnapshotKey } from '../config/devCustomerScope.mjs'
import {
  DEV_DELIVERY_SOURCE_PATH,
  DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
  DEV_DELIVERY_TARGETS,
  DEV_VERSION_CENTER_HISTORY_PAGE_SIZE,
  DEV_VERSION_CENTER_VERSION_PAGE_SIZE,
  DEV_VERSION_CENTER_VIEW_HISTORY,
  DEV_VERSION_CENTER_VIEW_PIPELINE,
  DEV_VERSION_CENTER_VIEW_QUERY_KEY,
  DEV_VERSION_CENTER_VIEW_VERSIONS,
  createDeliveryIdempotencyKey,
  createDevDeliveryClient,
  deliveryIdempotencyPresentation,
  deliveryOperationMessagePresentation,
  deliveryRetryPresentation,
  deliveryStatusPresentation,
  deliveryTargetCachePresentation,
  deliveryVersionActionKind,
  deliveryVersionForTarget,
  formatDeliveryBytes,
  formatDeliveryDuration,
  formatDeliveryRate,
  resolveDevVersionCenterView,
  shortGitSha,
} from '../config/devDelivery.mjs'
import {
  formatDevSummaryCheckedAt,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
  updateDevSummarySnapshot,
} from '../config/devSummarySnapshot.mjs'
import {
  createDevQualityGateClient,
  formatQualityGateDuration,
} from '../config/devQualityGates.mjs'
import { DEV_QUALITY_GATES_ROUTE } from '../config/devRoutes.mjs'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'

const { Link, Paragraph, Text, Title } = Typography
const OPERATION_POLL_INTERVAL_MS = 1500
const OPERATION_DETAIL_FOCUS_RESTORE_FALLBACK_MS = 600
const POLLING_OPERATION_STATUSES = new Set([
  'queued',
  'running',
  'launching',
  'waiting',
])
const OPEN_OPERATION_STATUSES = new Set([
  ...POLLING_OPERATION_STATUSES,
  'ready',
])

function upsertOperation(operations, operation) {
  const currentOperations = Array.isArray(operations) ? operations : []
  if (!operation) return currentOperations
  return [
    operation,
    ...currentOperations.filter((item) => item.id !== operation.id),
  ]
}

function StatusTag({ status }) {
  const presentation = deliveryStatusPresentation(status)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

function OperationIdempotencyText({ operation }) {
  const presentation = deliveryIdempotencyPresentation(operation.idempotency)
  return <Text type="secondary">{presentation.label}</Text>
}

function issueDescription(issues = []) {
  if (!Array.isArray(issues) || issues.length === 0) return ''
  return issues.map((issue) => issue.message).join('；')
}

function operationActionLabel(action, promotionMode = null) {
  if (action === 'release') return '发布制品'
  if (action === 'promote' && promotionMode === 'initialize') {
    return '首次部署（Explicit Promotion）'
  }
  if (action === 'promote') return '显式版本提升（Explicit Promotion）'
  if (action === 'rebuild-database') return '重建目标数据库'
  return '回滚'
}

function deliveryTargetLabel(targetKey) {
  return (
    DEV_DELIVERY_TARGETS.find((target) => target.key === targetKey)?.label ||
    targetKey ||
    '目标未证明'
  )
}

function operationUpdateAction(operation) {
  return operation?.terminal ? '完成于' : '更新于'
}

function operationHistoryStatePresentation(state) {
  return (
    {
      loading: { label: '加载中', color: 'processing' },
      normal: { label: '已读回', color: 'success' },
      empty: { label: '暂无记录', color: 'default' },
      failure: { label: '不可读', color: 'error' },
      stale: { label: '上次结果', color: 'warning' },
    }[state] || { label: '不可读', color: 'error' }
  )
}

const MANUAL_TAKEOVER_STEPS = [
  {
    title: '在 Codex 或本地终端固定代码版本',
    description:
      '先完成必要验证与中文提交，再推送 GitLab main，并由镜像任务同步 GitHub；确认工作区干净，且本地 HEAD、GitLab main 都是同一个完整 40 位 SHA。',
    boundary: '本页不创建 commit、不 push，也不代替代码审查。',
  },
  {
    title: '等待 GitLab CI 证明这个 exact SHA',
    description:
      '在 GitLab Pipelines 核对同一 SHA 的 CI Gate 成功；失败、取消、仍在运行或来源不可信时都必须停止。',
    boundary: '本地通过不能替代远端 CI，旧 SHA 的绿色结果也不能复用。',
  },
  {
    title: '生成不可变 Release',
    description:
      '优先回到本页使用“发布当前 SHA”；页面不可用时，才在 GitLab 手动运行受保护的 release pipeline，并填写同一 exact SHA 和新版本号。GitHub workflow 仅作显式应急回退。',
    boundary: '不要手工创建、移动或覆盖 tag，也不要上传自行拼装的制品。',
  },
  {
    title: '在本页发起显式版本提升（Explicit Promotion）',
    description:
      '先选择 demo 项目演练造数环境或 test 甲方测试验收环境，再选择已发布版本，依次执行“准备版本提升”和“确认版本提升”；系统沿用既有 checksum、备份、migration、Compose、health/ready 与公网读回。',
    boundary: '两个固定目标都只加载已构建制品，不在目标服务器构建镜像。',
  },
  {
    title: '核对结果，必要时走正式回滚',
    description:
      '在操作记录中核对 operation、版本、digest、migration、health/ready、公网 SHA 和浏览器资源；需要恢复时只使用版本行的“检查回滚”和“确认回滚”。',
    boundary:
      'failed、blocked 或 not_proven 先查明回执，不直接重复执行同一写操作。',
  },
]

function ManualTakeoverGuide() {
  return (
    <div className="erp-dev-version-takeover-guide">
      <Alert
        type="info"
        showIcon
        message="人工接管仍走同一套 exact-SHA 正式流程"
        description="适用于 AI 暂时不可用或你选择亲自操作；它只解释现有入口，不新增绕过门禁的一键发布、第二套流水线或后台任务。"
      />

      <section aria-labelledby="dev-version-takeover-scope-title">
        <Title level={5} id="dev-version-takeover-scope-title">
          四处操作各管什么
        </Title>
        <div className="erp-dev-version-takeover-scope">
          <article>
            <Text strong>Codex / 本地终端</Text>
            <Text type="secondary">检查改动、运行测试、提交并推送代码</Text>
          </article>
          <article>
            <Text strong>GitLab 代码与 CI</Text>
            <Text type="secondary">代码真源、质量门禁和不可变 Release</Text>
          </article>
          <article>
            <Text strong>GitHub 只读镜像</Text>
            <Text type="secondary">
              供 GPT Review 和外部代码浏览，不重复跑主链 CI
            </Text>
          </article>
          <article>
            <Text strong>当前页面</Text>
            <Text type="secondary">看状态、发布制品、部署、回滚和查回执</Text>
          </article>
        </div>
      </section>

      <section aria-labelledby="dev-version-takeover-conditions-title">
        <Title level={5} id="dev-version-takeover-conditions-title">
          先判断能不能继续
        </Title>
        <div className="erp-dev-version-takeover-conditions">
          <article>
            <Tag color="success">可以继续</Tag>
            <ul>
              <li>工作区干净，本地与 origin/main 的完整 SHA 一致</li>
              <li>页面刚刷新且状态真源可读，没有其他未结束 operation</li>
              <li>当前 SHA 的 CI、Release 或目标预检已明确通过</li>
            </ul>
          </article>
          <article>
            <Tag color="warning">必须停止</Tag>
            <ul>
              <li>存在未提交改动、SHA 不一致或远端结果属于其他提交</li>
              <li>CI 失败、取消或未完成，manifest、checksum、digest 不完整</li>
              <li>已有操作仍在执行，或结果为 failed、blocked、not_proven</li>
            </ul>
          </article>
        </div>
      </section>

      <section aria-labelledby="dev-version-takeover-steps-title">
        <Title level={5} id="dev-version-takeover-steps-title">
          人工接管顺序
        </Title>
        <ol className="erp-dev-version-takeover-steps">
          {MANUAL_TAKEOVER_STEPS.map((step, index) => (
            <li key={step.title}>
              <span aria-hidden="true">{index + 1}</span>
              <div>
                <Text strong>{step.title}</Text>
                <Paragraph>{step.description}</Paragraph>
                <Text type="secondary">{step.boundary}</Text>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <Alert
        type="warning"
        showIcon
        message="应急不等于绕过"
        description="禁止 force push、跳过质量门禁、手工覆盖 tag 或目标页面文件、在目标服务器构建镜像、直接执行结构性 SQL、删除数据库或 volume、全局 prune，以及在结果未证明时盲目重试。"
      />
      <Text type="secondary">
        AI 恢复后，把最终 exact SHA、GitLab pipeline、Release version 和
        operation ID 交给
        Codex，即可从现有回执继续核验，无需重做已被可信证明的步骤。
      </Text>
    </div>
  )
}

export default function DevVersionCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
  })
  const customerReady = customerScope.status === 'ready'
  const deliverySnapshotKey = customerReady
    ? buildDevCustomerSnapshotKey(
        DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
        customerScope.customerKey
      )
    : ''
  const requestedView =
    searchParams.get(DEV_VERSION_CENTER_VIEW_QUERY_KEY) || ''
  const activeView = resolveDevVersionCenterView(requestedView)
  const client = useMemo(() => createDevDeliveryClient(), [])
  const qualityGateClient = useMemo(() => createDevQualityGateClient(), [])
  const initialSnapshot = useMemo(
    () =>
      deliverySnapshotKey ? readDevSummarySnapshot(deliverySnapshotKey) : null,
    [deliverySnapshotKey]
  )
  const [storedSummary, setStoredSummary] = useState(
    initialSnapshot?.summary || null
  )
  const [summarySnapshotKey, setSummarySnapshotKey] =
    useState(deliverySnapshotKey)
  const summaryRef = useRef(initialSnapshot?.summary || null)
  const summarySnapshotKeyRef = useRef(deliverySnapshotKey)
  const activeDeliverySnapshotKeyRef = useRef(deliverySnapshotKey)
  activeDeliverySnapshotKeyRef.current = deliverySnapshotKey
  const [initialLoading, setInitialLoading] = useState(
    Boolean(deliverySnapshotKey && !initialSnapshot)
  )
  const [refreshing, setRefreshing] = useState(false)
  const [storedSummaryFresh, setStoredSummaryFresh] = useState(false)
  const [checkedAt, setCheckedAt] = useState(initialSnapshot?.checkedAt || '')
  const [actionKey, setActionKey] = useState('')
  const [loadError, setLoadError] = useState('')
  const [manualTakeoverOpen, setManualTakeoverOpen] = useState(false)
  const [releaseModalOpen, setReleaseModalOpen] = useState(false)
  const [confirmOperation, setConfirmOperation] = useState(null)
  const [confirmationText, setConfirmationText] = useState('')
  const [operationDetail, setOperationDetail] = useState(null)
  const [operationDetailLoading, setOperationDetailLoading] = useState(false)
  const [operationPollError, setOperationPollError] = useState('')
  const [versionPage, setVersionPage] = useState(1)
  const [historyPage, setHistoryPage] = useState(1)
  const [selectedTargetKey, setSelectedTargetKey] = useState('demo-133')
  const [qualityGateSummary, setQualityGateSummary] = useState(null)
  const [qualityGateError, setQualityGateError] = useState('')
  const mutationInFlightRef = useRef(false)
  const refreshRequestRef = useRef(0)
  const qualityGateRequestRef = useRef(0)
  const operationDetailRequestRef = useRef(0)
  const workspaceRef = useRef(null)
  const versionTableRef = useRef(null)
  const historyTableRef = useRef(null)
  const operationDetailTriggerRef = useRef(null)
  const operationDetailFocusRestoreTimerRef = useRef(null)
  const manualTakeoverTriggerRef = useRef(null)
  const summaryInCurrentScope =
    customerReady && summarySnapshotKey === deliverySnapshotKey
  const summary = summaryInCurrentScope ? storedSummary : null
  const summaryFresh = summaryInCurrentScope && storedSummaryFresh
  const deliveryProviderName =
    summary?.boundaries?.provider === 'github' ? 'GitHub 应急链' : 'GitLab'

  const restoreOperationDetailTriggerFocus = useCallback(() => {
    const trigger = operationDetailTriggerRef.current
    const { activeElement } = document
    if (
      !trigger?.isConnected ||
      (activeElement &&
        activeElement !== document.body &&
        activeElement !== trigger &&
        activeElement.isConnected)
    ) {
      return false
    }
    trigger.focus({ preventScroll: true })
    if (document.activeElement !== trigger) return false
    operationDetailTriggerRef.current = null
    return true
  }, [])

  const clearOperationDetailFocusRestoreTimer = useCallback(() => {
    if (operationDetailFocusRestoreTimerRef.current !== null) {
      window.clearTimeout(operationDetailFocusRestoreTimerRef.current)
      operationDetailFocusRestoreTimerRef.current = null
    }
  }, [])

  const closeOperationDetail = useCallback(() => {
    operationDetailRequestRef.current += 1
    setOperationDetail(null)
    clearOperationDetailFocusRestoreTimer()
    // 快速关闭可能打断 Drawer 动画回调，仍在关闭截止后恢复原触发点。
    operationDetailFocusRestoreTimerRef.current = window.setTimeout(() => {
      operationDetailFocusRestoreTimerRef.current = null
      restoreOperationDetailTriggerFocus()
      operationDetailTriggerRef.current = null
    }, OPERATION_DETAIL_FOCUS_RESTORE_FALLBACK_MS)
  }, [
    clearOperationDetailFocusRestoreTimer,
    restoreOperationDetailTriggerFocus,
  ])

  useEffect(
    () => () => {
      clearOperationDetailFocusRestoreTimer()
    },
    [clearOperationDetailFocusRestoreTimer]
  )

  useEffect(() => {
    if (requestedView === activeView) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(DEV_VERSION_CENTER_VIEW_QUERY_KEY, activeView)
    setSearchParams(nextParams, { replace: true })
  }, [activeView, requestedView, searchParams, setSearchParams])

  const selectView = useCallback(
    (nextView) => {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set(
        DEV_VERSION_CENTER_VIEW_QUERY_KEY,
        resolveDevVersionCenterView(nextView)
      )
      setSearchParams(nextParams)
    },
    [searchParams, setSearchParams]
  )

  const openPipelineDetails = useCallback(() => {
    selectView(DEV_VERSION_CENTER_VIEW_PIPELINE)
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollIntoView({ block: 'start' })
    })
  }, [selectView])

  const updateSummary = useCallback(
    (update) => {
      if (
        !deliverySnapshotKey ||
        activeDeliverySnapshotKeyRef.current !== deliverySnapshotKey ||
        summarySnapshotKeyRef.current !== deliverySnapshotKey
      ) {
        return summaryRef.current
      }
      const { current } = summaryRef
      const next = typeof update === 'function' ? update(current) : update
      if (!next) return current
      summaryRef.current = next
      updateDevSummarySnapshot(deliverySnapshotKey, () => next)
      setStoredSummary(next)
      return next
    },
    [deliverySnapshotKey]
  )

  const refreshQualityGate = useCallback(
    async (requestedSnapshotKey) => {
      if (
        !requestedSnapshotKey ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      const requestId = qualityGateRequestRef.current + 1
      qualityGateRequestRef.current = requestId
      try {
        const next = await qualityGateClient.summary()
        if (
          qualityGateRequestRef.current !== requestId ||
          activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
        ) {
          return false
        }
        setQualityGateSummary(next)
        setQualityGateError('')
        return true
      } catch {
        if (
          qualityGateRequestRef.current !== requestId ||
          activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
        ) {
          return false
        }
        setQualityGateError('严格门禁摘要暂时不可用')
        return false
      }
    },
    [qualityGateClient]
  )

  const refresh = useCallback(async () => {
    const requestedSnapshotKey = deliverySnapshotKey
    if (
      !customerReady ||
      !requestedSnapshotKey ||
      activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
    ) {
      return false
    }
    refreshQualityGate(requestedSnapshotKey)
    const requestId = refreshRequestRef.current + 1
    refreshRequestRef.current = requestId
    const hasVisibleSummary = Boolean(
      summarySnapshotKeyRef.current === requestedSnapshotKey &&
        summaryRef.current
    )
    setInitialLoading(!hasVisibleSummary)
    setRefreshing(hasVisibleSummary)
    setStoredSummaryFresh(false)
    setLoadError('')
    try {
      const snapshot = await loadDevSummarySnapshot(requestedSnapshotKey, () =>
        client.summary()
      )
      if (
        refreshRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      summarySnapshotKeyRef.current = requestedSnapshotKey
      summaryRef.current = snapshot.summary
      setSummarySnapshotKey(requestedSnapshotKey)
      setStoredSummary(snapshot.summary)
      setCheckedAt(snapshot.checkedAt)
      setStoredSummaryFresh(true)
      return true
    } catch (error) {
      if (
        refreshRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      setLoadError(error?.message || '版本中心状态读取失败')
      return false
    } finally {
      if (
        refreshRequestRef.current === requestId &&
        activeDeliverySnapshotKeyRef.current === requestedSnapshotKey
      ) {
        setInitialLoading(false)
        setRefreshing(false)
      }
    }
  }, [client, customerReady, deliverySnapshotKey, refreshQualityGate])

  useEffect(() => {
    refreshRequestRef.current += 1
    qualityGateRequestRef.current += 1
    operationDetailRequestRef.current += 1
    const snapshot = deliverySnapshotKey
      ? readDevSummarySnapshot(deliverySnapshotKey)
      : null
    summarySnapshotKeyRef.current = deliverySnapshotKey
    summaryRef.current = snapshot?.summary || null
    setSummarySnapshotKey(deliverySnapshotKey)
    setStoredSummary(snapshot?.summary || null)
    setCheckedAt(snapshot?.checkedAt || '')
    setStoredSummaryFresh(false)
    setLoadError('')
    setQualityGateSummary(null)
    setQualityGateError('')
    setOperationPollError('')
    setOperationDetail(null)
    setOperationDetailLoading(false)
    setReleaseModalOpen(false)
    setConfirmOperation(null)
    setConfirmationText('')

    if (!customerReady) {
      setInitialLoading(false)
      setRefreshing(false)
      return undefined
    }
    refresh()
    return () => {
      refreshRequestRef.current += 1
      qualityGateRequestRef.current += 1
      operationDetailRequestRef.current += 1
    }
  }, [customerReady, deliverySnapshotKey, refresh])

  const performAction = useCallback(
    async (key, action, payload) => {
      const requestedSnapshotKey = deliverySnapshotKey
      if (
        !customerReady ||
        !requestedSnapshotKey ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey ||
        !summaryFresh ||
        mutationInFlightRef.current
      ) {
        return false
      }
      mutationInFlightRef.current = true
      setActionKey(key)
      try {
        await client.action(action, payload)
        if (activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey) {
          return false
        }
        message.success(
          action === 'dispatch-release'
            ? `${deliveryProviderName}发布任务已登记`
            : action === 'retry-operation'
              ? '已创建关联的新尝试'
              : action === 'prepare-promotion'
                ? '部署准备结果已登记'
                : action === 'prepare-rollback'
                  ? '回滚资格结果已登记'
                  : '部署执行器已启动，请按 operation 跟踪'
        )
        await refresh()
        return true
      } catch (error) {
        if (activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey) {
          return false
        }
        message.error(error?.message || '操作未完成')
        await refresh()
        return false
      } finally {
        mutationInFlightRef.current = false
        setActionKey('')
      }
    },
    [
      client,
      customerReady,
      deliveryProviderName,
      deliverySnapshotKey,
      refresh,
      summaryFresh,
    ]
  )

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
  const historyOperations = operations.filter(
    (operation) => !OPEN_OPERATION_STATUSES.has(operation.status)
  )
  const operationHistoryState = initialLoading
    ? 'loading'
    : loadError && !summary
      ? 'failure'
      : summary && !summaryFresh
        ? 'stale'
        : historyOperations.length === 0
          ? 'empty'
          : 'normal'
  const operationHistoryPresentation = operationHistoryStatePresentation(
    operationHistoryState
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
  const initializationReady = Boolean(
    initializationPreflight?.status === 'eligible' &&
      initializationPreflight?.remote?.rootState === 'absent' &&
      initializationPreflight?.blockers?.length === 0
  )
  const headAlreadyPublished = Boolean(
    currentHeadRelease?.status === 'published' &&
      currentHeadRelease?.completeAssets === true
  )
  const canDispatch = Boolean(
    summaryFresh &&
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
        : repository?.dirty
          ? '当前工作树有改动，不能创建 exact-SHA 发布'
          : !releaseVersion
            ? '正式版本目录不可用，不能创建新发布'
            : headAlreadyPublished
              ? repository?.commit === currentTargetSha
                ? '当前 SHA 已发布并部署，无需重复发布'
                : '当前 SHA 已有完整不可变制品，请在版本列表准备版本提升'
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
  const operationCachePresentation = deliveryTargetCachePresentation(
    operationDetail?.metrics
  )
  const refreshBusy = initialLoading || refreshing
  const refreshStatusText = initialLoading
    ? '正在读取最新状态'
    : refreshing
      ? `正在后台核对，当前显示 ${formatDevSummaryCheckedAt(checkedAt)} 的结果`
      : summaryFresh
        ? `已核对 ${formatDevSummaryCheckedAt(checkedAt)}`
        : summary
          ? `显示 ${formatDevSummaryCheckedAt(checkedAt)} 的上次结果，写操作暂不可用`
          : '尚未取得可用状态'

  useEffect(() => {
    const pageCount = Math.max(
      1,
      Math.ceil(versions.length / DEV_VERSION_CENTER_VERSION_PAGE_SIZE)
    )
    setVersionPage((current) => Math.min(current, pageCount))
  }, [versions.length])

  useEffect(() => {
    const pageCount = Math.max(
      1,
      Math.ceil(historyOperations.length / DEV_VERSION_CENTER_HISTORY_PAGE_SIZE)
    )
    setHistoryPage((current) => Math.min(current, pageCount))
  }, [historyOperations.length])

  const changeTablePage = useCallback((setPage, tableRef, nextPage) => {
    setPage(nextPage)
    window.requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ block: 'start' })
    })
  }, [])

  useEffect(() => {
    if (!pollingOperationId) {
      setOperationPollError('')
      return undefined
    }

    let cancelled = false
    let timer = 0
    const poll = async () => {
      try {
        const operation = await client.operation(pollingOperationId)
        if (cancelled) return
        setOperationPollError('')
        updateSummary((current) =>
          current
            ? {
                ...current,
                operations: upsertOperation(
                  current.operations || [],
                  operation
                ),
              }
            : current
        )
        if (!POLLING_OPERATION_STATUSES.has(operation.status)) {
          await refresh()
          return
        }
      } catch (error) {
        if (cancelled) return
        setOperationPollError(error?.message || 'Operation 状态读取暂时失败')
      }
      if (!cancelled) {
        timer = window.setTimeout(poll, OPERATION_POLL_INTERVAL_MS)
      }
    }

    timer = window.setTimeout(poll, OPERATION_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [client, pollingOperationId, refresh, updateSummary])

  const submitRelease = async () => {
    if (!repository || !summaryFresh) return
    const succeeded = await performAction(
      'dispatch-release',
      'dispatch-release',
      {
        gitSha: repository.commit,
        version: releaseVersion,
        idempotencyKey: createDeliveryIdempotencyKey('release'),
      }
    )
    if (succeeded) setReleaseModalOpen(false)
  }

  const openOperationDetail = async (operation, trigger) => {
    const requestedSnapshotKey = deliverySnapshotKey
    if (
      !summaryInCurrentScope ||
      activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
    ) {
      return
    }
    const requestId = operationDetailRequestRef.current + 1
    operationDetailRequestRef.current = requestId
    clearOperationDetailFocusRestoreTimer()
    operationDetailTriggerRef.current = trigger
    setOperationDetail(operation)
    setOperationDetailLoading(true)
    try {
      const nextOperation = await client.operation(operation.id)
      if (
        operationDetailRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return
      }
      setOperationDetail(nextOperation)
    } catch (error) {
      if (
        operationDetailRequestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return
      }
      message.error(error?.message || 'Operation 详情读取失败')
    } finally {
      if (
        operationDetailRequestRef.current === requestId &&
        activeDeliverySnapshotKeyRef.current === requestedSnapshotKey
      ) {
        setOperationDetailLoading(false)
      }
    }
  }

  const versionColumns = [
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          <Text type="secondary" code>
            {shortGitSha(record.gitSha)}
          </Text>
          <DevDeliveryTimestamp
            value={record.publishedAt}
            action="发布于"
            missing="发布时间未证明"
            className="erp-dev-version-published-at"
          />
        </Space>
      ),
    },
    {
      title: '发布状态',
      dataIndex: 'status',
      key: 'status',
      render: (value, record) => (
        <Space direction="vertical" size={2}>
          <StatusTag status={value} />
          <Text type="secondary">
            {record.completeAssets
              ? record.promotionEligible
                ? 'v2 · 7 项制品 · 可部署'
                : record.assets.includes('release-rehearsal.json')
                  ? 'v2 · 7 项制品 · 证据未闭合'
                  : 'v1 · 6 项制品 · 仅旧版回滚'
              : '制品不完整'}
          </Text>
        </Space>
      ),
    },
    {
      title: '制品与缓存',
      key: 'artifacts',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>
            {formatDeliveryBytes(record.artifactSummary.totalBytes)}
          </Text>
          <Text type="secondary">
            Server{' '}
            {formatDeliveryBytes(record.artifactSummary.serverImageBytes)}
            {' · '}Web{' '}
            {formatDeliveryBytes(record.artifactSummary.webImageBytes)}
          </Text>
          <Text type="secondary">
            BuildKit{' '}
            {record.buildPerformance
              ? `${(record.buildPerformance.cacheHitRateBasisPoints / 100).toFixed(1)}% 命中`
              : '命中率未证明'}
          </Text>
        </Space>
      ),
    },
    {
      title: selectedTargetDefinition.shortLabel,
      key: 'target',
      render: (_value, record) =>
        record.gitSha === currentTargetSha ? (
          <Tag color="success">当前运行</Tag>
        ) : (
          <Text type="secondary">未部署</Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'right',
      render: (_value, record) => {
        const actionKind = deliveryVersionActionKind(record)
        const targetActionReady =
          actionKind === 'initialize' ? initializationReady : targetPassed
        const baseEligible =
          summaryFresh &&
          record.status === 'published' &&
          record.completeAssets === true &&
          record.gitSha !== currentTargetSha &&
          targetActionReady &&
          !hasOpenOperation &&
          !isMutationRunning
        const promotionEligible =
          baseEligible &&
          ['initialize', 'promote'].includes(actionKind) &&
          record.promotionEligible === true
        const rollbackEligible =
          baseEligible &&
          actionKind === 'rollback' &&
          currentTargetRelease?.status === 'published' &&
          currentTargetRelease?.completeAssets === true
        const promotionExplanation = isMutationRunning
          ? '已有写操作正在提交，请等待当前请求完成'
          : !summaryFresh
            ? '正在核对最新状态；上次结果只供查看，暂不能执行'
            : hasOpenOperation
              ? '已有未结束的 operation，请先完成或核对该操作'
              : !targetActionReady
                ? actionKind === 'initialize'
                  ? `${selectedTargetDefinition.shortLabel}首次部署预检未通过，先处理容量、基础镜像或资源冲突`
                  : `${selectedTargetDefinition.shortLabel}只读预检未通过，先处理容量或运行态阻断`
                : !record.completeAssets
                  ? '不可变发布制品不完整'
                  : !record.promotionEligible &&
                      ['initialize', 'promote'].includes(actionKind)
                    ? '旧 v1 六资产版本仅可读取和回滚，不能用于新部署'
                    : record.gitSha === currentTargetSha
                      ? `该 exact SHA 已在${selectedTargetDefinition.shortLabel}运行`
                      : actionKind === 'rollback'
                        ? `该版本是${selectedTargetDefinition.shortLabel}当前版本的 Git 祖先，应先检查回滚资格`
                        : actionKind === 'blocked'
                          ? record.actionReason === 'git_histories_diverged'
                            ? `该版本与${selectedTargetDefinition.shortLabel}当前版本的 Git 历史已分叉，禁止部署或回滚`
                            : record.actionReason ===
                                'target_identity_unavailable'
                              ? `${selectedTargetDefinition.shortLabel}当前 exact SHA 不可用，无法判断部署方向`
                              : 'Git 祖先关系不可证明，禁止猜测部署或回滚'
                          : ''
        return (
          <Space wrap>
            <Tooltip title={promotionEligible ? '' : promotionExplanation}>
              <Button
                icon={<CloudDownloadOutlined />}
                disabled={!promotionEligible}
                loading={actionKey === `prepare:${record.gitSha}`}
                onClick={() =>
                  performAction(
                    `prepare:${record.gitSha}`,
                    'prepare-promotion',
                    {
                      gitSha: record.gitSha,
                      version: record.version,
                      target: selectedTargetKey,
                      idempotencyKey: createDeliveryIdempotencyKey('promote'),
                    }
                  )
                }
              >
                {actionKind === 'initialize' ? '准备首次部署' : '准备版本提升'}
              </Button>
            </Tooltip>
            <Tooltip
              title={
                rollbackEligible
                  ? '只准备资格检查；migration 或客户配置指纹不一致会阻断'
                  : currentTargetRelease
                    ? actionKind === 'promote'
                      ? `该版本不早于${selectedTargetDefinition.shortLabel}当前版本，应走显式版本提升`
                      : promotionExplanation
                    : `${selectedTargetDefinition.shortLabel}当前 SHA 没有完整不可变 manifest，不能普通回滚`
              }
            >
              <Button
                icon={<RollbackOutlined />}
                disabled={!rollbackEligible}
                loading={actionKey === `rollback:${record.gitSha}`}
                onClick={() =>
                  performAction(
                    `rollback:${record.gitSha}`,
                    'prepare-rollback',
                    {
                      fromGitSha: currentTargetRelease.gitSha,
                      fromVersion: currentTargetRelease.version,
                      toGitSha: record.gitSha,
                      toVersion: record.version,
                      target: selectedTargetKey,
                      idempotencyKey: createDeliveryIdempotencyKey('rollback'),
                    }
                  )
                }
              >
                检查回滚
              </Button>
            </Tooltip>
          </Space>
        )
      },
    },
  ]

  const renderOperationActions = (record) => {
    const readyToExecute =
      record.status === 'ready' &&
      ['promote', 'rollback'].includes(record.action)
    const executable = summaryFresh && readyToExecute
    const retryable = record.retry?.allowed === true
    const retryEligible =
      summaryFresh && retryable && !isMutationRunning && !hasOpenOperation
    return (
      <Space wrap>
        <Button
          onClick={(event) => openOperationDetail(record, event.currentTarget)}
        >
          查看详情
        </Button>
        {executable ? (
          <Button
            type="primary"
            danger={record.action === 'rollback'}
            disabled={isMutationRunning}
            icon={
              record.action === 'rollback' ? (
                <RollbackOutlined />
              ) : (
                <DeploymentUnitOutlined />
              )
            }
            onClick={() => {
              setConfirmOperation(record)
              setConfirmationText('')
            }}
          >
            {record.action === 'rollback'
              ? '确认回滚'
              : record.promotionMode === 'initialize'
                ? '确认首次部署'
                : '确认版本提升'}
          </Button>
        ) : retryable ? (
          <Tooltip
            title={
              retryEligible
                ? '沿用原动作、固定目标、Exact-SHA、版本和发布输入，创建有关联的新尝试'
                : hasOpenOperation
                  ? '已有未结束的 operation，请先完成或核对该操作'
                  : !summaryFresh
                    ? '等待最新状态核对'
                    : '已有写操作正在提交'
            }
          >
            <Button
              icon={<ReloadOutlined />}
              disabled={!retryEligible}
              loading={actionKey === `retry:${record.id}`}
              onClick={() =>
                performAction(`retry:${record.id}`, 'retry-operation', {
                  operationId: record.id,
                  idempotencyKey: createDeliveryIdempotencyKey('retry'),
                })
              }
            >
              再次尝试
            </Button>
          </Tooltip>
        ) : (
          <Text type="secondary">
            {readyToExecute && !summaryFresh
              ? '等待最新状态核对'
              : deliveryRetryPresentation(record.retry)}
          </Text>
        )}
      </Space>
    )
  }

  const operationColumns = [
    {
      title: '动作',
      key: 'action',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>
            {operationActionLabel(record.action, record.promotionMode)}
          </Text>
          <Text type="secondary" code>
            {record.id.slice(0, 8)}
          </Text>
        </Space>
      ),
    },
    {
      title: '目标',
      key: 'target',
      render: (_value, record) => deliveryTargetLabel(record.target),
    },
    {
      title: '版本身份',
      key: 'identity',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{record.version}</Text>
          <Text type="secondary" code>
            {shortGitSha(record.gitSha)}
          </Text>
        </Space>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <StatusTag status={record.status} />
          <OperationIdempotencyText operation={record} />
          {record.issues.length > 0 ? (
            <Text type="danger">{issueDescription(record.issues)}</Text>
          ) : (
            <Text
              type="secondary"
              title={
                deliveryOperationMessagePresentation(
                  record.events.at(-1)?.message
                ).title
              }
            >
              {
                deliveryOperationMessagePresentation(
                  record.events.at(-1)?.message
                ).label
              }
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '时间',
      key: 'time',
      width: 220,
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <DevDeliveryTimestamp
            value={record.createdAt}
            action="开始于"
            missing="开始时间未证明"
            className="erp-dev-operation-history-time"
          />
          <DevDeliveryTimestamp
            value={record.updatedAt}
            action={operationUpdateAction(record)}
            missing="完成时间未证明"
            className="erp-dev-operation-history-time"
          />
        </Space>
      ),
    },
    {
      title: '耗时',
      key: 'duration',
      render: (_value, record) => (
        <Space direction="vertical" size={2}>
          <Text>{formatDeliveryDuration(record.durationMs)}</Text>
          <Text type="secondary">
            {record.stages.length > 0
              ? `${String(record.stages.length)} 个可见环节`
              : '暂无环节明细'}
          </Text>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      align: 'right',
      render: (_value, record) => renderOperationActions(record),
    },
  ]

  const workspaceItems = [
    {
      key: DEV_VERSION_CENTER_VIEW_VERSIONS,
      label: '版本与部署',
      children: (
        <section
          ref={versionTableRef}
          className="erp-dev-version-tab erp-dev-version-tab--versions"
          aria-label="版本与部署"
        >
          <Card
            title="可部署版本"
            className="erp-dev-version-table-card"
            extra={<Text type="secondary">最多展示最近 20 个</Text>}
          >
            <Table
              rowKey="gitSha"
              columns={versionColumns}
              dataSource={versions}
              loading={initialLoading}
              pagination={{
                current: versionPage,
                pageSize: DEV_VERSION_CENTER_VERSION_PAGE_SIZE,
                hideOnSinglePage: true,
                showSizeChanger: false,
                showTotal: (total, range) =>
                  `${String(range[0])}-${String(range[1])} / 共 ${String(total)} 个版本`,
                onChange: (nextPage) =>
                  changeTablePage(setVersionPage, versionTableRef, nextPage),
              }}
              locale={{
                emptyText: (
                  <Empty
                    description={`尚无完整${deliveryProviderName}不可变发布版本`}
                  />
                ),
              }}
              scroll={{ x: 1120 }}
            />
          </Card>
        </section>
      ),
    },
    {
      key: DEV_VERSION_CENTER_VIEW_PIPELINE,
      label: 'CI/CD 效能',
      children: (
        <section
          className="erp-dev-version-tab erp-dev-version-tab--pipeline"
          aria-label="CI/CD 效能"
        >
          <DevPipelineTimingPanel
            timings={summary?.timings}
            versions={versions}
          />
        </section>
      ),
    },
    {
      key: DEV_VERSION_CENTER_VIEW_HISTORY,
      label: '操作记录',
      children: (
        <section
          ref={historyTableRef}
          className="erp-dev-version-tab erp-dev-version-tab--history"
          aria-label="操作记录"
        >
          <Card
            title="工作台操作记录（已结束）"
            className="erp-dev-version-table-card"
            extra={
              <Tag color={operationHistoryPresentation.color}>
                {operationHistoryPresentation.label}
              </Tag>
            }
          >
            {operationHistoryState === 'stale' ? (
              <Alert
                type="warning"
                showIcon
                message="当前显示上次成功读回的操作记录"
                description="最新 operation store 不可读或仍在重新核对；记录可查看，但所有写操作保持停用。"
              />
            ) : null}
            {operationHistoryState === 'failure' ? (
              <Alert
                type="error"
                showIcon
                message="工作台 operation store 当前不可读"
                description="未使用 GitLab Pipeline、Package、Release、Codex 对话或普通 SSH 动作补造操作记录。"
              />
            ) : null}
            <Table
              rowKey="id"
              columns={operationColumns}
              dataSource={historyOperations}
              loading={initialLoading}
              pagination={{
                current: historyPage,
                pageSize: DEV_VERSION_CENTER_HISTORY_PAGE_SIZE,
                hideOnSinglePage: true,
                showSizeChanger: false,
                showTotal: (total, range) =>
                  `${String(range[0])}-${String(range[1])} / 共 ${String(total)} 条记录`,
                onChange: (nextPage) =>
                  changeTablePage(setHistoryPage, historyTableRef, nextPage),
              }}
              locale={{
                emptyText: (
                  <Empty description="尚无工作台发起并已结束的 release、promotion、rebuild 或 rollback" />
                ),
              }}
              scroll={{ x: 980 }}
            />
          </Card>
        </section>
      ),
    },
  ]

  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-version-page">
      <DevPageNav sourcePath={DEV_DELIVERY_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <DeploymentUnitOutlined aria-hidden="true" />
          </span>
          <Title level={1} className="erp-dev-hub-title">
            版本发布与部署中心
          </Title>
          <Paragraph className="erp-dev-hub-summary">
            以 exact SHA 选择同一不可变版本，分别显式提升到 demo
            项目演练造数环境或 test 甲方测试验收环境。每个目标、每次动作都有独立
            operation；代码推送不会自动部署，失败、阻断或结果未证明后不会自动重试。
          </Paragraph>
        </div>
        <Space direction="vertical" size={4}>
          <Space wrap>
            <Button
              icon={<ReloadOutlined />}
              loading={refreshBusy}
              disabled={!customerReady}
              onClick={refresh}
            >
              刷新状态
            </Button>
            <Button
              ref={manualTakeoverTriggerRef}
              icon={<ToolOutlined />}
              onClick={() => setManualTakeoverOpen(true)}
            >
              人工接管说明
            </Button>
            <Space size={8}>
              <Tooltip title={canDispatch ? '' : dispatchExplanation}>
                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  disabled={!canDispatch}
                  onClick={() => setReleaseModalOpen(true)}
                >
                  发布当前 SHA
                </Button>
              </Tooltip>
              <Popover
                placement="bottomRight"
                trigger={['hover', 'click']}
                content={
                  <Space
                    direction="vertical"
                    size={4}
                    style={{ maxWidth: 360 }}
                  >
                    <Text strong>先发布制品，不会直接部署到任一目标</Text>
                    <Text>
                      系统会将当前干净提交的 exact SHA 交给
                      {deliveryProviderName}
                      ，执行严格质量门禁并生成不可变镜像、Release
                      manifest、checksum 和 SBOM。
                    </Text>
                    <Text type="secondary">
                      发布完成后，仍需在版本列表中依次执行“准备版本提升”和“确认版本提升”。
                    </Text>
                  </Space>
                }
              >
                <Button
                  type="text"
                  shape="circle"
                  size="small"
                  icon={<QuestionCircleOutlined />}
                  aria-label="查看发布当前 SHA 说明"
                />
              </Popover>
            </Space>
          </Space>
          <Text type="secondary" role="status" aria-live="polite">
            {refreshStatusText}
          </Text>
        </Space>
      </header>

      <DevCustomerScopeSelector
        scope={customerScope}
        onChange={customerScope.selectCustomer}
        disabled={isMutationRunning}
        note="版本、部署与回滚只读取永绅登记的 demo 与 test 两个固定目标；admin 仅是应用管理入口，不属于部署环境。"
        invalidDescription="当前甲方没有登记发布目标；版本、部署、回滚与目标状态读取均已停止。"
      />

      <main className="erp-dev-hub-shell erp-dev-version-shell">
        {loadError ? (
          <Alert
            type={summary ? 'warning' : 'error'}
            showIcon
            message={summary ? '最新状态核对失败' : '版本中心不可用'}
            description={
              summary
                ? `${loadError}；当前保留上次结果，写操作已停用。`
                : loadError
            }
          />
        ) : null}
        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="部分状态未能证明"
            description={issueDescription(summary.issues)}
          />
        ) : null}
        {operationPollError ? (
          <Alert
            type="warning"
            showIcon
            message="Operation 状态刷新暂时中断"
            description={`${operationPollError}；页面会继续有界重试，也可手动刷新状态。`}
          />
        ) : null}
        <DevStaticGuidance title="固定边界" hint="发布职责与安全限制">
          GitLab 负责代码真源、CI 与不可变制品；GitHub 仅接收单向审查镜像；本地
          Bridge 只接受固定动作；demo 与 test
          均不构建、不接受浏览器传入的命令、目录、仓库或 SSH
          目标。两个目标共享不可变版本，但数据库、附件、运行资源、备份与回滚点相互隔离。
        </DevStaticGuidance>

        <section
          className="erp-dev-version-target-selector"
          aria-label="部署目标选择"
        >
          <div className="erp-dev-version-target-selector__heading">
            <div>
              <Text strong>当前操作目标</Text>
              <Text type="secondary">
                先选目标，再查看该目标的版本方向、预检、promotion 与回滚资格。
              </Text>
            </div>
            <Segmented
              value={selectedTargetKey}
              options={DEV_DELIVERY_TARGETS.map((item) => ({
                label: item.label,
                value: item.key,
              }))}
              onChange={setSelectedTargetKey}
            />
          </div>
          <div className="erp-dev-version-target-selector__boundaries">
            {DEV_DELIVERY_TARGETS.map((item) => (
              <article
                key={item.key}
                data-selected={
                  item.key === selectedTargetKey ? 'true' : 'false'
                }
              >
                <Space wrap size={6}>
                  <Text strong>{item.label}</Text>
                  <Tag
                    color={item.key === selectedTargetKey ? 'blue' : 'default'}
                  >
                    {item.key}
                  </Tag>
                </Space>
                <Text type="secondary">{item.dataBoundary}</Text>
              </article>
            ))}
          </div>
        </section>

        <section
          className="erp-dev-version-quality-gate-summary"
          aria-label="当前发布 SHA 严格门禁摘要"
        >
          <div>
            <Space wrap size={8}>
              <Text strong>当前发布 SHA 严格门禁</Text>
              <Tag
                color={
                  strictProof?.releaseEligible && qualityGateIdentityCurrent
                    ? 'success'
                    : 'warning'
                }
              >
                {strictSummaryLabel}
              </Tag>
            </Space>
            <Text type="secondary">
              实际耗时{' '}
              {formatQualityGateDuration(strictProof?.receipt?.durationMs)}
              {' · '}
              {strictProof?.reused ? '可信复用' : '本地新执行或尚未执行'}
            </Text>
            <DevDeliveryTimestamp
              value={strictProof?.receipt?.finishedAt}
              action="完成于"
              missing="完成时间未证明"
              className="erp-dev-quality-gate-finished-at"
            />
          </div>
          <RouterLink to={`${DEV_QUALITY_GATES_ROUTE}?view=run&profile=strict`}>
            查看质量门禁详情
          </RouterLink>
        </section>

        <section className="erp-dev-version-summary" aria-label="发布状态摘要">
          <Card title="本地候选">
            <Space direction="vertical" size={8}>
              <Text code>{shortGitSha(repository?.commit)}</Text>
              {repository ? (
                <Tag color={repository.dirty ? 'warning' : 'success'}>
                  {repository.dirty ? '工作树有改动' : '工作树干净'}
                </Tag>
              ) : (
                <Tag color="error">身份未证明</Tag>
              )}
              <Text type="secondary">
                只有 clean HEAD 才能触发 exact-SHA 发布。
              </Text>
            </Space>
          </Card>
          <Card title={`${deliveryProviderName}不可变版本`}>
            <Space direction="vertical" size={8}>
              <Text strong>{versions[0]?.version || '尚无可用版本'}</Text>
              <Text code>{shortGitSha(versions[0]?.gitSha)}</Text>
              <DevDeliveryTimestamp
                value={versions[0]?.publishedAt}
                action="发布于"
                missing="发布时间未证明"
                className="erp-dev-latest-version-published-at"
              />
              <Text type="secondary">
                {versions[0]?.completeAssets
                  ? versions[0]?.promotionEligible
                    ? 'v2 七资产齐全，演练回执已绑定'
                    : versions[0]?.assets.includes('release-rehearsal.json')
                      ? 'v2 七资产存在，但演练证据未闭合'
                      : 'v1 六资产齐全，仅保留读取与旧版回滚'
                  : '等待完整 release assets'}
              </Text>
            </Space>
          </Card>
          <Card
            title={`${selectedTargetDefinition.label} · ${selectedTargetKey}`}
          >
            <Space direction="vertical" size={8}>
              <Text code>{shortGitSha(currentTargetSha)}</Text>
              <Tag
                color={
                  targetPassed
                    ? 'success'
                    : initializationReady
                      ? 'processing'
                      : 'warning'
                }
              >
                {targetPassed
                  ? '运行态只读预检通过'
                  : initializationReady
                    ? '首次部署预检通过'
                    : '目标预检阻断'}
              </Tag>
              <Text type="secondary">
                可用空间{' '}
                {formatDeliveryBytes(
                  target?.remote?.capacity?.availableBytes ??
                    initializationPreflight?.remote?.capacity?.availableBytes
                )}
                {' / '}最低要求{' '}
                {formatDeliveryBytes(
                  target?.remote?.capacity?.minimumAvailableBytes ??
                    initializationPreflight?.remote?.capacity
                      ?.minimumAvailableBytes
                )}
              </Text>
            </Space>
          </Card>
          <Card title="公网入口">
            <Space direction="vertical" size={8}>
              <Text code>{shortGitSha(publicEntry?.gitSha)}</Text>
              <Tag
                color={publicEntry?.status === 'passed' ? 'success' : 'warning'}
              >
                {publicEntry?.status === 'passed'
                  ? `入口与${selectedTargetDefinition.shortLabel}版本一致`
                  : '入口未完成证明'}
              </Tag>
              <Text type="secondary">
                页面健康 {publicEntry?.health === 'passed' ? '通过' : '未通过'}
                {' · '}短信 Provider{' '}
                {publicEntry?.provider === 'passed' ? '通过' : '未通过'}
              </Text>
              <Link
                href={
                  publicEntry?.endpoint || selectedTargetDefinition.endpoint
                }
                target="_blank"
                rel="noreferrer"
              >
                打开公网页面
              </Link>
            </Space>
          </Card>
        </section>

        {openOperations.length > 0 ? (
          <Card
            title="当前操作"
            className="erp-dev-version-table-card erp-dev-version-current-operation"
            extra={<Text type="secondary">未结束操作始终保持可见</Text>}
          >
            <div className="erp-dev-version-current-operation__list">
              {openOperations.map((operation) => {
                const statusMessage = deliveryOperationMessagePresentation(
                  operation.events.at(-1)?.message
                )
                return (
                  <article
                    key={operation.id}
                    className="erp-dev-version-current-operation__item"
                    aria-label={`当前操作 ${operation.version}`}
                  >
                    <div className="erp-dev-version-current-operation__detail">
                      <Text strong>
                        {operationActionLabel(
                          operation.action,
                          operation.promotionMode
                        )}
                      </Text>
                      <Text type="secondary" code>
                        {operation.id.slice(0, 8)}
                      </Text>
                      <DevDeliveryTimestamp
                        value={operation.createdAt}
                        action="开始于"
                        missing="开始时间未证明"
                        className="erp-dev-current-operation-time"
                      />
                    </div>
                    <div className="erp-dev-version-current-operation__detail">
                      <Text>{operation.version}</Text>
                      <Text type="secondary" code>
                        {shortGitSha(operation.gitSha)}
                      </Text>
                    </div>
                    <div className="erp-dev-version-current-operation__detail">
                      <Space size={6} wrap>
                        <StatusTag status={operation.status} />
                        <Text>
                          {formatDeliveryDuration(operation.durationMs)}
                        </Text>
                      </Space>
                      <Text type="secondary" title={statusMessage.title}>
                        {statusMessage.label}
                      </Text>
                      <DevDeliveryTimestamp
                        value={operation.updatedAt}
                        action={operationUpdateAction(operation)}
                        missing="更新时间未证明"
                        className="erp-dev-current-operation-time"
                      />
                    </div>
                    <div className="erp-dev-version-current-operation__actions">
                      {renderOperationActions(operation)}
                    </div>
                  </article>
                )
              })}
            </div>
          </Card>
        ) : null}

        <DevPipelineStatusStrip
          timings={summary?.timings}
          versions={versions}
          operations={operations}
          onOpenDetails={openPipelineDetails}
        />

        <section
          ref={workspaceRef}
          className="erp-dev-version-workspace"
          aria-label="版本发布工作区"
        >
          <Tabs
            activeKey={activeView}
            items={workspaceItems}
            onChange={selectView}
          />
        </section>
      </main>

      <Modal
        title="人工接管与应急发布说明"
        open={manualTakeoverOpen}
        width={760}
        className="erp-dev-version-takeover-modal"
        footer={
          <Button type="primary" onClick={() => setManualTakeoverOpen(false)}>
            我知道了
          </Button>
        }
        onCancel={() => setManualTakeoverOpen(false)}
        afterClose={() =>
          manualTakeoverTriggerRef.current?.focus({ preventScroll: true })
        }
        destroyOnHidden
      >
        <ManualTakeoverGuide />
      </Modal>

      <Modal
        title="发布当前 exact SHA"
        open={releaseModalOpen}
        okText={`触发${deliveryProviderName}发布`}
        cancelText="取消"
        confirmLoading={actionKey === 'dispatch-release'}
        cancelButtonProps={{
          disabled: actionKey === 'dispatch-release',
        }}
        closable={actionKey !== 'dispatch-release'}
        maskClosable={actionKey !== 'dispatch-release'}
        keyboard={actionKey !== 'dispatch-release'}
        okButtonProps={{
          disabled:
            !summaryFresh ||
            !/^[0-9A-Za-z](?:[0-9A-Za-z._-]{0,62}[0-9A-Za-z])?$/u.test(
              releaseVersion
            ),
        }}
        onOk={submitRelease}
        onCancel={() => {
          if (actionKey !== 'dispatch-release') {
            setReleaseModalOpen(false)
          }
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`候选 SHA：${shortGitSha(repository?.commit)}`}
            description={`${deliveryProviderName}复用该 SHA 已完成的普通 CI 证据，只构建一次制品；demo 与 test 均不参与构建。`}
          />
          <label htmlFor="dev-release-version">
            正式版本号（由发布目录自动生成）
          </label>
          <Input
            id="dev-release-version"
            aria-label="发布版本号"
            value={releaseVersion}
            maxLength={64}
            readOnly
          />
        </Space>
      </Modal>

      <Drawer
        title="操作详情"
        open={Boolean(operationDetail)}
        width={640}
        onClose={closeOperationDetail}
        afterOpenChange={(open) => {
          if (open) return
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (restoreOperationDetailTriggerFocus()) {
                clearOperationDetailFocusRestoreTimer()
              }
            })
          })
        }}
        destroyOnHidden
      >
        {operationDetail ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              <StatusTag status={operationDetail.status} />
              <Text strong>{operationDetail.version}</Text>
              <Text code>{shortGitSha(operationDetail.gitSha)}</Text>
            </Space>
            <Text type="secondary" copyable>
              {operationDetail.id}
            </Text>
            <Space wrap size={[12, 4]}>
              <DevDeliveryTimestamp
                value={operationDetail.createdAt}
                action="开始于"
                missing="开始时间未证明"
                className="erp-dev-operation-detail-time"
              />
              <DevDeliveryTimestamp
                value={operationDetail.updatedAt}
                action={operationUpdateAction(operationDetail)}
                missing="更新时间未证明"
                className="erp-dev-operation-detail-time"
              />
            </Space>
            <Card size="small" title="幂等与受控重试">
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Text strong>
                  {
                    deliveryIdempotencyPresentation(operationDetail.idempotency)
                      .label
                  }
                </Text>
                <Text type="secondary">
                  识别依据：
                  {deliveryIdempotencyPresentation(
                    operationDetail.idempotency
                  ).basis.join('、')}
                </Text>
                <Text type="secondary">
                  {deliveryRetryPresentation(operationDetail.retry)}
                </Text>
                {operationDetail.idempotency.retryOfOperationId ? (
                  <Text type="secondary">
                    关联上一次操作：
                    {operationDetail.idempotency.retryOfOperationId.slice(0, 8)}
                  </Text>
                ) : null}
              </Space>
            </Card>
            <Card size="small" title="操作环节耗时">
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Text strong>
                  总耗时 {formatDeliveryDuration(operationDetail.durationMs)}
                </Text>
                <DevTimingBars
                  stages={operationDetail.stages}
                  totalDurationMs={operationDetail.durationMs}
                  limit={100}
                />
              </Space>
            </Card>
            <Card size="small" title="制品与传输效能">
              <div className="erp-dev-operation-metrics">
                <div>
                  <Text type="secondary">传输制品</Text>
                  <Text strong>
                    {formatDeliveryBytes(operationDetail.metrics.transferBytes)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">实际传输耗时</Text>
                  <Text strong>
                    {formatDeliveryDuration(
                      operationDetail.metrics.transferDurationMs
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">有效传输速率</Text>
                  <Text strong>
                    {formatDeliveryRate(
                      operationDetail.metrics.transferBytesPerSecond
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">Server 制品</Text>
                  <Text strong>
                    {formatDeliveryBytes(
                      operationDetail.metrics.serverArchiveBytes
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">Web 制品</Text>
                  <Text strong>
                    {formatDeliveryBytes(
                      operationDetail.metrics.webArchiveBytes
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">回滚备份</Text>
                  <Text strong>
                    {formatDeliveryBytes(
                      operationDetail.metrics.backupSizeBytes
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">目标内容缓存</Text>
                  <Text strong>{operationCachePresentation.status}</Text>
                </div>
                <div>
                  <Text type="secondary">避免重复传输</Text>
                  <Text strong>
                    {formatDeliveryBytes(
                      operationDetail.metrics.avoidedTransferBytes
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">估算节省时间</Text>
                  <Text strong>
                    {formatDeliveryDuration(
                      operationDetail.metrics.avoidedTransferDurationMs
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">镜像加载</Text>
                  <Text strong>
                    {operationDetail.metrics.dockerLoadSkipped === null
                      ? '未证明'
                      : operationDetail.metrics.dockerLoadSkipped
                        ? '已安全跳过 Docker load'
                        : '已执行 Docker load'}
                  </Text>
                </div>
              </div>
              {operationDetail.metrics.targetCacheHit != null ? (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text type="secondary">
                    命中来源：{operationCachePresentation.source}
                  </Text>
                  <Text type="secondary">
                    命中依据：
                    {operationCachePresentation.basis.length > 0
                      ? operationCachePresentation.basis.join('、')
                      : '无（已执行冷路径）'}
                  </Text>
                  <Text type="secondary">
                    缓存命中后仍执行：
                    {operationCachePresentation.stillExecuted.join('、')}
                  </Text>
                </Space>
              ) : null}
              {operationDetail.metrics.serverDigest ? (
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <Text type="secondary" code copyable>
                    Server {operationDetail.metrics.serverDigest}
                  </Text>
                  <Text type="secondary" code copyable>
                    Web {operationDetail.metrics.webDigest}
                  </Text>
                </Space>
              ) : (
                <Text type="secondary">镜像 digest 等待新版部署回执</Text>
              )}
            </Card>
            {operationDetail.issues.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message="已记录问题"
                description={issueDescription(operationDetail.issues)}
              />
            ) : null}
            <List
              loading={operationDetailLoading}
              header="最近 100 条状态事件（按需读取）"
              dataSource={operationDetail.events}
              locale={{ emptyText: '暂无状态事件' }}
              renderItem={(event) => (
                <List.Item>
                  <Space direction="vertical" size={4}>
                    <Space wrap>
                      <StatusTag status={event.status} />
                      <DevDeliveryTimestamp
                        value={event.at}
                        action=""
                        missing="事件时间未证明"
                        className="erp-dev-operation-event-time"
                      />
                    </Space>
                    <Text
                      title={
                        deliveryOperationMessagePresentation(event.message)
                          .title
                      }
                    >
                      {
                        deliveryOperationMessagePresentation(event.message)
                          .label
                      }
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title={
          confirmOperation?.action === 'rollback'
            ? `确认代码回滚到 ${deliveryTargetLabel(confirmOperation?.target)}`
            : confirmOperation?.promotionMode === 'initialize'
              ? `确认首次部署（Explicit Promotion）至 ${deliveryTargetLabel(confirmOperation?.target)}`
              : `确认显式版本提升（Explicit Promotion）至 ${deliveryTargetLabel(confirmOperation?.target)}`
        }
        open={Boolean(confirmOperation)}
        okText={
          confirmOperation?.action === 'rollback'
            ? '开始回滚'
            : confirmOperation?.promotionMode === 'initialize'
              ? '开始首次部署'
              : '开始版本提升'
        }
        cancelText="取消"
        confirmLoading={actionKey === `execute:${confirmOperation?.id || ''}`}
        cancelButtonProps={{
          disabled: actionKey === `execute:${confirmOperation?.id || ''}`,
        }}
        closable={actionKey !== `execute:${confirmOperation?.id || ''}`}
        maskClosable={actionKey !== `execute:${confirmOperation?.id || ''}`}
        keyboard={actionKey !== `execute:${confirmOperation?.id || ''}`}
        okButtonProps={{
          danger: confirmOperation?.action === 'rollback',
          disabled:
            !summaryFresh ||
            !confirmOperation ||
            confirmationText !== confirmOperation.confirmationRequired,
        }}
        onOk={async () => {
          if (!confirmOperation) return
          const succeeded = await performAction(
            `execute:${confirmOperation.id}`,
            confirmOperation.action === 'rollback'
              ? 'execute-rollback'
              : 'execute-promotion',
            {
              operationId: confirmOperation.id,
              confirmation: confirmationText,
            }
          )
          if (succeeded) {
            setConfirmOperation(null)
            setConfirmationText('')
          }
        }}
        onCancel={() => {
          if (actionKey === `execute:${confirmOperation?.id || ''}`) {
            return
          }
          setConfirmOperation(null)
          setConfirmationText('')
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={
              confirmOperation?.action === 'rollback'
                ? '该动作只回滚代码和镜像'
                : `该动作会写入 ${deliveryTargetLabel(confirmOperation?.target)}`
            }
            description={
              confirmOperation?.action === 'rollback'
                ? '仅在 migration 序列和客户配置源指纹完全相同时允许；不自动 down migration 或恢复数据库。若结果未知，不会自动重试。'
                : '执行器会重新做即时预检、创建并恢复检查新备份、校验制品、串行迁移、启动和 smoke。若结果未知，不会自动重试。'
            }
          />
          <Text>请完整输入以下确认文本：</Text>
          <Text copyable code>
            {confirmOperation?.confirmationRequired || ''}
          </Text>
          <Input
            autoFocus
            aria-label={
              confirmOperation?.action === 'rollback'
                ? '回滚确认文本'
                : '部署确认文本'
            }
            value={confirmationText}
            placeholder="粘贴完整确认文本"
            maxLength={200}
            onChange={(event) => setConfirmationText(event.target.value)}
          />
        </Space>
      </Modal>
    </div>
  )
}
