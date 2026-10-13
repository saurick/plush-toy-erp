import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button } from 'antd'
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { resolveMenuPermissionKey } from '../config/menuPermissions.mjs'
import { canonicalBusinessPath } from '../utils/businessTaskRoute.mjs'
import { readWorkflowTaskNavigation, workflowTaskReturnNavigation } from '../utils/workflowTaskNavigation.mjs'
import './mobileBusiness.css'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'

export default function MobileBusinessLayout() {
  const parent = useOutletContext()
  const { roleKey } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const guardRef = useRef(null)
  const [pageUIState] = useState(() => ({ generation: 0, values: new Map() }))
  const registerPageLeaveGuard = useCallback((handler) => {
    guardRef.current = handler
    return () => { if (guardRef.current === handler) guardRef.current = null }
  }, [])
  const allowedMenuPaths = useMemo(() => [...new Set((parent?.adminProfile?.menus || []).map((menu) => resolveMenuPermissionKey(typeof menu === 'string' ? menu : menu.path)).filter(Boolean))], [parent?.adminProfile?.menus])
  const [navigation, setNavigation] = useState(null)
  useEffect(() => {
    const next = readWorkflowTaskNavigation(location.state, location.pathname, parent?.adminProfile?.id)
    setNavigation((previous) => next || readWorkflowTaskNavigation({ workflowTaskNavigation: previous }, location.pathname, parent?.adminProfile?.id))
  }, [location.state, location.pathname, parent?.adminProfile?.id])
  const context = useMemo(() => ({ ...parent, workflowTaskNavigation: navigation, allowedMenuPaths, visibleMenuPaths: allowedMenuPaths, pageUIState, registerPageLeaveGuard }), [parent, navigation, allowedMenuPaths, pageUIState, registerPageLeaveGuard])
  const requiredMenu = resolveMenuPermissionKey(canonicalBusinessPath(location.pathname))
  const allowed = Boolean(requiredMenu && (parent?.adminProfile?.is_super_admin || allowedMenuPaths.includes(requiredMenu)))
  const back = async () => {
    if (guardRef.current && !(await guardRef.current())) return
    if (navigation) {
      const target = workflowTaskReturnNavigation(navigation, window.history.state?.idx)
      navigate(target.to, target.options)
    } else navigate(`/m/${roleKey}/tasks`)
  }
  return (
    <section className="mobile-business-layout" data-mobile-business-page="true">
      <header className="mobile-business-layout__header">
        <Button onClick={back}>返回任务</Button>
        <strong>{navigation?.taskName || '办理业务'}</strong>
      </header>
      <div className="mobile-business-layout__content">
        {allowed ? (
          <>
            <p className="mobile-business-layout__hint">保存单据结果后，相关待办自动更新。</p>
            <Outlet context={context} />
          </>
        ) : (
          <Alert type="warning" showIcon message="当前岗位不能查看此单据，请返回任务列表。" />
        )}
        <MobileBackToTop />
      </div>
    </section>
  )
}
