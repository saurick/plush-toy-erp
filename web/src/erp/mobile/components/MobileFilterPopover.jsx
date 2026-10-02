import React, { useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Button, Popover, theme } from 'antd'
import { CloseOutlined, FilterOutlined } from '@ant-design/icons'
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
  const close = () => onOpenChange(false)
  const onKeyDown = useCallback(
    (event) => {
      if (event.defaultPrevented || !open) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onOpenChange(false)
      }
    },
    [onOpenChange, open]
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
      autoAdjustOverflow
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
      content={
        <section
          className="mobile-filter-panel"
          role="dialog"
          aria-label={`筛选${contextLabel}`}
          id={id}
          ref={panel}
          tabIndex={-1}
          data-filter-context={contextLabel}
          onKeyDownCapture={onKeyDown}
        >
          <header>
            <strong>{title}</strong>
            <Button
              type="text"
              icon={<CloseOutlined />}
              aria-label="关闭筛选"
              onClick={close}
            />
          </header>
          {children}
          <footer>
            <Button block onClick={onReset}>
              重置筛选
            </Button>
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
        onClick={() => onOpenChange(!open)}
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
