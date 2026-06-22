import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, List, Popconfirm, Space, Tag, Typography } from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  PaperClipOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import {
  deleteBusinessAttachment,
  downloadBusinessAttachment,
  listBusinessAttachments,
  uploadBusinessAttachment,
} from '../../api/attachmentApi.mjs'

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024

const ACCEPTED_ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/plain',
].join(',')

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve(
        String(reader.result || '')
          .split(',')
          .pop()
      )
    reader.onerror = () => reject(new Error('read file failed'))
    reader.readAsDataURL(file)
  })
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function inferMimeType(file) {
  if (file?.type) return file.type
  const name = String(file?.name || '').toLowerCase()
  if (name.endsWith('.csv')) return 'text/csv'
  if (name.endsWith('.doc')) return 'application/msword'
  if (name.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (name.endsWith('.gif')) return 'image/gif'
  if (name.endsWith('.jpeg') || name.endsWith('.jpg')) return 'image/jpeg'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.txt')) return 'text/plain'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.xls')) return 'application/vnd.ms-excel'
  if (name.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return 'application/octet-stream'
}

function downloadBlob(attachment) {
  const binary = atob(String(attachment?.content_base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const blob = new Blob([bytes], {
    type: attachment?.mime_type || 'application/octet-stream',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = attachment?.file_name || 'attachment'
  link.click()
  URL.revokeObjectURL(url)
}

export default function BusinessAttachmentPanel({
  ownerType,
  ownerId,
  title = '业务附件',
  description = '上传合同、图片、单据或确认资料；附件仅作为业务证据，不改变业务事实状态。',
  attachmentType = 'evidence',
  slotKey,
  canUpload = true,
  canDelete = true,
  className = '',
  variant = 'section',
}) {
  const inputRef = useRef(null)
  const [attachments, setAttachments] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  const normalizedOwnerId = Number(ownerId || 0)
  const disabled = !ownerType || normalizedOwnerId <= 0
  const uploadDisabled = disabled || !canUpload || uploading

  const containerClassName = useMemo(
    () =>
      [
        'business-attachment-panel',
        variant === 'inline' ? 'business-attachment-panel--inline' : '',
        className,
      ]
        .filter(Boolean)
        .join(' '),
    [className, variant]
  )
  const emptyDescription = disabled ? '保存业务记录后可上传附件' : '暂无附件'

  async function reload() {
    if (disabled) {
      setAttachments([])
      return
    }
    setLoading(true)
    try {
      const nextItems = await listBusinessAttachments({
        owner_type: ownerType,
        owner_id: normalizedOwnerId,
      })
      setAttachments(Array.isArray(nextItems) ? nextItems : [])
    } catch (error) {
      message.error(getActionErrorMessage(error, '加载业务附件'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerType, normalizedOwnerId])

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_ATTACHMENT_SIZE) {
      message.warning('附件超过 5MB，请压缩后再上传')
      return
    }
    setUploading(true)
    try {
      const contentBase64 = await readFileAsBase64(file)
      await uploadBusinessAttachment({
        owner_type: ownerType,
        owner_id: normalizedOwnerId,
        attachment_type: attachmentType,
        slot_key: slotKey,
        file_name: file.name,
        mime_type: inferMimeType(file),
        file_size: file.size,
        content_base64: contentBase64,
      })
      message.success('附件已上传')
      await reload()
    } catch (error) {
      message.error(getActionErrorMessage(error, '上传业务附件'))
    } finally {
      setUploading(false)
    }
  }

  async function handleDownload(item) {
    try {
      const attachment = await downloadBusinessAttachment({ id: item.id })
      if (!attachment?.content_base64) {
        message.warning('附件内容为空，无法下载')
        return
      }
      downloadBlob(attachment)
    } catch (error) {
      message.error(getActionErrorMessage(error, '下载业务附件'))
    }
  }

  async function handleDelete(item) {
    try {
      await deleteBusinessAttachment({ id: item.id })
      message.success('附件已删除')
      await reload()
    } catch (error) {
      message.error(getActionErrorMessage(error, '删除业务附件'))
    }
  }

  return (
    <section className={containerClassName}>
      <div className="business-attachment-panel__header">
        <div>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Paragraph type="secondary">
            {disabled ? '保存业务记录后可上传附件。' : description}
          </Typography.Paragraph>
        </div>
        <Button
          type="primary"
          icon={<UploadOutlined />}
          loading={uploading}
          disabled={uploadDisabled}
          onClick={() => inputRef.current?.click()}
        >
          上传
        </Button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept={ACCEPTED_ATTACHMENT_TYPES}
          onChange={handleFileChange}
        />
      </div>
      <List
        size="small"
        loading={loading}
        dataSource={attachments}
        locale={{
          emptyText: (
            <div className="business-attachment-panel__empty">
              <PaperClipOutlined />
              <Typography.Text type="secondary">
                {emptyDescription}
              </Typography.Text>
            </div>
          ),
        }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Button
                key="download"
                type="text"
                icon={<DownloadOutlined />}
                onClick={() => handleDownload(item)}
              />,
              canDelete ? (
                <Popconfirm
                  key="delete"
                  title="删除附件"
                  description="删除后不会影响业务事实状态。"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() => handleDelete(item)}
                >
                  <Button danger type="text" icon={<DeleteOutlined />} />
                </Popconfirm>
              ) : null,
            ].filter(Boolean)}
          >
            <List.Item.Meta
              avatar={<PaperClipOutlined />}
              title={item.file_name}
              description={
                <Space size={6} wrap>
                  <Tag>{formatFileSize(item.file_size)}</Tag>
                  <Typography.Text type="secondary">
                    {item.mime_type}
                  </Typography.Text>
                </Space>
              }
            />
          </List.Item>
        )}
      />
    </section>
  )
}
