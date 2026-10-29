import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button, Form, Grid, Spin } from 'antd'
import { FullscreenExitOutlined, FullscreenOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'
import { useBlocker, useLocation, } from 'react-router-dom'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { message, modal } from '@/common/utils/antdApp'
import { businessFormSnapshot } from '../../utils/businessFormSnapshot.mjs'
import { BusinessEditorPaneContext, BusinessFormPendingAttachmentsContext } from './BusinessFormPageContext.js'
import BusinessFormBody from './BusinessFormBody.jsx'
import { useBusinessEditorGroup } from './BusinessEditorGroup.jsx'
import { businessFormReadOnly } from './businessFormReadOnly.mjs'
import useWorkflowTaskBusinessBusy from '../../hooks/useWorkflowTaskBusinessBusy.js'
import ERPPageActions from '../ERPPageActions.jsx'
import '../../styles/app/business-form-page.css'

function captureFormScroll(page, previous) {
  const remembered = new Map(previous.map((position) => [position.node, position]))
  return Array.from(page?.querySelectorAll('*') || [])
    .filter((node) =>
      remembered.has(node) || node.scrollTop || node.scrollLeft ||
      node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth
    )
    .map((node) => {
      const last = remembered.get(node)
      return {
        node,
        // Retain the requested position when a larger viewport temporarily clamps it.
        top: last && node.scrollTop === last.actualTop ? last.top : node.scrollTop,
        left: last && node.scrollLeft === last.actualLeft ? last.left : node.scrollLeft,
      }
    })
}

function FormChangeObserver({ form, baselineRef, onChange }) {
  const change = Form.useWatch(
    (values) => ({
      revision: baselineRef.current.revision,
      dirty:
        baselineRef.current.snapshot !== null &&
        businessFormSnapshot(values) !== baselineRef.current.snapshot,
    }),
    { form, preserve: true }
  )
  useEffect(() => onChange(change), [change, onChange])
  return null
}

function NavigationGuard({ dirty, saving, leavingRef, confirmDiscard }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    Boolean(
      !leavingRef.current &&
      (dirty || saving) &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash)
    )
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return undefined
    let active = true
    confirmDiscard().then((allowed) => {
      if (!active) return
      if (allowed) {
        leavingRef.current = true
        blocker.proceed()
      } else {
        blocker.reset()
      }
    })
    return () => {
      active = false
    }
  }, [blocker, confirmDiscard, leavingRef])
  return null
}

export default function BusinessFormPage({
  open,
  form,
  title,
  className = '',
  loading = false,
  confirmLoading = false,
  processing = false,
  readOnly: sourceReadOnly = false,
  initialDirty = false,
  hasChanges = false,
  okText = '保存',
  okButtonProps = {},
  secondaryAction = null,
  savedRecordActions,
  headerActions = null,
  footer: providedFooter,
  showCancel = true,
  onOk,
  onCancel,
  afterOpenChange,
  container,
  baselineKey,
  children,
}) {
  const outletContext = useBusinessPageContext()
  const pane = React.useContext(BusinessEditorPaneContext)
  const visible = open && pane?.active !== false
  const editorGroup = useBusinessEditorGroup()
  const editorOwner = useRef(Symbol('business-editor')).current
  const onTaskFormEditingChange = outletContext?.taskBusiness?.onFormEditingChange
  useEffect(() => {
    if (editorGroup) {
      editorGroup.setEditing(editorOwner, open)
      return () => editorGroup.setEditing(editorOwner, false)
    }
    if (!open || !onTaskFormEditingChange) return undefined
    onTaskFormEditingChange(true)
    return () => onTaskFormEditingChange(false)
  }, [open, onTaskFormEditingChange, editorGroup, editorOwner])
  const taskFocused = Boolean(outletContext?.taskBusiness)
  const readOnly = sourceReadOnly || outletContext?.taskBusiness?.readOnly === true
  const { pathname } = useLocation()
  const screens = Grid.useBreakpoint()
  const canFullscreen = Boolean(screens.md && !taskFocused && !pathname.startsWith('/m/'))
  const [fullscreen, setFullscreen] = useState(false)
  const fullscreenActive = visible && canFullscreen && fullscreen
  const fullscreenLabel = fullscreenActive ? '退出全屏' : readOnly ? '全屏查看' : '全屏编辑'
  const fullscreenScrollRef = useRef([])
  const registerPageLeaveGuard = outletContext?.registerPageLeaveGuard
  const [baseline, setBaseline] = useState(null)
  const baselineRef = useRef({ snapshot: null, revision: 0 })
  // Only dirty-state transitions refresh the page shell; field updates stay in the form.
  const [, setFormChange] = useState(null)
  const initializedRef = useRef(false)
  const editableSeen = useRef(false)
  if (open && !readOnly && !loading) editableSeen.current = true
  const baselineIdentity = useRef(baselineKey)
  if (baselineIdentity.current !== baselineKey) {
    baselineIdentity.current = baselineKey
    initializedRef.current = false
  }
  const initializing = Boolean(open && form && !readOnly && (!initializedRef.current || baseline === null))
  const focusedRef = useRef(false)
  const [pendingAttachments, setPendingAttachments] = useState(0)
  const [attachmentBusy, setAttachmentBusy] = useState(false)
  const busy = confirmLoading || processing || attachmentBusy || Boolean(outletContext?.taskBusiness?.processing)
  useWorkflowTaskBusinessBusy(busy, open)
  const reportPendingAttachments = useCallback((count, processing = false) => {
    setPendingAttachments(count)
    setAttachmentBusy(processing)
  }, [])
  const pageRef = useRef(null)
  const openRef = useRef(open)
  openRef.current = open
  const triggerRef = useRef(null)
  const scrollPositionRef = useRef(null)
  const leavingRef = useRef(false)
  const confirmingRef = useRef(false)
  const submittingRef = useRef(false)
  const currentRef = useRef(null)
  const dirty = Boolean(
    open &&
    editableSeen.current &&
    initializedRef.current &&
    baseline !== null &&
    (initialDirty ||
      hasChanges ||
      pendingAttachments > 0 ||
      businessFormSnapshot(form?.getFieldsValue(true)) !== baseline)
  )
  currentRef.current = { dirty, saving: busy, attachmentBusy, onCancel, title }
  useEffect(() => {
    editorGroup?.updateState(editorOwner, dirty, busy, { form, title })
    return () => editorGroup?.updateState(editorOwner, false, false)
  }, [editorGroup, editorOwner, dirty, busy, form, title])

  useEffect(() => {
    if (!open || !canFullscreen) {
      setFullscreen(false)
      fullscreenScrollRef.current = []
    }
  }, [canFullscreen, open])

  useLayoutEffect(() => {
    const shell = pageRef.current?.closest('.erp-admin-shell')
    if (fullscreenActive) shell?.setAttribute('data-business-form-fullscreen', 'true')
    if (open) {
      fullscreenScrollRef.current.forEach((position) => {
        if (!position.node.isConnected) return
        position.node.scrollTop = position.top
        position.node.scrollLeft = position.left
        position.actualTop = position.node.scrollTop
        position.actualLeft = position.node.scrollLeft
      })
    }
    return fullscreenActive
      ? () => shell?.removeAttribute('data-business-form-fullscreen')
      : undefined
  }, [fullscreenActive, open])

  const changeFullscreen = useCallback((next) => {
    fullscreenScrollRef.current = captureFormScroll(
      pageRef.current,
      fullscreenScrollRef.current
    )
    setFullscreen(next)
  }, [])

  useEffect(() => {
    if (!fullscreenActive || busy || loading) return undefined
    let popupEscape = null
    // Observe field overlays before their own Escape handlers close them.
    const capturePopupEscape = (event) => {
      if (
        event.key === 'Escape' && (
          pageRef.current?.querySelector('[aria-expanded="true"]') ||
          Array.from(document.querySelectorAll(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)'
          )).some((node) => node.getClientRects().length > 0)
        )
      ) popupEscape = event
    }
    const exitOnEscape = (event) => {
      if (
        event.key === 'Escape' && event !== popupEscape &&
        !event.defaultPrevented && !event.isComposing &&
        pageRef.current?.contains(event.target)
      ) {
        event.preventDefault()
        changeFullscreen(false)
      }
    }
    window.addEventListener('keydown', capturePopupEscape, true)
    window.addEventListener('keydown', exitOnEscape)
    return () => {
      window.removeEventListener('keydown', capturePopupEscape, true)
      window.removeEventListener('keydown', exitOnEscape)
    }
  }, [busy, changeFullscreen, fullscreenActive, loading])

  // The form remains mounted so each business page can initialize its own fields before opening.
  useEffect(() => {
    if (!open) {
      editableSeen.current = false
      initializedRef.current = false
      baselineRef.current = {
        snapshot: null,
        revision: baselineRef.current.revision + 1,
      }
      setBaseline(null)
      return
    }
    if (loading || initializedRef.current) return undefined
    // Form.List registers its defaults after resetFields; capture the initialized form.
    const frame = window.requestAnimationFrame(() => {
      initializedRef.current = true
      const snapshot = businessFormSnapshot(form?.getFieldsValue(true))
      baselineRef.current = {
        snapshot,
        revision: baselineRef.current.revision + 1,
      }
      setBaseline(snapshot)
      setFormChange({ baselineRevision: baselineRef.current.revision })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [form, loading, open, baselineKey])

  const afterOpenChangeRef = useRef(afterOpenChange)
  afterOpenChangeRef.current = afterOpenChange
  useEffect(() => {
    afterOpenChangeRef.current?.(open)
  }, [open])

  useLayoutEffect(() => {
    // A close and reopen can happen before passive effects flush. Rearm focus in
    // the layout phase so every fresh editor instance receives focus reliably.
    focusedRef.current = false
    if (!visible) return undefined
    leavingRef.current = false
    triggerRef.current = document.activeElement
    const scroller = pageRef.current?.closest('.ant-drawer-body, .erp-admin-content, .mobile-business-layout__content, .mobile-role-tasks-page__detail-main')
    const layout = pageRef.current?.closest('.erp-business-page-layout')
    const taskLayout = pageRef.current?.closest('.mobile-task-business, .workflow-task-business-workspace')
    scrollPositionRef.current = scroller
      ? { node: scroller, top: scroller.scrollTop }
      : null
    // Bind the editor layout once per open, avoiding ancestor :has() invalidation on input.
    scroller?.setAttribute('data-business-form-editing', 'true')
    layout?.setAttribute('data-business-form-editing', 'true')
    taskLayout?.setAttribute('data-business-form-editing', 'true')
    if (scroller) scroller.scrollTop = 0
    return () => {
      scroller?.removeAttribute('data-business-form-editing')
      layout?.removeAttribute('data-business-form-editing')
      taskLayout?.removeAttribute('data-business-form-editing')
      if (leavingRef.current) return
      const position = scrollPositionRef.current
      const trigger = triggerRef.current
      window.requestAnimationFrame(() => {
        // Do not let a pending close restore steal focus from a rapid reopen.
        if (openRef.current) return
        if (position?.node.isConnected) position.node.scrollTop = position.top
        if (trigger?.isConnected) trigger.focus?.({ preventScroll: true })
      })
    }
  }, [visible])

  useEffect(() => {
    if (!open) {
      focusedRef.current = false
      return undefined
    }
    if (pane || taskFocused || loading || baseline === null || focusedRef.current) return undefined
    // Parent initialization can reset and remount fields; focus only after that baseline exists.
    const frame = window.requestAnimationFrame(() => {
      // A field selected during initialization owns focus; do not redirect typing.
      if (pageRef.current?.contains(document.activeElement)) {
        focusedRef.current = true
        return
      }
      const firstControl = readOnly
        ? null
        : Array.from(
            pageRef.current?.querySelectorAll(
              '.erp-business-form-page__body input:not([disabled]):not([readonly]):not([type="hidden"]), .erp-business-form-page__body textarea:not([disabled]):not([readonly])'
            ) || []
          ).find(
            (control) =>
              control.getClientRects().length > 0 &&
              !control.closest('[inert], .ant-select-disabled')
          )
      ;(firstControl || pageRef.current?.querySelector('h1'))?.focus({
        preventScroll: true,
      })
      focusedRef.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [baseline, loading, open, pane, readOnly, taskFocused])

  const confirmDiscard = useCallback(async () => {
    if (currentRef.current.saving) {
      message.info(
        currentRef.current.attachmentBusy
          ? '正在处理附件，请稍候'
          : '正在保存，请稍候'
      )
      return false
    }
    if (!currentRef.current.dirty) return true
    if (confirmingRef.current) return false
    confirmingRef.current = true
    return new Promise((resolve) => {
      const finish = (allowed) => {
        confirmingRef.current = false
        resolve(allowed)
      }
      modal.confirm({
        maskClosable: true,
        centered: true,
        title: '放弃未保存的修改？',
        content: `${typeof currentRef.current.title === 'string' ? currentRef.current.title : '当前编辑内容'}中的修改和待上传附件尚未保存。`,
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: () => finish(true),
        onCancel: () => finish(false),
      })
    })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    const guard = async ({ intent } = {}) => {
      if (intent === 'object' && pane?.value === 'engineering') return true
      if (!(await confirmDiscard())) return false
      if (intent === 'refresh') {
        currentRef.current.onCancel?.()
      } else {
        leavingRef.current = true
      }
      return true
    }
    return editorGroup ? editorGroup.registerGuard(editorOwner, guard) : registerPageLeaveGuard?.(guard)
  }, [confirmDiscard, open, registerPageLeaveGuard, editorGroup, editorOwner, pane?.value])

  useEffect(() => {
    if (!open || (!dirty && !busy)) return undefined
    const warnBeforeUnload = (event) => {
      if (leavingRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [busy, dirty, open])

  const close = async () => {
    if (await (editorGroup ? editorGroup.confirmLeave() : confirmDiscard())) onCancel?.()
  }

  const save = async () => {
    if (submittingRef.current || busy || initializing || loading || readOnly || okButtonProps.disabled) return
    submittingRef.current = true
    let validationErrors = []
    try {
      await onOk?.()
      validationErrors = (form?.getFieldsError() || []).filter(
        (field) => field.errors.length > 0
      )
    } catch (error) {
      if (!error?.errorFields) throw error
      validationErrors = error.errorFields
    } finally {
      if (validationErrors.length > 0) {
        // 页面保存器可能自行处理校验异常；仍需展开错误所在明细并定位。
        await new Promise((resolve) => window.requestAnimationFrame(resolve))
        pageRef.current
          ?.querySelectorAll('.erp-line-item-details')
          .forEach((details) => {
            if (details.querySelector('.ant-form-item-has-error')) {
              details.open = true
            }
          })
        form?.scrollToField(validationErrors[0].name, {
          focus: true,
          block: 'nearest',
        })
      }
      submittingRef.current = false
    }
  }

  const recordActions = savedRecordActions?.({
    disabled: dirty || busy || initializing || loading,
    disabledReason: dirty ? '请先保存本次修改' : '资料处理完成后可继续办理',
  })
  const defaultFooter = readOnly && taskFocused && !secondaryAction && !recordActions ? null : (
    <footer className={outletContext?.taskBusiness ? 'mobile-task-business-form-footer' : 'erp-business-form-page__footer'}>
      {!taskFocused || dirty || attachmentBusy || confirmLoading ? (
        <span className="erp-business-form-page__status" role="status">
          {readOnly
            ? '只读查看'
            : attachmentBusy
              ? '正在处理附件…'
              : confirmLoading
                ? '正在保存…'
                : dirty
                  ? '有未保存修改'
                  : '尚未修改'}
        </span>
      ) : null}
      <div className="erp-business-form-page__actions">
        {showCancel && !taskFocused ? (
          <Button onClick={close} disabled={busy || initializing}>
            返回列表
          </Button>
        ) : null}
        {secondaryAction}
        {recordActions}
        {!readOnly && onOk ? (
          <Button
            aria-label={typeof okText === 'string' ? okText : undefined}
            {...okButtonProps}
            type={recordActions && !dirty ? 'default' : 'primary'}
            loading={confirmLoading}
            disabled={busy || initializing || loading || okButtonProps.disabled}
            onClick={save}
          >
            {okText}
          </Button>
        ) : null}
      </div>
    </footer>
  )

  const taskFooter = providedFooter !== undefined && !readOnly
    ? <footer className={taskFocused ? 'mobile-task-business-form-footer' : 'erp-business-form-page__footer'}>{providedFooter}</footer>
    : defaultFooter

  const editor = (
    <section
      ref={pageRef}
      className={`erp-business-form-page ${className}`.trim()}
      hidden={!visible}
      aria-label={title}
      aria-busy={busy || initializing || loading}
      data-business-form-page="true"
      data-readonly={readOnly ? 'true' : undefined}
      data-fullscreen={fullscreenActive ? 'true' : undefined}
      data-unsaved={dirty ? 'true' : 'false'}
    >
      {form ? (
        <FormChangeObserver
          form={form}
          baselineRef={baselineRef}
          onChange={setFormChange}
        />
      ) : null}
      {open && !editorGroup && (dirty || busy) ? (
        <NavigationGuard
          dirty={dirty}
          saving={busy}
          leavingRef={leavingRef}
          confirmDiscard={confirmDiscard}
        />
      ) : null}
      {taskFocused ? (
        <header className="erp-business-form-page__header">
          <h2 tabIndex={-1}>{title}</h2>
          {headerActions}
        </header>
      ) : (
        <header className="erp-business-form-page__header">
          <h1 tabIndex={-1}>{title}</h1>
          {headerActions}
          {open ? <ERPPageActions showRefresh={false} /> : null}
          {canFullscreen ? (
            <Button
              size="small"
              icon={fullscreenActive ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              aria-label={fullscreenLabel}
              aria-pressed={fullscreenActive}
              disabled={busy || loading}
              onClick={() => changeFullscreen(!fullscreenActive)}
            >
              {fullscreenLabel}
            </Button>
          ) : null}
        </header>
      )}
      <BusinessFormBody open={open} active={pane?.active !== false} loading={loading} busy={busy || initializing}>
        <Spin spinning={loading}>
          <BusinessFormPendingAttachmentsContext.Provider
            value={reportPendingAttachments}
          >
            {readOnly ? businessFormReadOnly(children) : children}
          </BusinessFormPendingAttachmentsContext.Provider>
        </Spin>
      </BusinessFormBody>
      {outletContext?.taskBusiness?.actionHost
        ? visible ? createPortal(taskFooter, outletContext.taskBusiness.actionHost) : null
        : taskFooter}
    </section>
  )
  return container ? createPortal(editor, container) : editor
}
