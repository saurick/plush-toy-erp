import React from 'react'
import { StopOutlined } from '@ant-design/icons'
import { Button, Progress, Space, Tag, Typography } from 'antd'
import Select from '@/common/components/select/AppSelect'
import Table from '@/common/components/table/AppTable'
import DevTimestamp from '../DevTimestamp.jsx'
import { WorkbenchFacts, WorkbenchNotice, WorkbenchSection, WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import {
  DEV_QUALITY_GATE_ACTIVE_STATUSES,
  formatQualityGateDuration,
} from '../../config/devQualityGates.mjs'
import {
  getQualityGateProfileLabel,
  shortCommit,
  operationDuration,
  profileDuration,
  estimatedRemaining,
  deriveStages,
  stageProgress,
  previewStages,
  currentStageLabel,
  operationUpdateAction,
} from '../../config/qualityGatePresentation.mjs'
import { OperationStatusTag } from './QualityGateContextStrip.jsx'
import {
  TechnicalDetails,
  ManagedDatabaseLifecycleGuide,
  GateExecutionFlow,
} from './QualityGateExecutionFlow.jsx'
import { QualityGateHistoryTrend } from './QualityGateEvidenceCharts.jsx'

const { Paragraph, Text, Title } = Typography

export function LocalDiagnosticsActions({
  summary,
  initialLoading,
  canRun,
  actionProfile,
  profile,
  onProfileChange,
  onStart,
}) {
  return (
    <WorkbenchSection className="erp-dev-quality-actions" aria-label="本机质量诊断操作">
      <WorkbenchToolbar className="erp-dev-quality-actions__buttons">
        <label htmlFor="quality-diagnostic-profile">诊断范围</label>
        <Select
          allowClear={
            false /* 不可清空：诊断执行必须明确严格或完整范围，不能用空值隐式选择执行任务。 */
          }
          placeholder="诊断范围"
          id="quality-diagnostic-profile"
          aria-label="诊断范围"
          value={profile}
          disabled={
            initialLoading || Boolean(actionProfile) || summary?.busy?.active
          }
          onChange={onProfileChange}
          options={[
            { value: 'strict', label: '严格诊断' },
            { value: 'full', label: '完整诊断' },
          ]}
        />
        <Button
          type="primary"
          disabled={!canRun}
          loading={Boolean(actionProfile)}
          onClick={() => onStart(profile)}
        >
          {profile === 'strict' ? '运行本机严格诊断' : '运行本机完整诊断'}
        </Button>
        <Text type="secondary">
          最近耗时{' '}
          {formatQualityGateDuration(profileDuration(summary, profile))}
        </Text>
        {!initialLoading && summary?.environment ? (
          <Tag
            color={
              summary.environment.disposableDatabaseReady
                ? 'success'
                : 'warning'
            }
          >
            {summary.environment.disposableDatabaseReady
              ? '运行环境已就绪'
              : '运行环境未就绪'}
          </Tag>
        ) : null}
      </WorkbenchToolbar>
      <div className="erp-dev-quality-actions__environment">
        <Text type="secondary">
          {profile === 'strict'
            ? '严格诊断额外检查工具链、Shell 和 YAML。'
            : ''}
          结果仅证明当前工作区；固定提交门禁由 GitLab CI 执行。
        </Text>
        {!initialLoading && summary?.environment ? (
          <Text type="secondary">
            {summary.environment.disposableDatabaseReady
              ? summary.environment.message
              : '请按上方建议完成本机运行环境准备。'}
          </Text>
        ) : null}
      </div>
      <ManagedDatabaseLifecycleGuide />
    </WorkbenchSection>
  )
}

export function RunView({
  summary,
  operation,
  previewProfile,
  actionProfile,
  onCancel,
  cancelButtonRef,
  standalone = false,
}) {
  const executionLabel = standalone ? '服务端' : '本机'
  const profile = operation?.profile || previewProfile
  const stages = operation
    ? deriveStages(summary, operation)
    : previewStages(summary, profile)
  const cancellable =
    operation && ['queued', 'running'].includes(operation.status)
  const progress = operation ? stageProgress(stages) : 0
  const history = (summary?.operations || []).slice(0, 20)
  const historyColumns = [
    {
      align: 'left',
      title: '门禁',
      dataIndex: 'profile',
      key: 'profile',
      render: (profile) => getQualityGateProfileLabel(profile, standalone),
    },
    {
      align: 'left',
      title: '结果',
      dataIndex: 'status',
      key: 'status',
      render: (_, row) => <OperationStatusTag operation={row} />,
    },
    {
      title: '耗时',
      key: 'duration',
      render: (_, row) => formatQualityGateDuration(operationDuration(row)),
    },
    {
      title: '时间',
      key: 'time',
      width: 220,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <DevTimestamp
            value={row.createdAt}
            action="开始于"
            missing="开始时间未证明"
          />
          <DevTimestamp
            value={row.finishedAt || row.updatedAt}
            action={operationUpdateAction(row)}
            missing="更新时间未证明"
          />
        </Space>
      ),
    },
    {
      align: 'left',
      title: '版本',
      key: 'version',
      render: (_, row) => (
        <Space size={6}>
          <Text code>{shortCommit(row.repository.commit)}</Text>
          {row.repository.dirty ? <Tag color="warning">dirty</Tag> : null}
        </Space>
      ),
    },
  ]

  return (
    <div className="erp-dev-quality-run-view">
      <WorkbenchSection className="erp-dev-quality-operation" aria-live="polite" aria-label="诊断结果与执行轨道">
        {operation ? (
          <>
            <div className="erp-dev-quality-operation__heading">
              <div>
                <Space size={8} wrap>
                  <Title level={2}>{getQualityGateProfileLabel(operation.profile, standalone)}</Title>
                  <OperationStatusTag operation={operation} />
                  {operation.displayContext === 'current-proof' ? (
                    <Tag className="erp-dev-accent-tag">当前正式回执</Tag>
                  ) : null}
                  {operation.displayContext === 'history' ? (
                    <Tag color="warning">{executionLabel}历史</Tag>
                  ) : null}
                </Space>
                <Paragraph>{operation.message}</Paragraph>
                <Space wrap size={[12, 4]}>
                  <DevTimestamp
                    value={operation.createdAt}
                    action="开始于"
                    missing="开始时间未证明"
                  />
                  <DevTimestamp
                    value={operation.finishedAt || operation.updatedAt}
                    action={operationUpdateAction(operation)}
                    missing="更新时间未证明"
                  />
                </Space>
              </div>
              {cancellable ? (
                <Button
                  ref={cancelButtonRef}
                  icon={<StopOutlined />}
                  danger
                  onClick={() => onCancel(operation)}
                >
                  取消运行
                </Button>
              ) : null}
            </div>
            <WorkbenchFacts
              className="erp-dev-quality-operation__facts"
              items={[
              { label: '已运行 / 总耗时', value: formatQualityGateDuration(operationDuration(operation)) },
              { label: '当前阶段', value: currentStageLabel(stages, operation) },
              { label: DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status) ? '预计剩余' : '运行状态', value: estimatedRemaining(summary, operation) },
            ]}
            />
            <Progress
              percent={progress}
              status={
                operation.status === 'failed'
                  ? 'exception'
                  : operation.status === 'passed'
                    ? 'success'
                    : 'active'
              }
              aria-label={`${getQualityGateProfileLabel(operation.profile, standalone)}进度 ${progress}%`}
            />
            {operation.firstFailure ? (
              <WorkbenchNotice
                tone="error"
                title={`第一失败：${operation.firstFailure}`}
                description="请先修复第一失败阶段，再重新运行；页面不会自动重试。"
              />
            ) : null}
          </>
        ) : (
          <div className="erp-dev-quality-operation__heading">
            <div>
              <Space size={8} wrap>
                <Title level={2}>{getQualityGateProfileLabel(profile, standalone)}流程预览</Title>
                <Tag>尚未运行</Tag>
              </Space>
              <Paragraph>
                运行后会在同一条轨道上原位显示当前阶段、第一失败、耗时、正式回执和清理读回。
              </Paragraph>
            </div>
          </div>
        )}
        <GateExecutionFlow
          summary={summary}
          operation={operation}
          profile={profile}
          standalone={standalone}
        />
        {operation ? <TechnicalDetails operation={operation} /> : null}
      </WorkbenchSection>

      <WorkbenchSection
        className="erp-dev-quality-history"
        aria-labelledby="quality-history-title"
      >
        <div className="erp-dev-quality-section-heading">
          <Title id="quality-history-title" level={2}>
            {standalone ? '服务端最近诊断' : '本机最近诊断'}
          </Title>
          <Text type="secondary">
            每种{executionLabel}诊断最多保留最近 20 次脱敏记录；不混入 GitLab 流水线
          </Text>
        </div>
        <QualityGateHistoryTrend
          operations={summary?.operations || []}
          operation={operation}
        />
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={history}
          columns={historyColumns}
          locale={{ emptyText: '尚无运行记录' }}
          scroll={{ x: 900 }}
        />
      </WorkbenchSection>

      <Text type="secondary" className="erp-dev-quality-action-status">
        {actionProfile
          ? `正在启动${getQualityGateProfileLabel(actionProfile, standalone)}`
          : standalone
            ? '此处展示本服务的诊断记录；固定提交的 CI 结果请到“服务器 CI”核对。'
            : '本机诊断完成后不会自动提交、推送、发布或部署，也不替代 GitLab CI Gate。'}
      </Text>
    </div>
  )
}
