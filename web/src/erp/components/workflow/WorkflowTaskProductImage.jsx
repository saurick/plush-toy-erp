import React, { useEffect, useRef, useState } from 'react'
import { InboxOutlined, PictureOutlined } from '@ant-design/icons'
import { Button, Modal, Spin } from 'antd'
import { useOutletContext } from 'react-router-dom'
import { downloadBusinessAttachment } from '../../api/attachmentApi.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import { createTaskProductImageLoader } from '../../utils/taskProductImage.mjs'

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

function ProductImage({ item, preview, load }) {
  const target = useRef(null)
  const [thumbnail, setThumbnail] = useState('')
  const [failed, setFailed] = useState(false)
  const [opened, setOpened] = useState(false)
  const [original, setOriginal] = useState('')
  const [previewError, setPreviewError] = useState(false)
  const request = {
    productID: item.productID,
    attachmentID: item.imageAttachmentID,
  }

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

  useEffect(() => {
    if (!opened || original) return
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
        if (active) setPreviewError(true)
      })
    return () => {
      active = false
    }
  }, [opened, original, item.productID, item.imageAttachmentID, load])

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
        ) : preview ? (
          <button
            type="button"
            aria-label={`查看${item.name || '产品'}大图`}
            onClick={() => {
              setPreviewError(false)
              setOpened(true)
            }}
          >
            {picture}
          </button>
        ) : (
          picture
        )}
      </span>
      {preview ? (
        <Modal
          title={item.name || '产品主图'}
          open={opened}
          onCancel={() => setOpened(false)}
          footer={null}
        >
          {previewError ? (
            <div role="alert">
              图片加载失败。
              <Button
                onClick={() => {
                  setPreviewError(false)
                  load({ ...request, variant: '' })
                    .then(setOriginal)
                    .catch(() => setPreviewError(true))
                }}
              >
                重新加载
              </Button>
            </div>
          ) : original ? (
            <img
              className="erp-task-product-image__preview"
              src={original}
              alt={item.name || '产品主图'}
              onError={() => setPreviewError(true)}
            />
          ) : (
            <Spin tip="正在加载图片">
              <div className="erp-task-product-image__loading" />
            </Spin>
          )}
        </Modal>
      ) : null}
    </>
  )
}

export default function WorkflowTaskProductImage({
  item = {},
  preview = false,
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
        data-image-state="empty"
      >
        <ImagePlaceholder item={item} />
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
