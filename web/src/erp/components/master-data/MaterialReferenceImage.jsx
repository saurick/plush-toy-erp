import { useCallback, useEffect, useRef, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { RpcErrorCode } from '@/common/consts/errorCodes'
import { downloadBusinessAttachment, listMaterialImageReferences } from '../../api/attachmentApi.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { createReferenceImageIDLoader } from '../../utils/productImageReferences.mjs'
import { createOwnedReferenceImageLoader } from '../../utils/taskProductImage.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import BusinessImage from '../business-list/BusinessImage.jsx'
import WorkflowTaskImagePreview from '../workflow/WorkflowTaskImagePreview.jsx'
import '../workflow/workflowTaskIdentity.css'
import './productIdentity.css'

const changedEvent = 'erp-material-reference-image-changed'
const loaders = new WeakMap()

function imageAccess(profile) {
  const key = workflowTaskAdminAccessRequestIdentity(profile)
  const cached = loaders.get(profile)
  if (cached?.key === key) return cached
  const access = {
    key,
    read: createReferenceImageIDLoader(listMaterialImageReferences, {
      requestField: 'material_ids',
      identityField: 'material_id',
      invalidResponse: '材料参考图引用不完整',
    }),
    load: createOwnedReferenceImageLoader(downloadBusinessAttachment, {
      ownerType: 'material',
      ownerKey: 'materialID',
      invalidResponse: '材料参考图不可用',
    }),
  }
  loaders.set(profile, access)
  return access
}

export function notifyMaterialReferenceImageChanged(materialID) {
  window.dispatchEvent(new CustomEvent(changedEvent, { detail: materialID }))
}

export function useMaterialReferenceImage(materialID, { enabled = true, lazy = false } = {}) {
  const { adminProfile } = useBusinessPageContext() || {}
  const allowed = enabled && hasActionPermission(adminProfile, PermissionCode.MATERIAL_READ)
  const access = allowed ? imageAccess(adminProfile) : null
  const target = useRef(null)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const scope = access && materialID > 0 ? [access.key, materialID, revision].join(':') : ''
  const current = scope && result?.scope === scope ? result : null
  const retry = useCallback(() => {
    if (!access || !materialID) return
    access.read.invalidate(materialID)
    if (current?.id) access.load.invalidate({ materialID, attachmentID: current.id })
    setRevision((value) => value + 1)
  }, [access, current?.id, materialID])

  useEffect(() => {
    if (!scope || !access) return undefined
    let active = true
    let observer
    const read = async () => {
      let id
      try {
        id = await access.read(materialID)
        if (!active) return
        if (!id) {
          setResult({ scope, id: 0, state: 'empty' })
          return
        }
        const source = await access.load({ materialID, attachmentID: id })
        if (active) setResult({ scope, id, source, state: 'ready' })
      } catch (error) {
        if (active) {
          const denied = Number(error?.code) === RpcErrorCode.PERMISSION_DENIED
          setResult({ scope, id: denied ? undefined : id, state: denied ? 'denied' : 'failed' })
        }
      }
    }
    if (lazy && target.current) {
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        read()
      }, { rootMargin: '120px' })
      observer.observe(target.current)
    } else {
      read()
    }
    return () => {
      active = false
      observer?.disconnect()
    }
  }, [access, lazy, materialID, scope])

  useEffect(() => {
    if (!scope) return undefined
    const changed = (event) => {
      if (event.detail === materialID) retry()
    }
    window.addEventListener(changedEvent, changed)
    return () => window.removeEventListener(changedEvent, changed)
  }, [materialID, retry, scope])

  return {
    target,
    retry,
    access,
    state: current?.state || (scope ? 'loading' : 'empty'),
    id: current?.id ?? (scope ? undefined : 0),
    source: current?.source,
  }
}

export function MaterialReferenceImageButton({ materialID, attachmentID, name, thumbnail, pendingSource, loadFailed, access }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const load = useCallback(({ variant }) => access.load({ materialID, attachmentID, variant }), [access, attachmentID, materialID])
  useEffect(() => setOpen(false), [attachmentID, materialID, pendingSource])
  const label = `${name || '材料'}参考图`
  return (
    <>
      <span className="erp-task-product-image">
        <button
          ref={trigger}
          type="button"
          aria-label={`查看${label}大图`}
          aria-haspopup="dialog"
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation() }}
          onClick={(event) => {
            event.stopPropagation()
            setOpen(true)
          }}
        >
          <BusinessImage src={pendingSource || thumbnail} alt={label} loadFailed={!pendingSource && loadFailed} compact />
        </button>
      </span>
      {open ? (
        <WorkflowTaskImagePreview
          item={{ name: label, imageAttachmentID: attachmentID }}
          thumbnail={thumbnail}
          source={pendingSource}
          load={load}
          onClose={({ restoreFocus = true } = {}) => {
            setOpen(false)
            if (restoreFocus) trigger.current?.focus({ preventScroll: true })
          }}
        />
      ) : null}
    </>
  )
}

export function MaterialReferenceImageRetry({ name, onRetry }) {
  return (
    <span className="erp-task-product-image erp-product-identity__picture">
      <button
        type="button"
        className="erp-product-identity__retry"
        aria-label={`重试读取${name || '材料'}参考图`}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key !== 'Escape') event.stopPropagation() }}
        onClick={(event) => {
          event.stopPropagation()
          onRetry()
        }}
      >
        <ReloadOutlined aria-hidden="true" />
      </button>
    </span>
  )
}
