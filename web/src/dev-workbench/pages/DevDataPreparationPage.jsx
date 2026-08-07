import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  DatabaseOutlined,
  FileDoneOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Input,
  List,
  Modal,
  Radio,
  Skeleton,
  Space,
  Tag,
  theme,
  Typography,
} from 'antd'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_DATA_PREPARATION_PROFILE_COPY,
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_SOURCE_PATH,
  createDevDataPreparationClient,
  dataPreparationStatusPresentation,
  formatDataPreparationTimestamp,
  resolveDataPreparationExecutionConfirmation,
  resolveDataPreparationPrepareIntent,
  selectRecoverableDataPreparationOperation,
} from '../config/devDataPreparation.mjs'

const { Paragraph, Text, Title } = Typography
const POLL_INTERVAL_MS = 1500
const POLL_RECOVERY_INTERVAL_MS = 3000

function shortHash(value) {
  return typeof value === 'string' && value.length >= 12
    ? value.slice(0, 12)
    : '未证明'
}

function StatusTag({ status }) {
  const presentation = dataPreparationStatusPresentation(status)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

function issueText(issues = []) {
  return Array.isArray(issues)
    ? issues.map((issue) => issue.message).join('；')
    : ''
}

function upsertOperation(operation, operations = []) {
  if (!operation) return operations
  const nextOperations = operations.filter((item) => item.id !== operation.id)
  return [operation, ...nextOperations]
}

function WorkflowStep({ number, title, description, extra, children }) {
  return (
    <section
      className="erp-dev-data-workflow-step"
      aria-labelledby={`dev-data-step-${number}`}
    >
      <span className="erp-dev-data-workflow-step__number" aria-hidden="true">
        {number}
      </span>
      <div className="erp-dev-data-workflow-step__head">
        <div>
          <Title level={2} id={`dev-data-step-${number}`}>
            {title}
          </Title>
          <Paragraph>{description}</Paragraph>
        </div>
        {extra}
      </div>
      <div className="erp-dev-data-workflow-step__body">{children}</div>
    </section>
  )
}

function ProfileOption({ profile, selected, disabled, onSelect }) {
  const copy = DEV_DATA_PREPARATION_PROFILE_COPY[profile.key]
  return (
    <div
      className={
        selected
          ? 'erp-dev-data-profile erp-dev-data-profile--selected'
          : 'erp-dev-data-profile'
      }
      onClick={() => {
        if (!disabled) onSelect(profile.key)
      }}
    >
      <Radio value={profile.key}>
        <span className="erp-dev-data-profile__radio-label">{copy.title}</span>
      </Radio>
      <div className="erp-dev-data-profile__head">
        <Text type="secondary">{copy.shortTitle}</Text>
        <Tag color={copy.badgeColor}>{copy.badgeLabel}</Tag>
      </div>
      <Text>{copy.purpose}</Text>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- native disclosure clicks must not select the surrounding profile card. */}
      <details
        className="erp-dev-data-profile__details"
        onClick={(event) => event.stopPropagation()}
      >
        <summary>查看数据范围与退出方式</summary>
        <Text type="secondary">数据范围：{copy.scope}</Text>
        <Text type="secondary">{copy.retention}</Text>
        <Text type="secondary">{copy.cleanup}</Text>
        <div className="erp-dev-data-profile__requirements">
          {profile.requiredEnvironment.map((requirement) => (
            <Tag key={requirement}>{requirement}</Tag>
          ))}
        </div>
      </details>
    </div>
  )
}

const READBACK_PRESENTATIONS = Object.freeze({
  [DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo]: (readback) => ({
    column: { xs: 1, sm: 2, lg: 3 },
    items: [
      {
        key: 'accounts',
        label: '岗位账号',
        children: readback.roleAccounts,
      },
      {
        key: 'units',
        label: '单位',
        children: readback.core.units,
      },
      {
        key: 'materials',
        label: '材料',
        children: readback.core.materials,
      },
      {
        key: 'products',
        label: '产品',
        children: readback.core.products,
      },
      {
        key: 'warehouses',
        label: '仓库',
        children: readback.core.warehouses,
      },
      {
        key: 'processes',
        label: '工艺',
        children: readback.core.processes,
      },
      {
        key: 'bomHeaders',
        label: 'BOM',
        children: readback.core.bomHeaders,
      },
      {
        key: 'retention',
        label: '数据策略',
        children: '稳定 upsert，按正常生命周期退出',
      },
    ],
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo]: (readback) => ({
    column: { xs: 1, sm: 2, lg: 3 },
    notice:
      '本读回只证明固定批次业务场景已精确创建或读回：40 / 50 项已由数据查询证明，另 10 项只能在浏览器中确认。50 项页面操作与人工验收均未执行，不代表完整验收。',
    items: [
      {
        key: 'datasetKey',
        label: '固定数据集',
        children: <Text code>{readback.datasetKey}</Text>,
      },
      {
        key: 'dataVersion',
        label: '数据版本',
        children: <Text code>{readback.dataVersion}</Text>,
      },
      {
        key: 'runId',
        label: '数据批次',
        children: <Text code>{readback.runId}</Text>,
      },
      {
        key: 'sourceDocumentCount',
        label: '来源单据',
        children: readback.sourceDocumentCount,
      },
      {
        key: 'processRuntimeCount',
        label: '流程运行时',
        children: readback.processRuntimeCount,
      },
      {
        key: 'factCount',
        label: '业务事实',
        children: readback.factCount,
      },
      {
        key: 'catalog',
        label: '目录数据已证明',
        children: `${readback.catalogReadyCount} / ${readback.catalogTargetCount}`,
      },
      {
        key: 'replay',
        label: '同批复用',
        children:
          readback.replayMode === 'exact-create-or-readback'
            ? '精确创建或读回'
            : readback.replayMode,
      },
      {
        key: 'retention',
        label: '保留边界',
        children: readback.cleanupSupported
          ? '支持清理'
          : '长期保留，不清空已有数据',
      },
      {
        key: 'browserChecks',
        label: '仅浏览器可证明项',
        children: `${readback.browserChecksPending} 项`,
      },
      {
        key: 'manualAcceptance',
        label: '人工验收',
        children: readback.manualAcceptanceCompleted ? '已完成' : '未完成',
      },
    ],
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance]: (readback) => ({
    column: { xs: 1, sm: 3 },
    items: [
      {
        key: 'report',
        label: '50 项验收报告',
        children: readback.reportStatus === 'passed' ? '通过' : '失败',
      },
      {
        key: 'cleanup',
        label: '自动清理',
        children: readback.cleanupComplete ? '完成' : '未完成',
      },
      {
        key: 'residual',
        label: '残留隔离库',
        children: readback.residualDatabaseCount,
      },
    ],
  }),
})

function OperationIssues({ issues = [] }) {
  if (!issues.length) return null
  return (
    <Alert
      type="warning"
      showIcon
      message="当前计划存在阻断或风险"
      description={issueText(issues)}
    />
  )
}

function OperationReadback({ operation }) {
  const { readback } = operation
  if (!readback) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="终态读回尚未生成"
      />
    )
  }

  const presentation = READBACK_PRESENTATIONS[readback.profileKey](readback)

  return (
    <Space direction="vertical" size={12} className="erp-dev-data-readback">
      <Descriptions
        size="small"
        bordered
        column={presentation.column}
        items={presentation.items}
      />
      {presentation.notice ? (
        <Alert type="info" showIcon message={presentation.notice} />
      ) : null}
    </Space>
  )
}

function OperationDetail({ operation, compact = false }) {
  const profileCopy = DEV_DATA_PREPARATION_PROFILE_COPY[operation.profileKey]
  const [technicalOpen, setTechnicalOpen] = useState(
    compact && operation.status === 'ready'
  )
  return (
    <div className="erp-dev-data-operation-detail">
      <div className="erp-dev-data-operation-overview">
        <div>
          <Text strong>{profileCopy.title}</Text>
          <StatusTag status={operation.status} />
        </div>
        <Text>{operation.targetSummary.safeTarget}</Text>
        <Text type="secondary">
          最近更新：{formatDataPreparationTimestamp(operation.updatedAt)}
        </Text>
      </div>
      <OperationIssues issues={operation.issues} />
      <details
        className="erp-dev-data-operation-technical"
        open={technicalOpen}
        onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
      >
        <summary>核对不可变计划、批次与固定步骤</summary>
        <Descriptions
          size="small"
          column={{ xs: 1, md: 2 }}
          items={[
            {
              key: 'planHash',
              label: '不可变计划',
              children: (
                <Text code copyable>
                  {operation.planHash}
                </Text>
              ),
            },
            {
              key: 'runId',
              label: '运行批次',
              children: (
                <Text code copyable>
                  {operation.runId}
                </Text>
              ),
            },
            {
              key: 'preflightFingerprint',
              label: '预检指纹',
              children: (
                <Text code copyable>
                  {operation.targetSummary.preflightFingerprint}
                </Text>
              ),
            },
            {
              key: 'cleanup',
              label: '清理边界',
              children: profileCopy.cleanupBoundary,
            },
            {
              key: 'createdAt',
              label: '计划创建',
              children: formatDataPreparationTimestamp(operation.createdAt),
            },
          ]}
        />
        <section aria-label="固定执行步骤">
          <Text strong>固定执行步骤</Text>
          <ol className="erp-dev-data-step-list">
            {profileCopy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </details>
      {!compact ? (
        <>
          <section aria-label="状态事件">
            <Text strong>状态事件</Text>
            <List
              size="small"
              dataSource={operation.events}
              locale={{ emptyText: '尚无状态事件' }}
              renderItem={(event) => (
                <List.Item>
                  <Space direction="vertical" size={2}>
                    <Space wrap>
                      <Tag>{event.status}</Tag>
                      <Text type="secondary">
                        {formatDataPreparationTimestamp(event.at)}
                      </Text>
                    </Space>
                    <Text>{event.message}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </section>
          <section aria-label="终态读回">
            <Text strong>终态读回</Text>
            <OperationReadback operation={operation} />
          </section>
        </>
      ) : null}
    </div>
  )
}

export default function DevDataPreparationPage() {
  const { token } = theme.useToken()
  const client = useMemo(() => createDevDataPreparationClient(), [])
  const requestVersionRef = useRef(0)
  const currentOperationIdRef = useRef('')
  const prepareIntentRef = useRef(null)
  const [summary, setSummary] = useState(null)
  const [selectedProfileKey, setSelectedProfileKey] = useState(
    DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo
  )
  const [currentOperation, setCurrentOperation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pollError, setPollError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  const updateOperation = useCallback((operation) => {
    currentOperationIdRef.current = operation.id
    setCurrentOperation(operation)
    setSummary((current) =>
      current
        ? {
            ...current,
            operations: upsertOperation(operation, current.operations),
          }
        : current
    )
  }, [])

  const refresh = useCallback(async () => {
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    setLoading(true)
    setLoadError('')
    try {
      const nextSummary = await client.summary()
      if (requestVersion !== requestVersionRef.current) return
      setSummary(nextSummary)
      const recoveredOperation = selectRecoverableDataPreparationOperation(
        nextSummary.operations,
        currentOperationIdRef.current
      )
      currentOperationIdRef.current = recoveredOperation?.id || ''
      setCurrentOperation(recoveredOperation)
      if (recoveredOperation) {
        setSelectedProfileKey(recoveredOperation.profileKey)
        if (
          prepareIntentRef.current?.profileKey === recoveredOperation.profileKey
        ) {
          prepareIntentRef.current = null
        }
      }
    } catch (error) {
      if (requestVersion !== requestVersionRef.current) return
      setLoadError(error?.message || '数据准备预检读取失败')
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoading(false)
      }
    }
  }, [client])

  useEffect(() => {
    refresh()
    return () => {
      requestVersionRef.current += 1
    }
  }, [refresh])

  const activeOperationId = currentOperation?.id || ''
  const activeOperationTerminal = currentOperation?.terminal === true

  useEffect(() => {
    if (!activeOperationId || activeOperationTerminal) return undefined
    let cancelled = false
    let timerId

    const poll = async () => {
      try {
        const operation = await client.operation(activeOperationId)
        if (cancelled) return
        setPollError('')
        updateOperation(operation)
        if (!operation.terminal) {
          timerId = window.setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (error) {
        if (cancelled) return
        setPollError(error?.message || '回执刷新暂时失败')
        timerId = window.setTimeout(poll, POLL_RECOVERY_INTERVAL_MS)
      }
    }

    timerId = window.setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [activeOperationId, activeOperationTerminal, client, updateOperation])

  const profiles = summary?.profiles || []
  const selectedProfile = profiles.find(
    (profile) => profile.key === selectedProfileKey
  )
  const selectedProfileCopy =
    DEV_DATA_PREPARATION_PROFILE_COPY[selectedProfileKey]
  const selectedIsScenarioDemo =
    selectedProfileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const selectedTarget = summary?.target?.[selectedProfileCopy.targetKey]
  const repositoryBlocked =
    selectedProfile?.exactCleanCommitRequired === true &&
    (!summary?.repository || summary.repository.dirty)
  const hasActiveOperation = (summary?.operations || []).some(
    (operation) =>
      operation.profileKey === selectedProfileKey && !operation.terminal
  )
  const canPrepare =
    Boolean(selectedProfile) &&
    selectedTarget?.status === 'available' &&
    !repositoryBlocked &&
    !hasActiveOperation &&
    !loading
  const canExecuteCurrent =
    currentOperation?.status === 'ready' &&
    selectedTarget?.status === 'available' &&
    !repositoryBlocked
  const currentIsScenarioDemo =
    currentOperation?.profileKey ===
    DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const currentExecutionConfirmation = currentOperation
    ? resolveDataPreparationExecutionConfirmation(
        currentOperation,
        confirmation
      )
    : ''
  const selectProfile = (profileKey) => {
    if (preparing || executing) return
    setSelectedProfileKey(profileKey)
    currentOperationIdRef.current = ''
    prepareIntentRef.current = null
    setCurrentOperation(null)
    setConfirmation('')
  }

  const prepareBlockingReason = repositoryBlocked
    ? '完整验收只接受 clean exact commit'
    : selectedTarget?.status === 'blocked'
      ? '固定目标预检已阻断，请先处理预检问题'
      : hasActiveOperation
        ? '该档位已有未结束 operation，请先等待终态'
        : ''

  const handlePrepare = async () => {
    if (!canPrepare) return
    const profileKey = selectedProfileKey
    setPreparing(true)
    setActionError('')
    try {
      const intent = resolveDataPreparationPrepareIntent(
        prepareIntentRef.current,
        profileKey
      )
      prepareIntentRef.current = intent
      const result = await client.prepare(profileKey, intent.idempotencyKey)
      updateOperation(result.operation)
      prepareIntentRef.current = null
      message.success(
        result.reused ? '已读回复用的不可变计划' : '不可变计划已准备'
      )
      if (
        profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo &&
        result.operation.status === 'ready'
      ) {
        setConfirmation(result.operation.confirmationRequired)
        setConfirmOpen(true)
      }
    } catch (error) {
      setActionError(error?.message || '计划准备失败')
    } finally {
      setPreparing(false)
    }
  }

  const handleExecute = async () => {
    if (
      !currentOperation ||
      currentExecutionConfirmation !== currentOperation.confirmationRequired
    ) {
      return
    }
    setExecuting(true)
    setActionError('')
    try {
      const result = await client.execute(
        currentOperation.id,
        currentExecutionConfirmation
      )
      updateOperation(result.operation)
      setConfirmOpen(false)
      setConfirmation('')
      message.success('固定计划已启动，正在跟踪 operation 回执')
    } catch (error) {
      setActionError(error?.message || '固定计划执行失败')
    } finally {
      setExecuting(false)
    }
  }

  const historyItems = (summary?.operations || []).map((operation) => ({
    key: operation.id,
    label: (
      <div className="erp-dev-data-history-label">
        <span>
          {DEV_DATA_PREPARATION_PROFILE_COPY[operation.profileKey].title}
        </span>
        <StatusTag status={operation.status} />
        <Text type="secondary" code>
          {shortHash(operation.planHash)}
        </Text>
        <Text type="secondary">
          {formatDataPreparationTimestamp(operation.updatedAt)}
        </Text>
      </div>
    ),
    children: <OperationDetail operation={operation} />,
  }))

  return (
    <div
      className="erp-dev-hub-page erp-dev-workspace-page erp-dev-data-page"
      style={{
        '--dev-data-border': token.colorBorder,
        '--dev-data-primary': token.colorPrimary,
        '--dev-data-selected': token.colorPrimaryBg,
      }}
    >
      <DevPageNav sourcePath={DEV_DATA_PREPARATION_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <DatabaseOutlined aria-hidden="true" />
          </span>
          <div>
            <Text className="erp-dev-data-header__eyebrow">
              测试数据准备中心
            </Text>
            <Title level={1} className="erp-dev-hub-title">
              准备测试数据
            </Title>
            <Paragraph className="erp-dev-hub-summary">
              按“检查目标—选择范围—核对计划—查看结果”完成一次受控准备。页面不接收自定义目标、命令或凭据。
            </Paragraph>
          </div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
          重新检查
        </Button>
      </header>

      <main className="erp-dev-hub-shell erp-dev-data-shell">
        <details className="erp-dev-data-local-boundary">
          <summary>
            <SafetyCertificateOutlined aria-hidden="true" />
            仅用于本机开发环境
          </summary>
          <Paragraph>
            该入口以当前操作系统用户和固定后端目标为边界；它不进入正式 ERP
            菜单，也不冒充 ERP RBAC 授权。
          </Paragraph>
        </details>

        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="预检读取失败"
            description={
              <Space direction="vertical" size={8}>
                <Text>{loadError}</Text>
                <Button onClick={refresh}>重新读取预检</Button>
              </Space>
            }
          />
        ) : null}

        {actionError ? (
          <Alert
            type="error"
            showIcon
            closable
            message="本次操作未完成"
            description={actionError}
            onClose={() => setActionError('')}
          />
        ) : null}

        {pollError ? (
          <Alert
            type="warning"
            showIcon
            message="回执刷新暂时中断"
            description={`${pollError}；页面会继续自动恢复，也可手动刷新预检。`}
          />
        ) : null}

        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="预检发现问题"
            description={issueText(summary.issues)}
          />
        ) : null}

        {loading && !summary ? (
          <Card>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : null}

        {summary ? (
          <div className="erp-dev-data-workflow">
            <WorkflowStep
              number="1"
              title="检查目标是否可用"
              description="先看结论；仓库 SHA、目标指纹等追踪信息按需展开。"
              extra={
                <Tag>
                  {
                    profiles.filter((profile) => {
                      const copy =
                        DEV_DATA_PREPARATION_PROFILE_COPY[profile.key]
                      return (
                        summary.target[copy.targetKey]?.status === 'available'
                      )
                    }).length
                  }{' '}
                  / {profiles.length} 个目标可用
                </Tag>
              }
            >
              <div
                className="erp-dev-data-preflight-list"
                aria-label="数据准备预检摘要"
              >
                <div className="erp-dev-data-preflight-row">
                  <div>
                    <Text strong>当前代码现场</Text>
                    <Text type="secondary">
                      完整验收必须绑定干净且精确的提交；其他档位仍按各自固定边界执行。
                    </Text>
                  </div>
                  {summary.repository ? (
                    <Tag
                      color={summary.repository.dirty ? 'warning' : 'success'}
                    >
                      {summary.repository.dirty ? '有未提交改动' : '干净现场'}
                    </Tag>
                  ) : (
                    <Tag color="error">身份未证明</Tag>
                  )}
                  <details>
                    <summary>查看提交身份</summary>
                    <Text code>{shortHash(summary.repository?.commit)}</Text>
                  </details>
                </div>
                {profiles.map((profile) => {
                  const copy = DEV_DATA_PREPARATION_PROFILE_COPY[profile.key]
                  const target = summary.target[copy.targetKey]
                  return (
                    <div
                      className="erp-dev-data-preflight-row"
                      key={profile.key}
                    >
                      <div>
                        <Text strong>{copy.targetTitle}</Text>
                        <Text type="secondary">{copy.purpose}</Text>
                      </div>
                      <StatusTag status={target.status} />
                      <details>
                        <summary>查看目标与指纹</summary>
                        <Text>{target.safeTarget}</Text>
                        <Text code>{shortHash(target.targetFingerprint)}</Text>
                      </details>
                    </div>
                  )
                })}
              </div>
            </WorkflowStep>

            <WorkflowStep
              number="2"
              title="选择数据范围"
              description="只选择最小够用的固定范围；测试数据不是每次验证都要重新生成。"
              extra={<Text type="secondary">不支持自定义参数</Text>}
            >
              <Radio.Group
                className="erp-dev-data-profile-group"
                value={selectedProfileKey}
                disabled={preparing || executing}
                onChange={(event) => selectProfile(event.target.value)}
              >
                {profiles.map((profile) => (
                  <ProfileOption
                    key={profile.key}
                    profile={profile}
                    selected={selectedProfileKey === profile.key}
                    disabled={preparing || executing}
                    onSelect={selectProfile}
                  />
                ))}
              </Radio.Group>
              <div className="erp-dev-data-prepare-actions">
                <div>
                  <Text strong>{selectedProfileCopy.title}</Text>
                  <Text type="secondary">
                    {prepareBlockingReason ||
                      selectedProfileCopy.prepareDescription}
                  </Text>
                </div>
                <Button
                  type="primary"
                  icon={
                    selectedIsScenarioDemo ? (
                      <PlayCircleOutlined />
                    ) : (
                      <FileDoneOutlined />
                    )
                  }
                  disabled={!canPrepare}
                  loading={preparing}
                  onClick={handlePrepare}
                >
                  {selectedProfileCopy.prepareButtonLabel}
                </Button>
              </div>
            </WorkflowStep>

            <WorkflowStep
              number="3"
              title="核对计划并确认"
              description="先核对目标、数据范围、退出方式和固定步骤；只有确认后才会写入。"
              extra={
                currentOperation?.status === 'ready' ? (
                  <Button
                    type="primary"
                    danger={!currentIsScenarioDemo}
                    icon={<PlayCircleOutlined />}
                    disabled={!canExecuteCurrent}
                    title={
                      canExecuteCurrent
                        ? currentIsScenarioDemo
                          ? '核对固定目标后确认生成'
                          : '输入 exact confirmation 后执行'
                        : '当前目标或仓库预检已阻断'
                    }
                    onClick={() => {
                      setConfirmation(
                        currentIsScenarioDemo
                          ? currentOperation.confirmationRequired
                          : ''
                      )
                      setConfirmOpen(true)
                    }}
                  >
                    {currentIsScenarioDemo
                      ? '确认并生成'
                      : '输入 exact confirmation 执行'}
                  </Button>
                ) : null
              }
            >
              {currentOperation ? (
                <>
                  <OperationDetail
                    key={`${currentOperation.id}:${currentOperation.status}`}
                    operation={currentOperation}
                    compact
                  />
                  {currentOperation.terminal &&
                  currentOperation.status !== 'passed' ? (
                    <Alert
                      className="erp-dev-data-recovery"
                      type="warning"
                      showIcon
                      message="已保留终态回执，不会自动重试"
                      description="先在页面外处理阻断，再刷新预检并准备新计划；不得复用旧 plan hash 或确认文本。"
                    />
                  ) : null}
                  {currentOperation.status === 'passed' ? (
                    <Alert
                      className="erp-dev-data-recovery"
                      type="success"
                      showIcon
                      icon={<CheckCircleOutlined />}
                      message="数据准备已完成"
                      description={
                        DEV_DATA_PREPARATION_PROFILE_COPY[
                          currentOperation.profileKey
                        ].successDescription
                      }
                    />
                  ) : null}
                </>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="选择数据范围并准备计划后，在这里核对目标、批次、步骤和阻断。"
                />
              )}
            </WorkflowStep>

            <WorkflowStep
              number="4"
              title="查看结果"
              description="终态回执不会被自动重试；历史结果只证明对应计划与目标。"
              extra={<Tag>{historyItems.length} 条回执</Tag>}
            >
              {historyItems.length > 0 ? (
                <details className="erp-dev-data-history">
                  <summary>展开历史回执（{historyItems.length}）</summary>
                  <Collapse items={historyItems} />
                </details>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="尚无数据准备回执"
                />
              )}
            </WorkflowStep>
          </div>
        ) : null}
      </main>

      <Modal
        title={
          currentIsScenarioDemo
            ? '确认生成业务场景测试数据'
            : '确认执行不可变数据计划'
        }
        open={confirmOpen}
        okText={currentIsScenarioDemo ? '确认生成' : '执行固定计划'}
        cancelText="取消"
        confirmLoading={executing}
        cancelButtonProps={{ disabled: executing }}
        closable={!executing}
        maskClosable={!executing}
        keyboard={!executing}
        okButtonProps={{
          danger: !currentIsScenarioDemo,
          disabled:
            !currentOperation ||
            !canExecuteCurrent ||
            currentExecutionConfirmation !==
              currentOperation.confirmationRequired,
        }}
        onOk={handleExecute}
        onCancel={() => {
          if (executing) return
          setConfirmOpen(false)
          setConfirmation('')
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} className="erp-dev-data-confirm">
          <Alert
            type="warning"
            showIcon
            message={
              currentIsScenarioDemo
                ? '确认后生成固定 V5 业务场景数据'
                : '确认后才会写入固定目标'
            }
            description={
              currentOperation
                ? DEV_DATA_PREPARATION_PROFILE_COPY[currentOperation.profileKey]
                    .confirmationDescription
                : ''
            }
          />
          {currentIsScenarioDemo ? (
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="固定目标">
                {currentOperation?.targetSummary.safeTarget || '未证明'}
              </Descriptions.Item>
              <Descriptions.Item label="固定批次">
                2026.07.16-v5 / 20260716-V5
              </Descriptions.Item>
              <Descriptions.Item label="数据范围">
                {
                  DEV_DATA_PREPARATION_PROFILE_COPY[
                    DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
                  ].scope
                }
              </Descriptions.Item>
              <Descriptions.Item label="保留方式">
                长期保留，只向前补齐，不提供一键清空或重置
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <>
              <Text>请完整输入以下 exact confirmation：</Text>
              <Text code copyable className="erp-dev-data-confirm__value">
                {currentOperation?.confirmationRequired || ''}
              </Text>
              <Input
                autoFocus
                value={confirmation}
                maxLength={400}
                placeholder="输入完整确认文本"
                aria-label="不可变计划确认文本"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </>
          )}
        </Space>
      </Modal>
    </div>
  )
}
