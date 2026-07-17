import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Button, Modal, Space, Spin, Tag, Typography } from 'antd'
import {
  CloseCircleOutlined,
  EyeOutlined,
  PictureOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  clearProductImage,
  downloadBusinessAttachment,
  listProductImages,
  uploadProductImage,
} from '../../api/attachmentApi.mjs'
import {
  PRODUCT_IMAGE_SLOT_DEFINITIONS,
  buildProductImageMutationPlan,
  createProductImageSession,
  inferProductImageMimeType,
  resetProductImageSession,
  selectSavedProductImages,
  stageProductImageClear,
  stageProductImageSelection,
  validateProductImageFile,
} from '../../utils/productImageSlots.mjs'

const PRODUCT_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      resolve(
        String(reader.result || '')
          .split(',')
          .pop()
      )
    reader.onerror = () => reject(new Error('read product image failed'))
    reader.readAsDataURL(file)
  })
}

function base64ToObjectURL(attachment) {
  const binary = atob(String(attachment?.content_base64 || ''))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return URL.createObjectURL(
    new Blob([bytes], {
      type: attachment?.mime_type || 'application/octet-stream',
    })
  )
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function revokePendingImages(session) {
  for (const { key } of PRODUCT_IMAGE_SLOT_DEFINITIONS) {
    const previewURL = session?.slots?.[key]?.pending?.preview_url
    if (previewURL) URL.revokeObjectURL(previewURL)
  }
}

const ProductImageSlots = forwardRef(
  ({ productId, open = false, canEdit = true }, ref) => {
    const inputRefs = useRef({})
    const requestSequenceRef = useRef(0)
    const previewRequestSequenceRef = useRef(0)
    const fileReadSequenceRef = useRef({ primary: 0, secondary: 0 })
    const filePreparationPromisesRef = useRef({})
    const activeProductIDRef = useRef(Number(productId || 0))
    const sessionRef = useRef(createProductImageSession())
    const previewRef = useRef(null)
    const mountedRef = useRef(true)
    const [session, setSession] = useState(() => sessionRef.current)
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [preparingSlotKey, setPreparingSlotKey] = useState('')
    const [previewingSlotKey, setPreviewingSlotKey] = useState('')
    const [preview, setPreview] = useState(null)

    const setCurrentSession = useCallback((nextSession) => {
      sessionRef.current = nextSession
      if (mountedRef.current) setSession(nextSession)
    }, [])

    const closePreview = useCallback(() => {
      previewRequestSequenceRef.current += 1
      const { current } = previewRef
      if (current?.ownedObjectURL && current.url) {
        URL.revokeObjectURL(current.url)
      }
      previewRef.current = null
      if (mountedRef.current) {
        setPreview(null)
        setPreviewingSlotKey('')
      }
    }, [])

    const showPreview = useCallback((nextPreview) => {
      const { current } = previewRef
      if (current?.ownedObjectURL && current.url) {
        URL.revokeObjectURL(current.url)
      }
      previewRef.current = nextPreview
      if (mountedRef.current) setPreview(nextPreview)
    }, [])

    const applySavedAttachments = useCallback(
      (attachments) => {
        closePreview()
        revokePendingImages(sessionRef.current)
        setCurrentSession(
          createProductImageSession(selectSavedProductImages(attachments))
        )
      },
      [closePreview, setCurrentSession]
    )

    const loadSavedAttachments = useCallback(
      async (targetProductID) => {
        const attachments = await listProductImages({
          product_id: targetProductID,
        })
        return Array.isArray(attachments) ? attachments : []
      },
      []
    )

    const beginSession = useCallback(
      async (nextProductID = productId) => {
        const targetProductID = Number(nextProductID || 0)
        const requestSequence = requestSequenceRef.current + 1
        requestSequenceRef.current = requestSequence
        activeProductIDRef.current = targetProductID
        for (const { key } of PRODUCT_IMAGE_SLOT_DEFINITIONS) {
          fileReadSequenceRef.current[key] += 1
        }
        filePreparationPromisesRef.current = {}
        setPreparingSlotKey('')
        applySavedAttachments([])
        if (targetProductID <= 0) {
          setLoading(false)
          return true
        }

        setLoading(true)
        try {
          const attachments = await loadSavedAttachments(targetProductID)
          if (
            requestSequenceRef.current !== requestSequence ||
            activeProductIDRef.current !== targetProductID
          ) {
            return false
          }
          applySavedAttachments(attachments)
          return true
        } catch (error) {
          if (requestSequenceRef.current === requestSequence) {
            message.error(getActionErrorMessage(error, '加载产品图片'))
          }
          return false
        } finally {
          if (
            mountedRef.current &&
            requestSequenceRef.current === requestSequence
          ) {
            setLoading(false)
          }
        }
      },
      [applySavedAttachments, loadSavedAttachments, productId]
    )

    const cancelSession = useCallback(() => {
      requestSequenceRef.current += 1
      for (const { key } of PRODUCT_IMAGE_SLOT_DEFINITIONS) {
        fileReadSequenceRef.current[key] += 1
      }
      filePreparationPromisesRef.current = {}
      closePreview()
      revokePendingImages(sessionRef.current)
      setCurrentSession(resetProductImageSession(sessionRef.current))
      setLoading(false)
      setPreparingSlotKey('')
      setPreviewingSlotKey('')
    }, [closePreview, setCurrentSession])

    const flushChanges = useCallback(
      async (nextProductID = productId) => {
        const targetProductID = Number(
          nextProductID || activeProductIDRef.current || 0
        )
        const pendingPreparations = Object.values(
          filePreparationPromisesRef.current
        )
        let plan = buildProductImageMutationPlan(sessionRef.current)
        if (plan.length <= 0 && pendingPreparations.length <= 0) {
          return { mutationsApplied: true, reloaded: true }
        }
        if (!canEdit || targetProductID <= 0) {
          return { mutationsApplied: false, reloaded: false }
        }

        requestSequenceRef.current += 1
        activeProductIDRef.current = targetProductID
        setSaving(true)
        try {
          try {
            const preparationResults = await Promise.all(pendingPreparations)
            if (preparationResults.some((prepared) => prepared === false)) {
              return { mutationsApplied: false, reloaded: false }
            }
            plan = buildProductImageMutationPlan(sessionRef.current)
            for (const change of plan) {
              if (change.type === 'upload') {
                await uploadProductImage({
                  product_id: targetProductID,
                  slot_key: change.slotKey,
                  file_name: change.image.file_name,
                  mime_type: change.image.mime_type,
                  file_size: change.image.file_size,
                  content_base64: change.image.content_base64,
                })
                continue
              }
              const cleared = await clearProductImage({
                product_id: targetProductID,
                slot_key: change.slotKey,
              })
              if (!cleared) throw new Error('clear product image failed')
            }
          } catch (error) {
            message.error(getActionErrorMessage(error, '更新产品图片'))
            try {
              applySavedAttachments(
                await loadSavedAttachments(targetProductID)
              )
              return { mutationsApplied: false, reloaded: true }
            } catch {
              cancelSession()
              return { mutationsApplied: false, reloaded: false }
            }
          }

          try {
            applySavedAttachments(await loadSavedAttachments(targetProductID))
            return { mutationsApplied: true, reloaded: true }
          } catch {
            cancelSession()
            return { mutationsApplied: true, reloaded: false }
          }
        } finally {
          if (mountedRef.current) setSaving(false)
        }
      },
      [
        applySavedAttachments,
        cancelSession,
        canEdit,
        loadSavedAttachments,
        productId,
      ]
    )

    useImperativeHandle(
      ref,
      () => ({
        beginSession,
        cancelSession,
        flushChanges,
        hasPendingChanges: () =>
          buildProductImageMutationPlan(sessionRef.current).length > 0,
      }),
      [beginSession, cancelSession, flushChanges]
    )

    useEffect(() => {
      const fileReadSequence = fileReadSequenceRef.current
      mountedRef.current = true
      return () => {
        mountedRef.current = false
        requestSequenceRef.current += 1
        previewRequestSequenceRef.current += 1
        for (const { key } of PRODUCT_IMAGE_SLOT_DEFINITIONS) {
          fileReadSequence[key] += 1
        }
        filePreparationPromisesRef.current = {}
        const currentPreview = previewRef.current
        if (currentPreview?.ownedObjectURL && currentPreview.url) {
          URL.revokeObjectURL(currentPreview.url)
        }
        revokePendingImages(sessionRef.current)
      }
    }, [])

    useEffect(() => {
      if (open) beginSession(productId)
    }, [beginSession, open, productId])

    function handleFileChange(slotKey, event) {
      const [file] = Array.from(event.target.files || [])
      event.target.value = ''
      if (!file) return
      const validationMessage = validateProductImageFile(file)
      if (validationMessage) {
        message.warning(validationMessage)
        return
      }

      const readSequence = fileReadSequenceRef.current[slotKey] + 1
      fileReadSequenceRef.current[slotKey] = readSequence
      setPreparingSlotKey(slotKey)
      const preparationPromise = (async () => {
        let previewURL = ''
        try {
          previewURL = URL.createObjectURL(file)
          const contentBase64 = await readFileAsBase64(file)
          if (fileReadSequenceRef.current[slotKey] !== readSequence) {
            URL.revokeObjectURL(previewURL)
            return false
          }
          const pending = {
            file_name: file.name,
            mime_type: inferProductImageMimeType(file),
            file_size: file.size,
            content_base64: contentBase64,
            preview_url: previewURL,
          }
          closePreview()
          const currentPreviewURL =
            sessionRef.current?.slots?.[slotKey]?.pending?.preview_url
          if (currentPreviewURL) URL.revokeObjectURL(currentPreviewURL)
          setCurrentSession(
            stageProductImageSelection(sessionRef.current, slotKey, pending)
          )
          return true
        } catch (error) {
          if (previewURL) URL.revokeObjectURL(previewURL)
          if (fileReadSequenceRef.current[slotKey] === readSequence) {
            message.error(getActionErrorMessage(error, '读取产品图片'))
          }
          return false
        } finally {
          if (fileReadSequenceRef.current[slotKey] === readSequence) {
            delete filePreparationPromisesRef.current[slotKey]
            setPreparingSlotKey((current) =>
              current === slotKey ? '' : current
            )
          }
        }
      })()
      filePreparationPromisesRef.current[slotKey] = preparationPromise
    }

    function handleClear(slotKey) {
      fileReadSequenceRef.current[slotKey] += 1
      delete filePreparationPromisesRef.current[slotKey]
      setPreparingSlotKey((current) => (current === slotKey ? '' : current))
      closePreview()
      const currentPreviewURL =
        sessionRef.current?.slots?.[slotKey]?.pending?.preview_url
      if (currentPreviewURL) URL.revokeObjectURL(currentPreviewURL)
      setCurrentSession(stageProductImageClear(sessionRef.current, slotKey))
    }

    function handleUndoClear(slotKey) {
      fileReadSequenceRef.current[slotKey] += 1
      delete filePreparationPromisesRef.current[slotKey]
      setPreparingSlotKey((current) => (current === slotKey ? '' : current))
      setCurrentSession(
        stageProductImageSelection(sessionRef.current, slotKey, null)
      )
    }

    async function handlePreview(slotKey) {
      const slot = sessionRef.current?.slots?.[slotKey]
      const item = slot?.pending || (!slot?.cleared ? slot?.saved : null)
      if (!item) return
      if (slot?.pending?.preview_url) {
        previewRequestSequenceRef.current += 1
        setPreviewingSlotKey('')
        showPreview({
          fileName: item.file_name,
          url: item.preview_url,
          ownedObjectURL: false,
        })
        return
      }

      const previewRequestSequence = previewRequestSequenceRef.current + 1
      previewRequestSequenceRef.current = previewRequestSequence
      setPreviewingSlotKey(slotKey)
      try {
        const attachment = await downloadBusinessAttachment({ id: item.id })
        if (previewRequestSequenceRef.current !== previewRequestSequence) {
          return
        }
        if (!attachment?.content_base64) {
          message.warning('产品图片内容为空，无法预览')
          return
        }
        showPreview({
          fileName: attachment.file_name || item.file_name || '产品图片预览',
          url: base64ToObjectURL(attachment),
          ownedObjectURL: true,
        })
      } catch (error) {
        if (previewRequestSequenceRef.current === previewRequestSequence) {
          message.error(getActionErrorMessage(error, '预览产品图片'))
        }
      } finally {
        if (previewRequestSequenceRef.current === previewRequestSequence) {
          setPreviewingSlotKey('')
        }
      }
    }

    const controlsDisabled = loading || saving || !canEdit

    return (
      <section className="product-image-slots" aria-label="产品图片">
        <div className="product-image-slots__header">
          <div>
            <Typography.Text strong>产品图片</Typography.Text>
            <Typography.Paragraph type="secondary">
              用于物料明细和作业指导书右上角。可设置 0–2 张，只有一张时请放在产品图 1。支持
              PNG、JPEG、WEBP，单张不超过 5MB，宽高单边不超过 8192
              像素，总像素不超过 2000 万。
            </Typography.Paragraph>
          </div>
          <Tag color="blue">保存产品后生效</Tag>
        </div>

        <div className="product-image-slots__grid">
          {PRODUCT_IMAGE_SLOT_DEFINITIONS.map(({ key, label }) => {
            const slot = session.slots[key]
            const visibleImage =
              slot.pending || (!slot.cleared ? slot.saved : null)
            const pendingText = slot.pending
              ? slot.saved
                ? '保存产品后替换'
                : '保存产品后上传'
              : ''
            return (
              <article className="product-image-slot" key={key}>
                <div className="product-image-slot__title-row">
                  <Typography.Text strong>{label}</Typography.Text>
                  {pendingText ? <Tag color="blue">{pendingText}</Tag> : null}
                  {slot.cleared ? <Tag>保存产品后清空</Tag> : null}
                </div>

                <div className="product-image-slot__preview">
                  {loading ? (
                    <div className="product-image-slot__placeholder">
                      <Spin size="small" />
                      <span>正在读取图片</span>
                    </div>
                  ) : slot.pending?.preview_url ? (
                    <img src={slot.pending.preview_url} alt={`${label}预览`} />
                  ) : visibleImage ? (
                    <div className="product-image-slot__placeholder">
                      <PictureOutlined />
                      <span>已设置图片</span>
                    </div>
                  ) : (
                    <div className="product-image-slot__placeholder">
                      <PictureOutlined />
                      <span>暂未设置</span>
                    </div>
                  )}
                </div>

                <div className="product-image-slot__meta">
                  <Typography.Text ellipsis title={visibleImage?.file_name}>
                    {visibleImage?.file_name || '可不上传'}
                  </Typography.Text>
                  {visibleImage?.file_size ? (
                    <Typography.Text type="secondary">
                      {formatFileSize(visibleImage.file_size)}
                    </Typography.Text>
                  ) : null}
                </div>

                <Space className="product-image-slot__actions" size={6} wrap>
                  <Button
                    size="small"
                    icon={<UploadOutlined />}
                    disabled={controlsDisabled}
                    loading={preparingSlotKey === key}
                    onClick={() => inputRefs.current[key]?.click()}
                  >
                    {visibleImage ? '替换' : '选择图片'}
                  </Button>
                  {visibleImage ? (
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      disabled={loading || saving}
                      loading={previewingSlotKey === key}
                      onClick={() => handlePreview(key)}
                    >
                      预览
                    </Button>
                  ) : null}
                  {visibleImage ? (
                    <Button
                      danger
                      size="small"
                      icon={<CloseCircleOutlined />}
                      disabled={controlsDisabled}
                      onClick={() => handleClear(key)}
                    >
                      清空
                    </Button>
                  ) : null}
                  {slot.cleared && slot.saved ? (
                    <Button
                      size="small"
                      icon={<UndoOutlined />}
                      disabled={controlsDisabled}
                      onClick={() => handleUndoClear(key)}
                    >
                      撤销清空
                    </Button>
                  ) : null}
                </Space>
                <input
                  ref={(node) => {
                    inputRefs.current[key] = node
                  }}
                  hidden
                  type="file"
                  disabled={controlsDisabled}
                  accept={PRODUCT_IMAGE_ACCEPT}
                  aria-label={`选择${label}`}
                  onChange={(event) => handleFileChange(key, event)}
                />
              </article>
            )
          })}
        </div>

        <Modal
          open={Boolean(preview)}
          title={preview?.fileName || '产品图片预览'}
          footer={null}
          width="min(960px, calc(100vw - 48px))"
          destroyOnHidden
          onCancel={closePreview}
        >
          <div className="product-image-slots__modal-preview">
            <img src={preview?.url} alt={preview?.fileName || '产品图片预览'} />
          </div>
        </Modal>
      </section>
    )
  }
)

ProductImageSlots.displayName = 'ProductImageSlots'

export default ProductImageSlots
