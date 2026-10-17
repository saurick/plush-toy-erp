import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import { Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { getWorkflowTask } from '../api/workflowApi.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import { canOpenWorkflowTaskEntry } from '../utils/workflowTaskEntryAccess.mjs'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import { resolveMenuPermissionKey } from '../config/menuPermissions.mjs'
import { getNavigationSections } from '../config/seedData.mjs'
import { filterNavigationSectionsByAdminProfile } from '../utils/adminProfileSync.mjs'
import { getWorkflowTaskDisplayName } from '../utils/processRuntimePresentation.mjs'
import { productionTaskHandling } from '../utils/productionTaskHandling.mjs'
import { readWorkflowTaskNavigation, workflowTaskReturnNavigation } from '../utils/workflowTaskNavigation.mjs'
import MobileTaskFlowHeader from './components/MobileTaskFlowHeader.jsx'
import {
  canOpenMobileTaskBusiness,
  matchesMobileTaskBusinessEntry,
  resolveMobileTaskBusinessEntry,
  mobileTaskSupportsPayment,
  mobileTaskRelatedCommands,
  mobileTaskRelatedCommand,
} from './utils/mobileTaskBusiness.mjs'
import './mobileTaskBusiness.css'

export default function MobileTaskBusinessLayout() {
  const parent = useOutletContext()
  const { roleKey, taskID: rawTaskID } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const taskID = Number(rawTaskID)
  const [taskState, setTaskState] = useState({ task: null, failed: false })
  const [retry, setRetry] = useState(0)
  const [receiptTaskID, setReceiptTaskID] = useState(null)
  const showReceipt = receiptTaskID === taskID
  const guardRef = useRef(null)
  const pageUIState = useMemo(() => ({ generation: taskID, values: new Map() }), [taskID])
  const adminProfile = useMemo(() => parent?.adminProfile || {}, [parent?.adminProfile])
  const registerPageLeaveGuard = useCallback((guard) => {
    guardRef.current = guard
    return () => { if (guardRef.current === guard) guardRef.current = null }
  }, [])
  const confirmLeave = useCallback(async () => !guardRef.current || Boolean(await guardRef.current()), [])

  useEffect(() => {
    const controller = new AbortController()
    setTaskState({ task: null, failed: false })
    if (!Number.isSafeInteger(taskID) || taskID <= 0) {
      setTaskState({ task: null, failed: true })
      return undefined
    }
    getWorkflowTask(taskID, { signal: controller.signal }).then((task) => {
      if (!controller.signal.aborted) setTaskState({ task, failed: false })
    }).catch(() => {
      if (!controller.signal.aborted) setTaskState({ task: null, failed: true })
    })
    return () => controller.abort()
  }, [taskID, adminProfile.id, retry])

  const task = taskState.task?.id === taskID ? taskState.task : null
  const access = useWorkflowTaskActionAccess({ adminProfile, task, enabled: Boolean(task) })
  const path = `${location.pathname}${location.search}`
  const sourceMatches = matchesMobileTaskBusinessEntry(path, task)
  const commands = useMemo(() => mobileTaskRelatedCommands(task, adminProfile, access.sourceAccess), [task, adminProfile, access.sourceAccess])
  const relatedCommand = mobileTaskRelatedCommand(path, task)
  const allowed = sourceMatches && canOpenMobileTaskBusiness(task, adminProfile, access.sourceAccess) &&
    (!relatedCommand || commands.some((command) => command.kind === relatedCommand.kind))
  const canRegisterPayment = allowed && mobileTaskSupportsPayment(task) &&
    hasActionPermission(adminProfile, PermissionCode.FINANCE_PAYMENT_CREATE) &&
    canOpenWorkflowTaskEntry(adminProfile, '/erp/finance/payments', access.sourceAccess)
  const allowedMenuPaths = useMemo(() => filterNavigationSectionsByAdminProfile({
    navigationSections: getNavigationSections(),
    adminProfile,
    allowedMenuPaths: (adminProfile.menus || []).map((menu) => resolveMenuPermissionKey(typeof menu === 'string' ? menu : menu.path)).filter(Boolean),
    isSuperAdmin: adminProfile.is_super_admin === true,
  }).flatMap((section) => section.items.map((item) => item.path)), [adminProfile])
  const navigation = useMemo(() => {
    const saved = readWorkflowTaskNavigation(location.state, location.pathname, adminProfile.id)
    return {
      ...(saved?.taskID === taskID ? saved : {
        taskID,
adminID: adminProfile.id,
        returnPath: `/m/${roleKey}/tasks?link_task=${taskID}`,
        entryPath: path,
      }),
      taskName: getWorkflowTaskDisplayName(task || {}),
      productionHandling: productionTaskHandling(task, resolveMobileTaskBusinessEntry(task)),
    }
  }, [location.state, location.pathname, adminProfile.id, taskID, roleKey, path, task])
  const receipt = navigation.businessReceipt
  const context = useMemo(() => ({
    ...parent,
allowedMenuPaths,
visibleMenuPaths: allowedMenuPaths,
    pageUIState,
registerPageLeaveGuard,
    workflowTaskNavigation: navigation,
    mobileTaskBusiness: { taskID, task, canRegisterPayment, confirmLeave, commands, relatedCommand },
  }), [parent, allowedMenuPaths, pageUIState, registerPageLeaveGuard, navigation, taskID, task, canRegisterPayment, confirmLeave, commands, relatedCommand])
  const back = async () => {
    if (guardRef.current && !(await guardRef.current())) return
    const target = workflowTaskReturnNavigation(navigation, window.history.state?.idx, roleKey)
    navigate(target.to, target.options)
  }
  const openReceipt = async () => {
    if (guardRef.current && !(await guardRef.current())) return
    setReceiptTaskID(taskID)
  }
  const loading = !taskState.failed && (!task || access.loading || access.source === 'fallback_checking')

  return (
    <section className="mobile-role-tasks-page mobile-role-tasks-page--detail mobile-task-business" data-mobile-business-page="true" data-testid="mobile-task-business-screen">
      <MobileTaskFlowHeader
        title={showReceipt ? '办理结果' : '任务办理'}
        backLabel="返回原任务"
        currentStep={showReceipt ? 'result' : 'process'}
        onBack={back}
        onOpenDetail={back}
        canOpenProcess={showReceipt}
        onOpenProcess={() => setReceiptTaskID(null)}
        canOpenReceipt={Boolean(receipt)}
        onOpenReceipt={openReceipt}
        receiptUnavailableLabel="办理后开放"
      />
      <main className="mobile-role-tasks-page__detail-main mobile-task-business__content" data-business-form-host>
        {loading ? <Spin tip="正在核对任务和单据权限"><div className="mobile-task-business__loading" /></Spin> : !allowed ? (
          <Alert
            type="warning"
            showIcon
            message={taskState.failed || access.failed ? '暂时无法确认任务或单据权限，请重新读取后办理。' : !sourceMatches ? '此单据与当前任务不匹配，请返回原任务。' : '当前岗位不能办理此任务的业务单据。'}
            action={<Button onClick={() => { setRetry((value) => value + 1); access.retry() }}>重新读取</Button>}
          />
        ) : showReceipt && receipt ? (
          <section className="erp-mobile-card mobile-detail-section" role="status" data-testid="mobile-task-business-receipt">
            <h2>业务办理已确认</h2>
            <p>{navigation.taskName}</p>
            <p>{receipt.message}</p>
            {receipt.recordNo ? <p>业务单号：{receipt.recordNo}</p> : null}
            <Button onClick={back}>返回原任务</Button>
          </section>
        ) : <Outlet key={taskID} context={context} />}
      </main>
    </section>
  )
}
