import React from 'react'
import {
  ArrowsAltOutlined,
  ColumnWidthOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  OneToOneOutlined,
  SwapOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Tooltip } from 'antd'
import './diagramViewControls.css'

function DiagramControlButton({ tooltip, buttonRef, children, ...buttonProps }) {
  // Keep the popup anchored during toolbar reflow and inside the fullscreen surface.
  return (
    <Tooltip
      title={tooltip}
      trigger={['hover', 'focus']}
      placement="bottom"
      getPopupContainer={(trigger) => trigger}
    >
      <span className="erp-diagram-view-controls__trigger">
        <button
          ref={buttonRef}
          type="button"
          className="erp-diagram-view-controls__button"
          {...buttonProps}
        >
          {children}
        </button>
      </span>
    </Tooltip>
  )
}

export default function DiagramViewControls({
  label,
  zoom,
  zoomMode,
  minZoom,
  maxZoom,
  onFit,
  nextLayoutDirection,
  onSwitchLayout,
  onZoomOut,
  onZoomIn,
  onReset,
  fullscreen,
  onFullscreen,
  fullscreenButtonRef,
  fullscreenLabel = `全屏查看${label}`,
  exitFullscreenLabel = `退出${label}全屏`,
  disabled = false,
  fitDisabled = false,
}) {
  const nextLayout = ['LR', 'RL'].includes(nextLayoutDirection) ? '横向' : '纵向'
  return (
    <div
      className="erp-diagram-view-controls"
      role="group"
      aria-label={`${label}视图操作`}
      data-fullscreen={fullscreen ? 'true' : 'false'}
    >
      {nextLayoutDirection ? (
        <DiagramControlButton
          tooltip={`切换为${nextLayout}布局`}
          data-diagram-layout-action="toggle"
          aria-label={`切换${label}为${nextLayout}布局`}
          disabled={disabled || fitDisabled}
          onClick={onSwitchLayout}
        >
          <SwapOutlined aria-hidden="true" />
        </DiagramControlButton>
      ) : null}
      <DiagramControlButton
        tooltip="适应全图"
        data-diagram-zoom-action="fit-all"
        aria-label={`适应${label}全图`}
        aria-pressed={zoomMode === 'fit-all'}
        disabled={disabled || fitDisabled}
        onClick={() => onFit('fit-all')}
      >
        <FullscreenOutlined aria-hidden="true" />
      </DiagramControlButton>
      <DiagramControlButton
        tooltip="适配宽度"
        data-diagram-zoom-action="fit"
        aria-label={`适配${label}宽度`}
        aria-pressed={zoomMode === 'fit-width'}
        disabled={disabled || fitDisabled}
        onClick={() => onFit('fit-width')}
      >
        <ColumnWidthOutlined aria-hidden="true" />
      </DiagramControlButton>
      <DiagramControlButton
        tooltip="缩小"
        data-diagram-zoom-action="zoom-out"
        aria-label={`缩小${label}`}
        disabled={disabled || zoom <= minZoom}
        onClick={onZoomOut}
      >
        <ZoomOutOutlined aria-hidden="true" />
      </DiagramControlButton>
      <span className="erp-diagram-view-controls__zoom-label" data-diagram-zoom-label>
        {Number((zoom * 100).toFixed(zoom < 0.01 ? 2 : 0))}%
      </span>
      <DiagramControlButton
        tooltip="放大"
        data-diagram-zoom-action="zoom-in"
        aria-label={`放大${label}`}
        disabled={disabled || zoom >= maxZoom}
        onClick={onZoomIn}
      >
        <ZoomInOutlined aria-hidden="true" />
      </DiagramControlButton>
      <DiagramControlButton
        tooltip="重置 100%"
        data-diagram-zoom-action="reset"
        aria-label={`重置${label}为 100%`}
        aria-pressed={zoomMode === 'manual' && zoom === 1}
        disabled={disabled}
        onClick={onReset}
      >
        <OneToOneOutlined aria-hidden="true" />
      </DiagramControlButton>
      <DiagramControlButton
        buttonRef={fullscreenButtonRef}
        tooltip={fullscreen ? '退出全屏' : '进入全屏'}
        data-diagram-fullscreen-action={fullscreen ? 'close' : 'open'}
        aria-label={fullscreen ? exitFullscreenLabel : fullscreenLabel}
        aria-pressed={fullscreen}
        onClick={onFullscreen}
      >
        {fullscreen ? <FullscreenExitOutlined aria-hidden="true" /> : <ArrowsAltOutlined aria-hidden="true" />}
      </DiagramControlButton>
    </div>
  )
}
