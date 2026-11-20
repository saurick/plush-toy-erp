import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, InputNumber, Popover, Tooltip } from 'antd'
import { CloseCircleFilled, DownOutlined, LayoutOutlined, SwapOutlined } from '@ant-design/icons'
import AppSelect from '@/common/components/select/AppSelect'
import BusinessSplitCollapseButton from './BusinessSplitCollapseButton.jsx'
import './businessSplitHeader.css'

// 栏头几何与导航单独订阅，调宽不会让业务页面重新计算。
export const BusinessSplitHeaderContext = createContext(null)

export function BusinessSplitPageTitle({ title }) {
  const header = useContext(BusinessSplitHeaderContext)
  const renderLabel = useCallback(() => title, [title])
  if (!header?.open) return title
  const clearFromKeyboard = (event) => {
    if (!header.onClear || event.key !== 'Delete' || event.target.tagName !== 'INPUT' || event.target.value ||
      event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    header.onClear()
  }
  return (
    <AppSelect
      className="erp-split-page-title"
      variant="outlined"
      showSearch
      allowClear={header.onClear ? { clearIcon: <Tooltip title="清空附加页面（Delete）"><CloseCircleFilled /></Tooltip> } : false}
      onClear={header.onClear}
      onKeyDownCapture={clearFromKeyboard}
      aria-keyshortcuts={header.onClear ? 'Delete' : undefined}
      aria-description={header.onClear ? '按 Delete 清空附加页面' : undefined}
      optionFilterProp="label"
      aria-label={`选择${header.label}页面`}
      placeholder={title || '选择页面'}
      value={header.path}
      labelRender={renderLabel}
      popupMatchSelectWidth={360}
      options={header.options}
      onChange={header.onNavigate}
    />
  )
}

export function BusinessSplitHeaderActions() {
  const header = useContext(BusinessSplitHeaderContext)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const layoutRef = useRef(null)
  const triggerRef = useRef(null)
  const widthRef = useRef(null)
  useEffect(() => { if (!header?.open || !header.visible) setLayoutOpen(false) }, [header?.open, header?.visible])
  useLayoutEffect(() => { if (layoutOpen) layoutRef.current?.forceAlign() }, [layoutOpen, header?.width, header?.label])
  const handleLayoutKeyDown = (event) => {
    if (event.key !== 'Escape' || !layoutOpen) return
    event.stopPropagation()
    setLayoutOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }
  if (!header?.open) return null
  return (
    <>
      {header.showLayout ? (
        <Popover
          ref={layoutRef}
          placement="bottomRight"
          trigger="click"
          open={layoutOpen}
          onOpenChange={setLayoutOpen}
          content={(
            <div className="erp-split-layout-options" role="dialog" aria-label="分栏布局设置">
              <div className="erp-split-width-controls">
                <label>左栏宽度（%） <InputNumber ref={widthRef} aria-label="左栏宽度百分比" min={32} max={68} precision={0} value={header.width} onChange={header.onWidthChange} onKeyDown={handleLayoutKeyDown} /></label>
                <Tooltip title={`默认比例：左栏 ${header.defaultWidth}%、右栏 ${100 - header.defaultWidth}%`}>
                  <Button type="link" size="small" aria-label="恢复默认宽度" disabled={header.isDefaultWidth} onClick={() => { header.onWidthChange(header.defaultWidth); widthRef.current?.focus({ preventScroll: true }) }} onKeyDown={handleLayoutKeyDown}>恢复默认</Button>
                </Tooltip>
              </div>
              <Button icon={<SwapOutlined />} aria-label="左右互换" disabled={!header.canSwap} onClick={() => { setLayoutOpen(false); header.onSwap() }} onKeyDown={handleLayoutKeyDown}>左右互换</Button>
            </div>
          )}
        >
          <Button ref={triggerRef} className="erp-split-layout-trigger" icon={<LayoutOutlined />} aria-label="分栏布局" aria-expanded={layoutOpen} aria-haspopup="dialog" onKeyDown={handleLayoutKeyDown}>分栏 <DownOutlined aria-hidden="true" /></Button>
        </Popover>
      ) : null}
      {header.onClose ? <BusinessSplitCollapseButton onClick={header.onClose} visible={header.visible} /> : null}
    </>
  )
}
