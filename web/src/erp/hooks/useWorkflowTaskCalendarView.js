import { useSearchParams } from 'react-router-dom'
import { readTaskCalendarState, writeTaskCalendarStateToSearch } from '../utils/workflowTaskCalendar.mjs'

export default function useWorkflowTaskCalendarView() {
  const [params, setParams] = useSearchParams()
  const state = readTaskCalendarState(params)
  const change = (next) =>
    setParams(
      (current) => writeTaskCalendarStateToSearch(current, next),
      { replace: true }
    )
  return { ...state, change }
}
