import React, { useEffect, useRef, useState } from 'react'
import {
  InboxOutlined,
  PictureOutlined,
  ZoomInOutlined,
} from '@ant-design/icons'
import { useOutletContext } from 'react-router-dom'
import { downloadBusinessAttachment } from '../../api/attachmentApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import { createTaskProductImageLoader } from '../../utils/taskProductImage.mjs'
import WorkflowTaskImagePreview from './WorkflowTaskImagePreview.jsx'

// A profile's cache becomes unreachable on logout; permission changes use a new loader.
const profileLoaders = new WeakMap()
function profileLoader(profile, accessKey) {
  const previous = profileLoaders.get(profile)
  if (previous?.accessKey === accessKey) return previous.load
  const load = createTaskProductImageLoader(downloadBusinessAttachment)
  profileLoaders.set(profile, { accessKey, load })
  return load
}

function ImagePlaceholder({ item, state = 'empty' }) {
  const material = item.kind === 'material'
  const Icon = material ? InboxOutlined : PictureOutlined
  const label =
    state === 'failed'
      ? '加载失败'
      : state === 'loading'
        ? '加载中'
        : material
          ? '物料'
          : '暂无图'
  const description = `${item.name || (material ? '物料' : '产品')}：${
    state === 'failed'
      ? '图片暂不可用'
      : state === 'loading'
        ? '图片加载中'
        : '暂无可显示的图片'
  }`
  return (
    <span
      className="erp-task-product-image__placeholder"
      role="img"
      aria-label={description}
      title={description}
    >
      <Icon aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
    </span>
  )
}

function ProductImage({ item, load, preview }) {
  const target = useRef(null)
  const [thumbnail, setThumbnail] = useState('')
  const [failed, setFailed] = useState(false)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    let active = true
    const read = () =>
      load({ productID: item.productID, attachmentID: item.imageAttachmentID })
        .then((src) => {
          if (active) setThumbnail(src)
        })
        .catch(() => {
          if (active) setFailed(true)
        })
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect()
          read()
        }
      },
      { rootMargin: '120px' }
    )
    observer.observe(target.current)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [item.productID, item.imageAttachmentID, load])

  const picture = thumbnail ? (
    <img
      src={thumbnail}
      alt={`${item.name || '产品'}主图`}
      width="64"
      height="64"
      onError={() => setFailed(true)}
    />
  ) : (
    <ImagePlaceholder item={item} state="loading" />
  )
  const imageState = failed ? 'failed' : thumbnail ? 'ready' : 'loading'
  return (
    <>
      <span
        ref={target}
        className={`erp-task-product-image${imageState !== 'ready' ? ' erp-task-product-image--placeholder' : ''}`}
        data-image-state={imageState}
      >
        {failed ? (
          <ImagePlaceholder item={item} state="failed" />
        ) : thumbnail && preview ? (
          <button
            type="button"
            aria-label={`查看${item.name || '产品'}大图`}
            aria-haspopup="dialog"
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              event.currentTarget.focus({ preventScroll: true })
              setOpened(true)
            }}
          >
            {picture}
            <ZoomInOutlined
              className="erp-task-product-image__zoom"
              aria-hidden="true"
            />
          </button>
        ) : (
          picture
        )}
      </span>
      {opened ? (
        <WorkflowTaskImagePreview
          item={item}
          thumbnail={thumbnail}
          load={load}
          onClose={() => setOpened(false)}
        />
      ) : null}
    </>
  )
}

export default function WorkflowTaskProductImage({
  item = {},
  preview = true,
  state = 'empty',
}) {
  const { adminProfile } = useOutletContext() || {}
  if (
    item.kind === 'material' ||
    !item.productID ||
    !item.imageAttachmentID ||
    !hasActionPermission(adminProfile, 'product.read')
  ) {
    return (
      <span
        className="erp-task-product-image erp-task-product-image--placeholder"
        data-image-state={state}
      >
        <ImagePlaceholder item={item} state={state} />
      </span>
    )
  }
  const accessKey = workflowTaskAdminAccessRequestIdentity(adminProfile)
  return (
    <ProductImage
      key={`${accessKey}:${item.productID}:${item.imageAttachmentID}`}
      item={item}
      preview={preview}
      load={profileLoader(adminProfile, accessKey)}
    />
  )
}
