import { explainWorkflowActionAccess } from '../api/workflowApi.mjs'
import { bindWorkflowActionSubmitGuard } from './workflowTaskActionSubmitGuardCore.mjs'

export { bindWorkflowActionSubmitGuard }

export const verifyWorkflowTaskActionAccessBeforeSubmit =
  bindWorkflowActionSubmitGuard({
    explain: explainWorkflowActionAccess,
  })
