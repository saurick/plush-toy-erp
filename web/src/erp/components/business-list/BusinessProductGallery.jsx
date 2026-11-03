import React, { useEffect, useMemo, useRef, useState } from 'react'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import { normalizeGalleryProducts } from '../../utils/businessProductGallery.mjs'
import { createTaskProductImageLoader } from '../../utils/taskProductImage.mjs'
import { downloadBusinessAttachment } from '../../api/attachmentApi.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import WorkflowTaskImagePreview from '../workflow/WorkflowTaskImagePreview.jsx'
import './businessProductGallery.css'

function ProductGallerySession({ products, productCount, title = '产品图片', loadProducts, renderThumbnail, children, compact = false, onClose }) {
  const trigger = useRef(null)
  const request = useRef(null)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(null)
  const [error, setError] = useState('')
  const [loadImage] = useState(() => createTaskProductImageLoader(downloadBusinessAttachment))
  const initialProducts = useMemo(() => normalizeGalleryProducts(products), [products])
  const count = productCount ?? initialProducts.length
  useEffect(() => () => request.current?.abort(), [loadProducts])

  const open = async (event) => {
    event.stopPropagation()
    if (busy || request.current) return
    const controller = new AbortController()
    request.current?.abort()
    request.current = controller
    setError('')
    setBusy(true)
    try {
      const result = normalizeGalleryProducts(loadProducts ? await loadProducts({ signal: controller.signal }) : products)
      if (controller.signal.aborted) return
      if (!result.length) setError('当前没有关联产品，请刷新列表后核对')
      else setOpened({ products: result })
    } catch (cause) {
      if (!controller.signal.aborted) setError(getActionErrorMessage(cause, '读取产品图片'))
    } finally {
      if (request.current === controller) request.current = null
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return (
    <span className={`erp-product-gallery${compact ? ' erp-product-gallery--compact' : ''}`}>
      <button ref={trigger} type="button" className="erp-product-gallery__trigger" aria-label={count > 1 ? `查看${title}的 ${count} 款产品图片` : `查看${initialProducts[0]?.name || title}大图`} aria-haspopup="dialog" aria-busy={busy} disabled={busy} onClick={open} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation() }}>
        <span className={count > 1 ? 'erp-product-gallery__stack' : 'erp-product-gallery__thumbnail'}>{children}</span>
        {compact ? null : <span className="erp-product-gallery__summary"><span>{count > 1 ? `共 ${count} 款产品` : initialProducts[0]?.name || '产品图片'}</span><small>{busy ? '正在读取' : '查看图片'}</small></span>}
      </button>
      {error ? <span className="erp-product-gallery__error" role="alert">{error}</span> : null}
      {opened ? <WorkflowTaskImagePreview
        item={opened.products[0]}
        load={loadImage}
        gallery={{ products: opened.products, title, renderThumbnail }}
        onClose={({ restoreFocus = true } = {}) => { setOpened(null); onClose?.(); if (restoreFocus) trigger.current?.focus({ preventScroll: true }) }}
      /> : null}
    </span>
  )
}

export default function BusinessProductGallery({ children, products, title, ...props }) {
  const { adminProfile } = useBusinessPageContext() || {}
  if (!hasActionPermission(adminProfile, PermissionCode.PRODUCT_READ)) return children || null
  const scope = `${workflowTaskAdminAccessRequestIdentity(adminProfile)}:${title || ''}:${JSON.stringify(normalizeGalleryProducts(products))}`
  return <ProductGallerySession key={scope} products={products} title={title} {...props}>{children}</ProductGallerySession>
}
