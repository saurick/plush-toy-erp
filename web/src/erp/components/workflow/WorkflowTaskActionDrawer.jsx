import React from 'react'
import {
  AlertOutlined,
  CheckCircleOutlined,
  LinkOutlined,
  SendOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Drawer,
  Input,
  Space,
  Tag,
  Timeline,
  Typography,
} from 'antd'
import { listWorkflowTaskEvents } from '../../api/workflowApi.mjs'
import {
  formatWorkflowTaskSource,
  resolveWorkflowTaskEntryPath,
} from '../../utils/dashboardTaskDisplay.mjs'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import {
  getWorkflowTaskCodeLabel,
  getWorkflowTaskDueLabel,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
} from '../../utils/workflowTaskBoard.mjs'
import {
  getWorkflowTaskActionStepAvailability,
  isWorkflowTaskActionReady,
  moveWorkflowTaskActionStep,
  resolveWorkflowTaskActionInitialStep,
  resolveWorkflowTaskActionStep,
} from '../../utils/workflowTaskActionFlow.mjs'
import { isWorkflowApprovalTask } from '../../utils/workflowTaskActionContract.mjs'
import { getRoleDisplayName } from '../../utils/roleKeys.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'

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
  reject: {
    title: '退回任务',
    buttonLabel: '提交退回',
    successMessage: '退回原因已记录',
    requireReason: true,
  },
  resume: {
    title: '解除阻塞',
    buttonLabel: '确认恢复待处理',
    successMessage: '任务已解除阻塞',
    requireReason: true,
  },
  urge: {
    title: '催办',
    buttonLabel: '提交催办',
    successMessage: '催办已记录',
    requireReason: true,
  },
})

export function getWorkflowTaskActionMeta(task = {}, actionMode = '') {
  const base = TASK_ACTION_META[actionMode]
  if (!base || !isWorkflowApprovalTask(task)) return base || null
  if (actionMode === 'complete') {
    return {
      ...base,
      title: '审批通过',
      buttonLabel: '确认通过',
      successMessage: '审批已通过',
    }
  }
  if (actionMode === 'reject') {
    return {
      ...base,
      title: '审批退回',
      buttonLabel: '确认退回',
      successMessage: '审批已退回',
    }
  }
  return base
}

const EVENT_LABELS = Object.freeze({
  created: '审批已发起',
  complete: '审批已通过',
  block: '审批已阻塞',
  reject: '审批已退回',
  resume: '审批已恢复',
  urge_task: '已催办',
  urge_role: '已催办岗位',
  urge_assignee: '已催办处理人',
})

function getApprovalEventLabel(event = {}) {
  if (event.event_type === 'status_changed') {
    if (event.to_status_key === 'done') return EVENT_LABELS.complete
    if (event.to_status_key === 'rejected') return EVENT_LABELS.reject
    if (event.to_status_key === 'blocked') return EVENT_LABELS.block
    if (event.to_status_key === 'ready') return EVENT_LABELS.resume
  }
  return EVENT_LABELS[event.event_type] || '审批状态已更新'
}

function formatEventTime(value) {
  const timestamp = Number(value || 0)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '时间未记录'
  return new Date(timestamp * 1000).toLocaleString('zh-CN', { hour12: false })
}

const TASK_DRAWER_STEPS = Object.freeze([
  {
    key: 'context',
    title: '核对任务',
    description: '确认任务、来源、责任和截止时间。',
  },
  {
    key: 'action',
    title: '选择处理',
    description: '选择当前账号可以执行的处理方式。',
  },
  {
    key: 'confirm',
    title: '确认与提交',
    description: '核对本次操作后再提交。',
  },
])

const TASK_ACTION_DESCRIPTIONS = Object.freeze({
  complete: '任务已按要求处理完毕，确认后关闭当前待办。',
  block: '任务暂时无法继续，登记卡点和需要谁协助。',
  reject: '信息或处理结果不符合要求，退回上一责任方补充。',
  resume: '阻塞事项已经解决，恢复为可继续办理。',
  urge: '提醒当前负责人尽快处理，不代替对方完成任务。',
})

export function getTaskActionDescription(actionMode = '') {
  if (actionMode === 'complete') {
    return '确认后只完成当前任务；库存、出货、财务、开票或付款仍需进入对应业务页面处理。'
  }
  if (actionMode === 'block') {
    return '请写清卡点原因、影响范围和需要谁协助，便于后续处理。'
  }
  if (actionMode === 'reject') {
    return '请写清退回依据、需补齐事项和需要哪个岗位补充；退回不会撤销已经完成的业务处理。'
  }
  if (actionMode === 'resume') {
    return '请说明阻塞如何解除；确认后任务恢复为可办理，不会自动产生库存、出货或财务记录。'
  }
  if (actionMode === 'urge') {
    return '请写清催办接收人和需要补齐的事项，便于对方了解原因。'
  }
  return '先选择处理方式；任务详情只用于核对，不会直接生成或修改业务记录。'
}

function getTaskActionTone(actionMode = '') {
  if (actionMode === 'complete') return 'success'
  if (actionMode === 'block') return 'danger'
  if (actionMode === 'reject') return 'danger'
  if (actionMode === 'resume') return 'success'
  if (actionMode === 'urge') return 'warning'
  return 'neutral'
}

export default function WorkflowTaskActionDrawer({
  task,
  actionMode = '',
  actionReason = '',
  actionSaving = false,
  actionAvailabilityLoading = false,
  allowedActionModes = [],
  readonlyReason = '',
  onActionModeChange,
  onActionReasonChange,
  onClose,
  onOpenEntry,
  onSubmit,
}) {
  const actionMeta = getWorkflowTaskActionMeta(task, actionMode)
  const approvalTask = isWorkflowApprovalTask(task)
  const statusMeta = task ? getWorkflowTaskStatusMeta(task) : null
  const isTerminal = task ? isTerminalWorkflowTask(task) : false
  const entryPath = task ? resolveWorkflowTaskEntryPath(task) : ''
  const taskReason = task ? getWorkflowTaskReason(task) : ''
  const actionTone = getTaskActionTone(actionMode)
  const ownerRoleLabel = task ? getWorkflowTaskOwnerRoleLabel(task) : ''
  const canOpenEntry = Boolean(task && entryPath && onOpenEntry)
  const allowedActionModeSet = new Set(allowedActionModes)
  const canSubmitAction = Boolean(
    actionMode && allowedActionModeSet.has(actionMode) && !isTerminal
  )
  const canChooseActions = allowedActionModes.length > 0
  const taskIdentity = task
    ? String(task.id || task.task_code || task.task_name || '')
    : ''
  const [activeStepKey, setActiveStepKey] = React.useState('context')
  const [taskEvents, setTaskEvents] = React.useState([])
  const [taskEventsState, setTaskEventsState] = React.useState('idle')
  const [taskEventsError, setTaskEventsError] = React.useState('')
  const previousTaskIdentityRef = React.useRef('')
  const stepButtonRefs = React.useRef(new Map())
  const actionOptionRefs = React.useRef(new Map())
  const visibleActionModes = allowedActionModes.filter(
    (mode) => TASK_ACTION_META[mode]
  )
  const hasVisibleActionSelection = visibleActionModes.includes(actionMode)
  const canConfirm = isWorkflowTaskActionReady({
    actionMode,
    actionReason,
    allowedActionModes,
    requireReason: Boolean(actionMeta?.requireReason),
  })
  const stepAvailability = React.useMemo(
    () =>
      getWorkflowTaskActionStepAvailability({
        canChooseActions,
        canConfirm,
      }),
    [canChooseActions, canConfirm]
  )
  React.useEffect(() => {
    if (taskIdentity === previousTaskIdentityRef.current) return
    previousTaskIdentityRef.current = taskIdentity
    setActiveStepKey(resolveWorkflowTaskActionInitialStep(actionMode))
  }, [actionMode, taskIdentity])

  React.useEffect(() => {
    if (!task) {
      previousTaskIdentityRef.current = ''
      setActiveStepKey('context')
    }
  }, [task])

  React.useEffect(() => {
    if (!task?.id || !approvalTask) {
      setTaskEvents([])
      setTaskEventsState('idle')
      setTaskEventsError('')
      return undefined
    }
    const controller = new AbortController()
    setTaskEventsState('loading')
    setTaskEventsError('')
    listWorkflowTaskEvents(task.id, { limit: 100, signal: controller.signal })
      .then((items) => {
        setTaskEvents(items)
        setTaskEventsState('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setTaskEvents([])
        setTaskEventsState('error')
        setTaskEventsError(getActionErrorMessage(error, '加载审批轨迹失败'))
      })
    return () => controller.abort()
  }, [approvalTask, task?.id])

  React.useEffect(() => {
    if (stepAvailability[activeStepKey]) return
    setActiveStepKey(
      resolveWorkflowTaskActionStep({
        requestedStep: activeStepKey,
        availability: stepAvailability,
      })
    )
  }, [activeStepKey, stepAvailability])

  const selectAction = (nextMode, nextReason = '') => {
    if (actionSaving) return
    onActionModeChange?.(nextMode)
    onActionReasonChange?.(nextReason)
    setActiveStepKey('action')
  }

  const selectStep = (stepKey) => {
    if (actionSaving) return
    const nextStep = resolveWorkflowTaskActionStep({
      requestedStep: stepKey,
      availability: stepAvailability,
      fallbackStep: activeStepKey,
    })
    setActiveStepKey(nextStep)
  }

  const handleStepKeyDown = (event, stepKey) => {
    if (actionSaving) return
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }
    let nextStepKey = stepKey
    if (event.key === 'Home') {
      nextStepKey = 'context'
    } else if (event.key === 'End') {
      nextStepKey = stepAvailability.confirm
        ? 'confirm'
        : stepAvailability.action
          ? 'action'
          : 'context'
    } else {
      nextStepKey = moveWorkflowTaskActionStep({
        currentStep: stepKey,
        direction: event.key === 'ArrowLeft' ? -1 : 1,
        availability: stepAvailability,
      })
    }
    event.preventDefault()
    setActiveStepKey(nextStepKey)
    requestAnimationFrame(() =>
      stepButtonRefs.current.get(nextStepKey)?.focus()
    )
  }

  const handleActionKeyDown = (event, mode) => {
    if (
      actionSaving ||
      ![
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ].includes(event.key)
    ) {
      return
    }
    const currentIndex = visibleActionModes.indexOf(mode)
    if (currentIndex < 0 || visibleActionModes.length === 0) return

    let nextIndex = currentIndex
    if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = visibleActionModes.length - 1
    } else {
      const offset =
        event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
      nextIndex =
        (currentIndex + offset + visibleActionModes.length) %
        visibleActionModes.length
    }

    const nextMode = visibleActionModes[nextIndex]
    event.preventDefault()
    selectAction(nextMode, nextMode === 'block' ? taskReason : '')
    requestAnimationFrame(() => actionOptionRefs.current.get(nextMode)?.focus())
  }

  return (
    <Drawer
      title={
        <div className="erp-task-action-drawer__title">
          <span>{approvalTask ? '审批办理' : '任务处理'}</span>
          <strong>{actionMeta?.title || '查看任务详情'}</strong>
        </div>
      }
      width="min(640px, calc(100vw - 24px))"
      open={Boolean(task)}
      closable={!actionSaving}
      maskClosable={!actionSaving}
      keyboard={!actionSaving}
      onClose={() => {
        if (!actionSaving) onClose?.()
      }}
      destroyOnHidden
      className="erp-task-action-drawer"
      extra={
        task ? (
          <Space size={8} wrap>
            <Tag>{getWorkflowTaskCodeLabel(task)}</Tag>
            <Tag color={statusMeta?.color}>{statusMeta?.label}</Tag>
          </Space>
        ) : null
      }
      footer={
        task ? (
          <div className="erp-task-action-drawer__footer">
            <div className="erp-task-action-drawer__footer-nav">
              {activeStepKey === 'context' ? (
                <Button disabled={actionSaving} onClick={onClose}>
                  关闭
                </Button>
              ) : (
                <Button
                  disabled={actionSaving}
                  onClick={() =>
                    selectStep(
                      activeStepKey === 'confirm' ? 'action' : 'context'
                    )
                  }
                >
                  上一步
                </Button>
              )}
              {canOpenEntry ? (
                <Button
                  icon={<LinkOutlined />}
                  disabled={actionSaving}
                  onClick={() => onOpenEntry(task)}
                >
                  {isTerminal ? '查看关联记录' : '去办理'}
                </Button>
              ) : null}
            </div>
            <div className="erp-task-action-drawer__footer-primary">
              {activeStepKey === 'context' && canChooseActions ? (
                <Button
                  type="primary"
                  disabled={actionSaving}
                  onClick={() => selectStep('action')}
                >
                  选择处理方式
                </Button>
              ) : null}
              {activeStepKey === 'action' ? (
                <Button
                  type="primary"
                  disabled={actionSaving || !canConfirm}
                  title={
                    canConfirm
                      ? undefined
                      : actionMeta?.requireReason
                        ? '先选择处理方式并填写原因'
                        : '先选择处理方式'
                  }
                  onClick={() => selectStep('confirm')}
                >
                  核对并确认
                </Button>
              ) : null}
              {activeStepKey === 'confirm' ? (
                <Button
                  type="primary"
                  danger={actionMode === 'block' || actionMode === 'reject'}
                  icon={<SendOutlined />}
                  loading={actionSaving}
                  disabled={actionSaving || !canSubmitAction || !canConfirm}
                  onClick={onSubmit}
                >
                  {actionMeta?.buttonLabel || '确认提交'}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null
      }
    >
      {task ? (
        <div className="erp-task-action-drawer__body" aria-busy={actionSaving}>
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
                <span>负责岗位</span>
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
                <span>当前原因</span>
                <strong>{taskReason}</strong>
              </div>
            ) : null}
          </section>

          <section
            className="erp-task-action-drawer__guide"
            aria-label="任务处理导引"
          >
            <div
              className="erp-task-action-drawer__guide-steps"
              role="tablist"
              aria-label="任务处理步骤"
            >
              {TASK_DRAWER_STEPS.map((step, index) => {
                const active = step.key === activeStepKey
                const available = stepAvailability[step.key]
                const interactive = available && !actionSaving
                return (
                  <button
                    type="button"
                    key={step.key}
                    ref={(node) => {
                      if (node) stepButtonRefs.current.set(step.key, node)
                      else stepButtonRefs.current.delete(step.key)
                    }}
                    id={`erp-task-action-step-${step.key}-tab`}
                    role="tab"
                    aria-selected={active}
                    aria-controls={`erp-task-action-step-${step.key}`}
                    aria-disabled={!interactive}
                    disabled={!interactive}
                    tabIndex={active ? 0 : -1}
                    title={
                      actionSaving
                        ? '正在提交，请稍候'
                        : available
                          ? `进入${step.title}`
                          : step.key === 'confirm'
                            ? '先选择处理方式并补齐必填信息'
                            : '当前账号没有可用的处理方式'
                    }
                    className={[
                      'erp-task-action-drawer__step',
                      active ? 'erp-task-action-drawer__step--active' : '',
                      !interactive
                        ? 'erp-task-action-drawer__step--disabled'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => interactive && selectStep(step.key)}
                    onKeyDown={(event) => handleStepKeyDown(event, step.key)}
                  >
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <small>{step.description}</small>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="erp-task-action-drawer__guide-note">
              <AlertOutlined aria-hidden="true" />
              <span>
                <strong>处理范围：</strong>
                完成、阻塞、解除阻塞、退回和催办只更新当前任务；库存、出货、应收、开票和付款仍需进入对应业务页面处理。
              </span>
            </div>
          </section>

          <section
            id="erp-task-action-step-context"
            role="tabpanel"
            aria-labelledby="erp-task-action-step-context-tab"
            hidden={activeStepKey !== 'context'}
            className="erp-task-action-drawer__step-panel"
          >
            <div className="erp-task-action-drawer__action-prompt">
              <strong>{approvalTask ? '核对审批事项' : '核对任务信息'}</strong>
              <span>
                请确认任务、来源、负责岗位、截止时间和已有原因；查看本页不会修改任务或业务记录。
              </span>
            </div>
            {actionAvailabilityLoading ? (
              <Alert
                type="info"
                showIcon
                message="正在确认可用的处理方式"
                description="确认完成前可以核对任务信息，确认完成后即可选择处理方式。"
              />
            ) : !canChooseActions ? (
              <Alert
                type="warning"
                showIcon
                message="当前只能查看任务"
                description={readonlyReason || '当前账号不能直接处理该任务。'}
              />
            ) : null}
          </section>

          {approvalTask ? (
            <section
              className="erp-task-action-drawer__step-panel"
              aria-label="审批轨迹"
            >
              <div className="erp-task-action-drawer__action-prompt">
                <strong>最近审批记录</strong>
                <span>按时间倒序展示最近 100 条处理岗位、意见、状态和版本。</span>
              </div>
              {taskEventsState === 'loading' ? (
                <Alert type="info" showIcon message="正在加载审批轨迹" />
              ) : taskEventsState === 'error' ? (
                <Alert type="error" showIcon message={taskEventsError} />
              ) : taskEvents.length > 0 ? (
                <Timeline
                  items={taskEvents.map((event) => ({
                    color:
                      event.to_status_key === 'rejected' ||
                      event.to_status_key === 'blocked'
                        ? 'red'
                        : 'blue',
                    children: (
                      <div>
                        <strong>
                          {getApprovalEventLabel(event)}
                        </strong>
                        <Paragraph type="secondary">
                          {getRoleDisplayName(event.actor_role_key, '系统')} ·{' '}
                          {formatEventTime(event.created_at)}
                          {event.task_version
                            ? ` · 版本 ${event.task_version}`
                            : ''}
                        </Paragraph>
                        {event.reason ? (
                          <Paragraph>{event.reason}</Paragraph>
                        ) : null}
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Alert type="info" showIcon message="暂无可展示的审批轨迹" />
              )}
            </section>
          ) : null}

          <section
            id="erp-task-action-step-action"
            role="tabpanel"
            aria-labelledby="erp-task-action-step-action-tab"
            hidden={activeStepKey !== 'action'}
            className="erp-task-action-drawer__step-panel"
          >
            <div className="erp-task-action-drawer__action-workspace">
              <div className="erp-task-action-drawer__action-prompt">
                <strong>
                  {canChooseActions ? '选择处理方式' : '当前只能查看任务'}
                </strong>
                <span>
                  {canChooseActions
                    ? '选择一项当前可用操作；催办只是处理方式之一，不会代替负责人办理任务。'
                    : readonlyReason || '当前账号不能直接处理该任务。'}
                </span>
              </div>
              {canChooseActions ? (
                <div
                  className="erp-task-action-drawer__action-options"
                  role="radiogroup"
                  aria-label="处理方式"
                >
                  {visibleActionModes.map((mode, index) => {
                    const meta = getWorkflowTaskActionMeta(task, mode)
                    const selected = actionMode === mode
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={actionSaving}
                        key={mode}
                        ref={(node) => {
                          if (node) actionOptionRefs.current.set(mode, node)
                          else actionOptionRefs.current.delete(mode)
                        }}
                        tabIndex={
                          selected ||
                          (!hasVisibleActionSelection && index === 0)
                            ? 0
                            : -1
                        }
                        className={[
                          'erp-task-action-drawer__action-option',
                          `erp-task-action-drawer__action-option--${getTaskActionTone(mode)}`,
                          selected
                            ? 'erp-task-action-drawer__action-option--selected'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() =>
                          selectAction(mode, mode === 'block' ? taskReason : '')
                        }
                        onKeyDown={(event) => handleActionKeyDown(event, mode)}
                      >
                        <span className="erp-task-action-drawer__action-option-mark">
                          {selected ? <CheckCircleOutlined /> : null}
                        </span>
                        <span>
                          <strong>{meta.title}</strong>
                          <small>{TASK_ACTION_DESCRIPTIONS[mode]}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {actionMeta ? (
                <section
                  className={[
                    'erp-task-action-drawer__action-panel',
                    `erp-task-action-drawer__action-panel--${actionTone}`,
                  ].join(' ')}
                >
                  <div className="erp-task-action-drawer__action-head">
                    <div>
                      <span>当前操作</span>
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
                      message="当前账号不能提交这项操作"
                      description={
                        readonlyReason || '请确认任务状态、负责岗位和可用操作。'
                      }
                    />
                  ) : null}
                  {actionMeta.requireReason ? (
                    <TextArea
                      value={actionReason}
                      autoSize={{ minRows: 4, maxRows: 6 }}
                      maxLength={180}
                      showCount
                      disabled={actionSaving || !canSubmitAction}
                      placeholder="填写原因、影响范围、需要谁协助"
                      onChange={(event) =>
                        onActionReasonChange?.(event.target.value)
                      }
                    />
                  ) : (
                    <div className="erp-task-action-drawer__confirm-copy">
                      <CheckCircleOutlined aria-hidden="true" />
                      <span>
                        提交后任务会进入已完成；相关业务是否办结，请到对应业务页面确认。
                      </span>
                    </div>
                  )}
                </section>
              ) : null}
            </div>
          </section>

          <section
            id="erp-task-action-step-confirm"
            role="tabpanel"
            aria-labelledby="erp-task-action-step-confirm-tab"
            hidden={activeStepKey !== 'confirm'}
            className="erp-task-action-drawer__step-panel"
          >
            {actionMeta ? (
              <div className="erp-task-action-drawer__confirm-panel">
                <div className="erp-task-action-drawer__confirm-head">
                  <span>即将提交</span>
                  <strong>{actionMeta.title}</strong>
                </div>
                <dl className="erp-task-action-drawer__confirm-list">
                  <div>
                    <dt>当前任务</dt>
                    <dd>{task.task_name || '未命名任务'}</dd>
                  </div>
                  <div>
                    <dt>处理方式</dt>
                    <dd>{actionMeta.title}</dd>
                  </div>
                  {actionMeta.requireReason ? (
                    <div>
                      <dt>处理原因</dt>
                      <dd>{actionReason.trim()}</dd>
                    </div>
                  ) : null}
                </dl>
                <Alert
                  type={actionTone === 'danger' ? 'warning' : 'info'}
                  showIcon
                  message="确认后只更新当前任务"
                  description="库存、出货、应收、开票和付款仍需进入对应业务页面办理。"
                />
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </Drawer>
  )
}
