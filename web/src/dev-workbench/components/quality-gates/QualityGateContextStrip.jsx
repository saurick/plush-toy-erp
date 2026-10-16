import React from 'react'
import { Button, Tag } from 'antd'
import DevTimestamp from '../DevTimestamp.jsx'
import {
  VIEW_ITEMS,
  formatQualityGateDuration,
  getQualityGateStatusMeta,
} from '../../config/devQualityGates.mjs'
import {
  shortCommit,
  operationDuration,
  SERVER_EVIDENCE_STATUS,
} from '../../config/qualityGatePresentation.mjs'

export function OperationStatusTag({ operation }) {
  const meta = getQualityGateStatusMeta(operation?.status || 'missing')
  return <Tag color={meta.tone}>{meta.label}</Tag>
}

export function ContextStrip({ summary, view, summaryError, onReturnLocal }) {
  const serverEvidence = summary?.serverEvidence
  const serverStatus = serverEvidence
    ? SERVER_EVIDENCE_STATUS[serverEvidence.status] ||
      SERVER_EVIDENCE_STATUS.unavailable
    : summaryError
      ? SERVER_EVIDENCE_STATUS.pageUnavailable
      : SERVER_EVIDENCE_STATUS.loading
  const serverLabel = serverEvidence?.pipeline?.id
    ? `${serverStatus.label} · #${serverEvidence.pipeline.id}`
    : serverStatus.label
  const strictProof = summary?.proofs?.strict
  const strictStatus =
    summary?.currentOperation?.profile === 'strict'
      ? `${getQualityGateStatusMeta(summary.currentOperation.status).label} ${formatQualityGateDuration(operationDuration(summary.currentOperation))}`
      : strictProof?.current
        ? `当前版本${getQualityGateStatusMeta(strictProof.status).label}`
        : strictProof?.receipt
          ? `旧版本${getQualityGateStatusMeta(strictProof.status).label}`
          : '尚未运行'
  const viewLabel = VIEW_ITEMS.find((item) => item.value === view)?.label

  return (
    <section
      className="erp-dev-quality-context"
      aria-label="当前质量门禁上下文"
    >
      <dl>
        <div>
          <dt>当前视图</dt>
          <dd>{viewLabel}</dd>
        </div>
        <div>
          <dt>当前版本</dt>
          <dd>{shortCommit(summary?.repository?.commit)}</dd>
        </div>
        <div>
          <dt>工作区</dt>
          <dd>
            {summary?.repository?.dirty === true
              ? '有未提交改动'
              : summary?.repository?.dirty === false
                ? '干净'
                : '未核实'}
          </dd>
        </div>
        <div>
          <dt>GitLab CI</dt>
          <dd>{serverLabel}</dd>
        </div>
        <div>
          <dt>本机诊断</dt>
          <dd>{strictStatus || '尚未运行'}</dd>
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
          查看本机运行
        </Button>
      ) : null}
    </section>
  )
}
