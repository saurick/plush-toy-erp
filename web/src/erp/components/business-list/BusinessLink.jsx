import React from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { mobileBusinessPath, mobileBusinessRole } from '../../utils/businessTaskRoute.mjs'
import { workflowTaskNavigationState } from '../../utils/workflowTaskNavigation.mjs'

const BusinessLink = React.forwardRef(({ to, state, ...props }, ref) => {
  const location = useLocation()
  const outlet = useOutletContext()
  const target = mobileBusinessPath(to, mobileBusinessRole(location.pathname))
  const entryPath = typeof target === 'string' ? target : `${target.pathname || location.pathname}${target.search || ''}${target.hash || ''}`
  const navigation = state?.workflowTaskNavigation || location.state?.workflowTaskNavigation || outlet?.workflowTaskNavigation
  return <Link {...props} ref={ref} to={target} state={workflowTaskNavigationState(state, navigation, entryPath)} />
})

BusinessLink.displayName = 'BusinessLink'

export default BusinessLink
