import React from 'react'
import { InboxOutlined, PictureOutlined } from '@ant-design/icons'
import './workflowTaskIdentity.css'

export function ImagePlaceholder({ item = {}, state = 'empty' }) {
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

export default function WorkflowTaskImagePlaceholder({ item = {}, state = 'empty' }) {
  return (
    <span
      className="erp-task-product-image erp-task-product-image--placeholder"
      data-image-state={state}
    >
      <ImagePlaceholder item={item} state={state} />
    </span>
  )
}
