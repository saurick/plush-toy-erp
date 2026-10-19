import React from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { mobileBusinessPath, mobileBusinessRole } from '../../utils/businessTaskRoute.mjs'
import { workflowTaskNavigationState } from '../../utils/workflowTaskNavigation.mjs'
import useBusinessNavigate from '../../hooks/useBusinessNavigate.js'

const BusinessLink = React.forwardRef(({ to, state, ...props }, ref) => {
  const location = useLocation()
  const outlet = useOutletContext()
  const navigate = useBusinessNavigate()
  if (outlet?.mobileTaskBusiness?.navigate) {
    return <Link
      {...props}
      ref={ref}
      to={outlet.mobileTaskBusiness.taskCenterPath}
      onClick={(event) => {
      props.onClick?.(event)
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      navigate(to, { state })
    }}
    />
  }
  const target = mobileBusinessPath(to, mobileBusinessRole(location.pathname))
  const entryPath = typeof target === 'string' ? target : `${target.pathname || location.pathname}${target.search || ''}${target.hash || ''}`
  const navigation = state?.workflowTaskNavigation || location.state?.workflowTaskNavigation || outlet?.workflowTaskNavigation
  return <Link {...props} ref={ref} to={target} state={workflowTaskNavigationState(state, navigation, entryPath)} />
})

BusinessLink.displayName = 'BusinessLink'

export default BusinessLink
