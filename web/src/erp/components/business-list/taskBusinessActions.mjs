import React from 'react'
import { workflowTaskBusinessActionAllowed } from '../../utils/workflowTaskBusinessContract.mjs'

// Filter the React action tree, including tooltip/popconfirm wrappers, before
// rendering. Hidden actions must not remain callable in a task workspace.
export function taskBusinessActionNode(node, contract) {
  if (!React.isValidElement(node)) return null
  const key = node.props['data-business-action-key'] ||
    (node.props.action?.key ? `lifecycle-${node.props.action.key}` : '')
  if (key) return workflowTaskBusinessActionAllowed(contract, key) ? node : null
  if (node.props['data-business-action-role'] === 'collaboration') return null
  if (!node.props.children) return null
  const children = React.Children.toArray(node.props.children)
    .map((child) => taskBusinessActionNode(child, contract)).filter(Boolean)
  return children.length ? React.cloneElement(node, undefined, children) : null
}
