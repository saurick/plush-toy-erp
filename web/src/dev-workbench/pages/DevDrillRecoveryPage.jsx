import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ExperimentOutlined,
  ReloadOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Empty, Space, Tag, Typography } from 'antd'
import { useNavigate } from 'react-router-dom'
import DevDeliveryTimestamp from '../components/DevDeliveryTimestamp.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
  DEV_VERSION_CENTER_ROUTE,
  createDevDeliveryClient,
  deliveryOperationMessagePresentation,
  deliveryStatusPresentation,
  shortGitSha,
} from '../config/devDelivery.mjs'
import {
  DEV_DRILL_RECOVERY_SOURCE_PATH,
  buildDevRecoveryOverview,
} from '../config/devRecovery.mjs'
import {
  formatDevSummaryCheckedAt,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
} from '../config/devSummarySnapshot.mjs'

const { Paragraph, Text, Title } = Typography

function operationActionLabel(action) {
  return action === 'rollback' ? '回滚' : '部署'
}

function OperationStatusTag({ status }) {
  const presentation = deliveryStatusPresentation(status)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

function DrillAction({ action, refreshing, onRefresh, onNavigate }) {
  if (action.type === 'refresh') {
    return (
      <Button
        icon={<ReloadOutlined />}
        loading={refreshing}
        onClick={onRefresh}
      >
        {action.label}
      </Button>
    )
  }
  if (action.type === 'route') {
    return (
      <Button icon={<RightOutlined />} onClick={() => onNavigate(action.route)}>
        {action.label}
      </Button>
    )
  }
  return <Button disabled>{action.label}</Button>
}

function shouldOpenRecommendedDrill(recommended) {
  return Boolean(
    recommended && globalThis.matchMedia?.('(min-width: 721px)').matches
  )
}

function DrillRow({ drill, recommended, refreshing, onRefresh, onNavigate }) {
  const evidence = drill.evidenceState
  const [open, setOpen] = useState(() =>
    shouldOpenRecommendedDrill(recommended)
  )

  useEffect(() => {
    setOpen(shouldOpenRecommendedDrill(recommended))
  }, [recommended])

  return (
    <details
      className="erp-dev-recovery-row"
      data-priority={drill.priority}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="erp-dev-recovery-row__priority">
          <Tag>{drill.priority}</Tag>
        </span>
        <span className="erp-dev-recovery-row__title">
          <Text strong>{drill.title}</Text>
          <Text className="erp-dev-recovery-row__objective" type="secondary">
            {drill.objective}
          </Text>
        </span>
        <span className="erp-dev-recovery-row__state">
          <Tag color={drill.statusPresentation.color}>
            {drill.statusPresentation.label}
          </Tag>
          <Tag
            className="erp-dev-recovery-row__risk"
            color={drill.riskPresentation.color}
          >
            {drill.riskPresentation.label}
          </Tag>
        </span>
        <Text className="erp-dev-recovery-row__cadence" type="secondary">
          {drill.cadence}
        </Text>
        <span className="erp-dev-recovery-row__chevron" aria-hidden="true" />
      </summary>
      <div className="erp-dev-recovery-row__detail">
        <div className="erp-dev-recovery-row__purpose">
          <Text strong>目的</Text>
          <Paragraph>{drill.objective}</Paragraph>
        </div>
        <div className="erp-dev-recovery-row__detail-grid">
          <div>
            <Text strong>变化时触发</Text>
            <Paragraph>{drill.trigger}</Paragraph>
          </div>
          <div>
            <Text strong>完成证据</Text>
            <ul>
              {drill.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="erp-dev-recovery-row__boundary">
          <Text type="secondary">{drill.boundary}</Text>
        </div>
        <div className="erp-dev-recovery-row__footer">
          <div className="erp-dev-recovery-row__evidence">
            <Text strong>最近证据</Text>
            <Text type="secondary">{evidence.note}</Text>
            {evidence.at ? (
              <DevDeliveryTimestamp
                value={evidence.at}
                action="核验于"
                missing="时间未证明"
              />
            ) : null}
          </div>
          <DrillAction
            action={drill.action}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    </details>
  )
}

export default function DevDrillRecoveryPage() {
  const navigate = useNavigate()
  const client = useMemo(() => createDevDeliveryClient(), [])
  const initialSnapshot = useMemo(
    () => readDevSummarySnapshot(DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY),
    []
  )
  const [summary, setSummary] = useState(initialSnapshot?.summary || null)
  const summaryRef = useRef(initialSnapshot?.summary || null)
  const [checkedAt, setCheckedAt] = useState(initialSnapshot?.checkedAt || '')
  const [loading, setLoading] = useState(!initialSnapshot)
  const [refreshing, setRefreshing] = useState(false)
  const [fresh, setFresh] = useState(false)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const hasVisibleSummary = Boolean(summaryRef.current)
    setLoading(!hasVisibleSummary)
    setRefreshing(hasVisibleSummary)
    setFresh(false)
    setLoadError('')
    try {
      const snapshot = await loadDevSummarySnapshot(
        DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
        () => client.summary()
      )
      if (requestRef.current !== requestId) return false
      summaryRef.current = snapshot.summary
      setSummary(snapshot.summary)
      setCheckedAt(snapshot.checkedAt)
      setFresh(true)
      return true
    } catch (error) {
      if (requestRef.current !== requestId) return false
      setLoadError(error?.message || '演练状态读取失败')
      return false
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [client])

  useEffect(() => {
    refresh()
    return () => {
      requestRef.current += 1
    }
  }, [refresh])

  const overview = useMemo(
    () => buildDevRecoveryOverview(summary || {}),
    [summary]
  )
  const targetHealthy = overview.targetStatus === 'passed'
  const publicHealthy = overview.publicEntry?.status === 'passed'
  const runtimeProven = Boolean(overview.currentSha)
  const recoveryReady = targetHealthy && publicHealthy && runtimeProven
  const statusText = loading
    ? '正在读取最新状态'
    : refreshing
      ? `正在后台核对，当前显示 ${formatDevSummaryCheckedAt(checkedAt)} 的结果`
      : fresh
        ? `已核对 ${formatDevSummaryCheckedAt(checkedAt)}`
        : checkedAt
          ? `显示 ${formatDevSummaryCheckedAt(checkedAt)} 的上次结果`
          : '尚未取得状态'
  const recentOperations = overview.operations.slice(0, 3)

  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-recovery-page">
      <DevPageNav sourcePath={DEV_DRILL_RECOVERY_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <ExperimentOutlined aria-hidden="true" />
          </span>
          <Title level={1} className="erp-dev-hub-title">
            演练与恢复中心
          </Title>
          <Paragraph className="erp-dev-hub-summary">
            先看当前结论和下一步；需要时再展开演练证据与安全边界。
          </Paragraph>
        </div>
        <Space direction="vertical" size={4} align="end">
          <Button
            icon={<ReloadOutlined />}
            loading={loading || refreshing}
            onClick={refresh}
          >
            刷新状态
          </Button>
          <Text type="secondary" role="status" aria-live="polite">
            {statusText}
          </Text>
        </Space>
      </header>

      <main className="erp-dev-hub-shell erp-dev-recovery-shell">
        {loadError ? (
          <Alert
            type={summary ? 'warning' : 'error'}
            showIcon
            message={summary ? '最新状态核对失败' : '演练目录暂不可用'}
            description={
              summary
                ? `${loadError}；当前只保留上次结果，不据此启动写操作。`
                : loadError
            }
          />
        ) : null}
        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="部分交付证据未能取得"
            description={summary.issues
              .map((issue) => issue.message)
              .join('；')}
          />
        ) : null}

        <Card className="erp-dev-recovery-overview">
          <div className="erp-dev-recovery-overview__main">
            <Text className="erp-dev-recovery-overview__eyebrow">
              当前恢复准备度
            </Text>
            <Title level={2}>
              {recoveryReady
                ? '目标身份一致，可以按正式门禁安排演练'
                : '先补齐目标、版本或公网入口证据'}
            </Title>
            <dl className="erp-dev-recovery-overview__facts">
              <div>
                <dt>环境</dt>
                <dd>
                  <Text strong>{overview.target.label}</Text>
                  <Text code>{overview.target.key}</Text>
                </dd>
              </div>
              <div>
                <dt>运行版本</dt>
                <dd>
                  <Text code>{shortGitSha(overview.currentSha)}</Text>
                  <Tag color={runtimeProven ? 'success' : 'warning'}>
                    {runtimeProven ? '前后端一致' : '身份未证明'}
                  </Tag>
                </dd>
              </div>
              <div>
                <dt>公网入口</dt>
                <dd>
                  <Tag color={publicHealthy ? 'success' : 'warning'}>
                    {publicHealthy ? '验证通过' : '证据未完成'}
                  </Tag>
                </dd>
              </div>
            </dl>
            <Text
              className="erp-dev-recovery-overview__boundary"
              type="secondary"
            >
              本页只读，不接受主机、路径、凭据、命令或故障脚本输入。
            </Text>
          </div>
          <div className="erp-dev-recovery-next">
            <Tag>{overview.next?.priority || 'P0'}</Tag>
            <Text type="secondary">下一步建议</Text>
            <Title level={3}>{overview.next?.title || '先刷新目标核验'}</Title>
            <Paragraph>
              {overview.next?.cadence || '取得最新证据后再判断'}
            </Paragraph>
            {overview.next ? (
              <DrillAction
                action={overview.next.action}
                refreshing={loading || refreshing}
                onRefresh={refresh}
                onNavigate={navigate}
              />
            ) : null}
          </div>
        </Card>

        <Card
          title="演练清单"
          extra={<Text type="secondary">展开一项查看证据与边界</Text>}
          className="erp-dev-recovery-catalog"
        >
          <div className="erp-dev-recovery-list-head" aria-hidden="true">
            <span>优先级</span>
            <span>演练</span>
            <span>状态</span>
            <span>建议频率</span>
          </div>
          <div className="erp-dev-recovery-list" role="list">
            {overview.drills.map((drill) => (
              <DrillRow
                key={drill.key}
                drill={drill}
                recommended={drill.key === overview.next?.key}
                refreshing={loading || refreshing}
                onRefresh={refresh}
                onNavigate={navigate}
              />
            ))}
          </div>
        </Card>

        <div className="erp-dev-recovery-support">
          <Card
            title="最近交付记录"
            extra={
              <Button
                type="link"
                onClick={() => navigate(DEV_VERSION_CENTER_ROUTE)}
              >
                查看全部
              </Button>
            }
            className="erp-dev-recovery-operations"
          >
            {recentOperations.length > 0 ? (
              <ul className="erp-dev-recovery-operation-list">
                {recentOperations.map((operation) => {
                  const message = deliveryOperationMessagePresentation(
                    operation.events?.at(-1)?.message
                  )
                  return (
                    <li key={operation.id}>
                      <Space wrap size={6}>
                        <Text strong>
                          {operationActionLabel(operation.action)}
                        </Text>
                        <OperationStatusTag status={operation.status} />
                        <Text code>{shortGitSha(operation.gitSha)}</Text>
                      </Space>
                      <Text title={message.title}>{message.label}</Text>
                      <DevDeliveryTimestamp
                        value={operation.updatedAt}
                        action={operation.terminal ? '完成于' : '更新于'}
                        missing="时间未证明"
                      />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Empty description="尚无部署或回滚记录" />
            )}
            <Text className="erp-dev-recovery-proof-note" type="secondary">
              当前没有可冒充演练结果的正式回执时，状态会明确显示未证明；普通成功部署不自动算作演练。
            </Text>
          </Card>

          <Card
            title="AI 不可用时的应急接管"
            className="erp-dev-recovery-emergency"
          >
            <div className="erp-dev-recovery-emergency__content">
              <SafetyCertificateOutlined aria-hidden="true" />
              <div>
                <Paragraph>
                  继续使用 clean exact SHA、GitHub
                  CI、不可变版本、固定目标和结果读回；不复制容易漂移的命令清单。
                </Paragraph>
                <Text type="secondary">
                  新服务器必须先登记目标。禁止对当前试用或正式环境临时注入故障。
                </Text>
                <Button
                  type="link"
                  onClick={() => navigate(DEV_VERSION_CENTER_ROUTE)}
                >
                  查看版本中心的人工接管说明
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </main>
    </div>
  )
}
