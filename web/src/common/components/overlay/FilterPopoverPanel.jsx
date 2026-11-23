import React from 'react'
import { Button } from 'antd'
import { RollbackOutlined } from '@ant-design/icons'
import './filterPopoverPanel.css'

export default function FilterPopoverPanel({
  hidden,
  panelRef,
  fieldsRef,
  fieldsClassName,
  onClear,
  clearDisabled,
  onDismiss,
  footerNote,
  children,
}) {
  return (
    <div className="erp-filter-popover-panel" hidden={hidden}>
      <header>
        <strong>筛选条件</strong>
        {onClear && (
          <Button
            aria-label="清空筛选"
            size="small"
            type="text"
            disabled={clearDisabled}
            icon={<RollbackOutlined aria-hidden />}
            onClick={() => {
              onClear()
              panelRef.current?.focus({ preventScroll: true })
            }}
          >
            清空筛选
          </Button>
        )}
      </header>
      <div className={['erp-filter-popover-panel__fields', fieldsClassName].filter(Boolean).join(' ')} ref={fieldsRef}>
        {children}
      </div>
      <footer>
        {footerNote && <p className="erp-filter-popover-panel__footer-note">{footerNote}</p>}
        <Button type="primary" onClick={onDismiss}>收起</Button>
      </footer>
    </div>
  )
}
