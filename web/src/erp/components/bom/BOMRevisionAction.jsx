import React, { useEffect, useRef, useState } from 'react'
import { EditOutlined } from '@ant-design/icons'
import { Alert, Button, Radio, Space } from 'antd'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { copyBOMVersion, getBOMVersion, listAllBOMVersions } from '../../api/bomApi.mjs'
import { suggestNextBOMVersion } from '../../utils/bomVersionSuggestion.mjs'
import { canEditBOM } from './bomLifecycle.mjs'

function productDrafts(records, productID) {
  return records.filter((item) =>
    Number(item.product_id) === Number(productID) && canEditBOM(item)
  )
}

// Existing drafts belong to the product; no copy-origin relationship is inferred.
export default function BOMRevisionAction({ record, canCreate, disabled, onEdit }) {
  const [catalog, setCatalog] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [selectedID, setSelectedID] = useState()
  const [error, setError] = useState('')
  const operationRef = useRef(false)
  const attemptedVersion = useRef('')
  const key = `${record?.id}:${record?.product_id}:${record?.status}`
  const currentKey = useRef(key)
  currentKey.current = key
  const productID = record?.product_id
  const sourceID = record?.id
  const active = record?.status === 'ACTIVE'
  const current = catalog?.key === key ? catalog : null
  const drafts = productDrafts(current?.records || [], productID)
  const actionLabel = !current || current.failed
    ? '查看草稿'
    : drafts.length ? `查看草稿（${drafts.length}）` : '创建修订草稿'

  useEffect(() => {
    const controller = new AbortController()
    currentKey.current = key
    setOpen(false)
    setBusy(false)
    setError('')
    attemptedVersion.current = ''
    if (active && productID) {
      listAllBOMVersions({ product_id: productID, lifecycle_scope: 'all' }, { signal: controller.signal })
        .then((data) => {
          if (controller.signal.aborted) return
          setCatalog({ key, records: data.bom_versions })
        })
        .catch((err) => {
          if (controller.signal.aborted || isRpcAbortError(err)) return
          setCatalog({ key, records: [], failed: true })
        })
    }
    return () => {
      controller.abort()
      currentKey.current = null
    }
  }, [active, key, productID])

  const readVersions = async () => {
    const data = await listAllBOMVersions({ product_id: productID, lifecycle_scope: 'all' })
    if (currentKey.current !== key) return null
    setCatalog({ key, records: data.bom_versions })
    return data.bom_versions
  }

  const showDialog = async () => {
    if (operationRef.current || disabled) return
    operationRef.current = true
    setBusy(true)
    setError('')
    setOpen(true)
    try {
      const records = await readVersions()
      if (!records) return
      const available = productDrafts(records, productID)
      setSelectedID(available.length === 1 ? available[0].id : undefined)
    } catch (err) {
      if (currentKey.current === key) {
        setCatalog({ key, records: [], failed: true })
        setError(getActionErrorMessage(err, '读取已有 BOM 草稿'))
      }
    } finally {
      operationRef.current = false
      if (currentKey.current === key) setBusy(false)
    }
  }

  const startEditing = async () => {
    if (operationRef.current || !current || current.failed) return
    operationRef.current = true
    setBusy(true)
    setError('')
    try {
      // Recheck before creating, including drafts created in another window.
      const records = await readVersions()
      if (!records) return
      const available = productDrafts(records, productID)
      let detail
      if (available.length) {
        if (!available.some((item) => item.id === selectedID)) {
          setSelectedID(available.length === 1 ? available[0].id : undefined)
          return
        }
        detail = await getBOMVersion({ id: selectedID })
      } else {
        if (!canCreate) {
          setError('当前账号没有新建 BOM 版本的权限，请联系有权限的同事。')
          return
        }
        if (drafts.length) {
          setSelectedID(undefined)
          setError('原草稿状态已变化，请重新核对后开始修改。')
          return
        }
        const source = await getBOMVersion({ id: sourceID })
        if (currentKey.current !== key) return
        if (source?.status !== 'ACTIVE') {
          setError('当前版本已不再启用，请返回列表刷新后选择正在使用的版本。')
          return
        }
        // Retain the proposed number after an uncertain response; never create
        // another version merely because the first response was lost.
        attemptedVersion.current ||= suggestNextBOMVersion(records, productID)
        detail = await copyBOMVersion({
          source_id: sourceID,
          product_id: productID,
          version: attemptedVersion.current,
        })
      }
      if (currentKey.current !== key) return
      if (!detail?.id || !canEditBOM(detail) || Number(detail.product_id) !== Number(productID) || !Array.isArray(detail.items)) {
        setError('草稿状态已变化，请重新读取后选择可编辑的版本。')
        return
      }
      await onEdit(detail)
      if (currentKey.current === key) setOpen(false)
    } catch (err) {
      if (currentKey.current === key) {
        setError(`${getActionErrorMessage(err, '准备 BOM 修改草稿')}。请重新读取草稿，确认是否已经创建。`)
      }
    } finally {
      operationRef.current = false
      if (currentKey.current === key) setBusy(false)
    }
  }

  if (!active) return null
  return (
    <>
      <Button
        size="small"
        type="primary"
        icon={<EditOutlined aria-hidden="true" />}
        data-business-action-key="revise-bom"
        aria-label={actionLabel}
        aria-busy={busy || !current}
        disabled={disabled}
        loading={busy || !current}
        onClick={showDialog}
      >
        {actionLabel}
      </Button>
      <BusinessModal
        title={drafts.length ? '选择要编辑的 BOM 草稿' : '创建 BOM 修订草稿'}
        open={open}
        destroyOnHidden
        closable={!busy}
        maskClosable={!busy}
        keyboard={!busy}
        onCancel={() => { if (!busy) setOpen(false) }}
        footer={
          <Space wrap>
            <Button disabled={busy} onClick={() => setOpen(false)}>取消</Button>
            {error ? <Button disabled={busy} onClick={showDialog}>重新读取草稿</Button> : null}
            <Button
              type="primary"
              aria-label={drafts.length ? '编辑所选草稿' : '创建并编辑草稿'}
              aria-busy={busy}
              loading={busy}
              disabled={!current || current.failed || (drafts.length ? !selectedID : !canCreate)}
              onClick={startEditing}
            >
              {drafts.length ? '编辑所选草稿' : '创建并编辑草稿'}
            </Button>
          </Space>
        }
      >
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <p>当前查看：<strong>{record.version}</strong> · 已启用（只读）</p>
        {drafts.length ? (
          <>
            <p>以下为同产品的草稿，请核对版本号后选择。当前启用版本保持不变。</p>
            <Radio.Group aria-label="选择 BOM 草稿" value={selectedID} disabled={busy} onChange={(event) => setSelectedID(event.target.value)}>
              <Space direction="vertical">
                {drafts.map((draft) => <Radio key={draft.id} value={draft.id}>{draft.version} · 草稿{draft.source_order_no ? ` · ${draft.source_order_no}` : ''}</Radio>)}
              </Space>
            </Radio.Group>
          </>
        ) : (
          <p>基于当前版本复制一份修订草稿，自动填写版本号。原版本保持不变，草稿保存后需另行启用。</p>
        )}
        {!drafts.length && !canCreate ? <p>当前账号没有新建 BOM 版本的权限，请联系有权限的同事。</p> : null}
      </BusinessModal>
    </>
  )
}

BOMRevisionAction.selectionActionPriority = 100
