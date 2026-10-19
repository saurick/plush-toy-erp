import { useCallback } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { mobileBusinessPath, mobileBusinessRole } from '../utils/businessTaskRoute.mjs'
import { workflowTaskNavigationState } from '../utils/workflowTaskNavigation.mjs'

// Task-contained forms resolve related work through the current task. Other
// phone navigation stays in task management, apart from the shared help page.
export default function useBusinessNavigate() {
  const navigate = useNavigate()
  const location = useLocation()
  const outlet = useOutletContext()
  const roleKey = mobileBusinessRole(location.pathname)
  return useCallback((to, options = {}) => {
    if (outlet?.mobileTaskBusiness?.navigate) return outlet.mobileTaskBusiness.navigate(to, options)
    if (typeof to === 'number') return navigate(to)
    const path = roleKey ? mobileBusinessPath(to, roleKey) : to
    const targetPath = typeof path === 'string' ? path : `${path.pathname || location.pathname}${path.search || ''}${path.hash || ''}`
    const context = options.state?.workflowTaskNavigation || outlet?.workflowTaskNavigation || location.state?.workflowTaskNavigation
    return navigate(path, {
      ...options,
      state: workflowTaskNavigationState(options.state, context, targetPath),
    })
  }, [navigate, roleKey, location.pathname, location.state, outlet])
}
