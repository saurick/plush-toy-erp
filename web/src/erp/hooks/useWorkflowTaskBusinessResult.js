import { useCallback } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'

export default function useWorkflowTaskBusinessResult() {
  const location = useLocation()
  const navigate = useNavigate()
  const context = useOutletContext()
  const navigation = context?.workflowTaskNavigation || location.state?.workflowTaskNavigation
  return useCallback((message, record = {}) => {
    if (!navigation) return
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: { ...location.state,
workflowTaskNavigation: {
        ...navigation,
        businessReceipt: { message, recordID: record.id || null, recordNo: record.fact_no || record.inspection_no || record.batch_no || record.receipt_no || record.return_no || record.adjustment_no || record.payment_no || record.shipment_no || record.operation_no || record.order_no || record.purchase_order_no || '' },
      } },
    })
  }, [location, navigate, navigation])
}
