import { useState } from 'react'
import { PaperClipOutlined } from '@ant-design/icons'
import { Button, Modal, Tooltip } from 'antd'

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
  canDelete = true,
  disabled = false,
  disabledReason = '请先选择一条记录',
  buttonProps = {},
}) {
  const [open, setOpen] = useState(false)
  const normalizedOwnerId = Number(ownerId || 0)
  const missingOwner = !ownerType || normalizedOwnerId <= 0
  const actionDisabled = disabled || missingOwner

  const triggerButton = (
    <Button
      size="small"
      icon={<PaperClipOutlined />}
      {...buttonProps}
      disabled={actionDisabled}
      onClick={(event) => {
        buttonProps.onClick?.(event)
        if (!event.defaultPrevented) {
          setOpen(true)
        }
      }}
    >
      {buttonText}
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
        onCancel={() => setOpen(false)}
      >
        <BusinessAttachmentPanel
          ownerType={ownerType}
          ownerId={normalizedOwnerId}
          ownerVersion={ownerVersion}
          title={panelTitle}
          description={description}
          canUpload={canUpload}
          canDelete={canDelete}
          allowPendingAttachmentsWithoutOwner={false}
          missingOwnerDescription={disabledReason}
          missingOwnerEmptyText={disabledReason}
          variant="inline"
        />
      </Modal>
    </>
  )
}
