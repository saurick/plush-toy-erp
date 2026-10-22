import React, { useEffect, useRef, useState } from 'react'
import {
  InboxOutlined,
  PictureOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useOutletContext } from 'react-router-dom'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { RpcErrorCode } from '@/common/consts/errorCodes'
import { downloadBusinessAttachment } from '../../api/attachmentApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import { createTaskProductImageLoader } from '../../utils/taskProductImage.mjs'
import WorkflowTaskImagePreview from './WorkflowTaskImagePreview.jsx'
import { isUsableImageDimensions } from '../../utils/imageDisplay.mjs'

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
    state === 'denied'
      ? '无权限'
      : state === 'failed'
      ? '加载失败'
      : state === 'loading'
        ? '加载中'
        : material
          ? '物料'
          : '暂无图'
  const description = `${item.name || (material ? '物料' : '产品')}：${
    state === 'denied'
      ? '无图片读取权限'
      : state === 'failed'
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
  const trigger = useRef(null)
  const [thumbnail, setThumbnail] = useState('')
  const [failed, setFailed] = useState(false)
  const [denied, setDenied] = useState(false)
  const [revision, setRevision] = useState(0)
  const [opened, setOpened] = useState(false)

  useEffect(() => {
    let active = true
    const read = () =>
      load({ productID: item.productID, attachmentID: item.imageAttachmentID })
        .then((src) => {
          if (active) setThumbnail(src)
        })
        .catch((error) => {
          if (!active) return
          if (Number(error?.code) === RpcErrorCode.PERMISSION_DENIED) setDenied(true)
          else setFailed(true)
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
  }, [item.productID, item.imageAttachmentID, load, revision])

  const picture = thumbnail ? (
    <img
      src={thumbnail}
      alt={`${item.name || '产品'}主图`}
      width="64"
      height="64"
      onLoad={(event) => {
        if (!isUsableImageDimensions(event.currentTarget)) setFailed(true)
      }}
      onError={() => setFailed(true)}
    />
  ) : (
    <ImagePlaceholder item={item} state="loading" />
  )
  const imageState = denied ? 'denied' : failed ? 'failed' : thumbnail ? 'ready' : 'loading'
  return (
    <>
      <span
        ref={target}
        className={`erp-task-product-image${imageState !== 'ready' ? ' erp-task-product-image--placeholder' : ''}`}
        data-image-state={imageState}
      >
        {denied ? (
          <ImagePlaceholder item={item} state="denied" />
        ) : failed && preview ? (
          <button
            type="button"
            className="erp-task-product-image__retry"
            aria-label={`重试${item.name || '产品'}图片`}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation() }}
            onClick={(event) => {
              event.stopPropagation()
              load.invalidate({ productID: item.productID, attachmentID: item.imageAttachmentID })
              setFailed(false)
              setThumbnail('')
              setRevision((value) => value + 1)
            }}
          >
            <ReloadOutlined aria-hidden="true" /><span>重试图片</span>
          </button>
        ) : failed ? (
          <ImagePlaceholder item={item} state="failed" />
        ) : thumbnail && preview ? (
          <button
            ref={trigger}
            type="button"
            aria-label={`查看${item.name || '产品'}大图`}
            aria-haspopup="dialog"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onTouchStart={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation() }}
            onClick={(event) => {
              event.stopPropagation()
              if (!event.currentTarget.closest('[role="option"]')) {
                event.currentTarget.focus({ preventScroll: true })
              }
              setOpened(true)
            }}
          >
            {picture}
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
          onClose={() => {
            setOpened(false)
            trigger.current?.focus({ preventScroll: true })
          }}
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
  const denied = item.kind !== 'material' && item.productID > 0 && !hasActionPermission(adminProfile, PermissionCode.PRODUCT_READ)
  if (
    item.kind === 'material' ||
    !item.productID ||
    !item.imageAttachmentID ||
    !hasActionPermission(adminProfile, PermissionCode.PRODUCT_READ)
  ) {
    return (
      <span
        className="erp-task-product-image erp-task-product-image--placeholder"
        data-image-state={denied ? 'denied' : state}
      >
        <ImagePlaceholder item={item} state={denied ? 'denied' : state} />
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
