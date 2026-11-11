import React from 'react'
import { InboxOutlined, PictureOutlined } from '@ant-design/icons'
import './workflowTaskIdentity.css'

export function ImagePlaceholder({ item = {}, state = 'empty' }) {
  const material = item.kind === 'material'
  const Icon = material ? InboxOutlined : PictureOutlined
  const [label, detail] = ({
    album: ['查看产品图', '可查看产品图片'],
    denied: ['无权限', '无图片读取权限'],
    failed: ['加载失败', '图片暂不可用'],
    loading: ['加载中', '图片加载中'],
    unlinked: ['未关联产品', '仅有款式资料，未关联产品档案'],
  })[state] || (material ? ['物料', '材料记录'] : ['暂无图', '暂无可显示的图片'])
  const description = `${item.name || (material ? '物料' : '产品')}：${detail}`
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
