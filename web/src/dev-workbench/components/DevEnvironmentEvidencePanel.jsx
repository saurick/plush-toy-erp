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

function shortIdentity(value, length = 12) {
  if (typeof value !== 'string' || value === '未证明') return '未证明'
  return value.length > length ? value.slice(0, length) : value
}

function EnvironmentCard({ card }) {
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
        <Tag color={status.color}>{status.label}</Tag>
      </header>
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
        <span className="erp-dev-environment-card__next-label">当前下一步</span>
        <strong>{card.nextAction}</strong>
      </footer>
    </article>
  )
}

export default function DevEnvironmentEvidencePanel() {
  const { token } = theme.useToken()
  const requestVersionRef = useRef(0)
  const abortControllerRef = useRef(null)
  const [state, setState] = useState({
    dataSummary: null,
    deliverySummary: null,
    dataError: '',
    deliveryError: '',
    loading: true,
  })

  const refresh = useCallback(() => {
    const requestVersion = requestVersionRef.current + 1
    requestVersionRef.current = requestVersion
    abortControllerRef.current?.abort()
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    const fetchWithSignal = (url, options = {}) =>
      globalThis.fetch(url, { ...options, signal: abortController.signal })
    const dataClient = createDevDataPreparationClient({
      fetchImpl: fetchWithSignal,
    })
    const deliveryClient = createDevDeliveryClient({
      fetchImpl: fetchWithSignal,
    })

    setState((current) => ({ ...current, loading: true }))
    Promise.allSettled([dataClient.summary(), deliveryClient.summary()]).then(
      ([dataResult, deliveryResult]) => {
        if (
          abortController.signal.aborted ||
          requestVersion !== requestVersionRef.current
        ) {
          return
        }
        setState({
          dataSummary:
            dataResult.status === 'fulfilled' ? dataResult.value : null,
          deliverySummary:
            deliveryResult.status === 'fulfilled' ? deliveryResult.value : null,
          dataError:
            dataResult.status === 'rejected' ? '本地数据证据读取失败' : '',
          deliveryError:
            deliveryResult.status === 'rejected' ? '133 目标证据读取失败' : '',
          loading: false,
        })
      }
    )
  }, [])

  useEffect(() => {
    refresh()
    return () => {
      requestVersionRef.current += 1
      abortControllerRef.current?.abort()
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
      aria-busy={state.loading}
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
          loading={state.loading}
          onClick={refresh}
        >
          权威读回
        </Button>
      </header>
      {state.loading && !state.dataSummary && !state.deliverySummary ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <div
          className="erp-dev-environment-evidence__grid"
          role="region"
          aria-label="本地开发、133 测试与隔离完整验收目标事实"
          // 横向事实对比区需要键盘焦点，才能在窄屏使用方向键滚动。
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          {evidence.cards.map((card) => (
            <EnvironmentCard key={card.key} card={card} />
          ))}
        </div>
      )}
    </section>
  )
}
