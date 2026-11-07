import React, { useEffect, useRef } from 'react'
import { Navigate, useLocation, useNavigationType } from 'react-router-dom'
import { canonicalBusinessPath, mobileBusinessPath, mobileBusinessRole } from '../utils/businessTaskRoute.mjs'
import { workflowTaskNavigationState } from '../utils/workflowTaskNavigation.mjs'

export default function MobileNavigationBoundary({ children }) {
  const location = useLocation()
  const navigationType = useNavigationType()
  const mobileRole = mobileBusinessRole(location.pathname)
  const mobileRoleRef = useRef(mobileRole)
  const taskNavigationRef = useRef(mobileRole ? location.state?.workflowTaskNavigation : null)
  const loginLocationKeyRef = useRef(null)
  const isLoginRoute = /^\/admin-login\/?$/u.test(location.pathname)
  // A completed login replaces its own entry; history cannot replay the handoff.
  const desktopLogin = navigationType === 'REPLACE' &&
    loginLocationKeyRef.current !== null &&
    location.state?.desktopLoginFrom === loginLocationKeyRef.current

  useEffect(() => {
    loginLocationKeyRef.current = isLoginRoute ? location.key : null
    if (mobileRole) {
      mobileRoleRef.current = mobileRole
      taskNavigationRef.current = location.state?.workflowTaskNavigation
    } else if (location.pathname === '/entry' || desktopLogin) {
      mobileRoleRef.current = ''
      taskNavigationRef.current = null
    } else if (isLoginRoute) {
      taskNavigationRef.current = null
    }
  }, [desktopLogin, isLoginRoute, location, mobileRole])

  // Keep ordinary links, redirects and browser history within the phone flow.
  const phoneDocument = mobileRole && location.pathname.includes('/handle/') && canonicalBusinessPath(location.pathname) !== '/erp/help-center'
  if (phoneDocument || (!desktopLogin && mobileRoleRef.current && /^\/erp(?:\/|$)/u.test(location.pathname))) {
    const role = mobileRole || mobileRoleRef.current
    const mapped = mobileBusinessPath(`${location.pathname}${location.search}${location.hash}`, role)
    const mappedPath = mapped.split(/[?#]/u)[0]
    const target = canonicalBusinessPath(mappedPath) === '/erp/help-center' || mappedPath === `/m/${role}/tasks`
      ? mapped : `/m/${role}/tasks`
    return <Navigate replace to={target} state={workflowTaskNavigationState(location.state, location.state?.workflowTaskNavigation || taskNavigationRef.current, target)} />
  }

  return children
}
