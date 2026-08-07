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

export default function DevReceiptPanel({ areaKey, summaryFirst = false }) {
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
  const decision = state.loading
    ? {
        icon: <ClockCircleOutlined aria-hidden="true" />,
        title: '正在读取最近结果',
        description: '只读取本机门禁回执，不会启动新的验证。',
      }
    : summary.blockers.length > 0
      ? {
          icon: <ExclamationCircleOutlined aria-hidden="true" />,
          title: `${summary.blockers.length} 项结果需要处理`,
          description:
            '先展开完整回执定位失败、过期或身份不一致项，再重新运行匹配的检查。',
        }
      : summary.currentPassed.length > 0
        ? {
            icon: <CheckCircleOutlined aria-hidden="true" />,
            title: `当前回执中有 ${summary.currentPassed.length} 项通过`,
            description:
              '只证明下方列出的当前门禁，不代表发布、目标环境或客户验收已经完成。',
          }
        : {
            icon: <ClockCircleOutlined aria-hidden="true" />,
            title: '尚无当前可核验结果',
            description: '没有回执不等于通过；请先进入“检查本轮改动”。',
          }

  return (
    <section
      className={`erp-dev-receipt-panel erp-dev-receipt-panel--${tone}`}
      aria-label="最近质量回执"
      aria-busy={state.loading}
    >
      <div className="erp-dev-receipt-panel__head">
        <div>
          <Title level={3}>
            {summaryFirst ? '最近验证结果' : '最近质量回执'}
          </Title>
          {!summaryFirst ? (
            <Text className="erp-dev-receipt-panel__repository">
              {repositoryLabel}
            </Text>
          ) : null}
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
      {summaryFirst && !state.error ? (
        <div
          className={`erp-dev-receipt-panel__decision erp-dev-receipt-panel__decision--${tone}`}
          role="status"
          aria-live="polite"
        >
          <span className="erp-dev-receipt-panel__decision-icon">
            {decision.icon}
          </span>
          <span>
            <strong>{decision.title}</strong>
            <Text type="secondary">{decision.description}</Text>
          </span>
        </div>
      ) : null}
      {!summaryFirst &&
      !state.error &&
      !state.loading &&
      summary.receipts.length === 0 ? (
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
          {summaryFirst ? (
            <details className="erp-dev-receipt-panel__details">
              <summary>
                查看 {summary.receipts.length} 条完整回执与仓库身份
              </summary>
              <Text className="erp-dev-receipt-panel__repository">
                {repositoryLabel}
              </Text>
              <div className="erp-dev-receipt-panel__grid">
                {summary.receipts.map((item) => (
                  <ReceiptCard
                    key={`${item.receipt.gate}:${item.receipt.gitCommit}:${item.receipt.finishedAt}`}
                    item={item}
                  />
                ))}
              </div>
            </details>
          ) : (
            <div className="erp-dev-receipt-panel__grid">
              {summary.receipts.map((item) => (
                <ReceiptCard
                  key={`${item.receipt.gate}:${item.receipt.gitCommit}:${item.receipt.finishedAt}`}
                  item={item}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  )
}
