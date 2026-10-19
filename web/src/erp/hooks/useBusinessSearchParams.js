import { useOutletContext, useSearchParams } from 'react-router-dom'

// Task forms receive verified source parameters from their task workspace.
// Desktop pages continue to own their ordinary URL filters.
export default function useBusinessSearchParams() {
  const context = useOutletContext()
  const route = useSearchParams()
  return context?.taskSourceParams ? [context.taskSourceParams, context.setTaskSourceParams] : route
}
