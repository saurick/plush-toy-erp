import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Spin } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import useBusinessPageContext, { BusinessPageContext, TaskBusinessInformationContext } from '../../hooks/useBusinessPageContext.js'
import WorkflowTaskBusinessPage from './WorkflowTaskBusinessPage.jsx'
import { canHandleWorkflowTaskBusiness } from '../../utils/workflowTaskBusinessAccess.mjs'
import { taskNeedsDesktop } from '../../utils/taskHandlingPolicy.mjs'
import { workflowTaskBusinessContract } from '../../utils/workflowTaskBusinessContract.mjs'
import Select from '@/common/components/select/AppSelect'
import { getWorkflowTask, getWorkflowTaskProcessContext, listWorkflowTasks } from '../../api/workflowApi.mjs'
import { WorkflowTaskStatus } from '../../../common/consts/statuses.generated.mjs'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess.js'
import { getNavigationSections } from '../../config/seedData.mjs'
import { resolveMenuPermissionKey } from '../../config/menuPermissions.mjs'
import { filterNavigationSectionsByAdminProfile } from '../../utils/adminProfileSync.mjs'
import { productionTaskHandling } from '../../utils/productionTaskHandling.mjs'
import { workflowTaskSourceForEntryPath } from '../../utils/dashboardTaskDisplay.mjs'
import { workflowTaskBusinessReceipt, workflowTaskEntryNavigation } from '../../utils/workflowTaskNavigation.mjs'
import { mobileBusinessPath } from '../../utils/businessTaskRoute.mjs'
import { canOpenMobileTaskBusiness, mobileTaskRelatedCommands, resolveMobileTaskBusinessEntry, selectMobileRelatedBusinessTask, taskScopedSearchParams } from '../../mobile/utils/mobileTaskBusiness.mjs'
import { loadMobileTaskRelatedSource } from '../../mobile/utils/mobileTaskRelatedSource.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import '../../mobile/mobileTaskBusiness.css'
import './workflowTaskBusinessWorkspace.css'

export default function WorkflowTaskBusinessWorkspace({ controls, renderPage }) {
  const parent = useBusinessPageContext() || {}
  const information = React.useContext(TaskBusinessInformationContext)
  const routeNavigate = useNavigate()
  const location = useLocation()
  const { device = 'mobile', task: expected, profile, roleKey, render, onReceipt, onOpenTask, onTaskRead, onBack } = controls
  const taskCenterPath = device === 'mobile' ? `/m/${roleKey}/tasks` : `${location.pathname}${location.search}`
  const [task, setTask] = useState(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const [mode, setMode] = useState('source')
  const [busyOwners, setBusyOwners] = useState(() => new Set())
  const businessBusy = busyOwners.size > 0
  const reportBusinessBusy = useCallback((busy, owner = 'editor') => setBusyOwners((current) => {
    if (current.has(owner) === Boolean(busy)) return current
    const next = new Set(current)
    if (busy) next.add(owner)
    else next.delete(owner)
    return next
  }), [])
  const [related, setRelated] = useState({ source: null, loading: false, error: '' })
  const [lineID, setLineID] = useState(null)
  const [query, setQuery] = useState({ scope: '', value: '' })
  const [result, setResult] = useState(null)
  const resultSequence = useRef(0)
  const [resultError, setResultError] = useState('')
  const [actionHost, setActionHost] = useState(null)
  const [formEditing, setFormEditing] = useState(false)
  const [businessProcess, setBusinessProcess] = useState(null)
  const leaveGuard = useRef(null)
  const pending = useRef(null)
  const active = useRef(true)
  const taskReadIdentity = useRef(null)
  const taskRef = useRef(task)
  taskRef.current = task
  const taskScope = `${profile.id}:${expected.id}:${expected.source_type}:${expected.source_id}`
  const taskIdentity = useRef(taskScope)
  taskIdentity.current = taskScope
  const currentResult = result?.taskScope === taskScope ? result : null
  const readingResult = currentResult?.taskReadState === 'loading'
  const busyRef = useRef(false)
  busyRef.current = readingResult || businessBusy
  const { onBusyChange } = controls
  useEffect(() => {
    onBusyChange?.(readingResult || businessBusy)
    return () => onBusyChange?.(false)
  }, [readingResult, businessBusy, onBusyChange])
  useEffect(() => { active.current = true; return () => { active.current = false; pending.current?.abort() } }, [])
  useEffect(() => {
    const identity = `${expected.id}:${profile.id}:${retry}`
    const { current } = taskRef
    if (current?.id === expected.id && current.version === expected.version && taskReadIdentity.current === identity) return undefined
    taskReadIdentity.current = identity
    const controller = new AbortController()
    setTask(null)
    setFailed(false)
    getWorkflowTask(expected.id, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setTask(value)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [expected.id, expected.version, profile.id, retry])
  const actual = task?.id === expected.id ? task : null
  const contract = useMemo(() => workflowTaskBusinessContract(actual), [actual])
  const access = useWorkflowTaskActionAccess({ adminProfile: profile, task: actual, enabled: Boolean(actual) })
  const entry = resolveMobileTaskBusinessEntry(actual)
  const identityMatches = actual?.source_type === expected.source_type && actual?.source_id === expected.source_id
  const allowed = identityMatches && canOpenMobileTaskBusiness(actual, profile, access.sourceAccess)
  const releaseInformation = information?.release
  const informationScope = information?.scopeKey
  React.useLayoutEffect(() => {
    if (!allowed) releaseInformation?.(informationScope)
  }, [allowed, releaseInformation, informationScope])
  const needsBusinessProcess = allowed && actual?.task_status_key === WorkflowTaskStatus.DONE && Boolean(actual.process_instance_id) && currentResult?.taskReadState !== 'loading'
  useEffect(() => {
    const controller = new AbortController()
    if (needsBusinessProcess) {
      getWorkflowTaskProcessContext(actual.id, { signal: controller.signal }).then(
        (context) => { if (!controller.signal.aborted) setBusinessProcess({ task: actual, profileID: profile.id, result, context }) },
        () => { if (!controller.signal.aborted) setBusinessProcess({ task: actual, profileID: profile.id, result, failed: true }) }
      )
    }
    return () => controller.abort()
  }, [actual, needsBusinessProcess, profile.id, result, retry])
  const currentBusinessProcess = businessProcess?.task === actual && businessProcess.profileID === profile.id && businessProcess.result === result ? businessProcess : null
  const sameBusinessProcessSource = businessProcess?.task?.id === actual?.id && businessProcess?.task?.source_type === actual?.source_type && businessProcess?.task?.source_id === actual?.source_id && businessProcess?.profileID === profile.id
  const readOnly = (device === 'mobile' && taskNeedsDesktop(actual)) || currentResult?.taskReadState === 'error' || !canHandleWorkflowTaskBusiness(actual, profile, access, currentBusinessProcess?.failed ? null : currentBusinessProcess?.context)
  const commands = useMemo(() => mobileTaskRelatedCommands(actual, profile, access.sourceAccess, { readOnly: readOnly || device === 'mobile' }).filter((item) => contract.relatedKinds.includes(item.kind)), [actual, profile, access.sourceAccess, readOnly, device, contract])
  const command = commands.find((item) => item.kind === mode)
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
  const anchors = useMemo(() => new URLSearchParams(command ? (mode === 'inventory' && selected ? { lot_id: String(selected.lot_id), warehouse_id: String(selected.warehouse_id) } : {}) : new URL(canonical || '/erp', 'https://erp.invalid').search), [command, mode, selected, canonical])
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
    if (!active.current || taskIdentity.current !== taskScope || fresh.id !== actual.id || fresh.source_type !== actual.source_type || fresh.source_id !== actual.source_id) throw new Error('任务来源已变化，请重新读取')
    if (taskRef.current?.id === fresh.id && taskRef.current.version > fresh.version) return taskRef.current
    setTask(fresh)
    onTaskRead?.(fresh)
    return fresh
  }, [actual, onTaskRead, taskScope])
  const confirmLeave = useCallback(async () => !busyRef.current && (!leaveGuard.current || leaveGuard.current()), [])
  useEffect(() => {
    controls.registerLeaveGuard?.(confirmLeave)
    return () => controls.registerLeaveGuard?.(null)
  }, [controls, confirmLeave])
  const changeMode = useCallback(async (next) => {
    if (!(await confirmLeave())) return
    try {
      await readCurrentTask()
      if (next !== 'source') information?.retain(information.scopeKey)
      setResultError('')
      setMode(next)
    } catch (error) { if (active.current) setResultError(getActionErrorMessage(error, '读取当前任务状态')) }
  }, [confirmLeave, readCurrentTask, information])
  const confirmResultTask = useCallback(async (receipt) => {
    const sequence = ++resultSequence.current
    setResult({ ...receipt, taskReadState: 'loading' })
    setResultError('')
    try {
      const fresh = await readCurrentTask()
      if (active.current && taskIdentity.current === taskScope && resultSequence.current === sequence) {
        setResult({ ...receipt, task: fresh, taskReadState: 'ready' })
      }
    } catch (error) {
      if (active.current && taskIdentity.current === taskScope && resultSequence.current === sequence) {
        setResult({ ...receipt, taskReadState: 'error' })
        setResultError(getActionErrorMessage(error, '业务结果已保存，任务状态暂未核对'))
      }
    }
  }, [readCurrentTask, taskScope])
  const onResult = useCallback((text, record, metadata) => {
    if (!active.current || scopeRef.current !== scope) return undefined
    return confirmResultTask({ taskScope, task: taskRef.current, ...workflowTaskBusinessReceipt(text, record, metadata) })
  }, [scope, taskScope, confirmResultTask])
  const navigate = useCallback(async (target) => {
    if (typeof target === 'number' || /^\/m\/[a-z_]+\/tasks(?:[?#]|$)/u.test(String(target))) { onBack(); return }
    if (!(await confirmLeave())) return
    const path = typeof target === 'string' ? target : `${target.pathname || ''}${target.search || ''}`
    if (/^\/erp\/help-center(?:[?#]|$)/u.test(path)) {
      const helpPath = device === 'mobile' ? mobileBusinessPath(path, roleKey) : path
      routeNavigate(helpPath, workflowTaskEntryNavigation(actual, helpPath, taskCenterPath, profile.id))
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
  }, [actual, confirmLeave, device, onBack, onOpenTask, profile.id, roleKey, routeNavigate, taskCenterPath])
  const allowedMenuPaths = useMemo(() => filterNavigationSectionsByAdminProfile({ navigationSections: getNavigationSections(), adminProfile: profile, allowedMenuPaths: (profile.menus || []).map((menu) => resolveMenuPermissionKey(typeof menu === 'string' ? menu : menu.path)).filter(Boolean), isSuperAdmin: profile.is_super_admin === true }).flatMap((section) => section.items.map((item) => item.path)), [profile])
  const openResult = () => { if (currentResult) onReceipt(currentResult) }
  const receiptActionRef = useRef(null)
  receiptActionRef.current = openResult
  const receiptReady = Boolean(currentResult)
  const { registerReceiptAction } = controls
  useEffect(() => {
    registerReceiptAction?.(receiptReady ? () => receiptActionRef.current() : null)
    return () => registerReceiptAction?.(null)
  }, [receiptReady, registerReceiptAction])
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
    workflowTaskNavigation: { taskID: actual?.id, adminID: profile.id, returnPath: taskCenterPath, productionHandling: productionTaskHandling(actual, entry), businessReceipt: currentResult },
    taskCommand: command && relatedReady ? { kind: mode, ...related.source, selected } : null,
    taskBusiness: { device, taskID: actual?.id, task: actual, mode, contract, readOnly, processing: readingResult, formEditing, information, collaborationExternal: controls.collaborationExternal, onFormEditingChange: setFormEditing, onBusyChange: reportBusinessBusy, onCollaboration: controls.onCollaboration, actionHost, onResult, viewResult: openResult, navigate, confirmLeave, taskCenterPath } }
  const processFailed = needsBusinessProcess && currentBusinessProcess?.failed
  const checking = !failed && (!actual || access.loading || access.source === 'fallback_checking' || (needsBusinessProcess && !currentBusinessProcess && !sameBusinessProcessSource))
  const relatedActions = mode === 'source' ? (
    <div className="mobile-task-business-actions">
      {commands.map((item) => <Button key={item.kind} onClick={() => changeMode(item.kind)}>{item.label}</Button>)}
    </div>
  ) : null
  const content = (
    <section className="mobile-task-business__content" data-testid="mobile-task-fact-form" data-task-business-page="true" data-business-form-host data-handler-mode={mode} data-source-type={actual?.source_type} data-source-id={actual?.source_id} data-result-state={currentResult?.taskReadState || ''} data-readonly={readOnly}>
      {checking ? <Spin /> : failed || !allowed ? <Alert type="warning" showIcon message="暂时无法确认任务办理资料或权限，请重新读取。" action={<Button onClick={() => { setRetry((value) => value + 1); access.retry() }}>重新读取</Button>} /> : (
        <>
          {processFailed ? <Alert type="warning" showIcon message="暂时无法确认后续办理步骤，当前只读查看。" action={<Button onClick={() => setRetry((value) => value + 1)}>重新读取</Button>} /> : null}
          {related.error || resultError ? <Alert type="warning" showIcon message={related.error || resultError} action={<Button onClick={() => currentResult?.taskReadState === 'error' ? confirmResultTask(currentResult) : setRetry((value) => value + 1)}>重新读取</Button>} /> : null}
          {readOnly && !formEditing && mode === 'source' && !processFailed && !resultError && !(device === 'mobile' && taskNeedsDesktop(actual)) ? <p role="status">{isTerminalWorkflowTask(actual) ? '本次任务已结束。' : '当前账号没有本次业务办理权限。'}</p> : null}
          {mode === 'inventory' && related.source ? <label>核对本次入库批次<Select placeholder="核对本次入库批次" aria-label="核对本次入库批次" value={lineID} options={related.source.items.map((item) => ({ value: item.id, label: item.lot_no || item.material_name_snapshot || `收货第 ${item.line_no} 行` }))} onChange={async (id) => { if (await confirmLeave()) setLineID(id ?? null) }} /></label> : null}
          {related.loading ? <Spin /> : relatedReady ? <BusinessPageContext.Provider key={scope} value={context}>{renderPage ? renderPage(context) : <WorkflowTaskBusinessPage />}</BusinessPageContext.Provider> : null}
          {relatedActions}
        </>
      )}
    </section>
  )
  return render({
    taskForm: true,
    readOnly,
    actionHostRef: setActionHost,
    saving: readingResult || businessBusy,
    canViewReceipt: Boolean(currentResult),
    onViewReceipt: openResult,
    footer: formEditing || !(currentResult || (contract.workflowConfirmation && !readOnly && controls.onConfirmTask)) ? null : (
      <>
        {currentResult ? <Button type="primary" loading={readingResult} onClick={openResult}>查看办理结果</Button> : null}
        {contract.workflowConfirmation && !readOnly && controls.onConfirmTask ? <Button type="primary" onClick={controls.onConfirmTask}>{contract.workflowConfirmation}</Button> : null}
      </>
    ),
    content,
  })
}
