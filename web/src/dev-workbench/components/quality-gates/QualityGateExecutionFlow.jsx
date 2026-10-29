import React, { useState } from 'react'
import { Button, Descriptions, Empty, Space, Tag, Typography } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import DevTimestamp from '../DevTimestamp.jsx'
import {
  buildQualityGateStageDurationComposition,
  formatQualityGateDuration,
} from '../../config/devQualityGates.mjs'
import {
  STAGE_STATUS,
  MANAGED_DATABASE_STEPS,
  MANAGED_DATABASE_FLOW,
  deriveStages,
  previewStages,
  flowStageStatus,
  flowGroups,
  longestStageId,
  operationUpdateAction,
} from '../../config/qualityGatePresentation.mjs'

const { Text } = Typography

export function TechnicalDetails({ operation }) {
  if (!operation) return null
  return (
    <div className="erp-dev-quality-technical">
      <Descriptions
        size="small"
        column={1}
        bordered
        items={[
          operation.proofOnly
            ? {
                key: 'evidence-source',
                label: '证据来源',
                children: '当前版本正式回执（无单独页面运行记录）',
              }
            : {
                key: 'operation-id',
                label: 'Operation ID',
                children: (
                  <Text code copyable>
                    {operation.id}
                  </Text>
                ),
              },
          {
            key: 'commit',
            label: '完整 SHA',
            children: (
              <Text code copyable>
                {operation.repository.commit}
              </Text>
            ),
          },
          {
            key: 'fingerprint',
            label: '工作区指纹',
            children: <Text code>{operation.repository.fingerprint}</Text>,
          },
          {
            key: 'stage',
            label: '当前 stage id',
            children: <Text code>{operation.stage}</Text>,
          },
          {
            key: 'receipt',
            label: '验证记录',
            children: operation.receipt
              ? `${operation.receipt.executed} 项执行 · ${operation.receipt.passed} 项通过 · ${operation.receipt.failed} 项失败 · ${operation.receipt.skipped} 项跳过`
              : '尚未取得正式回执',
          },
          {
            key: 'cache',
            label: '缓存信息',
            children: '当前正式回执未登记独立缓存指标',
          },
          {
            key: 'cleanup',
            label: '清理读回',
            children: operation.cleanup.message,
          },
          {
            key: 'created-at',
            label: '操作开始',
            children: (
              <DevTimestamp
                value={operation.createdAt}
                missing="开始时间未证明"
              />
            ),
          },
          {
            key: 'updated-at',
            label: '最近状态时间',
            children: (
              <DevTimestamp
                value={operation.finishedAt || operation.updatedAt}
                action={operationUpdateAction(operation)}
                missing="更新时间未证明"
              />
            ),
          },
          ...(operation.cancelRequestedAt
            ? [
                {
                  key: 'cancel-requested-at',
                  label: '取消请求',
                  children: (
                    <DevTimestamp
                      value={operation.cancelRequestedAt}
                      missing="取消请求时间未证明"
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </div>
  )
}

function StageDetails({ stage, operation }) {
  const hasSubsteps = stage.substeps.length > 0
  if (!hasSubsteps && !operation) return null
  return (
    <div className="erp-dev-quality-flow__details">
      {hasSubsteps ? (
        <>
          <ol className="erp-dev-quality-flow__substeps">
            {stage.substeps.map((substep) => (
              <li key={substep.id}>{substep.label}</li>
            ))}
          </ol>
          <Text type="secondary">
            来自正式 runner 的固定结构；这里不推测子步骤实时状态。
          </Text>
        </>
      ) : null}
      {operation ? (
        <div className="erp-dev-quality-flow__technical-detail">
          <Text code>{stage.id}</Text>
          <Space direction="vertical" size={2}>
            <DevTimestamp
              value={stage.startedAt}
              action="开始于"
              missing="开始时间未证明"
            />
            <DevTimestamp
              value={stage.finishedAt}
              action="完成于"
              missing="完成时间未证明"
            />
          </Space>
          <Text type="secondary">
            来源：正式 {operation.profile} runner · 验证记录：
            {operation.proofOnly ? '当前版本正式回执' : '页面门禁运行记录'}
          </Text>
        </div>
      ) : null}
    </div>
  )
}

export function StageDurationComposition({ stages }) {
  const composition = buildQualityGateStageDurationComposition(stages)
  if (composition.items.length === 0) return null
  return (
    <section
      className="erp-dev-quality-duration"
      aria-labelledby="quality-duration-title"
    >
      <div className="erp-dev-quality-flow__segment-heading">
        <div>
          <Text id="quality-duration-title" strong>
            已记录阶段耗时构成
          </Text>
          <Text type="secondary">
            用于发现瓶颈；精确耗时和占比同时保留，不依赖悬停读取。
          </Text>
        </div>
        <Tag>{formatQualityGateDuration(composition.totalDurationMs)} 合计</Tag>
      </div>
      <div className="erp-dev-quality-duration__bar" aria-hidden="true">
        {composition.items.map((item, index) => (
          <span
            className="erp-dev-quality-duration__segment"
            data-tone={index % 5}
            key={item.id}
            style={{ '--quality-duration-share': `${item.sharePercent}%` }}
          />
        ))}
      </div>
      <ol className="erp-dev-quality-duration__legend">
        {composition.items.map((item, index) => (
          <li key={item.id}>
            <span
              className="erp-dev-quality-duration__swatch"
              data-tone={index % 5}
              aria-hidden="true"
            />
            <span>{item.label}</span>
            <Text
              type="secondary"
              className="erp-dev-quality-duration__legend-copy"
            >
              {formatQualityGateDuration(item.durationMs)} · {item.sharePercent}
              %{item.parallel ? ' · 可并行' : ''}
            </Text>
          </li>
        ))}
      </ol>
      <Text type="secondary" className="erp-dev-quality-duration__caveat">
        {composition.hasParallel
          ? '标为“可并行”的阶段可能互相重叠；图中比例按已记录阶段耗时之和归一化，不能相加推算墙钟时间。正式回执总耗时才是运行总时间。'
          : '图中比例按已记录阶段耗时之和归一化；正式回执总耗时仍是运行总时间真源。'}
      </Text>
    </section>
  )
}

export function ManagedDatabaseLifecycleGuide({ description }) {
  return (
    <div className="erp-dev-quality-managed-database">
      {description}
      <div className="erp-dev-quality-managed-database__body">
        <div className="erp-dev-quality-managed-database__copy">
          <Text strong>静态工作原理，不代表当前运行状态</Text>
          <ol>
            {MANAGED_DATABASE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Text type="secondary">
            本机诊断只验证当前工作区，不自动提交、推送或发布；固定提交以服务器 CI 为准。
          </Text>
        </div>
        <MermaidDiagram
          chart={MANAGED_DATABASE_FLOW}
          label="本机托管数据库生命周期图"
          showSourceOnError={false}
          flowchartHtmlLabels={false}
        />
      </div>
    </div>
  )
}

export function GateExecutionFlow({ summary, operation, profile, standalone = false }) {
  const [expandedStage, setExpandedStage] = useState('')
  const trackLabel = standalone ? '服务端诊断执行轨道' : '本机诊断执行轨道'
  const stages = operation ? deriveStages(summary, operation) : previewStages(summary, profile)
  const groups = flowGroups(summary, profile, stages)
  const longestId = longestStageId(stages)

  if (stages.length === 0) return <Empty description="正在读取正式门禁阶段" />

  return (
    <section className="erp-dev-quality-flow" aria-label={trackLabel}>
      <div className="erp-dev-quality-flow__heading">
        <Text strong>执行阶段</Text>
        <Text type="secondary">{stages.length} 个阶段</Text>
      </div>
      <div className="erp-dev-quality-flow__table-wrap">
        <table className="erp-dev-quality-flow__table" data-table-lines="appearance">
          <thead>
            <tr>
              <th scope="col">阶段</th>
              <th scope="col">结果</th>
              <th scope="col">耗时</th>
              <th scope="col"><span className="erp-dev-quality-flow__details-label">详情</span></th>
            </tr>
          </thead>
          {groups.map((group) => (
            <tbody key={group.id}>
              <tr className="erp-dev-quality-flow__group">
                <th scope="rowgroup" colSpan={4}>{group.label}</th>
              </tr>
              {group.stages.map((stage) => {
                const displayStatus = flowStageStatus(stage, operation)
                const status = STAGE_STATUS[displayStatus] || STAGE_STATUS.not_run
                const index = stages.findIndex((item) => item.id === stage.id) + 1
                const hasDetails = Boolean(operation || stage.substeps.length)
                const expanded = expandedStage === stage.id
                const longest = longestId === stage.id && Number.isFinite(stage.durationMs)
                return (
                  <React.Fragment key={stage.id}>
                    <tr
                      className="erp-dev-quality-flow__step"
                      data-status={displayStatus}
                      data-emphasis={displayStatus === 'failed' ? 'failed' : displayStatus === 'running' ? 'current' : longest ? 'longest' : 'supporting'}
                      aria-current={displayStatus === 'running' ? 'step' : undefined}
                    >
                      <th scope="row">
                        <span className="erp-dev-quality-flow__number">{index}</span>
                        {stage.label}
                      </th>
                      <td><Tag color={status.color}>{status.label}</Tag></td>
                      <td>
                        {operation && Number.isFinite(stage.durationMs) ? formatQualityGateDuration(stage.durationMs) : '—'}
                        {longest ? <Text type="secondary" className="erp-dev-quality-flow__longest">最长</Text> : null}
                      </td>
                      <td>
                        {hasDetails ? (
                          <Button
                            type="link"
                            size="small"
                            aria-label={`${expanded ? '收起' : '查看'}${stage.label}详情`}
                            aria-expanded={expanded}
                            aria-controls={`quality-stage-detail-${stage.id}`}
                            onClick={() => setExpandedStage(expanded ? '' : stage.id)}
                          >
                            {expanded ? '收起' : '详情'}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="erp-dev-quality-flow__expanded">
                        <td colSpan={4} id={`quality-stage-detail-${stage.id}`}>
                          <StageDetails stage={stage} operation={operation} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}
