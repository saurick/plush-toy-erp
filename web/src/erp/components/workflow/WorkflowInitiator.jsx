import React from 'react'
import { getRoleDisplayName } from '../../utils/roleKeys.mjs'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'

export default function WorkflowInitiator({ summary }) {
  const roleName = summary.initiator_role_key === 'admin'
    ? '管理员'
    : getRoleDisplayName(summary.initiator_role_key)
  return (
    <span className="erp-workflow-initiator">
      <strong title={roleName ? undefined : '发起时岗位未留存'}>{summary.initiator_name || '未记录'}</strong>
      {roleName && (
        <small>
          <WorkflowResponsibilities items={[[`发起岗位：${roleName}`]]} />
        </small>
      )}
    </span>
  )
}
