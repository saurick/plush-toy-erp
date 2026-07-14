import React from 'react'

import {
  CheckCircleOutlined,
  DownOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Button, Card, Space, Tag, Typography } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import WorkflowTaskActionDrawer, {
  TASK_ACTION_META,
} from '../workflow/WorkflowTaskActionDrawer.jsx'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess.js'
import { isWorkflowTaskMutationResultUnknown } from '../../utils/workflowTaskMutation.mjs'
import {
  buildBusinessCollaborationTaskPanelModel,
  getBusinessCollaborationTaskReason,
  getBusinessCollaborationTaskReasonLabel,
  getBusinessCollaborationTaskStatusKey,
  getBusinessCollaborationTaskUrgeMeta,
  isBusinessCollaborationTaskBlocking,
  isBusinessCollaborationTaskTerminal,
} from '../../utils/businessCollaborationTasks.mjs'
import {
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskStatusMeta,
} from '../../utils/workflowTaskBoard.mjs'
import { formatWorkflowTaskSource } from '../../utils/dashboardTaskDisplay.mjs'

const { Text } = Typography
const COLLABORATION_PANEL_DEFAULT_HEIGHT = 260
const COLLABORATION_PANEL_MIN_HEIGHT = 240
const COLLABORATION_PANEL_MAX_HEIGHT = 560
const DEFAULT_TASK_STATUS_LABELS = new Map([
  ['ready', '可执行'],
  ['blocked', '阻塞'],
  ['rejected', '退回'],
  ['done', '已完成'],
])

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

function clampNumber(value, minValue, maxValue) {
  return Math.min(Math.max(value, minValue), maxValue)
}

function resolveCollaborationPanelMaxHeight() {
  if (typeof window === 'undefined') return COLLABORATION_PANEL_MAX_HEIGHT
  const viewportMaxHeight = Math.floor(window.innerHeight - 140)
  return Math.max(
    COLLABORATION_PANEL_MIN_HEIGHT,
    Math.min(COLLABORATION_PANEL_MAX_HEIGHT, viewportMaxHeight)
  )
}

export function CollaborationPanelResizeHandle({
  height,
  minHeight = COLLABORATION_PANEL_MIN_HEIGHT,
  maxHeight = COLLABORATION_PANEL_MAX_HEIGHT,
  onHeightChange,
}) {
  const dragStateRef = React.useRef(null)
  const [dragging, setDragging] = React.useState(false)
  const applyHeight = React.useCallback(
    (nextHeight) => {
      onHeightChange(clampNumber(nextHeight, minHeight, maxHeight))
    },
    [maxHeight, minHeight, onHeightChange]
  )
  const handlePointerDown = React.useCallback(
    (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      dragStateRef.current = {
        pointerID: event.pointerId,
        startY: event.clientY,
        startHeight: height,
      }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDragging(true)
      event.preventDefault()
    },
    [height]
  )
  const handlePointerMove = React.useCallback(
    (event) => {
      const dragState = dragStateRef.current
      if (!dragState || dragState.pointerID !== event.pointerId) return
      applyHeight(dragState.startHeight + dragState.startY - event.clientY)
      event.preventDefault()
    },
    [applyHeight]
  )
  const finishDrag = React.useCallback((event) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerID !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    dragStateRef.current = null
    setDragging(false)
  }, [])
  const handleKeyDown = React.useCallback(
    (event) => {
      const step = event.shiftKey ? 40 : 20
      if (event.key === 'ArrowUp') {
        applyHeight(height + step)
        event.preventDefault()
      } else if (event.key === 'ArrowDown') {
        applyHeight(height - step)
        event.preventDefault()
      } else if (event.key === 'Home') {
        applyHeight(minHeight)
        event.preventDefault()
      } else if (event.key === 'End') {
        applyHeight(maxHeight)
        event.preventDefault()
      }
    },
    [applyHeight, height, maxHeight, minHeight]
  )

  return (
    <button
      type="button"
      className={joinClassNames(
        'erp-business-collaboration-task-panel__resize-handle',
        dragging
          ? 'erp-business-collaboration-task-panel__resize-handle--dragging'
          : ''
      )}
      aria-label="拖动调整本页协同高度"
      title="拖动调整本页协同高度"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
    >
      <span className="erp-business-collaboration-task-panel__grip-bar" />
    </button>
  )
}

export function CollaborationTaskPanel({
  tasks = [],
  selectedTasks = [],
  selectedRecordLabel = '',
  adminProfile,
  taskStatusLabels,
  onUrgeTask,
  onCompleteTask,
  onBlockTask,
  onRejectTask,
  onResumeTask,
  urgingTaskID,
  taskActionLoadingID,
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [activeTaskTab, setActiveTaskTab] = React.useState('todo')
  const [panelHeight, setPanelHeight] = React.useState(
    COLLABORATION_PANEL_DEFAULT_HEIGHT
  )
  const [panelMaxHeight, setPanelMaxHeight] = React.useState(
    COLLABORATION_PANEL_MAX_HEIGHT
  )
  const [actionDrawerTask, setActionDrawerTask] = React.useState(null)
  const [actionDrawerMode, setActionDrawerMode] = React.useState('')
  const [actionDrawerReason, setActionDrawerReason] = React.useState('')
  const [actionDrawerSaving, setActionDrawerSaving] = React.useState(false)
  const tabIDPrefix = React.useId().replace(/:/g, '')
  const statusLabels = taskStatusLabels || DEFAULT_TASK_STATUS_LABELS
  const hasAdminProfile = adminProfile && typeof adminProfile === 'object'
  const hasActionHandler = Boolean(
    onCompleteTask ||
      onBlockTask ||
      onRejectTask ||
      onResumeTask ||
      onUrgeTask
  )
  const actionDrawerAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: actionDrawerTask,
    enabled: Boolean(hasAdminProfile && actionDrawerTask),
  })
  const actionDrawerAllowedModes = actionDrawerAccess.allowedModes.filter(
    (mode) =>
      (mode === 'complete' && onCompleteTask) ||
      (mode === 'block' && onBlockTask) ||
      (mode === 'reject' && onRejectTask) ||
      (mode === 'resume' && onResumeTask) ||
      (mode === 'urge' && onUrgeTask)
  )
  const actionDrawerReadonlyReason = actionDrawerAccess.loading
    ? '正在确认您是否可以处理当前任务。'
    : actionDrawerAccess.readonlyReason
  const taskPanelModel = React.useMemo(
    () =>
      buildBusinessCollaborationTaskPanelModel({
        tasks,
        selectedTasks,
      }),
    [selectedTasks, tasks]
  )
  const tabItems = React.useMemo(
    () => [
      {
        key: 'todo',
        label: '本页待办',
        count: taskPanelModel.pageTaskCount,
        items: taskPanelModel.pageTasks,
        emptyText: '本页暂无待处理协同任务。',
      },
      {
        key: 'current',
        label: '当前记录',
        count: taskPanelModel.currentRecordTaskCount,
        items: taskPanelModel.currentRecordTasks,
        emptyText: selectedRecordLabel
          ? '当前记录暂无协同任务。'
          : '先选择一条业务记录，再查看当前记录协同。',
      },
      {
        key: 'blocked',
        label: '阻塞异常',
        count: taskPanelModel.blockedTaskCount,
        items: taskPanelModel.blockedTasks,
        emptyText: '暂无阻塞或退回的协同任务。',
      },
    ],
    [selectedRecordLabel, taskPanelModel]
  )
  const activeTab =
    tabItems.find((item) => item.key === activeTaskTab) || tabItems[0]
  const activeTabHiddenCount = Math.max(
    0,
    activeTab.count - activeTab.items.length
  )
  const activeTabIndex = Math.max(
    0,
    tabItems.findIndex((item) => item.key === activeTab.key)
  )
  const activeTabPanelID = `${tabIDPrefix}-${activeTab.key}-panel`
  const activeTabID = `${tabIDPrefix}-${activeTab.key}-tab`
  React.useEffect(() => {
    const syncPanelMaxHeight = () => {
      const nextMaxHeight = resolveCollaborationPanelMaxHeight()
      setPanelMaxHeight(nextMaxHeight)
      setPanelHeight((currentHeight) =>
        clampNumber(
          currentHeight,
          COLLABORATION_PANEL_MIN_HEIGHT,
          nextMaxHeight
        )
      )
    }
    syncPanelMaxHeight()
    window.addEventListener('resize', syncPanelMaxHeight)
    return () => window.removeEventListener('resize', syncPanelMaxHeight)
  }, [])
  const hasFocusedRecord = Boolean(
    selectedRecordLabel &&
      !/^(?:请先|已选择)/u.test(String(selectedRecordLabel).trim())
  )
  const summaryItems = [
    ...(hasFocusedRecord
      ? [
          {
            key: 'current',
            label: '当前',
            value: selectedRecordLabel,
            tone: 'blue',
          },
        ]
      : []),
    {
      key: 'todo',
      label: '待办',
      value: taskPanelModel.activeTaskCount,
      tone: taskPanelModel.activeTaskCount > 0 ? 'blue' : 'muted',
    },
    {
      key: 'blocked',
      label: '阻塞异常',
      value: taskPanelModel.blockedTaskCount,
      tone: taskPanelModel.blockedTaskCount > 0 ? 'red' : 'muted',
    },
  ]
  const handleTabKeyDown = React.useCallback(
    (event) => {
      const keyToOffset = {
        ArrowRight: 1,
        ArrowDown: 1,
        ArrowLeft: -1,
        ArrowUp: -1,
      }
      if (event.key === 'Home') {
        setActiveTaskTab(tabItems[0].key)
        event.preventDefault()
        return
      }
      if (event.key === 'End') {
        setActiveTaskTab(tabItems[tabItems.length - 1].key)
        event.preventDefault()
        return
      }
      const offset = keyToOffset[event.key]
      if (!offset) return
      const nextIndex =
        (activeTabIndex + offset + tabItems.length) % tabItems.length
      setActiveTaskTab(tabItems[nextIndex].key)
      event.preventDefault()
    },
    [activeTabIndex, tabItems]
  )
  const openActionDrawer = React.useCallback((task, mode = '') => {
    setActionDrawerTask(task)
    setActionDrawerMode(mode)
    setActionDrawerReason(
      mode === 'block' ? getBusinessCollaborationTaskReason(task) : ''
    )
  }, [])
  const closeActionDrawer = React.useCallback(() => {
    setActionDrawerTask(null)
    setActionDrawerMode('')
    setActionDrawerReason('')
  }, [])
  React.useEffect(() => {
    if (!actionDrawerTask) return

    const drawerTaskID = String(actionDrawerTask.id || '').trim()
    if (!drawerTaskID) {
      closeActionDrawer()
      return
    }

    const visibleTasks = [
      ...(Array.isArray(tasks) ? tasks : []),
      ...(Array.isArray(selectedTasks) ? selectedTasks : []),
    ]
    const taskStillVisible = visibleTasks.some(
      (task) => String(task?.id || '').trim() === drawerTaskID
    )
    if (!taskStillVisible) {
      closeActionDrawer()
    }
  }, [actionDrawerTask, closeActionDrawer, selectedTasks, tasks])
  const submitActionDrawer = React.useCallback(async () => {
    if (!actionDrawerTask || !actionDrawerMode) return
    const actionMeta = TASK_ACTION_META[actionDrawerMode]
    if (!actionMeta) return
    if (actionDrawerAccess.loading) {
      message.warning('正在核对任务动作权限，请稍后再提交')
      return
    }
    if (!actionDrawerAllowedModes.includes(actionDrawerMode)) {
      message.warning(
        actionDrawerAccess.getReason(actionDrawerMode) ||
          '当前账号不能提交这个任务动作'
      )
      return
    }

    const reason = actionDrawerReason.trim()
    if (actionMeta.requireReason && !reason) {
      message.warning(`${actionMeta.title}需要填写原因`)
      return
    }

    const actionHandler =
      actionDrawerMode === 'complete'
        ? onCompleteTask
        : actionDrawerMode === 'block'
          ? onBlockTask
          : actionDrawerMode === 'reject'
            ? onRejectTask
            : actionDrawerMode === 'resume'
              ? onResumeTask
              : onUrgeTask

    if (!actionHandler) return

    setActionDrawerSaving(true)
    try {
      const succeeded = await actionHandler(actionDrawerTask, {
        actionMode: actionDrawerMode,
        reason,
      })
      if (succeeded !== false) closeActionDrawer()
    } catch (error) {
      if (isWorkflowTaskMutationResultUnknown(error)) {
        message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
      } else {
        message.error(getActionErrorMessage(error, `${actionMeta.title}失败`))
        closeActionDrawer()
      }
    } finally {
      setActionDrawerSaving(false)
    }
  }, [
    actionDrawerMode,
    actionDrawerReason,
    actionDrawerTask,
    actionDrawerAllowedModes,
    actionDrawerAccess,
    closeActionDrawer,
    onBlockTask,
    onCompleteTask,
    onRejectTask,
    onResumeTask,
    onUrgeTask,
  ])
  const renderTaskList = (items, emptyText, hiddenCount = 0) => {
    if (items.length === 0) {
      return (
        <div className="erp-business-collaboration-task-panel__empty">
          <Text type="secondary">{emptyText}</Text>
        </div>
      )
    }

    return (
      <>
        {items.map((task) => {
          const taskStatusKey = getBusinessCollaborationTaskStatusKey(task)
          const isTerminal = isBusinessCollaborationTaskTerminal(task)
          const isBlocking = isBusinessCollaborationTaskBlocking(task)
          const taskReason = getBusinessCollaborationTaskReason(task)
          const taskReasonLabel = getBusinessCollaborationTaskReasonLabel(task)
          const urgeMeta = getBusinessCollaborationTaskUrgeMeta(task)
          const taskStatusLabel =
            statusLabels.get(taskStatusKey) ||
            getWorkflowTaskStatusMeta(task).label
          const taskLoading =
            String(taskActionLoadingID || '') === String(task.id || '')

          return (
            <div
              key={task.id}
              className="erp-business-collaboration-task-panel__item erp-business-module-task-item"
            >
              <div className="erp-business-module-task-item__main">
                <strong>{task.task_name}</strong>
                <span>{formatWorkflowTaskSource(task)}</span>
                {taskReason ? (
                  <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                    {taskReasonLabel}：{taskReason}
                  </span>
                ) : null}
                {urgeMeta.isUrged ? (
                  <span className="erp-business-collaboration-task-panel__reason erp-business-module-task-item__reason">
                    已催办 {urgeMeta.urgeCount} 次
                    {urgeMeta.lastUrgeReason
                      ? `：${urgeMeta.lastUrgeReason}`
                      : ''}
                  </span>
                ) : null}
              </div>
              <div className="erp-business-module-task-item__meta">
                <Tag>{getWorkflowTaskOwnerRoleLabel(task)}</Tag>
                <Tag color={isBlocking ? 'red' : isTerminal ? 'green' : 'blue'}>
                  {taskStatusLabel}
                </Tag>
              </div>
              <Space
                wrap
                size={[6, 6]}
                className="erp-business-module-task-item__actions"
              >
                {hasActionHandler && !isTerminal ? (
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    loading={
                      taskLoading ||
                      String(urgingTaskID || '') === String(task.id)
                    }
                    disabled={taskLoading}
                    onClick={() => openActionDrawer(task)}
                  >
                    处理
                  </Button>
                ) : null}
              </Space>
            </div>
          )
        })}
        {hiddenCount > 0 ? (
          <div className="erp-business-collaboration-task-panel__more-note">
            仅显示前 {items.length} 条，还有 {hiddenCount} 条
          </div>
        ) : null}
      </>
    )
  }

  return (
    <>
      <Card
        className={joinClassNames(
          'erp-business-collaboration-task-panel erp-business-module-task-card',
          expanded ? 'erp-business-collaboration-task-panel--expanded' : ''
        )}
        style={
          expanded
            ? {
                '--erp-business-collaboration-panel-height': `${panelHeight}px`,
              }
            : undefined
        }
      >
        <div className="erp-business-collaboration-task-panel__body">
          {expanded ? (
            <CollaborationPanelResizeHandle
              height={panelHeight}
              minHeight={COLLABORATION_PANEL_MIN_HEIGHT}
              maxHeight={panelMaxHeight}
              onHeightChange={setPanelHeight}
            />
          ) : null}
          <div className="erp-business-collaboration-task-panel__head erp-business-module-task-card__head">
            <div className="erp-business-collaboration-task-panel__title-line">
              <strong>本页协同</strong>
              <Text type="secondary">
                这里只处理协同任务；库存、出货、财务、开票和收付款仍需在对应业务页面完成。
              </Text>
              {!expanded ? (
                <span
                  className="erp-business-collaboration-task-panel__summary"
                  aria-live="polite"
                >
                  {summaryItems.map((item) => (
                    <span
                      key={item.key}
                      className={joinClassNames(
                        'erp-business-collaboration-task-panel__summary-item',
                        `erp-business-collaboration-task-panel__summary-item--${item.tone}`,
                        `erp-business-collaboration-task-panel__summary-item--${item.key}`
                      )}
                    >
                      <Text type="secondary">{item.label}</Text>
                      <strong>{item.value}</strong>
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            <Space
              wrap={false}
              size={[6, 6]}
              className="erp-business-collaboration-task-panel__actions"
            >
              <Button
                size="small"
                icon={expanded ? <DownOutlined /> : <UpOutlined />}
                className="erp-business-collaboration-task-panel__toggle"
                onClick={() => setExpanded((current) => !current)}
                aria-expanded={expanded}
              >
                {expanded ? '收起' : '展开'}
              </Button>
            </Space>
          </div>
          {expanded ? (
            <div className="erp-business-collaboration-task-panel__panel">
              <div
                className="erp-business-collaboration-task-panel__tabs"
                role="tablist"
                aria-label="本页协同任务分类"
              >
                {tabItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    id={`${tabIDPrefix}-${item.key}-tab`}
                    role="tab"
                    aria-selected={item.key === activeTab.key}
                    aria-controls={`${tabIDPrefix}-${item.key}-panel`}
                    tabIndex={item.key === activeTab.key ? 0 : -1}
                    className={joinClassNames(
                      'erp-business-collaboration-task-panel__tab',
                      item.key === activeTab.key
                        ? 'erp-business-collaboration-task-panel__tab--active'
                        : ''
                    )}
                    onClick={() => setActiveTaskTab(item.key)}
                    onKeyDown={handleTabKeyDown}
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </button>
                ))}
              </div>
              <div
                id={activeTabPanelID}
                className="erp-business-collaboration-task-panel__list erp-business-module-task-list"
                role="tabpanel"
                aria-labelledby={activeTabID}
              >
                {renderTaskList(
                  activeTab.items,
                  activeTab.emptyText,
                  activeTabHiddenCount
                )}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
      <WorkflowTaskActionDrawer
        task={actionDrawerTask}
        actionMode={actionDrawerMode}
        actionReason={actionDrawerReason}
        actionSaving={actionDrawerSaving}
        allowedActionModes={actionDrawerAllowedModes}
        readonlyReason={actionDrawerReadonlyReason}
        onActionModeChange={setActionDrawerMode}
        onActionReasonChange={setActionDrawerReason}
        onClose={closeActionDrawer}
        onSubmit={submitActionDrawer}
      />
    </>
  )
}
