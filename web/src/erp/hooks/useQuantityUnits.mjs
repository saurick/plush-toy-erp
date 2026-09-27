import { useEffect, useState } from 'react'
import { listAllUnits } from '../api/masterDataOrderApi.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { unitOption } from '../utils/referenceSelectOptions.mjs'

// Source-driven actions still need the current unit metadata when the source
// snapshot contains only a unit ID/name. Read it only while the action is open.
export default function useQuantityUnits(open) {
  const [options, setOptions] = useState([])
  useEffect(() => {
    if (!open) return undefined
    const controller = new AbortController()
    setOptions([])
    listAllUnits({}, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setOptions((result.units || []).map(unitOption).filter(Boolean))
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setOptions([])
          message.error(getActionErrorMessage(error, '加载计量单位'))
        }
      })
    return () => controller.abort()
  }, [open])
  return options
}
