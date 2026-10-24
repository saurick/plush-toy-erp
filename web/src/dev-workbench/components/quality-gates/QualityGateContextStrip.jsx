import React from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons'
import { Alert, Button, Tag, Typography } from 'antd'
import DevTimestamp from '../DevTimestamp.jsx'
import { getQualityGateStatusMeta } from '../../config/devQualityGates.mjs'
import { shortCommit } from '../../config/qualityGatePresentation.mjs'

export function OperationStatusTag({ operation }) {
  const meta = getQualityGateStatusMeta(operation?.status || 'missing')
  return <Tag color={meta.tone}>{meta.label}</Tag>
}

export function ContextStrip({
  summary,
  status,
  summaryError,
  view,
  onReturnLocal,
  standalone = false,
}) {
  const Icon =
    status?.tone === 'success'
      ? CheckCircleOutlined
      : status?.tone === 'error'
        ? CloseCircleOutlined
        : InfoCircleOutlined
  return (
    <section
      className="erp-dev-quality-context"
      aria-label="当前质量门禁上下文"
    >
      {summaryError ? (
        <Alert
          className="erp-dev-quality-status-banner"
          type="error"
          showIcon
          message="质量门禁状态读取失败"
          description={`${summaryError} 请刷新状态；当前数据尚未重新核实。`}
        />
      ) : (
        <div
          className="erp-dev-quality-status-banner"
          role="status"
          data-tone={status?.tone || 'info'}
        >
          <div className="erp-dev-quality-status-banner__title">
            <Icon aria-hidden="true" />
            <Typography.Text strong>
              {status?.title || '正在读取当前质量状态'}
            </Typography.Text>
          </div>
          {status?.recommendation ? (
            <Typography.Text
              strong
              className="erp-dev-quality-status-banner__next"
            >
              下一步：{status.recommendation}
            </Typography.Text>
          ) : null}
          {status?.description || status?.notProven?.length ? (
            <details className="erp-dev-quality-status-details">
              <summary>判断依据与边界</summary>
              <Typography.Text>{status.description}</Typography.Text>
              {status.notProven?.length ? (
                <Typography.Text type="secondary">
                  尚未证明：{status.notProven.join('、')}
                </Typography.Text>
              ) : null}
            </details>
          ) : null}
        </div>
      )}
      <div className="erp-dev-quality-context__identity">
        <dl>
          <div>
            <dt>{standalone ? '服务端工作区版本' : '本地工作区版本'}</dt>
            <dd>{shortCommit(summary?.repository?.commit)}</dd>
          </div>
          <div>
            <dt>{standalone ? '服务端改动' : '本地改动'}</dt>
            <dd>
              {summary?.repository?.dirty === true
                ? '有未提交改动'
                : summary?.repository?.dirty === false
                  ? '干净'
                  : '未核实'}
            </dd>
          </div>
          <div>
            <dt>统计读取于</dt>
            <dd>
              <DevTimestamp
                value={summary?.generatedAt}
                missing="统计时间未证明"
              />
            </dd>
          </div>
        </dl>
        {view !== 'run' && summary?.currentOperation?.profile === 'strict' ? (
          <Button type="link" onClick={onReturnLocal}>
            {standalone ? '查看服务端诊断历史' : '查看本机运行'}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
