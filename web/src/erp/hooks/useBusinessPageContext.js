import { createContext, useContext } from 'react'
import { useOutletContext } from 'react-router-dom'

export const BusinessPageContext = createContext(null)
export const TaskBusinessWorkspaceContext = createContext(null)
export const TaskBusinessInformationContext = createContext(null)

// A task hosts the existing business page without changing the surrounding route.
export default function useBusinessPageContext() {
  const taskContext = useContext(BusinessPageContext)
  const routeContext = useOutletContext()
  return taskContext || routeContext
}
