import { useCallback, useEffect, useRef, useState } from 'react'
import { PaperClipOutlined } from '@ant-design/icons'
import { Button, Modal, Tooltip } from 'antd'

import { listBusinessAttachments } from '../../api/attachmentApi.mjs'
import { resolveBusinessAttachmentActionLabel } from '../../utils/businessAttachmentPanelState.mjs'
import BusinessAttachmentPanel from './BusinessAttachmentPanel.jsx'

export default function BusinessAttachmentModalButton({
  ownerType,
  ownerId,
  ownerVersion,
  buttonText = '附件',
  modalTitle = '业务附件',
  panelTitle = '附件',
  description,
  canUpload = true,
  canWithdraw = false,
  disabled = false,
  disabledReason = '请先选择一条记录',
  buttonProps = {},
  showAttachmentCount = false,
  countLabel = '附件',
  emptyUploadLabel = '添加附件',
  emptyReadLabel = '查看附件',
}) {
  const [open, setOpen] = useState(false)
  const [attachmentCount, setAttachmentCount] = useState(null)
  const countRequestSeqRef = useRef(0)
  const normalizedOwnerId = Number(ownerId || 0)
  const missingOwner = !ownerType || normalizedOwnerId <= 0
  const actionDisabled = disabled || missingOwner
  const loadAttachmentCount = useCallback(async () => {
    const requestID = countRequestSeqRef.current + 1
    countRequestSeqRef.current = requestID
    setAttachmentCount(null)
    if (!showAttachmentCount || missingOwner) return

    try {
      const items = await listBusinessAttachments({
        owner_type: ownerType,
        owner_id: normalizedOwnerId,
      })
      if (countRequestSeqRef.current === requestID) {
        setAttachmentCount(Array.isArray(items) ? items.length : 0)
      }
    } catch {
      if (countRequestSeqRef.current === requestID) {
        setAttachmentCount(null)
      }
    }
  }, [missingOwner, normalizedOwnerId, ownerType, showAttachmentCount])

  useEffect(() => {
    loadAttachmentCount()
    return () => {
      countRequestSeqRef.current += 1
    }
  }, [loadAttachmentCount])

  const resolvedButtonText = showAttachmentCount
    ? resolveBusinessAttachmentActionLabel({
        attachmentCount,
        canUpload,
        fallbackLabel: buttonText,
        countLabel,
        emptyUploadLabel,
        emptyReadLabel,
      })
    : buttonText

  const triggerButton = (
    <Button
      size="small"
      icon={<PaperClipOutlined aria-hidden="true" />}
      {...buttonProps}
      disabled={actionDisabled}
      onClick={(event) => {
        buttonProps.onClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(true)
        }
      }}
    >
      {resolvedButtonText}
    </Button>
  )

  return (
    <>
      {actionDisabled ? (
        <Tooltip title={disabledReason}>
          <span>{triggerButton}</span>
        </Tooltip>
      ) : (
        triggerButton
      )}
      <Modal
        centered
        destroyOnHidden
        footer={null}
        open={open}
        title={modalTitle}
        width="min(880px, calc(100vw - 48px))"
        onCancel={() => {
          setOpen(false)
          loadAttachmentCount()
        }}
      >
        <BusinessAttachmentPanel
          ownerType={ownerType}
          ownerId={normalizedOwnerId}
          ownerVersion={ownerVersion}
          title={panelTitle}
          description={description}
          canUpload={canUpload}
          canWithdraw={canWithdraw}
          allowPendingAttachmentsWithoutOwner={false}
          missingOwnerDescription={disabledReason}
          missingOwnerEmptyText={disabledReason}
          variant="inline"
        />
      </Modal>
    </>
  )
}
