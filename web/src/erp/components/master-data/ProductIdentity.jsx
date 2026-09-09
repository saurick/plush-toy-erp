import React, { useEffect, useRef, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { useOutletContext } from 'react-router-dom'
import { listProductImageReferences } from '../../api/attachmentApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import {
  createProductImageReferenceLoader,
  PRODUCT_IMAGES_CHANGED,
} from '../../utils/productImageReferences.mjs'
import WorkflowTaskProductImage from '../workflow/WorkflowTaskProductImage.jsx'
import '../workflow/workflowTaskIdentity.css'
import './productIdentity.css'

const loaders = new WeakMap()
function referenceLoader(profile, accessKey) {
  const existing = loaders.get(profile)
  if (existing?.accessKey === accessKey) return existing.read
  const read = createProductImageReferenceLoader(listProductImageReferences)
  loaders.set(profile, { accessKey, read })
  return read
}

function ProductPicture({ productID, name, code, read, preview }) {
  const target = useRef(null)
  const [revision, setRevision] = useState(0)
  const [image, setImage] = useState({ id: 0, state: 'loading' })
  useEffect(() => {
    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        read(productID)
          .then((id) => {
            if (active) setImage({ id, state: 'empty' })
          })
          .catch(() => {
            if (active) setImage({ id: 0, state: 'failed' })
          })
      },
      { rootMargin: '120px' }
    )
    observer.observe(target.current)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [productID, read, revision])
  useEffect(() => {
    const changed = (event) => {
      if (event.detail !== 0 && event.detail !== productID) return
      read.invalidate(productID)
      setImage({ id: 0, state: 'loading' })
      setRevision((value) => value + 1)
    }
    window.addEventListener(PRODUCT_IMAGES_CHANGED, changed)
    return () => window.removeEventListener(PRODUCT_IMAGES_CHANGED, changed)
  }, [productID, read])
  return (
    <span ref={target} className="erp-product-identity__picture">
      <WorkflowTaskProductImage
        item={{
          kind: 'product',
          productID,
          imageAttachmentID: image.id,
          name,
          code,
        }}
        state={image.state}
        preview={preview}
      />
      {image.state === 'failed' && preview ? (
        <button
          type="button"
          className="erp-product-identity__retry"
          aria-label={`重试${name || '产品'}图片`}
          title="图片加载失败，点击重试"
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            setImage({ id: 0, state: 'loading' })
            setRevision((value) => value + 1)
          }}
        >
          <ReloadOutlined aria-hidden="true" />
        </button>
      ) : null}
    </span>
  )
}

export default function ProductIdentity({
  productId,
  name,
  code,
  children,
  compact = false,
  preview = true,
}) {
  const { adminProfile } = useOutletContext() || {}
  const productID = Number(productId || 0)
  const allowed =
    Number.isSafeInteger(productID) &&
    productID > 0 &&
    hasActionPermission(adminProfile, 'product.read')
  const accessKey = allowed
    ? workflowTaskAdminAccessRequestIdentity(adminProfile)
    : ''
  return (
    <span
      className={`erp-product-identity${compact ? ' erp-product-identity--compact' : ''}`}
    >
      {allowed ? (
        <ProductPicture
          key={`${accessKey}:${productID}`}
          productID={productID}
          name={name}
          code={code}
          read={referenceLoader(adminProfile, accessKey)}
          preview={preview}
        />
      ) : (
        <WorkflowTaskProductImage item={{ name }} />
      )}
      <span className="erp-product-identity__text">
        {children || name || '产品'}
        {code ? <small>{code}</small> : null}
      </span>
    </span>
  )
}

export function renderProductOption(option) {
  return (
    <ProductIdentity
      productId={option.value}
      name={option.label}
      compact
      preview={false}
    />
  )
}
