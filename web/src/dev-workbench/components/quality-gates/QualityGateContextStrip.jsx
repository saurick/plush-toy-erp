import React from 'react'
import { Button, Tag } from 'antd'
import DevTimestamp from '../DevTimestamp.jsx'
import { getQualityGateStatusMeta } from '../../config/devQualityGates.mjs'
import { shortCommit } from '../../config/qualityGatePresentation.mjs'

export function OperationStatusTag({ operation }) {
  const meta = getQualityGateStatusMeta(operation?.status || 'missing')
  return <Tag color={meta.tone}>{meta.label}</Tag>
}

export function ContextStrip({ summary, view, onReturnLocal }) {
  return (
    <section
      className="erp-dev-quality-context"
      aria-label="当前质量门禁上下文"
    >
      <dl>
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
