import React from 'react'
import {
  ArrowsAltOutlined,
  ColumnWidthOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  OneToOneOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import './diagramViewControls.css'

export default function DiagramViewControls({
  label,
  zoom,
  zoomMode,
  minZoom,
  maxZoom,
  onFit,
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
  children,
}) {
  return (
    <div
      className="erp-diagram-view-controls"
      role="group"
      aria-label={`${label}视图操作`}
      data-fullscreen={fullscreen ? 'true' : 'false'}
    >
      {children}
      <button
        type="button"
        className="erp-diagram-view-controls__button"
        data-diagram-zoom-action="fit-all"
        title="适应全图"
        aria-label={`适应${label}全图`}
        aria-pressed={zoomMode === 'fit-all'}
        disabled={disabled || fitDisabled}
        onClick={() => onFit('fit-all')}
      >
        <FullscreenOutlined />
      </button>
      <button
        type="button"
        className="erp-diagram-view-controls__button"
        data-diagram-zoom-action="fit"
        title="适配宽度"
        aria-label={`适配${label}宽度`}
        aria-pressed={zoomMode === 'fit-width'}
        disabled={disabled || fitDisabled}
        onClick={() => onFit('fit-width')}
      >
        <ColumnWidthOutlined />
      </button>
      <button
        type="button"
        className="erp-diagram-view-controls__button"
        data-diagram-zoom-action="zoom-out"
        title="缩小"
        aria-label={`缩小${label}`}
        disabled={disabled || zoom <= minZoom}
        onClick={onZoomOut}
      >
        <ZoomOutOutlined />
      </button>
      <span className="erp-diagram-view-controls__zoom-label" data-diagram-zoom-label>
        {Number((zoom * 100).toFixed(zoom < 0.01 ? 2 : 0))}%
      </span>
      <button
        type="button"
        className="erp-diagram-view-controls__button"
        data-diagram-zoom-action="zoom-in"
        title="放大"
        aria-label={`放大${label}`}
        disabled={disabled || zoom >= maxZoom}
        onClick={onZoomIn}
      >
        <ZoomInOutlined />
      </button>
      <button
        type="button"
        className="erp-diagram-view-controls__button"
        data-diagram-zoom-action="reset"
        title="重置 100%"
        aria-label={`重置${label}为 100%`}
        aria-pressed={zoomMode === 'manual' && zoom === 1}
        disabled={disabled}
        onClick={onReset}
      >
        <OneToOneOutlined />
      </button>
      <button
        ref={fullscreenButtonRef}
        type="button"
        className="erp-diagram-view-controls__button"
        data-diagram-fullscreen-action={fullscreen ? 'close' : 'open'}
        title={fullscreen ? '退出全屏' : fullscreenLabel}
        aria-label={fullscreen ? exitFullscreenLabel : fullscreenLabel}
        aria-pressed={fullscreen}
        onClick={onFullscreen}
      >
        {fullscreen ? <FullscreenExitOutlined /> : <ArrowsAltOutlined />}
      </button>
    </div>
  )
}
