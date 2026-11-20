import React, { createContext, forwardRef, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, ConfigProvider, Form } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import './businessLineEditor.css'

const LineEditorContext = createContext(null)

export function useBusinessLineEditor() {
  const context = useContext(LineEditorContext)
  const form = Form.useFormInstance()
  return context?.form === form ? context : null
}

function LineEditorRoot({
  as: Element = 'div',
  className = '',
  children,
  rowActions = true,
  compactThreshold = 720,
  style,
  ...props
}, forwardedRef) {
  const form = Form.useFormInstance()
  const { componentDisabled } = ConfigProvider.useConfig()
  const { taskBusiness } = useBusinessPageContext() || {}
  const root = useRef(null)
  const [narrow, setNarrow] = useState(false)
  const [selected, select] = useState(null)
  const [target, setTarget] = useState(null)
  const compact = taskBusiness?.device === 'mobile' || narrow
  const clear = useCallback((id) => select((current) => current === id ? null : current), [])
  const attach = useCallback((node) => {
    root.current = node
    if (typeof forwardedRef === 'function') forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [forwardedRef])
  useLayoutEffect(() => {
    const node = root.current
    if (!node || typeof ResizeObserver === 'undefined') return undefined
    const update = () => {
      const { width } = node.getBoundingClientRect()
      if (width > 0) setNarrow(width <= compactThreshold)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [compactThreshold])
  const context = useMemo(() => ({ form, selected, select, clear, compact, readOnly: Boolean(componentDisabled), rowActions, target, setTarget }), [form, selected, clear, compact, componentDisabled, rowActions, target])
  return (
    <LineEditorContext.Provider value={context}>
      <Element {...props} ref={attach} className={`erp-line-editor ${className}`.trim()} data-line-editor-compact={compact ? 'true' : 'false'} style={{ '--erp-line-item-sequence-width': compact ? '44px' : '56px', ...style }}>
        {children}
      </Element>
    </LineEditorContext.Provider>
  )
}

const BusinessLineEditor = forwardRef(LineEditorRoot)

export default BusinessLineEditor

export function BusinessLineEditorActionHost() {
  const editor = useBusinessLineEditor()
  if (!editor || editor.compact || editor.readOnly || !editor.rowActions) return null
  return <div className="erp-line-editor__action-host" ref={editor.setTarget} role="group" aria-label="选中明细操作" />
}

export function BusinessLineEditorInlineActions({ children }) {
  const editor = useBusinessLineEditor()
  return editor?.compact ? children : null
}

export function useBusinessLineEditorRow({ actions, hidden = false, rowRef, onFocus } = {}) {
  const editor = useBusinessLineEditor()
  const id = useId()
  const root = useRef(null)
  const selected = editor?.selected === id
  const clear = editor?.clear
  const selectable = editor && !editor.compact && !editor.readOnly && editor.rowActions && Boolean(actions)
  const attach = useCallback((node) => {
    root.current = node
    if (typeof rowRef === 'function') rowRef(node)
    else if (rowRef) rowRef.current = node
  }, [rowRef])
  useLayoutEffect(() => () => clear?.(id), [clear, id])
  useLayoutEffect(() => {
    if (hidden || !selectable) clear?.(id)
  }, [clear, hidden, id, selectable])
  const select = (event) => {
    // 顶部动作和字段浮层通过 portal 冒泡时，不将其误认作点击原行。
    if (selectable && event.currentTarget.contains(event.target) && !event.target.closest?.('.erp-line-editor__details-toggle')) editor.select(id)
  }
  return {
    editor,
    selected,
    selectable,
    focus: () => root.current?.focus({ preventScroll: true }),
    rowProps: {
      ref: attach,
      tabIndex: selectable ? -1 : undefined,
      'aria-current': selected ? 'true' : undefined,
      'data-line-editor-row-selected': selected ? 'true' : undefined,
      onClick: selectable ? select : undefined,
      onFocusCapture: (event) => {
        if (event.target.closest?.('.erp-line-editor__details-toggle')) return
        onFocus?.(event)
        if (event.target !== event.currentTarget) select(event)
      },
      onKeyDown: selectable ? (event) => {
        if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) {
          event.preventDefault()
          select(event)
        }
      } : undefined,
    },
  }
}

// 复用原按钮及其权限、确认和表单回调；只将呈现位置移到本编辑区的工具栏。
export function BusinessLineEditorRowControls({ selection, index, identity, actions, children }) {
  const { editor, selected, selectable } = selection
  const blockUnselected = (event) => {
    if (selected) return
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <>
      <span className="erp-line-editor__row-marker">
        {children}
      </span>
      {selectable && editor.target ? createPortal(
        <div className="erp-line-editor__action-entry" data-line-editor-selected={selected ? 'true' : 'false'}>
          <span className="erp-line-editor__selected-label" role="status">
            {selected ? <>第 {index + 1} 行{identity ? <> · {identity}</> : null}</> : '点击明细后操作'}
          </span>
          {selected ? <Button type="text" disabled={false} aria-label="清空明细选择" icon={<CloseOutlined />} onClick={() => { editor.select(null); selection.focus() }} /> : null}
          {/* 切换操作对象时关闭原动作浮层，业务字段仍留在原行。 */}
          <fieldset key={selected ? 'selected' : 'unselected'} disabled={!selected} aria-disabled={!selected} className="erp-line-editor__action-content" onClickCapture={blockUnselected}>
            {actions}
          </fieldset>
        </div>, editor.target
      ) : null}
    </>
  )
}
