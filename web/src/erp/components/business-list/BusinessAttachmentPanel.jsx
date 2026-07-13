import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button, List, Modal, Space, Tag, Typography } from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PaperClipOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import {
  downloadBusinessAttachment,
  listBusinessAttachments,
  uploadBusinessAttachment,
} from '../../api/attachmentApi.mjs'
import { resolveBusinessAttachmentPanelState } from '../../utils/businessAttachmentPanelState.mjs'

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
const MAX_ATTACHMENT_SIZE_LABEL = '5MB'

const ACCEPTED_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.ms-outlook',
  'message/rfc822',
  'application/x-wps-writer',
  'application/x-wps-spreadsheet',
  'application/x-wps-presentation',
  'text/csv',
  'text/plain',
])

const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  '.csv',
  '.doc',
  '.docx',
  '.dps',
  '.eml',
  '.et',
  '.gif',
  '.heic',
  '.heif',
  '.jpeg',
  '.jpg',
  '.msg',
  '.pdf',
  '.png',
  '.txt',
  '.webp',
  '.wps',
  '.xls',
  '.xlsx',
  '.zip',
]

const ATTACHMENT_EXTENSION_MIME_TYPES = new Map([
  ['.csv', 'text/csv'],
  ['.doc', 'application/msword'],
  [
    '.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  ['.dps', 'application/x-wps-presentation'],
  ['.eml', 'message/rfc822'],
  ['.et', 'application/x-wps-spreadsheet'],
  ['.gif', 'image/gif'],
  ['.heic', 'image/heic'],
  ['.heif', 'image/heif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.msg', 'application/vnd.ms-outlook'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.txt', 'text/plain'],
  ['.webp', 'image/webp'],
  ['.wps', 'application/x-wps-writer'],
  ['.xls', 'application/vnd.ms-excel'],
  [
    '.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  ['.zip', 'application/zip'],
])

const PREVIEWABLE_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const ACCEPTED_ATTACHMENT_TYPES = [
  ...ACCEPTED_ATTACHMENT_MIME_TYPES,
  ...ACCEPTED_ATTACHMENT_EXTENSIONS,
].join(',')

let pendingAttachmentID = 0

function createPendingAttachmentID() {
  pendingAttachmentID += 1
  return `pending-${Date.now()}-${pendingAttachmentID}`
}

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
  const name = String(file?.name || '').toLowerCase()
  const matchedExtension = ACCEPTED_ATTACHMENT_EXTENSIONS.find((extension) =>
    name.endsWith(extension)
  )
  const extensionMimeType =
    ATTACHMENT_EXTENSION_MIME_TYPES.get(matchedExtension)
  const fileMimeType = String(file?.type || '').toLowerCase()
  if (
    matchedExtension === '.zip' &&
    fileMimeType === 'application/x-zip-compressed'
  ) {
    return fileMimeType
  }
  if (extensionMimeType) {
    return extensionMimeType
  }
  return fileMimeType || extensionMimeType || 'application/octet-stream'
}

function base64ToBlob(attachment) {
  const binary = atob(String(attachment?.content_base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], {
    type: attachment?.mime_type || 'application/octet-stream',
  })
}

function createAttachmentObjectURL(attachment) {
  return URL.createObjectURL(base64ToBlob(attachment))
}

function downloadBlob(attachment) {
  const url = createAttachmentObjectURL(attachment)
  const link = document.createElement('a')
  link.href = url
  link.download = attachment?.file_name || 'attachment'
  link.click()
  URL.revokeObjectURL(url)
}

function isPreviewableAttachment(item) {
  const mimeType = String(item?.mime_type || '').toLowerCase()
  return PREVIEWABLE_ATTACHMENT_MIME_TYPES.has(mimeType)
}

const BusinessAttachmentPanel = forwardRef(
  (
    {
      ownerType,
      ownerId,
      ownerVersion,
      title = '业务附件',
      description = '上传合同、图片、单据或确认资料；附件仅作为业务证据，不改变对应业务状态。',
      attachmentType = 'evidence',
      slotKey,
      canUpload = true,
      className = '',
      variant = 'section',
      allowPendingAttachmentsWithoutOwner = true,
      missingOwnerDescription,
      missingOwnerEmptyText,
    },
    ref
  ) => {
    const inputRef = useRef(null)
    const pendingAttachmentsRef = useRef([])
    const [attachments, setAttachments] = useState([])
    const [pendingAttachments, setPendingAttachments] = useState([])
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [previewing, setPreviewing] = useState(false)
    const [previewAttachment, setPreviewAttachment] = useState(null)

    const {
      normalizedOwnerId,
      missingOwner,
      canQueuePending,
      uploadDisabled,
      panelDescription,
      emptyDescription,
      uploadButtonText,
    } = resolveBusinessAttachmentPanelState({
      ownerType,
      ownerId,
      canUpload,
      uploading,
      description,
      allowPendingAttachmentsWithoutOwner,
      missingOwnerDescription,
      missingOwnerEmptyText,
    })

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
    const listItems = useMemo(
      () => [
        ...attachments.map((item) => ({ ...item, __kind: 'saved' })),
        ...pendingAttachments.map((item) => ({ ...item, __kind: 'pending' })),
      ],
      [attachments, pendingAttachments]
    )

    useEffect(() => {
      pendingAttachmentsRef.current = pendingAttachments
    }, [pendingAttachments])

    useEffect(
      () => () => {
        if (previewAttachment?.url) {
          URL.revokeObjectURL(previewAttachment.url)
        }
      },
      [previewAttachment]
    )

    const reload = useCallback(
      async (nextOwnerId = normalizedOwnerId) => {
        const targetOwnerId = Number(nextOwnerId || 0)
        if (!ownerType || targetOwnerId <= 0) {
          setAttachments([])
          return
        }
        setLoading(true)
        try {
          const nextItems = await listBusinessAttachments({
            owner_type: ownerType,
            owner_id: targetOwnerId,
          })
          setAttachments(Array.isArray(nextItems) ? nextItems : [])
        } catch (error) {
          message.error(getActionErrorMessage(error, '加载业务附件'))
        } finally {
          setLoading(false)
        }
      },
      [normalizedOwnerId, ownerType]
    )

    useEffect(() => {
      reload()
    }, [reload])

    const uploadPreparedAttachment = useCallback(
      async (item, targetOwnerId) => {
        await uploadBusinessAttachment({
          owner_type: ownerType,
          owner_id: targetOwnerId,
          attachment_type: attachmentType,
          slot_key: slotKey,
          file_name: item.file_name,
          mime_type: item.mime_type,
          file_size: item.file_size,
          content_base64: item.content_base64,
          ...(ownerType === 'workflow_task'
            ? { expected_version: Number(ownerVersion || 0) }
            : {}),
        })
      },
      [attachmentType, ownerType, ownerVersion, slotKey]
    )

    function clearPendingAttachments() {
      setPendingAttachments([])
    }

    useImperativeHandle(
      ref,
      () => ({
        clearPendingAttachments,
        hasPendingAttachments: () => pendingAttachmentsRef.current.length > 0,
        async flushPendingAttachments(nextOwnerId = normalizedOwnerId) {
          const targetOwnerId = Number(nextOwnerId || 0)
          const items = pendingAttachmentsRef.current
          if (items.length <= 0) return true
          if (!ownerType || targetOwnerId <= 0) {
            message.warning('业务记录保存后才能绑定附件')
            return false
          }
          setUploading(true)
          let uploadedCount = 0
          try {
            for (const item of items) {
              await uploadPreparedAttachment(item, targetOwnerId)
              uploadedCount += 1
              setPendingAttachments((current) =>
                current.filter((entry) => entry.uid !== item.uid)
              )
            }
            message.success(
              uploadedCount > 1
                ? `${uploadedCount} 个附件已随记录保存`
                : '附件已随记录保存'
            )
            await reload(targetOwnerId)
            return true
          } catch (error) {
            message.error(getActionErrorMessage(error, '上传待保存附件'))
            return false
          } finally {
            setUploading(false)
          }
        },
      }),
      [normalizedOwnerId, ownerType, reload, uploadPreparedAttachment]
    )

    async function handleFileChange(event) {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      if (files.length <= 0) return

      const validFiles = []
      for (const file of files) {
        const mimeType = inferMimeType(file)
        if (file.size > MAX_ATTACHMENT_SIZE) {
          message.warning(
            `${file.name} 超过 ${MAX_ATTACHMENT_SIZE_LABEL}，请压缩后再上传`
          )
        } else if (!ACCEPTED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
          message.warning(`${file.name} 格式暂不支持，请转换后再上传`)
        } else {
          validFiles.push(file)
        }
      }
      if (validFiles.length <= 0) {
        return
      }

      setUploading(true)
      try {
        const preparedItems = []
        for (const file of validFiles) {
          preparedItems.push({
            uid: createPendingAttachmentID(),
            file_name: file.name,
            mime_type: inferMimeType(file),
            file_size: file.size,
            content_base64: await readFileAsBase64(file),
          })
        }

        if (missingOwner && canQueuePending) {
          setPendingAttachments((current) => [...current, ...preparedItems])
          message.success(
            preparedItems.length > 1
              ? `${preparedItems.length} 个附件将在保存后上传`
              : '附件将在保存后上传'
          )
          return
        }
        if (missingOwner) {
          message.warning(missingOwnerDescription || '请先选择业务记录')
          return
        }

        for (const item of preparedItems) {
          await uploadPreparedAttachment(item, normalizedOwnerId)
        }
        message.success(
          preparedItems.length > 1
            ? `${preparedItems.length} 个附件已上传`
            : '附件已上传'
        )
        await reload(normalizedOwnerId)
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

    async function handlePreview(item) {
      if (!isPreviewableAttachment(item)) {
        message.info('当前附件类型请下载后查看')
        return
      }

      setPreviewing(true)
      try {
        const attachment =
          item.__kind === 'pending'
            ? item
            : await downloadBusinessAttachment({ id: item.id })
        if (!attachment?.content_base64) {
          message.warning('附件内容为空，无法预览')
          return
        }
        const nextPreview = {
          file_name: attachment.file_name || item.file_name || '附件预览',
          mime_type: attachment.mime_type || item.mime_type || '',
          url: createAttachmentObjectURL(attachment),
        }
        setPreviewAttachment((current) => {
          if (current?.url) {
            URL.revokeObjectURL(current.url)
          }
          return nextPreview
        })
      } catch (error) {
        message.error(getActionErrorMessage(error, '预览业务附件'))
      } finally {
        setPreviewing(false)
      }
    }

    function handleRemovePending(item) {
      setPendingAttachments((current) =>
        current.filter((entry) => entry.uid !== item.uid)
      )
    }

    const handleClosePreview = useCallback(() => {
      setPreviewAttachment((current) => {
        if (current?.url) {
          URL.revokeObjectURL(current.url)
        }
        return null
      })
    }, [])

    function renderPreviewAction(item) {
      if (!isPreviewableAttachment(item)) return null
      return (
        <Button
          key="preview"
          type="link"
          size="small"
          aria-label="预览附件"
          icon={<EyeOutlined />}
          loading={previewing}
          onClick={() => handlePreview(item)}
        >
          预览
        </Button>
      )
    }

    return (
      <section className={containerClassName}>
        <div className="business-attachment-panel__header">
          <div>
            <Typography.Text strong>{title}</Typography.Text>
            <Typography.Paragraph type="secondary">
              {panelDescription}
            </Typography.Paragraph>
          </div>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={uploading}
            disabled={uploadDisabled}
            onClick={() => inputRef.current?.click()}
          >
            {uploadButtonText}
          </Button>
          <input
            ref={inputRef}
            hidden
            multiple
            type="file"
            accept={ACCEPTED_ATTACHMENT_TYPES}
            onChange={handleFileChange}
          />
        </div>
        <List
          size="small"
          loading={loading}
          dataSource={listItems}
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
              actions={
                item.__kind === 'pending'
                  ? [
                      renderPreviewAction(item),
                    <Button
                      key="remove-pending"
                      danger
                      type="link"
                      size="small"
                      aria-label="移除待上传附件"
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemovePending(item)}
                    >
                      移除
                    </Button>,
                    ].filter(Boolean)
                  : [
                      renderPreviewAction(item),
                    <Button
                      key="download"
                      type="link"
                      size="small"
                      aria-label="下载附件"
                      icon={<DownloadOutlined />}
                      onClick={() => handleDownload(item)}
                    >
                      下载
                    </Button>,
                    ].filter(Boolean)
              }
            >
              <List.Item.Meta
                avatar={<PaperClipOutlined />}
                title={item.file_name}
                description={
                  <Space size={6} wrap>
                    <Tag>{formatFileSize(item.file_size)}</Tag>
                    {item.__kind === 'pending' ? (
                      <Tag color="blue">保存后上传</Tag>
                    ) : null}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
        <Modal
          open={Boolean(previewAttachment)}
          title={previewAttachment?.file_name || '附件预览'}
          footer={null}
          width="min(960px, calc(100vw - 48px))"
          destroyOnHidden
          onCancel={handleClosePreview}
        >
          {previewAttachment?.mime_type === 'application/pdf' ? (
            <iframe
              title={previewAttachment.file_name || 'PDF 附件预览'}
              className="business-attachment-panel__preview-frame"
              src={previewAttachment.url}
            />
          ) : (
            <div className="business-attachment-panel__preview-image-wrap">
              <img
                className="business-attachment-panel__preview-image"
                src={previewAttachment?.url}
                alt={previewAttachment?.file_name || '附件预览'}
              />
            </div>
          )}
        </Modal>
      </section>
    )
  }
)

export default BusinessAttachmentPanel
