import React, { cloneElement, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CloseOutlined,
  LeftOutlined,
  RightOutlined,
  PictureOutlined,
  ReloadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Image, Spin } from 'antd'
import SupplementalHelp from '@/common/components/help/SupplementalHelp'
import { useOverlayContainer, useOverlayDialog } from '@/common/components/overlay/ScopedOverlayDialog.jsx'
import { canRestoreOverlayFocus } from '@/common/components/overlay/OverlayScopeContext.mjs'
import './workflowTaskImagePreview.css'
import { isUsableImageDimensions } from '../../utils/imageDisplay.mjs'
import { listProductImages } from '../../api/attachmentApi.mjs'
import {
  selectSavedProductImages,
  selectSavedSupplementalProductImages,
} from '../../utils/productImageSlots.mjs'
import { PRODUCT_IMAGES_CHANGED } from '../../utils/productImageReferences.mjs'
import { RpcErrorCode } from '@/common/consts/errorCodes'

export default function WorkflowTaskImagePreview({
  item,
  thumbnail,
  source,
  load,
  onClose,
  gallery,
}) {
  const [visible, setVisible] = useState(true)
  const [preview, setPreview] = useState(null)
  const overlay = useOverlayContainer(visible)
  useOverlayDialog(preview, visible, overlay.scope)
  const [resource, setResource] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [productIndex, setProductIndex] = useState(0)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [metadata, setMetadata] = useState(null)
  const [mediaRevision, setMediaRevision] = useState(0)
  const [toolbar, setToolbar] = useState(null)
  const focusClose = useCallback((node) => node?.focus({ preventScroll: true }), [])
  const selected = gallery?.products[productIndex] || item
  const { productID } = selected
  const galleryEnabled = Boolean(gallery || (!source && productID > 0 && item.imageAttachmentID > 0))
  const metadataKey = `${productID}:${gallery ? 0 : item.imageAttachmentID || 0}:${mediaRevision}`
  const currentMetadata = metadata?.key === metadataKey ? metadata : null
  const photos = currentMetadata?.photos || []
  const selectedPhoto = photos[photoIndex] || photos[0]
  const attachmentID = currentMetadata?.state === 'ready'
    ? selectedPhoto?.id || 0
    : gallery ? 0 : item.imageAttachmentID
  const blockedAlbum = galleryEnabled && !attachmentID
  const resourceKey = `${productID}:${attachmentID}:${attempt}`
  const original = source || (resource?.key === resourceKey ? resource.src : '')
  const failed = resource?.key === resourceKey && resource.failed
  const denied = resource?.key === resourceKey && resource.denied
  const name = selected.name || '产品主图'
  const productCount = gallery?.products.length || 0
  const retryAlbum = Boolean(attachmentID && currentMetadata?.state === 'failed')
  const showPhotoControls = galleryEnabled && (productCount > 1 || photos.length > 1 || retryAlbum)
  const photoLabel = selectedPhoto
    ? `${selectedPhoto.label} · ${photoIndex + 1} / ${photos.length} 张`
    : ({
      ready: '暂无图片',
      denied: '无相册查看权限',
      failed: '相册读取失败',
    }[currentMetadata?.state] || '正在读取图片')

  useEffect(() => {
    const strip = toolbar?.querySelector('.erp-product-gallery-preview__products')
    if (!strip || !visible) return undefined
    const revealSelected = () => {
      const button = strip.querySelector('[aria-pressed="true"]')
      if (!button) return
      const current = button.getBoundingClientRect()
      const bounds = strip.getBoundingClientRect()
      if (current.left < bounds.left) strip.scrollLeft -= bounds.left - current.left
      else if (current.right > bounds.right) strip.scrollLeft += current.right - bounds.right
    }
    revealSelected()
    const observer = new ResizeObserver(revealSelected)
    observer.observe(strip)
    return () => observer.disconnect()
  }, [toolbar, visible, productIndex, productCount])

  useEffect(() => {
    if (!galleryEnabled || !visible) return undefined
    let active = true
    listProductImages({ product_id: productID })
      .then((attachments) => {
        if (!active) return
        const owned = attachments.filter((image) => image.owner_type === 'product' && image.owner_id === productID && !image.withdrawn_at)
        const saved = selectSavedProductImages(owned)
        const slots = Object.entries(saved).filter(([, image]) => image)
          .map(([slot, image]) => ({ id: image.id, label: slot === 'primary' ? '主图' : '辅图' }))
        const supplemental = selectSavedSupplementalProductImages(owned)
          .map((image, index) => ({ id: image.id, label: `附图 ${index + 1}` }))
        setMetadata({ key: metadataKey, photos: [...slots, ...supplemental], state: 'ready' })
      })
      .catch((error) => {
        if (active) setMetadata({ key: metadataKey, photos: [], state: Number(error?.code) === RpcErrorCode.PERMISSION_DENIED ? 'denied' : 'failed' })
      })
    return () => { active = false }
  }, [galleryEnabled, productID, metadataKey, visible])

  useEffect(() => {
    if (!galleryEnabled) return undefined
    const changed = (event) => {
      if (event.detail !== 0 && event.detail !== productID) return
      setPhotoIndex(0)
      setMediaRevision((value) => value + 1)
    }
    window.addEventListener(PRODUCT_IMAGES_CHANGED, changed)
    return () => window.removeEventListener(PRODUCT_IMAGES_CHANGED, changed)
  }, [galleryEnabled, productID])

  useEffect(() => {
    if (!visible || source || !attachmentID) return undefined
    let active = true
    load({
      productID,
      attachmentID,
      variant: '',
    })
      .then((src) => {
        if (active) setResource({ key: resourceKey, src })
      })
      .catch((error) => {
        if (active) setResource({ key: resourceKey, src: '', failed: true, denied: Number(error?.code) === RpcErrorCode.PERMISSION_DENIED })
      })
    return () => {
      active = false
    }
  }, [visible, source, resourceKey, productID, attachmentID, load])

  const renderImage = (image) => (
    <>
      <div ref={setPreview} className="erp-task-image-preview__header">
        <div className="erp-task-image-preview__identity">
          <strong>{name}</strong>
          {selected.code ? <span>产品编号 {selected.code}</span> : null}
          {!showPhotoControls && selectedPhoto ? <span>{photoLabel}</span> : null}
          {gallery && (gallery.products.length > 1 || (gallery.title && gallery.title !== name)) ? <span>{gallery.title || '产品图片'}{gallery.products.length > 1 ? ` · 产品 ${productIndex + 1} / ${gallery.products.length}` : ''}</span> : null}
        </div>
        <button
          ref={focusClose}
          type="button"
          aria-label="关闭图片预览"
          onClick={() => setVisible(false)}
        >
          <CloseOutlined aria-hidden="true" />
        </button>
      </div>
      <div className="erp-task-image-preview__stage" data-scroll-edges="off">
        {(blockedAlbum && currentMetadata?.state === 'denied') || denied ? (
          <div className="erp-task-image-preview__status" role="status"><PictureOutlined aria-hidden="true" /><span>无图片读取权限</span></div>
        ) : blockedAlbum && currentMetadata?.state === 'failed' ? (
          <div className="erp-task-image-preview__status" role="alert"><span>图片读取失败，请重试</span><button type="button" onClick={() => setMediaRevision((value) => value + 1)}><ReloadOutlined aria-hidden="true" />重新加载</button></div>
        ) : blockedAlbum && currentMetadata?.state === 'ready' ? (
          <div className="erp-task-image-preview__status" role="status"><PictureOutlined aria-hidden="true" /><span>该产品暂无图片</span></div>
        ) : failed ? (
          <div className="erp-task-image-preview__status" role="alert">
            <span>图片加载失败，请重试</span>
            <button
              type="button"
              onClick={() => {
                setAttempt((value) => value + 1)
              }}
            >
              <ReloadOutlined aria-hidden="true" />
              重新加载
            </button>
          </div>
        ) : original ? (
          cloneElement(image, {
            onLoad: (event) => {
              if (!isUsableImageDimensions(event.currentTarget)) setResource({ key: resourceKey, src: '', failed: true })
            },
            onError: () => setResource({ key: resourceKey, src: '', failed: true }),
          })
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

  // The preview renders in a portal; its local host must stay out of the thumbnail layout.
  return (
    <span hidden onClick={(event) => event.stopPropagation()}>
      <Image
        src={thumbnail}
        alt={name}
        preview={{
          visible,
          src: original || (galleryEnabled ? '' : thumbnail),
          rootClassName: 'erp-task-image-preview',
          getContainer: overlay.getContainer,
          focusTriggerAfterClose: overlay.scope ? false : undefined,
          title: `${name}图片预览`,
          maxScale: 8,
          onVisibleChange: setVisible,
          afterOpenChange: (open) => {
            if (!open) {
              onClose({ restoreFocus: !overlay.scope || canRestoreOverlayFocus(overlay.scope) })
            }
          },
          imageRender: renderImage,
          // Keep the library's zoom actions inside its dialog so keyboard focus stays in the preview.
          toolbarRender: (_, { actions, transform }) =>
            toolbar &&
            createPortal(
              <>
                {gallery && gallery.products.length > 1 ? (
                  <div className="erp-product-gallery-preview__products" role="group" aria-label="切换产品">
                    {gallery.products.map((product, index) => (
                      <button type="button" key={product.productID} aria-pressed={index === productIndex} aria-label={`查看${product.name}${product.code ? `（${product.code}）` : ''}图片`} onClick={() => { actions.onReset(); setProductIndex(index); setPhotoIndex(0) }}>
                        {gallery.renderThumbnail?.(product)}
                        <span className="erp-product-gallery-preview__product-name"><span>{product.name}</span>{product.code ? <small>{product.code}</small> : null}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={`erp-task-image-preview__controls${showPhotoControls ? '' : ' erp-task-image-preview__controls--single'}`}>
                  {showPhotoControls ? (
                    <div className="erp-product-gallery-preview__photos" role="group" aria-label="切换当前产品图片">
                      {photos.length > 1 ? <button type="button" aria-label="上一张图片" disabled={photoIndex === 0} onClick={() => { actions.onReset(); setPhotoIndex((value) => value - 1) }}><LeftOutlined aria-hidden="true" /></button> : null}
                      <span aria-live="polite">{photoLabel}</span>
                      {retryAlbum ? <button type="button" aria-label="重新读取相册" onClick={() => setMediaRevision((value) => value + 1)}><ReloadOutlined aria-hidden="true" /></button> : null}
                      {photos.length > 1 ? <button type="button" aria-label="下一张图片" disabled={photoIndex >= photos.length - 1} onClick={() => { actions.onReset(); setPhotoIndex((value) => value + 1) }}><RightOutlined aria-hidden="true" /></button> : null}
                    </div>
                  ) : null}
                  <div className="erp-task-image-preview__actions">
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
                      <span className="erp-task-image-preview__scale" aria-label={`缩放比例 ${Math.round(transform.scale * 100)}%`}>{Math.round(transform.scale * 100)}%</span>
                      <button
                        type="button"
                        aria-label="放大图片"
                        disabled={!original || failed || transform.scale >= 8}
                        onClick={actions.onZoomIn}
                      >
                        <ZoomInOutlined aria-hidden="true" />
                      </button>
                    </div>
                    <SupplementalHelp
                      label="看图操作"
                      aria-label="查看看图操作帮助"
                      title="看图操作"
                      width={300}
                      placement="topRight"
                      className="erp-task-image-preview__help"
                      contentClassName="erp-task-image-preview__help-content"
                      content={(
                        <>
                          <span className="erp-task-image-preview__hint erp-task-image-preview__hint--mouse">滚轮缩放 · 拖动查看</span>
                          <span className="erp-task-image-preview__hint erp-task-image-preview__hint--touch">双指缩放 · 放大后拖动</span>
                          <span>Esc 关闭说明，再按退出预览</span>
                        </>
                      )}
                    />
                  </div>
                </div>
              </>,
              toolbar
            ),
        }}
      />
    </span>
  )
}
