import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button, Form, Spin } from 'antd'
import { createPortal } from 'react-dom'
import { useBlocker, useOutletContext } from 'react-router-dom'
import { message, modal } from '@/common/utils/antdApp'
import { businessFormSnapshot } from '../../utils/businessFormSnapshot.mjs'
import { BusinessFormPendingAttachmentsContext } from './BusinessFormPageContext.js'
import '../../styles/app/business-form-page.css'

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
  description,
  className = '',
  loading = false,
  confirmLoading = false,
  readOnly = false,
  initialDirty = false,
  hasChanges = false,
  okText = '保存',
  okButtonProps = {},
  onOk,
  onCancel,
  afterOpenChange,
  container,
  children,
}) {
  const outletContext = useOutletContext()
  const registerPageLeaveGuard = outletContext?.registerPageLeaveGuard
  const [baseline, setBaseline] = useState(null)
  const baselineRef = useRef({ snapshot: null, revision: 0 })
  // Only dirty-state transitions refresh the page shell; field updates stay in the form.
  const [, setFormChange] = useState(null)
  const initializedRef = useRef(false)
  const focusedRef = useRef(false)
  const [pendingAttachments, setPendingAttachments] = useState(0)
  const pageRef = useRef(null)
  const triggerRef = useRef(null)
  const scrollPositionRef = useRef(null)
  const leavingRef = useRef(false)
  const confirmingRef = useRef(false)
  const submittingRef = useRef(false)
  const currentRef = useRef(null)
  const dirty = Boolean(
    open &&
      !readOnly &&
      baseline !== null &&
      (initialDirty ||
        hasChanges ||
        pendingAttachments > 0 ||
        businessFormSnapshot(form?.getFieldsValue(true)) !== baseline)
  )
  currentRef.current = { dirty, saving: confirmLoading, onCancel }

  // The form remains mounted so each business page can initialize its own fields before opening.
  useEffect(() => {
    if (!open) {
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
    })
    return () => window.cancelAnimationFrame(frame)
  }, [form, loading, open])

  const afterOpenChangeRef = useRef(afterOpenChange)
  afterOpenChangeRef.current = afterOpenChange
  useEffect(() => {
    afterOpenChangeRef.current?.(open)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return undefined
    leavingRef.current = false
    triggerRef.current = document.activeElement
    const scroller = pageRef.current?.closest('.erp-admin-content')
    const layout = pageRef.current?.closest('.erp-business-page-layout')
    scrollPositionRef.current = scroller
      ? { node: scroller, top: scroller.scrollTop }
      : null
    // Bind the editor layout once per open, avoiding ancestor :has() invalidation on input.
    scroller?.setAttribute('data-business-form-editing', 'true')
    layout?.setAttribute('data-business-form-editing', 'true')
    if (scroller) scroller.scrollTop = 0
    return () => {
      scroller?.removeAttribute('data-business-form-editing')
      layout?.removeAttribute('data-business-form-editing')
      if (leavingRef.current) return
      const position = scrollPositionRef.current
      const trigger = triggerRef.current
      window.requestAnimationFrame(() => {
        if (position?.node.isConnected) position.node.scrollTop = position.top
        if (trigger?.isConnected) trigger.focus?.({ preventScroll: true })
      })
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      focusedRef.current = false
      return undefined
    }
    if (loading || baseline === null || focusedRef.current) return undefined
    // Parent initialization can reset and remount fields; focus only after that baseline exists.
    const frame = window.requestAnimationFrame(() => {
      const firstControl = Array.from(
        pageRef.current?.querySelectorAll(
          '.erp-business-form-page__body input:not([disabled]):not([type="hidden"]), .erp-business-form-page__body textarea:not([disabled])'
        ) || []
      ).find(
        (control) =>
          control.getClientRects().length > 0 && !control.closest('[inert]')
      )
      ;(firstControl || pageRef.current?.querySelector('h1'))?.focus({
        preventScroll: true,
      })
      focusedRef.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [baseline, loading, open])

  const confirmDiscard = useCallback(async () => {
    if (currentRef.current.saving) {
      message.info('正在保存，请稍候')
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
        centered: true,
        title: '放弃未保存的修改？',
        content: '当前填写的内容和待上传附件尚未保存。',
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: () => finish(true),
        onCancel: () => finish(false),
      })
    })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    return registerPageLeaveGuard?.(async ({ intent } = {}) => {
      if (!(await confirmDiscard())) return false
      if (intent === 'refresh') {
        currentRef.current.onCancel?.()
      } else {
        leavingRef.current = true
      }
      return true
    })
  }, [confirmDiscard, open, registerPageLeaveGuard])

  useEffect(() => {
    if (!open || (!dirty && !confirmLoading)) return undefined
    const warnBeforeUnload = (event) => {
      if (leavingRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [confirmLoading, dirty, open])

  const close = async () => {
    if (await confirmDiscard()) onCancel?.()
  }

  const save = async () => {
    if (submittingRef.current || confirmLoading || loading) return
    submittingRef.current = true
    try {
      await onOk?.()
    } catch (error) {
      if (!error?.errorFields) throw error
      const firstField = error.errorFields[0]?.name
      if (firstField) {
        form?.scrollToField(firstField, { focus: true, block: 'nearest' })
      }
    } finally {
      submittingRef.current = false
    }
  }

  const editor = (
    <section
      ref={pageRef}
      className={`erp-business-form-page ${className}`.trim()}
      hidden={!open}
      aria-label={title}
      aria-busy={confirmLoading || loading}
      data-business-form-page="true"
      data-unsaved={dirty ? 'true' : 'false'}
    >
      {form ? (
        <FormChangeObserver
          form={form}
          baselineRef={baselineRef}
          onChange={setFormChange}
        />
      ) : null}
      {open ? (
        <NavigationGuard
          dirty={dirty}
          saving={confirmLoading}
          leavingRef={leavingRef}
          confirmDiscard={confirmDiscard}
        />
      ) : null}
      <header className="erp-business-form-page__header">
        <h1 tabIndex={-1}>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>
      <div
        className="erp-business-form-page__body"
        inert={confirmLoading || loading ? '' : undefined}
      >
        <Spin spinning={loading}>
          <BusinessFormPendingAttachmentsContext.Provider
            value={setPendingAttachments}
          >
            {children}
          </BusinessFormPendingAttachmentsContext.Provider>
        </Spin>
      </div>
      <footer className="erp-business-form-page__footer">
        <span className="erp-business-form-page__status" role="status">
          {readOnly
            ? '只读查看'
            : confirmLoading
              ? '正在保存…'
              : dirty
                ? '有未保存修改'
                : '尚未修改'}
        </span>
        <div className="erp-business-form-page__actions">
          <Button onClick={close} disabled={confirmLoading}>
            返回列表
          </Button>
          {!readOnly && onOk ? (
            <Button
              {...okButtonProps}
              type="primary"
              loading={confirmLoading}
              disabled={loading || okButtonProps.disabled}
              onClick={save}
            >
              {okText}
            </Button>
          ) : null}
        </div>
      </footer>
    </section>
  )
  return container ? createPortal(editor, container) : editor
}
