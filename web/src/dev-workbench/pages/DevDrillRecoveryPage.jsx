import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReloadOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Alert, Button, Card, Drawer, Space, Tag, Typography } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevDeliveryTimestamp from '../components/DevDeliveryTimestamp.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import {
  buildDevCustomerScopedRoute,
  buildDevCustomerSnapshotKey,
} from '../config/devCustomerScope.mjs'
import {
  DEV_DELIVERY_SUMMARY_SNAPSHOT_KEY,
  DEV_VERSION_CENTER_ROUTE,
  DEV_VERSION_CENTER_VIEW_HISTORY,
  DEV_VERSION_CENTER_VIEW_QUERY_KEY,
  createDevDeliveryClient,
  shortGitSha,
} from '../config/devDelivery.mjs'
import {
  DEV_DRILL_RECOVERY_SOURCE_PATH,
  buildDevRecoveryOverview,
} from '../config/devRecovery.mjs'
import { DEV_DOCS_ROUTE } from '../config/devRoutes.mjs'
import {
  formatDevSummaryCheckedAt,
  loadDevSummarySnapshot,
  readDevSummarySnapshot,
} from '../config/devSummarySnapshot.mjs'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'

const { Paragraph, Text, Title } = Typography
const RECOVERY_VIEWS = [
  { value: 'security', label: '安全核验' },
  { value: 'drills', label: '恢复演练' },
  { value: 'emergency', label: '应急指引' },
]

function DrillAction({
  action,
  refreshing,
  disabled = false,
  onRefresh,
  onNavigate,
}) {
  if (action.type === 'refresh') {
    return (
      <Button
        icon={<ReloadOutlined />}
        loading={refreshing}
        disabled={disabled}
        onClick={onRefresh}
      >
        {action.label}
      </Button>
    )
  }
  if (action.type === 'route') {
    return (
      <Button
        icon={<RightOutlined />}
        disabled={disabled}
        onClick={() => onNavigate(action.route)}
      >
        {action.label}
      </Button>
    )
  }
  return <Button disabled>{action.label}</Button>
}

function DrillRow({ drill, recommended, onOpen }) {
  return (
    <tr className="erp-dev-recovery-row" data-priority={drill.priority}>
      <td>
        <Tag>{drill.priority}</Tag>
      </td>
      <th scope="row">
        <strong>{drill.title}</strong>
        {recommended ? <Tag color="blue">当前建议</Tag> : null}
        <small>{drill.objective}</small>
      </th>
      <td>
        <Tag color={drill.statusPresentation.color}>
          {drill.statusPresentation.label}
        </Tag>
        <Tag color={drill.riskPresentation.color}>
          {drill.riskPresentation.label}
        </Tag>
      </td>
      <td>{drill.cadence}</td>
      <td>
        <Button
          aria-label={`查看${drill.title}要点`}
          onClick={(event) => onOpen(drill.key, event.currentTarget)}
        >
          查看要点
        </Button>
      </td>
    </tr>
  )
}

function DrillDetail({ drill, refreshing, disabled, onRefresh, onNavigate }) {
  return (
    <div className="erp-dev-recovery-row__detail">
      <Space wrap>
        <Tag>{drill.priority}</Tag>
        <Tag color={drill.statusPresentation.color}>
          {drill.statusPresentation.label}
        </Tag>
        <Tag color={drill.riskPresentation.color}>
          {drill.riskPresentation.label}
        </Tag>
      </Space>
      <div className="erp-dev-recovery-row__purpose">
        <Text strong>目的</Text>
        <Paragraph>{drill.objective}</Paragraph>
      </div>
      <Text strong>变化时触发</Text>
      <Paragraph>{drill.trigger}</Paragraph>
      <Text strong>完成证据</Text>
      <ol>
        {drill.evidence.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <Paragraph type="secondary">{drill.boundary}</Paragraph>
      <Text strong>最近证据</Text>
      <Paragraph>{drill.evidenceState.note}</Paragraph>
      {drill.evidenceState.at ? (
        <DevDeliveryTimestamp
          value={drill.evidenceState.at}
          action="核验于"
          missing="时间未证明"
        />
      ) : null}
      <DrillAction
        action={drill.action}
        refreshing={refreshing}
        disabled={disabled}
        onRefresh={onRefresh}
        onNavigate={onNavigate}
      />
    </div>
  )
}

export default function DevDrillRecoveryPage() {
  const navigate = useNavigate()
  const [selectedDrillKey, setSelectedDrillKey] = useState('')
  const drillTriggerRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedViews = searchParams.getAll('view')
  const activeView =
    requestedViews.length === 1 &&
    RECOVERY_VIEWS.some((item) => item.value === requestedViews[0])
      ? requestedViews[0]
      : 'security'
  const selectView = (value) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', value)
      return next
    })
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
  const client = useMemo(() => createDevDeliveryClient(), [])
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
  const [checkedAt, setCheckedAt] = useState(initialSnapshot?.checkedAt || '')
  const [loading, setLoading] = useState(
    Boolean(deliverySnapshotKey && !initialSnapshot)
  )
  const [refreshing, setRefreshing] = useState(false)
  const [storedSummaryFresh, setStoredSummaryFresh] = useState(false)
  const [loadError, setLoadError] = useState('')
  const requestRef = useRef(0)
  const summaryInCurrentScope =
    customerReady && summarySnapshotKey === deliverySnapshotKey
  const summary = summaryInCurrentScope ? storedSummary : null
  const fresh = summaryInCurrentScope && storedSummaryFresh

  const refresh = useCallback(async () => {
    const requestedSnapshotKey = deliverySnapshotKey
    if (
      !customerReady ||
      !requestedSnapshotKey ||
      activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
    ) {
      return false
    }
    const requestId = requestRef.current + 1
    requestRef.current = requestId
    const hasVisibleSummary = Boolean(
      summarySnapshotKeyRef.current === requestedSnapshotKey &&
      summaryRef.current
    )
    setLoading(!hasVisibleSummary)
    setRefreshing(hasVisibleSummary)
    setStoredSummaryFresh(false)
    setLoadError('')
    try {
      const snapshot = await loadDevSummarySnapshot(requestedSnapshotKey, () =>
        client.summary()
      )
      if (
        requestRef.current !== requestId ||
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
        requestRef.current !== requestId ||
        activeDeliverySnapshotKeyRef.current !== requestedSnapshotKey
      ) {
        return false
      }
      setLoadError(error?.message || '交付证据读取失败')
      return false
    } finally {
      if (
        requestRef.current === requestId &&
        activeDeliverySnapshotKeyRef.current === requestedSnapshotKey
      ) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [client, customerReady, deliverySnapshotKey])

  useEffect(() => {
    requestRef.current += 1
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

    if (!customerReady) {
      setLoading(false)
      setRefreshing(false)
      return undefined
    }
    refresh()
    return () => {
      requestRef.current += 1
    }
  }, [customerReady, deliverySnapshotKey, refresh])

  const navigateWithinCustomerScope = useCallback(
    (route) => {
      if (!customerReady) return
      navigate(buildDevCustomerScopedRoute(route, customerScope.customerKey))
    },
    [customerReady, customerScope.customerKey, navigate]
  )

  const overview = useMemo(
    () => buildDevRecoveryOverview(summary || {}),
    [summary]
  )
  const targetHealthy = overview.targetStatus === 'passed'
  const publicHealthy = overview.publicEntry?.status === 'passed'
  const runtimeProven = Boolean(overview.currentSha)
  const recoveryReady = targetHealthy && publicHealthy && runtimeProven
  const statusText = !customerReady
    ? '请选择已登记甲方'
    : loading
      ? '正在读取最新状态'
      : refreshing
        ? `正在后台核对，当前显示 ${formatDevSummaryCheckedAt(checkedAt)} 的结果`
        : fresh
          ? `交付证据已读取 ${formatDevSummaryCheckedAt(checkedAt)}`
          : checkedAt
            ? `显示 ${formatDevSummaryCheckedAt(checkedAt)} 的上次结果`
            : '尚未取得状态'
  return (
    <div className="erp-dev-hub-page erp-dev-workspace-page erp-dev-recovery-page erp-dev-delivery-workspace">
      <DevPageNav sourcePath={DEV_DRILL_RECOVERY_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <SafetyCertificateOutlined aria-hidden="true" />
          </span>
          <Title level={1} className="erp-dev-hub-title">
            安全与恢复
          </Title>
        </div>
        <Space direction="vertical" size={4} align="end">
          <Space wrap>
            <Tag>只读核验</Tag>
            <Button
              type="link"
              disabled={!customerReady}
              onClick={() =>
              navigateWithinCustomerScope(
                `${DEV_VERSION_CENTER_ROUTE}?${DEV_VERSION_CENTER_VIEW_QUERY_KEY}=${DEV_VERSION_CENTER_VIEW_HISTORY}`
              )
            }
            >
              查看交付记录
            </Button>

            <Button
              icon={<ReloadOutlined />}
              loading={loading || refreshing}
              disabled={!customerReady}
              onClick={refresh}
            >
              刷新交付证据
            </Button>
          </Space>
          <Text type="secondary" role="status" aria-live="polite">
            {statusText}
          </Text>
        </Space>
      </header>

      <section className="erp-dev-delivery-context" aria-label="安全与恢复范围">
        <DevCustomerScopeSelector
          compact
          scope={customerScope}
          onChange={customerScope.selectCustomer}
          note="本页只读，核对固定目标的安全与恢复证据。"
          invalidDescription="当前甲方没有登记交付目标；演练状态读取与版本中心跳转均已停止。"
        />

      </section>

      <main className="erp-dev-hub-shell erp-dev-recovery-shell">
        {loadError ? (
          <Alert
            type={summary ? 'warning' : 'error'}
            showIcon
            message={summary ? '最新状态核对失败' : '交付证据暂不可用'}
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

        <section className="erp-dev-recovery-status" aria-label="当前恢复准备度">
          <dl className="erp-dev-delivery-facts">
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
          <Text type="secondary">
            {recoveryReady
              ? '目标身份一致，可以按正式门禁安排演练'
              : '先补齐目标、版本或公网入口证据'}
          </Text>
        </section>
        <DevTaskNav
          compact
          level="primary"
          className="erp-dev-delivery-taskbar"
          idPrefix="dev-recovery"
          ariaLabel="安全与恢复任务"
          items={RECOVERY_VIEWS}
          value={activeView}
          onChange={selectView}
        />
        <section
          hidden={activeView !== 'security'}
          id="dev-recovery-panel-security"
          role="tabpanel"
          aria-labelledby="dev-recovery-tab-security"
        >
          <Card
            title="安全检查"
            extra={
              <Link
                to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(DEV_DRILL_RECOVERY_SOURCE_PATH)}`}
              >
                防入侵与防勒索指引
              </Link>
          }
            className="erp-dev-security-checks"
          >
            <Paragraph
              type="secondary"
              className="erp-dev-security-checks__scope"
            >
              核验范围：{overview.target.key} · 运行版本{' '}
              {shortGitSha(overview.currentSha)}。交付预检通过不代表安全检查通过。
            </Paragraph>
            <div className="erp-dev-tool-table-wrap">
              <table
                className="erp-dev-tool-table erp-dev-security-table"
                aria-label="安全检查"
              >
                <thead>
                  <tr>
                    <th scope="col">检查项</th>
                    <th scope="col">目标核验与证据</th>
                    <th scope="col">下一步</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.securityChecks.map((check) => (
                    <tr key={check.key}>
                      <th scope="row">{check.title}</th>
                      <td>
                        <Tag color={check.status === 'partial' ? 'blue' : undefined}>
                          {check.statusLabel}
                        </Tag>
                        <span className="erp-dev-security-checks__evidence">
                          {check.evidence}
                        </span>
                        {check.verifiedAt ? (
                          <small>
                            数据库回执时间：
                            <DevDeliveryTimestamp
                              value={check.verifiedAt}
                              action=""
                            />
                            <br />
                            回执：{check.evidenceId}
                          </small>
                      ) : (
                        <small>核验时间：无专门回执</small>
                      )}
                      </td>
                      <td>
                        <span className="erp-dev-security-checks__evidence">
                          {check.next}
                        </span>
                        <Link
                          to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(check.guidePath)}${check.guideAnchor ? `#${check.guideAnchor}` : ''}`}
                          aria-label={`阅读${check.title}核验要求`}
                        >
                          核验要求
                        </Link>
                      </td>
                    </tr>
                ))}
                </tbody>
              </table>
            </div>
          </Card>

        </section>
        <section
          hidden={activeView !== 'drills'}
          id="dev-recovery-panel-drills"
          role="tabpanel"
          aria-labelledby="dev-recovery-tab-drills"
        >
          <div className="erp-dev-recovery-recommendation">
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
                disabled={!customerReady}
                onRefresh={refresh}
                onNavigate={navigateWithinCustomerScope}
              />
            ) : null}
          </div>
          <Card
            title="演练清单"
            extra={<Text type="secondary">选择一项查看证据与边界</Text>}
            className="erp-dev-recovery-catalog"
          >
            <div className="erp-dev-tool-table-wrap">
              <table
                className="erp-dev-tool-table erp-dev-recovery-table"
                aria-label="演练清单"
              >
                <thead>
                  <tr>
                    <th scope="col">优先级</th>
                    <th scope="col">演练</th>
                    <th scope="col">状态与风险</th>
                    <th scope="col">建议频率</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.drills.map((drill) => (
                    <DrillRow
                      key={drill.key}
                      drill={drill}
                      recommended={drill.key === overview.next?.key}
                      onOpen={(key, trigger) => {
                      drillTriggerRef.current = trigger
                      setSelectedDrillKey(key)
                    }}
                    />
                ))}
                </tbody>
              </table>
            </div>
          </Card>

        </section>
        <section
          hidden={activeView !== 'emergency'}
          id="dev-recovery-panel-emergency"
          role="tabpanel"
          aria-labelledby="dev-recovery-tab-emergency"
          className="erp-dev-recovery-support"
        >
          <details className="erp-dev-recovery-emergency">
            <summary>疑似入侵或勒索时的处置</summary>
            <div className="erp-dev-recovery-emergency__content">
              <ol>
                <li>
                  保留发现时间和脱敏日志，在受控流程下隔离受影响主机与账号，暂停相关写入。
                </li>
                <li>
                  使用可信终端撤销受影响会话，并按影响范围轮换凭据。
                </li>
                <li>
                  选择攻击前的可信数据库与附件备份，在干净隔离目标恢复并核验。
                </li>
                <li>
                  核对丢失数据、漏洞修复与业务入口，批准恢复方案后再切回业务。
                </li>
              </ol>
              <Link
                to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(DEV_DRILL_RECOVERY_SOURCE_PATH)}#incident-response`}
              >
                阅读事件处置与恢复边界
              </Link>
            </div>
          </details>

          <details className="erp-dev-recovery-emergency">
            <summary>
              <SafetyCertificateOutlined aria-hidden="true" /> AI
              不可用时的应急接管
            </summary>
            <div className="erp-dev-recovery-emergency__content">
              <Paragraph>
                继续使用 clean exact SHA、GitLab
                CI、不可变版本、固定目标和结果读回；不复制容易漂移的命令清单。
              </Paragraph>
              <Paragraph type="secondary">
                新服务器必须先登记目标。禁止对当前试用或正式环境临时注入故障。
              </Paragraph>
              <Paragraph type="secondary">
                演练结果须有正式回执；普通成功部署不自动算作演练。
              </Paragraph>
              <Button
                type="link"
                disabled={!customerReady}
                onClick={() =>
                  navigateWithinCustomerScope(DEV_VERSION_CENTER_ROUTE)
                }
              >
                查看版本中心的手动操作指引
              </Button>
            </div>
          </details>
        </section>
        <Text type="secondary" className="erp-dev-delivery-boundary">
          本页只读，不接受主机、路径、凭据、命令或故障脚本输入。
        </Text>
      </main>
      <Drawer
        title={
          overview.drills.find((drill) => drill.key === selectedDrillKey)
            ?.title || '演练要点'
        }
        open={Boolean(selectedDrillKey)}
        width={600}
        onClose={() => setSelectedDrillKey('')}
        afterOpenChange={(open) => {
          if (!open) drillTriggerRef.current?.focus({ preventScroll: true })
        }}
        destroyOnHidden
      >
        {overview.drills
          .filter((drill) => drill.key === selectedDrillKey)
          .map((drill) => (
            <DrillDetail
              key={drill.key}
              drill={drill}
              refreshing={loading || refreshing}
              disabled={!customerReady}
              onRefresh={refresh}
              onNavigate={navigateWithinCustomerScope}
            />
          ))}
      </Drawer>
    </div>
  )
}
