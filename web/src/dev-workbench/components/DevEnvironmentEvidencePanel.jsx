import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Skeleton, Tag, theme, Typography } from 'antd'
import DevTimestamp from './DevTimestamp.jsx'
import { createDevDataPreparationClient } from '../config/devDataPreparation.mjs'
import { createDevDeliveryClient } from '../config/devDelivery.mjs'
import {
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
        <Skeleton active paragraph={{ rows: 5 }} title={false} />
      ) : (
        <>
          <dl>
            <div>
              <dt>Release / SHA</dt>
              <dd title={card.releaseSha}>{shortIdentity(card.releaseSha)}</dd>
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
          <div className="erp-dev-environment-card__result">
            <Text strong>{card.datasetEvidence}</Text>
            <Text type="secondary">{card.health}</Text>
            <DevTimestamp
              value={card.readbackAt}
              action="权威读回于"
              missing="权威读回时间未证明"
            />
          </div>
          <details>
            <summary>回滚 / 清理边界</summary>
            <Text type="secondary">{card.rollbackBoundary}</Text>
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
          deliveryError: '133 目标证据读取失败',
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
          <strong id="dev-environment-evidence-title">双环境事实</strong>
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
      <div
        className="erp-dev-environment-evidence__grid"
        role="region"
        aria-label="本地开发、133 测试与隔离完整验收目标事实"
        // 横向事实对比区需要键盘焦点，才能在窄屏使用方向键滚动。
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
      >
        {evidence.cards.map((card) => (
          <EnvironmentCard
            key={card.key}
            card={card}
            loading={
              card.key === 'customer-trial-133'
                ? state.dataLoading || state.deliveryLoading
                : state.dataLoading
            }
          />
        ))}
      </div>
    </section>
  )
}
