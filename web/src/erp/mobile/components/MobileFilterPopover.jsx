import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Popover, theme } from 'antd'
import { LeftOutlined, FilterOutlined, UpOutlined, ReloadOutlined } from '@ant-design/icons'
import MobileFilterViewContext from './MobileFilterViewContext.js'
import './mobileFilterPopover.css'

export default function MobileFilterPopover({
  contextLabel,
  title,
  open,
  onOpenChange,
  count = 0,
  onReset,
  testId,
  children,
}) {
  const id = useId()
  const { token } = theme.useToken()
  const trigger = useRef(null)
  const panel = useRef(null)
  const fields = useRef(null)
  const returnTo = useRef(null)
  const scrollPosition = useRef(0)
  const [view, setView] = useState(null)
  const [host, setHost] = useState(null)
  const closeView = useCallback(() => {
    setView(null)
  }, [])
  useLayoutEffect(() => {
    if (!open) return
    if (view) {
      panel.current?.querySelector('.mobile-filter-back')?.focus({ preventScroll: true })
    } else if (returnTo.current) {
      if (fields.current) fields.current.scrollTop = scrollPosition.current
      returnTo.current.focus({ preventScroll: true })
      returnTo.current = null
    }
  }, [open, view])
  const navigation = useMemo(() => ({
    view,
    host,
    closeView,
    openView: (next, target) => {
      scrollPosition.current = fields.current?.scrollTop || 0
      returnTo.current = target
      setView(next)
    },
  }), [closeView, host, view])
  useEffect(() => { if (!open) setView(null) }, [open])
  const close = () => onOpenChange(false)
  const onKeyDown = useCallback(
    (event) => {
      if (event.defaultPrevented || !open) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (view) closeView()
        else onOpenChange(false)
      }
    },
    [closeView, onOpenChange, open, view]
  )
  useEffect(() => {
    if (!open) return undefined
    // Safari 点击按钮后可能仍聚焦 body；开场动画完成前也应能关闭浮层。
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onKeyDown, open])
  const popover = (
    <Popover
      trigger={[]}
      placement="bottomRight"
      arrow={false}
      align={{ offset: [0, 0] }}
      autoAdjustOverflow={{ shiftX: true, shiftY: true }}
      open={open}
      zIndex={token.zIndexPopupBase + 1}
      onOpenChange={onOpenChange}
      afterOpenChange={(next) => {
        if (!next) {
          if (
            panel.current?.contains(document.activeElement) ||
            document.activeElement === document.body
          ) {
            trigger.current?.focus({ preventScroll: true })
          }
        } else if (
          document.activeElement === trigger.current ||
          document.activeElement === document.body
        ) {
          panel.current?.focus({ preventScroll: true })
        }
      }}
      classNames={{ root: 'mobile-filter-popover erp-mobile-controls' }}
      // 横向按视口居中，纵向仍由 Popover 跟随入口并避让屏幕边缘。
      styles={{ root: { left: 8, right: 8 } }}
      content={
        <section
          className="mobile-filter-panel"
          role="dialog"
          aria-label={`筛选${contextLabel}`}
          id={id}
          ref={panel}
          tabIndex={-1}
          data-filter-context={contextLabel}
          data-filter-view={view ? 'search' : 'main'}
          onKeyDownCapture={onKeyDown}
        >
          <MobileFilterViewContext.Provider value={navigation}>
            {view && (
              <header>
                <Button type="text" className="mobile-filter-back" icon={<LeftOutlined aria-hidden />} aria-label="返回筛选" onClick={closeView} />
                <strong>{view.title}</strong>
              </header>
            )}
            <div className="mobile-filter-fields" ref={fields} hidden={Boolean(view)} aria-label={title}>{children}</div>
            <div className="mobile-filter-detail" ref={setHost} hidden={!view} />
          </MobileFilterViewContext.Provider>
          <footer hidden={Boolean(view)}>
            <Button type="text" icon={<ReloadOutlined aria-hidden />} onClick={onReset}>重置筛选</Button>
            <Button type="text" icon={<UpOutlined aria-hidden />} aria-label="关闭筛选" onClick={close}>收起</Button>
          </footer>
        </section>
      }
    >
      <button
        type="button"
        ref={trigger}
        className="mobile-filter-trigger erp-control-button"
        aria-label={
          count
            ? `筛选${contextLabel}，已应用 ${count} 项`
            : `筛选${contextLabel}`
        }
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        aria-expanded={open}
        data-active={count > 0}
        data-testid={testId}
        onClick={(event) => {
          // Safari 点击按钮不会可靠地转移焦点，先明确入口以便开场后移入浮层。
          event.currentTarget.focus({ preventScroll: true })
          onOpenChange(!open)
        }}
        onKeyDown={onKeyDown}
      >
        <FilterOutlined aria-hidden="true" />
        <span>筛选</span>
        {count > 0 ? <span className="erp-control-count">{count}</span> : null}
      </button>
    </Popover>
  )

  return (
    <>
      {open &&
        createPortal(
          <button
            type="button"
            className="mobile-filter-backdrop"
            style={{ zIndex: token.zIndexPopupBase }}
            aria-label="收起筛选"
            tabIndex={-1}
            // 完整点击结束后再撤掉遮罩，避免触摸抬起时落到底层控件。
            onPointerDown={(event) => event.preventDefault()}
            onTouchEnd={(event) => {
              // 取消 Safari 的兼容点击，关闭遮罩后不能点中底层导航。
              event.preventDefault()
              event.stopPropagation()
              close()
            }}
            onClick={(event) => {
              event.stopPropagation()
              close()
            }}
          />,
          document.body
        )}
      {popover}
    </>
  )
}
