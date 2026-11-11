import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Button, Space, Spin, Tag, Typography } from 'antd'
import {
  CloseCircleOutlined,
  EyeOutlined,
  PictureOutlined,
  UndoOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import BusinessImage from '../business-list/BusinessImage.jsx'
import { prepareBusinessReferenceImage } from '../../utils/prepareBusinessReferenceImage.mjs'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { BusinessFormPendingAttachmentsContext } from '../business-list/BusinessFormPageContext.js'
import {
  clearProductImage,
  downloadBusinessAttachment,
  listProductImages,
  uploadProductImage,
} from '../../api/attachmentApi.mjs'
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_SLOT_DEFINITIONS,
  PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT,
  PRODUCT_IMAGE_SUPPLEMENTAL_SLOT,
  buildProductImageMutationPlan,
  confirmProductImageMutation,
  createProductImageSession,
  isSupplementalProductImage,
  reconcileSupplementalProductImages,
  resetProductImageSession,
  selectSavedProductImages,
  selectSavedSupplementalProductImages,
  stageProductImageClear,
  stageProductImageSelection,
  stageSupplementalProductImageRemoval,
  stageSupplementalProductImage,
  supplementalProductImageOverflow,
  validateProductImageFile,
  undoSupplementalProductImageRemoval,
  visibleSupplementalProductImages,
} from '../../utils/productImageSlots.mjs'

const PRODUCT_IMAGE_PREPARATION_KEYS = [...PRODUCT_IMAGE_SLOT_DEFINITIONS.map(({ key }) => key), PRODUCT_IMAGE_SUPPLEMENTAL_SLOT]
const supplementalImageKey = (image) => image.pendingKey || `supplemental-${image.id}`

function revokeObjectURL(objectURL) {
  if (String(objectURL || '').startsWith('blob:')) {
    URL.revokeObjectURL(objectURL)
  }
}

function base64ToDataURL(attachment) {
  return `data:${attachment?.mime_type || 'application/octet-stream'};base64,${String(
    attachment?.content_base64 || ''
  )}`
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

function sessionImageURLs(session) {
  const images = PRODUCT_IMAGE_SLOT_DEFINITIONS.flatMap(({ key }) => [
    session.slots[key].pending,
    session.slots[key].saved,
  ])
  const { saved, pending, undo } = session.supplemental
  return new Set([...images, ...saved, ...pending, undo?.item].map((item) => item?.preview_url).filter((url) => url?.startsWith('blob:')))
}

function revokeAttachmentPreviewURLs(attachments) {
  const revoked = new Set()
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const previewURL = attachment?.preview_url
    if (previewURL?.startsWith('blob:') && !revoked.has(previewURL)) {
      revokeObjectURL(previewURL)
      revoked.add(previewURL)
    }
  }
}

const ProductImageSlots = forwardRef(
  ({ productId, open = false, canEdit = true }, ref) => {
    const inputRefs = useRef({})
    const requestSequenceRef = useRef(0)
    const previewRequestSequenceRef = useRef(0)
    const fileReadSequenceRef = useRef(Object.fromEntries(PRODUCT_IMAGE_PREPARATION_KEYS.map((key) => [key, 0])))
    const filePreparationPromisesRef = useRef({})
    const filePreparationAbortControllersRef = useRef({})
    const activeProductIDRef = useRef(Number(productId || 0))
    const sessionRef = useRef(createProductImageSession())
    const previewRef = useRef(null)
    const mountedRef = useRef(true)
    const [session, setSession] = useState(() => sessionRef.current)
    const [loading, setLoading] = useState(false)
    const needsReadback = useRef(false)
    const [loadFailed, setLoadFailed] = useState(false)
    const [saving, setSaving] = useState(false)
    const [preparingSlotKey, setPreparingSlotKey] = useState('')
    const [previewingSlotKey, setPreviewingSlotKey] = useState('')
    const [preview, setPreview] = useState(null)
    const [supplementalFeedback, setSupplementalFeedback] = useState(null)
    const reportPendingChanges = useContext(BusinessFormPendingAttachmentsContext)
    useEffect(() => {
      reportPendingChanges?.(
        open ? buildProductImageMutationPlan(session).length + Number(Boolean(preparingSlotKey)) : 0
      )
    }, [open, preparingSlotKey, reportPendingChanges, session])
    useEffect(() => () => reportPendingChanges?.(0), [reportPendingChanges])

    const setCurrentSession = useCallback((nextSession) => {
      const keep = sessionImageURLs(nextSession)
      for (const url of sessionImageURLs(sessionRef.current)) {
        if (!keep.has(url)) revokeObjectURL(url)
      }
      sessionRef.current = nextSession
      if (mountedRef.current) setSession(nextSession)
    }, [])

    const closePreview = useCallback(() => {
      previewRequestSequenceRef.current += 1
      const { current } = previewRef
      if (current?.ownedObjectURL && current.url) {
        revokeObjectURL(current.url)
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
        revokeObjectURL(current.url)
      }
      previewRef.current = nextPreview
      if (mountedRef.current) setPreview(nextPreview)
    }, [])

    const abortFilePreparation = useCallback((slotKey) => {
      const controller = filePreparationAbortControllersRef.current[slotKey]
      if (!controller) return
      delete filePreparationAbortControllersRef.current[slotKey]
      controller.abort()
    }, [])

    const abortAllFilePreparations = useCallback(() => {
      for (const key of PRODUCT_IMAGE_PREPARATION_KEYS) {
        abortFilePreparation(key)
      }
    }, [abortFilePreparation])

    const applySavedAttachments = useCallback(
      (attachments) => {
        closePreview()
        setCurrentSession(
          createProductImageSession(selectSavedProductImages(attachments), selectSavedSupplementalProductImages(attachments))
        )
      },
      [closePreview, setCurrentSession]
    )

    const loadSavedAttachments = useCallback(async (targetProductID, { supplementalOnly = false, knownSupplemental = [] } = {}) => {
      const attachments = await listProductImages({
        product_id: targetProductID,
      })
      const listedAttachments = Array.isArray(attachments) ? attachments : []
      const selected = supplementalOnly ? [] : Object.values(selectSavedProductImages(listedAttachments)).filter(Boolean)
      const loadPreview = async (metadata, thumbnail = false) => {
        try {
          const attachment = await downloadBusinessAttachment({
            id: metadata.id,
            ...(thumbnail ? { variant: 'thumbnail' } : {}),
          })
          if (!attachment?.content_base64) throw new Error('empty product image')
          return { ...metadata, preview_url: base64ToDataURL(attachment), preview_load_failed: false }
        } catch {
          return { ...metadata, preview_load_failed: true }
        }
      }
      const downloaded = await Promise.all(
        selected.map((metadata) => loadPreview(metadata))
      )
      const supplemental = selectSavedSupplementalProductImages(listedAttachments)
      const knownByID = new Map(knownSupplemental.map((image) => [image.id, image]))
      for (let index = 0; index < supplemental.length; index += 2) {
        downloaded.push(...await Promise.all(supplemental.slice(index, index + 2).map((metadata) => {
          const known = knownByID.get(metadata.id)
          return known?.preview_url
            ? { ...metadata, preview_url: known.preview_url }
            : loadPreview(metadata, true)
        })))
      }
      const downloadedByID = new Map(
        downloaded.map((attachment) => [Number(attachment.id), attachment])
      )
      return listedAttachments.map(
        (attachment) => downloadedByID.get(Number(attachment.id)) || attachment
      )
    }, [])

    const beginSession = useCallback(
      async (nextProductID = productId) => {
        const targetProductID = Number(nextProductID || 0)
        const requestSequence = requestSequenceRef.current + 1
        requestSequenceRef.current = requestSequence
        activeProductIDRef.current = targetProductID
        needsReadback.current = false
        for (const key of PRODUCT_IMAGE_PREPARATION_KEYS) {
          fileReadSequenceRef.current[key] += 1
        }
        abortAllFilePreparations()
        filePreparationPromisesRef.current = {}
        setPreparingSlotKey('')
        setSaving(false)
        setSupplementalFeedback(null)
        applySavedAttachments([])
        setLoadFailed(false)
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
            revokeAttachmentPreviewURLs(attachments)
            return false
          }
          applySavedAttachments(attachments)
          if (attachments.some((item) => item?.preview_load_failed)) {
            message.warning(
              '产品图片已保存，但部分缩略图暂时无法加载，可点击预览重试'
            )
          }
          return true
        } catch (error) {
          if (requestSequenceRef.current === requestSequence) {
            setLoadFailed(true)
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
      [
        abortAllFilePreparations,
        applySavedAttachments,
        loadSavedAttachments,
        productId,
      ]
    )

    const cancelSession = useCallback(() => {
      requestSequenceRef.current += 1
      for (const key of PRODUCT_IMAGE_PREPARATION_KEYS) {
        fileReadSequenceRef.current[key] += 1
      }
      abortAllFilePreparations()
      filePreparationPromisesRef.current = {}
      closePreview()
      setCurrentSession(resetProductImageSession(sessionRef.current))
      setLoading(false)
      setLoadFailed(false)
      setPreparingSlotKey('')
      setSupplementalFeedback(null)
      setPreviewingSlotKey('')
    }, [abortAllFilePreparations, closePreview, setCurrentSession])

    const flushChanges = useCallback(
      async (nextProductID = productId) => {
        const targetProductID = Number(
          nextProductID || activeProductIDRef.current || 0
        )
        const pendingPreparations = Object.values(
          filePreparationPromisesRef.current
        )
        let plan = buildProductImageMutationPlan(sessionRef.current)
        if (plan.length <= 0 && pendingPreparations.length <= 0 && !needsReadback.current) {
          return { mutationsApplied: true, reloaded: true }
        }
        if (!canEdit || targetProductID <= 0) {
          return { mutationsApplied: false, reloaded: false }
        }

        const requestSequence = ++requestSequenceRef.current
        const isCurrent = () => mountedRef.current && requestSequenceRef.current === requestSequence
        const refreshSupplemental = async () => {
          try {
            const attachments = await loadSavedAttachments(targetProductID, {
              supplementalOnly: true,
              knownSupplemental: sessionRef.current.supplemental.saved,
            })
            if (!isCurrent()) return false
            closePreview()
            setCurrentSession(reconcileSupplementalProductImages(sessionRef.current, attachments))
            setSupplementalFeedback(null)
            return true
          } catch {
            return false
          }
        }
        activeProductIDRef.current = targetProductID
        setSaving(true)
        try {
          let writingSupplemental = false
          try {
            const preparationResults = await Promise.all(pendingPreparations)
            if (!isCurrent() || preparationResults.some((prepared) => prepared === false)) {
              return { mutationsApplied: false, reloaded: false }
            }
            if (supplementalProductImageOverflow(sessionRef.current)) {
              await refreshSupplemental()
              if (!isCurrent()) return { mutationsApplied: false, reloaded: false }
              if (supplementalProductImageOverflow(sessionRef.current)) {
                return { mutationsApplied: false, reloaded: false, supplementalOverflow: true }
              }
            }
            plan = buildProductImageMutationPlan(sessionRef.current)
            for (const change of plan) {
              writingSupplemental = change.type === 'append' || change.type === 'remove'
              let uploaded
              if (change.image) {
                uploaded = await uploadProductImage({
                  product_id: targetProductID,
                  slot_key: change.slotKey,
                  file_name: change.image.file_name,
                  mime_type: change.image.mime_type,
                  file_size: change.image.file_size,
                  content_base64: change.image.content_base64,
                })
                if (change.type === 'append' && !isSupplementalProductImage(uploaded)) {
                  throw new Error('补充图片保存结果不完整，请重试')
                }
              } else {
                await clearProductImage({
                  product_id: targetProductID,
                  ...(change.type === 'remove' ? { id: change.id } : { slot_key: change.slotKey }),
                })
              }
              if (!isCurrent()) return { mutationsApplied: false, reloaded: false }
              setCurrentSession(confirmProductImageMutation(sessionRef.current, change, uploaded))
              needsReadback.current = true
            }
          } catch (error) {
            const refreshed = writingSupplemental && isCurrent() && await refreshSupplemental()
            if (!isCurrent()) return { mutationsApplied: false, reloaded: false }
            if (refreshed && supplementalProductImageOverflow(sessionRef.current)) {
              return { mutationsApplied: false, reloaded: false, supplementalOverflow: true }
            }
            if (!refreshed || buildProductImageMutationPlan(sessionRef.current).length) {
              message.error(getActionErrorMessage(error, '更新产品图片'))
              return { mutationsApplied: false, reloaded: false }
            }
            needsReadback.current = true
          }

          try {
            const attachments = await loadSavedAttachments(targetProductID)
            if (!isCurrent()) return { mutationsApplied: true, reloaded: false }
            applySavedAttachments(attachments)
            needsReadback.current = false
            return { mutationsApplied: true, reloaded: true }
          } catch {
            return { mutationsApplied: true, reloaded: false }
          }
        } finally {
          if (isCurrent()) setSaving(false)
        }
      },
      [
        applySavedAttachments,
        canEdit,
        closePreview,
        setCurrentSession,
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
        for (const key of PRODUCT_IMAGE_PREPARATION_KEYS) {
          fileReadSequence[key] += 1
        }
        abortAllFilePreparations()
        filePreparationPromisesRef.current = {}
        const currentPreview = previewRef.current
        if (currentPreview?.ownedObjectURL && currentPreview.url) {
          revokeObjectURL(currentPreview.url)
        }
        for (const url of sessionImageURLs(sessionRef.current)) revokeObjectURL(url)
      }
    }, [abortAllFilePreparations])

    useEffect(() => {
      if (open) beginSession(productId)
    }, [beginSession, open, productId])

    function handleFileChange(slotKey, event) {
      const supplemental = slotKey === PRODUCT_IMAGE_SUPPLEMENTAL_SLOT
      const files = Array.from(event.target.files || []).slice(0, supplemental ? undefined : 1)
      event.target.value = ''
      if (!files.length) return
      if (supplemental) setSupplementalFeedback(null)
      const validationMessage = files.map(validateProductImageFile).find(Boolean)
      if (validationMessage) {
        if (supplemental) setSupplementalFeedback({ error: true, text: validationMessage })
        else message.warning(validationMessage)
        return
      }

      abortFilePreparation(slotKey)
      const readSequence = fileReadSequenceRef.current[slotKey] + 1
      fileReadSequenceRef.current[slotKey] = readSequence
      const preparationAbortController = new AbortController()
      filePreparationAbortControllersRef.current[slotKey] =
        preparationAbortController
      setPreparingSlotKey(slotKey)
      const preparationPromise = (async () => {
        const { current } = sessionRef
        let next = current
        let duplicates = 0
        let restored = 0
        let fileName = ''
        try {
          for (const [index, file] of files.entries()) {
            fileName = file.name
            const pending = await prepareBusinessReferenceImage(file, preparationAbortController.signal, supplemental)
            if (fileReadSequenceRef.current[slotKey] !== readSequence) return false
            if (!supplemental) {
              closePreview()
              setCurrentSession(stageProductImageSelection(sessionRef.current, slotKey, pending))
              return true
            }
            const selection = stageSupplementalProductImage(next, { ...pending, pendingKey: `pending-${readSequence}-${index}` })
            if (selection.outcome === 'full') {
              const remaining = PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT - visibleSupplementalProductImages(current).length
              setSupplementalFeedback({
                error: true,
                text: `还可添加 ${remaining} 张，本次选图去重后仍超出上限，请减少选择后重试。`,
              })
              return false
            }
            if (selection.outcome === 'duplicate') duplicates += 1
            if (selection.outcome === 'restored') restored += 1
            next = selection.session
          }
          if (next !== current) {
            closePreview()
            setCurrentSession({ ...sessionRef.current, supplemental: next.supplemental })
          }
          const notice = [
            duplicates ? `已跳过 ${duplicates} 张重复图片。` : '',
            restored ? `已恢复 ${restored} 张原图片。` : '',
          ].join('')
          if (notice) setSupplementalFeedback({ text: notice })
          return true
        } catch (error) {
          if (error?.name === 'AbortError') {
            return false
          }
          if (fileReadSequenceRef.current[slotKey] === readSequence) {
            const hint = getActionErrorMessage(error, '读取产品图片')
            if (supplemental) setSupplementalFeedback({ error: true, text: fileName ? `「${fileName}」：${hint}` : hint })
            else message.error(hint)
          }
          return false
        } finally {
          if (fileReadSequenceRef.current[slotKey] === readSequence) {
            delete filePreparationPromisesRef.current[slotKey]
            setPreparingSlotKey((current) =>
              current === slotKey ? '' : current
            )
          }
          if (
            filePreparationAbortControllersRef.current[slotKey] ===
            preparationAbortController
          ) {
            delete filePreparationAbortControllersRef.current[slotKey]
          }
        }
      })()
      filePreparationPromisesRef.current[slotKey] = preparationPromise
    }

    function handleClear(slotKey) {
      fileReadSequenceRef.current[slotKey] += 1
      abortFilePreparation(slotKey)
      delete filePreparationPromisesRef.current[slotKey]
      setPreparingSlotKey((current) => (current === slotKey ? '' : current))
      closePreview()
      setCurrentSession(stageProductImageClear(sessionRef.current, slotKey))
    }

    function handleUndoClear(slotKey) {
      fileReadSequenceRef.current[slotKey] += 1
      abortFilePreparation(slotKey)
      delete filePreparationPromisesRef.current[slotKey]
      setPreparingSlotKey((current) => (current === slotKey ? '' : current))
      setCurrentSession(
        stageProductImageSelection(sessionRef.current, slotKey, null)
      )
    }

    function handlePreview(slotKey) {
      const slot = sessionRef.current?.slots?.[slotKey]
      const item = slot?.pending || (!slot?.cleared ? slot?.saved : null)
      return previewImage(item, slotKey)
    }

    async function previewImage(item, key, thumbnail = false) {
      if (!item) return
      if (item.preview_url && !thumbnail) {
        previewRequestSequenceRef.current += 1
        setPreviewingSlotKey('')
        showPreview({
          fileName: item.file_name,
          url: item.preview_url,
          ownedObjectURL: false,
          key,
        })
        return
      }

      const previewRequestSequence = previewRequestSequenceRef.current + 1
      previewRequestSequenceRef.current = previewRequestSequence
      setPreviewingSlotKey(key)
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
          key,
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

    const controlsDisabled = loading || loadFailed || saving || !canEdit || preparingSlotKey === PRODUCT_IMAGE_SUPPLEMENTAL_SLOT
    const supplementalImages = visibleSupplementalProductImages(session)
    const supplementalFull = supplementalImages.length >= PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT
    const supplementalOverflow = supplementalProductImageOverflow(session)
    const supplementalPreviewIndex = supplementalImages.findIndex((item) => supplementalImageKey(item) === preview?.key)
    const previewSupplemental = (item) => previewImage(item, supplementalImageKey(item), !item.pendingKey)

    return (
      <section className="product-image-slots" aria-label="产品图片">
        {canEdit ? <div className="product-image-slots__header"><Typography.Text type="secondary">支持 PNG、JPEG、WEBP</Typography.Text></div> : null}

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
                  {slot.pending?.optimized ? (
                    <Tag color="gold">已自动优化</Tag>
                  ) : null}
                  {slot.cleared ? <Tag>保存产品后清空</Tag> : null}
                </div>

                <div className="product-image-slot__preview">
                  {loading ? (
                    <div className="product-image-slot__placeholder">
                      <Spin size="small" />
                      <span>正在读取图片</span>
                    </div>
                  ) : loadFailed ? (
                    <div className="product-image-slot__placeholder">
                      <PictureOutlined />
                      <span>图片读取失败</span>
                      <Button size="small" onClick={() => beginSession(productId)}>
                        重新加载
                      </Button>
                    </div>
                  ) : visibleImage?.preview_url ? (
                    <BusinessImage src={visibleImage.preview_url} alt={`${label}预览`} />
                  ) : visibleImage?.preview_load_failed ? (
                    <div className="product-image-slot__placeholder">
                      <PictureOutlined />
                      <span>图片已保存，缩略图加载失败</span>
                    </div>
                  ) : (
                    <div className="product-image-slot__placeholder">
                      <PictureOutlined />
                      <span>暂无图片</span>
                    </div>
                  )}
                </div>

                <div className="product-image-slot__meta">
                  <Typography.Text ellipsis title={visibleImage?.file_name}>
                    {visibleImage?.file_name || (loadFailed ? '重新加载后可编辑图片' : '可不上传')}
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

        <section className="product-image-supplemental" aria-label="补充图片">
          <div className="product-image-supplemental__header">
            <div>
              <Typography.Text strong>补充图片</Typography.Text>
              <Typography.Text type="secondary" className="product-image-supplemental__count" role="status">
                {supplementalImages.length} / {PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT}
              </Typography.Text>
              <div><Typography.Text type="secondary">仅在产品档案查看。</Typography.Text></div>
            </div>
            {canEdit ? (
              <Button
                size="small"
                icon={<UploadOutlined />}
                loading={preparingSlotKey === PRODUCT_IMAGE_SUPPLEMENTAL_SLOT}
                disabled={controlsDisabled || Boolean(preparingSlotKey) || supplementalFull}
                onClick={() => inputRefs.current[PRODUCT_IMAGE_SUPPLEMENTAL_SLOT]?.click()}
              >
                {supplementalFull ? '已达上限' : '添加补充图片'}
              </Button>
            ) : null}
            <input
              ref={(node) => { inputRefs.current[PRODUCT_IMAGE_SUPPLEMENTAL_SLOT] = node }}
              hidden
              type="file"
              multiple
              disabled={controlsDisabled || Boolean(preparingSlotKey) || supplementalFull}
              accept={PRODUCT_IMAGE_ACCEPT}
              aria-label="选择多张补充图片"
              onChange={(event) => handleFileChange(PRODUCT_IMAGE_SUPPLEMENTAL_SLOT, event)}
            />
          </div>
          {supplementalOverflow > 0 ? (
            <Typography.Text className="product-image-supplemental__feedback" type="danger" role="alert">
              已读取最新补充图。含待保存图片超出上限 {supplementalOverflow} 张，请移除后再保存。
            </Typography.Text>
          ) : supplementalFeedback ? (
            <Typography.Text
              className="product-image-supplemental__feedback"
              type={supplementalFeedback.error ? 'danger' : 'secondary'}
              role={supplementalFeedback.error ? 'alert' : 'status'}
            >
              {supplementalFeedback.text}
            </Typography.Text>
          ) : null}
          {supplementalImages.length ? (
            <ul className="product-image-supplemental__grid">
              {supplementalImages.map((image) => (
                <li className="product-image-supplemental__item" key={supplementalImageKey(image)}>
                  <button
                    type="button"
                    className="product-image-supplemental__preview"
                    aria-label={`预览：${image.file_name}`}
                    aria-busy={previewingSlotKey === supplementalImageKey(image)}
                    disabled={saving}
                    onClick={() => previewSupplemental(image)}
                  >
                    <BusinessImage src={image.preview_url} alt="" compact loadFailed={image.preview_load_failed} />
                  </button>
                  <div className="product-image-supplemental__caption">
                    <Typography.Text ellipsis title={image.file_name}>{image.file_name}</Typography.Text>
                    {canEdit ? (
                      <Button
                        type="text"
                        size="small"
                        aria-label={`移除：${image.file_name}`}
                        disabled={controlsDisabled}
                        onClick={() => {
                          closePreview()
                          setSupplementalFeedback(null)
                          setCurrentSession(stageSupplementalProductImageRemoval(sessionRef.current, image))
                        }}
                      >
                        移除
                      </Button>
                    ) : null}
                  </div>
                  {supplementalOverflow > 0 && image.pendingKey ? <Typography.Text type="secondary">待保存</Typography.Text> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {canEdit && session.supplemental.undo ? (
            <Space size={6} wrap>
              <Typography.Text type="secondary" role="status">已移除「{session.supplemental.undo.item.file_name}」</Typography.Text>
              <Button
                type="text"
                size="small"
                disabled={controlsDisabled || supplementalFull}
                onClick={() => {
                  setSupplementalFeedback(null)
                  setCurrentSession(undoSupplementalProductImageRemoval(sessionRef.current))
                }}
              >
                撤销
              </Button>
            </Space>
          ) : null}
        </section>

        <BusinessModal
          open={Boolean(preview)}
          title={preview?.fileName || '产品图片预览'}
          footer={supplementalPreviewIndex >= 0 && supplementalImages.length > 1 ? (
            <Space>
              <Button size="small" disabled={Boolean(previewingSlotKey) || supplementalPreviewIndex === 0} onClick={() => previewSupplemental(supplementalImages[supplementalPreviewIndex - 1])}>上一张</Button>
              <Typography.Text type="secondary">{supplementalPreviewIndex + 1} / {supplementalImages.length}</Typography.Text>
              <Button size="small" disabled={Boolean(previewingSlotKey) || supplementalPreviewIndex === supplementalImages.length - 1} onClick={() => previewSupplemental(supplementalImages[supplementalPreviewIndex + 1])}>下一张</Button>
            </Space>
          ) : null}
          size="columnOrder"
          destroyOnHidden
          onCancel={closePreview}
        >
          <div className="product-image-slots__modal-preview">
            <BusinessImage src={preview?.url} alt={preview?.fileName || '产品图片预览'} />
          </div>
        </BusinessModal>
      </section>
    )
  }
)

ProductImageSlots.displayName = 'ProductImageSlots'

export default ProductImageSlots
