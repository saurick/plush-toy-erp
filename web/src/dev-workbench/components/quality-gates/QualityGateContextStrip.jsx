import React from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Button, Popover, Tag } from 'antd'
import { WorkbenchFacts, WorkbenchNotice, WorkbenchSection } from '../WorkbenchPattern.jsx'
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
  flat = false,
}) {
  const blocked = Boolean(summaryError || status?.tone === 'error' || (summary?.environment && !summary.environment.disposableDatabaseReady))
  const notice = (
    <WorkbenchNotice
      className="erp-dev-quality-status-banner"
      tone={summaryError ? 'error' : status?.tone || 'loading'}
      title={summaryError ? '质量门禁状态读取失败' : status?.title || '正在读取当前质量状态'}
      description={summaryError
        ? `${summaryError} 请刷新状态；当前数据尚未重新核实。`
        : status?.recommendation ? `下一步：${status.recommendation}` : null}
      details={!summaryError && (status?.description || status?.notProven?.length) ? (
        <>
          <span>{status.description}</span>
          {status.notProven?.length ? <span>尚未证明：{status.notProven.join('、')}</span> : null}
        </>
      ) : null}
    />
  )
  return (
    <WorkbenchSection flat={flat} className="erp-dev-quality-context" aria-label="当前质量门禁上下文">
      {!flat || blocked ? notice : null}
      <div className="erp-dev-quality-context__identity">
        <WorkbenchFacts items={[
          { label: flat ? '工作区' : standalone ? '服务端工作区版本' : '本地工作区版本', value: shortCommit(summary?.repository?.commit) },
          { label: flat ? '改动' : standalone ? '服务端改动' : '本地改动', value: summary?.repository?.dirty === true ? '有未提交改动' : summary?.repository?.dirty === false ? '干净' : '未核实' },
          { label: flat ? '读取于' : '统计读取于', value: <DevTimestamp value={summary?.generatedAt} missing="统计时间未证明" /> },
        ]}
        />
        {flat && !blocked ? (
          <Popover content={notice} trigger="click" placement="bottomLeft" classNames={{ root: 'erp-dev-quality-context-help' }}>
            <Button type="text" size="small" icon={<InfoCircleOutlined aria-hidden="true" />} aria-label="工作区判断依据" />
          </Popover>
        ) : null}
        {view !== 'run' && summary?.currentOperation?.profile === 'strict' ? (
          <Button type="link" onClick={onReturnLocal}>
            {standalone ? '查看服务端诊断历史' : '查看本机运行'}
          </Button>
        ) : null}
      </div>
    </WorkbenchSection>
  )
}
