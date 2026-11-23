import React from 'react'
import { createPortal } from 'react-dom'
import { Button, Spin } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import useBusinessPageContext, { BusinessPageContext } from '../../hooks/useBusinessPageContext.js'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import BusinessRecordDetails from '../business-list/BusinessRecordDetails.jsx'
import { taskBusinessActionNode } from '../business-list/taskBusinessActions.mjs'
import {
  describeSelectionActions,
  flattenSelectionActions,
  inspectSelectionAction,
  SELECTION_ACTION_PRIORITIES,
  withSelectionActionKey,
} from '../business-list/businessSelectionActions.mjs'

function isSourceDocumentDetailsAction(action) {
  if (!React.isValidElement(action)) return false
  const key = action.props['data-business-action-key'] || ''
  if (key === 'view' || key.endsWith('-details')) return true
  const children = flattenSelectionActions(action.props.children)
  return children.length > 0 && children.every(isSourceDocumentDetailsAction)
}

function selectTaskActions(children, space) {
  const { actions, context } = describeSelectionActions(children, space)
  const mobileScore = (item) => item.pinned ? SELECTION_ACTION_PRIORITIES.related : item.score
  // 手机任务的查询、追踪与附件由任务界面统一提供。
  const handling = actions.filter((item) => ['business', 'collaboration', 'lifecycle'].includes(item.group))
  const primary = [...handling].sort((left, right) => Number(left.dangerous) - Number(right.dangerous) || Number(right.enabled) - Number(left.enabled) || mobileScore(right) - mobileScore(left) || left.index - right.index)[0]
  return {
    context,
    visible: primary ? [primary] : [],
    additional: handling.filter((item) => item !== primary && !item.pinned && item.enabled),
    overflow: [],
  }
}

export function WorkflowTaskSelectionActions({ taskBusiness, hasSelection, actions, ActionList }) {
  if (!hasSelection || !taskBusiness.actionHost || taskBusiness.formEditing) return null

  const scopedActions = actions
    .map((action) => taskBusiness.contract ? taskBusinessActionNode(action, taskBusiness.contract) : action)
    .filter((action) => action && !isSourceDocumentDetailsAction(action))
    .map(withSelectionActionKey)
    .filter((action) => {
      const { pinned, authoring } = inspectSelectionAction(action)
      return (!taskBusiness.readOnly || pinned) &&
        (!(taskBusiness.onCollaboration || taskBusiness.collaborationExternal) || !pinned) &&
        (taskBusiness.device !== 'mobile' || !authoring)
    })

  if (taskBusiness.onCollaboration && !taskBusiness.collaborationExternal) {
    scopedActions.push(
      <Button key="task-collaboration" data-business-action-group="collaboration" onClick={taskBusiness.onCollaboration}>任务协作</Button>
    )
  }
  const { visible, additional } = selectTaskActions(scopedActions, null)
  return createPortal(
    <div className="mobile-task-business-primary" role="group" aria-label="本次业务操作">
      <ActionList compact selectActions={selectTaskActions}>{[...visible, ...additional].map(({ node }) => node)}</ActionList>
    </div>,
    taskBusiness.actionHost
  )
}

export function WorkflowTaskSourceDetails({ columns, record, busy, children }) {
  const pageContext = useBusinessPageContext()
  const { taskBusiness } = pageContext
  const { information } = taskBusiness
  const replacesSourceDetails = taskBusiness.mode === 'bom' && Boolean(information)
  const sourceDetails = (
    <section className="mobile-task-business-source" data-testid="mobile-task-business-source" data-record-id={record?.id} aria-busy={busy}>
      <Spin spinning={busy && Boolean(record)}>
        {record ? (
          <><BusinessRecordDetails columns={columns} record={record} presentation="mobile-task" title={isTerminalWorkflowTask(taskBusiness.task) ? '来源业务当前资料' : '本次业务资料'} />{children}</>
        ) : <Empty state={busy ? 'loading' : 'empty'} description={busy ? '正在读取任务业务资料' : '未读取到任务对应单据，请返回任务后重新读取。'} />}
      </Spin>
    </section>
  )
  React.useLayoutEffect(() => {
    if (!information?.release || replacesSourceDetails) return
    information.release(information.scopeKey)
    information.stage(
      information.scopeKey,
      <BusinessPageContext.Provider value={pageContext}>{sourceDetails}</BusinessPageContext.Provider>
    )
  })

  if (replacesSourceDetails) return null
  if (!information) return sourceDetails
  return information.host ? createPortal(sourceDetails, information.host) : null
}
