import { useEffect, useRef } from 'react'
import useBusinessPageContext from './useBusinessPageContext.js'

// An authorized task opens its existing business editor once, without an action-menu detour.
export default function useTaskBusinessEditor({ record, enabled, open }) {
  const taskBusiness = useBusinessPageContext()?.taskBusiness
  const opened = useRef('')
  useEffect(() => {
    if (!taskBusiness || taskBusiness.readOnly || !enabled || !record?.id) return
    const key = `${taskBusiness.taskID}:${record.id}`
    if (opened.current === key) return
    opened.current = key
    open(record)
  }, [taskBusiness, record, enabled, open])
}
