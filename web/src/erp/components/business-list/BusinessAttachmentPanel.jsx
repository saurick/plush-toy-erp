import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Button,
  Input,
  List,
  Modal,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PaperClipOutlined,
  RedoOutlined,
  StopOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import {
  downloadBusinessAttachment,
  listBusinessAttachments,
  uploadBusinessAttachment,
  withdrawBusinessAttachment,
} from '../../api/attachmentApi.mjs'
import {
  isBusinessAttachmentWithdrawn,
  normalizeBusinessAttachmentWithdrawalReason,
  resolveBusinessAttachmentAuditMeta,
  resolveBusinessAttachmentWithdrawalMeta,
} from '../../utils/businessAttachmentPresentation.mjs'
import { settleBusinessAttachmentBatchUpload } from '../../utils/businessAttachmentBatchUpload.mjs'
import { resolveBusinessAttachmentPanelState } from '../../utils/businessAttachmentPanelState.mjs'
import { PRINT_APPENDIX_ATTACHMENT_TYPE } from '../../utils/businessAttachmentPrintAppendix.mjs'
import { isMutationResultUnknown } from '../../utils/sourceDocumentMutation.mjs'

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

const PRINT_APPENDIX_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])
const PRINT_APPENDIX_ACCEPT = [...PRINT_APPENDIX_MIME_TYPES].join(',')

let pendingAttachmentID = 0
let attachmentPanelMessageID = 0

function createPendingAttachmentID() {
  pendingAttachmentID += 1
  return `pending-${Date.now()}-${pendingAttachmentID}`
}

function createAttachmentPanelMessageKey() {
  attachmentPanelMessageID += 1
  return `business-attachment-panel-${attachmentPanelMessageID}`
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

function createUploadIssueItems(failed, targetOwnerId) {
  return failed.map(({ item, error }) => {
    const resultUnconfirmed = isMutationResultUnknown(error)
    return {
      ...item,
      upload_status: resultUnconfirmed ? 'unconfirmed' : 'failed',
      upload_error: resultUnconfirmed
        ? '上传结果尚未确认，请刷新附件列表核对，不要直接重试'
        : getActionErrorMessage(error, '上传该附件'),
      retry_owner_id: targetOwnerId,
    }
  })
}

function createBatchRetryState({
  targetOwnerId,
  totalCount,
  succeededCount,
  issueItems,
}) {
  return {
    targetOwnerId,
    totalCount,
    succeededCount,
    retryableItems: issueItems.filter(
      (item) => item.upload_status === 'failed'
    ),
    unconfirmedItems: issueItems.filter(
      (item) => item.upload_status === 'unconfirmed'
    ),
  }
}

function SavedAttachmentAuditMeta({ item }) {
  const { uploaderLabel, uploadedAtLabel } =
    resolveBusinessAttachmentAuditMeta(item)
  const {
    withdrawn,
    withdrawerLabel,
    withdrawnAtLabel,
    withdrawalReasonLabel,
  } = resolveBusinessAttachmentWithdrawalMeta(item)

  return (
    <>
      <Typography.Text type="secondary" title={uploaderLabel}>
        {uploaderLabel}
      </Typography.Text>
      <Typography.Text type="secondary" title={uploadedAtLabel}>
        {uploadedAtLabel}
      </Typography.Text>
      {withdrawn ? (
        <>
          <Tag color="error">已撤销</Tag>
          <Typography.Text type="secondary" title={withdrawerLabel}>
            {withdrawerLabel}
          </Typography.Text>
          <Typography.Text type="secondary" title={withdrawnAtLabel}>
            {withdrawnAtLabel}
          </Typography.Text>
          <Typography.Text
            type="secondary"
            title={withdrawalReasonLabel}
            style={{ overflowWrap: 'anywhere' }}
          >
            {withdrawalReasonLabel}
          </Typography.Text>
        </>
      ) : null}
    </>
  )
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
      canWithdraw = false,
      className = '',
      variant = 'section',
      allowPendingAttachmentsWithoutOwner = true,
      enablePrintAppendixUpload = false,
      missingOwnerDescription,
      missingOwnerEmptyText,
    },
    ref
  ) => {
    const inputRef = useRef(null)
    const printAppendixInputRef = useRef(null)
    const withdrawalReasonRef = useRef(null)
    const pendingAttachmentsRef = useRef([])
    const batchRetryResolveRef = useRef(null)
    const [attachments, setAttachments] = useState([])
    const [pendingAttachments, setPendingAttachments] = useState([])
    const [batchRetryState, setBatchRetryState] = useState(null)
    const [uploadMessageKey] = useState(createAttachmentPanelMessageKey)
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [previewing, setPreviewing] = useState(false)
    const [previewAttachment, setPreviewAttachment] = useState(null)
    const [withdrawalTarget, setWithdrawalTarget] = useState(null)
    const [withdrawalReason, setWithdrawalReason] = useState('')
    const [withdrawing, setWithdrawing] = useState(false)

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
    const retryablePendingAttachments = useMemo(
      () =>
        pendingAttachments.filter((item) => item.upload_status === 'failed'),
      [pendingAttachments]
    )
    const batchIssueItems = useMemo(
      () => [
        ...(batchRetryState?.retryableItems || []),
        ...(batchRetryState?.unconfirmedItems || []),
      ],
      [batchRetryState]
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

    useEffect(
      () => () => {
        const resolve = batchRetryResolveRef.current
        batchRetryResolveRef.current = null
        resolve?.(false)
      },
      []
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
        return uploadBusinessAttachment({
          owner_type: ownerType,
          owner_id: targetOwnerId,
          attachment_type: item.attachment_type || attachmentType,
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

    const settlePreparedAttachments = useCallback(
      (items, targetOwnerId) =>
        settleBusinessAttachmentBatchUpload(items, (item) =>
          uploadPreparedAttachment(item, targetOwnerId)
        ),
      [uploadPreparedAttachment]
    )

    const replacePendingUploadItems = useCallback(
      (attemptedItems, issueItems) => {
        const attemptedUIDs = new Set(
          attemptedItems.map((item) => String(item.uid || ''))
        )
        setPendingAttachments((current) => {
          const next = [
            ...current.filter(
              (item) => !attemptedUIDs.has(String(item.uid || ''))
            ),
            ...issueItems,
          ]
          pendingAttachmentsRef.current = next
          return next
        })
      },
      []
    )

    const resolveBatchRetryDecision = useCallback((value) => {
      const resolve = batchRetryResolveRef.current
      batchRetryResolveRef.current = null
      setBatchRetryState(null)
      resolve?.(value)
    }, [])

    const clearPendingAttachments = useCallback(() => {
      pendingAttachmentsRef.current = []
      setPendingAttachments([])
      resolveBatchRetryDecision(false)
    }, [resolveBatchRetryDecision])

    const waitForBatchRetryDecision = useCallback((nextState) => {
      const previousResolve = batchRetryResolveRef.current
      batchRetryResolveRef.current = null
      previousResolve?.(false)
      setBatchRetryState(nextState)
      return new Promise((resolve) => {
        batchRetryResolveRef.current = resolve
      })
    }, [])

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
          message.destroy(uploadMessageKey)
          setUploading(true)
          let result
          let issueItems = []
          try {
            result = await settlePreparedAttachments(items, targetOwnerId)
            issueItems = createUploadIssueItems(result.failed, targetOwnerId)
            replacePendingUploadItems(items, issueItems)
            if (
              result.succeeded.length > 0 ||
              issueItems.some((item) => item.upload_status === 'unconfirmed')
            ) {
              await reload(targetOwnerId)
            }
          } finally {
            setUploading(false)
          }

          if (result.failed.length <= 0) {
            return true
          }

          return waitForBatchRetryDecision(
            createBatchRetryState({
              targetOwnerId,
              totalCount: items.length,
              succeededCount: result.succeeded.length,
              issueItems,
            })
          )
        },
      }),
      [
        clearPendingAttachments,
        normalizedOwnerId,
        ownerType,
        reload,
        replacePendingUploadItems,
        settlePreparedAttachments,
        uploadMessageKey,
        waitForBatchRetryDecision,
      ]
    )

    async function handleFileChange(
      event,
      requestedAttachmentType = attachmentType
    ) {
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
        } else if (
          requestedAttachmentType === PRINT_APPENDIX_ATTACHMENT_TYPE &&
          !PRINT_APPENDIX_MIME_TYPES.has(mimeType)
        ) {
          message.warning(
            `${file.name} 不是可打印的合同附图，请选择 PNG、JPEG、WEBP 或 GIF`
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

      message.destroy(uploadMessageKey)
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
            attachment_type: requestedAttachmentType,
          })
        }

        if (missingOwner && canQueuePending) {
          setPendingAttachments((current) => {
            const next = [...current, ...preparedItems]
            pendingAttachmentsRef.current = next
            return next
          })
          message.success({
            key: uploadMessageKey,
            content:
              preparedItems.length > 1
                ? `${preparedItems.length} 个附件将在保存后上传`
                : '附件将在保存后上传',
          })
          return
        }
        if (missingOwner) {
          message.warning(missingOwnerDescription || '请先选择业务记录')
          return
        }

        const result = await settlePreparedAttachments(
          preparedItems,
          normalizedOwnerId
        )
        const issueItems = createUploadIssueItems(
          result.failed,
          normalizedOwnerId
        )
        replacePendingUploadItems(preparedItems, issueItems)
        if (result.failed.length > 0) {
          if (
            result.succeeded.length > 0 ||
            issueItems.some((item) => item.upload_status === 'unconfirmed')
          ) {
            await reload(normalizedOwnerId)
          }
          setBatchRetryState(
            createBatchRetryState({
              targetOwnerId: normalizedOwnerId,
              totalCount: preparedItems.length,
              succeededCount: result.succeeded.length,
              issueItems,
            })
          )
          return
        }
        message.success({
          key: uploadMessageKey,
          content:
            preparedItems.length > 1
              ? `${preparedItems.length} 个附件已上传`
              : '附件已上传',
        })
        await reload(normalizedOwnerId)
      } catch (error) {
        message.error(getActionErrorMessage(error, '上传业务附件'))
      } finally {
        setUploading(false)
      }
    }

    const handleBatchRetry = useCallback(async () => {
      const current = batchRetryState
      if (!current || current.retryableItems.length <= 0) return

      setUploading(true)
      let result
      let issueItems = []
      try {
        result = await settlePreparedAttachments(
          current.retryableItems,
          current.targetOwnerId
        )
        issueItems = createUploadIssueItems(
          result.failed,
          current.targetOwnerId
        )
        replacePendingUploadItems(current.retryableItems, issueItems)
        if (
          result.succeeded.length > 0 ||
          issueItems.some((item) => item.upload_status === 'unconfirmed')
        ) {
          await reload(current.targetOwnerId)
        }
      } finally {
        setUploading(false)
      }

      const nextIssueItems = [...current.unconfirmedItems, ...issueItems]
      const nextSucceededCount =
        current.succeededCount + result.succeeded.length
      if (nextIssueItems.length <= 0) {
        if (!batchRetryResolveRef.current) {
          message.success({
            key: uploadMessageKey,
            content:
              current.totalCount > 1
                ? `${current.totalCount} 个附件均已上传`
                : '附件已上传',
          })
        }
        resolveBatchRetryDecision(true)
        return
      }

      setBatchRetryState(
        createBatchRetryState({
          targetOwnerId: current.targetOwnerId,
          totalCount: current.totalCount,
          succeededCount: nextSucceededCount,
          issueItems: nextIssueItems,
        })
      )
    }, [
      batchRetryState,
      reload,
      replacePendingUploadItems,
      resolveBatchRetryDecision,
      settlePreparedAttachments,
      uploadMessageKey,
    ])

    const handleDeferBatchRetry = useCallback(() => {
      const waitingForSavedRecord = Boolean(batchRetryResolveRef.current)
      if ((batchRetryState?.unconfirmedItems || []).length > 0) {
        message.warning({
          key: uploadMessageKey,
          content: '请刷新附件列表核对结果，确认未上传后再重新选择',
        })
      } else if (waitingForSavedRecord) {
        message.info({
          key: uploadMessageKey,
          content: '业务记录已保存，失败附件尚未绑定，请稍后重新处理',
        })
      } else {
        message.info({
          key: uploadMessageKey,
          content: '失败附件已保留在当前列表，可稍后重试',
        })
      }
      resolveBatchRetryDecision(false)
    }, [batchRetryState, resolveBatchRetryDecision, uploadMessageKey])

    async function handleRetryPendingAttachments(items) {
      const retryItems = items.filter((item) => item.upload_status === 'failed')
      if (retryItems.length <= 0) return
      const targetOwnerId = Number(
        retryItems[0]?.retry_owner_id || normalizedOwnerId || 0
      )
      const hasMixedOwner = retryItems.some(
        (item) => Number(item.retry_owner_id || targetOwnerId) !== targetOwnerId
      )
      if (
        !ownerType ||
        targetOwnerId <= 0 ||
        hasMixedOwner ||
        targetOwnerId !== normalizedOwnerId
      ) {
        message.warning('当前业务记录已切换，请重新选择需要上传的附件')
        return
      }

      setUploading(true)
      let result
      let issueItems = []
      try {
        result = await settlePreparedAttachments(retryItems, targetOwnerId)
        issueItems = createUploadIssueItems(result.failed, targetOwnerId)
        replacePendingUploadItems(retryItems, issueItems)
        if (
          result.succeeded.length > 0 ||
          issueItems.some((item) => item.upload_status === 'unconfirmed')
        ) {
          await reload(targetOwnerId)
        }
      } finally {
        setUploading(false)
      }

      if (result.failed.length <= 0) {
        message.success({
          key: uploadMessageKey,
          content:
            result.succeeded.length > 1
              ? `${result.succeeded.length} 个失败附件已重新上传`
              : '附件已重新上传',
        })
        return
      }
      message.warning({
        key: uploadMessageKey,
        content:
          result.succeeded.length > 0
            ? `本次成功 ${result.succeeded.length} 个，仍有 ${result.failed.length} 个未完成`
            : `${result.failed.length} 个附件仍未完成，请查看逐项结果`,
      })
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
      setPendingAttachments((current) => {
        const next = current.filter((entry) => entry.uid !== item.uid)
        pendingAttachmentsRef.current = next
        return next
      })
    }

    function openWithdrawal(item) {
      setWithdrawalTarget(item)
      setWithdrawalReason('')
    }

    const closeWithdrawal = useCallback(() => {
      if (withdrawing) return
      setWithdrawalTarget(null)
      setWithdrawalReason('')
    }, [withdrawing])

    const handleConfirmWithdrawal = useCallback(async () => {
      const normalized =
        normalizeBusinessAttachmentWithdrawalReason(withdrawalReason)
      if (!normalized.valid) {
        message.warning(
          normalized.length <= 0
            ? '请填写撤销原因'
            : '撤销原因最多填写 255 个字'
        )
        withdrawalReasonRef.current?.focus()
        return
      }
      if (!withdrawalTarget?.id) return

      setWithdrawing(true)
      try {
        const nextItem = await withdrawBusinessAttachment({
          id: withdrawalTarget.id,
          reason: normalized.reason,
          ...(ownerType === 'workflow_task'
            ? { expected_version: Number(ownerVersion || 0) }
            : {}),
        })
        if (nextItem?.id) {
          setAttachments((current) =>
            current.map((item) =>
              Number(item.id) === Number(nextItem.id) ? nextItem : item
            )
          )
        } else {
          await reload(normalizedOwnerId)
        }
        message.success('附件已撤销，撤销记录已保留')
        setWithdrawalTarget(null)
        setWithdrawalReason('')
      } catch (error) {
        message.error(getActionErrorMessage(error, '撤销业务附件'))
      } finally {
        setWithdrawing(false)
      }
    }, [
      normalizedOwnerId,
      ownerType,
      ownerVersion,
      reload,
      withdrawalReason,
      withdrawalTarget,
    ])

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

    function renderWithdrawalAction(item) {
      if (!canWithdraw) return null
      const withdrawn = isBusinessAttachmentWithdrawn(item)
      const button = (
        <Button
          key="withdraw"
          danger
          type="link"
          size="small"
          aria-label="撤销附件"
          icon={<StopOutlined />}
          disabled={withdrawn}
          onClick={() => openWithdrawal(item)}
        >
          撤销附件
        </Button>
      )
      if (!withdrawn) return button
      return (
        <Tooltip key="withdraw" title="该附件已撤销，不能重复撤销">
          <span>{button}</span>
        </Tooltip>
      )
    }

    function renderAttachmentActions(item) {
      if (item.__kind === 'pending') {
        return [
          renderPreviewAction(item),
          item.upload_status === 'failed' ? (
            <Button
              key="retry-pending"
              type="link"
              size="small"
              aria-label={`重试附件 ${item.file_name}`}
              icon={<RedoOutlined />}
              disabled={uploading}
              onClick={() => handleRetryPendingAttachments([item])}
            >
              重试
            </Button>
          ) : null,
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
      }
      if (isBusinessAttachmentWithdrawn(item)) {
        return [renderWithdrawalAction(item)].filter(Boolean)
      }
      return [
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
        renderWithdrawalAction(item),
      ].filter(Boolean)
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
          {canUpload ? (
            <>
              <Space wrap>
                {retryablePendingAttachments.length > 1 ? (
                  <Button
                    icon={<RedoOutlined />}
                    loading={uploading}
                    disabled={uploading}
                    onClick={() =>
                      handleRetryPendingAttachments(retryablePendingAttachments)
                    }
                  >
                    重试失败项（{retryablePendingAttachments.length}）
                  </Button>
                ) : null}
                {enablePrintAppendixUpload ? (
                  <Button
                    icon={<UploadOutlined />}
                    loading={uploading}
                    disabled={uploadDisabled}
                    onClick={() => printAppendixInputRef.current?.click()}
                  >
                    选择合同附图
                  </Button>
                ) : null}
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  loading={uploading}
                  disabled={uploadDisabled}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploadButtonText}
                </Button>
              </Space>
              <input
                ref={inputRef}
                hidden
                multiple
                type="file"
                accept={ACCEPTED_ATTACHMENT_TYPES}
                onChange={handleFileChange}
              />
              {enablePrintAppendixUpload ? (
                <input
                  ref={printAppendixInputRef}
                  hidden
                  multiple
                  type="file"
                  accept={PRINT_APPENDIX_ACCEPT}
                  onChange={(event) =>
                    handleFileChange(event, PRINT_APPENDIX_ATTACHMENT_TYPE)
                  }
                />
              ) : null}
            </>
          ) : null}
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
            <List.Item actions={renderAttachmentActions(item)}>
              <List.Item.Meta
                avatar={<PaperClipOutlined />}
                title={item.file_name}
                description={
                  <Space size={6} wrap>
                    <Tag>{formatFileSize(item.file_size)}</Tag>
                    {item.attachment_type === PRINT_APPENDIX_ATTACHMENT_TYPE ? (
                      <Tag color="purple">合同附图</Tag>
                    ) : null}
                    {item.__kind === 'pending' ? (
                      <>
                        <Tag
                          color={
                            item.upload_status === 'failed' ||
                            item.upload_status === 'unconfirmed'
                              ? 'error'
                              : 'blue'
                          }
                        >
                          {item.upload_status === 'failed'
                            ? '上传失败'
                            : item.upload_status === 'unconfirmed'
                              ? '结果待确认'
                              : '保存后上传'}
                        </Tag>
                        {item.upload_error ? (
                          <Typography.Text
                            type="danger"
                            title={item.upload_error}
                            style={{ overflowWrap: 'anywhere' }}
                          >
                            {item.upload_error}
                          </Typography.Text>
                        ) : null}
                      </>
                    ) : (
                      <SavedAttachmentAuditMeta item={item} />
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
        <Modal
          centered
          destroyOnHidden
          open={Boolean(batchRetryState)}
          title="部分附件上传失败"
          okText={`重试失败项（${batchRetryState?.retryableItems.length || 0}）`}
          cancelText={
            (batchRetryState?.unconfirmedItems.length || 0) > 0
              ? '稍后核对'
              : '稍后处理'
          }
          confirmLoading={uploading}
          okButtonProps={{
            icon: <RedoOutlined />,
            disabled:
              uploading || (batchRetryState?.retryableItems.length || 0) <= 0,
          }}
          maskClosable={false}
          keyboard={!uploading}
          closable={!uploading}
          onCancel={handleDeferBatchRetry}
          onOk={handleBatchRetry}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Paragraph type="secondary">
              本轮共 {batchRetryState?.totalCount || 0} 个附件，已成功{' '}
              {batchRetryState?.succeededCount || 0} 个，未完成{' '}
              {batchIssueItems.length} 个。成功项已经保留，重试时不会重复上传。
            </Typography.Paragraph>
            {(batchRetryState?.unconfirmedItems.length || 0) > 0 ? (
              <Typography.Paragraph type="warning">
                “结果待确认”表示服务端可能已经收到文件。请先刷新附件列表核对，避免直接重试产生重复附件。
              </Typography.Paragraph>
            ) : null}
            <List
              size="small"
              dataSource={batchIssueItems}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={item.file_name}
                    description={
                      <Space size={6} wrap>
                        <Tag
                          color={
                            item.upload_status === 'unconfirmed'
                              ? 'warning'
                              : 'error'
                          }
                        >
                          {item.upload_status === 'unconfirmed'
                            ? '结果待确认'
                            : '上传失败'}
                        </Tag>
                        <Typography.Text
                          type="secondary"
                          style={{ overflowWrap: 'anywhere' }}
                        >
                          {item.upload_error}
                        </Typography.Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Space>
        </Modal>
        <Modal
          centered
          destroyOnHidden
          open={Boolean(withdrawalTarget)}
          title="撤销附件"
          okText="确认撤销"
          cancelText="取消"
          confirmLoading={withdrawing}
          okButtonProps={{ danger: true }}
          maskClosable={!withdrawing}
          keyboard={!withdrawing}
          onCancel={closeWithdrawal}
          onOk={handleConfirmWithdrawal}
          afterOpenChange={(nextOpen) => {
            if (nextOpen) withdrawalReasonRef.current?.focus()
          }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Paragraph type="secondary">
              撤销后不能再预览或下载；文件名、上传记录和撤销原因会继续保留。你可以另行上传正确附件。
            </Typography.Paragraph>
            <Typography.Text strong>
              {withdrawalTarget?.file_name || '当前附件'}
            </Typography.Text>
            <Input.TextArea
              ref={withdrawalReasonRef}
              aria-label="撤销原因"
              value={withdrawalReason}
              maxLength={255}
              showCount
              autoSize={{ minRows: 3, maxRows: 6 }}
              placeholder="请说明为什么撤销，例如：上传了错误版本"
              onChange={(event) => setWithdrawalReason(event.target.value)}
            />
          </Space>
        </Modal>
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
