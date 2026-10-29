import { useEffect, useId } from 'react'
import useBusinessPageContext from './useBusinessPageContext.js'

export default function useWorkflowTaskBusinessBusy(busy, enabled = true) {
  const owner = useId()
  const onBusyChange = useBusinessPageContext()?.taskBusiness?.onBusyChange
  useEffect(() => {
    if (!enabled || !onBusyChange) return undefined
    onBusyChange(Boolean(busy), owner)
    return () => onBusyChange(false, owner)
  }, [busy, enabled, onBusyChange, owner])
}
