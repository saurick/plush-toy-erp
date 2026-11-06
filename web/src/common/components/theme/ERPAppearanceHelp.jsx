import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Button, Popover, theme } from 'antd'
import './erpAppearanceHelp.css'

const helpText = {
  density: {
    label: '表格密度',
    note: '紧凑减少行高和留白，同屏可显示更多记录。',
  },
  lines: {
    label: '表格线条',
    note: '简洁弱化分隔线；网格突出行列边界，方便逐格核对。',
  },
  display: {
    label: '编辑页显示',
    note: '适用于长编辑页：目录整页展示并定位分区；页签按分区切换。',
  },
}

function TableExample({ caption, compact = false, grid = false }) {
  return (
    <figure className="erp-appearance-help-example">
      <figcaption>{caption}</figcaption>
      <table
        data-table-lines="fixed"
        className={`erp-appearance-help-table${compact ? ' erp-appearance-help-table--compact' : ''}${grid ? ' erp-appearance-help-table--grid' : ''}`}
        aria-label={`${caption}效果示意`}
      >
        <thead><tr><th>单号</th><th>状态</th></tr></thead>
        <tbody>
          <tr><td>PO-01</td><td>待收货</td></tr>
          <tr><td>PO-02</td><td>待收货</td></tr>
          <tr><td>PO-03</td><td>已完成</td></tr>
        </tbody>
      </table>
    </figure>
  )
}

function FormExample({ tabs = false }) {
  return (
    <figure className="erp-appearance-help-example">
      <figcaption>{tabs ? '页签' : '目录'}</figcaption>
      <div
        className={`erp-appearance-help-editor${tabs ? '' : ' erp-appearance-help-editor--directory'}`}
        role="img"
        aria-label={tabs ? '顶部页签切换，一次展示一个分区' : '左侧目录定位，右侧展示全部分区'}
      >
        {tabs ? (
          <div className="erp-appearance-help-tabs"><span>基本</span><b>明细</b><span>交付</span></div>
        ) : (
          <aside><span>基本</span><span>明细</span><span>交付</span></aside>
        )}
        <div className="erp-appearance-help-sections">
          {(tabs ? ['采购明细'] : ['基本信息', '采购明细', '交付信息']).map((label) => (
            <div key={label}>
              {label}
              <div className="erp-appearance-help-placeholder" />
              {tabs ? <><div className="erp-appearance-help-placeholder" /><div className="erp-appearance-help-placeholder" /></> : null}
            </div>
          ))}
        </div>
      </div>
    </figure>
  )
}

export function ERPAppearanceHelpContent({ kind }) {
  return (
    <>
      <div className="erp-appearance-help-compare">
        {kind === 'display' ? <><FormExample /><FormExample tabs /></> : (
          <>
            <TableExample caption={kind === 'density' ? '标准' : '简洁'} />
            <TableExample caption={kind === 'density' ? '紧凑' : '网格'} compact={kind === 'density'} grid={kind === 'lines'} />
          </>
        )}
      </div>
      <p className="erp-appearance-help-note">{helpText[kind].note}</p>
    </>
  )
}

export default function ERPAppearanceHelp({ kind, open, onOpenChange }) {
  const { label } = helpText[kind]
  const { token } = theme.useToken()
  const id = useId()
  const triggerRef = useRef(null)
  const contentRef = useRef(null)
  const pinned = useRef(false)
  const restoringFocus = useRef(false)
  // Escape 后的焦点恢复不能立即重开；新的悬停、点按或键盘输入才解除。
  const explicitlyClosed = useRef(false)
  const [layout, setLayout] = useState({ placement: 'rightTop', maxHeight: 400, shiftX: 0, narrow: false })

  const updateLayout = useCallback(() => {
    const box = triggerRef.current?.getBoundingClientRect()
    if (!box) return
    const narrow = window.innerWidth <= 767
    const below = window.innerHeight - box.bottom - 16
    const above = box.top - 16
    const placement = narrow ? (below >= above ? 'bottom' : 'top') : 'rightTop'
    const maxHeight = Math.max(80, Math.min(400, (narrow ? Math.max(above, below) : window.innerHeight - 48) - 64))
    const popupWidth = Math.min(380, window.innerWidth - 32)
    const centeredLeft = box.left + box.width / 2 - popupWidth / 2
    const shiftX = narrow ? Math.max(16, Math.min(window.innerWidth - popupWidth - 16, centeredLeft)) - centeredLeft : 0
    setLayout((previous) => previous.placement === placement && previous.maxHeight === maxHeight && previous.shiftX === shiftX && previous.narrow === narrow ? previous : { placement, maxHeight, shiftX, narrow })
  }, [])
  const changeOpen = (nextOpen) => {
    if (nextOpen) updateLayout()
    onOpenChange(nextOpen)
  }

  useLayoutEffect(() => {
    if (!open) {
      pinned.current = false
      return undefined
    }
    updateLayout()
    window.addEventListener('resize', updateLayout)
    window.addEventListener('scroll', updateLayout, true)
    return () => {
      window.removeEventListener('resize', updateLayout)
      window.removeEventListener('scroll', updateLayout, true)
    }
  }, [open, updateLayout])

  useEffect(() => {
    if (!open) return undefined
    const outside = (event) => {
      if (triggerRef.current?.contains(event.target) || contentRef.current?.closest('.ant-popover')?.contains(event.target)) return
      pinned.current = false
      onOpenChange(false)
    }
    const escape = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      explicitlyClosed.current = true
      pinned.current = false
      if (contentRef.current?.contains(document.activeElement)) {
        restoringFocus.current = true
        triggerRef.current?.focus({ preventScroll: true })
        restoringFocus.current = false
      }
      onOpenChange(false)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('keydown', escape, true)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('keydown', escape, true)
    }
  }, [open, onOpenChange])

  return (
    <Popover
      open={open}
      trigger="hover"
      destroyOnHidden
      placement={layout.placement}
      align={layout.narrow ? {
        offset: [layout.shiftX, (token.marginXXS + token.sizePopupArrow / 2) * (layout.placement === 'top' ? -1 : 1)],
      } : undefined}
      classNames={{ root: 'erp-appearance-help-popover' }}
      title={label}
      onOpenChange={(nextOpen) => {
        if (nextOpen && explicitlyClosed.current) return
        if (!nextOpen && (pinned.current || contentRef.current?.contains(document.activeElement))) return
        changeOpen(nextOpen)
      }}
      content={
        <div ref={contentRef} id={id} className="erp-appearance-help-content" style={{ maxHeight: layout.maxHeight }}>
          <ERPAppearanceHelpContent kind={kind} />
        </div>
      }
    >
      <Button
        ref={triggerRef}
        type="text"
        size="small"
        className="erp-appearance-help-trigger"
        icon={<InfoCircleOutlined />}
        aria-label={`查看${label}说明`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onMouseEnter={() => { explicitlyClosed.current = false }}
        onPointerDown={() => { explicitlyClosed.current = false }}
        onFocus={(event) => {
          if (!restoringFocus.current && event.currentTarget.matches(':focus-visible')) {
            explicitlyClosed.current = false
            changeOpen(true)
          }
        }}
        onBlur={(event) => {
          explicitlyClosed.current = false
          if (!contentRef.current?.contains(event.relatedTarget)) {
            pinned.current = false
            onOpenChange(false)
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            explicitlyClosed.current = false
            event.stopPropagation()
          }
        }}
        onClick={(event) => {
          event.stopPropagation()
          const nextOpen = !open || !pinned.current
          explicitlyClosed.current = !nextOpen
          pinned.current = nextOpen
          changeOpen(nextOpen)
        }}
      />
    </Popover>
  )
}
