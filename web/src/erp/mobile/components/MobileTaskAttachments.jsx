import BusinessAttachmentModalButton from '../../components/business-list/BusinessAttachmentModalButton.jsx'

export default function MobileTaskAttachments({ task, canManage = false, busy = false }) {
  if (!task?.id) return null
  return (
    <BusinessAttachmentModalButton
      ownerType="workflow_task"
      ownerId={task.id}
      ownerVersion={task.version}
      buttonText="查看附件"
      modalTitle="任务附件"
      panelTitle="附件内容"
      description={canManage ? '上传照片、异常截图或处理凭证。' : '查看照片、异常截图或处理凭证。'}
      canUpload={canManage}
      canWithdraw={canManage}
      disabled={busy}
      disabledReason="办理完成后可查看附件"
      showAttachmentCount
      buttonProps={{ className: 'mobile-detail-attachment-button', 'data-testid': 'mobile-task-attachment-action', size: 'middle' }}
    />
  )
}
