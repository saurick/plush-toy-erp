import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Alert,
  Button,
  Input,
  List,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  DownOutlined,
  DownloadOutlined,
  EyeOutlined,
  PaperClipOutlined,
  RedoOutlined,
  StopOutlined,
  UpOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented.jsx'
import BusinessAttachmentThumbnail from './BusinessAttachmentThumbnail.jsx'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import BusinessImage from './BusinessImage.jsx'
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
import {
  isBusinessAttachmentImage,
  mergeBusinessAttachmentSelection,
  resolveBusinessAttachmentPanelState,
  selectBusinessAttachmentUploadItems,
} from '../../utils/businessAttachmentPanelState.mjs'
import { PRINT_APPENDIX_ATTACHMENT_TYPE } from '../../utils/businessAttachmentPrintAppendix.mjs'
import { isMutationResultUnknown } from '../../utils/sourceDocumentMutation.mjs'
import { BusinessFormPendingAttachmentsContext } from './BusinessFormPageContext.js'

const MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024
const MAX_ATTACHMENT_SIZE_LABEL = '100MB'

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
      compact = false,
      allowPendingAttachmentsWithoutOwner = true,
      enablePrintAppendixUpload = false,
      missingOwnerDescription,
      missingOwnerEmptyText,
      onStateChange,
      onClose,
    },
    ref
  ) => {
    const contentId = useId()
    const inputRef = useRef(null)
    const printAppendixInputRef = useRef(null)
    const withdrawalReasonRef = useRef(null)
    const pendingAttachmentsRef = useRef([])
    const uploadBusyRef = useRef(false)
    const batchRetryResolveRef = useRef(null)
    const listRequestRef = useRef(0)
    const previousOwnerRef = useRef({
      ownerType,
      ownerId: Number(ownerId || 0),
    })
    const scope = `${ownerType}:${Number(ownerId || 0)}`
    const scopeRef = useRef(scope)
    const [attachments, setAttachments] = useState([])
    const [pendingAttachments, setPendingAttachments] = useState([])
    const reportPendingAttachments = useContext(
      BusinessFormPendingAttachmentsContext
    )
    const [batchRetryState, setBatchRetryState] = useState(null)
    const [uploadMessageKey] = useState(createAttachmentPanelMessageKey)
    const [loading, setLoading] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [preparing, setPreparing] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [expanded, setExpanded] = useState(false)
    useEffect(() => setExpanded(false), [scope])
    useEffect(() => {
      if (loadError || pendingAttachments.length > 0) setExpanded(true)
    }, [loadError, pendingAttachments.length])
    const [category, setCategory] = useState('all')
    const [expandedNames, setExpandedNames] = useState(new Set())
    const [dragging, setDragging] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(null)
    const [previewing, setPreviewing] = useState(false)
    const [previewAttachment, setPreviewAttachment] = useState(null)
    const [withdrawalTarget, setWithdrawalTarget] = useState(null)
    const [withdrawalReason, setWithdrawalReason] = useState('')
    const [withdrawing, setWithdrawing] = useState(false)
    useEffect(() => {
      reportPendingAttachments?.(
        pendingAttachments.length,
        uploading || preparing || withdrawing
      )
      return () => reportPendingAttachments?.(0, false)
    }, [
      pendingAttachments.length,
      preparing,
      reportPendingAttachments,
      uploading,
      withdrawing,
    ])

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
      uploading: uploading || preparing,
      description,
      allowPendingAttachmentsWithoutOwner,
      missingOwnerDescription,
      missingOwnerEmptyText,
    })

    useEffect(() => {
      onStateChange?.({
        busy: uploading || preparing || withdrawing,
        pendingCount: pendingAttachments.length,
      })
    }, [
      onStateChange,
      pendingAttachments.length,
      preparing,
      uploading,
      withdrawing,
    ])

    const containerClassName = useMemo(
      () =>
        [
          'business-attachment-panel',
          variant === 'inline' ? 'business-attachment-panel--inline' : '',
          variant === 'manager' ? 'business-attachment-panel--manager' : '',
          compact ? 'business-attachment-panel--compact' : '',
          className,
        ]
          .filter(Boolean)
          .join(' '),
      [className, compact, variant]
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
        selectBusinessAttachmentUploadItems(pendingAttachments, {
          retryOnly: true,
        }),
      [pendingAttachments]
    )
    const queuedAttachments = pendingAttachments.filter(
      (item) => !item.upload_status || item.upload_status === 'pending'
    )
    const visibleItems = listItems.filter(
      (item) =>
        category === 'all' ||
        (category === 'image') === isBusinessAttachmentImage(item)
    )
    const categoryOptions = [
      { value: 'all', label: `全部 ${listItems.length}` },
      {
        value: 'image',
        label: `图片 ${listItems.filter(isBusinessAttachmentImage).length}`,
      },
      {
        value: 'file',
        label: `文件 ${listItems.filter((item) => !isBusinessAttachmentImage(item)).length}`,
      },
    ]
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
        const request = ++listRequestRef.current
        const requestScope = scopeRef.current
        const targetOwnerId = Number(nextOwnerId || 0)
        if (!ownerType || targetOwnerId <= 0) {
          setAttachments([])
          setLoading(false)
          setLoadError('')
          return
        }
        setLoading(true)
        setLoadError('')
        try {
          const nextItems = await listBusinessAttachments({
            owner_type: ownerType,
            owner_id: targetOwnerId,
          })
          if (
            request === listRequestRef.current &&
            requestScope === scopeRef.current
          ) {
            setAttachments(Array.isArray(nextItems) ? nextItems : [])
          }
        } catch (error) {
          if (
            request === listRequestRef.current &&
            requestScope === scopeRef.current
          ) {
            setLoadError(getActionErrorMessage(error, '加载业务附件'))
          }
        } finally {
          if (
            request === listRequestRef.current &&
            requestScope === scopeRef.current
          ) {
            setLoading(false)
          }
        }
      },
      [normalizedOwnerId, ownerType]
    )

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
      async (items, targetOwnerId) => {
        let completed = 0
        setUploadProgress({ completed, total: items.length })
        try {
          return await settleBusinessAttachmentBatchUpload(
            items,
            async (item) => {
              try {
                return await uploadPreparedAttachment(item, targetOwnerId)
              } finally {
                completed += 1
                setUploadProgress({ completed, total: items.length })
              }
            }
          )
        } finally {
          setUploadProgress(null)
        }
      },
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

    useEffect(() => {
      // 先激活当前归属再加载，清理与重启必须使用同一个请求生命周期。
      scopeRef.current = scope
      const previous = previousOwnerRef.current
      if (
        previous.ownerType !== ownerType ||
        (previous.ownerId > 0 && previous.ownerId !== normalizedOwnerId)
      ) {
        clearPendingAttachments()
        setCategory('all')
        setExpandedNames(new Set())
        setPreviewAttachment(null)
        setWithdrawalTarget(null)
      }
      previousOwnerRef.current = { ownerType, ownerId: normalizedOwnerId }
      setAttachments([])
      reload()
      return () => {
        listRequestRef.current += 1
        scopeRef.current = ''
      }
    }, [clearPendingAttachments, normalizedOwnerId, ownerType, reload, scope])

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
          if (uploadBusyRef.current || uploading || preparing) return false
          const targetOwnerId = Number(nextOwnerId || 0)
          const allItems = pendingAttachmentsRef.current
          if (allItems.length <= 0) return true
          if (!canUpload) return false
          const items = selectBusinessAttachmentUploadItems(allItems)
          const unconfirmedItems = allItems.filter(
            (item) => item.upload_status === 'unconfirmed'
          )
          if (!ownerType || targetOwnerId <= 0) {
            message.warning('业务记录保存后才能绑定附件')
            return false
          }
          message.destroy(uploadMessageKey)
          uploadBusyRef.current = true
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
            uploadBusyRef.current = false
            setUploading(false)
          }

          if (result.failed.length <= 0 && unconfirmedItems.length <= 0) {
            return true
          }

          return waitForBatchRetryDecision(
            createBatchRetryState({
              targetOwnerId,
              totalCount: allItems.length,
              succeededCount: result.succeeded.length,
              issueItems: [...unconfirmedItems, ...issueItems],
            })
          )
        },
      }),
      [
        clearPendingAttachments,
        canUpload,
        normalizedOwnerId,
        ownerType,
        reload,
        replacePendingUploadItems,
        settlePreparedAttachments,
        uploadMessageKey,
        waitForBatchRetryDecision,
        preparing,
        uploading,
      ]
    )

    async function handleFileChange(
      event,
      requestedAttachmentType = attachmentType
    ) {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      await prepareFiles(files, requestedAttachmentType)
    }

    async function prepareFiles(
      files,
      requestedAttachmentType = attachmentType
    ) {
      if (uploadBusyRef.current || uploadDisabled || preparing) return
      if (files.length <= 0) return
      const selectionScope = scopeRef.current

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
      uploadBusyRef.current = true
      setPreparing(true)
      try {
        const preparedItems = []
        for (const file of validFiles) {
          try {
            const content = await readFileAsBase64(file)
            if (selectionScope !== scopeRef.current) return
            preparedItems.push({
              uid: createPendingAttachmentID(),
              file_name: file.name,
              mime_type: inferMimeType(file),
              file_size: file.size,
              content_base64: content,
              attachment_type: requestedAttachmentType,
              upload_status: 'pending',
            })
          } catch {
            if (selectionScope === scopeRef.current) {
              message.error(`${file.name} 读取失败，请重新选择`)
            }
          }
        }
        if (selectionScope !== scopeRef.current || preparedItems.length <= 0) {
          return
        }
        const { items, duplicates } = mergeBusinessAttachmentSelection(
          pendingAttachmentsRef.current,
          preparedItems
        )
        pendingAttachmentsRef.current = items
        setPendingAttachments(items)
        if (duplicates.length > 0) {
          message.info({
            key: uploadMessageKey,
            content: `已跳过 ${duplicates.length} 个重复文件`,
          })
        }
        setCategory('all')
      } finally {
        uploadBusyRef.current = false
        setPreparing(false)
      }
    }

    async function handleUploadQueuedAttachments() {
      if (
        uploadBusyRef.current ||
        uploading ||
        preparing ||
        missingOwner ||
        !canUpload
      ) {
        return
      }
      const preparedItems = pendingAttachmentsRef.current.filter(
        (item) => !item.upload_status || item.upload_status === 'pending'
      )
      if (!preparedItems.length) return
      message.destroy(uploadMessageKey)
      uploadBusyRef.current = true
      setUploading(true)
      try {
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
        uploadBusyRef.current = false
        setUploading(false)
      }
    }

    const handleBatchRetry = useCallback(async () => {
      const current = batchRetryState
      if (
        uploadBusyRef.current ||
        !canUpload ||
        !current ||
        current.retryableItems.length <= 0
      ) {
        return
      }

      uploadBusyRef.current = true
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
        uploadBusyRef.current = false
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
      canUpload,
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
      if (uploadBusyRef.current || uploading || preparing || !canUpload) return
      const retryItems = selectBusinessAttachmentUploadItems(items, {
        retryOnly: true,
      })
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

      uploadBusyRef.current = true
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
        uploadBusyRef.current = false
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
      const previewScope = scopeRef.current
      try {
        const attachment =
          item.__kind === 'pending'
            ? item
            : await downloadBusinessAttachment({ id: item.id })
        if (previewScope !== scopeRef.current) return
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
        if (previewScope === scopeRef.current) {
          message.error(getActionErrorMessage(error, '预览业务附件'))
        }
      } finally {
        setPreviewing(false)
      }
    }

    function handleRemovePending(item) {
      if (uploadBusyRef.current || uploading || preparing) return
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
          size="small"
          aria-label="预览附件"
          icon={<EyeOutlined aria-hidden="true" />}
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
          size="small"
          aria-label="撤销附件"
          icon={<StopOutlined aria-hidden="true" />}
          disabled={withdrawn || uploading || preparing || withdrawing}
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
              size="small"
              aria-label={`重试附件 ${item.file_name}`}
              icon={<RedoOutlined aria-hidden="true" />}
              disabled={uploading}
              onClick={() => handleRetryPendingAttachments([item])}
            >
              重试
            </Button>
          ) : null,
          <Button
            key="remove-pending"
            danger
            size="small"
            aria-label="移除待上传附件"
            icon={<DeleteOutlined aria-hidden="true" />}
            disabled={uploading || preparing}
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
          size="small"
          aria-label="下载附件"
          icon={<DownloadOutlined aria-hidden="true" />}
          onClick={() => handleDownload(item)}
        >
          下载
        </Button>,
        renderWithdrawalAction(item),
      ].filter(Boolean)
    }

    function renderAttachmentRow(item) {
      const key = item.uid || item.id
      const expanded = expandedNames.has(key)
      const pending = item.__kind === 'pending'
      const status = item.upload_status
      const failed = status === 'failed' || status === 'unconfirmed'
      return (
        <article
          key={key}
          className={`business-attachment-panel__row${failed ? ' business-attachment-panel__row--failed' : ''}`}
        >
          <BusinessAttachmentThumbnail item={item} />
          <div className="business-attachment-panel__file-copy">
            <button
              type="button"
              className={`business-attachment-panel__file-name${expanded ? ' business-attachment-panel__file-name--expanded' : ''}`}
              title={item.file_name}
              aria-expanded={expanded}
              onClick={() =>
                setExpandedNames((current) => {
                  const next = new Set(current)
                  if (expanded) next.delete(key)
                  else next.add(key)
                  return next
                })
              }
            >
              {item.file_name}
            </button>
            <div className="business-attachment-panel__file-meta">
              <span>{formatFileSize(item.file_size)}</span>
              {item.attachment_type === PRINT_APPENDIX_ATTACHMENT_TYPE ? (
                <Tag color="purple">合同附图</Tag>
              ) : null}
              {pending ? (
                <Tag
                  color={
                    failed
                      ? status === 'unconfirmed'
                        ? 'warning'
                        : 'error'
                      : 'blue'
                  }
                >
                  {status === 'failed'
                    ? '上传失败'
                    : status === 'unconfirmed'
                      ? '结果待确认'
                      : uploading
                        ? '上传中'
                        : missingOwner
                          ? '保存后上传'
                          : '待上传'}
                </Tag>
              ) : (
                <>
                  {!isBusinessAttachmentWithdrawn(item) ? (
                    <Tag color="success">已上传</Tag>
                  ) : null}
                  <SavedAttachmentAuditMeta item={item} />
                </>
              )}
            </div>
            {item.upload_error ? (
              <div
                className="business-attachment-panel__file-error"
                role="status"
              >
                {item.upload_error}
              </div>
            ) : null}
          </div>
          <div className="business-attachment-panel__row-actions">
            {renderAttachmentActions(item)}
          </div>
        </article>
      )
    }

    const panelExpanded =
      expanded || pendingAttachments.length > 0 || Boolean(loadError)

    return (
      <section className={containerClassName} aria-label={title}>
        {compact ? (
          <button
            type="button"
            className="business-attachment-panel__compact-summary"
            aria-expanded={panelExpanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
            disabled={
              pendingAttachments.length > 0 ||
              preparing ||
              uploading ||
              withdrawing ||
              Boolean(loadError)
            }
          >
            <span className="business-attachment-panel__compact-copy">
              <PaperClipOutlined aria-hidden="true" /> {title} ·{' '}
              {loading
                ? '正在读取'
                : loadError
                  ? '读取失败'
                  : `${attachments.length} 个已上传`}
              {pendingAttachments.length > 0
                ? ` · ${pendingAttachments.length} 个待处理`
                : ''}
            </span>
            <span className="business-attachment-panel__compact-action">
              {panelExpanded ? '收起附件' : '展开附件'}
              {panelExpanded ? (
                <UpOutlined aria-hidden="true" />
              ) : (
                <DownOutlined aria-hidden="true" />
              )}
            </span>
          </button>
        ) : null}
        <div
          id={contentId}
          className="business-attachment-panel__content"
          hidden={compact && !panelExpanded}
        >
          <div className="business-attachment-panel__header">
            {variant !== 'manager' ? (
              <Typography.Text strong>{title}</Typography.Text>
            ) : null}
            <Typography.Paragraph type="secondary">
              {panelDescription}
            </Typography.Paragraph>
          </div>
          <div className="business-attachment-panel__toolbar">
            <SlidingSegmented
              aria-label="附件分类"
              options={categoryOptions}
              value={category}
              onChange={setCategory}
            />
            {!missingOwner ? (
              <Button
                type="text"
                className="business-attachment-panel__refresh"
                aria-label="刷新列表"
                icon={<RedoOutlined aria-hidden="true" />}
                loading={loading}
                disabled={uploading || preparing}
                onClick={() => reload()}
              >
                刷新
              </Button>
            ) : null}
          </div>
          {canUpload ? (
            <>
              <div
                className={`business-attachment-panel__dropzone${dragging ? ' business-attachment-panel__dropzone--active' : ''}`}
                role="group"
                aria-label="添加附件"
                aria-disabled={uploadDisabled}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (!uploadDisabled) setDragging(true)
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDragging(false)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  if (!uploadDisabled) {
                    prepareFiles(Array.from(event.dataTransfer.files || []))
                  }
                }}
              >
                <div className="business-attachment-panel__upload-actions">
                  <Button
                    type="primary"
                    icon={<PaperClipOutlined aria-hidden="true" />}
                    loading={preparing}
                    disabled={uploadDisabled}
                    onClick={() => inputRef.current?.click()}
                  >
                    {uploadButtonText}
                  </Button>
                  {enablePrintAppendixUpload ? (
                    <Button
                      icon={<UploadOutlined aria-hidden="true" />}
                      disabled={uploadDisabled}
                      onClick={() => printAppendixInputRef.current?.click()}
                    >
                      选择合同附图
                    </Button>
                  ) : null}
                </div>
                <span className="business-attachment-panel__drop-hint">
                  或将文件拖拽到此处
                </span>
                <span className="business-attachment-panel__mobile-hint">
                  选择照片或文件
                </span>
                <span className="business-attachment-panel__upload-limit">
                  支持图片、PDF、Office、WPS、邮件、文本与压缩包；单个文件不超过
                  100 MB
                </span>
              </div>
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
          {loadError ? (
            <Alert
              type="error"
              showIcon
              message="附件列表加载失败"
              description={loadError}
              action={
                <Button
                  size="small"
                  disabled={uploading || preparing}
                  onClick={() => reload()}
                >
                  重试加载
                </Button>
              }
            />
          ) : null}
          <Spin spinning={loading}>
            <div
              className="business-attachment-panel__list"
              aria-label="附件列表"
              aria-busy={loading}
            >
              {visibleItems.length ? (
                visibleItems.map(renderAttachmentRow)
              ) : !loadError ? (
                <div className="business-attachment-panel__empty">
                  <PaperClipOutlined aria-hidden="true" />
                  <strong>
                    {loading
                      ? '正在加载附件…'
                      : category === 'all'
                        ? emptyDescription
                        : '当前分类没有附件'}
                  </strong>
                  {!loading && canUpload && !uploadDisabled ? (
                    <span>
                      {missingOwner
                        ? '选择文件后，保存业务记录时上传'
                        : '选择文件后先核对，再点击上传'}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Spin>
          <div className="business-attachment-panel__footer">
            <span className="business-attachment-panel__status" role="status">
              {uploadProgress ? (
                <>
                  <Spin size="small" /> 上传中（{uploadProgress.completed}/
                  {uploadProgress.total}）
                </>
              ) : missingOwner && canQueuePending ? (
                '待上传附件将在保存业务记录后绑定'
              ) : (
                '保留上传记录；已上传附件按权限撤销'
              )}
            </span>
            {onClose ? (
              <Button
                disabled={uploading || preparing || withdrawing}
                onClick={onClose}
              >
                完成
              </Button>
            ) : null}
            {canUpload && retryablePendingAttachments.length > 1 ? (
              <Button
                icon={<RedoOutlined aria-hidden="true" />}
                disabled={uploading || preparing}
                onClick={() =>
                  handleRetryPendingAttachments(retryablePendingAttachments)
                }
              >
                重试失败项（{retryablePendingAttachments.length}）
              </Button>
            ) : null}
            {canUpload && !missingOwner && queuedAttachments.length > 0 ? (
              <Button
                type="primary"
                icon={<UploadOutlined aria-hidden="true" />}
                loading={uploading}
                disabled={preparing || uploading}
                onClick={() => handleUploadQueuedAttachments()}
              >
                上传 {queuedAttachments.length} 个文件
              </Button>
            ) : null}
          </div>
        </div>
        <BusinessModal
          size="confirm"
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
            icon: <RedoOutlined aria-hidden="true" />,
            disabled:
              uploading || (batchRetryState?.retryableItems.length || 0) <= 0,
          }}
          maskClosable={!uploading}
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
        </BusinessModal>
        <BusinessModal
          size="confirm"
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
        </BusinessModal>
        <BusinessModal
          open={Boolean(previewAttachment)}
          title={previewAttachment?.file_name || '附件预览'}
          footer={null}
          size="columnOrder"
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
              <BusinessImage
                className="business-attachment-panel__preview-image"
                src={previewAttachment?.url}
                alt={previewAttachment?.file_name || '附件预览'}
              />
            </div>
          )}
        </BusinessModal>
      </section>
    )
  }
)

export default BusinessAttachmentPanel
