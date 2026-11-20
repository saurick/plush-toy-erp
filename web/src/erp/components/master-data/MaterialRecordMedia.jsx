import { forwardRef, useContext, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { Alert, Button, Space, Typography } from 'antd'
import { DeleteOutlined, ReloadOutlined, UploadOutlined } from '@ant-design/icons'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { clearMaterialReferenceImage, uploadMaterialReferenceImage } from '../../api/attachmentApi.mjs'
import { prepareBusinessReferenceImage } from '../../utils/prepareBusinessReferenceImage.mjs'
import { PRODUCT_IMAGE_ACCEPT, validateProductImageFile } from '../../utils/productImageSlots.mjs'
import BusinessAttachmentPanel from '../business-list/BusinessAttachmentPanel.jsx'
import BusinessFormSection from '../business-list/BusinessFormSection.jsx'
import { BusinessFormPendingAttachmentsContext } from '../business-list/BusinessFormPageContext.js'
import {
  MaterialReferenceImageButton,
  notifyMaterialReferenceImageChanged,
  useMaterialReferenceImage,
} from './MaterialReferenceImage.jsx'
import './materialRecordMedia.css'

const MaterialRecordMedia = forwardRef(({
  materialID,
  materialName,
  open,
  canEdit,
  saving,
}, ref) => {
  const referenceHeading = useId()
  const media = useMaterialReferenceImage(materialID, { enabled: open })
  const [draft, setDraft] = useState(null)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [filesState, setFilesState] = useState({ pendingCount: 0, busy: false })
  const input = useRef(null)
  const files = useRef(null)
  const preparation = useRef(null)
  const appliedImage = useRef(null)
  const reportPending = useContext(BusinessFormPendingAttachmentsContext)
  useEffect(() => () => preparation.current?.abort(), [])
  useEffect(() => {
    reportPending?.(open ? Number(Boolean(draft)) + filesState.pendingCount : 0, open && (preparing || filesState.busy))
    return () => reportPending?.(0, false)
  }, [draft, filesState, open, preparing, reportPending])

  useImperativeHandle(ref, () => ({
    async flushChanges(id) {
      if (!canEdit) return !draft && filesState.pendingCount === 0
      if (preparing || !files.current) return false
      setError('')
      if (draft) {
        try {
          if (appliedImage.current === null) {
            if (draft.file) {
              const uploaded = await uploadMaterialReferenceImage(id, draft.file)
              appliedImage.current = uploaded.id
            } else {
              await clearMaterialReferenceImage(id, draft.removeID)
              appliedImage.current = 0
            }
          }
          media.access.read.invalidate(id)
          const confirmed = await media.access.read(id)
          const expected = appliedImage.current
          appliedImage.current = null
          notifyMaterialReferenceImageChanged(id)
          if (confirmed !== expected) {
            if (!draft.file) setDraft(null)
            setError('参考图已变化，请重新核对后保存。')
            return false
          }
          setDraft(null)
        } catch (failure) {
          setError(getActionErrorMessage(failure, '保存材料参考图'))
          return false
        }
      }
      return files.current.flushPendingAttachments(id)
    },
  }), [canEdit, draft, filesState.pendingCount, media.access, preparing])

  const choose = async (event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file || saving || preparing || !canEdit) return
    const invalid = validateProductImageFile(file)
    if (invalid) {
      setError(invalid)
      return
    }
    const controller = new AbortController()
    preparation.current = controller
    setError('')
    setPreparing(true)
    try {
      const prepared = await prepareBusinessReferenceImage(file, controller.signal)
      if (controller.signal.aborted) return
      appliedImage.current = null
      setDraft({ file: prepared })
    } catch (failure) {
      if (!controller.signal.aborted) setError(getActionErrorMessage(failure, '读取材料参考图'))
    } finally {
      if (!controller.signal.aborted) setPreparing(false)
    }
  }
  const remove = () => {
    appliedImage.current = null
    setError('')
    setDraft(media.id ? { removeID: media.id } : null)
  }
  const restore = () => {
    appliedImage.current = null
    setDraft(null)
    setError('')
  }
  const showPhoto = Boolean(draft?.file || (media.id && !draft))
  const controlsDisabled = saving || preparing || media.id === undefined || !media.access
  const photoStatus = draft?.removeID ? '保存后移除'
    : media.state === 'loading' ? '正在读取参考图'
      : !canEdit && media.state === 'empty' ? '尚未设置库存参考图' : ''
  return (
    <BusinessFormSection title="图片与附件" layout="content">
      <div className="erp-material-record-media">
        <div className="erp-material-record-media__layout">
          <section className="erp-material-record-media__reference" aria-labelledby={referenceHeading}>
            <div className="erp-material-record-media__reference-heading">
              <Typography.Text strong id={referenceHeading}>库存参考图</Typography.Text>
              <Typography.Text type="secondary">选一张材料实物照，保存后显示在库存列表，供仓库认料。</Typography.Text>
            </div>
            <Space wrap>
              {showPhoto ? (
                <MaterialReferenceImageButton
                  materialID={materialID}
                  attachmentID={media.id}
                  name={materialName}
                  thumbnail={media.source}
                  pendingSource={draft?.file?.preview_url}
                  loadFailed={media.state === 'failed'}
                  access={media.access}
                />
              ) : photoStatus ? <Typography.Text type="secondary">{photoStatus}</Typography.Text> : null}
              {canEdit ? (
                <>
                  <Button icon={<UploadOutlined aria-hidden="true" />} disabled={controlsDisabled} loading={preparing} onClick={() => input.current?.click()}>
                    {showPhoto ? '更换库存参考图' : '设置库存参考图'}
                  </Button>
                  {showPhoto ? (
                    <Button size="small" type="text" icon={<DeleteOutlined aria-hidden="true" />} disabled={controlsDisabled} onClick={remove}>移除图片</Button>
                  ) : null}
                  {draft ? <Button size="small" type="link" disabled={saving || preparing} onClick={restore}>撤销修改</Button> : null}
                </>
              ) : null}
              {media.state === 'failed' ? <Button size="small" icon={<ReloadOutlined aria-hidden="true" />} disabled={saving} onClick={media.retry}>重新读取参考图</Button> : null}
            </Space>
            {error ? <Alert type="warning" showIcon message={error} /> : null}
            <input ref={input} type="file" accept={PRODUCT_IMAGE_ACCEPT} aria-label="选择库存参考图" hidden onChange={choose} />
          </section>
          <div className="erp-material-record-media__attachments" inert={saving ? '' : undefined}>
            <Typography.Text type="secondary">放规格书、色卡、包装图样等资料；在库存点材料名查看。</Typography.Text>
            <BusinessFormPendingAttachmentsContext.Provider value={null}>
              <BusinessAttachmentPanel
                ref={files}
                ownerType="material"
                ownerId={materialID}
                title="材料附件"
                description="材料附件随档案保存；库存只读查看已保存的资料。"
                canUpload={canEdit}
                canWithdraw={canEdit && Boolean(materialID)}
                uploadWithForm
                compact
                onStateChange={setFilesState}
              />
            </BusinessFormPendingAttachmentsContext.Provider>
          </div>
        </div>
      </div>
    </BusinessFormSection>
  )
})

export default MaterialRecordMedia
