import { useCallback } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { mobileBusinessPath, mobileBusinessRole } from '../utils/businessTaskRoute.mjs'

// Both shells render the same business forms; related-document navigation
// keeps the current mobile role and the originating task context.
export default function useBusinessNavigate() {
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutletContext()
  const roleKey = mobileBusinessRole(location.pathname)
  return useCallback((to, options = {}) => {
    if (typeof to !== 'string') return navigate(to, options)
    const path = roleKey ? mobileBusinessPath(to, roleKey) : to
    const context = options.state?.workflowTaskNavigation || location.state?.workflowTaskNavigation || outlet?.workflowTaskNavigation
    return navigate(path, {
      ...options,
      state: {
        ...options.state,
        ...(context && !options.state?.clearWorkflowTaskNavigation && !/^\/m\/[^/]+\/tasks/u.test(path) ? { workflowTaskNavigation: { ...context, entryPath: path } } : {}),
      },
    })
  }, [navigate, roleKey, location.state, outlet?.workflowTaskNavigation])
}
