import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Select, Spin } from 'antd'
import { Outlet, useNavigate, useOutletContext } from 'react-router-dom'
import { getWorkflowTask, listWorkflowTasks } from '../../api/workflowApi.mjs'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess.js'
import { canOpenWorkflowTaskEntry } from '../../utils/workflowTaskEntryAccess.mjs'
import { BUSINESS_ROUTE_PATHS, hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { getNavigationSections } from '../../config/seedData.mjs'
import { resolveMenuPermissionKey } from '../../config/menuPermissions.mjs'
import { filterNavigationSectionsByAdminProfile } from '../../utils/adminProfileSync.mjs'
import { productionTaskHandling } from '../../utils/productionTaskHandling.mjs'
import { workflowTaskSourceForEntryPath } from '../../utils/dashboardTaskDisplay.mjs'
import { workflowTaskBusinessReceipt, workflowTaskEntryNavigation } from '../../utils/workflowTaskNavigation.mjs'
import { mobileBusinessPath } from '../../utils/businessTaskRoute.mjs'
import { canOpenMobileTaskBusiness, mobileTaskRelatedCommands, mobileTaskSupportsPayment, resolveMobileTaskBusinessEntry, selectMobileRelatedBusinessTask, taskScopedSearchParams } from '../utils/mobileTaskBusiness.mjs'
import { loadMobileTaskRelatedSource } from '../utils/mobileTaskRelatedSource.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import '../mobileTaskBusiness.css'

export default function MobileTaskFactLayout() {
  const parent = useOutletContext()
  const routeNavigate = useNavigate()
  const controls = parent.taskFactHandling
  const { task: expected, profile, roleKey, render, onReceipt, onOpenTask, onTaskRead, onBack } = controls
  const [task, setTask] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [mode, setMode] = useState('source')
  const [related, setRelated] = useState({ source: null, loading: false, error: '' })
  const [lineID, setLineID] = useState(null)
  const [query, setQuery] = useState({ scope: '', value: '' })
  const [result, setResult] = useState(null)
  const [readingResult, setReadingResult] = useState(false)
  const [resultError, setResultError] = useState('')
  const [actionHost, setActionHost] = useState(null)
  const leaveGuard = useRef(null)
  const pending = useRef(null)
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => {
    const controller = new AbortController()
    setTask(null)
    setFailed(false)
    getWorkflowTask(expected.id, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setTask(value)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [expected.id, profile.id, retry])
  const actual = task?.id === expected.id ? task : null
  const access = useWorkflowTaskActionAccess({ adminProfile: profile, task: actual, enabled: Boolean(actual) })
  const entry = resolveMobileTaskBusinessEntry(actual)
  const identityMatches = actual?.source_type === expected.source_type && actual?.source_id === expected.source_id
  const ownerMatches = profile.is_super_admin === true || (actual?.owner_role_key === roleKey && (!actual.assignee_id || actual.assignee_id === profile.id))
  const allowed = identityMatches && ownerMatches && canOpenMobileTaskBusiness(actual, profile, access.sourceAccess)
  const commands = useMemo(() => mobileTaskRelatedCommands(actual, profile, access.sourceAccess), [actual, profile, access.sourceAccess])
  const command = commands.find((item) => item.kind === mode)
  const canPayment = allowed && mobileTaskSupportsPayment(actual) && hasActionPermission(profile, PermissionCode.FINANCE_PAYMENT_CREATE) && canOpenWorkflowTaskEntry(profile, BUSINESS_ROUTE_PATHS.financePayments, access.sourceAccess)
  useEffect(() => {
    const controller = new AbortController()
    setRelated({ source: null, loading: false, error: '' })
    setLineID(null)
    if (!allowed || !command) return () => controller.abort()
    setRelated({ source: null, loading: true, error: '' })
    loadMobileTaskRelatedSource(actual, command.kind, { signal: controller.signal }).then((source) => {
      if (controller.signal.aborted) return
      setRelated({ source, loading: false, error: '' })
      if (source.items.length === 1) setLineID(source.items[0].id)
    }).catch((error) => { if (!controller.signal.aborted) setRelated({ source: null, loading: false, error: getActionErrorMessage(error, '读取任务办理资料') }) })
    return () => controller.abort()
  }, [allowed, actual, command, retry])
  const selected = related.source?.items.find((item) => item.id === lineID)
  const relatedReady = !command || (related.source && (mode !== 'inventory' || selected))
  const canonical = command?.path || entry
  const sourceURL = new URL(canonical || '/erp', 'https://erp.invalid')
  const anchors = useMemo(() => new URLSearchParams(command ? (mode === 'inventory' && selected ? { lot_id: String(selected.lot_id), warehouse_id: String(selected.warehouse_id) } : {}) : new URL(entry || '/erp', 'https://erp.invalid').search), [command, mode, selected, entry])
  const scope = `${profile.id}:${roleKey}:${expected.id}:${canonical}:${lineID || ''}:${mode}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  useEffect(() => () => pending.current?.abort(), [scope])
  const taskSourceParams = useMemo(() => taskScopedSearchParams(anchors, query.scope === scope ? query.value : ''), [anchors, query, scope])
  const setTaskSourceParams = useCallback((next) => setQuery({ scope, value: taskScopedSearchParams(anchors, typeof next === 'function' ? next(taskSourceParams) : next).toString() }), [scope, anchors, taskSourceParams])
  const pageUIState = useMemo(() => ({ generation: scope, values: new Map() }), [scope])
  const registerPageLeaveGuard = useCallback((guard) => {
    leaveGuard.current = guard
    return () => { if (leaveGuard.current === guard) { leaveGuard.current = null } }
  }, [])
  const readCurrentTask = useCallback(async () => {
    const fresh = await getWorkflowTask(actual.id)
    if (!active.current || scopeRef.current !== scope || fresh.id !== actual.id || fresh.source_type !== actual.source_type || fresh.source_id !== actual.source_id) throw new Error('任务来源已变化，请重新读取')
    onTaskRead?.(fresh)
    return fresh
  }, [actual, onTaskRead, scope])
  const confirmLeave = useCallback(async () => {
    if (leaveGuard.current && !(await leaveGuard.current())) return false
    try { await readCurrentTask(); return true }
    catch (error) { if (active.current) setResultError(getActionErrorMessage(error, '读取当前任务状态')); return false }
  }, [readCurrentTask])
  useEffect(() => {
    controls.registerLeaveGuard?.(confirmLeave)
    return () => controls.registerLeaveGuard?.(null)
  }, [controls, confirmLeave])
  const changeMode = useCallback(async (next) => {
    if (await confirmLeave()) { setResult(null); setResultError(''); setMode(next) }
  }, [confirmLeave])
  const onResult = useCallback((text, record) => setResult({ scope, ...workflowTaskBusinessReceipt(text, record) }), [scope])
  const navigate = useCallback(async (target) => {
    if (typeof target === 'number' || /^\/m\/[a-z_]+\/tasks(?:[?#]|$)/u.test(String(target))) { onBack(); return }
    if (!(await confirmLeave())) return
    const path = typeof target === 'string' ? target : `${target.pathname || ''}${target.search || ''}`
    if (/^\/erp\/help-center(?:[?#]|$)/u.test(path)) {
      const helpPath = mobileBusinessPath(path, roleKey)
      routeNavigate(helpPath, workflowTaskEntryNavigation(actual, helpPath, `/m/${roleKey}/tasks`, profile.id))
      return
    }
    const source = workflowTaskSourceForEntryPath(path)
    if (!source) { message.warning('请在任务管理中选择对应的办理任务。'); return }
    if (source.source_type === actual.source_type && source.source_id === actual.source_id) { setMode('source'); return }
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    const { current } = scopeRef
    try {
      const page = await listWorkflowTasks({ ...source, limit: 100 }, { signal: controller.signal })
      if (controller.signal.aborted || scopeRef.current !== current) return
      const next = selectMobileRelatedBusinessTask(page, source, roleKey)
      if (!next) { message.warning('请在任务管理中选择对应的办理任务。'); return }
      onOpenTask(next)
    } catch (error) { if (!controller.signal.aborted && scopeRef.current === current) message.error(getActionErrorMessage(error, '读取相关办理任务')) }
  }, [actual, confirmLeave, onBack, onOpenTask, profile.id, roleKey, routeNavigate])
  const allowedMenuPaths = useMemo(() => filterNavigationSectionsByAdminProfile({ navigationSections: getNavigationSections(), adminProfile: profile, allowedMenuPaths: (profile.menus || []).map((menu) => resolveMenuPermissionKey(typeof menu === 'string' ? menu : menu.path)).filter(Boolean), isSuperAdmin: profile.is_super_admin === true }).flatMap((section) => section.items.map((item) => item.path)), [profile])
  const currentResult = result?.scope === scope ? result : null
  const openResult = async () => {
    if (!currentResult || (leaveGuard.current && !(await leaveGuard.current()))) return
    const { current } = scopeRef
    setReadingResult(true)
    setResultError('')
    try {
      const fresh = await readCurrentTask()
      if (active.current && scopeRef.current === current) onReceipt({ ...currentResult, task: fresh })
    } catch (error) { if (active.current && scopeRef.current === current) setResultError(getActionErrorMessage(error, '读取任务办理结果')) }
    finally { if (active.current) setReadingResult(false) }
  }
  const context = {
    ...parent,
    adminProfile: profile,
    allowedMenuPaths,
    visibleMenuPaths: allowedMenuPaths,
    pageUIState,
    registerPageLeaveGuard,
    taskSourceParams,
    setTaskSourceParams,
    taskFormPath: sourceURL.pathname,
    taskFormScope: scope,
    workflowTaskNavigation: { taskID: actual?.id, adminID: profile.id, returnPath: `/m/${roleKey}/tasks`, productionHandling: productionTaskHandling(actual, entry), businessReceipt: currentResult },
    mobileTaskCommand: command && relatedReady ? { kind: mode, ...related.source, selected } : null,
    mobileTaskBusiness: { taskID: actual?.id, task: actual, mode, actionHost, onResult, navigate, confirmLeave, returnToTaskForm: () => changeMode('source'), taskCenterPath: `/m/${roleKey}/tasks` } }
  const checking = !failed && (!actual || access.loading || access.source === 'fallback_checking')
  const relatedActions = mode === 'source' ? (
    <div className="mobile-task-business-actions">
      {canPayment ? <Button onClick={() => changeMode('payment')}>登记本次实际收付</Button> : null}
      {commands.map((item) => <Button key={item.kind} onClick={() => changeMode(item.kind)}>{item.label}</Button>)}
    </div>
  ) : null
  const content = (
    <section className="mobile-task-business__content" data-testid="mobile-task-fact-form" data-mobile-business-page="true" data-business-form-host data-handler-mode={mode} data-source-type={actual?.source_type} data-source-id={actual?.source_id}>
      {checking ? <Spin /> : failed || !allowed ? <Alert type="warning" showIcon message="暂时无法确认任务办理资料或权限，请重新读取。" action={<Button onClick={() => { setRetry((value) => value + 1); access.retry() }}>重新读取</Button>} /> : (
        <>
          {mode !== 'source' ? <Button onClick={() => changeMode('source')}>返回任务办理</Button> : null}
          {related.error || resultError ? <Alert type="warning" showIcon message={related.error || resultError} action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} /> : null}
          {mode === 'inventory' && related.source ? <label>核对本次入库批次<Select aria-label="核对本次入库批次" value={lineID} options={related.source.items.map((item) => ({ value: item.id, label: item.lot_no || item.material_name_snapshot || `收货第 ${item.line_no} 行` }))} onChange={async (id) => { if (await confirmLeave()) { setResult(null); setLineID(id) } }} /></label> : null}
          {related.loading ? <Spin /> : relatedReady ? <Outlet key={scope} context={context} /> : null}
          {relatedActions}
        </>
      )}
    </section>
  )
  return render({
    taskForm: true,
    actionHostRef: setActionHost,
    saving: readingResult,
    canViewReceipt: Boolean(currentResult),
    onViewReceipt: openResult,
    footer: currentResult ? <Button type="primary" loading={readingResult} onClick={openResult}>查看办理结果</Button> : null,
    content,
  })
}
