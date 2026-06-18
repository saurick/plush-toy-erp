import React from 'react'
import {
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  LinkOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Alert, Button, Drawer, Input, Space, Tag, Typography } from 'antd'
import {
  formatWorkflowTaskSource,
  resolveWorkflowTaskEntryPath,
} from '../../utils/dashboardTaskDisplay.mjs'
import { isTerminalWorkflowTask } from '../../utils/workflowDashboardStats.mjs'
import {
  getTaskOwnerRoleKey,
  getWorkflowTaskDueLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
} from '../../utils/workflowTaskBoard.mjs'

const { Paragraph, Title } = Typography
const { TextArea } = Input

export const TASK_ACTION_META = Object.freeze({
  complete: {
    title: '处理完成',
    buttonLabel: '确认完成',
    successMessage: '任务已处理完成',
    requireReason: false,
  },
  block: {
    title: '标记阻塞',
    buttonLabel: '提交阻塞',
    successMessage: '阻塞原因已记录',
    requireReason: true,
  },
  urge: {
    title: '催办',
    buttonLabel: '提交催办',
    successMessage: '催办已记录',
    requireReason: true,
  },
})

const TASK_DRAWER_STEPS = Object.freeze([
  {
    key: 'context',
    title: '核对上下文',
    description: '确认任务、来源、责任角色和到期状态。',
  },
  {
    key: 'action',
    title: '选择动作',
    description: '完成、阻塞或催办，只写 Workflow 任务事件。',
  },
  {
    key: 'submit',
    title: '提交回队列',
    description: '刷新任务列表，不自动写入事实层。',
  },
])

export function getTaskActionDescription(actionMode = '') {
  if (actionMode === 'complete') {
    return '确认后只关闭当前 Workflow 协同任务；库存、出货、财务、开票或付款仍需进入对应业务模块处理。'
  }
  if (actionMode === 'block') {
    return '请写清卡点原因、影响范围和下一责任人，后续角色才能接续处理。'
  }
  if (actionMode === 'urge') {
    return '请写清催办对象和需要补齐的事项，避免只留下无上下文提醒。'
  }
  return '先选择一个处理动作；任务上下文只用于核对，不保存业务事实。'
}

function getTaskActionTone(actionMode = '') {
  if (actionMode === 'complete') return 'success'
  if (actionMode === 'block') return 'danger'
  if (actionMode === 'urge') return 'warning'
  return 'neutral'
}

function formatTaskCode(task = {}) {
  return task.task_code || `TASK-${task.id || '-'}`
}

export default function WorkflowTaskActionDrawer({
  task,
  actionMode = '',
  actionReason = '',
  actionSaving = false,
  allowedActionModes = [],
  readonlyReason = '',
  roleLabelMap,
  onActionModeChange,
  onActionReasonChange,
  onClose,
  onOpenEntry,
  onSubmit,
}) {
  const actionMeta = actionMode ? TASK_ACTION_META[actionMode] : null
  const statusMeta = task ? getWorkflowTaskStatusMeta(task) : null
  const isTerminal = task ? isTerminalWorkflowTask(task) : false
  const entryPath = task ? resolveWorkflowTaskEntryPath(task) : ''
  const taskReason = task ? getWorkflowTaskReason(task) : ''
  const actionTone = getTaskActionTone(actionMode)
  const ownerRoleKey = task ? getTaskOwnerRoleKey(task) : ''
  const ownerRoleLabel = roleLabelMap?.get?.(ownerRoleKey) || ownerRoleKey
  const canOpenEntry = Boolean(task && entryPath && onOpenEntry)
  const allowedActionModeSet = new Set(allowedActionModes)
  const canSubmitAction = Boolean(
    actionMode && allowedActionModeSet.has(actionMode) && !isTerminal
  )
  const canChooseActions = allowedActionModes.length > 0

  const selectAction = (nextMode, nextReason = '') => {
    onActionModeChange?.(nextMode)
    onActionReasonChange?.(nextReason)
  }

  const clearAction = () => {
    selectAction('', '')
  }

  return (
    <Drawer
      title={
        <div className="erp-task-action-drawer__title">
          <span>任务处理</span>
          <strong>{actionMeta?.title || '查看任务上下文'}</strong>
        </div>
      }
      width="min(640px, calc(100vw - 24px))"
      open={Boolean(task)}
      onClose={onClose}
      destroyOnHidden
      className="erp-task-action-drawer"
      extra={
        task ? (
          <Space size={8} wrap>
            <Tag>{formatTaskCode(task)}</Tag>
            <Tag color={statusMeta?.color}>{statusMeta?.label}</Tag>
          </Space>
        ) : null
      }
      footer={
        task ? (
          <div className="erp-task-action-drawer__footer">
            <Space
              wrap
              size={[8, 8]}
              className="erp-task-action-drawer__footer-actions"
            >
              {actionMeta ? (
                <>
                  <Button disabled={actionSaving} onClick={clearAction}>
                    返回动作选择
                  </Button>
                  <Button
                    type="primary"
                    danger={actionMode === 'block'}
                    icon={<SendOutlined />}
                    loading={actionSaving}
                    disabled={!canSubmitAction}
                    onClick={onSubmit}
                  >
                    {actionMeta.buttonLabel}
                  </Button>
                </>
              ) : (
                <>
                  {allowedActionModeSet.has('complete') ? (
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={() => selectAction('complete', '')}
                    >
                      处理完成
                    </Button>
                  ) : null}
                  {allowedActionModeSet.has('block') ? (
                    <Button
                      danger
                      icon={<ExclamationCircleOutlined />}
                      onClick={() => selectAction('block', taskReason)}
                    >
                      标记阻塞
                    </Button>
                  ) : null}
                  {allowedActionModeSet.has('urge') ? (
                    <Button
                      icon={<ClockCircleOutlined />}
                      onClick={() => selectAction('urge', '')}
                    >
                      催办
                    </Button>
                  ) : null}
                  {!canChooseActions ? (
                    <Button onClick={onClose}>关闭</Button>
                  ) : null}
                </>
              )}
              {canOpenEntry ? (
                <Button
                  icon={<LinkOutlined />}
                  onClick={() => onOpenEntry(task)}
                >
                  查看关联记录
                </Button>
              ) : null}
            </Space>
          </div>
        ) : null
      }
    >
      {task ? (
        <div className="erp-task-action-drawer__body">
          <section className="erp-task-action-drawer__summary">
            <div className="erp-task-action-drawer__eyebrow">当前任务</div>
            <Title level={4} className="erp-task-action-drawer__task-title">
              {task.task_name || '未命名任务'}
            </Title>
            <div className="erp-task-action-drawer__meta-grid">
              <div>
                <span>来源</span>
                <strong>{formatWorkflowTaskSource(task)}</strong>
              </div>
              <div>
                <span>负责角色</span>
                <strong>{ownerRoleLabel || '-'}</strong>
              </div>
              <div>
                <span>到期时间</span>
                <strong>{getWorkflowTaskDueLabel(task)}</strong>
              </div>
              <div>
                <span>当前状态</span>
                <strong>{statusMeta?.label || '-'}</strong>
              </div>
            </div>
            {taskReason ? (
              <div className="erp-task-action-drawer__reason">
                <span>阻塞 / 退回原因</span>
                <strong>{taskReason}</strong>
              </div>
            ) : null}
          </section>

          <section
            className="erp-task-action-drawer__guide"
            aria-label="任务处理导引"
          >
            <div className="erp-task-action-drawer__guide-steps">
              {TASK_DRAWER_STEPS.map((step, index) => {
                const active =
                  (index === 0 && !actionMeta) ||
                  (index === 1 && actionMeta && !actionSaving) ||
                  (index === 2 && actionSaving)
                return (
                  <div
                    key={step.key}
                    className={[
                      'erp-task-action-drawer__step',
                      active ? 'erp-task-action-drawer__step--active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.description}</small>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="erp-task-action-drawer__guide-note">
              <AlertOutlined aria-hidden="true" />
              <span>
                <strong>Workflow / Fact 边界：</strong>
                完成、阻塞和催办只处理协同任务；库存、出货、应收、开票、付款或其他事实仍回到对应业务模块。
              </span>
            </div>
          </section>

          {actionMeta ? (
            <section
              className={[
                'erp-task-action-drawer__action-panel',
                `erp-task-action-drawer__action-panel--${actionTone}`,
              ].join(' ')}
            >
              <div className="erp-task-action-drawer__action-head">
                <div>
                  <span>当前动作</span>
                  <strong>{actionMeta.title}</strong>
                </div>
                <Tag color={actionMeta.requireReason ? 'orange' : 'green'}>
                  {actionMeta.requireReason ? '必须填写原因' : '确认即可'}
                </Tag>
              </div>
              <Paragraph className="erp-task-action-drawer__action-copy">
                {getTaskActionDescription(actionMode)}
              </Paragraph>
              {!canSubmitAction ? (
                <Alert
                  type="warning"
                  showIcon
                  message="当前账号不能提交这个动作"
                  description={
                    readonlyReason || '请确认任务状态、处理角色和权限。'
                  }
                />
              ) : null}
              {actionMeta.requireReason ? (
                <TextArea
                  value={actionReason}
                  autoSize={{ minRows: 4, maxRows: 6 }}
                  maxLength={180}
                  showCount
                  disabled={!canSubmitAction}
                  placeholder="填写原因、影响范围、需要谁处理"
                  onChange={(event) =>
                    onActionReasonChange?.(event.target.value)
                  }
                />
              ) : (
                <div className="erp-task-action-drawer__confirm-copy">
                  <CheckCircleOutlined aria-hidden="true" />
                  <span>
                    提交后任务会回到已完成队列；真实业务对象是否继续处理，仍以关联模块为准。
                  </span>
                </div>
              )}
            </section>
          ) : (
            <section className="erp-task-action-drawer__action-prompt">
              <strong>
                {canChooseActions ? '选择一个处理动作' : '只读任务上下文'}
              </strong>
              <span>
                {canChooseActions
                  ? getTaskActionDescription('')
                  : readonlyReason || '当前账号不能直接处理该任务。'}
              </span>
            </section>
          )}
        </div>
      ) : null}
    </Drawer>
  )
}
