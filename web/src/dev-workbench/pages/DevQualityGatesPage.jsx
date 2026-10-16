import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { Alert, Button, Space, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import {
  DEFAULT_SERVER_VIEW,
  DEFAULT_VIEW,
  DEV_QUALITY_GATE_ACTIVE_STATUSES,
  DEV_QUALITY_GATE_GOVERNANCE_FILTERS,
  DEV_QUALITY_GATE_GAP_RANGES,
  DEV_QUALITY_GATE_GAP_RISKS,
  DEV_QUALITY_GATE_PROFILES,
  VIEW_ITEMS,
  buildQualityGateViewSearch,
  createDevQualityGateClient,
  createQualityGateIdempotencyKey,
  parseQualityGateSearch,
  selectDisplayedQualityGateOperation,
} from '../config/devQualityGates.mjs'
import {
  SOURCE_PATH,
  PROFILE_LABELS,
  mergeOperationIntoSummary,
  qualityGateViewStatus,
} from '../config/qualityGatePresentation.mjs'
import { ContextStrip } from '../components/quality-gates/QualityGateContextStrip.jsx'
import { ServerCiEvidencePanel } from '../components/quality-gates/ServerCiEvidencePanel.jsx'
import {
  LocalDiagnosticsActions,
  RunView,
} from '../components/quality-gates/QualityGateRunView.jsx'
import {
  GovernanceView,
  GapsView,
} from '../components/quality-gates/QualityGateGovernanceViews.jsx'

const { Text, Title } = Typography

const POLL_INTERVAL_MS = 1500

const EMPTY_VIEW_STATE = Object.freeze({
  server: Object.freeze({ serverView: DEFAULT_SERVER_VIEW }),
  run: Object.freeze({ profile: '', operation: '' }),
  governance: Object.freeze({ q: '', filter: 'relevant' }),
  gaps: Object.freeze({ range: 'current', risk: 'all' }),
})

const EMPTY_ASYNC_VIEW_STATE = Object.freeze({
  data: null,
  loading: false,
  error: '',
})

export default function DevQualityGatesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const client = useMemo(() => createDevQualityGateClient(), [])
  const titleRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const viewValuesRef = useRef({
    server: { ...EMPTY_VIEW_STATE.server },
    run: { ...EMPTY_VIEW_STATE.run },
    governance: { ...EMPTY_VIEW_STATE.governance },
    gaps: { ...EMPTY_VIEW_STATE.gaps },
  })
  const summaryRequestRef = useRef(0)
  const viewRequestRef = useRef(0)
  const idempotencyRef = useRef(new Map())
  const mutationRef = useRef(false)
  const [summary, setSummary] = useState(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [viewState, setViewState] = useState({
    view: DEFAULT_VIEW,
    ...EMPTY_ASYNC_VIEW_STATE,
  })
  const [viewRefresh, setViewRefresh] = useState(0)
  const [actionProfile, setActionProfile] = useState('')

  const operationIds = useMemo(
    () => summary?.operations?.map((operation) => operation.id) || null,
    [summary?.operations]
  )
  const parsed = useMemo(
    () => parseQualityGateSearch(searchParams, { operationIds }),
    [operationIds, searchParams]
  )
  const activeView = parsed.view
  const activeViewState =
    viewState.view === activeView ? viewState : EMPTY_ASYNC_VIEW_STATE

  useEffect(() => {
    window.requestAnimationFrame(() => titleRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!parsed.valid) return
    viewValuesRef.current[activeView] = {
      ...viewValuesRef.current[activeView],
      ...parsed.values,
    }
  }, [activeView, parsed.valid, parsed.values])

  useEffect(() => {
    if (!parsed.valid || !parsed.canonicalMissingView) return
    setSearchParams(new URLSearchParams({ view: DEFAULT_VIEW }), {
      replace: true,
    })
  }, [parsed.canonicalMissingView, parsed.valid, setSearchParams])

  const loadSummary = useCallback(
    async ({ quiet = false, signal } = {}) => {
      const requestId = summaryRequestRef.current + 1
      summaryRequestRef.current = requestId
      if (!quiet) setRefreshing(true)
      try {
        const next = await client.summary({ signal })
        if (summaryRequestRef.current !== requestId) return null
        setSummary(next)
        setSummaryError('')
        return next
      } catch (error) {
        if (
          error?.name === 'AbortError' ||
          summaryRequestRef.current !== requestId
        ) {
          return null
        }
        setSummaryError('质量门禁状态暂时不可用，请确认本机开发服务。')
        return null
      } finally {
        if (summaryRequestRef.current === requestId) {
          setInitialLoading(false)
          setRefreshing(false)
        }
      }
    },
    [client]
  )

  useEffect(() => {
    const controller = new AbortController()
    loadSummary({ quiet: true, signal: controller.signal })
    return () => controller.abort()
  }, [loadSummary])

  const currentOperation = summary?.currentOperation
  const polling = Boolean(
    currentOperation &&
    DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(currentOperation.status)
  )
  useEffect(() => {
    if (!polling) return undefined
    let pending = false
    let controller = null
    const timer = window.setInterval(() => {
      if (pending) return
      pending = true
      controller = new AbortController()
      loadSummary({ quiet: true, signal: controller.signal }).finally(() => {
        pending = false
        controller = null
      })
    }, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      controller?.abort()
    }
  }, [loadSummary, polling])

  useEffect(() => {
    if (!parsed.valid || ['server', 'run'].includes(activeView)) {
      viewRequestRef.current += 1
      setViewState({
        view: activeView,
        ...EMPTY_ASYNC_VIEW_STATE,
      })
      return undefined
    }
    const controller = new AbortController()
    const requestId = viewRequestRef.current + 1
    viewRequestRef.current = requestId
    setViewState({
      view: activeView,
      data: null,
      loading: true,
      error: '',
    })
    const request =
      activeView === 'governance'
        ? client.governance({
            filter: parsed.values.filter,
            q: parsed.values.q,
            signal: controller.signal,
          })
        : client.gaps({
            range: parsed.values.range,
            risk: parsed.values.risk,
            signal: controller.signal,
          })
    request
      .then((data) => {
        if (viewRequestRef.current !== requestId) return
        setViewState((current) =>
          current.view === activeView ? { ...current, data } : current
        )
      })
      .catch((error) => {
        if (
          error?.name === 'AbortError' ||
          viewRequestRef.current !== requestId
        ) {
          return
        }
        setViewState((current) =>
          current.view === activeView
            ? {
                ...current,
                error: '当前视图暂时不可用；不会使用旧请求结果覆盖本页。',
              }
            : current
        )
      })
      .finally(() => {
        if (viewRequestRef.current !== requestId) return
        setViewState((current) =>
          current.view === activeView ? { ...current, loading: false } : current
        )
      })
    return () => controller.abort()
  }, [
    activeView,
    client,
    parsed.valid,
    parsed.values.filter,
    parsed.values.q,
    parsed.values.range,
    parsed.values.risk,
    viewRefresh,
  ])

  const selectView = useCallback(
    (nextView) => {
      if (nextView === activeView) return
      const values =
        viewValuesRef.current[nextView] || EMPTY_VIEW_STATE[nextView]
      const nextSearch = buildQualityGateViewSearch(nextView, values)
      setSearchParams(new URLSearchParams(nextSearch.slice(1)))
    },
    [activeView, setSearchParams]
  )

  const updateViewValues = useCallback(
    (values) => {
      const nextValues = { ...parsed.values, ...values }
      viewValuesRef.current[activeView] = nextValues
      const nextSearch = buildQualityGateViewSearch(activeView, nextValues)
      setSearchParams(new URLSearchParams(nextSearch.slice(1)))
    },
    [activeView, parsed.values, setSearchParams]
  )

  const refresh = useCallback(async () => {
    await loadSummary()
    if (['governance', 'gaps'].includes(activeView)) {
      setViewRefresh((value) => value + 1)
    }
  }, [activeView, loadSummary])

  const start = useCallback(
    async (profile) => {
      if (
        mutationRef.current ||
        !parsed.valid ||
        !DEV_QUALITY_GATE_PROFILES.includes(profile)
      ) {
        return
      }
      mutationRef.current = true
      setActionProfile(profile)
      let idempotencyKey = idempotencyRef.current.get(profile)
      if (!idempotencyKey) {
        idempotencyKey = createQualityGateIdempotencyKey(profile)
        idempotencyRef.current.set(profile, idempotencyKey)
      }
      try {
        const result = await client.start(profile, idempotencyKey)
        idempotencyRef.current.delete(profile)
        setSummary((current) =>
          mergeOperationIntoSummary(current, result.operation)
        )
        updateViewValues({ profile, operation: result.operation.id })
        message.success(
          result.reused
            ? `已恢复${PROFILE_LABELS[profile]}的原运行记录`
            : `${PROFILE_LABELS[profile]}已启动`
        )
        await loadSummary({ quiet: true })
      } catch (error) {
        if (error?.name !== 'AbortError') {
          message.error(
            '质量门禁请求结果尚未确认，请核对当前状态；再次操作将恢复原请求。'
          )
        }
      } finally {
        mutationRef.current = false
        setActionProfile('')
      }
    },
    [client, loadSummary, parsed.valid, updateViewValues]
  )

  const cancel = useCallback(
    (operation) => {
      modal.confirm({
        maskClosable: true,
        centered: true,
        title: '确认取消当前门禁？',
        content:
          '将停止当前测试，并等待一次性数据库、容器、进程和运行锁完成清理。已完成阶段仍会保留，页面不会自动重试。',
        okText: '确认取消',
        okButtonProps: { danger: true },
        cancelText: '继续运行',
        afterClose: () => cancelButtonRef.current?.focus(),
        onOk: async () => {
          if (mutationRef.current) return
          mutationRef.current = true
          try {
            const next = await client.cancel(operation.id)
            setSummary((current) => mergeOperationIntoSummary(current, next))
            message.info('正在停止测试并等待清理读回')
            await loadSummary({ quiet: true })
          } catch {
            message.error('取消请求未完成，请刷新状态后再判断。')
          } finally {
            mutationRef.current = false
          }
        },
      })
    },
    [client, loadSummary]
  )

  const displayedOperation = selectDisplayedQualityGateOperation(summary, {
    operationId: parsed.values.operation,
    profile: parsed.values.profile,
  })
  const busy = summary?.busy?.active || Boolean(actionProfile)
  const canRun = Boolean(
    parsed.valid &&
    summary?.environment?.disposableDatabaseReady &&
    !busy &&
    !initialLoading
  )
  const displayedStatus = qualityGateViewStatus(
    summary,
    activeView,
    summaryError
  )

  return (
    <div className="erp-dev-quality-gates-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav sourcePath={SOURCE_PATH} />
      <header className="erp-dev-quality-header">
        <div>
          <Space align="center" size={10}>
            <SafetyCertificateOutlined className="erp-dev-quality-header__icon" />
            <Title ref={titleRef} tabIndex={-1} level={1}>
              质量门禁
            </Title>
          </Space>
        </div>
        <DevTaskNav
          idPrefix="quality-gates"
          ariaLabel="质量门禁视图"
          items={VIEW_ITEMS.map(({ value, label }) => ({ value, label }))}
          value={activeView}
          onChange={selectView}
          disabled={!parsed.valid}
          compact
          className="erp-dev-quality-tabs"
        />
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={refresh}
        >
          刷新状态
        </Button>
      </header>

      <main className="erp-dev-quality-shell">
        {summaryError ? (
          <Alert
            type="error"
            showIcon
            message="质量门禁状态读取失败"
            description={summaryError}
          />
        ) : null}
        {!parsed.valid ? (
          <Alert
            type="warning"
            showIcon
            message="当前质量门禁链接无效或已经过期"
            description={parsed.issues.join('；')}
            action={
              <Button
                onClick={() =>
                  setSearchParams(new URLSearchParams({ view: DEFAULT_VIEW }), {
                    replace: true,
                  })
                }
              >
                安全返回默认视图
              </Button>
            }
          />
        ) : null}

        <Alert
          className="erp-dev-quality-status-banner"
          type={displayedStatus?.tone || 'info'}
          showIcon
          icon={
            displayedStatus?.tone === 'success' ? (
              <CheckCircleOutlined />
            ) : displayedStatus?.tone === 'error' ? (
              <CloseCircleOutlined />
            ) : (
              <InfoCircleOutlined />
            )
          }
          message={displayedStatus?.title || '正在读取当前质量状态'}
          description={
            <Space direction="vertical" size={4}>
              <Text>{displayedStatus?.description || '正在读取状态。'}</Text>
              {displayedStatus?.recommendation ? (
                <Text strong>下一步：{displayedStatus.recommendation}</Text>
              ) : null}
              {displayedStatus?.notProven?.length ? (
                <Text type="secondary">
                  尚未证明：{displayedStatus.notProven.join('、')}
                </Text>
              ) : null}
            </Space>
          }
        />

        <ContextStrip
          summary={summary}
          view={activeView}
          summaryError={summaryError}
          onReturnLocal={() => selectView('run')}
        />

        <section className="erp-dev-quality-content">
          <div
            id={`quality-gates-panel-${activeView}`}
            role="tabpanel"
            aria-labelledby={`quality-gates-tab-${activeView}`}
            tabIndex={0}
          >
            {parsed.valid && activeView === 'server' ? (
              <ServerCiEvidencePanel
                summary={summary}
                serverView={parsed.values.serverView}
                onServerViewChange={(serverView) =>
                  updateViewValues({ serverView })
                }
              />
            ) : null}
            {parsed.valid && activeView === 'run' ? (
              <>
                <LocalDiagnosticsActions
                  summary={summary}
                  initialLoading={initialLoading}
                  canRun={canRun}
                  actionProfile={actionProfile}
                  onStart={start}
                />
                <RunView
                  summary={summary}
                  operation={displayedOperation}
                  previewProfile={parsed.values.profile || 'strict'}
                  actionProfile={actionProfile}
                  onCancel={cancel}
                  cancelButtonRef={cancelButtonRef}
                />
              </>
            ) : null}
            {parsed.valid && activeView === 'governance' ? (
              <GovernanceView
                data={activeViewState.data}
                loading={activeViewState.loading}
                error={activeViewState.error}
                values={parsed.values}
                onSearch={(q) => updateViewValues({ q })}
                onFilter={(filter) =>
                  DEV_QUALITY_GATE_GOVERNANCE_FILTERS.includes(filter) &&
                  updateViewValues({ filter })
                }
              />
            ) : null}
            {parsed.valid && activeView === 'gaps' ? (
              <GapsView
                data={activeViewState.data}
                loading={activeViewState.loading}
                error={activeViewState.error}
                values={parsed.values}
                onRange={(range) =>
                  DEV_QUALITY_GATE_GAP_RANGES.includes(range) &&
                  updateViewValues({ range })
                }
                onRisk={(risk) =>
                  DEV_QUALITY_GATE_GAP_RISKS.includes(risk) &&
                  updateViewValues({ risk })
                }
              />
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}
