import { useCallback } from 'react'
import { useLocation, useNavigate, } from 'react-router-dom'
import useBusinessPageContext from './useBusinessPageContext.js'
import { workflowTaskBusinessReceipt } from '../utils/workflowTaskNavigation.mjs'
import { formatAdminIdentity } from '../utils/adminIdentity.mjs'

export default function useWorkflowTaskBusinessResult() {
  const location = useLocation()
  const navigate = useNavigate()
  const context = useBusinessPageContext()
  const onTaskResult = context?.taskBusiness?.onResult
  const navigation = context?.workflowTaskNavigation || location.state?.workflowTaskNavigation
  const actorLabel = formatAdminIdentity(context?.adminProfile)
  return useCallback((message, record = {}) => {
    if (onTaskResult) return onTaskResult(message, record, { actorLabel })
    if (!navigation) return
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: { ...location.state,
workflowTaskNavigation: {
        ...navigation,
        businessReceipt: workflowTaskBusinessReceipt(message, record, { actorLabel }),
      } },
    })
  }, [location, navigate, navigation, onTaskResult, actorLabel])
}
