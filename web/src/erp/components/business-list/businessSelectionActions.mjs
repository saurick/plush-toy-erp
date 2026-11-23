import React from 'react'
import { Button, Tag } from 'antd'

export const SELECTION_ACTION_PRIORITIES = {
  collaboration: 120,
  primary: 100,
  edit: 80,
  view: 60,
  action: 40,
  related: 30,
  output: 20,
  secondary: 20,
  danger: 10,
  recovery: 0,
}
export const SELECTION_ACTION_GROUPS = {
  collaboration: '任务协作',
  business: '业务办理',
  query: '查看与关联',
  output: '打印与输出',
  lifecycle: '单据处理',
  other: '其他操作',
}
const SELECTION_ACTION_ROLE_GROUPS = {
  collaboration: 'collaboration',
  primary: 'business',
  edit: 'business',
  action: 'business',
  view: 'query',
  related: 'query',
  output: 'output',
  secondary: 'other',
  danger: 'lifecycle',
  recovery: 'other',
}

export function flattenSelectionActions(children) {
  const actions = []

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      actions.push(...flattenSelectionActions(child.props.children))
      return
    }
    if (
      child != null && child !== false && child.props?.visible !== false &&
      child.type?.selectionActionVisible?.(child.props) !== false
    ) {
      actions.push(child)
    }
  })

  return actions
}

export function inspectSelectionAction(action) {
  if (!React.isValidElement(action)) {
    return { actionable: false, enabled: false, score: -1 }
  }

  if (action.type === Tag) {
    return { actionable: false, enabled: false, score: -1 }
  }

  const nestedActions = flattenSelectionActions(action.props.children)
    .map(inspectSelectionAction)
    .filter((item) => item.actionable)
  const actionable = action.type === Button || nestedActions.length > 0 ||
    typeof action.type === 'function' || typeof action.type === 'object'
  const role = action.props['data-business-action-role'] || action.type?.selectionActionRole
  const priorityValue = action.props.selectionActionPriority ?? action.type?.selectionActionPriority
  const priority = typeof priorityValue === 'function' ? priorityValue(action.props) : priorityValue
  const groupValue = action.props['data-business-action-group'] || action.type?.selectionActionGroup
  const actionGroup = (typeof groupValue === 'function' ? groupValue(action.props) : groupValue) ||
    SELECTION_ACTION_ROLE_GROUPS[role] || nestedActions[0]?.group || 'business'
  const group = Object.hasOwn(SELECTION_ACTION_GROUPS, actionGroup) ? actionGroup : 'other'
  const nestedScore = nestedActions.length ? Math.max(...nestedActions.map((item) => item.score)) : 30
  return {
    actionable,
    moreOnly: action.props['data-business-action-placement'] === 'more' || nestedActions.some((item) => item.moreOnly),
    group,
    authoring: ['edit', 'create'].includes(role) || action.type?.taskHandlingKind === 'authoring' || (nestedActions.length > 0 && nestedActions.every((item) => item.authoring)),
    pinned: role === 'collaboration' || nestedActions.some((item) => item.pinned),
    dangerous: role === 'danger' || action.props.danger === true || action.props.action?.danger === true || (!role && nestedActions.length > 0 && nestedActions.every((item) => item.dangerous)),
    enabled: action.props.disabled !== true && action.props.loading !== true && (nestedActions.length === 0 || nestedActions.some((item) => item.enabled)),
    score: Number.isFinite(priority)
      ? priority
      : SELECTION_ACTION_PRIORITIES[role] ?? (action.type === Button ? 40 : nestedScore),
  }
}

export function describeSelectionActions(children, space) {
  const nodes = flattenSelectionActions(children)
  const descriptors = nodes.map((node, index) => ({
    index,
    node,
    ...inspectSelectionAction(node),
  }))
  const measured = space && descriptors.every((item) =>
    !item.actionable || Object.hasOwn(space.widths, item.index)
  )
  const actions = descriptors
    .filter((item) => item.actionable && (!measured || space.widths[item.index] > 0))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || Number(left.dangerous) - Number(right.dangerous) || left.index - right.index)
  const context = descriptors.filter((item) => !item.actionable).map((item) => item.node)
  return { context, actions, measured }
}

export function withSelectionActionKey(action, index) {
  if (!React.isValidElement(action)) return action
  const key = action.key || (inspectSelectionAction(action).pinned ? 'task-collaboration' : `record-action-${index}`)
  return React.cloneElement(action, { key })
}
