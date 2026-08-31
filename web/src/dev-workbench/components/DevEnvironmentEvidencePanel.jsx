import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Skeleton, Tag, theme, Typography } from 'antd'
import { Link as RouterLink } from 'react-router-dom'
import DevTimestamp from './DevTimestamp.jsx'
import { createDevDataPreparationClient } from '../config/devDataPreparation.mjs'
import {
  createDevDeliveryClient,
  DEV_VERSION_CENTER_ROUTE,
  DEV_VERSION_CENTER_VIEW_HISTORY,
} from '../config/devDelivery.mjs'
import {
  buildDevDeliveryOperationOverview,
  buildDevEnvironmentEvidence,
  devEnvironmentEvidenceStatusPresentation,
} from '../config/devEnvironmentEvidence.mjs'

const { Text } = Typography
const SUMMARY_TTL_MS = 120_000
const sharedSummaryResources = {
  data: { value: null, readAt: 0, inFlight: null },
  delivery: { value: null, readAt: 0, inFlight: null },
}

function readSharedSummary(resourceKey, readSummary, { force = false } = {}) {
  const resource = sharedSummaryResources[resourceKey]
  const currentTime = Date.now()
  if (
    !force &&
    resource.value &&
    currentTime - resource.readAt < SUMMARY_TTL_MS
  ) {
    return Promise.resolve(resource.value)
  }
  if (resource.inFlight) return resource.inFlight

  const pending = Promise.resolve()
    .then(readSummary)
    .then((value) => {
      resource.value = value
      resource.readAt = Date.now()
      return value
    })
    .finally(() => {
      if (resource.inFlight === pending) resource.inFlight = null
    })
  resource.inFlight = pending
  return pending
}

function shortIdentity(value, length = 12) {
  if (typeof value !== 'string' || value === '未证明') return '未证明'
  return value.length > length ? value.slice(0, length) : value
}

function EnvironmentCard({ card, loading }) {
  const status = devEnvironmentEvidenceStatusPresentation(card.status)
  return (
    <article
      className={`erp-dev-environment-card erp-dev-environment-card--${card.accent}`}
      aria-labelledby={`dev-environment-${card.key}`}
    >
      <header>
        <div>
          <strong id={`dev-environment-${card.key}`}>{card.label}</strong>
          <small className="erp-dev-environment-card__scope">
            {card.scope}
          </small>
        </div>
        <Tag color={loading ? 'processing' : status.color}>
          {loading ? '读取中' : status.label}
        </Tag>
      </header>
      {loading && card.readbackAt === '' ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : (
        <>
          <div className="erp-dev-environment-card__result">
            <Text strong>{card.datasetEvidence}</Text>
            <DevTimestamp
              value={card.readbackAt}
              action="权威读回于"
              missing="权威读回时间未证明"
            />
          </div>
          <details>
            <summary>身份与边界</summary>
            <div className="erp-dev-environment-card__details-body">
              <dl>
                <div>
                  <dt>Release / SHA</dt>
                  <dd title={card.releaseSha}>
                    {shortIdentity(card.releaseSha)}
                  </dd>
                </div>
                <div>
                  <dt>数据库</dt>
                  <dd>{card.databaseName}</dd>
                </div>
                <div>
                  <dt>Migration</dt>
                  <dd>{card.migrationVersion}</dd>
                </div>
                <div>
                  <dt>客户配置 revision</dt>
                  <dd>{card.customerConfigRevision}</dd>
                </div>
                <div>
                  <dt>数据版本 / run</dt>
                  <dd>
                    {card.datasetVersion} / {card.datasetRunId}
                  </dd>
                </div>
                <div>
                  <dt>Semantic digest</dt>
                  <dd title={card.semanticDigest}>
                    {shortIdentity(card.semanticDigest)}
                  </dd>
                </div>
              </dl>
              <Text type="secondary">{card.health}</Text>
              <Text type="secondary">{card.rollbackBoundary}</Text>
            </div>
          </details>
          <footer>
            <span className="erp-dev-environment-card__next-label">
              当前下一步
            </span>
            <strong>{card.nextAction}</strong>
          </footer>
        </>
      )}
    </article>
  )
}

const OPERATION_OVERVIEW_PRESENTATION = Object.freeze({
  loading: Object.freeze({ label: '读取中', color: 'processing' }),
  normal: Object.freeze({ label: '已读回', color: 'success' }),
  empty: Object.freeze({ label: '暂无记录', color: 'default' }),
  failure: Object.freeze({ label: '读取失败', color: 'error' }),
  stale: Object.freeze({ label: '结果已过期', color: 'warning' }),
})

function DeliveryOperationOverview({ summary, error, loading }) {
  const overview = buildDevDeliveryOperationOverview({
    summary,
    error,
    loading,
  })
  const presentation =
    OPERATION_OVERVIEW_PRESENTATION[overview.state] ||
    OPERATION_OVERVIEW_PRESENTATION.failure
  return (
    <section
      className="erp-dev-delivery-operation-overview"
      aria-labelledby="dev-delivery-operation-overview-title"
    >
      <header>
        <div>
          <strong id="dev-delivery-operation-overview-title">
            最近工作台操作
          </strong>
          <span className="erp-dev-delivery-operation-overview__scope">
            仅记录由工作台发起的 release、promotion、rebuild 与 rollback。
          </span>
        </div>
        <Tag color={presentation.color}>{presentation.label}</Tag>
      </header>
      {overview.state === 'loading' ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : (
        <div className="erp-dev-delivery-operation-overview__facts">
          <article>
            <span>最近操作</span>
            <strong>{overview.recentOperation}</strong>
            <DevTimestamp
              value={overview.recentOperationAt}
              action="更新于"
              missing="尚无 operation 时间"
            />
          </article>
          <article>
            <span>最严重阻断</span>
            <strong>{overview.strongestBlocker}</strong>
          </article>
          <article>
            <span>最后核对</span>
            <DevTimestamp
              value={overview.lastCheckedAt}
              action="读回于"
              missing="最后核对时间未证明"
            />
            <RouterLink
              to={`${DEV_VERSION_CENTER_ROUTE}?view=${DEV_VERSION_CENTER_VIEW_HISTORY}`}
            >
              查看工作台操作记录
            </RouterLink>
          </article>
        </div>
      )}
      {overview.state === 'loading' ? (
        <RouterLink
          to={`${DEV_VERSION_CENTER_ROUTE}?view=${DEV_VERSION_CENTER_VIEW_HISTORY}`}
        >
          查看工作台操作记录
        </RouterLink>
      ) : null}
      <Text type="secondary">
        GitLab Pipeline、Package 与 Release 只在“远端 CI/CD 活动”中展示，不会伪装成工作台操作记录。
      </Text>
    </section>
  )
}

export default function DevEnvironmentEvidencePanel() {
  const { token } = theme.useToken()
  const requestVersionRef = useRef(0)
  const [state, setState] = useState({
    dataSummary: sharedSummaryResources.data.value,
    deliverySummary: sharedSummaryResources.delivery.value,
    dataError: '',
    deliveryError: '',
    dataLoading: true,
    deliveryLoading: true,
  })

  const refresh = useCallback((force = false) => {
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    const dataClient = createDevDataPreparationClient()
    const deliveryClient = createDevDeliveryClient()

    setState((current) => ({
      ...current,
      dataError: '',
      deliveryError: '',
      dataLoading: true,
      deliveryLoading: true,
    }))
    readSharedSummary('data', () => dataClient.summary({ force }), { force })
      .then((dataSummary) => {
        if (requestVersion !== requestVersionRef.current) return
        setState((current) => ({ ...current, dataSummary, dataError: '' }))
      })
      .catch(() => {
        if (requestVersion !== requestVersionRef.current) return
        setState((current) => ({
          ...current,
          dataError: '本地数据证据读取失败',
        }))
      })
      .finally(() => {
        if (requestVersion !== requestVersionRef.current) return
        setState((current) => ({ ...current, dataLoading: false }))
      })
    readSharedSummary('delivery', () => deliveryClient.summary(), { force })
      .then((deliverySummary) => {
        if (requestVersion !== requestVersionRef.current) return
        setState((current) => ({
          ...current,
          deliverySummary,
          deliveryError: '',
        }))
      })
      .catch(() => {
        if (requestVersion !== requestVersionRef.current) return
        setState((current) => ({
          ...current,
          deliveryError: '双目标交付证据读取失败',
        }))
      })
      .finally(() => {
        if (requestVersion !== requestVersionRef.current) return
        setState((current) => ({ ...current, deliveryLoading: false }))
      })
  }, [])

  useEffect(() => {
    refresh()
    return () => {
      requestVersionRef.current += 1
    }
  }, [refresh])

  const evidence = useMemo(
    () =>
      buildDevEnvironmentEvidence({
        dataSummary: state.dataSummary,
        deliverySummary: state.deliverySummary,
        dataError: state.dataError,
        deliveryError: state.deliveryError,
      }),
    [
      state.dataError,
      state.dataSummary,
      state.deliveryError,
      state.deliverySummary,
    ]
  )

  return (
    <section
      className="erp-dev-environment-evidence"
      aria-labelledby="dev-environment-evidence-title"
      aria-busy={state.dataLoading || state.deliveryLoading}
      style={{
        '--dev-env-border': token.colorBorder,
        '--dev-env-surface': token.colorBgContainer,
        '--dev-env-muted': token.colorTextSecondary,
        '--dev-env-fill': token.colorFillAlter,
      }}
    >
      <header className="erp-dev-environment-evidence__header">
        <div>
          <strong id="dev-environment-evidence-title">环境与验收事实</strong>
          <span>控制端：{evidence.controller}</span>
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          loading={state.dataLoading || state.deliveryLoading}
          onClick={() => refresh(true)}
        >
          权威读回
        </Button>
      </header>
      <DeliveryOperationOverview
        summary={state.deliverySummary}
        error={state.deliveryError}
        loading={state.deliveryLoading}
      />
      <div
        className="erp-dev-environment-evidence__grid"
        role="region"
        aria-label="本地开发、demo 项目演练造数、test 甲方测试验收与隔离完整验收的环境与验收事实"
        // 横向事实对比区需要键盘焦点，才能在窄屏使用方向键滚动。
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        {evidence.cards.map((card) => (
          <EnvironmentCard
            key={card.key}
            card={card}
            loading={
              ['demo-133', 'customer-test-133'].includes(card.key)
                ? state.dataLoading || state.deliveryLoading
                : state.dataLoading
            }
          />
        ))}
      </div>
    </section>
  )
}
