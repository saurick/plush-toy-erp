import { useCallback } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { workflowTaskBusinessReceipt } from '../utils/workflowTaskNavigation.mjs'

export default function useWorkflowTaskBusinessResult() {
  const location = useLocation()
  const navigate = useNavigate()
  const context = useOutletContext()
  const onTaskResult = context?.mobileTaskBusiness?.onResult
  const navigation = context?.workflowTaskNavigation || location.state?.workflowTaskNavigation
  return useCallback((message, record = {}) => {
    if (onTaskResult) { onTaskResult(message, record); return }
    if (!navigation) return
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: { ...location.state,
workflowTaskNavigation: {
        ...navigation,
        businessReceipt: workflowTaskBusinessReceipt(message, record),
      } },
    })
  }, [location, navigate, navigation, onTaskResult])
}
