import { hasActionPermission } from './masterDataOrderView.mjs'
import { WORKFLOW_APPROVAL_CAPABILITY_KEYS } from './workflowTaskActionContract.mjs'

export function canViewWorkflowApprovalInbox(adminProfile = {}) {
  return getWorkflowApprovalInboxCapabilityKeys(adminProfile).length > 0
}

export function getWorkflowApprovalInboxCapabilityKeys(adminProfile = {}) {
  return WORKFLOW_APPROVAL_CAPABILITY_KEYS.filter((capabilityKey) =>
    hasActionPermission(adminProfile, capabilityKey)
  )
}
