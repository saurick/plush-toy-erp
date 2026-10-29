import React, { useRef, useState } from 'react'
import { CheckCircleOutlined, QuestionCircleOutlined, StopOutlined } from '@ant-design/icons'
import { Button, Drawer, Progress, Space, Tag, Typography } from 'antd'
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
  terminalEvidence,
} from '../../config/qualityGatePresentation.mjs'
import { OperationStatusTag } from './QualityGateContextStrip.jsx'
import {
  TechnicalDetails,
  ManagedDatabaseLifecycleGuide,
  GateExecutionFlow,
  StageDurationComposition,
} from './QualityGateExecutionFlow.jsx'
import { QualityGateHistoryTrend } from './QualityGateEvidenceCharts.jsx'

const { Text, Title } = Typography

export function LocalDiagnosticsActions({
  context,
  summary,
  initialLoading,
  canRun,
  actionProfile,
  profile,
  onProfileChange,
  onStart,
}) {
  const [helpOpen, setHelpOpen] = useState(false)
  const helpRef = useRef(null)
  const lastDuration = profileDuration(summary, profile)
  return (
    <WorkbenchSection className="erp-dev-quality-actions" aria-label="本机质量诊断操作">
      <WorkbenchToolbar
        className="erp-dev-quality-actions__buttons"
        tools={(
          <Button ref={helpRef} type="text" icon={<QuestionCircleOutlined aria-hidden="true" />} onClick={() => setHelpOpen(true)}>
            运行说明
          </Button>
        )}
      >
        <label htmlFor="quality-diagnostic-profile">诊断范围</label>
        <Select
          allowClear={false /* 不可清空：诊断执行必须明确严格或完整范围。 */}
          placeholder="诊断范围"
          id="quality-diagnostic-profile"
          aria-label="诊断范围"
          value={profile}
          disabled={initialLoading || Boolean(actionProfile) || summary?.busy?.active}
          onChange={onProfileChange}
          options={[
            { value: 'strict', label: '严格诊断' },
            { value: 'full', label: '完整诊断' },
          ]}
        />
        <Button
          type="primary"
          aria-label={profile === 'strict' ? '运行本机严格诊断' : '运行本机完整诊断'}
          disabled={!canRun}
          loading={Boolean(actionProfile)}
          onClick={() => onStart(profile)}
        >
          运行诊断
        </Button>
        {!initialLoading && summary?.environment?.disposableDatabaseReady ? (
          <Text className="erp-dev-quality-actions__ready"><CheckCircleOutlined aria-hidden="true" /> 环境就绪</Text>
        ) : null}
        {Number.isFinite(lastDuration) ? (
          <Text type="secondary">上次耗时 {formatQualityGateDuration(lastDuration)}</Text>
        ) : null}
      </WorkbenchToolbar>
      {context}
      <Drawer
        title="诊断运行说明"
        width={800}
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        afterOpenChange={(open) => { if (!open) helpRef.current?.focus({ preventScroll: true }) }}
        destroyOnHidden
      >
        <ManagedDatabaseLifecycleGuide description={(
          <div className="erp-dev-quality-actions__environment">
            <Text>
              {profile === 'strict'
                ? '严格诊断在完整检查前增加工具链、Shell 和 YAML 检查。'
                : '完整诊断运行共用检查主路径。'}
            </Text>
            {summary?.environment ? <Text type="secondary">{summary.environment.message}</Text> : null}
          </div>
        )}
        />
      </Drawer>
    </WorkbenchSection>
  )
}

function renderHistoryEvidence(row) {
  return (
    <>
      <Text type="secondary">记录版本 {shortCommit(row.repository.commit)} · {row.repository.dirty ? '未提交改动' : '干净版本'}</Text>
      <TechnicalDetails operation={row} />
    </>
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
  const [technicalOpen, setTechnicalOpen] = useState(false)
  const technicalRef = useRef(null)
  const profile = operation?.profile || previewProfile
  const stages = operation ? deriveStages(summary, operation) : previewStages(summary, profile)
  const cancellable = operation && ['queued', 'running'].includes(operation.status)
  const active = Boolean(operation && DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status))
  const evidence = terminalEvidence(operation)
  const progress = operation ? stageProgress(stages) : 0
  const history = (summary?.operations || []).slice(0, 20)
  const historyColumns = [
    {
      align: 'left',
      title: '诊断 / 时间',
      dataIndex: 'profile',
      key: 'profile',
      render: (rowProfile, row) => (
        <div className="erp-dev-quality-history__identity">
          <Text>{rowProfile === 'strict' ? '严格诊断' : '完整诊断'}</Text>
          <DevTimestamp value={row.finishedAt || row.updatedAt} missing="时间未证明" />
        </div>
      ),
    },
    {
      align: 'left',
      title: '结果',
      key: 'status',
      render: (_, row) => <OperationStatusTag operation={row} />,
    },
    {
      title: '耗时',
      key: 'duration',
      render: (_, row) => formatQualityGateDuration(operationDuration(row)),
    },
  ]

  return (
    <div className="erp-dev-quality-run-view">
      <WorkbenchSection className="erp-dev-quality-operation" aria-live="polite" aria-label="诊断结果与执行轨道">
        <div className="erp-dev-quality-operation__heading">
          <Space size={8} wrap>
            <Title level={2}>{operation ? getQualityGateProfileLabel(operation.profile, standalone) : '诊断结果'}</Title>
            {operation ? <OperationStatusTag operation={operation} /> : <Text type="secondary">{summary ? '尚未运行' : '正在读取'}</Text>}
            {operation?.displayContext === 'current-proof' ? <Tag className="erp-dev-accent-tag">当前正式回执</Tag> : null}
            {operation?.displayContext === 'history' ? <Text type="secondary">历史版本，不代表当前工作区</Text> : null}
          </Space>
          <Space size={8}>
            {cancellable ? (
              <Button ref={cancelButtonRef} icon={<StopOutlined aria-hidden="true" />} danger onClick={() => onCancel(operation)}>
                取消运行
              </Button>
            ) : null}
            {operation ? (
              <Button ref={technicalRef} type="text" onClick={() => setTechnicalOpen(true)}>技术详情</Button>
            ) : null}
          </Space>
        </div>
        {operation ? (
          <>
            <WorkbenchFacts
              className="erp-dev-quality-operation__facts"
              items={[
                { label: active ? '已运行' : '总耗时', value: formatQualityGateDuration(operationDuration(operation)) },
                { label: active ? '开始时间' : operationUpdateAction(operation), value: <DevTimestamp value={active ? operation.createdAt : operation.finishedAt || operation.updatedAt} missing="时间未证明" /> },
                { label: '记录版本', value: `${shortCommit(operation.repository.commit)}${operation.repository.dirty ? ' · 未提交' : ''}` },
              ]}
            />
            {active ? (
              <>
                <WorkbenchFacts items={[
                  { label: '当前阶段', value: currentStageLabel(stages, operation) },
                  { label: '预计剩余', value: estimatedRemaining(summary, operation) },
                ]}
                />
                <Progress percent={progress} status="active" aria-label={`${getQualityGateProfileLabel(operation.profile, standalone)}进度 ${progress}%`} />
              </>
            ) : (
              <WorkbenchFacts
                className="erp-dev-quality-operation__evidence"
                items={[
                  { label: '正式回执', value: evidence.receipt.label },
                  { label: '资源清理', value: <Text type={evidence.cleanup.status === 'failed' ? 'danger' : undefined}>{evidence.cleanup.label}</Text> },
                ]}
              />
            )}
            {operation.firstFailure ? (
              <WorkbenchNotice tone="error" title={`第一失败：${operation.firstFailure}`} />
            ) : !['passed', 'running', 'queued'].includes(operation.status) ? (
              <Text>{operation.message}</Text>
            ) : null}
          </>
        ) : null}
        <GateExecutionFlow key={operation?.id || profile} summary={summary} operation={operation} profile={profile} standalone={standalone} />
      </WorkbenchSection>

      <WorkbenchSection className="erp-dev-quality-history" title={standalone ? '服务端最近诊断' : '本机最近诊断'} tools={<Text type="secondary">{history.length} 条</Text>}>
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 5, showSizeChanger: false, hideOnSinglePage: true }}
          dataSource={history}
          columns={historyColumns}
          locale={{ emptyText: '尚无运行记录' }}
          expandable={{
            columnWidth: 28,
            expandedRowRender: renderHistoryEvidence,
          }}
        />
        {history.length ? (
          <details className="erp-dev-disclosure erp-dev-quality-history-analysis">
            <summary>耗时分析</summary>
            <StageDurationComposition stages={stages} />
            <QualityGateHistoryTrend operations={summary?.operations || []} operation={operation} />
          </details>
        ) : null}
      </WorkbenchSection>
      {actionProfile ? <Text className="erp-dev-quality-action-status">正在启动{getQualityGateProfileLabel(actionProfile, standalone)}</Text> : null}
      <Drawer
        title="诊断技术详情"
        width={680}
        open={technicalOpen && Boolean(operation)}
        onClose={() => setTechnicalOpen(false)}
        afterOpenChange={(open) => { if (!open) technicalRef.current?.focus({ preventScroll: true }) }}
        destroyOnHidden
      >
        <TechnicalDetails operation={operation} />
      </Drawer>
    </div>
  )
}
