import React, { useState } from 'react'
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { Descriptions, Empty, Space, Tag, Typography } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import DevTimestamp from '../DevTimestamp.jsx'
import {
  buildQualityGateStageDurationComposition,
  formatQualityGateDuration,
  getQualityGateFlowSegments,
} from '../../config/devQualityGates.mjs'
import {
  PROFILE_LABELS,
  STAGE_STATUS,
  MANAGED_DATABASE_STEPS,
  MANAGED_DATABASE_FLOW,
  deriveStages,
  previewStages,
  flowStageStatus,
  flowGroups,
  terminalEvidence,
  longestStageId,
  operationUpdateAction,
} from '../../config/qualityGatePresentation.mjs'

const { Text } = Typography

export function TechnicalDetails({ operation }) {
  if (!operation) return null
  return (
    <details className="erp-dev-quality-technical">
      <summary>查看技术详情</summary>
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
    </details>
  )
}

function FlowMarker({ index, status }) {
  if (status === 'passed') return <CheckCircleOutlined aria-hidden="true" />
  if (status === 'failed') return <CloseCircleOutlined aria-hidden="true" />
  return <span aria-hidden="true">{index}</span>
}

function TerminalEvidence({ operation }) {
  const evidence = terminalEvidence(operation)
  const items = [
    {
      key: 'receipt',
      title: '正式回执',
      timestamp: operation?.receipt?.finishedAt,
      ...evidence.receipt,
    },
    { key: 'cleanup', title: '资源清理', ...evidence.cleanup },
  ]
  return (
    <section
      className="erp-dev-quality-flow__terminal"
      aria-label="门禁终态证明"
    >
      <div className="erp-dev-quality-flow__segment-heading">
        <div>
          <Text strong>终态证明</Text>
          <Text type="secondary">不计入 runner 运行阶段</Text>
        </div>
        <Tag>回执 + 清理读回</Tag>
      </div>
      <div className="erp-dev-quality-flow__terminal-items">
        {items.map((item) => {
          const status = STAGE_STATUS[item.status] || STAGE_STATUS.not_run
          return (
            <div
              className="erp-dev-quality-flow__terminal-item"
              data-status={item.status}
              key={item.key}
            >
              <span className="erp-dev-quality-flow__terminal-marker">
                <FlowMarker index="•" status={item.status} />
              </span>
              <div>
                <Text strong>{item.title}</Text>
                <Text type="secondary">{item.label}</Text>
                {item.timestamp ? (
                  <DevTimestamp
                    value={item.timestamp}
                    action="完成于"
                    missing="完成时间未证明"
                  />
                ) : null}
              </div>
              <Tag color={status.color}>{status.label}</Tag>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StageDetails({ stage, operation }) {
  const hasSubsteps = stage.substeps.length > 0
  if (!hasSubsteps && !operation) return null
  return (
    <details className="erp-dev-quality-flow__details">
      <summary>
        {hasSubsteps
          ? `固定子步骤 ${stage.substeps.length} 项`
          : '阶段技术信息'}
      </summary>
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
    </details>
  )
}

function StageDurationComposition({ stages }) {
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

export function ManagedDatabaseLifecycleGuide() {
  const [diagramOpen, setDiagramOpen] = useState(false)
  return (
    <details
      className="erp-dev-quality-managed-database"
      onToggle={(event) => setDiagramOpen(event.currentTarget.open)}
    >
      <summary>查看本机托管数据库的静态运行与清理流程</summary>
      <div className="erp-dev-quality-managed-database__body">
        <div className="erp-dev-quality-managed-database__copy">
          <Text strong>静态工作原理，不代表当前运行状态</Text>
          <ol>
            {MANAGED_DATABASE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Text type="secondary">
            当前是否就绪、运行到哪里、是否清理完成，仍以上方状态和正式 operation
            回执为准。
          </Text>
        </div>
        {diagramOpen ? (
          <MermaidDiagram
            chart={MANAGED_DATABASE_FLOW}
            label="本机托管数据库生命周期图"
            showSourceOnError={false}
            flowchartHtmlLabels={false}
          />
        ) : null}
      </div>
    </details>
  )
}

export function GateExecutionFlow({ summary, operation, profile }) {
  const stages = operation
    ? deriveStages(summary, operation)
    : previewStages(summary, profile)
  const groups = flowGroups(summary, profile, stages)
  const longestId = longestStageId(stages)
  const composition = buildQualityGateStageDurationComposition(stages)
  const compositionById = new Map(
    composition.items.map((item) => [item.id, item])
  )
  const strictSegments = getQualityGateFlowSegments(summary?.profiles, 'strict')
  const strictExtraCount =
    strictSegments.find((segment) => segment.id === 'strict-extra')?.stages
      .length || 0

  if (stages.length === 0) {
    return <Empty description="正在读取正式门禁阶段" />
  }

  return (
    <section className="erp-dev-quality-flow" aria-label="本机诊断执行轨道">
      <div className="erp-dev-quality-flow__heading">
        <div>
          <Text strong>本机诊断执行轨道</Text>
          <Text type="secondary">
            {profile === 'strict'
              ? `先运行 ${strictExtraCount} 个 strict 附加检查，再进入 full 共用主路径。`
              : `直接运行 full 共用主路径；strict 会在此之前增加 ${strictExtraCount} 个检查。`}
          </Text>
        </div>
        <Tag className={operation ? 'erp-dev-accent-tag' : undefined}>
          {PROFILE_LABELS[profile]} · {stages.length} 个阶段
        </Tag>
      </div>
      <div className="erp-dev-quality-flow__segments">
        {groups.map((group) => (
          <section className="erp-dev-quality-flow__segment" key={group.id}>
            <div className="erp-dev-quality-flow__segment-heading">
              <Text strong>{group.label}</Text>
              <Tag>{group.scopeLabel}</Tag>
            </div>
            <ol className="erp-dev-quality-flow__track">
              {group.stages.map((stage) => {
                const displayStatus = flowStageStatus(stage, operation)
                const status =
                  STAGE_STATUS[displayStatus] || STAGE_STATUS.not_run
                const index =
                  stages.findIndex((item) => item.id === stage.id) + 1
                const duration = compositionById.get(stage.id)
                const emphasis =
                  displayStatus === 'failed'
                    ? 'failed'
                    : displayStatus === 'running'
                      ? 'current'
                      : longestId === stage.id && duration
                        ? 'longest'
                        : 'supporting'
                return (
                  <li
                    className="erp-dev-quality-flow__step"
                    data-status={displayStatus}
                    data-emphasis={emphasis}
                    aria-current={
                      displayStatus === 'running' ? 'step' : undefined
                    }
                    key={stage.id}
                  >
                    <span className="erp-dev-quality-flow__marker">
                      <FlowMarker index={index} status={displayStatus} />
                    </span>
                    <div className="erp-dev-quality-flow__step-body">
                      <div className="erp-dev-quality-flow__step-title">
                        <Text type="secondary">第 {index} 步</Text>
                        <Text strong>{stage.label}</Text>
                      </div>
                      <Space size={6} wrap>
                        <Tag color={status.color}>{status.label}</Tag>
                        {longestId === stage.id && duration ? (
                          <Tag color="gold">最长阶段</Tag>
                        ) : null}
                        {stage.substeps.length ? (
                          <Tag>{stage.substeps.length} 个固定子步骤</Tag>
                        ) : null}
                      </Space>
                      {operation && duration ? (
                        <Text type="secondary">
                          {formatQualityGateDuration(duration.durationMs)} ·
                          已记录阶段耗时占比 {duration.sharePercent}%
                        </Text>
                      ) : null}
                      <StageDetails stage={stage} operation={operation} />
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
      <StageDurationComposition stages={stages} />
      <TerminalEvidence operation={operation} />
    </section>
  )
}
