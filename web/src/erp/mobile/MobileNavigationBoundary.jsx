import React, { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { canonicalBusinessPath, mobileBusinessPath, mobileBusinessRole } from '../utils/businessTaskRoute.mjs'
import { workflowTaskNavigationState } from '../utils/workflowTaskNavigation.mjs'

export default function MobileNavigationBoundary({ children }) {
  const location = useLocation()
  const mobileRole = mobileBusinessRole(location.pathname)
  const mobileRoleRef = useRef(mobileRole)
  const taskNavigationRef = useRef(mobileRole ? location.state?.workflowTaskNavigation : null)

  useEffect(() => {
    if (mobileRole) {
      mobileRoleRef.current = mobileRole
      taskNavigationRef.current = location.state?.workflowTaskNavigation
    } else if (location.pathname === '/entry') {
      mobileRoleRef.current = ''
      taskNavigationRef.current = null
    } else if (location.pathname === '/admin-login') {
      taskNavigationRef.current = null
    }
  }, [location.pathname, location.state, mobileRole])

  // Only the work-entry selection ends the current phone flow. This also
  // covers redirects and browser history that bypass business link helpers.
  const phoneDocument = mobileRole && location.pathname.includes('/handle/') && canonicalBusinessPath(location.pathname) !== '/erp/help-center'
  if (phoneDocument || (mobileRoleRef.current && /^\/erp(?:\/|$)/u.test(location.pathname))) {
    const role = mobileRole || mobileRoleRef.current
    const mapped = mobileBusinessPath(`${location.pathname}${location.search}${location.hash}`, role)
    const mappedPath = mapped.split(/[?#]/u)[0]
    const target = canonicalBusinessPath(mappedPath) === '/erp/help-center' || mappedPath === `/m/${role}/tasks`
      ? mapped : `/m/${role}/tasks`
    return <Navigate replace to={target} state={workflowTaskNavigationState(location.state, location.state?.workflowTaskNavigation || taskNavigationRef.current, target)} />
  }

  return children
}
