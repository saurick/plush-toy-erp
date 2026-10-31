import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { RpcErrorCode } from '@/common/consts/errorCodes'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import { createDocumentProductPreviewLoader, DOCUMENT_PRODUCT_SOURCES } from '../../utils/businessProductGallery.mjs'
import { listDocumentProductPreviews } from '../../api/attachmentApi.mjs'
import { loadDocumentGalleryProducts } from '../../api/documentProductGalleryApi.mjs'
import BusinessProductGallery from './BusinessProductGallery.jsx'
import { ProductThumbnail } from '../master-data/ProductIdentity.jsx'

const loaders = new WeakMap()
function previewLoader(profile, accessKey) {
  const previous = loaders.get(profile)
  if (previous?.accessKey === accessKey) return previous.read
  const read = createDocumentProductPreviewLoader(listDocumentProductPreviews)
  loaders.set(profile, { accessKey, read })
  return read
}

export function canReadDocumentProductGallery(profile, source) {
  const permissions = {
    [DOCUMENT_PRODUCT_SOURCES.SALES_ORDER]: [PermissionCode.SALES_ORDER_READ, PermissionCode.SALES_ORDER_ITEM_READ],
    [DOCUMENT_PRODUCT_SOURCES.PRODUCTION_ORDER]: [PermissionCode.PMC_PLAN_READ],
    [DOCUMENT_PRODUCT_SOURCES.OUTSOURCING_ORDER]: [PermissionCode.OUTSOURCING_ORDER_READ],
  }[source]
  return Boolean(permissions && [PermissionCode.PRODUCT_READ, ...permissions].every((permission) => hasActionPermission(profile, permission)))
}

function GalleryCell({ source, documentID, version, title, read }) {
  const target = useRef(null)
  const [preview, setPreview] = useState(null)
  const [state, setState] = useState('loading')
  const [attempt, setAttempt] = useState(0)
  const loadProducts = useCallback((options) => loadDocumentGalleryProducts(source, documentID, { ...options, expectedVersion: version }), [source, documentID, version])
  useEffect(() => {
    let active = true
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      read(source, documentID).then((row) => { if (active) { setPreview(row); setState('ready') } }).catch((error) => { if (active) setState(Number(error?.code) === RpcErrorCode.PERMISSION_DENIED ? 'denied' : 'failed') })
    }, { rootMargin: '120px' })
    observer.observe(target.current)
    return () => { active = false; observer.disconnect() }
  }, [source, documentID, read, attempt])
  const product = preview ? { productID: preview.product_id, name: preview.product_name, code: preview.product_code } : null
  let content
  if (state === 'ready' && product?.productID > 0) {
    content = (
      <BusinessProductGallery products={[product]} productCount={preview.product_count} title={title} loadProducts={loadProducts} renderThumbnail={(entry) => <ProductThumbnail productId={entry.productID} name={entry.name} code={entry.code} preview={false} />}>
        <ProductThumbnail productId={product.productID} name={product.name} code={product.code} preview={false} />
      </BusinessProductGallery>
    )
  } else if (state === 'failed') {
    content = <button type="button" className="erp-product-gallery__retry" onClick={(event) => { event.stopPropagation(); setState('loading'); setAttempt((value) => value + 1) }} onDoubleClick={(event) => event.stopPropagation()}><ReloadOutlined aria-hidden="true" />重试图片</button>
  } else if (state === 'ready') {
    content = <span className="erp-document-product-gallery__empty">暂无关联产品</span>
  } else {
    content = <span className="erp-document-product-gallery__empty" role="status">{state === 'denied' ? '无产品读取权限' : '正在读取产品'}</span>
  }
  return <span ref={target} className="erp-document-product-gallery" data-gallery-state={state}>{content}</span>
}

export default function BusinessDocumentProductGallery({ source, record, title }) {
  const { adminProfile } = useBusinessPageContext() || {}
  if (!canReadDocumentProductGallery(adminProfile, source)) return null
  const accessKey = workflowTaskAdminAccessRequestIdentity(adminProfile)
  return <GalleryCell key={`${accessKey}:${source}:${record.id}:${record.version || ''}:${record.updated_at || ''}`} source={source} documentID={record.id} version={record.version} title={title} read={previewLoader(adminProfile, accessKey)} />
}

export function documentProductGalleryColumn(source, profile) {
  return canReadDocumentProductGallery(profile, source) ? [{
    key: 'product_gallery',
    title: '产品图片',
    width: 180,
    defaultPriority: 5,
    exportable: false,
    className: 'erp-product-gallery-cell',
    render: (_value, record) => <BusinessDocumentProductGallery source={source} record={record} title={record.order_no || record.outsourcing_order_no || '单据产品'} />,
  }] : []
}
