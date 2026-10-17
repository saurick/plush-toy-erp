import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button } from 'antd'
import { Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'
import useBusinessNavigate from '../hooks/useBusinessNavigate.js'
import { resolveMenuPermissionKey } from '../config/menuPermissions.mjs'
import { getAuthenticatedNavigationSections, getNavigationSections } from '../config/seedData.mjs'
import { filterNavigationSectionsByAdminProfile } from '../utils/adminProfileSync.mjs'
import { canonicalBusinessPath } from '../utils/businessTaskRoute.mjs'
import { readWorkflowTaskNavigation, workflowTaskReturnNavigation } from '../utils/workflowTaskNavigation.mjs'
import './mobileBusiness.css'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'

export default function MobileBusinessLayout() {
  const parent = useOutletContext()
  const { roleKey } = useParams()
  const location = useLocation()
  const navigate = useBusinessNavigate()
  const guardRef = useRef(null)
  const taskListReturn = useRef(location.state?.mobileRoleTasksReturn)
  const [pageUIState] = useState(() => ({ generation: 0, values: new Map() }))
  const registerPageLeaveGuard = useCallback((handler) => {
    guardRef.current = handler
    return () => { if (guardRef.current === handler) guardRef.current = null }
  }, [])
  const allowedMenuPaths = useMemo(() => {
    const profile = parent?.adminProfile
    const granted = (profile?.menus || []).map((menu) =>
      resolveMenuPermissionKey(typeof menu === 'string' ? menu : menu.path)
    ).filter(Boolean)
    return filterNavigationSectionsByAdminProfile({
      navigationSections: getNavigationSections(),
      adminProfile: profile,
      allowedMenuPaths: granted,
      isSuperAdmin: profile?.is_super_admin === true,
    }).flatMap((section) => section.items.map((item) => item.path))
  }, [parent?.adminProfile])
  const [navigation, setNavigation] = useState(null)
  useEffect(() => {
    const next = readWorkflowTaskNavigation(location.state, location.pathname, parent?.adminProfile?.id)
    setNavigation((previous) => next || readWorkflowTaskNavigation({ workflowTaskNavigation: previous }, location.pathname, parent?.adminProfile?.id))
  }, [location.state, location.pathname, parent?.adminProfile?.id])
  const requiredMenu = resolveMenuPermissionKey(canonicalBusinessPath(location.pathname))
  const helpPage = canonicalBusinessPath(location.pathname) === '/erp/help-center'
  const authenticatedPage = getAuthenticatedNavigationSections().some((section) =>
    section.items.some((item) => item.path === canonicalBusinessPath(location.pathname))
  )
  const allowed = authenticatedPage || Boolean(requiredMenu && allowedMenuPaths.includes(requiredMenu))
  const back = useCallback(async () => {
    if (guardRef.current && !(await guardRef.current())) return
    if (navigation) {
      const target = workflowTaskReturnNavigation(navigation, window.history.state?.idx, roleKey)
      navigate(target.to, target.options)
    } else {
      const original = taskListReturn.current
      navigate(`/m/${roleKey}/tasks`, {
        replace: true,
        state: original?.adminID === parent?.adminProfile?.id ? { mobileRoleTasksReturn: original } : {},
      })
    }
  }, [navigate, navigation, roleKey, parent?.adminProfile?.id])
  const context = useMemo(() => ({
    ...parent,
    workflowTaskNavigation: navigation,
    allowedMenuPaths,
    visibleMenuPaths: allowedMenuPaths,
    pageUIState,
    registerPageLeaveGuard,
    mobileHelpBack: helpPage ? back : null,
  }), [parent, navigation, allowedMenuPaths, pageUIState, registerPageLeaveGuard, helpPage, back])
  return (
    <section className="mobile-business-layout" data-mobile-business-page="true" data-mobile-help={helpPage}>
      {!helpPage ? (
        <header className="mobile-business-layout__header">
          <Button onClick={back}>{navigation?.businessReceipt ? '办完返回原任务' : '返回原任务'}</Button>
          <strong>{navigation?.taskName || '办理业务'}</strong>
        </header>
      ) : null}
      <div className="mobile-business-layout__content">
        {allowed ? (
          <Outlet context={context} />
        ) : (
          <Alert type="warning" showIcon message="当前岗位不能查看此单据，请返回任务列表。" />
        )}
        <MobileBackToTop />
      </div>
    </section>
  )
}
