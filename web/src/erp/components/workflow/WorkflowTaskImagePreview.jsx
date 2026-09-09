import React, { cloneElement, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CloseOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Image, Spin } from 'antd'
import './workflowTaskImagePreview.css'

export default function WorkflowTaskImagePreview({
  item,
  thumbnail,
  load,
  onClose,
}) {
  const [visible, setVisible] = useState(true)
  const [original, setOriginal] = useState('')
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [toolbar, setToolbar] = useState(null)
  const name = item.name || '产品主图'

  useEffect(() => {
    if (!visible) return
    let active = true
    load({
      productID: item.productID,
      attachmentID: item.imageAttachmentID,
      variant: '',
    })
      .then((src) => {
        if (active) setOriginal(src)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [visible, attempt, item.productID, item.imageAttachmentID, load])

  const renderImage = (image) => (
    <>
      <div className="erp-task-image-preview__header">
        <div className="erp-task-image-preview__identity">
          <strong>{name}</strong>
          {item.code ? <span>产品编号 {item.code}</span> : null}
        </div>
        <button
          type="button"
          aria-label="关闭图片预览"
          onClick={() => setVisible(false)}
        >
          <CloseOutlined aria-hidden="true" />
        </button>
      </div>
      <div className="erp-task-image-preview__stage">
        {failed ? (
          <div className="erp-task-image-preview__status" role="alert">
            <span>图片加载失败，请重试</span>
            <button
              type="button"
              onClick={() => {
                setOriginal('')
                setFailed(false)
                setAttempt((value) => value + 1)
              }}
            >
              <ReloadOutlined aria-hidden="true" />
              重新加载
            </button>
          </div>
        ) : original ? (
          cloneElement(image, { onError: () => setFailed(true) })
        ) : (
          <div className="erp-task-image-preview__status" role="status">
            <Spin />
            <span>正在加载图片</span>
          </div>
        )}
      </div>
      <div ref={setToolbar} className="erp-task-image-preview__footer" />
    </>
  )

  return (
    <span onClick={(event) => event.stopPropagation()}>
      <Image
        src={thumbnail}
        alt={name}
        wrapperStyle={{ display: 'none' }}
        preview={{
          visible,
          src: original || thumbnail,
          rootClassName: 'erp-task-image-preview',
          getContainer: () => document.body,
          title: `${name}图片预览`,
          maxScale: 8,
          onVisibleChange: setVisible,
          afterOpenChange: (open) => {
            if (!open) onClose()
          },
          imageRender: renderImage,
          // Keep the library's zoom actions inside its dialog so keyboard focus stays in the preview.
          toolbarRender: (_, { actions, transform }) =>
            toolbar &&
            createPortal(
              <>
                <div
                  className="erp-task-image-preview__tools"
                  role="group"
                  aria-label="图片缩放"
                >
                  <button
                    type="button"
                    aria-label="缩小图片"
                    disabled={!original || failed || transform.scale <= 1}
                    onClick={actions.onZoomOut}
                  >
                    <ZoomOutOutlined aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={!original || failed}
                    onClick={actions.onReset}
                  >
                    适应屏幕
                  </button>
                  <button
                    type="button"
                    aria-label="放大图片"
                    disabled={!original || failed || transform.scale >= 8}
                    onClick={actions.onZoomIn}
                  >
                    <ZoomInOutlined aria-hidden="true" />
                  </button>
                </div>
                <span className="erp-task-image-preview__hint erp-task-image-preview__hint--mouse">
                  滚轮缩放 · 拖动查看
                </span>
                <span className="erp-task-image-preview__hint erp-task-image-preview__hint--touch">
                  双指缩放 · 放大后拖动
                </span>
              </>,
              toolbar
            ),
        }}
      />
    </span>
  )
}
