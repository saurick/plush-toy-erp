import React from 'react'
import { Button } from 'antd'
import { useNavigate } from 'react-router-dom'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { trackingURL } from '../../utils/workflowTracking.mjs'

export default function WorkflowSourceProgressButton({ sourceType, sourceID, profile, disabled = false }) {
  const navigate = useNavigate()
  if (!hasActionPermission(profile, PermissionCode.WORKFLOW_TASK_READ)) return null
  return (
    <Button
      size="small"
      disabled={disabled || !sourceID}
      data-business-action-key="workflow-progress"
      onClick={() => navigate(trackingURL(null, { type: sourceType, id: sourceID }))}
    >
      流转进度
    </Button>
  )
}
