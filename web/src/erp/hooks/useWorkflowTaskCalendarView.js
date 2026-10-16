import { useSearchParams } from 'react-router-dom'
import { readTaskCalendarState } from '../utils/workflowTaskCalendar.mjs'

export default function useWorkflowTaskCalendarView() {
  const [params, setParams] = useSearchParams()
  const state = readTaskCalendarState(params)
  const change = (next) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next.layout === 'list') updated.delete('layout')
        else if (next.layout) updated.set('layout', next.layout)
        if (next.month) updated.set('month', next.month)
        if (next.selection) updated.set('day', next.selection)
        return updated
      },
      { replace: true }
    )
  return { ...state, change }
}
