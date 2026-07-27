import React, { useEffect, useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Tag, Typography } from 'antd'

import {
  DEV_RECEIPT_STATUS_PRESENTATION,
  DEV_WORKBENCH_RECEIPT_API_PATH,
  summarizeDevReceiptEvidence,
} from '../config/devReceipts.mjs'

const { Text, Title } = Typography

function formatTimestamp(value) {
  const timestamp = Date.parse(value || '')
  if (!Number.isFinite(timestamp)) return '时间未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(timestamp))
}

function ReceiptCard({ item }) {
  const { receipt } = item
  const status =
    DEV_RECEIPT_STATUS_PRESENTATION[receipt.status] ||
    DEV_RECEIPT_STATUS_PRESENTATION.blocked
  const current = item.freshness === 'current'

  return (
    <article
      className={`erp-dev-receipt-card erp-dev-receipt-card--${receipt.status}`}
    >
      <div className="erp-dev-receipt-card__head">
        <div>
          <Text strong>{receipt.gate}</Text>
          <Text className="erp-dev-receipt-card__profile">
            {receipt.profile || 'default'}
          </Text>
        </div>
        <div className="erp-dev-receipt-card__tags">
          <Tag color={status.color}>{status.label}</Tag>
          <Tag color={current ? 'blue' : 'default'}>
            {current ? '当前现场' : '历史结果'}
          </Tag>
        </div>
      </div>
      <div className="erp-dev-receipt-card__metrics">
        <span>
          {receipt.passed}/{receipt.executed} 通过
        </span>
        <span>{receipt.skipped} 跳过</span>
        <span>{receipt.durationMs} ms</span>
      </div>
      <Text className="erp-dev-receipt-card__identity">
        {receipt.gitCommit.slice(0, 12)} · {receipt.treeState} ·{' '}
        {formatTimestamp(receipt.finishedAt)}
      </Text>
      {receipt.databaseRunIdentity ? (
        <Text className="erp-dev-receipt-card__identity">
          DB run: {receipt.databaseRunIdentity}
        </Text>
      ) : null}
      {receipt.notProven.length > 0 ? (
        <Text type="secondary" className="erp-dev-receipt-card__boundary">
          未证明：{receipt.notProven.join('、')}
        </Text>
      ) : null}
    </article>
  )
}

export default function DevReceiptPanel({ areaKey }) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState({
    loading: true,
    payload: null,
    error: '',
  })

  useEffect(() => {
    const controller = new AbortController()
    setState((current) => ({ ...current, loading: true, error: '' }))
    fetch(DEV_WORKBENCH_RECEIPT_API_PATH, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null)
        if (response.status === 404) return payload
        if (!response.ok || !payload) {
          throw new Error('质量回执读取失败')
        }
        return payload
      })
      .then((payload) => {
        setState({ loading: false, payload, error: '' })
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return
        setState({
          loading: false,
          payload: null,
          error: '质量回执不可用，请检查开发服务器与正式门禁输出。',
        })
      })
    return () => controller.abort()
  }, [reloadKey])

  const summary = useMemo(
    () => summarizeDevReceiptEvidence(state.payload, areaKey),
    [areaKey, state.payload]
  )
  const repository = state.payload?.repository
  const repositoryLabel = repository?.gitCommit
    ? `${repository.gitCommit.slice(0, 12)} · ${repository.treeState}`
    : '当前现场身份尚未读回'
  const tone =
    summary.blockers.length > 0
      ? 'blocked'
      : summary.currentPassed.length > 0
        ? 'passed'
        : 'empty'

  return (
    <section
      className={`erp-dev-receipt-panel erp-dev-receipt-panel--${tone}`}
      aria-label="最近质量回执"
    >
      <div className="erp-dev-receipt-panel__head">
        <div>
          <Title level={3}>最近质量回执</Title>
          <Text className="erp-dev-receipt-panel__repository">
            {repositoryLabel}
          </Text>
        </div>
        <Button
          icon={<ReloadOutlined />}
          loading={state.loading}
          onClick={() => setReloadKey((value) => value + 1)}
        >
          刷新证据
        </Button>
      </div>

      {state.error ? (
        <Alert
          type="error"
          showIcon
          message="回执读取失败"
          description={state.error}
        />
      ) : null}
      {!state.error && !state.loading && summary.receipts.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前区域尚无回执；没有回执不等于门禁通过。"
        />
      ) : null}
      {summary.receipts.length > 0 ? (
        <>
          <div className="erp-dev-receipt-panel__summary">
            <span>
              <CheckCircleOutlined aria-hidden="true" />
              当前通过 {summary.currentPassed.length}
            </span>
            <span>
              <ExclamationCircleOutlined aria-hidden="true" />
              当前阻塞 {summary.blockers.length}
            </span>
            <span>
              <ClockCircleOutlined aria-hidden="true" />
              历史 {summary.historical.length}
            </span>
          </div>
          <div className="erp-dev-receipt-panel__grid">
            {summary.receipts.map((item) => (
              <ReceiptCard
                key={`${item.receipt.gate}:${item.receipt.gitCommit}:${item.receipt.finishedAt}`}
                item={item}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
